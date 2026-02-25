import * as fs from 'fs';
import * as path from 'path';
import { ContextBuilder, LLMContext } from './ContextBuilder';
import { RepoConfig } from './ConfigManager';

/**
 * Context aggregated across multiple repos
 */
export interface MultiRepoContext {
  repos: Array<{
    name: string;
    path: string;
    context: LLMContext;
  }>;
  sharedFiles: string[];        // Parent-level files (e.g., parent pom.xml)
  totalTokens: number;
  droppedRepos: string[];       // Repos excluded due to token budget
}

/**
 * Builds LLM context across multiple repositories in a monorepo/microservices setup.
 *
 * Strategy:
 * 1. Determine which repos are affected by the spec
 * 2. Build context for each affected repo using ContextBuilder
 * 3. Include parent-level shared files (parent pom.xml, shared configs)
 * 4. Balance token budget across repos
 */
export class MultiRepoContextBuilder {
  private readonly TOKEN_BUDGET = 150000; // Safe budget for Claude Sonnet
  private readonly RESPONSE_RESERVE = 50000;
  private readonly rootPath: string;
  private readonly repoConfigs: RepoConfig[];

  constructor(rootPath: string, repoConfigs: RepoConfig[]) {
    this.rootPath = rootPath;
    this.repoConfigs = repoConfigs;
  }

  /**
   * Build complete multi-repo context for a spec
   */
  async buildContext(
    specFilePath: string,
    globalContext?: string
  ): Promise<MultiRepoContext> {
    const specContent = fs.readFileSync(specFilePath, 'utf-8');
    const availableBudget = this.TOKEN_BUDGET - this.RESPONSE_RESERVE;

    // 1. Determine which repos are affected by the spec
    const affectedRepos = this.extractAffectedRepos(specContent);

    // 2. Load shared parent-level files
    const sharedFiles = this.loadSharedFiles();
    const sharedTokens = this.estimateTokens(sharedFiles.join('\n'));

    // 3. Calculate token budget per repo
    const repoCount = affectedRepos.length;
    const budgetPerRepo = Math.floor((availableBudget - sharedTokens) / Math.max(repoCount, 1));

    // 4. Build context for each affected repo
    const repoContexts: Array<{ name: string; path: string; context: LLMContext }> = [];
    const droppedRepos: string[] = [];

    for (const repoConfig of affectedRepos) {
      try {
        const repoPath = path.join(this.rootPath, repoConfig.path);
        const builder = new ContextBuilder(repoPath);

        // Build context with allocated budget
        const context = await builder.buildContext(
          specFilePath,
          repoConfig.language,
          globalContext
        );

        // Check if within budget
        if (context.totalTokens <= budgetPerRepo) {
          repoContexts.push({
            name: repoConfig.name,
            path: repoConfig.path,
            context
          });
        } else {
          droppedRepos.push(repoConfig.name);
        }
      } catch (error) {
        console.warn(`Failed to build context for repo ${repoConfig.name}:`, error);
        droppedRepos.push(repoConfig.name);
      }
    }

    const totalTokens = repoContexts.reduce((sum, r) => sum + r.context.totalTokens, 0) + sharedTokens;

    return {
      repos: repoContexts,
      sharedFiles,
      totalTokens,
      droppedRepos
    };
  }

  /**
   * Extract which repos are affected by the spec
   * Looks for:
   * - **Repos Affected:** repo1, repo2
   * - File paths that include repo names
   */
  private extractAffectedRepos(specContent: string): RepoConfig[] {
    const affected = new Set<string>();

    // 1. Check for explicit "Repos Affected" section
    const reposSection = specContent.match(/\*\*Repos Affected:\*\*\s*(.+)/i);
    if (reposSection) {
      const repoNames = reposSection[1].split(',').map(r => r.trim());
      repoNames.forEach(name => affected.add(name));
    }

    // 2. Check file paths that include repo names
    for (const repo of this.repoConfigs) {
      // Look for file paths like: repo-name/src/main/...
      const repoPattern = new RegExp(`${repo.path.replace(/\//g, '\\/')}\/`, 'i');
      if (repoPattern.test(specContent)) {
        affected.add(repo.name);
      }
    }

    // 3. If no repos explicitly mentioned, include all repos
    if (affected.size === 0) {
      return this.repoConfigs;
    }

    // Filter repo configs to only affected ones
    return this.repoConfigs.filter(r => affected.has(r.name));
  }

  /**
   * Load shared parent-level files (e.g., parent pom.xml, root configs)
   */
  private loadSharedFiles(): string[] {
    const sharedFiles: string[] = [];
    const sharedPaths = [
      'pom.xml',           // Parent Maven POM
      'build.gradle',      // Parent Gradle
      'package.json',      // Root package.json
      '.nvmrc',            // Node version
      '.java-version',     // Java version
      'settings.xml'       // Maven settings
    ];

    for (const filePath of sharedPaths) {
      const fullPath = path.join(this.rootPath, filePath);
      if (fs.existsSync(fullPath)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          sharedFiles.push(`# ${filePath}\n${content}`);
        } catch (error) {
          // Skip unreadable files
        }
      }
    }

    return sharedFiles;
  }

  /**
   * Estimate token count for text
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4); // Rough approximation: 1 token ≈ 4 chars
  }

  /**
   * Get auto-discovered watch paths for all repos
   * Returns paths like: repo1/src/**\/*.java, repo2/src/**\/*.ts
   */
  getAutoDiscoveredPaths(): string[] {
    const paths: string[] = [];

    for (const repo of this.repoConfigs) {
      const language = repo.language || this.detectLanguage(repo.path);

      // Add standard source paths based on language
      switch (language) {
        case 'java':
          paths.push(`${repo.path}/src/**/*.java`);
          break;
        case 'typescript':
        case 'javascript':
          paths.push(`${repo.path}/src/**/*.ts`);
          paths.push(`${repo.path}/src/**/*.tsx`);
          paths.push(`${repo.path}/src/**/*.js`);
          paths.push(`${repo.path}/src/**/*.jsx`);
          break;
        case 'python':
          paths.push(`${repo.path}/**/*.py`);
          break;
        default:
          // Generic: watch src/ directory
          paths.push(`${repo.path}/src/**/*`);
      }
    }

    return paths;
  }

  /**
   * Auto-detect language from repo structure
   */
  private detectLanguage(repoPath: string): string {
    const fullPath = path.join(this.rootPath, repoPath);

    if (fs.existsSync(path.join(fullPath, 'pom.xml'))) return 'java';
    if (fs.existsSync(path.join(fullPath, 'build.gradle'))) return 'java';
    if (fs.existsSync(path.join(fullPath, 'package.json'))) return 'typescript';
    if (fs.existsSync(path.join(fullPath, 'requirements.txt'))) return 'python';
    if (fs.existsSync(path.join(fullPath, 'go.mod'))) return 'go';

    return 'unknown';
  }
}
