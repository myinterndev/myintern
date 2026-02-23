import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { execSync } from 'child_process';

/**
 * DryRunPreview - Preview file changes before applying them
 * Generates diffs and allows user approval
 */
export class DryRunPreview {
  private repoPath: string;

  constructor(repoPath: string = process.cwd()) {
    this.repoPath = repoPath;
  }

  /**
   * Preview file changes and generate diffs
   */
  async preview(files: Array<{ path: string; content: string; action: 'create' | 'modify' | 'delete' }>): Promise<{
    approved: boolean;
    diffs: Array<{ path: string; diff: string; action: string }>;
  }> {
    const diffs: Array<{ path: string; diff: string; action: string }> = [];

    console.log(chalk.blue('\n📋 Preview of Changes:\n'));

    for (const file of files) {
      const fullPath = path.join(this.repoPath, file.path);
      const exists = fs.existsSync(fullPath);

      if (file.action === 'delete') {
        diffs.push({
          path: file.path,
          diff: exists ? fs.readFileSync(fullPath, 'utf-8') : '',
          action: 'delete'
        });

        console.log(chalk.red(`🗑️  DELETE: ${file.path}`));
        if (exists) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n').slice(0, 10);
          console.log(chalk.gray('   Preview (first 10 lines):'));
          lines.forEach((line, idx) => console.log(chalk.gray(`   ${idx + 1} | ${line}`)));
          if (content.split('\n').length > 10) {
            console.log(chalk.gray(`   ... (${content.split('\n').length - 10} more lines)`));
          }
        }
        console.log();
        continue;
      }

      if (file.action === 'create' || !exists) {
        diffs.push({
          path: file.path,
          diff: this.generateCreateDiff(file.content),
          action: 'create'
        });

        console.log(chalk.green(`📝 CREATE: ${file.path}`));
        const lines = file.content.split('\n').slice(0, 10);
        console.log(chalk.gray('   Preview (first 10 lines):'));
        lines.forEach((line, idx) => console.log(chalk.green(`   ${idx + 1} + ${line}`)));
        if (file.content.split('\n').length > 10) {
          console.log(chalk.gray(`   ... (${file.content.split('\n').length - 10} more lines)`));
        }
        console.log();
      } else {
        // Modified file - show diff
        const diff = this.generateDiff(fullPath, file.content);
        diffs.push({
          path: file.path,
          diff,
          action: 'modify'
        });

        console.log(chalk.yellow(`✏️  MODIFY: ${file.path}`));
        console.log(this.formatDiffForDisplay(diff));
        console.log();
      }
    }

    // Summary
    const creates = diffs.filter(d => d.action === 'create').length;
    const modifies = diffs.filter(d => d.action === 'modify').length;
    const deletes = diffs.filter(d => d.action === 'delete').length;

    console.log(chalk.blue('📊 Summary:'));
    console.log(chalk.green(`   ✓ ${creates} file(s) to create`));
    console.log(chalk.yellow(`   ✓ ${modifies} file(s) to modify`));
    if (deletes > 0) {
      console.log(chalk.red(`   ✓ ${deletes} file(s) to delete`));
    }
    console.log();

    return {
      approved: true, // Approval will be handled by caller
      diffs
    };
  }

  /**
   * Generate unified diff between existing file and new content
   */
  private generateDiff(existingFilePath: string, newContent: string): string {
    try {
      // Create temp file for new content
      const tempPath = path.join(this.repoPath, '.myintern', '.temp', 'new-content.tmp');
      const tempDir = path.dirname(tempPath);

      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      fs.writeFileSync(tempPath, newContent, 'utf-8');

      // Use git diff for better formatting
      const diff = execSync(
        `git diff --no-index --color=never "${existingFilePath}" "${tempPath}" || true`,
        { cwd: this.repoPath, encoding: 'utf-8' }
      );

      // Cleanup
      fs.unlinkSync(tempPath);

      return diff;
    } catch (error) {
      // Fallback to simple diff
      return this.simpleDiff(fs.readFileSync(existingFilePath, 'utf-8'), newContent);
    }
  }

  /**
   * Generate diff for new file creation
   */
  private generateCreateDiff(content: string): string {
    return content.split('\n').map((line, idx) => `+${idx + 1} ${line}`).join('\n');
  }

  /**
   * Simple diff implementation (fallback)
   */
  private simpleDiff(oldContent: string, newContent: string): string {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const diff: string[] = [];

    let i = 0, j = 0;

    while (i < oldLines.length || j < newLines.length) {
      if (i >= oldLines.length) {
        diff.push(`+ ${newLines[j]}`);
        j++;
      } else if (j >= newLines.length) {
        diff.push(`- ${oldLines[i]}`);
        i++;
      } else if (oldLines[i] === newLines[j]) {
        diff.push(`  ${oldLines[i]}`);
        i++;
        j++;
      } else {
        diff.push(`- ${oldLines[i]}`);
        diff.push(`+ ${newLines[j]}`);
        i++;
        j++;
      }
    }

    return diff.join('\n');
  }

  /**
   * Format diff for console display
   */
  private formatDiffForDisplay(diff: string): string {
    const lines = diff.split('\n');
    let output = '';
    let displayLines = 0;
    const maxLines = 20;

    for (const line of lines) {
      if (displayLines >= maxLines) {
        output += chalk.gray(`   ... (${lines.length - displayLines} more lines in diff)\n`);
        break;
      }

      if (line.startsWith('+')) {
        output += chalk.green(`   ${line}\n`);
      } else if (line.startsWith('-')) {
        output += chalk.red(`   ${line}\n`);
      } else if (line.startsWith('@@')) {
        output += chalk.cyan(`   ${line}\n`);
      } else {
        output += chalk.gray(`   ${line}\n`);
      }

      displayLines++;
    }

    return output;
  }

  /**
   * Save preview to file for later review
   */
  async savePreview(diffs: Array<{ path: string; diff: string; action: string }>, outputPath?: string): Promise<string> {
    const previewDir = path.join(this.repoPath, '.myintern', 'previews');
    if (!fs.existsSync(previewDir)) {
      fs.mkdirSync(previewDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const previewFile = outputPath || path.join(previewDir, `preview-${timestamp}.diff`);

    let content = '# MyIntern Code Generation Preview\n';
    content += `# Generated: ${new Date().toISOString()}\n\n`;

    for (const diff of diffs) {
      content += `\n### ${diff.action.toUpperCase()}: ${diff.path}\n\n`;
      content += diff.diff;
      content += '\n\n';
    }

    fs.writeFileSync(previewFile, content, 'utf-8');

    return previewFile;
  }
}
