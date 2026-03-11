# Complr

[![CI](https://github.com/complr/complr/actions/workflows/ci.yml/badge.svg)](https://github.com/complr/complr/actions/workflows/ci.yml)

AI-powered compliance infrastructure for the digital asset industry.

Complr is a **chain-agnostic** compliance platform covering **MAS** (Singapore), **SFC** (Hong Kong), and **FSA** (Japan). It provides a core compliance engine, an SDK for exchanges and VASPs to embed compliance checks into their workflows, and a regulated yield platform demonstrating compliance-first DeFi.

**Multi-chain support**: Complr works with any blockchain. Wallet screening and transaction compliance checks support Ethereum/EVM, Solana, Bitcoin, and other address formats out of the box. The `chain` parameter is optional -- address formats are auto-detected when omitted.

## Product Phases

| Phase | Name | Status | Description |
|-------|------|--------|-------------|
| **0** | AI Compliance Agent | Complete | Core compliance engine with 4 features |
| **1** | Compliance Middleware SDK | MVP | `@complr/sdk` — npm-installable SDK for exchanges/VASPs |
| **2** | Regulated Yield Platform | Demo | Compliance-embedded yield vaults for investor pitches |
| **3** | Product Depth | Complete | Semantic search, OFAC screening, audit logging, multi-tenancy |
| **3+** | Tests, Persistence, Admin | Complete | Unit tests, file-backed persistence, admin UI, custom screener, SDK audit logs |
| **4** | Security & CI | Complete | Admin auth, CI pipeline, integration tests |
| **5** | Production Hardening | Complete | Human-in-the-loop review queue, external screening providers (TRM Labs, Chainalysis), confidence scoring & citation verification |

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
- **Wallet Risk Screening** -- Multi-chain LLM-powered wallet address risk assessment with auto-detection
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

// Wallet screening (chain auto-detected from address format)
const screen = await complr.screenWallet("0xabc...");

// Or specify chain explicitly
const screenExplicit = await complr.screenWallet("0xabc...", "ethereum", "MAS");

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
| POST | `/api/v1/query/confident` | Query with confidence scoring & citations |
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

### Admin Authentication

Admin API routes are protected by the `ADMIN_TOKEN` environment variable:

```bash
# Start with admin auth enabled
ADMIN_TOKEN=your-secret-token ANTHROPIC_API_KEY=sk-ant-... pnpm start:server
```

- **If `ADMIN_TOKEN` is set:** all admin API routes require `Authorization: Bearer <token>` header
- **If `ADMIN_TOKEN` is not set:** admin routes are open (backward compatible), a warning is logged

The admin HTML dashboard (`GET /admin`) remains accessible without auth — it handles authentication via the token input in the UI header.

### Admin Endpoints

All admin API routes require the admin token when `ADMIN_TOKEN` is set.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/admin/api-keys` | Generate API key (accepts `organizationId`) |
| GET | `/admin/api-keys` | List all keys |
| DELETE | `/admin/api-keys/:id` | Revoke key |
| POST | `/admin/organizations` | Create organization |
| GET | `/admin/organizations` | List all organizations |
| GET | `/admin/organizations/:id` | Get organization details |
| GET | `/admin/audit` | Query all audit logs (with filters) |
| GET | `/admin/reviews` | List review items (with filters) |
| GET | `/admin/reviews/stats` | Review queue statistics |
| GET | `/admin/reviews/:id` | Get review item detail |
| POST | `/admin/reviews/:id/approve` | Approve review item |
| POST | `/admin/reviews/:id/reject` | Reject review item |
| POST | `/admin/reviews/:id/escalate` | Escalate review item |
| GET | `/admin` | Admin dashboard UI |
| POST | `/admin/screen/test` | Test address screening (sanctions only) |

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

### Pluggable Wallet Screening (OFAC SDN, Multi-Chain)

Wallet screening is now a two-stage pipeline supporting addresses from any blockchain:

1. **Provider check** -- all registered `ScreeningProvider`s are queried first. An exact match (e.g. OFAC SDN) returns immediately with `riskScore: 100`, `riskLevel: "critical"`.
2. **LLM analysis** -- if no exact sanctions hit, the LLM screening runs as before, augmented with provider context.

The `chain` parameter is optional -- address formats (Ethereum/EVM, Solana, Bitcoin) are auto-detected when omitted.

The built-in `OfacScreener` fetches the US Treasury's SDN address supplement (`add.csv`) and entity list (`sdn.csv`), parses all "Digital Currency Address" entries across all chains, and matches by exact normalized address. Data refreshes automatically every 24 hours.

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

### Custom Sanctions Screener

In addition to the built-in OFAC provider, you can load a custom sanctions list from a local JSON file:

```bash
# Create a sanctions file
echo '[{"address":"0xbad","entity":"Bad Actor","program":"CUSTOM","listEntry":"#1"}]' > sanctions.json

# Start with custom screener
CUSTOM_SANCTIONS_FILE=./sanctions.json ANTHROPIC_API_KEY=sk-ant-... pnpm start:server
```

The custom screener performs exact case-insensitive address matching with confidence 1.0.

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

### File-Backed Persistence

Set `COMPLR_DATA_DIR` to persist organizations and API keys across server restarts:

```bash
COMPLR_DATA_DIR=/tmp/complr-data ANTHROPIC_API_KEY=sk-ant-... pnpm start:server
```

Data is stored as JSON files with atomic writes. Without `COMPLR_DATA_DIR`, everything stays in-memory (backward compatible).

### Admin Dashboard

Open `http://localhost:3000/admin` for a web-based admin UI with 5 tabs:

1. **Organizations** — create and list organizations
2. **API Keys** — create, list, and revoke API keys
3. **Review Queue** — filterable review list, statistics, detail view with AI decision payload, approve/reject/escalate actions
4. **Audit Log** — filterable, paginated audit event viewer
5. **Screening** — system health status and test address screening

### Automated Tests

170 tests across 15 test files using vitest:

```bash
pnpm test
```

Tests cover: TF-IDF search, audit logging, organizations, API keys, OFAC screener, screening registry, knowledge base, admin auth middleware, HTTP-level API integration, review queue, confidence scoring, and external screening providers.

---

## Phase 5: Production Hardening

Three cross-cutting improvements that address the gap between "demo/prototype" and "commercial infrastructure": human oversight of AI decisions, integration with premium on-chain intelligence, and structured confidence scoring to mitigate LLM hallucination risk.

### Human-in-the-Loop Review Queue

A compliance officer review queue for all high-risk AI decisions. Non-compliant transactions, high-risk wallet screenings, and all generated SAR/STR reports are automatically submitted for human review.

```bash
# List pending reviews (admin dashboard or API)
curl localhost:3000/admin/reviews?status=pending \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Approve a review item
curl -X POST localhost:3000/admin/reviews/rv_abc123/approve \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reviewerId": "compliance-officer-1", "notes": "Verified against source docs"}'

# Reject a review item
curl -X POST localhost:3000/admin/reviews/rv_abc123/reject \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reviewerId": "compliance-officer-1", "notes": "False positive"}'

# Escalate for senior review
curl -X POST localhost:3000/admin/reviews/rv_abc123/escalate \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reviewerId": "compliance-officer-1", "notes": "Needs legal team input"}'

# Get review queue statistics
curl localhost:3000/admin/reviews/stats \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Auto-submission rules:
- **Transaction checks**: Submitted when `overallStatus` is `blocked` or `requires_action`
- **Wallet screenings**: Submitted when `riskLevel` is `high` or `critical`
- **Reports**: All generated SAR/STR reports are submitted (all reports need human sign-off)

Priority is auto-assigned: critical screening hits → critical, blocked transactions → high, requires-action → medium, reports → medium.

The admin dashboard includes a **Review Queue** tab with filtering, detail view with the full AI decision payload, and one-click approve/reject/escalate actions.

Review queue data persists to disk when `COMPLR_DATA_DIR` is set.

### External On-chain Intelligence Providers

Integration with premium KYC/AML providers via a pluggable `ExternalScreeningProvider` base class. Two providers are included:

| Provider | Env Var | API |
|----------|---------|-----|
| **TRM Labs** | `TRM_LABS_API_KEY` | `/v2/screening/addresses` |
| **Chainalysis KYT** | `CHAINALYSIS_API_KEY` | `/api/risk/v2/entities/{address}` |

```bash
# Start with TRM Labs screening
TRM_LABS_API_KEY=your-key ANTHROPIC_API_KEY=sk-ant-... pnpm start:server

# Start with Chainalysis screening
CHAINALYSIS_API_KEY=your-key ANTHROPIC_API_KEY=sk-ant-... pnpm start:server

# Both providers can run simultaneously
TRM_LABS_API_KEY=trm-key CHAINALYSIS_API_KEY=ch-key ANTHROPIC_API_KEY=sk-ant-... pnpm start:server

# Custom base URLs for sandbox/testing
TRM_LABS_BASE_URL=https://sandbox.trmlabs.com TRM_LABS_API_KEY=your-key ...
```

The base class provides:
- **TTL-based caching** (default 5 minutes) to avoid redundant API calls
- **Retry with exponential backoff** (configurable max retries, default 2)
- **Rate-limit tracking** via `x-ratelimit-remaining` headers
- **Graceful degradation**: returns empty hits on API failure, logs warning
- **Health checks**: reflected in the `/health` endpoint

Custom providers can be built by extending `ExternalScreeningProvider` and implementing `fetchScreeningData()` and `healthCheck()`.

### Confidence Scoring & Citation Verification

Regulatory query responses can now include structured confidence metadata to mitigate LLM hallucination risk. This addresses the core liability gap: a VASP cannot use "the AI said it was okay" as a defense with FSA or MAS.

```typescript
// SDK usage
const result = await complr.queryConfident({
  question: "What is the Travel Rule threshold in Singapore?",
  jurisdiction: "MAS",
});

// result includes:
// - answer: string (the LLM response)
// - confidence: { score: 0.82, level: "high", factors: [...] }
// - citations: [{ documentId, documentTitle, verified: true, excerpt: "..." }]
// - warnings: ["Only one source document was available"]
// - disclaimer: "This analysis is generated by AI and should not be..."
```

```bash
# API: confidence-scored query
curl -X POST localhost:3000/api/v1/query/confident \
  -H "Authorization: Bearer complr_..." \
  -H "Content-Type: application/json" \
  -d '{"question": "What are KYC requirements for exchanges in Hong Kong?", "jurisdiction": "SFC"}'

# Legacy route: add confident flag
curl -X POST localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{"question": "...", "jurisdiction": "MAS", "confident": true}'
```

The confidence scorer is pure logic (no additional LLM calls) and evaluates:

| Factor | What it measures |
|--------|-----------------|
| **source_coverage** | How many answer terms appear in source documents |
| **recency** | How recent the source regulatory documents are |
| **specificity** | Whether the answer includes specific thresholds, dates, section numbers |
| **citation_accuracy** | Whether referenced documents exist in the knowledge base |

Hallucination detection flags:
- References to documents not in the source set
- Claims about regulations from the wrong jurisdiction
- Use of absolute language ("always", "never", "guaranteed") in regulatory interpretations
- Insufficient source material

Every response includes a disclaimer: *"This analysis is generated by AI and should not be considered legal advice. A qualified compliance professional must verify all regulatory interpretations before acting on them."*

---

## Quickstart

```bash
# Install dependencies (requires pnpm@10.31.0)
pnpm install

# Build all packages (uses turbo)
pnpm build

# Start the server (serves all 3 phases)
ANTHROPIC_API_KEY=sk-ant-... pnpm start:server

# Run the Phase 0 demo
ANTHROPIC_API_KEY=sk-ant-... pnpm tsx packages/core/src/demo.ts

# Start the interactive CLI
ANTHROPIC_API_KEY=sk-ant-... pnpm start
```

After starting the server:

- **Phase 0 Web UI**: http://localhost:3000
- **Phase 2 Vault Dashboard**: http://localhost:3000/vault-demo
- **Admin Dashboard**: http://localhost:3000/admin
- **Health Check**: http://localhost:3000/health

## Architecture

This project is a **pnpm monorepo** managed with **turbo**. It uses pnpm@10.31.0 and contains three packages:

```
packages/
  core/                             # @complr/core -- compliance engine + API server
    src/
      index.ts                      # Complr class -- main entry point
      types.ts                      # Shared types and interfaces
      utils.ts                      # JSON extraction from LLM responses
      demo.ts                       # Demo script (4 features)
      cli.ts                        # Interactive REPL
      api/
        app.ts                      # createApp() factory for testability
        server.ts                   # Thin entry point (env, services, listen)
        vault-routes.ts             # Vault demo endpoints
      audit/
        logger.ts                   # Append-only audit logger with query/filter
      auth/
        api-keys.ts                 # API key generation, validation, usage tracking
        middleware.ts               # Bearer token auth + per-key/org rate limiting
        organizations.ts            # Multi-tenant organization manager
      data/
        seed-regulations.ts         # 8 seed regulatory documents
        seed-investors.ts           # 3 demo investors
      policy/
        engine.ts                   # Multi-jurisdiction compliance engine
        wallet-screener.ts          # OFAC + LLM wallet risk screening
        screening-provider.ts       # ScreeningRegistry for pluggable providers
        ofac-screener.ts            # OFAC SDN list fetcher/parser
        custom-screener.ts          # JSON-file custom sanctions screener
        external-provider.ts        # Abstract base for external intelligence providers
        trm-provider.ts             # TRM Labs API integration
        chainalysis-provider.ts     # Chainalysis KYT API integration
      review/
        queue.ts                    # Human-in-the-loop review queue
      regulatory/
        analyzer.ts                 # LLM-powered regulatory analysis
        knowledge-base.ts           # Document store with TF-IDF semantic search
        vector-search.ts            # TF-IDF index with cosine similarity
        confidence.ts               # Confidence scoring & citation verification
      reports/
        generator.ts                # SAR/STR report generation
      vault/
        simulator.ts                # Vault strategies, NAV, deposit/withdraw
        investor-compliance.ts      # Investor registration and KYC screening
        report-generator.ts         # Monthly investor reports and tax summaries
      storage/
        json-store.ts               # Generic file-backed Map store
      webhooks/
        manager.ts                  # Webhook registration and HMAC-signed delivery
    tests/                          # Tests (node:test + tsx)
      vector-search.test.ts         # TF-IDF index tests
      audit-logger.test.ts          # Audit logger tests
      organizations.test.ts         # Organization manager tests
      api-keys.test.ts              # API key manager tests
      ofac-screener.test.ts         # OFAC screener tests
      screening-registry.test.ts    # Screening registry tests
      knowledge-base.test.ts        # Knowledge base tests
      admin-auth.test.ts            # Admin auth middleware tests
      api-integration.test.ts       # HTTP-level integration tests
    public/
      index.html                    # Phase 0 web UI (4 tabs)
      vault.html                    # Phase 2 vault dashboard (5 tabs)
      admin.html                    # Admin dashboard (4 tabs)

  sdk/                              # @complr/sdk -- standalone SDK package
    src/
      client.ts                     # ComplrClient class with retry/backoff
      types.ts                      # SDK-facing type definitions
      webhook-handler.ts            # Signature verification + Express middleware
      index.ts                      # SDK entry point

  qn-addon/                         # @complr/qn-addon -- QuickNode Marketplace add-on
    docs/
      user-guide.md                 # End-user documentation for the add-on
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
- **Optional file persistence** -- `COMPLR_DATA_DIR` enables JSON-file persistence for API keys and organizations via `JsonStore<T>`. Without it, everything stays in-memory (backward compat)
- **SDK is standalone** -- `packages/sdk/` with its own `package.json`, duplicates types intentionally for clean package separation
- **Legacy routes preserved** -- existing web UI at `/` continues to work without auth
- **Single Express server** -- SDK API (`/api/v1/*`), vault demo (`/vault/*`), and web UI all share one server
- **Audit everything** -- every API route is wrapped with `auditWrap` for automatic logging with zero per-handler boilerplate
- **Pluggable screening** -- `ScreeningProvider` interface lets you add new sanctions lists, PEP databases, or custom checks alongside the built-in OFAC screener. `ExternalScreeningProvider` adds caching, retry, and graceful degradation for API-based providers (TRM Labs, Chainalysis)
- **Human-in-the-loop** -- AI decisions that affect compliance (blocked transactions, high-risk screenings, all reports) are auto-submitted to a review queue for human approval, with priority-based routing
- **Confidence over certainty** -- regulatory queries return structured confidence scores with verified citations and hallucination warnings, so compliance officers know how much to trust each response
- **AI output is never final** -- every AI-generated response includes a legal disclaimer; SAR/STR reports require human sign-off via the review queue before submission to regulators

## Development

```bash
pnpm install        # Install all dependencies
pnpm build          # Build all packages (via turbo)
pnpm dev            # Watch mode
pnpm typecheck      # Type check without emitting
pnpm test           # Run all tests (170 tests, 15 suites)
```

CI runs automatically on push/PR to `master` via GitHub Actions (Node 20, pnpm, build + test).

## QuickNode Marketplace Add-on

**Fabrknt Off-Chain Compliance** (`fabrknt-offchain-compliance`) is a QuickNode Marketplace add-on that exposes Complr's compliance engine as a managed service. Source lives in `packages/qn-addon/`.

### Endpoints

| Method | Path | Plans | Description |
|--------|------|-------|-------------|
| POST | `/v1/check` | Starter, Pro | Single transaction compliance check |
| POST | `/v1/check/batch` | Pro | Batch compliance check (up to 50) |
| POST | `/v1/query` | Starter, Pro | Regulatory query |
| POST | `/v1/report` | Pro | SAR/STR report generation |
| POST | `/v1/screen/wallet` | Pro | Wallet risk screening |
| POST | `/v1/screen/address` | Starter, Pro | Address sanctions screening |
| POST | `/v1/screen/batch` | Pro | Batch address screening (up to 100) |

### Plans

| Plan | Price | Rate Limit |
|------|-------|------------|
| **Starter** | Free | 50 req/min |
| **Pro** | $99/month | 200 req/min |

## License

Proprietary. All rights reserved.
