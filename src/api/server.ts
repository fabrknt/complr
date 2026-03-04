import express from "express";
import type { Request, Response } from "express";
import { fileURLToPath } from "url";
import path from "path";
import { Complr } from "../index.js";
import { SEED_REGULATIONS } from "../data/seed-regulations.js";
import { ApiKeyManager, apiKeyAuth, OrganizationManager } from "../auth/index.js";
import { WebhookManager } from "../webhooks/index.js";
import { WalletScreener } from "../policy/wallet-screener.js";
import { ScreeningRegistry } from "../policy/screening-provider.js";
import { OfacScreener } from "../policy/ofac-screener.js";
import { AuditLogger } from "../audit/index.js";
import type { Jurisdiction, TransactionDetails, AuditAction } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

// CORS headers for SDK access
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (_req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("ANTHROPIC_API_KEY is required");
  process.exit(1);
}

// ─── Initialize services ─────────────────────────────────────────────

const complr = new Complr({ anthropicApiKey: apiKey });
const keyManager = new ApiKeyManager();
const webhookManager = new WebhookManager();
const orgManager = new OrganizationManager();
const auditLogger = new AuditLogger();

// Screening registry with OFAC provider
const screeningRegistry = new ScreeningRegistry();
const ofacScreener = new OfacScreener();
screeningRegistry.register(ofacScreener);

const walletScreener = new WalletScreener(apiKey, "claude-sonnet-4-5-20250929", screeningRegistry);

// Load seed regulatory data
for (const doc of SEED_REGULATIONS) {
  complr.addDocument(doc);
}

// OFAC data refresh — non-blocking on startup, then every 24h
ofacScreener.refresh().catch((err) => console.warn("OFAC initial refresh failed:", err));
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
setInterval(() => {
  ofacScreener.refresh().catch((err) => console.warn("OFAC refresh failed:", err));
}, TWENTY_FOUR_HOURS);

const port = Number(process.env.PORT) || 3000;

// Serve static frontend
app.use(express.static(path.join(__dirname, "../../public")));

// ─── Audit wrap helper ───────────────────────────────────────────────

type RouteHandler = (req: Request, res: Response) => void | Promise<void>;

function auditWrap(action: AuditAction, handler: RouteHandler): RouteHandler {
  return async (req: Request, res: Response) => {
    const start = Date.now();
    const originalJson = res.json.bind(res);
    let capturedStatus = 200;

    res.json = function (body: unknown) {
      capturedStatus = res.statusCode;
      return originalJson(body);
    } as typeof res.json;

    try {
      await handler(req, res);
      auditLogger.log({
        apiKeyId: req.apiKey?.id ?? null,
        organizationId: req.apiKey?.organizationId,
        action,
        resource: req.originalUrl || req.url,
        method: req.method,
        result: capturedStatus >= 400 ? "error" : "success",
        statusCode: capturedStatus,
        ip: req.ip ?? req.socket.remoteAddress ?? "unknown",
        durationMs: Date.now() - start,
      });
    } catch (err) {
      auditLogger.log({
        apiKeyId: req.apiKey?.id ?? null,
        organizationId: req.apiKey?.organizationId,
        action,
        resource: req.originalUrl || req.url,
        method: req.method,
        result: "error",
        statusCode: 500,
        ip: req.ip ?? req.socket.remoteAddress ?? "unknown",
        durationMs: Date.now() - start,
        details: { error: String(err) },
      });
      if (!res.headersSent) {
        res.status(500).json({ error: String(err) });
      }
    }
  };
}

// ─── Health ───────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    documents: complr.documentCount,
    version: "1.0.0",
    screeningProviders: screeningRegistry.providerCount,
    ofacLastRefreshed: ofacScreener.lastRefreshed ?? null,
  });
});

// ─── Legacy Routes (no auth, backward compat for web UI) ─────────────

app.post("/query", auditWrap("query", async (req, res) => {
  const { question, jurisdiction } = req.body as {
    question: string;
    jurisdiction: Jurisdiction;
  };
  if (!question || !jurisdiction) {
    res.status(400).json({ error: "question and jurisdiction are required" });
    return;
  }
  const answer = await complr.query(question, jurisdiction);
  res.json({ answer });
}));

app.post("/check", auditWrap("check", async (req, res) => {
  const { transaction, jurisdictions } = req.body as {
    transaction: TransactionDetails;
    jurisdictions?: Jurisdiction[];
  };
  if (!transaction) {
    res.status(400).json({ error: "transaction is required" });
    return;
  }
  const result = await complr.checkTransaction(
    transaction,
    jurisdictions ?? ["MAS", "SFC", "FSA"]
  );
  res.json(result);
}));

app.post("/report", auditWrap("report", async (req, res) => {
  const { transaction, riskIndicators, jurisdiction, context } = req.body as {
    transaction: TransactionDetails;
    riskIndicators: string[];
    jurisdiction: Jurisdiction;
    context?: string;
  };
  if (!transaction || !riskIndicators || !jurisdiction) {
    res
      .status(400)
      .json({ error: "transaction, riskIndicators, and jurisdiction are required" });
    return;
  }
  const report = await complr.generateReport(
    transaction,
    riskIndicators,
    jurisdiction,
    context
  );
  res.json(report);
}));

