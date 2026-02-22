#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init';
import { startCommand } from './commands/start';
import { stopCommand } from './commands/stop';
import { statusCommand } from './commands/status';
import { chatCommand } from './commands/chat';
import { configCommand } from './commands/config';

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
  .description('Show status of MyIntern agents')
  .action(statusCommand);

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

program.parse();
