import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { createApp } from "../src/api/app.js";
import { ApiKeyManager } from "../src/auth/api-keys.js";
import { OrganizationManager } from "../src/auth/organizations.js";
import { AuditLogger } from "../src/audit/logger.js";
import { ScreeningRegistry } from "../src/policy/screening-provider.js";
import { ReviewQueue } from "../src/review/queue.js";

const ADMIN_TOKEN = "test-admin-token-xyz";

function buildTestApp() {
  const keyManager = new ApiKeyManager();
  const orgManager = new OrganizationManager();
  const auditLogger = new AuditLogger();
  const screeningRegistry = new ScreeningRegistry();
  const reviewQueue = new ReviewQueue();

  const app = createApp({
    keyManager,
    orgManager,
    auditLogger,
    screeningRegistry,
    reviewQueue,
  });

  return { app, keyManager, orgManager, auditLogger, screeningRegistry, reviewQueue };
}

async function fetchJson(baseUrl: string, path: string, opts: {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
} = {}): Promise<{ status: number; body: unknown }> {
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
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode!, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode!, body: data });
        }
      });
    });
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

describe("Review Queue API Integration Tests", () => {
  let server: http.Server;
  let baseUrl: string;
  let reviewQueue: ReviewQueue;
  let originalToken: string | undefined;

  beforeAll(async () => {
    originalToken = process.env.ADMIN_TOKEN;
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;

    const deps = buildTestApp();
    reviewQueue = deps.reviewQueue;

    server = http.createServer(deps.app);
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

  // ─── Auth Enforcement ─────────────────────────────────────────────

  it("GET /admin/reviews returns 401 without token", async () => {
    const res = await fetchJson(baseUrl, "/admin/reviews");
    expect(res.status).toBe(401);
  });

  it("GET /admin/reviews/stats returns 401 without token", async () => {
    const res = await fetchJson(baseUrl, "/admin/reviews/stats");
    expect(res.status).toBe(401);
  });

  it("GET /admin/reviews/:id returns 401 without token", async () => {
    const res = await fetchJson(baseUrl, "/admin/reviews/rv_fake123");
    expect(res.status).toBe(401);
  });

  it("POST /admin/reviews/:id/approve returns 401 without token", async () => {
    const res = await fetchJson(baseUrl, "/admin/reviews/rv_fake123/approve", {
      method: "POST",
      body: { reviewerId: "user1" },
    });
    expect(res.status).toBe(401);
  });

  it("POST /admin/reviews/:id/reject returns 401 without token", async () => {
    const res = await fetchJson(baseUrl, "/admin/reviews/rv_fake123/reject", {
      method: "POST",
      body: { reviewerId: "user1" },
    });
    expect(res.status).toBe(401);
  });

  it("POST /admin/reviews/:id/escalate returns 401 without token", async () => {
    const res = await fetchJson(baseUrl, "/admin/reviews/rv_fake123/escalate", {
      method: "POST",
      body: { reviewerId: "user1" },
    });
    expect(res.status).toBe(401);
  });

  // ─── List and Stats (empty queue) ─────────────────────────────────

  it("GET /admin/reviews returns empty items array with valid token", async () => {
    const res = await fetchJson(baseUrl, "/admin/reviews", {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(res.status).toBe(200);
    const body = res.body as { items: unknown[]; total: number };
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("GET /admin/reviews/stats returns zeros with valid token", async () => {
    const res = await fetchJson(baseUrl, "/admin/reviews/stats", {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(res.status).toBe(200);
    const body = res.body as { total: number; pending: number; approved: number; rejected: number; escalated: number };
    expect(body.total).toBe(0);
    expect(body.pending).toBe(0);
    expect(body.approved).toBe(0);
    expect(body.rejected).toBe(0);
    expect(body.escalated).toBe(0);
  });

  // ─── Full Workflow ────────────────────────────────────────────────

  describe("full workflow", () => {
    let item1Id: string;
    let item2Id: string;
    let item3Id: string;

    beforeAll(() => {
      const item1 = reviewQueue.submit({
        type: "check",
        decision: { result: "requires_action" },
        metadata: { transactionId: "tx_001", riskLevel: "requires_action" },
        priority: "high",
      });
      item1Id = item1.id;

      const item2 = reviewQueue.submit({
        type: "screen",
        decision: { riskLevel: "critical" },
        metadata: { address: "0xabc", riskLevel: "critical" },
        priority: "critical",
      });
      item2Id = item2.id;

      const item3 = reviewQueue.submit({
        type: "report",
        decision: { report: "suspicious activity" },
        metadata: { jurisdiction: "MAS" },
        priority: "medium",
      });
      item3Id = item3.id;
    });

    it("GET /admin/reviews returns submitted items", async () => {
      const res = await fetchJson(baseUrl, "/admin/reviews", {
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      });
      expect(res.status).toBe(200);
      const body = res.body as { items: { id: string }[]; total: number };
      expect(body.total).toBe(3);
      expect(body.items).toHaveLength(3);
    });

    it("GET /admin/reviews/:id returns specific item", async () => {
      const res = await fetchJson(baseUrl, `/admin/reviews/${item1Id}`, {
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      });
      expect(res.status).toBe(200);
      const body = res.body as { id: string; type: string; status: string; priority: string };
      expect(body.id).toBe(item1Id);
      expect(body.type).toBe("check");
      expect(body.status).toBe("pending");
      expect(body.priority).toBe("high");
    });

    it("GET /admin/reviews/:id returns 404 for non-existent id", async () => {
      const res = await fetchJson(baseUrl, "/admin/reviews/rv_nonexistent", {
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      });
      expect(res.status).toBe(404);
    });

    it("POST /admin/reviews/:id/approve approves item with reviewerId", async () => {
      const res = await fetchJson(baseUrl, `/admin/reviews/${item1Id}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
        body: { reviewerId: "admin_user_1" },
      });
      expect(res.status).toBe(200);
      const body = res.body as { id: string; status: string; reviewerId: string };
      expect(body.id).toBe(item1Id);
      expect(body.status).toBe("approved");
      expect(body.reviewerId).toBe("admin_user_1");
    });

    it("POST /admin/reviews/:id/reject rejects item with reviewerId and notes", async () => {
      const res = await fetchJson(baseUrl, `/admin/reviews/${item2Id}/reject`, {
        method: "POST",
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
        body: { reviewerId: "admin_user_2", notes: "Confirmed sanctions match" },
      });
      expect(res.status).toBe(200);
      const body = res.body as { id: string; status: string; reviewerId: string; reviewerNotes: string };
      expect(body.id).toBe(item2Id);
      expect(body.status).toBe("rejected");
      expect(body.reviewerId).toBe("admin_user_2");
      expect(body.reviewerNotes).toBe("Confirmed sanctions match");
    });

    it("POST /admin/reviews/:id/escalate escalates item", async () => {
      const res = await fetchJson(baseUrl, `/admin/reviews/${item3Id}/escalate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
        body: { reviewerId: "admin_user_3", notes: "Needs senior review" },
      });
      expect(res.status).toBe(200);
      const body = res.body as { id: string; status: string; reviewerId: string };
      expect(body.id).toBe(item3Id);
      expect(body.status).toBe("escalated");
      expect(body.reviewerId).toBe("admin_user_3");
    });

    it("POST /admin/reviews/:id/approve returns 400 without reviewerId", async () => {
      // Submit a fresh item to approve without reviewerId
      const freshItem = reviewQueue.submit({
        type: "check",
        decision: { result: "test" },
        priority: "low",
      });
      const res = await fetchJson(baseUrl, `/admin/reviews/${freshItem.id}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
        body: {},
      });
      expect(res.status).toBe(400);
      const body = res.body as { error: string };
      expect(body.error).toBe("reviewerId is required");
    });

    it("POST /admin/reviews/:id/approve returns 404 for non-existent id", async () => {
      const res = await fetchJson(baseUrl, "/admin/reviews/rv_nonexistent/approve", {
        method: "POST",
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
        body: { reviewerId: "admin_user_1" },
      });
      expect(res.status).toBe(404);
    });
  });

  // ─── Filtering ────────────────────────────────────────────────────

  describe("filtering", () => {
    it("GET /admin/reviews?status=pending filters correctly", async () => {
      const res = await fetchJson(baseUrl, "/admin/reviews?status=pending", {
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      });
      expect(res.status).toBe(200);
      const body = res.body as { items: { status: string }[]; total: number };
      for (const item of body.items) {
        expect(item.status).toBe("pending");
      }
    });

    it("GET /admin/reviews?priority=critical filters correctly", async () => {
      const res = await fetchJson(baseUrl, "/admin/reviews?priority=critical", {
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      });
      expect(res.status).toBe(200);
      const body = res.body as { items: { priority: string }[]; total: number };
      for (const item of body.items) {
        expect(item.priority).toBe("critical");
      }
    });

    it("GET /admin/reviews?type=screen filters correctly", async () => {
      const res = await fetchJson(baseUrl, "/admin/reviews?type=screen", {
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      });
      expect(res.status).toBe(200);
      const body = res.body as { items: { type: string }[]; total: number };
      for (const item of body.items) {
        expect(item.type).toBe("screen");
      }
    });

    it("GET /admin/reviews?limit=1&offset=0 paginates", async () => {
      const res = await fetchJson(baseUrl, "/admin/reviews?limit=1&offset=0", {
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      });
      expect(res.status).toBe(200);
      const body = res.body as { items: unknown[]; total: number };
      expect(body.items).toHaveLength(1);
      expect(body.total).toBeGreaterThan(1);
    });
  });

  // ─── Stats After Operations ───────────────────────────────────────

  describe("stats after operations", () => {
    it("GET /admin/reviews/stats reflects correct counts after submit/approve/reject", async () => {
      const res = await fetchJson(baseUrl, "/admin/reviews/stats", {
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      });
      expect(res.status).toBe(200);
      const body = res.body as {
        total: number;
        pending: number;
        approved: number;
        rejected: number;
        escalated: number;
        avgReviewTimeMs: number;
        byPriority: Record<string, number>;
      };
      expect(body.total).toBeGreaterThanOrEqual(4);
      expect(body.approved).toBeGreaterThanOrEqual(1);
      expect(body.rejected).toBeGreaterThanOrEqual(1);
      expect(body.escalated).toBeGreaterThanOrEqual(1);
      expect(body.pending).toBeGreaterThanOrEqual(1);
      expect(body.avgReviewTimeMs).toBeGreaterThanOrEqual(0);
      expect(body.byPriority).toBeDefined();
    });
  });
});
