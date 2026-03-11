import { describe, it, expect } from "vitest";
import { ConfidenceScorer } from "../src/regulatory/confidence.js";
import type { RegulatoryDocument } from "../src/types.js";

function makeDoc(overrides: Partial<RegulatoryDocument> = {}): RegulatoryDocument {
  return {
    id: "doc_test",
    jurisdiction: "MAS",
    title: "Payment Services Act",
    source: "https://example.com",
    publishedAt: new Date().toISOString(),
    content: "Digital payment token service providers must obtain a license from MAS. The threshold for Travel Rule reporting is S$1,500. Section 12 requires customer due diligence for all transactions above this threshold.",
    language: "en",
    category: "licensing",
    ...overrides,
  };
}

describe("ConfidenceScorer", () => {
  const scorer = new ConfidenceScorer();

  // ─── Basic scoring ────────────────────────────────────────────────

  it("returns a RegulatoryQueryResult with all required fields", () => {
    const result = scorer.score({
      answer: "The Payment Services Act requires licensing for DPT providers.",
      question: "What are the licensing requirements?",
      jurisdiction: "MAS",
      sourceDocs: [makeDoc()],
      modelUsed: "claude-sonnet-4-5-20250929",
    });

    expect(result.answer).toBeTruthy();
    expect(result.confidence.score).toBeGreaterThanOrEqual(0);
    expect(result.confidence.score).toBeLessThanOrEqual(1);
    expect(["high", "medium", "low", "very_low"]).toContain(result.confidence.level);
    expect(result.confidence.factors).toHaveLength(4);
    expect(result.disclaimer).toContain("AI");
    expect(result.disclaimer).toContain("legal advice");
    expect(result.metadata.jurisdiction).toBe("MAS");
    expect(result.metadata.modelUsed).toBe("claude-sonnet-4-5-20250929");
    expect(result.metadata.queryTimestamp).toBeTruthy();
  });

  it("always includes the legal disclaimer", () => {
    const result = scorer.score({
      answer: "Yes.",
      question: "Is licensing required?",
      jurisdiction: "MAS",
      sourceDocs: [],
      modelUsed: "test",
    });
    expect(result.disclaimer).toContain("not a substitute for final legal judgment");
  });

  // ─── Confidence factors ───────────────────────────────────────────

  it("has four confidence factors", () => {
    const result = scorer.score({
      answer: "Licensing is required under the Payment Services Act.",
      question: "Licensing?",
      jurisdiction: "MAS",
      sourceDocs: [makeDoc()],
      modelUsed: "test",
    });

    const factorNames = result.confidence.factors.map((f) => f.factor);
    expect(factorNames).toContain("source_coverage");
    expect(factorNames).toContain("recency");
    expect(factorNames).toContain("specificity");
    expect(factorNames).toContain("citation_accuracy");
  });

  it("gives higher source_coverage when answer terms appear in docs", () => {
    const doc = makeDoc({ content: "DPT service providers must obtain a license from MAS. Travel Rule threshold is S$1,500." });
    const highCoverage = scorer.score({
      answer: "DPT service providers must obtain a license from MAS under the Travel Rule threshold of S$1,500.",
      question: "What are the requirements?",
      jurisdiction: "MAS",
      sourceDocs: [doc],
      modelUsed: "test",
    });

    const lowCoverage = scorer.score({
      answer: "Blockchain technology enables decentralized finance applications across multiple networks.",
      question: "What are the requirements?",
      jurisdiction: "MAS",
      sourceDocs: [doc],
      modelUsed: "test",
    });

    const highFactor = highCoverage.confidence.factors.find((f) => f.factor === "source_coverage")!;
    const lowFactor = lowCoverage.confidence.factors.find((f) => f.factor === "source_coverage")!;
    expect(highFactor.score).toBeGreaterThan(lowFactor.score);
  });

  it("gives higher recency for recent documents", () => {
    const recentDoc = makeDoc({ publishedAt: new Date().toISOString() });
    const oldDoc = makeDoc({ publishedAt: "2018-01-01T00:00:00Z" });

    const recentResult = scorer.score({
      answer: "Licensing required.",
      question: "Requirements?",
      jurisdiction: "MAS",
      sourceDocs: [recentDoc],
      modelUsed: "test",
    });

    const oldResult = scorer.score({
      answer: "Licensing required.",
      question: "Requirements?",
      jurisdiction: "MAS",
      sourceDocs: [oldDoc],
      modelUsed: "test",
    });

    const recentFactor = recentResult.confidence.factors.find((f) => f.factor === "recency")!;
    const oldFactor = oldResult.confidence.factors.find((f) => f.factor === "recency")!;
    expect(recentFactor.score).toBeGreaterThan(oldFactor.score);
  });

  it("gives higher specificity when answer has amounts, dates, sections", () => {
    const doc = makeDoc();
    const specific = scorer.score({
      answer: "Under Section 12 of the Payment Services Act, the MAS threshold is S$1,500 SGD as of 2024.",
      question: "What is the threshold?",
      jurisdiction: "MAS",
      sourceDocs: [doc],
      modelUsed: "test",
    });

    const vague = scorer.score({
      answer: "There are some requirements for providers.",
      question: "What is the threshold?",
      jurisdiction: "MAS",
      sourceDocs: [doc],
      modelUsed: "test",
    });

    const specificFactor = specific.confidence.factors.find((f) => f.factor === "specificity")!;
    const vagueFactor = vague.confidence.factors.find((f) => f.factor === "specificity")!;
    expect(specificFactor.score).toBeGreaterThan(vagueFactor.score);
  });

  // ─── Citation verification ────────────────────────────────────────

  it("verifies citations that match source document titles", () => {
    const doc = makeDoc({ title: "Payment Services Act" });
    const result = scorer.score({
      answer: 'According to the "Payment Services Act", licensing is required.',
      question: "Is licensing required?",
      jurisdiction: "MAS",
      sourceDocs: [doc],
      modelUsed: "test",
    });

    const verified = result.citations.filter((c) => c.verified);
    expect(verified.length).toBeGreaterThan(0);
    expect(verified.some((c) => c.documentTitle === "Payment Services Act")).toBe(true);
  });

  it("marks citations with relevance scores", () => {
    const doc = makeDoc();
    const result = scorer.score({
      answer: "The Payment Services Act requires customer due diligence.",
      question: "CDD requirements?",
      jurisdiction: "MAS",
      sourceDocs: [doc],
      modelUsed: "test",
    });

    for (const citation of result.citations) {
      expect(citation.relevanceScore).toBeGreaterThanOrEqual(0);
      expect(citation.relevanceScore).toBeLessThanOrEqual(1);
    }
  });

  // ─── Hallucination detection ──────────────────────────────────────

  it("warns when no source documents are available", () => {
    const result = scorer.score({
      answer: "MAS requires all exchanges to be licensed.",
      question: "Licensing?",
      jurisdiction: "MAS",
      sourceDocs: [],
      modelUsed: "test",
    });

    expect(result.warnings.some((w) => w.includes("No source documents"))).toBe(true);
  });

  it("warns when only one source document is available", () => {
    const result = scorer.score({
      answer: "Licensing is required.",
      question: "Licensing?",
      jurisdiction: "MAS",
      sourceDocs: [makeDoc()],
      modelUsed: "test",
    });

    expect(result.warnings.some((w) => w.includes("Only one source document"))).toBe(true);
  });

  it("warns about absolute language", () => {
    const result = scorer.score({
      answer: "It is absolutely guaranteed that all exchanges must always comply without exception.",
      question: "Compliance?",
      jurisdiction: "MAS",
      sourceDocs: [makeDoc()],
      modelUsed: "test",
    });

    expect(result.warnings.some((w) => w.includes("absolute language"))).toBe(true);
  });

  it("warns about wrong-jurisdiction references", () => {
    const masDocs = [makeDoc({ jurisdiction: "MAS" })];
    const result = scorer.score({
      answer: "Under Japan's FSA and JVCEA rules, this is required.",
      question: "What rules apply?",
      jurisdiction: "MAS",
      sourceDocs: masDocs,
      modelUsed: "test",
    });

    expect(result.warnings.some((w) => w.includes("FSA jurisdiction"))).toBe(true);
  });

  it("adds low-confidence warning when score is low", () => {
    const result = scorer.score({
      answer: "Something something definitely guaranteed always never in all cases.",
      question: "What?",
      jurisdiction: "MAS",
      sourceDocs: [],
      modelUsed: "test",
    });

    expect(
      result.warnings.some((w) => w.includes("Low confidence")) ||
      result.confidence.level === "very_low" ||
      result.confidence.level === "low"
    ).toBe(true);
  });

  // ─── Metadata ─────────────────────────────────────────────────────

  it("metadata tracks sources used vs available", () => {
    const docs = [
      makeDoc({ id: "doc_1", title: "Payment Services Act" }),
      makeDoc({ id: "doc_2", title: "Unrelated Document", content: "Nothing relevant here at all." }),
    ];

    const result = scorer.score({
      answer: "The Payment Services Act requires licensing.",
      question: "Licensing?",
      jurisdiction: "MAS",
      sourceDocs: docs,
      modelUsed: "test",
    });

    expect(result.metadata.sourcesAvailable).toBe(2);
    expect(result.metadata.sourcesUsed).toBeGreaterThanOrEqual(1);
  });

  // ─── Edge cases ───────────────────────────────────────────────────

  it("handles empty answer gracefully", () => {
    const result = scorer.score({
      answer: "",
      question: "What?",
      jurisdiction: "MAS",
      sourceDocs: [makeDoc()],
      modelUsed: "test",
    });

    expect(result.confidence.score).toBeGreaterThanOrEqual(0);
    expect(result.answer).toBe("");
  });

  it("confidence level maps correctly to score ranges", () => {
    // Very low confidence (no docs, no refs)
    const veryLow = scorer.score({
      answer: "Unknown.",
      question: "?",
      jurisdiction: "MAS",
      sourceDocs: [],
      modelUsed: "test",
    });
    expect(["low", "very_low"]).toContain(veryLow.confidence.level);
  });

  it("citations are sorted by relevance score descending", () => {
    const docs = [
      makeDoc({ id: "doc_a", title: "Payment Services Act" }),
      makeDoc({ id: "doc_b", title: "Travel Rule Guidelines", content: "Travel Rule compliance requires sender and receiver information exchange." }),
    ];

    const result = scorer.score({
      answer: 'The "Payment Services Act" and Travel Rule Guidelines both apply.',
      question: "What applies?",
      jurisdiction: "MAS",
      sourceDocs: docs,
      modelUsed: "test",
    });

    for (let i = 1; i < result.citations.length; i++) {
      expect(result.citations[i - 1].relevanceScore).toBeGreaterThanOrEqual(
        result.citations[i].relevanceScore
      );
    }
  });
});
