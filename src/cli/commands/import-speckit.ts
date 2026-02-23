#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import { LanguageDetector } from '../../core/LanguageDetector.js';

/**
 * Import Spec-Kit constitution and specs into MyIntern format
 *
 * Usage:
 *   myintern import-speckit
 *   myintern import-speckit --constitution .speckit/constitution.md
 *   myintern import-speckit --specs .speckit/specifications/
 */

interface SpecKitConstitution {
  principles: string[];
  constraints: string[];
  technicalStandards: string[];
}

export class SpecKitImporter {
  constructor(private repoPath: string) {}

  /**
   * Import Spec-Kit constitution → .myintern/practices/<lang>.md
   */
  async importConstitution(constitutionPath: string): Promise<void> {
    console.log('📥 Importing Spec-Kit constitution...');

    if (!fs.existsSync(constitutionPath)) {
      throw new Error(`Constitution file not found: ${constitutionPath}`);
    }

    // Read Spec-Kit constitution
    const constitutionContent = fs.readFileSync(constitutionPath, 'utf-8');
    const constitution = this.parseConstitution(constitutionContent);

    // Detect project language
    const detector = new LanguageDetector(this.repoPath);
    const projectInfo = detector.detectPrimary();

    // Convert to MyIntern practices format
    const practices = this.convertToPractices(constitution, projectInfo.language);

    // Write to .myintern/practices/<lang>.md
    const practicesDir = path.join(this.repoPath, '.myintern', 'practices');
    if (!fs.existsSync(practicesDir)) {
      fs.mkdirSync(practicesDir, { recursive: true });
    }

    const practicesFile = path.join(practicesDir, `${projectInfo.language}.md`);
    fs.writeFileSync(practicesFile, practices, 'utf-8');

    console.log(`✅ Constitution imported to: ${practicesFile}`);
    console.log(`   Language detected: ${projectInfo.language}`);
    console.log(`   Framework: ${projectInfo.framework || 'None'}`);
  }

  /**
   * Import Spec-Kit specifications → .myintern/specs/
   */
  async importSpecs(specsPath: string): Promise<void> {
    console.log('📥 Importing Spec-Kit specifications...');

    if (!fs.existsSync(specsPath)) {
      throw new Error(`Specs directory not found: ${specsPath}`);
    }

    const specFiles = fs.readdirSync(specsPath).filter(f => f.endsWith('.md'));

    const specsDir = path.join(this.repoPath, '.myintern', 'specs');
    if (!fs.existsSync(specsDir)) {
      fs.mkdirSync(specsDir, { recursive: true });
    }

    let imported = 0;
    for (const specFile of specFiles) {
      const sourcePath = path.join(specsPath, specFile);
      const content = fs.readFileSync(sourcePath, 'utf-8');

      // Convert Spec-Kit spec → MyIntern spec format
      const myinternSpec = this.convertSpec(content, specFile);

      // Write to .myintern/specs/
      const targetPath = path.join(specsDir, specFile);
      fs.writeFileSync(targetPath, myinternSpec, 'utf-8');
      imported++;
    }

    console.log(`✅ Imported ${imported} specification(s) to .myintern/specs/`);
  }

