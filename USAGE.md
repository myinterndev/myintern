# MyIntern Usage Guide - Java/Spring Boot Projects

**Version:** 1.2
**Target:** Java developers working on Spring Boot projects with Maven or Gradle

---

## What is MyIntern?

MyIntern is an autonomous AI coding agent that lives in your Java/Spring Boot repository. It watches for specification files, generates code following your team's standards, compiles, tests, and even fixes errors automatically.

**Key Features:**
- ✅ Watches `.myintern/specs/` for feature requests
- ✅ Generates Spring Boot code (Controllers, Services, Repositories, DTOs, Entities)
- ✅ Follows your team's coding practices (`.myintern/practices/java.md`)
- ✅ Auto-compiles with Maven/Gradle
- ✅ Generates JUnit tests automatically
- ✅ Auto-fixes compilation errors (max 3 retries)
- ✅ Creates feature branches (never commits to main)
- ✅ Free with Claude Pro/Max subscription, or BYOK (Bring Your Own Key)
- ✅ **NEW v1.1:** Zero-setup code review (`myintern review`) - audit any codebase instantly
- ✅ **NEW v1.1:** Rollback support - safely undo any changes with git integration
- ✅ **NEW v1.1:** Dry-run preview - see changes before applying them
- ✅ **NEW v1.1:** GitHub Issues sync - convert issues to specs automatically
- ✅ **NEW v1.1:** Spring Boot intelligence - auto-detects 2.x vs 3.x, correct imports
- ✅ **NEW v1.1:** Feedback loop - learns from your code reviews to improve
- ✅ **NEW v1.1:** Guardrails - PII/PHI/credential protection (HIPAA/PCI-DSS compliant)
- ✅ **NEW v1.2:** Multi-repo support - monorepo/microservices context awareness
- ✅ **NEW v1.2:** Context loading - auto-loads CLAUDE.md, .cursorrules, etc.
- ✅ **NEW v1.2:** Parallel execution - conflict-aware parallel spec processing
- ✅ **NEW v1.2:** Spec file caching - 70-90% faster spec parsing

---

## Installation

```bash
npm install -g myintern
```

---

## Quick Start (5 minutes)

### Step 1: Initialize in Your Project

Navigate to your Spring Boot project root and run:

```bash
cd /path/to/your/spring-boot-project
myintern init
```

**What it does:**
1. Detects your build tool (Maven or Gradle)
2. Asks for AI provider (Claude CLI with Pro subscription, Anthropic API, OpenAI, or Bedrock)
3. Prompts for model selection
4. Creates `.myintern/` folder structure
5. Copies Java coding practices template
6. Creates example spec file

**Created structure:**
```
your-project/
├── .myintern/
│   ├── agent.yml              # Configuration
│   ├── specs/                 # Your feature specs go here
│   │   └── EXAMPLE_SPEC.md    # Example to learn from
│   ├── practices/
│   │   └── java.md            # Your team's coding standards
│   ├── .context/              # Hidden global context (gitignored)
│   │   └── global-context.json # Jira ticket grouping context
│   └── logs/                  # Execution logs
│       ├── executions.json
│       ├── guardrails.log     # Guardrails audit trail (NEW v1.1)
│       └── guardrails-overrides.json  # False positive overrides (NEW v1.1)
├── pom.xml (or build.gradle)
└── src/...
```

### Step 2: Set Up Authentication

MyIntern supports four AI providers:

#### **Option A: Claude Code CLI — Claude Pro/Max Subscribers (Recommended)**

If you have a Claude Pro ($20/mo) or Max ($100/mo) subscription, you can use MyIntern **at no extra API cost** via the Claude Code CLI. This uses your existing subscription's OAuth session.

**One-time setup:**
```bash
# Install Claude Code CLI
brew install anthropics/claude/claude

# Authenticate with your Claude account
claude auth login
```

**Verify it works:**
```bash
claude auth status
# Should show: loggedIn: true, subscriptionType: pro (or max)
```

In your `.myintern/agent.yml`:
```yaml
llm:
  provider: claude-cli
  model: claude-sonnet-4-5-20250929
  # No API key needed — uses Claude Code OAuth
```

**Important:** Do NOT set `ANTHROPIC_API_KEY` in your environment when using `claude-cli`. If you previously exported one, unset it:
```bash
unset ANTHROPIC_API_KEY
```

#### **Option B: Anthropic API Key (Pay-per-use)**

If you prefer direct API access (pay per token), get your API key from https://console.anthropic.com/

```bash
export ANTHROPIC_API_KEY=sk-ant-xxx...
```

**Make it permanent** (add to `~/.zshrc` or `~/.bashrc`):
```bash
echo 'export ANTHROPIC_API_KEY=sk-ant-xxx...' >> ~/.zshrc
source ~/.zshrc
```

#### **Option C: OpenAI**

Get your API key: https://platform.openai.com/api-keys

```bash
export OPENAI_API_KEY=sk-xxx...
```

#### **Option D: AWS Bedrock (with SSO/Profile Support)**

AWS Bedrock provides Claude models through AWS infrastructure. This option is ideal for teams already using AWS with SSO authentication.

**Three Ways to Authenticate with Bedrock:**

**1. AWS SSO Profile (Recommended for Enterprise Teams):**

If your team uses AWS SSO, configure your profile:

```bash
# Configure AWS SSO (one-time setup)
aws configure sso
# Follow prompts:
# - SSO session name: my-team-session
# - SSO start URL: https://your-company.awsapps.com/start
# - SSO region: us-east-1
# - SSO account: select your account
# - SSO role: select your role
# - CLI default region: us-east-1
# - CLI default output format: json

# Login to SSO session
aws sso login --profile my-team-session

# Set profile as environment variable
export AWS_PROFILE=my-team-session
```

In your `.myintern/agent.yml`, reference the profile:
```yaml
llm:
  provider: bedrock
  model: anthropic.claude-sonnet-4-5-v1:0
  aws_region: us-east-1
  aws_profile: ${AWS_PROFILE}
```

**2. AWS Environment Variables (For CI/CD or Explicit Credentials):**

```bash
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=xxx...
export AWS_REGION=us-east-1
```

In your `.myintern/agent.yml`:
```yaml
llm:
  provider: bedrock
  model: anthropic.claude-sonnet-4-5-v1:0
  aws_region: ${AWS_REGION}
  aws_access_key_id: ${AWS_ACCESS_KEY_ID}
  aws_secret_access_key: ${AWS_SECRET_ACCESS_KEY}
```

**3. Default AWS Credential Chain (Simplest for AWS Environments):**

If running on EC2, ECS, or Lambda with IAM roles, or if your AWS credentials are already configured via `~/.aws/credentials`, MyIntern will automatically detect them:

```yaml
llm:
  provider: bedrock
  model: anthropic.claude-sonnet-4-5-v1:0
  aws_region: us-east-1
  # No credentials needed - uses default AWS credential chain
```

**Required AWS Permissions for Bedrock:**

Your IAM role/user needs these permissions:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel"
      ],
      "Resource": "arn:aws:bedrock:*:*:model/anthropic.claude*"
    }
  ]
}
```

### Step 3: Customize Coding Practices

Edit `.myintern/practices/java.md` to match your team's standards:

```bash
code .myintern/practices/java.md  # or vim, nano, etc.
```

**Customize:**
- Package structure conventions
- Naming patterns
- Error handling preferences
- Logging standards
- Testing requirements

The AI agent will follow these practices when generating code.

### Step 4: Create Your First Spec

Create a spec file in `.myintern/specs/`:

```bash
code .myintern/specs/USER_REGISTRATION_SPEC.md
```

**Example spec:**
```markdown
# FEATURE: User Registration Endpoint

## Type
feature

## Priority
high

## Context
We need a REST API endpoint for user registration. Users should be able to register with email and password. Passwords must be hashed, and duplicate emails should be rejected.

## Acceptance Criteria
- POST /api/v1/users/register endpoint
- Request body: { "email": "user@example.com", "password": "secure123" }
- Response: 201 Created with user ID
- Email validation (must be valid format)
- Password hashing with BCrypt
- Duplicate email returns 409 Conflict
- Input validation with @Valid
- Add JUnit tests

## Files Likely Affected
- src/main/java/com/example/controller/UserController.java
- src/main/java/com/example/service/UserService.java
- src/main/java/com/example/repository/UserRepository.java
- src/main/java/com/example/model/entity/User.java
- src/main/java/com/example/model/dto/RegisterUserRequest.java
- src/main/java/com/example/model/dto/UserResponse.java
- src/test/java/com/example/controller/UserControllerTest.java

## Notes
Follow Controller → Service → Repository pattern.
Use ResponseEntity<> for return types.
Add proper exception handling with @RestControllerAdvice.
```

### Step 5: Start the Agent

```bash
myintern start
```

**What happens:**
1. Agent detects your spec file
2. Creates feature branch: `myintern/feature-USER_REGISTRATION_SPEC`
3. Loads coding practices from `.myintern/practices/java.md`
4. Builds context with relevant existing code
5. Generates all required files (Controller, Service, Repository, DTOs, Entity)
6. Compiles with Maven/Gradle
7. If compilation fails, auto-fixes (max 3 attempts)
8. Generates JUnit tests
9. Runs tests
10. Logs results to `.myintern/logs/executions.json`

**Output example:**
```
✅ Code Agent started
   Watching: .myintern/specs/**/*.md, src/**/*.java

📋 Detected spec file: USER_REGISTRATION_SPEC.md
   Title: User Registration Endpoint
   Type: feature | Priority: high

   ✓ Working on branch: myintern/feature-USER_REGISTRATION_SPEC
   🔍 Building context...
   ✓ Context built: 12 files, 48520 tokens
   🤖 Generating code...
   ✓ Generated 7 files

      📝 Created: src/main/java/com/example/controller/UserController.java
      📝 Created: src/main/java/com/example/service/UserService.java
      📝 Created: src/main/java/com/example/repository/UserRepository.java
      📝 Created: src/main/java/com/example/model/entity/User.java
      📝 Created: src/main/java/com/example/model/dto/RegisterUserRequest.java
      📝 Created: src/main/java/com/example/model/dto/UserResponse.java
      📝 Created: src/main/java/com/example/exception/DuplicateEmailException.java

   🔨 Building project...
   ✓ Build successful

   🧪 Generating tests...
   ✓ Generated 1 test files
      📝 Created: src/test/java/com/example/controller/UserControllerTest.java

✨ Implementation complete!
   Branch: myintern/feature-USER_REGISTRATION_SPEC
   Files: 7 created/modified
   Commit: feat: implement user registration endpoint
```

### Step 6: Review and Merge

```bash
# Check the generated code
git status
git diff

