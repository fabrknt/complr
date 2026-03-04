# Complr

Compliance infrastructure for Asia's regulated crypto economy.

Complr is an AI-powered compliance platform covering **MAS** (Singapore), **SFC** (Hong Kong), and **FSA** (Japan). It provides a core compliance engine, an SDK for exchanges and VASPs to embed compliance checks into their workflows, and a regulated yield platform demonstrating compliance-first DeFi.

## Product Phases

| Phase | Name | Status | Description |
|-------|------|--------|-------------|
| **0** | AI Compliance Agent | Complete | Core compliance engine with 4 features |
| **1** | Compliance Middleware SDK | MVP | `@complr/sdk` — npm-installable SDK for exchanges/VASPs |
| **2** | Regulated Yield Platform | Demo | Compliance-embedded yield vaults for investor pitches |
| **3** | Product Depth | Complete | Semantic search, OFAC screening, audit logging, multi-tenancy |

---

## Phase 0: Core Compliance Engine

### Features

- **Regulatory Queries** -- Ask natural language questions about crypto regulations and get jurisdiction-specific answers grounded in actual regulatory text
- **Transaction Compliance Checks** -- Submit a single transaction and get compliance results across all 3 jurisdictions simultaneously, including Travel Rule applicability, KYC requirements, and action items
- **SAR/STR Generation** -- Auto-draft Suspicious Transaction Reports in regulator-specific formats (FSA STR, MAS STR, SFC STR) in seconds
- **Obligation Extraction** -- Feed in regulatory documents and get structured, actionable obligations with thresholds, penalties, and suggested controls

### Web UI

Open `http://localhost:3000` after starting the server. 4 interactive tabs for all core features.

---

## Phase 1: Compliance Middleware SDK

The SDK wraps the compliance engine into an authenticated API that exchanges and VASPs can integrate via `npm install @complr/sdk`.

### SDK Features

- **Authenticated API** -- Bearer token auth with per-key rate limiting
- **Batch Compliance Checks** -- Check up to 50 transactions in parallel
- **Wallet Risk Screening** -- LLM-powered wallet address risk assessment
- **Webhook Delivery** -- HMAC-signed webhook notifications with exponential backoff retry
- **Usage Tracking** -- Per-key request counts and usage statistics
- **TypeScript-first** -- Full type definitions, zero dependencies

### SDK Quick Start

```typescript
import { ComplrClient } from "@complr/sdk";

const complr = new ComplrClient({
  apiKey: "complr_...",
  baseUrl: "http://localhost:3000",
});

// Single transaction check
const result = await complr.checkTransaction({
  transactionId: "tx_001",
  timestamp: new Date().toISOString(),
  senderWallet: "0xabc...",
  recipientWallet: "0xdef...",
  amount: "10000",
  currency: "USDC",
  chain: "ethereum",
});

// Batch check
const batch = await complr.checkBatch(transactions);

// Wallet screening
const screen = await complr.screenWallet("0xabc...", "ethereum", "MAS");

// Webhook management
await complr.registerWebhook("https://your-app.com/webhooks", ["check.blocked", "screen.high_risk"], "your-secret");
```

### API Key Management

```bash
# Generate an API key
curl -X POST localhost:3000/admin/api-keys \
  -H "Content-Type: application/json" \
  -d '{"name": "my-exchange"}'

# List all keys
curl localhost:3000/admin/api-keys

# Revoke a key
curl -X DELETE localhost:3000/admin/api-keys/ak_xxx
```

### V1 API Endpoints

All `/api/v1/*` routes require a Bearer token via the `Authorization` header.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/query` | Regulatory knowledge base query |
| POST | `/api/v1/check` | Single transaction compliance check |
| POST | `/api/v1/check/batch` | Batch check (up to 50 transactions) |
| POST | `/api/v1/screen/wallet` | Wallet risk assessment (OFAC + LLM) |
| POST | `/api/v1/report` | SAR/STR report generation |
| POST | `/api/v1/analyze` | Obligation extraction |
| POST | `/api/v1/webhooks` | Register a webhook |
| GET | `/api/v1/webhooks` | List webhooks |
| DELETE | `/api/v1/webhooks/:id` | Remove a webhook |
| GET | `/api/v1/usage` | Usage stats for current API key |
| GET | `/api/v1/audit` | Audit logs scoped to current API key |

### Admin Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/admin/api-keys` | Generate API key (accepts `organizationId`) |
| GET | `/admin/api-keys` | List all keys |
| DELETE | `/admin/api-keys/:id` | Revoke key |
| POST | `/admin/organizations` | Create organization |
| GET | `/admin/organizations` | List all organizations |
| GET | `/admin/organizations/:id` | Get organization details |
| GET | `/admin/audit` | Query all audit logs (with filters) |

