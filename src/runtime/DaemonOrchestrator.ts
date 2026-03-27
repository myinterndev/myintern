import * as fs from 'fs/promises';
import * as path from 'path';
import { CloudWatchMonitor } from './CloudWatchMonitor';
import { ErrorParser } from './ErrorParser';
import { ErrorFingerprint } from './ErrorFingerprint';
import { DeduplicationCache } from './DeduplicationCache';
import { SeverityEvaluator } from './SeverityEvaluator';
import { SpecGenerator } from './SpecGenerator';
import { RuntimeConfig, DaemonStatus } from './types';

/**
 * Main daemon orchestrator for runtime monitoring.
 */
export class DaemonOrchestrator {
  private config: RuntimeConfig;
  private monitor: CloudWatchMonitor | null = null;
  private parser: ErrorParser;
  private cache: DeduplicationCache;
  private evaluator: SeverityEvaluator;
  private generator: SpecGenerator;
  private running: boolean = false;
  private startTime: Date | null = null;
  private specsCreated: number = 0;
  private errorsSeen: number = 0;
  private errorsDeduplicated: number = 0;
  private pidFilePath: string = '.myintern/.daemon.pid';
  private statusFilePath: string = '.myintern/.daemon.status.json';

  constructor(config: RuntimeConfig) {
    this.config = config;
    this.parser = new ErrorParser();

    // Cache must be created first (used by evaluator and monitor)
    this.cache = new DeduplicationCache(
      config.deduplication.cachePath,
      this.parseTTL(config.deduplication.window)
    );

    // Monitor initialization deferred to start() (needs lastPollTime from status file)
    // Evaluator needs cache reference for rate limiting
    this.evaluator = new SeverityEvaluator(config, this.cache);
    this.generator = new SpecGenerator();
  }

  /**
   * Start daemon
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new Error('Daemon already running');
    }

    // Validate dependencies (gh CLI, AWS credentials, SQLite)
    await this.validateDependencies();

    // Initialize cache (runs cleanup to remove expired entries)
    await this.cache.init();

    // Load last poll time from status file (if daemon restarted)
    const lastPollTime = await this.loadLastPollTime();

    // Initialize CloudWatch monitor with last poll time
    this.monitor = new CloudWatchMonitor(this.config.cloudwatch, lastPollTime);

    this.running = true;
    this.startTime = new Date();

    // Write PID file
    await this.writePidFile();

    // Register shutdown handlers
    this.registerShutdownHandlers();

    // Print safety checklist
    this.printSafetyChecklist();

    console.log('\n🚀 Starting daemon mode (Phase 1: Local)');
    console.log(`   Environment: ${this.config.environment}`);
    console.log(`   Watching: ${this.config.cloudwatch.logGroups.join(', ')}`);
    console.log(`   Poll interval: ${this.config.cloudwatch.pollInterval}s`);
    console.log(`   Storage: local (.myintern/specs/)\n`);

    // Start polling loop
    await this.runPollingLoop();
  }

  /**
   * Stop daemon
   */
  async stop(): Promise<void> {
    console.log('\n⏹️  Stopping daemon...');
    this.running = false;

    // Cleanup
    this.cache.close();
    await this.removePidFile();
    await this.writeStatusFile({ running: false });

    console.log('✅ Daemon stopped');
  }

  /**
   * Get daemon status
   */
  async getStatus(): Promise<DaemonStatus> {
    const uptime = this.startTime
      ? Math.floor((Date.now() - this.startTime.getTime()) / 1000)
      : undefined;

    return {
      running: this.running,
      pid: process.pid,
      uptime,
      specsCreated: this.specsCreated,
      errorsSeen: this.errorsSeen,
      errorsDeduplicated: this.errorsDeduplicated,
      lastPoll: new Date(),
      lastPollTime: this.monitor ? (this.monitor as any).lastPollTime : undefined,
    };
  }

