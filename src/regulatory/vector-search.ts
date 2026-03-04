/**
 * TF-IDF index with cosine similarity for zero-dependency semantic search.
 * Suitable for small-to-medium corpora (hundreds of documents).
 */

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of",
  "with", "by", "from", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could", "should",
  "may", "might", "shall", "can", "this", "that", "these", "those", "it", "its",
  "not", "no", "nor", "as", "if", "then", "than", "so", "up", "out", "about",
]);

/** Basic stemming — strip common English suffixes */
function stem(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ing") && word.length > 5) return word.slice(0, -3);
  if (word.endsWith("ed") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) return word.slice(0, -1);
  return word;
}

interface DocEntry {
  id: string;
  tf: Map<string, number>; // term → frequency (normalized)
  termCount: number;
}

export class TfIdfIndex {
  private docs: DocEntry[] = [];
  private docFreq = new Map<string, number>(); // term → number of docs containing it
  private vocabulary: string[] = [];
  private vocabIndex = new Map<string, number>(); // term → position in vocabulary
  private idfDirty = true;
  private idfCache = new Map<string, number>();

  /** Tokenize text into stemmed terms */
  tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOPWORDS.has(w))
      .map(stem);
  }

  /** Add a document to the index */
  add(docId: string, text: string): void {
    const tokens = this.tokenize(text);
    if (tokens.length === 0) return;

    // Compute term frequency
    const counts = new Map<string, number>();
    for (const t of tokens) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }

    const tf = new Map<string, number>();
    for (const [term, count] of counts) {
      tf.set(term, count / tokens.length);
    }

    // Update vocabulary and doc frequency
    const seenTerms = new Set<string>();
    for (const term of counts.keys()) {
      if (!this.vocabIndex.has(term)) {
        this.vocabIndex.set(term, this.vocabulary.length);
        this.vocabulary.push(term);
      }
      if (!seenTerms.has(term)) {
        this.docFreq.set(term, (this.docFreq.get(term) ?? 0) + 1);
        seenTerms.add(term);
      }
    }

    this.docs.push({ id: docId, tf, termCount: tokens.length });
    this.idfDirty = true;
  }

  /** Rebuild IDF cache if dirty */
  private rebuildIdf(): void {
    if (!this.idfDirty) return;
    const N = this.docs.length;
    this.idfCache.clear();
    for (const [term, df] of this.docFreq) {
      this.idfCache.set(term, Math.log((N + 1) / (df + 1)) + 1);
    }
    this.idfDirty = false;
  }

  /** Build TF-IDF vector for a term frequency map */
  private buildVector(tf: Map<string, number>): number[] {
    const vec = new Array<number>(this.vocabulary.length).fill(0);
    for (const [term, freq] of tf) {
      const idx = this.vocabIndex.get(term);
      if (idx !== undefined) {
        vec[idx] = freq * (this.idfCache.get(term) ?? 0);
      }
    }
    return vec;
  }

  /** Cosine similarity between two vectors */
  private cosine(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  /** Search for the most relevant documents */
  search(query: string, limit = 10): Array<{ docId: string; score: number }> {
    if (this.docs.length === 0) return [];

    this.rebuildIdf();

    // Build query TF-IDF vector
    const tokens = this.tokenize(query);
    if (tokens.length === 0) return [];

    const counts = new Map<string, number>();
    for (const t of tokens) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    const queryTf = new Map<string, number>();
    for (const [term, count] of counts) {
      queryTf.set(term, count / tokens.length);
    }

    const queryVec = this.buildVector(queryTf);

    // Score all documents
    const results: Array<{ docId: string; score: number }> = [];
    for (const doc of this.docs) {
      const docVec = this.buildVector(doc.tf);
      const score = this.cosine(queryVec, docVec);
      if (score > 0) {
        results.push({ docId: doc.id, score });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }
}
