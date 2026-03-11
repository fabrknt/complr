import { describe, it, expect, vi } from "vitest";
import { rateLimitMiddleware } from "../src/api/rate-limit.js";

function mockReq(ip = "127.0.0.1"): any {
  return { ip };
}

function mockRes(): any {
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 200,
    headers,
    setHeader(name: string, value: string) { headers[name] = value; return res; },
    status(code: number) { res.statusCode = code; return res; },
    json(body: unknown) { res.body = body; return res; },
    body: undefined as unknown,
  };
  return res;
}

describe("rateLimitMiddleware", () => {
  it("allows requests under the limit", () => {
    const middleware = rateLimitMiddleware({ maxRequests: 5, windowMs: 60_000 });
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it("returns 429 when limit exceeded", () => {
    const middleware = rateLimitMiddleware({ maxRequests: 3, windowMs: 60_000 });
    const req = mockReq();
    const next = vi.fn();

    // Use up the limit
    for (let i = 0; i < 3; i++) {
      const res = mockRes();
      middleware(req, res, next);
    }

    expect(next).toHaveBeenCalledTimes(3);

    // This one should be blocked
    const res = mockRes();
    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(3); // not called again
    expect(res.statusCode).toBe(429);
    expect((res.body as any).error).toBe("Rate limit exceeded");
  });

  it("resets after window expires", () => {
    const middleware = rateLimitMiddleware({ maxRequests: 2, windowMs: 1000 });
    const req = mockReq();
    const next = vi.fn();

    // Use up the limit
    for (let i = 0; i < 2; i++) {
      middleware(req, mockRes(), next);
    }
    expect(next).toHaveBeenCalledTimes(2);

    // Exceed the limit
    const blockedRes = mockRes();
    middleware(req, blockedRes, next);
    expect(blockedRes.statusCode).toBe(429);

    // Advance time past the window
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 1001);

    // Should be allowed again
    const res = mockRes();
    middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(3);
    expect(res.statusCode).toBe(200);

    vi.useRealTimers();
  });

  it("sets rate limit headers", () => {
    const middleware = rateLimitMiddleware({ maxRequests: 10, windowMs: 60_000 });
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.headers["X-RateLimit-Limit"]).toBe("10");
    expect(res.headers["X-RateLimit-Remaining"]).toBe("9");
    expect(res.headers["X-RateLimit-Reset"]).toBeDefined();
  });

  it("tracks different keys independently", () => {
    const middleware = rateLimitMiddleware({ maxRequests: 2, windowMs: 60_000 });
    const next = vi.fn();

    // Use up limit for IP 1
    for (let i = 0; i < 2; i++) {
      middleware(mockReq("10.0.0.1"), mockRes(), next);
    }

    // IP 1 is blocked
    const blockedRes = mockRes();
    middleware(mockReq("10.0.0.1"), blockedRes, next);
    expect(blockedRes.statusCode).toBe(429);

    // IP 2 should still be allowed
    const allowedRes = mockRes();
    middleware(mockReq("10.0.0.2"), allowedRes, next);
    expect(allowedRes.statusCode).toBe(200);
  });

  it("returns retryAfterMs in 429 response body", () => {
    const middleware = rateLimitMiddleware({ maxRequests: 1, windowMs: 30_000 });
    const req = mockReq();
    const next = vi.fn();

    // Use up limit
    middleware(req, mockRes(), next);

    // Exceed
    const res = mockRes();
    middleware(req, res, next);

    expect(res.statusCode).toBe(429);
    const body = res.body as any;
    expect(body.retryAfterMs).toBeGreaterThan(0);
    expect(body.retryAfterMs).toBeLessThanOrEqual(30_000);
    expect(body.limit).toBe(1);
  });

  it("uses custom keyFn when provided", () => {
    const middleware = rateLimitMiddleware({
      maxRequests: 2,
      windowMs: 60_000,
      keyFn: (req: any) => req.ip + "-custom",
    });
    const next = vi.fn();

    // Use up limit for the custom key
    for (let i = 0; i < 2; i++) {
      middleware(mockReq("1.2.3.4"), mockRes(), next);
    }

    // Should be blocked (same custom key)
    const blockedRes = mockRes();
    middleware(mockReq("1.2.3.4"), blockedRes, next);
    expect(blockedRes.statusCode).toBe(429);

    // Different IP should use a different custom key
    const allowedRes = mockRes();
    middleware(mockReq("5.6.7.8"), allowedRes, next);
    expect(allowedRes.statusCode).toBe(200);
  });
});
