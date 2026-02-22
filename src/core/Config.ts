import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface MyInternConfig {
  ai: {
    provider: 'anthropic' | 'openai' | 'local';
    apiKey: string;
    model: string;
  };
  build: {
    tool: 'maven' | 'gradle';
    javaVersion?: string;
  };
  agents: {
    code: {
      enabled: boolean;
      autoCommit: boolean;
    };
  };
}

export class ConfigManager {
  private configPath: string;
  private config: MyInternConfig | null = null;

  constructor(projectRoot: string = process.cwd()) {
    this.configPath = path.join(projectRoot, '.myintern', 'config.yml');
  }

  exists(): boolean {
    return fs.existsSync(this.configPath);
  }

  load(): MyInternConfig {
    if (!this.exists()) {
      throw new Error('MyIntern not initialized. Run: myintern init');
    }

    const content = fs.readFileSync(this.configPath, 'utf-8');
    this.config = yaml.load(content) as MyInternConfig;
    return this.config;
  }

  save(config: MyInternConfig): void {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.configPath, yaml.dump(config), 'utf-8');
    this.config = config;
  }

  get(key: string): any {
    if (!this.config) this.load();
    const keys = key.split('.');
    let value: any = this.config;
    for (const k of keys) {
      value = value?.[k];
    }
    return value;
  }

  set(key: string, value: any): void {
    if (!this.config) this.load();
    const keys = key.split('.');
    const lastKey = keys.pop()!;
    let obj: any = this.config;
    for (const k of keys) {
      if (!obj[k]) obj[k] = {};
      obj = obj[k];
    }
    obj[lastKey] = value;
    this.save(this.config!);
  }
}
