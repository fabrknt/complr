import type { Request, Response, NextFunction } from "express";
import type { ApiKeyManager } from "./api-keys.js";
import type { ApiKeyRecord } from "../types.js";

/** Extend Express Request with API key info */
declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKeyRecord;
    }
  }
}

/** Rate limit tracker: apiKeyId → [timestamps] */
const rateLimitWindows = new Map<string, number[]>();

/**
 * Express middleware for Bearer token authentication.
 * Extracts API key from Authorization header, validates, and attaches to request.
 */
export function apiKeyAuth(keyManager: ApiKeyManager) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing or invalid Authorization header. Use: Bearer <api-key>" });
      return;
    }

    const rawKey = authHeader.slice(7);
    const record = keyManager.validate(rawKey);
    if (!record) {
      res.status(401).json({ error: "Invalid or revoked API key" });
      return;
    }

    // Rate limiting (sliding window)
    const now = Date.now();
    const windowMs = 60_000; // 1 minute
    let timestamps = rateLimitWindows.get(record.id) ?? [];
    timestamps = timestamps.filter((t) => now - t < windowMs);

    if (timestamps.length >= record.rateLimit) {
      res.status(429).json({
        error: "Rate limit exceeded",
        limit: record.rateLimit,
        retryAfterMs: windowMs - (now - timestamps[0]),
      });
      return;
    }

    timestamps.push(now);
    rateLimitWindows.set(record.id, timestamps);

    req.apiKey = record;
    next();
  };
}
