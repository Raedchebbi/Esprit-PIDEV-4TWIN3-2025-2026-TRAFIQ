export interface WsRateLimitOptions {
  key: string;
  clientId: string;
  limit: number;
  ttlMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export class WsRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  allow(options: WsRateLimitOptions): boolean {
    const key = `${options.key}:${options.clientId}`;
    const now = Date.now();
    const existing = this.buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + options.ttlMs });
      return true;
    }

    existing.count += 1;
    return existing.count <= options.limit;
  }
}
