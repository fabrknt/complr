import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OrganizationManager } from "../src/auth/organizations.js";

describe("OrganizationManager", () => {
  it("create returns org with org_ prefix id", () => {
    const mgr = new OrganizationManager();
    const org = mgr.create("Test Corp");
    assert.ok(org.id.startsWith("org_"));
    assert.equal(org.name, "Test Corp");
    assert.ok(org.createdAt);
  });

  it("create uses default rateLimit of 300", () => {
    const mgr = new OrganizationManager();
    const org = mgr.create("Default Rate");
    assert.equal(org.rateLimit, 300);
  });

  it("create accepts custom rateLimit", () => {
    const mgr = new OrganizationManager();
    const org = mgr.create("Custom Rate", 500);
    assert.equal(org.rateLimit, 500);
  });

  it("getById returns created org", () => {
    const mgr = new OrganizationManager();
    const org = mgr.create("FindMe");
    const found = mgr.getById(org.id);
    assert.ok(found);
    assert.equal(found.name, "FindMe");
  });

  it("getById returns undefined for missing id", () => {
    const mgr = new OrganizationManager();
    const found = mgr.getById("org_doesnotexist");
    assert.equal(found, undefined);
  });

  it("listAll returns all created orgs", () => {
    const mgr = new OrganizationManager();
    mgr.create("Org A");
    mgr.create("Org B");
    mgr.create("Org C");
    const list = mgr.listAll();
    assert.equal(list.length, 3);
    const names = list.map((o) => o.name);
    assert.ok(names.includes("Org A"));
    assert.ok(names.includes("Org B"));
    assert.ok(names.includes("Org C"));
  });
});
