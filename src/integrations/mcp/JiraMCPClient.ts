import * as http from 'node:http';
import * as net from 'net';

/**
 * Jira issue data structure from MCP server
 */
export interface JiraIssue {
  key: string;
  summary: string;
  description: string;
  issueType: string;
  status: string;
  priority: string;
  assignee?: string;
  labels: string[];
  projectKey: string;
}

/**
 * MCP configuration for Jira
 */
export interface JiraMCPConfig {
  enabled: boolean;
  host: string;              // MCP server host (e.g., "localhost" or "jira.company.com")
  port?: number;             // MCP server port (default: 3000)
  access_token: string;      // Jira API access token
  project_key?: string;      // Default project key
  issue_type?: string;       // Default issue type filter
  auto_sync?: boolean;       // Auto-sync tickets to specs
  sync_labels?: string[];    // Label filter for sync
}

/**
 * Client for Jira MCP (Model Context Protocol) server
 * Communicates with a Jira MCP server to fetch issue details
 */
export class JiraMCPClient {
  private config: JiraMCPConfig;
  private connectionTimeout = 5000; // 5 second timeout

  constructor(config: JiraMCPConfig) {
    this.config = config;
  }

  /**
   * Test connection to MCP server with timeout
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const port = this.config.port || 3000;
      const socket = new net.Socket();

      const timeout = setTimeout(() => {
        socket.destroy();
        resolve({
          success: false,
          error: `Connection timeout after ${this.connectionTimeout}ms`
        });
      }, this.connectionTimeout);

      socket.connect(port, this.config.host, () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve({ success: true });
      });

      socket.on('error', (err) => {
        clearTimeout(timeout);
        socket.destroy();
        resolve({
          success: false,
          error: `Connection failed: ${err.message}`
        });
      });
    });
  }

  /**
   * Fetch Jira issue by ticket key (e.g., "PROJ-123")
   */
  async fetchIssue(ticketKey: string): Promise<JiraIssue> {
    // Test connection first
    const connectionTest = await this.testConnection();
    if (!connectionTest.success) {
      throw new Error(`Cannot connect to Jira MCP server: ${connectionTest.error}`);
    }

    // Send MCP request to fetch issue
    const response = await this.sendMCPRequest('jira.getIssue', {
      issueKey: ticketKey,
      accessToken: this.config.access_token
    });

    if (!response.success) {
      throw new Error(`Failed to fetch Jira issue ${ticketKey}: ${response.error}`);
    }

    return response.data as JiraIssue;
  }

  /**
   * Fetch multiple issues by JQL query
   */
  async fetchIssuesByJQL(jql: string, maxResults: number = 50): Promise<JiraIssue[]> {
    const connectionTest = await this.testConnection();
    if (!connectionTest.success) {
      throw new Error(`Cannot connect to Jira MCP server: ${connectionTest.error}`);
    }

    const response = await this.sendMCPRequest('jira.searchIssues', {
      jql,
      maxResults,
      accessToken: this.config.access_token
    });

    if (!response.success) {
      throw new Error(`Failed to search Jira issues: ${response.error}`);
    }

    return response.data as JiraIssue[];
  }

  /**
   * Send JSON-RPC 2.0 request to MCP server
   * Tries HTTP POST first (most common), falls back to raw TCP
   */
  private async sendMCPRequest(
    method: string,
    params: any
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    };

    // Try HTTP first (most MCP servers are HTTP-based)
    const httpResult = await this.sendHTTPRequest(request);
    if (httpResult !== null) {
      return httpResult;
    }

    // Fall back to raw TCP
    console.log(`[MCP] HTTP request to ${this.config.host}:${this.config.port || 3000} failed, falling back to TCP`);
    return this.sendTCPRequest(request);
  }

  /**
   * Send JSON-RPC request via HTTP POST
   */
  private sendHTTPRequest(
    request: any
  ): Promise<{ success: boolean; data?: any; error?: string } | null> {
    return new Promise((resolve) => {
      const port = this.config.port || 3000;
      const body = JSON.stringify(request);

      const options: http.RequestOptions = {
        hostname: this.config.host,
        port,
        path: '/',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: this.connectionTimeout
      };

      const req = http.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk: Buffer) => { responseData += chunk.toString(); });
        res.on('end', () => {
          try {
            const response = JSON.parse(responseData);
            if (response.error) {
              resolve({
                success: false,
                error: response.error.message || 'Unknown error'
              });
            } else {
              resolve({
                success: true,
                data: response.result
              });
            }
          } catch {
            // Not valid JSON — HTTP server but wrong protocol
            resolve(null);
          }
        });
      });

      req.on('error', () => {
        // HTTP failed — try TCP fallback
        resolve(null);
      });

      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });

      req.write(body);
      req.end();
    });
  }

  /**
   * Send JSON-RPC request via raw TCP socket
   */
  private sendTCPRequest(
    request: any
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    return new Promise((resolve) => {
      const port = this.config.port || 3000;
      const socket = new net.Socket();

      let responseData = '';

      const timeout = setTimeout(() => {
        socket.destroy();
        resolve({
          success: false,
          error: 'Request timeout'
        });
      }, this.connectionTimeout);

      socket.connect(port, this.config.host, () => {
        socket.write(JSON.stringify(request) + '\n');
      });

      socket.on('data', (data) => {
        responseData += data.toString();

        // Check if we have a complete JSON response
        try {
          const response = JSON.parse(responseData);
          clearTimeout(timeout);
          socket.destroy();

          if (response.error) {
            resolve({
              success: false,
              error: response.error.message || 'Unknown error'
            });
          } else {
            resolve({
              success: true,
              data: response.result
            });
          }
        } catch {
          // Not a complete JSON yet, wait for more data
        }
      });

      socket.on('error', (err) => {
        clearTimeout(timeout);
        socket.destroy();
        resolve({
          success: false,
          error: err.message
        });
      });

      socket.on('close', () => {
        clearTimeout(timeout);
        if (responseData === '') {
          resolve({
            success: false,
            error: 'Connection closed without response'
          });
        }
      });
    });
  }

  /**
   * Get configuration
   */
  getConfig(): JiraMCPConfig {
    return { ...this.config };
  }
}
