import simpleGit, { SimpleGit } from 'simple-git';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

/**
 * Safety Rules (Section 12: Safety Rules - Non-Negotiable)
 *
 * 1. Never commit directly to protected branches (main, master, production)
 * 2. Deploy is always dry-run by default
 * 3. Max 3 auto-fix retries before stopping
 * 4. Never delete files without user confirmation
 * 5. API keys only via env vars
 * 6. Git status check before any write
 */
export class SafetyRules {
  private git: SimpleGit;
  private protectedBranches: string[];

  constructor(
    private repoPath: string,
    protectedBranches: string[] = ['main', 'master', 'production']
  ) {
    this.git = simpleGit(repoPath);
    this.protectedBranches = protectedBranches;
  }

  /**
   * Rule 1: Check if current branch is protected
   */
  async isProtectedBranch(): Promise<{ protected: boolean; branch: string }> {
    const status = await this.git.status();
    const currentBranch = status.current || '';

    const isProtected = this.protectedBranches.includes(currentBranch);

    return {
      protected: isProtected,
      branch: currentBranch
    };
  }

  /**
   * Rule 1: Enforce no commits to protected branches
   */
  async enforceNonProtectedBranch(): Promise<void> {
    const { protected: isProtected, branch } = await this.isProtectedBranch();

    if (isProtected) {
      throw new Error(
        `Cannot commit to protected branch "${branch}". Create a feature branch first.`
      );
    }
  }

  /**
   * Rule 6: Check if working tree is dirty before writes
   */
  async checkWorkingTree(): Promise<{
    clean: boolean;
    staged: number;
    modified: number;
    untracked: number;
  }> {
    const status = await this.git.status();

    return {
      clean: status.isClean(),
      staged: status.staged.length,
      modified: status.modified.length,
      untracked: status.not_added.length
    };
  }

  /**
   * Rule 6: Warn if working tree is dirty
   */
  async warnIfDirty(): Promise<void> {
    const { clean, staged, modified, untracked } = await this.checkWorkingTree();

    if (!clean) {
      console.log(chalk.yellow('\n⚠️  Working tree has uncommitted changes:'));
      if (staged > 0) console.log(chalk.yellow(`   - ${staged} staged files`));
      if (modified > 0) console.log(chalk.yellow(`   - ${modified} modified files`));
      if (untracked > 0) console.log(chalk.yellow(`   - ${untracked} untracked files`));
      console.log();
    }
  }

  /**
   * Rule 4: Prompt for confirmation before deleting files
   */
  confirmFileDeletion(files: string[]): void {
    if (files.length === 0) return;

    console.log(chalk.red('\n⚠️  WARNING: The following files will be deleted:'));
    for (const file of files) {
      console.log(chalk.red(`   - ${file}`));
    }
    console.log(
      chalk.red('\n   File deletion is DISABLED by default for safety.')
    );
    console.log(
      chalk.gray(
        '   If you need to delete files, please do so manually via git or your IDE.\n'
      )
    );

    throw new Error('Automatic file deletion is not allowed for safety reasons');
  }

  /**
   * Rule 5: Validate that API keys are from env vars, not hardcoded
   */
  static validateApiKey(apiKey: string, allowedPattern: RegExp = /^\$\{.+\}$/): void {
    // If key starts with ${, it's an env var reference (good)
    if (allowedPattern.test(apiKey)) {
      return;
    }

    // Check if it looks like a real API key (suspicious)
    if (apiKey.length > 20 && !apiKey.includes(' ')) {
      throw new Error(
        'API key appears to be hardcoded. Use environment variable reference like ${ANTHROPIC_API_KEY}'
      );
    }
  }

  /**
   * Rule 2: Ensure deploy is dry-run by default
   */
  static validateDeployConfig(deployConfig?: {
    enabled: boolean;
    dry_run: boolean;
  }): void {
    if (!deployConfig) return; // Deploy not configured, safe

    if (deployConfig.enabled && !deployConfig.dry_run) {
      console.log(chalk.red('\n⛔ DANGER: Deploy is enabled with dry_run=false'));
      console.log(chalk.red('   This allows REAL deployments to production systems.'));
      console.log(chalk.yellow('   Ensure you understand the risks before proceeding.\n'));

      throw new Error(
        'Deploy must have dry_run=true unless you explicitly disable it in config'
      );
    }
  }

  /**
   * Create a safe feature branch for changes
   */
  async createFeatureBranch(branchName: string): Promise<string> {
    // Ensure branch name is safe
    const safeBranchName = branchName.replace(/[^a-zA-Z0-9_\/-]/g, '-');

    // Check if branch already exists
    const branches = await this.git.branchLocal();

    if (branches.all.includes(safeBranchName)) {
      console.log(chalk.blue(`   Branch "${safeBranchName}" already exists, switching to it`));
      await this.git.checkout(safeBranchName);
    } else {
      console.log(chalk.blue(`   Creating feature branch: ${safeBranchName}`));
      await this.git.checkoutLocalBranch(safeBranchName);
    }

    return safeBranchName;
  }

  /**
   * Validate all safety rules before operation
   */
  async validatePreOperation(): Promise<{
    safe: boolean;
    warnings: string[];
    errors: string[];
  }> {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Check protected branch
    const { protected: isProtected, branch } = await this.isProtectedBranch();
    if (isProtected) {
      errors.push(
        `Current branch "${branch}" is protected. Create a feature branch first.`
      );
    }

    // Check working tree
    const { clean } = await this.checkWorkingTree();
    if (!clean) {
      warnings.push('Working tree has uncommitted changes');
    }

    return {
      safe: errors.length === 0,
      warnings,
      errors
    };
  }

  /**
   * Log safety violation
   */
  static logViolation(rule: string, details: string): void {
    console.log(chalk.red(`\n⛔ SAFETY VIOLATION: ${rule}`));
    console.log(chalk.red(`   ${details}\n`));
  }
}
