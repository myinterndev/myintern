import chalk from 'chalk';
import { AuditLogger } from '../../core/AuditLogger';

interface AuditOptions {
  spec?: string;
  file?: string;
  status?: string;
  limit?: string;
  since?: string;
  json?: boolean;
  path?: boolean;
}

export async function auditCommand(options: AuditOptions = {}): Promise<void> {
  const repoPath = process.cwd();
  const auditLogger = new AuditLogger(repoPath);

  // --path flag: just print the audit file location
  if (options.path) {
    console.log(auditLogger.getAuditFilePath());
    return;
  }

  const entries = auditLogger.query({
    spec: options.spec,
    file: options.file,
    status: options.status,
    limit: options.limit ? parseInt(options.limit, 10) : 50,
    since: options.since,
  });

  if (options.json) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  if (entries.length === 0) {
    console.log(chalk.yellow('No audit entries found.'));
    if (options.spec || options.file || options.status) {
      console.log(chalk.gray('Try removing filters or run some specs first.'));
    } else {
      console.log(chalk.gray('Run a spec or task to generate audit entries.'));
    }
    return;
  }

  console.log(chalk.bold.blue(`\n📋 MyIntern Audit Log (${entries.length} entries)\n`));

  const statusColor = (s: string) => {
    if (s === 'success') return chalk.green(s);
    if (s === 'failed') return chalk.red(s);
    return chalk.yellow(s);
  };

  for (const entry of entries) {
    const ts = new Date(entry.timestamp).toLocaleString();
    const dur = entry.duration_ms < 1000
      ? `${entry.duration_ms}ms`
      : `${(entry.duration_ms / 1000).toFixed(1)}s`;

    console.log(chalk.bold(`┌─ ${entry.spec}`) + chalk.gray(` [${entry.audit_id}]`));
    console.log(chalk.gray(`│  Timestamp : `) + ts);
    console.log(chalk.gray(`│  Status    : `) + statusColor(entry.status) + chalk.gray(` (${dur})`));
    console.log(chalk.gray(`│  Model     : `) + chalk.cyan(`${entry.llm_provider}/${entry.llm_model}`));
    console.log(chalk.gray(`│  Prompt    : `) + chalk.dim(entry.prompt_hash));
    console.log(chalk.gray(`│  Tokens    : `) + `~${entry.prompt_tokens_estimate.toLocaleString()} (est)`);
    console.log(chalk.gray(`│  User      : `) + entry.user);
    console.log(chalk.gray(`│  Commit    : `) + chalk.yellow(entry.git_commit) + chalk.gray(` @ ${entry.git_branch}`));

    if (entry.jira_ticket) {
      console.log(chalk.gray(`│  Jira      : `) + chalk.blue(entry.jira_ticket));
    }

    if (entry.generated_files.length > 0) {
      console.log(chalk.gray(`│  Files     :`));
      for (const f of entry.generated_files) {
        console.log(chalk.gray(`│    `) + chalk.green(`+ ${f}`));
      }
    }

    if (entry.retry_count && entry.retry_count > 0) {
      console.log(chalk.gray(`│  Retries   : `) + chalk.yellow(entry.retry_count));
    }

    if (entry.error) {
      console.log(chalk.gray(`│  Error     : `) + chalk.red(entry.error));
    }

    console.log(chalk.gray(`└${'─'.repeat(60)}`));
    console.log();
  }

  console.log(chalk.gray(`Audit log: ${auditLogger.getAuditFilePath()}`));
  console.log(chalk.gray(`Use --json for machine-readable output, --spec / --file / --status to filter.\n`));
}
