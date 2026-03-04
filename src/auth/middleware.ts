import type { Request, Response, NextFunction } from "express";
import type { ApiKeyManager } from "./api-keys.js";
import type { OrganizationManager } from "./organizations.js";
import type { ApiKeyRecord } from "../types.js";

/** Extend Express Request with API key info */
declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKeyRecord;
    }
  }
}

/** Rate limit tracker: key → [timestamps] */
const rateLimitWindows = new Map<string, number[]>();

/**
 * Express middleware for admin route protection.
 * Reads ADMIN_TOKEN env var at call time.
 * - If unset: returns passthrough middleware (backward compat), logs warning once.
 * - If set: checks Authorization: Bearer <token>, returns 401 on mismatch.
 */
let adminWarningLogged = false;

export function adminAuth(): (req: Request, res: Response, next: NextFunction) => void {
  const token = process.env.ADMIN_TOKEN;

  if (!token) {
    if (!adminWarningLogged) {
      console.warn("WARNING: ADMIN_TOKEN is not set — admin routes are unprotected");
      adminWarningLogged = true;
    }
    return (_req, _res, next) => next();
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: "Authorization header required" });
      return;
    }
    if (!authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Authorization must use Bearer scheme" });
      return;
    }
    const provided = authHeader.slice(7);
    if (provided !== token) {
      res.status(401).json({ error: "Invalid admin token" });
      return;
    }
    next();
  };
}

/**
 * Express middleware for Bearer token authentication.
 * Extracts API key from Authorization header, validates, and attaches to request.
 * Supports optional organization-level aggregate rate limiting.
 */
export function apiKeyAuth(keyManager: ApiKeyManager, orgManager?: OrganizationManager) {
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

    const now = Date.now();
    const windowMs = 60_000; // 1 minute

    // Per-key rate limiting (sliding window)
    let keyTimestamps = rateLimitWindows.get(record.id) ?? [];
    keyTimestamps = keyTimestamps.filter((t) => now - t < windowMs);

    if (keyTimestamps.length >= record.rateLimit) {
      res.status(429).json({
        error: "Rate limit exceeded",
        limit: record.rateLimit,
        retryAfterMs: windowMs - (now - keyTimestamps[0]),
      });
      return;
    }

    // Org-level aggregate rate limiting
    if (record.organizationId && orgManager) {
      const org = orgManager.getById(record.organizationId);
      if (org) {
        const orgKey = `org:${org.id}`;
        let orgTimestamps = rateLimitWindows.get(orgKey) ?? [];
        orgTimestamps = orgTimestamps.filter((t) => now - t < windowMs);

        if (orgTimestamps.length >= org.rateLimit) {
          res.status(429).json({
            error: "Organization rate limit exceeded",
            limit: org.rateLimit,
            retryAfterMs: windowMs - (now - orgTimestamps[0]),
          });
          return;
        }

        orgTimestamps.push(now);
        rateLimitWindows.set(orgKey, orgTimestamps);
      }
    }

    keyTimestamps.push(now);
    rateLimitWindows.set(record.id, keyTimestamps);

    req.apiKey = record;
    next();
  };
}
