import chalk from 'chalk';

export async function startCommand(options?: { agent?: string; foreground?: boolean }) {
  console.log(chalk.blue('🚀 MyIntern Start - Coming soon!'));
  console.log(chalk.gray('This command will start MyIntern agents.'));
}
