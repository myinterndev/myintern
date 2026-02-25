/**
 * SensitiveDataDetector - Scans code for PII, PHI, credentials before sending to LLM
 *
 * Detects:
 * - PII: SSN, credit cards, emails, phone numbers
 * - PHI: Medical record numbers, patient IDs, diagnoses
 * - Credentials: API keys, passwords, tokens, private keys
 * - Custom patterns: User-defined regex rules
 */

export enum SensitivityLevel {
  INFO = 'info',       // Log but don't block (e.g., email addresses)
  WARN = 'warn',       // Warn but allow with redaction
  BLOCK = 'block',     // Reject entire file
  CRITICAL = 'critical' // Stop execution immediately
}

export enum RedactionMode {
  MASK = 'mask',       // Replace with ***
  HASH = 'hash',       // Replace with SHA256 hash
  SKIP = 'skip',       // Skip file entirely
  NONE = 'none'        // Don't send to LLM (for BLOCK level)
}

export interface SensitivePattern {
  name: string;
  regex: RegExp;
  level: SensitivityLevel;
  category: 'pii' | 'phi' | 'credentials' | 'custom';
  description?: string;
}

export interface DetectionResult {
  filePath: string;
  violations: Violation[];
  shouldBlock: boolean;
  redactedContent?: string;
}

export interface Violation {
  pattern: string;
  match: string;
  line: number;
  column: number;
  level: SensitivityLevel;
  category: string;
}

export interface GuardrailsConfig {
  enabled: boolean;
  mode: RedactionMode;
  stopOnCritical: boolean;
  interactive?: boolean; // Enable interactive override prompts (default: true)
  categories: {
    pii: boolean;
    phi: boolean;
    credentials: boolean;
    custom: boolean;
  };
  customPatterns?: SensitivePattern[];
  whitelist?: string[]; // File paths to skip scanning
}

export class SensitiveDataDetector {
  private config: GuardrailsConfig;
  private patterns: SensitivePattern[];

