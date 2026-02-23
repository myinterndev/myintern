import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

/**
 * Config schema for .myintern/agent.yml
 * V1: Focused on Java/Spring Boot
 */

// Supported models per provider
export const SUPPORTED_MODELS = {
  anthropic: [
    'claude-sonnet-4-5-20250929',
    'claude-3-5-sonnet-20241022',
    'claude-3-opus-20240229',
    'claude-3-haiku-20240307'
  ],
  openai: [
    'gpt-4o',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo'
  ],
  bedrock: [
    'anthropic.claude-sonnet-4-5-v1:0',
    'anthropic.claude-3-5-sonnet-20241022-v2:0',
    'anthropic.claude-3-opus-20240229-v1:0',
    'anthropic.claude-3-haiku-20240307-v1:0'
  ]
} as const;

export interface AgentConfig {
  version: string;

  // BYOK — Bring Your Own Key
  llm: {
    provider: 'anthropic' | 'openai' | 'bedrock';
    model: string; // Must be from SUPPORTED_MODELS
    api_key?: string; // env var reference like ${ANTHROPIC_API_KEY} (not required for bedrock with profile)
    // AWS Bedrock specific options
    aws_region?: string; // AWS region for Bedrock (e.g., 'us-east-1')
    aws_profile?: string; // AWS SSO profile/session name (e.g., '${AWS_PROFILE}')
    aws_access_key_id?: string; // Alternative to profile: explicit AWS credentials
    aws_secret_access_key?: string; // Alternative to profile: explicit AWS credentials
  };

  // Java/Spring Boot specific settings
  java: {
    version: string; // e.g., "17", "21"
    spring_boot_version?: string; // e.g., "3.2.0"
  };

  // Agents to enable
  agents: {
    code: boolean;
    test: boolean;
    build: boolean;
    max_parallel?: number;  // Max parallel spec executions (default: 3)
  };

  // Watch configuration
  watch: {
    paths: string[];
    ignore: string[];
    debounce_ms: number;
  };

  // Build commands (Maven-focused for v1)
  build: {
    tool: 'maven' | 'gradle';
    commands: {
      compile: string;
      test: string;
      package: string;
    };
  };

  // Git configuration
  git: {
    protected_branches: string[];
    auto_commit: boolean;
    branch_prefix: string;
  };

  // Code generation safety
  safety?: {
    backward_compatibility: boolean; // Ensure existing code is not broken
    run_regression_tests: boolean;   // Run tests against existing functionality
  };

  // Dry-run and preview settings
  preview?: {
    enabled: boolean;          // Enable dry-run preview before applying changes
    show_diffs: boolean;       // Show file diffs in preview
    require_approval: boolean; // Require manual approval before applying
  };

  // Feedback loop settings
  feedback?: {
    enabled: boolean;          // Enable feedback collection
    auto_learn: boolean;       // Automatically learn from feedback
  };

  // GitHub integration
  github?: {
    enabled: boolean;
    sync_labels: string[];     // Labels to sync (e.g., ['myintern', 'enhancement'])
    auto_close: boolean;       // Auto-close issues when specs complete
    assignee_filter?: string;  // Only sync issues assigned to this user
  };
}

/**
 * Config manager for .myintern/agent.yml
 */
export class ConfigManager {
  private configPath: string;
  private config: AgentConfig | null = null;

  constructor(projectRoot: string = process.cwd()) {
    this.configPath = path.join(projectRoot, '.myintern', 'agent.yml');
  }

  /**
   * Check if config exists
   */
  exists(): boolean {
    return fs.existsSync(this.configPath);
  }

  /**
   * Load config from agent.yml
   */
  load(): AgentConfig {
    if (!this.exists()) {
      throw new Error('MyIntern not initialized. Run: myintern init');
    }

    const content = fs.readFileSync(this.configPath, 'utf-8');
    const rawConfig = yaml.load(content) as any;

    // Resolve environment variables
    const resolvedConfig = this.resolveEnvVars(rawConfig);
    this.config = resolvedConfig;

    return resolvedConfig;
  }

