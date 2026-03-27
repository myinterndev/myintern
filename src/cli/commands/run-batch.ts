/**
 * Batch Spec Processor
 *
 * Processes multiple specs in CI/CD mode with JSON output and structured exit codes.
 * Uses SpecOrchestrator for execution planning and parallel execution.
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { CIEnvironment } from '../../core/CIEnvironment';
import { CIOutputFormatter } from './ci-output';
import { CIAuditWriter } from '../../core/CIAuditWriter';
import { SpecOrchestrator } from '../../core/SpecOrchestrator';
import { ConfigManager } from '../../core/ConfigManager';

export interface BatchOptions {
  ci?: boolean;
  json?: boolean;
  timeout?: number; // Timeout per spec in seconds
  parallel?: number; // Max parallel specs
  failFast?: boolean; // Stop on first failure
  outputDir?: string; // Output directory for result files
  all?: boolean; // Process all specs
  spec?: string; // Single spec to process
}

export class BatchProcessor {
  private ciMode: boolean;
  private outputFormatter: CIOutputFormatter;
  private auditWriter: CIAuditWriter;

  constructor(
    private repoPath: string,
    private options: BatchOptions
  ) {
    const detection = CIEnvironment.detect();
    this.ciMode = CIEnvironment.isCIMode(options);

    this.outputFormatter = new CIOutputFormatter();
    this.auditWriter = new CIAuditWriter(repoPath, {
      enabled: this.ciMode,
      output_dir: options.outputDir || path.join(repoPath, '.myintern', 'logs'),
      log_prompt_hashes: true,
      log_token_counts: true,
    });

    // Suppress interactive prompts in CI
    if (this.ciMode && detection.shouldSuppressColor) {
      process.env.NO_COLOR = '1';
    }
  }

  /**
   * Run batch processing
   */
  async run(): Promise<void> {
    const specsDir = path.join(this.repoPath, '.myintern', 'specs');

    // Validate specs directory exists
    if (!fs.existsSync(specsDir)) {
      if (this.ciMode && this.options.json) {
        this.outputFormatter.emitBatchComplete({
          total_specs: 0,
          succeeded: 0,
          failed: 0,
          skipped: 0,
          exit_code: CIEnvironment.getExitCode('NO_SPECS'),
          failed_specs: [],
        });
      } else {
        console.log(chalk.red('\n❌ Spec directory not found'));
        console.log(chalk.gray(`   Expected: ${path.join('.myintern', 'specs')}\n`));
      }

      CIEnvironment.exit('NO_SPECS');
    }

    // Load specs
    const specPaths = this.loadSpecs(specsDir);

    if (specPaths.length === 0) {
      if (this.ciMode && this.options.json) {
        this.outputFormatter.emitBatchComplete({
          total_specs: 0,
          succeeded: 0,
          failed: 0,
          skipped: 0,
          exit_code: CIEnvironment.getExitCode('NO_SPECS'),
          failed_specs: [],
        });
      } else {
        console.log(chalk.yellow('\n⚠️  No specs to process\n'));
      }

      CIEnvironment.exit('NO_SPECS');
    }

    // Log platform info in CI mode
    if (this.ciMode && !this.options.json) {
      const platformInfo = CIEnvironment.getPlatformInfo();
      if (platformInfo.platform) {
        console.log(chalk.gray(`Platform: ${platformInfo.platform}`));
        if (platformInfo.buildId) {
          console.log(chalk.gray(`Build ID: ${platformInfo.buildId}`));
        }
        if (platformInfo.branch) {
          console.log(chalk.gray(`Branch: ${platformInfo.branch}`));
        }
      }
    }

    // Execute batch
    try {
      const results = await this.executeBatch(specPaths);
      await this.reportResults(results);
    } catch (error: any) {
      if (this.ciMode && this.options.json) {
        this.outputFormatter.emitBatchComplete({
          total_specs: specPaths.length,
          succeeded: 0,
          failed: specPaths.length,
          skipped: 0,
          exit_code: CIEnvironment.getExitCode('FAILURE'),
          failed_specs: specPaths.map(p => path.basename(p)),
        });
      } else {
        console.error(chalk.red(`\n❌ Batch execution failed: ${error.message}\n`));
      }

      CIEnvironment.exit('FAILURE');
    }
  }

  /**
   * Load specs from directory
   */
  private loadSpecs(specsDir: string): string[] {
    if (this.options.spec) {
      // Single spec mode
      let fileName = this.options.spec;
      if (!fileName.endsWith('.md')) {
        fileName += '.md';
      }
      if (!fileName.startsWith('spec-')) {
        fileName = `spec-${fileName}`;
      }

      const specPath = path.join(specsDir, fileName);
      if (!fs.existsSync(specPath)) {
        if (!this.ciMode || !this.options.json) {
          console.log(chalk.red(`\n❌ Spec not found: ${fileName}`));
        }
        return [];
      }

      return [specPath];
    }

    // All specs mode
    return fs
      .readdirSync(specsDir)
      .filter(f => f.endsWith('.md') && f.startsWith('spec-'))
      .map(f => path.join(specsDir, f));
  }

  /**
   * Execute batch of specs using SpecOrchestrator
   */
  private async executeBatch(specPaths: string[]): Promise<
    Array<{
      spec: string;
      status: 'success' | 'failed' | 'skipped';
      duration_ms: number;
      error?: string;
      pr?: { url: string; number: number };
      files_generated?: string[];
    }>
  > {
    const configManager = new ConfigManager(this.repoPath);
    let config;

    try {
      config = configManager.load();
    } catch (error: any) {
      // Config doesn't exist - this is OK for some operations but will fail during execution
      throw new Error(`Configuration error: ${error.message}`);
    }

    const orchestrator = new SpecOrchestrator(this.repoPath, config);

    // Execute batch via orchestrator (will be implemented next)
    const maxParallel = this.options.parallel || config.agents.max_parallel || 3;
    const results = await orchestrator.executeBatch({
      specPaths,
      maxParallel,
      timeout: this.options.timeout,
      failFast: this.options.failFast || false,
      ciMode: this.ciMode,
      outputFormatter: this.options.json ? this.outputFormatter : undefined,
      auditWriter: this.auditWriter.isEnabled() ? this.auditWriter : undefined,
    });

    return results;
  }

  /**
   * Report batch results
   */
  private async reportResults(
    results: Array<{
      spec: string;
      status: 'success' | 'failed' | 'skipped';
      duration_ms: number;
      error?: string;
      pr?: { url: string; number: number };
    }>
  ): Promise<void> {
    const succeeded = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const skipped = results.filter(r => r.status === 'skipped').length;

    if (this.ciMode && this.options.json) {
      // JSON output mode
      const summary = CIOutputFormatter.createBatchSummary(results);
      this.outputFormatter.emitBatchComplete(summary);

      // Exit with appropriate code
      process.exit(summary.exit_code);
    } else {
      // Human-readable output
      console.log(chalk.bold('\n📊 Batch Summary'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(`Total specs:    ${results.length}`);
      console.log(chalk.green(`✓ Succeeded:    ${succeeded}`));
      if (failed > 0) {
        console.log(chalk.red(`✗ Failed:       ${failed}`));
      }
      if (skipped > 0) {
        console.log(chalk.yellow(`○ Skipped:      ${skipped}`));
      }

      if (failed > 0) {
        console.log(chalk.bold('\n❌ Failed Specs:'));
        results
          .filter(r => r.status === 'failed')
          .forEach(r => {
            console.log(chalk.red(`   - ${r.spec}`));
            if (r.error) {
              console.log(chalk.gray(`     ${r.error}`));
            }
          });
      }

      console.log();

      const exitCode = CIOutputFormatter.getExitCode({
        total: results.length,
        succeeded,
        failed,
        skipped,
      });

      process.exit(exitCode);
    }
  }
}

/**
 * Run batch processing (CLI entry point)
 */
export async function runBatch(options: BatchOptions): Promise<void> {
  const repoPath = process.cwd();
  const processor = new BatchProcessor(repoPath, options);
  await processor.run();
}
