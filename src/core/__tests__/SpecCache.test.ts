
import { SpecCache } from '../SpecCache';
import { SpecFile } from '../SpecParser';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('SpecCache', () => {
  let cache: SpecCache;
  let tempDir: string;
  let testFilePath: string;

  beforeEach(() => {
    cache = new SpecCache();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-cache-test-'));
    testFilePath = path.join(tempDir, 'test-spec.md');
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const createMockSpec = (filePath: string): SpecFile => ({
    filePath,
    title: 'Test Spec',
    type: 'feature',
    priority: 'high',
    description: 'Test description',
    acceptanceCriteria: ['AC1', 'AC2'],
    notes: 'Test notes',
    rawContent: '# Test Spec\n\nTest content'
  });

  describe('get and set', () => {
    it('should return null for non-cached file', () => {
      const result = cache.get('/non/existent/path.md');
      expect(result).toBeNull();
    });

    it('should cache and retrieve a spec file', () => {
      // Create test file
      fs.writeFileSync(testFilePath, '# Test Spec', 'utf-8');

      const spec = createMockSpec(testFilePath);
      cache.set(testFilePath, spec);

      const cached = cache.get(testFilePath);
      expect(cached).toEqual(spec);
    });

    it('should invalidate cache when file is modified', () => {
      // Create test file
      fs.writeFileSync(testFilePath, '# Test Spec', 'utf-8');

      const spec = createMockSpec(testFilePath);
      cache.set(testFilePath, spec);

      // Verify cached
      expect(cache.get(testFilePath)).toEqual(spec);

      // Wait a bit to ensure mtime changes
      const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      return wait(10).then(() => {
        // Modify file
        fs.writeFileSync(testFilePath, '# Modified Test Spec', 'utf-8');

        // Cache should be invalidated
        const cached = cache.get(testFilePath);
        expect(cached).toBeNull();
      });
    });

    it('should invalidate cache when file is deleted', () => {
      // Create test file
      fs.writeFileSync(testFilePath, '# Test Spec', 'utf-8');

      const spec = createMockSpec(testFilePath);
      cache.set(testFilePath, spec);

      // Delete file
      fs.unlinkSync(testFilePath);

      // Cache should be invalidated
      const cached = cache.get(testFilePath);
      expect(cached).toBeNull();
    });

    it('should handle non-existent file on set gracefully', () => {
      const spec = createMockSpec('/non/existent/path.md');

      // Should not throw
      expect(() => cache.set('/non/existent/path.md', spec)).not.toThrow();

      // Should not be cached
      expect(cache.get('/non/existent/path.md')).toBeNull();
    });
  });

  describe('invalidate', () => {
    it('should remove cached entry', () => {
      fs.writeFileSync(testFilePath, '# Test Spec', 'utf-8');

      const spec = createMockSpec(testFilePath);
      cache.set(testFilePath, spec);

      expect(cache.get(testFilePath)).toEqual(spec);

      cache.invalidate(testFilePath);

      expect(cache.get(testFilePath)).toBeNull();
    });

    it('should not throw when invalidating non-cached file', () => {
      expect(() => cache.invalidate('/non/existent/path.md')).not.toThrow();
    });
  });

  describe('clear', () => {
    it('should remove all cached entries', () => {
      const file1 = path.join(tempDir, 'spec1.md');
      const file2 = path.join(tempDir, 'spec2.md');

      fs.writeFileSync(file1, '# Spec 1', 'utf-8');
      fs.writeFileSync(file2, '# Spec 2', 'utf-8');

      cache.set(file1, createMockSpec(file1));
      cache.set(file2, createMockSpec(file2));

      expect(cache.size).toBe(2);

      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.get(file1)).toBeNull();
      expect(cache.get(file2)).toBeNull();
    });

    it('should reset statistics', () => {
      fs.writeFileSync(testFilePath, '# Test Spec', 'utf-8');

      const spec = createMockSpec(testFilePath);
      cache.set(testFilePath, spec);

      // Generate some hits and misses
      cache.get(testFilePath); // hit
      cache.get('/non/existent.md'); // miss

      let stats = cache.getStats();
      expect(stats.hits).toBeGreaterThan(0);
      expect(stats.misses).toBeGreaterThan(0);

      cache.clear();

      stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should track cache hits and misses', () => {
      fs.writeFileSync(testFilePath, '# Test Spec', 'utf-8');

      const spec = createMockSpec(testFilePath);
      cache.set(testFilePath, spec);

      // Generate hits
      cache.get(testFilePath);
      cache.get(testFilePath);

      // Generate misses
      cache.get('/non/existent1.md');
      cache.get('/non/existent2.md');

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBe(0.5);
      expect(stats.size).toBe(1);
    });

    it('should return 0 hit rate when no operations', () => {
      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(0);
    });
  });

  describe('has', () => {
    it('should return true for cached file', () => {
      fs.writeFileSync(testFilePath, '# Test Spec', 'utf-8');

      const spec = createMockSpec(testFilePath);
      cache.set(testFilePath, spec);

      expect(cache.has(testFilePath)).toBe(true);
    });

    it('should return false for non-cached file', () => {
      expect(cache.has('/non/existent/path.md')).toBe(false);
    });
  });

  describe('size', () => {
    it('should return number of cached entries', () => {
      expect(cache.size).toBe(0);

      const file1 = path.join(tempDir, 'spec1.md');
      const file2 = path.join(tempDir, 'spec2.md');

      fs.writeFileSync(file1, '# Spec 1', 'utf-8');
      fs.writeFileSync(file2, '# Spec 2', 'utf-8');

      cache.set(file1, createMockSpec(file1));
      expect(cache.size).toBe(1);

      cache.set(file2, createMockSpec(file2));
      expect(cache.size).toBe(2);

      cache.invalidate(file1);
      expect(cache.size).toBe(1);
    });
  });

  describe('file modification detection', () => {
    it('should detect size changes', () => {
      fs.writeFileSync(testFilePath, '# Test', 'utf-8');

      const spec = createMockSpec(testFilePath);
      cache.set(testFilePath, spec);

      expect(cache.get(testFilePath)).toEqual(spec);

      const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      return wait(10).then(() => {
        // Change file size
        fs.writeFileSync(testFilePath, '# Test Spec with more content', 'utf-8');

        // Should invalidate
        expect(cache.get(testFilePath)).toBeNull();
      });
    });

    it('should use both mtime and size for validation', () => {
      fs.writeFileSync(testFilePath, '# Test Spec', 'utf-8');

      const spec = createMockSpec(testFilePath);
      cache.set(testFilePath, spec);

      // First get should hit cache
      expect(cache.get(testFilePath)).toEqual(spec);

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
    });
  });
});
