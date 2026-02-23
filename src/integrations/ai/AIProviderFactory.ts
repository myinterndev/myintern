import { AIProvider } from './AIProvider';
import { AnthropicProvider } from './AnthropicProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { BedrockProvider } from './BedrockProvider';
import { AgentConfig } from '../../core/ConfigManager';

/**
 * Factory for creating AI provider instances based on config
 */
export class AIProviderFactory {
  /**
   * Create AI provider from config
   */
  static create(config: AgentConfig): AIProvider {
    const { provider, api_key, model, aws_region, aws_profile, aws_access_key_id, aws_secret_access_key } = config.llm;

    switch (provider) {
      case 'anthropic':
        if (!api_key) {
          throw new Error('API key is required for Anthropic provider');
        }
        return new AnthropicProvider(api_key, model);

      case 'openai':
        if (!api_key) {
          throw new Error('API key is required for OpenAI provider');
        }
        return new OpenAIProvider(api_key, model);

      case 'bedrock':
        return new BedrockProvider({
          model,
          region: aws_region,
          profile: aws_profile,
          accessKeyId: aws_access_key_id,
          secretAccessKey: aws_secret_access_key
        });

      default:
        throw new Error(`Unknown AI provider: ${provider}`);
    }
  }

}
