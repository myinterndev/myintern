import { ParsedError, Severity, EvaluationResult, RuntimeConfig } from './types';
import { DeduplicationCache } from './DeduplicationCache';

/**
 * Evaluate error severity and apply rate limiting rules.
 *
 * IMPORTANT: Rate limits are persisted in SQLite via DeduplicationCache
 * to survive daemon restarts.
 */
export class SeverityEvaluator {
  private config: RuntimeConfig;
  private cache: DeduplicationCache;

  constructor(config: RuntimeConfig, cache: DeduplicationCache) {
    this.config = config;
    this.cache = cache;
  }

  /**
   * Evaluate error and determine action
   */
  async evaluate(error: ParsedError): Promise<EvaluationResult> {
    const severity = this.getSeverity(error.errorType);
    const rule = this.config.severityRules[severity];

    // Check if severity threshold is met
    if (!rule.createSpec) {
      return {
        action: 'skip',
        severity,
        reason: `Severity ${severity} is below threshold`,
      };
    }

    // Check rate limits (now async - reads from SQLite)
    if (!(await this.checkHourlyRateLimit())) {
      return {
        action: 'skip',
        severity,
        reason: 'Hourly rate limit exceeded',
        rateLimitHit: true,
      };
    }

    if (!(await this.checkDailyRateLimit(severity))) {
      return {
        action: 'skip',
        severity,
        reason: `Daily rate limit for ${severity} severity exceeded`,
        rateLimitHit: true,
      };
    }

    // Increment counters (now async - writes to SQLite)
    await this.incrementHourlyCounter();
    await this.incrementDailyCounter(severity);

    return {
      action: 'create_spec',
      severity,
      reason: 'Severity and rate limits OK',
    };
  }

  /**
   * Map error type to severity
   */
  private getSeverity(errorType: string): Severity {
    // Critical errors
    if (/OutOfMemoryError|SecurityException|CriticalError/.test(errorType)) {
      return 'critical';
    }

    // High severity errors
    if (/NullPointerException|SQLException|UnauthorizedException/.test(errorType)) {
      return 'high';
    }

    // Medium severity errors
    if (/TimeoutException|IOException|ValidationException/.test(errorType)) {
      return 'medium';
    }

    // Low severity (default)
    return 'low';
  }

  /**
   * Check hourly rate limit
   */
  private async checkHourlyRateLimit(): Promise<boolean> {
    const key = this.getHourlyKey();
    const count = await this.cache.getRateLimitCount(key);
    return count < this.config.rateLimiting.maxSpecsPerHour;
  }

  /**
   * Check daily rate limit for specific severity
   */
  private async checkDailyRateLimit(severity: Severity): Promise<boolean> {
    const key = this.getDailyKey(severity);
    const count = await this.cache.getRateLimitCount(key);
    const maxPerDay = this.config.severityRules[severity].maxPerDay;
    return count < maxPerDay;
  }

  /**
   * Increment hourly counter
   */
  private async incrementHourlyCounter(): Promise<void> {
    const key = this.getHourlyKey();
    await this.cache.incrementRateLimit(key);
  }

  /**
   * Increment daily counter for severity
   */
  private async incrementDailyCounter(severity: Severity): Promise<void> {
    const key = this.getDailyKey(severity);
    await this.cache.incrementRateLimit(key);
  }

  /**
   * Get hourly key (e.g., "2026-03-06-14")
   */
  private getHourlyKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}-${now.getHours()}`;
  }

  /**
   * Get daily key for severity (e.g., "day_20260306_high")
   */
  private getDailyKey(severity: Severity): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `day_${year}${month}${day}_${severity}`;
  }
}
