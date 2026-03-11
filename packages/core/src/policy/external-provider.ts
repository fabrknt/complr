import type { ScreeningProvider, ScreeningHit } from "../types.js";

/** Configuration for an external on-chain intelligence provider */
export interface ExternalProviderConfig {
  apiKey: string;
  baseUrl: string;
  timeout?: number; // ms, default 10000
  cacheTtlMs?: number; // default 300000 (5 min)
  maxRetries?: number; // default 2
}

interface CacheEntry {
  hits: ScreeningHit[];
  cachedAt: number;
}

/**
 * Abstract base class for external on-chain intelligence screening providers.
 * Provides HTTP retry logic, TTL-based caching, rate-limit tracking, and
 * graceful degradation on API failures.
 */
export abstract class ExternalScreeningProvider implements ScreeningProvider {
  abstract name: string;
  lastRefreshed?: string;

  protected config: ExternalProviderConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private cacheTtlMs: number;
  private maxRetries: number;
  private timeout: number;

  /** Remaining API calls reported by the provider (informational) */
  protected rateLimitRemaining: number | null = null;

  /** Whether the last health check succeeded */
  private healthy = true;

  constructor(config: ExternalProviderConfig) {
    this.config = config;
    this.cacheTtlMs = config.cacheTtlMs ?? 300_000;
    this.maxRetries = config.maxRetries ?? 2;
    this.timeout = config.timeout ?? 10_000;
  }

  // ─── Abstract methods for subclasses ─────────────────────────────────

  /** Fetch screening data from the external API for a single address */
  protected abstract fetchScreeningData(address: string, chain?: string): Promise<ScreeningHit[]>;

  /** Check whether the external service is reachable */
  protected abstract healthCheck(): Promise<boolean>;

  // ─── ScreeningProvider interface ─────────────────────────────────────

  /**
   * Refresh clears expired cache entries and runs a health check.
   * Called periodically by the ScreeningRegistry.
   */
  async refresh(): Promise<void> {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.cachedAt > this.cacheTtlMs) {
        this.cache.delete(key);
      }
    }

    try {
      this.healthy = await this.healthCheck();
    } catch {
      this.healthy = false;
    }

    this.lastRefreshed = new Date().toISOString();
  }

  /**
   * Synchronous screen — returns cached results only.
   * If no cached data exists the result is an empty array.
   * Use `screenAsync()` to populate the cache first.
   */
  screen(address: string, chain?: string): ScreeningHit[] {
    const key = this.cacheKey(address, chain);
    const entry = this.cache.get(key);
    if (!entry) return [];
    if (Date.now() - entry.cachedAt > this.cacheTtlMs) {
      this.cache.delete(key);
      return [];
    }
    return entry.hits;
  }

  /**
   * Asynchronous screen — fetches fresh data from the external API,
   * updates the cache, and returns the hits.
   * Falls back to cached data (if any) on API failure.
   */
  async screenAsync(address: string, chain?: string): Promise<ScreeningHit[]> {
    const key = this.cacheKey(address, chain);

    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.cachedAt <= this.cacheTtlMs) {
      return cached.hits;
    }

    try {
      const hits = await this.fetchScreeningData(address, chain);
      this.cache.set(key, { hits, cachedAt: Date.now() });
      return hits;
    } catch (err) {
      console.warn(`[${this.name}] screening failed for ${address}: ${err}`);
      return cached ? cached.hits : [];
    }
  }

  // ─── HTTP helper with retry ──────────────────────────────────────────

  protected async fetchWithRetry(url: string, options?: RequestInit): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.apiKey}`,
      ...(options?.headers as Record<string, string> | undefined),
    };

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const resp = await fetch(url, {
          ...options,
          headers,
          signal: AbortSignal.timeout(this.timeout),
        });

        const remaining = resp.headers.get("x-ratelimit-remaining");
        if (remaining !== null) {
          this.rateLimitRemaining = Number(remaining);
        }

        if (resp.ok) return resp;

        if (resp.status !== 429 && resp.status < 500) {
          throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        }

        lastError = new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      } catch (err) {
        lastError = err;
      }

      if (attempt < this.maxRetries) {
        await this.sleep(Math.min(1000 * 2 ** attempt, 5000));
      }
    }

    throw lastError;
  }

  // ─── Public status helpers ───────────────────────────────────────────

  get isHealthy(): boolean {
    return this.healthy;
  }

  get cacheSize(): number {
    return this.cache.size;
  }

  // ─── Internal helpers ────────────────────────────────────────────────

  private cacheKey(address: string, chain?: string): string {
    return `${(chain ?? "any").toLowerCase()}:${address.toLowerCase()}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
