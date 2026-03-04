/** Supported jurisdictions for compliance analysis */
export type Jurisdiction = "MAS" | "SFC" | "FSA";

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
