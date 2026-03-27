import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { AIProvider } from '../integrations/ai/AIProvider';
import { LanguageDetector } from '../core/LanguageDetector';

/**
 * Review violation type (exported for AgentPipeline)
 */
export interface ReviewViolation {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  file: string;
  line?: number;
  description: string;
  recommendation: string;
  autoFixable: boolean;
  fix?: string;
}

/**
 * ReviewAgent - Zero-setup codebase auditing
 * Scans any codebase and identifies code quality issues, security vulnerabilities,
 * and violations of best practices
 */
export class ReviewAgent {
  private repoPath: string;
  private aiProvider: AIProvider;

  constructor(repoPath: string, aiProvider: AIProvider) {
    this.repoPath = repoPath;
    this.aiProvider = aiProvider;
  }

  /**
   * Review entire codebase
   */
  async reviewCodebase(options: {
    focus?: 'security' | 'quality' | 'performance' | 'all';
    severity?: 'critical' | 'high' | 'medium' | 'low' | 'all';
    autoFix?: boolean;
  } = {}): Promise<{
    success: boolean;
    violations: Array<{
      id: string;
      severity: 'critical' | 'high' | 'medium' | 'low';
      category: string;
      file: string;
      line?: number;
      description: string;
      recommendation: string;
      autoFixable: boolean;
      fix?: string;
    }>;
    summary: {
      totalFiles: number;
      totalViolations: number;
      critical: number;
      high: number;
      medium: number;
      low: number;
      autoFixable: number;
    };
  }> {
    console.log(chalk.blue('\n🔍 MyIntern Code Review\n'));

    const focus = options.focus || 'all';
    const severity = options.severity || 'all';

    // Detect language and framework
    const detector = new LanguageDetector(this.repoPath);
    const detectedLang = detector.detectPrimary();

    console.log(chalk.gray(`   Language: ${detectedLang.language}`));
    console.log(chalk.gray(`   Framework: ${detectedLang.framework || 'None'}`));
    console.log(chalk.gray(`   Build Tool: ${detectedLang.buildTool}`));
    console.log();

    // Scan files
    const files = this.scanFiles(detectedLang.language);
    console.log(chalk.blue(`   Scanning ${files.length} files...`));

    const violations: Array<any> = [];

    // Review each file
    for (const file of files) {
      const fileViolations = await this.reviewFile(file, detectedLang, focus);
      violations.push(...fileViolations);
    }

    // Filter by severity
    const filteredViolations = severity === 'all'
      ? violations
      : violations.filter(v => v.severity === severity);

    // Calculate summary
    const summary = {
      totalFiles: files.length,
      totalViolations: filteredViolations.length,
      critical: filteredViolations.filter(v => v.severity === 'critical').length,
      high: filteredViolations.filter(v => v.severity === 'high').length,
      medium: filteredViolations.filter(v => v.severity === 'medium').length,
      low: filteredViolations.filter(v => v.severity === 'low').length,
      autoFixable: filteredViolations.filter(v => v.autoFixable).length
    };

    // Display results
    this.displayResults(filteredViolations, summary);

    // Save report
    this.saveReport(filteredViolations, summary);

    return {
      success: true,
      violations: filteredViolations,
      summary
    };
  }

  /**
   * Review a single file
   */
  private async reviewFile(
    filePath: string,
    langConfig: any,
    focus: string
  ): Promise<Array<any>> {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Build review prompt
    const prompt = this.buildReviewPrompt(filePath, content, langConfig, focus);

    try {
      // Use chat() instead of generateCode() since review returns violations JSON, not CodeImplementation
      const responseText = await this.aiProvider.chat([
        { role: 'user', content: prompt }
      ]);

      // Parse JSON from response (may be wrapped in markdown code fences)
      const parsed = this.extractJSON(responseText);
      const violations = this.parseViolations(parsed, filePath);

      return violations;
    } catch (error) {
      console.log(chalk.yellow(`   ⚠️  Error reviewing ${filePath}: ${error}`));
      return [];
    }
  }

