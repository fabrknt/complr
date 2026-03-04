import express from "express";
import { Complr } from "../index.js";
import type { Jurisdiction, TransactionDetails } from "../types.js";

const app = express();
app.use(express.json());

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("ANTHROPIC_API_KEY is required");
  process.exit(1);
}

const complr = new Complr({ anthropicApiKey: apiKey });
const port = Number(process.env.PORT) || 3000;

/** Health check */
app.get("/health", (_req, res) => {
  res.json({ status: "ok", documents: complr.documentCount });
});

/** Query regulatory knowledge base */
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

/** Check transaction compliance across jurisdictions */
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

/** Generate SAR/STR report */
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

/** Extract obligations from a regulatory document */
app.post("/analyze", async (req, res) => {
  try {
    const { document } = req.body;
    if (!document) {
      res.status(400).json({ error: "document is required" });
      return;
    }
    const obligations = await complr.analyzeDocument(document);
    res.json({ obligations });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.listen(port, () => {
  console.log(`Complr API running on http://localhost:${port}`);
  console.log(`Documents loaded: ${complr.documentCount}`);
});
