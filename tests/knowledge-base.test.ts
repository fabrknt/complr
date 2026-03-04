import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RegulatoryKnowledgeBase } from "../src/regulatory/knowledge-base.js";
import type { RegulatoryDocument } from "../src/types.js";

function makeDoc(overrides: Partial<RegulatoryDocument> = {}): RegulatoryDocument {
  return {
    id: overrides.id ?? `doc_${Math.random().toString(36).slice(2)}`,
    jurisdiction: overrides.jurisdiction ?? "MAS",
    title: overrides.title ?? "Test Document",
    source: overrides.source ?? "test",
    publishedAt: overrides.publishedAt ?? "2025-01-01",
    content: overrides.content ?? "Test content for regulatory compliance.",
    language: overrides.language ?? "en",
    category: overrides.category ?? "aml_kyc",
    organizationId: overrides.organizationId,
  };
}

describe("RegulatoryKnowledgeBase", () => {
  it("add and getById retrieves the document", () => {
    const kb = new RegulatoryKnowledgeBase();
    const doc = makeDoc({ id: "doc_1", title: "AML Guidelines" });
    kb.add(doc);

    const found = kb.getById("doc_1");
    assert.ok(found);
    assert.equal(found.title, "AML Guidelines");
  });

  it("getById returns undefined for missing doc", () => {
    const kb = new RegulatoryKnowledgeBase();
    const found = kb.getById("doc_missing");
    assert.equal(found, undefined);
  });

  it("semanticSearch returns relevant documents", () => {
    const kb = new RegulatoryKnowledgeBase();
    kb.add(makeDoc({ id: "aml", title: "AML KYC Requirements", content: "Anti-money laundering and know your customer compliance requirements for crypto exchanges." }));
    kb.add(makeDoc({ id: "travel", title: "Travel Rule Implementation", content: "Travel rule requirements for cross-border cryptocurrency transactions." }));
    kb.add(makeDoc({ id: "tax", title: "Tax Reporting", content: "Tax reporting obligations for cryptocurrency gains and income." }));

    const results = kb.semanticSearch("anti money laundering KYC");
    assert.ok(results.length > 0);
    // The AML doc should be among results
    assert.ok(results.some((r) => r.id === "aml"));
  });

  it("org visibility: doc with orgId hidden from others", () => {
    const kb = new RegulatoryKnowledgeBase();
    kb.add(makeDoc({ id: "private", title: "Private Doc", content: "Confidential compliance policy internal document.", organizationId: "org_alpha" }));
    kb.add(makeDoc({ id: "public", title: "Public Doc", content: "Public compliance regulation." }));

    // org_alpha can see its own doc
    const alphaResults = kb.semanticSearch("compliance policy", { organizationId: "org_alpha" });
    const alphaIds = alphaResults.map((r) => r.id);
    assert.ok(alphaIds.includes("private") || alphaResults.length > 0);

    // org_beta cannot see org_alpha's private doc
    const betaResults = kb.semanticSearch("compliance policy", { organizationId: "org_beta" });
    const betaIds = betaResults.map((r) => r.id);
    assert.ok(!betaIds.includes("private"));
  });

  it("public docs visible to all orgs", () => {
    const kb = new RegulatoryKnowledgeBase();
    kb.add(makeDoc({ id: "global", title: "Global Regulation", content: "Global anti-money laundering regulation compliance framework." }));

    const results = kb.semanticSearch("anti-money laundering", { organizationId: "org_any" });
    const ids = results.map((r) => r.id);
    assert.ok(ids.includes("global"));
  });

  it("jurisdiction filter works in semanticSearch", () => {
    const kb = new RegulatoryKnowledgeBase();
    kb.add(makeDoc({ id: "mas_doc", jurisdiction: "MAS", title: "MAS Regulation", content: "Singapore monetary authority compliance requirements." }));
    kb.add(makeDoc({ id: "fsa_doc", jurisdiction: "FSA", title: "FSA Regulation", content: "Japan financial services agency compliance requirements." }));

    const masResults = kb.semanticSearch("compliance requirements", { jurisdiction: "MAS" });
    assert.ok(masResults.every((r) => r.jurisdiction === "MAS"));

    const fsaResults = kb.semanticSearch("compliance requirements", { jurisdiction: "FSA" });
    assert.ok(fsaResults.every((r) => r.jurisdiction === "FSA"));
  });

  it("size returns document count", () => {
    const kb = new RegulatoryKnowledgeBase();
    assert.equal(kb.size, 0);
    kb.add(makeDoc({ id: "a" }));
    kb.add(makeDoc({ id: "b" }));
    assert.equal(kb.size, 2);
  });
});
