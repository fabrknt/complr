import type { Jurisdiction, RegulatoryDocument, RegCategory } from "../types.js";
import { TfIdfIndex } from "./vector-search.js";

/**
 * In-memory regulatory knowledge base with TF-IDF semantic search.
 * Phase 0 MVP: stores documents in memory with keyword + semantic search.
 */
export class RegulatoryKnowledgeBase {
  private documents: Map<string, RegulatoryDocument> = new Map();
  private index = new TfIdfIndex();

  add(doc: RegulatoryDocument): void {
    this.documents.set(doc.id, doc);
    this.index.add(doc.id, `${doc.title} ${doc.content}`);
  }

  getById(id: string): RegulatoryDocument | undefined {
    return this.documents.get(id);
  }

  /** Find documents by jurisdiction, category, or keyword */
  search(params: {
    jurisdiction?: Jurisdiction;
    category?: RegCategory;
    keyword?: string;
    limit?: number;
  }): RegulatoryDocument[] {
    const limit = params.limit ?? 10;
    const results: RegulatoryDocument[] = [];

    for (const doc of this.documents.values()) {
      if (params.jurisdiction && doc.jurisdiction !== params.jurisdiction) continue;
      if (params.category && doc.category !== params.category) continue;
      if (params.keyword) {
        const kw = params.keyword.toLowerCase();
        const inTitle = doc.title.toLowerCase().includes(kw);
        const inContent = doc.content.toLowerCase().includes(kw);
        if (!inTitle && !inContent) continue;
      }
      results.push(doc);
      if (results.length >= limit) break;
    }

    return results;
  }

  /** Semantic search using TF-IDF cosine similarity with filtering */
  semanticSearch(query: string, params?: {
    jurisdiction?: Jurisdiction;
    category?: RegCategory;
    organizationId?: string;
    limit?: number;
  }): RegulatoryDocument[] {
    const limit = params?.limit ?? 5;
    // Over-fetch from index to account for filtering
    const overFetch = limit * 5;
    const hits = this.index.search(query, overFetch);

    const results: RegulatoryDocument[] = [];
    for (const hit of hits) {
      const doc = this.documents.get(hit.docId);
      if (!doc) continue;
      if (params?.jurisdiction && doc.jurisdiction !== params.jurisdiction) continue;
      if (params?.category && doc.category !== params.category) continue;
      // Org visibility: docs with organizationId are only visible to that org
      if (doc.organizationId && params?.organizationId !== doc.organizationId) continue;
      results.push(doc);
      if (results.length >= limit) break;
    }

    return results;
  }

  /** Get all documents for a jurisdiction */
  byJurisdiction(jurisdiction: Jurisdiction): RegulatoryDocument[] {
    return this.search({ jurisdiction, limit: 1000 });
  }

  /** Count documents */
  get size(): number {
    return this.documents.size;
  }

  /** Get all unique categories */
  get categories(): RegCategory[] {
    const cats = new Set<RegCategory>();
    for (const doc of this.documents.values()) {
      cats.add(doc.category);
    }
    return [...cats];
  }
}
