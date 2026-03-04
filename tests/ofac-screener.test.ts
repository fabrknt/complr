import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { OfacScreener } from "../src/policy/ofac-screener.js";

describe("OfacScreener", () => {
  it("screen returns [] with no data loaded", () => {
    const screener = new OfacScreener();
    const hits = screener.screen("0xSomeAddress", "ethereum");
    assert.deepEqual(hits, []);
  });

  it("refresh loads data and screen finds matches", async () => {
    const screener = new OfacScreener();

    // Mock globalThis.fetch to return fake OFAC data
    const originalFetch = globalThis.fetch;
    const sdnCsv = `12345,"BAD ACTOR","individual","CYBER2"\n`;
    const addCsv = `12345,1,"","","","Digital Currency Address - XBT bc1qbadaddress"\n`;

    globalThis.fetch = async (url: string | URL | globalThis.Request, _opts?: RequestInit) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("sdn.csv")) {
        return new Response(sdnCsv, { status: 200 });
      }
      if (urlStr.includes("add.csv")) {
        return new Response(addCsv, { status: 200 });
      }
      return new Response("", { status: 404 });
    };

    try {
      await screener.refresh();

      const hits = screener.screen("bc1qbadaddress", "bitcoin");
      assert.equal(hits.length, 1);
      assert.equal(hits[0].provider, "OFAC SDN");
      assert.equal(hits[0].matchType, "exact");
      assert.equal(hits[0].sanctionedEntity, "BAD ACTOR");
      assert.equal(hits[0].confidence, 1.0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("screen is case-insensitive", async () => {
    const screener = new OfacScreener();

    const originalFetch = globalThis.fetch;
    const sdnCsv = `99,"SANCTIONED ENTITY","individual","SDN"\n`;
    const addCsv = `99,1,"","","","Digital Currency Address - ETH 0xAbCdEf1234"\n`;

    globalThis.fetch = async (url: string | URL | globalThis.Request) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("sdn.csv")) return new Response(sdnCsv, { status: 200 });
      if (urlStr.includes("add.csv")) return new Response(addCsv, { status: 200 });
      return new Response("", { status: 404 });
    };

    try {
      await screener.refresh();

      // Query with different case
      const hits = screener.screen("0xabcdef1234", "ethereum");
      assert.equal(hits.length, 1);

      const hitsUpper = screener.screen("0XABCDEF1234", "ethereum");
      assert.equal(hitsUpper.length, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("screen returns [] for non-matching address", async () => {
    const screener = new OfacScreener();

    const originalFetch = globalThis.fetch;
    const sdnCsv = `1,"ENTITY","individual","SDN"\n`;
    const addCsv = `1,1,"","","","Digital Currency Address - XBT bc1qknown"\n`;

    globalThis.fetch = async (url: string | URL | globalThis.Request) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("sdn.csv")) return new Response(sdnCsv, { status: 200 });
      if (urlStr.includes("add.csv")) return new Response(addCsv, { status: 200 });
      return new Response("", { status: 404 });
    };

    try {
      await screener.refresh();
      const hits = screener.screen("bc1qunknown", "bitcoin");
      assert.deepEqual(hits, []);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
