import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TfIdfIndex } from "../src/regulatory/vector-search.js";

describe("TfIdfIndex", () => {
  it("tokenize strips stopwords and punctuation", () => {
    const index = new TfIdfIndex();
    const tokens = index.tokenize("The quick fox! is on the table.");
    // Stopwords removed
    assert.ok(!tokens.includes("the"));
    assert.ok(!tokens.includes("is"));
    assert.ok(!tokens.includes("on"));
    // Content words preserved
    assert.ok(tokens.includes("quick"));
    assert.ok(tokens.includes("fox"));
    assert.ok(tokens.includes("table"));
  });

  it("stems -ing, -ed, -s suffixes", () => {
    const index = new TfIdfIndex();
    const tokens = index.tokenize("running jumped tables");
    assert.ok(tokens.includes("runn")); // "running" → strip -ing → "runn"
    assert.ok(tokens.includes("jump")); // "jumped" → strip -ed → "jump"
    assert.ok(tokens.includes("table")); // "tables" → strip -s → "table"
  });

  it("search ranks relevant docs higher", () => {
    const index = new TfIdfIndex();
    index.add("doc1", "cryptocurrency regulation compliance blockchain");
    index.add("doc2", "weather forecast sunny day temperature");
    index.add("doc3", "crypto exchange regulatory framework compliance");

    const results = index.search("crypto regulation compliance");
    assert.ok(results.length >= 2);
    // doc1 and doc3 should rank above doc2
    const ids = results.map((r) => r.docId);
    const doc2Idx = ids.indexOf("doc2");
    const doc1Idx = ids.indexOf("doc1");
    const doc3Idx = ids.indexOf("doc3");
    if (doc2Idx !== -1) {
      assert.ok(doc1Idx < doc2Idx, "doc1 should rank above doc2");
      assert.ok(doc3Idx < doc2Idx, "doc3 should rank above doc2");
    }
  });

  it("empty index returns []", () => {
    const index = new TfIdfIndex();
    const results = index.search("anything");
    assert.deepEqual(results, []);
  });

  it("respects limit parameter", () => {
    const index = new TfIdfIndex();
    index.add("a", "compliance regulation aml kyc");
    index.add("b", "compliance regulation sanctions");
    index.add("c", "compliance regulation travel rule");
    index.add("d", "compliance regulation reporting");

    const results = index.search("compliance regulation", 2);
    assert.ok(results.length <= 2);
  });
});
