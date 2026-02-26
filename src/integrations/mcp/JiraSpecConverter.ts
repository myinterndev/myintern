import * as fs from 'fs';
import * as path from 'path';
import { JiraIssue } from './JiraMCPClient';

/**
 * Converts Jira issues to MyIntern spec files
 */
export class JiraSpecConverter {
  private specsDir: string;

  constructor(projectRoot: string = process.cwd()) {
    this.specsDir = path.join(projectRoot, '.myintern', 'specs');
  }

  /**
   * Convert Jira issue to MyIntern spec markdown
   */
  convertToSpec(issue: JiraIssue): string {
    const { key, summary, description, issueType, priority, labels, projectKey } = issue;

    // Clean up description (remove Jira-specific formatting)
    const cleanDescription = this.cleanJiraMarkdown(description || 'No description provided');

    // Generate spec content
    const spec = `# ${issueType.toUpperCase()}: ${summary}

**Jira:** ${key}
**Type:** ${issueType.toLowerCase()}
**Priority:** ${priority.toLowerCase()}
${labels.length > 0 ? `**Labels:** ${labels.join(', ')}\n` : ''}
## Description
${cleanDescription}

## Acceptance Criteria
<!-- TODO: Add specific acceptance criteria based on Jira ticket -->
- Implement functionality as described
- Add unit tests with 80%+ coverage
- Ensure backward compatibility

## Files Likely Affected
<!-- TODO: List files that will be changed -->
- src/main/java/...

## Notes
Synced from Jira ticket ${key}.
See practices/java.md for coding standards.
`;

    return spec;
  }

  /**
   * Save spec to .myintern/specs/ directory
   */
  async saveSpec(issue: JiraIssue): Promise<string> {
    const specContent = this.convertToSpec(issue);
    const fileName = `${issue.key}.md`;
    const filePath = path.join(this.specsDir, fileName);

    // Ensure specs directory exists
    if (!fs.existsSync(this.specsDir)) {
      fs.mkdirSync(this.specsDir, { recursive: true });
    }

    // Check if spec already exists
    if (fs.existsSync(filePath)) {
      throw new Error(`Spec for ${issue.key} already exists at ${filePath}`);
    }

    // Write spec file
    fs.writeFileSync(filePath, specContent, 'utf-8');

    return filePath;
  }

  /**
   * Clean Jira markdown formatting to standard markdown
   */
  private cleanJiraMarkdown(text: string): string {
    return text
      // Jira headings h1. h2. h3. -> ## ### ####
      .replace(/^h1\.\s+/gm, '# ')
      .replace(/^h2\.\s+/gm, '## ')
      .replace(/^h3\.\s+/gm, '### ')
      .replace(/^h4\.\s+/gm, '#### ')
      .replace(/^h5\.\s+/gm, '##### ')
      .replace(/^h6\.\s+/gm, '###### ')
      // Jira bold *text* -> **text**
      .replace(/\*([^*]+)\*/g, '**$1**')
      // Jira code {{text}} -> `text`
      .replace(/\{\{([^}]+)\}\}/g, '`$1`')
      // Jira links [text|url] -> [text](url)
      .replace(/\[([^|\]]+)\|([^\]]+)\]/g, '[$1]($2)')
      // Remove Jira-specific macros
      .replace(/\{[a-z]+:[^}]+\}/gi, '')
      .trim();
  }

  /**
   * Check if spec already exists for a Jira ticket
   */
  specExists(ticketKey: string): boolean {
    const filePath = path.join(this.specsDir, `${ticketKey}.md`);
    return fs.existsSync(filePath);
  }

  /**
   * Get path to spec file for a Jira ticket
   */
  getSpecPath(ticketKey: string): string {
    return path.join(this.specsDir, `${ticketKey}.md`);
  }
}
