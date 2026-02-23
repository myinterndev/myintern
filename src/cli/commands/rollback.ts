import chalk from 'chalk';
import inquirer from 'inquirer';
import { RollbackManager } from '../../core/RollbackManager';

/**
 * Rollback command - Rollback MyIntern changes
 */
export async function rollbackCommand(options: {
  id?: string;
  list?: boolean;
  force?: boolean;
}): Promise<void> {
  try {
    const rollbackManager = new RollbackManager();

    if (options.list) {
      // List all changes
      const changes = rollbackManager.listChanges();

      if (changes.length === 0) {
        console.log(chalk.yellow('\n⚠️  No rollback history found\n'));
        return;
      }

      console.log(chalk.blue('\n📜 Rollback History:\n'));

      changes.slice(0, 20).reverse().forEach((change, idx) => {
        const status = change.canRollback ? chalk.green('✓ Can rollback') : chalk.gray('✗ Already rolled back');
        console.log(chalk.white(`${idx + 1}. ${change.id}`));
        console.log(chalk.gray(`   Spec: ${change.spec}`));
        console.log(chalk.gray(`   Branch: ${change.branch}`));
        console.log(chalk.gray(`   Time: ${change.timestamp}`));
        console.log(chalk.gray(`   Files: ${change.files.length}`));
        console.log(`   ${status}`);
        console.log();
      });

      return;
    }

    if (options.id) {
      // Rollback specific change
      console.log(chalk.blue(`\n🔄 Rolling back change: ${options.id}\n`));

      const result = await rollbackManager.rollback(options.id, { force: options.force });

      if (result.success) {
        console.log(chalk.green(`\n✅ ${result.message}\n`));
        console.log(chalk.gray(`   Files restored: ${result.filesRestored.length}`));
        result.filesRestored.forEach(file => {
          console.log(chalk.gray(`   - ${file}`));
        });
        console.log();
      } else {
        console.log(chalk.red(`\n❌ ${result.message}\n`));
        process.exit(1);
      }

    } else {
      // Interactive mode - show recent changes and let user choose
      const recentChanges = rollbackManager.getRecentChanges(10);

      if (recentChanges.length === 0) {
        console.log(chalk.yellow('\n⚠️  No rollback history found\n'));
        return;
      }

      const choices = recentChanges
        .filter(c => c.canRollback)
        .map(c => ({
          name: `${c.spec} (${c.branch}) - ${c.timestamp} - ${c.files.length} files`,
          value: c.id
        }));

      if (choices.length === 0) {
        console.log(chalk.yellow('\n⚠️  No changes available for rollback\n'));
        return;
      }

      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'changeId',
          message: 'Select change to rollback:',
          choices
        },
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Are you sure you want to rollback this change?',
          default: false
        }
      ]);

      if (!answers.confirm) {
        console.log(chalk.yellow('\n⚠️  Rollback cancelled\n'));
        return;
      }

      const result = await rollbackManager.rollback(answers.changeId);

      if (result.success) {
        console.log(chalk.green(`\n✅ ${result.message}\n`));
        console.log(chalk.gray(`   Files restored: ${result.filesRestored.length}`));
        result.filesRestored.forEach(file => {
          console.log(chalk.gray(`   - ${file}`));
        });
        console.log();
      } else {
        console.log(chalk.red(`\n❌ ${result.message}\n`));
        process.exit(1);
      }
    }

  } catch (error: any) {
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}
