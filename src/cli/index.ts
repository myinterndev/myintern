#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init';
import { startCommand } from './commands/start';
import { stopCommand } from './commands/stop';
import { statusCommand } from './commands/status';
import { chatCommand } from './commands/chat';
import { configCommand } from './commands/config';
import { reviewCommand } from './commands/review';
import { fixCommand } from './commands/fix';
import { rollbackCommand } from './commands/rollback';
import { githubCommand } from './commands/github';
import { importSpeckit } from './commands/import-speckit';
import { guardrailsCommand } from './commands/guardrails';
import { diffCommand } from './commands/diff';

const program = new Command();

program
  .name('myintern')
  .description('Your AI Junior Developer for Java/Spring Boot Projects')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize MyIntern in your Spring Boot project')
  .action(initCommand);

program
  .command('start')
  .description('Start MyIntern agents')
  .option('-a, --agent <name>', 'Start specific agent (code, test, build, review)')
  .option('-f, --foreground', 'Run in foreground (see logs)')
  .action(startCommand);

program
  .command('stop')
  .description('Stop MyIntern agents')
  .option('-a, --agent <name>', 'Stop specific agent')
  .action(stopCommand);

program
  .command('status')
  .description('Show execution status of specs')
  .option('--failed', 'Show only failed specs')
  .option('--json', 'Output in JSON format')
  .action(statusCommand);

program
  .command('diff')
  .description('Preview changes for a spec without applying them')
  .requiredOption('--spec <name>', 'Spec file name (e.g., spec-001.md or spec-001)')
  .action(diffCommand);

program
  .command('chat')
  .description('Interactive chat with MyIntern')
  .action(chatCommand);

program
  .command('config')
  .description('Manage configuration')
  .argument('<action>', 'get, set, or list')
  .argument('[key]', 'Configuration key')
  .argument('[value]', 'Configuration value (for set)')
  .action(configCommand);

program
  .command('review')
  .description('Audit codebase for issues (zero-setup)')
  .option('--focus <type>', 'Focus area: security, quality, performance, all', 'all')
  .option('--severity <level>', 'Minimum severity: critical, high, medium, low, all', 'all')
  .option('--auto-fix', 'Automatically fix issues')
  .action(reviewCommand);

program
  .command('fix')
  .description('Auto-fix violations from review')
  .option('--review', 'Run review first, then fix')
  .option('--report <path>', 'Fix from existing report')
  .action(fixCommand);

program
  .command('rollback')
  .description('Rollback MyIntern changes')
  .option('--id <changeId>', 'Rollback specific change')
  .option('--list', 'List rollback history')
  .option('--force', 'Force rollback even if already rolled back')
  .action(rollbackCommand);

program
  .command('github')
  .description('Sync GitHub issues to specs')
  .option('--sync', 'Sync issues to specs')
  .option('--labels <labels>', 'Filter by labels (comma-separated)', 'myintern')
  .option('--assigned-to <user>', 'Filter by assignee')
  .option('--state <state>', 'Issue state: open, closed, all', 'open')
  .option('--close <number>', 'Close issue number')
  .action(githubCommand);

program.addCommand(importSpeckit);
program.addCommand(guardrailsCommand);

program.parse();
