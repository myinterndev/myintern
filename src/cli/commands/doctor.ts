import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import { ConfigManager } from '../../core/ConfigManager';
import { ClaudeCliProvider } from '../../integrations/ai/ClaudeCliProvider';

const execAsync = promisify(exec);

interface CheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  detail?: string;
  fix?: string;
}

async function runCommand(cmd: string): Promise<{ stdout: string; stderr: string } | null> {
  try {
    return await execAsync(cmd, { timeout: 10000 });
  } catch {
    return null;
  }
}

async function checkGit(): Promise<CheckResult> {
  const result = await runCommand('git --version');
  if (!result) {
    return {
      name: 'Git',
      status: 'fail',
      message: 'Git not found',
      fix: 'Install git: https://git-scm.com/downloads'
    };
  }

  const version = result.stdout.trim();

  const inRepo = await runCommand('git rev-parse --is-inside-work-tree');
  if (!inRepo) {
    return {
      name: 'Git',
      status: 'warn',
      message: `${version} (not in a git repository)`,
      fix: 'Run: git init'
    };
  }

  return { name: 'Git', status: 'pass', message: version };
}

async function checkNode(): Promise<CheckResult> {
  const result = await runCommand('node --version');
  if (!result) {
    return {
      name: 'Node.js',
      status: 'fail',
      message: 'Node.js not found',
      fix: 'Install Node.js >= 20: https://nodejs.org/'
    };
  }

  const version = result.stdout.trim();
  const major = parseInt(version.replace('v', '').split('.')[0], 10);

  if (major < 20) {
    return {
      name: 'Node.js',
      status: 'warn',
      message: `${version} (myintern requires >= 20.0.0)`,
      fix: 'Upgrade Node.js to v20+: https://nodejs.org/'
    };
  }

  return { name: 'Node.js', status: 'pass', message: version };
}

async function checkJava(): Promise<CheckResult> {
  const result = await runCommand('java -version 2>&1');
  if (!result) {
    return {
      name: 'Java',
      status: 'warn',
      message: 'Java not found (required for Java/Spring Boot projects)',
      fix: 'Install Java 17+: https://adoptium.net/'
    };
  }

  const output = result.stdout || result.stderr || '';
  const versionMatch = output.match(/version "([^"]+)"/);
  const version = versionMatch ? versionMatch[1] : output.trim().split('\n')[0];

  return { name: 'Java', status: 'pass', message: `java ${version}` };
}

async function checkMaven(): Promise<CheckResult> {
  const result = await runCommand('mvn --version 2>&1');
  if (!result) {
    const hasPom = fs.existsSync(path.join(process.cwd(), 'pom.xml'));
    if (hasPom) {
      return {
        name: 'Maven',
        status: 'fail',
        message: 'Maven not found (pom.xml detected — Maven is required)',
        fix: 'Install Maven: https://maven.apache.org/install.html'
      };
    }
    return {
      name: 'Maven',
      status: 'warn',
      message: 'Maven not installed (optional if not using Maven)',
      detail: 'Only required for Maven-based Java projects'
    };
  }

  const versionMatch = (result.stdout || '').match(/Apache Maven (\S+)/);
  const version = versionMatch ? versionMatch[1] : 'installed';

  return { name: 'Maven', status: 'pass', message: `Maven ${version}` };
}

async function checkGradle(): Promise<CheckResult> {
  const hasWrapper = fs.existsSync(path.join(process.cwd(), 'gradlew'));
  const hasGradle = fs.existsSync(path.join(process.cwd(), 'build.gradle')) ||
                    fs.existsSync(path.join(process.cwd(), 'build.gradle.kts'));

  if (hasWrapper) {
    return { name: 'Gradle', status: 'pass', message: 'Gradle wrapper (gradlew) found' };
  }

  const result = await runCommand('gradle --version 2>&1');
  if (!result && hasGradle) {
    return {
      name: 'Gradle',
      status: 'fail',
      message: 'Gradle not found (build.gradle detected — Gradle is required)',
      fix: 'Install Gradle or add gradlew wrapper: https://gradle.org/install/'
    };
  }

  if (!result) {
    return {
      name: 'Gradle',
      status: 'warn',
      message: 'Gradle not installed (optional if not using Gradle)',
      detail: 'Only required for Gradle-based Java projects'
    };
  }

  const versionMatch = (result.stdout || '').match(/Gradle (\S+)/);
  const version = versionMatch ? versionMatch[1] : 'installed';

  return { name: 'Gradle', status: 'pass', message: `Gradle ${version}` };
}

