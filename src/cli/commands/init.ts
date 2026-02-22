import chalk from 'chalk';
import inquirer from 'inquirer';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigManager, MyInternConfig } from '../../core/Config';

export async function initCommand() {
  console.log(chalk.blue.bold('\n🚀 Initializing MyIntern in your project...\n'));

  // Check if already initialized
  const configManager = new ConfigManager();
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
  const cwd = process.cwd();
  const hasMaven = fs.existsSync(path.join(cwd, 'pom.xml'));
  const hasGradle = fs.existsSync(path.join(cwd, 'build.gradle')) ||
                    fs.existsSync(path.join(cwd, 'build.gradle.kts'));

  const buildTool = hasMaven ? 'maven' : hasGradle ? 'gradle' : null;

  if (!buildTool) {
    console.log(chalk.red('❌ No Maven or Gradle project detected.'));
    console.log(chalk.gray('   MyIntern requires a Java/Spring Boot project with Maven or Gradle.'));
    console.log(chalk.gray('   Make sure you run this command in your project root directory.\n'));
    return;
  }

  console.log(chalk.green(`✅ Detected build tool: ${buildTool}\n`));

  // Prompt for configuration
  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'aiProvider',
      message: 'Select AI provider:',
      choices: [
        { name: 'Anthropic Claude (Recommended)', value: 'anthropic' },
        { name: 'OpenAI GPT-4', value: 'openai' }
      ],
      default: 'anthropic'
    },
    {
      type: 'password',
      name: 'apiKey',
      message: 'Enter API key:',
      validate: (input) => input.length > 0 || 'API key is required'
    }
  ]);

  // Create configuration
  const config: MyInternConfig = {
    ai: {
      provider: answers.aiProvider,
      apiKey: answers.apiKey,
      model: answers.aiProvider === 'anthropic'
        ? 'claude-sonnet-4-5-20250929'
        : 'gpt-4-turbo-preview'
    },
    build: {
      tool: buildTool
    },
    agents: {
      code: {
        enabled: true,
        autoCommit: false
      }
    }
  };

  // Save configuration
  configManager.save(config);

  // Create directory structure
  const dirs = [
    '.myintern/logs',
    '.myintern/data',
    'specs'
  ];

  for (const dir of dirs) {
    const fullPath = path.join(cwd, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  }

  // Add to .gitignore
  const gitignorePath = path.join(cwd, '.gitignore');
  let gitignore = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, 'utf-8')
    : '';

  if (!gitignore.includes('.myintern')) {
    gitignore += '\n# MyIntern\n.myintern/\n';
    fs.writeFileSync(gitignorePath, gitignore);
    console.log(chalk.gray('   Added .myintern/ to .gitignore'));
  }

  // Create example spec file
  const exampleSpec = `# Example Feature Specification

## TODO: Implement User Registration Endpoint

### Requirements
- Create a REST endpoint for user registration
- POST /api/users/register
- Accept: email, password, firstName, lastName
- Return: user ID and success message

### Acceptance Criteria
- [ ] Email validation (must be valid email format)
- [ ] Password validation (min 8 characters, 1 uppercase, 1 number)
- [ ] Duplicate email check (return 409 Conflict if exists)
- [ ] Password hashing (use BCrypt)
- [ ] Return 201 Created on success

### Implementation Notes
- Follow existing Spring Boot patterns
- Use @RestController and @PostMapping
- Add proper input validation with @Valid
- Return appropriate HTTP status codes
- Add error handling

Delete this file and create your own specs when ready!
`;

  const exampleSpecPath = path.join(cwd, 'specs', 'EXAMPLE_SPEC.md');
  if (!fs.existsSync(exampleSpecPath)) {
    fs.writeFileSync(exampleSpecPath, exampleSpec);
    console.log(chalk.gray('   Created example spec: specs/EXAMPLE_SPEC.md'));
  }

  console.log(chalk.green('\n✅ MyIntern initialized successfully!\n'));
  console.log(chalk.white('📝 Next steps:\n'));
  console.log(chalk.gray('  1. Review the example spec in specs/EXAMPLE_SPEC.md'));
  console.log(chalk.gray('  2. Create your own spec files in specs/ directory'));
  console.log(chalk.gray('  3. Run: myintern start'));
  console.log(chalk.gray('  4. MyIntern will watch and generate code automatically\n'));
}
