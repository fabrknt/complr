/** Supported jurisdictions for compliance analysis */
export type Jurisdiction = "MAS" | "SFC" | "FSA";

/** Detected address format / chain family */
export type AddressFormat = "ethereum" | "solana" | "bitcoin" | "unknown";

/**
 * Auto-detect the blockchain address format from the address string.
 *
 * Supports:
 *  - Ethereum/EVM: 0x-prefixed hex, 42 chars (e.g. 0xdAC17F958D2ee523a2206206994597C13D831ec7)
 *  - Solana: base58, 32-44 chars (e.g. 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU)
 *  - Bitcoin: starts with 1, 3, or bc1 (e.g. bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4)
 */
export function detectAddressFormat(address: string): AddressFormat {
  if (!address) return "unknown";

  // Ethereum / EVM: 0x + 40 hex chars = 42 total
  if (/^0x[0-9a-fA-F]{40}$/.test(address)) return "ethereum";

  // Bitcoin: legacy (1...), P2SH (3...), or bech32 (bc1...)
  if (/^(1|3)[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) return "bitcoin";
  if (/^bc1[a-zA-HJ-NP-Z0-9]{25,62}$/i.test(address)) return "bitcoin";

  // Solana: base58, typically 32-44 chars, no 0/O/I/l
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return "solana";

  return "unknown";
}

/** Regulatory document metadata */
export interface RegulatoryDocument {
  id: string;
  jurisdiction: Jurisdiction;
  title: string;
  source: string;
  publishedAt: string;
  content: string;
  language: "en" | "ja" | "zh";
  category: RegCategory;
  organizationId?: string;
}

export type RegCategory =
  | "aml_kyc"
  | "travel_rule"
  | "licensing"
  | "token_offering"
  | "stablecoin"
  | "custody"
  | "reporting"
  | "sanctions";

/** Extracted regulatory obligation from a document */
export interface RegulatoryObligation {
  id: string;
  documentId: string;
  jurisdiction: Jurisdiction;
  summary: string;
  obligationType: ObligationType;
  applicableTo: string[];
  threshold?: string;
  deadline?: string;
  penalties?: string;
  controlMapping?: string[];
}

export type ObligationType =
  | "reporting"
  | "record_keeping"
  | "customer_due_diligence"
  | "transaction_monitoring"
  | "travel_rule"
  | "licensing"
  | "capital_requirement"
  | "disclosure"
  | "sanctions_screening";

/** Delta analysis result when a regulation changes */
export interface RegDelta {
  documentId: string;
  jurisdiction: Jurisdiction;
  changedAt: string;
  additions: RegulatoryObligation[];
  modifications: Array<{
    before: RegulatoryObligation;
    after: RegulatoryObligation;
    changeDescription: string;
  }>;
  removals: RegulatoryObligation[];
  impactAssessment: string;
  actionItems: string[];
}

/** Suspicious Activity Report template */
export interface SarReport {
  id: string;
  jurisdiction: Jurisdiction;
  format: "fsa_str" | "mas_str" | "sfc_str";
  generatedAt: string;
  transactionDetails: TransactionDetails;
  suspicionNarrative: string;
  riskIndicators: string[];
  recommendedAction: string;
  status: "draft" | "reviewed" | "submitted";
}

export interface TransactionDetails {
  transactionId: string;
  timestamp: string;
  senderWallet: string;
  recipientWallet: string;
  amount: string;
  currency: string;
  chain: string;
  senderKycLevel?: string;
  recipientKycLevel?: string;
}

/** Multi-jurisdiction compliance check result */
export interface ComplianceCheckResult {
  transactionId: string;
  checkedAt: string;
  jurisdictions: JurisdictionResult[];
  overallStatus: "compliant" | "requires_action" | "blocked";
  actionItems: string[];
}

export interface JurisdictionResult {
  jurisdiction: Jurisdiction;
  status: "compliant" | "requires_action" | "blocked";
  obligations: string[];
  travelRuleRequired: boolean;
  travelRuleThreshold?: string;
  reportingRequired: boolean;
  issues: string[];
}

/** Travel rule thresholds by jurisdiction */
export const TRAVEL_RULE_THRESHOLDS: Record<Jurisdiction, { amount: number; currency: string; note: string }> = {
  FSA: { amount: 0, currency: "JPY", note: "Zero threshold - all transactions" },
  MAS: { amount: 1500, currency: "SGD", note: "S$1,500 threshold" },
  SFC: { amount: 8000, currency: "HKD", note: "HK$8,000 threshold" },
};

/** Agent configuration */
export interface ComplrConfig {
  anthropicApiKey: string;
  model: string;
  port: number;
  jurisdictions: Jurisdiction[];
}

export const DEFAULT_CONFIG: Omit<ComplrConfig, "anthropicApiKey"> = {
  model: "claude-sonnet-4-5-20250929",
  port: 3000,
  jurisdictions: ["MAS", "SFC", "FSA"],
};

// ─── Phase 1: Compliance Middleware SDK Types ─────────────────────────

/** API key record for SDK authentication */
export interface ApiKeyRecord {
  id: string;
  key: string;
  name: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
  rateLimit: number; // requests per minute
  usage: UsageRecord;
  organizationId?: string;
}

/** Usage tracking for an API key */
export interface UsageRecord {
  totalRequests: number;
  totalChecks: number;
  totalScreenings: number;
  totalReports: number;
  totalQueries: number;
  periodStart: string;
  periodEnd: string;
  requestsThisPeriod: number;
}

/** Webhook registration */
export interface WebhookRegistration {
  id: string;
  apiKeyId: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  createdAt: string;
  active: boolean;
  lastDeliveredAt?: string;
  failureCount: number;
}

export type WebhookEvent =
  | "check.completed"
  | "check.blocked"
  | "screen.high_risk"
  | "report.generated";

/** Webhook delivery payload */
export interface WebhookPayload {
  id: string;
  event: WebhookEvent;
  timestamp: string;
  data: unknown;
}

/** Batch compliance check request */
export interface BatchCheckRequest {
  transactions: TransactionDetails[];
  jurisdictions?: Jurisdiction[];
}

/** Batch compliance check response */
export interface BatchCheckResponse {
  results: ComplianceCheckResult[];
  summary: {
    total: number;
    compliant: number;
    requiresAction: number;
    blocked: number;
  };
  processedAt: string;
}

/** Wallet screening request */
export interface WalletScreenRequest {
  address: string;
  chain?: string;
  jurisdiction?: Jurisdiction;
}

/** Wallet screening result */
export interface WalletScreenResult {
  address: string;
  chain: string;
  riskScore: number; // 0-100
  riskLevel: "low" | "medium" | "high" | "critical";
  flags: string[];
  sanctions: boolean;
  recommendations: string[];
  screenedAt: string;
}

// ─── Phase 2: Regulated Yield Platform Types ──────────────────────────

export type VaultStrategy = "conservative" | "balanced" | "growth";

export interface VaultConfig {
  id: VaultStrategy;
  name: string;
  description: string;
  targetApy: number;
  riskLevel: "low" | "medium" | "high";
  minDeposit: number;
  accreditedOnly: boolean;
  composition: VaultAllocation[];
}

export interface VaultAllocation {
  asset: string;
  weight: number; // 0-1
  description: string;
}

export interface InvestorProfile {
  id: string;
  name: string;
  email: string;
  jurisdiction: Jurisdiction;
  accredited: boolean;
  kycStatus: "pending" | "approved" | "rejected";
  sanctionsCleared: boolean;
  registeredAt: string;
  screenedAt?: string;
  riskRating?: "low" | "medium" | "high";
}

export interface DepositRecord {
  id: string;
  investorId: string;
  vaultId: VaultStrategy;
  amount: number;
  currency: string;
  shares: number;
  nav: number;
  timestamp: string;
  complianceCheckId?: string;
}

export interface WithdrawalRecord {
  id: string;
  investorId: string;
  vaultId: VaultStrategy;
  shares: number;
  amount: number;
  currency: string;
  nav: number;
  timestamp: string;
}

export interface VaultState {
  id: VaultStrategy;
  totalShares: number;
  totalValue: number;
  currentNav: number;
  deposits: DepositRecord[];
  withdrawals: WithdrawalRecord[];
  lastUpdated: string;
}

export interface PerformanceDataPoint {
  date: string;
  nav: number;
  totalValue: number;
  dailyReturn: number;
}

export interface InvestorReport {
  investorId: string;
  investorName: string;
  jurisdiction: Jurisdiction;
  reportDate: string;
  reportPeriod: { start: string; end: string };
  holdings: Array<{
    vaultId: VaultStrategy;
    vaultName: string;
    shares: number;
    value: number;
    costBasis: number;
    unrealizedGain: number;
    yieldEarned: number;
  }>;
  totalValue: number;
  totalCostBasis: number;
  totalUnrealizedGain: number;
  totalYieldEarned: number;
  complianceStatus: "compliant" | "review_required";
  taxSummary: {
    jurisdiction: Jurisdiction;
    taxableGains: number;
    applicableRate: string;
    notes: string;
  };
}

// ─── Phase 3: Product Depth Types ──────────────────────────────────

/** Organization for multi-tenant isolation */
export interface Organization {
  id: string;
  name: string;
  createdAt: string;
  rateLimit: number; // aggregate requests per minute across all keys
}

/** Pluggable wallet screening provider */
export interface ScreeningProvider {
  name: string;
  lastRefreshed?: string;
  refresh(): Promise<void>;
  screen(address: string, chain?: string): ScreeningHit[];
}

/** A hit from a screening provider */
export interface ScreeningHit {
  provider: string;
  matchType: "exact" | "fuzzy";
  sanctionedEntity: string;
  program: string;
  listEntry: string;
  confidence: number; // 0-1
}

/** Audit log action categories */
export type AuditAction =
  | "query"
  | "check"
  | "check.batch"
  | "screen"
  | "report"
  | "analyze"
  | "api-key.create"
  | "api-key.revoke"
  | "webhook.create"
  | "webhook.delete"
  | "organization.create"
  | "review.submit"
  | "review.approve"
  | "review.reject"
  | "review.escalate"
  | "vault.deposit"
  | "vault.withdraw"
  | "vault.register"
  | "vault.screen";

/** Audit event logged for every API operation */
export interface AuditEvent {
  id: string;
  timestamp: string;
  apiKeyId: string | null;
  organizationId?: string;
  action: AuditAction;
  resource: string;
  method: string;
  details?: Record<string, unknown>;
  result: "success" | "error" | "blocked";
  statusCode: number;
  ip: string;
  durationMs: number;
}