---

## Phase 2: Regulated Yield Platform (Demo)

A demo yield platform showing how compliance-embedded yield vaults would work. For investor pitches only -- no real money.

### Vault Dashboard

Open `http://localhost:3000/vault-demo` after starting the server. 5 interactive tabs:

1. **Strategies** -- 3 vault cards with APY, composition breakdown, risk rating
2. **Portfolio** -- Total value, yield earned, allocation pie chart
3. **Performance** -- 90-day NAV line chart (SVG, zero dependencies)
4. **Deposit / Withdraw** -- Eligibility check + transaction forms
5. **Investor Onboarding** -- Registration + compliance screening flow

### Vault Strategies

| Vault | Composition | Target APY | Risk | Min Deposit |
|-------|-------------|-----------|------|-------------|
| **Conservative** | 70% BUIDL + 20% USYC + 10% USDC | 3.8% | Low | $1,000 |
| **Balanced** | 40% BUIDL + 30% USDY + 20% USYC + 10% USDC | 4.3% | Medium | $5,000 |
| **Growth** | 30% BUIDL + 30% USDY + 25% sDAI + 15% USDC | 4.8% | Medium | $10,000 (accredited only) |

### Vault API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/vault/strategies` | List vault configs with current yields |
| GET | `/vault/performance/:vaultId` | Historical NAV data (query: `?days=90`) |
| POST | `/vault/deposit` | Deposit (checks compliance first) |
| POST | `/vault/withdraw` | Withdraw shares |
| GET | `/vault/portfolio/:investorId` | Investor positions and total value |
| POST | `/vault/investors/register` | Register new investor |
| POST | `/vault/investors/:id/screen` | Run KYC/sanctions screening |
| GET | `/vault/investors/:id` | Get investor profile |
| GET | `/vault/investors` | List all investors |
| GET | `/vault/reports/:investorId` | Generate monthly report |

### Demo Investors

3 pre-seeded investors across jurisdictions:

| Name | Jurisdiction | Accredited |
|------|-------------|------------|
| Tanaka Hiroshi | FSA (Japan) | Yes |
| Lim Wei Ting | MAS (Singapore) | No |
| Chan Ka Ming | SFC (Hong Kong) | Yes |

---

## Phase 3: Product Depth

Four cross-cutting improvements that deepen the platform without adding any npm dependencies or breaking existing APIs.

### Semantic Search (TF-IDF)

The knowledge base now builds a TF-IDF index on every document added. Regulatory queries and compliance checks use cosine-similarity semantic search to find the most relevant documents instead of returning all docs for a jurisdiction. Falls back to jurisdiction-wide search when no results match.

### Pluggable Wallet Screening (OFAC SDN)

Wallet screening is now a two-stage pipeline:

1. **Provider check** -- all registered `ScreeningProvider`s are queried first. An exact match (e.g. OFAC SDN) returns immediately with `riskScore: 100`, `riskLevel: "critical"`.
2. **LLM analysis** -- if no exact sanctions hit, the LLM screening runs as before, augmented with any provider context.

The built-in `OfacScreener` fetches the US Treasury's SDN address supplement (`add.csv`) and entity list (`sdn.csv`), parses all "Digital Currency Address" entries, and matches by exact normalized address. Data refreshes automatically every 24 hours.

Custom providers can be added by implementing the `ScreeningProvider` interface and registering with the `ScreeningRegistry`.

### Audit Logging

Every API operation is logged to an append-only audit trail. Events capture: API key, organization, action, resource, HTTP method, result (success/error/blocked), status code, client IP, and duration.

```bash
# Query all audit logs
curl localhost:3000/admin/audit

# Filter by action and result
curl "localhost:3000/admin/audit?action=check&result=success&limit=10"

# Authenticated users see only their own logs
curl localhost:3000/api/v1/audit -H "Authorization: Bearer complr_..."
```

Set the `AUDIT_LOG_FILE` environment variable to persist logs to a JSON-lines file.

### Multi-Tenant Isolation

Organizations group API keys under a shared identity with aggregate rate limiting.

```bash
# Create an organization
curl -X POST localhost:3000/admin/organizations \
  -H "Content-Type: application/json" \
  -d '{"name": "Acme Exchange", "rateLimit": 300}'

# Generate an API key under the org
curl -X POST localhost:3000/admin/api-keys \
  -H "Content-Type: application/json" \
  -d '{"name": "acme-prod", "organizationId": "org_..."}'
```

