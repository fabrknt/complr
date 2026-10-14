import type { ScreeningProvider, ScreeningHit } from "../types.js";

interface SdnEntry {
  entity: string;
  program: string;
  entryId: string;
}

/**
 * OFAC SDN list screener for sanctioned crypto addresses.
 * Fetches the SDN list (sdn.csv) from the US Treasury and reads every
 * "Digital Currency Address - <CHAIN> <address>" entry from its Remarks column;
 * a row can carry several, as "alt." entries. The address supplement (add.csv)
 * holds postal addresses only, so it is not used. Matches wallet addresses
 * exactly (case-insensitive).
 */
export class OfacScreener implements ScreeningProvider {
  name = "OFAC SDN";
  /** Set only by a refresh that loaded at least one address */
  lastRefreshed?: string;

  /** Normalized address → SDN entry */
  private addresses = new Map<string, SdnEntry>();

  /** Number of sanctioned addresses currently loaded */
  get addressCount(): number {
    return this.addresses.size;
  }

  /** Parse a CSV line, handling quoted fields */
  private parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  }

  /** Extract normalized address → SDN entry from sdn.csv text */
  private parseSdn(text: string): Map<string, SdnEntry> {
    const addresses = new Map<string, SdnEntry>();
    for (const line of text.split(/\r?\n/)) {
      if (!line.includes("Digital Currency Address")) continue;
      // sdn.csv: Ent_num, SDN_Name, SDN_Type, Program, Title, Call_Sign, Vess_type,
      // Tonnage, GRT, Vess_flag, Vess_owner, Remarks
      const fields = this.parseCsvLine(line);
      if (fields.length < 12) continue;
      const [entryId, entity, , program] = fields;
      const remarks = fields[11];
      for (const m of remarks.matchAll(/Digital Currency Address\s*-\s*\w+\s+([^\s;]+)/gi)) {
        addresses.set(m[1].toLowerCase(), { entity, program, entryId });
      }
    }
    return addresses;
  }

  /**
   * Fetch and parse the OFAC SDN data. On a failed download, or a list with no
   * addresses (for example after a format change), the previously loaded data
   * is kept and lastRefreshed is not updated, so an empty list never silently
   * clears every address.
   */
  async refresh(): Promise<void> {
    try {
      const sdnUrl = "https://www.treasury.gov/ofac/downloads/sdn.csv";
      const sdnResp = await fetch(sdnUrl, { signal: AbortSignal.timeout(30_000) });
      if (!sdnResp.ok) {
        console.warn(`OFAC sdn.csv fetch failed: ${sdnResp.status}`);
        return;
      }
      const addresses = this.parseSdn(await sdnResp.text());
      if (addresses.size === 0) {
        console.warn("OFAC: sdn.csv contained no digital currency addresses; keeping previous data");
        return;
      }

      this.addresses = addresses;
      this.lastRefreshed = new Date().toISOString();
      console.log(`OFAC: loaded ${this.addresses.size} sanctioned crypto addresses`);
    } catch (err) {
      console.warn(`OFAC refresh failed: ${err}`);
    }
  }

  /** Screen an address against the OFAC SDN list */
  screen(address: string, _chain?: string): ScreeningHit[] {
    const normalized = address.toLowerCase();
    const entry = this.addresses.get(normalized);
    if (!entry) return [];

    return [
      {
        provider: this.name,
        matchType: "exact",
        sanctionedEntity: entry.entity,
        program: entry.program,
        listEntry: `SDN #${entry.entryId}`,
        confidence: 1.0,
      },
    ];
  }
}
