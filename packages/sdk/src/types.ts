/** Supported jurisdictions */
export type Jurisdiction = "MAS" | "SFC" | "FSA";

/** Transaction details for compliance checking */
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

/** Single jurisdiction compliance result */
export interface JurisdictionResult {
  jurisdiction: Jurisdiction;
  status: "compliant" | "requires_action" | "blocked";
  obligations: string[];
  travelRuleRequired: boolean;
  travelRuleThreshold?: string;
  reportingRequired: boolean;
  issues: string[];
}

/** Multi-jurisdiction compliance check result */
export interface ComplianceCheckResult {
  transactionId: string;
  checkedAt: string;
  jurisdictions: JurisdictionResult[];
  overallStatus: "compliant" | "requires_action" | "blocked";
  actionItems: string[];
}

/** Batch check response */
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

/** Wallet screening result */
export interface WalletScreenResult {
  address: string;
  chain: string;
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  flags: string[];
  sanctions: boolean;
  recommendations: string[];
  screenedAt: string;
}

/** SAR/STR report */
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

/** Webhook event types */
export type WebhookEvent =
  | "check.completed"
  | "check.blocked"
  | "screen.high_risk"
  | "report.generated";

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

/** Webhook delivery payload */
export interface WebhookPayload {
  id: string;
  event: WebhookEvent;
  timestamp: string;
  data: unknown;
}

/** Usage stats */
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

/** SDK configuration */
export interface ComplrClientConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
}

/** API error response */
export interface ApiError {
  error: string;
  limit?: number;
  retryAfterMs?: number;
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
  | "vault.deposit"
  | "vault.withdraw"
  | "vault.register"
  | "vault.screen"
  | "review.submit"
  | "review.approve"
  | "review.reject"
  | "review.escalate";

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

/** Parameters for querying audit logs */
export interface AuditQueryParams {
  action?: AuditAction;
  result?: "success" | "error" | "blocked";
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

/** Result of an audit log query */
export interface AuditQueryResult {
  events: AuditEvent[];
  total: number;
}

// ─── Confidence Scoring ─────────────────────────────────────────────

/** Confidence factor in a regulatory query result */
export interface ConfidenceFactor {
  factor: "source_coverage" | "recency" | "specificity" | "citation_accuracy";
  score: number;
  weight: number;
  description: string;
}

/** Verified citation from source documents */
export interface Citation {
  documentTitle: string;
  verified: boolean;
  relevanceScore: number;
  snippet?: string;
}

/** Structured regulatory query result with confidence scoring */
export interface RegulatoryQueryResult {
  answer: string;
  confidence: {
    score: number;
    level: "high" | "medium" | "low" | "very_low";
    factors: ConfidenceFactor[];
  };
  citations: Citation[];
  warnings: string[];
  disclaimer: string;
  metadata: {
    jurisdiction: string;
    modelUsed: string;
    queryTimestamp: string;
    sourcesUsed: number;
    sourcesAvailable: number;
  };
}

// ─── Review Queue ───────────────────────────────────────────────────

/** Review item priority */
export type ReviewPriority = "low" | "medium" | "high" | "critical";

/** Review item status */
export type ReviewStatus = "pending" | "approved" | "rejected" | "escalated";

/** Review item type */
export type ReviewType = "check" | "screen" | "report";

/** A review queue item */
export interface ReviewItem {
  id: string;
  type: ReviewType;
  status: ReviewStatus;
  priority: ReviewPriority;
  decision: unknown;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  reviewerId?: string;
  reviewerNotes?: string;
  reviewedAt?: string;
}

/** Review queue query filters */
export interface ReviewQueryFilters {
  status?: ReviewStatus;
  priority?: ReviewPriority;
  type?: ReviewType;
  limit?: number;
  offset?: number;
}

/** Review query result */
export interface ReviewQueryResult {
  items: ReviewItem[];
  total: number;
}

/** Review queue statistics */
export interface ReviewStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  escalated: number;
  avgReviewTimeMs: number;
  byPriority: Record<ReviewPriority, number>;
}
