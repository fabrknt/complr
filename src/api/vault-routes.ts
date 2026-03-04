import { Router } from "express";
import type { Complr } from "../index.js";
import { VaultSimulator } from "../vault/simulator.js";
import { InvestorCompliance } from "../vault/investor-compliance.js";
import { InvestorReportGenerator } from "../vault/report-generator.js";
import { SEED_INVESTORS } from "../data/seed-investors.js";
import type { VaultStrategy, Jurisdiction } from "../types.js";

/**
 * Create the vault router with all Phase 2 endpoints.
 * Vault routes are not behind API key auth — they're a demo dashboard.
 */
export function createVaultRouter(complr: Complr): Router {
  const router = Router();
  const simulator = new VaultSimulator();
  const investorCompliance = new InvestorCompliance(complr);
  const reportGenerator = new InvestorReportGenerator(simulator);

  // Seed demo investors
  const seeded = investorCompliance.seed(SEED_INVESTORS);
  console.log(`Seeded ${seeded.length} demo investors`);

  // ─── Vault Strategies ───────────────────────────────────────────

  router.get("/strategies", (_req, res) => {
    res.json(simulator.getAllStrategies());
  });

  // ─── Performance ────────────────────────────────────────────────

  router.get("/performance/:vaultId", (req, res) => {
    const vaultId = req.params.vaultId as VaultStrategy;
    const days = Math.min(Number(req.query.days) || 90, 90);
    const data = simulator.getPerformance(vaultId, days);
    if (!data.length) {
      res.status(404).json({ error: "Vault not found" });
      return;
    }
    res.json(data);
  });

  // ─── Deposit ────────────────────────────────────────────────────

  router.post("/deposit", (req, res) => {
    try {
      const { investorId, vaultId, amount } = req.body as {
        investorId: string;
        vaultId: VaultStrategy;
        amount: number;
      };

      if (!investorId || !vaultId || !amount) {
        res.status(400).json({ error: "investorId, vaultId, and amount are required" });
        return;
      }

      // Check investor eligibility
      const config = simulator.getConfig(vaultId);
      if (!config) {
        res.status(400).json({ error: "Invalid vault strategy" });
        return;
      }

      const eligibility = investorCompliance.isEligible(
        investorId,
        config.accreditedOnly
      );
      if (!eligibility.eligible) {
        res.status(403).json({ error: eligibility.reason });
        return;
      }

      const result = simulator.deposit(investorId, vaultId, amount);
      if ("error" in result) {
        res.status(400).json(result);
        return;
      }

      res.status(201).json(result);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ─── Withdraw ───────────────────────────────────────────────────

  router.post("/withdraw", (req, res) => {
    try {
      const { investorId, vaultId, shares } = req.body as {
        investorId: string;
        vaultId: VaultStrategy;
        shares: number;
      };

      if (!investorId || !vaultId || !shares) {
        res.status(400).json({ error: "investorId, vaultId, and shares are required" });
        return;
      }

      const result = simulator.withdraw(investorId, vaultId, shares);
      if ("error" in result) {
        res.status(400).json(result);
        return;
      }

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ─── Portfolio ──────────────────────────────────────────────────

  router.get("/portfolio/:investorId", (req, res) => {
    const investor = investorCompliance.getById(req.params.investorId);
    if (!investor) {
      res.status(404).json({ error: "Investor not found" });
      return;
    }
    const portfolio = simulator.getPortfolio(req.params.investorId);
    res.json({ investor, ...portfolio });
  });

  // ─── Investor Management ───────────────────────────────────────

  router.post("/investors/register", (req, res) => {
    try {
      const { name, email, jurisdiction, accredited } = req.body as {
        name: string;
        email: string;
        jurisdiction: Jurisdiction;
        accredited: boolean;
      };

      if (!name || !email || !jurisdiction) {
        res.status(400).json({ error: "name, email, and jurisdiction are required" });
        return;
      }

      const investor = investorCompliance.register({
        name,
        email,
        jurisdiction,
        accredited: accredited ?? false,
      });

      res.status(201).json(investor);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post("/investors/:id/screen", async (req, res) => {
    try {
      const result = await investorCompliance.screen(req.params.id);
      if ("error" in result) {
        res.status(404).json(result);
        return;
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.get("/investors/:id", (req, res) => {
    const investor = investorCompliance.getById(req.params.id);
    if (!investor) {
      res.status(404).json({ error: "Investor not found" });
      return;
    }
    res.json(investor);
  });

  router.get("/investors", (_req, res) => {
    res.json(investorCompliance.listAll());
  });

  // ─── Reports ────────────────────────────────────────────────────

  router.get("/reports/:investorId", (req, res) => {
    const investor = investorCompliance.getById(req.params.investorId);
    if (!investor) {
      res.status(404).json({ error: "Investor not found" });
      return;
    }
    const report = reportGenerator.generate(investor);
    res.json(report);
  });

  return router;
}