# Review, test manually, then merge
git checkout main
git merge myintern/feature-USER_REGISTRATION_SPEC
```

---

## Configuration Reference

### `.myintern/agent.yml`

```yaml
version: "1.0"

# AI Provider — pick one:

# Option 1: Claude Pro/Max subscription (recommended — no API key needed)
llm:
  provider: claude-cli  # Uses Claude Code CLI OAuth
  model: claude-sonnet-4-5-20250929

# Option 2: Anthropic API key (pay-per-use)
# llm:
#   provider: anthropic
#   model: claude-sonnet-4-5-20250929
#   api_key: ${ANTHROPIC_API_KEY}

# Option 3: OpenAI
# llm:
#   provider: openai
#   model: gpt-4o
#   api_key: ${OPENAI_API_KEY}

# Option 4: AWS Bedrock (enterprise)
# llm:
#   provider: bedrock
#   model: anthropic.claude-sonnet-4-5-v1:0
#   aws_region: us-east-1
#   aws_profile: ${AWS_PROFILE}

# Java/Spring Boot Settings
java:
  version: "17"  # Your Java version
  spring_boot_version: "3.2.0"  # Optional, auto-detected if not specified

# Enable/Disable Agents
agents:
  code: true   # Code generation agent - generates/modifies source files using AI
  test: true   # Test generation agent - creates JUnit/Jest/pytest tests for new code
  build: true  # Build agent - runs compile + test commands (mvn compile, mvn test)

# File Watching
watch:
  paths:
    - ".myintern/specs/**/*.md"
    - "src/**/*.java"
  ignore:
    - "target/"
    - ".git/"
    - ".myintern/logs/"
  debounce_ms: 2000  # Wait 2s before processing

# Build Configuration
build:
  tool: maven  # or gradle (auto-detected if not specified)
  commands:
    compile: "mvn compile"
    test: "mvn test"
    package: "mvn package -DskipTests"

# Git Safety Rules
git:
  protected_branches:
    - main
    - master
    - production
  auto_commit: false  # Never auto-commit (safety)
  branch_prefix: "myintern/"  # Feature branch prefix

# NEW: Dry-Run Preview
preview:
  enabled: true              # Show file diffs before applying changes
  show_diffs: true           # Display line-by-line diffs
  require_approval: false    # Require manual approval (set to true for production)

# NEW: Feedback Loop
feedback:
  enabled: true              # Enable feedback collection
  auto_learn: true           # Automatically learn from feedback

# NEW v1.1: Guardrails — Sensitive Data Protection (enabled by default)
guardrails:
  enabled: true              # Scan code for PII/PHI/credentials before sending to LLM
  mode: mask                 # mask | hash | skip | none
  stopOnCritical: true       # Halt execution on CRITICAL violations
  categories:
    pii: true                # SSN, credit cards, phone numbers
    phi: true                # HIPAA medical records (MRN, ICD codes)
    credentials: true        # API keys, passwords, private keys
    custom: false            # User-defined regex patterns
  whitelist:
    - "**/*.test.java"       # Skip scanning test files
    - "**/test-data/**"      # Skip test fixtures
  customPatterns:            # Define your own detection rules (optional)
    - name: "Employee ID"
      regex: "\\bEMP-\\d{6}\\b"
      level: warn            # info | warn | block | critical
      category: custom

# NEW v1.1: GitHub Integration
github:
  enabled: false             # Enable GitHub issue sync (opt-in)
  sync_labels:               # Labels to filter issues
    - myintern
    - enhancement
  auto_close: false          # Auto-close issues when specs complete
  assignee_filter: ""        # Filter by assignee (leave empty for all)

# NEW v1.2: Multi-Repo Support (for monorepo/microservices)
repos:
  - name: api-service
    path: ./api-service
    language: java           # java | typescript | python | go
    build_tool: maven        # maven | gradle | npm | pip
  - name: web-service
    path: ./web-service
    language: java
    build_tool: gradle
  - name: shared-lib
    path: ./shared-lib
    language: java

# NEW v1.2: Watch Auto-Discovery (zero-config file watching)
watch:
  auto_discover: true        # Auto-detect src/ in each repo (default: true)
  paths:                     # Optional manual paths (if auto_discover is false)
    - ".myintern/specs/**/*.md"
  ignore:                    # Ignore patterns (glob or regex)
    - "target/"
    - ".git/"
    - "node_modules/"
    - "build/"
    - "dist/"
    - "**/*.class"
  debounce_ms: 2000

# NEW v1.2: Parallel Execution (conflict-aware)
agents:
  code: true
  test: true
  build: true
  max_parallel: 3            # Max number of specs to process in parallel
```

### Agent Breakdown - What Each Agent Does

When you enable agents in your configuration, here's exactly what happens:

#### **Code Agent (`code: true`)**
**What it does:**
- Watches `.myintern/specs/` directory for new/changed spec files
- Parses spec files and validates them
- Creates a feature branch (never commits to main/master)
- Builds context from your existing codebase
- Calls AI provider to generate implementation code
- Writes new files or modifies existing ones
- Triggers Build Agent if enabled

**When disabled (`code: false`):**
- No automatic code generation happens
- Other agents won't trigger (they depend on code changes)

---

#### **Build Agent (`build: true`)**
**What it does:**
- Runs **compile-only** commands (no clean, no install):
  - **Maven:** `mvn compile` (compiles Java sources to target/classes)
  - **Gradle:** `./gradlew compileJava` (compiles to build/classes)
  - **Node/TypeScript:** `npm run build` (runs tsc or webpack)
  - **Python:** No compile step (interpreted language)
- Then runs **test** commands:
  - **Maven:** `mvn test` (runs JUnit tests)
  - **Gradle:** `./gradlew test` (runs JUnit tests)
  - **Node:** `npm test` (runs Jest/Mocha)
  - **Python:** `pytest` or `poetry run pytest`
- If compilation fails, triggers **retry loop** (max 3 attempts):
  - Sends error output to AI provider
  - AI generates a fix
  - Applies fix and retries compile
  - Repeats until success or max retries reached

**When disabled (`build: false`):**
- Code is generated but never compiled
- No validation that code actually works
- You'll need to manually run `mvn compile` or `npm run build`

**Note:** Build agent does NOT run:
- `mvn clean` (doesn't clean target/ directory)
- `mvn install` (doesn't install to local Maven repository)
- `mvn package` (doesn't create JAR/WAR unless you explicitly configure it)

To run full package builds, you can add to `.myintern/agent.yml`:
```yaml
build:
  tool: maven
  commands:
    compile: "mvn compile"
    test: "mvn test"
    package: "mvn package -DskipTests"  # Optional: creates JAR/WAR
```

---

#### **Test Agent (`test: true`)**
**What it does:**
- Automatically generates test files for newly created code
- Detects test framework (JUnit, Jest, pytest) based on project type
- Creates test files in correct locations:
  - **Java:** `src/test/java/com/example/FooTest.java` for `src/main/java/com/example/Foo.java`
  - **Node:** `src/utils/foo.test.ts` for `src/utils/foo.ts`
  - **Python:** `tests/test_utils.py` for `myapp/utils.py`
- Uses AI to generate:
  - Unit tests with mocking (Mockito/Jest/pytest-mock)
  - Edge case tests (null inputs, errors, boundary conditions)
  - Integration tests if needed
- Runs tests via Build Agent after generation

**When disabled (`test: false`):**
- No test files are generated automatically
- You'll need to write tests manually
- Build Agent will still run existing tests

---

### Supported Models

**Claude Code CLI (`provider: claude-cli`) — Recommended for Pro/Max Subscribers:**
- `claude-sonnet-4-5-20250929` - Best for complex Spring Boot code
- `claude-3-5-sonnet-20241022` - Fast, good quality
- `claude-3-opus-20240229` - Highest quality, slower
- `claude-3-haiku-20240307` - Fastest, budget-friendly
- Uses your Claude Pro/Max subscription — **no per-token API cost**

**Anthropic Claude (Direct API — `provider: anthropic`):**
- Same models as above, billed per-token via API key

**AWS Bedrock (`provider: bedrock`) — Best for Enterprise/AWS Teams:**
- `anthropic.claude-sonnet-4-5-v1:0` - Best for complex Spring Boot code (via Bedrock)
- `anthropic.claude-3-5-sonnet-20241022-v2:0` - Fast, good quality (via Bedrock)
- `anthropic.claude-3-opus-20240229-v1:0` - Highest quality (via Bedrock)
- `anthropic.claude-3-haiku-20240307-v1:0` - Fastest, budget-friendly (via Bedrock)

**OpenAI (`provider: openai`):**
- `gpt-4o` - Latest, good for Java
- `gpt-4-turbo` - Fast, reliable
- `gpt-4` - Classic, stable
- `gpt-3.5-turbo` - Budget option (not recommended for Spring Boot)

**Cost comparison:**

| Provider | Cost | Best For |
|----------|------|----------|
| **Claude CLI** (Pro subscription) | **$0/feature** (included in $20/mo Pro) | Individual developers, small teams |
| **Claude CLI** (Max subscription) | **$0/feature** (included in $100/mo Max) | Power users, higher rate limits |
| **Anthropic Direct API** | ~$0.05–$0.30/feature | High-volume automation, CI/CD |
| **AWS Bedrock** | ~$0.05–$0.30/feature (billed via AWS) | Enterprise teams with AWS SSO |
| **OpenAI GPT-4o** | ~$0.10–$0.40/feature | Teams already on OpenAI |

**When to use each:**
- **Claude CLI** — You have a Claude Pro/Max subscription and want zero API cost
- **Anthropic API** — You need high-volume automated usage or CI/CD integration
- **AWS Bedrock** — Enterprise teams with AWS SSO, consolidated billing, IAM roles
- **OpenAI** — Teams already invested in the OpenAI ecosystem

---

## Spec File Format

MyIntern uses structured markdown specs in `.myintern/specs/`:

### Required Sections

```markdown
# FEATURE|BUGFIX|REFACTOR: Title

**Jira:** PROJ-123 (optional, enables multi-spec grouping - NEW v1.2)
**Repos Affected:** api-service, shared-lib (optional, for multi-repo setups - NEW v1.2)

## Type
feature | bugfix | refactor | test

## Priority
high | medium | low

## Context
What needs to be done and why. Be specific about business requirements.

## Acceptance Criteria
- Criterion 1
- Criterion 2
- Criterion 3

## Files Likely Affected
- src/main/java/com/example/path/File.java
- api-service/src/main/java/com/example/controller/UserController.java (multi-repo example)
- shared-lib/src/main/java/com/example/util/ValidationUtils.java (multi-repo example)
- ...

