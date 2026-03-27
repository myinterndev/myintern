import { MCPTransport, StdioTransport, TCPTransport } from './MCPTransport';
import { RateLimitBudget } from './RateLimitBudget';

export type GitHubTransportType = 'stdio' | 'tcp' | 'sse';

export interface GitHubMCPConfig {
  enabled: boolean;
  transport: GitHubTransportType;

  // stdio transport
  command?: string;
  args?: string[];
  env?: Record<string, string>;

  // tcp / sse transport
  host?: string;
  port?: number;
  access_token?: string;

  pr?: {
    base_branch?: string;
    auto_create?: boolean;
    auto_merge?: boolean;
    draft?: boolean;
    reviewers?: string[];
    labels?: string[];
    template?: string;
  };

  actions?: {
    trigger_on_pr?: boolean;
    wait_for_checks?: boolean;
    check_timeout_ms?: number;
    auto_fix_on_failure?: boolean;
  };

  reviews?: {
    respond_to_comments?: boolean;
    auto_resolve?: boolean;
    max_review_rounds?: number;
    on_max_rounds_exceeded?: 'fail_pr' | 'leave_open' | 'notify';
  };

  rate_limit?: {
    max_requests_per_minute?: number;
    retry_after_ms?: number;
    shared_budget?: boolean;
  };
}

export interface GitHubPullRequest {
  url: string;
  number: number;
}

export class GitHubMCPClient {
  private readonly transport: MCPTransport;
  private readonly rateLimit: RateLimitBudget;

  constructor(private readonly config: GitHubMCPConfig) {
    if (config.transport === 'stdio') {
      const command = config.command || 'npx';
      const args = config.args || ['-y', '@modelcontextprotocol/server-github'];
      this.transport = new StdioTransport(command, args, config.env || {});
    } else if (config.transport === 'tcp') {
      const host = config.host || 'localhost';
      const port = config.port || 3001;
      this.transport = new TCPTransport(host, port);
    } else {
      throw new Error(`Unsupported GitHub MCP transport: ${config.transport}`);
    }

    const rl = config.rate_limit;
    this.rateLimit = new RateLimitBudget(
      rl?.max_requests_per_minute ?? 30,
      rl?.retry_after_ms ?? 60000
    );
  }

  async connect(): Promise<void> {
    await this.transport.connect();
  }

  async disconnect(): Promise<void> {
    await this.transport.disconnect();
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.connect();
      // Simple call to verify server is responding; method name depends on server implementation.
      await this.safeSend('github.ping', {});
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || String(error) };
    }
  }

  async createPullRequest(options: {
    title: string;
    body: string;
    head: string;
    base: string;
    draft?: boolean;
    reviewers?: string[];
    labels?: string[];
  }): Promise<GitHubPullRequest> {
    const result = await this.safeSend('github.createPullRequest', options);
    return {
      url: result.url as string,
      number: result.number as number
    };
  }

  async waitForChecks(prNumber: number, timeoutMs?: number): Promise<{
    passed: boolean;
    checks: Array<{ name: string; status: string; conclusion: string }>;
  }> {
    const result = await this.safeSend('github.waitForChecks', {
      prNumber,
      timeoutMs
    });

    return {
      passed: Boolean(result.passed),
      checks: (result.checks || []) as Array<{ name: string; status: string; conclusion: string }>
    };
  }

  async mergePullRequest(prNumber: number, options?: {
    merge_method?: 'merge' | 'squash' | 'rebase';
    commit_title?: string;
  }): Promise<void> {
    await this.safeSend('github.mergePullRequest', {
      prNumber,
      ...options
    });
  }

  private async safeSend(method: string, params: any): Promise<any> {
    await this.rateLimit.acquire();
    try {
      return await this.transport.send(method, params);
    } catch (error: any) {
      // If the server returns an explicit rate-limit signal, attempt backoff.
      if (error && typeof error.message === 'string' && error.message.includes('rate limit')) {
        await this.rateLimit.handleRateLimit();
      }
      throw error;
    }
  }
}

