import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExternalScreeningProvider } from "../src/policy/external-provider.js";
import type { ExternalProviderConfig } from "../src/policy/external-provider.js";
import type { ScreeningHit } from "../src/types.js";

// ─── Concrete test implementation ────────────────────────────────────

class TestProvider extends ExternalScreeningProvider {
  name = "Test Provider";

  public fetchFn: (address: string, chain?: string) => Promise<ScreeningHit[]>;
  public healthFn: () => Promise<boolean>;

  constructor(config: ExternalProviderConfig) {
    super(config);
    this.fetchFn = async () => [];
    this.healthFn = async () => true;
  }

  protected async fetchScreeningData(address: string, chain?: string): Promise<ScreeningHit[]> {
    return this.fetchFn(address, chain);
  }

  protected async healthCheck(): Promise<boolean> {
    return this.healthFn();
  }
}

const defaultConfig: ExternalProviderConfig = {
  apiKey: "test-key",
  baseUrl: "https://api.example.com",
  timeout: 1000,
  cacheTtlMs: 5000,
  maxRetries: 1,
};

const sampleHit: ScreeningHit = {
  provider: "Test Provider",
  matchType: "fuzzy",
  sanctionedEntity: "Bad Actor",
  program: "Test Program",
  listEntry: "T-001",
  confidence: 0.8,
};

describe("ExternalScreeningProvider", () => {
  // ─── screen (synchronous, cached) ─────────────────────────────────

  it("screen returns empty array when nothing is cached", () => {
    const provider = new TestProvider(defaultConfig);
    const hits = provider.screen("0xabc", "ethereum");
    expect(hits).toEqual([]);
  });

  it("screen returns cached results after screenAsync", async () => {
    const provider = new TestProvider(defaultConfig);
    provider.fetchFn = async () => [sampleHit];

    await provider.screenAsync("0xabc", "ethereum");
    const hits = provider.screen("0xabc", "ethereum");
    expect(hits).toHaveLength(1);
    expect(hits[0].sanctionedEntity).toBe("Bad Actor");
  });

  it("screen is case-insensitive for cache keys", async () => {
    const provider = new TestProvider(defaultConfig);
    provider.fetchFn = async () => [sampleHit];

    await provider.screenAsync("0xABC", "Ethereum");
    const hits = provider.screen("0xabc", "ethereum");
    expect(hits).toHaveLength(1);
  });

  // ─── screenAsync ──────────────────────────────────────────────────

  it("screenAsync fetches fresh data", async () => {
    const provider = new TestProvider(defaultConfig);
    provider.fetchFn = async () => [sampleHit];

    const hits = await provider.screenAsync("0xabc", "ethereum");
    expect(hits).toHaveLength(1);
    expect(hits[0].provider).toBe("Test Provider");
  });

  it("screenAsync returns cached data within TTL", async () => {
    let callCount = 0;
    const provider = new TestProvider(defaultConfig);
    provider.fetchFn = async () => {
      callCount++;
      return [sampleHit];
    };

    await provider.screenAsync("0xabc", "ethereum");
    await provider.screenAsync("0xabc", "ethereum");
    expect(callCount).toBe(1); // Second call used cache
  });

  it("screenAsync degrades gracefully on fetch error", async () => {
    const provider = new TestProvider(defaultConfig);
    provider.fetchFn = async () => {
      throw new Error("API down");
    };

    const hits = await provider.screenAsync("0xabc", "ethereum");
    expect(hits).toEqual([]); // Graceful degradation
  });

  it("screenAsync returns stale cache on fetch error", async () => {
    const provider = new TestProvider({
      ...defaultConfig,
      cacheTtlMs: 1, // Very short TTL
    });

    // First call succeeds and caches
    provider.fetchFn = async () => [sampleHit];
    await provider.screenAsync("0xabc", "ethereum");

    // Wait for cache to expire
    await new Promise((r) => setTimeout(r, 10));

    // Second call fails, should return stale cache
    provider.fetchFn = async () => {
      throw new Error("API down");
    };
    const hits = await provider.screenAsync("0xabc", "ethereum");
    expect(hits).toHaveLength(1);
    expect(hits[0].sanctionedEntity).toBe("Bad Actor");
  });

  // ─── refresh ──────────────────────────────────────────────────────

  it("refresh updates lastRefreshed timestamp", async () => {
    const provider = new TestProvider(defaultConfig);
    expect(provider.lastRefreshed).toBeUndefined();
    await provider.refresh();
    expect(provider.lastRefreshed).toBeTruthy();
  });

  it("refresh evicts expired cache entries", async () => {
    const provider = new TestProvider({
      ...defaultConfig,
      cacheTtlMs: 1, // 1ms TTL
    });

    provider.fetchFn = async () => [sampleHit];
    await provider.screenAsync("0xabc", "ethereum");
    expect(provider.cacheSize).toBe(1);

    // Wait for expiry
    await new Promise((r) => setTimeout(r, 10));
    await provider.refresh();
    expect(provider.cacheSize).toBe(0);
  });

  it("refresh sets healthy=false when health check fails", async () => {
    const provider = new TestProvider(defaultConfig);
    provider.healthFn = async () => false;

    await provider.refresh();
    expect(provider.isHealthy).toBe(false);
  });

  it("refresh sets healthy=true when health check passes", async () => {
    const provider = new TestProvider(defaultConfig);
    provider.healthFn = async () => true;

    await provider.refresh();
    expect(provider.isHealthy).toBe(true);
  });

  it("refresh handles health check exceptions gracefully", async () => {
    const provider = new TestProvider(defaultConfig);
    provider.healthFn = async () => {
      throw new Error("Network error");
    };

    await provider.refresh(); // Should not throw
    expect(provider.isHealthy).toBe(false);
  });

  // ─── isHealthy / cacheSize ────────────────────────────────────────

  it("isHealthy defaults to true", () => {
    const provider = new TestProvider(defaultConfig);
    expect(provider.isHealthy).toBe(true);
  });

  it("cacheSize tracks cached addresses", async () => {
    const provider = new TestProvider(defaultConfig);
    provider.fetchFn = async () => [sampleHit];

    expect(provider.cacheSize).toBe(0);
    await provider.screenAsync("0xabc", "ethereum");
    expect(provider.cacheSize).toBe(1);
    await provider.screenAsync("0xdef", "ethereum");
    expect(provider.cacheSize).toBe(2);
  });

  // ─── Cache expiry via screen ──────────────────────────────────────

  it("screen returns empty when cached entry has expired", async () => {
    const provider = new TestProvider({
      ...defaultConfig,
      cacheTtlMs: 1,
    });

    provider.fetchFn = async () => [sampleHit];
    await provider.screenAsync("0xabc", "ethereum");

    // Wait for expiry
    await new Promise((r) => setTimeout(r, 10));
    const hits = provider.screen("0xabc", "ethereum");
    expect(hits).toEqual([]);
  });

  // ─── Different addresses have independent caches ──────────────────

  it("caches are per-address", async () => {
    const provider = new TestProvider(defaultConfig);
    let currentAddress = "";
    provider.fetchFn = async (addr) => {
      currentAddress = addr;
      return addr === "0xbad"
        ? [sampleHit]
        : [];
    };

    await provider.screenAsync("0xbad", "ethereum");
    await provider.screenAsync("0xgood", "ethereum");

    expect(provider.screen("0xbad", "ethereum")).toHaveLength(1);
    expect(provider.screen("0xgood", "ethereum")).toHaveLength(0);
  });
});
