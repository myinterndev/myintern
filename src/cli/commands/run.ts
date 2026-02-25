import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ConfigManager, AgentConfig } from '../../core/ConfigManager';
import { AIProviderFactory } from '../../integrations/ai/AIProviderFactory';
import { ClaudeCliProvider } from '../../integrations/ai/ClaudeCliProvider';
import { LanguageDetector } from '../../core/LanguageDetector';
import { ContextFileLoader } from '../../core/ContextFileLoader';

const execAsync = promisify(exec);

/**
 * Auto-detect authentication method
 * Priority:
 * 1. Claude CLI OAuth (if installed and authenticated)
 * 2. ANTHROPIC_API_KEY env var
 * 3. OPENAI_API_KEY env var
 */
async function autoDetectAuth(): Promise<{ provider: string; apiKey?: string }> {
  // 1. Check for Claude CLI
  const claudeAvailable = await ClaudeCliProvider.isAvailable();
  if (claudeAvailable) {
    console.log(chalk.green('✅ Detected Claude Code CLI with OAuth authentication'));
    return { provider: 'claude-cli' };
  }

  // 2. Check for Anthropic API key
  if (process.env.ANTHROPIC_API_KEY) {
    console.log(chalk.green('✅ Detected ANTHROPIC_API_KEY environment variable'));
    return { provider: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY };
  }

  // 3. Check for OpenAI API key
  if (process.env.OPENAI_API_KEY) {
    console.log(chalk.green('✅ Detected OPENAI_API_KEY environment variable'));
    return { provider: 'openai', apiKey: process.env.OPENAI_API_KEY };
  }

  // No auth found
  return { provider: 'none' };
}

/**
 * Zero-config run command
 * Usage: myintern run "Add GET /health endpoint"
 */
