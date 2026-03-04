import Anthropic from "@anthropic-ai/sdk";
import type { Jurisdiction, WalletScreenResult } from "../types.js";
import { extractJson } from "../utils.js";

/**
 * LLM-powered wallet risk screening.
 * Evaluates wallet addresses for sanctions, risk indicators, and suspicious patterns.
 */
export class WalletScreener {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  /** Screen a wallet address for risk factors */
  async screen(
    address: string,
    chain: string,
    jurisdiction?: Jurisdiction
  ): Promise<WalletScreenResult> {
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
