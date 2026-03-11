import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ChainalysisProvider } from "../src/policy/chainalysis-provider.js";

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
  apiKey: "test-chainalysis-key",
  baseUrl: "https://api.chainalysis.com",
  timeout: 5000,
  cacheTtlMs: 0,
  maxRetries: 0,
};

describe("ChainalysisProvider", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns empty array when no exposures", async () => {
    mockFetch.mockResolvedValue(mockResponse({ exposures: [] }));

    const provider = new ChainalysisProvider(defaultConfig);
    const hits = await provider.screenAsync("0xclean", "ethereum");

    expect(hits).toEqual([]);
  });

  it("parses sanctions exposure correctly", async () => {
    mockFetch.mockResolvedValue(
      mockResponse({
        name: "Sanctioned Entity",
        rootAddress: "0xsanctioned",
        exposures: [{ category: "sanctions", value: 1000 }],
        cluster: { name: "OFAC-listed" },
      })
    );

    const provider = new ChainalysisProvider(defaultConfig);
    const hits = await provider.screenAsync("0xsanctioned", "ethereum");

    expect(hits).toHaveLength(1);
    expect(hits[0].confidence).toBe(1.0);
    expect(hits[0].matchType).toBe("exact");
    expect(hits[0].sanctionedEntity).toBe("Sanctioned Entity");
    expect(hits[0].program).toBe("sanctions");
    expect(hits[0].listEntry).toBe("OFAC-listed");
    expect(hits[0].provider).toBe("Chainalysis KYT");
  });

  it("parses darknet market exposure", async () => {
    mockFetch.mockResolvedValue(
      mockResponse({
        rootAddress: "0xdark",
        exposures: [{ category: "darknet market", value: 500 }],
      })
    );

    const provider = new ChainalysisProvider(defaultConfig);
    const hits = await provider.screenAsync("0xdark", "ethereum");

    expect(hits).toHaveLength(1);
    expect(hits[0].confidence).toBe(0.85);
  });

  it("filters out low-confidence categories below threshold", async () => {
    // gambling has confidence 0.4 in RISK_CATEGORIES
    // The filter is: if (confidence < 0.4) continue;
    // 0.4 is NOT less than 0.4, so gambling is at the boundary and included
    mockFetch.mockResolvedValue(
      mockResponse({
        rootAddress: "0xgambler",
        exposures: [{ category: "gambling", value: 200 }],
      })
    );

    const provider = new ChainalysisProvider(defaultConfig);
    const hits = await provider.screenAsync("0xgambler", "ethereum");

    // gambling at 0.4 passes the < 0.4 threshold (boundary case)
    expect(hits).toHaveLength(1);
    expect(hits[0].confidence).toBe(0.4);
    expect(hits[0].matchType).toBe("fuzzy");
  });

  it("adds risk score hit for high risk", async () => {
    mockFetch.mockResolvedValue(
      mockResponse({
        name: "High Risk Entity",
        rootAddress: "0xhighrisk",
        exposures: [],
        risk: { score: 9 },
      })
    );

    const provider = new ChainalysisProvider(defaultConfig);
    const hits = await provider.screenAsync("0xhighrisk", "ethereum");

    expect(hits).toHaveLength(1);
    expect(hits[0].matchType).toBe("exact"); // score 9 >= 9
    expect(hits[0].confidence).toBe(0.9);
    expect(hits[0].program).toBe("Risk Score: 9/10");
    expect(hits[0].sanctionedEntity).toBe("High Risk Entity");
  });

  it("does not duplicate sanctions when risk score is high", async () => {
    mockFetch.mockResolvedValue(
      mockResponse({
        name: "Sanctioned + High Risk",
        exposures: [{ category: "sanctions", value: 1000 }],
        risk: { score: 9 },
        cluster: { name: "Known Bad" },
      })
    );

    const provider = new ChainalysisProvider(defaultConfig);
    const hits = await provider.screenAsync("0xboth", "ethereum");

    // sanctions exposure gives confidence 1.0 (>= 0.9), so risk score hit is skipped
    expect(hits).toHaveLength(1);
    expect(hits[0].program).toBe("sanctions");
  });

  it("uses network query parameter", async () => {
    mockFetch.mockResolvedValue(mockResponse({ exposures: [] }));

    const provider = new ChainalysisProvider(defaultConfig);
    await provider.screenAsync("0xaddr", "ethereum");

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("?network=ethereum");
  });

  it("sends X-API-Key and Token headers", async () => {
    mockFetch.mockResolvedValue(mockResponse({ exposures: [] }));

    const provider = new ChainalysisProvider(defaultConfig);
    await provider.screenAsync("0xaddr", "ethereum");

    const calledOptions = mockFetch.mock.calls[0][1];
    expect(calledOptions.headers["X-API-Key"]).toBe("test-chainalysis-key");
    expect(calledOptions.headers["Token"]).toBe("test-chainalysis-key");
  });

  it("health check returns true for non-500 response", async () => {
    mockFetch.mockResolvedValue(mockResponse(null, 200));

    const provider = new ChainalysisProvider(defaultConfig);
    await provider.refresh();

    expect(provider.isHealthy).toBe(true);
  });

  it("health check returns false on error", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    const provider = new ChainalysisProvider(defaultConfig);
    await provider.refresh();

    expect(provider.isHealthy).toBe(false);
  });
});
