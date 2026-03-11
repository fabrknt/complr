import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateEnv } from "../src/api/env-validation.js";

const ENV_KEYS = [
  "PORT",
  "ADMIN_TOKEN",
  "ANTHROPIC_API_KEY",
  "TRM_LABS_API_KEY",
  "CHAINALYSIS_API_KEY",
  "TRM_LABS_BASE_URL",
  "CHAINALYSIS_BASE_URL",
  "DATA_DIR",
];

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] !== undefined) {
      process.env[key] = savedEnv[key];
    } else {
      delete process.env[key];
    }
  }
});

describe("validateEnv", () => {
  it("returns valid with no env vars set", () => {
    const result = validateEnv();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("reports error for non-numeric PORT", () => {
    process.env.PORT = "abc";
    const result = validateEnv();
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("PORT"))).toBe(true);
  });

  it("reports error for PORT out of range", () => {
    process.env.PORT = "99999";
    const result = validateEnv();
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("PORT"))).toBe(true);
  });

  it("accepts a valid PORT", () => {
    process.env.PORT = "3000";
    const result = validateEnv();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("warns when ADMIN_TOKEN is not set", () => {
    const result = validateEnv();
    expect(result.warnings.some((w) => w.includes("ADMIN_TOKEN") && w.includes("not set"))).toBe(true);
  });

  it("warns when ADMIN_TOKEN is too short", () => {
    process.env.ADMIN_TOKEN = "short";
    const result = validateEnv();
    expect(result.warnings.some((w) => w.includes("ADMIN_TOKEN") && w.includes("short"))).toBe(true);
  });

  it("does not warn when ADMIN_TOKEN is long enough", () => {
    process.env.ADMIN_TOKEN = "a-sufficiently-long-token-value";
    const result = validateEnv();
    expect(result.warnings.some((w) => w.includes("ADMIN_TOKEN"))).toBe(false);
  });

  it("reports info when ANTHROPIC_API_KEY is not set", () => {
    const result = validateEnv();
    expect(result.info.some((i) => i.includes("ANTHROPIC_API_KEY"))).toBe(true);
  });

  it("does not report info about ANTHROPIC_API_KEY when it is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-key";
    const result = validateEnv();
    expect(result.info.some((i) => i.includes("ANTHROPIC_API_KEY"))).toBe(false);
  });

  it("reports info when TRM_LABS_API_KEY is not set", () => {
    const result = validateEnv();
    expect(result.info.some((i) => i.includes("TRM_LABS_API_KEY") && i.includes("disabled"))).toBe(true);
  });

  it("reports info when TRM_LABS_API_KEY is set", () => {
    process.env.TRM_LABS_API_KEY = "trm-key";
    const result = validateEnv();
    expect(result.info.some((i) => i.includes("TRM Labs") && i.includes("enabled"))).toBe(true);
  });

  it("reports info when CHAINALYSIS_API_KEY is not set", () => {
    const result = validateEnv();
    expect(result.info.some((i) => i.includes("CHAINALYSIS_API_KEY") && i.includes("disabled"))).toBe(true);
  });

  it("reports info when CHAINALYSIS_API_KEY is set", () => {
    process.env.CHAINALYSIS_API_KEY = "ch-key";
    const result = validateEnv();
    expect(result.info.some((i) => i.includes("Chainalysis") && i.includes("enabled"))).toBe(true);
  });

  it("warns for invalid TRM_LABS_BASE_URL", () => {
    process.env.TRM_LABS_BASE_URL = "not-a-url";
    const result = validateEnv();
    expect(result.warnings.some((w) => w.includes("TRM_LABS_BASE_URL"))).toBe(true);
  });

  it("does not warn for valid TRM_LABS_BASE_URL", () => {
    process.env.TRM_LABS_BASE_URL = "https://api.trmlabs.com";
    const result = validateEnv();
    expect(result.warnings.some((w) => w.includes("TRM_LABS_BASE_URL"))).toBe(false);
  });

  it("warns for invalid CHAINALYSIS_BASE_URL", () => {
    process.env.CHAINALYSIS_BASE_URL = "not-a-url";
    const result = validateEnv();
    expect(result.warnings.some((w) => w.includes("CHAINALYSIS_BASE_URL"))).toBe(true);
  });

  it("reports DATA_DIR status when set", () => {
    process.env.DATA_DIR = "/tmp/complr-data";
    const result = validateEnv();
    expect(result.info.some((i) => i.includes("File persistence") && i.includes("/tmp/complr-data"))).toBe(true);
  });

  it("reports DATA_DIR status when not set", () => {
    const result = validateEnv();
    expect(result.info.some((i) => i.includes("DATA_DIR not set") && i.includes("in-memory"))).toBe(true);
  });
});
