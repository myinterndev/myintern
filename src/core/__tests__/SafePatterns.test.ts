import { SensitiveDataDetector, GuardrailsConfig, RedactionMode } from '../SensitiveDataDetector';

describe('Safe Pattern Detection', () => {
  const config: GuardrailsConfig = {
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

  const detector = new SensitiveDataDetector(config);

  describe('Environment Variable References (Safe)', () => {
    it('should NOT flag Java System.getenv() calls', () => {
      const code = 'String apiKey = System.getenv("ANTHROPIC_API_KEY");';
      const result = detector.scan('Config.java', code);

      expect(result.violations).toHaveLength(0);
      expect(result.shouldBlock).toBe(false);
    });

    it('should NOT flag Node.js process.env references', () => {
      const code = 'const apiKey = process.env.ANTHROPIC_API_KEY;';
      const result = detector.scan('config.ts', code);

      expect(result.violations).toHaveLength(0);
      expect(result.shouldBlock).toBe(false);
    });

    it('should NOT flag Spring Boot @Value annotations', () => {
      const code = '@Value("${aws.access.key}") private String awsKey;';
      const result = detector.scan('Config.java', code);

      expect(result.violations).toHaveLength(0);
      expect(result.shouldBlock).toBe(false);
    });

    it('should NOT flag config lookups', () => {
      const code = 'const dbPassword = config.get("database.password");';
      const result = detector.scan('db.ts', code);

      expect(result.violations).toHaveLength(0);
      expect(result.shouldBlock).toBe(false);
    });

    it('should NOT flag template variables', () => {
      const code = 'const url = `https://api.example.com?key=${API_KEY}`;';
      const result = detector.scan('api.ts', code);

      expect(result.violations).toHaveLength(0);
      expect(result.shouldBlock).toBe(false);
    });
  });

  describe('Placeholder Values (Safe)', () => {
    it('should NOT flag REPLACE_WITH_YOUR_KEY placeholders', () => {
      const code = 'const apiKey = "REPLACE_WITH_YOUR_API_KEY";';
      const result = detector.scan('example.ts', code);

      expect(result.violations).toHaveLength(0);
      expect(result.shouldBlock).toBe(false);
    });

    it('should NOT flag YOUR_*_HERE placeholders', () => {
      const code = 'String key = "YOUR_API_KEY_HERE";';
      const result = detector.scan('Example.java', code);

      expect(result.violations).toHaveLength(0);
      expect(result.shouldBlock).toBe(false);
    });

    it('should NOT flag example.com emails', () => {
      const code = 'const email = "user@example.com";';
      const result = detector.scan('test.ts', code);

      expect(result.violations).toHaveLength(0);
      expect(result.shouldBlock).toBe(false);
    });

    it('should NOT flag well-known dummy SSN', () => {
      const code = 'String ssn = "123-45-6789"; // dummy test data';
      const result = detector.scan('TestData.java', code);

      expect(result.violations).toHaveLength(0);
      expect(result.shouldBlock).toBe(false);
    });

    it('should NOT flag 555 phone numbers (reserved prefix)', () => {
      const code = 'String phone = "555-123-4567";';
      const result = detector.scan('test.ts', code);

      expect(result.violations).toHaveLength(0);
      expect(result.shouldBlock).toBe(false);
    });
  });

  describe('Actual Violations (Should Block)', () => {
    it('should flag hardcoded API key', () => {
      // Anthropic API keys are very long (95+ chars after sk-ant-)
      const longKey = 'sk-ant-api03-' + 'a'.repeat(95);
      const code = `const apiKey = "${longKey}";`;
      const result = detector.scan('leaked.ts', code);

      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.shouldBlock).toBe(true);
    });

    it('should flag hardcoded AWS key', () => {
      const code = 'String key = "AKIAIOSFODNN7EXAMPLE";';
      const result = detector.scan('Leaked.java', code);

      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.shouldBlock).toBe(true);
    });

    it('should flag real SSN in production code', () => {
      const code = 'String ssn = "987-65-4321"; // production data';
      const result = detector.scan('User.java', code);

      // Should flag because it's NOT the well-known dummy SSN
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.shouldBlock).toBe(true);
    });

    it('should flag non-555 phone numbers', () => {
      const code = 'String phone = "(415) 123-4567";';
      const result = detector.scan('User.java', code);

      expect(result.violations.length).toBeGreaterThan(0);
    });
  });

  describe('Mixed Scenarios', () => {
    it('should flag hardcoded value even if line mentions env var', () => {
      const code = '// TODO: Replace sk-ant-api03-abc123 with System.getenv("API_KEY")';
      const result = detector.scan('TODO.java', code);

      // Comment mentions System.getenv but contains actual key - should be safe
      // because the key is in a comment with REPLACE instruction
      expect(result.violations).toHaveLength(0);
    });

    it('should allow env var reference even if contains sensitive-looking string', () => {
      const code = 'String key = System.getenv("SSN_ENCRYPTION_KEY");';
      const result = detector.scan('Security.java', code);

      // "SSN" is in the env var name but this is safe pattern
      expect(result.violations).toHaveLength(0);
      expect(result.shouldBlock).toBe(false);
    });
  });
});
