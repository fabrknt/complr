import express from "express";
import type { Request, Response } from "express";
import { fileURLToPath } from "url";
import path from "path";
import type { Complr } from "../index.js";
import { apiKeyAuth, adminAuth } from "../auth/index.js";
import type { ApiKeyManager } from "../auth/api-keys.js";
import type { OrganizationManager } from "../auth/organizations.js";
import type { WebhookManager } from "../webhooks/manager.js";
import type { WalletScreener } from "../policy/wallet-screener.js";
import type { ScreeningRegistry } from "../policy/screening-provider.js";
import type { OfacScreener } from "../policy/ofac-screener.js";
import type { AuditLogger } from "../audit/logger.js";
import type { ReviewQueue } from "../review/queue.js";
import type { Jurisdiction, TransactionDetails, AuditAction } from "../types.js";
import { detectAddressFormat } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface AppDependencies {
  complr?: Complr;
  keyManager: ApiKeyManager;
  orgManager: OrganizationManager;
  auditLogger: AuditLogger;
  screeningRegistry: ScreeningRegistry;
  webhookManager?: WebhookManager;
  walletScreener?: WalletScreener;
  ofacScreener?: OfacScreener;
  reviewQueue?: ReviewQueue;
}

export function createApp(deps: AppDependencies): express.Express {
  const {
    complr,
    keyManager,
    orgManager,
    auditLogger,
    screeningRegistry,
    webhookManager,
    walletScreener,
    ofacScreener,
    reviewQueue,
  } = deps;

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
      documents: complr?.documentCount ?? 0,
      version: "1.0.0",
      screeningProviders: screeningRegistry.providerCount,
      ofacLastRefreshed: ofacScreener?.lastRefreshed ?? null,
      reviewQueue: reviewQueue ? reviewQueue.stats() : null,
    });
  });

  // ─── Legacy Routes (no auth, backward compat for web UI) ─────────────

  if (complr) {
    app.post("/query", auditWrap("query", async (req, res) => {
      const { question, jurisdiction, confident } = req.body as {
        question: string;
        jurisdiction: Jurisdiction;
        confident?: boolean;
      };
      if (!question || !jurisdiction) {
        res.status(400).json({ error: "question and jurisdiction are required" });
        return;
      }
      if (confident) {
        const result = await complr.queryWithConfidence(question, jurisdiction);
        res.json(result);
      } else {
        const answer = await complr.query(question, jurisdiction);
        res.json({ answer });
      }
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
  }

  // ─── Admin Routes ─────────────────────────────────────────────────────

  const adminAuthMiddleware = adminAuth();

  // Serve admin dashboard (HTML page stays open — handles auth via JS)
  app.get("/admin", (_req, res) => {
    res.sendFile(path.join(__dirname, "../../public/admin.html"));
  });

  app.post("/admin/api-keys", adminAuthMiddleware, auditWrap("api-key.create", (req, res) => {
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

  app.get("/admin/api-keys", adminAuthMiddleware, (_req, res) => {
    res.json(keyManager.listAll());
  });

  app.delete("/admin/api-keys/:id", adminAuthMiddleware, auditWrap("api-key.revoke", (req, res) => {
    const success = keyManager.revoke(req.params.id);
    if (!success) {
      res.status(404).json({ error: "API key not found" });
      return;
    }
    res.json({ message: "API key revoked" });
  }));

  // ─── Organization Admin Routes ────────────────────────────────────────

  app.post("/admin/organizations", adminAuthMiddleware, auditWrap("organization.create", (req, res) => {
    const { name, rateLimit } = req.body as { name: string; rateLimit?: number };
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const org = orgManager.create(name, rateLimit);
    res.status(201).json(org);
  }));

  app.get("/admin/organizations", adminAuthMiddleware, (_req, res) => {
    res.json(orgManager.listAll());
  });

  app.get("/admin/organizations/:id", adminAuthMiddleware, (req, res) => {
    const org = orgManager.getById(req.params.id);
    if (!org) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }
    res.json(org);
  });

  // ─── Audit Admin Routes ──────────────────────────────────────────────

  app.get("/admin/audit", adminAuthMiddleware, (req, res) => {
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

  // ─── Admin Screen Test ──────────────────────────────────────────────

  app.post("/admin/screen/test", adminAuthMiddleware, (req, res) => {
    const { address, chain } = req.body as { address: string; chain?: string };
    if (!address) {
      res.status(400).json({ error: "address is required" });
      return;
    }
    const resolvedChain = chain || detectAddressFormat(address) || "unknown";
    const hits = screeningRegistry.screenAll(address, resolvedChain);
    res.json({
      address,
      chain: resolvedChain,
      sanctioned: hits.length > 0,
      hits,
      screenedAt: new Date().toISOString(),
    });
  });

  // ─── Review Queue Admin Routes ─────────────────────────────────────

  if (reviewQueue) {
    app.get("/admin/reviews", adminAuthMiddleware, (req, res) => {
      const result = reviewQueue.query({
        status: req.query.status as "pending" | "approved" | "rejected" | "escalated" | undefined,
        priority: req.query.priority as "low" | "medium" | "high" | "critical" | undefined,
        type: req.query.type as "check" | "screen" | "report" | undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        offset: req.query.offset ? Number(req.query.offset) : undefined,
      });
      res.json(result);
    });

    app.get("/admin/reviews/stats", adminAuthMiddleware, (_req, res) => {
      res.json(reviewQueue.stats());
    });

    app.get("/admin/reviews/:id", adminAuthMiddleware, (req, res) => {
      const item = reviewQueue.getById(req.params.id);
      if (!item) {
        res.status(404).json({ error: "Review item not found" });
        return;
      }
      res.json(item);
    });

    app.post("/admin/reviews/:id/approve", adminAuthMiddleware, auditWrap("review.approve", (req, res) => {
      const { reviewerId, notes } = req.body as { reviewerId: string; notes?: string };
      if (!reviewerId) {
        res.status(400).json({ error: "reviewerId is required" });
        return;
      }
      const item = reviewQueue.approve(req.params.id, reviewerId, notes);
      if (!item) {
        res.status(404).json({ error: "Review item not found" });
        return;
      }
      res.json(item);
    }));

    app.post("/admin/reviews/:id/reject", adminAuthMiddleware, auditWrap("review.reject", (req, res) => {
      const { reviewerId, notes } = req.body as { reviewerId: string; notes?: string };
      if (!reviewerId) {
        res.status(400).json({ error: "reviewerId is required" });
        return;
      }
      const item = reviewQueue.reject(req.params.id, reviewerId, notes);
      if (!item) {
        res.status(404).json({ error: "Review item not found" });
        return;
      }
      res.json(item);
    }));

    app.post("/admin/reviews/:id/escalate", adminAuthMiddleware, auditWrap("review.escalate", (req, res) => {
      const { reviewerId, notes } = req.body as { reviewerId: string; notes?: string };
      if (!reviewerId) {
        res.status(400).json({ error: "reviewerId is required" });
        return;
      }
      const item = reviewQueue.escalate(req.params.id, reviewerId, notes);
      if (!item) {
        res.status(404).json({ error: "Review item not found" });
        return;
      }
      res.json(item);
    }));
  }

  // ─── V1 API Routes (require API key) ─────────────────────────────────

  const v1 = express.Router();
  v1.use(apiKeyAuth(keyManager, orgManager));

  // Query
  v1.post("/query", auditWrap("query", async (req, res) => {
    if (!complr) {
      res.status(503).json({ error: "Compliance engine not available" });
      return;
    }
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

  // Query with confidence scoring
  v1.post("/query/confident", auditWrap("query", async (req, res) => {
    if (!complr) {
      res.status(503).json({ error: "Compliance engine not available" });
      return;
    }
    const { question, jurisdiction } = req.body as {
      question: string;
      jurisdiction: Jurisdiction;
    };
    if (!question || !jurisdiction) {
      res.status(400).json({ error: "question and jurisdiction are required" });
      return;
    }
    keyManager.trackUsage(req.apiKey!.id, "query");
    const result = await complr.queryWithConfidence(question, jurisdiction);
    res.json(result);
  }));

  // Single transaction check
  v1.post("/check", auditWrap("check", async (req, res) => {
    if (!complr) {
      res.status(503).json({ error: "Compliance engine not available" });
      return;
    }
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
    if (webhookManager) {
      if (result.overallStatus === "blocked") {
        webhookManager.deliver("check.blocked", result).catch(() => {});
      }
      webhookManager.deliver("check.completed", result).catch(() => {});
    }

    // Auto-submit to review queue for non-compliant results
    if (reviewQueue && result.overallStatus !== "compliant") {
      reviewQueue.submit({
        type: "check",
        decision: result,
        metadata: {
          transactionId: result.transactionId,
          riskLevel: result.overallStatus,
          apiKeyId: req.apiKey?.id,
          organizationId: req.apiKey?.organizationId,
        },
      });
    }

    res.json(result);
  }));

  // Batch transaction check
  v1.post("/check/batch", auditWrap("check.batch", async (req, res) => {
    if (!complr) {
      res.status(503).json({ error: "Compliance engine not available" });
      return;
    }
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
    if (!walletScreener) {
      res.status(503).json({ error: "Wallet screener not available" });
      return;
    }
    const { address, chain, jurisdiction } = req.body as {
      address: string;
      chain?: string;
      jurisdiction?: Jurisdiction;
    };
    if (!address) {
      res.status(400).json({ error: "address is required" });
      return;
    }
    keyManager.trackUsage(req.apiKey!.id, "screening");
    const result = await walletScreener.screen(address, chain, jurisdiction);

    if (webhookManager && (result.riskLevel === "high" || result.riskLevel === "critical")) {
      webhookManager.deliver("screen.high_risk", result).catch(() => {});
    }

    // Auto-submit high-risk screenings to review queue
    if (reviewQueue && (result.riskLevel === "high" || result.riskLevel === "critical")) {
      reviewQueue.submit({
        type: "screen",
        decision: result,
        metadata: {
          address: result.address,
          riskLevel: result.riskLevel,
          apiKeyId: req.apiKey?.id,
          organizationId: req.apiKey?.organizationId,
        },
      });
    }

    res.json(result);
  }));

  // Report generation
  v1.post("/report", auditWrap("report", async (req, res) => {
    if (!complr) {
      res.status(503).json({ error: "Compliance engine not available" });
      return;
    }
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

    if (webhookManager) {
      webhookManager.deliver("report.generated", report).catch(() => {});
    }

    // All reports need human sign-off
    if (reviewQueue) {
      reviewQueue.submit({
        type: "report",
        decision: report,
        metadata: {
          transactionId: report.transactionDetails.transactionId,
          jurisdiction: report.jurisdiction,
          apiKeyId: req.apiKey?.id,
          organizationId: req.apiKey?.organizationId,
        },
      });
    }

    res.json(report);
  }));

  // Obligation analysis
  v1.post("/analyze", auditWrap("analyze", async (req, res) => {
    if (!complr) {
      res.status(503).json({ error: "Compliance engine not available" });
      return;
    }
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
    if (!webhookManager) {
      res.status(503).json({ error: "Webhook manager not available" });
      return;
    }
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
    if (!webhookManager) {
      res.status(503).json({ error: "Webhook manager not available" });
      return;
    }
    res.json(webhookManager.listByApiKey(req.apiKey!.id));
  });

  v1.delete("/webhooks/:id", auditWrap("webhook.delete", (req, res) => {
    if (!webhookManager) {
      res.status(503).json({ error: "Webhook manager not available" });
      return;
    }
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

  // Serve static frontend
  app.use(express.static(path.join(__dirname, "../../public")));

  return app;
}
