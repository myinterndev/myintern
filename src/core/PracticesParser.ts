import * as fs from 'fs';
import * as path from 'path';

export type PracticesFormat = 'minimal' | 'detailed';

export interface PracticesFile {
  filePath: string;
  language: string; // Extracted from # heading (e.g., "Java", "Python")
  format: PracticesFormat; // minimal or detailed
  rules: string[]; // Numbered list of rules
  rawContent: string;
}

/**
 * Parser for practices files
 *
 * Supports two formats:
 * 1. practices-min.md - Minimal format (compact, multi-rule per line)
 * 2. practices.md - Detailed format (one rule per line)
 *
 * Both must start with: # Language (e.g., # Java, # Python)
 * Followed by numbered list: 1. rule, 2. rule, etc.
 */
export class PracticesParser {
  /**
   * Parse a practices file from path
   */
  parse(practicesFilePath: string): PracticesFile {
    if (!fs.existsSync(practicesFilePath)) {
      throw new Error(`Practices file not found: ${practicesFilePath}`);
    }

    const content = fs.readFileSync(practicesFilePath, 'utf-8');
    const fileName = path.basename(practicesFilePath);

    // Extract language from first # heading
    const languageMatch = content.match(/^#\s+(.+)$/m);
    if (!languageMatch) {
      throw new Error(`Practices file must start with # Language heading: ${practicesFilePath}`);
    }
    const language = languageMatch[1].trim();

    // Determine format from filename
    const format: PracticesFormat = fileName.includes('-min') ? 'minimal' : 'detailed';

    // Extract numbered rules
    const rules = this.extractNumberedList(content);

    if (rules.length === 0) {
      throw new Error(`No numbered rules found in practices file: ${practicesFilePath}`);
    }

    return {
      filePath: practicesFilePath,
      language,
      format,
      rules,
      rawContent: content
    };
  }

  /**
   * Detect language from practices file without full parsing
   */
  detectLanguage(practicesFilePath: string): string {
    if (!fs.existsSync(practicesFilePath)) {
      throw new Error(`Practices file not found: ${practicesFilePath}`);
    }

    const content = fs.readFileSync(practicesFilePath, 'utf-8');
    const languageMatch = content.match(/^#\s+(.+)$/m);

    if (!languageMatch) {
      throw new Error(`Practices file must start with # Language heading: ${practicesFilePath}`);
    }

    return languageMatch[1].trim();
  }

  /**
   * Find practices file in .myintern/practices/ directory
   * Looks for: practices.md or practices-min.md
   */
  findPracticesFile(projectRoot: string): string | null {
    const practicesDir = path.join(projectRoot, '.myintern', 'practices');

    if (!fs.existsSync(practicesDir)) {
      return null;
    }

    // Check for both formats
    const candidates = [
      path.join(practicesDir, 'practices.md'),
      path.join(practicesDir, 'practices-min.md')
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    // Also check for any practices-*.md file
    const files = fs.readdirSync(practicesDir);
    const practicesFile = files.find(f => f.startsWith('practices') && f.endsWith('.md'));

    if (practicesFile) {
      return path.join(practicesDir, practicesFile);
    }

    return null;
  }

  /**
   * Extract numbered list items from markdown
   * Matches: 1. rule, 2. rule, etc.
   */
  private extractNumberedList(content: string): string[] {
    const rules: string[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      // Match numbered list: "1. Some rule text"
      const match = line.match(/^\s*(\d+)\.\s+(.+)$/);
      if (match) {
        const ruleText = match[2].trim();
        rules.push(ruleText);
      }
    }

    return rules;
  }

  /**
   * Format practices as prompt context for LLM
   */
  formatForPrompt(practices: PracticesFile): string {
    let prompt = `# Coding Practices (${practices.language})\n\n`;
    prompt += `**Format:** ${practices.format}\n\n`;
    prompt += `## Rules to Follow\n\n`;

    for (let i = 0; i < practices.rules.length; i++) {
      prompt += `${i + 1}. ${practices.rules[i]}\n`;
    }

    return prompt;
  }

  /**
   * Validate practices file structure
   */
  validate(practices: PracticesFile): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!practices.language) {
      errors.push('Missing language heading (first # heading)');
    }

    if (practices.rules.length === 0) {
      errors.push('No numbered rules found');
    }

    if (practices.rules.length < 5) {
      errors.push('Too few rules defined (minimum 5 expected)');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
