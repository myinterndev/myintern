import Anthropic from '@anthropic-ai/sdk';
import { AIProvider, CodeImplementation } from './AIProvider';

/**
 * Anthropic Claude provider implementation
 */
export class AnthropicProvider implements AIProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string = 'claude-sonnet-4-5-20250929') {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async generateCode(prompt: string): Promise<CodeImplementation> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 16000,
      messages: [{ role: 'user', content: prompt }]
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from AI response');
    }

    return JSON.parse(jsonMatch[0]) as CodeImplementation;
  }

  async generateTest(prompt: string): Promise<string> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }]
    });

    return message.content[0].type === 'text' ? message.content[0].text : '';
  }

  async chat(messages: Array<{ role: string; content: string }>): Promise<string> {
    const anthropicMessages = messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }));

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 4000,
      messages: anthropicMessages
    });

    return message.content[0].type === 'text' ? message.content[0].text : '';
  }
}
