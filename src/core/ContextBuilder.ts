import * as fs from 'fs';
import * as path from 'path';
import simpleGit, { SimpleGit } from 'simple-git';
import { ContextFileLoader } from './ContextFileLoader';

export interface FileContext {
  path: string;
  content: string;
  tokens: number; // Estimated token count
  priority: number; // 1-7 (higher = more important)
}

export interface LLMContext {
  specFile: string;
  specContent: string;
  files: FileContext[];
  practicesContent: string;
  globalContext?: string; // Jira-level context (3-4 lines)
  totalTokens: number;
  droppedFiles: string[]; // Files that couldn't fit in budget
}

/**
 * Builds optimized context for LLM prompts following token budget constraints.
 *
 * Priority Order (Section 15 of product spec):
 * 1. Spec file (always included)
 * 2. Directly changed files (git diff)
 * 3. Files named in spec
 * 4. Test files for changed code
 * 5. Practices file for detected language
 * 6. 1-level dependents
 * 7. Drop everything else
 */
export class ContextBuilder {
  private git: SimpleGit;
  private readonly TOKEN_BUDGET = 150000; // Safe budget for Claude Sonnet (200k max)
  private readonly RESPONSE_RESERVE = 50000; // Reserve for response
  private readonly CHARS_PER_TOKEN = 4; // Rough estimate: 1 token ≈ 4 chars

  constructor(private repoPath: string) {
    this.git = simpleGit(repoPath);
  }

  /**
   * Build complete LLM context with smart file selection
   */
  async buildContext(
    specFilePath: string,
    languageType?: string,
    globalContext?: string
  ): Promise<LLMContext> {
    const specContent = fs.readFileSync(specFilePath, 'utf-8');
    const availableBudget = this.TOKEN_BUDGET - this.RESPONSE_RESERVE;

    // Extract files mentioned in spec
    const specMentionedFiles = this.extractFilePaths(specContent);

    // Get git diff files (recently changed)
    const diffFiles = await this.getGitDiffFiles();

    // Get test files for changed code
    const testFiles = this.findTestFiles([...specMentionedFiles, ...diffFiles]);

    // Load practices file if language detected
    const practicesContent = languageType
      ? this.loadPracticesFile(languageType)
      : '';

    const practicesTokens = this.estimateTokens(practicesContent);
    const globalContextTokens = globalContext ? this.estimateTokens(globalContext) : 0;

    // Collect all file candidates with priorities
    const fileCandidates = await this.collectFileCandidates(
      specMentionedFiles,
      diffFiles,
      testFiles
    );

    // Select files within budget (account for practices + global context)
    const { selectedFiles, droppedFiles } = this.selectWithinBudget(
      fileCandidates,
      availableBudget - practicesTokens - globalContextTokens - this.estimateTokens(specContent)
    );

    return {
      specFile: path.basename(specFilePath),
      specContent,
      files: selectedFiles,
      practicesContent,
      globalContext,
      totalTokens: this.calculateTotalTokens(selectedFiles, specContent, practicesContent, globalContext),
      droppedFiles
    };
  }

  /**
   * Extract file paths mentioned in spec content
   */
  private extractFilePaths(specContent: string): string[] {
    const files: string[] = [];

    // Look for Java file patterns
    const javaPattern = /src\/(main|test)\/java\/[\w\/]+\.java/g;
    const javaMatches = specContent.match(javaPattern);
    if (javaMatches) files.push(...javaMatches);

    // Look for TypeScript/JavaScript patterns
    const tsPattern = /src\/[\w\/]+\.(ts|js|tsx|jsx)/g;
    const tsMatches = specContent.match(tsPattern);
    if (tsMatches) files.push(...tsMatches);

    // Look for Python patterns
    const pyPattern = /[\w\/]+\.py/g;
    const pyMatches = specContent.match(pyPattern);
    if (pyMatches) files.push(...pyMatches);

    // Look for "Files Likely Affected" section
    const affectedSection = specContent.match(/##\s*Files\s*Likely\s*Affected\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (affectedSection) {
      const lines = affectedSection[1].split('\n');
      for (const line of lines) {
        const match = line.match(/[-*]\s*(.+\.(java|ts|js|py|tsx|jsx))/);
        if (match) files.push(match[1].trim());
      }
    }

    return [...new Set(files)]; // Deduplicate
  }

  /**
   * Get files changed in git diff
   */
  private async getGitDiffFiles(): Promise<string[]> {
    try {
      const diff = await this.git.diff(['HEAD', '--name-only']);
      const stagedDiff = await this.git.diff(['--cached', '--name-only']);

      const allFiles = [...diff.split('\n'), ...stagedDiff.split('\n')]
        .filter(f => f.trim().length > 0)
        .filter(f => this.isSourceFile(f));

      return [...new Set(allFiles)];
    } catch (error) {
      // If git fails (not a repo, etc.), return empty
      return [];
    }
  }

