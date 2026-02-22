# MyIntern 🤖

**Your AI Junior Developer for Java/Spring Boot Projects**

[![npm version](https://img.shields.io/npm/v/myintern.svg)](https://www.npmjs.com/package/myintern)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)

---

## What is MyIntern?

MyIntern is an autonomous AI agent that acts like a **junior software engineer** specifically for Java and Spring Boot projects. It works locally on your machine, watches your codebase, and helps you:

- ✅ **Generate production-ready code** from specifications
- ✅ **Write comprehensive tests** (JUnit/TestNG) automatically
- ✅ **Review your code** for security, performance, and best practices
- ✅ **Fix build errors** and dependency conflicts
- ✅ **Ask clarifying questions** when requirements are unclear
- ✅ **Learn your coding patterns** and follow them

---

## Why MyIntern?

### For Solo Developers
- Can't afford to hire? Get a tireless junior dev for $0 (bring your own API key)
- Ship features 5x faster
- Work 20 hours/week instead of 80

### For Small Teams
- Augment your team with AI developers
- Let juniors focus on learning, not boilerplate
- Enforce coding standards automatically

### For Enterprise
- Boost developer productivity
- Reduce onboarding time for new engineers
- Maintain code quality across teams

---

## Quick Start

### Installation

```bash
# Install globally via npm
npm install -g myintern

# Or clone and build from source
git clone https://github.com/myinterndev/myintern.git
cd myintern
npm install
npm run build
npm link
```

### Setup

```bash
# Initialize in your Spring Boot project
cd my-spring-project
myintern init

# Configure AI provider (Anthropic Claude)
myintern config set ai.provider anthropic
myintern config set ai.apiKey sk-ant-your-key-here

# Start all agents
myintern start
```

### Usage

#### Method 1: Specification Files

Create a spec file with TODOs:

```bash
cat > src/specs/UserRegistration_SPEC.md << 'EOF'
# User Registration Feature

## TODO: Implement REST API

### Requirements
- POST /api/users/register endpoint
- Email verification required
- Password bcrypt hashed
- Send welcome email

### Acceptance Criteria
- [ ] Email validation (RFC 5322)
- [ ] Password strength: min 8 chars, 1 uppercase, 1 number
- [ ] Duplicate email returns 409 Conflict
- [ ] Unit tests with 80%+ coverage
EOF
```

MyIntern will:
1. Detect the spec file
2. Analyze your existing codebase patterns
3. Generate controller, service, repository, entities
4. Create comprehensive tests
5. Report when done

#### Method 2: Interactive Chat

```bash
myintern chat

> You: Implement user registration with email verification
> MyIntern: I have a few questions:
>   1. Email service: AWS SES, SendGrid, or local SMTP?
>   2. Token expiry for verification link?
>   3. Should I use Spring Security for password hashing?

> You: AWS SES, 24 hours, yes

> MyIntern: Got it! Breaking down into 4 subtasks:
>   1. UserController with /register endpoint
>   2. UserService with verification logic
>   3. EmailService integration
>   4. Tests (unit + integration)
>
>   Starting implementation...
```

---

## Features

### 🤖 Intelligent Agents

#### CODE AGENT
- Watches `*SPEC.md`, `*TODO.md` files
- Generates Spring Boot code following your patterns
- Asks questions when unclear
- Creates feature branches

#### TEST AGENT
- Watches source code changes
- Generates JUnit/TestNG tests
- Targets 80%+ coverage
- Includes edge cases

#### BUILD AGENT
- Monitors Maven/Gradle builds
- Auto-fixes dependency conflicts
- Manages version updates

#### REVIEW AGENT
- Checks for security vulnerabilities
- Identifies performance issues
- Suggests Spring Boot best practices

#### TASK MANAGER
- Breaks down complex features
- Assigns subtasks to agents
- Tracks progress
- Reports blockers

### 🎯 Java/Spring Boot Expertise

MyIntern understands:
- Spring Boot architecture patterns
- Spring Data JPA
- Spring Security
- Spring Cloud
- Maven and Gradle
- JUnit 5 and TestNG
- Liquibase/Flyway
- RESTful API design
- Microservices patterns

### 🔒 Local-First & Secure

- Runs entirely on your machine
- Your code never leaves your computer
- Bring your own API key
- Open source (audit the code yourself)

### 📊 Production-Ready Code

Generated code includes:
- Proper error handling
- Input validation
- Security best practices
- Logging (SLF4J)
- API documentation (Swagger)
- Comprehensive tests

---

## Configuration

MyIntern creates `.myintern/config.yml` in your project:

```yaml
# AI Provider
ai:
  provider: anthropic  # anthropic, openai, local
  apiKey: sk-ant-...
  model: claude-sonnet-4-5

# Build Tool (auto-detected)
build:
  tool: maven  # or gradle
  javaVersion: 21
  springBootVersion: 3.3.x

# Agents
agents:
  code:
    enabled: true
    autoCommit: false  # Manual review required
  test:
    enabled: true
    targetCoverage: 80
  review:
    enabled: true
    securityScan: true

# Code Style
codeStyle:
  format: google  # google, sun, checkstyle
  lineLength: 120
```

---

## Commands

```bash
# Initialize MyIntern in project
myintern init

# Start all agents
myintern start

# Start specific agent
myintern start --agent code

# Stop agents
myintern stop

# Check status
myintern status

# Interactive chat
myintern chat

# View logs
myintern logs --follow

# View notifications
myintern notifications

# Configuration
myintern config set <key> <value>
myintern config get <key>
myintern config list
```

---

## Examples

### Example: REST API CRUD

**Input:** `specs/ProductAPI_TODO.md`

```markdown
# TODO: Product CRUD API

- GET /api/products (with pagination)
- GET /api/products/{id}
- POST /api/products
- PUT /api/products/{id}
- DELETE /api/products/{id}
```

**MyIntern generates:**
- `ProductController.java`
- `ProductService.java`
- `ProductRepository.java`
- `Product.java` (entity)
- `ProductDto.java`
- `ProductMapper.java`
- Tests (34 tests, 87% coverage)

**Time:** ~3 minutes

### Example: Security Fix

MyIntern finds SQL injection:

```
🔒 Security Issue in UserController.java:45

Current:
String query = "SELECT * FROM users WHERE email = '" + email + "'";

Fix:
@Query("SELECT u FROM User u WHERE u.email = :email")
User findByEmail(@Param("email") String email);

Apply fix? (y/n)
```

---

## Architecture

```
myintern/
├── cli/              # CLI commands
├── agents/           # Agent implementations
├── core/             # Core framework
├── integrations/     # AI, build tools, git
├── patterns/         # Spring Boot patterns
└── templates/        # Code generation templates
```

**Tech Stack:**
- TypeScript 5.3
- Anthropic Claude API
- Chokidar (file watching)
- Simple Git
- Commander (CLI)

---

## Roadmap

### v1.0 - Local Mode (Current)
- [x] File watching
- [x] Code generation from specs
- [ ] Test generation
- [ ] Maven/Gradle integration
- [ ] Interactive chat
- [ ] Spring Boot pattern library

### v1.1 - Enhanced Intelligence
- [ ] Conversation memory
- [ ] Multi-file refactoring
- [ ] Dependency resolution
- [ ] Security scanning

### v2.0 - Cloud Integration
- [ ] GitHub integration
- [ ] Automated PR creation
- [ ] CI/CD integration
- [ ] Team dashboard

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md).

**Areas we need help:**
- Gradle support
- Additional Spring patterns
- Kotlin support
- IntelliJ IDEA plugin
- VS Code extension

---

## Support

- **Documentation:** [docs.myintern.dev](https://docs.myintern.dev)
- **GitHub Issues:** [github.com/myinterndev/myintern/issues](https://github.com/myinterndev/myintern/issues)
- **Discord:** [discord.gg/myintern](https://discord.gg/myintern)

---

## License

MIT License - see [LICENSE](LICENSE)

---

## FAQ

**Q: Does MyIntern replace developers?**
A: No. It acts like a junior developer on your team. You're still the architect and reviewer.

**Q: What AI providers are supported?**
A: Anthropic Claude, OpenAI GPT-4, and local LLMs (Ollama, LM Studio).

**Q: How much does it cost?**
A: MyIntern is free and open source. You only pay for AI API usage (~$50-100/month for active development).

**Q: Can I use it offline?**
A: Yes, if you use a local LLM provider.

**Q: Is my code secure?**
A: Yes. Everything runs locally. Code only goes to the AI provider you choose (or stays local with local LLMs).

**Q: What about Kotlin?**
A: Kotlin support is on the roadmap for v1.2.

---

**Built with ❤️ by developers, for developers**

**Star ⭐ us on GitHub if you find this useful!**
