import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { adminAuth } from "../src/auth/middleware.js";
import type { Request, Response, NextFunction } from "express";

function mockReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

function mockRes(): Response & { _status: number; _body: unknown } {
  const res = {
    _status: 200,
    _body: undefined,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: unknown) {
      res._body = body;
      return res;
    },
  } as unknown as Response & { _status: number; _body: unknown };
  return res;
}

describe("adminAuth middleware", () => {
  let originalToken: string | undefined;

  beforeEach(() => {
    originalToken = process.env.ADMIN_TOKEN;
  });

  afterEach(() => {
    if (originalToken !== undefined) {
      process.env.ADMIN_TOKEN = originalToken;
    } else {
      delete process.env.ADMIN_TOKEN;
    }
  });

  it("passes through when ADMIN_TOKEN is not set", () => {
    delete process.env.ADMIN_TOKEN;
    const middleware = adminAuth();
    let called = false;
    const next: NextFunction = () => { called = true; };
    middleware(mockReq(), mockRes(), next);
    expect(called).toBe(true);
  });

  it("returns 401 when no Authorization header is provided", () => {
    process.env.ADMIN_TOKEN = "secret123";
    const middleware = adminAuth();
    const res = mockRes();
    let called = false;
    const next: NextFunction = () => { called = true; };
    middleware(mockReq(), res, next);
    expect(called).toBe(false);
    expect(res._status).toBe(401);
    expect(res._body).toEqual({ error: "Authorization header required" });
  });

  it("returns 401 when wrong token is provided", () => {
    process.env.ADMIN_TOKEN = "secret123";
    const middleware = adminAuth();
    const res = mockRes();
    let called = false;
    const next: NextFunction = () => { called = true; };
    middleware(mockReq({ authorization: "Bearer wrong_token" }), res, next);
    expect(called).toBe(false);
    expect(res._status).toBe(401);
    expect(res._body).toEqual({ error: "Invalid admin token" });
  });

  it("returns 401 when non-Bearer scheme is used", () => {
    process.env.ADMIN_TOKEN = "secret123";
    const middleware = adminAuth();
    const res = mockRes();
    let called = false;
    const next: NextFunction = () => { called = true; };
    middleware(mockReq({ authorization: "Basic secret123" }), res, next);
    expect(called).toBe(false);
    expect(res._status).toBe(401);
    expect(res._body).toEqual({ error: "Authorization must use Bearer scheme" });
  });

  it("calls next when correct token is provided", () => {
    process.env.ADMIN_TOKEN = "secret123";
    const middleware = adminAuth();
    let called = false;
    const next: NextFunction = () => { called = true; };
    middleware(mockReq({ authorization: "Bearer secret123" }), mockRes(), next);
    expect(called).toBe(true);
  });

  it("returns 401 when Authorization header is empty Bearer", () => {
    process.env.ADMIN_TOKEN = "secret123";
    const middleware = adminAuth();
    const res = mockRes();
    let called = false;
    const next: NextFunction = () => { called = true; };
    middleware(mockReq({ authorization: "Bearer " }), res, next);
    expect(called).toBe(false);
    expect(res._status).toBe(401);
  });
});
