import type {
  InvestorProfile,
  InvestorReport,
  VaultStrategy,
  Jurisdiction,
} from "../types.js";
import type { VaultSimulator } from "./simulator.js";
import { VAULT_CONFIGS } from "./simulator.js";

/**
 * Generate monthly investor reports, compliance certificates, and tax summaries.
 */
export class InvestorReportGenerator {
  private simulator: VaultSimulator;

  constructor(simulator: VaultSimulator) {
    this.simulator = simulator;
  }

  /** Generate a monthly report for an investor */
  generate(investor: InvestorProfile): InvestorReport {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const portfolio = this.simulator.getPortfolio(investor.id);

    const holdings = portfolio.holdings.map((h) => {
      const config = VAULT_CONFIGS.find((c) => c.id === h.vaultId);
      return {
        vaultId: h.vaultId as VaultStrategy,
        vaultName: config?.name ?? h.vaultName,
        shares: h.shares,
        value: h.currentValue,
        costBasis: h.costBasis,
        unrealizedGain: h.unrealizedGain,
        yieldEarned: h.yieldEarned,
      };
    });

    const taxSummary = this.getTaxSummary(
      investor.jurisdiction,
      portfolio.totalYieldEarned
    );

    return {
      investorId: investor.id,
      investorName: investor.name,
      jurisdiction: investor.jurisdiction,
      reportDate: now.toISOString(),
      reportPeriod: {
        start: periodStart.toISOString().split("T")[0],
        end: periodEnd.toISOString().split("T")[0],
      },
      holdings,
      totalValue: portfolio.totalValue,
      totalCostBasis: portfolio.totalCostBasis,
      totalUnrealizedGain:
        Math.round((portfolio.totalValue - portfolio.totalCostBasis) * 100) / 100,
      totalYieldEarned: portfolio.totalYieldEarned,
      complianceStatus:
        investor.kycStatus === "approved" && investor.sanctionsCleared
          ? "compliant"
          : "review_required",
      taxSummary,
    };
  }

  private getTaxSummary(
    jurisdiction: Jurisdiction,
    gains: number
  ): InvestorReport["taxSummary"] {
    switch (jurisdiction) {
      case "FSA":
        return {
          jurisdiction,
          taxableGains: gains,
          applicableRate: "20% (proposed 2026 reform, currently up to 55%)",
          notes:
            "Japan is transitioning from miscellaneous income (up to 55%) to flat 20% capital gains tax for crypto. Consult your tax advisor for current applicable rate.",
        };
      case "MAS":
        return {
          jurisdiction,
          taxableGains: 0,
          applicableRate: "0% (no capital gains tax)",
          notes:
            "Singapore does not impose capital gains tax. However, gains may be taxable if deemed income from trading activity. Consult IRAS guidelines.",
        };
      case "SFC":
        return {
          jurisdiction,
          taxableGains: 0,
          applicableRate: "0% (no capital gains tax)",
          notes:
            "Hong Kong does not impose capital gains tax. Profits from trading activity may be subject to profits tax (16.5%). Consult your tax advisor.",
        };
    }
  }
}