  /**
   * Main polling loop
   */
  private async runPollingLoop(): Promise<void> {
    while (this.running) {
      try {
        await this.pollAndProcess();
      } catch (error: any) {
        console.error('❌ Error in polling loop:', error.message);
        // Continue running despite errors
      }

      // Sleep for poll interval
      await this.sleep(this.config.cloudwatch.pollInterval * 1000);

      // Periodic cleanup
      if (this.shouldRunCleanup()) {
        await this.runCleanup();
      }
    }
  }

  /**
   * Poll logs and process errors
   */
  private async pollAndProcess(): Promise<void> {
    console.log(`\n📡 [${new Date().toISOString()}] Polling CloudWatch logs...`);

    // Poll logs
    if (!this.monitor) {
      console.error('Monitor not initialized');
      return;
    }

    const events = await this.monitor.pollLogs();
    console.log(`   Found ${events.length} potential errors`);

    // Save poll time to status file (prevents duplicates after restart)
    await this.writeStatusFile(await this.getStatus());

    if (events.length === 0) {
      return;
    }

    this.errorsSeen += events.length;

    // Process each event
    for (const event of events) {
      await this.processEvent(event);
    }
  }

  /**
   * Process single log event
   */
  private async processEvent(event: any): Promise<void> {
    // Parse error
    const error = this.parser.parse(event);
    if (!error) {
      return; // Not a recognizable error
    }

    // Generate fingerprint
    const fingerprintObj = ErrorFingerprint.generateBoth(error);
    const fingerprint = fingerprintObj.full;

    // Check deduplication cache
    if (await this.cache.has(fingerprint)) {
      console.log(`   ⏭️  ${error.errorType} (${fingerprintObj.short}) - DUPLICATE`);
      this.errorsDeduplicated++;
      await this.cache.update(fingerprint);
      return;
    }

    // Evaluate severity (now async - checks SQLite rate limits)
    const evaluation = await this.evaluator.evaluate(error);
    if (evaluation.action !== 'create_spec') {
      console.log(`   ⏭️  ${error.errorType} (${fingerprintObj.short}) - ${evaluation.reason}`);
      return;
    }

    console.log(`   ✅ ${error.errorType} (${fingerprintObj.short}) - NEW`);

    // Add to cache
    await this.cache.add(fingerprint, error);

    // Generate spec
    const spec = await this.generator.generate(error, fingerprint, evaluation.severity);
    await this.cache.markSpecCreated(fingerprint, spec.filePath);

    console.log(`   📝 Spec created: ${spec.filename}`);
    this.specsCreated++;

    // TODO: Trigger CodeAgent pipeline (future)
    console.log(`   🤖 (CodeAgent pipeline would trigger here)`);
  }

  /**
   * Print safety checklist
   */
  private printSafetyChecklist(): void {
    console.log('\n🔒 Safety Checks for Production Environment');
    const approvalRule = this.config.severityRules?.critical ?? this.config.severityRules?.high;
    const requireApproval = approvalRule?.requireApproval ?? false;
    console.log(`  ✅ require_approval: ${requireApproval} (manual PR approval required)`);
    console.log(`  ✅ deduplication: enabled (${this.config.deduplication.window} window)`);
    console.log(`  ✅ rate_limiting: ${this.config.rateLimiting.maxSpecsPerHour} specs/hour max`);
  }

  /**
   * Register shutdown handlers
   */
  private registerShutdownHandlers(): void {
    process.on('SIGINT', () => this.handleShutdown('SIGINT'));
    process.on('SIGTERM', () => this.handleShutdown('SIGTERM'));
  }

  /**
   * Handle shutdown signal
   */
  private async handleShutdown(signal: string): Promise<void> {
    console.log(`\n⚠️  Received ${signal}, finishing current cycle...`);
    await this.stop();
    process.exit(0);
  }

