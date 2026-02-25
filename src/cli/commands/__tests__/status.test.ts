import { statusCommand } from '../status';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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

describe('statusCommand', () => {
  let tempDir: string;
  let originalCwd: string;
  let consoleSpy: jest.SpyInstance;
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'status-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    consoleSpy.mockRestore();
    exitSpy.mockRestore();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function writeExecutionLogs(logs: any) {
    const logsDir = path.join(tempDir, '.myintern', 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(
      path.join(logsDir, 'executions.json'),
      JSON.stringify(logs),
      'utf-8'
    );
  }

  describe('no logs present', () => {
    it('should display warning when no execution logs exist', async () => {
      await statusCommand();

      const output = consoleSpy.mock.calls.map((c: any[]) => c[0]).join('\n');
      expect(output).toContain('No execution logs found');
    });

    it('should suggest running myintern start', async () => {
      await statusCommand();

      const output = consoleSpy.mock.calls.map((c: any[]) => c[0]).join('\n');
      expect(output).toContain('myintern start');
    });
  });

  describe('empty executions', () => {
    it('should display warning when executions array is empty', async () => {
      writeExecutionLogs({ executions: [] });

      await statusCommand();

      const output = consoleSpy.mock.calls.map((c: any[]) => c[0]).join('\n');
      expect(output).toContain('No executions recorded yet');
    });
  });

  describe('displaying executions', () => {
    const sampleLogs = {
      executions: [
        {
          timestamp: new Date().toISOString(),
          spec: 'spec-user-registration.md',
          branch: 'feature/user-reg',
          status: 'success',
          files_changed: 3,
          build_result: 'passed',
          tests_generated: 2,
          retry_count: 0
        },
        {
          timestamp: new Date().toISOString(),
          spec: 'spec-order-processing.md',
          branch: 'feature/orders',
          status: 'failed',
          files_changed: 2,
          build_result: 'failed',
          error: 'Compilation error in OrderService.java:42',
          retry_count: 3
        },
        {
          timestamp: new Date().toISOString(),
          spec: 'spec-payment-gateway.md',
          branch: 'feature/payments',
          status: 'in_progress',
          files_changed: 0
        }
      ]
    };

    it('should display all executions by default', async () => {
      writeExecutionLogs(sampleLogs);

      await statusCommand();

      const output = consoleSpy.mock.calls.map((c: any[]) => c[0]).join('\n');
      expect(output).toContain('spec-user-registration.md');
      expect(output).toContain('spec-order-processing.md');
      expect(output).toContain('spec-payment-gateway.md');
    });

    it('should show branch for each execution', async () => {
      writeExecutionLogs(sampleLogs);

      await statusCommand();

      const output = consoleSpy.mock.calls.map((c: any[]) => c[0]).join('\n');
      expect(output).toContain('feature/user-reg');
      expect(output).toContain('feature/orders');
      expect(output).toContain('feature/payments');
    });

    it('should show error details for failed executions', async () => {
      writeExecutionLogs(sampleLogs);

      await statusCommand();

      const output = consoleSpy.mock.calls.map((c: any[]) => c[0]).join('\n');
      expect(output).toContain('Compilation error in OrderService.java:42');
    });

    it('should show retry count for failed executions', async () => {
      writeExecutionLogs(sampleLogs);

      await statusCommand();

      const output = consoleSpy.mock.calls.map((c: any[]) => c[0]).join('\n');
      expect(output).toContain('3/3');
    });

    it('should show summary with counts', async () => {
      writeExecutionLogs(sampleLogs);

      await statusCommand();

      const output = consoleSpy.mock.calls.map((c: any[]) => c[0]).join('\n');
      expect(output).toContain('1 successful');
      expect(output).toContain('1 failed');
      expect(output).toContain('1 in progress');
    });
  });

  describe('--failed filter', () => {
    it('should only show failed executions', async () => {
      writeExecutionLogs({
        executions: [
          {
            timestamp: new Date().toISOString(),
            spec: 'spec-success.md',
            branch: 'feature/ok',
            status: 'success',
            files_changed: 1
          },
          {
            timestamp: new Date().toISOString(),
            spec: 'spec-broken.md',
            branch: 'feature/broken',
            status: 'failed',
            error: 'Build error',
            retry_count: 3
          }
        ]
      });

      await statusCommand({ failed: true });

      const output = consoleSpy.mock.calls.map((c: any[]) => c[0]).join('\n');
      expect(output).toContain('spec-broken.md');
      expect(output).not.toContain('spec-success.md');
    });

    it('should display message when no failed executions exist', async () => {
      writeExecutionLogs({
        executions: [
          {
            timestamp: new Date().toISOString(),
            spec: 'spec-success.md',
            branch: 'feature/ok',
            status: 'success',
            files_changed: 1
          }
        ]
      });

      await statusCommand({ failed: true });

      const output = consoleSpy.mock.calls.map((c: any[]) => c[0]).join('\n');
      expect(output).toContain('No failed executions found');
    });
  });

  describe('--json output', () => {
    it('should output valid JSON', async () => {
      const logs = {
        executions: [
          {
            timestamp: '2026-02-23T10:30:00Z',
            spec: 'spec-test.md',
            branch: 'feature/test',
            status: 'success',
            files_changed: 2,
            build_result: 'passed',
            tests_generated: 1,
            retry_count: 0
          }
        ]
      };
      writeExecutionLogs(logs);

      await statusCommand({ json: true });

      const jsonOutput = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(jsonOutput);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].spec).toBe('spec-test.md');
      expect(parsed[0].status).toBe('success');
    });

    it('should respect --failed filter with --json', async () => {
      writeExecutionLogs({
        executions: [
          {
            timestamp: '2026-02-23T10:30:00Z',
            spec: 'spec-ok.md',
            branch: 'feature/ok',
            status: 'success',
            files_changed: 1
          },
          {
            timestamp: '2026-02-23T10:35:00Z',
            spec: 'spec-bad.md',
            branch: 'feature/bad',
            status: 'failed',
            error: 'Build failed'
          }
        ]
      });

      await statusCommand({ failed: true, json: true });

      const jsonOutput = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(jsonOutput);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].spec).toBe('spec-bad.md');
    });
  });

  describe('status formatting', () => {
    it('should show "Build passed" for successful executions', async () => {
      writeExecutionLogs({
        executions: [
          {
            timestamp: new Date().toISOString(),
            spec: 'spec-ok.md',
            branch: 'feature/ok',
            status: 'success',
            build_result: 'passed',
            tests_generated: 5
          }
        ]
      });

      await statusCommand();

      const output = consoleSpy.mock.calls.map((c: any[]) => c[0]).join('\n');
      expect(output).toContain('Build passed');
      expect(output).toContain('5 tests generated');
    });

    it('should show retry info for max-retried failures', async () => {
      writeExecutionLogs({
        executions: [
          {
            timestamp: new Date().toISOString(),
            spec: 'spec-fail.md',
            branch: 'feature/fail',
            status: 'failed',
            build_result: 'failed',
            retry_count: 3
          }
        ]
      });

      await statusCommand();

      const output = consoleSpy.mock.calls.map((c: any[]) => c[0]).join('\n');
      expect(output).toContain('Build failed (retry 3/3)');
    });

    it('should show "In progress" for in_progress executions', async () => {
      writeExecutionLogs({
        executions: [
          {
            timestamp: new Date().toISOString(),
            spec: 'spec-wip.md',
            branch: 'feature/wip',
            status: 'in_progress'
          }
        ]
      });

      await statusCommand();

      const output = consoleSpy.mock.calls.map((c: any[]) => c[0]).join('\n');
      expect(output).toContain('In progress');
    });
  });

  describe('timestamp formatting', () => {
    it('should show "just now" for very recent timestamps', async () => {
      writeExecutionLogs({
        executions: [
          {
            timestamp: new Date().toISOString(),
            spec: 'spec-now.md',
            branch: 'feature/now',
            status: 'success'
          }
        ]
      });

      await statusCommand();

      const output = consoleSpy.mock.calls.map((c: any[]) => c[0]).join('\n');
      expect(output).toContain('just now');
    });

    it('should show minutes ago for recent timestamps', async () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      writeExecutionLogs({
        executions: [
          {
            timestamp: fiveMinAgo.toISOString(),
            spec: 'spec-recent.md',
            branch: 'feature/recent',
            status: 'success'
          }
        ]
      });

      await statusCommand();

      const output = consoleSpy.mock.calls.map((c: any[]) => c[0]).join('\n');
      expect(output).toContain('minutes ago');
    });

    it('should show hours ago for older timestamps', async () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
      writeExecutionLogs({
        executions: [
          {
            timestamp: threeHoursAgo.toISOString(),
            spec: 'spec-old.md',
            branch: 'feature/old',
            status: 'failed'
          }
        ]
      });

      await statusCommand();

      const output = consoleSpy.mock.calls.map((c: any[]) => c[0]).join('\n');
      expect(output).toContain('hours ago');
    });
  });

  describe('error handling', () => {
    it('should handle corrupt JSON gracefully', async () => {
      const logsDir = path.join(tempDir, '.myintern', 'logs');
      fs.mkdirSync(logsDir, { recursive: true });
      fs.writeFileSync(path.join(logsDir, 'executions.json'), '{invalid json', 'utf-8');

      await statusCommand();

      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});
