import { ConfigManager, AgentConfig } from '../ConfigManager';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';

describe('ConfigManager', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function writeConfig(config: any) {
    const myinternDir = path.join(tempDir, '.myintern');
    fs.mkdirSync(myinternDir, { recursive: true });
    fs.writeFileSync(path.join(myinternDir, 'agent.yml'), yaml.dump(config), 'utf-8');
  }

  function getValidBaseConfig(): any {
    return {
      version: '1.0',
      llm: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        api_key: 'test-key'
      },
      java: { version: '17' },
      agents: { code: true, test: true, build: true },
      watch: {
        auto_discover: true,
        paths: ['.myintern/specs/**/*.md'],
        ignore: ['target/'],
        debounce_ms: 2000
      },
      build: {
        tool: 'maven',
        commands: { compile: 'mvn compile', test: 'mvn test', package: 'mvn package' }
      },
      git: {
        protected_branches: ['main', 'master'],
        auto_branch: false,
        auto_commit: false,
        auto_pr: false
      }
    };
  }

  describe('exists', () => {
    it('should return false when config does not exist', () => {
      const manager = new ConfigManager(tempDir);
      expect(manager.exists()).toBe(false);
    });

    it('should return true when config exists', () => {
      writeConfig(getValidBaseConfig());
      const manager = new ConfigManager(tempDir);
      expect(manager.exists()).toBe(true);
    });
  });

  describe('load', () => {
    it('should throw when config does not exist', () => {
      const manager = new ConfigManager(tempDir);
      expect(() => manager.load()).toThrow('MyIntern not initialized');
    });

    it('should load valid config from agent.yml', () => {
      writeConfig(getValidBaseConfig());
      const manager = new ConfigManager(tempDir);
      const config = manager.load();

      expect(config.version).toBe('1.0');
      expect(config.llm.provider).toBe('anthropic');
      expect(config.llm.model).toBe('claude-sonnet-4-5-20250929');
    });

    it('should resolve environment variable references', () => {
      process.env.TEST_API_KEY = 'resolved-key-value';

      const rawConfig = getValidBaseConfig();
      rawConfig.llm.api_key = '${TEST_API_KEY}';
      writeConfig(rawConfig);

      const manager = new ConfigManager(tempDir);
      const config = manager.load();

      expect(config.llm.api_key).toBe('resolved-key-value');

      delete process.env.TEST_API_KEY;
    });

    it('should throw when referenced env var is missing', () => {
      delete process.env.NONEXISTENT_VAR;

      const rawConfig = getValidBaseConfig();
      rawConfig.llm.api_key = '${NONEXISTENT_VAR}';
      writeConfig(rawConfig);

      const manager = new ConfigManager(tempDir);
      expect(() => manager.load()).toThrow('Environment variable NONEXISTENT_VAR not found');
    });
  });

  describe('save', () => {
    it('should save config to agent.yml', () => {
      const manager = new ConfigManager(tempDir);
      const config = ConfigManager.getDefaultConfig();
      config.llm.api_key = 'test-save-key';

      manager.save(config);

      expect(manager.exists()).toBe(true);
      const reloaded = new ConfigManager(tempDir);
      const loaded = reloaded.load();
      expect(loaded.llm.api_key).toBe('test-save-key');
    });

    it('should create .myintern directory if it does not exist', () => {
      const manager = new ConfigManager(tempDir);
      const config = ConfigManager.getDefaultConfig();
      config.llm.api_key = 'test';

      manager.save(config);

      const myinternDir = path.join(tempDir, '.myintern');
      expect(fs.existsSync(myinternDir)).toBe(true);
    });
  });

  describe('get', () => {
    it('should get value by dot notation', () => {
      writeConfig(getValidBaseConfig());
      const manager = new ConfigManager(tempDir);

      expect(manager.get('llm.provider')).toBe('anthropic');
      expect(manager.get('agents.code')).toBe(true);
      expect(manager.get('build.tool')).toBe('maven');
    });

    it('should return undefined for non-existent key', () => {
      writeConfig(getValidBaseConfig());
      const manager = new ConfigManager(tempDir);

      expect(manager.get('nonexistent.key')).toBeUndefined();
    });
  });

  describe('validate', () => {
    it('should pass for valid config', () => {
      writeConfig(getValidBaseConfig());
      const manager = new ConfigManager(tempDir);
      manager.load();

      const result = manager.validate();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail for invalid version', () => {
      const config = getValidBaseConfig();
      config.version = '2.0';
      writeConfig(config);

      const manager = new ConfigManager(tempDir);
      manager.load();
      const result = manager.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Config version must be "1.0"');
    });

    it('should fail for missing llm config', () => {
      const config = getValidBaseConfig();
      delete config.llm;
      writeConfig(config);

      const manager = new ConfigManager(tempDir);
      manager.load();
      const result = manager.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing "llm" configuration');
    });

    it('should fail for invalid provider', () => {
      const config = getValidBaseConfig();
      config.llm.provider = 'invalid-provider';
      writeConfig(config);

      const manager = new ConfigManager(tempDir);
      manager.load();
      const result = manager.validate();

      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('Invalid llm.provider'))).toBe(true);
    });

    it('should pass for missing api_key on anthropic (auto-discovery)', () => {
      const config = getValidBaseConfig();
      delete config.llm.api_key;  // Anthropic allows auto-discovery from ANTHROPIC_API_KEY env var
      writeConfig(config);

      const manager = new ConfigManager(tempDir);
      manager.load();
      const result = manager.validate();

      // Should pass - Anthropic SDK auto-discovers from ANTHROPIC_API_KEY or Claude CLI
      expect(result.valid).toBe(true);
    });

    it('should fail for invalid model', () => {
      const config = getValidBaseConfig();
      config.llm.model = 'invalid-model';
      writeConfig(config);

      const manager = new ConfigManager(tempDir);
      manager.load();
      const result = manager.validate();

      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('Invalid model'))).toBe(true);
    });

    it('should fail for missing java config', () => {
      const config = getValidBaseConfig();
      delete config.java;
      writeConfig(config);

      const manager = new ConfigManager(tempDir);
      manager.load();
      const result = manager.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing "java" configuration');
    });

    it('should fail when watch.paths empty and auto_discover disabled', () => {
      const config = getValidBaseConfig();
      config.watch.auto_discover = false;
      config.watch.paths = [];
      writeConfig(config);

      const manager = new ConfigManager(tempDir);
      manager.load();
      const result = manager.validate();

      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('watch.paths'))).toBe(true);
    });

    it('should pass when auto_discover is true even without explicit paths', () => {
      const config = getValidBaseConfig();
      config.watch.auto_discover = true;
      delete config.watch.paths;
      writeConfig(config);

      const manager = new ConfigManager(tempDir);
      manager.load();
      const result = manager.validate();

      expect(result.valid).toBe(true);
    });
  });

  describe('validate - agents.max_parallel', () => {
    it('should accept valid max_parallel value', () => {
      const config = getValidBaseConfig();
      config.agents.max_parallel = 5;
      writeConfig(config);

      const manager = new ConfigManager(tempDir);
      manager.load();
      const result = manager.validate();

      expect(result.valid).toBe(true);
    });

    it('should reject max_parallel less than 1', () => {
      const config = getValidBaseConfig();
      config.agents.max_parallel = 0;
      writeConfig(config);

      const manager = new ConfigManager(tempDir);
      manager.load();
      const result = manager.validate();

      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('max_parallel must be at least 1'))).toBe(true);
    });

    it('should reject max_parallel greater than 10', () => {
      const config = getValidBaseConfig();
      config.agents.max_parallel = 15;
      writeConfig(config);

      const manager = new ConfigManager(tempDir);
      manager.load();
      const result = manager.validate();

      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('cannot exceed 10'))).toBe(true);
    });
  });

  describe('validate - bedrock provider', () => {
    it('should accept bedrock with aws_profile', () => {
      const config = getValidBaseConfig();
      config.llm.provider = 'bedrock';
      config.llm.model = 'anthropic.claude-sonnet-4-5-v1:0';
      config.llm.aws_profile = 'my-sso-profile';
      delete config.llm.api_key;
      writeConfig(config);

      const manager = new ConfigManager(tempDir);
      manager.load();
      const result = manager.validate();

      expect(result.valid).toBe(true);
    });

    it('should accept bedrock with explicit AWS credentials', () => {
      const config = getValidBaseConfig();
      config.llm.provider = 'bedrock';
      config.llm.model = 'anthropic.claude-sonnet-4-5-v1:0';
      config.llm.aws_access_key_id = 'AKIATEST';
      config.llm.aws_secret_access_key = 'secret123';
      delete config.llm.api_key;
      writeConfig(config);

      const manager = new ConfigManager(tempDir);
      manager.load();
      const result = manager.validate();

      expect(result.valid).toBe(true);
    });

    it('should fail bedrock without any auth method', () => {
      const config = getValidBaseConfig();
      config.llm.provider = 'bedrock';
      config.llm.model = 'anthropic.claude-sonnet-4-5-v1:0';
      delete config.llm.api_key;
      writeConfig(config);

      const manager = new ConfigManager(tempDir);
      manager.load();
      const result = manager.validate();

      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('bedrock'))).toBe(true);
    });

    it('should fail bedrock with only access key (missing secret)', () => {
      const config = getValidBaseConfig();
      config.llm.provider = 'bedrock';
      config.llm.model = 'anthropic.claude-sonnet-4-5-v1:0';
      config.llm.aws_access_key_id = 'AKIATEST';
      delete config.llm.api_key;
      writeConfig(config);

      const manager = new ConfigManager(tempDir);
      manager.load();
      const result = manager.validate();

      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('aws_secret_access_key'))).toBe(true);
    });
  });

  describe('new config schema fields - git workflow', () => {
    it('should load git.auto_branch config', () => {
      const config = getValidBaseConfig();
      config.git.auto_branch = true;
      config.git.branch_prefix = 'myintern/';
      writeConfig(config);

      const manager = new ConfigManager(tempDir);
      const loaded = manager.load();

      expect(loaded.git.auto_branch).toBe(true);
      expect(loaded.git.branch_prefix).toBe('myintern/');
    });

    it('should load git.auto_pr config', () => {
      const config = getValidBaseConfig();
      config.git.auto_pr = true;
      config.git.pr_base_branch = 'develop';
      config.git.pr_template = '## PR for {{spec_name}}';
      writeConfig(config);

      const manager = new ConfigManager(tempDir);
      const loaded = manager.load();

      expect(loaded.git.auto_pr).toBe(true);
      expect(loaded.git.pr_base_branch).toBe('develop');
      expect(loaded.git.pr_template).toBe('## PR for {{spec_name}}');
    });

    it('should default auto_branch and auto_pr to false', () => {
      const defaultConfig = ConfigManager.getDefaultConfig();

      expect(defaultConfig.git.auto_branch).toBe(false);
      expect(defaultConfig.git.auto_pr).toBe(false);
    });

    it('should default pr_base_branch to main', () => {
      const defaultConfig = ConfigManager.getDefaultConfig();

      expect(defaultConfig.git.pr_base_branch).toBe('main');
    });

    it('should include branch_prefix in defaults', () => {
      const defaultConfig = ConfigManager.getDefaultConfig();

      expect(defaultConfig.git.branch_prefix).toBe('myintern/');
    });
  });

  describe('new config schema fields - failure handling', () => {
    it('should load failure config', () => {
      const config = getValidBaseConfig();
      config.failure = {
        auto_rollback: true,
        notify_on_failure: true,
        max_failed_specs: 10
      };
      writeConfig(config);

      const manager = new ConfigManager(tempDir);
      const loaded = manager.load();

      expect(loaded.failure).toBeDefined();
      expect(loaded.failure!.auto_rollback).toBe(true);
      expect(loaded.failure!.notify_on_failure).toBe(true);
      expect(loaded.failure!.max_failed_specs).toBe(10);
    });

    it('should have failure defaults in default config', () => {
      const defaultConfig = ConfigManager.getDefaultConfig();

      expect(defaultConfig.failure).toBeDefined();
      expect(defaultConfig.failure!.auto_rollback).toBe(true);
      expect(defaultConfig.failure!.notify_on_failure).toBe(true);
      expect(defaultConfig.failure!.max_failed_specs).toBe(5);
    });
  });

  describe('new config schema fields - guardrails', () => {
    it('should load guardrails config with all options', () => {
      const config = getValidBaseConfig();
      config.guardrails = {
        enabled: true,
        mode: 'hash',
        stopOnCritical: false,
        categories: {
          pii: true,
          phi: false,
          credentials: true,
          custom: true
        },
        whitelist: ['**/*.test.java'],
        customPatterns: [
          {
            name: 'Employee ID',
            regex: '\\bEMP-\\d{6}\\b',
            level: 'warn',
            category: 'custom'
          }
        ]
      };
      writeConfig(config);

      const manager = new ConfigManager(tempDir);
      const loaded = manager.load();

      expect(loaded.guardrails).toBeDefined();
      expect(loaded.guardrails!.mode).toBe('hash');
      expect(loaded.guardrails!.stopOnCritical).toBe(false);
      expect(loaded.guardrails!.categories.phi).toBe(false);
      expect(loaded.guardrails!.customPatterns).toHaveLength(1);
      expect(loaded.guardrails!.customPatterns![0].name).toBe('Employee ID');
    });

    it('should have guardrails defaults enabled', () => {
      const defaultConfig = ConfigManager.getDefaultConfig();

      expect(defaultConfig.guardrails).toBeDefined();
      expect(defaultConfig.guardrails!.enabled).toBe(true);
      expect(defaultConfig.guardrails!.mode).toBe('mask');
      expect(defaultConfig.guardrails!.stopOnCritical).toBe(true);
    });
  });

  describe('new config schema fields - repos', () => {
    it('should load multi-repo config', () => {
      const config = getValidBaseConfig();
      config.repos = [
        { name: 'api-service', path: './api-service', language: 'java', build_tool: 'maven' },
        { name: 'web-service', path: './web-service', language: 'java', build_tool: 'gradle' }
      ];
      writeConfig(config);

      const manager = new ConfigManager(tempDir);
      const loaded = manager.load();

      expect(loaded.repos).toBeDefined();
      expect(loaded.repos).toHaveLength(2);
      expect(loaded.repos![0].name).toBe('api-service');
      expect(loaded.repos![1].build_tool).toBe('gradle');
    });
  });

  describe('getDefaultConfig', () => {
    it('should return a complete valid config', () => {
      const config = ConfigManager.getDefaultConfig();

      expect(config.version).toBe('1.0');
      expect(config.llm).toBeDefined();
      expect(config.java).toBeDefined();
      expect(config.agents).toBeDefined();
      expect(config.watch).toBeDefined();
      expect(config.build).toBeDefined();
      expect(config.git).toBeDefined();
      expect(config.safety).toBeDefined();
      expect(config.preview).toBeDefined();
      expect(config.feedback).toBeDefined();
      expect(config.github).toBeDefined();
      expect(config.guardrails).toBeDefined();
      expect(config.failure).toBeDefined();
    });

    it('should include protected branches', () => {
      const config = ConfigManager.getDefaultConfig();

      expect(config.git.protected_branches).toEqual(['main', 'master', 'production']);
    });

    it('should set sensible agent defaults', () => {
      const config = ConfigManager.getDefaultConfig();

      expect(config.agents.code).toBe(true);
      expect(config.agents.test).toBe(true);
      expect(config.agents.build).toBe(true);
      expect(config.agents.max_parallel).toBe(3);
    });
  });

  describe('getModelsForProvider', () => {
    it('should return anthropic models', () => {
      const models = ConfigManager.getModelsForProvider('anthropic');

      expect(models.length).toBeGreaterThan(0);
      expect(models).toContain('claude-sonnet-4-5-20250929');
    });

    it('should return openai models', () => {
      const models = ConfigManager.getModelsForProvider('openai');

      expect(models.length).toBeGreaterThan(0);
      expect(models).toContain('gpt-4o');
    });
  });
});
