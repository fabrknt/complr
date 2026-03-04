import Anthropic from "@anthropic-ai/sdk";
import type {
  RegulatoryDocument,
  RegulatoryObligation,
  RegDelta,
  Jurisdiction,
} from "../types.js";
import { extractJson } from "../utils.js";

/**
 * LLM-powered regulatory document analyzer.
 * Extracts obligations from regulatory text and performs delta analysis.
 */
export class RegulatoryAnalyzer {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  /** Extract structured obligations from a regulatory document */
  async extractObligations(doc: RegulatoryDocument): Promise<RegulatoryObligation[]> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: `You are an expert regulatory analyst specializing in crypto/digital asset regulations across Asia-Pacific jurisdictions (MAS Singapore, SFC Hong Kong, FSA Japan).

Your task is to extract specific, actionable compliance obligations from regulatory text. For each obligation, identify:
- What action is required
- Who it applies to (exchanges, custodians, advisors, etc.)
- Any thresholds or limits
- Deadlines or timing requirements
- Penalties for non-compliance
- What internal controls should map to this obligation

Return your analysis as a JSON array of obligations.`,
      messages: [
        {
          role: "user",
          content: `Analyze the following regulatory document and extract all compliance obligations.

Jurisdiction: ${doc.jurisdiction}
Title: ${doc.title}
Published: ${doc.publishedAt}
Category: ${doc.category}

Document text:
${doc.content}

Return a JSON array where each element has these fields:
{
  "summary": "Brief description of the obligation",
  "obligationType": "reporting|record_keeping|customer_due_diligence|transaction_monitoring|travel_rule|licensing|capital_requirement|disclosure|sanctions_screening",
  "applicableTo": ["exchange", "custodian", "advisor", etc.],
  "threshold": "Any monetary or volume threshold (or null)",
  "deadline": "Any deadline or timing requirement (or null)",
  "penalties": "Penalties for non-compliance (or null)",
  "controlMapping": ["Suggested internal controls to satisfy this obligation"]
}

Return ONLY the JSON array, no other text.`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    try {
      const parsed = extractJson(text) as Array<Omit<RegulatoryObligation, "id" | "documentId" | "jurisdiction">>;
      return parsed.map((item, idx) => ({
        ...item,
        id: `${doc.id}_obl_${idx}`,
        documentId: doc.id,
        jurisdiction: doc.jurisdiction,
      }));
    } catch {
      console.error("Failed to parse LLM response as JSON:", text.slice(0, 200));
      return [];
    }
  }

  /** Compare two versions of a regulation and identify changes */
  async analyzeDelta(
    oldDoc: RegulatoryDocument,
    newDoc: RegulatoryDocument
  ): Promise<RegDelta> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: `You are an expert regulatory analyst. Compare two versions of a regulatory document and identify all changes that affect compliance obligations for crypto/digital asset firms.

Focus on:
1. New obligations added
2. Existing obligations modified (thresholds, deadlines, scope)
3. Obligations removed
4. Impact assessment: how severe are these changes?
5. Action items: what must firms do to comply?`,
      messages: [
        {
          role: "user",
          content: `Compare these two versions of the regulation:

PREVIOUS VERSION:
Title: ${oldDoc.title}
Published: ${oldDoc.publishedAt}
${oldDoc.content}

NEW VERSION:
Title: ${newDoc.title}
Published: ${newDoc.publishedAt}
${newDoc.content}

Return a JSON object with:
{
  "additions": [{"summary": "...", "obligationType": "...", "applicableTo": [...]}],
  "modifications": [{"changeDescription": "...", "before": "...", "after": "..."}],
  "removals": [{"summary": "..."}],
  "impactAssessment": "Overall assessment of the severity and urgency of changes",
  "actionItems": ["Specific actions firms should take"]
}

Return ONLY the JSON object.`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parsed = extractJson(text) as any;
      return {
        documentId: newDoc.id,
        jurisdiction: newDoc.jurisdiction,
        changedAt: new Date().toISOString(),
        additions: (parsed.additions ?? []).map(
          (a: Record<string, unknown>, i: number) => ({
            ...a,
            id: `${newDoc.id}_add_${i}`,
            documentId: newDoc.id,
            jurisdiction: newDoc.jurisdiction,
          })
        ),
        modifications: parsed.modifications ?? [],
        removals: (parsed.removals ?? []).map(
          (r: Record<string, unknown>, i: number) => ({
            ...r,
            id: `${newDoc.id}_rem_${i}`,
            documentId: newDoc.id,
            jurisdiction: newDoc.jurisdiction,
          })
        ),
        impactAssessment: parsed.impactAssessment ?? "",
        actionItems: parsed.actionItems ?? [],
      };
    } catch {
      return {
        documentId: newDoc.id,
        jurisdiction: newDoc.jurisdiction,
        changedAt: new Date().toISOString(),
        additions: [],
        modifications: [],
        removals: [],
        impactAssessment: "Failed to analyze delta",
        actionItems: [],
      };
    }
  }

  /** Answer a natural language question about regulations for a jurisdiction */
  async query(
    question: string,
    jurisdiction: Jurisdiction,
    context: RegulatoryDocument[]
  ): Promise<string> {
    const contextText = context
      .map((doc) => `[${doc.title} (${doc.publishedAt})]\n${doc.content}`)
      .join("\n\n---\n\n");

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system: `You are an expert regulatory analyst for ${jurisdiction} (${jurisdictionName(jurisdiction)}). Answer questions about crypto/digital asset compliance using the provided regulatory context. Be specific, cite relevant sections, and note any ambiguities. If the context doesn't contain enough information, say so.`,
      messages: [
        {
          role: "user",
          content: `Context documents:\n${contextText}\n\nQuestion: ${question}`,
        },
      ],
    });

    return response.content[0].type === "text" ? response.content[0].text : "";
  }
}

function jurisdictionName(j: Jurisdiction): string {
  switch (j) {
    case "MAS":
      return "Monetary Authority of Singapore";
    case "SFC":
      return "Securities and Futures Commission of Hong Kong";
    case "FSA":
      return "Financial Services Agency of Japan";
  }
}
