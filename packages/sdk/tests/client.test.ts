import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ComplrClient, ComplrApiError } from "../src/client.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockFetch(
  status: number,
  body: unknown,
  headers?: Record<string, string>
): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: `Status ${status}`,
      json: async () => body,
      headers: new Headers(headers ?? {}),
    })
  );
}

function createClient(overrides?: Record<string, unknown>): ComplrClient {
  return new ComplrClient({
    apiKey: "test-key",
    baseUrl: "http://localhost:3000",
    maxRetries: 0,
    timeout: 5000,
    ...overrides,
  });
}

const sampleTransaction = {
  transactionId: "tx_001",
  timestamp: "2025-01-01T00:00:00Z",
  senderWallet: "0xabc",
  recipientWallet: "0xdef",
  amount: "10000",
  currency: "USDC",
  chain: "ethereum",
};

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Request Formatting ──────────────────────────────────────────────────────

describe("Request formatting", () => {
  it("checkTransaction sends POST to /api/v1/check with correct body", async () => {
    mockFetch(200, { transactionId: "tx_001", overallStatus: "compliant" });
    const client = createClient();

    await client.checkTransaction(sampleTransaction, ["MAS"]);

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/check",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          transaction: sampleTransaction,
          jurisdictions: ["MAS"],
        }),
      })
    );
  });

  it("checkBatch sends POST to /api/v1/check/batch", async () => {
    mockFetch(200, { results: [], summary: {} });
    const client = createClient();

    await client.checkBatch([sampleTransaction], ["SFC"]);

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/check/batch",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          transactions: [sampleTransaction],
          jurisdictions: ["SFC"],
        }),
      })
    );
  });

  it("screenWallet sends POST to /api/v1/screen/wallet with address, chain, jurisdiction", async () => {
    mockFetch(200, { address: "0xabc", riskScore: 10 });
    const client = createClient();

    await client.screenWallet("0xabc", "ethereum", "MAS");

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/screen/wallet",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          address: "0xabc",
          chain: "ethereum",
          jurisdiction: "MAS",
        }),
      })
    );
  });

  it("generateReport sends POST to /api/v1/report", async () => {
    mockFetch(200, { id: "rpt_001" });
    const client = createClient();

    await client.generateReport(sampleTransaction, ["high-value"], "FSA", "context");

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/report",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          transaction: sampleTransaction,
          riskIndicators: ["high-value"],
          jurisdiction: "FSA",
          context: "context",
        }),
      })
    );
  });

  it("query sends POST to /api/v1/query with question and jurisdiction", async () => {
    mockFetch(200, { answer: "Yes" });
    const client = createClient();

    await client.query("Is this compliant?", "MAS");

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/query",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          question: "Is this compliant?",
          jurisdiction: "MAS",
        }),
      })
    );
  });

  it("queryConfident sends POST to /api/v1/query/confident", async () => {
    mockFetch(200, { answer: "Yes", confidence: { score: 0.9 } });
    const client = createClient();

    await client.queryConfident("Is this compliant?", "SFC");

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/query/confident",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          question: "Is this compliant?",
          jurisdiction: "SFC",
        }),
      })
    );
  });

  it("all requests include Authorization Bearer header", async () => {
    mockFetch(200, {});
    const client = createClient();

    await client.getUsage();

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
        }),
      })
    );
  });

  it("all requests include Content-Type: application/json header", async () => {
    mockFetch(200, {});
    const client = createClient();

    await client.getUsage();

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      })
    );
  });
});

// ─── Response Handling ───────────────────────────────────────────────────────

describe("Response handling", () => {
  it("returns parsed JSON body on success", async () => {
    const body = { transactionId: "tx_001", overallStatus: "compliant" };
    mockFetch(200, body);
    const client = createClient();

    const result = await client.checkTransaction(sampleTransaction);

    expect(result).toEqual(body);
  });

  it("throws ComplrApiError on non-ok response with status code", async () => {
    mockFetch(400, { error: "Bad request" });
    const client = createClient();

    await expect(client.checkTransaction(sampleTransaction)).rejects.toThrow(
      ComplrApiError
    );

    try {
      await client.checkTransaction(sampleTransaction);
    } catch (err) {
      expect(err).toBeInstanceOf(ComplrApiError);
      expect((err as ComplrApiError).statusCode).toBe(400);
      expect((err as ComplrApiError).message).toBe("Bad request");
    }
  });

  it("handles 204/DELETE responses (removeWebhook)", async () => {
    mockFetch(204, null);
    const client = createClient();

    const result = await client.removeWebhook("wh_001");

    expect(result).toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/webhooks/wh_001",
      expect.objectContaining({ method: "DELETE" })
    );
  });
});

// ─── Retry Logic ─────────────────────────────────────────────────────────────

