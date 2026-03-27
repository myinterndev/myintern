export interface PullRequestSummary {
  url: string;
  number: number;
}

export interface WorkflowRunStatus {
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'cancelled' | null;
  logs_url?: string;
}

export interface CheckRunSummary {
  name: string;
  status: string;
  conclusion: string;
}

export interface WaitForChecksResult {
  passed: boolean;
  checks: CheckRunSummary[];
  failureLogs?: string;
}

export interface ReviewComment {
  id: number;
  body: string;
  path: string;
  line?: number;
  resolved?: boolean;
}