## Notes
Additional context, constraints, or implementation hints.
```

### New Multi-Spec Features (v1.2)

**Jira Ticket Grouping:**
- Multiple specs can share the same Jira ticket (`**Jira:** PROJ-123`)
- MyIntern maintains global context across related specs in `.myintern/.context/`
- Agent sees 3-4 line summary of related specs when processing

**Multi-Repo Support:**
- Declare affected repos with `**Repos Affected:** api-service, shared-lib`
- MyIntern builds context from all referenced repos
- Token budget is balanced across repos (60% current, 30% external, 10% practices)

**Example Multi-Repo Spec:**
```markdown
# FEATURE: User Authentication

**Jira:** AUTH-101
**Repos Affected:** api-service, shared-lib

## Context
Implement JWT-based authentication across user service and shared auth library.

## Files Likely Affected
- api-service/src/main/java/com/example/controller/AuthController.java
- shared-lib/src/main/java/com/example/auth/JWTUtil.java
- shared-lib/src/main/java/com/example/auth/TokenValidator.java
```

### Tips for Great Specs

✅ **Be specific:** "Add /api/v1/users/{id} GET endpoint" vs "Add user stuff"
✅ **Include examples:** Show expected request/response JSON
✅ **Reference existing code:** "Follow UserController pattern"
✅ **List affected files:** Helps the AI understand scope
✅ **Add test requirements:** "Add MockMvc tests for error cases"

❌ **Avoid vague specs:** "Make it better"
❌ **Don't over-specify:** Let the AI follow practices
❌ **Don't include implementation details:** Focus on *what*, not *how*

---

## AWS Bedrock Configuration Examples

Here are complete configuration examples for different AWS authentication scenarios:

### Example 1: AWS SSO Profile (Recommended for Teams)

**.myintern/agent.yml:**
```yaml
version: "1.0"

llm:
  provider: bedrock
  model: anthropic.claude-sonnet-4-5-v1:0
  aws_region: us-east-1
  aws_profile: ${AWS_PROFILE}  # References your SSO profile

java:
  version: "17"

agents:
  code: true
  test: true
  build: true

# ... rest of config
```

**Shell setup:**
```bash
# One-time SSO configuration
aws configure sso --profile my-team-session

# Login before using MyIntern
aws sso login --profile my-team-session

# Set profile for MyIntern
export AWS_PROFILE=my-team-session

# Run MyIntern
myintern start
```

### Example 2: AWS Environment Variables (CI/CD)

**.myintern/agent.yml:**
```yaml
version: "1.0"

llm:
  provider: bedrock
  model: anthropic.claude-sonnet-4-5-v1:0
  aws_region: ${AWS_REGION}
  aws_access_key_id: ${AWS_ACCESS_KEY_ID}
  aws_secret_access_key: ${AWS_SECRET_ACCESS_KEY}

# ... rest of config
```

**Shell setup (or CI/CD secrets):**
```bash
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=xxx...
export AWS_REGION=us-east-1

myintern start
```

### Example 3: Default Credential Chain (EC2/ECS/Lambda)

**.myintern/agent.yml:**
```yaml
version: "1.0"

llm:
  provider: bedrock
  model: anthropic.claude-sonnet-4-5-v1:0
  aws_region: us-east-1
  # No credentials - uses IAM role attached to EC2/ECS/Lambda

# ... rest of config
```

This works automatically on AWS compute with IAM roles.

### Example 4: Switching Between Providers

You can easily switch providers by changing the config:

```yaml
# Development: Claude Pro subscription (free, no API key)
llm:
  provider: claude-cli
  model: claude-sonnet-4-5-20250929

# Development alternative: Anthropic API key (pay-per-use)
# llm:
#   provider: anthropic
#   model: claude-sonnet-4-5-20250929
#   api_key: ${ANTHROPIC_API_KEY}

# Production: Use AWS Bedrock (company SSO)
# llm:
#   provider: bedrock
#   model: anthropic.claude-sonnet-4-5-v1:0
#   aws_region: us-east-1
#   aws_profile: ${AWS_PROFILE}
```

---

## Real-World Examples

### Example 1: Add Health Check Endpoint

**Spec:** `.myintern/specs/HEALTH_CHECK_SPEC.md`
```markdown
# FEATURE: Health Check Endpoint

## Type
feature

## Priority
medium

## Context
Add a health check endpoint for monitoring and load balancer health checks.

## Acceptance Criteria
- GET /api/v1/admin/health returns 200
- Response: { "status": "UP", "timestamp": "ISO-8601", "version": "1.0.0" }
- No authentication required
- Add unit test

## Files Likely Affected
- src/main/java/com/example/controller/AdminController.java
- src/main/java/com/example/model/dto/HealthResponse.java
- src/test/java/com/example/controller/AdminControllerTest.java

## Notes
Keep it simple - no database calls.
```

**Result:** Agent generates Controller + DTO + Test in ~30 seconds.

### Example 2: Fix Bug in Existing Code

**Spec:** `.myintern/specs/BUG_NULL_POINTER_FIX.md`
```markdown
# BUGFIX: NullPointerException in UserService.findById

## Type
bugfix

## Priority
high

## Context
UserService.findById() throws NullPointerException when user doesn't exist instead of throwing UserNotFoundException.

## Acceptance Criteria
- Throw UserNotFoundException when user not found
- Add test case for user not found scenario
- No NullPointerException

## Files Likely Affected
- src/main/java/com/example/service/UserService.java
- src/test/java/com/example/service/UserServiceTest.java

## Notes
Current code:
```java
public UserResponse findById(Long id) {
    User user = userRepository.findById(id).get(); // Bug: .get() throws NPE
    return UserMapper.toResponse(user);
}
```

Should use `.orElseThrow()` instead.
```

**Result:** Agent fixes bug + adds test case.

### Example 3: Add Pagination to Endpoint

**Spec:** `.myintern/specs/USER_LIST_PAGINATION.md`
```markdown
# REFACTOR: Add Pagination to User List Endpoint

## Type
refactor

## Priority
medium

## Context
GET /api/v1/users returns all users, causing performance issues. Add pagination support using Spring Data's Pageable.

## Acceptance Criteria
- Endpoint accepts ?page=0&size=20 query params
- Response includes page metadata (totalPages, totalElements, currentPage)
- Default page size: 20
- Max page size: 100
- Update tests to verify pagination

## Files Likely Affected
- src/main/java/com/example/controller/UserController.java
- src/main/java/com/example/service/UserService.java
- src/main/java/com/example/repository/UserRepository.java
- src/test/java/com/example/controller/UserControllerTest.java

## Notes
Use Spring's Page<T> and Pageable interfaces.
Return PagedResponse<UserResponse> custom DTO.
```

**Result:** Agent refactors existing code + adds pagination.

---

## Context Window & Token Budget

MyIntern uses a **smart context window strategy** to stay within AI model limits:

### What is the Context Window?

- **Claude Sonnet 4.5:** 200k tokens max, MyIntern uses **150k safe budget**
- **GPT-4o:** 128k tokens max, MyIntern uses **90k safe budget**

**1 token ≈ 4 characters** (rough estimate)

### How MyIntern Selects Files

MyIntern doesn't send your entire codebase to the AI. It intelligently selects files based on priority:

**Priority Order:**
1. **Spec file** (always included)
2. **Git diff files** (recently changed)
3. **Files mentioned in spec** ("Files Likely Affected")
4. **Test files** for changed code
5. **Practices file** (`.myintern/practices/java.md`)
6. **1-level dependencies** (files that import changed files)
7. **Drop everything else** if over budget

**Example:**
- Your project: 500 Java files, 2MB total
- Spec mentions: `UserController.java`, `UserService.java`, `UserRepository.java`
- Git diff: `UserService.java` changed recently
- MyIntern selects: 12 files, 48k tokens (~200KB)
- Sends to AI: Spec + 12 relevant files + practices
- **Result:** AI has all the context it needs without hitting limits

### If Files Are Dropped

If you see:
```
⚠️  Dropped 25 files (over budget)
```

**Don't worry!** This is normal. MyIntern keeps the most relevant files. You can:
1. Make specs more specific (list exact files)
2. Use git to stage only relevant changes
3. Split large features into smaller specs

---

## Safety Features

MyIntern is designed with **enterprise-grade safety rules**:

### 1. Protected Branch Enforcement

❌ **Never commits to:** `main`, `master`, `production`
✅ **Always creates feature branch:** `myintern/feature-SPEC_NAME`

If you accidentally run on a protected branch:
```
⛔ Safety check failed:
   - Current branch "main" is protected. Create a feature branch first.
```

### 2. No Automatic File Deletion

MyIntern can create and modify files but **never deletes** files automatically.

If a spec requests file deletion:
```
⚠️  WARNING: The following files will be deleted:
   - src/main/java/com/example/OldService.java

   File deletion is DISABLED by default for safety.
   If you need to delete files, please do so manually.
```

### 3. API Keys via Environment Variables Only

❌ **Hardcoded keys rejected:**
```yaml
llm:
  api_key: sk-ant-xxx...  # Error: API key appears to be hardcoded
```

✅ **Environment variable required:**
```yaml
llm:
  api_key: ${ANTHROPIC_API_KEY}  # Safe: loaded from env
```

### 4. Max 3 Auto-Fix Retries

If compilation fails, MyIntern tries to auto-fix **max 3 times**:

```
📍 Attempt 1/3
   ❌ Compilation failed
   🔧 Attempting auto-fix...
   ✅ Auto-fix applied

📍 Attempt 2/3
   ✅ Success on attempt 2
```

If all 3 fail:
```
⛔ Max retries (3) reached. Stopping.
   Review the errors and fix manually, or update the spec.
```

### 5. Git Status Check

Before generating code, MyIntern warns if you have uncommitted changes:

```
⚠️  Working tree has uncommitted changes:
   - 3 staged files
   - 5 modified files
   - 2 untracked files