describe("Retry logic", () => {
  it("retries on network error up to maxRetries times", async () => {
    const mockFn = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", mockFn);
    const client = createClient({ maxRetries: 2 });

    await expect(client.getUsage()).rejects.toThrow("fetch failed");

    // 1 initial + 2 retries = 3 total calls
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it("does not retry on ComplrApiError (non-retryable HTTP errors)", async () => {
    const mockFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({ error: "Invalid API key" }),
      headers: new Headers(),
    });
    vi.stubGlobal("fetch", mockFn);
    const client = createClient({ maxRetries: 2 });

    await expect(client.getUsage()).rejects.toThrow(ComplrApiError);

    // Should NOT retry — only 1 call
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 with exponential backoff", async () => {
    const mockFn = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        json: async () => ({ error: "Rate limited" }),
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ totalRequests: 42 }),
        headers: new Headers(),
      });
    vi.stubGlobal("fetch", mockFn);
    const client = createClient({ maxRetries: 2 });

    const result = await client.getUsage();

    expect(result).toEqual({ totalRequests: 42 });
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it("uses retryAfterMs from 429 response body when available", async () => {
    const mockFn = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        json: async () => ({ error: "Rate limited", retryAfterMs: 10 }),
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ totalRequests: 5 }),
        headers: new Headers(),
      });
    vi.stubGlobal("fetch", mockFn);
    const client = createClient({ maxRetries: 2 });

    const result = await client.getUsage();

    expect(result).toEqual({ totalRequests: 5 });
    expect(mockFn).toHaveBeenCalledTimes(2);
  });
});

// ─── Review Queue Methods ────────────────────────────────────────────────────

describe("Review queue methods", () => {
  it("getReviews sends GET to /admin/reviews with query params", async () => {
    mockFetch(200, { items: [], total: 0 });
    const client = createClient();

    await client.getReviews({ status: "pending", priority: "high", limit: 10 });

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/admin/reviews?status=pending&priority=high&limit=10",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("getReviews sends no query params when filters are empty", async () => {
    mockFetch(200, { items: [], total: 0 });
    const client = createClient();

    await client.getReviews();

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/admin/reviews",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("getReviewStats sends GET to /admin/reviews/stats", async () => {
    mockFetch(200, { total: 50, pending: 10 });
    const client = createClient();

    await client.getReviewStats();

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/admin/reviews/stats",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("getReview sends GET to /admin/reviews/:id", async () => {
    mockFetch(200, { id: "rev_001", status: "pending" });
    const client = createClient();

    await client.getReview("rev_001");

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/admin/reviews/rev_001",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("approveReview sends POST to /admin/reviews/:id/approve with reviewerId and notes", async () => {
    mockFetch(200, { id: "rev_001", status: "approved" });
    const client = createClient();

    await client.approveReview("rev_001", "user_001", "Looks good");

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/admin/reviews/rev_001/approve",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ reviewerId: "user_001", notes: "Looks good" }),
      })
    );
  });

  it("rejectReview sends POST to /admin/reviews/:id/reject", async () => {
    mockFetch(200, { id: "rev_001", status: "rejected" });
    const client = createClient();

    await client.rejectReview("rev_001", "user_001", "Insufficient evidence");

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/admin/reviews/rev_001/reject",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          reviewerId: "user_001",
          notes: "Insufficient evidence",
        }),
      })
    );
  });

  it("escalateReview sends POST to /admin/reviews/:id/escalate", async () => {
    mockFetch(200, { id: "rev_001", status: "escalated" });
    const client = createClient();

    await client.escalateReview("rev_001", "user_001", "Needs senior review");

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/admin/reviews/rev_001/escalate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          reviewerId: "user_001",
          notes: "Needs senior review",
        }),
      })
    );
  });
});

// ─── Other Methods ───────────────────────────────────────────────────────────

describe("Other methods", () => {
  it("getAuditLogs builds query string from params", async () => {
    mockFetch(200, { events: [], total: 0 });
    const client = createClient();

    await client.getAuditLogs({
      action: "check",
      result: "success",
      since: "2025-01-01",
      until: "2025-12-31",
      limit: 50,
      offset: 10,
    });

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/audit?action=check&result=success&since=2025-01-01&until=2025-12-31&limit=50&offset=10",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("listWebhooks sends GET to /api/v1/webhooks", async () => {
    mockFetch(200, []);
    const client = createClient();

    await client.listWebhooks();

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/webhooks",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("registerWebhook sends POST to /api/v1/webhooks", async () => {
    mockFetch(200, { id: "wh_001" });
    const client = createClient();

    await client.registerWebhook(
      "https://example.com/hook",
      ["check.completed"],
      "secret123"
    );

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/webhooks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          url: "https://example.com/hook",
          events: ["check.completed"],
          secret: "secret123",
        }),
      })
    );
  });

  it("getUsage sends GET to /api/v1/usage", async () => {
    mockFetch(200, { totalRequests: 100 });
    const client = createClient();

    await client.getUsage();

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/usage",
      expect.objectContaining({ method: "GET" })
    );
  });
});

// ─── Configuration ───────────────────────────────────────────────────────────

describe("Configuration", () => {
  it("uses default baseUrl when not provided", async () => {
    mockFetch(200, { totalRequests: 0 });
    const client = new ComplrClient({ apiKey: "test-key", maxRetries: 0 });

    await client.getUsage();

    expect(fetch).toHaveBeenCalledWith(
      "https://api.complr.dev/api/v1/usage",
      expect.any(Object)
    );
  });

  it("strips trailing slash from baseUrl", async () => {
    mockFetch(200, { totalRequests: 0 });
    const client = new ComplrClient({
      apiKey: "test-key",
      baseUrl: "http://localhost:3000/",
      maxRetries: 0,
    });

    await client.getUsage();

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/usage",
      expect.any(Object)
    );
  });

  it("uses custom timeout", async () => {
    mockFetch(200, {});
    const client = createClient({ timeout: 1000 });

    await client.getUsage();

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );
  });
});