  /**
   * Build review prompt for AI
   */
  private buildReviewPrompt(filePath: string, content: string, langConfig: any, focus: string): string {
    const focusAreas = {
      security: 'Security vulnerabilities (SQL injection, XSS, hardcoded secrets, etc.)',
      quality: 'Code quality (complexity, duplication, naming, etc.)',
      performance: 'Performance issues (N+1 queries, memory leaks, inefficient algorithms)',
      all: 'All issues (security, quality, performance, best practices)'
    };

    let prompt = `You are an expert code reviewer for ${langConfig.language}`;
    if (langConfig.framework) {
      prompt += ` with ${langConfig.framework}`;
    }
    prompt += '.\n\n';

    prompt += `# Review Focus\n${focusAreas[focus as keyof typeof focusAreas]}\n\n`;

    prompt += `# File to Review\n**Path:** ${filePath}\n\n`;
    prompt += `\`\`\`${langConfig.language.toLowerCase()}\n${content}\n\`\`\`\n\n`;

    prompt += `# Task\nAnalyze the code and identify ALL issues. For each issue:\n\n`;
    prompt += `1. Classify severity: critical, high, medium, low\n`;
    prompt += `2. Provide clear description\n`;
    prompt += `3. Suggest specific fix\n`;
    prompt += `4. Indicate if auto-fixable\n\n`;

    prompt += `# Output Format (JSON only)\n\n`;
    prompt += `Return ONLY a valid JSON object:\n\n`;
    prompt += `\`\`\`json\n`;
    prompt += `{\n`;
    prompt += `  "violations": [\n`;
    prompt += `    {\n`;
    prompt += `      "severity": "high",\n`;
    prompt += `      "category": "security",\n`;
    prompt += `      "line": 42,\n`;
    prompt += `      "description": "SQL injection vulnerability",\n`;
    prompt += `      "recommendation": "Use parameterized queries",\n`;
    prompt += `      "autoFixable": true,\n`;
    prompt += `      "fix": "String sql = \\"SELECT * FROM users WHERE id = ?\\""\n`;
    prompt += `    }\n`;
    prompt += `  ]\n`;
    prompt += `}\n`;
    prompt += `\`\`\`\n\n`;

    prompt += `CRITICAL:\n`;
    prompt += `- Return ONLY valid JSON\n`;
    prompt += `- Include line numbers when possible\n`;
    prompt += `- Provide actionable recommendations\n`;
    prompt += `- Mark as autoFixable only if fix is straightforward\n`;

    return prompt;
  }

  /**
   * Extract JSON object from a text response (handles markdown code fences)
   */
  private extractJSON(text: string): any {
    // Try removing markdown code fences first
    const defenced = text
      .replace(/^```(?:json)?\s*\n?/m, '')
      .replace(/\n?\s*```\s*$/m, '')
      .trim();

    try {
      return JSON.parse(defenced);
    } catch {
      // Try extracting JSON object with regex
      const objMatch = text.match(/\{[\s\S]*\}/);
      if (objMatch) {
        return JSON.parse(objMatch[0]);
      }
    }

    return {};
  }

  /**
   * Parse violations from AI response
   */
  private parseViolations(response: any, filePath: string): Array<any> {
    try {
      let violations = [];

      if (response.violations) {
        violations = response.violations;
      } else if (Array.isArray(response)) {
        violations = response;
      }

      // Add file path and generate IDs
      return violations.map((v: any, idx: number) => ({
        id: `${path.basename(filePath)}-${idx + 1}`,
        file: filePath,
        severity: v.severity || 'medium',
        category: v.category || 'quality',
        line: v.line,
        description: v.description,
        recommendation: v.recommendation,
        autoFixable: v.autoFixable || false,
        fix: v.fix
      }));
    } catch (error) {
      console.log(chalk.yellow(`   ⚠️  Error parsing violations: ${error}`));
      return [];
    }
  }

