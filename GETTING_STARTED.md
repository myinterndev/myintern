# MyIntern - Getting Started Guide

## What You Have Now

I've set up the **foundation** for MyIntern as an open-source product:

### ✅ Completed
- [x] Vision document ([VISION.md](VISION.md))
- [x] Professional README with examples
- [x] MIT License
- [x] package.json with dependencies
- [x] TypeScript configuration
- [x] Project structure
- [x] CLI framework (commander)
- [x] GitHub repo ready: https://github.com/mjags/myintern

### 🚧 What's Next (Implementation)

You need to build 5 core components:

1. **CLI Commands** (2-3 hours)
2. **Core Agent Framework** (3-4 hours)
3. **Code Agent** (4-5 hours)
4. **Maven/Gradle Integration** (2-3 hours)
5. **AI Provider Integration** (1-2 hours)

**Total MVP time:** ~15-20 hours of focused work

---

## MVP Feature Set (v1.0)

### What to Build First

**Focus on LOCAL mode only** for MVP:

✅ **Must Have:**
1. `myintern init` - Initialize project
2. `myintern start` - Start Code Agent
3. Code Agent watches `*SPEC.md` files
4. Code Agent generates Spring Boot code (Controller, Service, Repository)
5. Maven integration (detect, run tests)
6. Basic error handling

❌ **Skip for MVP:**
- Test Agent (v1.1)
- Build Agent (v1.1)
- Review Agent (v1.2)
- Task Manager (v1.2)
- GitHub integration (v2.0)
- Chat mode (v1.1)

**Why:** Get something working quickly, then iterate.

---

## Step-by-Step Implementation Plan

### Phase 1: Setup & Infrastructure (2 hours)

#### 1.1 Install Dependencies

```bash
cd ~/source/myintern/myintern

# Install dependencies
npm install

# Build TypeScript
npm run build

# Link globally for testing
npm link
```

#### 1.2 Test CLI

```bash
# Should show help
myintern --help

# Should show version
myintern --version
```

---

### Phase 2: Core Framework (3 hours)

#### 2.1 Configuration Management

**Create:** `src/core/Config.ts`

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface MyInternConfig {
  ai: {
    provider: 'anthropic' | 'openai' | 'local';
    apiKey: string;
    model: string;
  };
  build: {
    tool: 'maven' | 'gradle';
    javaVersion?: string;
  };
  agents: {
    code: {
      enabled: boolean;
      autoCommit: boolean;
    };
  };
}

export class ConfigManager {
  private configPath: string;
  private config: MyInternConfig | null = null;

  constructor(projectRoot: string = process.cwd()) {
    this.configPath = path.join(projectRoot, '.myintern', 'config.yml');
  }

  load(): MyInternConfig {
    if (!fs.existsSync(this.configPath)) {
      throw new Error('MyIntern not initialized. Run: myintern init');
    }

    const content = fs.readFileSync(this.configPath, 'utf-8');
    this.config = yaml.load(content) as MyInternConfig;
    return this.config;
  }

  save(config: MyInternConfig): void {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.configPath, yaml.dump(config), 'utf-8');
    this.config = config;
  }

  get(key: string): any {
    if (!this.config) this.load();
    const keys = key.split('.');
    let value: any = this.config;
    for (const k of keys) {
      value = value?.[k];
    }
    return value;
  }

  set(key: string, value: any): void {
    if (!this.config) this.load();
    const keys = key.split('.');
    const lastKey = keys.pop()!;
    let obj: any = this.config;
    for (const k of keys) {
      if (!obj[k]) obj[k] = {};
      obj = obj[k];
    }
    obj[lastKey] = value;
    this.save(this.config!);
  }
}
```

#### 2.2 Base Agent Class

**Create:** `src/core/Agent.ts`

```typescript
import { EventEmitter } from 'events';
import { ConfigManager } from './Config';
import { Logger } from './Logger';

export abstract class Agent extends EventEmitter {
  protected config: ConfigManager;
  protected logger: Logger;
  protected running: boolean = false;

  constructor(protected name: string) {
    super();
    this.config = new ConfigManager();
    this.logger = new Logger(name);
  }

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;

  isRunning(): boolean {
    return this.running;
  }

