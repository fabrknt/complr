import type { ScreeningHit } from "../types.js";
import { ExternalScreeningProvider } from "./external-provider.js";
import type { ExternalProviderConfig } from "./external-provider.js";

const RISK_CATEGORIES: Record<string, number> = {
  sanctions: 1.0,
  "child exploitation": 1.0,
  "terrorist financing": 0.95,
  ransomware: 0.9,
  "darknet market": 0.85,
  "stolen funds": 0.85,
  scam: 0.8,
  "mixing service": 0.75,
  "high risk exchange": 0.6,
  gambling: 0.4,
};

/**
 * Chainalysis KYT on-chain intelligence provider.
 * Calls Chainalysis screening API and translates risk exposure
 * data into ScreeningHit objects.
 */
export class ChainalysisProvider extends ExternalScreeningProvider {
  name = "Chainalysis KYT";

  constructor(config: ExternalProviderConfig) {
    super(config);
  }

  protected async fetchScreeningData(address: string, chain?: string): Promise<ScreeningHit[]> {
    const params = new URLSearchParams();
    if (chain) params.set("network", chain);

    const url = `${this.config.baseUrl}/api/risk/v2/entities/${encodeURIComponent(address)}${params.toString() ? "?" + params.toString() : ""}`;

    const resp = await this.fetchWithRetry(url, {
      method: "GET",
      headers: {
        "X-API-Key": this.config.apiKey,
        Token: this.config.apiKey,
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await resp.json()) as any;

    const hits: ScreeningHit[] = [];
    const exposures: Array<{ category: string; value: number }> = data.exposures ?? data.risk?.exposures ?? [];

    for (const exposure of exposures) {
      const category = exposure.category?.toLowerCase() ?? "";
      const confidence = RISK_CATEGORIES[category] ?? 0.5;

      if (confidence < 0.4) continue;

      hits.push({
        provider: this.name,
        matchType: confidence >= 0.9 ? "exact" : "fuzzy",
        sanctionedEntity: data.name ?? data.rootAddress ?? address,
        program: exposure.category ?? "Unknown",
        listEntry: data.cluster?.name ?? "N/A",
        confidence,
      });
    }

    // Check direct risk score if available
    if (data.risk?.score !== undefined && data.risk.score >= 7) {
      const existsSanctions = hits.some((h) => h.confidence >= 0.9);
      if (!existsSanctions) {
        hits.push({
          provider: this.name,
          matchType: data.risk.score >= 9 ? "exact" : "fuzzy",
          sanctionedEntity: data.name ?? address,
          program: `Risk Score: ${data.risk.score}/10`,
          listEntry: data.cluster?.name ?? "N/A",
          confidence: data.risk.score / 10,
        });
      }
    }

    return hits;
  }

  protected async healthCheck(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.config.baseUrl}/api/risk/v2/entities/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
        headers: {
          "X-API-Key": this.config.apiKey,
          Token: this.config.apiKey,
        },
      });
      return resp.status < 500;
    } catch {
      return false;
    }
  }
}
