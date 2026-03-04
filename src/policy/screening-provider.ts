import type { ScreeningProvider, ScreeningHit } from "../types.js";

/**
 * Registry for pluggable wallet screening providers.
 * Aggregates results from all registered providers.
 */
export class ScreeningRegistry {
  private providers: ScreeningProvider[] = [];

  /** Register a screening provider */
  register(provider: ScreeningProvider): void {
    this.providers.push(provider);
  }

  /** Refresh all providers' data */
  async refreshAll(): Promise<void> {
    await Promise.allSettled(this.providers.map((p) => p.refresh()));
  }

  /** Screen an address against all registered providers */
  screenAll(address: string, chain?: string): ScreeningHit[] {
    const hits: ScreeningHit[] = [];
    for (const provider of this.providers) {
      hits.push(...provider.screen(address, chain));
    }
    return hits;
  }

  /** Number of registered providers */
  get providerCount(): number {
    return this.providers.length;
  }
}
