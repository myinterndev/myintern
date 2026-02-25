
import {
  SensitiveDataDetector,
  SensitivityLevel,
  RedactionMode,
  GuardrailsConfig
} from '../SensitiveDataDetector';

describe('SensitiveDataDetector', () => {
  const baseConfig: GuardrailsConfig = {
    enabled: true,
    mode: RedactionMode.MASK,
    stopOnCritical: true,
    categories: {
      pii: true,
      phi: true,
      credentials: true,
      custom: false
    }
  };

  describe('PII Detection', () => {
    it('should detect Social Security Numbers', () => {
      const detector = new SensitiveDataDetector(baseConfig);
      // Use non-safe-pattern SSNs (123-45-6789 is a known dummy, auto-skipped)
      const content = `
        User SSN: 456-78-9012
        Another one: 987-65-4321
      `;

      const result = detector.scan('test.java', content);

      expect(result.violations).toHaveLength(2);
      expect(result.violations[0].pattern).toBe('SSN');
      expect(result.violations[0].level).toBe(SensitivityLevel.BLOCK);
      expect(result.shouldBlock).toBe(true);
    });

    it('should detect credit card numbers', () => {
      const detector = new SensitiveDataDetector(baseConfig);
      const content = `
        Card: 4532-1234-5678-9010
        Another: 5425 2334 3010 9903
      `;

      const result = detector.scan('test.java', content);

      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].pattern).toBe('Credit Card');
      expect(result.shouldBlock).toBe(true);
    });

    it('should detect email addresses (INFO level)', () => {
      const detector = new SensitiveDataDetector(baseConfig);
      // Use non-example.com domain (example.com is a safe pattern)
      const content = 'Contact: john.doe@realcompany.org';

      const result = detector.scan('test.java', content);

      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].pattern).toBe('Email Address');
      expect(result.violations[0].level).toBe(SensitivityLevel.INFO);
      expect(result.shouldBlock).toBe(false); // INFO doesn't block
    });

    it('should detect phone numbers', () => {
      const detector = new SensitiveDataDetector(baseConfig);
      // Use non-555 prefix (555-XXX-XXXX is a reserved safe pattern)
      const content = `
        Phone: (212) 867-5309
        Mobile: +1 312-555-0199
      `;

      const result = detector.scan('test.java', content);

      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].pattern).toBe('Phone Number');
      expect(result.violations[0].level).toBe(SensitivityLevel.WARN);
    });

    it('should detect US passport numbers', () => {
      const detector = new SensitiveDataDetector(baseConfig);
      const content = 'Passport: A12345678';

      const result = detector.scan('test.java', content);

      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].pattern).toBe('US Passport');
      expect(result.shouldBlock).toBe(true);
    });
  });

  describe('PHI Detection (HIPAA)', () => {
    it('should detect Medical Record Numbers', () => {
      const detector = new SensitiveDataDetector(baseConfig);
      const content = `
        Patient MRN: 1234567
        MRN-9876543
      `;

      const result = detector.scan('test.java', content);

      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].pattern).toBe('Medical Record Number');
      expect(result.violations[0].level).toBe(SensitivityLevel.CRITICAL);
      expect(result.shouldBlock).toBe(true);
    });

    it('should detect patient IDs in code', () => {
      const detector = new SensitiveDataDetector(baseConfig);
      const content = `
        patient_id = 12345
        patientId: "67890"
      `;

      const result = detector.scan('test.java', content);

      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].pattern).toBe('Patient ID');
      expect(result.violations[0].category).toBe('phi');
    });

    it('should detect date of birth fields', () => {
      const detector = new SensitiveDataDetector(baseConfig);
      const content = 'dob: "01/15/1980"';

      const result = detector.scan('test.java', content);

      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].pattern).toBe('Date of Birth');
    });

    it('should detect ICD-10 diagnosis codes', () => {
      const detector = new SensitiveDataDetector(baseConfig);
      const content = 'Diagnosis: ICD-10:E11.9';

      const result = detector.scan('test.java', content);

      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].pattern).toBe('Diagnosis Code');
    });
  });

  describe('Credential Detection', () => {
    it('should detect AWS Access Keys', () => {
      const detector = new SensitiveDataDetector(baseConfig);
      const content = 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE';

      const result = detector.scan('test.java', content);

      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].pattern).toBe('AWS Access Key');
      expect(result.violations[0].level).toBe(SensitivityLevel.CRITICAL);
    });

    it('should detect Anthropic API keys', () => {
      const detector = new SensitiveDataDetector(baseConfig);
      const content = 'api_key = "sk-ant-api03-' + 'x'.repeat(92) + '"';

      const result = detector.scan('test.java', content);

      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].pattern).toBe('Anthropic API Key');
    });

    it('should detect OpenAI API keys', () => {
      const detector = new SensitiveDataDetector(baseConfig);
      const content = 'OPENAI_KEY=sk-' + 'x'.repeat(48);

      const result = detector.scan('test.java', content);

      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].pattern).toBe('OpenAI API Key');
    });

    it('should detect private keys', () => {
      const detector = new SensitiveDataDetector(baseConfig);
      const content = '-----BEGIN RSA PRIVATE KEY-----';

      const result = detector.scan('test.java', content);

      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].pattern).toBe('Private Key');
    });

    it('should detect JWT tokens', () => {
      const detector = new SensitiveDataDetector(baseConfig);
      const content = 'token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"';

      const result = detector.scan('test.java', content);

      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].pattern).toBe('JWT Token');
    });

    it('should detect hardcoded passwords', () => {
      const detector = new SensitiveDataDetector(baseConfig);
      const content = 'password: "SuperSecret123!"';

      const result = detector.scan('test.java', content);

      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].pattern).toBe('Password in Code');
    });

    it('should detect database connection strings with credentials', () => {
      const detector = new SensitiveDataDetector(baseConfig);
      // Regex matches (jdbc|postgresql|mysql)://user:password@host format
      const content = 'String url = "postgresql://admin:secret@prodhost:5432/mydb";';

      const result = detector.scan('test.java', content);

      expect(result.violations.length).toBeGreaterThan(0);
      const dbViolation = result.violations.find(v => v.pattern === 'Database Connection String');
      expect(dbViolation).toBeDefined();
    });
  });

  describe('Custom Patterns', () => {
    it('should support custom patterns', () => {
      const config: GuardrailsConfig = {
        ...baseConfig,
        categories: {
          ...baseConfig.categories,
          custom: true
        },
        customPatterns: [
          {
            name: 'Internal Employee ID',
            regex: /\bEMP-\d{6}\b/,
            level: SensitivityLevel.WARN,
            category: 'custom',
            description: 'Company employee ID'
          }
        ]
      };

      const detector = new SensitiveDataDetector(config);
      const content = 'Employee: EMP-123456';

      const result = detector.scan('test.java', content);

      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].pattern).toBe('Internal Employee ID');
      expect(result.violations[0].category).toBe('custom');
    });
  });

  describe('Whitelist', () => {
    it('should skip whitelisted files', () => {
      const config: GuardrailsConfig = {
        ...baseConfig,
        whitelist: ['**/*.test.java', '**/test-data/**']
      };

      const detector = new SensitiveDataDetector(config);
      const content = 'SSN: 456-78-9012';

      const result = detector.scan('src/test/UserServiceTest.test.java', content);

      expect(result.violations).toHaveLength(0);
      expect(result.shouldBlock).toBe(false);
    });

    it('should not skip non-whitelisted files', () => {
      const config: GuardrailsConfig = {
        ...baseConfig,
        whitelist: ['**/*.test.java']
      };

      const detector = new SensitiveDataDetector(config);
      const content = 'SSN: 456-78-9012';

      const result = detector.scan('src/main/UserService.java', content);

      expect(result.violations.length).toBeGreaterThan(0);
    });
  });

  describe('Redaction Modes', () => {
    it('should produce redacted content in MASK mode for non-blocking violations', () => {
      const config: GuardrailsConfig = {
        ...baseConfig,
        mode: RedactionMode.MASK
      };

      const detector = new SensitiveDataDetector(config);
      const content = 'Email: john.doe@realcompany.org';

      const result = detector.scan('test.java', content);

      // Email is INFO level (non-blocking), so redactedContent should be generated
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.shouldBlock).toBe(false);
      expect(result.redactedContent).toBeDefined();
    });

    it('should not produce redacted content for blocking violations', () => {
      const config: GuardrailsConfig = {
        ...baseConfig,
        mode: RedactionMode.MASK
      };

      const detector = new SensitiveDataDetector(config);
      const content = 'SSN: 456-78-9012';

      const result = detector.scan('test.java', content);

      expect(result.shouldBlock).toBe(true);
      expect(result.redactedContent).toBeUndefined();
    });

    it('should produce redacted content in HASH mode for non-blocking violations', () => {
      const config: GuardrailsConfig = {
        ...baseConfig,
        mode: RedactionMode.HASH
      };

      const detector = new SensitiveDataDetector(config);
      const content = 'Email: john.doe@realcompany.org';

      const result = detector.scan('test.java', content);

      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.shouldBlock).toBe(false);
      expect(result.redactedContent).toBeDefined();
    });
  });

  describe('Batch Scanning', () => {
    it('should scan multiple files at once', () => {
      const detector = new SensitiveDataDetector(baseConfig);
      const files = [
        { path: 'file1.java', content: 'SSN: 456-78-9012' },
        { path: 'file2.java', content: 'Email: admin@internalcorp.net' },
        { path: 'file3.java', content: 'Clean file' }
      ];

      const results = detector.scanBatch(files);

      expect(results).toHaveLength(3);
      expect(results[0].violations.length).toBeGreaterThan(0);
      expect(results[1].violations.length).toBeGreaterThan(0);
      expect(results[2].violations).toHaveLength(0);
    });
  });

  describe('Critical Violations', () => {
    it('should identify critical violations', () => {
      const detector = new SensitiveDataDetector(baseConfig);
      const results = detector.scanBatch([
        { path: 'file1.java', content: 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE' }, // CRITICAL
        { path: 'file2.java', content: 'Email: admin@internalcorp.net' } // INFO
      ]);

      expect(detector.hasCriticalViolations(results)).toBe(true);
    });

    it('should not flag non-critical as critical', () => {
      const detector = new SensitiveDataDetector(baseConfig);
      const results = detector.scanBatch([
        { path: 'file1.java', content: 'Email: admin@internalcorp.net' }
      ]);

      expect(detector.hasCriticalViolations(results)).toBe(false);
    });
  });

  describe('Report Generation', () => {
    it('should generate clean report for no violations', () => {
      const detector = new SensitiveDataDetector(baseConfig);
      const results = detector.scanBatch([
        { path: 'file1.java', content: 'Clean code' }
      ]);

      const report = detector.generateReport(results);
      expect(report).toContain('No sensitive data detected');
    });

    it('should generate detailed report for violations', () => {
      const detector = new SensitiveDataDetector(baseConfig);
      const results = detector.scanBatch([
        { path: 'UserService.java', content: 'SSN: 456-78-9012\nEmail: admin@internalcorp.net' }
      ]);

      const report = detector.generateReport(results);
      expect(report).toContain('UserService.java');
      expect(report).toContain('SSN');
      expect(report).toContain('pii');
    });
  });

  describe('Category Filtering', () => {
    it('should skip disabled categories', () => {
      const config: GuardrailsConfig = {
        ...baseConfig,
        categories: {
          pii: false,
          phi: false,
          credentials: true,
          custom: false
        }
      };

      const detector = new SensitiveDataDetector(config);
      const content = `
        SSN: 456-78-9012
        AWS_KEY: AKIAIOSFODNN7EXAMPLE
      `;

      const result = detector.scan('test.java', content);

      // Should only detect AWS key, not SSN (PII disabled)
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].pattern).toBe('AWS Access Key');
    });
  });
});
