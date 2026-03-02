const RATE_LIMIT_STORE_KEY = "__iorbsofrRateLimitStore";

function getClientIp(req) {
  const xff = String(req.headers["x-forwarded-for"] || "");
  if (xff) return xff.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

function getStore() {
  if (!globalThis[RATE_LIMIT_STORE_KEY]) {
    globalThis[RATE_LIMIT_STORE_KEY] = new Map();
  }
  return globalThis[RATE_LIMIT_STORE_KEY];
}

export function enforceRateLimit(req, { bucket, max = 120, windowMs = 60_000 }) {
  const ip = getClientIp(req);
  const now = Date.now();
  const key = `${bucket}:${ip}`;
  const store = getStore();
  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowMs };
    store.set(key, next);
    return { ok: true, remaining: Math.max(0, max - 1), retryAfterSec: Math.ceil(windowMs / 1000) };
  }

  current.count += 1;
  store.set(key, current);
  if (current.count > max) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }
  return {
    ok: true,
    remaining: Math.max(0, max - current.count),
    retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
}