app.post("/analyze", auditWrap("analyze", async (req, res) => {
  let doc = req.body.document;
  if (!doc) {
    res.status(400).json({ error: "document is required" });
    return;
  }
  if (doc.id && !doc.content) {
    const found = complr.getDocument(doc.id);
    if (!found) {
      res.status(404).json({ error: `Document ${doc.id} not found` });
      return;
    }
    doc = found;
  }
  const obligations = await complr.analyzeDocument(doc);
  res.json({ obligations });
}));

// ─── Admin Routes ─────────────────────────────────────────────────────

app.post("/admin/api-keys", auditWrap("api-key.create", (req, res) => {
  const { name, rateLimit, organizationId } = req.body as {
    name: string;
    rateLimit?: number;
    organizationId?: string;
  };
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (organizationId && !orgManager.getById(organizationId)) {
    res.status(400).json({ error: `Organization ${organizationId} not found` });
    return;
  }
  const record = keyManager.generate(name, rateLimit, organizationId);
  res.status(201).json(record);
}));

app.get("/admin/api-keys", (_req, res) => {
  res.json(keyManager.listAll());
});

app.delete("/admin/api-keys/:id", auditWrap("api-key.revoke", (req, res) => {
  const success = keyManager.revoke(req.params.id);
  if (!success) {
    res.status(404).json({ error: "API key not found" });
    return;
  }
  res.json({ message: "API key revoked" });
}));

// ─── Organization Admin Routes ────────────────────────────────────────

app.post("/admin/organizations", auditWrap("organization.create", (req, res) => {
  const { name, rateLimit } = req.body as { name: string; rateLimit?: number };
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const org = orgManager.create(name, rateLimit);
  res.status(201).json(org);
}));

app.get("/admin/organizations", (_req, res) => {
  res.json(orgManager.listAll());
});

app.get("/admin/organizations/:id", (req, res) => {
  const org = orgManager.getById(req.params.id);
  if (!org) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }
  res.json(org);
});

// ─── Audit Admin Routes ──────────────────────────────────────────────

app.get("/admin/audit", (req, res) => {
  const result = auditLogger.query({
    action: req.query.action as AuditAction | undefined,
    resource: req.query.resource as string | undefined,
    result: req.query.result as "success" | "error" | "blocked" | undefined,
    organizationId: req.query.organizationId as string | undefined,
    apiKeyId: req.query.apiKeyId as string | undefined,
    since: req.query.since as string | undefined,
    until: req.query.until as string | undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
    offset: req.query.offset ? Number(req.query.offset) : undefined,
  });
  res.json(result);
});

// ─── V1 API Routes (require API key) ─────────────────────────────────

const v1 = express.Router();
v1.use(apiKeyAuth(keyManager, orgManager));

// Query
v1.post("/query", auditWrap("query", async (req, res) => {
  const { question, jurisdiction } = req.body as {
    question: string;
    jurisdiction: Jurisdiction;
  };
  if (!question || !jurisdiction) {
    res.status(400).json({ error: "question and jurisdiction are required" });
    return;
  }
  keyManager.trackUsage(req.apiKey!.id, "query");
  const answer = await complr.query(question, jurisdiction);
  res.json({ answer });
}));

// Single transaction check
v1.post("/check", auditWrap("check", async (req, res) => {
  const { transaction, jurisdictions } = req.body as {
    transaction: TransactionDetails;
    jurisdictions?: Jurisdiction[];
  };
  if (!transaction) {
    res.status(400).json({ error: "transaction is required" });
    return;
  }
  keyManager.trackUsage(req.apiKey!.id, "check");
  const result = await complr.checkTransaction(
    transaction,
    jurisdictions ?? ["MAS", "SFC", "FSA"]
  );

  // Fire webhooks
  if (result.overallStatus === "blocked") {
    webhookManager.deliver("check.blocked", result).catch(() => {});
  }
  webhookManager.deliver("check.completed", result).catch(() => {});

  res.json(result);
}));

// Batch transaction check
v1.post("/check/batch", auditWrap("check.batch", async (req, res) => {
  const { transactions, jurisdictions } = req.body as {
    transactions: TransactionDetails[];
    jurisdictions?: Jurisdiction[];
  };
  if (!transactions?.length) {
    res.status(400).json({ error: "transactions array is required" });
    return;
  }
  if (transactions.length > 50) {
    res.status(400).json({ error: "Maximum 50 transactions per batch" });
    return;
  }

  keyManager.trackUsage(req.apiKey!.id, "check");

  const results = await Promise.all(
    transactions.map((tx) =>
      complr.checkTransaction(tx, jurisdictions ?? ["MAS", "SFC", "FSA"])
    )
  );

  const summary = {
    total: results.length,
    compliant: results.filter((r) => r.overallStatus === "compliant").length,
    requiresAction: results.filter((r) => r.overallStatus === "requires_action").length,
    blocked: results.filter((r) => r.overallStatus === "blocked").length,
  };

  res.json({ results, summary, processedAt: new Date().toISOString() });
}));