  /**
   * Save config to agent.yml
   */
  save(config: AgentConfig): void {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.configPath, yaml.dump(config), 'utf-8');
    this.config = config;
  }

  /**
   * Get config value by dot notation (e.g., "llm.provider")
   */
  get(key: string): any {
    if (!this.config) this.load();

    const keys = key.split('.');
    let value: any = this.config;

    for (const k of keys) {
      value = value?.[k];
    }

    return value;
  }

  /**
   * Validate config against schema
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.config) {
      try {
        this.load();
      } catch (error: any) {
        return { valid: false, errors: [error.message] };
      }
    }

    const cfg = this.config!;

    // Validate version
    if (!cfg.version || cfg.version !== '1.0') {
      errors.push('Config version must be "1.0"');
    }

    // Validate LLM config
    if (!cfg.llm) {
      errors.push('Missing "llm" configuration');
    } else {
      if (!['anthropic', 'openai', 'bedrock'].includes(cfg.llm.provider)) {
        errors.push('Invalid llm.provider (must be: anthropic, openai, bedrock)');
      }

      // API key validation - not required for bedrock with profile
      if (cfg.llm.provider === 'bedrock') {
        // For bedrock, either api_key or aws_profile or aws_access_key_id must be provided
        if (!cfg.llm.api_key && !cfg.llm.aws_profile && !cfg.llm.aws_access_key_id) {
          errors.push('For bedrock provider, you must provide either: llm.api_key (for env vars), llm.aws_profile (for SSO), or llm.aws_access_key_id/llm.aws_secret_access_key (for explicit credentials)');
        }
        // If using explicit credentials, both keys must be present
        if (cfg.llm.aws_access_key_id && !cfg.llm.aws_secret_access_key) {
          errors.push('llm.aws_secret_access_key is required when llm.aws_access_key_id is provided');
        }
        if (cfg.llm.aws_secret_access_key && !cfg.llm.aws_access_key_id) {
          errors.push('llm.aws_access_key_id is required when llm.aws_secret_access_key is provided');
        }
      } else {
        // For anthropic and openai, api_key is required
        if (!cfg.llm.api_key) {
          errors.push('Missing llm.api_key');
        }
      }

      if (!cfg.llm.model) {
        errors.push('Missing llm.model');
      } else {
        // Validate model for provider
        const validModels = SUPPORTED_MODELS[cfg.llm.provider as keyof typeof SUPPORTED_MODELS];
        if (validModels && !(validModels as readonly string[]).includes(cfg.llm.model)) {
          errors.push(
            `Invalid model "${cfg.llm.model}" for ${cfg.llm.provider}. ` +
            `Supported: ${validModels.join(', ')}`
          );
        }
      }
    }

    // Validate Java config
    if (!cfg.java) {
      errors.push('Missing "java" configuration');
    } else {
      if (!cfg.java.version) {
        errors.push('Missing java.version');
      }
    }

    // Validate agents
    if (!cfg.agents) {
      errors.push('Missing "agents" configuration');
    } else {
      if (typeof cfg.agents.code !== 'boolean') {
        errors.push('agents.code must be boolean');
      }
      if (typeof cfg.agents.test !== 'boolean') {
        errors.push('agents.test must be boolean');
      }
      if (typeof cfg.agents.build !== 'boolean') {
        errors.push('agents.build must be boolean');
      }
      if (cfg.agents.max_parallel !== undefined) {
        if (typeof cfg.agents.max_parallel !== 'number') {
          errors.push('agents.max_parallel must be a number');
        } else if (cfg.agents.max_parallel < 1) {
          errors.push('agents.max_parallel must be at least 1');
        } else if (cfg.agents.max_parallel > 10) {
          errors.push('agents.max_parallel cannot exceed 10 (to prevent resource exhaustion)');
        }
      }
    }

    // Validate watch paths
    if (!cfg.watch || !Array.isArray(cfg.watch.paths) || cfg.watch.paths.length === 0) {
      errors.push('watch.paths must be a non-empty array');
    }

    // Validate build config
    if (!cfg.build || !cfg.build.tool) {
      errors.push('Missing build.tool');
    }

    if (!['maven', 'gradle'].includes(cfg.build?.tool)) {
      errors.push('build.tool must be "maven" or "gradle" for Java projects');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get default config template for Java/Spring Boot
   */
  static getDefaultConfig(): AgentConfig {
    return {
      version: '1.0',

      llm: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        api_key: '${ANTHROPIC_API_KEY}'
      },

      java: {
        version: '17',
        spring_boot_version: '3.2.0'
      },

      agents: {
        code: true,
        test: true,
        build: true,
        max_parallel: 3  // Max 3 specs in parallel by default
      },

      watch: {
        paths: ['.myintern/specs/**/*.md', 'src/**/*.java'],
        ignore: ['target/', '.git/', '.myintern/logs/'],
        debounce_ms: 2000
      },

      build: {
        tool: 'maven',
        commands: {
          compile: 'mvn compile',
          test: 'mvn test',
          package: 'mvn package -DskipTests'
        }
      },

      git: {
        protected_branches: ['main', 'master', 'production'],
        auto_commit: false,
        branch_prefix: 'myintern/'
      },

      safety: {
        backward_compatibility: true,
        run_regression_tests: true
      },

      preview: {
        enabled: true,
        show_diffs: true,
        require_approval: false
      },

      feedback: {
        enabled: true,
        auto_learn: true
      },

      github: {
        enabled: false,
        sync_labels: ['myintern'],
        auto_close: false
      }
    };
  }

  /**
   * Get available models for a provider
   */
  static getModelsForProvider(provider: 'anthropic' | 'openai'): string[] {
    return [...SUPPORTED_MODELS[provider]];
  }

  /**
   * Resolve environment variable references in config
   * Example: ${ANTHROPIC_API_KEY} → actual value from process.env
   */
  private resolveEnvVars(config: any): any {
    if (typeof config === 'string') {
      // Match ${VAR_NAME} pattern
      const match = config.match(/^\$\{(.+)\}$/);
      if (match) {
        const envVar = match[1];
        const value = process.env[envVar];

        if (!value) {
          throw new Error(
            `Environment variable ${envVar} not found. Please set it before running myintern.`
          );
        }

        return value;
      }
      return config;
    }

    if (Array.isArray(config)) {
      return config.map(item => this.resolveEnvVars(item));
    }

    if (typeof config === 'object' && config !== null) {
      const resolved: any = {};
      for (const key in config) {
        resolved[key] = this.resolveEnvVars(config[key]);
      }
      return resolved;
    }

    return config;
  }
}
