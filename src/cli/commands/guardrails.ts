/**
 * Guardrails CLI Command
 *
 * Commands:
 * - myintern guardrails scan <file|--all>     # Scan files for sensitive data
 * - myintern guardrails override              # Add false positive override
 * - myintern guardrails logs                  # View guardrails audit logs
 * - myintern guardrails audit                 # Export compliance audit report
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { GuardrailsManager } from '../../core/GuardrailsManager';
import { GuardrailsConfig, SensitivityLevel, RedactionMode } from '../../core/SensitiveDataDetector';
import { ConfigManager } from '../../core/ConfigManager';

export const guardrailsCommand = new Command('guardrails')
  .description('Manage sensitive data protection (PII, PHI, credentials)')
  .addCommand(
    new Command('scan')
      .description('Scan files for sensitive data')
      .argument('[file]', 'File to scan (omit for all files)')
      .option('--all', 'Scan all files in project')
      .option('--path <path>', 'Scan specific directory')
      .action(scanCommand)
  )
  .addCommand(
    new Command('override')
      .description('Add false positive override')
      .requiredOption('--file <path>', 'File path')
      .requiredOption('--pattern <pattern>', 'Pattern to override (e.g., "SSN", "API_KEY")')
      .requiredOption('--reason <reason>', 'Reason for override')
      .option('--expires <date>', 'Expiration date (YYYY-MM-DD)')
      .action(overrideCommand)
  )
  .addCommand(
    new Command('remove-override')
      .description('Remove false positive override')
      .requiredOption('--file <path>', 'File path')
      .requiredOption('--pattern <pattern>', 'Pattern to remove')
      .action(removeOverrideCommand)
  )
  .addCommand(
    new Command('logs')
      .description('View guardrails audit logs')
      .option('--tail <n>', 'Show last N entries', '20')
      .option('--json', 'Output as JSON')
      .action(logsCommand)
  )
  .addCommand(
    new Command('audit')
      .description('Export compliance audit report')
      .option('--since <duration>', 'Report timeframe (e.g., 30d, 7d, 24h)', '30d')
      .option('--format <format>', 'Output format: json, csv, html', 'json')
      .option('--output <file>', 'Output file (defaults to stdout)')
      .action(auditCommand)
  );

/**
 * Scan command implementation
 */
