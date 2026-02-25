import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AIProvider, CodeImplementation } from './AIProvider';

const execAsync = promisify(exec);

/**
 * Claude CLI provider - uses the local Claude Code CLI with OAuth authentication
 * Perfect for users with Claude Pro/Max subscriptions who already use Claude Code
 *
 * No API key needed - leverages existing OAuth session
 */
export class ClaudeCliProvider implements AIProvider {
  private model: string;

  constructor(model: string = 'claude-sonnet-4-5-20250929') {
    this.model = model;
  }

  /**
   * Check if Claude CLI is installed and authenticated
   */
  static async isAvailable(): Promise<boolean> {
    try {
      const { stdout, stderr } = await execAsync('which claude');
      if (!stdout.trim()) {
        return false;
      }

      // Test if authenticated by trying a simple command
      await execAsync('claude --version');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate code using Claude CLI
   */
  async generateCode(prompt: string): Promise<CodeImplementation> {
    const tempDir = mkdtempSync(join(tmpdir(), 'myintern-'));
    const promptFile = join(tempDir, 'prompt.txt');

    try {
      // Write prompt to temp file to avoid shell escaping issues
      writeFileSync(promptFile, prompt, 'utf-8');

      const env = { ...process.env };
      delete env.CLAUDECODE;
      delete env.ANTHROPIC_API_KEY;
      delete env.ANTHROPIC_AUTH_TOKEN;

      const { stdout, stderr } = await execAsync(
        `claude --print --model ${this.model} --output-format json < "${promptFile}"`,
        {
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large responses
          env
        }
      );

      if (stderr) {
        console.warn('Claude CLI warning:', stderr);
      }

      // Claude CLI with --output-format json wraps response in an envelope:
      // { "type": "result", "is_error": false, "result": "<LLM text>", ... }
      const responseText = this.extractCliResult(stdout);
      return this.parseCodeImplementation(responseText);
    } catch (error: any) {
      // Include stderr in error message for better debugging
      const errorMsg = error.stderr || error.stdout || error.message;

      if (errorMsg?.includes('not authenticated') || errorMsg?.includes('CLAUDECODE')) {
        throw new Error(
          'Claude CLI not authenticated or blocked. Please ensure:\n' +
          '1. You are logged in: claude auth login\n' +
          '2. You are not running inside Claude Code (nested calls not supported)\n' +
          'Or set ANTHROPIC_API_KEY environment variable to use direct API.'
        );
      }

      // Provide full error context
      throw new Error(`Claude CLI failed: ${errorMsg}`);
    } finally {
      // Clean up temp file
      try {
        unlinkSync(promptFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Generate tests using Claude CLI
   */
  async generateTest(prompt: string): Promise<string> {
    const tempDir = mkdtempSync(join(tmpdir(), 'myintern-'));
    const promptFile = join(tempDir, 'prompt.txt');

    try {
      // Write prompt to temp file to avoid shell escaping issues
      writeFileSync(promptFile, prompt, 'utf-8');

      const env = { ...process.env };
      delete env.CLAUDECODE;
      delete env.ANTHROPIC_API_KEY;
      delete env.ANTHROPIC_AUTH_TOKEN;

      const { stdout, stderr } = await execAsync(
        `claude --print --model ${this.model} < "${promptFile}"`,
        {
          maxBuffer: 10 * 1024 * 1024,
          env
        }
      );

      if (stderr) {
        console.warn('Claude CLI warning:', stderr);
      }

      // Check if response is an error result from Claude CLI
      try {
        const maybeError = JSON.parse(stdout.trim());
        if (maybeError.is_error === true || maybeError.type === 'error') {
          throw new Error(`Claude CLI error: ${maybeError.result || JSON.stringify(maybeError)}`);
        }
      } catch (parseError) {
        // Not JSON or not an error, continue with normal parsing
      }

      return stdout.trim();
    } catch (error: any) {
      // Include stderr in error message for better debugging
      const errorMsg = error.stderr || error.stdout || error.message;

      if (errorMsg?.includes('not authenticated') || errorMsg?.includes('CLAUDECODE')) {
        throw new Error(
          'Claude CLI not authenticated or blocked. Please ensure:\n' +
          '1. You are logged in: claude auth login\n' +
          '2. You are not running inside Claude Code (nested calls not supported)\n' +
          'Or set ANTHROPIC_API_KEY environment variable to use direct API.'
        );
      }

      if (errorMsg?.includes('Invalid API key')) {
        throw new Error(
          'Claude CLI authentication failed: Invalid API key.\n\n' +
          'This usually means you have an external API key configured in Claude Code that is not valid.\n\n' +
          'Solutions:\n' +
          '1. Run: claude auth logout && claude auth login (to reset authentication)\n' +
          '2. Or use direct API: export ANTHROPIC_API_KEY=sk-ant-... (and set provider: anthropic in .myintern/agent.yml)\n' +
          '3. Or check your Claude Code settings for external API key configuration'
        );
      }

      // Provide full error context
      throw new Error(`Claude CLI failed: ${errorMsg}`);
    } finally {
      // Clean up temp file
      try {
        unlinkSync(promptFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Chat interface using Claude CLI
   */
  async chat(messages: Array<{ role: string; content: string }>): Promise<string> {
    // Convert messages to a single prompt (Claude CLI doesn't support message arrays directly)
    const conversationPrompt = messages
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n');

    const tempDir = mkdtempSync(join(tmpdir(), 'myintern-'));
    const promptFile = join(tempDir, 'prompt.txt');

    try {
      // Write prompt to temp file to avoid shell escaping issues
      writeFileSync(promptFile, conversationPrompt, 'utf-8');

      const env = { ...process.env };
      delete env.CLAUDECODE;
      delete env.ANTHROPIC_API_KEY;
      delete env.ANTHROPIC_AUTH_TOKEN;

      const { stdout, stderr } = await execAsync(
        `claude --print --model ${this.model} < "${promptFile}"`,
        {
          maxBuffer: 10 * 1024 * 1024,
          env
        }
      );

      if (stderr) {
        console.warn('Claude CLI warning:', stderr);
      }

      // Check if response is an error result from Claude CLI
      try {
        const maybeError = JSON.parse(stdout.trim());
        if (maybeError.is_error === true || maybeError.type === 'error') {
          const errorResult = maybeError.result || JSON.stringify(maybeError);

          // Check for specific error types
          if (errorResult.includes('Invalid API key')) {
            throw new Error(
              'Claude CLI authentication failed: Invalid API key.\n\n' +
              'Your Claude Code has an external API key configured that is not valid.\n\n' +
              'Solutions:\n' +
              '1. Run: claude auth logout && claude auth login (to reset authentication)\n' +
              '2. Or use direct API: export ANTHROPIC_API_KEY=sk-ant-... (and change provider to "anthropic" in .myintern/agent.yml)\n' +
              '3. Or check Claude Code settings: cat ~/.config/claude/config.json'
            );
          }

          throw new Error(`Claude CLI error: ${errorResult}`);
        }
      } catch (parseError) {
        // Not JSON or not an error, continue with normal parsing
      }

      return stdout.trim();
    } catch (error: any) {
      // Include stderr in error message for better debugging
      const errorMsg = error.stderr || error.stdout || error.message;

      if (errorMsg?.includes('not authenticated') || errorMsg?.includes('CLAUDECODE')) {
        throw new Error(
          'Claude CLI not authenticated or blocked. Please ensure:\n' +
          '1. You are logged in: claude auth login\n' +
          '2. You are not running inside Claude Code (nested calls not supported)\n' +
          'Or set ANTHROPIC_API_KEY environment variable to use direct API.'
        );
      }

      if (errorMsg?.includes('Invalid API key') || errorMsg?.includes('Fix external API key')) {
        throw new Error(
          'Claude CLI authentication failed: Invalid API key.\n\n' +
          'Your Claude Code has an external API key configured that is not valid.\n\n' +
          'Solutions:\n' +
          '1. Run: claude auth logout && claude auth login (to reset authentication)\n' +
          '2. Or use direct API: export ANTHROPIC_API_KEY=sk-ant-... (and change provider to "anthropic" in .myintern/agent.yml)\n' +
          '3. Or check Claude Code settings: cat ~/.config/claude/config.json'
        );
      }

      // Provide full error context
      throw new Error(`Claude CLI failed: ${errorMsg}`);
    } finally {
      // Clean up temp file
      try {
        unlinkSync(promptFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Extract the result text from Claude CLI JSON envelope.
   * --output-format json wraps responses in:
   * { "type": "result", "is_error": false, "result": "<LLM text>", ... }
   */
  private extractCliResult(stdout: string): string {
    const envelope = JSON.parse(stdout.trim());

    if (envelope.type === 'result') {
      if (envelope.is_error === true) {
        const errorResult = envelope.result || JSON.stringify(envelope);

        if (errorResult.includes('Invalid API key')) {
          throw new Error(
            'Claude CLI authentication failed: Invalid API key.\n\n' +
            'Solutions:\n' +
            '1. Run: unset ANTHROPIC_API_KEY && claude auth login\n' +
            '2. Or use direct API with a valid key (provider: anthropic in .myintern/agent.yml)'
          );
        }

        throw new Error(`Claude CLI error: ${errorResult}`);
      }

      if (typeof envelope.result === 'string') {
        return envelope.result;
      }

      return '';
    }

    return stdout.trim();
  }

  /**
   * Parse a text response (possibly markdown-fenced) into CodeImplementation JSON
   */
  private parseCodeImplementation(text: string): CodeImplementation {
    const defenced = text
      .replace(/^```(?:json)?\s*\n?/m, '')
      .replace(/\n?\s*```\s*$/m, '')
      .trim();

    try {
      const parsed = JSON.parse(defenced);
      if (parsed.files && Array.isArray(parsed.files)) {
        return parsed as CodeImplementation;
      }
    } catch {
      // Not clean JSON after de-fencing, try regex extraction
    }

    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      const parsed = JSON.parse(objMatch[0]);
      if (parsed.files && Array.isArray(parsed.files)) {
        return parsed as CodeImplementation;
      }
    }

    console.error('Claude CLI response text:', text.substring(0, 500));
    throw new Error('Failed to extract CodeImplementation JSON from Claude CLI response');
  }

}
