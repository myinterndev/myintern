import { PracticesParser } from '../PracticesParser';
import * as fs from 'fs';
import * as path from 'path';

describe('PracticesParser', () => {
  const parser = new PracticesParser();
  const testDataDir = path.join(__dirname, 'fixtures');

  beforeAll(() => {
    // Create test fixtures directory
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }

    // Create minimal practices file
    const minimalContent = `# Java

1. Java 21, Spring Boot 3.4.x
2. Follow Controller → Service → Repository pattern
3. Use constructor injection
`;
    fs.writeFileSync(path.join(testDataDir, 'practices-min.md'), minimalContent);

    // Create detailed practices file
    const detailedContent = `# Java

1. Java version: 21
2. Spring Boot version: 3.4.x
3. Follow Controller → Service → Repository pattern
4. Use constructor injection
5. Apply @Transactional on service methods
`;
    fs.writeFileSync(path.join(testDataDir, 'practices.md'), detailedContent);
  });

  afterAll(() => {
    // Cleanup individual test files, but keep fixtures directory
    const filesToClean = ['practices-min.md', 'practices.md', 'bad-practices.md', 'few-rules.md'];
    filesToClean.forEach(file => {
      const filePath = path.join(testDataDir, file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });
  });

  describe('parse', () => {
    it('should parse minimal practices file', () => {
      const filePath = path.join(testDataDir, 'practices-min.md');
      const result = parser.parse(filePath);

      expect(result.language).toBe('Java');
      expect(result.format).toBe('minimal');
      expect(result.rules.length).toBeGreaterThan(0);
      expect(result.rules[0]).toContain('Java 21');
    });

    it('should parse detailed practices file', () => {
      const filePath = path.join(testDataDir, 'practices.md');
      const result = parser.parse(filePath);

      expect(result.language).toBe('Java');
      expect(result.format).toBe('detailed');
      expect(result.rules.length).toBeGreaterThan(0);
      expect(result.rules[0]).toContain('Java version: 21');
    });

    it('should throw error if no # heading found', () => {
      const badContent = `No heading here\n1. Rule one\n`;
      const badPath = path.join(testDataDir, 'bad-practices.md');
      fs.writeFileSync(badPath, badContent);

      expect(() => parser.parse(badPath)).toThrow('must start with # Language heading');

      if (fs.existsSync(badPath)) {
        fs.unlinkSync(badPath);
      }
    });
  });

  describe('detectLanguage', () => {
    it('should detect language from file', () => {
      const filePath = path.join(testDataDir, 'practices.md');
      const language = parser.detectLanguage(filePath);

      expect(language).toBe('Java');
    });
  });

  describe('validate', () => {
    it('should validate valid practices file', () => {
      const filePath = path.join(testDataDir, 'practices.md');
      const practices = parser.parse(filePath);
      const result = parser.validate(practices);

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should fail validation with too few rules', () => {
      const fewRulesContent = `# Java

1. Rule one
2. Rule two
`;
      const fewRulesPath = path.join(testDataDir, 'few-rules.md');
      fs.writeFileSync(fewRulesPath, fewRulesContent);

      const practices = parser.parse(fewRulesPath);
      const result = parser.validate(practices);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Too few rules defined (minimum 5 expected)');

      if (fs.existsSync(fewRulesPath)) {
        fs.unlinkSync(fewRulesPath);
      }
    });
  });

  describe('formatForPrompt', () => {
    it('should format practices for LLM prompt', () => {
      const filePath = path.join(testDataDir, 'practices.md');
      const practices = parser.parse(filePath);
      const formatted = parser.formatForPrompt(practices);

      expect(formatted).toContain('# Coding Practices (Java)');
      expect(formatted).toContain('## Rules to Follow');
      expect(formatted).toContain('1. Java version: 21');
    });
  });
});
