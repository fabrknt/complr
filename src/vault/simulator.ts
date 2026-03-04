import type {
  VaultStrategy,
  VaultConfig,
  VaultState,
  DepositRecord,
  WithdrawalRecord,
  PerformanceDataPoint,
} from "../types.js";
import { randomBytes } from "node:crypto";

/** 3 vault strategy configurations */
export const VAULT_CONFIGS: VaultConfig[] = [
  {
    id: "conservative",
    name: "Conservative Yield",
    description: "Low-risk treasury-backed yield through tokenized T-bills and stablecoins",
    targetApy: 3.8,
    riskLevel: "low",
    minDeposit: 1000,
    accreditedOnly: false,
    composition: [
      { asset: "BUIDL", weight: 0.7, description: "BlackRock Tokenized Treasury Fund" },
      { asset: "USYC", weight: 0.2, description: "Hashnote US Yield Coin" },
      { asset: "USDC", weight: 0.1, description: "Circle USD Coin (liquidity buffer)" },
    ],
  },
  {
    id: "balanced",
    name: "Balanced Yield",
    description: "Medium-risk diversified yield across tokenized treasuries and yield-bearing stablecoins",
    targetApy: 4.3,
    riskLevel: "medium",
    minDeposit: 5000,
    accreditedOnly: false,
    composition: [
      { asset: "BUIDL", weight: 0.4, description: "BlackRock Tokenized Treasury Fund" },
      { asset: "USDY", weight: 0.3, description: "Ondo US Dollar Yield" },
      { asset: "USYC", weight: 0.2, description: "Hashnote US Yield Coin" },
      { asset: "USDC", weight: 0.1, description: "Circle USD Coin (liquidity buffer)" },
    ],
  },
  {
    id: "growth",
    name: "Growth Yield",
    description: "Higher-risk yield strategy with DeFi integration. Accredited investors only.",
    targetApy: 4.8,
    riskLevel: "medium",
    minDeposit: 10000,
    accreditedOnly: true,
    composition: [
      { asset: "BUIDL", weight: 0.3, description: "BlackRock Tokenized Treasury Fund" },
      { asset: "USDY", weight: 0.3, description: "Ondo US Dollar Yield" },
      { asset: "sDAI", weight: 0.25, description: "MakerDAO Savings DAI" },
      { asset: "USDC", weight: 0.15, description: "Circle USD Coin (liquidity buffer)" },
    ],
  },
];

/**
 * Vault simulator with NAV tracking, deposit/withdraw, and historical data.
 * All in-memory — resets on server restart.
 */
export class VaultSimulator {
  private states = new Map<VaultStrategy, VaultState>();
  private performance = new Map<VaultStrategy, PerformanceDataPoint[]>();

  constructor() {
    this.initializeVaults();
  }

