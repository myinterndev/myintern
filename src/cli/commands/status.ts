import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

interface ExecutionLog {
  timestamp: string;
  spec: string;
  branch: string;
  status: 'success' | 'failed' | 'in_progress';
  files_changed?: number;
  build_result?: string;
  tests_generated?: number;
  error?: string;
  retry_count?: number;
}

interface ExecutionLogs {
  executions: ExecutionLog[];
}

interface StatusOptions {
  failed?: boolean;
  json?: boolean;
}

/**
 * myintern status command
 *
 * Shows execution status of specs with filtering options
 *
 * NEW in v1.2: Provides visibility into spec execution status
 */
export async function statusCommand(options: StatusOptions = {}) {
  try {
    const projectRoot = process.cwd();
    const logsPath = path.join(projectRoot, '.myintern', 'logs', 'executions.json');

    if (!fs.existsSync(logsPath)) {
      console.log(chalk.yellow('⚠️  No execution logs found'));
      console.log(chalk.gray('   Run myintern start to begin tracking executions\n'));
      return;
    }

    const logsContent = fs.readFileSync(logsPath, 'utf-8');
    const logs: ExecutionLogs = JSON.parse(logsContent);

    if (!logs.executions || logs.executions.length === 0) {
      console.log(chalk.yellow('⚠️  No executions recorded yet\n'));
      return;
    }

    // Filter if --failed option is provided
    let executions = logs.executions;
    if (options.failed) {
      executions = executions.filter(e => e.status === 'failed');
    }

    if (executions.length === 0) {
      console.log(chalk.yellow('⚠️  No failed executions found\n'));
      return;
    }

    // Output as JSON if requested
    if (options.json) {
      console.log(JSON.stringify(executions, null, 2));
      return;
    }

    // Pretty-print status
    console.log(chalk.bold('\n📊 MyIntern Execution Status\n'));

    // Group by status
    const successful = executions.filter(e => e.status === 'success');
    const failed = executions.filter(e => e.status === 'failed');
    const inProgress = executions.filter(e => e.status === 'in_progress');

    // Display each execution
    for (const exec of executions) {
      const icon = getStatusIcon(exec.status);
      const color = getStatusColor(exec.status);

      console.log(color(`${icon} ${exec.spec}`));
      console.log(chalk.gray(`   Branch: ${exec.branch}`));
      console.log(chalk.gray(`   Status: ${formatStatus(exec)}`));
      console.log(chalk.gray(`   Last run: ${formatTimestamp(exec.timestamp)}`));

      if (exec.error) {
        console.log(chalk.red(`   Error: ${exec.error}`));
      }

      if (exec.retry_count && exec.retry_count > 0) {
        console.log(chalk.yellow(`   Retries: ${exec.retry_count}/3`));
      }

      console.log();
    }

    // Summary
    console.log(chalk.bold('Summary:'));
    console.log(chalk.green(`  ✅ ${successful.length} successful`));
    if (failed.length > 0) {
      console.log(chalk.red(`  ❌ ${failed.length} failed`));
    }
    if (inProgress.length > 0) {
      console.log(chalk.blue(`  🔄 ${inProgress.length} in progress`));
    }
    console.log();

  } catch (error: any) {
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'success':
      return '✅';
    case 'failed':
      return '⚠️ ';
    case 'in_progress':
      return '🔄';
    default:
      return '•';
  }
}

function getStatusColor(status: string): typeof chalk.green {
  switch (status) {
    case 'success':
      return chalk.green;
    case 'failed':
      return chalk.red;
    case 'in_progress':
      return chalk.blue;
    default:
      return chalk.gray;
  }
}

function formatStatus(exec: ExecutionLog): string {
  if (exec.status === 'success') {
    const parts = ['Build passed'];
    if (exec.tests_generated) {
      parts.push(`${exec.tests_generated} tests generated`);
    }
    return parts.join(', ');
  }

  if (exec.status === 'failed') {
    if (exec.retry_count && exec.retry_count >= 3) {
      return `Build failed (retry ${exec.retry_count}/3)`;
    }
    return exec.build_result || 'Failed';
  }

  if (exec.status === 'in_progress') {
    return 'In progress (building...)';
  }

  return 'Unknown';
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}
