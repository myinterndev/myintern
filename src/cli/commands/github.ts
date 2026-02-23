import chalk from 'chalk';
import inquirer from 'inquirer';
import { GitHubIssueSync } from '../../integrations/github/GitHubIssueSync';

/**
 * GitHub command - Sync GitHub issues to specs
 */
export async function githubCommand(options: {
  sync?: boolean;
  labels?: string;
  assignedTo?: string;
  state?: 'open' | 'closed' | 'all';
  close?: number; // Close issue number
}): Promise<void> {
  try {
    // Get GitHub token
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

    if (!token) {
      console.log(chalk.red('\n❌ GitHub token not found\n'));
      console.log(chalk.gray('   Set GITHUB_TOKEN or GH_TOKEN environment variable'));
      console.log(chalk.gray('   Create token at: https://github.com/settings/tokens\n'));
      process.exit(1);
    }

    const githubSync = new GitHubIssueSync(process.cwd(), token);

    if (options.close) {
      // Close issue
      console.log(chalk.blue(`\n📌 Closing GitHub issue #${options.close}\n`));

      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'comment',
          message: 'Add comment (optional):',
          default: '✅ Completed by MyIntern'
        },
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Close this issue?',
          default: true
        }
      ]);

      if (!answers.confirm) {
        console.log(chalk.yellow('\n⚠️  Cancelled\n'));
        return;
      }

      await githubSync.closeIssue(
        options.close,
        answers.comment || undefined
      );

      return;
    }

    if (options.sync) {
      // Sync issues
      const labels = options.labels ? options.labels.split(',').map(l => l.trim()) : ['myintern'];

      const result = await githubSync.sync({
        labels,
        assignedTo: options.assignedTo,
        state: options.state || 'open',
        autoGenerate: true
      });

      if (result.synced > 0) {
        console.log(chalk.green('\n✅ Sync complete\n'));

        if (result.created > 0) {
          console.log(chalk.gray(`   💡 Run: myintern start`));
          console.log(chalk.gray(`   to begin processing new specs\n`));
        }
      }

    } else {
      // Interactive mode
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: 'Sync issues to specs', value: 'sync' },
            { name: 'Close an issue', value: 'close' }
          ]
        }
      ]);

      if (answers.action === 'sync') {
        const syncAnswers = await inquirer.prompt([
          {
            type: 'input',
            name: 'labels',
            message: 'Labels to filter (comma-separated):',
            default: 'myintern'
          },
          {
            type: 'list',
            name: 'state',
            message: 'Issue state:',
            choices: ['open', 'closed', 'all'],
            default: 'open'
          }
        ]);

        const labels = syncAnswers.labels.split(',').map((l: string) => l.trim());

        await githubSync.sync({
          labels,
          state: syncAnswers.state,
          autoGenerate: true
        });

      } else if (answers.action === 'close') {
        const closeAnswers = await inquirer.prompt([
          {
            type: 'number',
            name: 'issueNumber',
            message: 'Issue number to close:'
          },
          {
            type: 'input',
            name: 'comment',
            message: 'Add comment (optional):',
            default: '✅ Completed by MyIntern'
          }
        ]);

        await githubSync.closeIssue(
          closeAnswers.issueNumber,
          closeAnswers.comment || undefined
        );
      }
    }

  } catch (error: any) {
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}
