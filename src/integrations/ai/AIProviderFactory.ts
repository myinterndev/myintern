import { AIProvider } from './AIProvider';
import { AnthropicProvider } from './AnthropicProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { BedrockProvider } from './BedrockProvider';
import { ClaudeCliProvider } from './ClaudeCliProvider';
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
        // api_key is optional - SDK will auto-discover from ANTHROPIC_API_KEY env var
        return new AnthropicProvider(api_key, model);

      case 'claude-cli':
        // Uses Claude Code CLI with OAuth - no API key needed
        return new ClaudeCliProvider(model);

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
