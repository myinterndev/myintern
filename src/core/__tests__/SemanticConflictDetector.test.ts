import { SemanticConflictDetector, ConflictReport } from '../SemanticConflictDetector';
import { SpecFile } from '../SpecParser';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('SemanticConflictDetector', () => {
  let tempDir: string;
  let detector: SemanticConflictDetector;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conflict-test-'));
    detector = new SemanticConflictDetector(tempDir);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function writeSpec(filename: string, content: string): string {
    const filePath = path.join(tempDir, filename);
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  function makeSpec(filePath: string, overrides: Partial<SpecFile> = {}): SpecFile {
    return {
      filePath,
      title: 'Test Spec',
      type: 'feature',
      priority: 'high',
      description: 'Test',
      acceptanceCriteria: ['Test'],
      notes: '',
      rawContent: fs.readFileSync(filePath, 'utf-8'),
      ...overrides
    };
  }

  describe('detectConflicts', () => {
    it('should return empty array when no specs overlap', async () => {
      const path1 = writeSpec('spec1.md', `# Feature: User Registration

## Description
Register users

## Acceptance Criteria
- POST /api/register

## Files Likely Affected
- src/main/java/com/example/controller/UserController.java
- src/main/java/com/example/service/UserService.java
`);
      const path2 = writeSpec('spec2.md', `# Feature: Product Catalog

## Description
List products

## Acceptance Criteria
- GET /api/products

## Files Likely Affected
- src/main/java/com/example/controller/ProductController.java
- src/main/java/com/example/service/ProductService.java
`);

      const specs = [makeSpec(path1), makeSpec(path2)];
      const conflicts = await detector.detectConflicts(specs);

      expect(conflicts).toHaveLength(0);
    });

    it('should detect file overlap between two specs', async () => {
      const path1 = writeSpec('spec1.md', `# Feature: User Registration

## Description
Register users

## Acceptance Criteria
- POST /api/register

## Files Likely Affected
- src/main/java/com/example/service/UserService.java
`);
      const path2 = writeSpec('spec2.md', `# Feature: User Login

## Description
Login users

## Acceptance Criteria
- POST /api/login

## Files Likely Affected
- src/main/java/com/example/service/UserService.java
`);

      const specs = [makeSpec(path1), makeSpec(path2)];
      const conflicts = await detector.detectConflicts(specs);

      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts[0].spec1).toBe('spec1.md');
      expect(conflicts[0].spec2).toBe('spec2.md');
    });

    it('should detect method-level conflicts when specs mention same methods', async () => {
      const path1 = writeSpec('spec1.md', `# Feature: Update processOrder

## Description
Change processOrder(Order order) to add logging

## Acceptance Criteria
- public void processOrder(Order order) updated

## Files Likely Affected
- src/main/java/com/example/service/OrderService.java
`);
      const path2 = writeSpec('spec2.md', `# Feature: Extend processOrder

## Description
Extend processOrder(Order order) to support bulk

## Acceptance Criteria
- public void processOrder(Order order) refactored

## Files Likely Affected
- src/main/java/com/example/service/OrderService.java
`);

      const specs = [makeSpec(path1), makeSpec(path2)];
      const conflicts = await detector.detectConflicts(specs);

      const methodConflict = conflicts.find(c => c.conflictType === 'method_signature');
      expect(methodConflict).toBeDefined();
      expect(methodConflict!.severity).toBe('high');
    });

    it('should report file_overlap when files overlap but no method conflicts', async () => {
      const path1 = writeSpec('spec1.md', `# Feature: Add Health Check

## Description
Add health endpoint

## Acceptance Criteria
- GET /admin/health

## Files Likely Affected
- src/main/java/com/example/controller/AdminController.java
`);
      const path2 = writeSpec('spec2.md', `# Feature: Add Metrics

## Description
Add metrics endpoint

## Acceptance Criteria
- GET /admin/metrics

## Files Likely Affected
- src/main/java/com/example/controller/AdminController.java
`);

      const specs = [makeSpec(path1), makeSpec(path2)];
      const conflicts = await detector.detectConflicts(specs);

      expect(conflicts.length).toBeGreaterThan(0);
      const fileOverlap = conflicts.find(c => c.conflictType === 'file_overlap');
      expect(fileOverlap).toBeDefined();
      expect(fileOverlap!.severity).toBe('medium');
    });

    it('should handle single spec without errors', async () => {
      const path1 = writeSpec('spec1.md', `# Feature: Solo

## Description
Only one spec

## Acceptance Criteria
- Test

## Files Likely Affected
- src/main/java/com/example/Service.java
`);

      const specs = [makeSpec(path1)];
      const conflicts = await detector.detectConflicts(specs);

      expect(conflicts).toHaveLength(0);
    });

    it('should handle empty specs array', async () => {
      const conflicts = await detector.detectConflicts([]);
      expect(conflicts).toHaveLength(0);
    });

    it('should detect conflicts across three specs pairwise', async () => {
      const path1 = writeSpec('spec1.md', `# Feature A

## Description
Feature A

## Acceptance Criteria
- Test

## Files Likely Affected
- src/main/java/com/example/SharedService.java
`);
      const path2 = writeSpec('spec2.md', `# Feature B

## Description
Feature B

## Acceptance Criteria
- Test

## Files Likely Affected
- src/main/java/com/example/SharedService.java
`);
      const path3 = writeSpec('spec3.md', `# Feature C

## Description
Feature C

## Acceptance Criteria
- Test

## Files Likely Affected
- src/main/java/com/example/SharedService.java
`);

      const specs = [makeSpec(path1), makeSpec(path2), makeSpec(path3)];
      const conflicts = await detector.detectConflicts(specs);

      // 3 specs all sharing a file → 3 pairwise conflicts (1-2, 1-3, 2-3)
      expect(conflicts.length).toBe(3);
    });

    it('should strip multi-repo prefix from file paths when comparing', async () => {
      const path1 = writeSpec('spec1.md', `# Feature A

## Description
Feature A

## Acceptance Criteria
- Test

## Files Likely Affected
- api-service/src/main/java/com/example/UserService.java
`);
      const path2 = writeSpec('spec2.md', `# Feature B

## Description
Feature B

## Acceptance Criteria
- Test

## Files Likely Affected
- api-service/src/main/java/com/example/UserService.java
`);

      const specs = [makeSpec(path1), makeSpec(path2)];
      const conflicts = await detector.detectConflicts(specs);

      expect(conflicts.length).toBeGreaterThan(0);
    });
  });

  describe('extractFilePaths (via detectConflicts)', () => {
    it('should parse Java file paths from Files Likely Affected section', async () => {
      const path1 = writeSpec('spec1.md', `# Feature

## Description
Test

## Acceptance Criteria
- Test

## Files Likely Affected
- src/main/java/com/example/controller/UserController.java
- src/main/java/com/example/service/UserService.java
- src/main/java/com/example/repository/UserRepository.java
`);
      const path2 = writeSpec('spec2.md', `# Feature

## Description
Test

## Acceptance Criteria
- Test

## Files Likely Affected
- src/main/java/com/example/controller/UserController.java
`);

      const specs = [makeSpec(path1), makeSpec(path2)];
      const conflicts = await detector.detectConflicts(specs);

      expect(conflicts.length).toBe(1);
      // extractFilePaths strips the first path segment as a repo prefix
      expect(conflicts[0].details).toContain('main/java/com/example/controller/UserController.java');
    });

    it('should parse TypeScript file paths', async () => {
      const path1 = writeSpec('spec1.md', `# Feature

## Description
Test

## Acceptance Criteria
- Test

## Files Likely Affected
- src/services/UserService.ts
`);
      const path2 = writeSpec('spec2.md', `# Feature

## Description
Test

## Acceptance Criteria
- Test

## Files Likely Affected
- src/services/UserService.ts
`);

      const specs = [makeSpec(path1), makeSpec(path2)];
      const conflicts = await detector.detectConflicts(specs);

      expect(conflicts.length).toBe(1);
    });

    it('should handle spec with no Files Likely Affected section', async () => {
      const path1 = writeSpec('spec1.md', `# Feature

## Description
Test

## Acceptance Criteria
- Test
`);
      const path2 = writeSpec('spec2.md', `# Feature

## Description
Test

## Acceptance Criteria
- Test
`);

      const specs = [makeSpec(path1), makeSpec(path2)];
      const conflicts = await detector.detectConflicts(specs);

      expect(conflicts).toHaveLength(0);
    });
  });

  describe('summarizeConflicts', () => {
    it('should return success message when no conflicts', () => {
      const summary = detector.summarizeConflicts([]);
      expect(summary).toContain('No semantic conflicts detected');
    });

    it('should include spec names in summary', () => {
      const conflicts: ConflictReport[] = [
        {
          spec1: 'spec-registration.md',
          spec2: 'spec-login.md',
          conflictType: 'method_signature',
          details: ['UserService.java: processUser()'],
          severity: 'high'
        }
      ];

      const summary = detector.summarizeConflicts(conflicts);

      expect(summary).toContain('spec-registration.md');
      expect(summary).toContain('spec-login.md');
      expect(summary).toContain('method_signature');
      expect(summary).toContain('high');
      expect(summary).toContain('processUser()');
    });

    it('should include sequential execution warning', () => {
      const conflicts: ConflictReport[] = [
        {
          spec1: 'a.md',
          spec2: 'b.md',
          conflictType: 'file_overlap',
          details: ['SharedService.java'],
          severity: 'medium'
        }
      ];

      const summary = detector.summarizeConflicts(conflicts);

      expect(summary).toContain('sequentially');
    });

    it('should handle multiple conflicts in summary', () => {
      const conflicts: ConflictReport[] = [
        {
          spec1: 'a.md',
          spec2: 'b.md',
          conflictType: 'method_signature',
          details: ['Service.java: doWork()'],
          severity: 'high'
        },
        {
          spec1: 'b.md',
          spec2: 'c.md',
          conflictType: 'file_overlap',
          details: ['Config.java'],
          severity: 'medium'
        }
      ];

      const summary = detector.summarizeConflicts(conflicts);

      expect(summary).toContain('a.md');
      expect(summary).toContain('b.md');
      expect(summary).toContain('c.md');
      expect(summary).toContain('doWork()');
      expect(summary).toContain('Config.java');
    });
  });

  describe('method conflict detection', () => {
    it('should detect same-name methods as conflicts', async () => {
      const path1 = writeSpec('spec1.md', `# Feature: Update Login

## Description
Update the authenticate(String email, String password) method

## Acceptance Criteria
- authenticate method updated

## Files Likely Affected
- src/main/java/com/example/service/AuthService.java
`);
      const path2 = writeSpec('spec2.md', `# Feature: Refactor Login

## Description
Refactor authenticate(String email, String password) for OAuth

## Acceptance Criteria
- authenticate method refactored

## Files Likely Affected
- src/main/java/com/example/service/AuthService.java
`);

      const specs = [makeSpec(path1), makeSpec(path2)];
      const conflicts = await detector.detectConflicts(specs);

      const methodConflict = conflicts.find(c => c.conflictType === 'method_signature');
      expect(methodConflict).toBeDefined();
      expect(methodConflict!.details.some(d => d.includes('authenticate'))).toBe(true);
    });

    it('should detect Java-style method signatures', async () => {
      const path1 = writeSpec('spec1.md', `# Feature

## Description
public ResponseEntity<User> createUser(UserRequest req) needs update

## Acceptance Criteria
- createUser updated

## Files Likely Affected
- src/main/java/com/example/controller/UserController.java
`);
      const path2 = writeSpec('spec2.md', `# Feature

## Description
public ResponseEntity<User> createUser(UserRequest req) needs refactor

## Acceptance Criteria
- createUser refactored

## Files Likely Affected
- src/main/java/com/example/controller/UserController.java
`);

      const specs = [makeSpec(path1), makeSpec(path2)];
      const conflicts = await detector.detectConflicts(specs);

      const methodConflict = conflicts.find(c => c.conflictType === 'method_signature');
      expect(methodConflict).toBeDefined();
    });
  });
});
