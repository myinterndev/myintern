/**
 * CI Output Formatter
 *
 * Generates newline-delimited JSON (NDJSON) output for CI/CD integration.
 * Provides structured exit codes and batch summaries.
 */

export interface SpecCompleteEvent {
  event: 'spec_complete';
  spec: string;
  jira_ticket?: string;
  status: 'success' | 'failed' | 'skipped';
  duration_ms: number;
  files_generated?: string[];
  build_status?: 'passed' | 'failed' | 'skipped';
  test_status?: 'passed' | 'failed' | 'skipped';
  review_violations?: number;
  pr?: {
    url: string;
    number: number;
  };
  retries?: number;
  error?: string;
}

export interface BatchCompleteEvent {
  event: 'batch_complete';
  total_specs: number;
  succeeded: number;
  failed: number;
  skipped: number;
  duration_ms: number;
  exit_code: number;
  failed_specs: string[];
  prs_created?: number[];
}

export interface SpecStartEvent {
  event: 'spec_start';
  spec: string;
  timestamp: string;
}

export interface ProgressEvent {
  event: 'progress';
  spec: string;
  stage: 'code' | 'review' | 'test' | 'build' | 'pr';
  message: string;
}

export type CIEvent = SpecCompleteEvent | BatchCompleteEvent | SpecStartEvent | ProgressEvent;

export class CIOutputFormatter {
  private events: CIEvent[] = [];
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Emit a spec start event
   */
  emitSpecStart(spec: string): void {
    const event: SpecStartEvent = {
      event: 'spec_start',
      spec,
      timestamp: new Date().toISOString(),
    };

    this.writeEvent(event);
  }

  /**
   * Emit a progress event
   */
  emitProgress(spec: string, stage: ProgressEvent['stage'], message: string): void {
    const event: ProgressEvent = {
      event: 'progress',
      spec,
      stage,
      message,
    };

    this.writeEvent(event);
  }

  /**
   * Emit a spec complete event
   */
  emitSpecComplete(result: Omit<SpecCompleteEvent, 'event'>): void {
    const event: SpecCompleteEvent = {
      event: 'spec_complete',
      ...result,
    };

    this.writeEvent(event);
  }

  /**
   * Emit a batch complete event (final summary)
   */
  emitBatchComplete(summary: Omit<BatchCompleteEvent, 'event' | 'duration_ms'>): void {
    const event: BatchCompleteEvent = {
      event: 'batch_complete',
      ...summary,
      duration_ms: Date.now() - this.startTime,
    };

    this.writeEvent(event);
  }

  /**
   * Write an event to stdout as JSON
   */
  private writeEvent(event: CIEvent): void {
    this.events.push(event);
    console.log(JSON.stringify(event));
  }

  /**
   * Get all emitted events (for testing)
   */
  getEvents(): CIEvent[] {
    return [...this.events];
  }

  /**
   * Determine exit code from batch results
   */
  static getExitCode(results: {
    total: number;
    succeeded: number;
    failed: number;
    skipped: number;
  }): number {
    // All specs passed
    if (results.failed === 0 && results.succeeded === results.total) {
      return 0; // SUCCESS
    }

    // All specs failed
    if (results.failed === results.total && results.succeeded === 0) {
      return 1; // FAILURE
    }

    // No specs found
    if (results.total === 0) {
      return 3; // NO_SPECS
    }

    // Partial success (some passed, some failed)
    if (results.succeeded > 0 && results.failed > 0) {
      return 5; // PARTIAL
    }

    // All skipped (edge case)
    if (results.skipped === results.total) {
      return 3; // NO_SPECS (treat as warning)
    }

    return 1; // Default to failure
  }

  /**
   * Create a batch summary from individual spec results
   */
  static createBatchSummary(
    specs: Array<{
      spec: string;
      status: 'success' | 'failed' | 'skipped';
      pr?: { number: number };
    }>
  ): Omit<BatchCompleteEvent, 'event' | 'duration_ms'> {
    const succeeded = specs.filter(s => s.status === 'success').length;
    const failed = specs.filter(s => s.status === 'failed').length;
    const skipped = specs.filter(s => s.status === 'skipped').length;

    const failedSpecs = specs
      .filter(s => s.status === 'failed')
      .map(s => s.spec);

    const prsCreated = specs
      .filter(s => s.pr)
      .map(s => s.pr!.number);

    const exitCode = CIOutputFormatter.getExitCode({
      total: specs.length,
      succeeded,
      failed,
      skipped,
    });

    return {
      total_specs: specs.length,
      succeeded,
      failed,
      skipped,
      exit_code: exitCode,
      failed_specs: failedSpecs,
      prs_created: prsCreated.length > 0 ? prsCreated : undefined,
    };
  }
}
