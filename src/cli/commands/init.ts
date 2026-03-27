import chalk from 'chalk';
import inquirer from 'inquirer';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigManager, AgentConfig, SUPPORTED_MODELS } from '../../core/ConfigManager';

/**
 * Create a practices.md placeholder file
 */
function createPracticesPlaceholder(filePath: string, format: 'detailed' | 'minimal', javaVersion: string) {
  const detailedContent = `# Java

> **Instructions:** Edit the rules below to match your project standards. MyIntern will follow these rules exactly.

---

## Versions & Dependencies

1. Java version: ${javaVersion} (use latest LTS features)
2. Spring Boot version: 3.4.x (always use latest stable)
3. Dependency management: Use latest stable versions from Maven Central
4. When adding dependencies: Always prefer latest non-SNAPSHOT versions
5. Update strategy: Check for updates before adding new features

---

## Architecture & Structure

1. Follow Controller → Service → Repository pattern (3-tier architecture)
2. Controllers handle HTTP only, no business logic
3. Services contain business logic and transactions
4. Use constructor injection, not \`@Autowired\` field injection
5. Apply \`@Transactional\` on service methods only

---

## Naming Conventions

1. Package names: lowercase only (\`com.example.service\`)
2. Classes: PascalCase (\`UserService\`, \`OrderController\`)
3. Methods/variables: camelCase (\`findUserById\`, \`emailAddress\`)
4. Constants: UPPER_SNAKE_CASE (\`MAX_RETRY_ATTEMPTS\`)

---

## Lombok

1. Enabled: YES
2. Allowed annotations: \`@Data\`, \`@Getter\`, \`@Setter\`, \`@Slf4j\`, \`@RequiredArgsConstructor\`
3. Forbidden: \`@AllArgsConstructor\`, \`@Builder\`

---

## DTOs

1. Use Java Records for immutable DTOs
2. Apply Bean Validation: \`@NotNull\`, \`@Email\`, \`@Size\`
3. Use \`@Valid\` in controller methods

---

## Error Handling

1. Custom exceptions extend \`RuntimeException\`
2. Use \`@RestControllerAdvice\` for global exception handling
3. HTTP status codes:
   - 400 Bad Request (validation)
   - 404 Not Found (missing resource)
   - 409 Conflict (duplicate)
   - 500 Internal Server Error

---

## Security

1. Passwords: Always use BCrypt via \`PasswordEncoder\`
2. Secrets: Use \`\${ENV_VAR}\` in \`application.yml\`, never hardcode
3. Never log passwords, tokens, or API keys

---

## Database

1. Entities: Use \`@Entity\`, \`@Table\`, \`@Id\`
2. Relationships: Lazy loading by default
3. Migrations: Use Flyway (never \`ddl-auto: update\` in production)
4. Avoid N+1 queries: Use \`@EntityGraph\` or \`JOIN FETCH\`

---

## Testing

1. Unit tests: JUnit 5 + Mockito
2. Integration tests: \`@SpringBootTest\` + \`MockMvc\`
3. Test structure: Arrange-Act-Assert (AAA)
4. Test naming: \`methodName_Scenario_ExpectedOutcome\`
5. Coverage target: 80%+ for services

---

## Configuration

1. Format: \`application.yml\` (preferred)
2. Externalize all credentials and URLs using \`\${ENV_VAR}\`
3. Use Spring profiles for environment-specific configs

---

## API Standards

1. REST conventions: Standard HTTP verbs (GET, POST, PUT, DELETE)
2. Endpoint naming: Plural nouns (\`/api/users\`)
3. Response format: Return DTOs, not entities
4. Versioning: URL-based (\`/api/v1/users\`)

---

## Logging

1. Framework: SLF4J + Logback
2. Use \`@Slf4j\` from Lombok
3. Never log sensitive data (passwords, tokens, PII)
4. No \`System.out.println\` in production code

---

## Code Quality Rules

1. No hardcoded values (use \`application.yml\`)
2. No unused imports or variables
3. Exception handling required for external calls
4. All code must compile and pass tests before commit
`;

  const minimalContent = `# Java

1. Java ${javaVersion}, Spring Boot 3.4.x, always use latest stable dependencies from Maven Central
2. Follow Controller → Service → Repository pattern (3-tier architecture)
3. Controllers handle HTTP only, Services contain business logic, Repositories handle data access
4. Use constructor injection, not \`@Autowired\` field injection
5. Apply \`@Transactional\` on service methods only
6. Packages: lowercase (\`com.example.service\`), Classes: PascalCase (\`UserService\`), Methods/variables: camelCase (\`findUserById\`), Constants: UPPER_SNAKE_CASE (\`MAX_RETRY_ATTEMPTS\`)
7. Lombok enabled: \`@Data\`, \`@Getter\`, \`@Setter\`, \`@Slf4j\`, \`@RequiredArgsConstructor\` allowed, \`@AllArgsConstructor\` and \`@Builder\` forbidden
8. Use Java Records for immutable DTOs, apply Bean Validation (\`@NotNull\`, \`@Email\`, \`@Size\`), use \`@Valid\` in controllers
9. Custom exceptions extend \`RuntimeException\`, use \`@RestControllerAdvice\` for global handling
10. HTTP codes: 400 (validation), 404 (not found), 409 (conflict), 500 (server error)
11. Passwords: BCrypt via \`PasswordEncoder\`, Secrets: \`\${ENV_VAR}\` in \`application.yml\`, never log passwords/tokens/keys
12. Entities: \`@Entity\`, \`@Table\`, \`@Id\`, lazy loading by default, use Flyway migrations
13. Avoid N+1 queries: use \`@EntityGraph\` or \`JOIN FETCH\`
14. Unit tests: JUnit 5 + Mockito, Integration: \`@SpringBootTest\` + \`MockMvc\`, AAA pattern, 80%+ coverage for services
15. Use \`application.yml\`, externalize credentials with \`\${ENV_VAR}\`, use Spring profiles for environments
16. REST conventions: standard HTTP verbs, plural nouns (\`/api/users\`), return DTOs not entities, URL versioning (\`/api/v1/users\`)
17. SLF4J + Logback, use \`@Slf4j\` from Lombok, never log sensitive data, no \`System.out.println\`
18. No hardcoded values, no unused imports, exception handling for external calls, all code must compile and pass tests
`;

  const content = format === 'minimal' ? minimalContent : detailedContent;
  fs.writeFileSync(filePath, content);
}