  protected log(message: string, level: 'info' | 'error' | 'warn' = 'info'): void {
    this.logger.log(level, message);
    this.emit('log', { level, message });
  }
}
```

#### 2.3 Logger

**Create:** `src/core/Logger.ts`

```typescript
import * as winston from 'winston';
import * as path from 'path';
import * as fs from 'fs';

export class Logger {
  private logger: winston.Logger;

  constructor(agentName: string) {
    const logDir = path.join(process.cwd(), '.myintern', 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({
          filename: path.join(logDir, `${agentName}.log`)
        }),
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });
  }

  log(level: string, message: string): void {
    this.logger.log(level, message);
  }
}
```

---

### Phase 3: CLI Commands (2 hours)

#### 3.1 Init Command

**Create:** `src/cli/commands/init.ts`

```typescript
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { ConfigManager, MyInternConfig } from '../../core/Config';

export async function initCommand() {
  console.log(chalk.blue.bold('\n🚀 Initializing MyIntern in your project...\n'));

  // Check if already initialized
  const configPath = path.join(process.cwd(), '.myintern', 'config.yml');
  if (fs.existsSync(configPath)) {
    const { overwrite } = await inquirer.prompt([{
      type: 'confirm',
      name: 'overwrite',
      message: 'MyIntern already initialized. Overwrite configuration?',
      default: false
    }]);

    if (!overwrite) {
      console.log(chalk.yellow('Initialization cancelled.'));
      return;
    }
  }

  // Detect build tool
  const hasMaven = fs.existsSync(path.join(process.cwd(), 'pom.xml'));
  const hasGradle = fs.existsSync(path.join(process.cwd(), 'build.gradle')) ||
                    fs.existsSync(path.join(process.cwd(), 'build.gradle.kts'));

  const buildTool = hasMaven ? 'maven' : hasGradle ? 'gradle' : null;

  if (!buildTool) {
    console.log(chalk.red('❌ No Maven or Gradle project detected.'));
    console.log(chalk.gray('   MyIntern requires a Java/Spring Boot project with Maven or Gradle.'));
    return;
  }

  console.log(chalk.green(`✅ Detected build tool: ${buildTool}`));

  // Prompt for configuration
  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'aiProvider',
      message: 'Select AI provider:',
      choices: ['anthropic', 'openai'],
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
      model: answers.aiProvider === 'anthropic' ? 'claude-sonnet-4-5-20250929' : 'gpt-4'
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
  const configManager = new ConfigManager();
  configManager.save(config);

  // Create directory structure
  const dirs = [
    '.myintern/logs',
    '.myintern/data',
    'specs'
  ];

  for (const dir of dirs) {
    const fullPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  }

  // Add to .gitignore
  const gitignorePath = path.join(process.cwd(), '.gitignore');
  let gitignore = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, 'utf-8')
    : '';

  if (!gitignore.includes('.myintern')) {
    gitignore += '\n# MyIntern\n.myintern/\n';
    fs.writeFileSync(gitignorePath, gitignore);
  }

  console.log(chalk.green('\n✅ MyIntern initialized successfully!\n'));
  console.log(chalk.gray('Next steps:'));
  console.log(chalk.white('  1. Create specs in specs/ directory'));
  console.log(chalk.white('  2. Run: myintern start'));
  console.log(chalk.white('  3. MyIntern will watch and generate code\n'));
}
```

#### 3.2 Start Command

**Create:** `src/cli/commands/start.ts`

```typescript
import chalk from 'chalk';
import { CodeAgent } from '../../agents/CodeAgent';