  /**
   * Find test files for given source files
   */
  private findTestFiles(sourceFiles: string[]): string[] {
    const testFiles: string[] = [];

    for (const file of sourceFiles) {
      // Java: src/main/java/X.java → src/test/java/XTest.java
      if (file.includes('src/main/java/')) {
        const testFile = file
          .replace('src/main/java/', 'src/test/java/')
          .replace('.java', 'Test.java');
        if (fs.existsSync(path.join(this.repoPath, testFile))) {
          testFiles.push(testFile);
        }
      }

      // TypeScript: src/X.ts → src/X.test.ts
      if (file.match(/\.(ts|js)$/)) {
        const testFile = file.replace(/\.(ts|js)$/, '.test.$1');
        if (fs.existsSync(path.join(this.repoPath, testFile))) {
          testFiles.push(testFile);
        }
      }

      // Python: X.py → test_X.py or X_test.py
      if (file.endsWith('.py')) {
        const dir = path.dirname(file);
        const base = path.basename(file, '.py');
        const testFile1 = path.join(dir, `test_${base}.py`);
        const testFile2 = path.join(dir, `${base}_test.py`);

        if (fs.existsSync(path.join(this.repoPath, testFile1))) {
          testFiles.push(testFile1);
        } else if (fs.existsSync(path.join(this.repoPath, testFile2))) {
          testFiles.push(testFile2);
        }
      }
    }

    return testFiles;
  }

  /**
   * Load practices file for given language
   * Uses ContextFileLoader to check multiple sources in priority order:
   * 1. .myintern/practices/{language}.md
   * 2. CLAUDE.md
   * 3. .cursorrules
   * 4. .github/copilot-instructions.md
   */
  private loadPracticesFile(languageType: string): string {
    const contextLoader = new ContextFileLoader(this.repoPath);
    return contextLoader.loadMergedContext(languageType);
  }

  /**
   * Collect all file candidates with priorities
   */
  private async collectFileCandidates(
    specFiles: string[],
    diffFiles: string[],
    testFiles: string[]
  ): Promise<FileContext[]> {
    const candidates: FileContext[] = [];
    const seen = new Set<string>();

    // Helper to add file with priority
    const addFile = (filePath: string, priority: number) => {
      if (seen.has(filePath)) return;

      const fullPath = path.join(this.repoPath, filePath);
      if (!fs.existsSync(fullPath)) return;

      const content = fs.readFileSync(fullPath, 'utf-8');
      const tokens = this.estimateTokens(content);

      candidates.push({
        path: filePath,
        content,
        tokens,
        priority
      });

      seen.add(filePath);
    };

    // Priority 2: Directly changed files (git diff)
    for (const file of diffFiles) {
      addFile(file, 2);
    }

    // Priority 3: Files named in spec
    for (const file of specFiles) {
      addFile(file, 3);
    }

    // Priority 4: Test files
    for (const file of testFiles) {
      addFile(file, 4);
    }

    // Priority 6: Find 1-level dependents (imports of changed files)
    const dependents = await this.findDependents(diffFiles);
    for (const file of dependents) {
      addFile(file, 6);
    }

    return candidates;
  }

  /**
   * Find files that import/depend on the given files (1-level deep)
   */
  private async findDependents(files: string[]): Promise<string[]> {
    const dependents: string[] = [];

    // For each changed file, find what imports it
    for (const file of files) {
      const fileName = path.basename(file, path.extname(file));

      // Search for imports of this file
      try {
        const srcDirs = ['src/main/java', 'src/test/java', 'src', 'lib'];

        for (const srcDir of srcDirs) {
          const fullSrcDir = path.join(this.repoPath, srcDir);
          if (!fs.existsSync(fullSrcDir)) continue;

          const importers = this.searchForImports(fullSrcDir, fileName);
          dependents.push(...importers);
        }
      } catch (error) {
        // Skip if search fails
      }
    }

    return [...new Set(dependents)];
  }

  /**
   * Recursively search for files that import the given className
   */
  private searchForImports(dir: string, className: string): string[] {
    const results: string[] = [];

    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        results.push(...this.searchForImports(fullPath, className));
      } else if (this.isSourceFile(entry.name)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');

          // Check for Java imports
          if (content.match(new RegExp(`import\\s+.*\\.${className};`))) {
            results.push(path.relative(this.repoPath, fullPath));
          }

          // Check for TypeScript imports
          if (content.match(new RegExp(`import.*['"].*/${className}['"]`))) {
            results.push(path.relative(this.repoPath, fullPath));
          }

          // Check for Python imports
          if (content.match(new RegExp(`from.*import.*${className}`))) {
            results.push(path.relative(this.repoPath, fullPath));
          }
        } catch (error) {
          // Skip unreadable files
        }
      }
    }

    return results;
  }

  /**
   * Select files within token budget, prioritizing by importance
   */
  private selectWithinBudget(
    candidates: FileContext[],
    budget: number
  ): { selectedFiles: FileContext[]; droppedFiles: string[] } {
    // Sort by priority (lower number = higher priority)
    const sorted = [...candidates].sort((a, b) => a.priority - b.priority);

    const selectedFiles: FileContext[] = [];
    const droppedFiles: string[] = [];
    let currentTokens = 0;

    for (const file of sorted) {
      if (currentTokens + file.tokens <= budget) {
        selectedFiles.push(file);
        currentTokens += file.tokens;
      } else {
        droppedFiles.push(file.path);
      }
    }

    return { selectedFiles, droppedFiles };
  }

  /**
   * Estimate token count for text (rough approximation)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / this.CHARS_PER_TOKEN);
  }

  /**
   * Calculate total tokens in context
   */
  private calculateTotalTokens(
    files: FileContext[],
    specContent: string,
    practicesContent: string,
    globalContext?: string
  ): number {
    const fileTokens = files.reduce((sum, f) => sum + f.tokens, 0);
    const globalTokens = globalContext ? this.estimateTokens(globalContext) : 0;
    return fileTokens + this.estimateTokens(specContent) + this.estimateTokens(practicesContent) + globalTokens;
  }

  /**
   * Check if file is a source file we care about
   */
  private isSourceFile(fileName: string): boolean {
    return fileName.match(/\.(java|ts|js|tsx|jsx|py)$/) !== null;
  }
}
