import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ApiKeyManager } from "../src/auth/api-keys.js";

describe("ApiKeyManager", () => {
  it("generate returns key with ak_ prefix id and complr_ prefix key", () => {
    const mgr = new ApiKeyManager();
    const record = mgr.generate("Test Key");
    assert.ok(record.id.startsWith("ak_"));
    assert.ok(record.key.startsWith("complr_"));
    assert.equal(record.name, "Test Key");
  });

  it("generate without orgId has undefined organizationId", () => {
    const mgr = new ApiKeyManager();
    const record = mgr.generate("No Org");
    assert.equal(record.organizationId, undefined);
  });

  it("generate with orgId stores organizationId", () => {
    const mgr = new ApiKeyManager();
    const record = mgr.generate("With Org", 60, "org_test123");
    assert.equal(record.organizationId, "org_test123");
  });

  it("validate returns record for valid key", () => {
    const mgr = new ApiKeyManager();
    const record = mgr.generate("Valid Key");
    const rawKey = record.key;
    const validated = mgr.validate(rawKey);
    assert.ok(validated);
    assert.equal(validated.id, record.id);
    assert.equal(validated.name, "Valid Key");
  });

  it("validate returns undefined for invalid key", () => {
    const mgr = new ApiKeyManager();
    const validated = mgr.validate("complr_invalid_key_here");
    assert.equal(validated, undefined);
  });

  it("validate returns undefined for revoked key", () => {
    const mgr = new ApiKeyManager();
    const record = mgr.generate("Revoke Me");
    const rawKey = record.key;
    mgr.revoke(record.id);
    const validated = mgr.validate(rawKey);
    assert.equal(validated, undefined);
  });

  it("listByOrganization filters by org", () => {
    const mgr = new ApiKeyManager();
    mgr.generate("Key A", 60, "org_alpha");
    mgr.generate("Key B", 60, "org_beta");
    mgr.generate("Key C", 60, "org_alpha");

    const alphaKeys = mgr.listByOrganization("org_alpha");
    assert.equal(alphaKeys.length, 2);
    assert.ok(alphaKeys.every((k) => k.organizationId === "org_alpha"));
  });

  it("trackUsage increments counters", () => {
    const mgr = new ApiKeyManager();
    const record = mgr.generate("Usage Key");
    mgr.trackUsage(record.id, "check");
    mgr.trackUsage(record.id, "check");
    mgr.trackUsage(record.id, "screening");

    const usage = mgr.getUsage(record.id);
    assert.ok(usage);
    assert.equal(usage.totalRequests, 3);
    assert.equal(usage.totalChecks, 2);
    assert.equal(usage.totalScreenings, 1);
  });

  it("revoke returns true for existing key", () => {
    const mgr = new ApiKeyManager();
    const record = mgr.generate("To Revoke");
    assert.equal(mgr.revoke(record.id), true);
  });

  it("revoke returns false for non-existent key", () => {
    const mgr = new ApiKeyManager();
    assert.equal(mgr.revoke("ak_doesnotexist"), false);
  });
});
