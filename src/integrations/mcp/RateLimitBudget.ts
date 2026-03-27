export class RateLimitBudget {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly maxPerMinute: number = 30,
    private readonly retryAfterMs: number = 60000
  ) {
    this.tokens = maxPerMinute;
    this.lastRefill = Date.now();
  }

  /**
   * Acquire a token before making a GitHub API/MCP call.
   * Blocks by sleeping when the budget is exhausted.
   */
  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens <= 0) {
      await new Promise(resolve => setTimeout(resolve, this.retryAfterMs));
      this.refill();
    }

    this.tokens--;
  }

  /**
   * Handle an explicit rate-limit signal (e.g., HTTP 429 with Retry-After).
   */
  async handleRateLimit(retryAfterHeader?: number): Promise<void> {
    const waitMs = retryAfterHeader ? retryAfterHeader * 1000 : this.retryAfterMs;
    this.tokens = 0;
    await new Promise(resolve => setTimeout(resolve, waitMs));
    this.refill();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;

    if (elapsed >= 60000) {
      const windows = Math.floor(elapsed / 60000);
      const refillAmount = windows * this.maxPerMinute;
      this.tokens = Math.min(this.maxPerMinute, this.tokens + refillAmount);
      this.lastRefill = now;
    }
  }
}

