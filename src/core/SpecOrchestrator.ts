import * as fs from 'fs';
import * as path from 'path';
import { SpecFile, SpecParser } from './SpecParser';
import { SemanticConflictDetector } from './SemanticConflictDetector';

/**
 * Global context for a Jira ticket (stored in hidden .context folder)
 */
export interface JiraContext {
  jiraTicket: string;
  summary: string; // 3-4 line summary from first spec
  context: string; // Accumulated understanding across specs
  specs: string[]; // List of spec file names
  lastUpdated: string;
  status: 'pending' | 'in_progress' | 'completed';
}

/**
 * Group of related specs for a Jira ticket
 */
export interface SpecGroup {
  jiraTicket: string;
  specs: SpecFile[];
  globalContext: JiraContext | null;
  conflictingFiles?: Set<string>; // Files that conflict across specs
  canRunParallel: boolean;        // Safe to run in parallel with other groups
}

/**
 * Execution plan for processing specs
 */
export interface ExecutionPlan {
  parallelGroups: SpecGroup[][];  // Groups that can run in parallel
  sequentialGroups: SpecGroup[];   // Groups that must run sequentially
  warnings: string[];              // Warnings about conflicts or missing Jira tickets
}

/**
 * Orchestrates multiple specs per Jira ticket and manages persistent global context.
 *
 * Key responsibilities:
 * 1. Group specs by Jira ticket
 * 2. Maintain hidden global context (.myintern/.context/)
 * 3. Provide combined context for code generation
 * 4. Track progress across related specs
 */
export class SpecOrchestrator {
  private readonly contextDir: string;
  private readonly contextFile: string;
  private readonly parser: SpecParser;

  constructor(private repoPath: string) {
    this.contextDir = path.join(repoPath, '.myintern', '.context');
    this.contextFile = path.join(this.contextDir, 'global-context.json');
    this.parser = new SpecParser(); // Reuse single parser instance with cache

    // Ensure hidden context directory exists
    if (!fs.existsSync(this.contextDir)) {
      fs.mkdirSync(this.contextDir, { recursive: true });
    }

    // Add .gitignore to prevent committing context
    const gitignorePath = path.join(this.contextDir, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(gitignorePath, '*\n!.gitignore\n', 'utf-8');
    }
  }

  /**
   * Invalidate cache for a spec file that changed
   * Call this when a spec file is modified
   *
   * @param filePath Absolute path to spec file
   */
  invalidateSpecCache(filePath: string): void {
    this.parser.invalidateCache(filePath);
  }

  /**
   * Get parser cache statistics
   * Useful for monitoring performance
   */
  getCacheStats(): { hits: number; misses: number; hitRate: number; size: number } {
    return this.parser.getCacheStats();
  }

  /**
   * Load all specs from .myintern/specs/ directory
   */
  loadAllSpecs(): SpecFile[] {
    const specsDir = path.join(this.repoPath, '.myintern', 'specs');

    if (!fs.existsSync(specsDir)) {
      return [];
    }

    const files = fs.readdirSync(specsDir)
      .filter(f => f.endsWith('.md') && f.startsWith('spec-'))
      .map(f => path.join(specsDir, f));

    return files.map(f => this.parser.parse(f));
  }

  /**
   * Detect file conflicts within a single group of specs
   * Returns the set of files that appear in multiple specs (potential conflicts)
   */
  private detectConflictsWithinGroup(specs: SpecFile[]): Set<string> {
    const fileCount = new Map<string, number>();
    const conflicts = new Set<string>();

    for (const spec of specs) {
      if (!spec.filesAffected) continue;

      for (const file of spec.filesAffected) {
        const normalizedFile = this.normalizeFilePath(file);
        const count = (fileCount.get(normalizedFile) || 0) + 1;
        fileCount.set(normalizedFile, count);

        if (count > 1) {
          conflicts.add(normalizedFile);
        }
      }
    }

    return conflicts;
  }

