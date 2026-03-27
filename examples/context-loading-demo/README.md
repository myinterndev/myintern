# Context Loading Priority - Demo

This example demonstrates MyIntern's zero-config context loading feature that enables instant compatibility with Claude Code, Cursor, and GitHub Copilot.

## Setup

This demo includes sample context files from different tools:

```
context-loading-demo/
├── .myintern/
│   └── practices/
│       └── java.md              # Team standards (Priority 1 - Highest)
├── .claude/
│   └── CLAUDE.md                # Claude Code instructions (Priority 2)
├── .cursorrules                 # Cursor rules (Priority 3)
└── .github/
    └── copilot-instructions.md  # Copilot instructions (Priority 4)
```

## Demo Scenarios

### Scenario 1: Zero-Config with Claude Code

Simulate a developer who uses Claude Code (has `CLAUDE.md` but no MyIntern setup):

```bash
# Remove .myintern directory to simulate zero-config
rm -rf .myintern

# Run MyIntern
myintern run "Add GET /health endpoint"
```

**Expected Output:**
```
📚 Loading context from:
   - Claude Code Instructions: .claude/CLAUDE.md
```

### Scenario 2: Zero-Config with Cursor

Simulate a Cursor user:

```bash
# Keep only .cursorrules
rm -rf .myintern .claude
rm -rf .github/copilot-instructions.md

# Run MyIntern
myintern run "Add user authentication"
```

**Expected Output:**
```
📚 Loading context from:
   - Cursor Rules: .cursorrules
```

### Scenario 3: Team with All Context Files

Full setup with all context files:

```bash
# Restore all files
git checkout .

# Run MyIntern
myintern start
```

**Expected Output:**
```
📚 Loading context from:
   - MyIntern Team Standards: .myintern/practices/java.md
   - Claude Code Instructions: .claude/CLAUDE.md
   - Cursor Rules: .cursorrules
   - GitHub Copilot Instructions: .github/copilot-instructions.md
```

**Key Point:** All files are loaded and merged, with team standards taking highest priority.

## Sample Context Files

### `.myintern/practices/java.md` (Team Standards)

```markdown
# Java

1. Use Spring Boot 3.x with Java 17
2. Follow Controller → Service → Repository pattern
3. Use DTOs for API requests/responses
4. Write JUnit 5 tests with 80%+ coverage
5. Use Lombok for boilerplate reduction
6. Use jakarta.* imports (not javax.*)
```

### `.claude/CLAUDE.md` (Personal Claude Code Preferences)

```markdown
# Claude Code Instructions

## Java Development
- Prefer functional programming style
- Use Optional instead of null checks
- Write comprehensive JavaDoc
- Use record types for immutable data
```

### `.cursorrules` (Cursor Preferences)

```markdown
Always write tests first (TDD)
Use descriptive variable names
Prefer composition over inheritance
Keep methods under 20 lines
```

### `.github/copilot-instructions.md` (Copilot Preferences)

```markdown
# GitHub Copilot Instructions

- Use Spring Boot best practices
- Follow RESTful API conventions
- Include error handling for all endpoints
- Use @Valid for request validation
```

## Priority Override Example

When all files exist, MyIntern merges them with this structure:

```markdown
# Context from MyIntern Team Standards (java.md)
1. Use Spring Boot 3.x with Java 17
...

---

# Context from Claude Code Instructions (CLAUDE.md)
- Prefer functional programming style
...

---

# Context from Cursor Rules (.cursorrules)
Always write tests first (TDD)
...

---

# Context from GitHub Copilot Instructions (copilot-instructions.md)
- Use Spring Boot best practices
...
```

This merged content is sent to the LLM, ensuring all coding standards are respected while giving highest priority to team standards.

## Testing the Feature

```bash
# Run the ContextFileLoader tests
npm test -- ContextFileLoader

# Expected: 22/22 tests passing
```

## Real-World Usage

### For Individual Developers
- Start with your existing `CLAUDE.md` or `.cursorrules`
- No need to create `.myintern/` folder
- MyIntern works immediately

### For Teams
- Add `.myintern/practices/java.md` to enforce team standards
- Individual developers can still keep personal preferences
- Team standards override personal preferences
- Zero migration: existing tool users keep their workflows

## Benefits

✅ **Zero Migration Cost** - Works with existing context files
✅ **Gradual Adoption** - Start simple, formalize later
✅ **Tool Compatibility** - Claude Code, Cursor, Copilot all work together
✅ **Team Flexibility** - Balance team standards with personal preferences

---

**Next Steps:**
- Try the demo scenarios above
- Examine the merged context in the LLM prompt
- See how different priority levels affect code generation
