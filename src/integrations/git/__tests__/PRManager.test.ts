import { PRManager, GitConfig, PROptions, PRResult } from '../PRManager';
import { SpecFile } from '../../../core/SpecParser';
import { exec } from 'child_process';
import { promisify } from 'util';

jest.mock('child_process', () => ({
  exec: jest.fn()
}));

const passthrough = (s: string) => s;
jest.mock('chalk', () => {
  const fn = (s: string) => s;
  const chalk: any = fn;
  chalk.yellow = fn;
  chalk.blue = fn;
  chalk.green = fn;
  chalk.red = fn;
  chalk.gray = fn;
  chalk.bold = fn;
  return { __esModule: true, default: chalk };
});

const execMock = exec as unknown as jest.Mock;

function mockExec(stdout = '', stderr = '') {
  execMock.mockImplementation((_cmd: string, _opts: any, cb?: Function) => {
    if (cb) {
      cb(null, { stdout, stderr });
      return;
    }
  });
}

function mockExecPromisified(results: Array<{ stdout?: string; stderr?: string; error?: Error }>) {
  let callIndex = 0;
  execMock.mockImplementation((_cmd: string, _opts: any, cb?: Function) => {
    const r = results[callIndex] || results[results.length - 1];
    callIndex++;
    if (cb) {
      if (r.error) {
        cb(r.error, null);
      } else {
        cb(null, { stdout: r.stdout || '', stderr: r.stderr || '' });
      }
      return;
    }
  });
}

