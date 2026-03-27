import { exec } from 'child_process';
import { promisify } from 'util';
import { LanguageDetector, ProjectInfo } from '../../core/LanguageDetector';
import chalk from 'chalk';

const execAsync = promisify(exec);

export interface BuildResult {
  success: boolean;
  output?: string;
  error?: string;
  duration?: number;
}

/**
 * Multi-language build agent (Section 3: Build Agent)
 *
 * - Auto-detects build tool (Maven, Gradle, npm, pip)
 * - Runs compile + test
 * - On failure: sends error output back to Code Agent
 * - Max retry: 3 (handled by RetryOrchestrator)
 */
export class BuildAgent {
  private detector: LanguageDetector;
  private projectInfo: ProjectInfo;
  private verbose: boolean;

  constructor(private repoPath: string, options: { verbose?: boolean } = {}) {
    this.detector = new LanguageDetector(repoPath);
    this.projectInfo = this.detector.detectPrimary();
    this.verbose = options.verbose || false;
  }

  /**
   * Compile the project
   */
  async compile(): Promise<BuildResult> {
    const commands = this.detector.getBuildCommands(this.projectInfo);

    if (!commands.compile) {
      console.log(chalk.gray('   No compile step needed for this project'));
      return { success: true };
    }

    console.log(chalk.blue(`   Running: ${commands.compile}`));

    try {
      const startTime = Date.now();
      const { stdout, stderr } = await execAsync(commands.compile, {
        cwd: this.repoPath,
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });
      const duration = Date.now() - startTime;

      // Show verbose output if requested
      if (this.verbose && stdout) {
        console.log(chalk.gray('\n   --- Compile Output ---'));
        console.log(chalk.gray(stdout));
        if (stderr) {
          console.log(chalk.yellow('\n   --- Compile Warnings ---'));
          console.log(chalk.gray(stderr));
        }
        console.log(chalk.gray('   --- End Output ---\n'));
      }

      return {
        success: true,
        output: stdout + stderr,
        duration
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.stdout + error.stderr || error.message,
        output: error.stdout + error.stderr
      };
    }
  }

  /**
   * Run tests
   */
  async test(): Promise<BuildResult> {
    const commands = this.detector.getBuildCommands(this.projectInfo);

    console.log(chalk.blue(`   Running: ${commands.test}`));

    try {
      const startTime = Date.now();
      const { stdout, stderr } = await execAsync(commands.test, {
        cwd: this.repoPath,
        maxBuffer: 10 * 1024 * 1024
      });
      const duration = Date.now() - startTime;

      // Show verbose output if requested
      if (this.verbose && stdout) {
        console.log(chalk.gray('\n   --- Test Output ---'));
        console.log(chalk.gray(stdout));
        if (stderr) {
          console.log(chalk.yellow('\n   --- Test Warnings ---'));
          console.log(chalk.gray(stderr));
        }
        console.log(chalk.gray('   --- End Output ---\n'));
      }

      return {
        success: true,
        output: stdout + stderr,
        duration
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.stdout + error.stderr || error.message,
        output: error.stdout + error.stderr
      };
    }
  }

  /**
   * Package/build the project
   */
  async package(): Promise<BuildResult> {
    const commands = this.detector.getBuildCommands(this.projectInfo);

    if (!commands.package) {
      console.log(chalk.gray('   No package step configured'));
      return { success: true };
    }

    console.log(chalk.blue(`   Running: ${commands.package}`));

    try {
      const startTime = Date.now();
      const { stdout, stderr } = await execAsync(commands.package, {
        cwd: this.repoPath,
        maxBuffer: 10 * 1024 * 1024
      });
      const duration = Date.now() - startTime;

      // Show verbose output if requested
      if (this.verbose && stdout) {
        console.log(chalk.gray('\n   --- Package Output ---'));
        console.log(chalk.gray(stdout));
        if (stderr) {
          console.log(chalk.yellow('\n   --- Package Warnings ---'));
          console.log(chalk.gray(stderr));
        }
        console.log(chalk.gray('   --- End Output ---\n'));
      }

      return {
        success: true,
        output: stdout + stderr,
        duration
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.stdout + error.stderr || error.message,
        output: error.stdout + error.stderr
      };
    }
  }

  /**
   * Full build: compile + test + package
   */
  async fullBuild(): Promise<BuildResult> {
    console.log(chalk.blue('\n🔨 Starting full build...\n'));

    // Step 1: Compile
    const compileResult = await this.compile();
    if (!compileResult.success) {
      console.log(chalk.red('   ❌ Compilation failed'));
      return compileResult;
    }
    console.log(chalk.green('   ✅ Compilation successful'));

    // Step 2: Test
    const testResult = await this.test();
    if (!testResult.success) {
      console.log(chalk.yellow('   ⚠️  Tests failed'));
      // Don't fail build on test failure, just warn
    } else {
      console.log(chalk.green('   ✅ Tests passed'));
    }

    // Step 3: Package
    const packageResult = await this.package();
    if (!packageResult.success) {
      console.log(chalk.red('   ❌ Packaging failed'));
      return packageResult;
    }
    if (packageResult.output) {
      console.log(chalk.green('   ✅ Packaging successful'));
    }

    return {
      success: true,
      output: [
        compileResult.output,
        testResult.output,
        packageResult.output
      ].filter(Boolean).join('\n\n')
    };
  }

  /**
   * Get project info
   */
  getProjectInfo(): ProjectInfo {
    return this.projectInfo;
  }

  /**
   * Check if project has build tool configured
   */
  hasBuildTool(): boolean {
    return this.projectInfo.language !== 'unknown';
  }

  /**
   * Get build tool name
   */
  getBuildToolName(): string {
    switch (this.projectInfo.language) {
      case 'java':
        return this.projectInfo.buildTool === 'maven' ? 'Maven' : 'Gradle';
      case 'node':
        return this.projectInfo.packageManager || 'npm';
      case 'python':
        return this.projectInfo.buildTool || 'pip';
      default:
        return 'Unknown';
    }
  }

  /**
   * Format build output for display
   */
  static formatBuildOutput(result: BuildResult): string {
    if (result.success) {
      let output = chalk.green('✅ Build successful');
      if (result.duration) {
        output += chalk.gray(` (${(result.duration / 1000).toFixed(2)}s)`);
      }
      return output;
    } else {
      let output = chalk.red('❌ Build failed');
      if (result.error) {
        // Show first few lines of error
        const lines = result.error.split('\n').slice(0, 10);
        output += '\n' + chalk.gray(lines.join('\n'));
        if (result.error.split('\n').length > 10) {
          output += chalk.gray('\n... (truncated)');
        }
      }
      return output;
    }
  }
}
