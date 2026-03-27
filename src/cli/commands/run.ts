import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { AgentConfig } from '../../core/ConfigManager';
import { AIProviderFactory } from '../../integrations/ai/AIProviderFactory';
import { ClaudeCliProvider } from '../../integrations/ai/ClaudeCliProvider';
import { LanguageDetector } from '../../core/LanguageDetector';
import { ContextFileLoader } from '../../core/ContextFileLoader';
import { AuditLogger } from '../../core/AuditLogger';
import { CodeAgent } from '../../agents/CodeAgent';
import { SafetyRules } from '../../core/SafetyRules';

const execAsync = promisify(exec);

/**
 * Auto-detect authentication method
 * Priority:
 * 1. Explicit API key (ANTHROPIC_API_KEY or OPENAI_API_KEY) — user chose this intentionally
 * 2. Claude CLI OAuth (if installed and authenticated)
 * 3. Fallback to any available API key
 */
async function autoDetectAuth(): Promise<{ provider: string; apiKey?: string }> {
  // 1. Explicit API keys take priority — user set these intentionally
  if (process.env.ANTHROPIC_API_KEY) {
    console.log(chalk.green('✅ Detected ANTHROPIC_API_KEY environment variable'));
    return { provider: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY };
  }

  if (process.env.OPENAI_API_KEY) {
    console.log(chalk.green('✅ Detected OPENAI_API_KEY environment variable'));
    return { provider: 'openai', apiKey: process.env.OPENAI_API_KEY };
  }

  // 2. Fall back to Claude CLI OAuth
  const claudeAvailable = await ClaudeCliProvider.isAvailable();
  if (claudeAvailable) {
    console.log(chalk.green('✅ Detected Claude Code CLI with OAuth authentication'));
    return { provider: 'claude-cli' };
  }

  // No auth found
  return { provider: 'none' };
}

/**
 * Spec-driven run mode (single/batch specs, optional CI/JSON summary)
 */
async function runSpecsMode(repoPath: string, options: any): Promise<void> {
  const specsDir = path.join(repoPath, '.myintern', 'specs');

  if (!fs.existsSync(specsDir)) {
    console.log(chalk.red('\n❌ Spec directory not found'));
    console.log(chalk.gray(`   Expected: ${path.join('.myintern', 'specs')}\n`));
    process.exit(1);
  }

  // Resolve spec paths
  let specPaths: string[] = [];

  if (options.all) {
    const files = fs.readdirSync(specsDir)
      .filter(f => f.endsWith('.md') && f.startsWith('spec-'))
      .map(f => path.join(specsDir, f));

    specPaths = files;
  } else if (options.spec) {
    const name = options.spec as string;
    let fileName = name;

    // Allow passing spec ID without extension or prefix
    if (!fileName.endsWith('.md')) {
      fileName += '.md';
    }
    if (!fileName.startsWith('spec-')) {
      fileName = `spec-${fileName}`;
    }

    const candidate = path.join(specsDir, fileName);
    if (!fs.existsSync(candidate)) {
      console.log(chalk.red(`\n❌ Spec not found: ${fileName}`));
      console.log(chalk.gray(`   Looked in: ${path.join('.myintern', 'specs')}\n`));
      process.exit(1);
    }

    specPaths = [candidate];
  }

  if (specPaths.length === 0) {
    console.log(chalk.yellow('\n⚠️  No specs to process\n'));
    process.exit(3); // no_specs
  }

  // Use existing CodeAgent pipeline for spec execution
  const codeAgent = new CodeAgent();
  await codeAgent.processSpecsOnce(specPaths);

  // Optional: JSON/CI-friendly summary based on executions.json
  if (options.json || options.ci) {
    const logsFile = path.join(repoPath, '.myintern', 'logs', 'executions.json');
    if (!fs.existsSync(logsFile)) {
      console.log(JSON.stringify({
        event: 'batch_complete',
        total_specs: specPaths.length,
        succeeded: 0,
        failed: 0,
        failed_specs: [],
        exit_code: 3
      }));
      process.exit(3);
    }

    const content = fs.readFileSync(logsFile, 'utf-8');
    let logsData: { executions: any[] } = { executions: [] };
    try {
      logsData = JSON.parse(content);
      if (Array.isArray(logsData)) {
        logsData = { executions: logsData };
      }
    } catch {
      logsData = { executions: [] };
    }

    const targetNames = new Set(specPaths.map(p => path.basename(p)));
    const executions = (logsData.executions || []).filter((e: any) => targetNames.has(e.spec));

    const succeeded = executions.filter((e: any) => e.status === 'success');
    const failed = executions.filter((e: any) => e.status === 'failed');

    const summary = {
      event: 'batch_complete',
      total_specs: specPaths.length,
      succeeded: succeeded.length,
      failed: failed.length,
      failed_specs: failed.map((e: any) => e.spec),
      exit_code: failed.length > 0 ? (succeeded.length > 0 ? 5 : 1) : 0
    };

    console.log(JSON.stringify(summary));

    // Structured exit code for CI
    if (summary.exit_code !== 0) {
      process.exit(summary.exit_code);
    }
  }
}

