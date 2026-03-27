import { GitHubMCPClient, GitHubMCPConfig } from '../GitHubMCPClient';
import type { MCPTransport } from '../MCPTransport';

const sendMock = jest.fn();
const connectMock = jest.fn();
const disconnectMock = jest.fn();
const acquireMock = jest.fn();
const handleRateLimitMock = jest.fn();

jest.mock('../MCPTransport', () => {
  class MockStdioTransport implements MCPTransport {
    connect = connectMock.mockResolvedValue(undefined);
    disconnect = disconnectMock.mockResolvedValue(undefined);
    send = sendMock.mockResolvedValue(undefined);
  }

  class MockTCPTransport implements MCPTransport {
    connect = connectMock.mockResolvedValue(undefined);
    disconnect = disconnectMock.mockResolvedValue(undefined);
    send = sendMock.mockResolvedValue(undefined);
  }

  return {
    __esModule: true,
    StdioTransport: MockStdioTransport,
    TCPTransport: MockTCPTransport
  };
});

jest.mock('../RateLimitBudget', () => ({
  __esModule: true,
  RateLimitBudget: jest.fn().mockImplementation(() => ({
    acquire: acquireMock.mockResolvedValue(undefined),
    handleRateLimit: handleRateLimitMock.mockResolvedValue(undefined)
  }))
}));

describe('GitHubMCPClient', () => {
  const baseConfig: GitHubMCPConfig = {
    enabled: true,
    transport: 'stdio',
    pr: {},
    actions: {},
    reviews: {},
    rate_limit: {
      max_requests_per_minute: 30,
      retry_after_ms: 60000,
      shared_budget: true
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a pull request via MCP transport and normalizes result', async () => {
    sendMock.mockResolvedValueOnce({ url: 'https://example.com/pr/1', number: 1 });

    const client = new GitHubMCPClient(baseConfig);
    const pr = await client.createPullRequest({
      title: 'Test PR',
      body: 'Body',
      head: 'feature/test',
      base: 'main'
    });

    expect(acquireMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith('github.createPullRequest', {
      title: 'Test PR',
      body: 'Body',
      head: 'feature/test',
      base: 'main',
      draft: undefined,
      reviewers: undefined,
      labels: undefined
    });
    expect(pr).toEqual({ url: 'https://example.com/pr/1', number: 1 });
  });

  it('waits for checks and normalizes response', async () => {
    sendMock.mockResolvedValueOnce({
      passed: true,
      checks: [{ name: 'ci', status: 'completed', conclusion: 'success' }]
    });

    const client = new GitHubMCPClient(baseConfig);
    const result = await client.waitForChecks(42, 1000);

    expect(acquireMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith('github.waitForChecks', {
      prNumber: 42,
      timeoutMs: 1000
    });
    expect(result).toEqual({
      passed: true,
      checks: [{ name: 'ci', status: 'completed', conclusion: 'success' }]
    });
  });

  it('handles rate-limit errors by delegating to RateLimitBudget', async () => {
    const rateLimitError = new Error('rate limit exceeded');
    sendMock.mockRejectedValueOnce(rateLimitError);

    const client = new GitHubMCPClient(baseConfig);

    await expect(
      client.createPullRequest({
        title: 'Test',
        body: 'Body',
        head: 'feature/test',
        base: 'main'
      })
    ).rejects.toThrow('rate limit exceeded');

    expect(acquireMock).toHaveBeenCalledTimes(1);
    expect(handleRateLimitMock).toHaveBeenCalledTimes(1);
  });
});

