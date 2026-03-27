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

export interface RepoConfig {
  name: string;
  path: string;
  language?: string; // java, typescript, python, etc.
  build_tool?: 'maven' | 'gradle' | 'npm' | 'yarn' | 'pip' | 'poetry';
}

export interface AgentConfig {
  version: string;

  // BYOK — Bring Your Own Key
  llm: {
    provider: 'anthropic' | 'openai' | 'bedrock' | 'claude-cli';
    model: string; // Must be from SUPPORTED_MODELS
    api_key?: string; // env var reference like ${ANTHROPIC_API_KEY} (not required for bedrock with profile or claude-cli)
    // AWS Bedrock specific options
    aws_region?: string; // AWS region for Bedrock (e.g., 'us-east-1')
    aws_profile?: string; // AWS SSO profile/session name (e.g., '${AWS_PROFILE}')
    aws_access_key_id?: string; // Alternative to profile: explicit AWS credentials
    aws_secret_access_key?: string; // Alternative to profile: explicit AWS credentials
  };

  // Multi-repo support (optional - for monorepo/microservices)
  repos?: RepoConfig[];

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
    review?: boolean;
    review_auto_fix?: boolean;
    max_review_fix_rounds?: number;
    max_parallel?: number;  // Max parallel spec executions (default: 3)

