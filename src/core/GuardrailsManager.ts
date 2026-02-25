/**
 * GuardrailsManager - Integrates SensitiveDataDetector with ContextBuilder
 *
 * Pre-flight checks before sending context to LLM:
 * 1. Scan all files for sensitive data
 * 2. Block/redact/warn based on configuration
 * 3. Log violations for audit trail
 * 4. Provide override mechanism for false positives
 */

import { SensitiveDataDetector, DetectionResult, GuardrailsConfig, SensitivityLevel } from './SensitiveDataDetector';
import * as fs from 'fs';
import * as path from 'path';
import simpleGit, { SimpleGit } from 'simple-git';

export interface GuardrailsResult {
  allowed: boolean;
  reason?: string;
  violations: DetectionResult[];
  sanitizedFiles?: Map<string, string>; // filePath -> redacted content
  rescanned?: boolean; // true if overrides were added during interactive mode
}

export interface GuardrailsOverride {
  filePath: string;
  pattern: string;
  reason: string;
  expiresAt?: Date;
}

export class GuardrailsManager {
  private readonly detector: SensitiveDataDetector;
  private readonly config: GuardrailsConfig;
  private readonly overrides: Map<string, GuardrailsOverride[]> = new Map();
  private readonly logPath?: string;
  private readonly interactive: boolean;
  private readonly repoPath: string;

  constructor(config: GuardrailsConfig, logPath?: string, repoPath: string = process.cwd()) {
    this.config = config;
    this.detector = new SensitiveDataDetector(config);
    this.logPath = logPath;
    this.repoPath = repoPath;
    // Default to true for better UX, unless explicitly disabled
    this.interactive = config.interactive !== false;

    if (logPath) {
      this.loadOverrides();
    }
  }

  /**
   * Main entry point: validate files before sending to LLM
   */
  public async validateFiles(
    files: Array<{ path: string; content: string }>
  ): Promise<GuardrailsResult> {
    if (!this.config.enabled) {
      return {
        allowed: true,
        violations: []
      };
    }

    // Scan all files
    const results = this.detector.scanBatch(files);

    // Filter out overridden violations
    const filteredResults = this.applyOverrides(results);

    // Check for critical violations
    const hasCritical = this.detector.hasCriticalViolations(filteredResults);
    if (hasCritical && this.config.stopOnCritical) {
      this.logViolations(filteredResults, 'BLOCKED');
      return {
        allowed: false,
        reason: 'Critical sensitive data detected. Execution stopped.',
        violations: filteredResults
      };
    }

    // Check for blocking violations
    const hasBlocking = filteredResults.some(r => r.shouldBlock);
    if (hasBlocking) {
      // Interactive mode: prompt user to add overrides for false positives
      if (this.interactive) {
        console.log('\n⚠️  Sensitive data detected. These may be false positives.\n');

        let overridesAdded = false;
        for (const result of filteredResults.filter(r => r.shouldBlock)) {
          for (const violation of result.violations.filter(
            v => v.level === SensitivityLevel.BLOCK || v.level === SensitivityLevel.CRITICAL
          )) {
            const override = await this.promptForOverride(result.filePath, violation.pattern);
            if (override) {
              this.addOverride(override);
              overridesAdded = true;
            }
          }
        }

        // Re-scan with new overrides
        if (overridesAdded) {
          const rescannedResults = await this.validateFiles(files);
          return {
            ...rescannedResults,
            rescanned: true
          };
        }
      }

      this.logViolations(filteredResults, 'BLOCKED');
      return {
        allowed: false,
        reason: 'Sensitive data detected in files. Cannot proceed without redaction or override.',
        violations: filteredResults
      };
    }

    // Generate sanitized content for warnings
    const sanitizedFiles = new Map<string, string>();
    filteredResults.forEach(result => {
      if (result.violations.length > 0 && result.redactedContent) {
        sanitizedFiles.set(result.filePath, result.redactedContent);
      }
    });

    this.logViolations(filteredResults, 'ALLOWED_WITH_REDACTION');

    return {
      allowed: true,
      violations: filteredResults,
      sanitizedFiles
    };
  }

  /**
   * Add override for false positive
   */
  public addOverride(override: GuardrailsOverride): void {
    const key = this.getOverrideKey(override.filePath, override.pattern);
    if (!this.overrides.has(key)) {
      this.overrides.set(key, []);
    }
    this.overrides.get(key)!.push(override);

    if (this.logPath) {
      this.saveOverrides();
    }
  }

  /**
   * Remove override
   */
  public removeOverride(filePath: string, pattern: string): void {
    const key = this.getOverrideKey(filePath, pattern);
    this.overrides.delete(key);

    if (this.logPath) {
      this.saveOverrides();
    }
  }

  /**
   * Apply overrides to detection results
   */
  private applyOverrides(results: DetectionResult[]): DetectionResult[] {
    return results.map(result => {
      const violations = result.violations.filter(v => {
        const key = this.getOverrideKey(result.filePath, v.pattern);
        const overrideList = this.overrides.get(key) || [];

        // Check if any non-expired override exists
        const activeOverride = overrideList.find(o => {
          if (!o.expiresAt) return true;
          return o.expiresAt > new Date();
        });

        return !activeOverride; // Keep violation if no active override
      });

      return {
        ...result,
        violations,
        shouldBlock: violations.some(
          v => v.level === SensitivityLevel.BLOCK || v.level === SensitivityLevel.CRITICAL
        )
      };
    });
  }