async function checkApiKeys(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // Check Claude CLI
  const claudeAvailable = await ClaudeCliProvider.isAvailable();
  if (claudeAvailable) {
    results.push({
      name: 'Claude CLI',
      status: 'pass',
      message: 'Authenticated via Claude Code CLI (OAuth)'
    });
  }

  // Check Anthropic API key
  if (process.env.ANTHROPIC_API_KEY) {
    const key = process.env.ANTHROPIC_API_KEY;
    const masked = key.substring(0, 10) + '...' + key.substring(key.length - 4);
    results.push({
      name: 'ANTHROPIC_API_KEY',
      status: 'pass',
      message: `Set (${masked})`
    });
  }

  // Check OpenAI API key
  if (process.env.OPENAI_API_KEY) {
    const key = process.env.OPENAI_API_KEY;
    const masked = key.substring(0, 7) + '...' + key.substring(key.length - 4);
    results.push({
      name: 'OPENAI_API_KEY',
      status: 'pass',
      message: `Set (${masked})`
    });
  }

  // Check AWS credentials (for Bedrock)
  if (process.env.AWS_ACCESS_KEY_ID || process.env.AWS_PROFILE) {
    const method = process.env.AWS_PROFILE ? `profile: ${process.env.AWS_PROFILE}` : 'access key';
    results.push({
      name: 'AWS Credentials',
      status: 'pass',
      message: `Available (${method})`
    });
  }

  if (results.length === 0) {
    results.push({
      name: 'API Keys',
      status: 'fail',
      message: 'No authentication method found',
      fix: 'Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or run: claude auth login'
    });
  }

  return results;
}

function checkMyInternConfig(): CheckResult[] {
  const results: CheckResult[] = [];
  const projectRoot = process.cwd();
  const myinternDir = path.join(projectRoot, '.myintern');

  if (!fs.existsSync(myinternDir)) {
    results.push({
      name: '.myintern/ directory',
      status: 'warn',
      message: 'Not initialized (zero-config mode still works)',
      fix: 'Run: myintern init'
    });
    return results;
  }

  results.push({
    name: '.myintern/ directory',
    status: 'pass',
    message: 'Found'
  });

  // Check agent.yml
  const configPath = path.join(myinternDir, 'agent.yml');
  if (!fs.existsSync(configPath)) {
    results.push({
      name: 'agent.yml',
      status: 'warn',
      message: 'Missing (zero-config mode still works)',
      fix: 'Run: myintern init'
    });
  } else {
    try {
      const configManager = new ConfigManager(projectRoot);
      const { valid, errors } = configManager.validate();

      if (valid) {
        const config = configManager.load();
        results.push({
          name: 'agent.yml',
          status: 'pass',
          message: `Valid (provider: ${config.llm.provider}, model: ${config.llm.model})`
        });
      } else {
        results.push({
          name: 'agent.yml',
          status: 'fail',
          message: `Invalid: ${errors[0]}`,
          detail: errors.length > 1 ? `+${errors.length - 1} more error(s)` : undefined,
          fix: 'Fix errors in .myintern/agent.yml'
        });
      }
    } catch (error: any) {
      results.push({
        name: 'agent.yml',
        status: 'fail',
        message: `Error loading: ${error.message}`,
        fix: 'Check .myintern/agent.yml for syntax errors'
      });
    }
  }

  // Check specs directory
  const specsDir = path.join(myinternDir, 'specs');
  if (fs.existsSync(specsDir)) {
    const specs = fs.readdirSync(specsDir).filter(f => f.startsWith('spec-') && f.endsWith('.md'));
    results.push({
      name: 'Spec files',
      status: specs.length > 0 ? 'pass' : 'warn',
      message: specs.length > 0 ? `${specs.length} spec file(s) found` : 'No spec files found',
      fix: specs.length === 0 ? 'Create spec files in .myintern/specs/spec-<name>.md' : undefined
    });
  }

  // Check practices
  const practicesDir = path.join(myinternDir, 'practices');
  if (fs.existsSync(practicesDir)) {
    const practices = fs.readdirSync(practicesDir).filter(f => f.endsWith('.md'));
    if (practices.length > 0) {
      results.push({
        name: 'Coding practices',
        status: 'pass',
        message: `${practices.length} practice file(s) loaded`
      });
    }
  }

  return results;
}

