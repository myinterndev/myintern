import * as fs from 'fs';
import * as path from 'path';
import { Octokit } from '@octokit/rest';
import chalk from 'chalk';

/**
 * GitHubIssueSync - Sync GitHub Issues to MyIntern specs
 * Monitors issues with specific labels and assigned users, converts to specs
 */
export class GitHubIssueSync {
  private octokit: Octokit;
  private repoPath: string;
  private owner: string;
  private repo: string;
  private configFile: string;

  constructor(repoPath: string, token: string) {
    this.repoPath = repoPath;
    this.octokit = new Octokit({ auth: token });
    this.configFile = path.join(repoPath, '.myintern', 'github-sync.json');

    // Parse repo from git remote
    const repoInfo = this.parseRepoInfo();
    this.owner = repoInfo.owner;
    this.repo = repoInfo.repo;
  }

  /**
   * Sync issues based on configuration
   */
  async sync(options: {
    labels?: string[]; // Filter by labels (e.g., ['myintern', 'enhancement'])
    assignedTo?: string; // Filter by assignee
    state?: 'open' | 'closed' | 'all';
    autoGenerate?: boolean; // Auto-generate specs for new issues
  } = {}): Promise<{
    synced: number;
    created: number;
    updated: number;
    errors: string[];
  }> {
    console.log(chalk.blue('\n🔄 GitHub Issues Sync\n'));

    const state = options.state || 'open';
    const labels = options.labels || ['myintern'];

    console.log(chalk.gray(`   Repository: ${this.owner}/${this.repo}`));
    console.log(chalk.gray(`   Labels: ${labels.join(', ')}`));
    console.log(chalk.gray(`   State: ${state}`));
    if (options.assignedTo) {
      console.log(chalk.gray(`   Assigned to: ${options.assignedTo}`));
    }
    console.log();

    const results = {
      synced: 0,
      created: 0,
      updated: 0,
      errors: [] as string[]
    };

    try {
      // Fetch issues
      const issues = await this.fetchIssues(labels, state, options.assignedTo);

      console.log(chalk.blue(`   Found ${issues.length} issue(s)\n`));

      for (const issue of issues) {
        try {
          const result = await this.syncIssue(issue, options.autoGenerate);

          if (result === 'created') {
            results.created++;
          } else if (result === 'updated') {
            results.updated++;
          }

          results.synced++;
        } catch (error: any) {
          results.errors.push(`Issue #${issue.number}: ${error.message}`);
        }
      }

      // Display summary
      console.log(chalk.blue('\n📊 Sync Summary:\n'));
      console.log(chalk.green(`   ✓ ${results.synced} issue(s) synced`));
      console.log(chalk.green(`   ✓ ${results.created} spec(s) created`));
      console.log(chalk.green(`   ✓ ${results.updated} spec(s) updated`));

      if (results.errors.length > 0) {
        console.log(chalk.red(`   ✗ ${results.errors.length} error(s)`));
        results.errors.forEach(err => console.log(chalk.red(`      - ${err}`)));
      }

      console.log();

      // Save sync state
      this.saveSyncState(issues);

      return results;
    } catch (error: any) {
      console.log(chalk.red(`\n❌ Sync failed: ${error.message}\n`));
      results.errors.push(error.message);
      return results;
    }
  }

  /**
   * Sync a single issue
   */
  private async syncIssue(issue: any, autoGenerate: boolean = false): Promise<'created' | 'updated' | 'skipped'> {
    const specPath = this.getSpecPath(issue);

    // Check if spec already exists
    const exists = fs.existsSync(specPath);

    // Convert issue to spec format
    const specContent = this.issueToSpec(issue);

    if (exists) {
      // Update existing spec
      const existingContent = fs.readFileSync(specPath, 'utf-8');

      // Only update if content changed
      if (existingContent !== specContent) {
        fs.writeFileSync(specPath, specContent, 'utf-8');
        console.log(chalk.yellow(`   ✏️  Updated: spec-gh-${issue.number}.md`));
        return 'updated';
      }

      return 'skipped';
    } else {
      // Create new spec
      const specsDir = path.join(this.repoPath, '.myintern', 'specs');
      if (!fs.existsSync(specsDir)) {
        fs.mkdirSync(specsDir, { recursive: true });
      }

      fs.writeFileSync(specPath, specContent, 'utf-8');
      console.log(chalk.green(`   📝 Created: spec-gh-${issue.number}.md`));

      return 'created';
    }
  }

  /**
   * Convert GitHub issue to MyIntern spec
   */
  private issueToSpec(issue: any): string {
    const labels = issue.labels.map((l: any) => l.name);
    const type = this.inferType(labels);
    const priority = this.inferPriority(labels);

    let spec = `# FEATURE: ${issue.title}\n\n`;
    spec += `**GitHub Issue:** #${issue.number}\n`;
    spec += `**Type:** ${type}\n`;
    spec += `**Priority:** ${priority}\n`;
    spec += `**Status:** ${issue.state}\n`;

    if (issue.assignees && issue.assignees.length > 0) {
      spec += `**Assignees:** ${issue.assignees.map((a: any) => `@${a.login}`).join(', ')}\n`;
    }

    spec += `\n## Description\n\n`;
    spec += `${issue.body || 'No description provided'}\n\n`;

    // Parse acceptance criteria from issue body
    const acceptanceCriteria = this.extractAcceptanceCriteria(issue.body || '');
    if (acceptanceCriteria.length > 0) {
      spec += `## Acceptance Criteria\n\n`;
      acceptanceCriteria.forEach(criterion => {
        spec += `- ${criterion}\n`;
      });
      spec += `\n`;
    }

    // Extract file mentions from issue body
    const fileMentions = this.extractFileMentions(issue.body || '');
    if (fileMentions.length > 0) {
      spec += `## Files Likely Affected\n\n`;
      fileMentions.forEach(file => {
        spec += `- ${file}\n`;
      });
      spec += `\n`;
    }

    // Add issue metadata
    spec += `## Issue Metadata\n\n`;
    spec += `- **Issue URL:** ${issue.html_url}\n`;
    spec += `- **Created:** ${issue.created_at}\n`;
    spec += `- **Updated:** ${issue.updated_at}\n`;
    spec += `- **Labels:** ${labels.join(', ')}\n`;

    return spec;
  }