/**
 * Create a java-project.md placeholder file with project-specific details
 */
function createJavaProjectPlaceholder(filePath: string, details: {
  projectName: string;
  basePackage: string;
  javaVersion: string;
  springBootVersion: string;
  database: string;
  buildTool: string;
}) {
  const content = `# ${details.projectName} - Project Details

> **Instructions:** This file contains project-specific information that MyIntern will use to generate code that matches your project structure.

---

## Project Information

- **Project Name:** ${details.projectName}
- **Base Package:** ${details.basePackage}
- **Java Version:** ${details.javaVersion}
- **Spring Boot Version:** ${details.springBootVersion}
- **Build Tool:** ${details.buildTool === 'maven' ? 'Maven' : 'Gradle'}
- **Database:** ${details.database}

---

## Package Structure

\`\`\`
${details.basePackage}/
├── controller/     # REST controllers
├── service/        # Business logic
├── repository/     # Data access
├── model/          # Entity classes
├── dto/            # Data transfer objects
├── config/         # Configuration classes
├── exception/      # Custom exceptions
└── util/           # Utility classes
\`\`\`

---

## Common Patterns

### Controller Example
\`\`\`java
package ${details.basePackage}.controller;

import ${details.basePackage}.service.UserService;
import ${details.basePackage}.dto.UserDTO;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserController {
    private final UserService userService;

    @GetMapping("/{id}")
    public UserDTO getUser(@PathVariable Long id) {
        return userService.findById(id);
    }
}
\`\`\`

### Service Example
\`\`\`java
package ${details.basePackage}.service;

import ${details.basePackage}.repository.UserRepository;
import ${details.basePackage}.dto.UserDTO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class UserService {
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public UserDTO findById(Long id) {
        // Implementation
    }
}
\`\`\`

### Repository Example
\`\`\`java
package ${details.basePackage}.repository;

import ${details.basePackage}.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, Long> {
    // Custom queries
}
\`\`\`

---

## Notes

- Always follow the package structure above
- Use the base package \`${details.basePackage}\` for all new classes
- Follow the patterns shown in the examples
- Refer to \`practices.md\` or \`practices-min.md\` for coding standards
`;

  fs.writeFileSync(filePath, content);
}

/**
 * Create a spec-example.md placeholder file
 */
