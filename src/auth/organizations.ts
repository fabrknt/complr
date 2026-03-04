import { randomBytes } from "node:crypto";
import path from "node:path";
import type { Organization } from "../types.js";
import { JsonStore } from "../storage/index.js";

/**
 * Organization manager for multi-tenant isolation.
 * Optionally persists to disk when dataDir is provided.
 */
export class OrganizationManager {
  private orgs: JsonStore<Organization>;

  constructor(dataDir?: string) {
    this.orgs = new JsonStore<Organization>(
      dataDir ? path.join(dataDir, "organizations.json") : undefined
    );
  }

  /** Create a new organization */
  create(name: string, rateLimit = 300): Organization {
    const id = `org_${randomBytes(8).toString("hex")}`;
    const org: Organization = {
      id,
      name,
      createdAt: new Date().toISOString(),
      rateLimit,
    };
    this.orgs.set(id, org);
    return org;
  }

  /** Get organization by ID */
  getById(id: string): Organization | undefined {
    return this.orgs.get(id);
  }

  /** List all organizations */
  listAll(): Organization[] {
    return Array.from(this.orgs.values());
  }
}