async function scanCommand(file: string | undefined, options: { all?: boolean; path?: string }) {
  try {
    const cwd = process.cwd();
    const config = await loadConfig(cwd);

    if (!config.guardrails?.enabled) {
      console.log(chalk.yellow('⚠️  Guardrails are disabled in agent.yml'));
      console.log(chalk.gray('   Enable with: guardrails.enabled: true'));
      return;
    }

    const logPath = path.join(cwd, '.myintern', 'logs');
    if (!fs.existsSync(logPath)) {
      fs.mkdirSync(logPath, { recursive: true });
    }

    const manager = new GuardrailsManager(config.guardrails, logPath);

    // Determine files to scan
    let filesToScan: Array<{ path: string; content: string }> = [];

    if (options.all) {
      console.log(chalk.blue('🔍 Scanning all files in project...'));
      filesToScan = await collectAllFiles(cwd, config.guardrails);
    } else if (options.path) {
      console.log(chalk.blue(`🔍 Scanning directory: ${options.path}`));
      filesToScan = await collectFilesInDirectory(options.path, config.guardrails);
    } else if (file) {
      console.log(chalk.blue(`🔍 Scanning file: ${file}`));
      const filePath = path.resolve(cwd, file);
      if (!fs.existsSync(filePath)) {
        console.error(chalk.red(`❌ File not found: ${file}`));
        process.exit(1);
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      filesToScan = [{ path: file, content }];
    } else {
      console.error(chalk.red('❌ Please specify --all, --path, or a file path'));
      process.exit(1);
    }

    // Run scan
    const result = await manager.validateFiles(filesToScan);

    // Display results
    console.log('\n' + manager.generateSummary(result));

    if (result.violations.length > 0) {
      console.log(chalk.bold('\n📋 Violations by File:'));
      result.violations.forEach(fileResult => {
        if (fileResult.violations.length > 0) {
          console.log(chalk.yellow(`\n   ${fileResult.filePath}:`));
          fileResult.violations.forEach(violation => {
            const levelIcon = getLevelIcon(violation.level);
            console.log(
              `      ${levelIcon} Line ${violation.line}: ${violation.category.toUpperCase()} - ${violation.pattern}`
            );
            console.log(chalk.gray(`         "${violation.match.substring(0, 50)}..."`));
          });
        }
      });

      if (!result.allowed) {
        console.log(chalk.red('\n❌ Execution blocked. Use --override to bypass false positives.'));
        process.exit(1);
      }
    }

  } catch (error) {
    console.error(chalk.red('❌ Scan failed:'), error);
    process.exit(1);
  }
}

/**
 * Override command implementation
 */
async function overrideCommand(options: {
  file: string;
  pattern: string;
  reason: string;
  expires?: string;
}) {
  try {
    const cwd = process.cwd();
    const config = await loadConfig(cwd);

    const logPath = path.join(cwd, '.myintern', 'logs');
    if (!fs.existsSync(logPath)) {
      fs.mkdirSync(logPath, { recursive: true });
    }

    const manager = new GuardrailsManager(config.guardrails || getDefaultGuardrailsConfig(), logPath);

    const override = {
      filePath: options.file,
      pattern: options.pattern,
      reason: options.reason,
      expiresAt: options.expires ? new Date(options.expires) : undefined
    };

    manager.addOverride(override);

    console.log(chalk.green('✅ Override added successfully'));
    console.log(chalk.gray(`   File: ${options.file}`));
    console.log(chalk.gray(`   Pattern: ${options.pattern}`));
    console.log(chalk.gray(`   Reason: ${options.reason}`));
    if (override.expiresAt) {
      console.log(chalk.gray(`   Expires: ${override.expiresAt.toISOString().split('T')[0]}`));
    }

  } catch (error) {
    console.error(chalk.red('❌ Failed to add override:'), error);
    process.exit(1);
  }
}

/**
 * Remove override command implementation
 */
async function removeOverrideCommand(options: { file: string; pattern: string }) {
  try {
    const cwd = process.cwd();
    const config = await loadConfig(cwd);

    const logPath = path.join(cwd, '.myintern', 'logs');
    const manager = new GuardrailsManager(config.guardrails || getDefaultGuardrailsConfig(), logPath);

    manager.removeOverride(options.file, options.pattern);

    console.log(chalk.green('✅ Override removed successfully'));
    console.log(chalk.gray(`   File: ${options.file}`));
    console.log(chalk.gray(`   Pattern: ${options.pattern}`));

  } catch (error) {
    console.error(chalk.red('❌ Failed to remove override:'), error);
    process.exit(1);
  }
}

/**
 * Logs command implementation
 */
async function logsCommand(options: { tail: string; json?: boolean }) {
  try {
    const cwd = process.cwd();
    const logPath = path.join(cwd, '.myintern', 'logs', 'guardrails.log');

    if (!fs.existsSync(logPath)) {
      console.log(chalk.yellow('⚠️  No guardrails logs found'));
      return;
    }

    const content = fs.readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l.trim());
    const tailCount = parseInt(options.tail, 10);
    const recentLines = lines.slice(-tailCount);

    if (options.json) {
      const entries = recentLines.map(line => JSON.parse(line));
      console.log(JSON.stringify(entries, null, 2));
    } else {
      console.log(chalk.bold('📋 Recent Guardrails Logs:\n'));
      recentLines.forEach(line => {
        const entry = JSON.parse(line);
        const timestamp = new Date(entry.timestamp).toLocaleString();
        const actionColor = entry.action === 'BLOCKED' ? chalk.red : chalk.yellow;

        console.log(`${chalk.gray(timestamp)} ${actionColor(entry.action)}`);
        entry.violations.forEach((fileViolation: any) => {
          console.log(chalk.blue(`  ${fileViolation.filePath}:`));
          fileViolation.violations.forEach((v: any) => {
            const levelIcon = getLevelIcon(v.level);
            console.log(`    ${levelIcon} Line ${v.line}: ${v.category} - ${v.pattern}`);
          });
        });
        console.log('');
      });
    }

  } catch (error) {
    console.error(chalk.red('❌ Failed to read logs:'), error);
    process.exit(1);
  }
}

/**
 * Audit command implementation
 */