describe('PRManager', () => {
  const repoPath = '/test/repo';
  const mockSpec: SpecFile = {
    filePath: '/test/repo/.myintern/specs/spec-auth.md',
    title: 'User Authentication',
    type: 'feature',
    priority: 'high',
    description: 'Implement user authentication',
    acceptanceCriteria: ['POST /api/login', 'JWT tokens'],
    notes: '',
    rawContent: '# User Authentication\n...'
  };

  const basePROptions: PROptions = {
    spec: mockSpec,
    branch: 'feature/auth',
    filesChanged: 3,
    buildStatus: 'passed'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createPR', () => {
    it('should return null when auto_pr is disabled', async () => {
      const config: GitConfig = { auto_pr: false };
      const manager = new PRManager(repoPath, config);

      const result = await manager.createPR(basePROptions);

      expect(result).toBeNull();
      expect(execMock).not.toHaveBeenCalled();
    });

    it('should return null and warn when gh CLI is not installed', async () => {
      const config: GitConfig = { auto_pr: true, pr_base_branch: 'main' };
      const manager = new PRManager(repoPath, config);

      mockExecPromisified([
        { error: new Error('command not found: gh') }
      ]);

      const result = await manager.createPR(basePROptions);

      expect(result).toBeNull();
    });

    it('should create PR with correct title and base branch', async () => {
      const config: GitConfig = {
        auto_pr: true,
        pr_base_branch: 'develop'
      };
      const manager = new PRManager(repoPath, config);

      mockExecPromisified([
        { stdout: 'gh version 2.40.0' },
        { stdout: 'https://github.com/myinterndev/myintern/pull/42\n' }
      ]);

      const result = await manager.createPR(basePROptions);

      expect(result).not.toBeNull();
      expect(result!.url).toBe('https://github.com/myinterndev/myintern/pull/42');
      expect(result!.number).toBe(42);
    });

    it('should use "main" as default base branch', async () => {
      const config: GitConfig = { auto_pr: true };
      const manager = new PRManager(repoPath, config);

      mockExecPromisified([
        { stdout: 'gh version 2.40.0' },
        { stdout: 'https://github.com/myinterndev/myintern/pull/1\n' }
      ]);

      await manager.createPR(basePROptions);

      const ghCreateCall = execMock.mock.calls[1];
      expect(ghCreateCall[0]).toContain('--base "main"');
    });

    it('should include spec title in PR title', async () => {
      const config: GitConfig = { auto_pr: true };
      const manager = new PRManager(repoPath, config);

      mockExecPromisified([
        { stdout: 'gh version 2.40.0' },
        { stdout: 'https://github.com/myinterndev/myintern/pull/5\n' }
      ]);

      await manager.createPR(basePROptions);

      const ghCreateCall = execMock.mock.calls[1];
      expect(ghCreateCall[0]).toContain('[MyIntern] User Authentication');
    });

    it('should return null when PR creation fails', async () => {
      const config: GitConfig = { auto_pr: true };
      const manager = new PRManager(repoPath, config);

      mockExecPromisified([
        { stdout: 'gh version 2.40.0' },
        { error: new Error('not authenticated') }
      ]);

      const result = await manager.createPR(basePROptions);

      expect(result).toBeNull();
    });

    it('should use custom PR template when provided', async () => {
      const customTemplate = 'Custom PR for {{spec_name}} with {{files_changed}} changes';
      const config: GitConfig = {
        auto_pr: true,
        pr_template: customTemplate,
        pr_base_branch: 'main'
      };
      const manager = new PRManager(repoPath, config);

      mockExecPromisified([
        { stdout: 'gh version 2.40.0' },
        { stdout: 'https://github.com/myinterndev/myintern/pull/10\n' }
      ]);

      await manager.createPR(basePROptions);

      const ghCreateCall = execMock.mock.calls[1];
      expect(ghCreateCall[0]).toContain('Custom PR for spec-auth.md with 3 changes');
    });

    it('should use default template when no custom template provided', async () => {
      const config: GitConfig = { auto_pr: true };
      const manager = new PRManager(repoPath, config);

      mockExecPromisified([
        { stdout: 'gh version 2.40.0' },
        { stdout: 'https://github.com/myinterndev/myintern/pull/7\n' }
      ]);

      await manager.createPR(basePROptions);

      const ghCreateCall = execMock.mock.calls[1];
      const cmdStr = ghCreateCall[0] as string;
      expect(cmdStr).toContain('## Summary');
      expect(cmdStr).toContain('spec-auth.md');
      expect(cmdStr).toContain('3 files modified');
      expect(cmdStr).toContain('passed');
    });

    it('should parse PR number from URL', async () => {
      const config: GitConfig = { auto_pr: true };
      const manager = new PRManager(repoPath, config);

      mockExecPromisified([
        { stdout: 'gh version 2.40.0' },
        { stdout: 'https://github.com/org/repo/pull/123\n' }
      ]);

      const result = await manager.createPR(basePROptions);

      expect(result!.number).toBe(123);
    });

    it('should handle missing PR URL in gh output gracefully', async () => {
      const config: GitConfig = { auto_pr: true };
      const manager = new PRManager(repoPath, config);

      mockExecPromisified([
        { stdout: 'gh version 2.40.0' },
        { stdout: 'PR created successfully\n' }
      ]);

      const result = await manager.createPR(basePROptions);

      expect(result).not.toBeNull();
      expect(result!.url).toBe('');
      expect(result!.number).toBe(0);
    });
  });

  describe('template rendering', () => {
    it('should replace all template variables', async () => {
      const template = '{{spec_name}} | {{files_changed}} | {{build_status}} | {{spec_title}} | {{spec_type}}';
      const config: GitConfig = {
        auto_pr: true,
        pr_template: template
      };
      const manager = new PRManager(repoPath, config);

      mockExecPromisified([
        { stdout: 'gh version 2.40.0' },
        { stdout: 'https://github.com/org/repo/pull/1\n' }
      ]);

      await manager.createPR(basePROptions);

      const ghCreateCall = execMock.mock.calls[1];
      const cmdStr = ghCreateCall[0] as string;
      expect(cmdStr).toContain('spec-auth.md | 3 | passed | User Authentication | feature');
    });

    it('should handle multiple occurrences of same variable', async () => {
      const template = '{{spec_name}} first, {{spec_name}} second';
      const config: GitConfig = {
        auto_pr: true,
        pr_template: template
      };
      const manager = new PRManager(repoPath, config);

      mockExecPromisified([
        { stdout: 'gh version 2.40.0' },
        { stdout: 'https://github.com/org/repo/pull/1\n' }
      ]);

      await manager.createPR(basePROptions);

      const ghCreateCall = execMock.mock.calls[1];
      const cmdStr = ghCreateCall[0] as string;
      expect(cmdStr).toContain('spec-auth.md first, spec-auth.md second');
    });
  });
});