- Per-key rate limiting still applies, plus an org-wide aggregate limit (separate sliding window)
- Regulatory documents with an `organizationId` are only visible to that org's keys via semantic search
- Seed data (no `organizationId`) remains visible to everyone

---

## Quickstart

```bash
# Install dependencies
npm install

# Start the server (serves all 3 phases)
ANTHROPIC_API_KEY=sk-ant-... npm run start:server

# Run the Phase 0 demo
ANTHROPIC_API_KEY=sk-ant-... npx tsx src/demo.ts

# Start the interactive CLI
ANTHROPIC_API_KEY=sk-ant-... npm start
```

After starting the server:

- **Phase 0 Web UI**: http://localhost:3000
- **Phase 2 Vault Dashboard**: http://localhost:3000/vault-demo
- **Health Check**: http://localhost:3000/health

## Architecture

```
src/
  index.ts                          # Complr class -- main entry point
  types.ts                          # Shared types and interfaces
  utils.ts                          # JSON extraction from LLM responses
  demo.ts                           # Demo script (4 features)
  cli.ts                            # Interactive REPL
  api/
    server.ts                       # Express REST API (legacy + v1 + admin + vault)
    vault-routes.ts                 # Vault demo endpoints
  audit/
    logger.ts                       # Append-only audit logger with query/filter
  auth/
    api-keys.ts                     # API key generation, validation, usage tracking
    middleware.ts                   # Bearer token auth + per-key/org rate limiting
    organizations.ts                # Multi-tenant organization manager
  data/
    seed-regulations.ts             # 8 seed regulatory documents
    seed-investors.ts               # 3 demo investors
  policy/
    engine.ts                       # Multi-jurisdiction compliance engine
    wallet-screener.ts              # OFAC + LLM wallet risk screening
    screening-provider.ts           # ScreeningRegistry for pluggable providers
    ofac-screener.ts                # OFAC SDN list fetcher/parser
  regulatory/
    analyzer.ts                     # LLM-powered regulatory analysis
    knowledge-base.ts               # Document store with TF-IDF semantic search
    vector-search.ts                # TF-IDF index with cosine similarity
  reports/
    generator.ts                    # SAR/STR report generation
  vault/
    simulator.ts                    # Vault strategies, NAV, deposit/withdraw
    investor-compliance.ts          # Investor registration and KYC screening
    report-generator.ts             # Monthly investor reports and tax summaries
  webhooks/
    manager.ts                      # Webhook registration and HMAC-signed delivery

sdk/                                # Standalone SDK package (@complr/sdk)
  src/
    client.ts                       # ComplrClient class with retry/backoff
    types.ts                        # SDK-facing type definitions
    webhook-handler.ts              # Signature verification + Express middleware
    index.ts                        # SDK entry point

public/
  index.html                        # Phase 0 web UI (4 tabs)
  vault.html                        # Phase 2 vault dashboard (5 tabs)
```

## Jurisdictions

| Regulator | Region | Travel Rule Threshold |
|-----------|--------|----------------------|
| **MAS** | Singapore | S$1,500 (~USD 1,100) |
| **SFC** | Hong Kong | HK$8,000 (~USD 1,025) |
| **FSA** | Japan | Zero (all transactions) |

## Seed Regulatory Data

The knowledge base ships with 8 regulatory documents covering:

- MAS Payment Services Act (DPT licensing, Travel Rule, tokenisation guide)
- SFC ASPIRe roadmap, Travel Rule under AMLO, Stablecoins Ordinance
- FSA Travel Rule (JVCEA), crypto tax reform proposal

## Design Decisions

- **Zero new npm dependencies** -- uses native `fetch()`, `node:crypto`, inline SVG charts, hand-rolled TF-IDF and CSV parser
- **In-memory everything** -- all state (API keys, vaults, investors, audit logs, orgs) stored in `Map<string, T>`. Server restart resets. Easy to migrate to a database later
- **SDK is standalone** -- `sdk/` directory with its own `package.json`, duplicates types intentionally for clean package separation
- **Legacy routes preserved** -- existing web UI at `/` continues to work without auth
- **Single Express server** -- SDK API (`/api/v1/*`), vault demo (`/vault/*`), and web UI all share one server
- **Audit everything** -- every API route is wrapped with `auditWrap` for automatic logging with zero per-handler boilerplate
- **Pluggable screening** -- `ScreeningProvider` interface lets you add new sanctions lists, PEP databases, or custom checks alongside the built-in OFAC screener

## Development

```bash
npm run build       # Compile TypeScript
npm run dev         # Watch mode
npm run typecheck   # Type check without emitting
```

## License

Proprietary. All rights reserved.
