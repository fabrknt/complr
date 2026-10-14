import { describe, it, expect, afterEach } from "vitest";
import { OfacScreener } from "../src/policy/ofac-screener.js";

// Rows in the shape of the real sdn.csv: Ent_num, SDN_Name, SDN_Type, Program, Title,
// Call_Sign, Vess_type, Tonnage, GRT, Vess_flag, Vess_owner, Remarks. Digital currency
// addresses live in Remarks, several per row. The address supplement (add.csv) has none.
const SDN_CSV = [
  `36,"AEROCARIBBEAN AIRLINES",-0- ,"CUBA",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- `,
  `12345,"BAD ACTOR","individual","CYBER2",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,"DOB 01 Jan 1980; Digital Currency Address - XBT bc1qbadaddress; alt. Digital Currency Address - ETH 0xAbCdEf1234; alt. Digital Currency Address - SOL 42RLPACwZPx3vYYmxSueqsogfynBDqXK298EDsNoyoHi; Secondary sanctions risk: x."`,
  `99,"LAZARUS, GROUP","entity","DPRK3",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,"Digital Currency Address - TRX TNiq9AXBp9EjUqhDhrwrfvAA8U3GUQZH81"`,
].join("\r\n");
const ADD_CSV = `36,25,-0- ,"Havana",-0- ,"Cuba"\r\n12345,26,"1 Main St","Pyongyang",-0- ,"North Korea"`;

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** Serve the given sdn.csv body; record which URLs were requested. */
function mockSdn(body: string | null, status = 200): string[] {
  const requested: string[] = [];
  globalThis.fetch = async (url: string | URL | globalThis.Request) => {
    const urlStr = typeof url === "string" ? url : url.toString();
    requested.push(urlStr);
    if (urlStr.includes("sdn.csv") && body !== null) return new Response(body, { status });
    if (urlStr.includes("add.csv")) return new Response(ADD_CSV, { status: 200 });
    return new Response("", { status: 404 });
  };
  return requested;
}

describe("OfacScreener", () => {
  it("screen returns [] with no data loaded", () => {
    const screener = new OfacScreener();
    expect(screener.screen("0xSomeAddress", "ethereum")).toEqual([]);
    expect(screener.addressCount).toBe(0);
    expect(screener.lastRefreshed).toBeUndefined();
  });

  it("loads digital currency addresses from the Remarks column of sdn.csv", async () => {
    const screener = new OfacScreener();
    mockSdn(SDN_CSV);
    await screener.refresh();

    const hits = screener.screen("bc1qbadaddress", "bitcoin");
    expect(hits).toEqual([
      {
        provider: "OFAC SDN",
        matchType: "exact",
        sanctionedEntity: "BAD ACTOR",
        program: "CYBER2",
        listEntry: "SDN #12345",
        confidence: 1.0,
      },
    ]);
    expect(screener.lastRefreshed).toBeDefined();
  });

  it("loads every address in a row, including alt. entries, across chains", async () => {
    const screener = new OfacScreener();
    mockSdn(SDN_CSV);
    await screener.refresh();

    expect(screener.addressCount).toBe(4);
    expect(screener.screen("0xAbCdEf1234", "ethereum")).toHaveLength(1);
    expect(screener.screen("42RLPACwZPx3vYYmxSueqsogfynBDqXK298EDsNoyoHi", "solana")).toHaveLength(1);
    expect(screener.screen("TNiq9AXBp9EjUqhDhrwrfvAA8U3GUQZH81")[0]).toMatchObject({
      sanctionedEntity: "LAZARUS, GROUP",
      program: "DPRK3",
    });
  });

  it("does not depend on add.csv (which carries no digital currency addresses)", async () => {
    const screener = new OfacScreener();
    const requested = mockSdn(SDN_CSV);
    await screener.refresh();
    expect(requested.some((u) => u.includes("add.csv"))).toBe(false);
  });

  it("screen is case-insensitive", async () => {
    const screener = new OfacScreener();
    mockSdn(SDN_CSV);
    await screener.refresh();

    expect(screener.screen("0xabcdef1234", "ethereum")).toHaveLength(1);
    expect(screener.screen("0XABCDEF1234", "ethereum")).toHaveLength(1);
  });

  it("screen returns [] for non-matching address", async () => {
    const screener = new OfacScreener();
    mockSdn(SDN_CSV);
    await screener.refresh();
    expect(screener.screen("bc1qunknown", "bitcoin")).toEqual([]);
  });

  it("treats a list with no addresses as a failed refresh and keeps the previous data", async () => {
    const screener = new OfacScreener();
    mockSdn(SDN_CSV);
    await screener.refresh();
    const refreshedAt = screener.lastRefreshed;

    mockSdn(SDN_CSV.split("\r\n")[0]!);
    await screener.refresh();

    expect(screener.addressCount).toBe(4);
    expect(screener.lastRefreshed).toBe(refreshedAt);
    expect(screener.screen("bc1qbadaddress")).toHaveLength(1);
  });

  it("does not mark an empty list as refreshed", async () => {
    const screener = new OfacScreener();
    mockSdn(SDN_CSV.split("\r\n")[0]!);
    await screener.refresh();
    expect(screener.addressCount).toBe(0);
    expect(screener.lastRefreshed).toBeUndefined();
  });

  it("keeps the previous data when the download fails", async () => {
    const screener = new OfacScreener();
    mockSdn(SDN_CSV);
    await screener.refresh();

    mockSdn("", 503);
    await screener.refresh();
    expect(screener.addressCount).toBe(4);
  });
});
