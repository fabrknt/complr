import { describe, it, expect, beforeEach } from "vitest";
import { RegulatoryKnowledgeBase } from "../regulatory/knowledge-base.js";
import type { RegulatoryDocument } from "../types.js";

function makeDoc(overrides: Partial<RegulatoryDocument> = {}): RegulatoryDocument {
  return {
    id: overrides.id ?? "doc-1",
    jurisdiction: overrides.jurisdiction ?? "MAS",
    title: overrides.title ?? "Test Regulation",
    source: overrides.source ?? "https://example.com",
    publishedAt: overrides.publishedAt ?? "2025-01-01",
    content: overrides.content ?? "Sample regulatory content for testing.",
    language: overrides.language ?? "en",
    category: overrides.category ?? "aml_kyc",
  };
}

describe("RegulatoryKnowledgeBase", () => {
  let kb: RegulatoryKnowledgeBase;

  beforeEach(() => {
    kb = new RegulatoryKnowledgeBase();
  });

  // ─── Basic CRUD ──────────────────────────────────────────────────

  it("starts empty", () => {
    expect(kb.size).toBe(0);
  });

  it("adds and retrieves a document", () => {
    const doc = makeDoc();
    kb.add(doc);
    expect(kb.size).toBe(1);
    expect(kb.getById("doc-1")).toEqual(doc);
  });

  it("returns undefined for unknown ID", () => {
    expect(kb.getById("nope")).toBeUndefined();
  });

  // ─── search() ────────────────────────────────────────────────────

  describe("search", () => {
    beforeEach(() => {
      kb.add(makeDoc({ id: "mas-1", jurisdiction: "MAS", category: "aml_kyc", title: "MAS AML Guidelines" }));
      kb.add(makeDoc({ id: "sfc-1", jurisdiction: "SFC", category: "licensing", title: "SFC Licensing Framework" }));
      kb.add(makeDoc({ id: "fsa-1", jurisdiction: "FSA", category: "travel_rule", title: "FSA Travel Rule" }));
    });

    it("filters by jurisdiction", () => {
      const results = kb.search({ jurisdiction: "MAS" });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("mas-1");
    });

    it("filters by category", () => {
      const results = kb.search({ category: "licensing" });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("sfc-1");
    });

    it("filters by keyword in title", () => {
      const results = kb.search({ keyword: "Travel" });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("fsa-1");
    });

    it("filters by keyword in content (case-insensitive)", () => {
      kb.add(
        makeDoc({
          id: "special",
          content: "This document covers STABLECOIN regulation.",
          category: "stablecoin",
        }),
      );
      const results = kb.search({ keyword: "stablecoin" });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("special");
    });

    it("returns empty array when nothing matches", () => {
      expect(kb.search({ jurisdiction: "FSA", category: "aml_kyc" })).toHaveLength(0);
    });

    it("respects the limit parameter", () => {
      kb.add(makeDoc({ id: "mas-2", jurisdiction: "MAS" }));
      const results = kb.search({ jurisdiction: "MAS", limit: 1 });
      expect(results).toHaveLength(1);
    });
  });

  // ─── byJurisdiction() ────────────────────────────────────────────

  it("byJurisdiction returns only docs for that jurisdiction", () => {
    kb.add(makeDoc({ id: "a", jurisdiction: "MAS" }));
    kb.add(makeDoc({ id: "b", jurisdiction: "SFC" }));
    kb.add(makeDoc({ id: "c", jurisdiction: "MAS" }));

    const mas = kb.byJurisdiction("MAS");
    expect(mas).toHaveLength(2);
    expect(mas.every((d) => d.jurisdiction === "MAS")).toBe(true);
  });

  // ─── categories ──────────────────────────────────────────────────

  it("tracks unique categories", () => {
    kb.add(makeDoc({ id: "1", category: "aml_kyc" }));
    kb.add(makeDoc({ id: "2", category: "licensing" }));
    kb.add(makeDoc({ id: "3", category: "aml_kyc" }));

    const cats = kb.categories;
    expect(cats).toHaveLength(2);
    expect(cats).toContain("aml_kyc");
    expect(cats).toContain("licensing");
  });

  // ─── semanticSearch (TF-IDF) ─────────────────────────────────────

  describe("semanticSearch", () => {
    it("ranks relevant documents higher", () => {
      kb.add(
        makeDoc({
          id: "aml",
          title: "Anti Money Laundering",
          content: "AML procedures and customer due diligence requirements for virtual asset service providers.",
        }),
      );
      kb.add(
        makeDoc({
          id: "custody",
          title: "Custody Standards",
          content: "Requirements for safeguarding customer assets in custody solutions.",
        }),
      );

      const results = kb.semanticSearch("money laundering AML");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe("aml");
    });

    it("returns empty when no documents match", () => {
      kb.add(makeDoc({ id: "x", content: "unrelated topic about weather" }));
      const results = kb.semanticSearch("zzzzz nonexistent term");
      expect(results).toHaveLength(0);
    });

    it("filters by jurisdiction during semantic search", () => {
      kb.add(makeDoc({ id: "mas-aml", jurisdiction: "MAS", content: "AML compliance framework" }));
      kb.add(makeDoc({ id: "sfc-aml", jurisdiction: "SFC", content: "AML compliance framework" }));

      const results = kb.semanticSearch("AML compliance", { jurisdiction: "SFC" });
      expect(results.every((d) => d.jurisdiction === "SFC")).toBe(true);
    });
  });
});
