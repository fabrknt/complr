import express from "express";
import { fileURLToPath } from "url";
import path from "path";
import { Complr } from "../index.js";
import { SEED_REGULATIONS } from "../data/seed-regulations.js";
import { ApiKeyManager, apiKeyAuth } from "../auth/index.js";
import { WebhookManager } from "../webhooks/index.js";
import { WalletScreener } from "../policy/wallet-screener.js";
import type { Jurisdiction, TransactionDetails } from "../types.js";

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

const complr = new Complr({ anthropicApiKey: apiKey });
const keyManager = new ApiKeyManager();
const webhookManager = new WebhookManager();
const walletScreener = new WalletScreener(apiKey, "claude-sonnet-4-5-20250929");

// Load seed regulatory data
for (const doc of SEED_REGULATIONS) {
  complr.addDocument(doc);
}

const port = Number(process.env.PORT) || 3000;

// Serve static frontend
app.use(express.static(path.join(__dirname, "../../public")));

// ─── Health ───────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", documents: complr.documentCount, version: "1.0.0" });
});

// ─── Legacy Routes (no auth, backward compat for web UI) ─────────────

app.post("/query", async (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/check", async (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/report", async (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/analyze", async (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Admin Routes ─────────────────────────────────────────────────────

app.post("/admin/api-keys", (req, res) => {
  try {
    const { name, rateLimit } = req.body as { name: string; rateLimit?: number };
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const record = keyManager.generate(name, rateLimit);
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/admin/api-keys", (_req, res) => {
  res.json(keyManager.listAll());
});

app.delete("/admin/api-keys/:id", (req, res) => {
  const success = keyManager.revoke(req.params.id);
  if (!success) {
    res.status(404).json({ error: "API key not found" });
    return;
  }
  res.json({ message: "API key revoked" });
});

// ─── V1 API Routes (require API key) ─────────────────────────────────

const v1 = express.Router();
v1.use(apiKeyAuth(keyManager));

// Query
v1.post("/query", async (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Single transaction check
v1.post("/check", async (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Batch transaction check
v1.post("/check/batch", async (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Wallet screening
v1.post("/screen/wallet", async (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Report generation
v1.post("/report", async (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Obligation analysis
v1.post("/analyze", async (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Webhook management
v1.post("/webhooks", (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

v1.get("/webhooks", (req, res) => {
  res.json(webhookManager.listByApiKey(req.apiKey!.id));
});

v1.delete("/webhooks/:id", (req, res) => {
  const success = webhookManager.remove(req.params.id, req.apiKey!.id);
  if (!success) {
    res.status(404).json({ error: "Webhook not found" });
    return;
  }
  res.json({ message: "Webhook removed" });
});

// Usage stats
v1.get("/usage", (req, res) => {
  const usage = keyManager.getUsage(req.apiKey!.id);
  if (!usage) {
    res.status(404).json({ error: "Usage data not found" });
    return;
  }
  res.json(usage);
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
});
