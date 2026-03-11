import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { createApp } from "../src/api/app.js";
import { ApiKeyManager } from "../src/auth/api-keys.js";
import { OrganizationManager } from "../src/auth/organizations.js";
import { AuditLogger } from "../src/audit/logger.js";
import { ScreeningRegistry } from "../src/policy/screening-provider.js";
import { ReviewQueue } from "../src/review/queue.js";

const ADMIN_TOKEN = "smoke-test-admin-token";

async function fetchJson(
  baseUrl: string,
  path: string,
  opts: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {}
): Promise<{ status: number; body: unknown; headers: http.IncomingHttpHeaders }> {
  const url = new URL(path, baseUrl);
  const method = opts.method || "GET";
  const headers: Record<string, string> = { ...opts.headers };
  let bodyStr: string | undefined;
  if (opts.body) {
    bodyStr = JSON.stringify(opts.body);
    headers["Content-Type"] = "application/json";
  }

  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers }, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode!, body: JSON.parse(data), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode!, body: data, headers: res.headers });
        }
      });
    });
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

describe("E2E Smoke Test", () => {
  let server: http.Server;
  let baseUrl: string;
  let keyManager: ApiKeyManager;
  let orgManager: OrganizationManager;
  let auditLogger: AuditLogger;
  let reviewQueue: ReviewQueue;
  let originalToken: string | undefined;

  // Shared state across sequential tests
  let orgId: string;
  let apiKeyId: string;
  let apiKey: string;
  let reviewItemId: string;
  let rejectItemId: string;
  let escalateItemId: string;

  beforeAll(async () => {
    originalToken = process.env.ADMIN_TOKEN;
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;

    keyManager = new ApiKeyManager();
    orgManager = new OrganizationManager();
    auditLogger = new AuditLogger();
    const screeningRegistry = new ScreeningRegistry();
    reviewQueue = new ReviewQueue();

    const app = createApp({
      keyManager,
      orgManager,
      auditLogger,
      screeningRegistry,
      reviewQueue,
      rateLimitConfig: {
        maxRequests: 5,
        windowMs: 60000,
        keyFn: (req) => req.headers.authorization ?? req.ip ?? "unknown",
      },
    });

    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    if (originalToken !== undefined) {
      process.env.ADMIN_TOKEN = originalToken;
    } else {
      delete process.env.ADMIN_TOKEN;
    }
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  const adminHeaders = () => ({ Authorization: `Bearer ${ADMIN_TOKEN}` });

  // ─── 1. Health check ──────────────────────────────────────────────

  it("GET /health returns 200 with status ok and reviewQueue stats", async () => {
    const res = await fetchJson(baseUrl, "/health");
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.status).toBe("ok");
    expect(body.reviewQueue).toBeDefined();
    const rq = body.reviewQueue as Record<string, number>;
    expect(rq.total).toBe(0);
    expect(rq.pending).toBe(0);
  });

  // ─── 2. Create organization ───────────────────────────────────────

  it("POST /admin/organizations creates org", async () => {
    const res = await fetchJson(baseUrl, "/admin/organizations", {
      method: "POST",
      headers: adminHeaders(),
      body: { name: "Smoke Test Org", rateLimit: 200 },
    });
    expect(res.status).toBe(201);
    const body = res.body as { id: string; name: string };
    expect(body.id).toMatch(/^org_/);
    expect(body.name).toBe("Smoke Test Org");
    orgId = body.id;
  });

  // ─── 3. Create API key under org ──────────────────────────────────

  it("POST /admin/api-keys creates key under org", async () => {
    const res = await fetchJson(baseUrl, "/admin/api-keys", {
      method: "POST",
      headers: adminHeaders(),
      body: { name: "Smoke Key", organizationId: orgId },
    });
    expect(res.status).toBe(201);
    const body = res.body as { id: string; key: string; name: string };
    expect(body.key).toMatch(/^complr_/);
    apiKeyId = body.id;
    apiKey = body.key;
  });

  // ─── 4. V1 auth enforcement ───────────────────────────────────────

  it("POST /api/v1/check without Bearer token returns 401", async () => {
    const res = await fetchJson(baseUrl, "/api/v1/check", {
      method: "POST",
      body: { transaction: { transactionId: "tx1" } },
    });
    expect(res.status).toBe(401);
  });

  // ─── 5. V1 compliance check (no engine) ───────────────────────────

  it("POST /api/v1/check with valid key returns 503", async () => {
    const res = await fetchJson(baseUrl, "/api/v1/check", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: { transaction: { transactionId: "tx1" } },
    });
    expect(res.status).toBe(503);
    const body = res.body as { error: string };
    expect(body.error).toBe("Compliance engine not available");
  });

  // ─── 6. Admin screen test ─────────────────────────────────────────

  it("POST /admin/screen/test returns sanctioned:false for clean address", async () => {
    const res = await fetchJson(baseUrl, "/admin/screen/test", {
      method: "POST",
      headers: adminHeaders(),
      body: { address: "0xabcdef1234567890abcdef1234567890abcdef12" },
    });
    expect(res.status).toBe(200);
    const body = res.body as { sanctioned: boolean; address: string };
    expect(body.sanctioned).toBe(false);
  });

  // ─── 7. Review queue is empty ─────────────────────────────────────

  it("GET /admin/reviews returns total: 0", async () => {
    const res = await fetchJson(baseUrl, "/admin/reviews", {
      headers: adminHeaders(),
    });
    expect(res.status).toBe(200);
    const body = res.body as { items: unknown[]; total: number };
    expect(body.total).toBe(0);
  });

  // ─── 8. Submit review item directly ───────────────────────────────

  it("submit review item and verify via GET /admin/reviews", async () => {
    const item = reviewQueue.submit({
      type: "check",
      decision: { overallStatus: "requires_action", transactionId: "tx-smoke-1" },
      metadata: { transactionId: "tx-smoke-1", riskLevel: "requires_action" },
    });
    reviewItemId = item.id;

    const res = await fetchJson(baseUrl, "/admin/reviews", {
      headers: adminHeaders(),
    });
    expect(res.status).toBe(200);
    const body = res.body as { items: Array<{ id: string }>; total: number };
    expect(body.total).toBe(1);
    expect(body.items[0].id).toBe(reviewItemId);
  });

  // ─── 9. Get review item by ID ────────────────────────────────────

  it("GET /admin/reviews/:id returns the submitted item", async () => {
    const res = await fetchJson(baseUrl, `/admin/reviews/${reviewItemId}`, {
      headers: adminHeaders(),
    });
    expect(res.status).toBe(200);
    const body = res.body as { id: string; status: string; type: string };
    expect(body.id).toBe(reviewItemId);
    expect(body.status).toBe("pending");
    expect(body.type).toBe("check");
  });

  // ─── 10. Review queue stats ───────────────────────────────────────

  it("GET /admin/reviews/stats shows total: 1, pending: 1", async () => {
    const res = await fetchJson(baseUrl, "/admin/reviews/stats", {
      headers: adminHeaders(),
    });
    expect(res.status).toBe(200);
    const body = res.body as { total: number; pending: number };
    expect(body.total).toBe(1);
    expect(body.pending).toBe(1);
  });

  // ─── 11. Approve review item ─────────────────────────────────────

  it("POST /admin/reviews/:id/approve changes status to approved", async () => {
    const res = await fetchJson(baseUrl, `/admin/reviews/${reviewItemId}/approve`, {
      method: "POST",
      headers: adminHeaders(),
      body: { reviewerId: "reviewer-1", notes: "Looks good" },
    });
    expect(res.status).toBe(200);
    const body = res.body as { id: string; status: string; reviewerId: string };
    expect(body.status).toBe("approved");
    expect(body.reviewerId).toBe("reviewer-1");
  });

  // ─── 12. Verify approval in stats ────────────────────────────────

  it("GET /admin/reviews/stats shows approved: 1, pending: 0", async () => {
    const res = await fetchJson(baseUrl, "/admin/reviews/stats", {
      headers: adminHeaders(),
    });
    expect(res.status).toBe(200);
    const body = res.body as { approved: number; pending: number };
    expect(body.approved).toBe(1);
    expect(body.pending).toBe(0);
  });

  // ─── 13. Submit and reject ────────────────────────────────────────

  it("submit and reject a review item", async () => {
    const item = reviewQueue.submit({
      type: "screen",
      decision: { riskLevel: "high", address: "0xbad" },
      metadata: { address: "0xbad", riskLevel: "high" },
    });
    rejectItemId = item.id;

    const res = await fetchJson(baseUrl, `/admin/reviews/${rejectItemId}/reject`, {
      method: "POST",
      headers: adminHeaders(),
      body: { reviewerId: "reviewer-2", notes: "Rejected" },
    });
    expect(res.status).toBe(200);
    const body = res.body as { id: string; status: string };
    expect(body.status).toBe("rejected");
  });

  // ─── 14. Submit and escalate ──────────────────────────────────────

  it("submit and escalate a review item", async () => {
    const item = reviewQueue.submit({
      type: "report",
      decision: { transactionId: "tx-escalate" },
      metadata: { transactionId: "tx-escalate" },
    });
    escalateItemId = item.id;

    const res = await fetchJson(baseUrl, `/admin/reviews/${escalateItemId}/escalate`, {
      method: "POST",
      headers: adminHeaders(),
      body: { reviewerId: "reviewer-3", notes: "Needs senior review" },
    });
    expect(res.status).toBe(200);
    const body = res.body as { id: string; status: string };
    expect(body.status).toBe("escalated");
  });

  // ─── 15. Query reviews with filters ───────────────────────────────

  it("GET /admin/reviews?status=approved returns only approved items", async () => {
    const res = await fetchJson(baseUrl, "/admin/reviews?status=approved", {
      headers: adminHeaders(),
    });
    expect(res.status).toBe(200);
    const body = res.body as { items: Array<{ status: string }>; total: number };
    expect(body.total).toBe(1);
    expect(body.items.every((i) => i.status === "approved")).toBe(true);
  });

  // ─── 16. Rate limiting ────────────────────────────────────────────

  it("rate limiter returns 429 after exceeding maxRequests", async () => {
    // Create a fresh API key for rate limit testing so previous requests don't interfere
    const record = keyManager.generate("Rate Limit Test Key");
    const rlKey = record.key;

    const responses: Array<{ status: number; headers: http.IncomingHttpHeaders }> = [];

    for (let i = 0; i < 6; i++) {
      const res = await fetchJson(baseUrl, "/api/v1/check", {
        method: "POST",
        headers: { Authorization: `Bearer ${rlKey}` },
        body: { transaction: { transactionId: `tx-rl-${i}` } },
      });
      responses.push(res);
    }

    // First 5 should have rate limit headers and not be 429
    for (let i = 0; i < 5; i++) {
      expect(responses[i].headers["x-ratelimit-limit"]).toBe("5");
      expect(responses[i].status).not.toBe(429);
    }

    // 6th request should be rate limited
    expect(responses[5].status).toBe(429);
    const body = responses[5].body as { error: string };
    expect(body.error).toBe("Rate limit exceeded");
  });

  // ─── 17. Audit trail ─────────────────────────────────────────────

  it("GET /admin/audit returns logged events", async () => {
    const res = await fetchJson(baseUrl, "/admin/audit", {
      headers: adminHeaders(),
    });
    expect(res.status).toBe(200);
    const body = res.body as { events: Array<{ action: string }>; total: number };
    expect(body.total).toBeGreaterThan(0);
    expect(body.events.length).toBeGreaterThan(0);

    // Verify we have audit events for various actions performed
    const actions = body.events.map((e) => e.action);
    expect(actions).toContain("organization.create");
    expect(actions).toContain("api-key.create");
    expect(actions).toContain("review.approve");
    expect(actions).toContain("review.reject");
    expect(actions).toContain("review.escalate");
  });

  // ─── 18. API key revocation ───────────────────────────────────────

  it("revoked API key returns 401 on V1 routes", async () => {
    // Revoke the key we created earlier
    const delRes = await fetchJson(baseUrl, `/admin/api-keys/${apiKeyId}`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
    expect(delRes.status).toBe(200);
    const delBody = delRes.body as { message: string };
    expect(delBody.message).toBe("API key revoked");

    // Now try to use the revoked key
    const res = await fetchJson(baseUrl, "/api/v1/check", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: { transaction: { transactionId: "tx-revoked" } },
    });
    expect(res.status).toBe(401);
  });
});
