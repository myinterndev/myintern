import Anthropic from '@anthropic-ai/sdk';
import { ConfigManager } from '../../core/Config';
import * as fs from 'fs';
import * as path from 'path';

export interface GeneratedFile {
  path: string;
  action: 'create' | 'modify';
  content: string;
}

export interface CodeImplementation {
  files: GeneratedFile[];
  commit_message: string;
  summary: string;
}

export class AnthropicProvider {
  private client: Anthropic;
  private model: string;

  constructor(private config: ConfigManager) {
    const apiKey = config.get('ai.apiKey');
    const model = config.get('ai.model');

    if (!apiKey) {
      throw new Error('Anthropic API key not configured. Run: myintern config set ai.apiKey YOUR_KEY');
    }

    this.client = new Anthropic({ apiKey });
    this.model = model || 'claude-sonnet-4-5-20250929';
  }

  async generateCode(specContent: string): Promise<CodeImplementation> {
    // Load project context
    const projectContext = this.loadProjectContext();

    const prompt = `
You are a junior software engineer for a Java/Spring Boot project.

# Project Context
${projectContext}

# Specification
${specContent}

# Your Task
Analyze this specification and implement the required features following Spring Boot best practices.

## Implementation Requirements

1. **Code Quality:**
   - Follow Spring Boot conventions (Controller → Service → Repository pattern)
   - Use dependency injection (@Autowired or constructor injection)
   - Proper exception handling (GlobalExceptionHandler, custom exceptions)
   - Input validation (@Valid, @NotNull, etc.)
   - Logging with SLF4J

2. **Security:**
   - Input validation on all endpoints
   - Proper HTTP status codes (200, 201, 400, 404, 500)
   - No hardcoded secrets
   - SQL injection prevention (use JPA properly)

3. **Testing:**
   - Will be handled by Test Agent separately

4. **Code Style:**
   - Follow existing patterns in the project
   - Use descriptive variable names
   - Add JavaDoc for public methods
   - Keep methods under 50 lines

## Output Format (JSON only)

Return ONLY a valid JSON object with this structure:

{
  "files": [
    {
      "path": "src/main/java/com/example/controller/UserController.java",
      "action": "create",
      "content": "package com.example.controller;\\n\\nimport..."
    }
  ],
  "commit_message": "feat: implement user registration endpoint",
  "summary": "Brief summary of what was implemented"
}

IMPORTANT:
- Return ONLY valid JSON (no markdown, no explanations)
- Include complete file content (not snippets)
- Use proper package names based on existing project structure
- Follow existing code patterns
`;

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 16000,
      messages: [{ role: 'user', content: prompt }]
    });

    const responseText = message.content[0].type === 'text'
      ? message.content[0].text
      : '';

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from AI response');
    }

    return JSON.parse(jsonMatch[0]) as CodeImplementation;
  }

  private loadProjectContext(): string {
    const cwd = process.cwd();
    let context = '';

    // Check for pom.xml or build.gradle
    if (fs.existsSync(path.join(cwd, 'pom.xml'))) {
      const pomContent = fs.readFileSync(path.join(cwd, 'pom.xml'), 'utf-8');

      // Extract key info from pom.xml
      const groupIdMatch = pomContent.match(/<groupId>(.*?)<\/groupId>/);
      const artifactIdMatch = pomContent.match(/<artifactId>(.*?)<\/artifactId>/);
      const versionMatch = pomContent.match(/<version>(.*?)<\/version>/);

      context += `## Project Information\n`;
      context += `- Build Tool: Maven\n`;
      if (groupIdMatch) context += `- Group ID: ${groupIdMatch[1]}\n`;
      if (artifactIdMatch) context += `- Artifact ID: ${artifactIdMatch[1]}\n`;
      if (versionMatch) context += `- Version: ${versionMatch[1]}\n`;
    }

    // Find existing source files to understand package structure
    const srcDir = path.join(cwd, 'src', 'main', 'java');
    if (fs.existsSync(srcDir)) {
      context += `\n## Package Structure\n`;

      // Find base package by looking for @SpringBootApplication
      const basePackage = this.findBasePackage(srcDir);
      if (basePackage) {
        context += `- Base Package: ${basePackage}\n`;
      }

      // List existing packages
      const packages = this.listPackages(srcDir);
      if (packages.length > 0) {
        context += `- Existing Packages: ${packages.join(', ')}\n`;
      }
    }

    // Check for application.properties or application.yml
    const appPropsPath = path.join(cwd, 'src', 'main', 'resources', 'application.properties');
    const appYmlPath = path.join(cwd, 'src', 'main', 'resources', 'application.yml');

    if (fs.existsSync(appPropsPath) || fs.existsSync(appYmlPath)) {
      context += `\n## Configuration\n`;
      context += `- Spring Boot configuration files present\n`;
    }

    return context || '## No existing Spring Boot project detected. Use standard Spring Boot structure.';
  }

  private findBasePackage(srcDir: string): string | null {
    const javaFiles = this.findJavaFiles(srcDir);

    for (const file of javaFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes('@SpringBootApplication')) {
        const packageMatch = content.match(/package\s+([\w.]+);/);
        return packageMatch ? packageMatch[1] : null;
      }
    }

    return null;
  }

  private listPackages(srcDir: string): string[] {
    const packages: Set<string> = new Set();
    const javaFiles = this.findJavaFiles(srcDir);

    for (const file of javaFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const packageMatch = content.match(/package\s+([\w.]+);/);
      if (packageMatch) {
        packages.add(packageMatch[1]);
      }
    }

    return Array.from(packages).sort();
  }

  private findJavaFiles(dir: string): string[] {
    const files: string[] = [];

    if (!fs.existsSync(dir)) return files;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...this.findJavaFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.java')) {
        files.push(fullPath);
      }
    }

    return files;
  }
}
