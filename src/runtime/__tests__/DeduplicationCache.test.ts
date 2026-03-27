import { DeduplicationCache } from '../DeduplicationCache';
import { ParsedError } from '../types';
import * as fs from 'fs';
import * as path from 'path';

describe('DeduplicationCache', () => {
  const testDbPath = path.join(__dirname, 'test-dedup.db');
  let cache: DeduplicationCache;

  const mockError: ParsedError = {
    errorType: 'NullPointerException',
    filePath: 'com/example/UserService.java',
    fileName: 'UserService.java',
    lineNumber: 42,
    methodName: 'findById',
    stackTrace: [],
    timestamp: new Date(),
    logGroup: '/aws/lambda/prod-api',
    logStream: 'stream-1',
    language: 'java',
    rawMessage: 'test error',
  };

  beforeEach(() => {
    // Clean up test database if it exists
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    cache = new DeduplicationCache(testDbPath, 24);
  });

  afterEach(() => {
    cache.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('initialization', () => {
    it('should create database file', () => {
      expect(fs.existsSync(testDbPath)).toBe(true);
    });

    it('should run cleanup on init', async () => {
      await cache.init();
      // Should not throw
    });
  });

  describe('add and has', () => {
    it('should add fingerprint to cache', async () => {
      const fingerprint = 'abc123';
      await cache.add(fingerprint, mockError);

      const exists = await cache.has(fingerprint);
      expect(exists).toBe(true);
    });

    it('should return false for non-existent fingerprint', async () => {
      const exists = await cache.has('nonexistent');
      expect(exists).toBe(false);
    });
  });

  describe('update', () => {
    it('should increment occurrences', async () => {
      const fingerprint = 'abc123';
      await cache.add(fingerprint, mockError);

      await cache.update(fingerprint);

      const entry = await cache.get(fingerprint);
      expect(entry?.occurrences).toBe(2);
    });

    it('should update last_seen timestamp', async () => {
      const fingerprint = 'abc123';
      await cache.add(fingerprint, mockError);

      const before = await cache.get(fingerprint);
      await new Promise(resolve => setTimeout(resolve, 10));
      await cache.update(fingerprint);
      const after = await cache.get(fingerprint);

      expect(after?.lastSeen.getTime()).toBeGreaterThan(before!.lastSeen.getTime());
    });
  });

  describe('markSpecCreated', () => {
    it('should mark spec as created', async () => {
      const fingerprint = 'abc123';
      const specPath = '.myintern/specs/AUTO-NPE-UserService-123.md';

      await cache.add(fingerprint, mockError);
      await cache.markSpecCreated(fingerprint, specPath);

      const entry = await cache.get(fingerprint);
      expect(entry?.specCreated).toBe(true);
      expect(entry?.specPath).toBe(specPath);
    });
  });

  describe('get', () => {
    it('should retrieve cache entry', async () => {
      const fingerprint = 'abc123';
      await cache.add(fingerprint, mockError);

      const entry = await cache.get(fingerprint);

      expect(entry).not.toBeNull();
      expect(entry?.fingerprint).toBe(fingerprint);
      expect(entry?.errorType).toBe('NullPointerException');
      expect(entry?.filePath).toBe('com/example/UserService.java');
      expect(entry?.occurrences).toBe(1);
      expect(entry?.specCreated).toBe(false);
    });

    it('should return null for non-existent fingerprint', async () => {
      const entry = await cache.get('nonexistent');
      expect(entry).toBeNull();
    });
  });

  describe('cleanup', () => {
    it('should remove expired entries', async () => {
      // Create cache with very short TTL (1 millisecond)
      cache.close();
      cache = new DeduplicationCache(testDbPath, 0.001 / 3600); // ~1ms in hours

      const fingerprint = 'abc123';
      await cache.add(fingerprint, mockError);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 50));

      const deleted = await cache.cleanup();
      expect(deleted).toBe(1);

      const exists = await cache.has(fingerprint);
      expect(exists).toBe(false);
    });

    it('should not remove non-expired entries', async () => {
      const fingerprint = 'abc123';
      await cache.add(fingerprint, mockError);

      const deleted = await cache.cleanup();
      expect(deleted).toBe(0);

      const exists = await cache.has(fingerprint);
      expect(exists).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return statistics', async () => {
      await cache.add('fp1', mockError);
      await cache.add('fp2', mockError);
      await cache.markSpecCreated('fp1', '.myintern/specs/test.md');

      const stats = await cache.getStats();

      expect(stats.totalEntries).toBe(2);
      expect(stats.specsCreated).toBe(1);
      expect(stats.oldestEntry).toBeInstanceOf(Date);
      expect(stats.newestEntry).toBeInstanceOf(Date);
    });
  });

  describe('rate limiting', () => {
    it('should track rate limit counts', async () => {
      const window = 'hour_2026030614';

      await cache.incrementRateLimit(window);
      await cache.incrementRateLimit(window);

      const count = await cache.getRateLimitCount(window);
      expect(count).toBe(2);
    });

    it('should return 0 for non-existent window', async () => {
      const count = await cache.getRateLimitCount('nonexistent');
      expect(count).toBe(0);
    });

    it('should handle multiple windows independently', async () => {
      await cache.incrementRateLimit('window1');
      await cache.incrementRateLimit('window1');
      await cache.incrementRateLimit('window2');

      const count1 = await cache.getRateLimitCount('window1');
      const count2 = await cache.getRateLimitCount('window2');

      expect(count1).toBe(2);
      expect(count2).toBe(1);
    });
  });

  describe('TTL behavior', () => {
    it('should respect custom TTL', async () => {
      cache.close();
      cache = new DeduplicationCache(testDbPath, 48); // 48 hours

      const fingerprint = 'abc123';
      await cache.add(fingerprint, mockError);

      // Should still exist (48 hour TTL)
      const exists = await cache.has(fingerprint);
      expect(exists).toBe(true);
    });
  });
});
