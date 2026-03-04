import type { Jurisdiction, RegulatoryDocument, RegCategory } from "../types.js";

/**
 * In-memory regulatory knowledge base.
 * Phase 0 MVP: stores documents in memory with simple keyword search.
 * Future: vector DB (Pinecone/Weaviate) with embeddings for semantic search.
 */
export class RegulatoryKnowledgeBase {
  private documents: Map<string, RegulatoryDocument> = new Map();

  add(doc: RegulatoryDocument): void {
    this.documents.set(doc.id, doc);
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
