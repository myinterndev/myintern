import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { ConfigManager } from '../../core/ConfigManager';
import { SpecParser } from '../../core/SpecParser';
import { ContextBuilder } from '../../core/ContextBuilder';
import { ContextFileLoader } from '../../core/ContextFileLoader';
import { LanguageDetector } from '../../core/LanguageDetector';
import { SpringBootDetector } from '../../core/SpringBootDetector';
import { SpecOrchestrator } from '../../core/SpecOrchestrator';

interface ExplainOptions {
  spec?: string;
  task?: string;
  full?: boolean;
  json?: boolean;
}

function resolveSpecPath(specName: string): string | null {
  const cwd = process.cwd();

  if (!specName.endsWith('.md')) {
    specName = specName + '.md';
  }
  if (!specName.startsWith('spec-')) {
    specName = 'spec-' + specName;
  }

  const candidates = [
    path.join(cwd, '.myintern', 'specs', specName),
    path.join(cwd, specName)
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

function buildRunTaskPrompt(task: string, detection: any, contextFiles: any[]): string {
  let prompt = `Task: ${task}\n\n`;
  prompt += `Project Type: ${detection.language}`;
  if (detection.framework) prompt += ` (${detection.framework})`;
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

  return prompt;
}

function buildSpecPrompt(spec: any, context: any, templateContext?: any): string {
  const specFormatted = new SpecParser().formatForPrompt(spec);

  let springBootSection: string;
  if (templateContext) {
    const usePkg = templateContext.useJakarta ? 'jakarta.*' : 'javax.*';
    const avoidPkg = templateContext.useJakarta ? 'javax.*' : 'jakarta.*';
    springBootSection = `
Spring Boot Version: ${templateContext.springBootVersion}
Java Version: ${templateContext.javaVersion}
Persistence Package: ${templateContext.persistencePackage}
Validation Package: ${templateContext.validationPackage}
Servlet Package: ${templateContext.servletPackage}

CRITICAL: Use ${usePkg} imports (NOT ${avoidPkg})
`;
  } else {
    springBootSection = '(Spring Boot not detected)';
  }

  let prompt = `You are a senior Java/Spring Boot engineer.

# Spec
${specFormatted}

# Spring Boot Version Context
${springBootSection}

# Project Context
`;

  if (context.globalContext) {
    prompt += `\n${context.globalContext}\n`;
  }

  if (context.practicesContent) {
    prompt += `\n## Coding Practices\n${context.practicesContent}\n`;
  }

  if (context.files.length > 0) {
    prompt += `\n## Existing Code\n\n`;
    for (const file of context.files) {
      prompt += `### ${file.path}\n\`\`\`java\n${file.content}\n\`\`\`\n\n`;
    }
  }

  prompt += `
# Task
Implement the specification following Spring Boot best practices and the coding standards above.

## Output Format (JSON only)

Return ONLY a valid JSON object:

\`\`\`json
{
  "files": [
    {
      "path": "src/main/java/com/example/controller/UserController.java",
      "action": "create",
      "content": "package com.example.controller;\\n\\nimport..."
    }
  ],
  "commit_message": "feat: implement user registration endpoint",
  "summary": "Brief summary of implementation"
}
\`\`\`

CRITICAL:
- Return ONLY valid JSON (no markdown, no explanations)
- Include complete file content (not snippets)
- Follow the coding practices exactly
- Use proper package names from existing code
`;

  return prompt;
}

function printPromptSection(label: string, content: string, color: typeof chalk.cyan): void {
  console.log(color(`\n${'─'.repeat(60)}`));
  console.log(color.bold(`  ${label}`));
  console.log(color(`${'─'.repeat(60)}`));
  console.log(content);
}

async function explainSpec(specPath: string, options: ExplainOptions): Promise<void> {
  const parser = new SpecParser();
  const spec = parser.parse(specPath);

  console.log(chalk.gray(`  Spec file: ${path.relative(process.cwd(), specPath)}`));
  console.log(chalk.gray(`  Title:     ${spec.title}`));
  console.log(chalk.gray(`  Type:      ${spec.type} | Priority: ${spec.priority}`));
  if (spec.jiraTicket) console.log(chalk.gray(`  Jira:      ${spec.jiraTicket}`));
  console.log();

  // Build context (same way CodeAgent does)
  const repoPath = process.cwd();
  let templateContext: any = null;

  try {
    const springBootDetector = new SpringBootDetector(repoPath);
    const springBootVersion = await springBootDetector.detect();
    templateContext = springBootDetector.getTemplateContext(springBootVersion);
  } catch {
    // Spring Boot not detected, that's ok
  }

  const contextBuilder = new ContextBuilder(repoPath);
  const specOrchestrator = new SpecOrchestrator(repoPath);
  const jiraContext = specOrchestrator.getOrCreateGlobalContext(spec);
  const globalContextForPrompt = specOrchestrator.formatGlobalContextForPrompt(jiraContext);

  let configFeedback = '';
  try {
    const configManager = new ConfigManager(repoPath);
    const config = configManager.load();
    if (config.feedback?.enabled) {
      configFeedback = '(Feedback context would be appended from .myintern/feedback/)';
    }
  } catch {
    // No config, zero-config mode
  }

  const context = await contextBuilder.buildContext(specPath, 'java', globalContextForPrompt + configFeedback);

  // Show context metadata
  console.log(chalk.bold('  Context Summary'));
  console.log(chalk.gray(`  Files included:  ${context.files.length}`));
  console.log(chalk.gray(`  Total tokens:    ~${context.totalTokens.toLocaleString()}`));
  if (context.droppedFiles.length > 0) {
    console.log(chalk.yellow(`  Dropped files:   ${context.droppedFiles.length} (over token budget)`));
  }
  if (context.practicesContent) {
    console.log(chalk.gray(`  Practices:       loaded`));
  }
  console.log();

  // Build the full prompt
  const fullPrompt = buildSpecPrompt(spec, context, templateContext);

  if (options.json) {
    const output = {
      type: 'spec',
      spec: {
        file: path.relative(repoPath, specPath),
        title: spec.title,
        type: spec.type,
        priority: spec.priority,
        jiraTicket: spec.jiraTicket
      },
      context: {
        filesIncluded: context.files.map(f => f.path),
        totalTokens: context.totalTokens,
        droppedFiles: context.droppedFiles,
        hasPractices: !!context.practicesContent,
        springBoot: templateContext
      },
      prompt: fullPrompt,
      promptTokenEstimate: Math.ceil(fullPrompt.length / 4)
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // Show included files
  if (context.files.length > 0) {
    console.log(chalk.bold('  Files sent to LLM:'));
    for (const file of context.files) {
      console.log(chalk.gray(`    ${file.path} (~${file.tokens} tokens, priority ${file.priority})`));
    }
    console.log();
  }

  // Show the prompt
  if (options.full) {
    printPromptSection('FULL PROMPT (sent to LLM)', fullPrompt, chalk.cyan);
  } else {
    const truncNote = chalk.gray('... truncated (' + fullPrompt.length + ' chars total). Use --full to see everything.');
    const truncated = fullPrompt.length > 3000
      ? fullPrompt.substring(0, 3000) + '\n\n' + truncNote
      : fullPrompt;
    printPromptSection('PROMPT PREVIEW (first 3000 chars)', truncated, chalk.cyan);
  }

  console.log();
  const tokenEstimate = Math.ceil(fullPrompt.length / 4).toLocaleString();
  console.log(chalk.gray('  Estimated prompt tokens: ~' + tokenEstimate));
  console.log();
}

async function explainTask(task: string, options: ExplainOptions): Promise<void> {
  const repoPath = process.cwd();
  const detector = new LanguageDetector(repoPath);
  const detections = detector.detectAll();
  const detection = detections[0] || { language: 'unknown', buildTool: 'manual' };

  console.log(chalk.gray(`  Task:     "${task}"`));
  console.log(chalk.gray(`  Language: ${detection.language}`));
  if (detection.framework) console.log(chalk.gray(`  Framework: ${detection.framework}`));
  console.log(chalk.gray(`  Build:    ${detection.buildTool || 'unknown'}`));
  console.log();

  // Load context files (same as run command)
  const contextLoader = new ContextFileLoader(repoPath);
  const contextFiles = contextLoader.loadContextFiles(detection.language);

  if (contextFiles.length > 0) {
    console.log(chalk.bold('  Context files loaded:'));
    contextFiles.forEach((f: any) => {
      console.log(chalk.gray(`    ${f.source}: ${f.filePath}`));
    });
    console.log();
  }

  // Build prompt (mirrors run command logic)
  const fullPrompt = buildRunTaskPrompt(task, detection, contextFiles);

  // Show auth detection
  console.log(chalk.bold('  Provider resolution:'));
  if (process.env.ANTHROPIC_API_KEY) {
    console.log(chalk.gray('    Would use: Anthropic Claude (claude-sonnet-4-5-20250929)'));
  } else if (process.env.OPENAI_API_KEY) {
    console.log(chalk.gray('    Would use: OpenAI (gpt-4o)'));
  } else {
    console.log(chalk.yellow('    No API key detected — would attempt Claude CLI OAuth'));
  }
  console.log();

  if (options.json) {
    const output = {
      type: 'task',
      task,
      detection: {
        language: detection.language,
        framework: detection.framework,
        buildTool: detection.buildTool
      },
      contextFiles: contextFiles.map((f: any) => ({ source: f.source, path: f.filePath })),
      prompt: fullPrompt,
      promptTokenEstimate: Math.ceil(fullPrompt.length / 4)
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  if (options.full) {
    printPromptSection('FULL PROMPT (sent to LLM)', fullPrompt, chalk.cyan);
  } else {
    const truncNote = chalk.gray('... truncated (' + fullPrompt.length + ' chars total). Use --full to see everything.');
    const truncated = fullPrompt.length > 3000
      ? fullPrompt.substring(0, 3000) + '\n\n' + truncNote
      : fullPrompt;
    printPromptSection('PROMPT PREVIEW (first 3000 chars)', truncated, chalk.cyan);
  }

  console.log();
  const taskTokenEstimate = Math.ceil(fullPrompt.length / 4).toLocaleString();
  console.log(chalk.gray('  Estimated prompt tokens: ~' + taskTokenEstimate));
  console.log();
}

export async function explainCommand(options: ExplainOptions) {
  console.log(chalk.blue.bold('\n🔍 MyIntern Explain — Transparency Mode\n'));

  if (!options.spec && !options.task) {
    console.log(chalk.yellow('Usage:'));
    console.log(chalk.gray('  myintern explain --spec <name>     Show prompt for a spec file'));
    console.log(chalk.gray('  myintern explain --task "..."       Show prompt for a run task'));
    console.log();
    console.log(chalk.gray('Options:'));
    console.log(chalk.gray('  --full                              Show the complete prompt (no truncation)'));
    console.log(chalk.gray('  --json                              Output as JSON'));
    console.log();
    console.log(chalk.gray('Examples:'));
    console.log(chalk.cyan('  myintern explain --spec spec-health-api'));
    console.log(chalk.cyan('  myintern explain --task "Add GET /health endpoint" --full'));
    console.log(chalk.cyan('  myintern explain --spec spec-001 --json'));
    console.log();
    return;
  }

  try {
    if (options.spec) {
      const specPath = resolveSpecPath(options.spec);

      if (!specPath) {
        console.log(chalk.red(`  Spec file not found: ${options.spec}`));
        console.log(chalk.gray('  Searched in: .myintern/specs/ and current directory'));
        console.log(chalk.gray('  Make sure the spec file starts with "spec-" and ends with ".md"\n'));
        process.exit(1);
      }

      await explainSpec(specPath, options);
    } else if (options.task) {
      await explainTask(options.task, options);
    }
  } catch (error: any) {
    console.log(chalk.red(`\n  Error: ${error.message}\n`));
    process.exit(1);
  }
}
