# MyIntern Quick Start - 5 Minute Setup

## 1. Install

```bash
npm install -g myintern
```

## 2. Initialize in Your Spring Boot Project

```bash
cd your-spring-boot-project
myintern init
```

Select provider (Anthropic recommended), model, and confirm settings.

## 3. Set API Key

```bash
export ANTHROPIC_API_KEY=sk-ant-xxx...
```

Get key from: https://console.anthropic.com/

## 4. Customize Practices (Optional)

```bash
vim .myintern/practices/java.md
```

Edit to match your team's Spring Boot standards.

## 5. Create Spec File

```bash
vim .myintern/specs/FEATURE_NAME.md
```

Example:
```markdown
# FEATURE: User Registration

## Type
feature

## Priority
high

## Context
REST API for user registration with email/password.

## Acceptance Criteria
- POST /api/v1/users/register
- Email validation
- BCrypt password hashing
- Return 201 Created
- Add JUnit tests

## Files Likely Affected
- src/main/java/com/example/controller/UserController.java
- src/main/java/com/example/service/UserService.java
- src/main/java/com/example/repository/UserRepository.java

## Notes
Follow Controller → Service → Repository pattern.
```

## 6. Start Agent

```bash
myintern start
```

Agent watches for specs, generates code, compiles, tests, and auto-fixes errors.

## 7. Review & Merge

```bash
git status
git diff myintern/feature-FEATURE_NAME
git checkout main
git merge myintern/feature-FEATURE_NAME
```

---

## Config: `.myintern/agent.yml`

```yaml
version: "1.0"
llm:
  provider: anthropic
  model: claude-sonnet-4-5-20250929
  api_key: ${ANTHROPIC_API_KEY}
java:
  version: "17"
agents:
  code: true
  test: true
  build: true
build:
  tool: maven
git:
  protected_branches: [main, master, production]
```

---

## CLI Commands

```bash
myintern init      # Setup project
myintern start     # Start agent
myintern stop      # Stop agent
myintern status    # Check status
myintern config show  # View config
```

---

## Documentation

- **Full Guide:** [USAGE.md](USAGE.md) (600+ lines)
- **Technical:** [IMPLEMENTATION_COMPLETE.md](IMPLEMENTATION_COMPLETE.md)
- **Product Spec:** [MYINTERN_PRODUCT.md](MYINTERN_PRODUCT.md)

---

**v1.0** - Java/Spring Boot Agent