```

---

## Guardrails — Sensitive Data Protection (v1.1+)

MyIntern includes **enterprise-grade guardrails** that prevent sensitive data (PII, PHI, credentials) from being sent to LLM providers. **Enabled by default** in v1.1+.

### What Are Guardrails?

Before sending any code to the AI (Anthropic Claude, OpenAI, AWS Bedrock), MyIntern scans all files for:
- **Personal Identifiable Information (PII)** - SSNs, credit cards, phone numbers
- **Protected Health Information (PHI)** - Medical records (HIPAA compliance)
- **Credentials** - API keys, passwords, private keys
- **Custom Patterns** - Your own regex patterns (e.g., employee IDs)

### Detection Categories

| Category | What It Detects | Examples |
|----------|----------------|----------|
| **PII** | Personal identifiable info | SSN (`123-45-6789`), Credit cards (`4111-1111-1111-1111`), Phone numbers |
| **PHI** | Protected health info (HIPAA) | MRN (`1234567`), Patient IDs, ICD-10 codes, Date of birth |
| **Credentials** | Secrets & keys | AWS keys (`AKIAIOSFODNN7EXAMPLE`), Anthropic keys (`sk-ant-...`), Private keys, Hardcoded passwords |
| **Custom** | User-defined patterns | Employee IDs (`EMP-123456`), Internal codes |

### Violation Levels

| Level | Icon | Behavior | Example |
|-------|------|----------|---------|
| `INFO` | ℹ️ | Log only, no action | Email addresses (not considered sensitive alone) |
| `WARN` | ⚠️ | Redact data, then allow | Phone numbers |
| `BLOCK` | 🚫 | Block file from LLM context | SSN, credit cards |
| `CRITICAL` | 🔴 | **Stop execution immediately** | API keys, passwords, medical record numbers |

### Redaction Modes

Configure how MyIntern handles sensitive data:

| Mode | Behavior | Example |
|------|----------|---------|
| `mask` (default) | Replace with placeholder | `***REDACTED***` |
| `hash` | Replace with one-way hash | `[HASH:a3f8c9d2...]` |
| `skip` | Skip entire file from LLM context | File excluded, logged |
| `none` | Block without redaction | Execution halted |

### Safe Patterns (Always Allowed)

Code that references secrets via environment variables or config lookups is **never flagged**:

```java
// ✅ SAFE - Environment variable reference
String apiKey = System.getenv("API_KEY");

// ✅ SAFE - Spring Boot property injection
@Value("${aws.access.key}")
private String awsKey;

// ✅ SAFE - Configuration lookup
String password = config.get("database.password");

// ✅ SAFE - Placeholder values
// TODO: Replace REPLACE_WITH_YOUR_KEY with actual key

// ❌ BLOCKED - Hardcoded credential
String apiKey = "sk-ant-1234567890abcdef";  // CRITICAL violation
```

### Guardrails CLI Commands

#### Scan Files for Violations

```bash
# Scan a single file
myintern guardrails scan src/main/java/config/DatabaseConfig.java

# Scan all files in project
myintern guardrails scan --all

# Scan specific directory
myintern guardrails scan src/main/java/config/

# Output formats: text (default), json, csv, html
myintern guardrails scan --all --format json
myintern guardrails scan --all --format csv --output violations.csv
myintern guardrails scan --all --format html --output report.html
```

**Example output:**
```
🔍 Guardrails Scan Results

Scanned: 127 files
Duration: 2.3s

📊 Summary:
   🔴 CRITICAL: 2 violations
   🚫 BLOCK: 5 violations
   ⚠️  WARN: 8 violations
   ℹ️  INFO: 3 violations

🔴 CRITICAL Violations:
1. src/main/java/config/DatabaseConfig.java:28
   Category: credentials
   Pattern: Hardcoded Password
   Context: password = "SuperSecret123!"
   Action: Execution will be BLOCKED

2. src/main/java/util/AwsClient.java:15
   Category: credentials
   Pattern: AWS Access Key
   Context: AWS_KEY = "AKIAIOSFODNN7EXAMPLE"
   Action: Execution will be BLOCKED

💡 Recommendation: Move credentials to environment variables
```

#### Override False Positives

Sometimes legitimate test data or placeholders are flagged as violations. You can whitelist them:

```bash
# Add override for a false positive
myintern guardrails override \
  --file "src/test/java/TestData.java" \
  --pattern "SSN" \
  --reason "Test fixture with fake SSN" \
  --expires "2026-12-31"

# Add override with specific line number
myintern guardrails override \
  --file "src/main/java/Example.java" \
  --line 42 \
  --pattern "Credit Card" \
  --reason "Example in code comment" \
  --expires "2027-01-01"

# Permanent override (no expiration)
myintern guardrails override \
  --file "src/test/resources/mock-data.json" \
  --pattern "Phone Number" \
  --reason "Mock test data"
```

#### Remove Overrides

```bash
# Remove specific override
myintern guardrails remove-override \
  --file "src/test/java/TestData.java" \
  --pattern "SSN"

# Remove all expired overrides
myintern guardrails remove-override --expired

# List all overrides
myintern guardrails remove-override --list
```

#### View Guardrails Logs

```bash
# Tail last 20 log entries
myintern guardrails logs --tail 20

# Filter by severity
myintern guardrails logs --level critical
myintern guardrails logs --level block

# Filter by date range
myintern guardrails logs --since "2026-02-01"
myintern guardrails logs --since 7d  # Last 7 days

# Export to JSON
myintern guardrails logs --since 30d --format json --output audit.json
```

#### Compliance Audit Reports

Generate compliance reports for HIPAA, PCI-DSS, or custom frameworks:

```bash
# Generate HIPAA compliance report
myintern guardrails audit --framework hipaa --since 90d

# Generate PCI-DSS compliance report
myintern guardrails audit --framework pci-dss --since 30d

# Custom compliance report
myintern guardrails audit --since 30d --format html --output compliance-report.html

# CSV export for auditors
myintern guardrails audit --since 180d --format csv --output audit-trail.csv
```

**Example HIPAA report:**
```
🏥 HIPAA Compliance Audit Report
Period: 2025-11-23 to 2026-02-23 (90 days)

✅ Compliance Status: COMPLIANT

PHI Detections:
   Total PHI patterns scanned: 18
   Violations found: 0
   Violations blocked: 0

Audit Trail:
   All PHI access logged: ✅
   Encryption at rest: ✅
   Encryption in transit: ✅

Recommendations:
   - Continue current guardrails configuration
   - Review overrides quarterly
   - Update custom PHI patterns as needed
```

### Configuration Examples

#### Enable Guardrails with Default Settings

```yaml
# .myintern/agent.yml
guardrails:
  enabled: true              # Enabled by default in v1.1+
  mode: mask                 # Redact sensitive data
  stopOnCritical: true       # Halt on critical violations
  categories:
    pii: true
    phi: true
    credentials: true
```

#### Customize for Healthcare (HIPAA)

```yaml
guardrails:
  enabled: true
  mode: hash                 # Use one-way hashing
  stopOnCritical: true
  categories:
    pii: true
    phi: true                # HIPAA medical records
    credentials: true
  whitelist:
    - "**/*.test.java"       # Skip test files
    - "**/test-data/**"
  customPatterns:
    - name: "Medical Record Number"
      regex: "\\bMRN[-:]?\\d{7,10}\\b"
      level: critical
      category: phi
    - name: "Patient ID"
      regex: "\\bPID[-:]?\\d{6,8}\\b"
      level: critical
      category: phi
```

#### Customize for Finance (PCI-DSS)

```yaml
guardrails:
  enabled: true
  mode: skip                 # Skip entire file if violation found
  stopOnCritical: true
  categories:
    pii: true                # Credit cards detected here
    phi: false               # Not needed for finance
    credentials: true
  customPatterns:
    - name: "Account Number"
      regex: "\\bACCT[-:]?\\d{10,12}\\b"
      level: block
      category: custom
    - name: "Routing Number"
      regex: "\\b\\d{9}\\b"  # US routing numbers
      level: warn
      category: custom
```

#### Disable Guardrails (Not Recommended)

```yaml
guardrails:
  enabled: false             # ⚠️ Use only for local development
