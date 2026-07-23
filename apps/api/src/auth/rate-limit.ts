/**
 * A tiny in-process sliding-window rate limiter. Reusable and framework-thin:
 * the auth service consults it, and the HTTP layer can key it by IP and email.
 * Production would back this with Redis (mirrors the Socket.IO adapter plan);
 * the interface stays the same.
 */
export interface RateLimiter {
  /** Record a hit for `key`. Returns true if allowed, false if over the limit. */
  hit(key: string, limit: number, windowMs: number): boolean;
}

export function createInMemoryRateLimiter(now: () => number = Date.now): RateLimiter {
  const hits = new Map<string, number[]>();

  return {
    hit(key, limit, windowMs) {
      const current = now();
      const cutoff = current - windowMs;
      const recent = (hits.get(key) ?? []).filter((ts) => ts > cutoff);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(current);
      hits.set(key, recent);
      return true;
    },
  };
}
