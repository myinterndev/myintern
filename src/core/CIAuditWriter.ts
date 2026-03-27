/**
 * CI Audit Writer
 *
 * Extends AuditLogger with CI-specific event types for compliance.
 * Writes append-only JSONL (newline-delimited JSON) audit trail.
 *
 * Required for HIPAA/PCI-DSS/SOC 2 compliance.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface CIAuditEvent {
  ts: string; // ISO 8601 timestamp
  event:
    | 'spec_start'
    | 'llm_call'
    | 'files_written'
    | 'guardrails_scan'
    | 'review_gate'
    | 'build_result'
    | 'pr_created'
    | 'spec_complete'
    | 'conflict_resolution';
  spec?: string;
  [key: string]: any; // Allow additional fields
}

export interface LLMCallEvent extends CIAuditEvent {
  event: 'llm_call';
  provider: string;
  model: string;
  input_tokens?: number;
  output_tokens?: number;
  prompt_hash: string; // SHA-256 of prompt (not content)
  spec: string;
}

export interface FilesWrittenEvent extends CIAuditEvent {
  event: 'files_written';
  spec: string;
  files: string[];
  git_sha?: string; // Commit SHA after write
}

export interface GuardrailsScanEvent extends CIAuditEvent {
  event: 'guardrails_scan';
  spec: string;
  violations: number;
  files_scanned: number;
}

export interface ReviewGateEvent extends CIAuditEvent {
  event: 'review_gate';
  spec: string;
  violations: number;
  passed: boolean;
}

export interface BuildResultEvent extends CIAuditEvent {
  event: 'build_result';
  spec: string;
  status: 'passed' | 'failed';
  command: string;
  duration_ms: number;
}

export interface PRCreatedEvent extends CIAuditEvent {
  event: 'pr_created';
  spec: string;
  pr_number: number;
  pr_url: string;
  branch: string;
}

export interface ConflictResolutionEvent extends CIAuditEvent {
  event: 'conflict_resolution';
  strategy: 'manual' | 'llm' | 'fail';
  file: string;
  spec1?: string;
  spec2?: string;
  resolution_hash?: string; // SHA-256 if LLM resolved
}

export class CIAuditWriter {
  private auditFilePath: string;
  private enabled: boolean;

  constructor(
    repoPath: string,
    private config?: {
      enabled?: boolean;
      output_dir?: string;
      log_prompt_hashes?: boolean;
      log_token_counts?: boolean;
    }
  ) {
    this.enabled = config?.enabled !== false; // Default: true

    const outputDir = config?.output_dir || path.join(repoPath, '.myintern', 'logs');

    // Create output directory if it doesn't exist
    if (this.enabled && !fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Generate audit file name with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    this.auditFilePath = path.join(outputDir, `ci-audit-${timestamp}.jsonl`);
  }

  /**
   * Write an audit event to the JSONL file
   */
  log(event: CIAuditEvent): void {
    if (!this.enabled) {
      return;
    }

    const entry = {
      ...event,
      ts: event.ts || new Date().toISOString(),
    };

    try {
      fs.appendFileSync(this.auditFilePath, JSON.stringify(entry) + '\n', 'utf-8');
    } catch (error: any) {
      console.error(`Failed to write audit log: ${error.message}`);
    }
  }

  /**
   * Log an LLM call
   */
  logLLMCall(params: {
    spec: string;
    provider: string;
    model: string;
    prompt: string;
    inputTokens?: number;
    outputTokens?: number;
  }): void {
    if (!this.enabled) {
      return;
    }

    const event: LLMCallEvent = {
      ts: new Date().toISOString(),
      event: 'llm_call',
      spec: params.spec,
      provider: params.provider,
      model: params.model,
      prompt_hash: this.hashContent(params.prompt),
    };

    if (this.config?.log_token_counts && params.inputTokens !== undefined) {
      event.input_tokens = params.inputTokens;
      event.output_tokens = params.outputTokens;
    }

    this.log(event);
  }

  /**
   * Log files written
   */
  logFilesWritten(spec: string, files: string[], gitSha?: string): void {
    this.log({
      ts: new Date().toISOString(),
      event: 'files_written',
      spec,
      files,
      git_sha: gitSha,
    });
  }

  /**
   * Log guardrails scan
   */
  logGuardrailsScan(spec: string, violations: number, filesScanned: number): void {
    this.log({
      ts: new Date().toISOString(),
      event: 'guardrails_scan',
      spec,
      violations,
      files_scanned: filesScanned,
    });
  }

  /**
   * Log review gate result
   */
  logReviewGate(spec: string, violations: number, passed: boolean): void {
    this.log({
      ts: new Date().toISOString(),
      event: 'review_gate',
      spec,
      violations,
      passed,
    });
  }

  /**
   * Log build result
   */
  logBuildResult(spec: string, status: 'passed' | 'failed', command: string, durationMs: number): void {
    this.log({
      ts: new Date().toISOString(),
      event: 'build_result',
      spec,
      status,
      command,
      duration_ms: durationMs,
    });
  }

  /**
   * Log PR created
   */
  logPRCreated(spec: string, prNumber: number, prUrl: string, branch: string): void {
    this.log({
      ts: new Date().toISOString(),
      event: 'pr_created',
      spec,
      pr_number: prNumber,
      pr_url: prUrl,
      branch,
    });
  }

  /**
   * Log conflict resolution
   */
  logConflictResolution(params: {
    strategy: 'manual' | 'llm' | 'fail';
    file: string;
    spec1?: string;
    spec2?: string;
    resolution?: string;
  }): void {
    const event: ConflictResolutionEvent = {
      ts: new Date().toISOString(),
      event: 'conflict_resolution',
      strategy: params.strategy,
      file: params.file,
      spec1: params.spec1,
      spec2: params.spec2,
    };

    if (params.resolution && params.strategy === 'llm') {
      event.resolution_hash = this.hashContent(params.resolution);
    }

    this.log(event);
  }

  /**
   * Hash content with SHA-256
   */
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  /**
   * Get the audit file path
   */
  getAuditFilePath(): string {
    return this.auditFilePath;
  }

  /**
   * Check if audit logging is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
