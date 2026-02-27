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
import { runCommand } from './commands/run';
import { doctorCommand } from './commands/doctor';
import { explainCommand } from './commands/explain';
import { auditCommand } from './commands/audit';

const program = new Command();

program
  .name('myintern')
  .description('Your AI Junior Developer for Java/Spring Boot Projects')
  .version('1.2.3');

program
  .command('init')
  .description('Initialize MyIntern in your Spring Boot project')
  .action(initCommand);

program
  .command('run <task>')
  .description('Zero-config: Run a task immediately (auto-detects language, auth, context)')
  .option('-y, --yes', 'Auto-approve changes without confirmation')
  .action(runCommand);

program
  .command('start')
  .description('Start MyIntern agents')
  .option('-a, --agent <name>', 'Start specific agent (code, test, build, review)')
  .option('-f, --foreground', 'Run in foreground (see logs)')
  .option('-v, --verbose', 'Show verbose Maven/build output')
  .option('-j, --jira <ticket>', 'Fetch Jira ticket and create spec (e.g., PROJ-123)')
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

program
  .command('doctor')
  .description('Validate environment setup (Java, Maven, API keys, git, config)')
  .option('--fix', 'Attempt to auto-fix issues (where possible)')
  .action(doctorCommand);

program
  .command('explain')
  .description('Show the exact LLM prompt that would be sent (transparency mode)')
  .option('--spec <name>', 'Explain prompt for a spec file')
  .option('--task <task>', 'Explain prompt for a run task')
  .option('--full', 'Show full prompt without truncation')
  .option('--json', 'Output as JSON')
  .action(explainCommand);

program
  .command('audit')
  .description('View the immutable audit trail for all LLM-generated code')
  .option('--spec <name>', 'Filter by spec name or Jira ticket (e.g., PROJ-123)')
  .option('--file <path>', 'Filter by generated file path')
  .option('--status <status>', 'Filter by status: success, failed, retry')
  .option('--limit <n>', 'Max entries to show (default: 50)')
  .option('--since <date>', 'Show entries since date (e.g., 2025-01-01)')
  .option('--json', 'Output as raw JSON (machine-readable)')
  .option('--path', 'Print audit log file path and exit')
  .action(auditCommand);

program.parse();
