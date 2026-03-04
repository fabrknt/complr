import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Generic file-backed Map store.
 * Optional filePath — without one it behaves as a plain in-memory Map (backward compat).
 * Persistence uses atomic write (write to .tmp then rename).
 */
export class JsonStore<T> {
  private data = new Map<string, T>();
  private filePath?: string;

  constructor(filePath?: string) {
    this.filePath = filePath;
    if (filePath) {
      this.load();
    }
  }

  /** Get a value by key */
  get(key: string): T | undefined {
    return this.data.get(key);
  }

  /** Set a value and persist */
  set(key: string, value: T): void {
    this.data.set(key, value);
    this.save();
  }

  /** Delete a key and persist */
  delete(key: string): boolean {
    const result = this.data.delete(key);
    if (result) this.save();
    return result;
  }

  /** Check if a key exists */
  has(key: string): boolean {
    return this.data.has(key);
  }

  /** Iterate all values */
  values(): IterableIterator<T> {
    return this.data.values();
  }

  /** Iterate all entries */
  entries(): IterableIterator<[string, T]> {
    return this.data.entries();
  }

  /** Number of entries */
  get size(): number {
    return this.data.size;
  }

  /** Force flush to disk */
  flush(): void {
    this.save();
  }

  /** Load from JSON file (array of [key, value] entries) */
  private load(): void {
    if (!this.filePath) return;
    try {
      const raw = readFileSync(this.filePath, "utf-8");
      const entries: Array<[string, T]> = JSON.parse(raw);
      this.data = new Map(entries);
    } catch {
      // File doesn't exist or is invalid — start fresh
    }
  }

  /** Save via atomic write (.tmp + rename) */
  private save(): void {
    if (!this.filePath) return;
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      const tmp = this.filePath + ".tmp";
      const entries = Array.from(this.data.entries());
      writeFileSync(tmp, JSON.stringify(entries, null, 2));
      renameSync(tmp, this.filePath);
    } catch {
      // Silently ignore write failures
    }
  }
}
