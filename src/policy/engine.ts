import Anthropic from "@anthropic-ai/sdk";
import type {
  Jurisdiction,
  ComplianceCheckResult,
  JurisdictionResult,
  TransactionDetails,
} from "../types.js";
import { RegulatoryKnowledgeBase } from "../regulatory/knowledge-base.js";
import { extractJson } from "../utils.js";

/**
 * Multi-jurisdiction policy engine.
 * Given a single transaction event, determines all applicable regulations
 * across jurisdictions and generates a compliance checklist.
 */
export class PolicyEngine {
  private client: Anthropic;
  private model: string;
  private knowledgeBase: RegulatoryKnowledgeBase;

  constructor(
    apiKey: string,
    model: string,
    knowledgeBase: RegulatoryKnowledgeBase
  ) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.knowledgeBase = knowledgeBase;
  }

  /** Check a transaction against all applicable jurisdictions */
  async checkTransaction(
    tx: TransactionDetails,
    jurisdictions: Jurisdiction[]
  ): Promise<ComplianceCheckResult> {
    const results: JurisdictionResult[] = [];

    // Check each jurisdiction in parallel
    const checks = jurisdictions.map((j) => this.checkJurisdiction(tx, j));
    const jurisdictionResults = await Promise.all(checks);

    results.push(...jurisdictionResults);

    // Determine overall status (most restrictive wins)
    const blocked = results.some((r) => r.status === "blocked");
    const requiresAction = results.some((r) => r.status === "requires_action");
    const overallStatus = blocked
      ? "blocked"
      : requiresAction
        ? "requires_action"
        : "compliant";

    // Aggregate action items
    const actionItems = results.flatMap((r) =>
      r.issues.map((issue) => `[${r.jurisdiction}] ${issue}`)
    );

    return {
      transactionId: tx.transactionId,
      checkedAt: new Date().toISOString(),
      jurisdictions: results,
      overallStatus,
      actionItems,
    };
  }

  private async checkJurisdiction(
    tx: TransactionDetails,
    jurisdiction: Jurisdiction
  ): Promise<JurisdictionResult> {
    // Build query from transaction details for semantic search
    const searchQuery = `${tx.chain} ${tx.currency} ${tx.amount} transaction compliance ${jurisdiction}`;
    let docs = this.knowledgeBase.semanticSearch(searchQuery, { jurisdiction, limit: 5 });
    if (docs.length === 0) {
      docs = this.knowledgeBase.byJurisdiction(jurisdiction).slice(0, 5);
    }
    const context = docs
      .map((d) => `${d.title}: ${d.content.slice(0, 500)}`)
      .join("\n");

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: `You are a compliance engine for ${jurisdiction}. Analyze a crypto transaction and determine:
1. Is it compliant with ${jurisdiction} regulations?
2. What obligations apply?
3. Is Travel Rule reporting required?
4. Any issues that need resolution?

Return a JSON object with:
{
  "status": "compliant" | "requires_action" | "blocked",
  "obligations": ["list of applicable obligations"],
  "travelRuleRequired": true/false,
  "reportingRequired": true/false,
  "issues": ["list of issues requiring attention"]
}

Return ONLY the JSON object.`,
      messages: [
        {
          role: "user",
          content: `Transaction details:
- ID: ${tx.transactionId}
- From: ${tx.senderWallet} (KYC: ${tx.senderKycLevel ?? "unknown"})
- To: ${tx.recipientWallet} (KYC: ${tx.recipientKycLevel ?? "unknown"})
- Amount: ${tx.amount} ${tx.currency}
- Chain: ${tx.chain}
- Time: ${tx.timestamp}

Regulatory context for ${jurisdiction}:
${context || "No specific regulatory documents loaded for this jurisdiction."}`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "{}";

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parsed = extractJson(text) as any;
      return {
        jurisdiction,
        status: parsed.status ?? "requires_action",
        obligations: parsed.obligations ?? [],
        travelRuleRequired: parsed.travelRuleRequired ?? false,
        reportingRequired: parsed.reportingRequired ?? false,
        issues: parsed.issues ?? [],
      };
    } catch {
      return {
        jurisdiction,
        status: "requires_action",
        obligations: [],
        travelRuleRequired: false,
        reportingRequired: false,
        issues: ["Failed to analyze transaction for this jurisdiction"],
      };
    }
  }
}
