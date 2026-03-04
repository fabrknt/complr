import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../src/api/app.js";
import { ApiKeyManager } from "../src/auth/api-keys.js";
import { OrganizationManager } from "../src/auth/organizations.js";
import { AuditLogger } from "../src/audit/logger.js";
import { ScreeningRegistry } from "../src/policy/screening-provider.js";

const ADMIN_TOKEN = "test-admin-token-xyz";

function buildTestApp() {
  const keyManager = new ApiKeyManager();
  const orgManager = new OrganizationManager();
  const auditLogger = new AuditLogger();
  const screeningRegistry = new ScreeningRegistry();

  const app = createApp({
    keyManager,
    orgManager,
    auditLogger,
    screeningRegistry,
    // No complr, webhookManager, walletScreener, ofacScreener — testing without LLM
  });

  return { app, keyManager, orgManager, auditLogger, screeningRegistry };
}

async function fetch(baseUrl: string, path: string, opts: {
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

describe("API Integration Tests", () => {
  let server: http.Server;
  let baseUrl: string;
  let keyManager: ApiKeyManager;
  let orgManager: OrganizationManager;
  let originalToken: string | undefined;

  before(async () => {
    originalToken = process.env.ADMIN_TOKEN;
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;

    const deps = buildTestApp();
    keyManager = deps.keyManager;
    orgManager = deps.orgManager;

    server = http.createServer(deps.app);
    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    if (originalToken !== undefined) {
      process.env.ADMIN_TOKEN = originalToken;
    } else {
      delete process.env.ADMIN_TOKEN;
    }
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  // ─── Health ─────────────────────────────────────────────────────────

  it("GET /health returns status ok", async () => {
    const res = await fetch(baseUrl, "/health");
    assert.equal(res.status, 200);
    const body = res.body as { status: string };
    assert.equal(body.status, "ok");
  });

  // ─── Admin Auth Enforcement ─────────────────────────────────────────

  it("POST /admin/api-keys returns 401 without token", async () => {
    const res = await fetch(baseUrl, "/admin/api-keys", {
      method: "POST",
      body: { name: "test" },
    });
    assert.equal(res.status, 401);
  });

  it("GET /admin/api-keys returns 401 without token", async () => {
    const res = await fetch(baseUrl, "/admin/api-keys");
    assert.equal(res.status, 401);
  });

  it("DELETE /admin/api-keys/fake returns 401 without token", async () => {
    const res = await fetch(baseUrl, "/admin/api-keys/fake", { method: "DELETE" });
    assert.equal(res.status, 401);
  });

  it("POST /admin/organizations returns 401 without token", async () => {
    const res = await fetch(baseUrl, "/admin/organizations", {
      method: "POST",
      body: { name: "test" },
    });
    assert.equal(res.status, 401);
  });

  it("GET /admin/organizations returns 401 without token", async () => {
    const res = await fetch(baseUrl, "/admin/organizations");
    assert.equal(res.status, 401);
  });

  it("GET /admin/audit returns 401 without token", async () => {
    const res = await fetch(baseUrl, "/admin/audit");
    assert.equal(res.status, 401);
  });

  it("POST /admin/screen/test returns 401 without token", async () => {
    const res = await fetch(baseUrl, "/admin/screen/test", {
      method: "POST",
      body: { address: "0xabc" },
    });
    assert.equal(res.status, 401);
  });

  // ─── Admin CRUD with valid token ───────────────────────────────────

  it("POST /admin/organizations creates org with valid token", async () => {
    const res = await fetch(baseUrl, "/admin/organizations", {
      method: "POST",
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      body: { name: "Test Org", rateLimit: 100 },
    });
    assert.equal(res.status, 201);
    const body = res.body as { id: string; name: string; rateLimit: number };
    assert.ok(body.id.startsWith("org_"));
    assert.equal(body.name, "Test Org");
    assert.equal(body.rateLimit, 100);
  });

  it("GET /admin/organizations lists orgs with valid token", async () => {
    const res = await fetch(baseUrl, "/admin/organizations", {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    assert.equal(res.status, 200);
    const body = res.body as Array<{ id: string }>;
    assert.ok(Array.isArray(body));
    assert.ok(body.length >= 1);
  });

  it("POST /admin/api-keys creates key with valid token", async () => {
    const res = await fetch(baseUrl, "/admin/api-keys", {
      method: "POST",
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      body: { name: "Integration Test Key" },
    });
    assert.equal(res.status, 201);
    const body = res.body as { id: string; key: string; name: string };
    assert.ok(body.id.startsWith("ak_"));
    assert.ok(body.key.startsWith("complr_"));
    assert.equal(body.name, "Integration Test Key");
  });

  it("GET /admin/api-keys lists keys with valid token", async () => {
    const res = await fetch(baseUrl, "/admin/api-keys", {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    assert.equal(res.status, 200);
    const body = res.body as Array<{ id: string }>;
    assert.ok(Array.isArray(body));
    assert.ok(body.length >= 1);
  });

  it("DELETE /admin/api-keys/:id revokes key with valid token", async () => {
    // Create a key first
    const createRes = await fetch(baseUrl, "/admin/api-keys", {
      method: "POST",
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      body: { name: "To Revoke" },
    });
    const created = createRes.body as { id: string };

    const res = await fetch(baseUrl, `/admin/api-keys/${created.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    assert.equal(res.status, 200);
    const body = res.body as { message: string };
    assert.equal(body.message, "API key revoked");
  });

  it("POST /admin/screen/test screens address with valid token", async () => {
    const res = await fetch(baseUrl, "/admin/screen/test", {
      method: "POST",
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      body: { address: "0x1234567890abcdef", chain: "ethereum" },
    });
    assert.equal(res.status, 200);
    const body = res.body as { address: string; sanctioned: boolean };
    assert.equal(body.address, "0x1234567890abcdef");
    assert.equal(body.sanctioned, false);
  });

  // ─── V1 API Auth ───────────────────────────────────────────────────

  it("POST /api/v1/query returns 401 without Bearer token", async () => {
    const res = await fetch(baseUrl, "/api/v1/query", {
      method: "POST",
      body: { question: "test", jurisdiction: "MAS" },
    });
    assert.equal(res.status, 401);
  });

  it("POST /api/v1/query returns 401 with invalid token", async () => {
    const res = await fetch(baseUrl, "/api/v1/query", {
      method: "POST",
      headers: { Authorization: "Bearer complr_invalid_key" },
      body: { question: "test", jurisdiction: "MAS" },
    });
    assert.equal(res.status, 401);
  });

  it("POST /api/v1/query returns 503 with valid key but no complr", async () => {
    // Create a real API key
    const record = keyManager.generate("V1 Test Key");
    const res = await fetch(baseUrl, "/api/v1/query", {
      method: "POST",
      headers: { Authorization: `Bearer ${record.key}` },
      body: { question: "test", jurisdiction: "MAS" },
    });
    assert.equal(res.status, 503);
    const body = res.body as { error: string };
    assert.equal(body.error, "Compliance engine not available");
  });
});
