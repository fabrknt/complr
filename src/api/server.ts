import path from "path";
import { fileURLToPath } from "url";
import { Complr } from "../index.js";
import { SEED_REGULATIONS } from "../data/seed-regulations.js";
import { ApiKeyManager, OrganizationManager } from "../auth/index.js";
import { WebhookManager } from "../webhooks/index.js";
import { WalletScreener } from "../policy/wallet-screener.js";
import { ScreeningRegistry } from "../policy/screening-provider.js";
import { OfacScreener } from "../policy/ofac-screener.js";
import { CustomScreener } from "../policy/custom-screener.js";
import { AuditLogger } from "../audit/index.js";
import { createApp } from "./app.js";
import { createVaultRouter } from "./vault-routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("ANTHROPIC_API_KEY is required");
  process.exit(1);
}

// ─── Initialize services ─────────────────────────────────────────────

const dataDir = process.env.COMPLR_DATA_DIR || undefined;

const complr = new Complr({ anthropicApiKey: apiKey });
const keyManager = new ApiKeyManager(dataDir);
const webhookManager = new WebhookManager();
const orgManager = new OrganizationManager(dataDir);
const auditLogger = new AuditLogger();

// Screening registry with OFAC provider
const screeningRegistry = new ScreeningRegistry();
const ofacScreener = new OfacScreener();
screeningRegistry.register(ofacScreener);

// Optional custom sanctions screener
const customSanctionsFile = process.env.CUSTOM_SANCTIONS_FILE;
let customScreener: CustomScreener | undefined;
if (customSanctionsFile) {
  customScreener = new CustomScreener(customSanctionsFile);
  screeningRegistry.register(customScreener);
  customScreener.refresh().catch((err) => console.warn("Custom screener initial refresh failed:", err));
}

const walletScreener = new WalletScreener(apiKey, "claude-sonnet-4-5-20250929", screeningRegistry);

// Load seed regulatory data
for (const doc of SEED_REGULATIONS) {
  complr.addDocument(doc);
}

// OFAC data refresh — non-blocking on startup, then every 24h
ofacScreener.refresh().catch((err) => console.warn("OFAC initial refresh failed:", err));
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
setInterval(() => {
  ofacScreener.refresh().catch((err) => console.warn("OFAC refresh failed:", err));
}, TWENTY_FOUR_HOURS);

// ─── Create app ──────────────────────────────────────────────────────

const app = createApp({
  complr,
  keyManager,
  orgManager,
  auditLogger,
  screeningRegistry,
  webhookManager,
  walletScreener,
  ofacScreener,
});

// ─── Vault Routes (Phase 2) ─────────────────────────────────────────

const vaultRouter = createVaultRouter(complr);
app.use("/vault", vaultRouter);

// Serve vault dashboard
app.get("/vault-demo", (_req, res) => {
  res.sendFile(path.join(__dirname, "../../public/vault.html"));
});

// ─── Start ────────────────────────────────────────────────────────────

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`Complr API running on http://localhost:${port}`);
  console.log(`Documents loaded: ${complr.documentCount}`);
  console.log(`SDK API:  http://localhost:${port}/api/v1/*`);
  console.log(`Vault:    http://localhost:${port}/vault-demo`);
  console.log(`Admin UI: http://localhost:${port}/admin`);
  console.log(`Admin:    POST http://localhost:${port}/admin/api-keys`);
  console.log(`Audit:    GET  http://localhost:${port}/admin/audit`);
  console.log(`Orgs:     POST http://localhost:${port}/admin/organizations`);
  console.log(`OFAC screening: ${screeningRegistry.providerCount} provider(s) registered`);
  if (dataDir) console.log(`Data dir: ${dataDir}`);
});
