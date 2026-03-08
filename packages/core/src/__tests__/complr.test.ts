import { describe, it, expect } from "vitest";
import { Complr } from "../index.js";
import type { RegulatoryDocument } from "../types.js";

/**
 * Tests for the Complr orchestrator class.
 * Async methods (query, checkTransaction, etc.) call the Anthropic API,
 * so we only test synchronous / structural behaviour here.
 */

const FAKE_API_KEY = "sk-ant-test-fake-key";

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

describe("Complr", () => {
  describe("constructor", () => {
    it("instantiates with only an API key (uses defaults)", () => {
      const c = new Complr({ anthropicApiKey: FAKE_API_KEY });
      expect(c).toBeInstanceOf(Complr);
      expect(c.documentCount).toBe(0);
    });

    it("accepts optional config overrides", () => {
      const c = new Complr({
        anthropicApiKey: FAKE_API_KEY,
        model: "claude-sonnet-4-5-20250929",
        port: 8080,
        jurisdictions: ["FSA"],
      });
      expect(c).toBeInstanceOf(Complr);
    });
  });

  describe("addDocument / getDocument / documentCount", () => {
    it("adds a document and retrieves it by ID", () => {
      const c = new Complr({ anthropicApiKey: FAKE_API_KEY });
      const doc = makeDoc({ id: "reg-001" });

      c.addDocument(doc);

      expect(c.documentCount).toBe(1);
      expect(c.getDocument("reg-001")).toEqual(doc);
    });

    it("returns undefined for a missing document", () => {
      const c = new Complr({ anthropicApiKey: FAKE_API_KEY });
      expect(c.getDocument("nonexistent")).toBeUndefined();
    });

    it("overwrites a document with the same ID", () => {
      const c = new Complr({ anthropicApiKey: FAKE_API_KEY });
      const v1 = makeDoc({ id: "reg-001", title: "Version 1" });
      const v2 = makeDoc({ id: "reg-001", title: "Version 2" });

      c.addDocument(v1);
      c.addDocument(v2);

      expect(c.documentCount).toBe(1);
      expect(c.getDocument("reg-001")?.title).toBe("Version 2");
    });

    it("handles multiple distinct documents", () => {
      const c = new Complr({ anthropicApiKey: FAKE_API_KEY });
      c.addDocument(makeDoc({ id: "a" }));
      c.addDocument(makeDoc({ id: "b" }));
      c.addDocument(makeDoc({ id: "c" }));

      expect(c.documentCount).toBe(3);
    });
  });
});