```

### File Structure

After enabling guardrails, you'll see:

```
.myintern/
├── logs/
│   ├── guardrails.log              # Audit trail (JSON format)
│   └── guardrails-overrides.json   # False positive overrides
```

### Compliance Support

MyIntern guardrails help you meet compliance requirements for:

- **HIPAA (Healthcare)** - Detects all 18 PHI identifiers (MRN, patient IDs, DOB, ICD-10 codes, etc.)
- **PCI-DSS (Finance)** - Blocks credit card patterns (Visa, Mastercard, Amex, Discover, etc.)
- **GDPR (Europe)** - Detects PII (names, emails, addresses, phone numbers)
- **Custom Compliance** - Define your own patterns via `customPatterns`

### Best Practices

1. **Always enable guardrails** - Disabled by accident? Run `myintern config validate` to check
2. **Review audit logs monthly** - `myintern guardrails audit --since 30d`
3. **Whitelist test files** - Add `**/*.test.java` to `whitelist`
4. **Set override expirations** - Don't create permanent overrides unless necessary
5. **Use environment variables** - Never hardcode secrets, always use `${ENV_VAR}`
6. **Custom patterns for your domain** - Add industry-specific identifiers (employee IDs, account numbers)

---

## Context Loading & Zero-Config Mode (v1.2+)

MyIntern automatically loads coding context from multiple sources, **with zero configuration required**. This is the #1 adoption driver: **60-second time-to-value**.

### Context Loading Priority

MyIntern loads context in this order, merging all that exist:

1. **`.myintern/practices/java.md`** ← Highest priority (explicit team standards)
2. **`CLAUDE.md` (or `.claude/CLAUDE.md`)** ← Anthropic convention, many teams have this
3. **`.cursorrules`** ← Cursor users already have this
4. **`.github/copilot-instructions.md`** ← GitHub Copilot users
5. **`.myintern/agent.yml`** ← Pipeline config
6. **Spec file** (if provided) ← Task definition
7. **Git diff + affected files** ← Code context (see Context Window Strategy)

### Zero Migration Cost

If your team already uses:
- **Claude Code** → Your `CLAUDE.md` file works immediately
- **Cursor** → Your `.cursorrules` file works immediately
- **GitHub Copilot** → Your `.github/copilot-instructions.md` works immediately

**No need to create `.myintern/practices/`** — MyIntern uses what you already have!

### Quick Start (No Setup Required)

```bash
# Install
npm install -g myintern

# If you have Claude Pro/Max, just authenticate once:
claude auth login

# Run immediately — no config files needed
cd /path/to/your/spring-boot-project
myintern run "Add GET /health endpoint returning {status: ok}"

# Auto-detects:
# - Claude CLI OAuth → uses Pro subscription (free)
# - pom.xml → Java + Maven
# - CLAUDE.md → Team coding standards
# - .cursorrules → Cursor conventions

# More examples
myintern run "Fix the NullPointerException in UserService line 42"
myintern run "Write unit tests for OrderController"
myintern watch  # Watch mode, process specs as they appear
```

### Auto-Detection Logic

**Authentication (checked in order):**
1. Claude Code CLI installed and authenticated → `provider: claude-cli` (free with Pro/Max)
2. `ANTHROPIC_API_KEY` env var set → `provider: anthropic`
3. `OPENAI_API_KEY` env var set → `provider: openai`

**Project type (when no `.myintern/agent.yml` exists):**
- `pom.xml` found → Java + Maven
- `build.gradle` found → Java + Gradle
- `package.json` → Node.js/TypeScript *(future)*
- `requirements.txt` → Python *(future)*

### Example Context Files

**CLAUDE.md (Anthropic Convention):**
```markdown
# Project Coding Standards

## Java Style
- Use constructor injection (not field injection)
- All REST controllers use @RestController
- Return ResponseEntity<> for all endpoints

## Testing
- JUnit 5 + Mockito
- MockMvc for controller tests
- Aim for 80%+ coverage
```

**.cursorrules (Cursor Convention):**
```
- Use Lombok for DTOs (@Data, @Builder)
- Never expose entities directly in controllers
- Use Optional.orElseThrow() instead of .get()
```

MyIntern merges both files and uses the combined context!

---

## Multi-Repo & Monorepo Support (v1.2+)

MyIntern now supports **monorepo and microservices architectures** with intelligent context aggregation across multiple repositories.

### How It Works

1. **Declare repos in `.myintern/agent.yml`**:
   ```yaml
   repos:
     - name: api-service
       path: ./api-service
       language: java
       build_tool: maven
     - name: web-service
       path: ./web-service
       language: java
       build_tool: gradle
     - name: shared-lib
       path: ./shared-lib
       language: java
   ```

2. **Auto-discovery** - MyIntern auto-detects source files in each repo (zero config)

3. **Spec declares affected repos**:
   ```markdown
   **Repos Affected:** api-service, shared-lib
   ```

4. **Context aggregation** - MyIntern builds context from all referenced repos:
   - 60% token budget → current repo files
   - 30% token budget → external repo files (most-referenced first)
   - 10% token budget → practices + spec

### Real-World Example: Microservices

**Project structure:**
```
my-monorepo/
├── .myintern/
│   ├── agent.yml
│   └── specs/
│       └── USER_AUTH_SPEC.md
├── api-service/
│   └── src/main/java/com/example/controller/AuthController.java
├── web-service/
│   └── src/main/java/com/example/service/AuthService.java
└── shared-lib/
    └── src/main/java/com/example/auth/JWTUtil.java
```

**Spec: `.myintern/specs/USER_AUTH_SPEC.md`**
```markdown
# FEATURE: JWT Authentication

**Repos Affected:** api-service, shared-lib

## Files Likely Affected
- api-service/src/main/java/com/example/controller/AuthController.java
- shared-lib/src/main/java/com/example/auth/JWTUtil.java
- shared-lib/src/main/java/com/example/auth/TokenValidator.java
```

**MyIntern behavior:**
1. Loads context from both `api-service` and `shared-lib`
2. Generates code in both repos
3. Builds and tests both repos
4. Creates feature branch: `myintern/feature-USER_AUTH_SPEC`

### Auto-Discovery (Zero Config)

```yaml
watch:
  auto_discover: true        # Auto-detect src/ in each repo (default)
  ignore:
    - "target/"
    - "node_modules/"
    - "build/"
```

MyIntern automatically watches:
- `api-service/src/**/*.java`
- `web-service/src/**/*.java`
- `shared-lib/src/**/*.java`

### Parallel Execution (Conflict-Aware)

```yaml
agents:
  max_parallel: 3            # Process up to 3 specs in parallel
```

MyIntern intelligently parallelizes spec execution:
- **Parallel:** Specs affecting different repos
- **Sequential:** Specs with same Jira ticket (maintain context)
- **Sequential:** Specs affecting same files (avoid conflicts)

---

## Working with Your Team

### Share Practices File

Commit `.myintern/practices/java.md` to git so your whole team uses the same standards:

```bash
git add .myintern/practices/java.md
git add .myintern/agent.yml
git commit -m "chore: add MyIntern coding practices"
git push
```

Team members can then:
```bash
myintern init  # Creates config
# Edit .myintern/agent.yml to add their API key
myintern start
```

### Spec File Workflow

**Option 1:** Commit specs after implementation
```bash
# Create spec
vim .myintern/specs/FEATURE_SPEC.md

# Run agent
myintern start  # Generates code

# Review and commit everything together
git add .myintern/specs/FEATURE_SPEC.md
git add src/...
git commit -m "feat: implement feature (spec + code)"
```

**Option 2:** Specs as documentation only (don't commit)
```bash
# Add to .gitignore
echo '.myintern/specs/' >> .gitignore

# Specs are local-only, used to generate code
# Commit only the generated code
```

---

## CLI Commands

### Core Commands
```bash
# Initialize MyIntern in current project
myintern init

# Start the agent (watches for spec files)
myintern start

# Stop the agent
myintern stop

# Check status
myintern status

# View configuration
myintern config show

# Validate configuration
myintern config validate
```

### Guardrails Commands (v1.1+)

#### Scan for Sensitive Data
```bash
# Scan a single file
myintern guardrails scan src/main/Config.java

# Scan all files in project
myintern guardrails scan --all

# Output formats: text (default), json, csv, html
myintern guardrails scan --all --format json
myintern guardrails scan --all --format html --output report.html
```

#### Manage False Positive Overrides
```bash
# Add override
myintern guardrails override \
  --file "src/test/Test.java" \
  --pattern "SSN" \
  --reason "Test fixture" \
  --expires "2026-12-31"

# Remove override
myintern guardrails remove-override \
  --file "src/test/Test.java" \
  --pattern "SSN"

# List all overrides
myintern guardrails remove-override --list

# Remove expired overrides
myintern guardrails remove-override --expired
```

#### Audit and Compliance
```bash
# View recent guardrails logs
myintern guardrails logs --tail 20
myintern guardrails logs --level critical

# Generate compliance report
myintern guardrails audit --framework hipaa --since 90d
myintern guardrails audit --framework pci-dss --since 30d
myintern guardrails audit --since 30d --format csv --output audit.csv
```

### Code Review Commands (v1.1+)

#### Code Review (Zero-Setup)
```bash
# Review entire codebase for issues
myintern review

# Focus on specific areas
myintern review --focus security
myintern review --focus quality
myintern review --focus performance

# Filter by severity
myintern review --severity critical
myintern review --severity high

# Auto-fix issues found
myintern review --auto-fix
```

#### Auto-Fix Violations
```bash
# Fix issues from latest review
myintern fix

# Run review first, then fix
myintern fix --review

# Fix from specific report
myintern fix --report .myintern/reports/review-2024-02-21.json
```

#### Rollback Changes
```bash
# Interactive rollback (select from recent changes)
myintern rollback

# List rollback history
myintern rollback --list

# Rollback specific change
myintern rollback --id rb-1234567890-abc123

# Force rollback
myintern rollback --id rb-xxx --force
```

#### GitHub Integration
```bash
# Sync GitHub issues to specs
myintern github --sync

# Sync with custom labels
myintern github --sync --labels "myintern,bug"

# Sync issues assigned to specific user
myintern github --sync --assigned-to johndoe

# Sync both open and closed issues
myintern github --sync --state all

# Close issue when spec is complete
myintern github --close 123
```

### Logs and Reports
```bash
# View execution logs
cat .myintern/logs/executions.json | jq

# View latest review report
cat .myintern/reports/review-*.json | jq

# View rollback history
cat .myintern/rollback-history.json | jq

# View feedback data
cat .myintern/feedback/feedback.json | jq
```

---

## Troubleshooting

### "MyIntern not initialized. Run: myintern init"

**Solution:** Run `myintern init` in your project root.

### "Environment variable ANTHROPIC_API_KEY not found"

**If using `provider: claude-cli`:** You don't need this variable. Make sure your config uses `provider: claude-cli` (not `provider: anthropic`) and remove any `api_key:` line from `.myintern/agent.yml`.

**If using `provider: anthropic`:**
```bash
export ANTHROPIC_API_KEY=sk-ant-xxx...
```

Make it permanent:
```bash
echo 'export ANTHROPIC_API_KEY=sk-ant-xxx...' >> ~/.zshrc
source ~/.zshrc
```

### "Invalid API key · Fix external API key" (Claude CLI)

**Cause:** An `ANTHROPIC_API_KEY` environment variable is set in your shell, which overrides the Claude CLI OAuth session.

**Solution:**
```bash
# Remove the stale API key from current session
unset ANTHROPIC_API_KEY

# Verify Claude CLI auth is healthy
claude auth status
# Should show: loggedIn: true, subscriptionType: pro

# If not logged in, re-authenticate
claude auth login
```

Also remove it from `~/.zshrc` or `~/.bashrc` if it was exported there permanently.

**Note:** MyIntern v1.2+ automatically strips `ANTHROPIC_API_KEY` from the child process when using `provider: claude-cli`, so this should not recur after updating.

### "Claude CLI not authenticated or blocked"

**Cause:** Claude Code CLI is not installed or not logged in.

**Solution:**
```bash
# Install Claude Code CLI
brew install anthropics/claude/claude

# Authenticate
claude auth login

# Verify
claude auth status
```

If you see `subscriptionType: free`, you'll need a Claude Pro or Max subscription for API-level usage.

### "AWS SSO session expired" (for Bedrock users)

**Solution:**
```bash
# Re-authenticate with AWS SSO
aws sso login --profile your-profile-name

# Verify authentication
aws sts get-caller-identity --profile your-profile-name
```

### "Access Denied" when using Bedrock

**Causes:**
- Missing IAM permissions for `bedrock:InvokeModel`
- Wrong AWS region (model not available in your region)
- Model access not enabled in Bedrock console

**Solution:**
1. Check IAM permissions (see Step 2 → Option C → Required AWS Permissions)
2. Verify region has Bedrock support: `us-east-1`, `us-west-2`, `eu-west-1`, etc.
3. Enable model access in AWS Bedrock console: https://console.aws.amazon.com/bedrock/
   - Go to "Model access"
   - Request access to Claude models
   - Wait for approval (usually instant for Anthropic models)

### "Build failed after max retries"

**Causes:**
- Complex spec requiring manual intervention
- Missing dependencies in pom.xml
- Conflicting code patterns

**Solution:**
1. Check `.myintern/logs/executions.json` for error details
2. Fix errors manually
3. Update spec to be more specific
4. Review `.myintern/practices/java.md` for clarity

### "Compilation error: package X does not exist"

**Solution:** Add missing dependency to `pom.xml`:
```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-validation</artifactId>
</dependency>
```

Run `mvn clean install` then restart agent.

### Agent not detecting spec files

**Check:**
1. Files are in `.myintern/specs/` (not project root)
2. Files end with `.md`
3. Watch paths in `agent.yml` are correct
4. Agent is running (`myintern start`)

### Generated code doesn't follow practices

**Solution:**
1. Review `.myintern/practices/java.md` - be more specific
2. Add examples of good code in practices file
3. In spec, add: "Follow practices exactly as defined in practices/java.md"

### Review finds no issues or too many false positives

**Causes:**
- Review is AI-powered and may have varying accuracy
- Language/framework detection might be incorrect
- Focus area too broad

**Solution:**
```bash
# Verify detection
myintern review  # Shows detected language/framework at start