/**
 * Run command
 *
 * Modes:
 * - Zero-config task mode: myintern run "Add GET /health endpoint"
 * - Spec mode:            myintern run --spec spec-001
 * - Batch spec mode:      myintern run --all
 */
export async function runCommand(task: string | undefined, options: any) {
  const repoPath = process.cwd();

  // Spec-driven mode (uses existing CodeAgent + SpecOrchestrator pipeline)
  if (options && (options.spec || options.all)) {
    await runSpecsMode(repoPath, options);
    return;
  }

  // Zero-config mode still requires a task string
  if (!task) {
    console.log(chalk.red('\n❌ Missing task for zero-config mode'));
    console.log(chalk.gray('Usage:'));
    console.log(chalk.cyan('  myintern run "Add GET /health endpoint"'));
    console.log(chalk.cyan('  myintern run --spec spec-001           # process a spec file'));
    console.log();
    process.exit(1);
  }

  console.log(chalk.blue('🚀 MyIntern Zero-Config Mode\n'));

  // Step 1: Auto-detect authentication
  console.log(chalk.gray('Step 1/4: Detecting authentication...'));
  const auth = await autoDetectAuth();

  if (auth.provider === 'none') {
    console.log(chalk.red('\n❌ No authentication found — authentication required'));
    console.log(chalk.yellow('\nPlease set up authentication using one of these methods:\n'));
    console.log(chalk.cyan('Option 1: Claude CLI Users (Recommended)'));
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

  // Safety check: prevent code generation on protected branches
  try {
    const safetyRules = new SafetyRules(repoPath);
    const { protected: isProtected, branch } = await safetyRules.isProtectedBranch();
    if (isProtected) {
      console.log(chalk.red(`\n❌ Cannot generate code on protected branch "${branch}"`));
      console.log(chalk.yellow('   Create a feature branch first:'));
      console.log(chalk.cyan(`   $ git checkout -b feature/my-task\n`));
      process.exit(1);
    }
  } catch {
    // Not a git repo or git not available — allow zero-config to proceed
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

    const auditLogger = new AuditLogger(repoPath);
    const auditId = auditLogger.startEntry({
      spec: `run:${task.slice(0, 60)}`,
      prompt,
      llm_provider: auth.provider,
      llm_model: minimalConfig.llm.model,
      git_branch: 'HEAD',
    });

    let result: any;
    try {
      result = await aiProvider.generateCode(prompt);
    } catch (genError: any) {
      auditLogger.completeEntry(auditId, {
        generated_files: [],
        status: 'failed',
        error: genError.message,
      });
      throw genError;
    }

    auditLogger.completeEntry(auditId, {
      generated_files: result.files.map((f: { path: string }) => f.path),
      status: 'success',
    });

    console.log(chalk.green('✅ Code generated successfully!\n'));
    console.log(chalk.bold('Summary:'));
    console.log(result.summary + '\n');

    console.log(chalk.bold('Files to create/modify:'));
    result.files.forEach((f: { path: string }) => {
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