async function auditCommand(options: { since: string; format: string; output?: string }) {
  try {
    const cwd = process.cwd();
    const logPath = path.join(cwd, '.myintern', 'logs', 'guardrails.log');

    if (!fs.existsSync(logPath)) {
      console.log(chalk.yellow('⚠️  No guardrails logs found'));
      return;
    }

    // Parse timeframe
    const since = parseDuration(options.since);
    const cutoffDate = new Date(Date.now() - since);

    // Load logs
    const content = fs.readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l.trim());
    const entries = lines
      .map(line => JSON.parse(line))
      .filter(entry => new Date(entry.timestamp) >= cutoffDate);

    // Generate report
    let report: string;
    switch (options.format) {
      case 'json':
        report = JSON.stringify(generateAuditReport(entries), null, 2);
        break;
      case 'csv':
        report = generateCSVReport(entries);
        break;
      case 'html':
        report = generateHTMLReport(entries);
        break;
      default:
        console.error(chalk.red(`❌ Unknown format: ${options.format}`));
        process.exit(1);
    }

    // Output
    if (options.output) {
      fs.writeFileSync(options.output, report);
      console.log(chalk.green(`✅ Audit report saved to: ${options.output}`));
    } else {
      console.log(report);
    }

  } catch (error) {
    console.error(chalk.red('❌ Failed to generate audit report:'), error);
    process.exit(1);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

async function loadConfig(cwd: string): Promise<any> {
  const configPath = path.join(cwd, '.myintern', 'agent.yml');
  if (!fs.existsSync(configPath)) {
    console.log(chalk.yellow('⚠️  No .myintern/agent.yml found, using defaults'));
    return { guardrails: getDefaultGuardrailsConfig() };
  }

  const configManager = new ConfigManager(configPath);
  return await configManager.load();
}

function getDefaultGuardrailsConfig(): GuardrailsConfig {
  return {
    enabled: true,
    mode: RedactionMode.MASK,
    stopOnCritical: true,
    categories: {
      pii: true,
      phi: true,
      credentials: true,
      custom: false
    },
    whitelist: []
  };
}

async function collectAllFiles(
  cwd: string,
  config: GuardrailsConfig
): Promise<Array<{ path: string; content: string }>> {
  const files: Array<{ path: string; content: string }> = [];

  const srcDir = path.join(cwd, 'src');
  if (!fs.existsSync(srcDir)) {
    console.error(chalk.red('❌ src/ directory not found'));
    process.exit(1);
  }

  const walkDir = (dir: string) => {
    const items = fs.readdirSync(dir);
    items.forEach(item => {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        // Skip ignored directories
        if (['target', 'build', 'dist', 'node_modules', '.git'].includes(item)) {
          return;
        }
        walkDir(fullPath);
      } else if (stat.isFile()) {
        // Check whitelist
        const relativePath = path.relative(cwd, fullPath);
        if (isWhitelisted(relativePath, config.whitelist || [])) {
          return;
        }

        // Only scan text files
        if (['.java', '.ts', '.js', '.yml', '.yaml', '.properties', '.xml'].some(ext => item.endsWith(ext))) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          files.push({ path: relativePath, content });
        }
      }
    });
  };

  walkDir(srcDir);
  return files;
}

async function collectFilesInDirectory(
  dirPath: string,
  config: GuardrailsConfig
): Promise<Array<{ path: string; content: string }>> {
  const files: Array<{ path: string; content: string }> = [];
  const cwd = process.cwd();
  const fullPath = path.resolve(cwd, dirPath);

  if (!fs.existsSync(fullPath)) {
    console.error(chalk.red(`❌ Directory not found: ${dirPath}`));
    process.exit(1);
  }

  const walkDir = (dir: string) => {
    const items = fs.readdirSync(dir);
    items.forEach(item => {
      const itemPath = path.join(dir, item);
      const stat = fs.statSync(itemPath);

      if (stat.isDirectory()) {
        walkDir(itemPath);
      } else if (stat.isFile()) {
        const relativePath = path.relative(cwd, itemPath);
        if (isWhitelisted(relativePath, config.whitelist || [])) {
          return;
        }

        if (['.java', '.ts', '.js', '.yml', '.yaml', '.properties', '.xml'].some(ext => item.endsWith(ext))) {
          const content = fs.readFileSync(itemPath, 'utf-8');
          files.push({ path: relativePath, content });
        }
      }
    });
  };

  walkDir(fullPath);
  return files;
}

