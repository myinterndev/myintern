import OpenAI from 'openai';
import { AIProvider, CodeImplementation } from './AIProvider';

/**
 * OpenAI provider implementation (GPT-4, GPT-4o)
 */
export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-4o') {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async generateCode(prompt: string): Promise<CodeImplementation> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content:
            'You are a senior software engineer. Return responses as valid JSON only, no markdown.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 16000
    });

    const responseText = response.choices[0]?.message?.content || '';

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from AI response');
    }

    return JSON.parse(jsonMatch[0]) as CodeImplementation;
  }

  async generateTest(prompt: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content:
            'You are a test engineer. Return only the complete test file content, no explanations.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 8000
    });

    return response.choices[0]?.message?.content || '';
  }

  async chat(messages: Array<{ role: string; content: string }>): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages as any,
      temperature: 0.7
    });

    return response.choices[0]?.message?.content || '';
  }
}