// Wallet screening
v1.post("/screen/wallet", auditWrap("screen", async (req, res) => {
  const { address, chain, jurisdiction } = req.body as {
    address: string;
    chain: string;
    jurisdiction?: Jurisdiction;
  };
  if (!address || !chain) {
    res.status(400).json({ error: "address and chain are required" });
    return;
  }
  keyManager.trackUsage(req.apiKey!.id, "screening");
  const result = await walletScreener.screen(address, chain, jurisdiction);

  if (result.riskLevel === "high" || result.riskLevel === "critical") {
    webhookManager.deliver("screen.high_risk", result).catch(() => {});
  }

  res.json(result);
}));

// Report generation
v1.post("/report", auditWrap("report", async (req, res) => {
  const { transaction, riskIndicators, jurisdiction, context } = req.body as {
    transaction: TransactionDetails;
    riskIndicators: string[];
    jurisdiction: Jurisdiction;
    context?: string;
  };
  if (!transaction || !riskIndicators || !jurisdiction) {
    res
      .status(400)
      .json({ error: "transaction, riskIndicators, and jurisdiction are required" });
    return;
  }
  keyManager.trackUsage(req.apiKey!.id, "report");
  const report = await complr.generateReport(
    transaction,
    riskIndicators,
    jurisdiction,
    context
  );

  webhookManager.deliver("report.generated", report).catch(() => {});

  res.json(report);
}));

// Obligation analysis
v1.post("/analyze", auditWrap("analyze", async (req, res) => {
  let doc = req.body.document;
  if (!doc) {
    res.status(400).json({ error: "document is required" });
    return;
  }
  if (doc.id && !doc.content) {
    const found = complr.getDocument(doc.id);
    if (!found) {
      res.status(404).json({ error: `Document ${doc.id} not found` });
      return;
    }
    doc = found;
  }
  keyManager.trackUsage(req.apiKey!.id, "query");
  const obligations = await complr.analyzeDocument(doc);
  res.json({ obligations });
}));

// Webhook management
v1.post("/webhooks", auditWrap("webhook.create", (req, res) => {
  const { url, events, secret } = req.body as {
    url: string;
    events: string[];
    secret: string;
  };
  if (!url || !events?.length || !secret) {
    res.status(400).json({ error: "url, events, and secret are required" });
    return;
  }
  const wh = webhookManager.register(
    req.apiKey!.id,
    url,
    events as import("../types.js").WebhookEvent[],
    secret
  );
  res.status(201).json(wh);
}));

v1.get("/webhooks", (req, res) => {
  res.json(webhookManager.listByApiKey(req.apiKey!.id));
});

v1.delete("/webhooks/:id", auditWrap("webhook.delete", (req, res) => {
  const success = webhookManager.remove(req.params.id, req.apiKey!.id);
  if (!success) {
    res.status(404).json({ error: "Webhook not found" });
    return;
  }
  res.json({ message: "Webhook removed" });
}));

// Usage stats
v1.get("/usage", (req, res) => {
  const usage = keyManager.getUsage(req.apiKey!.id);
  if (!usage) {
    res.status(404).json({ error: "Usage data not found" });
    return;
  }
  res.json(usage);
});

// Audit log for authenticated user
v1.get("/audit", (req, res) => {
  const result = auditLogger.query({
    apiKeyId: req.apiKey!.id,
    action: req.query.action as AuditAction | undefined,
    since: req.query.since as string | undefined,
    until: req.query.until as string | undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
    offset: req.query.offset ? Number(req.query.offset) : undefined,
  });
  res.json(result);
});

app.use("/api/v1", v1);

// ─── Vault Routes (Phase 2 — imported below) ─────────────────────────

import { createVaultRouter } from "./vault-routes.js";

const vaultRouter = createVaultRouter(complr);
app.use("/vault", vaultRouter);

// Serve vault dashboard
app.get("/vault-demo", (_req, res) => {
  res.sendFile(path.join(__dirname, "../../public/vault.html"));
});

// ─── Start ────────────────────────────────────────────────────────────

app.listen(port, () => {
  console.log(`Complr API running on http://localhost:${port}`);
  console.log(`Documents loaded: ${complr.documentCount}`);
  console.log(`SDK API:  http://localhost:${port}/api/v1/*`);
  console.log(`Vault:    http://localhost:${port}/vault-demo`);
  console.log(`Admin:    POST http://localhost:${port}/admin/api-keys`);
  console.log(`Audit:    GET  http://localhost:${port}/admin/audit`);
  console.log(`Orgs:     POST http://localhost:${port}/admin/organizations`);
  console.log(`OFAC screening: ${screeningRegistry.providerCount} provider(s) registered`);
});
