import { describe, it, expect } from "vitest";
import { TfIdfIndex } from "../src/regulatory/vector-search.js";

describe("TfIdfIndex", () => {
  it("tokenize strips stopwords and punctuation", () => {
    const index = new TfIdfIndex();
    const tokens = index.tokenize("The quick fox! is on the table.");
    // Stopwords removed
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("is");
    expect(tokens).not.toContain("on");
    // Content words preserved
    expect(tokens).toContain("quick");
    expect(tokens).toContain("fox");
    expect(tokens).toContain("table");
  });

  it("stems -ing, -ed, -s suffixes", () => {
    const index = new TfIdfIndex();
    const tokens = index.tokenize("running jumped tables");
    expect(tokens).toContain("runn"); // "running" → strip -ing → "runn"
    expect(tokens).toContain("jump"); // "jumped" → strip -ed → "jump"
    expect(tokens).toContain("table"); // "tables" → strip -s → "table"
  });

  it("search ranks relevant docs higher", () => {
    const index = new TfIdfIndex();
    index.add("doc1", "cryptocurrency regulation compliance blockchain");
    index.add("doc2", "weather forecast sunny day temperature");
    index.add("doc3", "crypto exchange regulatory framework compliance");

    const results = index.search("crypto regulation compliance");
    expect(results.length).toBeGreaterThanOrEqual(2);
    // doc1 and doc3 should rank above doc2
    const ids = results.map((r) => r.docId);
    const doc2Idx = ids.indexOf("doc2");
    const doc1Idx = ids.indexOf("doc1");
    const doc3Idx = ids.indexOf("doc3");
    if (doc2Idx !== -1) {
      expect(doc1Idx).toBeLessThan(doc2Idx);
      expect(doc3Idx).toBeLessThan(doc2Idx);
    }
  });

  it("empty index returns []", () => {
    const index = new TfIdfIndex();
    const results = index.search("anything");
    expect(results).toEqual([]);
  });

  it("respects limit parameter", () => {
    const index = new TfIdfIndex();
    index.add("a", "compliance regulation aml kyc");
    index.add("b", "compliance regulation sanctions");
    index.add("c", "compliance regulation travel rule");
    index.add("d", "compliance regulation reporting");

    const results = index.search("compliance regulation", 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });
});
