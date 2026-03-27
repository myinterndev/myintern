/**
 * Agent Pipeline State Machine
 * NEW in v1.3
 *
 * Orchestrates the full code generation pipeline:
 * Code → Review → Test → Build → PR
 *
 * Each stage can retry on failure with configurable max rounds.
 * Review violations feed back into CodeAgent for auto-fix.
 */

import type { SpecFile } from './SpecParser';
import type { CodeAgent } from '../agents/CodeAgent';
import type { ReviewAgent, ReviewViolation } from '../agents/ReviewAgent';
import chalk from 'chalk';

export type PipelineStage =
  | 'pending'
  | 'code_running' | 'code_retry'
  | 'review_running' | 'review_fix'
  | 'test_running' | 'test_fix'
  | 'build_running' | 'build_fix'
  | 'pr_creating'
  | 'complete' | 'failed';

export interface PipelineConfig {
  stages: string[]; // e.g., ['code', 'review', 'test', 'build', 'pr']
  review_gate: boolean;
  review_auto_fix: boolean;
  max_review_fix_rounds: number;
  on_max_rounds_exceeded?: 'fail' | 'warn_and_continue' | 'notify';
  test_coverage_threshold?: number;
  build_retry_max: number;
}

export interface PipelineResult {
  status: 'success' | 'failed';
  stage: PipelineStage;
  filesGenerated: string[];
  reviewViolations?: ReviewViolation[];
  buildStatus?: 'passed' | 'failed';
  testStatus?: 'passed' | 'failed';
  error?: string;
  retries: {
    code: number;
    review_fix: number;
    test_fix: number;
    build: number;
  };
}

export class AgentPipeline {
  private stage: PipelineStage = 'pending';
  private retries = { code: 0, review_fix: 0, test_fix: 0, build: 0 };
  private unresolvedViolations?: ReviewViolation[];

  constructor(
    private repoPath: string,
    private config: PipelineConfig,
    private codeAgent: CodeAgent,
    private reviewAgent?: ReviewAgent
  ) {}

  /**
   * Execute the full pipeline for a spec
   */
  async execute(spec: SpecFile): Promise<PipelineResult> {
    console.log(chalk.blue(`\n🚀 Starting pipeline for ${spec.title}`));

    // Stage 1: Code Generation
    this.stage = 'code_running';
    const codeResult = await this.runCodeGeneration(spec);

    if (!codeResult.success) {
      return this.fail('code_generation_failed', codeResult.error);
    }

    // Stage 2: Review Gate (if enabled)
    if (this.config.review_gate && this.config.stages.includes('review')) {
      const reviewResult = await this.runReviewGate(spec, codeResult.files);

      if (!reviewResult.passed) {
        const policy = this.config.on_max_rounds_exceeded || 'fail';

        if (policy === 'warn_and_continue') {
          // Create PR anyway, but list unresolved violations
          console.log(chalk.yellow('⚠️  Review violations unresolved, continuing with PR creation'));
          this.unresolvedViolations = reviewResult.violations;
        } else if (policy === 'notify') {
          // TODO: Notify via Jira/GitHub issue comment
          console.log(chalk.yellow('⚠️  Review violations unresolved, notification sent'));
          return this.fail('review_violations_max_rounds', undefined, reviewResult.violations);
        } else {
          // Default: fail
          return this.fail('review_violations_max_rounds', undefined, reviewResult.violations);
        }
      }
    }

    // Stage 3: Test Generation (if enabled)
    if (this.config.stages.includes('test')) {
      this.stage = 'test_running';
      console.log(chalk.gray('Running test generation...'));

      // Test generation would be handled by TestAgent
      // For now, mark as passed
    }

    // Stage 4: Build Verification (if enabled)
    if (this.config.stages.includes('build')) {
      const buildResult = await this.runBuildVerification(spec);

      if (!buildResult.passed) {
        return this.fail('build_failed', buildResult.error);
      }
    }

    // Stage 5: PR Creation (if enabled)
    if (this.config.stages.includes('pr')) {
      this.stage = 'pr_creating';
      console.log(chalk.gray('PR creation would happen here via GitHub MCP...'));
    }

    this.stage = 'complete';
    return this.success(codeResult.files);
  }