function checkProjectFiles(): CheckResult[] {
  const results: CheckResult[] = [];
  const projectRoot = process.cwd();

  const hasPom = fs.existsSync(path.join(projectRoot, 'pom.xml'));
  const hasGradle = fs.existsSync(path.join(projectRoot, 'build.gradle')) ||
                    fs.existsSync(path.join(projectRoot, 'build.gradle.kts'));
  const hasPackageJson = fs.existsSync(path.join(projectRoot, 'package.json'));
  const hasPython = fs.existsSync(path.join(projectRoot, 'requirements.txt')) ||
                    fs.existsSync(path.join(projectRoot, 'pyproject.toml'));

  if (hasPom) results.push({ name: 'Project type', status: 'pass', message: 'Java/Maven (pom.xml)' });
  else if (hasGradle) results.push({ name: 'Project type', status: 'pass', message: 'Java/Gradle' });
  else if (hasPackageJson) results.push({ name: 'Project type', status: 'pass', message: 'Node.js (package.json)' });
  else if (hasPython) results.push({ name: 'Project type', status: 'pass', message: 'Python' });
  else {
    results.push({
      name: 'Project type',
      status: 'warn',
      message: 'No recognized project file found',
      detail: 'Supported: pom.xml, build.gradle, package.json, requirements.txt'
    });
  }

  return results;
}

export async function doctorCommand(options: { fix?: boolean } = {}) {
  console.log(chalk.blue.bold('\n🩺 MyIntern Doctor\n'));
  console.log(chalk.gray('Checking your environment...\n'));

  const allResults: CheckResult[] = [];

  // Section 1: System Tools
  console.log(chalk.bold('  System Tools'));
  const toolChecks = await Promise.all([
    checkGit(),
    checkNode(),
    checkJava(),
    checkMaven(),
    checkGradle()
  ]);
  allResults.push(...toolChecks);
  for (const r of toolChecks) printResult(r);
  console.log();

  // Section 2: Authentication
  console.log(chalk.bold('  Authentication'));
  const authChecks = await checkApiKeys();
  allResults.push(...authChecks);
  for (const r of authChecks) printResult(r);
  console.log();

  // Section 3: Project
  console.log(chalk.bold('  Project'));
  const projectChecks = checkProjectFiles();
  allResults.push(...projectChecks);
  for (const r of projectChecks) printResult(r);
  console.log();

  // Section 4: MyIntern Config
  console.log(chalk.bold('  MyIntern Configuration'));
  const configChecks = checkMyInternConfig();
  allResults.push(...configChecks);
  for (const r of configChecks) printResult(r);
  console.log();

  // Summary
  const passed = allResults.filter(r => r.status === 'pass').length;
  const warned = allResults.filter(r => r.status === 'warn').length;
  const failed = allResults.filter(r => r.status === 'fail').length;

  console.log(chalk.bold('  Summary'));
  console.log(`    ${chalk.green('✓')} ${passed} passed  ${chalk.yellow('⚠')} ${warned} warning(s)  ${chalk.red('✗')} ${failed} failed`);
  console.log();

  if (failed > 0) {
    console.log(chalk.red.bold('  Fixes needed:\n'));
    for (const r of allResults.filter(r => r.status === 'fail' && r.fix)) {
      console.log(`    ${chalk.red('✗')} ${r.name}: ${r.fix}`);
    }
    console.log();
  }

  if (warned > 0 && failed === 0) {
    console.log(chalk.yellow('  Some warnings detected, but myintern should work.\n'));
  }

  if (failed === 0 && warned === 0) {
    console.log(chalk.green.bold('  Everything looks good! You\'re ready to use myintern.\n'));
  }
}

function printResult(result: CheckResult): void {
  let icon: string;
  if (result.status === 'pass') icon = chalk.green('✓');
  else if (result.status === 'warn') icon = chalk.yellow('⚠');
  else icon = chalk.red('✗');

  const nameColor = result.status === 'fail' ? chalk.red : chalk.white;
  console.log(`    ${icon} ${nameColor(result.name)}: ${result.message}`);

  if (result.detail) {
    console.log(`      ${chalk.gray(result.detail)}`);
  }
}
