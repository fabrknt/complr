import { randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";
import type { AuditEvent, AuditAction } from "../types.js";

/**
 * Append-only audit logger with in-memory storage and optional file persistence.
 * Supports query/filter across all logged events.
 */
export class AuditLogger {
  private events: AuditEvent[] = [];
  private filePath?: string;

  constructor() {
    this.filePath = process.env.AUDIT_LOG_FILE || undefined;
  }

  /** Log an audit event */
  log(
    params: Omit<AuditEvent, "id" | "timestamp">
  ): AuditEvent {
    const event: AuditEvent = {
      id: `aud_${randomBytes(8).toString("hex")}`,
      timestamp: new Date().toISOString(),
      ...params,
    };

    this.events.push(event);

    if (this.filePath) {
      try {
        appendFileSync(this.filePath, JSON.stringify(event) + "\n");
      } catch {
        // Silently ignore file write failures — in-memory log is the source of truth
      }
    }

    return event;
  }

  /** Query audit events with filters and pagination */
  query(params: {
    apiKeyId?: string;
    organizationId?: string;
    action?: AuditAction;
    resource?: string;
    result?: AuditEvent["result"];
    since?: string;
    until?: string;
    limit?: number;
    offset?: number;
  }): { events: AuditEvent[]; total: number } {
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;

    let filtered = this.events;

    if (params.apiKeyId) {
      filtered = filtered.filter((e) => e.apiKeyId === params.apiKeyId);
    }
    if (params.organizationId) {
      filtered = filtered.filter((e) => e.organizationId === params.organizationId);
    }
    if (params.action) {
      filtered = filtered.filter((e) => e.action === params.action);
    }
    if (params.resource) {
      filtered = filtered.filter((e) => e.resource === params.resource);
    }
    if (params.result) {
      filtered = filtered.filter((e) => e.result === params.result);
    }
    if (params.since) {
      const since = params.since;
      filtered = filtered.filter((e) => e.timestamp >= since);
    }
    if (params.until) {
      const until = params.until;
      filtered = filtered.filter((e) => e.timestamp <= until);
    }

    // Most recent first
    const sorted = [...filtered].reverse();
    const total = sorted.length;
    const events = sorted.slice(offset, offset + limit);

    return { events, total };
  }
}
