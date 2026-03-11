import type { Request, Response, NextFunction } from "express";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitConfig {
  windowMs?: number;      // default: 60_000 (1 minute)
  maxRequests?: number;    // default: 60
  keyFn?: (req: Request) => string;  // default: IP-based
}

/**
 * Simple in-memory sliding-window rate limiter.
 * Returns 429 with Retry-After header when limit is exceeded.
 */
export function rateLimitMiddleware(config: RateLimitConfig = {}) {
  const windowMs = config.windowMs ?? 60_000;
  const maxRequests = config.maxRequests ?? 60;
  const keyFn = config.keyFn ?? ((req: Request) => req.ip ?? "unknown");

  const store = new Map<string, RateLimitEntry>();

  // Periodic cleanup every 5 minutes
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now >= entry.resetAt) {
        store.delete(key);
      }
    }
  }, 5 * 60_000);
  cleanup.unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyFn(req);
    const now = Date.now();
    let entry = store.get(key);

    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    res.setHeader("X-RateLimit-Limit", String(maxRequests));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, maxRequests - entry.count)));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > maxRequests) {
      const retryAfterMs = entry.resetAt - now;
      res.status(429).json({
        error: "Rate limit exceeded",
        limit: maxRequests,
        retryAfterMs,
      });
      return;
    }

    next();
  };
}
