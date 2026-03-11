import { describe, it, expect, vi } from "vitest";
import crypto from "node:crypto";
import {
  verifyWebhookSignature,
  parseWebhookPayload,
  webhookMiddleware,
} from "../src/webhook-handler.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SECRET = "test-webhook-secret";

function sign(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

const samplePayload = {
  id: "evt_001",
  event: "check.completed" as const,
  timestamp: "2025-01-01T00:00:00Z",
  data: { transactionId: "tx_001", status: "compliant" },
};

const sampleBody = JSON.stringify(samplePayload);
const validSignature = sign(sampleBody, SECRET);

// ─── verifyWebhookSignature ──────────────────────────────────────────────────

describe("verifyWebhookSignature", () => {
  it("returns true for valid signature", () => {
    const result = verifyWebhookSignature(sampleBody, validSignature, SECRET);
    expect(result).toBe(true);
  });

  it("returns false for invalid signature", () => {
    const result = verifyWebhookSignature(sampleBody, "invalid-sig", SECRET);
    expect(result).toBe(false);
  });

  it("returns false for empty signature", () => {
    const result = verifyWebhookSignature(sampleBody, "", SECRET);
    expect(result).toBe(false);
  });
});

// ─── parseWebhookPayload ─────────────────────────────────────────────────────

describe("parseWebhookPayload", () => {
  it("returns parsed payload for valid signature", () => {
    const result = parseWebhookPayload(sampleBody, validSignature, SECRET);
    expect(result).toEqual(samplePayload);
  });

  it("throws for invalid signature", () => {
    expect(() =>
      parseWebhookPayload(sampleBody, "bad-signature", SECRET)
    ).toThrow("Invalid webhook signature");
  });
});

// ─── webhookMiddleware ───────────────────────────────────────────────────────

describe("webhookMiddleware", () => {
  function createMockReqRes(body: unknown, signature: string) {
    const jsonFn = vi.fn();
    const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
    const req = {
      body,
      headers: { "x-complr-signature": signature } as Record<
        string,
        string | string[] | undefined
      >,
    };
    const res = { status: statusFn };
    return { req, res, statusFn, jsonFn };
  }

  it("calls handler on valid signature", async () => {
    const handler = vi.fn();
    const middleware = webhookMiddleware(SECRET, handler);
    const { req, res, statusFn, jsonFn } = createMockReqRes(
      sampleBody,
      validSignature
    );

    await middleware(req, res);

    expect(handler).toHaveBeenCalledWith(samplePayload);
    expect(statusFn).toHaveBeenCalledWith(200);
    expect(jsonFn).toHaveBeenCalledWith({ received: true });
  });

  it("returns 401 on invalid signature", async () => {
    const handler = vi.fn();
    const middleware = webhookMiddleware(SECRET, handler);
    const { req, res, statusFn, jsonFn } = createMockReqRes(
      sampleBody,
      "bad-sig"
    );

    await middleware(req, res);

    expect(handler).not.toHaveBeenCalled();
    expect(statusFn).toHaveBeenCalledWith(401);
    expect(jsonFn).toHaveBeenCalledWith({
      error: "Invalid webhook signature",
    });
  });
});
