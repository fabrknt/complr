import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
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
    assert.equal(called, true);
  });

  it("returns 401 when no Authorization header is provided", () => {
    process.env.ADMIN_TOKEN = "secret123";
    const middleware = adminAuth();
    const res = mockRes();
    let called = false;
    const next: NextFunction = () => { called = true; };
    middleware(mockReq(), res, next);
    assert.equal(called, false);
    assert.equal(res._status, 401);
    assert.deepEqual(res._body, { error: "Authorization header required" });
  });

  it("returns 401 when wrong token is provided", () => {
    process.env.ADMIN_TOKEN = "secret123";
    const middleware = adminAuth();
    const res = mockRes();
    let called = false;
    const next: NextFunction = () => { called = true; };
    middleware(mockReq({ authorization: "Bearer wrong_token" }), res, next);
    assert.equal(called, false);
    assert.equal(res._status, 401);
    assert.deepEqual(res._body, { error: "Invalid admin token" });
  });

  it("returns 401 when non-Bearer scheme is used", () => {
    process.env.ADMIN_TOKEN = "secret123";
    const middleware = adminAuth();
    const res = mockRes();
    let called = false;
    const next: NextFunction = () => { called = true; };
    middleware(mockReq({ authorization: "Basic secret123" }), res, next);
    assert.equal(called, false);
    assert.equal(res._status, 401);
    assert.deepEqual(res._body, { error: "Authorization must use Bearer scheme" });
  });

  it("calls next when correct token is provided", () => {
    process.env.ADMIN_TOKEN = "secret123";
    const middleware = adminAuth();
    let called = false;
    const next: NextFunction = () => { called = true; };
    middleware(mockReq({ authorization: "Bearer secret123" }), mockRes(), next);
    assert.equal(called, true);
  });

  it("returns 401 when Authorization header is empty Bearer", () => {
    process.env.ADMIN_TOKEN = "secret123";
    const middleware = adminAuth();
    const res = mockRes();
    let called = false;
    const next: NextFunction = () => { called = true; };
    middleware(mockReq({ authorization: "Bearer " }), res, next);
    assert.equal(called, false);
    assert.equal(res._status, 401);
  });
});
