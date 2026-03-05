import { Router, Request, Response } from "express";
import crypto from "crypto";
import { basicAuth } from "../middleware/basic-auth";
import { getDatabase } from "../db/database";
import { Instance } from "../db/models";
import {
  QNProvisionRequest,
  QNUpdateRequest,
  QNDeprovisionRequest,
  QNDeactivateRequest,
  QNProvisionResponse,
} from "../types/quicknode";

export const provisionRouter = Router();

provisionRouter.use(basicAuth);

// Provision
provisionRouter.post("/", (req: Request, res: Response) => {
  const body = req.body as QNProvisionRequest;
  const quicknodeId = body["quicknode-id"];
  const endpointId = body["endpoint-id"] || null;
  const chain = body.chain || null;
  const network = body.network || null;
  const plan = body.plan || "starter";

  if (!quicknodeId) {
    res.status(400).json({ error: "Missing quicknode-id" });
    return;
  }

  const db = getDatabase();
  const existing = db
    .prepare("SELECT * FROM instances WHERE quicknode_id = ?")
    .get(quicknodeId) as Instance | undefined;

  if (existing) {
    res.status(409).json({ error: "Instance already provisioned" });
    return;
  }

  const id = crypto.randomUUID();

  db.prepare(
    `INSERT INTO instances (id, quicknode_id, plan, endpoint_id, chain, network, status)
     VALUES (?, ?, ?, ?, ?, ?, 'active')`
  ).run(id, quicknodeId, plan, endpointId, chain, network);

  const response: QNProvisionResponse = {
    status: "success",
    "dashboard-url": `https://complr.dev/dashboard/${id}`,
    "access-url": `https://complr.dev/api/${id}`,
  };

  res.status(200).json(response);
});

// Update
provisionRouter.put("/", (req: Request, res: Response) => {
  const body = req.body as QNUpdateRequest;
  const quicknodeId = body["quicknode-id"];
  const plan = body.plan;

  if (!quicknodeId) {
    res.status(400).json({ error: "Missing quicknode-id" });
    return;
  }

  const db = getDatabase();
  const existing = db
    .prepare("SELECT * FROM instances WHERE quicknode_id = ?")
    .get(quicknodeId) as Instance | undefined;

  if (!existing) {
    res.status(404).json({ error: "Instance not found" });
    return;
  }

  db.prepare(
    `UPDATE instances SET plan = ?, updated_at = datetime('now') WHERE quicknode_id = ?`
  ).run(plan, quicknodeId);

  res.status(200).json({ status: "success" });
});

// Deactivate
provisionRouter.delete("/deactivate", (req: Request, res: Response) => {
  const body = req.body as QNDeactivateRequest;
  const quicknodeId = body["quicknode-id"];

  if (!quicknodeId) {
    res.status(400).json({ error: "Missing quicknode-id" });
    return;
  }

  const db = getDatabase();
  db.prepare(
    `UPDATE instances SET status = 'inactive', deactivated_at = datetime('now'), updated_at = datetime('now') WHERE quicknode_id = ?`
  ).run(quicknodeId);

  res.status(200).json({ status: "success" });
});

// Deprovision
provisionRouter.delete("/", (req: Request, res: Response) => {
  const body = req.body as QNDeprovisionRequest;
  const quicknodeId = body["quicknode-id"];

  if (!quicknodeId) {
    res.status(400).json({ error: "Missing quicknode-id" });
    return;
  }

  const db = getDatabase();
  db.prepare("DELETE FROM instances WHERE quicknode_id = ?").run(quicknodeId);

  res.status(200).json({ status: "success" });
});
