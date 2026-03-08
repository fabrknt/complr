import { describe, it, expect, afterEach } from "vitest";
import { OfacScreener } from "../src/policy/ofac-screener.js";

describe("OfacScreener", () => {
  it("screen returns [] with no data loaded", () => {
    const screener = new OfacScreener();
    const hits = screener.screen("0xSomeAddress", "ethereum");
    expect(hits).toEqual([]);
  });

  it("refresh loads data and screen finds matches", async () => {
    const screener = new OfacScreener();

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
      expect(hits).toHaveLength(1);
      expect(hits[0].provider).toBe("OFAC SDN");
      expect(hits[0].matchType).toBe("exact");
      expect(hits[0].sanctionedEntity).toBe("BAD ACTOR");
      expect(hits[0].confidence).toBe(1.0);
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

      const hits = screener.screen("0xabcdef1234", "ethereum");
      expect(hits).toHaveLength(1);

      const hitsUpper = screener.screen("0XABCDEF1234", "ethereum");
      expect(hitsUpper).toHaveLength(1);
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
      expect(hits).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
