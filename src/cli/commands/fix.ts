import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { ReviewAgent } from '../../agents/ReviewAgent';
import { ConfigManager } from '../../core/ConfigManager';
import { AIProviderFactory } from '../../integrations/ai/AIProviderFactory';

/**
 * Fix command - Auto-fix violations from review
 */
export async function fixCommand(options: {
  review?: boolean; // Run review first, then fix
  report?: string;  // Fix from existing report
}): Promise<void> {
  try {
    console.log(chalk.blue.bold('\n🔧 MyIntern Auto-Fix\n'));

    // Load config
    const configManager = new ConfigManager();
    let config;

    try {
      config = configManager.load();
    } catch {
      config = ConfigManager.getDefaultConfig();

      if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
        console.log(chalk.red('\n❌ No API key found\n'));
        process.exit(1);
      }
    }

    // Create AI provider
    const aiProvider = AIProviderFactory.create(config);

    // Create review agent
    const reviewAgent = new ReviewAgent(process.cwd(), aiProvider);

    let violations: any[] = [];

    if (options.review) {
      // Run review first
      console.log(chalk.blue('🔍 Running code review...\n'));

      const result = await reviewAgent.reviewCodebase({
        focus: 'all',
        severity: 'all',
        autoFix: false
      });

      violations = result.violations.filter(v => v.autoFixable);

      if (violations.length === 0) {
        console.log(chalk.green('\n✅ No auto-fixable violations found\n'));
        return;
      }

      console.log(chalk.blue(`\n🔧 Found ${violations.length} auto-fixable violations\n`));

    } else if (options.report) {
      // Load from existing report
      const reportPath = path.join(process.cwd(), options.report);

      if (!fs.existsSync(reportPath)) {
        console.log(chalk.red(`\n❌ Report not found: ${reportPath}\n`));
        process.exit(1);
      }

      const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
      violations = report.violations.filter((v: any) => v.autoFixable);

      if (violations.length === 0) {
        console.log(chalk.green('\n✅ No auto-fixable violations in report\n'));
        return;
      }

      console.log(chalk.blue(`\n🔧 Found ${violations.length} auto-fixable violations in report\n`));

    } else {
      // Load from latest report
      const reportsDir = path.join(process.cwd(), '.myintern', 'reports');

      if (!fs.existsSync(reportsDir)) {
        console.log(chalk.yellow('\n⚠️  No reports found. Run: myintern review\n'));
        process.exit(1);
      }

      const reports = fs.readdirSync(reportsDir)
        .filter(f => f.startsWith('review-') && f.endsWith('.json'))
        .sort()
        .reverse();

      if (reports.length === 0) {
        console.log(chalk.yellow('\n⚠️  No reports found. Run: myintern review\n'));
        process.exit(1);
      }

      const latestReport = path.join(reportsDir, reports[0]);
      const report = JSON.parse(fs.readFileSync(latestReport, 'utf-8'));
      violations = report.violations.filter((v: any) => v.autoFixable);

      if (violations.length === 0) {
        console.log(chalk.green('\n✅ No auto-fixable violations in latest report\n'));
        return;
      }

      console.log(chalk.gray(`   Using report: ${reports[0]}`));
      console.log(chalk.blue(`   Found ${violations.length} auto-fixable violations\n`));
    }

    // Auto-fix violations
    const result = await reviewAgent.autoFix(violations);

    if (result.success) {
      console.log(chalk.green(`\n✅ All violations fixed successfully!\n`));
      console.log(chalk.gray(`   Fixed: ${result.fixed}`));
      console.log(chalk.gray(`   Failed: ${result.failed}\n`));
    } else {
      console.log(chalk.yellow(`\n⚠️  Partial success\n`));
      console.log(chalk.gray(`   Fixed: ${result.fixed}`));
      console.log(chalk.gray(`   Failed: ${result.failed}\n`));
      process.exit(1);
    }

  } catch (error: any) {
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}
