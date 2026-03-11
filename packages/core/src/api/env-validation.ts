export interface EnvValidationResult {
  valid: boolean;
  warnings: string[];
  info: string[];
  errors: string[];
}

/**
 * Validate environment variables and report configuration status.
 * Does not throw — returns a structured result for the caller to handle.
 */
export function validateEnv(): EnvValidationResult {
  const result: EnvValidationResult = {
    valid: true,
    warnings: [],
    info: [],
    errors: [],
  };

  // ─── Required for core functionality ─────────────────────────────

  const port = process.env.PORT;
  if (port && (isNaN(Number(port)) || Number(port) < 1 || Number(port) > 65535)) {
    result.errors.push(`PORT must be a valid port number (1-65535), got: ${port}`);
    result.valid = false;
  }

  // ─── Security ────────────────────────────────────────────────────

  if (!process.env.ADMIN_TOKEN) {
    result.warnings.push("ADMIN_TOKEN is not set — admin endpoints are unprotected");
  } else if (process.env.ADMIN_TOKEN.length < 16) {
    result.warnings.push("ADMIN_TOKEN is very short — consider using a longer token (16+ chars)");
  }

  // ─── AI Provider ────────────────────────────────────────────────

  if (!process.env.ANTHROPIC_API_KEY) {
    result.info.push("ANTHROPIC_API_KEY not set — compliance engine (query, check, report) will be unavailable");
  }

  // ─── External Screening Providers ────────────────────────────────

  if (!process.env.TRM_LABS_API_KEY) {
    result.info.push("TRM_LABS_API_KEY not set — TRM Labs screening provider disabled");
  } else {
    result.info.push("TRM Labs screening provider enabled");
  }

  if (!process.env.CHAINALYSIS_API_KEY) {
    result.info.push("CHAINALYSIS_API_KEY not set — Chainalysis KYT provider disabled");
  } else {
    result.info.push("Chainalysis KYT provider enabled");
  }

  // ─── Optional configuration ──────────────────────────────────────

  const trmUrl = process.env.TRM_LABS_BASE_URL;
  if (trmUrl && !trmUrl.startsWith("http")) {
    result.warnings.push(`TRM_LABS_BASE_URL does not look like a URL: ${trmUrl}`);
  }

  const chainalysisUrl = process.env.CHAINALYSIS_BASE_URL;
  if (chainalysisUrl && !chainalysisUrl.startsWith("http")) {
    result.warnings.push(`CHAINALYSIS_BASE_URL does not look like a URL: ${chainalysisUrl}`);
  }

  // ─── Data persistence ───────────────────────────────────────────

  if (process.env.DATA_DIR) {
    result.info.push(`File persistence enabled — data dir: ${process.env.DATA_DIR}`);
  } else {
    result.info.push("DATA_DIR not set — using in-memory storage (data lost on restart)");
  }

  return result;
}

/** Log the validation result with color-coded console output */
export function logValidationResult(result: EnvValidationResult): void {
  if (result.errors.length > 0) {
    for (const err of result.errors) {
      console.error(`[ERROR] ${err}`);
    }
  }

  if (result.warnings.length > 0) {
    for (const warn of result.warnings) {
      console.warn(`[WARN]  ${warn}`);
    }
  }

  if (result.info.length > 0) {
    for (const msg of result.info) {
      console.info(`[INFO]  ${msg}`);
    }
  }
}