# Try different focus areas
myintern review --focus security --severity high

# Use specific severity to reduce noise
myintern review --severity critical
```

### Auto-fix fails or makes code worse

**Causes:**
- Complex issues requiring manual intervention
- AI misunderstood the context

**Solution:**
1. Check `.myintern/reports/review-*.json` for details
2. Fix manually instead of using auto-fix
3. Use `myintern rollback` to undo if needed
4. Provide feedback to improve future fixes

### Rollback not working

**Causes:**
- Commit hash no longer exists
- Already rolled back
- Working tree has uncommitted changes

**Solution:**
```bash
# Check rollback history
myintern rollback --list

# Verify the commit exists
git rev-parse <commit-hash>

# Force rollback if needed
myintern rollback --id rb-xxx --force

# Clean working tree first
git stash
myintern rollback --id rb-xxx
git stash pop
```

### GitHub sync not creating specs

**Causes:**
- GITHUB_TOKEN not set or invalid
- No issues with matching labels
- Not a GitHub repository

**Solution:**
```bash
# Verify token
echo $GITHUB_TOKEN

# Test GitHub CLI
gh auth status

# Verify repo URL
git remote get-url origin
# Must be: https://github.com/org/repo.git or git@github.com:org/repo.git

# Check for issues manually
gh issue list --label myintern

# Try with different labels
myintern github --sync --labels "enhancement,bug"
```

### Spring Boot version detection wrong

**Causes:**
- Non-standard pom.xml structure
- Multi-module Maven project
- Version defined in parent POM

**Solution:**
```yaml
# Manually set version in .myintern/agent.yml
java:
  spring_boot_version: "3.2.0"  # or "2.7.5"
```

Or check your pom.xml:
```bash
cat pom.xml | grep -A 2 "spring-boot"
```

### Dry-run preview not showing

**Causes:**
- Preview disabled in config
- No changes being made
- Agent not running

**Solution:**
```yaml
# Enable in .myintern/agent.yml
preview:
  enabled: true
  show_diffs: true
```

```bash
# Check agent status
myintern status

# Restart agent
myintern stop
myintern start
```

### Guardrails blocking legitimate code (v1.1+)

**Causes:**
- Test files with mock data flagged as PII/PHI
- Code comments with example credentials
- Placeholder values detected as real credentials

**Solution:**
```bash
# Add override for false positive
myintern guardrails override \
  --file "src/test/TestData.java" \
  --pattern "SSN" \
  --reason "Test fixture with fake SSN" \
  --expires "2026-12-31"

# Or whitelist test files in config
```

```yaml
# .myintern/agent.yml
guardrails:
  whitelist:
    - "**/*.test.java"
    - "**/test-data/**"
    - "src/test/**"
```

### Guardrails not detecting violations

**Causes:**
- Guardrails disabled in config
- Custom patterns not configured
- Violation level too low (INFO instead of CRITICAL)

**Solution:**
```bash
# Check guardrails status
myintern config show | grep -A 10 guardrails

# Validate configuration
myintern config validate

# Test scan on specific file
myintern guardrails scan src/main/Config.java
```

```yaml
# Enable and configure in .myintern/agent.yml
guardrails:
  enabled: true              # Make sure this is true
  stopOnCritical: true       # Halt on critical violations
  categories:
    pii: true
    phi: true
    credentials: true
```

### Multi-repo context not working (v1.2+)

**Causes:**
- Repos not declared in `agent.yml`
- Invalid repo paths
- Spec doesn't declare `**Repos Affected:**`
- Auto-discovery disabled

**Solution:**
```yaml
# .myintern/agent.yml
repos:
  - name: api-service
    path: ./api-service      # Relative path from .myintern/
    language: java
    build_tool: maven

watch:
  auto_discover: true        # Enable auto-discovery
```

```bash
# Verify repo paths
ls ./api-service
ls ./shared-lib

# Check logs for context loading
myintern logs | grep "context"
```

**In spec file:**
```markdown
**Repos Affected:** api-service, shared-lib
```

---

## Performance Optimizations (v1.2)

MyIntern v1.2 includes significant performance improvements for large codebases:

### Spec File Caching (~70-90% Faster)

**Problem:** Reading and parsing spec files from disk on every change was slow in watch mode.

**Solution:** In-memory cache with automatic invalidation.

**How it works:**
1. First read: Spec file parsed and cached in memory
2. Subsequent reads: Cache hit (instant)
3. File modified: Cache automatically invalidated based on mtime/size
4. Next read: Re-parsed and re-cached

**Performance gains:**
- 70-90% reduction in disk I/O for unchanged specs
- 60-80% reduction in parsing time
- Zero configuration required

**Verify caching is working:**
```bash
# Watch mode benefits most from caching
myintern start

# Logs will show cache hits:
# "✓ Spec cache HIT: USER_REGISTRATION_SPEC.md (saved 45ms)"
# "⚠ Spec cache MISS: ORDER_SERVICE_SPEC.md (file modified)"
```

### Context Window Optimization

**Problem:** Large repos (500+ files) exceed LLM token limits (200k for Claude).

**Solution:** Smart file filtering with priority order.

**How it works:**
1. **Spec file** - always included (1-2k tokens)
2. **Git diff files** - recently changed (5-10k tokens)
3. **Files mentioned in spec** - "Files Likely Affected" (10-20k tokens)
4. **Test files** for changed code (5-10k tokens)
5. **Practices file** - `.myintern/practices/java.md` (2-5k tokens)
6. **1-level dependencies** - files that import changed files (10-30k tokens)
7. **Drop everything else** - summarize by name only

**Token budgets:**
- Claude Sonnet 4.5: 150k safe input, 50k reserve for output
- GPT-4o: 90k safe input, 38k reserve

**Example:**
- Your project: 500 Java files, 2MB total
- Spec mentions: 3 files
- Git diff: 2 files changed
- MyIntern selects: 12 files, 48k tokens (~200KB)
- **Result:** AI has all context it needs without hitting limits

### Multi-Repo Token Balancing

For multi-repo setups, MyIntern balances token budget across repos:
- **60%** - Current repo files (most relevant)
- **30%** - External repo files (dependencies, shared libs)
- **10%** - Practices + spec

This ensures the AI never runs out of context, even for large microservices architectures.

---

## Best Practices

### 1. Start Small

Begin with simple features to learn the workflow:
- Health check endpoints
- Simple CRUD operations
- Bug fixes

### 2. Iterate on Practices

Update `.myintern/practices/java.md` as you learn what works:
- Add examples of good code from your project
- Document team-specific patterns
- Include anti-patterns to avoid

### 3. Review Generated Code

Always review before merging:
```bash
git diff myintern/feature-SPEC_NAME
```

Treat MyIntern like a junior developer - it's fast and follows instructions, but needs review.

### 4. Use Specific Specs

Good spec:
```
## Acceptance Criteria
- POST /api/v1/orders endpoint
- Request: { "userId": 123, "items": [...] }
- Response: 201 Created with order ID
- Validate user exists
- Calculate total price
- Save to orders table
```

Bad spec:
```
## Acceptance Criteria
- Add order stuff
```

### 5. Keep Context Clean

- Commit or stash changes before running agent
- Don't have 50 uncommitted files
- Clean working tree = better context = better code

### 6. Use Code Review Before Production

Before deploying to production, run a security-focused review:

```bash
# Security audit
myintern review --focus security --severity critical

# Fix critical issues
myintern fix

# Review changes
git diff

# Verify all tests pass
mvn test
```

### 7. Leverage Rollback for Safety

Don't be afraid to experiment - you can always rollback:

```bash
# Try a complex feature
myintern start  # generates code

# If you don't like it
myintern rollback

# Try a different approach in the spec
vim .myintern/specs/FEATURE.md
myintern start  # generates new code
```

### 8. Provide Feedback to Improve

After each feature, provide feedback (manually for now):

```json
// .myintern/feedback/feedback.json
{
  "changeId": "rb-xxx",
  "rating": "positive",
  "improvements": [
    "Good use of @Transactional",
    "Proper error handling"
  ],
  "issues": [
    {
      "type": "style",
      "description": "Missing JavaDoc on public method",
      "file": "UserService.java",
      "line": 42
    }
  ]
}
```

MyIntern learns from this and improves future generations.

### 9. GitHub Issues Workflow

If using GitHub:

1. Create issue with `myintern` label
2. Add acceptance criteria in issue body
3. Run: `myintern github --sync`
4. Review generated spec
5. Run: `myintern start`
6. After merge: `myintern github --close <issue-number>`

### 10. Preview Changes in Production Repos

For critical repositories, always enable preview with approval:

```yaml
# .myintern/agent.yml
preview:
  enabled: true
  show_diffs: true
  require_approval: true  # Requires manual confirmation
```

### 11. Use Guardrails for Compliance (v1.1+)

Before deploying to production or committing sensitive code:

```bash
# Run security scan
myintern guardrails scan --all --format html --output security-report.html

# Check for critical violations
myintern guardrails scan --all | grep CRITICAL

# Generate compliance audit (HIPAA example)
myintern guardrails audit --framework hipaa --since 90d
```

**Best practices:**
- Enable guardrails by default (`guardrails.enabled: true`)
- Review audit logs monthly
- Whitelist test files to avoid false positives
- Set override expirations (don't create permanent overrides)
- Use custom patterns for domain-specific identifiers

### 12. Leverage Context Loading (v1.2+)

If your team already uses Claude Code, Cursor, or GitHub Copilot:

```bash
# Create CLAUDE.md or .cursorrules with your team's standards
# MyIntern will automatically load it — no setup needed!

# Verify context loading
myintern run "Add health endpoint" --dry-run

# Check logs for context sources
myintern logs | grep "Loaded context from"
```

### 13. Multi-Repo Workflow (v1.2+)

For monorepo/microservices architectures:

```yaml
# .myintern/agent.yml
repos:
  - name: api-service
    path: ./api-service
  - name: shared-lib
    path: ./shared-lib

watch:
  auto_discover: true  # Zero config file watching
```

**In specs:**
```markdown
**Repos Affected:** api-service, shared-lib
```

MyIntern will automatically build context from all referenced repos!

---

## Advanced: Custom Prompts

You can customize how MyIntern generates code by editing `.myintern/practices/java.md`.

**Example - Force Lombok usage:**
```markdown
## Lombok Requirements

