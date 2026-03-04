import Anthropic from "@anthropic-ai/sdk";
import type {
  SarReport,
  TransactionDetails,
  Jurisdiction,
} from "../types.js";
import { extractJson } from "../utils.js";

/**
 * Generates Suspicious Activity Reports (SARs) / Suspicious Transaction Reports (STRs)
 * in jurisdiction-specific formats.
 *
 * - FSA Japan: STR (Suspicious Transaction Report)
 * - MAS Singapore: STR (Suspicious Transaction Report)
 * - SFC Hong Kong: STR (Suspicious Transaction Report)
 */
export class ReportGenerator {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  /** Generate a SAR/STR for a given jurisdiction */
  async generateSar(
    tx: TransactionDetails,
    riskIndicators: string[],
    jurisdiction: Jurisdiction,
    additionalContext?: string
  ): Promise<SarReport> {
    const format = this.getFormat(jurisdiction);
    const template = this.getTemplate(jurisdiction);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: `You are a compliance officer generating a Suspicious Transaction Report (STR) for ${jurisdictionName(jurisdiction)}.

The report must follow the ${format} format and include:
1. A clear, factual narrative describing the suspicious activity
2. Specific risk indicators observed
3. Supporting transaction details
4. Recommended next steps

Write professionally in the style expected by ${jurisdictionName(jurisdiction)} regulators. Be factual, not speculative. Reference specific transaction IDs and amounts.`,
      messages: [
        {
          role: "user",
          content: `Generate a ${format} report for the following suspicious transaction:

Transaction Details:
- ID: ${tx.transactionId}
- Date/Time: ${tx.timestamp}
- Sender: ${tx.senderWallet}
- Recipient: ${tx.recipientWallet}
- Amount: ${tx.amount} ${tx.currency}
- Chain: ${tx.chain}
- Sender KYC: ${tx.senderKycLevel ?? "Unknown"}
- Recipient KYC: ${tx.recipientKycLevel ?? "Unknown"}

Risk Indicators:
${riskIndicators.map((r) => `- ${r}`).join("\n")}

${additionalContext ? `Additional Context:\n${additionalContext}` : ""}

Report Template:
${template}

Fill in the template with the specific details. Return the completed report as a JSON object:
{
  "suspicionNarrative": "The full narrative section",
  "riskIndicators": ["formatted risk indicators"],
  "recommendedAction": "Recommended next steps"
}

Return ONLY the JSON object.`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "{}";

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parsed = extractJson(text) as any;
      return {
        id: `sar_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        jurisdiction,
        format,
        generatedAt: new Date().toISOString(),
        transactionDetails: tx,
        suspicionNarrative: parsed.suspicionNarrative ?? "",
        riskIndicators: parsed.riskIndicators ?? riskIndicators,
        recommendedAction: parsed.recommendedAction ?? "",
        status: "draft",
      };
    } catch {
      return {
        id: `sar_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        jurisdiction,
        format,
        generatedAt: new Date().toISOString(),
        transactionDetails: tx,
        suspicionNarrative: "Report generation failed. Manual review required.",
        riskIndicators,
        recommendedAction: "Manual review and report generation required.",
        status: "draft",
      };
    }
  }

  private getFormat(j: Jurisdiction): SarReport["format"] {
    switch (j) {
      case "FSA": return "fsa_str";
      case "MAS": return "mas_str";
      case "SFC": return "sfc_str";
    }
  }

  private getTemplate(j: Jurisdiction): string {
    switch (j) {
      case "FSA":
        return `FSA Japan Suspicious Transaction Report (疑わしい取引の届出)
Sections:
1. Reporting Entity Information
2. Subject Information (Customer details)
3. Transaction Description (Date, amount, type)
4. Grounds for Suspicion (Why this is suspicious)
5. Additional Information`;

      case "MAS":
        return `MAS Singapore Suspicious Transaction Report
Sections:
1. Reporting Institution Details
2. Subject of Report (Individual/Entity details)
3. Suspicious Transaction Details
4. Description of Suspicious Activity
5. Actions Taken by Reporting Institution
6. Other Relevant Information`;

      case "SFC":
        return `SFC Hong Kong Suspicious Transaction Report
Sections:
1. Reporting Entity
2. Subject Person/Entity
3. Transaction Particulars
4. Grounds for Suspicion
5. Action Taken
6. Supporting Documentation`;
    }
  }
}

function jurisdictionName(j: Jurisdiction): string {
  switch (j) {
    case "MAS": return "Monetary Authority of Singapore";
    case "SFC": return "Securities and Futures Commission of Hong Kong";
    case "FSA": return "Financial Services Agency of Japan";
  }
}
