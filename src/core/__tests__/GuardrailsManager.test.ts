
import { GuardrailsManager } from '../GuardrailsManager';
import { GuardrailsConfig, RedactionMode, SensitivityLevel } from '../SensitiveDataDetector';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('GuardrailsManager', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create temp directory for test logs
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guardrails-test-'));
  });

  const baseConfig: GuardrailsConfig = {
    enabled: true,
    mode: RedactionMode.MASK,
    stopOnCritical: true,
    interactive: false,
    categories: {
      pii: true,
      phi: true,
      credentials: true,
      custom: false
    }
  };

  describe('validateFiles', () => {
    it('should allow clean files', async () => {
      const manager = new GuardrailsManager(baseConfig);
      const files = [
        { path: 'UserService.java', content: 'public class UserService {}' }
      ];

      const result = await manager.validateFiles(files);

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].violations).toHaveLength(0);
    });

    it('should block on critical violations when stopOnCritical=true', async () => {
      const manager = new GuardrailsManager(baseConfig);
      const files = [
        { path: 'UserService.java', content: 'AWS_KEY=AKIAIOSFODNN7EXAMPLE' }
      ];

      const result = await manager.validateFiles(files);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Critical sensitive data detected');
      expect(result.violations[0].violations[0].level).toBe(SensitivityLevel.CRITICAL);
    });

    it('should allow with redaction for WARN level violations', async () => {
      const manager = new GuardrailsManager(baseConfig);
      const files = [
        { path: 'Contact.java', content: 'Phone: (212) 867-5309' }
      ];

      const result = await manager.validateFiles(files);

      expect(result.allowed).toBe(true);
      expect(result.sanitizedFiles).toBeDefined();
      expect(result.sanitizedFiles!.size).toBeGreaterThan(0);
    });

    it('should bypass when guardrails disabled', async () => {
      const config = { ...baseConfig, enabled: false };
      const manager = new GuardrailsManager(config);
      const files = [
        { path: 'test.java', content: 'SSN: 123-45-6789' }
      ];

      const result = await manager.validateFiles(files);

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should block files with blocking level violations', async () => {
      const manager = new GuardrailsManager(baseConfig);
      const files = [
        { path: 'User.java', content: 'SSN: 456-78-9012' } // BLOCK level (not the safe-pattern dummy SSN)
      ];

      const result = await manager.validateFiles(files);

      expect(result.allowed).toBe(false);
      expect(result.violations[0].shouldBlock).toBe(true);
    });

    it('should provide sanitized files map for allowed violations', async () => {
      const manager = new GuardrailsManager(baseConfig);
      const files = [
        { path: 'Contact.java', content: 'Email: admin@internalcorp.net' } // INFO level (non-blocking)
      ];

      const result = await manager.validateFiles(files);

      expect(result.allowed).toBe(true);
      expect(result.sanitizedFiles).toBeDefined();
      expect(result.sanitizedFiles!.has('Contact.java')).toBe(true);
    });
  });

  describe('Overrides', () => {
    it('should allow adding overrides for false positives', async () => {
      const manager = new GuardrailsManager(baseConfig, tempDir);

      manager.addOverride({
        filePath: 'TestData.java',
        pattern: 'SSN',
        reason: 'Test fixture with dummy SSNs'
      });

      const files = [
        { path: 'TestData.java', content: 'SSN: 456-78-9012' }
      ];

      const result = await manager.validateFiles(files);

      // Override should prevent violation
      expect(result.violations[0].violations).toHaveLength(0);
      expect(result.allowed).toBe(true);
    });

    it('should respect override expiration', async () => {
      const manager = new GuardrailsManager(baseConfig, tempDir);

      // Add expired override
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      manager.addOverride({
        filePath: 'TestData.java',
        pattern: 'SSN',
        reason: 'Expired override',
        expiresAt: yesterday
      });

      const files = [
        { path: 'TestData.java', content: 'SSN: 456-78-9012' }
      ];

      const result = await manager.validateFiles(files);

      // Expired override should not prevent violation
      expect(result.violations[0].violations.length).toBeGreaterThan(0);
    });

    it('should allow removing overrides', async () => {
      const manager = new GuardrailsManager(baseConfig, tempDir);

      manager.addOverride({
        filePath: 'TestData.java',
        pattern: 'SSN',
        reason: 'Temporary override'
      });

      manager.removeOverride('TestData.java', 'SSN');

      const files = [
        { path: 'TestData.java', content: 'SSN: 456-78-9012' }
      ];

      const result = await manager.validateFiles(files);

      // Removed override should allow violation
      expect(result.violations[0].violations.length).toBeGreaterThan(0);
    });

    it('should persist overrides to disk', async () => {
      const manager = new GuardrailsManager(baseConfig, tempDir);

      manager.addOverride({
        filePath: 'TestData.java',
        pattern: 'SSN',
        reason: 'Test override'
      });

      const overridesFile = path.join(tempDir, 'guardrails-overrides.json');
      expect(fs.existsSync(overridesFile)).toBe(true);

      const data = JSON.parse(fs.readFileSync(overridesFile, 'utf-8'));
      expect(Object.keys(data)).toContain('TestData.java:SSN');
    });
  });

  describe('Logging', () => {
    it('should log violations when blocking', async () => {
      const manager = new GuardrailsManager(baseConfig, tempDir);
      const files = [
        { path: 'User.java', content: 'SSN: 456-78-9012' }
      ];

      await manager.validateFiles(files);

      const logFile = path.join(tempDir, 'guardrails.log');
      expect(fs.existsSync(logFile)).toBe(true);

      const logContent = fs.readFileSync(logFile, 'utf-8');
      expect(logContent).toContain('BLOCKED');
      expect(logContent).toContain('User.java');
    });

    it('should log violations when allowing with redaction', async () => {
      const manager = new GuardrailsManager(baseConfig, tempDir);
      const files = [
        { path: 'Contact.java', content: 'Email: john.doe@realcompany.org' }
      ];

      await manager.validateFiles(files);

      const logFile = path.join(tempDir, 'guardrails.log');
      const logContent = fs.readFileSync(logFile, 'utf-8');
      expect(logContent).toContain('ALLOWED_WITH_REDACTION');
    });
  });

  describe('Summary Generation', () => {
    it('should generate clean summary for no violations', async () => {
      const manager = new GuardrailsManager(baseConfig);
      const files = [
        { path: 'Clean.java', content: 'public class Clean {}' }
      ];

      const result = await manager.validateFiles(files);
      const summary = manager.generateSummary(result);

      expect(summary).toContain('0 violations');
    });

    it('should generate detailed summary for violations', async () => {
      const manager = new GuardrailsManager(baseConfig);
      const files = [
        { path: 'User.java', content: 'SSN: 456-78-9012\nAWS_KEY: AKIAIOSFODNN7EXAMPLE' }
      ];

      const result = await manager.validateFiles(files);
      const summary = manager.generateSummary(result);

      expect(summary).toContain('violations');
      expect(summary).toContain('CREDENTIALS');
    });

    it('should show blocked status in summary', async () => {
      const manager = new GuardrailsManager(baseConfig);
      const files = [
        { path: 'User.java', content: 'AWS_KEY=AKIAIOSFODNN7EXAMPLE' } // CRITICAL
      ];

      const result = await manager.validateFiles(files);
      const summary = manager.generateSummary(result);

      expect(summary).toContain('Execution blocked');
      expect(summary).toContain('critical');
    });

    it('should show category breakdown', async () => {
      const manager = new GuardrailsManager(baseConfig);
      const files = [
        {
          path: 'Mixed.java',
          content: 'SSN: 456-78-9012\nMRN-1234567\nAWS_KEY=AKIAIOSFODNN7EXAMPLE'
        }
      ];

      const result = await manager.validateFiles(files);
      const summary = manager.generateSummary(result);

      expect(summary).toContain('PII');
      expect(summary).toContain('CREDENTIALS');
    });
  });
});