  /**
   * Parse Spec-Kit constitution markdown
   */
  private parseConstitution(content: string): SpecKitConstitution {
    const principles: string[] = [];
    const constraints: string[] = [];
    const technicalStandards: string[] = [];

    let currentSection = '';
    const lines = content.split('\n');

    for (const line of lines) {
      // Detect section headers
      if (line.match(/^##?\s+Principles/i)) {
        currentSection = 'principles';
        continue;
      } else if (line.match(/^##?\s+Constraints/i)) {
        currentSection = 'constraints';
        continue;
      } else if (line.match(/^##?\s+Technical\s+Standards/i)) {
        currentSection = 'technical';
        continue;
      }

      // Extract bullet points or numbered lists
      const listMatch = line.match(/^[\s-]*[-*]\s+(.+)$/) || line.match(/^\s*\d+\.\s+(.+)$/);
      if (listMatch) {
        const item = listMatch[1].trim();
        if (currentSection === 'principles') principles.push(item);
        else if (currentSection === 'constraints') constraints.push(item);
        else if (currentSection === 'technical') technicalStandards.push(item);
      }
    }

    return { principles, constraints, technicalStandards };
  }

  /**
   * Convert Spec-Kit constitution → MyIntern practices format
   */
  private convertToPractices(constitution: SpecKitConstitution, language: string): string {
    let practices = `# ${language.charAt(0).toUpperCase() + language.slice(1)} Coding Practices\n\n`;
    practices += `> Imported from Spec-Kit constitution\n\n`;

    practices += `## Core Principles\n\n`;
    constitution.principles.forEach((p, i) => {
      practices += `${i + 1}. ${p}\n`;
    });

    practices += `\n## Constraints\n\n`;
    constitution.constraints.forEach((c, i) => {
      practices += `${i + 1}. ${c}\n`;
    });

    practices += `\n## Technical Standards\n\n`;
    constitution.technicalStandards.forEach((s, i) => {
      practices += `${i + 1}. ${s}\n`;
    });

    // Add language-specific defaults if sparse
    if (language === 'java') {
      practices += this.addJavaDefaults(constitution);
    } else if (language === 'node') {
      practices += this.addNodeDefaults(constitution);
    } else if (language === 'python') {
      practices += this.addPythonDefaults(constitution);
    }

    return practices;
  }

  /**
   * Convert Spec-Kit spec → MyIntern spec format
   */
  private convertSpec(content: string, filename: string): string {
    // Extract title
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : filename.replace('.md', '');

    // Detect type from content keywords
    let type = 'feature';
    if (content.toLowerCase().includes('bug') || content.toLowerCase().includes('fix')) {
      type = 'bugfix';
    } else if (content.toLowerCase().includes('refactor')) {
      type = 'refactor';
    } else if (content.toLowerCase().includes('test')) {
      type = 'test';
    }

    // Build MyIntern spec format
    let spec = `# FEATURE: ${title}\n\n`;
    spec += `**Type:** ${type}\n`;
    spec += `**Priority:** medium\n`;
    spec += `**Source:** Imported from Spec-Kit\n\n`;

    // Copy rest of content
    const withoutTitle = content.replace(/^#\s+.+$/m, '').trim();
    spec += withoutTitle;

    // Add MyIntern-specific sections if missing
    if (!content.includes('## Acceptance Criteria')) {
      spec += `\n\n## Acceptance Criteria\n`;
      spec += `- [ ] Implementation matches specification\n`;
      spec += `- [ ] Tests pass\n`;
      spec += `- [ ] Code follows practices\n`;
    }

    if (!content.includes('## Files Likely Affected')) {
      spec += `\n\n## Files Likely Affected\n`;
      spec += `_Auto-detected by MyIntern based on codebase analysis_\n`;
    }

    return spec;
  }

  /**
   * Add Java-specific defaults if constitution is sparse
   */
  private addJavaDefaults(constitution: SpecKitConstitution): string {
    if (constitution.technicalStandards.length > 5) return ''; // Already detailed

    return `\n## Java-Specific Standards (MyIntern defaults)\n\n` +
      `1. Use constructor injection over field injection\n` +
      `2. All REST controllers use @RestController + ResponseEntity<>\n` +
      `3. Follow Controller → Service → Repository pattern\n` +
      `4. JUnit 5 + Mockito for tests\n` +
      `5. Aim for 80%+ test coverage on new code\n`;
  }

  /**
   * Add Node.js-specific defaults
   */
  private addNodeDefaults(constitution: SpecKitConstitution): string {
    if (constitution.technicalStandards.length > 5) return '';

    return `\n## Node.js-Specific Standards (MyIntern defaults)\n\n` +
      `1. Use ES modules (import/export) over CommonJS\n` +
      `2. TypeScript strict mode enabled\n` +
      `3. Jest for testing\n` +
      `4. Async/await over callbacks\n` +
      `5. Environment variables via .env (never hardcode)\n`;
  }

  /**
   * Add Python-specific defaults
   */
  private addPythonDefaults(constitution: SpecKitConstitution): string {
    if (constitution.technicalStandards.length > 5) return '';

    return `\n## Python-Specific Standards (MyIntern defaults)\n\n` +
      `1. Follow PEP 8 style guide\n` +
      `2. Type hints on all functions\n` +
      `3. pytest for testing\n` +
      `4. Virtual environments (venv/poetry) always used\n` +
      `5. Dependencies pinned in requirements.txt\n`;
  }
}

export const importSpeckit = new Command('import-speckit')
  .description('Import Spec-Kit constitution and specs into MyIntern format')
  .option('--constitution <path>', 'Path to Spec-Kit constitution file', '.speckit/constitution.md')
  .option('--specs <path>', 'Path to Spec-Kit specs directory', '.speckit/specifications/')
  .option('--constitution-only', 'Import constitution only (skip specs)')
  .option('--specs-only', 'Import specs only (skip constitution)')
  .action(async (options) => {
    const repoPath = process.cwd();
    const importer = new SpecKitImporter(repoPath);

    try {
      if (!options.specsOnly) {
        await importer.importConstitution(options.constitution);
      }

      if (!options.constitutionOnly) {
        await importer.importSpecs(options.specs);
      }

      console.log('\n✨ Spec-Kit import complete!');
      console.log('\nNext steps:');
      console.log('  1. Review imported practices: .myintern/practices/<lang>.md');
      console.log('  2. Review imported specs: .myintern/specs/');
      console.log('  3. Run: myintern start');
    } catch (error) {
      console.error('❌ Import failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
