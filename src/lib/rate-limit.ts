/**
 * Minimal in-memory rate limiter. Token bucket per key.
 *
 * Caveat: state is per-process. On multi-instance deploys (Vercel scale-out,
 * Cloud Run min-instances >1) the limit is effectively multiplied by the
 * instance count. Acceptable for v1 launch traffic. When traffic warrants,
 * swap the implementation for Upstash Redis or similar — keep the API
 * shape (`check(key, limitPerWindow, windowMs)` returning boolean).
 */

type Bucket = {
  // unix-ms timestamp of the last refill
  refilledAt: number;
  // remaining tokens
  tokens: number;
};

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 50_000;

export function checkRateLimit(opts: {
  key: string;
  limit: number;
  windowMs: number;
}): boolean {
  const now = Date.now();
  let bucket = buckets.get(opts.key);
  if (!bucket) {
    if (buckets.size > MAX_BUCKETS) sweep(now);
    bucket = { refilledAt: now, tokens: opts.limit };
    buckets.set(opts.key, bucket);
  }
  // Refill proportionally to elapsed time.
  const elapsed = now - bucket.refilledAt;
  if (elapsed > 0) {
    const refill = (elapsed / opts.windowMs) * opts.limit;
    bucket.tokens = Math.min(opts.limit, bucket.tokens + refill);
    bucket.refilledAt = now;
  }
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

/** Best-effort eviction of stale entries when the map grows too large. */
function sweep(now: number) {
  const cutoff = now - 60 * 60 * 1000; // 1 hour
  for (const [k, v] of buckets.entries()) {
    if (v.refilledAt < cutoff) buckets.delete(k);
  }
}

/** Pull a usable client identifier off the request. Auth'd users get
 *  rate-limited per-user; anonymous fall back to the forwarded IP. */
export function rateLimitKey(req: Request, userId?: string | null): string {
  if (userId) return `u:${userId}`;
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = fwd ?? req.headers.get("x-real-ip") ?? "unknown";
  return `ip:${ip}`;
}
