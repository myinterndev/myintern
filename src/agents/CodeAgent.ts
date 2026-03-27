import * as chokidar from 'chokidar';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { Agent } from '../core/Agent';
import { ConfigManager, AgentConfig } from '../core/ConfigManager';
import { SpecParser } from '../core/SpecParser';
import { SpecOrchestrator } from '../core/SpecOrchestrator';
import { ContextBuilder } from '../core/ContextBuilder';
import { ContextFileLoader } from '../core/ContextFileLoader';
import { SafetyRules } from '../core/SafetyRules';
import { RetryOrchestrator } from '../core/RetryOrchestrator';
import { AIProviderFactory } from '../integrations/ai/AIProviderFactory';
import { AIProvider } from '../integrations/ai/AIProvider';
import { BuildAgent } from '../integrations/build/BuildAgent';
import { TestAgent } from '../agents/TestAgent';
import { DryRunPreview } from '../core/DryRunPreview';
import { RollbackManager } from '../core/RollbackManager';
import { FeedbackLoop } from '../core/FeedbackLoop';
import { SpringBootDetector } from '../core/SpringBootDetector';
import { AuditLogger } from '../core/AuditLogger';
import { ReviewAgent } from '../agents/ReviewAgent';
import { PRManager } from '../integrations/git/PRManager';
import { GitHubMCPClient, GitHubMCPConfig } from '../integrations/mcp/GitHubMCPClient';
import { GitHubLifecycle } from '../integrations/github/GitHubLifecycle';

/**
 * Code Agent - Java/Spring Boot Code Generation
 *
 * Integrates all components:
 * - ContextBuilder for smart file selection
 * - SpecParser for structured specs
 * - SafetyRules for protected branches, etc.
 * - RetryOrchestrator for auto-fix loop
 * - AIProvider for code generation
 * - BuildAgent for compilation
 * - TestAgent for test generation
 */
export class CodeAgent extends Agent {
  private watcher: chokidar.FSWatcher | null = null;
  private readonly agentConfig: AgentConfig;
  private readonly aiProvider: AIProvider;
  private readonly configManager: ConfigManager;
  private readonly specOrchestrator: SpecOrchestrator;
  private readonly repoPath: string;
  private readonly dryRunPreview: DryRunPreview;
  private readonly rollbackManager: RollbackManager;
  private readonly feedbackLoop: FeedbackLoop;
  private readonly springBootDetector: SpringBootDetector;
  private readonly verbose: boolean;
  private readonly auditLogger: AuditLogger;

  constructor(options: { verbose?: boolean } = {}) {
    super('code-agent');
    this.repoPath = process.cwd();
    this.configManager = new ConfigManager(this.repoPath);
    this.agentConfig = this.configManager.load();
    this.aiProvider = AIProviderFactory.create(this.agentConfig);
    this.specOrchestrator = new SpecOrchestrator(this.repoPath);
    this.dryRunPreview = new DryRunPreview(this.repoPath);
    this.rollbackManager = new RollbackManager(this.repoPath);
    this.feedbackLoop = new FeedbackLoop(this.repoPath);
    this.springBootDetector = new SpringBootDetector(this.repoPath);
    this.verbose = options.verbose || false;
    this.auditLogger = new AuditLogger(this.repoPath);
  }

  private pendingSpecs: Set<string> = new Set();
  private processingTimer: NodeJS.Timeout | null = null;

  /** Git config with defaults so minimal agent.yml (e.g. in tests) does not cause undefined access. */
  private get gitConfig() {
    const defaultGit = ConfigManager.getDefaultConfig().git;
    return this.agentConfig.git ? { ...defaultGit, ...this.agentConfig.git } : defaultGit;
  }

