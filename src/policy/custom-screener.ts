import { readFileSync } from "node:fs";
import type { ScreeningProvider, ScreeningHit } from "../types.js";

interface CustomSanctionEntry {
  address: string;
  entity: string;
  program: string;
  listEntry: string;
}

/**
 * Custom sanctions screener backed by a local JSON file.
 * File format: array of { address, entity, program, listEntry } objects.
 * Path from constructor or CUSTOM_SANCTIONS_FILE env var.
 */
export class CustomScreener implements ScreeningProvider {
  name = "Custom Sanctions";
  lastRefreshed?: string;

  private filePath: string;
  /** Normalized lowercase address → entry */
  private addresses = new Map<string, CustomSanctionEntry>();

  constructor(filePath?: string) {
    this.filePath = filePath ?? process.env.CUSTOM_SANCTIONS_FILE ?? "";
  }

  /** Refresh by reading and parsing the JSON file */
  async refresh(): Promise<void> {
    if (!this.filePath) return;
    try {
      const raw = readFileSync(this.filePath, "utf-8");
      const entries: CustomSanctionEntry[] = JSON.parse(raw);
      this.addresses.clear();
      for (const entry of entries) {
        this.addresses.set(entry.address.toLowerCase(), entry);
      }
      this.lastRefreshed = new Date().toISOString();
    } catch (err) {
      console.warn(`Custom screener refresh failed: ${err}`);
    }
  }

  /** Screen an address — exact lowercase match, confidence 1.0 */
  screen(address: string, _chain?: string): ScreeningHit[] {
    const entry = this.addresses.get(address.toLowerCase());
    if (!entry) return [];
    return [
      {
        provider: this.name,
        matchType: "exact",
        sanctionedEntity: entry.entity,
        program: entry.program,
        listEntry: entry.listEntry,
        confidence: 1.0,
      },
    ];
  }

  /** Number of loaded entries */
  get entryCount(): number {
    return this.addresses.size;
  }
}
