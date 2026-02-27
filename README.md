# MyIntern 🤖

**Your AI Junior Developer for Java/Spring Boot Projects**

[![npm version](https://img.shields.io/npm/v/myintern.svg)](https://www.npmjs.com/package/myintern)
[![License: BSL 1.1](https://img.shields.io/badge/License-BSL%201.1-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Support on Ko-fi](https://img.shields.io/badge/Support%20on-Ko--fi-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/myintern)
[![Website](https://img.shields.io/badge/Website-myintern.dev-blue)](https://www.myintern.dev/)

MyIntern is an autonomous AI agent that acts like a **junior software engineer** for Java and Spring Boot projects. It generates production-ready code from specifications, writes comprehensive tests, and helps maintain code quality—all running locally on your machine.

**Key Features:**
- 🚀 Generate Spring Boot code from specs
- ✅ Auto-generate JUnit tests with 80%+ coverage
- 🔒 Security & best practice reviews
- 🛠️ Fix build errors automatically
- 💬 Ask clarifying questions when needed
- 📋 Jira MCP integration for ticket-to-spec conversion (NEW v1.2)
- 🔍 Immutable audit trail for compliance (v1.2)

## Quick Start

```bash
# Install
npm install -g myintern

# Initialize in your Spring Boot project
cd my-spring-project
myintern init
```

**Set up authentication (pick one):**

```bash
# Option 1: Claude Pro/Max subscribers (Recommended — free with subscription)
brew install anthropics/claude/claude
claude auth login

# Option 2: Anthropic API key
export ANTHROPIC_API_KEY=sk-ant-your-key-here
```

```bash
# Start watching
myintern start
```

**Create a spec file:**

```markdown
# TODO: User Registration API

## Requirements
- POST /api/users/register endpoint
- Email validation + bcrypt hashing
- Duplicate email → 409 Conflict
- Unit tests with 80%+ coverage
```

MyIntern detects the spec, analyzes your codebase patterns, generates code, and creates tests automatically.

## Core Capabilities

**Specialized Agents:**
- 🤖 **Code Agent** - Generates Spring Boot code from specs
- ✅ **Test Agent** - Creates JUnit tests (80%+ coverage)
- 🏗️ **Build Agent** - Fixes Maven/Gradle issues
- 🔍 **Review Agent** - Security & best practice checks

**Spring Boot Expertise:**
- Spring Data JPA, Security, Cloud
- Maven & Gradle
- RESTful API patterns
- Microservices architecture

**Local-First & Secure:**
- Runs on your machine
- Free with Claude Pro/Max subscription, or bring your own API key
- Business Source License 1.1 (BSL/BUSL-1.1)

## Commands

```bash
myintern init              # Initialize in project
myintern start             # Start all agents
myintern start --jira PROJ-123  # Fetch Jira ticket & create spec (v1.2)
myintern status            # Check status
myintern audit             # View immutable audit trail (v1.2)
myintern chat              # Interactive mode
myintern logs --follow     # View logs
```

## Configuration

Edit `.myintern/agent.yml` in your project:

```yaml
# Option 1: Claude Pro/Max subscription (no API key needed)
llm:
  provider: claude-cli
  model: claude-sonnet-4-5-20250929

# Option 2: Anthropic API key
# llm:
#   provider: anthropic
#   model: claude-sonnet-4-5-20250929
#   api_key: ${ANTHROPIC_API_KEY}

agents:
  code: true
  test: true
  build: true

watch:
  paths: [".myintern/specs/**/*.md", "src/**/*.java"]
```

## Support

If you find MyIntern helpful, consider supporting development:

[![Support on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/myintern)

- **GitHub Issues:** [github.com/myinterndev/myintern/issues](https://github.com/myinterndev/myintern/issues)
- **Contributing:** We welcome PRs! Areas we need help: Gradle support, Kotlin support, additional Spring patterns

## License

Business Source License 1.1 - see [LICENSE](LICENSE)

Free for non-commercial use. Commercial use requires a license. See [LICENSE](LICENSE) for details.

---

**Built with ❤️ by developers, for developers**
