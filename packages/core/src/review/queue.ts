import { randomBytes } from "node:crypto";
import { JsonStore } from "../storage/json-store.js";

// ─── Types ───────────────────────────────────────────────────────────

export interface ReviewItem {
  id: string;
  type: "check" | "screen" | "report";
  status: "pending" | "approved" | "rejected" | "escalated";
  priority: "low" | "medium" | "high" | "critical";
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
  reviewerId?: string;
  reviewerNotes?: string;
  decision: unknown;
  metadata: {
    transactionId?: string;
    address?: string;
    jurisdiction?: string;
    riskLevel?: string;
    apiKeyId?: string;
    organizationId?: string;
  };
}

export interface ReviewStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  escalated: number;
  avgReviewTimeMs: number;
  byPriority: Record<string, number>;
}

export interface ReviewQueryFilters {
  status?: ReviewItem["status"];
  priority?: ReviewItem["priority"];
  type?: ReviewItem["type"];
  limit?: number;
  offset?: number;
}

// ─── ReviewQueue ─────────────────────────────────────────────────────

/**
 * Human-in-the-loop review queue for compliance decisions.
 * Stores review items in-memory with optional file persistence via JsonStore.
 */
export class ReviewQueue {
  private store: JsonStore<ReviewItem>;

  constructor(filePath?: string) {
    this.store = new JsonStore<ReviewItem>(filePath);
  }

  /** Submit a new item to the review queue */
  submit(params: {
    type: ReviewItem["type"];
    decision: unknown;
    metadata?: ReviewItem["metadata"];
    priority?: ReviewItem["priority"];
  }): ReviewItem {
    const now = new Date().toISOString();
    const priority = params.priority ?? this.autoPriority(params.type, params.metadata);
    const item: ReviewItem = {
      id: `rv_${randomBytes(8).toString("hex")}`,
      type: params.type,
      status: "pending",
      priority,
      createdAt: now,
      updatedAt: now,
      decision: params.decision,
      metadata: params.metadata ?? {},
    };

    this.store.set(item.id, item);
    return item;
  }

  /** Approve a review item */
  approve(id: string, reviewerId: string, notes?: string): ReviewItem | undefined {
    return this.resolve(id, "approved", reviewerId, notes);
  }

  /** Reject a review item */
  reject(id: string, reviewerId: string, notes?: string): ReviewItem | undefined {
    return this.resolve(id, "rejected", reviewerId, notes);
  }

  /** Escalate a review item */
  escalate(id: string, reviewerId: string, notes?: string): ReviewItem | undefined {
    return this.resolve(id, "escalated", reviewerId, notes);
  }

  /** Get a review item by ID */
  getById(id: string): ReviewItem | undefined {
    return this.store.get(id);
  }

  /** Query review items with filters and pagination */
  query(filters: ReviewQueryFilters = {}): { items: ReviewItem[]; total: number } {
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    let items = Array.from(this.store.values());

    if (filters.status) {
      items = items.filter((i) => i.status === filters.status);
    }
    if (filters.priority) {
      items = items.filter((i) => i.priority === filters.priority);
    }
    if (filters.type) {
      items = items.filter((i) => i.type === filters.type);
    }

    // Most recent first
    items.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));

    const total = items.length;
    const paged = items.slice(offset, offset + limit);

    return { items: paged, total };
  }

  /** Get aggregate statistics */
  stats(): ReviewStats {
    const all = Array.from(this.store.values());
    const pending = all.filter((i) => i.status === "pending").length;
    const approved = all.filter((i) => i.status === "approved").length;
    const rejected = all.filter((i) => i.status === "rejected").length;
    const escalated = all.filter((i) => i.status === "escalated").length;

    // Calculate average review time from resolved items
    const resolved = all.filter((i) => i.reviewedAt);
    let avgReviewTimeMs = 0;
    if (resolved.length > 0) {
      const totalMs = resolved.reduce((sum, i) => {
        return sum + (new Date(i.reviewedAt!).getTime() - new Date(i.createdAt).getTime());
      }, 0);
      avgReviewTimeMs = Math.round(totalMs / resolved.length);
    }

    const byPriority: Record<string, number> = {};
    for (const item of all) {
      byPriority[item.priority] = (byPriority[item.priority] ?? 0) + 1;
    }

    return {
      total: all.length,
      pending,
      approved,
      rejected,
      escalated,
      avgReviewTimeMs,
      byPriority,
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────

  private resolve(
    id: string,
    status: "approved" | "rejected" | "escalated",
    reviewerId: string,
    notes?: string
  ): ReviewItem | undefined {
    const item = this.store.get(id);
    if (!item) return undefined;

    const now = new Date().toISOString();
    const updated: ReviewItem = {
      ...item,
      status,
      updatedAt: now,
      reviewedAt: now,
      reviewerId,
      reviewerNotes: notes,
    };

    this.store.set(id, updated);
    return updated;
  }

  /** Auto-assign priority based on type and metadata */
  private autoPriority(
    type: ReviewItem["type"],
    metadata?: ReviewItem["metadata"]
  ): ReviewItem["priority"] {
    const riskLevel = metadata?.riskLevel;

    if (type === "screen" && riskLevel === "critical") return "critical";
    if (type === "screen" && riskLevel === "high") return "high";
    if (type === "check" && riskLevel === "blocked") return "high";
    if (type === "check" && riskLevel === "requires_action") return "medium";
    if (type === "report") return "medium";

    return "low";
  }
}
