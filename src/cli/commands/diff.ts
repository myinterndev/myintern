import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { SpecParser } from '../../core/SpecParser';
import { DryRunPreview } from '../../core/DryRunPreview';
import { ConfigManager } from '../../core/ConfigManager';
import { ContextBuilder } from '../../core/ContextBuilder';
import { AIProviderFactory } from '../../integrations/ai/AIProviderFactory';

interface DiffOptions {
  spec: string;  // Spec file name or path
}

/**
 * myintern diff command
 *
 * Preview changes that would be made for a spec without applying them
 *
 * NEW in v1.2: Provides diff preview before code generation
 */
export async function diffCommand(options: DiffOptions) {
  try {
    const projectRoot = process.cwd();
    const configManager = new ConfigManager(projectRoot);

    // Check if myintern is initialized
    if (!configManager.exists()) {
      console.log(chalk.red('❌ MyIntern not initialized'));
      console.log(chalk.gray('   Run: myintern init\n'));
      process.exit(1);
    }

    const config = configManager.load();

    // Find spec file
    const specsDir = path.join(projectRoot, '.myintern', 'specs');
    let specPath: string;

    if (options.spec.endsWith('.md')) {
      specPath = path.join(specsDir, options.spec);
    } else {
      specPath = path.join(specsDir, `${options.spec}.md`);
    }

    if (!fs.existsSync(specPath)) {
      console.log(chalk.red(`❌ Spec file not found: ${path.basename(specPath)}`));
      console.log(chalk.gray(`   Looking in: ${specsDir}\n`));
      process.exit(1);
    }

    console.log(chalk.blue(`\n📝 Generating diff preview for: ${path.basename(specPath)}\n`));

    // Parse spec
    const parser = new SpecParser();
    const spec = await parser.parse(specPath);

    // Build context
    console.log(chalk.gray('   Building context...'));
    const contextBuilder = new ContextBuilder(projectRoot);
    const context = await contextBuilder.buildContext(specPath, 'java', '');

    console.log(chalk.green(`   ✓ Context: ${context.files.length} files, ${context.totalTokens} tokens\n`));

    // Generate code preview (without writing)
    console.log(chalk.gray('   Generating code preview...\n'));

    const aiProvider = AIProviderFactory.create(config);
    const prompt = buildDiffPrompt(spec, context);
    const implementation = await aiProvider.generateCode(prompt);

    console.log(chalk.green(`   ✓ Generated ${implementation.files.length} file changes\n`));

    // Show diffs using DryRunPreview
    const dryRun = new DryRunPreview(projectRoot);
    await dryRun.preview(implementation.files);

    console.log(chalk.blue('💡 To apply these changes:'));
    console.log(chalk.gray(`   1. Review the diff above`));
    console.log(chalk.gray(`   2. Run: myintern run --spec ${path.basename(specPath)}\n`));

  } catch (error: any) {
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}

/**
 * Build prompt for diff generation
 */
function buildDiffPrompt(spec: any, context: any): string {
  const parser = new SpecParser();
  return `You are a senior Java/Spring Boot engineer.

# Spec
${parser.formatForPrompt(spec)}

# Codebase Context
${context.files.map((f: any) => `
## ${f.path}
\`\`\`
${f.content}
\`\`\`
`).join('\n')}

# Task
Generate the implementation for this spec. Return your response as a JSON object with this structure:

{
  "summary": "Brief summary of changes",
  "files": [
    {
      "path": "relative/path/to/file.java",
      "content": "complete file content",
      "action": "create" or "modify"
    }
  ],
  "commit_message": "Conventional commit message"
}

CRITICAL:
- Return ONLY valid JSON
- Include complete file content for each file
- Follow Spring Boot best practices
- Use proper package structure
`;
}
