import { spawn, ChildProcessByStdio } from 'child_process';
import type { Readable, Writable } from 'stream';
import * as net from 'net';

export interface MCPTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(method: string, params: any): Promise<any>;
}

export class StdioTransport implements MCPTransport {
  private process: ChildProcessByStdio<Writable, Readable, null> | null = null;
  private readonly command: string;
  private readonly args: string[];
  private readonly env: NodeJS.ProcessEnv;

  constructor(command: string, args: string[] = [], env: Record<string, string> = {}) {
    this.command = command;
    this.args = args;
    this.env = {
      ...process.env,
      ...env
    };
  }

  async connect(): Promise<void> {
    if (this.process) {
      return;
    }

    this.process = spawn(this.command, this.args, {
      stdio: ['pipe', 'pipe', 'inherit'],
      env: this.env
    });

    this.process.on('error', (err) => {
      // Surface unexpected process errors to stderr; individual calls handle their own failures.
      // eslint-disable-next-line no-console
      console.error(`GitHub MCP stdio process error: ${err.message}`);
    });
  }

  async disconnect(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  async send(method: string, params: any): Promise<any> {
    if (!this.process) {
      await this.connect();
    }

    if (!this.process) {
      throw new Error('GitHub MCP stdio process not available');
    }

    const { stdin, stdout } = this.process;
    if (!stdin || !stdout) {
      throw new Error('GitHub MCP stdio streams not available');
    }

    const id = Date.now();
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      let buffer = '';

      const onData = (chunk: Buffer) => {
        buffer += chunk.toString();

        try {
          const response = JSON.parse(buffer);
          if (response.id !== id) {
            return;
          }

          stdout.removeListener('data', onData);
          this.process?.removeListener('error', onError);

          if (response.error) {
            reject(new Error(response.error.message || 'MCP error'));
          } else {
            resolve(response.result);
          }
        } catch {
          // Wait for more data (partial JSON)
        }
      };

      const onError = (err: Error) => {
        stdout.removeListener('data', onData);
        reject(err);
      };

      stdout.on('data', onData);
      this.process!.once('error', onError);

      stdin.write(JSON.stringify(request) + '\n', (err) => {
        if (err) {
          stdout.removeListener('data', onData);
          this.process?.removeListener('error', onError);
          reject(err);
        }
      });
    });
  }
}

export class TCPTransport implements MCPTransport {
  constructor(
    private readonly host: string,
    private readonly port: number
  ) {}

  // For now, we keep the TCP transport minimal and compatible with JiraMCPClient.
  async connect(): Promise<void> {
    // No persistent connection needed; each send() opens its own socket.
  }

  async disconnect(): Promise<void> {
    // No-op
  }

  async send(method: string, params: any): Promise<any> {
    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    };

    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let responseData = '';

      socket.connect(this.port, this.host, () => {
        socket.write(JSON.stringify(request) + '\n');
      });

      socket.on('data', (data) => {
        responseData += data.toString();
        try {
          const response = JSON.parse(responseData);
          socket.destroy();

          if (response.error) {
            reject(new Error(response.error.message || 'MCP error'));
          } else {
            resolve(response.result);
          }
        } catch {
          // Wait for more data
        }
      });

      socket.on('error', (err) => {
        socket.destroy();
        reject(err);
      });

      socket.on('close', () => {
        if (!responseData) {
          reject(new Error('Connection closed without response'));
        }
      });
    });
  }
}

