import { Router, Request, Response, NextFunction } from "express";
import { instanceLookup } from "../middleware/instance-lookup";
import { apiRateLimit } from "../middleware/rate-limit";
import {
  checkTransaction,
  screenWallet,
  queryRegulation,
  generateSar,
  Jurisdiction,
  TransactionInput,
} from "../services/compliance-service";

export const complianceRouter = Router();

complianceRouter.use(instanceLookup);
complianceRouter.use(apiRateLimit);

// POST /v1/check — single transaction compliance check
complianceRouter.post("/check", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { transaction, jurisdictions } = req.body as {
      transaction: TransactionInput;
      jurisdictions?: Jurisdiction[];
    };

    if (!transaction || !transaction.from || !transaction.to || !transaction.amount || !transaction.asset) {
      res.status(400).json({
        error: "Missing required transaction fields: from, to, amount, asset",
      });
      return;
    }

    const jurs = jurisdictions || ["MAS", "SFC", "FSA"];
    const result = await checkTransaction(transaction, jurs);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// POST /v1/check/batch — batch transaction compliance check (max 50)
complianceRouter.post("/check/batch", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = req.instance!;
    if (instance.plan !== "pro") {
      res.status(403).json({ error: "Batch checks require a Pro plan" });
      return;
    }

    const { transactions, jurisdictions } = req.body as {
      transactions: TransactionInput[];
      jurisdictions?: Jurisdiction[];
    };

    if (!transactions || !Array.isArray(transactions)) {
      res.status(400).json({ error: "Missing required field: transactions (array)" });
      return;
    }

    if (transactions.length > 50) {
      res.status(400).json({ error: "Maximum 50 transactions per batch" });
      return;
    }

    const jurs = jurisdictions || ["MAS", "SFC", "FSA"];
    const results = await Promise.all(
      transactions.map((tx) => checkTransaction(tx, jurs))
    );

    res.status(200).json({ results, count: results.length });
  } catch (error) {
    next(error);
  }
});

// POST /v1/query — regulatory query
complianceRouter.post("/query", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { question, jurisdiction } = req.body as {
      question: string;
      jurisdiction: string;
    };

    if (!question || !jurisdiction) {
      res.status(400).json({ error: "Missing required fields: question, jurisdiction" });
      return;
    }

    const result = await queryRegulation(question, jurisdiction);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// POST /v1/report — SAR/STR generation
complianceRouter.post("/report", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = req.instance!;
    if (instance.plan !== "pro") {
      res.status(403).json({ error: "SAR/STR generation requires a Pro plan" });
      return;
    }

    const { transaction, riskIndicators, jurisdiction } = req.body as {
      transaction: TransactionInput;
      riskIndicators: string[];
      jurisdiction: string;
    };

    if (!transaction || !riskIndicators || !jurisdiction) {
      res.status(400).json({
        error: "Missing required fields: transaction, riskIndicators, jurisdiction",
      });
      return;
    }

    const result = await generateSar(transaction, riskIndicators, jurisdiction);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// POST /v1/screen/wallet — wallet risk screening
complianceRouter.post("/screen/wallet", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = req.instance!;
    if (instance.plan !== "pro") {
      res.status(403).json({ error: "Wallet risk screening requires a Pro plan" });
      return;
    }

    const { address, chain, jurisdiction } = req.body as {
      address: string;
      chain?: string;
      jurisdiction?: string;
    };

    if (!address) {
      res.status(400).json({ error: "Missing required field: address" });
      return;
    }

    const result = await screenWallet(address, chain, jurisdiction);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});
