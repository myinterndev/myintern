import * as crypto from 'crypto';
import { ParsedError, ErrorFingerprint as FingerprintResult } from './types';

/**
 * Generate unique fingerprints for errors to enable deduplication.
 *
 * Uses SHA256 hash of: errorType + normalizedFilePath + methodName
 */
export class ErrorFingerprint {
  /**
   * Generate full 64-char fingerprint
   */
  static generate(error: ParsedError): string {
    const input = this.buildInput(error);
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  /**
   * Generate short 8-char fingerprint for display
   */
  static generateShort(error: ParsedError): string {
    return this.generate(error).substring(0, 8);
  }

  /**
   * Generate both full and short fingerprints
   */
  static generateBoth(error: ParsedError): FingerprintResult {
    const full = this.generate(error);
    return {
      full,
      short: full.substring(0, 8),
    };
  }

  /**
   * Build fingerprint input string
   */
  private static buildInput(error: ParsedError): string {
    const normalizedPath = this.normalizePath(error.filePath);
    return `${error.errorType}|${normalizedPath}|${error.methodName}`;
  }

  /**
   * Normalize file path (remove package prefixes)
   *
   * Examples:
   * - com/example/service/UserService.java → UserService.java
   * - /app/src/services/UserService.ts → UserService.ts
   */
  private static normalizePath(filePath: string): string {
    // Get last component (filename)
    const parts = filePath.split('/');
    return parts[parts.length - 1] || filePath;
  }
}