ALWAYS use Lombok annotations:
- @RequiredArgsConstructor for dependency injection
- @Getter / @Setter for entities
- @Builder for DTOs
- @Slf4j for logging
- NO manual constructors, getters, setters

Example:
```java
@Service
@RequiredArgsConstructor
@Slf4j
public class UserService {
    private final UserRepository userRepository;
    // No @Autowired needed
}
```
```

**Example - Enforce Exception Patterns:**
```markdown
## Exception Handling

ALL custom exceptions must extend RuntimeException:

```java
public class UserNotFoundException extends RuntimeException {
    public UserNotFoundException(Long id) {
        super(String.format("User not found: %d", id));
    }
}
```

NEVER use checked exceptions.
```

---

## Multi-Repo & Monorepo Context Management

### How MyIntern Differentiates from Other Agentic Tools

Most AI coding tools (GitHub Copilot, Cursor, Cody, etc.) focus on **single-file autocomplete** or **chat-based assistance**. MyIntern solves **real-world engineering problems** by focusing on:

1. **Autonomous Full-Feature Implementation** - Not just autocomplete, but complete features (Controller → Service → Repository → Tests)
2. **Build-Test-Fix Loop** - Actually compiles and tests code, auto-fixes errors
3. **Multi-Repo Awareness** - Understands context across multiple repositories (see below)
4. **Customizable Practices** - Follows YOUR team's coding standards, not generic patterns
5. **Free with Claude Pro/Max or BYOK** - Use your existing subscription or bring your own API key

---

### Multi-Repo Context Tracking (Future Roadmap)

**Current (v1.0) - Single Repo:**
- MyIntern runs in one repository at a time
- Context is built from files within that repo only
- Works best for monolithic apps or single-service repos

**Planned (v2.0+) - Multi-Repo Orchestration:**

#### Problem Statement
Real-world microservices architectures have:
- **Shared libraries** (e.g., `common-utils`, `shared-models`)
- **API contracts** defined in separate repos (e.g., OpenAPI specs in `api-contracts`)
- **Cross-service dependencies** (UserService calls OrderService via REST/gRPC)

When generating code in `order-service`, the AI needs context from:
- `api-contracts/order-api.yaml` (API spec)
- `shared-models/src/main/java/com/example/model/User.java` (shared DTOs)
- `common-utils/src/main/java/com/example/util/ValidationUtils.java` (shared utilities)

**How MyIntern Will Solve This:**

```yaml
# .myintern/agent.yml (Future v2.0+)
version: "2.0"

multi_repo:
  enabled: true

  # Reference external repos
  dependencies:
    - name: shared-models
      path: ../shared-models
      include:
        - "src/main/java/com/example/model/**/*.java"

    - name: api-contracts
      path: ../api-contracts
      include:
        - "openapi/order-api.yaml"
        - "proto/order.proto"

    - name: common-utils
      path: ../common-utils
      include:
        - "src/main/java/com/example/util/**/*.java"

  # Context builder pulls files from these repos
  context_strategy:
    mode: "selective"  # Only include referenced files
    max_repos: 3       # Limit to avoid token budget issues
    cache_ttl: 300     # Cache external repo files for 5 minutes
```

**Context Building Strategy:**

1. **Dependency Graph Analysis:**
   - Parse `import` statements in your current repo
   - Identify classes from external repos (e.g., `import com.example.model.User`)
   - Fetch those specific files from referenced repos

2. **API Contract Awareness:**
   - If spec mentions "OrderAPI", fetch `api-contracts/order-api.yaml`
   - Include OpenAPI/gRPC definitions in AI context
   - Generate code that matches the contract

3. **Smart Token Budgeting:**
   - Prioritize current repo files (60% of budget)
   - External repos get 30% budget (most-referenced files first)
   - Practices + spec get 10%
   - Drop least-referenced files if over budget

4. **Change Detection Across Repos:**
   - Watch for changes in `shared-models` (using git submodules or file watchers)
   - If `User.java` changes, trigger validation in repos that depend on it
   - Optional: Auto-create PRs to update dependent services

---

### Real-World Use Case: Microservices Architecture

**Scenario:** You have 5 microservices sharing common models and utilities.

**Without MyIntern:**
- Change `User.java` in `shared-models`
- Manually update `UserController` in `user-service`
- Manually update `OrderService` in `order-service` (which calls user-service)
- Manually update tests in both services
- Hope you didn't miss anything

**With MyIntern (v2.0+ Future):**
1. Update `shared-models/User.java` (add new field `phoneNumber`)
2. MyIntern detects change in dependency
3. Creates specs automatically:
   - `.myintern/specs/UPDATE_USER_CONTROLLER.md` (in user-service)
   - `.myintern/specs/UPDATE_ORDER_SERVICE_USER_DTO.md` (in order-service)
4. You review specs, approve
5. MyIntern generates code in both repos
6. Compiles, tests, auto-fixes errors
7. Creates feature branches in both repos
8. You review, merge

**Result:** 30 minutes of work → 3 minutes of review.

---

### Current Workarounds (v1.0)

Until multi-repo support is released, here's how to handle shared code:

**Option 1: Git Submodules**
```bash
cd your-service
git submodule add https://github.com/yourorg/shared-models.git lib/shared-models

# In spec file, reference the submodule
## Context
Use User model from lib/shared-models/src/main/java/com/example/model/User.java

## Files Likely Affected
- lib/shared-models/src/main/java/com/example/model/User.java
- src/main/java/com/example/service/UserService.java
```

MyIntern will include `lib/shared-models/User.java` in context since it's within the repo.

**Option 2: Monorepo (Recommended)**
```
my-monorepo/
├── .myintern/
│   ├── agent.yml
│   ├── specs/
│   └── practices/
├── services/
│   ├── user-service/
│   ├── order-service/
│   └── payment-service/
├── shared/
│   ├── models/
│   └── utils/
└── api-contracts/
```

Run `myintern init` at root. MyIntern will have full context of all services and shared code.

**Option 3: Copy Shared Files to Context**
```bash
# Before running MyIntern, copy shared files locally
cp ../shared-models/src/main/java/com/example/model/User.java \
   .myintern/context/User.java
```

Reference in spec:
```markdown
## Files Likely Affected
- .myintern/context/User.java (shared model, DO NOT MODIFY)
- src/main/java/com/example/service/UserService.java
```

---

## New Features in v1.0

### 1. Zero-Setup Code Review (`myintern review`)

**The Acquisition Hook** - Run code review on ANY Java/Spring Boot project without setup:

```bash
# Review any codebase instantly
cd /path/to/any/java/project
myintern review
```

**What it analyzes:**
- **Security**: SQL injection, XSS, hardcoded secrets, insecure configurations
- **Quality**: Code complexity, duplication, naming conventions, best practices
- **Performance**: N+1 queries, memory leaks, inefficient algorithms
- **Spring Boot**: Correct annotation usage, transaction management, error handling

**Example output:**
```
🔍 MyIntern Code Review

   Language: Java
   Framework: Spring Boot 3.2.0
   Build Tool: Maven

   Scanning 87 files...

📊 Review Summary:
   Total Files: 87
   Total Violations: 23

   🔴 Critical: 2
   🟠 High: 7
   🟡 Medium: 10
   🟢 Low: 4

   ✨ 15 violations can be auto-fixed
   Run: myintern fix

🔍 Top Issues:
1. 🔴 SECURITY: SQL injection vulnerability
   File: UserRepository.java:42
   Fix: Use parameterized queries
   ✨ Auto-fixable

2. 🟠 SECURITY: Hardcoded password
   File: DatabaseConfig.java:28
   Fix: Move to environment variable
   ✨ Auto-fixable
```

**Focus areas:**
```bash
myintern review --focus security    # Security vulnerabilities only
myintern review --focus quality     # Code quality issues
myintern review --focus performance # Performance problems
```

**Auto-fix violations:**
```bash
myintern fix                  # Fix from latest review
myintern fix --review         # Run review + fix in one command
```

### 2. Rollback Support

Safely undo any MyIntern changes with full git integration:

```bash
# List rollback history
myintern rollback --list

# Rollback specific change
myintern rollback --id rb-1234567890-abc123
```

**How it works:**
- Every code generation is tracked with a unique ID
- Records timestamp, spec, branch, affected files, commit hash
- **Git revert** for committed changes
- **File restore** for uncommitted changes
- **Safety checks** prevent double-rollback

**Example:**
```
📜 Rollback History:

1. rb-1708534567-a1b2c3
   Spec: spec-user-registration.md
   Branch: myintern/feature-spec-user-registration
   Time: 2024-02-21T15:30:45.123Z
   Files: 3
   ✓ Can rollback

2. rb-1708520123-x9y8z7
   Spec: spec-order-service.md
   Branch: myintern/feature-spec-order-service
   Time: 2024-02-21T11:15:20.456Z
   Files: 5
   ✗ Already rolled back
```

### 3. Dry-Run Preview

See exactly what will change before applying code:

```yaml
# .myintern/agent.yml
preview:
  enabled: true
  show_diffs: true
  require_approval: false  # Set to true for production repos
```

**Example output:**
```
📋 Preview of Changes:

📝 CREATE: src/main/java/com/example/controller/UserController.java
   Preview (first 10 lines):
   1 + package com.example.controller;
   2 +
   3 + import org.springframework.web.bind.annotation.*;
   ... (42 more lines)

