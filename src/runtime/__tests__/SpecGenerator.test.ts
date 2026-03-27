import { SpecGenerator } from '../SpecGenerator';
import { ParsedError } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('SpecGenerator', () => {
  const testSpecsDir = path.join(__dirname, 'test-specs');
  let generator: SpecGenerator;

  const mockError: ParsedError = {
    errorType: 'NullPointerException',
    filePath: 'com/example/UserService.java',
    fileName: 'UserService.java',
    lineNumber: 42,
    methodName: 'findById',
    stackTrace: [
      {
        filePath: 'UserService.java',
        lineNumber: 42,
        methodName: 'findById',
        className: 'com.example.UserService',
      },
      {
        filePath: 'UserController.java',
        lineNumber: 28,
        methodName: 'getUser',
        className: 'com.example.UserController',
      },
    ],
    timestamp: new Date('2026-03-06T10:30:45Z'),
    logGroup: '/aws/lambda/prod-api',
    logStream: 'stream-1',
    language: 'java',
    rawMessage: 'NullPointerException test',
  };

  beforeEach(async () => {
    await fs.mkdir(testSpecsDir, { recursive: true });
    generator = new SpecGenerator(testSpecsDir);
  });

  afterEach(async () => {
    await fs.rm(testSpecsDir, { recursive: true, force: true });
  });

  describe('generate', () => {
    it('should generate spec file', async () => {
      const fingerprint = 'abc123def456';
      const severity = 'high';

      const result = await generator.generate(mockError, fingerprint, severity);

      expect(result.filename).toMatch(/^AUTO-NPE-UserService-\d{8}-\d{6}\.md$/);
      expect(result.filePath).toContain(testSpecsDir);
      expect(result.error).toBe(mockError);
      expect(result.fingerprint).toBe(fingerprint);
      expect(result.severity).toBe(severity);

      // Verify file was created
      const fileExists = await fs.access(result.filePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
    });

    it('should include error details in content', async () => {
      const fingerprint = 'abc123def456';
      const severity = 'high';

      const result = await generator.generate(mockError, fingerprint, severity);

      expect(result.content).toContain('BUGFIX: NullPointerException');
      expect(result.content).toContain('UserService.java.findById');
      expect(result.content).toContain('/aws/lambda/prod-api');
      expect(result.content).toContain('Severity:** high');
      expect(result.content).toContain('Fingerprint:** abc123de');
    });

    it('should include stack trace in content', async () => {
      const fingerprint = 'abc123def456';
      const severity = 'high';

      const result = await generator.generate(mockError, fingerprint, severity);

      expect(result.content).toContain('Stack Trace:');
      expect(result.content).toContain('com.example.UserService.findById');
      expect(result.content).toContain('UserService.java:42');
    });

    it('should include acceptance criteria', async () => {
      const fingerprint = 'abc123def456';
      const severity = 'high';

      const result = await generator.generate(mockError, fingerprint, severity);

      expect(result.content).toContain('## Acceptance Criteria');
      expect(result.content).toContain('Fix NullPointerException');
      expect(result.content).toContain('Add test case');
    });
  });

  describe('filename generation', () => {
    it('should abbreviate common error types', async () => {
      const testCases = [
        { errorType: 'NullPointerException', expected: 'NPE' },
        { errorType: 'SQLException', expected: 'SQL' },
        { errorType: 'OutOfMemoryError', expected: 'OOM' },
        { errorType: 'TimeoutException', expected: 'TIMEOUT' },
        { errorType: 'SecurityException', expected: 'SEC' },
        { errorType: 'IOException', expected: 'IO' },
      ];

      for (const { errorType, expected } of testCases) {
        const error = { ...mockError, errorType };
        const result = await generator.generate(error, 'fingerprint', 'high');
        expect(result.filename).toContain(`AUTO-${expected}-`);
      }
    });

    it('should use first 10 chars for unknown error types', async () => {
      const error = { ...mockError, errorType: 'VeryLongCustomException' };
      const result = await generator.generate(error, 'fingerprint', 'high');
      expect(result.filename).toContain('AUTO-VERYLONGCU-');
    });

    it('should format timestamp correctly', async () => {
      const result = await generator.generate(mockError, 'fingerprint', 'high');
      // Should match format: YYYYMMdd-HHmmss
      expect(result.filename).toMatch(/AUTO-NPE-UserService-\d{8}-\d{6}\.md/);
    });

    it('should remove file extension from filename', async () => {
      const error = { ...mockError, fileName: 'UserService.java' };
      const result = await generator.generate(error, 'fingerprint', 'high');
      expect(result.filename).toContain('UserService-');
      expect(result.filename).not.toContain('.java');
    });
  });

  describe('content generation', () => {
    it('should include root cause analysis for known error types', async () => {
      const error = { ...mockError, errorType: 'NullPointerException' };
      const result = await generator.generate(error, 'fingerprint', 'high');

      expect(result.content).toContain('## Root Cause Analysis');
      expect(result.content).toContain('null object reference');
    });

    it('should include troubleshooting notes for known error types', async () => {
      const error = { ...mockError, errorType: 'SQLException' };
      const result = await generator.generate(error, 'fingerprint', 'high');

      expect(result.content).toContain('## Troubleshooting Notes');
      expect(result.content).toContain('prepared statements');
    });

    it('should infer test file paths', async () => {
      const javaError = { ...mockError, language: 'java' as const };
      const result = await generator.generate(javaError, 'fingerprint', 'high');

      expect(result.content).toContain('## Files Likely Affected');
      expect(result.content).toContain('UserServiceTest.java');
    });

    it('should include metadata', async () => {
      const result = await generator.generate(mockError, 'fingerprint', 'high');

      expect(result.content).toContain('**Source:** CloudWatch Logs');
      expect(result.content).toContain('**Detected:**');
      expect(result.content).toContain('**Type:** bugfix');
      expect(result.content).toContain('Auto-generated spec from runtime monitoring');
    });
  });

  describe('file system operations', () => {
    it('should create specs directory if missing', async () => {
      await fs.rm(testSpecsDir, { recursive: true, force: true });

      await generator.generate(mockError, 'fingerprint', 'high');

      const dirExists = await fs.access(testSpecsDir).then(() => true).catch(() => false);
      expect(dirExists).toBe(true);
    });

    it('should write valid UTF-8 content', async () => {
      const result = await generator.generate(mockError, 'fingerprint', 'high');

      const content = await fs.readFile(result.filePath, 'utf-8');
      expect(content).toBe(result.content);
      expect(content).toContain('# BUGFIX');
    });
  });
});
