import * as chokidar from 'chokidar';
import * as fs from 'fs';
import * as path from 'path';
import { Agent } from '../core/Agent';
import { AnthropicProvider } from '../integrations/ai/AnthropicProvider';
import { MavenBuilder } from '../integrations/build/MavenBuilder';
import chalk from 'chalk';

export class CodeAgent extends Agent {
  private watcher: chokidar.FSWatcher | null = null;
  private aiProvider: AnthropicProvider;
  private builder: MavenBuilder;

  constructor() {
    super('code-agent');
    this.aiProvider = new AnthropicProvider(this.config);
    this.builder = new MavenBuilder();
  }

  async start(): Promise<void> {
    this.log('Starting Code Agent...', 'info');
    this.running = true;

    // Ensure specs directory exists
    const specsDir = path.join(process.cwd(), 'specs');
    if (!fs.existsSync(specsDir)) {
      fs.mkdirSync(specsDir, { recursive: true });
      this.log('Created specs/ directory', 'info');
    }

    // Watch specs directory for *SPEC.md and *TODO.md files
    const patterns = [
      path.join(specsDir, '**/*SPEC.md'),
      path.join(specsDir, '**/*TODO.md')
    ];

    this.watcher = chokidar.watch(patterns, {
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    });

    this.watcher.on('add', (filePath) => this.handleSpecFile(filePath));
    this.watcher.on('change', (filePath) => this.handleSpecFile(filePath));

    console.log(chalk.green('✅ Code Agent started'));
    console.log(chalk.gray(`   Watching: ${specsDir}`));
    console.log(chalk.gray('   Looking for: *SPEC.md, *TODO.md files\n'));
  }

  async stop(): Promise<void> {
    this.log('Stopping Code Agent...', 'info');
    if (this.watcher) {
      await this.watcher.close();
    }
    this.running = false;
    this.log('Code Agent stopped', 'info');
  }

  private async handleSpecFile(filePath: string): Promise<void> {
    const fileName = path.basename(filePath);
    console.log(chalk.blue(`\n📋 Detected spec file: ${fileName}`));

    try {
      const specContent = fs.readFileSync(filePath, 'utf-8');

      // Check if has TODOs or pending implementation
      if (!specContent.match(/TODO|PENDING|IMPLEMENT/i)) {
        console.log(chalk.gray('   No pending tasks found, skipping'));
        return;
      }

      console.log(chalk.blue('   🤖 Analyzing specification...'));
      this.log(`Processing spec: ${fileName}`, 'info');

      // Generate code using AI
      const implementation = await this.aiProvider.generateCode(specContent);

      console.log(chalk.green('   ✅ Code generated'));
      console.log(chalk.gray(`   Summary: ${implementation.summary}`));

      // Apply generated code
      for (const file of implementation.files) {
        const fullPath = path.join(process.cwd(), file.path);
        const dir = path.dirname(fullPath);

        // Create directory if needed
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // Write file
        fs.writeFileSync(fullPath, file.content, 'utf-8');

        const action = file.action === 'create' ? '📝 Created' : '✏️  Modified';
        console.log(chalk.green(`   ${action}: ${file.path}`));
        this.log(`${file.action}: ${file.path}`, 'info');
      }

      // Compile and test
      if (this.builder.isMavenProject()) {
        console.log(chalk.blue('\n   🔨 Compiling...'));
        const compileResult = await this.builder.compile();

        if (!compileResult.success) {
          console.log(chalk.red('   ❌ Compilation failed'));
          console.log(chalk.red(`   ${compileResult.error}`));
          this.log(`Compilation failed: ${compileResult.error}`, 'error');
          return;
        }

        console.log(chalk.green('   ✅ Compilation successful'));

        // Check if tests exist
        const testDir = path.join(process.cwd(), 'src', 'test', 'java');
        if (fs.existsSync(testDir)) {
          console.log(chalk.blue('   🧪 Running tests...'));
          const testResult = await this.builder.test();

          if (testResult.success) {
            console.log(chalk.green('   ✅ All tests passed!'));
          } else {
            console.log(chalk.yellow('   ⚠️  Some tests failed'));
            console.log(chalk.gray('   (Test failures are expected for new code without tests)'));
          }
        }
      }

      console.log(chalk.green(`\n✨ Implementation complete!`));
      console.log(chalk.gray(`   Commit message: ${implementation.commit_message}\n`));

      // Save notification
      this.saveNotification({
        timestamp: new Date().toISOString(),
        spec: fileName,
        files: implementation.files.length,
        commit_message: implementation.commit_message,
        summary: implementation.summary
      });

    } catch (error: any) {
      console.log(chalk.red(`   ❌ Error: ${error.message}`));
      this.log(`Error processing spec: ${error.message}`, 'error');
    }
  }

  private saveNotification(notification: any): void {
    const notificationsFile = path.join(process.cwd(), '.myintern', 'logs', 'notifications.json');
    let notifications: any[] = [];

    if (fs.existsSync(notificationsFile)) {
      notifications = JSON.parse(fs.readFileSync(notificationsFile, 'utf-8'));
    }

    notifications.push(notification);
    fs.writeFileSync(notificationsFile, JSON.stringify(notifications, null, 2));
  }
}
