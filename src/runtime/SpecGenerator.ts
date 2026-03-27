import * as fs from 'fs/promises';
import * as path from 'path';
import { ParsedError, GeneratedSpec, Severity } from './types';

/**
 * Generate AUTO-*.md spec files from errors.
 */
export class SpecGenerator {
  private specsDir: string;

  constructor(specsDir: string = '.myintern/specs') {
    this.specsDir = specsDir;
  }

  /**
   * Generate spec file from error
   */
  async generate(
    error: ParsedError,
    fingerprint: string,
    severity: Severity
  ): Promise<GeneratedSpec> {
    const filename = this.generateFilename(error);
    const filePath = path.join(this.specsDir, filename);
    const content = this.generateContent(error, fingerprint, severity);

    // Ensure directory exists
    await fs.mkdir(this.specsDir, { recursive: true });

    // Write spec file
    await fs.writeFile(filePath, content, 'utf-8');

    return {
      filename,
      filePath,
      content,
      error,
      fingerprint,
      severity,
    };
  }

  /**
   * Generate spec filename
   * Format: AUTO-{abbrev}-{file}-{timestamp}.md
   */
  private generateFilename(error: ParsedError): string {
    const abbrev = this.abbreviateErrorType(error.errorType);
    const fileBase = error.fileName.replace(/\.(java|py|ts|js|go|rs)$/, '');
    const timestamp = this.formatTimestamp(error.timestamp);
    return `AUTO-${abbrev}-${fileBase}-${timestamp}.md`;
  }

  /**
   * Abbreviate error type
   */
  private abbreviateErrorType(errorType: string): string {
    const abbrevMap: Record<string, string> = {
      'NullPointerException': 'NPE',
      'SQLException': 'SQL',
      'OutOfMemoryError': 'OOM',
      'TimeoutException': 'TIMEOUT',
      'SecurityException': 'SEC',
      'IOException': 'IO',
    };
    return abbrevMap[errorType] || errorType.substring(0, 10).toUpperCase();
  }

  /**
   * Format timestamp for filename
   * Format: YYYYMMdd-HHmmss
   */
  private formatTimestamp(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth()+1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }

  /**
   * Generate spec content
   */
  private generateContent(
    error: ParsedError,
    fingerprint: string,
    severity: Severity
  ): string {
    const affectedFiles = this.inferAffectedFiles(error);
    const troubleshooting = this.getTroubleshootingNotes(error.errorType);

    return `# BUGFIX: ${error.errorType} in ${error.fileName}.${error.methodName}

**Source:** CloudWatch Logs (${error.logGroup})
**Detected:** ${error.timestamp.toISOString()}
**Severity:** ${severity}
**Type:** bugfix
**Fingerprint:** ${fingerprint.substring(0, 8)}

## Context
Production error detected in ${error.filePath} line ${error.lineNumber}.

**Error Type:** ${error.errorType}
**Method:** ${error.methodName}
**Language:** ${error.language}

**Stack Trace:**
\`\`\`
${this.formatStackTrace(error.stackTrace)}
\`\`\`

## Root Cause Analysis
${this.generateRootCauseAnalysis(error)}

## Acceptance Criteria
- Fix ${error.errorType} in ${error.filePath}:${error.lineNumber}
- Add appropriate null checks / validation
- Add test case reproducing the error
- Verify fix with unit tests

## Files Likely Affected
${affectedFiles.map(f => `- ${f}`).join('\n')}

## Troubleshooting Notes
${troubleshooting}

## Notes
- Auto-generated spec from runtime monitoring (Phase 1)
- Review context before implementing
- Consider edge cases that may trigger same error
- Check related methods for similar patterns
`;
  }

  /**
   * Format stack trace for markdown
   */
  private formatStackTrace(frames: any[]): string {
    return frames.map(f => {
      if (f.className) {
        return `  at ${f.className}.${f.methodName}(${f.filePath}:${f.lineNumber})`;
      } else {
        return `  at ${f.methodName}(${f.filePath}:${f.lineNumber})`;
      }
    }).join('\n');
  }

  /**
   * Infer affected files from stack trace
   */
  private inferAffectedFiles(error: ParsedError): string[] {
    const files = new Set<string>();

    // Add primary file
    files.add(error.filePath);

    // Add files from stack trace (up to 3)
    error.stackTrace.slice(0, 3).forEach(frame => {
      files.add(frame.filePath);
    });

    // Add test file
    const testFile = this.inferTestFile(error.filePath, error.language);
    if (testFile) {
      files.add(testFile);
    }

    return Array.from(files);
  }

  /**
   * Infer test file path
   */
  private inferTestFile(filePath: string, language: string): string | null {
    if (language === 'java') {
      return filePath.replace('/main/', '/test/').replace('.java', 'Test.java');
    } else if (language === 'typescript') {
      return filePath.replace('.ts', '.test.ts');
    } else if (language === 'python') {
      return filePath.replace('.py', '_test.py');
    }
    return null;
  }

  /**
   * Generate root cause analysis based on error type
   */
  private generateRootCauseAnalysis(error: ParsedError): string {
    const analyses: Record<string, string> = {
      'NullPointerException': 'Likely cause: Method called on null object reference. Check for missing null checks or uninitialized variables.',
      'SQLException': 'Likely cause: Database query failed. Check connection, query syntax, or constraints.',
      'OutOfMemoryError': 'Likely cause: Memory leak or excessive object creation. Profile heap usage.',
      'TimeoutException': 'Likely cause: Operation exceeded time limit. Check network, external APIs, or long-running queries.',
      'SecurityException': 'Likely cause: Permission denied or security constraint violated. Check access controls.',
    };

    return analyses[error.errorType] || 'Investigate error context and stack trace for root cause.';
  }

  /**
   * Get troubleshooting notes for error type
   */
  private getTroubleshootingNotes(errorType: string): string {
    const notes: Record<string, string> = {
      'NullPointerException': `
- Add \`Objects.requireNonNull()\` or null checks
- Use Optional<T> for nullable return values
- Initialize variables with default values
`,
      'SQLException': `
- Validate database connection before query
- Use prepared statements to prevent SQL injection
- Check constraints and foreign keys
`,
      'OutOfMemoryError': `
- Profile heap usage with JProfiler or VisualVM
- Increase heap size (-Xmx flag)
- Fix memory leaks (unclosed streams, static collections)
`,
    };

    return notes[errorType] || '- Review error context\n- Add appropriate error handling';
  }
}
