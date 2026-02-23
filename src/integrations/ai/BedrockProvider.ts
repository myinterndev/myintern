import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { fromSSO } from '@aws-sdk/credential-providers';
import { AIProvider, CodeImplementation } from './AIProvider';

/**
 * AWS Bedrock provider implementation
 * Supports both API key and AWS SSO/profile authentication
 */
export class BedrockProvider implements AIProvider {
  private client: BedrockRuntimeClient;
  private model: string;

  constructor(
    config: {
      model?: string;
      region?: string;
      profile?: string;
      accessKeyId?: string;
      secretAccessKey?: string;
    }
  ) {
    const region = config.region || process.env.AWS_REGION || 'us-east-1';
    this.model = config.model || 'anthropic.claude-sonnet-4-5-v1:0';

    // Determine authentication method
    let credentials;

    if (config.accessKeyId && config.secretAccessKey) {
      // Explicit API key authentication
      credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      };
    } else if (config.profile) {
      // AWS SSO profile/session authentication
      credentials = fromSSO({ profile: config.profile });
    }
    // If neither provided, use default AWS credential chain (env vars, instance metadata, etc.)

    this.client = new BedrockRuntimeClient({
      region,
      credentials
    });
  }

  async generateCode(prompt: string): Promise<CodeImplementation> {
    const response = await this.invokeModel(prompt, 16000);

    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from AI response');
    }

    return JSON.parse(jsonMatch[0]) as CodeImplementation;
  }

  async generateTest(prompt: string): Promise<string> {
    return await this.invokeModel(prompt, 8000);
  }

  async chat(messages: Array<{ role: string; content: string }>): Promise<string> {
    // Convert messages to Bedrock format
    const bedrockMessages = messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: [{ text: m.content }]
    }));

    const payload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 4000,
      messages: bedrockMessages
    };

    const command = new InvokeModelCommand({
      modelId: this.model,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload)
    });

    const response = await this.client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    return responseBody.content[0].text;
  }

  /**
   * Internal helper to invoke Bedrock model
   */
  private async invokeModel(prompt: string, maxTokens: number): Promise<string> {
    const payload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: maxTokens,
      messages: [
        {
          role: 'user',
          content: [{ text: prompt }]
        }
      ]
    };

    const command = new InvokeModelCommand({
      modelId: this.model,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload)
    });

    const response = await this.client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    return responseBody.content[0].text;
  }
}