  /**
   * Detect file conflicts across multiple groups
   * Returns pairs of groups that have overlapping files
   *
   * ENHANCED in v1.2: Now uses SemanticConflictDetector for method-level detection
   */
  private async detectConflictsBetweenGroups(groups: SpecGroup[]): Promise<Map<SpecGroup, Set<SpecGroup>>> {
    const conflictMap = new Map<SpecGroup, Set<SpecGroup>>();
    const semanticDetector = new SemanticConflictDetector(this.repoPath);

    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const groupA = groups[i];
        const groupB = groups[j];

        const filesA = this.getAllFilesFromGroup(groupA);
        const filesB = this.getAllFilesFromGroup(groupB);

        // Check for overlapping files (basic file-level detection)
        const hasConflict = Array.from(filesA).some((file: string) => filesB.has(file));

        if (hasConflict) {
          // Use semantic conflict detector for deeper analysis
          const allSpecs = [...groupA.specs, ...groupB.specs];
          const semanticConflicts = await semanticDetector.detectConflicts(allSpecs);

          // Only mark as conflict if semantic conflicts detected
          if (semanticConflicts.length > 0) {
            if (!conflictMap.has(groupA)) {
              conflictMap.set(groupA, new Set());
            }
            if (!conflictMap.has(groupB)) {
              conflictMap.set(groupB, new Set());
            }

            conflictMap.get(groupA)!.add(groupB);
            conflictMap.get(groupB)!.add(groupA);
          }
        }
      }
    }

    return conflictMap;
  }

  /**
   * Get all files affected by specs in a group
   */
  private getAllFilesFromGroup(group: SpecGroup): Set<string> {
    const files = new Set<string>();

    for (const spec of group.specs) {
      if (!spec.filesAffected) continue;

      for (const file of spec.filesAffected) {
        files.add(this.normalizeFilePath(file));
      }
    }

    return files;
  }

  /**
   * Normalize file paths for comparison
   * Removes leading slashes, src/ prefix variations, etc.
   */
  private normalizeFilePath(filePath: string): string {
    return filePath
      .replace(/^\/+/, '')
      .replace(/^src\/main\/java\//, '')
      .replace(/^src\/test\/java\//, '')
      .toLowerCase();
  }

  /**
   * Group specs by Jira ticket
   * Specs without Jira tickets are grouped individually
   */
  groupSpecsByJira(specs: SpecFile[]): SpecGroup[] {
    const groups = new Map<string, SpecFile[]>();

    for (const spec of specs) {
      const key = spec.jiraTicket || `no-jira-${path.basename(spec.filePath)}`;

      if (!groups.has(key)) {
        groups.set(key, []);
      }

      groups.get(key)!.push(spec);
    }

    return Array.from(groups.entries()).map(([jiraTicket, groupSpecs]) => {
      const conflictingFiles = this.detectConflictsWithinGroup(groupSpecs);
      return {
        jiraTicket,
        specs: groupSpecs,
        globalContext: this.loadGlobalContext(jiraTicket),
        conflictingFiles,
        canRunParallel: conflictingFiles.size === 0 // No internal conflicts
      };
    });
  }

  /**
   * Find all specs related to a specific Jira ticket
   */
  findSpecsByJira(jiraTicket: string): SpecGroup | null {
    const allSpecs = this.loadAllSpecs();
    const relatedSpecs = allSpecs.filter(s => s.jiraTicket === jiraTicket);

    if (relatedSpecs.length === 0) {
      return null;
    }

    const conflictingFiles = this.detectConflictsWithinGroup(relatedSpecs);

    return {
      jiraTicket,
      specs: relatedSpecs,
      globalContext: this.loadGlobalContext(jiraTicket),
      conflictingFiles,
      canRunParallel: conflictingFiles.size === 0
    };
  }

  /**
   * Get or create global context for a Jira ticket
   */
  getOrCreateGlobalContext(spec: SpecFile): JiraContext {
    if (!spec.jiraTicket) {
      // No Jira ticket - create ephemeral context
      return {
        jiraTicket: 'none',
        summary: this.extractSummary(spec),
        context: spec.description,
        specs: [path.basename(spec.filePath)],
        lastUpdated: new Date().toISOString(),
        status: 'in_progress'
      };
    }

    const existing = this.loadGlobalContext(spec.jiraTicket);

    if (existing) {
      // Update existing context
      return this.updateGlobalContext(existing, spec);
    }

    // Create new context
    return {
      jiraTicket: spec.jiraTicket,
      summary: this.extractSummary(spec),
      context: spec.description,
      specs: [path.basename(spec.filePath)],
      lastUpdated: new Date().toISOString(),
      status: 'in_progress'
    };
  }

  /**
   * Update global context with new spec
   */
  private updateGlobalContext(existing: JiraContext, newSpec: SpecFile): JiraContext {
    const specFileName = path.basename(newSpec.filePath);

    // Add spec to list if not already present
    if (!existing.specs.includes(specFileName)) {
      existing.specs.push(specFileName);
    }

    // Append new context (keep it concise - 3-4 lines max per spec)
    const newContext = this.extractSummary(newSpec);
    if (!existing.context.includes(newContext)) {
      existing.context += `\n\n${specFileName}:\n${newContext}`;
    }

    existing.lastUpdated = new Date().toISOString();

    return existing;
  }

  /**
   * Extract 3-4 line summary from spec
   */
  private extractSummary(spec: SpecFile): string {
    const lines: string[] = [];

    // Title
    lines.push(spec.title);

    // Description (first 2 lines)
    const descLines = spec.description.split('\n').filter(l => l.trim().length > 0);
    lines.push(...descLines.slice(0, 2));

    // Key acceptance criteria (1 line)
    if (spec.acceptanceCriteria.length > 0) {
      lines.push(`AC: ${spec.acceptanceCriteria[0]}`);
    }

    return lines.join('\n');
  }

  /**
   * Save global context to hidden storage
   */
  saveGlobalContext(context: JiraContext): void {
    if (context.jiraTicket === 'none') {
      // Don't persist ephemeral contexts
      return;
    }

    const allContexts = this.loadAllContexts();
    allContexts[context.jiraTicket] = context;

    fs.writeFileSync(this.contextFile, JSON.stringify(allContexts, null, 2), 'utf-8');
  }

  /**
   * Load global context for specific Jira ticket
   */
  private loadGlobalContext(jiraTicket: string): JiraContext | null {
    const allContexts = this.loadAllContexts();
    return allContexts[jiraTicket] || null;
  }

  /**
   * Load all global contexts from hidden storage
   */
  private loadAllContexts(): Record<string, JiraContext> {
    if (!fs.existsSync(this.contextFile)) {
      return {};
    }

    try {
      const content = fs.readFileSync(this.contextFile, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      // If file is corrupted, start fresh
      return {};
    }
  }

  /**
   * Mark Jira context as completed
   */
  markCompleted(jiraTicket: string): void {
    const context = this.loadGlobalContext(jiraTicket);

    if (context) {
      context.status = 'completed';
      context.lastUpdated = new Date().toISOString();
      this.saveGlobalContext(context);
    }
  }

  /**
   * Get pending specs (have TODO/PENDING markers)
   */
  getPendingSpecs(): SpecFile[] {
    const allSpecs = this.loadAllSpecs();
    return allSpecs.filter(spec => this.parser.hasPendingWork(spec));
  }

  /**
   * Format global context for LLM prompt (concise)
   */
  formatGlobalContextForPrompt(context: JiraContext | null): string {
    if (!context) {
      return '';
    }

    return `## Jira Context: ${context.jiraTicket}

${context.context}

**Related specs:** ${context.specs.join(', ')}
**Last updated:** ${new Date(context.lastUpdated).toLocaleString()}
`;
  }

  /**
   * Get statistics for status reporting
   */
  getStats(): {
    totalSpecs: number;
    pendingSpecs: number;
    jiraTickets: number;
    completedJiras: number;
  } {
    const allSpecs = this.loadAllSpecs();
    const pendingSpecs = this.getPendingSpecs();
    const allContexts = this.loadAllContexts();
    const completedJiras = Object.values(allContexts).filter(c => c.status === 'completed').length;

    return {
      totalSpecs: allSpecs.length,
      pendingSpecs: pendingSpecs.length,
      jiraTickets: Object.keys(allContexts).length,
      completedJiras
    };
  }

  /**
   * Create execution plan for processing specs with conflict detection
   *
   * @param specs - Specs to process
   * @param maxParallel - Maximum number of parallel executions (from config)
   * @returns ExecutionPlan with parallel batches and warnings
   */
  async createExecutionPlan(specs: SpecFile[], maxParallel: number = 3): Promise<ExecutionPlan> {
    const warnings: string[] = [];
    const groups = this.groupSpecsByJira(specs);

    // Count specs without Jira tickets
    const noJiraCount = groups.filter(g => g.jiraTicket.startsWith('no-jira-')).length;

    // Warn if too many specs without Jira grouping
    if (noJiraCount > 5) {
      warnings.push(
        `⚠️  Found ${noJiraCount} specs without Jira tickets.\n` +
        `💡 Recommendation: Group related specs with Jira tickets to improve coordination.\n` +
        `   Example: Add "**Jira:** PROJ-123" to related spec files.\n` +
        `   Run 'myintern init --github' to auto-sync from GitHub Issues.`
      );
    }

    // Detect conflicts between groups (with semantic analysis)
    const conflictMap = await this.detectConflictsBetweenGroups(groups);

    // Separate groups with and without conflicts
    const conflictingGroups = Array.from(conflictMap.keys());
    const independentGroups = groups.filter(g => !conflictMap.has(g));

    // Create parallel batches for independent groups
    const parallelGroups: SpecGroup[][] = [];
    for (let i = 0; i < independentGroups.length; i += maxParallel) {
      parallelGroups.push(independentGroups.slice(i, i + maxParallel));
    }

    // Sequential groups: handle conflicts
    const sequentialGroups: SpecGroup[] = [];

    // Build dependency chains for conflicting groups
    const processed = new Set<SpecGroup>();

    for (const group of conflictingGroups) {
      if (processed.has(group)) continue;

      // Add this group and all its conflicts in order
      const chain = this.buildConflictChain(group, conflictMap, processed);
      sequentialGroups.push(...chain);

      // Warn about the conflict
      if (chain.length > 1) {
        const fileConflicts = this.findConflictingFilesBetweenGroups(chain);
        warnings.push(
          `⚠️  File conflicts detected between ${chain.length} spec groups:\n` +
          `   Groups: ${chain.map(g => g.jiraTicket).join(', ')}\n` +
          `   Conflicting files: ${Array.from(fileConflicts).join(', ')}\n` +
          `   → These will run sequentially to avoid conflicts.`
        );
      }
    }

    // Warn about specs with internal conflicts (multiple specs in same group touch same files)
    for (const group of groups) {
      if (group.conflictingFiles && group.conflictingFiles.size > 0) {
        warnings.push(
          `⚠️  Internal conflicts in Jira group ${group.jiraTicket}:\n` +
          `   ${group.specs.length} specs modify the same files: ${Array.from(group.conflictingFiles).join(', ')}\n` +
          `   → Specs within this group will run sequentially.`
        );
      }
    }

    return {
      parallelGroups,
      sequentialGroups,
      warnings
    };
  }

  /**
   * Build a chain of groups that have conflicts with each other
   */
  private buildConflictChain(
    startGroup: SpecGroup,
    conflictMap: Map<SpecGroup, Set<SpecGroup>>,
    processed: Set<SpecGroup>
  ): SpecGroup[] {
    const chain: SpecGroup[] = [];
    const queue = [startGroup];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (processed.has(current)) continue;

      processed.add(current);
      chain.push(current);

      // Add conflicting groups to queue
      const conflicts = conflictMap.get(current);
      if (conflicts) {
        for (const conflict of conflicts) {
          if (!processed.has(conflict)) {
            queue.push(conflict);
          }
        }
      }
    }

    return chain;
  }

  /**
   * Find all files that conflict between a chain of groups
   */
  private findConflictingFilesBetweenGroups(groups: SpecGroup[]): Set<string> {
    const allFiles = new Map<string, number>();
    const conflicts = new Set<string>();

    for (const group of groups) {
      const groupFiles = this.getAllFilesFromGroup(group);

      for (const file of groupFiles) {
        const count = (allFiles.get(file) || 0) + 1;
        allFiles.set(file, count);

        if (count > 1) {
          conflicts.add(file);
        }
      }
    }

    return conflicts;
  }
}