function createSpecPlaceholder(filePath: string) {
  const content = `# [Brief Feature Name]

**Jira:** [TICKET-123] *(optional)*
**Type:** feature | bugfix | refactor
**Priority:** high | medium | low

---

## Description

[2-3 paragraphs describing what needs to be implemented and why. Be specific about business requirements, edge cases, and integration points. If this is an API endpoint, describe the request/response flow.]

---

## Acceptance Criteria

- [ ] [Specific, testable requirement 1]
- [ ] [Specific, testable requirement 2]
- [ ] [Specific, testable requirement 3]
- [ ] Unit tests with 80%+ coverage
- [ ] No build errors
- [ ] Backward compatibility maintained

---

## Notes *(optional)*

[Any additional context, constraints, or references to existing code]
`;

  fs.writeFileSync(filePath, content);
}

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
      auto_branch: false,         // User manages branches by default
      branch_prefix: 'myintern/', // Used only if auto_branch: true
      auto_commit: false,
      auto_pr: false,             // User creates PRs manually by default
      pr_base_branch: 'main'
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

  // Copy practices template (with fallback to placeholder)
  const practicesFileName = practicesFormat === 'minimal' ? 'practices-min.md' : 'practices.md';
  const practicesTemplate = path.join(__dirname, '../../../templates/practices', practicesFileName);
  const practicesDest = path.join(cwd, '.myintern/practices', practicesFileName);

  if (fs.existsSync(practicesTemplate)) {
    fs.copyFileSync(practicesTemplate, practicesDest);
    console.log(chalk.green(`   ✓ Created practices/${practicesFileName}`));
  } else {
    // Create placeholder if template not found
    createPracticesPlaceholder(practicesDest, practicesFormat, answers.javaVersion);
    console.log(chalk.green(`   ✓ Created practices/${practicesFileName} (placeholder)`));
  }

  // Prompt for Java project details
  const { createProjectDetails } = await inquirer.prompt([{
    type: 'confirm',
    name: 'createProjectDetails',
    message: 'Create a java-project.md file with your project details?',
    default: true
  }]);

  if (createProjectDetails) {
    const projectDetails = await inquirer.prompt([
      {
        type: 'input',
        name: 'projectName',
        message: 'Project name:',
        default: path.basename(cwd)
      },
      {
        type: 'input',
        name: 'basePackage',
        message: 'Base package (e.g., com.example.myapp):',
        validate: (input) => /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/.test(input) || 'Invalid package format'
      },
      {
        type: 'input',
        name: 'springBootVersion',
        message: 'Spring Boot version:',
        default: '3.4.x'
      },
      {
        type: 'input',
        name: 'database',
        message: 'Database (e.g., PostgreSQL, MySQL, H2):',
        default: 'PostgreSQL'
      }
    ]);

    createJavaProjectPlaceholder(
      path.join(cwd, '.myintern/practices/java-project.md'),
      {
        projectName: projectDetails.projectName,
        basePackage: projectDetails.basePackage,
        javaVersion: answers.javaVersion,
        springBootVersion: projectDetails.springBootVersion,
        database: projectDetails.database,
        buildTool: buildTool
      }
    );
    console.log(chalk.green('   ✓ Created practices/java-project.md'));
  }

  // Copy spec template (with fallback to placeholder)
  const specTemplate = path.join(__dirname, '../../../templates/specs/spec.md');
  const specDest = path.join(cwd, '.myintern/specs/spec-example.md');

  if (fs.existsSync(specTemplate)) {
    fs.copyFileSync(specTemplate, specDest);
    console.log(chalk.green('   ✓ Created specs/spec-example.md'));
  } else {
    // Create placeholder if template not found
    createSpecPlaceholder(specDest);
    console.log(chalk.green('   ✓ Created specs/spec-example.md (placeholder)'));
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
  if (createProjectDetails) {
    console.log(chalk.gray('  3. Customize project details: .myintern/practices/java-project.md'));
    console.log(chalk.gray('  4. Check example spec: .myintern/specs/spec-example.md'));
    console.log(chalk.gray('  5. Create your own spec files: .myintern/specs/spec-<feature-name>.md'));
    console.log(chalk.gray('  6. Start the agent:'));
  } else {
    console.log(chalk.gray('  3. Check example spec: .myintern/specs/spec-example.md'));
    console.log(chalk.gray('  4. Create your own spec files: .myintern/specs/spec-<feature-name>.md'));
    console.log(chalk.gray('  5. Start the agent:'));
  }
  console.log(chalk.cyan('     myintern start\n'));
  console.log(chalk.yellow('⚠️  Important: All spec files must start with "spec-" prefix\n'));
}
