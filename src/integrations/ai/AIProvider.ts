/**
 * Common interface for all AI providers
 */

export interface GeneratedFile {
  path: string;
  action: 'create' | 'modify';
  content: string;
}

export interface CodeImplementation {
  files: GeneratedFile[];
  commit_message: string;
  summary: string;
}

export interface AIProvider {
  /**
   * Generate code implementation from prompt
   */
  generateCode(prompt: string): Promise<CodeImplementation>;

  /**
   * Generate test file from prompt
   */
  generateTest(prompt: string): Promise<string>;

  /**
   * General chat/question answering
   */
  chat(messages: Array<{ role: string; content: string }>): Promise<string>;
}
