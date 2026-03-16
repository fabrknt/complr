# @fabrknt/complr-core

[![npm version](https://img.shields.io/npm/v/@fabrknt/complr-core.svg)](https://www.npmjs.com/package/@fabrknt/complr-core)
[![npm downloads](https://img.shields.io/npm/dm/@fabrknt/complr-core.svg)](https://www.npmjs.com/package/@fabrknt/complr-core)

AI-powered compliance engine for digital assets -- regulatory intelligence, transaction screening, and SAR/STR reporting across MAS, SFC, and FSA jurisdictions.

Not every DeFi protocol needs TradFi compliance -- but if yours does, you shouldn't have to rebuild from scratch. Fabrknt plugs into your existing protocol with composable SDKs and APIs. No permissioned forks, no separate deployments.

## Install

```bash
npm install @fabrknt/complr-core
```

## Quick Start

```typescript
import { Complr } from "@fabrknt/complr-core";
import type { TransactionDetails, Jurisdiction } from "@fabrknt/complr-core";

const complr = new Complr({ anthropicApiKey: process.env.ANTHROPIC_API_KEY });

// Add regulatory documents to the knowledge base
complr.addDocument({ id: "mas-psa", jurisdiction: "MAS", title: "...", content: "..." });

// Query regulations in natural language
const answer = await complr.query("What is the Travel Rule threshold?", "MAS");

// Check transaction compliance across jurisdictions
const result = await complr.checkTransaction({
  transactionId: "tx_001",
  senderWallet: "0xabc...",
  recipientWallet: "0xdef...",
  amount: "10000",
  currency: "USDC",
});
```

## Features

- Multi-jurisdiction compliance checks (MAS, SFC, FSA) in a single call
- Natural language regulatory queries with TF-IDF semantic search
- Confidence scoring and citation verification to mitigate LLM hallucination
- SAR/STR report generation in regulator-specific formats
- Obligation extraction from regulatory documents
- Regulatory delta analysis between document versions
- Multi-chain wallet address support (EVM, Solana, Bitcoin) with auto-detection
- Zero external dependencies for search, scoring, and screening logic

## API

### Complr Class

- `new Complr({ anthropicApiKey, model?, port?, jurisdictions? })` -- create an instance
- `addDocument(doc)` -- add a regulatory document to the knowledge base
- `query(question, jurisdiction)` -- natural language regulatory query
- `queryWithConfidence(question, jurisdiction)` -- query with confidence scores and citations
- `checkTransaction(tx, jurisdictions?)` -- compliance check across jurisdictions
- `generateReport(tx, riskIndicators, jurisdiction)` -- generate SAR/STR report
- `analyzeDocument(doc)` -- extract structured obligations from a document
- `analyzeDelta(oldDoc, newDoc)` -- compare two regulation versions

### Re-exported Modules

- `RegulatoryKnowledgeBase` -- document store with TF-IDF semantic search
- `RegulatoryAnalyzer` -- LLM-powered regulatory analysis
- `PolicyEngine` -- multi-jurisdiction compliance engine
- `ReportGenerator` -- SAR/STR report generation
- `ConfidenceScorer` -- confidence scoring and hallucination detection
- `detectAddressFormat(address)` -- identify chain from address format

### Types

- `ComplrConfig` -- engine configuration
- `Jurisdiction` -- `"MAS" | "SFC" | "FSA"`
- `TransactionDetails` -- transaction input for compliance checks
- `ComplianceCheckResult` -- structured check result
- `SarReport` -- generated suspicious activity report
- `RegulatoryDocument`, `RegulatoryObligation` -- knowledge base types
- `RegulatoryQueryResult`, `ConfidenceFactor`, `Citation` -- confidence-scored query types
- `RegDelta` -- regulatory document diff
- `AddressFormat` -- detected address chain format

## Documentation

See the [Complr repository README](https://github.com/fabrknt/complr#readme) for full documentation, including server setup, admin dashboard, API endpoints, SDK integration, and deployment guides.

## Related Packages

| Package | Description |
|---------|-------------|
| `@fabrknt/complr-sdk` | Standalone SDK client with retry, batch checks, and webhook handler |
| `@fabrknt/complr-qn-addon` | QuickNode Marketplace add-on for managed compliance |

## License

MIT
