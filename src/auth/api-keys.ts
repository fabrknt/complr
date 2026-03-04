import { randomBytes, createHash } from "node:crypto";
import path from "node:path";
import type { ApiKeyRecord, UsageRecord } from "../types.js";
import { JsonStore } from "../storage/index.js";

/**
 * API key manager with optional file-backed persistence.
 * Generates, validates, and tracks usage of API keys for SDK authentication.
 */
export class ApiKeyManager {
  private keys: JsonStore<ApiKeyRecord>;
  /** Lookup from raw key -> id for fast auth (in-memory cache only) */
  private keyIndex = new Map<string, string>();

  constructor(dataDir?: string) {
    this.keys = new JsonStore<ApiKeyRecord>(
      dataDir ? path.join(dataDir, "api-keys.json") : undefined
    );
  }

  /** Generate a new API key */
  generate(name: string, rateLimit = 60, organizationId?: string): ApiKeyRecord {
    const id = `ak_${randomBytes(8).toString("hex")}`;
    const rawKey = `complr_${randomBytes(24).toString("hex")}`;
    const keyHash = createHash("sha256").update(rawKey).digest("hex");

    const now = new Date().toISOString();
    const record: ApiKeyRecord = {
      id,
      key: keyHash,
      name,
      createdAt: now,
      rateLimit,
      usage: {
        totalRequests: 0,
        totalChecks: 0,
        totalScreenings: 0,
        totalReports: 0,
        totalQueries: 0,
        periodStart: now,
        periodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
        requestsThisPeriod: 0,
      },
      organizationId,
    };

    this.keys.set(id, record);
    this.keyIndex.set(rawKey, id);

    // Return with the raw key (only time it's visible)
    return { ...record, key: rawKey };
  }

  /** Validate a raw API key and return the record (or undefined) */
  validate(rawKey: string): ApiKeyRecord | undefined {
    // Fast path: check in-memory index
    let id = this.keyIndex.get(rawKey);
    if (id) {
      const record = this.keys.get(id);
      if (!record || record.revokedAt) return undefined;
      return record;
    }

    // Slow path: hash and scan store (for keys loaded from disk)
    const hash = createHash("sha256").update(rawKey).digest("hex");
    for (const [entryId, record] of this.keys.entries()) {
      if (record.key === hash) {
        if (record.revokedAt) return undefined;
        // Cache for next time
        this.keyIndex.set(rawKey, entryId);
        return record;
      }
    }

    return undefined;
  }

  /** Record a request against an API key */
  trackUsage(
    id: string,
    type: "check" | "screening" | "report" | "query"
  ): void {
    const record = this.keys.get(id);
    if (!record) return;

    record.lastUsedAt = new Date().toISOString();
    record.usage.totalRequests++;
    record.usage.requestsThisPeriod++;

    switch (type) {
      case "check":
        record.usage.totalChecks++;
        break;
      case "screening":
        record.usage.totalScreenings++;
        break;
      case "report":
        record.usage.totalReports++;
        break;
      case "query":
        record.usage.totalQueries++;
        break;
    }

    // Persist updated record
    this.keys.set(id, record);
  }

  /** Get usage stats for an API key */
  getUsage(id: string): UsageRecord | undefined {
    return this.keys.get(id)?.usage;
  }

  /** List all API keys (redacted) */
  listAll(): Array<Omit<ApiKeyRecord, "key"> & { key: string }> {
    return Array.from(this.keys.values()).map((r) => ({
      ...r,
      key: `complr_...${r.key.slice(-8)}`,
    }));
  }

  /** Revoke an API key */
  revoke(id: string): boolean {
    const record = this.keys.get(id);
    if (!record) return false;
    record.revokedAt = new Date().toISOString();
    this.keys.set(id, record);
    // Remove from index
    for (const [raw, keyId] of this.keyIndex) {
      if (keyId === id) {
        this.keyIndex.delete(raw);
        break;
      }
    }
    return true;
  }

  /** Get a key record by ID */
  getById(id: string): ApiKeyRecord | undefined {
    return this.keys.get(id);
  }

  /** List all API keys for an organization */
  listByOrganization(organizationId: string): Array<Omit<ApiKeyRecord, "key"> & { key: string }> {
    return Array.from(this.keys.values())
      .filter((r) => r.organizationId === organizationId)
      .map((r) => ({
        ...r,
        key: `complr_...${r.key.slice(-8)}`,
      }));
  }
}
