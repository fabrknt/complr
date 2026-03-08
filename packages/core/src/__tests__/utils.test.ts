import { describe, it, expect } from "vitest";
import { detectAddressFormat } from "../types.js";
import { extractJson } from "../utils.js";

// ─── detectAddressFormat ────────────────────────────────────────────

describe("detectAddressFormat", () => {
  describe("ethereum / EVM addresses", () => {
    it("detects a valid checksummed EVM address", () => {
      expect(
        detectAddressFormat("0xdAC17F958D2ee523a2206206994597C13D831ec7"),
      ).toBe("ethereum");
    });

    it("detects a lowercase EVM address", () => {
      expect(
        detectAddressFormat("0x0000000000000000000000000000000000000000"),
      ).toBe("ethereum");
    });

    it("detects an all-uppercase EVM address", () => {
      expect(
        detectAddressFormat("0xABCDEF1234567890ABCDEF1234567890ABCDEF12"),
      ).toBe("ethereum");
    });

    it("rejects EVM address that is too short", () => {
      expect(detectAddressFormat("0xdAC17F958D2ee523a220620699")).not.toBe(
        "ethereum",
      );
    });

    it("rejects EVM address that is too long", () => {
      expect(
        detectAddressFormat("0xdAC17F958D2ee523a2206206994597C13D831ec7FF"),
      ).not.toBe("ethereum");
    });

    it("rejects 0x prefix with non-hex characters", () => {
      expect(
        detectAddressFormat("0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG"),
      ).not.toBe("ethereum");
    });
  });

  describe("bitcoin addresses", () => {
    it("detects a legacy P2PKH address (starts with 1)", () => {
      expect(
        detectAddressFormat("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"),
      ).toBe("bitcoin");
    });

    it("detects a P2SH address (starts with 3)", () => {
      expect(
        detectAddressFormat("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy"),
      ).toBe("bitcoin");
    });

    it("detects a bech32 address (starts with bc1)", () => {
      expect(
        detectAddressFormat("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"),
      ).toBe("bitcoin");
    });

    it("detects a bech32m/taproot address", () => {
      expect(
        detectAddressFormat(
          "bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3s7a",
        ),
      ).toBe("bitcoin");
    });
  });

  describe("solana addresses", () => {
    it("detects a typical Solana public key", () => {
      expect(
        detectAddressFormat("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"),
      ).toBe("solana");
    });

    it("detects a shorter 32-char Solana address", () => {
      // 32 chars, base58 charset — starts with a character that won't match Bitcoin (not 1, 3, or bc1)
      expect(
        detectAddressFormat("So1111111111111111111111111111112"),
      ).toBe("solana");
    });
  });

  describe("unknown / edge cases", () => {
    it('returns "unknown" for empty string', () => {
      expect(detectAddressFormat("")).toBe("unknown");
    });

    it('returns "unknown" for random text', () => {
      expect(detectAddressFormat("hello world")).toBe("unknown");
    });

    it('returns "unknown" for a short numeric string', () => {
      expect(detectAddressFormat("12345")).toBe("unknown");
    });
  });
});

// ─── extractJson ────────────────────────────────────────────────────

describe("extractJson", () => {
  it("parses plain JSON", () => {
    expect(extractJson('{"key": "value"}')).toEqual({ key: "value" });
  });

  it("parses JSON wrapped in ```json code fences", () => {
    const input = '```json\n{"key": "value"}\n```';
    expect(extractJson(input)).toEqual({ key: "value" });
  });

  it("parses JSON wrapped in plain ``` code fences", () => {
    const input = '```\n[1, 2, 3]\n```';
    expect(extractJson(input)).toEqual([1, 2, 3]);
  });

  it("extracts JSON object embedded in prose", () => {
    const input = 'Here is the result: {"status": "ok"} end of response.';
    expect(extractJson(input)).toEqual({ status: "ok" });
  });

  it("extracts JSON array embedded in prose", () => {
    const input = "The data is: [1,2,3] as expected.";
    expect(extractJson(input)).toEqual([1, 2, 3]);
  });

  it("handles whitespace around plain JSON", () => {
    expect(extractJson('  \n  {"a": 1}  \n  ')).toEqual({ a: 1 });
  });

  it("throws on completely unparseable input", () => {
    expect(() => extractJson("no json here at all")).toThrow();
  });
});
