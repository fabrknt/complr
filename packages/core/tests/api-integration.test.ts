import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
  });

  return { app, keyManager, orgManager, auditLogger, screeningRegistry };
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

describe("API Integration Tests", () => {
  let server: http.Server;
  let baseUrl: string;
  let keyManager: ApiKeyManager;
  let orgManager: OrganizationManager;
  let originalToken: string | undefined;

  beforeAll(async () => {
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

  // ─── Health ─────────────────────────────────────────────────────────

  it("GET /health returns status ok", async () => {
    const res = await fetchJson(baseUrl, "/health");
    expect(res.status).toBe(200);
    const body = res.body as { status: string };
    expect(body.status).toBe("ok");
  });

  // ─── Admin Auth Enforcement ─────────────────────────────────────────

  it("POST /admin/api-keys returns 401 without token", async () => {
    const res = await fetchJson(baseUrl, "/admin/api-keys", {
      method: "POST",
      body: { name: "test" },
    });
    expect(res.status).toBe(401);
  });

  it("GET /admin/api-keys returns 401 without token", async () => {
    const res = await fetchJson(baseUrl, "/admin/api-keys");
    expect(res.status).toBe(401);
  });

  it("DELETE /admin/api-keys/fake returns 401 without token", async () => {
    const res = await fetchJson(baseUrl, "/admin/api-keys/fake", { method: "DELETE" });
    expect(res.status).toBe(401);
  });

  it("POST /admin/organizations returns 401 without token", async () => {
    const res = await fetchJson(baseUrl, "/admin/organizations", {
      method: "POST",
      body: { name: "test" },
    });
    expect(res.status).toBe(401);
  });

  it("GET /admin/organizations returns 401 without token", async () => {
    const res = await fetchJson(baseUrl, "/admin/organizations");
    expect(res.status).toBe(401);
  });

  it("GET /admin/audit returns 401 without token", async () => {
    const res = await fetchJson(baseUrl, "/admin/audit");
    expect(res.status).toBe(401);
  });

  it("POST /admin/screen/test returns 401 without token", async () => {
    const res = await fetchJson(baseUrl, "/admin/screen/test", {
      method: "POST",
      body: { address: "0xabc" },
    });
    expect(res.status).toBe(401);
  });

  // ─── Admin CRUD with valid token ───────────────────────────────────

  it("POST /admin/organizations creates org with valid token", async () => {
    const res = await fetchJson(baseUrl, "/admin/organizations", {
      method: "POST",
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      body: { name: "Test Org", rateLimit: 100 },
    });
    expect(res.status).toBe(201);
    const body = res.body as { id: string; name: string; rateLimit: number };
    expect(body.id).toMatch(/^org_/);
    expect(body.name).toBe("Test Org");
    expect(body.rateLimit).toBe(100);
  });

  it("GET /admin/organizations lists orgs with valid token", async () => {
    const res = await fetchJson(baseUrl, "/admin/organizations", {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(res.status).toBe(200);
    const body = res.body as Array<{ id: string }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });

  it("POST /admin/api-keys creates key with valid token", async () => {
    const res = await fetchJson(baseUrl, "/admin/api-keys", {
      method: "POST",
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      body: { name: "Integration Test Key" },
    });
    expect(res.status).toBe(201);
    const body = res.body as { id: string; key: string; name: string };
    expect(body.id).toMatch(/^ak_/);
    expect(body.key).toMatch(/^complr_/);
    expect(body.name).toBe("Integration Test Key");
  });

  it("GET /admin/api-keys lists keys with valid token", async () => {
    const res = await fetchJson(baseUrl, "/admin/api-keys", {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(res.status).toBe(200);
    const body = res.body as Array<{ id: string }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });

  it("DELETE /admin/api-keys/:id revokes key with valid token", async () => {
    const createRes = await fetchJson(baseUrl, "/admin/api-keys", {
      method: "POST",
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      body: { name: "To Revoke" },
    });
    const created = createRes.body as { id: string };

    const res = await fetchJson(baseUrl, `/admin/api-keys/${created.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(res.status).toBe(200);
    const body = res.body as { message: string };
    expect(body.message).toBe("API key revoked");
  });

  it("POST /admin/screen/test screens address with valid token", async () => {
    const res = await fetchJson(baseUrl, "/admin/screen/test", {
      method: "POST",
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      body: { address: "0x1234567890abcdef", chain: "ethereum" },
    });
    expect(res.status).toBe(200);
    const body = res.body as { address: string; sanctioned: boolean };
    expect(body.address).toBe("0x1234567890abcdef");
    expect(body.sanctioned).toBe(false);
  });

  // ─── V1 API Auth ───────────────────────────────────────────────────

  it("POST /api/v1/query returns 401 without Bearer token", async () => {
    const res = await fetchJson(baseUrl, "/api/v1/query", {
      method: "POST",
      body: { question: "test", jurisdiction: "MAS" },
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/query returns 401 with invalid token", async () => {
    const res = await fetchJson(baseUrl, "/api/v1/query", {
      method: "POST",
      headers: { Authorization: "Bearer complr_invalid_key" },
      body: { question: "test", jurisdiction: "MAS" },
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/query returns 503 with valid key but no complr", async () => {
    const record = keyManager.generate("V1 Test Key");
    const res = await fetchJson(baseUrl, "/api/v1/query", {
      method: "POST",
      headers: { Authorization: `Bearer ${record.key}` },
      body: { question: "test", jurisdiction: "MAS" },
    });
    expect(res.status).toBe(503);
    const body = res.body as { error: string };
    expect(body.error).toBe("Compliance engine not available");
  });
});