  async start(): Promise<void> {
    this.log('Starting Code Agent (Java/Spring Boot)...', 'info');
    this.running = true;

    // Validate config
    const { valid, errors } = this.configManager.validate();
    if (!valid) {
      console.log(chalk.red('\n❌ Invalid configuration:'));
      errors.forEach(err => console.log(chalk.red(`   - ${err}`)));
      throw new Error('Invalid configuration. Fix errors in .myintern/agent.yml');
    }

    console.log(chalk.green('✅ Configuration valid'));
    console.log(chalk.gray(`   Provider: ${this.agentConfig.llm.provider}`));
    console.log(chalk.gray(`   Model: ${this.agentConfig.llm.model}`));
    console.log(chalk.gray(`   Java: ${this.agentConfig.java.version}`));
    console.log(chalk.gray(`   Build: ${this.agentConfig.build.tool}`));
    console.log(chalk.gray(`   Max Parallel: ${this.agentConfig.agents.max_parallel || 3}`));

    // Setup watcher
    const watchPaths = (this.agentConfig.watch.paths || []).map(p => path.join(this.repoPath, p));

    this.watcher = chokidar.watch(watchPaths, {
      ignored: (this.agentConfig.watch.ignore || []).map(p => path.join(this.repoPath, p)),
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: this.agentConfig.watch.debounce_ms,
        pollInterval: 100
      }
    });

    this.watcher.on('add', (filePath) => this.queueSpecFile(filePath));
    this.watcher.on('change', (filePath) => this.queueSpecFile(filePath));

