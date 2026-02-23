import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';

/**
 * RollbackManager - Rollback code generation changes via git
 * Tracks all MyIntern changes and allows safe rollback
 */
export class RollbackManager {
  private repoPath: string;
  private historyFile: string;

  constructor(repoPath: string = process.cwd()) {
    this.repoPath = repoPath;
    this.historyFile = path.join(repoPath, '.myintern', 'rollback-history.json');
  }

  /**
   * Record a change before applying it
   */
  recordChange(change: {
    timestamp: string;
    spec: string;
    branch: string;
    files: string[];
    commitHash?: string;
  }): void {
    const history = this.loadHistory();
    history.push({
      ...change,
      id: this.generateId(),
      canRollback: true
    });
    this.saveHistory(history);
  }

  /**
   * List all recorded changes
   */
  listChanges(): Array<{
    id: string;
    timestamp: string;
    spec: string;
    branch: string;
    files: string[];
    commitHash?: string;
    canRollback: boolean;
  }> {
    return this.loadHistory();
  }

  /**
   * Rollback to a specific change
   */
  async rollback(changeId: string, options: { force?: boolean } = {}): Promise<{
    success: boolean;
    message: string;
    filesRestored: string[];
  }> {
    const history = this.loadHistory();
    const changeIndex = history.findIndex(h => h.id === changeId);

    if (changeIndex === -1) {
      return {
        success: false,
        message: `Change ${changeId} not found`,
        filesRestored: []
      };
    }

    const change = history[changeIndex];

    if (!change.canRollback && !options.force) {
      return {
        success: false,
        message: 'This change cannot be rolled back (already rolled back or modified). Use --force to override.',
        filesRestored: []
      };
    }

    try {
      console.log(chalk.blue(`🔄 Rolling back change: ${change.spec}`));
      console.log(chalk.gray(`   Branch: ${change.branch}`));
      console.log(chalk.gray(`   Timestamp: ${change.timestamp}`));
      console.log(chalk.gray(`   Files affected: ${change.files.length}`));

      // Check if we have a commit hash
      if (change.commitHash) {
        return this.rollbackViaGit(change, options.force || false);
      } else {
        return this.rollbackViaFileRestore(change);
      }
    } catch (error: any) {
      return {
        success: false,
        message: `Rollback failed: ${error.message}`,
        filesRestored: []
      };
    }
  }

  /**
   * Rollback via git revert
   */
  private rollbackViaGit(change: any, force: boolean): {
    success: boolean;
    message: string;
    filesRestored: string[];
  } {
    try {
      // Check if commit exists
      const commitExists = this.gitCommand(`git rev-parse --verify ${change.commitHash}`, true);

      if (!commitExists) {
        return {
          success: false,
          message: `Commit ${change.commitHash} not found. It may have been rebased or deleted.`,
          filesRestored: []
        };
      }

      // Get current branch
      const currentBranch = this.gitCommand('git branch --show-current').trim();

      // If we're not on the branch where the change was made, switch to it
      if (currentBranch !== change.branch) {
        console.log(chalk.yellow(`   Switching to branch: ${change.branch}`));
        this.gitCommand(`git checkout ${change.branch}`);
      }

      // Revert the commit
      console.log(chalk.blue(`   Reverting commit: ${change.commitHash}`));
      this.gitCommand(`git revert ${change.commitHash} --no-edit`);

      const filesRestored = change.files;

      // Mark as rolled back
      const history = this.loadHistory();
      const idx = history.findIndex(h => h.id === change.id);
      if (idx !== -1) {
        history[idx].canRollback = false;
        history[idx].rolledBackAt = new Date().toISOString();
        this.saveHistory(history);
      }

      return {
        success: true,
        message: `Successfully rolled back commit ${change.commitHash}`,
        filesRestored
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Git rollback failed: ${error.message}`,
        filesRestored: []
      };
    }
  }

  /**
   * Rollback by restoring files from git history
   */
  private rollbackViaFileRestore(change: any): {
    success: boolean;
    message: string;
    filesRestored: string[];
  } {
    const filesRestored: string[] = [];

    try {
      // Get current branch
      const currentBranch = this.gitCommand('git branch --show-current').trim();

      // Find the parent branch (usually main/master)
      const parentBranch = this.findParentBranch(change.branch);

      for (const file of change.files) {
        try {
          // Try to restore file from parent branch
          this.gitCommand(`git checkout ${parentBranch} -- ${file}`, true);
          filesRestored.push(file);
          console.log(chalk.green(`   ✓ Restored: ${file}`));
        } catch (error) {
          // File might not exist in parent branch (new file)
          console.log(chalk.yellow(`   ⚠️  Deleting new file: ${file}`));
          const fullPath = path.join(this.repoPath, file);
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            filesRestored.push(file);
          }
        }
      }

      // Mark as rolled back
      const history = this.loadHistory();
      const idx = history.findIndex(h => h.id === change.id);
      if (idx !== -1) {
        history[idx].canRollback = false;
        history[idx].rolledBackAt = new Date().toISOString();
        this.saveHistory(history);
      }

      return {
        success: true,
        message: `Successfully rolled back ${filesRestored.length} file(s)`,
        filesRestored
      };
    } catch (error: any) {
      return {
        success: false,
        message: `File restore failed: ${error.message}`,
        filesRestored
      };
    }
  }

  /**
   * Find the parent branch (main/master)
   */
  private findParentBranch(featureBranch: string): string {
    try {
      // Try to find merge base with main branches
      for (const branch of ['main', 'master', 'develop']) {
        try {
          this.gitCommand(`git rev-parse --verify ${branch}`);
          return branch;
        } catch {
          continue;
        }
      }
      return 'HEAD~1'; // Fallback to previous commit
    } catch {
      return 'HEAD~1';
    }
  }

  /**
   * Get the last N changes
   */
  getRecentChanges(count: number = 10): Array<any> {
    const history = this.loadHistory();
    return history.slice(-count).reverse();
  }

  /**
   * Clear rollback history
   */
  clearHistory(): void {
    this.saveHistory([]);
  }

  /**
   * Execute git command
   */
  private gitCommand(command: string, suppressError: boolean = false): string {
    try {
      return execSync(command, {
        cwd: this.repoPath,
        encoding: 'utf-8',
        stdio: suppressError ? 'pipe' : 'inherit'
      });
    } catch (error: any) {
      if (!suppressError) {
        throw error;
      }
      return '';
    }
  }

  /**
   * Load rollback history
   */
  private loadHistory(): Array<any> {
    if (!fs.existsSync(this.historyFile)) {
      return [];
    }

    try {
      const content = fs.readFileSync(this.historyFile, 'utf-8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  /**
   * Save rollback history
   */
  private saveHistory(history: Array<any>): void {
    const dir = path.dirname(this.historyFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.historyFile, JSON.stringify(history, null, 2), 'utf-8');
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `rb-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