function isWhitelisted(filePath: string, whitelist: string[]): boolean {
  return whitelist.some(pattern => {
    // Simple glob matching (**.test.java, **/test-data/**)
    const regex = new RegExp(
      pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\./g, '\\.')
    );
    return regex.test(filePath);
  });
}

function getLevelIcon(level: SensitivityLevel): string {
  switch (level) {
    case SensitivityLevel.CRITICAL:
      return chalk.red('🔴');
    case SensitivityLevel.BLOCK:
      return chalk.red('🛑');
    case SensitivityLevel.WARN:
      return chalk.yellow('⚠️ ');
    case SensitivityLevel.INFO:
      return chalk.blue('ℹ️ ');
    default:
      return '';
  }
}

function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([dhm])$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}. Use format like 30d, 7d, 24h`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'd':
      return value * 24 * 60 * 60 * 1000; // days to ms
    case 'h':
      return value * 60 * 60 * 1000; // hours to ms
    case 'm':
      return value * 60 * 1000; // minutes to ms
    default:
      throw new Error(`Unknown duration unit: ${unit}`);
  }
}

function generateAuditReport(entries: any[]): any {
  const totalScans = entries.length;
  const blockedCount = entries.filter(e => e.action === 'BLOCKED').length;
  const allowedCount = entries.filter(e => e.action === 'ALLOWED_WITH_REDACTION').length;

  const violationsByCategory = new Map<string, number>();
  const violationsByLevel = new Map<string, number>();

  entries.forEach(entry => {
    entry.violations.forEach((fileViolation: any) => {
      fileViolation.violations.forEach((v: any) => {
        violationsByCategory.set(v.category, (violationsByCategory.get(v.category) || 0) + 1);
        violationsByLevel.set(v.level, (violationsByLevel.get(v.level) || 0) + 1);
      });
    });
  });

  return {
    summary: {
      totalScans,
      blockedCount,
      allowedCount,
      timeframe: {
        start: entries[0]?.timestamp,
        end: entries[entries.length - 1]?.timestamp
      }
    },
    violationsByCategory: Object.fromEntries(violationsByCategory),
    violationsByLevel: Object.fromEntries(violationsByLevel),
    entries
  };
}

function generateCSVReport(entries: any[]): string {
  const rows = ['Timestamp,Action,File,Category,Pattern,Level,Line'];

  entries.forEach(entry => {
    entry.violations.forEach((fileViolation: any) => {
      fileViolation.violations.forEach((v: any) => {
        rows.push(
          `${entry.timestamp},${entry.action},${fileViolation.filePath},${v.category},${v.pattern},${v.level},${v.line}`
        );
      });
    });
  });

  return rows.join('\n');
}

function generateHTMLReport(entries: any[]): string {
  const report = generateAuditReport(entries);

  return `
<!DOCTYPE html>
<html>
<head>
  <title>Guardrails Audit Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    .summary { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    .metric { display: inline-block; margin-right: 30px; }
    .metric label { font-weight: bold; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #4CAF50; color: white; }
    .critical { color: red; font-weight: bold; }
    .blocked { background-color: #ffebee; }
  </style>
</head>
<body>
  <h1>Guardrails Audit Report</h1>
  <div class="summary">
    <div class="metric"><label>Total Scans:</label> ${report.summary.totalScans}</div>
    <div class="metric"><label>Blocked:</label> <span class="critical">${report.summary.blockedCount}</span></div>
    <div class="metric"><label>Allowed (with redaction):</label> ${report.summary.allowedCount}</div>
  </div>

  <h2>Violations by Category</h2>
  <table>
    <tr><th>Category</th><th>Count</th></tr>
    ${Object.entries(report.violationsByCategory).map(([cat, count]) =>
      `<tr><td>${cat}</td><td>${count}</td></tr>`
    ).join('')}
  </table>

  <h2>Recent Events</h2>
  <table>
    <tr><th>Timestamp</th><th>Action</th><th>File</th><th>Violations</th></tr>
    ${entries.map(entry => `
      <tr class="${entry.action === 'BLOCKED' ? 'blocked' : ''}">
        <td>${new Date(entry.timestamp).toLocaleString()}</td>
        <td>${entry.action}</td>
        <td>${entry.violations.map((v: any) => v.filePath).join(', ')}</td>
        <td>${entry.violations.reduce((sum: number, v: any) => sum + v.violations.length, 0)}</td>
      </tr>
    `).join('')}
  </table>
</body>
</html>
  `.trim();
}
