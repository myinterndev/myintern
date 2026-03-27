import { Command } from 'commander';
import chalk from 'chalk';

/**
 * License command - All features are now free and open source.
 */
export function registerLicenseCommand(program: Command): void {
  program
    .command('license')
    .description('License information')
    .action(() => {
      console.log(chalk.green('All MyIntern features are free and open source.'));
      console.log(chalk.gray('No license key required.'));
    });
}
