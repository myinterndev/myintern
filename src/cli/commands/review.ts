import chalk from 'chalk';
import { ReviewAgent } from '../../agents/ReviewAgent';
import { ConfigManager } from '../../core/ConfigManager';
import { AIProviderFactory } from '../../integrations/ai/AIProviderFactory';

/**
 * Review command - Audit codebase for issues
 */
export async function reviewCommand(options: {
  focus?: 'security' | 'quality' | 'performance' | 'all';
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'all';
  autoFix?: boolean;
  json?: boolean;
}): Promise<void> {
  try {
    if (!options.json) {
      console.log(chalk.blue.bold('\n🔍 MyIntern Code Review\n'));
    }

    // Load config (zero-config mode supported)
    const configManager = new ConfigManager();
    let config;

    try {
      config = configManager.load();
    } catch {
      if (!options.json) {
        console.log(chalk.yellow('⚠️  No config found, using default AI provider'));
      }
      config = ConfigManager.getDefaultConfig();

      // Check for API key in environment
      if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
        const msg = 'No API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable, or run: myintern init';
        if (options.json) {
          console.log(JSON.stringify({ error: msg }));
        } else {
          console.log(chalk.red('\n❌ No API key found'));
          console.log(chalk.gray('   Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable'));
          console.log(chalk.gray('   Or run: myintern init\n'));
        }
        process.exit(1);
      }
    }

    // Create AI provider
    const aiProvider = AIProviderFactory.create(config);

    // Create review agent
    const reviewAgent = new ReviewAgent(process.cwd(), aiProvider);

    // Run review
    const result = await reviewAgent.reviewCodebase({
      focus: options.focus,
      severity: options.severity,
      autoFix: false // Don't auto-fix during review
    });

    if (!result.success) {
      if (options.json) {
        console.log(JSON.stringify({ success: false, violations: [], summary: result.summary }));
      } else {
        console.log(chalk.red('\n❌ Review failed\n'));
      }
      process.exit(1);
    }

    // Auto-fix if requested
    if (options.autoFix && result.summary.autoFixable > 0) {
      if (!options.json) {
        console.log(chalk.blue('\n🔧 Auto-fixing violations...\n'));
      }

      const autoFixable = result.violations.filter(v => v.autoFixable);
      const fixResult = await reviewAgent.autoFix(autoFixable);

      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          violations: result.violations,
          summary: result.summary,
          autoFix: { fixed: fixResult.fixed, failed: fixResult.failed }
        }));
      } else {
        if (fixResult.success) {
          console.log(chalk.green(`\n✅ Auto-fix complete: ${fixResult.fixed} fixed\n`));
        } else {
          console.log(chalk.yellow(`\n⚠️  Auto-fix partial: ${fixResult.fixed} fixed, ${fixResult.failed} failed\n`));
        }
      }
    } else if (options.json) {
      console.log(JSON.stringify({
        success: true,
        violations: result.violations,
        summary: result.summary
      }));
    } else if (result.summary.autoFixable > 0) {
      console.log(chalk.blue('\n💡 Tip: Run with --auto-fix to automatically fix issues\n'));
    }

  } catch (error: any) {
    if (options.json) {
      console.log(JSON.stringify({ error: error.message }));
    } else {
      console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    }
    process.exit(1);
  }
}
