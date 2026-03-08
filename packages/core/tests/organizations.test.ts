import { describe, it, expect } from "vitest";
import { OrganizationManager } from "../src/auth/organizations.js";

describe("OrganizationManager", () => {
  it("create returns org with org_ prefix id", () => {
    const mgr = new OrganizationManager();
    const org = mgr.create("Test Corp");
    expect(org.id).toMatch(/^org_/);
    expect(org.name).toBe("Test Corp");
    expect(org.createdAt).toBeTruthy();
  });

  it("create uses default rateLimit of 300", () => {
    const mgr = new OrganizationManager();
    const org = mgr.create("Default Rate");
    expect(org.rateLimit).toBe(300);
  });

  it("create accepts custom rateLimit", () => {
    const mgr = new OrganizationManager();
    const org = mgr.create("Custom Rate", 500);
    expect(org.rateLimit).toBe(500);
  });

  it("getById returns created org", () => {
    const mgr = new OrganizationManager();
    const org = mgr.create("FindMe");
    const found = mgr.getById(org.id);
    expect(found).toBeTruthy();
    expect(found!.name).toBe("FindMe");
  });

  it("getById returns undefined for missing id", () => {
    const mgr = new OrganizationManager();
    const found = mgr.getById("org_doesnotexist");
    expect(found).toBeUndefined();
  });

  it("listAll returns all created orgs", () => {
    const mgr = new OrganizationManager();
    mgr.create("Org A");
    mgr.create("Org B");
    mgr.create("Org C");
    const list = mgr.listAll();
    expect(list).toHaveLength(3);
    const names = list.map((o) => o.name);
    expect(names).toContain("Org A");
    expect(names).toContain("Org B");
    expect(names).toContain("Org C");
  });
});
