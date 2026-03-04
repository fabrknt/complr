import type { ScreeningProvider, ScreeningHit } from "../types.js";

interface SdnEntry {
  entity: string;
  program: string;
  entryId: string;
}

/**
 * OFAC SDN list screener for sanctioned crypto addresses.
 * Fetches and parses the OFAC address supplement (add.csv) and entity list (sdn.csv)
 * from the US Treasury. Matches wallet addresses exactly (case-insensitive).
 */
export class OfacScreener implements ScreeningProvider {
  name = "OFAC SDN";
  lastRefreshed?: string;

  /** Normalized address → SDN entry */
  private addresses = new Map<string, SdnEntry>();

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

  /** Fetch and parse the OFAC SDN data */
  async refresh(): Promise<void> {
    try {
      // Fetch the address supplement (add.csv)
      const addUrl = "https://www.treasury.gov/ofac/downloads/add.csv";
      const addResp = await fetch(addUrl, { signal: AbortSignal.timeout(30_000) });
      if (!addResp.ok) {
        console.warn(`OFAC add.csv fetch failed: ${addResp.status}`);
        return;
      }
      const addText = await addResp.text();

      // Fetch SDN entity list for entity names
      const sdnUrl = "https://www.treasury.gov/ofac/downloads/sdn.csv";
      const sdnResp = await fetch(sdnUrl, { signal: AbortSignal.timeout(30_000) });
      if (!sdnResp.ok) {
        console.warn(`OFAC sdn.csv fetch failed: ${sdnResp.status}`);
        return;
      }
      const sdnText = await sdnResp.text();

      // Parse SDN entities: entryId → entity name
      const entities = new Map<string, string>();
      for (const line of sdnText.split("\n")) {
        if (!line.trim()) continue;
        const fields = this.parseCsvLine(line);
        // SDN CSV: Ent_num, SDN_Name, SDN_Type, Program, ...
        if (fields.length >= 4) {
          entities.set(fields[0], fields[1]);
        }
      }

      // Parse address supplement for digital currency addresses
      this.addresses.clear();
      for (const line of addText.split("\n")) {
        if (!line.trim()) continue;
        const fields = this.parseCsvLine(line);
        // add.csv: Ent_num, Add_num, Address, City/State, Country, Remarks
        if (fields.length < 6) continue;
        const entryId = fields[0];
        const remarks = fields[5] ?? "";

        // Check if this is a digital currency address
        if (!remarks.toLowerCase().includes("digital currency address")) continue;

        // Extract the address from remarks — format: "Digital Currency Address - XBT bc1q..."
        const addrMatch = remarks.match(/Digital Currency Address\s*-\s*\w+\s+(\S+)/i);
        if (!addrMatch) continue;

        const addr = addrMatch[1].toLowerCase();
        const entity = entities.get(entryId) ?? `SDN Entry ${entryId}`;
        const program = fields.length > 3 ? fields[3] : "OFAC SDN";

        this.addresses.set(addr, {
          entity,
          program,
          entryId,
        });
      }

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
