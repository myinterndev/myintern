# Contributing to MyIntern

Thank you for your interest in contributing to MyIntern! We welcome contributions from the community.

## Code of Conduct

Be respectful, inclusive, and professional. We're all here to build something useful.

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/mjags/myintern/issues)
2. If not, create a new issue with:
   - Clear title
   - Steps to reproduce
   - Expected vs actual behavior
   - Your environment (OS, Node version, Java version)

### Suggesting Features

1. Check [Issues](https://github.com/mjags/myintern/issues) for existing feature requests
2. Create a new issue with:
   - Clear description of the feature
   - Use case / problem it solves
   - Proposed implementation (optional)

### Pull Requests

1. **Fork the repository**
   ```bash
   git clone https://github.com/mjags/myintern.git
   cd myintern
   ```

2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes**
   - Write clear, readable code
   - Follow existing code style
   - Add tests for new features
   - Update documentation

4. **Test your changes**
   ```bash
   npm install
   npm run build
   npm test
   ```

5. **Commit with clear messages**
   ```bash
   git commit -m "feat: add support for Gradle Kotlin DSL"
   ```

   Use conventional commits:
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation changes
   - `test:` - Test changes
   - `refactor:` - Code refactoring
   - `chore:` - Maintenance tasks

6. **Push and create PR**
   ```bash
   git push origin feature/your-feature-name
   ```

   Then create a Pull Request on GitHub.

## Development Setup

### Prerequisites
- Node.js 20+
- npm or yarn
- Java 17+ (for testing with Java projects)
- Maven or Gradle (for testing build integrations)

### Local Development

```bash
# Clone repo
git clone https://github.com/mjags/myintern.git
cd myintern

# Install dependencies
npm install

# Build TypeScript
npm run build

# Link for local testing
npm link

# Test in a Java project
cd /path/to/your/spring-boot-project
myintern init
myintern start
```

### Project Structure

```
myintern/
├── src/
│   ├── cli/              # CLI commands
│   │   ├── commands/     # Command implementations
│   │   └── index.ts      # CLI entry point
│   ├── agents/           # Agent implementations
│   │   ├── CodeAgent.ts
│   │   ├── TestAgent.ts
│   │   └── ...
│   ├── core/             # Core framework
│   │   ├── Agent.ts      # Base agent class
│   │   ├── Config.ts     # Configuration management
│   │   └── Logger.ts     # Logging
│   ├── integrations/     # External integrations
│   │   ├── ai/           # AI providers
│   │   ├── build/        # Maven/Gradle
│   │   └── git/          # Git operations
│   ├── patterns/         # Spring Boot patterns
│   └── templates/        # Code generation templates
├── tests/                # Unit tests
├── docs/                 # Documentation
└── examples/             # Example projects
```

## Areas We Need Help

### High Priority
- [ ] Gradle support (currently Maven only)
- [ ] Additional Spring Boot patterns
- [ ] Test coverage improvements
- [ ] Documentation

### Medium Priority
- [ ] Kotlin support
- [ ] Local LLM integration (Ollama, LM Studio)
- [ ] IntelliJ IDEA plugin
- [ ] VS Code extension

### Low Priority
- [ ] Web dashboard
- [ ] Docker support
- [ ] CI/CD templates

## Coding Guidelines

### TypeScript Style
- Use TypeScript strict mode
- Prefer interfaces over types
- Use async/await over promises
- Add JSDoc comments for public APIs

Example:
```typescript
/**
 * Generates Spring Boot code from a specification.
 * @param spec - The specification content
 * @returns Promise with generated code files
 */
async generateCode(spec: string): Promise<GeneratedCode> {
  // Implementation
}
```

### Testing
- Write tests for new features
- Use Jest for testing
- Aim for >80% coverage on new code

### Documentation
- Update README.md if adding user-facing features
- Add inline comments for complex logic
- Update GETTING_STARTED.md for setup changes

## Release Process

1. Update version in package.json
2. Update CHANGELOG.md
3. Create git tag
4. Publish to npm (maintainers only)

## Questions?

- Open a [Discussion](https://github.com/mjags/myintern/discussions)
- Join our [Discord](https://discord.gg/myintern)
- Email: support@myintern.dev

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
