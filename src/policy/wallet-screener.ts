import Anthropic from "@anthropic-ai/sdk";
import type { Jurisdiction, WalletScreenResult } from "../types.js";
import type { ScreeningRegistry } from "./screening-provider.js";
import { extractJson } from "../utils.js";

/**
 * LLM-powered wallet risk screening with optional pluggable provider support.
 * If a ScreeningRegistry is provided, checks all providers first — an exact
 * sanctions hit returns immediately with riskScore 100. Otherwise, LLM analysis
 * is augmented with provider context.
 */
export class WalletScreener {
  private client: Anthropic;
  private model: string;
  private registry?: ScreeningRegistry;

  constructor(apiKey: string, model: string, registry?: ScreeningRegistry) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.registry = registry;
  }

  /** Screen a wallet address for risk factors */
  async screen(
    address: string,
    chain: string,
    jurisdiction?: Jurisdiction
  ): Promise<WalletScreenResult> {
    // Step 1: Check all registered screening providers
    const providerHits = this.registry?.screenAll(address, chain) ?? [];

    // Step 2: If exact sanctions hit, return immediately
    const exactHit = providerHits.find((h) => h.matchType === "exact" && h.confidence >= 0.95);
    if (exactHit) {
      return {
        address,
        chain,
        riskScore: 100,
        riskLevel: "critical",
        flags: [
          `OFAC sanctioned entity: ${exactHit.sanctionedEntity}`,
          `Program: ${exactHit.program}`,
          `List entry: ${exactHit.listEntry}`,
          ...providerHits
            .filter((h) => h !== exactHit)
            .map((h) => `${h.provider}: ${h.sanctionedEntity}`),
        ],
        sanctions: true,
        recommendations: [
          "Block transaction immediately",
          "File SAR/STR with relevant authority",
          "Freeze associated accounts",
        ],
        screenedAt: new Date().toISOString(),
      };
    }

    // Step 3: LLM analysis, augmented with provider context
    const providerContext =
      providerHits.length > 0
        ? `\n\nScreening provider results:\n${providerHits.map((h) => `- ${h.provider}: ${h.matchType} match for ${h.sanctionedEntity} (confidence: ${h.confidence})`).join("\n")}`
        : "";

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: `You are a blockchain compliance analyst performing wallet risk screening.
Evaluate the given wallet address for potential risk factors. Consider:
1. Address format and chain-specific patterns
2. Known sanctioned address patterns (OFAC, EU sanctions lists)
3. Association with known mixing services, darknet markets, or exploit contracts
4. Unusual address characteristics

${jurisdiction ? `Apply ${jurisdiction} jurisdiction-specific requirements.` : "Apply general AML/CFT standards."}

Return a JSON object:
{
  "riskScore": <0-100>,
  "riskLevel": "low" | "medium" | "high" | "critical",
  "flags": ["list of specific risk flags"],
  "sanctions": true/false,
  "recommendations": ["actionable recommendations"]
}

Return ONLY the JSON object.`,
      messages: [
        {
          role: "user",
          content: `Screen this wallet address:
- Address: ${address}
- Chain: ${chain}
${jurisdiction ? `- Jurisdiction: ${jurisdiction}` : ""}
${providerContext}
Perform a thorough risk assessment based on the address characteristics and chain.`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "{}";

    try {
      const parsed = extractJson(text) as {
        riskScore?: number;
        riskLevel?: string;
        flags?: string[];
        sanctions?: boolean;
        recommendations?: string[];
      };
      return {
        address,
        chain,
        riskScore: parsed.riskScore ?? 50,
        riskLevel: (parsed.riskLevel as WalletScreenResult["riskLevel"]) ?? "medium",
        flags: parsed.flags ?? [],
        sanctions: parsed.sanctions ?? false,
        recommendations: parsed.recommendations ?? [],
        screenedAt: new Date().toISOString(),
      };
    } catch {
      return {
        address,
        chain,
        riskScore: 50,
        riskLevel: "medium",
        flags: ["Screening analysis could not be completed"],
        sanctions: false,
        recommendations: ["Manual review recommended"],
        screenedAt: new Date().toISOString(),
      };
    }
  }
}
