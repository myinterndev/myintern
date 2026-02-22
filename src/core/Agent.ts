import { EventEmitter } from 'events';
import { ConfigManager } from './Config';
import { Logger } from './Logger';

export abstract class Agent extends EventEmitter {
  protected config: ConfigManager;
  protected logger: Logger;
  protected running: boolean = false;

  constructor(protected name: string) {
    super();
    this.config = new ConfigManager();
    this.logger = new Logger(name);
  }

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;

  isRunning(): boolean {
    return this.running;
  }

  protected log(message: string, level: 'info' | 'error' | 'warn' = 'info'): void {
    this.logger[level](message);
    this.emit('log', { level, message });
  }
}
