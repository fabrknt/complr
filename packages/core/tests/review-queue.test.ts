import { describe, it, expect } from "vitest";
import { ReviewQueue } from "../src/review/queue.js";

describe("ReviewQueue", () => {
  // ─── submit ───────────────────────────────────────────────────────

  it("submit returns item with rv_ prefix id", () => {
    const queue = new ReviewQueue();
    const item = queue.submit({ type: "check", decision: { status: "blocked" } });
    expect(item.id).toMatch(/^rv_/);
    expect(item.type).toBe("check");
    expect(item.status).toBe("pending");
    expect(item.createdAt).toBeTruthy();
    expect(item.updatedAt).toBeTruthy();
  });

  it("submit stores the decision payload", () => {
    const queue = new ReviewQueue();
    const decision = { transactionId: "tx_001", overallStatus: "blocked" };
    const item = queue.submit({ type: "check", decision });
    expect(item.decision).toEqual(decision);
  });

  it("submit stores metadata", () => {
    const queue = new ReviewQueue();
    const item = queue.submit({
      type: "screen",
      decision: {},
      metadata: { address: "0xabc", riskLevel: "critical" },
    });
    expect(item.metadata.address).toBe("0xabc");
    expect(item.metadata.riskLevel).toBe("critical");
  });

  // ─── auto-priority ────────────────────────────────────────────────

  it("auto-assigns critical priority for critical screening", () => {
    const queue = new ReviewQueue();
    const item = queue.submit({
      type: "screen",
      decision: {},
      metadata: { riskLevel: "critical" },
    });
    expect(item.priority).toBe("critical");
  });

  it("auto-assigns high priority for high-risk screening", () => {
    const queue = new ReviewQueue();
    const item = queue.submit({
      type: "screen",
      decision: {},
      metadata: { riskLevel: "high" },
    });
    expect(item.priority).toBe("high");
  });

  it("auto-assigns high priority for blocked transactions", () => {
    const queue = new ReviewQueue();
    const item = queue.submit({
      type: "check",
      decision: {},
      metadata: { riskLevel: "blocked" },
    });
    expect(item.priority).toBe("high");
  });

  it("auto-assigns medium priority for requires_action transactions", () => {
    const queue = new ReviewQueue();
    const item = queue.submit({
      type: "check",
      decision: {},
      metadata: { riskLevel: "requires_action" },
    });
    expect(item.priority).toBe("medium");
  });

  it("auto-assigns medium priority for all reports", () => {
    const queue = new ReviewQueue();
    const item = queue.submit({ type: "report", decision: {} });
    expect(item.priority).toBe("medium");
  });

  it("allows manual priority override", () => {
    const queue = new ReviewQueue();
    const item = queue.submit({
      type: "check",
      decision: {},
      priority: "critical",
    });
    expect(item.priority).toBe("critical");
  });

  // ─── approve / reject / escalate ──────────────────────────────────

  it("approve sets status and reviewer info", () => {
    const queue = new ReviewQueue();
    const item = queue.submit({ type: "check", decision: {} });
    const approved = queue.approve(item.id, "officer-1", "Looks good");
    expect(approved).toBeTruthy();
    expect(approved!.status).toBe("approved");
    expect(approved!.reviewerId).toBe("officer-1");
    expect(approved!.reviewerNotes).toBe("Looks good");
    expect(approved!.reviewedAt).toBeTruthy();
  });

  it("reject sets status and reviewer info", () => {
    const queue = new ReviewQueue();
    const item = queue.submit({ type: "screen", decision: {} });
    const rejected = queue.reject(item.id, "officer-2", "False positive");
    expect(rejected).toBeTruthy();
    expect(rejected!.status).toBe("rejected");
    expect(rejected!.reviewerId).toBe("officer-2");
    expect(rejected!.reviewerNotes).toBe("False positive");
  });

  it("escalate sets status and reviewer info", () => {
    const queue = new ReviewQueue();
    const item = queue.submit({ type: "report", decision: {} });
    const escalated = queue.escalate(item.id, "officer-3", "Needs senior review");
    expect(escalated).toBeTruthy();
    expect(escalated!.status).toBe("escalated");
    expect(escalated!.reviewerId).toBe("officer-3");
  });

  it("approve returns undefined for non-existent id", () => {
    const queue = new ReviewQueue();
    const result = queue.approve("rv_doesnotexist", "officer-1");
    expect(result).toBeUndefined();
  });

  it("reject returns undefined for non-existent id", () => {
    const queue = new ReviewQueue();
    const result = queue.reject("rv_doesnotexist", "officer-1");
    expect(result).toBeUndefined();
  });

  // ─── getById ──────────────────────────────────────────────────────

  it("getById returns submitted item", () => {
    const queue = new ReviewQueue();
    const item = queue.submit({ type: "check", decision: { foo: "bar" } });
    const found = queue.getById(item.id);
    expect(found).toBeTruthy();
    expect(found!.id).toBe(item.id);
    expect(found!.decision).toEqual({ foo: "bar" });
  });

  it("getById returns undefined for missing id", () => {
    const queue = new ReviewQueue();
    expect(queue.getById("rv_nope")).toBeUndefined();
  });

  it("getById reflects updated status after approval", () => {
    const queue = new ReviewQueue();
    const item = queue.submit({ type: "check", decision: {} });
    queue.approve(item.id, "officer-1");
    const found = queue.getById(item.id);
    expect(found!.status).toBe("approved");
  });

  // ─── query ────────────────────────────────────────────────────────

  it("query returns all items with no filters", () => {
    const queue = new ReviewQueue();
    queue.submit({ type: "check", decision: {} });
    queue.submit({ type: "screen", decision: {} });
    queue.submit({ type: "report", decision: {} });
    const result = queue.query();
    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(3);
  });

  it("query filters by status", () => {
    const queue = new ReviewQueue();
    const item = queue.submit({ type: "check", decision: {} });
    queue.submit({ type: "screen", decision: {} });
    queue.approve(item.id, "officer-1");

    const pending = queue.query({ status: "pending" });
    expect(pending.total).toBe(1);
    expect(pending.items[0].type).toBe("screen");

    const approved = queue.query({ status: "approved" });
    expect(approved.total).toBe(1);
    expect(approved.items[0].id).toBe(item.id);
  });

  it("query filters by priority", () => {
    const queue = new ReviewQueue();
    queue.submit({ type: "screen", decision: {}, metadata: { riskLevel: "critical" } });
    queue.submit({ type: "report", decision: {} });

    const critical = queue.query({ priority: "critical" });
    expect(critical.total).toBe(1);
    expect(critical.items[0].type).toBe("screen");
  });

  it("query filters by type", () => {
    const queue = new ReviewQueue();
    queue.submit({ type: "check", decision: {} });
    queue.submit({ type: "screen", decision: {} });
    queue.submit({ type: "report", decision: {} });

    const reports = queue.query({ type: "report" });
    expect(reports.total).toBe(1);
    expect(reports.items[0].type).toBe("report");
  });

  it("query supports pagination", () => {
    const queue = new ReviewQueue();
    for (let i = 0; i < 5; i++) {
      queue.submit({ type: "check", decision: { i } });
    }

    const page1 = queue.query({ limit: 2, offset: 0 });
    expect(page1.total).toBe(5);
    expect(page1.items).toHaveLength(2);

    const page2 = queue.query({ limit: 2, offset: 2 });
    expect(page2.items).toHaveLength(2);

    const page3 = queue.query({ limit: 2, offset: 4 });
    expect(page3.items).toHaveLength(1);
  });

  it("query returns most recent first", () => {
    const queue = new ReviewQueue();
    const first = queue.submit({ type: "check", decision: { order: 1 } });
    const second = queue.submit({ type: "check", decision: { order: 2 } });

    const result = queue.query();
    expect(result.items[0].id).toBe(second.id);
    expect(result.items[1].id).toBe(first.id);
  });

  // ─── stats ────────────────────────────────────────────────────────

  it("stats returns correct counts", () => {
    const queue = new ReviewQueue();
    const item1 = queue.submit({ type: "check", decision: {} });
    queue.submit({ type: "screen", decision: {} });
    const item3 = queue.submit({ type: "report", decision: {} });
    queue.approve(item1.id, "officer-1");
    queue.escalate(item3.id, "officer-2");

    const stats = queue.stats();
    expect(stats.total).toBe(3);
    expect(stats.pending).toBe(1);
    expect(stats.approved).toBe(1);
    expect(stats.rejected).toBe(0);
    expect(stats.escalated).toBe(1);
  });

  it("stats calculates average review time", () => {
    const queue = new ReviewQueue();
    const item = queue.submit({ type: "check", decision: {} });
    queue.approve(item.id, "officer-1");

    const stats = queue.stats();
    expect(stats.avgReviewTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("stats tracks by priority", () => {
    const queue = new ReviewQueue();
    queue.submit({ type: "screen", decision: {}, metadata: { riskLevel: "critical" } });
    queue.submit({ type: "screen", decision: {}, metadata: { riskLevel: "high" } });
    queue.submit({ type: "report", decision: {} });

    const stats = queue.stats();
    expect(stats.byPriority.critical).toBe(1);
    expect(stats.byPriority.high).toBe(1);
    expect(stats.byPriority.medium).toBe(1);
  });

  it("stats returns zeros for empty queue", () => {
    const queue = new ReviewQueue();
    const stats = queue.stats();
    expect(stats.total).toBe(0);
    expect(stats.pending).toBe(0);
    expect(stats.avgReviewTimeMs).toBe(0);
  });
});