export async function runCommand(task: string, options: any) {
  console.log(chalk.blue('🚀 MyIntern Zero-Config Mode\n'));

  const repoPath = process.cwd();

  // Step 1: Auto-detect authentication
  console.log(chalk.gray('Step 1/4: Detecting authentication...'));
  const auth = await autoDetectAuth();

  if (auth.provider === 'none') {
    console.log(chalk.red('\n❌ No authentication found'));
    console.log(chalk.yellow('\nPlease set up authentication using one of these methods:\n'));
    console.log(chalk.cyan('Option 1: Claude Pro/Max Users (Recommended)'));
    console.log('  Install Claude Code CLI and authenticate:');
    console.log('  $ brew install anthropics/claude/claude');
    console.log('  $ claude auth login\n');
    console.log(chalk.cyan('Option 2: API Key Users'));
    console.log('  Set environment variable:');
    console.log('  $ export ANTHROPIC_API_KEY=sk-ant-...\n');
    console.log(chalk.cyan('Option 3: OpenAI Users'));
    console.log('  Set environment variable:');
    console.log('  $ export OPENAI_API_KEY=sk-...\n');
    process.exit(1);
  }

  // Step 2: Auto-detect language and build tool
  console.log(chalk.gray('Step 2/4: Detecting project type...'));
  const detector = new LanguageDetector(repoPath);
  const detections = detector.detectAll();

  if (detections.length === 0) {
    console.log(chalk.red('\n❌ Could not detect project type'));
    console.log(chalk.yellow('Supported: Java (Maven/Gradle), Node.js, Python, Go, Rust\n'));
    process.exit(1);
  }

  // Use first detected project (most repos are single-language)
  const detection = detections[0];

  console.log(chalk.green(`✅ Detected ${detection.language} project`));
  if (detection.buildTool) {
    console.log(chalk.gray(`   Build tool: ${detection.buildTool}`));
  }
  if (detection.framework) {
    console.log(chalk.gray(`   Framework: ${detection.framework}`));
  }

  // Step 3: Load context files
  console.log(chalk.gray('Step 3/4: Loading context...'));
  const contextLoader = new ContextFileLoader(repoPath);
  const contextFiles = contextLoader.loadContextFiles(detection.language);

  if (contextFiles.length > 0) {
    console.log(chalk.green(`✅ Loaded ${contextFiles.length} context file(s)`));
    contextFiles.forEach((f: any) => {
      console.log(chalk.gray(`   - ${f.source}: ${f.filePath}`));
    });
  } else {
    console.log(chalk.yellow('⚠️  No context files found (CLAUDE.md, .cursorrules, etc.)'));
  }

  // Step 4: Generate code
  console.log(chalk.gray('Step 4/4: Generating code...\n'));

  try {
    // Create minimal config for zero-config mode
    const minimalConfig: AgentConfig = {
      version: '1.0',
      llm: {
        provider: auth.provider as any,
        model: auth.provider === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-5-20250929',
        api_key: auth.apiKey
      },
      java: {
        version: detection.framework?.includes('17') ? '17' : '21'
      },
      agents: {
        code: true,
        test: false,
        build: false
      },
      watch: {
        auto_discover: true,
        paths: [],
        ignore: ['target/', '.git/', 'node_modules/', 'build/', 'dist/'],
        debounce_ms: 2000
      },
      build: {
        tool: (detection.buildTool || 'maven') as any,
        commands: {
          compile: detection.buildTool === 'gradle' ? 'gradle build' : 'mvn compile',
          test: detection.buildTool === 'gradle' ? 'gradle test' : 'mvn test',
          package: detection.buildTool === 'gradle' ? 'gradle jar' : 'mvn package'
        }
      },
      git: {
        protected_branches: ['main', 'master', 'production'],
        auto_branch: false,
        auto_commit: false,
        auto_pr: false
      }
    };

    const aiProvider = AIProviderFactory.create(minimalConfig);

    // Build prompt with context
    let prompt = `Task: ${task}\n\n`;
    prompt += `Project Type: ${detection.language}`;
    if (detection.framework) {
      prompt += ` (${detection.framework})`;
    }
    prompt += `\nBuild Tool: ${detection.buildTool || 'unknown'}\n\n`;

    if (contextFiles.length > 0) {
      prompt += 'Coding Guidelines:\n';
      contextFiles.forEach((f: any) => {
        prompt += `\n--- ${f.source} (${f.filePath}) ---\n`;
        prompt += f.content + '\n';
      });
      prompt += '\n';
    }

    prompt += `Please generate the code for this task following the coding guidelines above. Return JSON format:\n`;
    prompt += `{\n  "files": [{ "path": "...", "content": "..." }],\n  "summary": "..."\n}`;

    console.log(chalk.blue('💭 Sending request to LLM...\n'));

    const result = await aiProvider.generateCode(prompt);

    console.log(chalk.green('✅ Code generated successfully!\n'));
    console.log(chalk.bold('Summary:'));
    console.log(result.summary + '\n');

    console.log(chalk.bold('Files to create/modify:'));
    result.files.forEach(f => {
      console.log(chalk.cyan(`  ${f.path}`));
    });

    // Ask for confirmation
    if (!options.yes) {
      console.log(chalk.yellow('\n⚠️  Review the changes above.'));
      console.log('To apply changes, run with --yes flag:');
      console.log(chalk.cyan(`  myintern run "${task}" --yes\n`));
      return;
    }

    // Apply changes
    console.log(chalk.blue('\n📝 Applying changes...\n'));
    for (const file of result.files) {
      const filePath = path.join(repoPath, file.path);
      const dir = path.dirname(filePath);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filePath, file.content, 'utf-8');
      console.log(chalk.green(`✅ Wrote ${file.path}`));
    }

    console.log(chalk.green('\n✨ Done! Changes applied successfully.\n'));

  } catch (error: any) {
    console.log(chalk.red('\n❌ Error generating code:'));
    console.log(chalk.red(error.message));

    if (error.message?.includes('not authenticated')) {
      console.log(chalk.yellow('\nAuthentication failed. Try:'));
      console.log('  $ claude auth login');
      console.log('  OR');
      console.log('  $ export ANTHROPIC_API_KEY=sk-ant-...\n');
    }

    process.exit(1);
  }
}