✏️  MODIFY: src/main/java/com/example/service/UserService.java
   @@ -15,7 +15,10 @@
    public class UserService {
   -    public User createUser(UserDto dto) {
   +    public User createUser(UserDto dto) throws UserAlreadyExistsException {
   +        if (userRepository.existsByEmail(dto.getEmail())) {
   +            throw new UserAlreadyExistsException(dto.getEmail());
   +        }
```

### 4. Spring Boot Intelligence

MyIntern auto-detects Spring Boot 2.x vs 3.x and generates correct imports:

**Detected: Spring Boot 3.2.0**
```java
// ✅ MyIntern generates:
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.validation.constraints.NotNull;
```

**Detected: Spring Boot 2.7.5**
```java
// ✅ MyIntern generates:
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.validation.constraints.NotNull;
```

**Auto-detection sources:**
1. `pom.xml` - Spring Boot parent/version
2. `build.gradle` - Spring Boot plugin version
3. Code analysis - Scans existing imports

### 5. GitHub Issues Integration

Convert GitHub issues to specs automatically:

```bash
# Set GitHub token
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx

# Sync issues with 'myintern' label
myintern github --sync

# Sync with custom labels
myintern github --sync --labels "myintern,enhancement"

# Sync issues assigned to you
myintern github --sync --assigned-to johndoe
```

**GitHub Issue #42:**
```markdown
Title: Add User Registration Endpoint
Labels: myintern, enhancement, backend
Body:
We need a REST API for user registration.

## Acceptance Criteria
- [ ] POST /api/users/register
- [ ] Email validation
- [ ] Password hashing with BCrypt
```

**Becomes:** `.myintern/specs/spec-gh-42.md`
```markdown
# FEATURE: Add User Registration Endpoint

**GitHub Issue:** #42
**Type:** feature
**Priority:** medium

## Description
We need a REST API for user registration.

## Acceptance Criteria
- POST /api/users/register
- Email validation
- Password hashing with BCrypt
```

**Auto-close issues:**
```bash
myintern github --close 42
```

### 6. Feedback Loop

MyIntern learns from your code reviews to improve over time:

```yaml
# .myintern/agent.yml
feedback:
  enabled: true
  auto_learn: true
```

**How it works:**
1. After code generation, provide feedback (via IDE integration or manual JSON)
2. MyIntern extracts patterns from positive/negative feedback
3. Future prompts include learned patterns

**Learned patterns added to prompts:**
```
## Previous Feedback & Learning Patterns

This repo has 15 feedback entries (12 positive, 3 negative).

### Patterns to Follow:
- ✅ Always add @Transactional on service methods
- ✅ Use constructor injection instead of @Autowired
- ✅ Return ResponseEntity with proper HTTP status codes

### Patterns to Avoid:
- ❌ Avoid: Exposing entities directly in controllers
- ❌ Avoid: Using Optional.get() without isPresent() check
```

---

## What's Next?

### Current Version (v1.2) - Production Ready

**✅ v1.0 Core Features (Complete):**
- Java/Spring Boot support (Maven/Gradle)
- Code + Test + Build agents
- Free with Claude Pro/Max, or BYOK (Anthropic/OpenAI/Bedrock)
- Auto-fix retry logic (max 3 attempts)
- Safety rules (protected branches, no file deletion)

**✅ v1.1 Features (Complete):**
- Zero-setup code review (`myintern review`)
- Rollback support with git integration
- Dry-run preview with file diffs
- GitHub Issues sync
- Spring Boot 2.x/3.x intelligence (jakarta.* vs javax.*)
- Feedback loop for continuous learning
- **Guardrails** - PII/PHI/credential protection
  - HIPAA & PCI-DSS compliance
  - 4 violation levels (INFO, WARN, BLOCK, CRITICAL)
  - 4 redaction modes (mask, hash, skip, none)
  - Override management for false positives
  - Full CLI (`scan`, `override`, `logs`, `audit`)
  - Audit trail logging

**✅ v1.2 Features (Complete):**
- **Multi-repo support** - monorepo/microservices context awareness
  - Token budget balancing across repos
  - Auto-discovery of source files per repo
  - "Repos Affected" parsing from specs
- **Context loading** - zero-migration-cost context aggregation
  - Priority: `.myintern/practices/` → `CLAUDE.md` → `.cursorrules` → `.github/copilot-instructions.md`
  - Cursor/Claude Code users: zero setup needed
- **Parallel execution** - conflict-aware parallel spec processing
  - Configurable max parallel limit
  - Jira ticket grouping for sequential execution
- **Spec file caching** - 70-90% faster spec parsing
  - In-memory cache with mtime/size invalidation
  - Automatic cache invalidation on file changes

### Future Roadmap (v2.0+)

#### Multi-Language Support
⏳ Node.js/TypeScript support
⏳ Python/Django support
⏳ Go support
⏳ Rust support

#### Deployment & CI/CD
⏳ **Deploy Agent** - Kubernetes, AWS ECS, Google Cloud Run
⏳ **CI/CD Integration** - GitHub Actions, GitLab CI, Jenkins
⏳ **Environment Management** - dev/staging/prod configs

#### Team Collaboration
⏳ **Jira Sync** - Auto-create specs from Jira tickets
⏳ **Slack Integration** - Notify team when implementation is ready
⏳ **PR Auto-Creation** - Auto-create GitHub/GitLab PRs with descriptions

#### Multi-Repo Orchestration
⏳ **Cross-Repo Context** - Build context from multiple repos
⏳ **Dependency Graph** - Track inter-service dependencies
⏳ **Cascade Updates** - Update dependent services automatically
⏳ **Contract Testing** - Validate API contracts across services

#### Advanced Customization
⏳ **Custom AI Prompts** - Override default prompts per project
⏳ **Plugin System** - Write custom agents in TypeScript
⏳ **Pre/Post Hooks** - Run custom scripts before/after code gen
⏳ **Custom Validators** - Add project-specific validation rules

---

## Support & Feedback

- **Issues:** https://github.com/myinterndev/myintern/issues
- **Docs:** https://github.com/myinterndev/myintern
- **Twitter:** @myintern_dev

---

**Last Updated:** 2026-02-23
**Version:** 1.2.0 (Production Ready - Java/Spring Boot)
**Key Updates:** Guardrails (v1.1), Multi-Repo Support (v1.2), Context Loading (v1.2), Parallel Execution (v1.2)

---

## File Structure Reference

After running `myintern init`, your project will have:

### Single-Repo Project

```
your-project/
├── .myintern/
│   ├── agent.yml                      # Main configuration
│   ├── specs/                         # Feature specifications
│   │   ├── EXAMPLE_SPEC.md
│   │   └── spec-gh-42.md             # From GitHub Issue #42 (if synced)
│   ├── practices/                     # Coding standards
│   │   └── java.md
│   ├── .context/                      # Hidden global context (gitignored)
│   │   ├── .gitignore
│   │   └── global-context.json       # Jira ticket grouping (v1.2)
│   ├── logs/                          # Execution logs
│   │   ├── executions.json
│   │   ├── guardrails.log            # Guardrails audit trail (v1.1)
│   │   └── guardrails-overrides.json # False positive overrides (v1.1)
│   ├── previews/                      # Dry-run previews (v1.1)
│   │   └── preview-2024-02-21.diff
│   ├── reports/                       # Code review reports (v1.1)
│   │   └── review-2024-02-21.json
│   ├── feedback/                      # Feedback loop data (v1.1)
│   │   ├── feedback.json
│   │   └── patterns.json
│   ├── rollback-history.json          # Rollback tracking (v1.1)
│   └── github-sync.json               # GitHub sync state (v1.1)
├── CLAUDE.md                           # Auto-loaded if present (v1.2)
├── .cursorrules                        # Auto-loaded if present (v1.2)
├── pom.xml (or build.gradle)
└── src/
    ├── main/java/...
    └── test/java/...
```

### Multi-Repo/Monorepo Project (v1.2+)

```
my-monorepo/
├── .myintern/
│   ├── agent.yml                      # Multi-repo config
│   ├── specs/                         # Shared specs
│   │   ├── USER_AUTH_SPEC.md         # Affects multiple repos
│   │   └── ORDER_SERVICE_SPEC.md
│   ├── practices/
│   │   └── java.md
│   ├── .context/                      # Global context across repos
│   │   └── global-context.json
│   └── logs/
│       ├── executions.json
│       ├── guardrails.log
│       └── guardrails-overrides.json
├── api-service/                       # Repo 1
│   ├── pom.xml
│   └── src/main/java/...
├── web-service/                       # Repo 2
│   ├── build.gradle
│   └── src/main/java/...
├── shared-lib/                        # Repo 3
│   ├── pom.xml
│   └── src/main/java/...
└── CLAUDE.md                          # Shared coding standards
```

### Key Files Explained

**Configuration:**
- `agent.yml` - Main config (providers, agents, build commands, safety rules, guardrails, multi-repo)
- `practices/java.md` - Your team's coding standards (fed to AI)
- `CLAUDE.md` - Auto-loaded if present (Anthropic convention)
- `.cursorrules` - Auto-loaded if present (Cursor convention)
- `.github/copilot-instructions.md` - Auto-loaded if present (GitHub Copilot)

**Specs:**
- `specs/*.md` - Feature/bug specifications that trigger code generation
- `spec-gh-*.md` - Auto-generated from GitHub issues
- `.context/global-context.json` - Jira ticket grouping context (hidden, gitignored)

**Tracking:**
- `logs/executions.json` - All agent runs (timestamps, specs, results)
- `logs/guardrails.log` - Guardrails audit trail (JSON format)
- `logs/guardrails-overrides.json` - False positive overrides
- `rollback-history.json` - Change history for rollback
- `github-sync.json` - GitHub issue sync state

**Reports:**
- `reports/review-*.json` - Code review findings
- `previews/preview-*.diff` - Dry-run change previews
- `feedback/feedback.json` - Code review feedback
- `feedback/patterns.json` - Learned patterns from feedback

---

**Version:** 1.2.0 (Production Ready)
**Platform:** Java/Spring Boot (Maven/Gradle)
**Support:** https://github.com/myinterndev/myintern
**Documentation:** See [CLAUDE.md](.claude/CLAUDE.md) and [MYINTERN_PRODUCT_ENHANCED.md](MYINTERN_PRODUCT_ENHANCED.md)

---

## Quick Reference Cards

### Guardrails Cheat Sheet

| Task | Command |
|------|---------|
| Scan single file | `myintern guardrails scan src/main/Config.java` |
| Scan all files | `myintern guardrails scan --all` |
| Add override | `myintern guardrails override --file "..." --pattern "SSN" --reason "..."` |
| View logs | `myintern guardrails logs --tail 20` |
| HIPAA audit | `myintern guardrails audit --framework hipaa --since 90d` |
| Check status | `myintern config show \| grep guardrails` |

### Multi-Repo Cheat Sheet

| Task | Config/Command |
|------|----------------|
| Declare repos | Add `repos:` section to `agent.yml` |
| Enable auto-discovery | `watch: { auto_discover: true }` |
| Spec affects repos | Add `**Repos Affected:** api-service, shared-lib` to spec |
| Parallel execution | `agents: { max_parallel: 3 }` |
| Check context | `myintern logs \| grep "context"` |

### Context Loading Cheat Sheet

| Priority | File | Purpose |
|----------|------|---------|
| 1 (Highest) | `.myintern/practices/java.md` | Explicit team standards |
| 2 | `CLAUDE.md` or `.claude/CLAUDE.md` | Anthropic convention |
| 3 | `.cursorrules` | Cursor users |
| 4 | `.github/copilot-instructions.md` | GitHub Copilot users |
| 5 | `.myintern/agent.yml` | Pipeline config |
| 6 | Spec file | Task definition |
| 7 | Git diff + affected files | Code context |
