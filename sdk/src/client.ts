import type {
  ComplrClientConfig,
  TransactionDetails,
  ComplianceCheckResult,
  BatchCheckResponse,
  WalletScreenResult,
  SarReport,
  WebhookRegistration,
  WebhookEvent,
  UsageRecord,
  Jurisdiction,
  ApiError,
} from "./types.js";

/**
 * ComplrClient — the main SDK for interacting with the Complr Compliance API.
 *
 * @example
 * ```ts
 * import { ComplrClient } from "@complr/sdk";
 *
 * const complr = new ComplrClient({ apiKey: "complr_..." });
 * const result = await complr.checkTransaction({
 *   transactionId: "tx_001",
 *   timestamp: new Date().toISOString(),
 *   senderWallet: "0xabc...",
 *   recipientWallet: "0xdef...",
 *   amount: "10000",
 *   currency: "USDC",
 *   chain: "ethereum",
 * });
 * ```
 */
export class ComplrClient {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;
  private maxRetries: number;

  constructor(config: ComplrClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? "https://api.complr.dev").replace(/\/$/, "");
    this.timeout = config.timeout ?? 30_000;
    this.maxRetries = config.maxRetries ?? 3;
  }

  // ─── Core Compliance ──────────────────────────────────────────────

  /** Check a single transaction for compliance across jurisdictions */
  async checkTransaction(
    transaction: TransactionDetails,
    jurisdictions?: Jurisdiction[]
  ): Promise<ComplianceCheckResult> {
    return this.post<ComplianceCheckResult>("/api/v1/check", {
      transaction,
      jurisdictions,
    });
  }

  /** Check multiple transactions in parallel */
  async checkBatch(
    transactions: TransactionDetails[],
    jurisdictions?: Jurisdiction[]
  ): Promise<BatchCheckResponse> {
    return this.post<BatchCheckResponse>("/api/v1/check/batch", {
      transactions,
      jurisdictions,
    });
  }

  /** Screen a wallet address for risk factors */
  async screenWallet(
    address: string,
    chain: string,
    jurisdiction?: Jurisdiction
  ): Promise<WalletScreenResult> {
    return this.post<WalletScreenResult>("/api/v1/screen/wallet", {
      address,
      chain,
      jurisdiction,
    });
  }

  /** Generate a SAR/STR report */
  async generateReport(
    transaction: TransactionDetails,
    riskIndicators: string[],
    jurisdiction: Jurisdiction,
    context?: string
  ): Promise<SarReport> {
    return this.post<SarReport>("/api/v1/report", {
      transaction,
      riskIndicators,
      jurisdiction,
      context,
    });
  }

  /** Query the regulatory knowledge base */
  async query(
    question: string,
    jurisdiction: Jurisdiction
  ): Promise<{ answer: string }> {
    return this.post<{ answer: string }>("/api/v1/query", {
      question,
      jurisdiction,
    });
  }

  // ─── Webhook Management ───────────────────────────────────────────

  /** Register a webhook endpoint */
  async registerWebhook(
    url: string,
    events: WebhookEvent[],
    secret: string
  ): Promise<WebhookRegistration> {
    return this.post<WebhookRegistration>("/api/v1/webhooks", {
      url,
      events,
      secret,
    });
  }

  /** List registered webhooks */
  async listWebhooks(): Promise<WebhookRegistration[]> {
    return this.get<WebhookRegistration[]>("/api/v1/webhooks");
  }

  /** Remove a webhook */
  async removeWebhook(id: string): Promise<void> {
    await this.del(`/api/v1/webhooks/${id}`);
  }

  // ─── Usage ────────────────────────────────────────────────────────

  /** Get usage statistics for the current API key */
  async getUsage(): Promise<UsageRecord> {
    return this.get<UsageRecord>("/api/v1/usage");
  }

  // ─── HTTP Layer ───────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(this.timeout),
        });

        // Rate limited — backoff and retry
        if (response.status === 429 && attempt < this.maxRetries) {
          const data = (await response.json()) as ApiError;
          const delay = data.retryAfterMs ?? Math.pow(2, attempt) * 1000;
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        if (!response.ok) {
          const data = (await response.json().catch(() => ({
            error: `HTTP ${response.status}`,
          }))) as ApiError;
          throw new ComplrApiError(data.error, response.status);
        }

        // DELETE returns no body sometimes
        if (response.status === 204 || method === "DELETE") {
          return undefined as T;
        }

        return (await response.json()) as T;
      } catch (err) {
        if (err instanceof ComplrApiError) throw err;
        lastError = err as Error;

        if (attempt < this.maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    throw lastError ?? new Error("Request failed after retries");
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  private get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  private del(path: string): Promise<void> {
    return this.request<void>("DELETE", path);
  }
}

/** Typed API error */
export class ComplrApiError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = "ComplrApiError";
  }
}