  /**
   * Infer spec type from labels
   */
  private inferType(labels: string[]): string {
    const typeMap: Record<string, string> = {
      'bug': 'bugfix',
      'enhancement': 'feature',
      'feature': 'feature',
      'documentation': 'docs',
      'refactor': 'refactor',
      'test': 'test'
    };

    for (const label of labels) {
      const type = typeMap[label.toLowerCase()];
      if (type) return type;
    }

    return 'feature';
  }

  /**
   * Infer priority from labels
   */
  private inferPriority(labels: string[]): string {
    const priorityMap: Record<string, string> = {
      'critical': 'critical',
      'high': 'high',
      'medium': 'medium',
      'low': 'low',
      'p0': 'critical',
      'p1': 'high',
      'p2': 'medium',
      'p3': 'low'
    };

    for (const label of labels) {
      const priority = priorityMap[label.toLowerCase()];
      if (priority) return priority;
    }

    return 'medium';
  }

  /**
   * Extract acceptance criteria from issue body
   */
  private extractAcceptanceCriteria(body: string): string[] {
    const criteria: string[] = [];

    // Look for "Acceptance Criteria" section
    const acMatch = body.match(/## Acceptance Criteria\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (acMatch) {
      const acSection = acMatch[1];
      const lines = acSection.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('-') || trimmed.startsWith('*') || trimmed.match(/^\d+\./)) {
          criteria.push(trimmed.replace(/^[-*\d.]+\s*/, ''));
        }
      }
    }

    // Fallback: look for checklist items
    if (criteria.length === 0) {
      const checkboxMatches = body.matchAll(/- \[[ x]\] (.+)/gi);
      for (const match of checkboxMatches) {
        criteria.push(match[1]);
      }
    }

    return criteria;
  }

  /**
   * Extract file mentions from issue body
   */
  private extractFileMentions(body: string): string[] {
    const files: string[] = [];

    // Look for code references to files
    const fileMatches = body.matchAll(/`([^`]+\.java)`/g);
    for (const match of fileMatches) {
      files.push(match[1]);
    }

    // Look for file paths
    const pathMatches = body.matchAll(/src\/[a-zA-Z0-9/_]+\.java/g);
    for (const match of pathMatches) {
      if (!files.includes(match[0])) {
        files.push(match[0]);
      }
    }

    return files;
  }

  /**
   * Get spec file path for issue
   */
  private getSpecPath(issue: any): string {
    return path.join(this.repoPath, '.myintern', 'specs', `spec-gh-${issue.number}.md`);
  }

  /**
   * Fetch issues from GitHub
   */
  private async fetchIssues(labels: string[], state: string, assignedTo?: string): Promise<any[]> {
    const params: any = {
      owner: this.owner,
      repo: this.repo,
      state,
      labels: labels.join(','),
      per_page: 100
    };

    if (assignedTo) {
      params.assignee = assignedTo;
    }

    const response = await this.octokit.issues.listForRepo(params);

    return response.data;
  }

  /**
   * Parse repo info from git remote
   */
  private parseRepoInfo(): { owner: string; repo: string } {
    try {
      const { execSync } = require('child_process');
      const remoteUrl = execSync('git remote get-url origin', {
        cwd: this.repoPath,
        encoding: 'utf-8'
      }).trim();

      // Parse owner/repo from URL
      // Support both HTTPS and SSH formats
      const match = remoteUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);

      if (match) {
        return {
          owner: match[1],
          repo: match[2]
        };
      }

      throw new Error('Could not parse GitHub repo from remote URL');
    } catch (error) {
      throw new Error('Not a GitHub repository or no remote configured');
    }
  }

  /**
   * Save sync state for tracking
   */
  private saveSyncState(issues: any[]): void {
    const state = {
      lastSync: new Date().toISOString(),
      issues: issues.map(i => ({
        number: i.number,
        title: i.title,
        state: i.state,
        updated_at: i.updated_at
      }))
    };

    const dir = path.dirname(this.configFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.configFile, JSON.stringify(state, null, 2), 'utf-8');
  }

  /**
   * Close issue when spec is completed
   */
  async closeIssue(issueNumber: number, comment?: string): Promise<void> {
    try {
      // Add comment
      if (comment) {
        await this.octokit.issues.createComment({
          owner: this.owner,
          repo: this.repo,
          issue_number: issueNumber,
          body: comment
        });
      }

      // Close issue
      await this.octokit.issues.update({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        state: 'closed'
      });

      console.log(chalk.green(`✅ Closed GitHub issue #${issueNumber}`));
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to close issue #${issueNumber}: ${error.message}`));
    }
  }

  /**
   * Add label to issue
   */
  async addLabel(issueNumber: number, label: string): Promise<void> {
    try {
      await this.octokit.issues.addLabels({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        labels: [label]
      });

      console.log(chalk.green(`✅ Added label "${label}" to issue #${issueNumber}`));
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to add label: ${error.message}`));
    }
  }
}
