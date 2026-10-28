/**
 * Fixed-window in-memory rate limiter. Suitable for a single instance; a
 * multi-instance deployment needs a shared store (see docs/SECURITY.md).
 */
export class RateLimiter {
  private hits = new Map<string, { windowStart: number; count: number }>();
  private readonly windowMs: number;
  private readonly max: number;
  private readonly now: () => number;

  constructor(windowMs: number, max: number, now: () => number = Date.now) {
    this.windowMs = windowMs;
    this.max = max;
    this.now = now;
  }

  /** Records a hit and reports whether the key is still within its limit. */
  hit(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const t = this.now();
    let entry = this.hits.get(key);
    if (!entry || t - entry.windowStart >= this.windowMs) {
      entry = { windowStart: t, count: 0 };
      this.hits.set(key, entry);
    }
    entry.count++;
    if (this.hits.size > 50_000) this.sweep(t);
    const retryAfterSeconds = Math.ceil((entry.windowStart + this.windowMs - t) / 1000);
    return { allowed: entry.count <= this.max, retryAfterSeconds };
  }

  /** Checks without recording a hit. */
  isBlocked(key: string): boolean {
    const entry = this.hits.get(key);
    return !!entry && this.now() - entry.windowStart < this.windowMs && entry.count >= this.max;
  }

  private sweep(t: number): void {
    for (const [k, v] of this.hits) if (t - v.windowStart >= this.windowMs) this.hits.delete(k);
  }
}
