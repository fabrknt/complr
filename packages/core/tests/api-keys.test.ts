import { describe, it, expect } from "vitest";
import { ApiKeyManager } from "../src/auth/api-keys.js";

describe("ApiKeyManager", () => {
  it("generate returns key with ak_ prefix id and complr_ prefix key", () => {
    const mgr = new ApiKeyManager();
    const record = mgr.generate("Test Key");
    expect(record.id).toMatch(/^ak_/);
    expect(record.key).toMatch(/^complr_/);
    expect(record.name).toBe("Test Key");
  });

  it("generate without orgId has undefined organizationId", () => {
    const mgr = new ApiKeyManager();
    const record = mgr.generate("No Org");
    expect(record.organizationId).toBeUndefined();
  });

  it("generate with orgId stores organizationId", () => {
    const mgr = new ApiKeyManager();
    const record = mgr.generate("With Org", 60, "org_test123");
    expect(record.organizationId).toBe("org_test123");
  });

  it("validate returns record for valid key", () => {
    const mgr = new ApiKeyManager();
    const record = mgr.generate("Valid Key");
    const rawKey = record.key;
    const validated = mgr.validate(rawKey);
    expect(validated).toBeTruthy();
    expect(validated!.id).toBe(record.id);
    expect(validated!.name).toBe("Valid Key");
  });

  it("validate returns undefined for invalid key", () => {
    const mgr = new ApiKeyManager();
    const validated = mgr.validate("complr_invalid_key_here");
    expect(validated).toBeUndefined();
  });

  it("validate returns undefined for revoked key", () => {
    const mgr = new ApiKeyManager();
    const record = mgr.generate("Revoke Me");
    const rawKey = record.key;
    mgr.revoke(record.id);
    const validated = mgr.validate(rawKey);
    expect(validated).toBeUndefined();
  });

  it("listByOrganization filters by org", () => {
    const mgr = new ApiKeyManager();
    mgr.generate("Key A", 60, "org_alpha");
    mgr.generate("Key B", 60, "org_beta");
    mgr.generate("Key C", 60, "org_alpha");

    const alphaKeys = mgr.listByOrganization("org_alpha");
    expect(alphaKeys).toHaveLength(2);
    expect(alphaKeys.every((k) => k.organizationId === "org_alpha")).toBe(true);
  });

  it("trackUsage increments counters", () => {
    const mgr = new ApiKeyManager();
    const record = mgr.generate("Usage Key");
    mgr.trackUsage(record.id, "check");
    mgr.trackUsage(record.id, "check");
    mgr.trackUsage(record.id, "screening");

    const usage = mgr.getUsage(record.id);
    expect(usage).toBeTruthy();
    expect(usage!.totalRequests).toBe(3);
    expect(usage!.totalChecks).toBe(2);
    expect(usage!.totalScreenings).toBe(1);
  });

  it("revoke returns true for existing key", () => {
    const mgr = new ApiKeyManager();
    const record = mgr.generate("To Revoke");
    expect(mgr.revoke(record.id)).toBe(true);
  });

  it("revoke returns false for non-existent key", () => {
    const mgr = new ApiKeyManager();
    expect(mgr.revoke("ak_doesnotexist")).toBe(false);
  });
});