  /**
   * Safe patterns - legitimate ways to reference sensitive data without exposing it
   * These patterns are checked FIRST to avoid false positives
   */
  private readonly SAFE_PATTERNS = [
    /System\.getenv\(['"]/,                              // Java env vars
    /process\.env\./,                                    // Node.js env vars
    /@Value\(['"]\$\{/,                                  // Spring Boot properties
    /config\.get\(['"]/,                                 // Config lookups
    /\$\{[^}]+\}/,                                       // Template variables ${...}
    /REPLACE_WITH_YOUR_/i,                               // Placeholder text
    /YOUR_.*?_HERE/i,                                    // Placeholder patterns
    /example\.com/,                                      // Example domains
    /test@test\.com/,                                    // Test emails
    /\b123-45-6789\b/,                                   // Well-known dummy SSN
    /\b555-\d{3}-\d{4}\b/,                               // Reserved phone prefix
    /sk-proj-/,                                          // OpenAI project keys (safe in code)
  ];

  constructor(config: GuardrailsConfig) {
    this.config = config;
    this.patterns = this.buildPatternSet();
  }

  /**
   * Check if a line contains safe reference patterns
   */
  private isSafeContext(line: string): boolean {
    return this.SAFE_PATTERNS.some(pattern => pattern.test(line));
  }

  /**
   * Scan file content for sensitive data
   */
  public scan(filePath: string, content: string): DetectionResult {
    // Skip whitelisted files
    if (this.isWhitelisted(filePath)) {
      return {
        filePath,
        violations: [],
        shouldBlock: false
      };
    }

    const violations: Violation[] = [];
    const lines = content.split('\n');

    // Scan each line
    lines.forEach((line, lineIndex) => {
      // Skip lines with safe patterns (env vars, config lookups, placeholders)
      if (this.isSafeContext(line)) {
        return;
      }

      this.patterns.forEach(pattern => {
        // Skip disabled categories
        if (!this.config.categories[pattern.category]) {
          return;
        }

        const matches = line.matchAll(new RegExp(pattern.regex, 'g'));
        for (const match of matches) {
          violations.push({
            pattern: pattern.name,
            match: this.truncateMatch(match[0]),
            line: lineIndex + 1,
            column: match.index || 0,
            level: pattern.level,
            category: pattern.category
          });
        }
      });
    });

    // Determine if file should be blocked
    const shouldBlock = violations.some(
      v => v.level === SensitivityLevel.BLOCK || v.level === SensitivityLevel.CRITICAL
    );

    // Generate redacted content if needed
    const redactedContent = this.config.mode !== RedactionMode.NONE && !shouldBlock
      ? this.redactContent(content, violations)
      : undefined;

    return {
      filePath,
      violations,
      shouldBlock,
      redactedContent
    };
  }

  /**
   * Scan multiple files at once
   */
  public scanBatch(files: Array<{ path: string; content: string }>): DetectionResult[] {
    return files.map(f => this.scan(f.path, f.content));
  }

  /**
   * Check if any critical violations exist
   */
  public hasCriticalViolations(results: DetectionResult[]): boolean {
    return results.some(r =>
      r.violations.some(v => v.level === SensitivityLevel.CRITICAL)
    );
  }

  /**
   * Build pattern set based on enabled categories
   */
  private buildPatternSet(): SensitivePattern[] {
    const patterns: SensitivePattern[] = [];

    // PII Patterns
    if (this.config.categories.pii) {
      patterns.push(
        {
          name: 'SSN',
          regex: /\b\d{3}-\d{2}-\d{4}\b/,
          level: SensitivityLevel.BLOCK,
          category: 'pii',
          description: 'Social Security Number'
        },
        {
          name: 'Credit Card',
          regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/,
          level: SensitivityLevel.BLOCK,
          category: 'pii',
          description: 'Credit card number'
        },
        {
          name: 'Email Address',
          regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
          level: SensitivityLevel.INFO,
          category: 'pii',
          description: 'Email address (informational only)'
        },
        {
          name: 'Phone Number',
          regex: /\b(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/,
          level: SensitivityLevel.WARN,
          category: 'pii',
          description: 'Phone number'
        },
        {
          name: 'US Passport',
          regex: /\b[A-Z]\d{8}\b/,
          level: SensitivityLevel.BLOCK,
          category: 'pii',
          description: 'US Passport number'
        }
      );
    }

    // PHI Patterns (HIPAA compliance)
    if (this.config.categories.phi) {
      patterns.push(
        {
          name: 'Medical Record Number',
          regex: /\b(MRN|mrn)[:\s-]?\d{6,10}\b/i,
          level: SensitivityLevel.CRITICAL,
          category: 'phi',
          description: 'Medical Record Number'
        },
        {
          name: 'Patient ID',
          regex: /\b(patient_id|patientId|PATIENT_ID)[:\s=]\s*["']?\d+["']?/i,
          level: SensitivityLevel.CRITICAL,
          category: 'phi',
          description: 'Patient identifier in code'
        },
        {
          name: 'Date of Birth',
          regex: /\b(dob|dateOfBirth|date_of_birth)[:\s=]\s*["']?\d{2}\/\d{2}\/\d{4}["']?/i,
          level: SensitivityLevel.BLOCK,
          category: 'phi',
          description: 'Date of birth field'
        },
        {
          name: 'Diagnosis Code',
          regex: /\b(ICD-10|ICD10)[:\s-]?[A-Z]\d{2}\.\d{1,3}\b/i,
          level: SensitivityLevel.WARN,
          category: 'phi',
          description: 'ICD-10 diagnosis code'
        }
      );
    }

    // Credential Patterns
    if (this.config.categories.credentials) {
      patterns.push(
        {
          name: 'AWS Access Key',
          regex: /\b(AKIA[0-9A-Z]{16})\b/,
          level: SensitivityLevel.CRITICAL,
          category: 'credentials',
          description: 'AWS Access Key ID'
        },
        {
          name: 'AWS Secret Key',
          regex: /\b([A-Za-z0-9/+=]{40})\b/,
          level: SensitivityLevel.CRITICAL,
          category: 'credentials',
          description: 'Potential AWS Secret Access Key'
        },
        {
          name: 'Anthropic API Key',
          regex: /\b(sk-ant-[a-zA-Z0-9-_]{95,})\b/,
          level: SensitivityLevel.CRITICAL,
          category: 'credentials',
          description: 'Anthropic API key'
        },
        {
          name: 'OpenAI API Key',
          regex: /\b(sk-[a-zA-Z0-9]{48})\b/,
          level: SensitivityLevel.CRITICAL,
          category: 'credentials',
          description: 'OpenAI API key'
        },
        {
          name: 'Private Key',
          regex: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/,
          level: SensitivityLevel.CRITICAL,
          category: 'credentials',
          description: 'Private key header'
        },
        {
          name: 'JWT Token',
          regex: /\beyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\b/,
          level: SensitivityLevel.BLOCK,
          category: 'credentials',
          description: 'JWT token'
        },
        {
          name: 'Password in Code',
          regex: /(password|passwd|pwd)[:\s=]\s*["'][^"'\s]{8,}["']/i,
          level: SensitivityLevel.CRITICAL,
          category: 'credentials',
          description: 'Hardcoded password'
        },
        {
          name: 'Database Connection String',
          regex: /(jdbc|postgresql|mysql):\/\/[^:]+:[^@]+@/i,
          level: SensitivityLevel.CRITICAL,
          category: 'credentials',
          description: 'Database connection with credentials'
        }
      );
    }

    // Add custom patterns
    if (this.config.categories.custom && this.config.customPatterns) {
      patterns.push(...this.config.customPatterns);
    }

    return patterns;
  }

  /**
   * Redact sensitive content based on mode
   */
  private redactContent(content: string, violations: Violation[]): string {
    let redacted = content;

    switch (this.config.mode) {
      case RedactionMode.MASK:
        violations.forEach(v => {
          redacted = redacted.replace(v.match, '***REDACTED***');
        });
        break;

      case RedactionMode.HASH:
        violations.forEach(v => {
          const crypto = require('crypto');
          const hash = crypto.createHash('sha256').update(v.match).digest('hex').substring(0, 16);
          redacted = redacted.replace(v.match, `[HASH:${hash}]`);
        });
        break;

      case RedactionMode.SKIP:
        // Content will be skipped entirely by caller
        break;
    }

    return redacted;
  }

  /**
   * Check if file is whitelisted
   */
  private isWhitelisted(filePath: string): boolean {
    if (!this.config.whitelist) return false;

    return this.config.whitelist.some(pattern => {
      // Support glob-like patterns
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(filePath);
    });
  }

  /**
   * Truncate match for logging (don't expose full sensitive data)
   */
  private truncateMatch(match: string): string {
    if (match.length <= 10) {
      return '***';
    }
    return `${match.substring(0, 3)}...${match.substring(match.length - 3)}`;
  }

  /**
   * Generate human-readable report
   */
  public generateReport(results: DetectionResult[]): string {
    const totalViolations = results.reduce((sum, r) => sum + r.violations.length, 0);

    if (totalViolations === 0) {
      return '✅ No sensitive data detected';
    }

    const lines: string[] = [
      `⚠️  Sensitive Data Detection Report`,
      `Found ${totalViolations} potential violations in ${results.length} files`,
      ''
    ];

    results.forEach(result => {
      if (result.violations.length > 0) {
        lines.push(`📄 ${result.filePath}`);
        result.violations.forEach(v => {
          const icon = this.getLevelIcon(v.level);
          lines.push(`  ${icon} Line ${v.line}: ${v.pattern} (${v.category})`);
        });
        lines.push('');
      }
    });

    return lines.join('\n');
  }

  private getLevelIcon(level: SensitivityLevel): string {
    switch (level) {
      case SensitivityLevel.INFO: return 'ℹ️';
      case SensitivityLevel.WARN: return '⚠️';
      case SensitivityLevel.BLOCK: return '🚫';
      case SensitivityLevel.CRITICAL: return '🔴';
    }
  }
}
