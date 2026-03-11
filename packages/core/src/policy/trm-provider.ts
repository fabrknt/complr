import type { ScreeningHit } from "../types.js";
import { ExternalScreeningProvider } from "./external-provider.js";
import type { ExternalProviderConfig } from "./external-provider.js";

const CHAIN_MAP: Record<string, string> = {
  ethereum: "ETH",
  bitcoin: "BTC",
  solana: "SOL",
  polygon: "MATIC",
  avalanche: "AVAX",
  arbitrum: "ARB",
  optimism: "OP",
  bsc: "BSC",
};

/**
 * TRM Labs on-chain intelligence provider.
 * Calls TRM's /v2/screening/addresses endpoint and translates
 * risk indicators into ScreeningHit objects.
 */
export class TrmLabsProvider extends ExternalScreeningProvider {
  name = "TRM Labs";

  constructor(config: ExternalProviderConfig) {
    super(config);
  }

  protected async fetchScreeningData(address: string, chain?: string): Promise<ScreeningHit[]> {
    const trmChain = chain ? (CHAIN_MAP[chain.toLowerCase()] ?? chain.toUpperCase()) : undefined;

    const body = [
      {
        address,
        ...(trmChain ? { chain: trmChain } : {}),
      },
    ];

    const resp = await this.fetchWithRetry(`${this.config.baseUrl}/v2/screening/addresses`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await resp.json()) as any[];

    const hits: ScreeningHit[] = [];
    for (const entry of data) {
      const entities = entry.entities ?? [];
      for (const entity of entities) {
        const categories: string[] = entity.riskScoreCategory
          ? [entity.riskScoreCategory]
          : entity.categories ?? [];

        const isSanctions = categories.some(
          (c: string) => c.toLowerCase().includes("sanctions") || c.toLowerCase().includes("ofac")
        );

        const confidence = typeof entity.riskScore === "number"
          ? Math.min(entity.riskScore / 100, 1)
          : 0.5;

        hits.push({
          provider: this.name,
          matchType: isSanctions && confidence >= 0.9 ? "exact" : "fuzzy",
          sanctionedEntity: entity.entity ?? entity.name ?? "Unknown Entity",
          program: categories.join(", ") || "Unknown",
          listEntry: entity.entityId ?? entry.externalId ?? "N/A",
          confidence,
        });
      }
    }

    return hits;
  }

  protected async healthCheck(): Promise<boolean> {
    try {
      const resp = await fetch(this.config.baseUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      });
      return resp.status < 500;
    } catch {
      return false;
    }
  }
}
