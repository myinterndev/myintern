import { GitHubLifecycle } from '../GitHubLifecycle';
import type { GitHubMCPClient, GitHubMCPConfig } from '../../mcp/GitHubMCPClient';

describe('GitHubLifecycle', () => {
  const baseConfig: GitHubMCPConfig = {
    enabled: true,
    transport: 'stdio',
    pr: {
      base_branch: 'main',
      auto_create: true,
      auto_merge: false,
      draft: true,
      reviewers: [],
      labels: ['myintern-generated']
    },
    actions: {
      trigger_on_pr: true,
      wait_for_checks: true,
      check_timeout_ms: 300000,
      auto_fix_on_failure: false
    },
    reviews: {
      respond_to_comments: false,
      auto_resolve: false,
      max_review_rounds: 3,
      on_max_rounds_exceeded: 'fail_pr'
    },
    rate_limit: {
      max_requests_per_minute: 30,
      retry_after_ms: 60000,
      shared_budget: true
    }
  };

  const mockClient: jest.Mocked<GitHubMCPClient> = {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    testConnection: jest.fn(),
    createPullRequest: jest.fn(),
    mergePullRequest: jest.fn().mockResolvedValue(undefined),
    updatePullRequest: jest.fn(),
    listPullRequests: jest.fn(),
    triggerWorkflow: jest.fn(),
    getWorkflowRunStatus: jest.fn(),
    waitForChecks: jest.fn(),
    getWorkflowLogs: jest.fn(),
    cancelWorkflowRun: jest.fn(),
    listReviewComments: jest.fn(),
    respondToReview: jest.fn(),
    requestReview: jest.fn(),
    closeIssue: jest.fn(),
    addLabels: jest.fn(),
    createComment: jest.fn()
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips PR creation when auto_create is disabled', async () => {
    const cfg: GitHubMCPConfig = {
      ...baseConfig,
      pr: {
        ...baseConfig.pr!,
        auto_create: false
      }
    };

    const lifecycle = new GitHubLifecycle(mockClient, cfg);
    const result = await lifecycle.createAndMonitorPR({
      specName: 'spec-1.md',
      specTitle: 'Spec 1',
      branch: 'feature/spec-1',
      filesChanged: 3
    });

    expect(result.status).toBe('skipped');
    expect(mockClient.createPullRequest).not.toHaveBeenCalled();
  });

  it('creates PR and waits for checks, succeeding when checks pass', async () => {
    mockClient.createPullRequest.mockResolvedValueOnce({
      url: 'https://example.com/pr/1',
      number: 1
    } as any);
    mockClient.waitForChecks.mockResolvedValueOnce({
      passed: true,
      checks: []
    } as any);

    const lifecycle = new GitHubLifecycle(mockClient, baseConfig);
    const result = await lifecycle.createAndMonitorPR({
      specName: 'spec-1.md',
      specTitle: 'Spec 1',
      branch: 'feature/spec-1',
      filesChanged: 3
    });

    expect(mockClient.createPullRequest).toHaveBeenCalledTimes(1);
    expect(mockClient.waitForChecks).toHaveBeenCalledWith(1, baseConfig.actions!.check_timeout_ms);
    expect(result.status).toBe('success');
    expect(result.pr).toEqual({ url: 'https://example.com/pr/1', number: 1 });
  });

  it('returns ci_failed when checks fail', async () => {
    mockClient.createPullRequest.mockResolvedValueOnce({
      url: 'https://example.com/pr/2',
      number: 2
    } as any);
    mockClient.waitForChecks.mockResolvedValueOnce({
      passed: false,
      checks: []
    } as any);

    const lifecycle = new GitHubLifecycle(mockClient, baseConfig);
    const result = await lifecycle.createAndMonitorPR({
      specName: 'spec-2.md',
      specTitle: 'Spec 2',
      branch: 'feature/spec-2',
      filesChanged: 5
    });

    expect(result.status).toBe('ci_failed');
    expect(result.pr).toEqual({ url: 'https://example.com/pr/2', number: 2 });
  });

  it('auto-merges when configured and checks pass', async () => {
    const cfg: GitHubMCPConfig = {
      ...baseConfig,
      pr: {
        ...baseConfig.pr!,
        auto_merge: true
      }
    };

    mockClient.createPullRequest.mockResolvedValueOnce({
      url: 'https://example.com/pr/3',
      number: 3
    } as any);
    mockClient.waitForChecks.mockResolvedValueOnce({
      passed: true,
      checks: []
    } as any);

    const lifecycle = new GitHubLifecycle(mockClient, cfg);
    const result = await lifecycle.createAndMonitorPR({
      specName: 'spec-3.md',
      specTitle: 'Spec 3',
      branch: 'feature/spec-3',
      filesChanged: 2
    });

    expect(result.status).toBe('success');
    expect(result.pr).toEqual({ url: 'https://example.com/pr/3', number: 3 });
    expect(mockClient.mergePullRequest).toHaveBeenCalledWith(3, {
      merge_method: 'squash'
    });
  });
});

