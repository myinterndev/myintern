import * as fs from 'fs';
import * as path from 'path';

/**
 * Context file with metadata
 */
export interface ContextFile {
  filePath: string;
  content: string;
  source: 'myintern' | 'claude' | 'cursor' | 'copilot' | 'none';
  priority: number; // 1 = highest priority
}

/**
 * Loads context files following priority order from CLAUDE.md Section 17
 *
 * Priority Order (merge all that exist):
 * 1. .myintern/practices/{language}.md ← highest priority (explicit team standards)
 * 2. CLAUDE.md ← Anthropic convention
 * 3. .cursorrules ← Cursor users
 * 4. .github/copilot-instructions.md ← GitHub Copilot users
 * 5. .myintern/agent.yml ← pipeline config (handled separately)
 * 6. spec file ← task definition (handled separately)
 * 7. git diff + affected files ← code context (handled separately)
 *
 * This enables zero-migration adoption: clients using Claude Code, Cursor, or
 * Copilot can use MyIntern immediately without creating .myintern/practices files.
 */
export class ContextFileLoader {
  constructor(private projectRoot: string) {}

  /**
   * Load all available context files in priority order
   * Returns merged content with highest priority files taking precedence
   */
  loadContextFiles(language?: string): ContextFile[] {
    const contextFiles: ContextFile[] = [];

    // Priority 1: .myintern/practices/{language}.md
    if (language) {
      const myinternPractices = this.loadMyInternPractices(language);
      if (myinternPractices) {
        contextFiles.push(myinternPractices);
      }
    }

    // Priority 2: CLAUDE.md (root or .claude/)
    const claudeMd = this.loadClaudeMd();
    if (claudeMd) {
      contextFiles.push(claudeMd);
    }

    // Priority 3: .cursorrules
    const cursorRules = this.loadCursorRules();
    if (cursorRules) {
      contextFiles.push(cursorRules);
    }

    // Priority 4: .github/copilot-instructions.md
    const copilotInstructions = this.loadCopilotInstructions();
    if (copilotInstructions) {
      contextFiles.push(copilotInstructions);
    }

    return contextFiles;
  }

  /**
   * Load and merge all context files into single string
   * Returns merged content with source attribution
   */
  loadMergedContext(language?: string): string {
    const contextFiles = this.loadContextFiles(language);

    if (contextFiles.length === 0) {
      return '';
    }

    let merged = '';

    for (const file of contextFiles) {
      merged += `\n# Context from ${this.getSourceLabel(file.source)} (${path.basename(file.filePath)})\n\n`;
      merged += file.content;
      merged += '\n\n---\n';
    }

    return merged;
  }

  /**
   * Get human-readable label for context source
   */
  private getSourceLabel(source: ContextFile['source']): string {
    switch (source) {
      case 'myintern': return 'MyIntern Team Standards';
      case 'claude': return 'Claude Code Instructions';
      case 'cursor': return 'Cursor Rules';
      case 'copilot': return 'GitHub Copilot Instructions';
      default: return 'Unknown Source';
    }
  }

  /**
   * Priority 1: Load .myintern/practices/{language}.md
   */
  private loadMyInternPractices(language: string): ContextFile | null {
    const practicesPath = path.join(
      this.projectRoot,
      '.myintern',
      'practices',
      `${language.toLowerCase()}.md`
    );

    if (fs.existsSync(practicesPath)) {
      return {
        filePath: practicesPath,
        content: fs.readFileSync(practicesPath, 'utf-8'),
        source: 'myintern',
        priority: 1
      };
    }

    return null;
  }

  /**
   * Priority 2: Load CLAUDE.md (check both root and .claude/)
   */
  private loadClaudeMd(): ContextFile | null {
    // Check .claude/CLAUDE.md first (new convention)
    const claudeDir = path.join(this.projectRoot, '.claude', 'CLAUDE.md');
    if (fs.existsSync(claudeDir)) {
      return {
        filePath: claudeDir,
        content: fs.readFileSync(claudeDir, 'utf-8'),
        source: 'claude',
        priority: 2
      };
    }

    // Fallback to root CLAUDE.md
    const claudeRoot = path.join(this.projectRoot, 'CLAUDE.md');
    if (fs.existsSync(claudeRoot)) {
      return {
        filePath: claudeRoot,
        content: fs.readFileSync(claudeRoot, 'utf-8'),
        source: 'claude',
        priority: 2
      };
    }

    return null;
  }

  /**
   * Priority 3: Load .cursorrules
   */
  private loadCursorRules(): ContextFile | null {
    const cursorPath = path.join(this.projectRoot, '.cursorrules');

    if (fs.existsSync(cursorPath)) {
      return {
        filePath: cursorPath,
        content: fs.readFileSync(cursorPath, 'utf-8'),
        source: 'cursor',
        priority: 3
      };
    }

    return null;
  }

  /**
   * Priority 4: Load .github/copilot-instructions.md
   */
  private loadCopilotInstructions(): ContextFile | null {
    const copilotPath = path.join(
      this.projectRoot,
      '.github',
      'copilot-instructions.md'
    );

    if (fs.existsSync(copilotPath)) {
      return {
        filePath: copilotPath,
        content: fs.readFileSync(copilotPath, 'utf-8'),
        source: 'copilot',
        priority: 4
      };
    }

    return null;
  }

  /**
   * Check if any context files exist (useful for zero-config mode)
   */
  hasAnyContextFiles(language?: string): boolean {
    return this.loadContextFiles(language).length > 0;
  }

  /**
   * Get summary of available context files
   */
  getContextSummary(language?: string): { source: string; path: string }[] {
    const contextFiles = this.loadContextFiles(language);
    return contextFiles.map(file => ({
      source: this.getSourceLabel(file.source),
      path: path.relative(this.projectRoot, file.filePath)
    }));
  }
}
