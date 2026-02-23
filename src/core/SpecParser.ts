import * as fs from 'fs';
import * as path from 'path';

export type SpecType = 'feature' | 'bugfix' | 'refactor' | 'test';
export type SpecPriority = 'high' | 'medium' | 'low';

export interface SpecFile {
  filePath: string;
  title: string;
  type: SpecType;
  priority: SpecPriority;
  jiraTicket?: string; // Optional Jira ticket reference
  description: string; // Renamed from 'context'
  acceptanceCriteria: string[];
  filesAffected?: string[]; // Now optional
  notes: string;
  rawContent: string;
}

/**
 * Parser for spec files (Section 4: Spec File Format)
 *
 * Supports structured markdown format:
 * - ## Type: feature | bugfix | refactor | test
 * - ## Priority: high | medium | low
 * - ## Context: description
 * - ## Acceptance Criteria: bullet list
 * - ## Files Likely Affected: bullet list
 * - ## Notes: additional info
 */
export class SpecParser {
  /**
   * Parse a spec file from path
   * Supports new simplified format with inline Type/Priority
   */
  parse(specFilePath: string): SpecFile {
    const content = fs.readFileSync(specFilePath, 'utf-8');
    const fileName = path.basename(specFilePath);

    // Extract title from first heading
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : fileName;

    // Extract Jira ticket (inline format: **Jira:** TICKET-123)
    const jiraMatch = content.match(/\*\*Jira:\*\*\s+([A-Z]+-\d+)/i);
    const jiraTicket = jiraMatch ? jiraMatch[1] : undefined;

    // Extract type (inline format: **Type:** feature)
    const typeMatch = content.match(/\*\*Type:\*\*\s+(\w+)/i);
    const typeStr = typeMatch ? typeMatch[1].trim().toLowerCase() : 'feature';
    const type = this.parseType(typeStr);

    // Extract priority (inline format: **Priority:** high)
    const priorityMatch = content.match(/\*\*Priority:\*\*\s+(\w+)/i);
    const priorityStr = priorityMatch ? priorityMatch[1].trim().toLowerCase() : 'medium';
    const priority = this.parsePriority(priorityStr);

    // Extract description section (renamed from Context)
    const descriptionMatch = content.match(/##\s*Description\s*\n([\s\S]*?)(?=\n##|$)/i);
    const description = descriptionMatch ? descriptionMatch[1].trim() : '';

    // Fallback to old Context format for backward compatibility
    if (!description) {
      const contextMatch = content.match(/##\s*Context\s*\n([\s\S]*?)(?=\n##|$)/i);
      const context = contextMatch ? contextMatch[1].trim() : '';

      return this.parseLegacyFormat(specFilePath, fileName, content, title, type, priority, context);
    }

    // Extract acceptance criteria
    const criteriaMatch = content.match(/##\s*Acceptance\s*Criteria\s*\n([\s\S]*?)(?=\n##|$)/i);
    const acceptanceCriteria = this.extractBulletList(criteriaMatch ? criteriaMatch[1] : '');

    // Extract files affected (optional)
    const filesMatch = content.match(/##\s*Files\s*Likely\s*Affected\s*\n([\s\S]*?)(?=\n##|$)/i);
    const filesAffected = this.extractBulletList(filesMatch ? filesMatch[1] : '');

    // Extract notes (optional)
    const notesMatch = content.match(/##\s*Notes\s*\n([\s\S]*?)(?=\n##|$)/i);
    const notes = notesMatch ? notesMatch[1].trim() : '';

    return {
      filePath: specFilePath,
      title,
      jiraTicket,
      type,
      priority,
      description,
      acceptanceCriteria,
      filesAffected: filesAffected.length > 0 ? filesAffected : undefined,
      notes,
      rawContent: content
    };
  }

  /**
   * Parse legacy format (for backward compatibility)
   */
  private parseLegacyFormat(
    specFilePath: string,
    fileName: string,
    content: string,
    title: string,
    type: SpecType,
    priority: SpecPriority,
    context: string
  ): SpecFile {
    // Extract acceptance criteria
    const criteriaMatch = content.match(/##\s*Acceptance\s*Criteria\s*\n([\s\S]*?)(?=\n##|$)/i);
    const acceptanceCriteria = this.extractBulletList(criteriaMatch ? criteriaMatch[1] : '');

    // Extract files affected
    const filesMatch = content.match(/##\s*Files\s*Likely\s*Affected\s*\n([\s\S]*?)(?=\n##|$)/i);
    const filesAffected = this.extractBulletList(filesMatch ? filesMatch[1] : '');

    // Extract notes
    const notesMatch = content.match(/##\s*Notes\s*\n([\s\S]*?)(?=\n##|$)/i);
    const notes = notesMatch ? notesMatch[1].trim() : '';

    return {
      filePath: specFilePath,
      title,
      type,
      priority,
      description: context, // Map context to description
      acceptanceCriteria,
      filesAffected: filesAffected.length > 0 ? filesAffected : undefined,
      notes,
      rawContent: content
    };
  }

  /**
   * Validate spec file has required sections
   */
  validate(spec: SpecFile): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!spec.title) {
      errors.push('Missing title (first # heading)');
    }

    if (!spec.description || spec.description.length < 10) {
      errors.push('Description section missing or too short');
    }

    if (spec.acceptanceCriteria.length === 0) {
      errors.push('No acceptance criteria defined');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if spec has pending work (TODO, PENDING, IMPLEMENT keywords)
   */
  hasPendingWork(spec: SpecFile): boolean {
    const content = spec.rawContent.toLowerCase();
    return (
      content.includes('todo') ||
      content.includes('pending') ||
      content.includes('implement') ||
      content.includes('- [ ]') // Unchecked checkbox
    );
  }

  /**
   * Parse type string to SpecType
   */
  private parseType(typeStr: string): SpecType {
    const normalized = typeStr.toLowerCase().trim();

    if (normalized.includes('feature')) return 'feature';
    if (normalized.includes('bug') || normalized.includes('fix')) return 'bugfix';
    if (normalized.includes('refactor')) return 'refactor';
    if (normalized.includes('test')) return 'test';

    return 'feature'; // default
  }

  /**
   * Parse priority string to SpecPriority
   */
  private parsePriority(priorityStr: string): SpecPriority {
    const normalized = priorityStr.toLowerCase().trim();

    if (normalized.includes('high') || normalized.includes('urgent')) return 'high';
    if (normalized.includes('low')) return 'low';

    return 'medium'; // default
  }

  /**
   * Extract bullet list items from markdown
   */
  private extractBulletList(content: string): string[] {
    const items: string[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const match = line.match(/^\s*[-*]\s*(.+)$/);
      if (match) {
        items.push(match[1].trim());
      }
    }

    return items;
  }

  /**
   * Format spec as prompt context
   */
  formatForPrompt(spec: SpecFile): string {
    let prompt = `# ${spec.title}\n\n`;

    if (spec.jiraTicket) {
      prompt += `**Jira:** ${spec.jiraTicket}\n`;
    }

    prompt += `**Type:** ${spec.type}\n`;
    prompt += `**Priority:** ${spec.priority}\n\n`;

    if (spec.description) {
      prompt += `## Description\n${spec.description}\n\n`;
    }

    if (spec.acceptanceCriteria.length > 0) {
      prompt += `## Acceptance Criteria\n`;
      for (const criteria of spec.acceptanceCriteria) {
        prompt += `- ${criteria}\n`;
      }
      prompt += '\n';
    }

    if (spec.filesAffected && spec.filesAffected.length > 0) {
      prompt += `## Files Likely Affected\n`;
      for (const file of spec.filesAffected) {
        prompt += `- ${file}\n`;
      }
      prompt += '\n';
    }

    if (spec.notes) {
      prompt += `## Notes\n${spec.notes}\n`;
    }

    return prompt;
  }
}
