import chalk from 'chalk';

export interface BuildResult {
  success: boolean;
  output?: string;
  error?: string;
}

export interface RetryConfig {
  maxAttempts: number; // Default: 3 (Section 12: Safety Rules)
  onAttempt?: (attempt: number, error: string) => void;
  onSuccess?: () => void;
  onMaxRetriesReached?: (finalError: string) => void;
}

/**
 * Retry orchestrator with auto-fix loop (Section 12: Safety Rules)
 *
 * Max 3 auto-fix retries before stopping and alerting user.
 */
export class RetryOrchestrator {
  private readonly MAX_RETRIES = 3;

  constructor(private config?: Partial<RetryConfig>) {}

  /**
   * Execute task with retry logic
   *
   * @param task - Function that returns a BuildResult
   * @param fixFunction - Function called on failure to attempt auto-fix
   * @returns Final build result after retries
   */
  async execute(
    task: () => Promise<BuildResult>,
    fixFunction: (error: string, attempt: number) => Promise<void>
  ): Promise<BuildResult> {
    const maxAttempts = this.config?.maxAttempts || this.MAX_RETRIES;
    let lastResult: BuildResult | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(chalk.blue(`\n📍 Attempt ${attempt}/${maxAttempts}`));

      // Execute the task
      const result = await task();
      lastResult = result;

      if (result.success) {
        console.log(chalk.green(`✅ Success on attempt ${attempt}`));
        this.config?.onSuccess?.();
        return result;
      }

      // Task failed
      const error = result.error || 'Unknown error';
      console.log(chalk.red(`❌ Attempt ${attempt} failed`));
      console.log(chalk.gray(`   Error: ${this.truncateError(error)}`));

      this.config?.onAttempt?.(attempt, error);

      // If this was the last attempt, don't try to fix
      if (attempt === maxAttempts) {
        console.log(chalk.red(`\n⛔ Max retries (${maxAttempts}) reached. Stopping.`));
        this.config?.onMaxRetriesReached?.(error);
        break;
      }

      // Attempt auto-fix
      console.log(chalk.yellow(`\n🔧 Attempting auto-fix...`));

      try {
        await fixFunction(error, attempt);
        console.log(chalk.green(`✅ Auto-fix applied`));
      } catch (fixError: any) {
        console.log(chalk.red(`❌ Auto-fix failed: ${fixError.message}`));
        // Continue to next attempt even if fix failed
      }
    }

    return lastResult || { success: false, error: 'No attempts completed' };
  }

  /**
   * Execute with exponential backoff (optional, for rate limiting)
   */
  async executeWithBackoff(
    task: () => Promise<BuildResult>,
    fixFunction: (error: string, attempt: number) => Promise<void>,
    initialDelay: number = 1000
  ): Promise<BuildResult> {
    const maxAttempts = this.config?.maxAttempts || this.MAX_RETRIES;
    let lastResult: BuildResult | null = null;
    let delay = initialDelay;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(chalk.blue(`\n📍 Attempt ${attempt}/${maxAttempts}`));

      const result = await task();
      lastResult = result;

      if (result.success) {
        console.log(chalk.green(`✅ Success on attempt ${attempt}`));
        this.config?.onSuccess?.();
        return result;
      }

      const error = result.error || 'Unknown error';
      console.log(chalk.red(`❌ Attempt ${attempt} failed`));
      console.log(chalk.gray(`   Error: ${this.truncateError(error)}`));

      this.config?.onAttempt?.(attempt, error);

      if (attempt === maxAttempts) {
        console.log(chalk.red(`\n⛔ Max retries (${maxAttempts}) reached. Stopping.`));
        this.config?.onMaxRetriesReached?.(error);
        break;
      }

      // Wait before next attempt
      console.log(chalk.gray(`   Waiting ${delay}ms before retry...`));
      await this.sleep(delay);

      // Attempt auto-fix
      console.log(chalk.yellow(`\n🔧 Attempting auto-fix...`));

      try {
        await fixFunction(error, attempt);
        console.log(chalk.green(`✅ Auto-fix applied`));
      } catch (fixError: any) {
        console.log(chalk.red(`❌ Auto-fix failed: ${fixError.message}`));
      }

      // Exponential backoff: double the delay
      delay *= 2;
    }

    return lastResult || { success: false, error: 'No attempts completed' };
  }

  /**
   * Truncate long error messages for display
   */
  private truncateError(error: string, maxLength: number = 200): string {
    if (error.length <= maxLength) return error;

    // Try to find first line
    const firstLine = error.split('\n')[0];
    if (firstLine.length <= maxLength) return firstLine;

    return error.substring(0, maxLength) + '...';
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if error is recoverable (can be auto-fixed)
   */
  static isRecoverableError(error: string): boolean {
    const recoverablePatterns = [
      /compilation error/i,
      /type error/i,
      /import.*not found/i,
      /cannot find symbol/i,
      /missing return statement/i,
      /unreachable statement/i,
      /syntax error/i
    ];

    return recoverablePatterns.some(pattern => pattern.test(error));
  }

  /**
   * Extract actionable error info for AI to fix
   */
  static extractErrorContext(error: string): {
    file?: string;
    line?: number;
    column?: number;
    message: string;
  } {
    // Java error pattern: /path/to/File.java:[123,45] error message
    const javaMatch = error.match(/([\w\/\\.]+\.java):\[(\d+),(\d+)\]\s*(.+)/);
    if (javaMatch) {
      return {
        file: javaMatch[1],
        line: parseInt(javaMatch[2]),
        column: parseInt(javaMatch[3]),
        message: javaMatch[4]
      };
    }

    // TypeScript error pattern: src/file.ts(123,45): error TS1234: message
    const tsMatch = error.match(/([\w\/\\.]+\.(ts|js))(\((\d+),(\d+)\)):\s*error\s*\w+:\s*(.+)/);
    if (tsMatch) {
      return {
        file: tsMatch[1],
        line: parseInt(tsMatch[4]),
        column: parseInt(tsMatch[5]),
        message: tsMatch[6]
      };
    }

    // Python error pattern: File "path/to/file.py", line 123
    const pyMatch = error.match(/File\s+"(.+\.py)",\s+line\s+(\d+)/);
    if (pyMatch) {
      return {
        file: pyMatch[1],
        line: parseInt(pyMatch[2]),
        message: error
      };
    }

    // Default: return full error as message
    return {
      message: error
    };
  }
}
