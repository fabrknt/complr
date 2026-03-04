import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AuditLogger } from "../src/audit/logger.js";

describe("AuditLogger", () => {
  it("log assigns id and timestamp", () => {
    const logger = new AuditLogger();
    const event = logger.log({
      apiKeyId: "ak_test",
      action: "query",
      resource: "/api/v1/query",
      method: "POST",
      result: "success",
      statusCode: 200,
      ip: "127.0.0.1",
      durationMs: 42,
    });

    assert.ok(event.id.startsWith("aud_"));
    assert.ok(event.timestamp);
    assert.equal(event.action, "query");
    assert.equal(event.result, "success");
  });

  it("query filters by apiKeyId", () => {
    const logger = new AuditLogger();
    logger.log({ apiKeyId: "ak_1", action: "query", resource: "/q", method: "POST", result: "success", statusCode: 200, ip: "127.0.0.1", durationMs: 1 });
    logger.log({ apiKeyId: "ak_2", action: "check", resource: "/c", method: "POST", result: "success", statusCode: 200, ip: "127.0.0.1", durationMs: 1 });
    logger.log({ apiKeyId: "ak_1", action: "screen", resource: "/s", method: "POST", result: "success", statusCode: 200, ip: "127.0.0.1", durationMs: 1 });

    const result = logger.query({ apiKeyId: "ak_1" });
    assert.equal(result.total, 2);
    assert.ok(result.events.every((e) => e.apiKeyId === "ak_1"));
  });

  it("query filters by organizationId", () => {
    const logger = new AuditLogger();
    logger.log({ apiKeyId: "ak_1", organizationId: "org_a", action: "query", resource: "/q", method: "POST", result: "success", statusCode: 200, ip: "127.0.0.1", durationMs: 1 });
    logger.log({ apiKeyId: "ak_2", organizationId: "org_b", action: "check", resource: "/c", method: "POST", result: "success", statusCode: 200, ip: "127.0.0.1", durationMs: 1 });

    const result = logger.query({ organizationId: "org_a" });
    assert.equal(result.total, 1);
    assert.equal(result.events[0].organizationId, "org_a");
  });

  it("query filters by action and result", () => {
    const logger = new AuditLogger();
    logger.log({ apiKeyId: null, action: "query", resource: "/q", method: "POST", result: "success", statusCode: 200, ip: "127.0.0.1", durationMs: 1 });
    logger.log({ apiKeyId: null, action: "query", resource: "/q", method: "POST", result: "error", statusCode: 500, ip: "127.0.0.1", durationMs: 1 });
    logger.log({ apiKeyId: null, action: "check", resource: "/c", method: "POST", result: "success", statusCode: 200, ip: "127.0.0.1", durationMs: 1 });

    const result = logger.query({ action: "query", result: "success" });
    assert.equal(result.total, 1);
  });

  it("query filters by since/until", () => {
    const logger = new AuditLogger();
    // Log events with known timestamps by manually checking
    const e1 = logger.log({ apiKeyId: null, action: "query", resource: "/q", method: "POST", result: "success", statusCode: 200, ip: "127.0.0.1", durationMs: 1 });

    const result = logger.query({ since: e1.timestamp, until: e1.timestamp });
    assert.ok(result.total >= 1);
  });

  it("pagination works correctly", () => {
    const logger = new AuditLogger();
    for (let i = 0; i < 10; i++) {
      logger.log({ apiKeyId: null, action: "query", resource: `/q${i}`, method: "POST", result: "success", statusCode: 200, ip: "127.0.0.1", durationMs: i });
    }

    const page1 = logger.query({ limit: 3, offset: 0 });
    assert.equal(page1.events.length, 3);
    assert.equal(page1.total, 10);

    const page2 = logger.query({ limit: 3, offset: 3 });
    assert.equal(page2.events.length, 3);
    assert.notDeepEqual(page1.events[0].id, page2.events[0].id);
  });

  it("returns events in reverse chronological order", () => {
    const logger = new AuditLogger();
    logger.log({ apiKeyId: null, action: "query", resource: "/first", method: "POST", result: "success", statusCode: 200, ip: "127.0.0.1", durationMs: 1 });
    logger.log({ apiKeyId: null, action: "check", resource: "/second", method: "POST", result: "success", statusCode: 200, ip: "127.0.0.1", durationMs: 1 });

    const result = logger.query({});
    assert.equal(result.events[0].resource, "/second");
    assert.equal(result.events[1].resource, "/first");
  });

  it("total reflects filtered count", () => {
    const logger = new AuditLogger();
    logger.log({ apiKeyId: null, action: "query", resource: "/q", method: "POST", result: "success", statusCode: 200, ip: "127.0.0.1", durationMs: 1 });
    logger.log({ apiKeyId: null, action: "check", resource: "/c", method: "POST", result: "error", statusCode: 500, ip: "127.0.0.1", durationMs: 1 });
    logger.log({ apiKeyId: null, action: "query", resource: "/q2", method: "POST", result: "success", statusCode: 200, ip: "127.0.0.1", durationMs: 1 });

    const all = logger.query({});
    assert.equal(all.total, 3);

    const queries = logger.query({ action: "query" });
    assert.equal(queries.total, 2);
  });
});