    console.log(chalk.green('\n✅ Code Agent started'));
    console.log(chalk.gray(`   Watching: ${(this.agentConfig.watch.paths || []).join(', ')}`));
    console.log(chalk.gray('   Waiting for spec files...\n'));
  }

  /**
   * Queue a spec file for batch processing
   * Multiple specs detected within debounce window will be processed together
   */
  private queueSpecFile(filePath: string): void {
    // Only process spec-*.md files in specs directory
    if (!filePath.endsWith('.md') || !filePath.includes('specs')) {
      return;
    }

    const fileName = path.basename(filePath);
    if (!fileName.startsWith('spec-')) {
      return;
    }

    // Invalidate cache for changed file
    this.specOrchestrator.invalidateSpecCache(filePath);

    this.pendingSpecs.add(filePath);

    // Reset processing timer
    if (this.processingTimer) {
      clearTimeout(this.processingTimer);
    }

    // Process after debounce period
    this.processingTimer = setTimeout(() => {
      this.processBatchedSpecs();
    }, this.agentConfig.watch.debounce_ms);
  }

  /**
   * Process all pending specs with conflict-aware parallel execution
   */
  private async processBatchedSpecs(): Promise<void> {
    if (this.pendingSpecs.size === 0) return;

    const specPaths = Array.from(this.pendingSpecs);
    this.pendingSpecs.clear();

    await this.processSpecsInternal(specPaths);
  }

  /**
   * Public entry point for one-off/batch spec processing (used by CLI run --spec/--all)
   *
   * This reuses the same conflict-aware execution plan as the watcher-based flow,
   * but operates on an explicit list of spec file paths instead of the internal queue.
   */
  async processSpecsOnce(specPaths: string[]): Promise<void> {
    if (!specPaths || specPaths.length === 0) {
      return;
    }

    await this.processSpecsInternal(specPaths);
  }

  /**
   * Core implementation for batch spec processing used by both the watcher
   * debounce path and the explicit CLI-driven path.
   */
  private async processSpecsInternal(specPaths: string[]): Promise<void> {
    console.log(chalk.blue(`\n📦 Processing ${specPaths.length} spec file(s)...\n`));

    try {
      // Parse all specs
      const parser = new SpecParser();
      const parsedSpecs = specPaths.map(p => parser.parse(p));

      // Show which specs were detected
      for (const spec of parsedSpecs) {
        const fileName = path.basename(spec.filePath);
        const hasPending = parser.hasPendingWork(spec, this.repoPath);
        console.log(chalk.gray(`   📄 ${fileName}: ${hasPending ? 'pending work found' : 'no pending work'}`));
      }

      const specs = parsedSpecs.filter(spec => parser.hasPendingWork(spec, this.repoPath));

      if (specs.length === 0) {
        console.log(chalk.yellow('\n   ⚠️  No specs with pending work (add TODO, PENDING, IMPLEMENT, or - [ ] to trigger)\n'));
        return;
      }

      // Create execution plan with conflict detection
      const maxParallel = this.agentConfig.agents.max_parallel || 3;
      const plan = await this.specOrchestrator.createExecutionPlan(specs, maxParallel);

      // Display warnings
      if (plan.warnings.length > 0) {
        console.log(chalk.yellow('⚠️  Execution Plan Warnings:\n'));
        plan.warnings.forEach(w => console.log(chalk.yellow(w + '\n')));
      }

      // Display execution strategy
      console.log(chalk.blue(`📋 Execution Plan:`));
      console.log(chalk.gray(`   Parallel batches: ${plan.parallelGroups.length}`));
      console.log(chalk.gray(`   Sequential groups: ${plan.sequentialGroups.length}`));
      console.log(chalk.gray(`   Total specs: ${specs.length}\n`));

      // Execute parallel groups (batches of non-conflicting groups)
      for (let i = 0; i < plan.parallelGroups.length; i++) {
        const batch = plan.parallelGroups[i];
        console.log(chalk.blue(`\n🚀 Parallel Batch ${i + 1}/${plan.parallelGroups.length} (${batch.length} groups)`));

        await Promise.all(
          batch.map(group => this.processSpecGroup(group))
        );
      }

      // Execute sequential groups (groups with conflicts)
      if (plan.sequentialGroups.length > 0) {
        console.log(chalk.blue(`\n⏭️  Sequential Groups (${plan.sequentialGroups.length})`));

        for (const group of plan.sequentialGroups) {
          await this.processSpecGroup(group);
        }
      }

      console.log(chalk.green(`\n✨ Batch processing complete!\n`));

    } catch (error: any) {
      console.log(chalk.red(`\n❌ Batch processing error: ${error.message}\n`));
      this.log(`Batch processing error: ${error.message}`, 'error');
    }
  }

  /**
   * Process a group of specs (specs within same Jira ticket run sequentially)
   */
  private async processSpecGroup(group: any): Promise<void> {
    const groupLabel = group.jiraTicket.startsWith('no-jira-')
      ? path.basename(group.specs[0].filePath)
      : group.jiraTicket;

    console.log(chalk.blue(`\n  📁 Group: ${groupLabel} (${group.specs.length} spec(s))`));

    for (const spec of group.specs) {
      await this.handleSpecFile(spec.filePath);
    }
  }

  async stop(): Promise<void> {
    this.log('Stopping Code Agent...', 'info');
    if (this.watcher) {
      await this.watcher.close();
    }
    this.running = false;
    console.log(chalk.yellow('Code Agent stopped'));
  }

  private async handleSpecFile(filePath: string): Promise<void> {
    // Only process spec-*.md files in specs directory
    if (!filePath.endsWith('.md') || !filePath.includes('specs')) {
      return;
    }

    const fileName = path.basename(filePath);

    // Enforce naming convention: spec-*.md
    if (!fileName.startsWith('spec-')) {
      console.log(chalk.yellow(`⚠️  Skipping ${fileName} - spec files must start with "spec-" prefix`));
      return;
    }

    console.log(chalk.blue(`\n📋 Detected spec file: ${fileName}`));

    try {
      // Step 1: Parse spec
      const parser = new SpecParser();
      const spec = parser.parse(filePath);

      console.log(chalk.blue(`   Title: ${spec.title}`));
      console.log(chalk.gray(`   Type: ${spec.type} | Priority: ${spec.priority}`));
      if (spec.jiraTicket) {
        console.log(chalk.gray(`   Jira: ${spec.jiraTicket}`));
      }

      // Check if has pending work
      if (!parser.hasPendingWork(spec, this.repoPath)) {
        console.log(chalk.gray('   ✓ No pending work, skipping\n'));
        return;
      }

      // Step 2: Get or create global context
      const jiraContext = this.specOrchestrator.getOrCreateGlobalContext(spec);
      this.specOrchestrator.saveGlobalContext(jiraContext);

      if (jiraContext.specs.length > 1) {
        console.log(chalk.blue(`   📎 Related specs: ${jiraContext.specs.join(', ')}`));
      }

      // Step 3: Validate spec
      const { valid, errors } = parser.validate(spec);
      if (!valid) {
        console.log(chalk.red('   ❌ Invalid spec:'));
        errors.forEach(err => console.log(chalk.red(`      - ${err}`)));
        return;
      }

      // Step 3: Safety checks
      const safety = new SafetyRules(this.repoPath, this.gitConfig.protected_branches);

      await safety.warnIfDirty();

      const { safe: isSafe, errors: safetyErrors } = await safety.validatePreOperation();
      if (!isSafe) {
        console.log(chalk.red('   ⛔ Safety check failed:'));
        safetyErrors.forEach(err => console.log(chalk.red(`      - ${err}`)));
        return;
      }

      // Step 4: Ensure we're on a safe branch (config-driven)
      const suggestedBranchName = `${spec.type}-${fileName.replace('.md', '')}`;
      const workingBranch = await safety.ensureSafeBranch({
        auto_branch: this.gitConfig.auto_branch,
        branch_prefix: this.gitConfig.branch_prefix,
        suggested_name: suggestedBranchName
      });

      if (this.gitConfig.auto_branch) {
        console.log(chalk.green(`   ✓ Working on branch: ${workingBranch}`));
      } else {
        console.log(chalk.green(`   ✓ Using current branch: ${workingBranch}`));
      }

      // Step 5: Detect Spring Boot version
      const springBootVersion = await this.springBootDetector.detect();
      console.log(chalk.gray(`   Spring Boot: ${springBootVersion.version} (${springBootVersion.useJakarta ? 'jakarta.*' : 'javax.*'})`));

      // Step 6: Build context with practices, global context, and feedback
      console.log(chalk.blue('   🔍 Building context...'));

      // Show which context files are being loaded
      const contextFileLoader = new ContextFileLoader(this.repoPath);
      const contextSummary = contextFileLoader.getContextSummary('java');
      if (contextSummary.length > 0) {
        console.log(chalk.gray('   📚 Loading context from:'));
        contextSummary.forEach(ctx => {
          console.log(chalk.gray(`      - ${ctx.source}: ${ctx.path}`));
        });
      }

      const contextBuilder = new ContextBuilder(this.repoPath);
      const globalContextForPrompt = this.specOrchestrator.formatGlobalContextForPrompt(jiraContext);
      const feedbackContext = this.agentConfig.feedback?.enabled ? this.feedbackLoop.generateFeedbackContext() : '';

      const context = await contextBuilder.buildContext(filePath, 'java', globalContextForPrompt + feedbackContext);

      console.log(chalk.green(`   ✓ Context built: ${context.files.length} files, ${context.totalTokens} tokens`));

      if (context.droppedFiles.length > 0) {
        console.log(chalk.yellow(`   ⚠️  Dropped ${context.droppedFiles.length} files (over budget)`));
      }

      // Step 7: Build prompt with Spring Boot version context
      const templateContext = this.springBootDetector.getTemplateContext(springBootVersion);
      const prompt = this.buildPrompt(spec, context, templateContext);

      // Step 8: Generate code
      console.log(chalk.blue('   🤖 Generating code...'));

      const auditId = this.auditLogger.startEntry({
        spec: fileName,
        jira_ticket: spec.jiraTicket,
        prompt,
        llm_provider: this.agentConfig.llm.provider,
        llm_model: this.agentConfig.llm.model,
        git_branch: workingBranch,
      });

      let implementation: any;
      try {
        implementation = await this.aiProvider.generateCode(prompt);
      } catch (genError: any) {
        this.auditLogger.completeEntry(auditId, {
          generated_files: [],
          status: 'failed',
          error: genError.message,
        });
        throw genError;
      }

      // Convert imports based on Spring Boot version
      implementation.files = implementation.files.map((file: any) => ({
        ...file,
        content: this.springBootDetector.convertImports(file.content, springBootVersion.useJakarta)
      }));

      this.auditLogger.completeEntry(auditId, {
        generated_files: implementation.files.map((f: any) => f.path),
        status: 'success',
      });

      console.log(chalk.green(`   ✓ Generated ${implementation.files.length} files`));
      console.log(chalk.gray(`   Summary: ${implementation.summary}`));

      // Step 9: Dry-run preview (if enabled)
      if (this.agentConfig.preview?.enabled) {
        console.log(chalk.blue('\n   👁️  Preview Mode\n'));

        const previewResult = await this.dryRunPreview.preview(implementation.files);

        if (this.agentConfig.preview?.show_diffs) {
          const previewFile = await this.dryRunPreview.savePreview(previewResult.diffs);
          console.log(chalk.gray(`   Preview saved: ${previewFile}`));
        }

        if (this.agentConfig.preview?.require_approval) {
          // In real implementation, this would prompt user for approval
          console.log(chalk.yellow('   ⚠️  Preview mode: require_approval is enabled but not implemented in watch mode'));
        }
      }

      // Step 10: Write files
      for (const file of implementation.files) {
        const fullPath = path.join(this.repoPath, file.path);
        const dir = path.dirname(fullPath);

        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(fullPath, file.content, 'utf-8');

        const action = file.action === 'create' ? '📝 Created' : '✏️  Modified';
        console.log(chalk.green(`      ${action}: ${file.path}`));
      }

      // Step 11: Record change for rollback
      const changeRecord = {
        timestamp: new Date().toISOString(),
        spec: fileName,
        branch: workingBranch,
        files: implementation.files.map((f: any) => f.path)
      };
      this.rollbackManager.recordChange(changeRecord);

      // Get the change ID for potential rollback
      const recentChanges = this.rollbackManager.getRecentChanges(1);
      const changeId = recentChanges.length > 0 ? recentChanges[0].id : null;

      // Optional review gate with basic feedback loop
      if (this.agentConfig.agents.review) {
        console.log(chalk.blue('\n   🔍 Reviewing codebase (ReviewAgent)...'));

        const reviewAgent = new ReviewAgent(this.repoPath, this.aiProvider);
        const maxRounds = this.agentConfig.agents.max_review_fix_rounds ?? 2;
        const autoFix = this.agentConfig.agents.review_auto_fix !== false;

        let round = 0;
        let reviewResult = await reviewAgent.reviewCodebase({
          focus: 'all',
          severity: 'all'
        });

        console.log(chalk.gray(`   Review violations: ${reviewResult.summary.totalViolations}`));

        while (autoFix && reviewResult.summary.totalViolations > 0 && round < maxRounds) {
          round++;
          console.log(chalk.blue(`\n   🔧 Auto-fixing review violations (round ${round}/${maxRounds})...`));
          await reviewAgent.autoFix(reviewResult.violations);

          reviewResult = await reviewAgent.reviewCodebase({
            focus: 'all',
            severity: 'all'
          });

          console.log(chalk.gray(`   Remaining review violations: ${reviewResult.summary.totalViolations}`));
        }

        if (reviewResult.summary.totalViolations > 0) {
          console.log(chalk.red('\n   ⛔ Review gate failed: unresolved violations remain after auto-fix rounds'));
          console.log(chalk.red('   Skipping build, tests, and PR creation for this spec.\n'));

          this.saveLog({
            timestamp: new Date().toISOString(),
            spec: fileName,
            branch: workingBranch,
            status: 'failed',
            files_changed: implementation.files.length,
            build_result: 'skipped_due_to_review_violations',
            review_violations: reviewResult.summary.totalViolations,
            retry_count: 0
          });

          return;
        }

        console.log(chalk.green('   ✓ Review gate passed'));
      }

      // Step 12: Build with retry
      if (this.agentConfig.agents.build) {
        console.log(chalk.blue('\n   🔨 Building project...'));

        const buildAgent = new BuildAgent(this.repoPath, { verbose: this.verbose });
        const orchestrator = new RetryOrchestrator({ maxAttempts: 3 });

        const buildResult = await orchestrator.execute(
          async () => {
            const result = await buildAgent.compile();
            if (result.success) {
              return await buildAgent.test();
            }
            return result;
          },
          async (error, attempt) => {
            console.log(chalk.yellow(`   🔧 Attempting auto-fix (attempt ${attempt})...`));

            const fixPrompt = this.buildFixPrompt(error, context, implementation);

            const fixAuditId = this.auditLogger.startEntry({
              spec: fileName,
              jira_ticket: spec.jiraTicket,
              prompt: fixPrompt,
              llm_provider: this.agentConfig.llm.provider,
              llm_model: this.agentConfig.llm.model,
              git_branch: workingBranch,
            });

            const fix = await this.aiProvider.generateCode(fixPrompt);

            this.auditLogger.completeEntry(fixAuditId, {
              generated_files: fix.files.map((f: any) => f.path),
              status: 'retry',
              retry_count: attempt,
            });

            // Apply fix
            for (const file of fix.files) {
              const fullPath = path.join(this.repoPath, file.path);
              fs.writeFileSync(fullPath, file.content, 'utf-8');
              console.log(chalk.yellow(`      🔧 Fixed: ${file.path}`));
            }
          }
        );

        if (!buildResult.success) {
          console.log(chalk.red('\n   ❌ Build failed after max retries'));

          // Auto-rollback (NEW in v1.2)
          if (this.agentConfig.failure?.auto_rollback !== false && changeId) {
            console.log(chalk.yellow('   🔄 Rolling back changes to clean state...'));

            const rollbackResult = await this.rollbackManager.rollback(changeId);

            if (rollbackResult.success) {
              console.log(chalk.green(`   ✓ Rollback complete, working tree clean`));
              console.log(chalk.gray(`   ${rollbackResult.filesRestored.length} files reverted\n`));
            } else {
              console.log(chalk.red(`   ⚠️  Rollback failed: ${rollbackResult.message}\n`));
            }
          } else {
            console.log(chalk.gray('   Auto-rollback disabled, files left in current state'));
          }

          // Log failure for `myintern status` and audit trail
          const buildFailAuditId = this.auditLogger.startEntry({
            spec: fileName,
            jira_ticket: spec.jiraTicket,
            prompt: '[build-failure-event]',
            llm_provider: this.agentConfig.llm.provider,
            llm_model: this.agentConfig.llm.model,
            git_branch: workingBranch,
          });
          this.auditLogger.completeEntry(buildFailAuditId, {
            generated_files: implementation.files.map((f: any) => f.path),
            status: 'failed',
            retry_count: 3,
            error: buildResult.error || 'Build failed after 3 retries',
          });

          this.saveLog({
            timestamp: new Date().toISOString(),
            spec: fileName,
            branch: workingBranch,
            status: 'failed',
            files_changed: implementation.files.length,
            build_result: 'failed',
            error: buildResult.error || 'Build failed after 3 retries',
            retry_count: 3
          });

          return;
        }

        console.log(chalk.green('   ✓ Build successful'));
      }

      // Step 13: Generate tests
      if (this.agentConfig.agents.test) {
        console.log(chalk.blue('\n   🧪 Generating tests...'));

        const testAgent = new TestAgent(this.repoPath);
        const testResult = await testAgent.generateTests(
          implementation.files.map((f: any) => f.path),
          this.aiProvider
        );

        if (testResult.success) {
          console.log(chalk.green(`   ✓ Generated ${testResult.testsGenerated.length} test files`));
        }
      }

      // Step 14: Create PR (if configured)
      await this.createPullRequestIfConfigured(spec, workingBranch, implementation.files.length);

      // Step 15: Summary
      console.log(chalk.green(`\n✨ Implementation complete!`));
      console.log(chalk.gray(`   Branch: ${workingBranch}`));
      console.log(chalk.gray(`   Files: ${implementation.files.length} created/modified`));
      console.log(chalk.gray(`   Commit: ${implementation.commit_message}\n`));

      // Save to logs with success status
      this.saveLog({
        timestamp: new Date().toISOString(),
        spec: fileName,
        branch: workingBranch,
        status: 'success',
        files_changed: implementation.files.length,
        build_result: 'passed',
        tests_generated: this.agentConfig.agents.test ? implementation.files.filter((f: any) => f.path.includes('Test')).length : undefined,
        retry_count: 0
      });

    } catch (error: any) {
      console.log(chalk.red(`\n   ❌ Error: ${error.message}`));
      this.log(`Error processing spec: ${error.message}`, 'error');

      // Save to logs with failed status
      const fileName = path.basename(filePath);
      const safety = new SafetyRules(this.repoPath, this.gitConfig.protected_branches);
      const currentBranch = await safety.getCurrentBranch();

      this.saveLog({
        timestamp: new Date().toISOString(),
        spec: fileName,
        branch: currentBranch,
        status: 'failed',
        error: error.message,
        retry_count: 0
      });
    }
  }

  /**
   * Build prompt for code generation
   */
  private buildPrompt(spec: any, context: any, templateContext?: any): string {
    let prompt = `You are a senior Java/Spring Boot engineer.

# Spec
${new SpecParser().formatForPrompt(spec)}

# Spring Boot Version Context
${templateContext ? `
Spring Boot Version: ${templateContext.springBootVersion}
Java Version: ${templateContext.javaVersion}
Persistence Package: ${templateContext.persistencePackage}
Validation Package: ${templateContext.validationPackage}
Servlet Package: ${templateContext.servletPackage}

CRITICAL: Use ${templateContext.useJakarta ? 'jakarta.*' : 'javax.*'} imports (NOT ${templateContext.useJakarta ? 'javax.*' : 'jakarta.*'})

## Spring Boot Architecture Rules
- Controllers: Thin HTTP layer only (@RestController, @RequestMapping). No business logic.
- Services: @Service + @Transactional. All business logic lives here.
- Repositories: Extend JpaRepository<T, ID>. Custom queries via @Query or method naming.
- DTOs: Use Java Records for request/response. Never expose @Entity in API responses.
- Validation: @Valid on controller params, Bean Validation annotations on DTOs.
- Exceptions: Custom exceptions extend RuntimeException. Handle via @RestControllerAdvice.
- Injection: Constructor injection only (use @RequiredArgsConstructor). NEVER use @Autowired field injection.
${templateContext.useJakarta ? `
## Spring Boot 3.x Specific
- Security: Use SecurityFilterChain bean (WebSecurityConfigurerAdapter is REMOVED in 3.x)
- Error responses: Use ProblemDetail (RFC 7807) for structured error responses
- HTTP clients: Prefer @HttpExchange declarative clients over RestTemplate
- Observability: Use Micrometer Observation API (@Observed) for tracing
` : `
## Spring Boot 2.x Specific
- Security: Extend WebSecurityConfigurerAdapter for security config
- HTTP clients: Use RestTemplate (blocking) or WebClient (reactive)
- Error handling: @RestControllerAdvice with ResponseEntity
`}
## Anti-Patterns (NEVER do these)
- No @Autowired field injection (use constructor injection)
- No @AllArgsConstructor (use @RequiredArgsConstructor)
- No business logic in controllers
- No entity objects in API responses (use DTOs)
- No ddl-auto: update in production configs
- No System.out.println (use @Slf4j + log.info/debug/error)
` : ''}

# Project Context
`;

    // Add global Jira context if available
    if (context.globalContext) {
      prompt += `\n${context.globalContext}\n`;
    }

    // Add practices if available
    if (context.practicesContent) {
      prompt += `\n## Coding Practices\n${context.practicesContent}\n`;
    }

    // Add relevant files
    if (context.files.length > 0) {
      prompt += `\n## Existing Code\n\n`;
      for (const file of context.files) {
        prompt += `### ${file.path}\n\`\`\`java\n${file.content}\n\`\`\`\n\n`;
      }
    }

    prompt += `
# Task
Implement the specification following Spring Boot best practices and the coding standards above.

## Output Format (JSON only)

Return ONLY a valid JSON object:

\`\`\`json
{
  "files": [
    {
      "path": "src/main/java/com/example/controller/UserController.java",
      "action": "create",
      "content": "package com.example.controller;\\n\\nimport..."
    }
  ],
  "commit_message": "feat: implement user registration endpoint",
  "summary": "Brief summary of implementation"
}
\`\`\`

CRITICAL:
- Return ONLY valid JSON (no markdown, no explanations)
- Include complete file content (not snippets)
- Follow the coding practices exactly
- Use proper package names from existing code
`;

    return prompt;
  }

  /**
   * Build prompt for auto-fix
   */
  private buildFixPrompt(error: string, context: any, previousImpl: any): string {
    const errorContext = RetryOrchestrator.extractErrorContext(error);

    let prompt = `You are a senior Java/Spring Boot engineer fixing a compilation error.

# Build Error
\`\`\`
${error}
\`\`\`

# Error Details
- File: ${errorContext.file || 'Unknown'}
- Line: ${errorContext.line || 'Unknown'}
- Message: ${errorContext.message}

# Previous Implementation
${JSON.stringify(previousImpl.files.map((f: any) => ({ path: f.path, action: f.action })), null, 2)}

# Task
Fix the compilation error. Return the corrected files in the same JSON format.

CRITICAL:
- Return ONLY valid JSON
- Include complete file content
- Fix ONLY the error, don't make other changes
`;

    return prompt;
  }

  /**
   * Create a pull request for successful implementations when configured.
   *
   * Prefers GitHub MCP integration when enabled, otherwise falls back to gh CLI via PRManager.
   */
  private async createPullRequestIfConfigured(
    spec: any,
    workingBranch: string,
    filesChanged: number
  ): Promise<void> {
    const githubMcp = this.agentConfig.mcp?.servers?.github as GitHubMCPConfig | undefined;

    if (githubMcp?.enabled) {
      try {
        console.log(chalk.blue('\n   📤 Creating PR via GitHub MCP...'));
        const client = new GitHubMCPClient(githubMcp);
        const lifecycle = new GitHubLifecycle(client, githubMcp);

        const result = await lifecycle.createAndMonitorPR({
          specName: spec.filePath.split('/').pop() || 'unknown',
          specTitle: spec.title,
          branch: workingBranch,
          filesChanged
        });

        if (result.pr) {
          console.log(chalk.green(`   ✓ PR ready: ${result.pr.url}`));
        } else {
          console.log(chalk.gray('   PR creation skipped by GitHub MCP configuration'));
        }
      } catch (error: any) {
        console.log(chalk.yellow(`   ⚠️  GitHub MCP PR creation failed: ${error.message}`));
      }
      return;
    }

    if (this.gitConfig.auto_pr) {
      try {
        console.log(chalk.blue('\n   📤 Creating PR via gh CLI...'));
        const manager = new PRManager(this.repoPath, {
          auto_pr: this.gitConfig.auto_pr,
          pr_base_branch: this.gitConfig.pr_base_branch,
          pr_template: this.gitConfig.pr_template
        });

        await manager.createPR({
          spec,
          branch: workingBranch,
          filesChanged,
          buildStatus: 'passed'
        });
      } catch (error: any) {
        console.log(chalk.yellow(`   ⚠️  gh CLI PR creation failed: ${error.message}`));
      }
    }
  }

  /**
   * Save execution log with status tracking
   */
  private saveLog(log: any): void {
    const logsDir = path.join(this.repoPath, '.myintern', 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const logsFile = path.join(logsDir, 'executions.json');
    let logsData: { executions: any[] } = { executions: [] };

    if (fs.existsSync(logsFile)) {
      const content = fs.readFileSync(logsFile, 'utf-8');
      try {
        logsData = JSON.parse(content);
        // Handle legacy format (array instead of object)
        if (Array.isArray(logsData)) {
          logsData = { executions: logsData };
        }
      } catch (error) {
        console.log(chalk.yellow('⚠️  Failed to parse executions.json, creating new file'));
      }
    }

    logsData.executions.push(log);
    fs.writeFileSync(logsFile, JSON.stringify(logsData, null, 2));
  }
}
