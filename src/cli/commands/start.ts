import chalk from 'chalk';
import { CodeAgent } from '../../agents/CodeAgent';
import { ConfigManager } from '../../core/ConfigManager';

export async function startCommand(options?: { agent?: string; foreground?: boolean }) {
  console.log(chalk.blue.bold('\n🚀 Starting MyIntern Agent (Java/Spring Boot)\n'));

  // Check if initialized
  const configManager = new ConfigManager();
  if (!configManager.exists()) {
    console.log(chalk.red('❌ MyIntern not initialized'));
    console.log(chalk.gray('   Run: myintern init\n'));
    return;
  }

  try {
    // Start Code Agent
    const codeAgent = new CodeAgent();
    await codeAgent.start();

    console.log(chalk.gray('Press Ctrl+C to stop\n'));

    // Keep process alive and handle shutdown
    process.on('SIGINT', async () => {
      console.log(chalk.yellow('\n\n👋 Stopping MyIntern agents...'));
      await codeAgent.stop();
      console.log(chalk.green('✅ Agents stopped\n'));
      process.exit(0);
    });

    // Keep process alive
    await new Promise(() => {});

  } catch (error: any) {
    console.log(chalk.red(`\n❌ Failed to start: ${error.message}\n`));
    process.exit(1);
  }
}