  /**
   * Scan files in the repo
   */
  private scanFiles(language: string): string[] {
    const extensions: Record<string, string[]> = {
      java: ['.java'],
      javascript: ['.js', '.jsx'],
      typescript: ['.ts', '.tsx'],
      python: ['.py'],
      go: ['.go'],
      rust: ['.rs']
    };

    const exts = extensions[language.toLowerCase()] || ['.java'];
    const files: string[] = [];

    const scan = (dir: string) => {
      if (!fs.existsSync(dir)) return;

      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Skip ignored directories
        if (entry.isDirectory()) {
          if (['node_modules', 'target', 'build', 'dist', '.git', '.myintern'].includes(entry.name)) {
            continue;
          }
          scan(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (exts.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    };

    scan(this.repoPath);

    return files;
  }

  /**
   * Display review results
   */
  private displayResults(violations: Array<any>, summary: any): void {
    console.log(chalk.blue('\n📊 Review Summary:\n'));

    console.log(chalk.gray(`   Total Files: ${summary.totalFiles}`));
    console.log(chalk.gray(`   Total Violations: ${summary.totalViolations}`));
    console.log();

    if (summary.critical > 0) {
      console.log(chalk.red(`   🔴 Critical: ${summary.critical}`));
    }
    if (summary.high > 0) {
      console.log(chalk.red(`   🟠 High: ${summary.high}`));
    }
    if (summary.medium > 0) {
      console.log(chalk.yellow(`   🟡 Medium: ${summary.medium}`));
    }
    if (summary.low > 0) {
      console.log(chalk.gray(`   🟢 Low: ${summary.low}`));
    }

    if (summary.autoFixable > 0) {
      console.log(chalk.green(`\n   ✨ ${summary.autoFixable} violations can be auto-fixed`));
      console.log(chalk.gray(`   Run: myintern fix --review\n`));
    }

    // Show top violations
    if (violations.length > 0) {
      console.log(chalk.blue('\n🔍 Top Issues:\n'));

      const topViolations = violations
        .sort((a, b) => {
          const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
          return severityOrder[a.severity as keyof typeof severityOrder] -
                 severityOrder[b.severity as keyof typeof severityOrder];
        })
        .slice(0, 10);

      topViolations.forEach((v, idx) => {
        const iconMap: { [key: string]: string } = {
          critical: '🔴',
          high: '🟠',
          medium: '🟡',
          low: '🟢'
        };
        const icon = iconMap[v.severity];

        console.log(chalk.white(`${idx + 1}. ${icon} ${v.category.toUpperCase()}: ${v.description}`));
        console.log(chalk.gray(`   File: ${v.file}${v.line ? `:${v.line}` : ''}`));
        console.log(chalk.gray(`   Fix: ${v.recommendation}`));
        if (v.autoFixable) {
          console.log(chalk.green(`   ✨ Auto-fixable`));
        }
        console.log();
      });
    }
  }

  /**
   * Save review report
   */
  private saveReport(violations: Array<any>, summary: any): void {
    const reportDir = path.join(this.repoPath, '.myintern', 'reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportFile = path.join(reportDir, `review-${timestamp}.json`);

    const report = {
      timestamp: new Date().toISOString(),
      summary,
      violations
    };

    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf-8');

    console.log(chalk.gray(`\n📄 Full report saved: ${reportFile}\n`));
  }

  /**
   * Auto-fix violations
   */
  async autoFix(violations: Array<any>): Promise<{
    success: boolean;
    fixed: number;
    failed: number;
  }> {
    const autoFixable = violations.filter(v => v.autoFixable);

    console.log(chalk.blue(`\n🔧 Auto-fixing ${autoFixable.length} violations...\n`));

    let fixed = 0;
    let failed = 0;

    for (const violation of autoFixable) {
      try {
        await this.applyFix(violation);
        console.log(chalk.green(`   ✓ Fixed: ${violation.description} in ${violation.file}:${violation.line}`));
        fixed++;
      } catch (error) {
        console.log(chalk.red(`   ✗ Failed: ${violation.description} in ${violation.file}:${violation.line}`));
        failed++;
      }
    }

    console.log(chalk.blue(`\n✨ Auto-fix complete: ${fixed} fixed, ${failed} failed\n`));

    return { success: failed === 0, fixed, failed };
  }

  /**
   * Apply a single fix
   */
  private async applyFix(violation: any): Promise<void> {
    if (!violation.fix) {
      throw new Error('No fix provided');
    }

    const filePath = violation.file;
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    if (violation.line) {
      // Apply fix at specific line
      lines[violation.line - 1] = violation.fix;
    } else {
      // Need AI to generate full fix
      const prompt = this.buildFixPrompt(filePath, content, violation);
      const fixResponse = await this.aiProvider.generateCode(prompt);

      if (fixResponse.files && fixResponse.files.length > 0) {
        fs.writeFileSync(filePath, fixResponse.files[0].content, 'utf-8');
        return;
      }
    }

    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  }

  /**
   * Build fix prompt for AI
   */
  private buildFixPrompt(filePath: string, content: string, violation: any): string {
    let prompt = `You are an expert code fixer.\n\n`;

    prompt += `# File to Fix\n**Path:** ${filePath}\n\n`;
    prompt += `\`\`\`java\n${content}\n\`\`\`\n\n`;

    prompt += `# Issue to Fix\n`;
    prompt += `**Severity:** ${violation.severity}\n`;
    prompt += `**Category:** ${violation.category}\n`;
    prompt += `**Description:** ${violation.description}\n`;
    prompt += `**Line:** ${violation.line || 'N/A'}\n`;
    prompt += `**Recommendation:** ${violation.recommendation}\n\n`;

    prompt += `# Task\nFix the issue. Return the corrected file.\n\n`;

    prompt += `# Output Format (JSON only)\n\n`;
    prompt += `\`\`\`json\n`;
    prompt += `{\n`;
    prompt += `  "files": [\n`;
    prompt += `    {\n`;
    prompt += `      "path": "${filePath}",\n`;
    prompt += `      "action": "modify",\n`;
    prompt += `      "content": "fixed code here"\n`;
    prompt += `    }\n`;
    prompt += `  ]\n`;
    prompt += `}\n`;
    prompt += `\`\`\`\n`;

    return prompt;
  }

  /**
   * Review specific files (used by AgentPipeline)
   * NEW in v1.3
   */
  async reviewFiles(filePaths: string[]): Promise<{
    violations: ReviewViolation[];
    passed: boolean;
  }> {
    const violations: ReviewViolation[] = [];

    // Detect language
    const detector = new LanguageDetector(this.repoPath);
    const detectedLang = detector.detectPrimary();

    // Review each file
    for (const filePath of filePaths) {
      const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : path.join(this.repoPath, filePath);

      if (!fs.existsSync(absolutePath)) {
        continue;
      }

      const fileViolations = await this.reviewFile(absolutePath, detectedLang, 'all');
      violations.push(...fileViolations);
    }

    return {
      violations,
      passed: violations.length === 0,
    };
  }
}
