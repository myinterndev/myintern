import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface AuditEntry {
  audit_id: string;
  session_id: string;
  timestamp: string;
  spec: string;
  jira_ticket?: string;
  llm_provider: string;
  llm_model: string;
  prompt_hash: string;
  prompt_tokens_estimate: number;
  generated_files: string[];
  user: string;
  git_commit: string;
  git_branch: string;
  status: 'success' | 'failed' | 'retry';
  duration_ms: number;
  retry_count?: number;
  error?: string;
}

interface PendingEntry {
  audit_id: string;
  session_id: string;
  start_time: number;
  spec: string;
  jira_ticket?: string;
  llm_provider: string;
  llm_model: string;
  prompt_hash: string;
  prompt_tokens_estimate: number;
  user: string;
  git_commit: string;
  git_branch: string;
}

export class AuditLogger {
  private readonly auditDir: string;
  private readonly auditFile: string;
  private readonly sessionId: string;
  private readonly repoPath: string;
  private pendingEntries: Map<string, PendingEntry> = new Map();

  constructor(repoPath: string = process.cwd()) {
    this.repoPath = repoPath;
    this.auditDir = path.join(repoPath, '.myintern', 'audit');
    this.auditFile = path.join(this.auditDir, 'audit-log.jsonl');
    this.sessionId = this.generateId();
    this.ensureAuditDir();
  }

  /**
   * Begin tracking an LLM call. Returns audit_id to pass to completeEntry().
   */
  startEntry(params: {
    spec: string;
    jira_ticket?: string;
    prompt: string;
    llm_provider: string;
    llm_model: string;
    git_branch: string;
  }): string {
    const audit_id = this.generateId();
    const gitInfo = this.getGitInfo();

    const pending: PendingEntry = {
      audit_id,
      session_id: this.sessionId,
      start_time: Date.now(),
      spec: params.spec,
      jira_ticket: params.jira_ticket,
      llm_provider: params.llm_provider,
      llm_model: params.llm_model,
      prompt_hash: this.hashPrompt(params.prompt),
      prompt_tokens_estimate: this.estimateTokens(params.prompt),
      user: gitInfo.user,
      git_commit: gitInfo.commit,
      git_branch: params.git_branch,
    };

    this.pendingEntries.set(audit_id, pending);
    return audit_id;
  }

  /**
   * Complete a tracked LLM call and flush the audit entry to disk.
   */
  completeEntry(
    audit_id: string,
    result: {
      generated_files: string[];
      status: AuditEntry['status'];
      retry_count?: number;
      error?: string;
    }
  ): void {
    const pending = this.pendingEntries.get(audit_id);
    if (!pending) {
      return;
    }

    const entry: AuditEntry = {
      audit_id: pending.audit_id,
      session_id: pending.session_id,
      timestamp: new Date(pending.start_time).toISOString(),
      spec: pending.spec,
      jira_ticket: pending.jira_ticket,
      llm_provider: pending.llm_provider,
      llm_model: pending.llm_model,
      prompt_hash: pending.prompt_hash,
      prompt_tokens_estimate: pending.prompt_tokens_estimate,
      generated_files: result.generated_files,
      user: pending.user,
      git_commit: pending.git_commit,
      git_branch: pending.git_branch,
      status: result.status,
      duration_ms: Date.now() - pending.start_time,
      retry_count: result.retry_count,
      error: result.error,
    };

    this.appendEntry(entry);
    this.pendingEntries.delete(audit_id);
  }

  /**
   * Query audit entries with optional filters.
   */
  query(filters: {
    spec?: string;
    file?: string;
    status?: string;
    limit?: number;
    since?: string;
  } = {}): AuditEntry[] {
    if (!fs.existsSync(this.auditFile)) {
      return [];
    }

    const raw = fs.readFileSync(this.auditFile, 'utf-8');
    const lines = raw.split('\n').filter(l => l.trim());
    let entries: AuditEntry[] = [];

    for (const line of lines) {
      try {
        entries.push(JSON.parse(line));
      } catch {
        // skip malformed lines
      }
    }

    if (filters.spec) {
      entries = entries.filter(e => e.spec.includes(filters.spec!));
    }

    if (filters.file) {
      entries = entries.filter(e =>
        e.generated_files.some(f => f.includes(filters.file!))
      );
    }

    if (filters.status) {
      entries = entries.filter(e => e.status === filters.status);
    }

    if (filters.since) {
      const since = new Date(filters.since).getTime();
      entries = entries.filter(e => new Date(e.timestamp).getTime() >= since);
    }

    // Most recent first
    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (filters.limit) {
      entries = entries.slice(0, filters.limit);
    }

    return entries;
  }

  /**
   * Return path to the audit log file.
   */
  getAuditFilePath(): string {
    return this.auditFile;
  }

  private appendEntry(entry: AuditEntry): void {
    this.ensureAuditDir();
    fs.appendFileSync(this.auditFile, JSON.stringify(entry) + '\n', 'utf-8');
  }

  private ensureAuditDir(): void {
    if (!fs.existsSync(this.auditDir)) {
      fs.mkdirSync(this.auditDir, { recursive: true });
    }
  }

  private hashPrompt(prompt: string): string {
    return 'sha256:' + crypto.createHash('sha256').update(prompt, 'utf-8').digest('hex');
  }

  /** Rough token estimate: ~4 chars per token */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private generateId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  private getGitInfo(): { commit: string; user: string } {
    let commit = 'unknown';
    let user = 'unknown';

    try {
      commit = execSync('git rev-parse --short HEAD', {
        cwd: this.repoPath,
        stdio: ['pipe', 'pipe', 'pipe']
      }).toString().trim();
    } catch {
      // not a git repo or no commits yet
    }

    try {
      user = execSync('git config user.email', {
        cwd: this.repoPath,
        stdio: ['pipe', 'pipe', 'pipe']
      }).toString().trim();

      if (!user) {
        user = execSync('git config user.name', {
          cwd: this.repoPath,
          stdio: ['pipe', 'pipe', 'pipe']
        }).toString().trim();
      }
    } catch {
      user = process.env.USER || process.env.USERNAME || 'unknown';
    }

    return { commit, user };
  }
}
