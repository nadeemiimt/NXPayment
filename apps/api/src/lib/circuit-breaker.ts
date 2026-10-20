export type CircuitState = "closed" | "open" | "half_open";

export class CircuitBreaker {
  private failures = 0;
  private state: CircuitState = "closed";
  private openedAt = 0;

  constructor(
    private readonly failureThreshold: number,
    private readonly resetMs: number
  ) {}

  getStatus() {
    this.maybeHalfOpen();
    return {
      state: this.state,
      failures: this.failures,
      failureThreshold: this.failureThreshold,
    };
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    this.maybeHalfOpen();
    if (this.state === "open") {
      throw new Error("Circuit breaker is open — confirmation side-effects paused");
    }
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private maybeHalfOpen() {
    if (this.state === "open" && Date.now() - this.openedAt >= this.resetMs) {
      this.state = "half_open";
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = "closed";
  }

  private onFailure() {
    this.failures += 1;
    if (this.failures >= this.failureThreshold || this.state === "half_open") {
      this.state = "open";
      this.openedAt = Date.now();
    }
  }
}
