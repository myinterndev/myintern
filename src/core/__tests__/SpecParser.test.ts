import { SpecParser } from '../SpecParser';
import * as fs from 'fs';
import * as path from 'path';

describe('SpecParser', () => {
  const parser = new SpecParser();
  const testDataDir = path.join(__dirname, 'fixtures');

  beforeAll(() => {
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }

    // Create new format spec file
    const newFormatContent = `# User Registration Endpoint

**Jira:** AUTH-123
**Type:** feature
**Priority:** high

---

## Description

Implement a REST API endpoint for user registration with email validation and password hashing.

The endpoint should accept user data, validate the email format, hash the password using BCrypt, and store the user in the database.

---

## Acceptance Criteria

- [ ] POST /api/users/register endpoint created
- [ ] Email validation implemented
- [ ] Password hashing with BCrypt
- [ ] Unit tests with 80%+ coverage
- [ ] No build errors

---

## Notes

Follow Controller → Service → Repository pattern.
`;
    fs.writeFileSync(path.join(testDataDir, 'spec-new-format.md'), newFormatContent);

    // Create legacy format spec file (for backward compatibility)
    const legacyContent = `# FEATURE: User Login

## Type
feature

## Priority
medium

## Context
REST API for user login with JWT token generation.

## Acceptance Criteria
- POST /api/users/login
- JWT token response
- Unit tests

## Files Likely Affected
- src/main/java/com/example/controller/AuthController.java
- src/main/java/com/example/service/AuthService.java

## Notes
Use Spring Security.
`;
    fs.writeFileSync(path.join(testDataDir, 'spec-legacy-format.md'), legacyContent);
  });

  afterAll(() => {
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true });
    }
  });

  describe('parse - new format', () => {
    it('should parse new inline format spec', () => {
      const filePath = path.join(testDataDir, 'spec-new-format.md');
      const result = parser.parse(filePath);

      expect(result.title).toBe('User Registration Endpoint');
      expect(result.jiraTicket).toBe('AUTH-123');
      expect(result.type).toBe('feature');
      expect(result.priority).toBe('high');
      expect(result.description).toContain('REST API endpoint');
      expect(result.acceptanceCriteria.length).toBeGreaterThan(0);
      expect(result.acceptanceCriteria[0]).toContain('POST /api/users/register');
      expect(result.notes).toContain('Controller → Service → Repository');
    });
  });

  describe('parse - legacy format', () => {
    it('should parse legacy format with ## sections', () => {
      const filePath = path.join(testDataDir, 'spec-legacy-format.md');
      const result = parser.parse(filePath);

      expect(result.title).toBe('FEATURE: User Login');
      expect(result.type).toBe('feature');
      expect(result.priority).toBe('medium');
      expect(result.description).toContain('REST API for user login');
      expect(result.acceptanceCriteria.length).toBeGreaterThan(0);
      expect(result.filesAffected).toBeDefined();
      expect(result.filesAffected?.length).toBeGreaterThan(0);
    });
  });

  describe('validate', () => {
    it('should validate valid spec file', () => {
      const filePath = path.join(testDataDir, 'spec-new-format.md');
      const spec = parser.parse(filePath);
      const result = parser.validate(spec);

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should fail validation with missing description', () => {
      const badContent = `# Bad Spec

**Type:** feature
**Priority:** low

## Acceptance Criteria
- [ ] Do something
`;
      const badPath = path.join(testDataDir, 'spec-bad.md');
      fs.writeFileSync(badPath, badContent);

      const spec = parser.parse(badPath);
      const result = parser.validate(spec);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Description section missing or too short');

      fs.unlinkSync(badPath);
    });
  });

  describe('formatForPrompt', () => {
    it('should format spec with jira ticket for LLM prompt', () => {
      const filePath = path.join(testDataDir, 'spec-new-format.md');
      const spec = parser.parse(filePath);
      const formatted = parser.formatForPrompt(spec);

      expect(formatted).toContain('# User Registration Endpoint');
      expect(formatted).toContain('**Jira:** AUTH-123');
      expect(formatted).toContain('**Type:** feature');
      expect(formatted).toContain('## Description');
      expect(formatted).toContain('## Acceptance Criteria');
    });
  });
});