  private initializeVaults(): void {
    const now = new Date();

    for (const config of VAULT_CONFIGS) {
      // Initialize vault state
      this.states.set(config.id, {
        id: config.id,
        totalShares: 0,
        totalValue: 0,
        currentNav: 1.0, // Start at $1 per share
        deposits: [],
        withdrawals: [],
        lastUpdated: now.toISOString(),
      });

      // Generate 90 days of historical performance data
      const history: PerformanceDataPoint[] = [];
      let nav = 1.0;
      const dailyReturn = config.targetApy / 100 / 365;

      for (let i = 90; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);

        // Add realistic variance
        const variance = (Math.random() - 0.5) * 0.002;
        const dayReturn = dailyReturn + variance;
        nav *= 1 + dayReturn;

        // Simulate some AUM growth
        const daysSinceStart = 90 - i;
        const simulatedAum =
          1_000_000 + daysSinceStart * 15_000 + Math.random() * 50_000;

        history.push({
          date: date.toISOString().split("T")[0],
          nav: Math.round(nav * 10000) / 10000,
          totalValue: Math.round(simulatedAum * 100) / 100,
          dailyReturn: Math.round(dayReturn * 10000) / 10000,
        });
      }

      this.performance.set(config.id, history);

      // Update vault state with current NAV
      const state = this.states.get(config.id)!;
      state.currentNav = history[history.length - 1].nav;
    }
  }

  /** Get vault configuration */
  getConfig(id: VaultStrategy): VaultConfig | undefined {
    return VAULT_CONFIGS.find((c) => c.id === id);
  }

  /** Get all vault configs with current NAV */
  getAllStrategies(): Array<VaultConfig & { currentNav: number; currentApy: number }> {
    return VAULT_CONFIGS.map((config) => {
      const state = this.states.get(config.id)!;
      const history = this.performance.get(config.id)!;

      // Calculate realized APY from last 30 days
      const recent = history.slice(-30);
      const startNav = recent[0].nav;
      const endNav = recent[recent.length - 1].nav;
      const periodReturn = (endNav - startNav) / startNav;
      const currentApy = Math.round(periodReturn * (365 / 30) * 10000) / 100;

      return { ...config, currentNav: state.currentNav, currentApy };
    });
  }

  /** Get historical performance data */
  getPerformance(vaultId: VaultStrategy, days = 90): PerformanceDataPoint[] {
    const history = this.performance.get(vaultId);
    if (!history) return [];
    return history.slice(-days);
  }

  /** Process a deposit */
  deposit(
    investorId: string,
    vaultId: VaultStrategy,
    amount: number,
    complianceCheckId?: string
  ): DepositRecord | { error: string } {
    const config = this.getConfig(vaultId);
    if (!config) return { error: "Invalid vault strategy" };

    if (amount < config.minDeposit) {
      return { error: `Minimum deposit is $${config.minDeposit.toLocaleString()}` };
    }

    const state = this.states.get(vaultId)!;
    const shares = amount / state.currentNav;

    const record: DepositRecord = {
      id: `dep_${randomBytes(8).toString("hex")}`,
      investorId,
      vaultId,
      amount,
      currency: "USDC",
      shares: Math.round(shares * 10000) / 10000,
      nav: state.currentNav,
      timestamp: new Date().toISOString(),
      complianceCheckId,
    };

    state.deposits.push(record);
    state.totalShares += record.shares;
    state.totalValue += amount;
    state.lastUpdated = record.timestamp;

    return record;
  }

  /** Process a withdrawal */
  withdraw(
    investorId: string,
    vaultId: VaultStrategy,
    shares: number
  ): WithdrawalRecord | { error: string } {
    const state = this.states.get(vaultId);
    if (!state) return { error: "Invalid vault strategy" };

    // Calculate investor's available shares
    const investorDeposits = state.deposits
      .filter((d) => d.investorId === investorId)
      .reduce((sum, d) => sum + d.shares, 0);
    const investorWithdrawals = state.withdrawals
      .filter((w) => w.investorId === investorId)
      .reduce((sum, w) => sum + w.shares, 0);
    const availableShares = investorDeposits - investorWithdrawals;

    if (shares > availableShares) {
      return { error: `Insufficient shares. Available: ${availableShares.toFixed(4)}` };
    }

    const amount = shares * state.currentNav;

    const record: WithdrawalRecord = {
      id: `wdr_${randomBytes(8).toString("hex")}`,
      investorId,
      vaultId,
      shares: Math.round(shares * 10000) / 10000,
      amount: Math.round(amount * 100) / 100,
      currency: "USDC",
      nav: state.currentNav,
      timestamp: new Date().toISOString(),
    };

    state.withdrawals.push(record);
    state.totalShares -= record.shares;
    state.totalValue -= record.amount;
    state.lastUpdated = record.timestamp;

    return record;
  }

  /** Get an investor's portfolio across all vaults */
  getPortfolio(investorId: string): {
    holdings: Array<{
      vaultId: VaultStrategy;
      vaultName: string;
      shares: number;
      currentValue: number;
      costBasis: number;
      unrealizedGain: number;
      yieldEarned: number;
    }>;
    totalValue: number;
    totalCostBasis: number;
    totalYieldEarned: number;
  } {
    const holdings: Array<{
      vaultId: VaultStrategy;
      vaultName: string;
      shares: number;
      currentValue: number;
      costBasis: number;
      unrealizedGain: number;
      yieldEarned: number;
    }> = [];

    for (const config of VAULT_CONFIGS) {
      const state = this.states.get(config.id)!;

      const deposits = state.deposits.filter((d) => d.investorId === investorId);
      const withdrawals = state.withdrawals.filter((w) => w.investorId === investorId);

      const totalSharesBought = deposits.reduce((s, d) => s + d.shares, 0);
      const totalSharesSold = withdrawals.reduce((s, w) => s + w.shares, 0);
      const activeShares = totalSharesBought - totalSharesSold;

      if (activeShares <= 0) continue;

      const costBasis = deposits.reduce((s, d) => s + d.amount, 0);
      const withdrawnAmount = withdrawals.reduce((s, w) => s + w.amount, 0);
      const netCostBasis = costBasis - withdrawnAmount;
      const currentValue = Math.round(activeShares * state.currentNav * 100) / 100;
      const unrealizedGain = Math.round((currentValue - netCostBasis) * 100) / 100;

      holdings.push({
        vaultId: config.id,
        vaultName: config.name,
        shares: Math.round(activeShares * 10000) / 10000,
        currentValue,
        costBasis: Math.round(netCostBasis * 100) / 100,
        unrealizedGain,
        yieldEarned: unrealizedGain > 0 ? unrealizedGain : 0,
      });
    }

    return {
      holdings,
      totalValue: holdings.reduce((s, h) => s + h.currentValue, 0),
      totalCostBasis: holdings.reduce((s, h) => s + h.costBasis, 0),
      totalYieldEarned: holdings.reduce((s, h) => s + h.yieldEarned, 0),
    };
  }

  /** Get vault state */
  getState(vaultId: VaultStrategy): VaultState | undefined {
    return this.states.get(vaultId);
  }
}