    // Pipeline configuration (NEW in v1.3)
    pipeline?: {
      stages?: string[];  // e.g., ['code', 'review', 'test', 'build', 'pr']
      review_gate?: boolean;  // Block on review violations
      review_auto_fix?: boolean;  // Auto-fix review violations
      max_review_fix_rounds?: number;  // Max review → fix loops
      on_max_rounds_exceeded?: 'fail' | 'warn_and_continue' | 'notify';
      test_coverage_threshold?: number;  // Minimum test coverage %
      build_retry_max?: number;  // Max build retries
    };
  };

  // Watch configuration
  watch: {
    auto_discover?: boolean; // Auto-discover source files in repos (default: true)
    paths?: string[];        // Manual paths (optional if auto_discover is true)
    ignore: string[];        // Ignore patterns (glob or regex)
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
    auto_branch: boolean;         // NEW: Enable auto branch creation (default: false)
    branch_prefix?: string;       // Used only if auto_branch: true
    auto_commit: boolean;
    auto_pr: boolean;             // NEW: Enable auto PR creation (default: false)
    pr_base_branch?: string;      // NEW: Which branch to PR against (default: main)
    pr_template?: string;         // NEW: PR description template
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

  // Guardrails - Sensitive data detection (PII, PHI, credentials)
  guardrails?: {
    enabled: boolean;          // Enable/disable sensitive data detection
    mode: 'mask' | 'hash' | 'skip' | 'none'; // Redaction strategy
    stopOnCritical: boolean;   // Stop execution on critical violations
    categories: {
      pii: boolean;            // SSN, credit cards, phone numbers
      phi: boolean;            // Medical records, patient IDs (HIPAA)
      credentials: boolean;    // API keys, passwords, private keys
      custom: boolean;         // User-defined patterns
    };
    customPatterns?: Array<{
      name: string;
      regex: string;           // Regex pattern as string (will be converted to RegExp)
      level: 'info' | 'warn' | 'block' | 'critical';
      category: 'pii' | 'phi' | 'credential' | 'custom';
      description?: string;
    }>;
    whitelist?: string[];      // File paths to skip scanning (glob patterns)
  };

  // Failure handling (NEW in v1.2)
  failure?: {
    auto_rollback?: boolean;        // Auto-rollback files after 3 failed retries (default: true)
    notify_on_failure?: boolean;    // Log failures to console (default: true)
    max_failed_specs?: number;      // Stop watching after N consecutive failures (default: 5)
  };

  // CI/CD configuration (NEW in v1.3)
  ci?: {
    auto_detect?: boolean;          // Auto-detect CI environment (default: true)
    json_output?: boolean;          // JSON output to stdout in CI (default: true)
    timeout_per_spec?: number;      // Timeout per spec in seconds (default: 300)
    fail_fast?: boolean;            // Stop on first failure (default: false)
    audit?: {
      enabled?: boolean;            // Write audit JSONL in CI mode (default: true)
      output_dir?: string;          // Audit log directory (default: .myintern/logs)
      log_prompt_hashes?: boolean;  // Log SHA-256 of prompts (default: true)
      log_token_counts?: boolean;   // Log token usage (default: true)
    };
    exit_codes?: {
      success?: number;             // Exit code for success (default: 0)
      failure?: number;             // Exit code for failure (default: 1)
      config_error?: number;        // Exit code for config error (default: 2)
      no_specs?: number;            // Exit code for no specs found (default: 3)
      timeout?: number;             // Exit code for timeout (default: 4)
      partial?: number;             // Exit code for partial success (default: 5)
    };
  };

  // MCP (Model Context Protocol) integrations (NEW in v1.2)
  mcp?: {
    servers?: {
      jira?: {
        enabled: boolean;             // Enable Jira MCP integration
        host: string;                 // Jira instance URL (e.g., "https://yourcompany.atlassian.net")
        access_token?: string;        // Jira API token (use env var: ${JIRA_ACCESS_TOKEN})
        project_key?: string;         // Default project key (optional)
        issue_type?: string;          // Default issue type filter (optional)
        auto_sync?: boolean;          // Auto-sync tickets to specs (optional, default: false)
        sync_labels?: string[];       // Label filter for sync (optional)
      };

      github?: {
        enabled: boolean;                     // Enable GitHub MCP integration
        transport: 'stdio' | 'sse' | 'tcp';   // Transport type

        // stdio transport (recommended for official MCP server)
        command?: string;
        args?: string[];
        env?: Record<string, string>;

        // tcp / sse transport
        host?: string;
        port?: number;
        access_token?: string;

        pr?: {
          base_branch?: string;
          auto_create?: boolean;
          auto_merge?: boolean;
          draft?: boolean;
          reviewers?: string[];
          labels?: string[];
          template?: string;
        };

        actions?: {
          trigger_on_pr?: boolean;
          wait_for_checks?: boolean;
          check_timeout_ms?: number;
          auto_fix_on_failure?: boolean;
        };

        reviews?: {
          respond_to_comments?: boolean;
          auto_resolve?: boolean;
          max_review_rounds?: number;
          on_max_rounds_exceeded?: 'fail_pr' | 'leave_open' | 'notify';
        };

        rate_limit?: {
          max_requests_per_minute?: number;
          retry_after_ms?: number;
          shared_budget?: boolean;
        };
      };
    };
  };

  // Runtime monitoring (NEW in Phase 1)
  runtime?: {
    enabled: boolean;
    environment: 'production' | 'staging' | 'development';
    phase: 1 | 2;
    cloudwatch: {
      enabled: boolean;
      region: string;
      logGroups: string[];
      pollInterval: number;
      errorPatterns: Array<{
        pattern: string;
        severity: 'critical' | 'high' | 'medium' | 'low';
      }>;
    };
    deduplication: {
      enabled: boolean;
      window: string;
      maxSpecsPerError: number;
      cacheBackend: 'sqlite' | 'redis';
      cachePath: string;
    };
    severityRules: {
      critical: {
        autoFix: boolean;
        requireApproval: boolean;
        maxPerDay: number;
        createSpec?: boolean;
      };
      high: {
        autoFix: boolean;
        requireApproval: boolean;
        maxPerDay: number;
        createSpec?: boolean;
      };
      medium: {
        autoFix: boolean;
        requireApproval: boolean;
        maxPerDay: number;
        createSpec?: boolean;
      };
      low: {
        autoFix: boolean;
        requireApproval: boolean;
        maxPerDay: number;
        createSpec?: boolean;
      };
    };
    rateLimiting: {
      maxSpecsPerHour: number;
      maxApiCallsPerHour: number;
    };
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
      if (!['anthropic', 'openai', 'bedrock', 'claude-cli'].includes(cfg.llm.provider)) {
        errors.push('Invalid llm.provider (must be: anthropic, openai, bedrock, claude-cli)');
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
      } else if (cfg.llm.provider === 'claude-cli') {
        // Claude CLI uses OAuth - no API key needed
        // User must have Claude Code CLI installed and authenticated
      } else {
        // For anthropic, api_key is optional (SDK auto-discovers from env or Claude CLI)
        // For openai, api_key is required
        if (cfg.llm.provider === 'openai' && !cfg.llm.api_key) {
          errors.push('Missing llm.api_key (required for OpenAI provider)');
        }
        // For Anthropic: if no api_key, SDK will auto-discover from:
        // 1. ANTHROPIC_API_KEY env var
        // 2. Claude CLI OAuth session (if available)
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

    // Validate watch paths (optional if auto_discover is enabled)
    if (!cfg.watch) {
      errors.push('Missing "watch" configuration');
    } else {
      const hasAutoDis = cfg.watch.auto_discover === true;
      const hasPaths = Array.isArray(cfg.watch.paths) && cfg.watch.paths.length > 0;

      if (!hasAutoDis && !hasPaths) {
        errors.push('watch.paths must be a non-empty array when auto_discover is disabled');
      }
    }

    // Validate build config
    if (!cfg.build || !cfg.build.tool) {
      errors.push('Missing build.tool');
    }

    if (!['maven', 'gradle'].includes(cfg.build?.tool)) {
      errors.push('build.tool must be "maven" or "gradle" for Java projects');
    }

    // Validate MCP config (optional)
    if (cfg.mcp?.servers?.jira) {
      const jira = cfg.mcp.servers.jira;

      if (typeof jira.enabled !== 'boolean') {
        errors.push('mcp.servers.jira.enabled must be boolean');
      }

      if (jira.enabled) {
        if (!jira.host) {
          errors.push('mcp.servers.jira.host is required when Jira MCP is enabled');
        }

        if (!jira.access_token) {
          errors.push('mcp.servers.jira.access_token is required when Jira MCP is enabled');
        }
      }
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
        review: true,
        max_parallel: 3,  // Max 3 specs in parallel by default
        review_auto_fix: true,
        max_review_fix_rounds: 2
      },

      watch: {
        auto_discover: true,
        paths: ['.myintern/specs/**/*.md'],
        ignore: ['target/', '.git/', '.myintern/logs/', 'node_modules/', 'build/', 'dist/', '**/*.class'],
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
        auto_branch: false,         // User manages branches by default
        branch_prefix: 'myintern/', // Used only if auto_branch: true
        auto_commit: false,
        auto_pr: false,             // User creates PRs manually by default
        pr_base_branch: 'main'
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
      },

      guardrails: {
        enabled: true,
        mode: 'mask',
        stopOnCritical: true,
        categories: {
          pii: true,
          phi: true,
          credentials: true,
          custom: false
        },
        whitelist: [
          '**/*.test.java',
          '**/test-data/**',
          '**/.myintern/practices/*',
          '**/README.md'
        ]
      },

      failure: {
        auto_rollback: true,        // Auto-rollback after 3 failed retries
        notify_on_failure: true,    // Log failures
        max_failed_specs: 5         // Stop watching after 5 consecutive failures
      },

      mcp: {
        servers: {
          jira: {
            enabled: false,                   // Enable when ready to use
            host: 'localhost',                // MCP server host
            // access_token: '${JIRA_ACCESS_TOKEN}', // Uncomment and set when enabling Jira
            project_key: '',                  // Optional: default project
            auto_sync: false                  // Optional: auto-sync tickets
          }
        }
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
