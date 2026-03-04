import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ScreeningRegistry } from "../src/policy/screening-provider.js";
import type { ScreeningProvider, ScreeningHit } from "../src/types.js";

function mockProvider(providerName: string, hits: ScreeningHit[]): ScreeningProvider & { refreshCalled: boolean } {
  return {
    name: providerName,
    refreshCalled: false,
    async refresh() {
      this.refreshCalled = true;
    },
    screen(_address: string, _chain?: string): ScreeningHit[] {
      return hits;
    },
  };
}

describe("ScreeningRegistry", () => {
  it("register increments providerCount", () => {
    const registry = new ScreeningRegistry();
    assert.equal(registry.providerCount, 0);

    registry.register(mockProvider("Provider A", []));
    assert.equal(registry.providerCount, 1);

    registry.register(mockProvider("Provider B", []));
    assert.equal(registry.providerCount, 2);
  });

  it("screenAll aggregates hits from all providers", () => {
    const registry = new ScreeningRegistry();
    registry.register(
      mockProvider("Provider A", [
        { provider: "Provider A", matchType: "exact", sanctionedEntity: "Entity A", program: "P1", listEntry: "L1", confidence: 1.0 },
      ])
    );
    registry.register(
      mockProvider("Provider B", [
        { provider: "Provider B", matchType: "exact", sanctionedEntity: "Entity B", program: "P2", listEntry: "L2", confidence: 0.9 },
      ])
    );

    const hits = registry.screenAll("0xtest", "ethereum");
    assert.equal(hits.length, 2);
    assert.equal(hits[0].provider, "Provider A");
    assert.equal(hits[1].provider, "Provider B");
  });

  it("screenAll returns [] with no providers", () => {
    const registry = new ScreeningRegistry();
    const hits = registry.screenAll("0xtest", "ethereum");
    assert.deepEqual(hits, []);
  });

  it("screenAll returns [] when no providers match", () => {
    const registry = new ScreeningRegistry();
    registry.register(mockProvider("Clean Provider", []));
    const hits = registry.screenAll("0xclean", "ethereum");
    assert.deepEqual(hits, []);
  });

  it("refreshAll calls refresh on all providers", async () => {
    const registry = new ScreeningRegistry();
    const p1 = mockProvider("P1", []);
    const p2 = mockProvider("P2", []);
    registry.register(p1);
    registry.register(p2);

    await registry.refreshAll();
    assert.equal(p1.refreshCalled, true);
    assert.equal(p2.refreshCalled, true);
  });
});
