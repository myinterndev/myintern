# MyIntern - Quick Start Guide

**🎉 The Code Agent is now fully implemented and ready to use!**

---

## What's Implemented (MVP v1.0)

✅ **Core Framework**
- Configuration management (.myintern/config.yml)
- Logger (file + console output)
- Base Agent class

✅ **AI Integration**
- Anthropic Claude provider
- Spring Boot context awareness
- Automatic package structure detection

✅ **Code Agent**
- Watches specs/ directory for *SPEC.md and *TODO.md files
- Generates Spring Boot code (Controller, Service, Repository)
- Follows existing project patterns
- Compiles and tests generated code

✅ **CLI Commands**
- `myintern init` - Initialize project
- `myintern start` - Start Code Agent
- `myintern --help` - Show help

✅ **Maven Integration**
- Auto-detects Maven projects
- Runs `mvn compile` and `mvn test`

---

## Installation

### Option 1: From Source (Development)

```bash
cd ~/source/myinterndev/myintern

# Install dependencies
npm install

# Build TypeScript
npm run build

# Link globally (so you can run `myintern` from anywhere)
npm link
```

### Option 2: Test Locally

```bash
cd ~/source/myinterndev/myintern
npm run build

# Run directly without linking
node dist/cli/index.js --help
```

---

## Quick Test (5 Minutes)

### Step 1: Create a Test Spring Boot Project

```bash
cd ~/tmp
mkdir test-spring-boot && cd test-spring-boot

# Create minimal pom.xml
cat > pom.xml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>com.example</groupId>
    <artifactId>demo</artifactId>
    <version>1.0.0</version>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.0</version>
    </parent>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
    </dependencies>
</project>
EOF

# Create basic source directory
mkdir -p src/main/java/com/example/demo
```

### Step 2: Initialize MyIntern

```bash
myintern init

# You'll be prompted for:
# 1. AI Provider: Select "Anthropic Claude"
# 2. API Key: Enter your sk-ant-... key
```

**Expected output:**
```
✅ Detected build tool: maven
✅ MyIntern initialized successfully!
```

### Step 3: Create a Spec File

MyIntern created an example spec at `specs/EXAMPLE_SPEC.md`. Let's create a real one:

```bash
cat > specs/USER_API_SPEC.md << 'EOF'
# User Management API

## TODO: Implement User Registration Endpoint

### Requirements
Create a REST API endpoint for user registration.

**Endpoint:** POST /api/users/register

**Request Body:**
- email (String, required)
- password (String, required)
- firstName (String, required)
- lastName (String, required)

**Response:**
- 201 Created: User registered successfully
- 400 Bad Request: Invalid input
- 409 Conflict: Email already exists

### Acceptance Criteria
- [ ] Email validation (must be valid email format)
- [ ] Password validation (min 8 chars, 1 uppercase, 1 number)
- [ ] Return user ID and success message
- [ ] Proper error handling
EOF
```

### Step 4: Start MyIntern

```bash
myintern start
```

**Expected output:**
```
🚀 Starting MyIntern agents...

✅ Code Agent started
   Watching: /Users/you/tmp/test-spring-boot/specs
   Looking for: *SPEC.md, *TODO.md files

📋 Detected spec file: USER_API_SPEC.md
   🤖 Analyzing specification...
   ✅ Code generated
   Summary: Implemented user registration endpoint

   📝 Created: src/main/java/com/example/demo/controller/UserController.java
   📝 Created: src/main/java/com/example/demo/service/UserService.java
   📝 Created: src/main/java/com/example/demo/repository/UserRepository.java
   📝 Created: src/main/java/com/example/demo/model/User.java
   📝 Created: src/main/java/com/example/demo/dto/UserRegistrationRequest.java

   🔨 Compiling...
   ✅ Compilation successful

✨ Implementation complete!
   Commit message: feat: implement user registration endpoint

Press Ctrl+C to stop
```

### Step 5: Review Generated Code

```bash
# In another terminal
ls -la src/main/java/com/example/demo/

# Expected files:
# controller/UserController.java
# service/UserService.java
# repository/UserRepository.java
# model/User.java
# dto/UserRegistrationRequest.java
```

**Ctrl+C** to stop MyIntern

---

## Real-World Usage (On K2 Platform)

### Test with K2 Admin Service