  /**
   * Log violations to audit file
   */
  private logViolations(results: DetectionResult[], action: 'BLOCKED' | 'ALLOWED_WITH_REDACTION'): void {
    if (!this.logPath) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      action,
      violations: results
        .filter(r => r.violations.length > 0)
        .map(r => ({
          filePath: r.filePath,
          violations: r.violations.map(v => ({
            pattern: v.pattern,
            line: v.line,
            level: v.level,
            category: v.category
          }))
        }))
    };

    const logFile = path.join(this.logPath, 'guardrails.log');
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
  }

  /**
   * Load overrides from disk
   */
  private loadOverrides(): void {
    if (!this.logPath) return;

    const overridesFile = path.join(this.logPath, 'guardrails-overrides.json');
    if (fs.existsSync(overridesFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(overridesFile, 'utf-8'));
        Object.entries(data).forEach(([key, overrides]) => {
          this.overrides.set(
            key,
            (overrides as any[]).map(o => ({
              ...o,
              expiresAt: o.expiresAt ? new Date(o.expiresAt) : undefined
            }))
          );
        });
      } catch (error) {
        console.warn('Failed to load guardrails overrides:', error);
      }
    }
  }

  /**
   * Save overrides to disk
   */
  private saveOverrides(): void {
    if (!this.logPath) return;

    const overridesFile = path.join(this.logPath, 'guardrails-overrides.json');
    const data = Object.fromEntries(this.overrides);
    fs.writeFileSync(overridesFile, JSON.stringify(data, null, 2));
  }

  /**
   * Generate unique key for override
   */
  private getOverrideKey(filePath: string, pattern: string): string {
    return `${filePath}:${pattern}`;
  }

  /**
   * Generate human-readable summary for CLI output
   */
  public generateSummary(result: GuardrailsResult): string {
    if (result.violations.length === 0) {
      return '✅ Guardrails: No sensitive data detected';
    }

    const totalViolations = result.violations.reduce((sum, r) => sum + r.violations.length, 0);
    const criticalCount = result.violations.reduce(
      (sum, r) => sum + r.violations.filter(v => v.level === SensitivityLevel.CRITICAL).length,
      0
    );

    const lines: string[] = [];

    if (result.allowed) {
      lines.push(`⚠️  Guardrails: ${totalViolations} violations detected (redacted)`);
    } else {
      lines.push(`🚫 Guardrails: Execution blocked (${totalViolations} violations)`);
      if (criticalCount > 0) {
        lines.push(`   🔴 ${criticalCount} critical violations require immediate attention`);
      }
    }

    // Show breakdown by category
    const byCategory = new Map<string, number>();
    result.violations.forEach(r => {
      r.violations.forEach(v => {
        byCategory.set(v.category, (byCategory.get(v.category) || 0) + 1);
      });
    });

    byCategory.forEach((count, category) => {
      lines.push(`   - ${category.toUpperCase()}: ${count}`);
    });

    return lines.join('\n');
  }

  /**
   * Interactive override prompt (for CLI)
   */
  public async promptForOverride(
    filePath: string,
    pattern: string
  ): Promise<GuardrailsOverride | null> {
    // Dynamic import to avoid bundling prompts in non-interactive mode
    const prompts = await import('prompts');

    const response = await prompts.default([
      {
        type: 'confirm',
        name: 'isOverride',
        message: `Mark "${pattern}" in ${filePath} as false positive?`,
        initial: false
      },
      {
        type: (prev: boolean) => prev ? 'text' : null,
        name: 'reason',
        message: 'Reason for override:',
        validate: (value: string) => value.length > 0 ? true : 'Reason is required'
      },
      {
        type: (prev: any, values: any) => values.isOverride ? 'text' : null,
        name: 'expires',
        message: 'Expiration date (YYYY-MM-DD, leave blank for permanent):',
        validate: (value: string) => {
          if (!value) return true;
          const date = new Date(value);
          return Number.isNaN(date.getTime()) ? 'Invalid date format' : true;
        }
      }
    ]);

    if (!response.isOverride) {
      return null;
    }

    return {
      filePath,
      pattern,
      reason: response.reason,
      expiresAt: response.expires ? new Date(response.expires) : undefined
    };
  }

  /**
   * Incremental scanning - only scan files changed in current branch
   *
   * NEW in v1.2: Improves performance for large repos by scanning only git diff
   */
  public async validateFilesIncremental(
    files: Array<{ path: string; content: string }>,
    baseBranch: string = 'main'
  ): Promise<GuardrailsResult> {
    if (!this.config.enabled) {
      return {
        allowed: true,
        violations: []
      };
    }

    const git = simpleGit(this.repoPath);

    // Get list of changed files in current branch vs base
    const diff = await git.diff(['--name-only', baseBranch, 'HEAD']);
    const changedFiles = new Set(diff.split('\n').filter(f => f.length > 0));

    // Filter files to only those that have changed
    const filesToScan = files.filter(f => {
      const relativePath = path.relative(this.repoPath, f.path);
      return changedFiles.has(relativePath);
    });

    if (filesToScan.length === 0) {
      return {
        allowed: true,
        violations: []
      };
    }

    console.log(`📊 Incremental scan: ${filesToScan.length}/${files.length} changed files`);

    // Scan only changed files
    return await this.validateFiles(filesToScan);
  }
}