export async function startCommand(options: { agent?: string; foreground?: boolean }) {
  console.log(chalk.blue.bold('🚀 Starting MyIntern agents...\n'));

  const agent = new CodeAgent();

  try {
    await agent.start();
    console.log(chalk.green('✅ Code Agent started\n'));
    console.log(chalk.gray('Watching specs/ directory for *SPEC.md files...'));
    console.log(chalk.gray('Press Ctrl+C to stop\n'));

    // Keep process alive
    process.on('SIGINT', async () => {
      console.log(chalk.yellow('\n\n👋 Stopping agents...'));
      await agent.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error(chalk.red(`❌ Failed to start: ${(error as Error).message}`));
    process.exit(1);
  }
}
```

---

### Phase 4: Code Agent (MVP Core) (5 hours)

**Create:** `src/agents/CodeAgent.ts`

```typescript
import * as chokidar from 'chokidar';
import * as fs from 'fs';
import * as path from 'path';
import { Agent } from '../core/Agent';
import { AnthropicProvider } from '../integrations/ai/AnthropicProvider';
import { MavenBuilder } from '../integrations/build/MavenBuilder';

export class CodeAgent extends Agent {
  private watcher: chokidar.FSWatcher | null = null;
  private aiProvider: AnthropicProvider;
  private builder: MavenBuilder;

  constructor() {
    super('code-agent');
    this.aiProvider = new AnthropicProvider(this.config);
    this.builder = new MavenBuilder();
  }

  async start(): Promise<void> {
    this.log('Starting Code Agent...');
    this.running = true;

    // Watch specs directory
    const specsDir = path.join(process.cwd(), 'specs');
    if (!fs.existsSync(specsDir)) {
      fs.mkdirSync(specsDir, { recursive: true });
    }

    this.watcher = chokidar.watch(
      path.join(specsDir, '**/*SPEC.md'),
      {
        persistent: true,
        ignoreInitial: false
      }
    );

    this.watcher.on('add', (filePath) => this.handleSpecFile(filePath));
    this.watcher.on('change', (filePath) => this.handleSpecFile(filePath));

    this.log('Code Agent started, watching for spec files...');
  }

  async stop(): Promise<void> {
    this.log('Stopping Code Agent...');
    if (this.watcher) {
      await this.watcher.close();
    }
    this.running = false;
    this.log('Code Agent stopped');
  }

  private async handleSpecFile(filePath: string): Promise<void> {
    this.log(`Detected spec file: ${path.basename(filePath)}`);

    try {
      const specContent = fs.readFileSync(filePath, 'utf-8');

      // Check if has TODOs
      if (!specContent.match(/TODO|PENDING/i)) {
        this.log('No TODOs found in spec, skipping');
        return;
      }

      this.log('Analyzing spec and generating code...');
      const implementation = await this.aiProvider.generateCode(specContent);

      // Apply generated code
      for (const file of implementation.files) {
        const fullPath = path.join(process.cwd(), file.path);
        const dir = path.dirname(fullPath);

        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(fullPath, file.content, 'utf-8');
        this.log(`✅ ${file.action === 'create' ? 'Created' : 'Modified'}: ${file.path}`, 'info');
      }

      // Run tests
      this.log('Running tests...');
      const testResult = await this.builder.test();

      if (testResult.success) {
        this.log('✅ All tests passed!', 'info');
      } else {
        this.log('⚠️  Tests failed - please review', 'warn');
      }

      this.log(`✅ Implementation complete for ${path.basename(filePath)}`);

    } catch (error) {
      this.log(`❌ Error processing spec: ${(error as Error).message}`, 'error');
    }
  }
}
```

---

## What to Do Next

### Immediate Next Steps (Today)

1. **Review the setup** I've created
2. **Install dependencies:**
   ```bash
   cd ~/source/myintern/myintern
   npm install
   ```

3. **Choose what to build first:**
   - Option A: **Full MVP** (15-20 hours) - Complete working product
   - Option B: **Quick prototype** (3-4 hours) - Just init + simple code gen
   - Option C: **I'll help you build it** - Pair programming session

### Long-term Plan

**Week 1:** Local MVP
- Basic code generation from specs
- Maven integration
- Simple Spring Boot patterns

**Week 2:** Polish & Test
- Test with real Spring Boot project
- Fix bugs
- Add documentation

**Week 3:** Open Source Launch
- Create demo video
- Write blog post
- Post on Reddit, HackerNews, Twitter
- Set up Discord community

**Month 2:** Enhance
- Add Test Agent
- Add Gradle support
- Community feedback

**Month 3:** Monetization
- Pro tier with GitHub integration
- Landing page
- Stripe integration

---

## My Recommendation

**Start small, ship fast:**

1. Build **just the Code Agent** (5 hours)
2. Test it on K2 Platform
3. Record a demo video
4. Open source it
5. Get feedback
6. Iterate

Don't try to build everything at once. Get something working, share it, learn from users.

---

## Want Me to Help Build This?

I can help you:

1. **Implement the Code Agent** (the core MVP)
2. **Write the AI integration code**
3. **Create Spring Boot templates**
4. **Build Maven/Gradle integration**
5. **Test it on your K2 Platform**

Just say: "Let's build the Code Agent" and I'll start implementing!

---

**You have a GREAT product idea. Let's make it real! 🚀**
