import chalk from 'chalk';

/**
 * Concise console logger for MyIntern
 * Keeps output minimal and readable
 */
export class ConsoleLogger {
  private verbose: boolean;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
  }

  /**
   * Info message (always shown)
   */
  info(message: string): void {
    console.log(chalk.blue('ℹ'), message);
  }

  /**
   * Success message (always shown)
   */
  success(message: string): void {
    console.log(chalk.green('✓'), message);
  }

  /**
   * Warning message (always shown)
   */
  warn(message: string): void {
    console.log(chalk.yellow('⚠'), message);
  }

  /**
   * Error message (always shown)
   */
  error(message: string): void {
    console.log(chalk.red('✗'), message);
  }

  /**
   * Debug message (only shown in verbose mode)
   */
  debug(message: string): void {
    if (this.verbose) {
      console.log(chalk.gray('→'), chalk.gray(message));
    }
  }

  /**
   * Step message - concise step indicator
   */
  step(step: number, total: number, message: string): void {
    console.log(chalk.cyan(`[${step}/${total}]`), message);
  }

  /**
   * Spinner-style message (for operations in progress)
   */
  progress(message: string): void {
    console.log(chalk.gray('⋯'), message);
  }

  /**
   * Section header
   */
  section(title: string): void {
    console.log(chalk.bold(`\n${title}`));
  }

  /**
   * Compact key-value pair
   */
  kv(key: string, value: string): void {
    console.log(chalk.gray(`  ${key}:`), value);
  }

  /**
   * Empty line (for spacing)
   */
  blank(): void {
    console.log('');
  }

  /**
   * Enable verbose mode
   */
  setVerbose(verbose: boolean): void {
    this.verbose = verbose;
  }
}

// Default singleton instance
export const logger = new ConsoleLogger();
