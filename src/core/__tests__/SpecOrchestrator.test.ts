import * as fs from 'fs';
import * as path from 'path';
import { SpecOrchestrator, JiraContext } from '../SpecOrchestrator';
import { SpecFile } from '../SpecParser';

describe('SpecOrchestrator', () => {
  const testRepoPath = path.join(__dirname, 'test-repo');
  const myinternDir = path.join(testRepoPath, '.myintern');
  const specsDir = path.join(myinternDir, 'specs');
  const contextDir = path.join(myinternDir, '.context');

  let orchestrator: SpecOrchestrator;

  beforeEach(() => {
    // Create test directory structure
    if (!fs.existsSync(specsDir)) {
      fs.mkdirSync(specsDir, { recursive: true });
    }

    orchestrator = new SpecOrchestrator(testRepoPath);
  });

  afterEach(() => {
    // Cleanup test directory
    if (fs.existsSync(testRepoPath)) {
      fs.rmSync(testRepoPath, { recursive: true, force: true });
    }
  });

  describe('Global Context Management', () => {
    it('should create hidden .context directory', () => {
      expect(fs.existsSync(contextDir)).toBe(true);
    });

    it('should create .gitignore in context directory', () => {
      const gitignorePath = path.join(contextDir, '.gitignore');
      expect(fs.existsSync(gitignorePath)).toBe(true);

      const content = fs.readFileSync(gitignorePath, 'utf-8');
      expect(content).toContain('*');
      expect(content).toContain('!.gitignore');
    });

    it('should save and load global context', () => {
      const context: JiraContext = {
        jiraTicket: 'JIRA-123',
        summary: 'User authentication',
        context: 'Implement OAuth2 login',
        specs: ['spec-login.md'],
        lastUpdated: new Date().toISOString(),
        status: 'in_progress'
      };

      orchestrator.saveGlobalContext(context);

      const contextFile = path.join(contextDir, 'global-context.json');
      expect(fs.existsSync(contextFile)).toBe(true);

      const loaded = JSON.parse(fs.readFileSync(contextFile, 'utf-8'));
      expect(loaded['JIRA-123']).toEqual(context);
    });

    it('should not persist ephemeral contexts (no Jira ticket)', () => {
      const context: JiraContext = {
        jiraTicket: 'none',
        summary: 'Test',
        context: 'Test context',
        specs: ['spec-test.md'],
        lastUpdated: new Date().toISOString(),
        status: 'in_progress'
      };

      orchestrator.saveGlobalContext(context);

      const contextFile = path.join(contextDir, 'global-context.json');
      expect(fs.existsSync(contextFile)).toBe(false);
    });
  });

  describe('Spec Grouping', () => {
    beforeEach(() => {
      // Create test spec files
      const spec1 = `# Feature: Login
**Jira:** JIRA-123
**Type:** feature
**Priority:** high

## Description
User login with OAuth2

## Acceptance Criteria
- POST /api/login
- Return JWT token
`;

      const spec2 = `# Feature: Token Refresh
**Jira:** JIRA-123
**Type:** feature
**Priority:** high

## Description
Refresh JWT tokens

## Acceptance Criteria
- POST /api/refresh
- Validate old token
`;

      const spec3 = `# Bugfix: Fix logout
**Type:** bugfix
**Priority:** medium

## Description
Fix logout endpoint

## Acceptance Criteria
- DELETE /api/logout
`;

      fs.writeFileSync(path.join(specsDir, 'spec-login.md'), spec1, 'utf-8');
      fs.writeFileSync(path.join(specsDir, 'spec-refresh.md'), spec2, 'utf-8');
      fs.writeFileSync(path.join(specsDir, 'spec-logout.md'), spec3, 'utf-8');
    });

    it('should load all specs from directory', () => {
      const specs = orchestrator.loadAllSpecs();
      expect(specs).toHaveLength(3);
    });

    it('should group specs by Jira ticket', () => {
      const specs = orchestrator.loadAllSpecs();
      const groups = orchestrator.groupSpecsByJira(specs);

      expect(groups).toHaveLength(2); // JIRA-123 + one without Jira

      const jira123Group = groups.find(g => g.jiraTicket === 'JIRA-123');
      expect(jira123Group).toBeDefined();
      expect(jira123Group!.specs).toHaveLength(2);
    });

    it('should find specs by Jira ticket', () => {
      const group = orchestrator.findSpecsByJira('JIRA-123');

      expect(group).toBeDefined();
      expect(group!.specs).toHaveLength(2);
      expect(group!.specs[0].jiraTicket).toBe('JIRA-123');
      expect(group!.specs[1].jiraTicket).toBe('JIRA-123');
    });

    it('should return null for non-existent Jira ticket', () => {
      const group = orchestrator.findSpecsByJira('JIRA-999');
      expect(group).toBeNull();
    });
  });

  describe('Global Context Creation', () => {
    it('should create global context for spec with Jira ticket', () => {
      const spec: SpecFile = {
        filePath: path.join(specsDir, 'spec-test.md'),
        title: 'Feature: User Login',
        type: 'feature',
        priority: 'high',
        jiraTicket: 'JIRA-456',
        description: 'Implement user login with email and password.\nSupport OAuth2 providers.',
        acceptanceCriteria: ['POST /api/login', 'Return JWT token'],
        notes: 'See security guidelines',
        rawContent: '# Feature: User Login\n...'
      };

      const context = orchestrator.getOrCreateGlobalContext(spec);

      expect(context.jiraTicket).toBe('JIRA-456');
      expect(context.summary).toContain('Feature: User Login');
      expect(context.specs).toContain('spec-test.md');
      expect(context.status).toBe('in_progress');
    });

    it('should create ephemeral context for spec without Jira ticket', () => {
      const spec: SpecFile = {
        filePath: path.join(specsDir, 'spec-test.md'),
        title: 'Feature: Test',
        type: 'feature',
        priority: 'medium',
        description: 'Test description',
        acceptanceCriteria: ['Test AC'],
        notes: '',
        rawContent: '# Test\n...'
      };

      const context = orchestrator.getOrCreateGlobalContext(spec);

      expect(context.jiraTicket).toBe('none');
      expect(context.specs).toContain('spec-test.md');
    });

    it('should update existing global context when adding new spec', () => {
      const spec1: SpecFile = {
        filePath: path.join(specsDir, 'spec-login.md'),
        title: 'Feature: Login',
        type: 'feature',
        priority: 'high',
        jiraTicket: 'JIRA-789',
        description: 'User login',
        acceptanceCriteria: ['POST /api/login'],
        notes: '',
        rawContent: '# Login\n...'
      };

      const spec2: SpecFile = {
        filePath: path.join(specsDir, 'spec-logout.md'),
        title: 'Feature: Logout',
        type: 'feature',
        priority: 'high',
        jiraTicket: 'JIRA-789',
        description: 'User logout',
        acceptanceCriteria: ['POST /api/logout'],
        notes: '',
        rawContent: '# Logout\n...'
      };

      const context1 = orchestrator.getOrCreateGlobalContext(spec1);
      orchestrator.saveGlobalContext(context1);

      const context2 = orchestrator.getOrCreateGlobalContext(spec2);

      expect(context2.specs).toContain('spec-login.md');
      expect(context2.specs).toContain('spec-logout.md');
      expect(context2.context).toContain('spec-logout.md');
    });
  });

  describe('Summary Extraction', () => {
    it('should extract concise 3-4 line summary from spec', () => {
      const spec: SpecFile = {
        filePath: path.join(specsDir, 'spec-test.md'),
        title: 'Feature: User Registration',
        type: 'feature',
        priority: 'high',
        jiraTicket: 'JIRA-100',
        description: 'Implement user registration endpoint.\nValidate email and password.\nSend verification email.\nStore user in database.',
        acceptanceCriteria: [
          'POST /api/register',
          'Email validation',
          'Password hashing with BCrypt'
        ],
        notes: '',
        rawContent: '# Test\n...'
      };

      const context = orchestrator.getOrCreateGlobalContext(spec);

      // Should have title + 2 desc lines + 1 AC line = 4 lines max
      const lines = context.summary.split('\n').filter(l => l.trim().length > 0);
      expect(lines.length).toBeLessThanOrEqual(4);
      expect(context.summary).toContain('Feature: User Registration');
      expect(context.summary).toContain('AC:');
    });
  });

  describe('Status Management', () => {
    it('should mark Jira context as completed', () => {
      const context: JiraContext = {
        jiraTicket: 'JIRA-200',
        summary: 'Test',
        context: 'Test context',
        specs: ['spec-test.md'],
        lastUpdated: new Date().toISOString(),
        status: 'in_progress'
      };

      orchestrator.saveGlobalContext(context);
      orchestrator.markCompleted('JIRA-200');

      const contextFile = path.join(contextDir, 'global-context.json');
      const loaded = JSON.parse(fs.readFileSync(contextFile, 'utf-8'));

      expect(loaded['JIRA-200'].status).toBe('completed');
    });
  });

  describe('Formatting for LLM', () => {
    it('should format global context for LLM prompt', () => {
      const context: JiraContext = {
        jiraTicket: 'JIRA-300',
        summary: 'User authentication feature',
        context: 'Implementing OAuth2 login with JWT tokens',
        specs: ['spec-login.md', 'spec-refresh.md'],
        lastUpdated: '2026-02-22T10:00:00Z',
        status: 'in_progress'
      };

      const formatted = orchestrator.formatGlobalContextForPrompt(context);

      expect(formatted).toContain('## Jira Context: JIRA-300');
      expect(formatted).toContain('OAuth2 login');
      expect(formatted).toContain('Related specs:');
      expect(formatted).toContain('spec-login.md');
      expect(formatted).toContain('spec-refresh.md');
    });

    it('should return empty string for null context', () => {
      const formatted = orchestrator.formatGlobalContextForPrompt(null);
      expect(formatted).toBe('');
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      const spec1 = `# Feature: Login
**Jira:** JIRA-400
**Type:** feature
**Priority:** high

## Description
User login

## Acceptance Criteria
- TODO: Implement login
`;

      const spec2 = `# Feature: Logout
**Jira:** JIRA-400
**Type:** feature
**Priority:** high

## Description
User logout - COMPLETED

## Acceptance Criteria
- [x] Implement logout
`;

      fs.writeFileSync(path.join(specsDir, 'spec-login.md'), spec1, 'utf-8');
      fs.writeFileSync(path.join(specsDir, 'spec-logout.md'), spec2, 'utf-8');

      const context: JiraContext = {
        jiraTicket: 'JIRA-400',
        summary: 'Auth',
        context: 'Authentication',
        specs: ['spec-login.md', 'spec-logout.md'],
        lastUpdated: new Date().toISOString(),
        status: 'completed'
      };
      orchestrator.saveGlobalContext(context);
    });

    it('should return accurate statistics', () => {
      const stats = orchestrator.getStats();

      expect(stats.totalSpecs).toBe(2);
      expect(stats.pendingSpecs).toBeGreaterThanOrEqual(1); // spec-login has TODO
      expect(stats.jiraTickets).toBe(1);
      expect(stats.completedJiras).toBe(1);
    });
  });

  describe('Conflict Detection', () => {
    beforeEach(() => {
      // Spec 1: Touches UserController and UserService
      const spec1 = `# Feature: User Registration
**Jira:** JIRA-501
**Type:** feature
**Priority:** high

## Description
Implement user registration endpoint

## Acceptance Criteria
- POST /api/users/register
- Email validation

## Files Likely Affected
- src/main/java/com/example/controller/UserController.java
- src/main/java/com/example/service/UserService.java
`;

      // Spec 2: Also touches UserService (conflict with Spec 1)
      const spec2 = `# Feature: User Login
**Jira:** JIRA-502
**Type:** feature
**Priority:** high

## Description
Implement user login endpoint

## Acceptance Criteria
- POST /api/users/login
- JWT token generation

## Files Likely Affected
- src/main/java/com/example/controller/AuthController.java
- src/main/java/com/example/service/UserService.java
`;

      // Spec 3: No conflicts (different files)
      const spec3 = `# Feature: Product Catalog
**Jira:** JIRA-503
**Type:** feature
**Priority:** medium

## Description
Product listing endpoint

## Acceptance Criteria
- GET /api/products

## Files Likely Affected
- src/main/java/com/example/controller/ProductController.java
- src/main/java/com/example/service/ProductService.java
`;

      // Spec 4 & 5: Same Jira ticket, conflicting files (internal conflict)
      const spec4 = `# Feature: Password Reset Part 1
**Jira:** JIRA-504
**Type:** feature
**Priority:** low

## Description
Password reset request

## Acceptance Criteria
- POST /api/auth/reset-request

## Files Likely Affected
- src/main/java/com/example/service/AuthService.java
`;

      const spec5 = `# Feature: Password Reset Part 2
**Jira:** JIRA-504
**Type:** feature
**Priority:** low

## Description
Password reset confirmation

## Acceptance Criteria
- POST /api/auth/reset-confirm

## Files Likely Affected
- src/main/java/com/example/service/AuthService.java
`;

      fs.writeFileSync(path.join(specsDir, 'spec-registration.md'), spec1, 'utf-8');
      fs.writeFileSync(path.join(specsDir, 'spec-login.md'), spec2, 'utf-8');
      fs.writeFileSync(path.join(specsDir, 'spec-products.md'), spec3, 'utf-8');
      fs.writeFileSync(path.join(specsDir, 'spec-reset-request.md'), spec4, 'utf-8');
      fs.writeFileSync(path.join(specsDir, 'spec-reset-confirm.md'), spec5, 'utf-8');
    });

    it('should detect file conflicts between different Jira groups', async () => {
      const specs = orchestrator.loadAllSpecs();
      const groups = orchestrator.groupSpecsByJira(specs);

      // Find groups for JIRA-501 and JIRA-502
      const group501 = groups.find(g => g.jiraTicket === 'JIRA-501');
      const group502 = groups.find(g => g.jiraTicket === 'JIRA-502');

      expect(group501).toBeDefined();
      expect(group502).toBeDefined();

      // Both should touch UserService.java - this will be detected in execution plan
      const plan = await orchestrator.createExecutionPlan(specs, 3);

      // Groups with conflicts should be in sequential groups
      expect(plan.sequentialGroups.length).toBeGreaterThan(0);
    });

    it('should detect internal conflicts within a Jira group', () => {
      const specs = orchestrator.loadAllSpecs();
      const groups = orchestrator.groupSpecsByJira(specs);

      // Find JIRA-504 group (has 2 specs touching same file)
      const group504 = groups.find(g => g.jiraTicket === 'JIRA-504');

      expect(group504).toBeDefined();
      expect(group504!.specs).toHaveLength(2);
      expect(group504!.conflictingFiles).toBeDefined();
      expect(group504!.conflictingFiles!.size).toBeGreaterThan(0);
      expect(group504!.canRunParallel).toBe(false); // Has internal conflicts
    });

    it('should identify groups that can run in parallel (no conflicts)', () => {
      const specs = orchestrator.loadAllSpecs();
      const groups = orchestrator.groupSpecsByJira(specs);

      // JIRA-503 (Products) should have no conflicts with others
      const group503 = groups.find(g => g.jiraTicket === 'JIRA-503');

      expect(group503).toBeDefined();
      expect(group503!.canRunParallel).toBe(true);
      expect(group503!.conflictingFiles!.size).toBe(0);
    });
  });

  describe('Execution Planning', () => {
    beforeEach(() => {
      // 3 independent specs (no conflicts)
      const spec1 = `# Feature: Feature A
**Jira:** JIRA-601
**Type:** feature
**Priority:** high

## Description
Feature A

## Acceptance Criteria
- Test A

## Files Likely Affected
- src/main/java/com/example/ServiceA.java
`;

      const spec2 = `# Feature: Feature B
**Jira:** JIRA-602
**Type:** feature
**Priority:** high

## Description
Feature B

## Acceptance Criteria
- Test B

## Files Likely Affected
- src/main/java/com/example/ServiceB.java
`;

      const spec3 = `# Feature: Feature C
**Jira:** JIRA-603
**Type:** feature
**Priority:** medium

## Description
Feature C

## Acceptance Criteria
- Test C

## Files Likely Affected
- src/main/java/com/example/ServiceC.java
`;

      fs.writeFileSync(path.join(specsDir, 'spec-feature-a.md'), spec1, 'utf-8');
      fs.writeFileSync(path.join(specsDir, 'spec-feature-b.md'), spec2, 'utf-8');
      fs.writeFileSync(path.join(specsDir, 'spec-feature-c.md'), spec3, 'utf-8');
    });

    it('should create execution plan with parallel groups', async () => {
      const specs = orchestrator.loadAllSpecs();
      const plan = await orchestrator.createExecutionPlan(specs, 3);

      expect(plan).toBeDefined();
      expect(plan.parallelGroups).toBeDefined();
      expect(plan.sequentialGroups).toBeDefined();
      expect(plan.warnings).toBeDefined();

      // With 3 independent specs and max_parallel=3, should have 1 batch of 3
      expect(plan.parallelGroups.length).toBeGreaterThan(0);
    });

    it('should respect max_parallel limit', async () => {
      const specs = orchestrator.loadAllSpecs();
      const plan = await orchestrator.createExecutionPlan(specs, 2); // Max 2 parallel

      // Each batch should have at most 2 groups
      for (const batch of plan.parallelGroups) {
        expect(batch.length).toBeLessThanOrEqual(2);
      }
    });

    it('should warn when many specs lack Jira tickets', async () => {
      // Create 6 specs without Jira tickets
      for (let i = 1; i <= 6; i++) {
        const spec = `# Feature: NoJira${i}
**Type:** feature
**Priority:** medium

## Description
Test ${i}

## Acceptance Criteria
- Test
`;
        fs.writeFileSync(path.join(specsDir, `spec-nojira-${i}.md`), spec, 'utf-8');
      }

      const specs = orchestrator.loadAllSpecs();
      const plan = await orchestrator.createExecutionPlan(specs, 3);

      // Should have warning about missing Jira tickets
      const hasJiraWarning = plan.warnings.some((w: string) => w.includes('Jira tickets'));
      expect(hasJiraWarning).toBe(true);
    });

    it('should warn about file conflicts', async () => {
      // Create 2 specs that conflict
      const spec1 = `# Feature: Conflict A
**Jira:** JIRA-700
**Type:** feature
**Priority:** high

## Description
Test A

## Acceptance Criteria
- Test

## Files Likely Affected
- src/main/java/com/example/SharedService.java
`;

      const spec2 = `# Feature: Conflict B
**Jira:** JIRA-701
**Type:** feature
**Priority:** high

## Description
Test B

## Acceptance Criteria
- Test

## Files Likely Affected
- src/main/java/com/example/SharedService.java
`;

      fs.writeFileSync(path.join(specsDir, 'spec-conflict-a.md'), spec1, 'utf-8');
      fs.writeFileSync(path.join(specsDir, 'spec-conflict-b.md'), spec2, 'utf-8');

      const specs = orchestrator.loadAllSpecs();
      const plan = await orchestrator.createExecutionPlan(specs, 3);

      // Should have warning about conflicts
      const hasConflictWarning = plan.warnings.some((w: string) => w.includes('conflict'));
      expect(hasConflictWarning).toBe(true);
    });
  });
});
