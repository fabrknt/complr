import { randomBytes } from "node:crypto";
import type { Organization } from "../types.js";

/**
 * In-memory organization manager for multi-tenant isolation.
 */
export class OrganizationManager {
  private orgs = new Map<string, Organization>();

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
