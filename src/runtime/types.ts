/**
 * Phase 1 Runtime Monitoring - Type Definitions
 *
 * Shared types for CloudWatch monitoring, error parsing,
 * deduplication, and spec generation.
 */

export type Language = 'java' | 'python' | 'typescript' | 'go' | 'rust';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type EvaluationAction = 'create_spec' | 'skip' | 'log_only';

/**
 * Raw log event from AWS CloudWatch
 */
export interface LogEvent {
  logGroup: string;
  logStream: string;
  timestamp: number;  // Unix timestamp in milliseconds
  message: string;    // Raw log message
}

/**
 * Parsed error extracted from log message
 */
export interface ParsedError {
  errorType: string;           // "NullPointerException"
  filePath: string;            // "com/example/UserService.java"
  fileName: string;            // "UserService.java"
  lineNumber: number;          // 42
  methodName: string;          // "findById"
  stackTrace: StackFrame[];    // First 5 frames
  timestamp: Date;
  logGroup: string;
  logStream: string;
  language: Language;
  rawMessage: string;          // Original log message
}

/**
 * Single stack trace frame
 */
export interface StackFrame {
  filePath: string;
  lineNumber: number;
  methodName: string;
  className?: string;
}

/**
 * Error fingerprint for deduplication
 */
export interface ErrorFingerprint {
  full: string;       // 64-char SHA256 hash
  short: string;      // First 8 chars
}

/**
 * Deduplication cache entry
 */
export interface CacheEntry {
  fingerprint: string;
  errorType: string;
  filePath: string;
  firstSeen: Date;
  lastSeen: Date;
  occurrences: number;
  specCreated: boolean;
  specPath?: string;
}

/**
 * Severity evaluation result
 */
export interface EvaluationResult {
  action: EvaluationAction;
  severity: Severity;
  reason: string;
  rateLimitHit?: boolean;
}

/**
 * Generated spec metadata
 */
export interface GeneratedSpec {
  filename: string;
  filePath: string;
  content: string;
  error: ParsedError;
  fingerprint: string;
  severity: Severity;
}

/**
 * Daemon status
 */
export interface DaemonStatus {
  running: boolean;
  pid?: number;
  uptime?: number;          // seconds
  specsCreated: number;
  errorsSeen: number;
  errorsDeduplicated: number;
  lastPoll?: Date;
  lastPollTime?: number;    // Unix timestamp (ms) for CloudWatch state persistence
}

/**
 * CloudWatch configuration
 */
export interface CloudWatchConfig {
  enabled: boolean;
  region: string;
  logGroups: string[];
  pollInterval: number;     // seconds
  errorPatterns: ErrorPattern[];
}

/**
 * Error pattern for CloudWatch filtering
 */
export interface ErrorPattern {
  pattern: string;          // Regex or string
  severity: Severity;
}

/**
 * Runtime configuration (from agent.yml)
 */
export interface RuntimeConfig {
  enabled: boolean;
  environment: 'production' | 'staging' | 'development';
  phase: 1 | 2;
  cloudwatch: CloudWatchConfig;
  deduplication: DeduplicationConfig;
  severityRules: SeverityRules;
  rateLimiting: RateLimitingConfig;
}

export interface DeduplicationConfig {
  enabled: boolean;
  window: string;           // "24h", "1d", etc.
  maxSpecsPerError: number;
  cacheBackend: 'sqlite' | 'redis';
  cachePath: string;
}

export interface SeverityRules {
  critical: SeverityRule;
  high: SeverityRule;
  medium: SeverityRule;
  low: SeverityRule;
}

export interface SeverityRule {
  autoFix: boolean;
  requireApproval: boolean;
  maxPerDay: number;
  createSpec?: boolean;     // Optional, default true
}

export interface RateLimitingConfig {
  maxSpecsPerHour: number;
  maxApiCallsPerHour: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  totalEntries: number;
  specsCreated: number;
  oldestEntry: Date;
  newestEntry: Date;
}
