import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TrmLabsProvider } from "../src/policy/trm-provider.js";

function mockResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => data,
    headers: new Headers(),
  };
}

const defaultConfig = {
  apiKey: "test-trm-key",
  baseUrl: "https://api.trmlabs.com",
  timeout: 5000,
  cacheTtlMs: 0,
  maxRetries: 0,
};

describe("TrmLabsProvider", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns empty array when API returns no entities", async () => {
    mockFetch.mockResolvedValue(mockResponse([{ entities: [] }]));

    const provider = new TrmLabsProvider(defaultConfig);
    const hits = await provider.screenAsync("0xabc123", "ethereum");

    expect(hits).toEqual([]);
  });

  it("parses sanctions entities correctly", async () => {
    mockFetch.mockResolvedValue(
      mockResponse([
        {
          entities: [
            {
              entity: "OFAC Sanctioned Wallet",
              riskScoreCategory: "sanctions",
              riskScore: 95,
              entityId: "trm-001",
            },
          ],
        },
      ])
    );

    const provider = new TrmLabsProvider(defaultConfig);
    const hits = await provider.screenAsync("0xsanctioned", "ethereum");

    expect(hits).toHaveLength(1);
    expect(hits[0].matchType).toBe("exact");
    expect(hits[0].confidence).toBeCloseTo(0.95, 2);
    expect(hits[0].sanctionedEntity).toBe("OFAC Sanctioned Wallet");
    expect(hits[0].program).toBe("sanctions");
    expect(hits[0].provider).toBe("TRM Labs");
    expect(hits[0].listEntry).toBe("trm-001");
  });

  it("maps chain names to TRM format", async () => {
    mockFetch.mockResolvedValue(mockResponse([{ entities: [] }]));

    const provider = new TrmLabsProvider(defaultConfig);

    await provider.screenAsync("0xabc", "ethereum");
    let body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body[0].chain).toBe("ETH");

    // Reset cache by creating a new provider
    const provider2 = new TrmLabsProvider(defaultConfig);
    await provider2.screenAsync("0xabc", "bitcoin");
    body = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(body[0].chain).toBe("BTC");

    const provider3 = new TrmLabsProvider(defaultConfig);
    await provider3.screenAsync("0xabc", "solana");
    body = JSON.parse(mockFetch.mock.calls[2][1].body);
    expect(body[0].chain).toBe("SOL");

    const provider4 = new TrmLabsProvider(defaultConfig);
    await provider4.screenAsync("0xabc", "polygon");
    body = JSON.parse(mockFetch.mock.calls[3][1].body);
    expect(body[0].chain).toBe("MATIC");
  });

  it("handles multiple entities per response", async () => {
    mockFetch.mockResolvedValue(
      mockResponse([
        {
          entities: [
            {
              entity: "Entity A",
              riskScoreCategory: "sanctions",
              riskScore: 100,
              entityId: "e-001",
            },
            {
              entity: "Entity B",
              riskScoreCategory: "scam",
              riskScore: 60,
              entityId: "e-002",
            },
          ],
        },
      ])
    );

    const provider = new TrmLabsProvider(defaultConfig);
    const hits = await provider.screenAsync("0xmulti", "ethereum");

    expect(hits).toHaveLength(2);
    expect(hits[0].sanctionedEntity).toBe("Entity A");
    expect(hits[1].sanctionedEntity).toBe("Entity B");
  });

  it("maps riskScore to confidence", async () => {
    mockFetch.mockResolvedValue(
      mockResponse([
        {
          entities: [
            {
              entity: "Risky Wallet",
              riskScoreCategory: "scam",
              riskScore: 80,
              entityId: "r-001",
            },
          ],
        },
      ])
    );

    const provider = new TrmLabsProvider(defaultConfig);
    const hits = await provider.screenAsync("0xrisky", "ethereum");

    expect(hits).toHaveLength(1);
    expect(hits[0].confidence).toBe(0.8);
  });

  it("sets fuzzy matchType for non-sanctions categories", async () => {
    mockFetch.mockResolvedValue(
      mockResponse([
        {
          entities: [
            {
              entity: "Scam Wallet",
              riskScoreCategory: "scam",
              riskScore: 40,
              entityId: "s-001",
            },
          ],
        },
      ])
    );

    const provider = new TrmLabsProvider(defaultConfig);
    const hits = await provider.screenAsync("0xscam", "ethereum");

    expect(hits).toHaveLength(1);
    expect(hits[0].matchType).toBe("fuzzy");
  });

  it("health check returns true for non-500 response", async () => {
    mockFetch.mockResolvedValue(mockResponse(null, 200));

    const provider = new TrmLabsProvider(defaultConfig);
    await provider.refresh();

    expect(provider.isHealthy).toBe(true);
  });

  it("health check returns false on network error", async () => {
    // First call is for healthCheck (HEAD), which should fail
    mockFetch.mockRejectedValue(new Error("Network error"));

    const provider = new TrmLabsProvider(defaultConfig);
    await provider.refresh();

    expect(provider.isHealthy).toBe(false);
  });

  it("graceful degradation on API error", async () => {
    mockFetch.mockRejectedValue(new Error("API unreachable"));

    const provider = new TrmLabsProvider(defaultConfig);
    const hits = await provider.screenAsync("0xfail", "ethereum");

    // screenAsync catches the error and returns empty array
    expect(hits).toEqual([]);
  });
});
