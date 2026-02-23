import { ContextFileLoader } from '../ContextFileLoader';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ContextFileLoader', () => {
  let tempDir: string;
  let loader: ContextFileLoader;

  beforeEach(() => {
    // Create temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'context-loader-test-'));
    loader = new ContextFileLoader(tempDir);
  });

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Priority Order', () => {
    it('should load .myintern/practices/java.md as highest priority', () => {
      // Create .myintern/practices/java.md
      const practicesDir = path.join(tempDir, '.myintern', 'practices');
      fs.mkdirSync(practicesDir, { recursive: true });
      fs.writeFileSync(
        path.join(practicesDir, 'java.md'),
        '# MyIntern Java Standards\n1. Use Spring Boot best practices'
      );

      const contextFiles = loader.loadContextFiles('java');

      expect(contextFiles).toHaveLength(1);
      expect(contextFiles[0].source).toBe('myintern');
      expect(contextFiles[0].priority).toBe(1);
      expect(contextFiles[0].content).toContain('MyIntern Java Standards');
    });

    it('should load CLAUDE.md from .claude/ directory', () => {
      // Create .claude/CLAUDE.md
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(
        path.join(claudeDir, 'CLAUDE.md'),
        '# Claude Code Instructions\nFollow clean code principles'
      );

      const contextFiles = loader.loadContextFiles();

      expect(contextFiles).toHaveLength(1);
      expect(contextFiles[0].source).toBe('claude');
      expect(contextFiles[0].priority).toBe(2);
      expect(contextFiles[0].content).toContain('Claude Code Instructions');
    });

    it('should load CLAUDE.md from root directory as fallback', () => {
      // Create CLAUDE.md in root
      fs.writeFileSync(
        path.join(tempDir, 'CLAUDE.md'),
        '# Root Claude Instructions\nUse TypeScript strict mode'
      );

      const contextFiles = loader.loadContextFiles();

      expect(contextFiles).toHaveLength(1);
      expect(contextFiles[0].source).toBe('claude');
      expect(contextFiles[0].priority).toBe(2);
      expect(contextFiles[0].content).toContain('Root Claude Instructions');
    });

    it('should prefer .claude/CLAUDE.md over root CLAUDE.md', () => {
      // Create both versions
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(
        path.join(claudeDir, 'CLAUDE.md'),
        '# Claude Dir Version'
      );
      fs.writeFileSync(
        path.join(tempDir, 'CLAUDE.md'),
        '# Root Version'
      );

      const contextFiles = loader.loadContextFiles();

      expect(contextFiles).toHaveLength(1);
      expect(contextFiles[0].content).toContain('Claude Dir Version');
    });

    it('should load .cursorrules', () => {
      // Create .cursorrules
      fs.writeFileSync(
        path.join(tempDir, '.cursorrules'),
        'Use functional programming\nAvoid mutations'
      );

      const contextFiles = loader.loadContextFiles();

      expect(contextFiles).toHaveLength(1);
      expect(contextFiles[0].source).toBe('cursor');
      expect(contextFiles[0].priority).toBe(3);
      expect(contextFiles[0].content).toContain('functional programming');
    });

    it('should load .github/copilot-instructions.md', () => {
      // Create .github/copilot-instructions.md
      const githubDir = path.join(tempDir, '.github');
      fs.mkdirSync(githubDir, { recursive: true });
      fs.writeFileSync(
        path.join(githubDir, 'copilot-instructions.md'),
        '# Copilot Instructions\nWrite comprehensive tests'
      );

      const contextFiles = loader.loadContextFiles();

      expect(contextFiles).toHaveLength(1);
      expect(contextFiles[0].source).toBe('copilot');
      expect(contextFiles[0].priority).toBe(4);
      expect(contextFiles[0].content).toContain('Copilot Instructions');
    });

    it('should load all context files in correct priority order', () => {
      // Create all context files
      const practicesDir = path.join(tempDir, '.myintern', 'practices');
      fs.mkdirSync(practicesDir, { recursive: true });
      fs.writeFileSync(path.join(practicesDir, 'java.md'), '# MyIntern');

      fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# Claude');
      fs.writeFileSync(path.join(tempDir, '.cursorrules'), '# Cursor');

      const githubDir = path.join(tempDir, '.github');
      fs.mkdirSync(githubDir, { recursive: true });
      fs.writeFileSync(path.join(githubDir, 'copilot-instructions.md'), '# Copilot');

      const contextFiles = loader.loadContextFiles('java');

      expect(contextFiles).toHaveLength(4);
      expect(contextFiles[0].source).toBe('myintern'); // priority 1
      expect(contextFiles[1].source).toBe('claude');   // priority 2
      expect(contextFiles[2].source).toBe('cursor');   // priority 3
      expect(contextFiles[3].source).toBe('copilot');  // priority 4
    });
  });

  describe('Merged Context', () => {
    it('should merge multiple context files with source attribution', () => {
      // Create multiple files
      fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# Claude Rules');
      fs.writeFileSync(path.join(tempDir, '.cursorrules'), '# Cursor Rules');

      const merged = loader.loadMergedContext();

      expect(merged).toContain('Claude Code Instructions');
      expect(merged).toContain('Cursor Rules');
      expect(merged).toContain('CLAUDE.md');
      expect(merged).toContain('.cursorrules');
      expect(merged).toContain('---'); // Separator
    });

    it('should return empty string when no context files exist', () => {
      const merged = loader.loadMergedContext();
      expect(merged).toBe('');
    });

    it('should include language-specific practices in merged context', () => {
      // Create practices file
      const practicesDir = path.join(tempDir, '.myintern', 'practices');
      fs.mkdirSync(practicesDir, { recursive: true });
      fs.writeFileSync(
        path.join(practicesDir, 'java.md'),
        '# Java Best Practices'
      );

      const merged = loader.loadMergedContext('java');

      expect(merged).toContain('MyIntern Team Standards');
      expect(merged).toContain('Java Best Practices');
    });
  });

  describe('Utility Methods', () => {
    it('should detect when context files exist', () => {
      expect(loader.hasAnyContextFiles()).toBe(false);

      fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# Test');

      expect(loader.hasAnyContextFiles()).toBe(true);
    });

    it('should return context summary', () => {
      // Create files
      fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# Test');
      fs.writeFileSync(path.join(tempDir, '.cursorrules'), '# Test');

      const summary = loader.getContextSummary();

      expect(summary).toHaveLength(2);
      expect(summary[0].source).toBe('Claude Code Instructions');
      expect(summary[0].path).toBe('CLAUDE.md');
      expect(summary[1].source).toBe('Cursor Rules');
      expect(summary[1].path).toBe('.cursorrules');
    });

    it('should handle language parameter in hasAnyContextFiles', () => {
      const practicesDir = path.join(tempDir, '.myintern', 'practices');
      fs.mkdirSync(practicesDir, { recursive: true });
      fs.writeFileSync(path.join(practicesDir, 'java.md'), '# Java');

      expect(loader.hasAnyContextFiles('java')).toBe(true);
      expect(loader.hasAnyContextFiles('python')).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing language parameter gracefully', () => {
      fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# Test');

      const contextFiles = loader.loadContextFiles();
      expect(contextFiles).toHaveLength(1);
      expect(contextFiles[0].source).toBe('claude');
    });

    it('should handle empty context files', () => {
      fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '');

      const contextFiles = loader.loadContextFiles();
      expect(contextFiles).toHaveLength(1);
      expect(contextFiles[0].content).toBe('');
    });

    it('should handle non-existent .myintern directory', () => {
      // Don't create .myintern directory
      const contextFiles = loader.loadContextFiles('java');

      // Should not throw, just return empty or other files
      expect(Array.isArray(contextFiles)).toBe(true);
    });

    it('should handle non-existent .github directory', () => {
      // Don't create .github directory
      const contextFiles = loader.loadContextFiles();

      expect(Array.isArray(contextFiles)).toBe(true);
    });

    it('should handle case-insensitive language parameter', () => {
      const practicesDir = path.join(tempDir, '.myintern', 'practices');
      fs.mkdirSync(practicesDir, { recursive: true });
      fs.writeFileSync(path.join(practicesDir, 'java.md'), '# Java');

      // Should work with uppercase
      const contextFiles = loader.loadContextFiles('JAVA');
      expect(contextFiles).toHaveLength(1);
      expect(contextFiles[0].source).toBe('myintern');
    });
  });

  describe('Zero-Config Mode Support', () => {
    it('should work for Claude Code users without .myintern setup', () => {
      // User has CLAUDE.md but no .myintern
      fs.writeFileSync(
        path.join(tempDir, 'CLAUDE.md'),
        '# My Claude Instructions\nUse Java 17'
      );

      expect(loader.hasAnyContextFiles()).toBe(true);

      const merged = loader.loadMergedContext('java');
      expect(merged).toContain('My Claude Instructions');
    });

    it('should work for Cursor users without .myintern setup', () => {
      // User has .cursorrules but no .myintern
      fs.writeFileSync(
        path.join(tempDir, '.cursorrules'),
        'Always write tests first'
      );

      expect(loader.hasAnyContextFiles()).toBe(true);

      const merged = loader.loadMergedContext();
      expect(merged).toContain('Always write tests first');
    });

    it('should work for Copilot users without .myintern setup', () => {
      // User has copilot-instructions.md but no .myintern
      const githubDir = path.join(tempDir, '.github');
      fs.mkdirSync(githubDir, { recursive: true });
      fs.writeFileSync(
        path.join(githubDir, 'copilot-instructions.md'),
        'Follow DDD principles'
      );

      expect(loader.hasAnyContextFiles()).toBe(true);

      const merged = loader.loadMergedContext();
      expect(merged).toContain('Follow DDD principles');
    });

    it('should prioritize .myintern practices when user has multiple context files', () => {
      // User has CLAUDE.md and .myintern/practices/java.md
      const practicesDir = path.join(tempDir, '.myintern', 'practices');
      fs.mkdirSync(practicesDir, { recursive: true });
      fs.writeFileSync(
        path.join(practicesDir, 'java.md'),
        '# Team Standards (Override)'
      );
      fs.writeFileSync(
        path.join(tempDir, 'CLAUDE.md'),
        '# Personal Preferences'
      );

      const contextFiles = loader.loadContextFiles('java');

      // MyIntern practices should come first
      expect(contextFiles[0].source).toBe('myintern');
      expect(contextFiles[0].content).toContain('Team Standards');
    });
  });
});