  /**
   * Check if cleanup should run (every hour)
   */
  private shouldRunCleanup(): boolean {
    // Run cleanup every 60 minutes
    return Math.random() < (1 / (3600 / this.config.cloudwatch.pollInterval));
  }

  /**
   * Run periodic cleanup
   */
  private async runCleanup(): Promise<void> {
    console.log('🧹 Running periodic cleanup...');
    const deleted = await this.cache.cleanup();
    console.log(`   Removed ${deleted} expired cache entries`);
  }

  /**
   * Parse TTL string to hours (e.g., "24h" → 24)
   */
  private parseTTL(ttl: string): number {
    const match = ttl.match(/^(\d+)([hd])$/);
    if (!match) {
      return 24; // Default: 24 hours
    }
    const value = parseInt(match[1], 10);
    const unit = match[2];
    return unit === 'd' ? value * 24 : value;
  }

  /**
   * Write PID file
   */
  private async writePidFile(): Promise<void> {
    await fs.mkdir(path.dirname(this.pidFilePath), { recursive: true });
    await fs.writeFile(this.pidFilePath, process.pid.toString(), 'utf-8');
  }

  /**
   * Remove PID file
   */
  private async removePidFile(): Promise<void> {
    try {
      await fs.unlink(this.pidFilePath);
    } catch {
      // Ignore if file doesn't exist
    }
  }

  /**
   * Write status file
   */
  private async writeStatusFile(status: any): Promise<void> {
    await fs.writeFile(
      this.statusFilePath,
      JSON.stringify(status, null, 2),
      'utf-8'
    );
  }

  /**
   * Validate dependencies on startup
   */
  private async validateDependencies(): Promise<void> {
    console.log('🔍 Validating dependencies...');

    // 1. Check gh CLI (required for PR creation)
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      await execAsync('gh --version');
      console.log('   ✅ GitHub CLI (gh) found');
    } catch {
      throw new Error('GitHub CLI (gh) not found. Install: brew install gh');
    }

    // 2. Check AWS credentials (required for CloudWatch) — skip in mock/dev environments
    const usingMockCloudWatch = !!process.env.AWS_ENDPOINT_URL;

    if (usingMockCloudWatch || this.config.environment === 'development') {
      console.log('   ⚠️  Skipping AWS credential validation (using mock CloudWatch endpoint or development environment)');
    } else {
      try {
        const { CloudWatchLogsClient, DescribeLogGroupsCommand } = await import('@aws-sdk/client-cloudwatch-logs');
        const client = new CloudWatchLogsClient({ region: this.config.cloudwatch.region });
        await client.send(new DescribeLogGroupsCommand({ limit: 1 }));
        console.log('   ✅ AWS credentials valid');
      } catch (error: any) {
        throw new Error(`AWS authentication failed: ${error.message}. Run: aws sso login`);
      }
    }

    // 3. Check SQLite database permissions
    const dbPath = path.resolve(this.config.deduplication.cachePath);
    const dbDir = path.dirname(dbPath);
    await fs.mkdir(dbDir, { recursive: true });
    console.log('   ✅ SQLite database accessible');
  }

  /**
   * Load last poll time from status file
   */
  private async loadLastPollTime(): Promise<number | undefined> {
    try {
      const statusStr = await fs.readFile(this.statusFilePath, 'utf-8');
      const status = JSON.parse(statusStr);

      if (status.lastPollTime && typeof status.lastPollTime === 'number') {
        const age = Date.now() - status.lastPollTime;
        const maxAge = 60 * 60 * 1000; // 1 hour

        if (age < maxAge) {
          console.log('   ℹ️  Resuming from last poll time (daemon restarted)');
          return status.lastPollTime;
        } else {
          console.log('   ⚠️  Last poll time too old (> 1 hour), starting fresh');
        }
      }
    } catch {
      // Status file missing or invalid, start fresh
      console.log('   ℹ️  No previous poll time found, starting fresh');
    }

    return undefined;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