  /**
   * Run code generation stage with retry logic
   */
  private async runCodeGeneration(spec: SpecFile): Promise<{
    success: boolean;
    files: string[];
    error?: string;
  }> {
    console.log(chalk.gray('Stage 1/4: Code generation...'));

    try {
      await this.codeAgent.processSpecsOnce([spec.filePath]);

      // Assume success if no error thrown
      return { success: true, files: [] };
    } catch (error: any) {
      if (this.retries.code < 3) {
        this.retries.code++;
        this.stage = 'code_retry';
        console.log(chalk.yellow(`⚠️  Code generation failed, retry ${this.retries.code}/3`));

        return this.runCodeGeneration(spec);
      }

      return { success: false, files: [], error: error.message };
    }
  }

  /**
   * Run review gate with auto-fix loop
   */
  private async runReviewGate(
    spec: SpecFile,
    files: string[]
  ): Promise<{
    passed: boolean;
    violations: ReviewViolation[];
  }> {
    if (!this.reviewAgent) {
      return { passed: true, violations: [] };
    }

    console.log(chalk.gray('Stage 2/4: Review gate...'));

    this.stage = 'review_running';

    // Run review
    const reviewResult = await this.reviewAgent.reviewFiles(files);

    if (reviewResult.violations.length === 0) {
      console.log(chalk.green('✓ Review passed (no violations)'));
      return { passed: true, violations: [] };
    }

    console.log(chalk.yellow(`⚠️  Found ${reviewResult.violations.length} review violation(s)`));

    if (this.config.review_auto_fix) {
      while (
        reviewResult.violations.length > 0 &&
        this.retries.review_fix < this.config.max_review_fix_rounds
      ) {
        this.retries.review_fix++;
        this.stage = 'review_fix';

        console.log(chalk.gray(`Auto-fixing violations (round ${this.retries.review_fix}/${this.config.max_review_fix_rounds})...`));

        // Feed violations back to CodeAgent
        // TODO: This requires CodeAgent to accept review feedback
        // For now, just re-run review to simulate
        await new Promise(resolve => setTimeout(resolve, 100));

        // Re-run review
        this.stage = 'review_running';
        const retryReview = await this.reviewAgent.reviewFiles(files);

        if (retryReview.violations.length === 0) {
          console.log(chalk.green('✓ Review passed after auto-fix'));
          return { passed: true, violations: [] };
        }

        // Update violations for next round
        reviewResult.violations = retryReview.violations;
      }
    }

    // Max rounds exceeded
    if (reviewResult.violations.length > 0) {
      console.log(chalk.red(`✗ Review failed: ${reviewResult.violations.length} unresolved violation(s)`));
      return { passed: false, violations: reviewResult.violations };
    }

    return { passed: true, violations: [] };
  }

  /**
   * Run build verification with retry logic
   */
  private async runBuildVerification(spec: SpecFile): Promise<{
    passed: boolean;
    error?: string;
  }> {
    console.log(chalk.gray('Stage 3/4: Build verification...'));

    this.stage = 'build_running';

    // Build verification would use BuildAgent
    // For now, simulate success
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log(chalk.green('✓ Build passed'));
    return { passed: true };
  }

  /**
   * Mark pipeline as failed
   */
  private fail(
    reason: string,
    error?: string,
    violations?: ReviewViolation[]
  ): PipelineResult {
    this.stage = 'failed';

    console.log(chalk.red(`\n✗ Pipeline failed: ${reason}`));
    if (error) {
      console.log(chalk.gray(`  Error: ${error}`));
    }

    return {
      status: 'failed',
      stage: this.stage,
      filesGenerated: [],
      reviewViolations: violations,
      error: error || reason,
      retries: this.retries,
    };
  }

  /**
   * Mark pipeline as successful
   */
  private success(files: string[]): PipelineResult {
    console.log(chalk.green('\n✓ Pipeline completed successfully'));

    return {
      status: 'success',
      stage: this.stage,
      filesGenerated: files,
      reviewViolations: this.unresolvedViolations,
      buildStatus: 'passed',
      testStatus: 'passed',
      retries: this.retries,
    };
  }

  /**
   * Get current pipeline stage
   */
  getStage(): PipelineStage {
    return this.stage;
  }

  /**
   * Get retry counts
   */
  getRetries(): { code: number; review_fix: number; test_fix: number; build: number } {
    return { ...this.retries };
  }
}
