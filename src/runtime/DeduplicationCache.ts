import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { CacheEntry, ParsedError, CacheStats } from './types';

/**
 * SQLite-based deduplication cache for error fingerprints.
 *
 * TTL: 24 hours (configurable)
 * Storage: .myintern/cache/deduplication.db
 */
export class DeduplicationCache {
  private db: Database.Database;
  private ttlMs: number;

  constructor(dbPath: string, ttlHours: number = 24) {
    // Create directory if missing
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.ttlMs = ttlHours * 60 * 60 * 1000;
    this.initSchema();
  }

  /**
   * Initialize database schema
   */
  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS error_cache (
        fingerprint TEXT PRIMARY KEY,
        error_type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        first_seen INTEGER NOT NULL,
        last_seen INTEGER NOT NULL,
        occurrences INTEGER DEFAULT 1,
        spec_created INTEGER DEFAULT 0,
        spec_path TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_last_seen ON error_cache(last_seen);
      CREATE INDEX IF NOT EXISTS idx_spec_created ON error_cache(spec_created);

      -- NEW: Rate limiting table (persists across restarts)
      CREATE TABLE IF NOT EXISTS rate_limits (
        window TEXT PRIMARY KEY,        -- 'hour_2026030614' or 'day_20260306_high'
        specs_created INTEGER DEFAULT 0,
        api_calls_made INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_window ON rate_limits(window);
    `);

    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
  }

  /**
   * Initialize cache and run startup cleanup
   * CRITICAL: Must be called before daemon starts polling
   */
  async init(): Promise<void> {
    console.log('🧹 Running startup cleanup...');
    const deleted = await this.cleanup();
    console.log(`   Removed ${deleted} expired cache entries`);
  }

  /**
   * Check if fingerprint exists and is not expired
   */
  async has(fingerprint: string): Promise<boolean> {
    const now = Date.now();
    const cutoff = now - this.ttlMs;

    const row = this.db.prepare(`
      SELECT fingerprint FROM error_cache
      WHERE fingerprint = ? AND last_seen > ?
    `).get(fingerprint, cutoff);

    return row !== undefined;
  }

  /**
   * Add new fingerprint to cache
   */
  async add(fingerprint: string, error: ParsedError): Promise<void> {
    const now = Date.now();

    this.db.prepare(`
      INSERT INTO error_cache (
        fingerprint, error_type, file_path,
        first_seen, last_seen, occurrences,
        spec_created, created_at
      ) VALUES (?, ?, ?, ?, ?, 1, 0, ?)
    `).run(
      fingerprint,
      error.errorType,
      error.filePath,
      now,
      now,
      now
    );
  }

  /**
   * Update existing fingerprint (increment occurrences, update last_seen)
   */
  async update(fingerprint: string): Promise<void> {
    const now = Date.now();

    this.db.prepare(`
      UPDATE error_cache
      SET last_seen = ?, occurrences = occurrences + 1
      WHERE fingerprint = ?
    `).run(now, fingerprint);
  }

  /**
   * Mark spec as created for this fingerprint
   */
  async markSpecCreated(fingerprint: string, specPath: string): Promise<void> {
    this.db.prepare(`
      UPDATE error_cache
      SET spec_created = 1, spec_path = ?
      WHERE fingerprint = ?
    `).run(specPath, fingerprint);
  }

  /**
   * Get cache entry
   */
  async get(fingerprint: string): Promise<CacheEntry | null> {
    const row = this.db.prepare(`
      SELECT * FROM error_cache WHERE fingerprint = ?
    `).get(fingerprint) as any;

    if (!row) {
      return null;
    }

    return {
      fingerprint: row.fingerprint,
      errorType: row.error_type,
      filePath: row.file_path,
      firstSeen: new Date(row.first_seen),
      lastSeen: new Date(row.last_seen),
      occurrences: row.occurrences,
      specCreated: row.spec_created === 1,
      specPath: row.spec_path,
    };
  }

  /**
   * Cleanup expired entries (older than TTL)
   */
  async cleanup(): Promise<number> {
    const cutoff = Date.now() - this.ttlMs;

    const result = this.db.prepare(`
      DELETE FROM error_cache WHERE last_seen < ?
    `).run(cutoff);

    return result.changes;
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(spec_created) as specs_created,
        MIN(first_seen) as oldest,
        MAX(last_seen) as newest
      FROM error_cache
    `).get() as any;

    return {
      totalEntries: stats.total,
      specsCreated: stats.specs_created || 0,
      oldestEntry: new Date(stats.oldest || Date.now()),
      newestEntry: new Date(stats.newest || Date.now()),
    };
  }

  /**
   * Get rate limit count for window
   */
  async getRateLimitCount(window: string): Promise<number> {
    const row = this.db.prepare(`
      SELECT specs_created FROM rate_limits WHERE window = ?
    `).get(window) as any;

    return row ? row.specs_created : 0;
  }

  /**
   * Increment rate limit counter for window
   */
  async incrementRateLimit(window: string): Promise<void> {
    const now = Date.now();

    this.db.prepare(`
      INSERT INTO rate_limits (window, specs_created, created_at)
      VALUES (?, 1, ?)
      ON CONFLICT(window) DO UPDATE SET specs_created = specs_created + 1
    `).run(window, now);
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}
