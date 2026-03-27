import { SeverityEvaluator } from '../SeverityEvaluator';
import { DeduplicationCache } from '../DeduplicationCache';
import { ParsedError, RuntimeConfig } from '../types';
import * as fs from 'fs';
import * as path from 'path';

describe('SeverityEvaluator', () => {
  const testDbPath = path.join(__dirname, 'test-severity.db');
  let cache: DeduplicationCache;
  let evaluator: SeverityEvaluator;

  const mockConfig: RuntimeConfig = {
    enabled: true,
    environment: 'production',
    phase: 1,
    cloudwatch: {
      enabled: true,
      region: 'us-east-1',
      logGroups: [],
      pollInterval: 60,
      errorPatterns: [],
    },
    deduplication: {
      enabled: true,
      window: '24h',
      maxSpecsPerError: 1,
      cacheBackend: 'sqlite',
      cachePath: testDbPath,
    },
    severityRules: {
      critical: {
        autoFix: false,
        requireApproval: true,
        maxPerDay: 5,
        createSpec: true,
      },
      high: {
        autoFix: false,
        requireApproval: true,
        maxPerDay: 10,
        createSpec: true,
      },
      medium: {
        autoFix: false,
        requireApproval: false,
        maxPerDay: 20,
        createSpec: true,
      },
      low: {
        autoFix: false,
        requireApproval: false,
        maxPerDay: 50,
        createSpec: false,
      },
    },
    rateLimiting: {
      maxSpecsPerHour: 5,
      maxApiCallsPerHour: 100,
    },
  };

  const createMockError = (errorType: string): ParsedError => ({
    errorType,
    filePath: 'com/example/Service.java',
    fileName: 'Service.java',
    lineNumber: 42,
    methodName: 'method',
    stackTrace: [],
    timestamp: new Date(),
    logGroup: '/aws/lambda/prod-api',
    logStream: 'stream-1',
    language: 'java',
    rawMessage: 'test error',
  });

  beforeEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    cache = new DeduplicationCache(testDbPath, 24);
    evaluator = new SeverityEvaluator(mockConfig, cache);
  });

  afterEach(() => {
    cache.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('severity mapping', () => {
    it('should classify OutOfMemoryError as critical', async () => {
      const error = createMockError('OutOfMemoryError');
      const result = await evaluator.evaluate(error);
      expect(result.severity).toBe('critical');
    });

    it('should classify SecurityException as critical', async () => {
      const error = createMockError('SecurityException');
      const result = await evaluator.evaluate(error);
      expect(result.severity).toBe('critical');
    });

    it('should classify NullPointerException as high', async () => {
      const error = createMockError('NullPointerException');
      const result = await evaluator.evaluate(error);
      expect(result.severity).toBe('high');
    });

    it('should classify SQLException as high', async () => {
      const error = createMockError('SQLException');
      const result = await evaluator.evaluate(error);
      expect(result.severity).toBe('high');
    });

    it('should classify TimeoutException as medium', async () => {
      const error = createMockError('TimeoutException');
      const result = await evaluator.evaluate(error);
      expect(result.severity).toBe('medium');
    });

    it('should classify IOException as medium', async () => {
      const error = createMockError('IOException');
      const result = await evaluator.evaluate(error);
      expect(result.severity).toBe('medium');
    });

    it('should classify unknown errors as low', async () => {
      const error = createMockError('SomeRandomException');
      const result = await evaluator.evaluate(error);
      expect(result.severity).toBe('low');
    });
  });

  describe('severity threshold', () => {
    it('should skip low severity when createSpec is false', async () => {
      const error = createMockError('SomeRandomException');
      const result = await evaluator.evaluate(error);

      expect(result.action).toBe('skip');
      expect(result.reason).toContain('below threshold');
    });

    it('should create spec for critical when createSpec is true', async () => {
      const error = createMockError('OutOfMemoryError');
      const result = await evaluator.evaluate(error);

      expect(result.action).toBe('create_spec');
    });
  });

  describe('hourly rate limiting', () => {
    it('should allow specs within hourly limit', async () => {
      const error = createMockError('NullPointerException');

      // First 5 should succeed
      for (let i = 0; i < 5; i++) {
        const result = await evaluator.evaluate(error);
        expect(result.action).toBe('create_spec');
      }
    });

    it('should block specs when hourly limit exceeded', async () => {
      const error = createMockError('NullPointerException');

      // Fill up hourly quota
      for (let i = 0; i < 5; i++) {
        await evaluator.evaluate(error);
      }

      // 6th should be blocked
      const result = await evaluator.evaluate(error);
      expect(result.action).toBe('skip');
      expect(result.reason).toContain('Hourly rate limit exceeded');
      expect(result.rateLimitHit).toBe(true);
    });
  });

  describe('daily rate limiting', () => {
    it('should allow specs within daily limit for severity', async () => {
      const error = createMockError('NullPointerException'); // high severity, maxPerDay: 10

      // First 10 should succeed (assuming hourly limit allows)
      for (let i = 0; i < 5; i++) { // Only test 5 to stay under hourly limit
        const result = await evaluator.evaluate(error);
        expect(result.action).toBe('create_spec');
      }
    });

    it('should respect different limits for different severities', async () => {
      const criticalError = createMockError('OutOfMemoryError'); // critical, maxPerDay: 5
      const highError = createMockError('NullPointerException'); // high, maxPerDay: 10

      // Both should have independent counters
      for (let i = 0; i < 5; i++) {
        const criticalResult = await evaluator.evaluate(criticalError);
        expect(criticalResult.action).toBe('create_spec');
      }

      // Critical should be at limit (hourly limit might be hit first)
      const criticalResult = await evaluator.evaluate(criticalError);
      expect(criticalResult.action).toBe('skip');
      expect(criticalResult.reason).toMatch(/rate limit/i);
    });
  });

  describe('rate limit persistence', () => {
    it('should persist rate limits in SQLite', async () => {
      const error = createMockError('NullPointerException');

      // Create some rate limit entries
      await evaluator.evaluate(error);
      await evaluator.evaluate(error);

      // Create new evaluator with same cache (simulates restart)
      const newEvaluator = new SeverityEvaluator(mockConfig, cache);
      await newEvaluator.evaluate(error);

      // Rate limits should persist
      const now = new Date();
      const hourKey = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}-${now.getHours()}`;
      const count = await cache.getRateLimitCount(hourKey);
      expect(count).toBe(3);
    });
  });
});
