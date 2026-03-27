import { DaemonOrchestrator } from '../../runtime/DaemonOrchestrator';
import { ConfigManager } from '../../core/ConfigManager';
import * as fs from 'fs/promises';

/**
 * myintern daemon command
 */
export async function daemonCommand(options: any): Promise<void> {
  const { runtime, background, stop, status } = options;

  // Handle stop command
  if (stop) {
    await stopDaemon();
    return;
  }

  // Handle status command
  if (status) {
    await showStatus();
    return;
  }

  // Start daemon
  if (!runtime) {
    console.error('❌ Use --runtime flag to start runtime monitoring mode');
    process.exit(1);
  }

  // Load config
  const configManager = new ConfigManager();
  const config = configManager.load();

  if (!config.runtime || !config.runtime.enabled) {
    console.error('❌ Runtime monitoring not enabled in .myintern/agent.yml');
    process.exit(1);
  }

  // Validate production safety rules
  if (config.runtime.environment === 'production') {
    validateProductionSafety(config.runtime);
  }

  // Create orchestrator
  const orchestrator = new DaemonOrchestrator(config.runtime);

  // Start in foreground (background mode not implemented in v1.0)
  if (background) {
    console.error('❌ Background mode not implemented yet.');
    console.error('   Use a process manager instead: nohup myintern daemon --runtime &');
    console.error('   Or: pm2 start "myintern daemon --runtime" --name myintern-daemon');
    process.exit(1);
  }

  await orchestrator.start();
}

/**
 * Validate production safety rules
 */
function validateProductionSafety(config: any): void {
  const errors: string[] = [];

  if (!config.deduplication.enabled) {
    errors.push('deduplication must be enabled for production');
  }

  if (config.severityRules.critical && !config.severityRules.critical.requireApproval) {
    errors.push('require_approval must be true for critical severity in production');
  }

  if (config.rateLimiting.maxSpecsPerHour > 10) {
    errors.push('rate limit too high (max 10 specs/hour for production)');
  }

  if (errors.length > 0) {
    console.error('❌ Production safety violations:');
    errors.forEach(err => console.error(`   - ${err}`));
    process.exit(1);
  }
}

/**
 * Stop daemon
 */
async function stopDaemon(): Promise<void> {
  try {
    const pidFile = '.myintern/.daemon.pid';
    const pidStr = await fs.readFile(pidFile, 'utf-8');
    const pid = parseInt(pidStr.trim(), 10);

    process.kill(pid, 'SIGTERM');
    console.log(`✅ Daemon stopped (PID: ${pid})`);
  } catch (error: any) {
    console.error('❌ Failed to stop daemon:', error.message);
    process.exit(1);
  }
}

/**
 * Show daemon status
 */
async function showStatus(): Promise<void> {
  try {
    const statusFile = '.myintern/.daemon.status.json';
    const statusStr = await fs.readFile(statusFile, 'utf-8');
    const status = JSON.parse(statusStr);

    if (status.running) {
      console.log('✅ Daemon running');
      console.log(`   PID: ${status.pid}`);
      console.log(`   Uptime: ${formatUptime(status.uptime)}`);
      console.log(`   Specs created: ${status.specsCreated}`);
      console.log(`   Errors seen: ${status.errorsSeen}`);
      console.log(`   Errors deduplicated: ${status.errorsDeduplicated}`);
    } else {
      console.log('⏹️  Daemon stopped');
    }
  } catch (error: any) {
    console.log('⏹️  Daemon not running');
  }
}

/**
 * Format uptime
 */
function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}
