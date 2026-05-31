// Dependency-free sliding-window rate limiter (per client IP).
// Protects the expensive AI endpoints from abuse so the Gemini key can't be
// drained by a flood of requests. Single-instance/in-memory — good enough for
// one Zeabur container; swap for Redis if you scale horizontally.

const buckets = new Map(); // id -> number[] (request timestamps)

const clientIp = (req) =>
  (req.headers['x-forwarded-for']?.split(',')[0] ||
    req.ip ||
    req.socket?.remoteAddress ||
    'unknown').toString().trim();

export const rateLimit = ({ windowMs, max, key = 'rl', message } = {}) => (req, res, next) => {
  const id = `${key}:${clientIp(req)}`;
  const now = Date.now();
  const arr = (buckets.get(id) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    const retry = Math.ceil((windowMs - (now - arr[0])) / 1000);
    res.set('Retry-After', String(retry));
    return res.status(429).json({ error: message || '請求過於頻繁，請稍後再試。' });
  }
  arr.push(now);
  buckets.set(id, arr);
  next();
};

// Drop stale buckets every 10 minutes so memory doesn't grow unbounded.
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [id, arr] of buckets) {
    const fresh = arr.filter((t) => now - t < 600000);
    if (fresh.length) buckets.set(id, fresh);
    else buckets.delete(id);
  }
}, 600000);
cleanup.unref?.();