```bash
cd ~/source/prasols/k2-admin-service

# Initialize MyIntern
myintern init

# Create a spec for a new feature
cat > specs/ORG_CONFIG_CRUD_SPEC.md << 'EOF'
# Organization-Level Configuration CRUD

## TODO: Implement Organization Config Endpoints

### Requirements
Add REST endpoints for managing organization-level configurations.

**Endpoints:**
- GET /admin/config/org/{orgId}
- POST /admin/config/org/{orgId}/properties
- PUT /admin/config/org/{orgId}/properties/{key}
- DELETE /admin/config/org/{orgId}/properties/{key}

### Implementation Notes
- Follow existing AdminConfigController pattern
- Use HMAC authentication on /admin/** endpoints
- Publish analytics events to SQS (not direct RDS writes)
- Return ConfigPropertyDto with inheritance metadata
EOF

# Start MyIntern
myintern start

# MyIntern will:
# 1. Detect the spec
# 2. Analyze existing AdminConfigController
# 3. Generate new endpoints following the same pattern
# 4. Compile and test
```

---

## How It Works

1. **You create a spec file** in `specs/` directory
2. **MyIntern detects it** (via file watcher)
3. **AI analyzes** the spec + your existing codebase
4. **Code is generated** following your patterns
5. **Maven compiles** the code
6. **Tests run** (if they exist)
7. **You review** and commit

---

## Configuration

### View Configuration

```bash
# See all config
cat .myintern/config.yml

# Example:
# ai:
#   provider: anthropic
#   apiKey: sk-ant-...
#   model: claude-sonnet-4-5-20250929
# build:
#   tool: maven
# agents:
#   code:
#     enabled: true
#     autoCommit: false
```

### Update Configuration

```bash
# Change AI provider
myintern config set ai.provider openai
myintern config set ai.apiKey sk-...

# Change model
myintern config set ai.model claude-opus-4-20250514
```

---

## Tips for Best Results

### 1. Write Clear Specs

**Good:**
```markdown
# TODO: Implement User Login

## Requirements
- POST /api/auth/login
- Accept email + password
- Return JWT token
- 401 if invalid credentials
```

**Bad:**
```markdown
# TODO: Add login
```

### 2. Reference Existing Code

```markdown
## Implementation Notes
- Follow the pattern in UserController.java
- Use the same authentication as AdminController
- Copy error handling from ProjectService
```

### 3. Specify Acceptance Criteria

```markdown
## Acceptance Criteria
- [ ] Email validation
- [ ] Password hashing with BCrypt
- [ ] Return 201 on success
- [ ] Return 400 on invalid input
```

---

## Troubleshooting

### "MyIntern not initialized"

```bash
# Run init first
myintern init
```

### "API key not configured"

```bash
# Set your API key
myintern config set ai.apiKey sk-ant-your-key
```

### "Not a Maven or Gradle project"

```bash
# Make sure you're in a Java project root
ls pom.xml  # or build.gradle

# Create one if needed
mkdir -p src/main/java
# Add pom.xml
```

### Generated code doesn't compile

- Check the spec for clarity
- Make sure existing code compiles first
- Review the generated code and fix manually
- Update the spec and try again

### Code Agent not detecting spec files

- Make sure file ends with `SPEC.md` or `TODO.md`
- Make sure it's in `specs/` directory
- Check for `TODO` or `PENDING` keywords in the file

---

## What's Next?

### Implemented in MVP v1.0
- ✅ Code Agent (working!)
- ✅ Maven integration
- ✅ Spring Boot pattern detection
- ✅ Init & Start commands

### Coming in v1.1 (Next 2 weeks)
- [ ] Test Agent (auto-generate tests)
- [ ] Gradle support
- [ ] Config command (manage settings)
- [ ] Status command (show agent status)
- [ ] Chat mode (interactive)

### Coming in v2.0 (Month 2)
- [ ] GitHub integration
- [ ] Automated PR creation
- [ ] Team features
- [ ] Web dashboard

---

## Feedback & Issues

Found a bug? Have a suggestion?

- **GitHub Issues:** https://github.com/myinterndev/myintern/issues
- **Discussions:** https://github.com/myinterndev/myintern/discussions

---

## Success Stories

**Share yours!**

Once you've successfully used MyIntern, we'd love to hear about it:
- What did you build?
- How much time did it save?
- What could be improved?

Post in GitHub Discussions or tweet with #myintern

---

**Happy coding! 🚀**

*Built with ❤️ for Java/Spring Boot developers*
