import chalk from 'chalk';
import inquirer from 'inquirer';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigManager, AgentConfig, SUPPORTED_MODELS } from '../../core/ConfigManager';

export async function initCommand() {
  console.log(chalk.blue.bold('\n🚀 Initializing MyIntern (Java/Spring Boot Agent)\n'));

  const cwd = process.cwd();
  const configManager = new ConfigManager(cwd);

  // Check if already initialized
  if (configManager.exists()) {
    const { overwrite } = await inquirer.prompt([{
      type: 'confirm',
      name: 'overwrite',
      message: 'MyIntern already initialized. Overwrite configuration?',
      default: false
    }]);

    if (!overwrite) {
      console.log(chalk.yellow('\n✋ Initialization cancelled.\n'));
      return;
    }
  }

  // Detect build tool
  const hasMaven = fs.existsSync(path.join(cwd, 'pom.xml'));
  const hasGradle = fs.existsSync(path.join(cwd, 'build.gradle')) ||
                    fs.existsSync(path.join(cwd, 'build.gradle.kts'));

  const buildTool = hasMaven ? 'maven' : hasGradle ? 'gradle' : null;

  if (!buildTool) {
    console.log(chalk.red('❌ No Maven or Gradle project detected.'));
    console.log(chalk.gray('   MyIntern v1.0 requires a Java/Spring Boot project.'));
    console.log(chalk.gray('   Make sure you run this in your project root directory.\n'));
    return;
  }

  console.log(chalk.green(`✅ Detected: ${buildTool}\n`));

  // Detect Java version from pom.xml or build.gradle
  let detectedJavaVersion = '17';
  if (hasMaven) {
    const pomContent = fs.readFileSync(path.join(cwd, 'pom.xml'), 'utf-8');
    const match = pomContent.match(/<java\.version>(\d+)<\/java\.version>/);
    if (match) detectedJavaVersion = match[1];
  }

  // Prompt for configuration
  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: 'Select AI provider:',
      choices: [
        { name: 'Anthropic Claude (Recommended for Java)', value: 'anthropic' },
        { name: 'OpenAI GPT-4', value: 'openai' }
      ],
      default: 'anthropic'
    },
    {
      type: 'list',
      name: 'model',
      message: (answers: any) => `Select ${answers.provider === 'anthropic' ? 'Claude' : 'GPT'} model:`,
      choices: (answers: any) => {
        const models = SUPPORTED_MODELS[answers.provider as 'anthropic' | 'openai'];
        return models.map(m => ({ name: m, value: m }));
      }
    },
    {
      type: 'input',
      name: 'javaVersion',
      message: 'Java version:',
      default: detectedJavaVersion,
      validate: (input) => /^\d+$/.test(input) || 'Must be a number (e.g., 17, 21)'
    },
    {
      type: 'confirm',
      name: 'enableTests',
      message: 'Enable automatic test generation?',
      default: true
    }
  ]);

  // Create configuration
  const config: AgentConfig = {
    version: '1.0',

    llm: {
      provider: answers.provider,
      model: answers.model,
      api_key: answers.provider === 'anthropic'
        ? '${ANTHROPIC_API_KEY}'
        : '${OPENAI_API_KEY}'
    },

    java: {
      version: answers.javaVersion
    },

    agents: {
      code: true,
      test: answers.enableTests,
      build: true
    },

    watch: {
      paths: ['.myintern/specs/**/*.md', 'src/**/*.java'],
      ignore: ['target/', '.git/', '.myintern/logs/'],
      debounce_ms: 2000
    },

    build: {
      tool: buildTool as 'maven' | 'gradle',
      commands: buildTool === 'maven' ? {
        compile: 'mvn compile',
        test: 'mvn test',
        package: 'mvn package -DskipTests'
      } : {
        compile: './gradlew compileJava',
        test: './gradlew test',
        package: './gradlew build -x test'
      }
    },

    git: {
      protected_branches: ['main', 'master', 'production'],
      auto_commit: false,
      branch_prefix: 'myintern/'
    },

    safety: {
      backward_compatibility: true,
      run_regression_tests: true
    }
  };

  // Save configuration
  configManager.save(config);
  console.log(chalk.green('   ✓ Created .myintern/agent.yml'));

  // Create directory structure
  const dirs = [
    '.myintern/specs',
    '.myintern/practices',
    '.myintern/logs'
  ];

  for (const dir of dirs) {
    const fullPath = path.join(cwd, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  }
  console.log(chalk.green('   ✓ Created directory structure'));

  // Prompt for practices template format
  const { practicesFormat } = await inquirer.prompt([{
    type: 'list',
    name: 'practicesFormat',
    message: 'Select coding practices format:',
    choices: [
      { name: 'Detailed (50 rules, one per line) - practices.md', value: 'detailed' },
      { name: 'Minimal (18 compact rules) - practices-min.md', value: 'minimal' }
    ],
    default: 'detailed'
  }]);

  // Copy practices template
  const practicesFileName = practicesFormat === 'minimal' ? 'practices-min.md' : 'practices.md';
  const practicesTemplate = path.join(__dirname, '../../../templates', practicesFileName);
  const practicesDest = path.join(cwd, '.myintern/practices', practicesFileName);

  if (fs.existsSync(practicesTemplate)) {
    fs.copyFileSync(practicesTemplate, practicesDest);
    console.log(chalk.green(`   ✓ Created practices/${practicesFileName}`));
  } else {
    console.log(chalk.yellow(`   ⚠ Template not found: ${practicesTemplate}`));
  }

  // Copy spec template
  const specTemplate = path.join(__dirname, '../../../templates/spec.md');
  const specDest = path.join(cwd, '.myintern/specs/spec-example.md');

  if (fs.existsSync(specTemplate)) {
    fs.copyFileSync(specTemplate, specDest);
    console.log(chalk.green('   ✓ Created specs/spec-example.md'));
  } else {
    console.log(chalk.yellow(`   ⚠ Template not found: ${specTemplate}`));
  }

  // Create .env.example
  const envExample = `# MyIntern Environment Variables

# Set your API key here (DO NOT commit this file with real keys)
${answers.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'}=your_key_here

# Get your key from:
# - Anthropic: https://console.anthropic.com/
# - OpenAI: https://platform.openai.com/api-keys
`;

  const envExamplePath = path.join(cwd, '.myintern/.env.example');
  fs.writeFileSync(envExamplePath, envExample);
  console.log(chalk.green('   ✓ Created .env.example'));

  // Add to .gitignore
  const gitignorePath = path.join(cwd, '.gitignore');
  let gitignore = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, 'utf-8')
    : '';

  if (!gitignore.includes('.myintern/logs/')) {
    gitignore += '\n# MyIntern\n.myintern/logs/\n.myintern/.env\n';
    fs.writeFileSync(gitignorePath, gitignore);
    console.log(chalk.green('   ✓ Updated .gitignore'));
  }

  console.log(chalk.green('\n✅ MyIntern initialized successfully!\n'));
  console.log(chalk.white('📝 Next steps:\n'));
  console.log(chalk.gray(`  1. Set your API key:`));
  console.log(chalk.cyan(`     export ${answers.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'}=your_key_here\n`));
  console.log(chalk.gray(`  2. Review coding practices: .myintern/practices/${practicesFileName}`));
  console.log(chalk.gray('  3. Check example spec: .myintern/specs/spec-example.md'));
  console.log(chalk.gray('  4. Create your own spec files: .myintern/specs/spec-<feature-name>.md'));
  console.log(chalk.gray('  5. Start the agent:'));
  console.log(chalk.cyan('     myintern start\n'));
  console.log(chalk.yellow('⚠️  Important: All spec files must start with "spec-" prefix\n'));
}
