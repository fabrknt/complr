# Complr QuickNode Marketplace Add-on -- User Guide

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Authentication](#authentication)
4. [API Reference](#api-reference)
5. [Error Handling](#error-handling)
6. [Use Cases](#use-cases)

---

## Overview

Complr (powered by Fabrknt) is an off-chain compliance screening add-on for the QuickNode Marketplace. It provides AI-powered regulatory checks for cryptocurrency transactions across multiple chains and jurisdictions.

**Core capabilities:**

- **Transaction compliance checks** -- Screen individual or batch transactions against regulatory rules for specific jurisdictions.
- **Address and wallet screening** -- Check addresses against OFAC sanctions lists and assess wallet-level risk.
- **Regulatory queries** -- Ask natural-language questions about compliance rules in a given jurisdiction.
- **SAR/STR report generation** -- Produce Suspicious Activity Reports (SAR) and Suspicious Transaction Reports (STR) from transaction data and risk indicators.

**Supported chains:** Solana, Ethereum

**Supported jurisdictions:** MAS (Singapore), SFC (Hong Kong), FSA (Japan) on the Starter plan. Additional jurisdictions available on Pro.

---

## Getting Started

### Installation

1. Navigate to the [QuickNode Marketplace](https://www.quicknode.com/marketplace).
2. Search for **Fabrknt Off-Chain Compliance**.
3. Click **Add** and select a plan.
4. Attach the add-on to an existing endpoint or create a new one.

### Plans

| Feature | Starter (Free) | Pro ($99/mo) |
|---|---|---|
| Regulatory queries | Yes | Yes |
| Single transaction compliance check | Yes | Yes |
| Address screening (OFAC/sanctions) | Yes | Yes |
| Jurisdictions | MAS, SFC, FSA | All |
| Batch transaction checks (up to 50) | -- | Yes |
| Batch address screening (up to 100) | -- | Yes |
| Wallet risk screening | -- | Yes |
| SAR/STR report generation | -- | Yes |
| Webhook notifications | -- | Yes |
| Priority support | -- | Yes |
| Rate limit | 50 req/min | 200 req/min |

---

## Authentication

All API endpoints (under `/v1/`) require the `x-quicknode-id` header. This is the QuickNode ID assigned to your instance when the add-on is provisioned. QuickNode automatically includes this header when you make calls through your QuickNode endpoint.

```
x-quicknode-id: your-quicknode-id
```

If you are calling the Complr API directly (outside the QuickNode proxy), you must include this header yourself. Requests without a valid `x-quicknode-id` will receive a `400` or `404` error.

---

## API Reference

**Base URL:** Your QuickNode endpoint URL with the add-on enabled, or `https://complr.dev/api/{instance-id}` (returned during provisioning).

All endpoints accept and return `application/json`.

---

### POST /v1/check

Single transaction compliance check. Available on **Starter** and **Pro** plans.

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `transaction` | object | Yes | Transaction to check. Must include `from`, `to`, `amount`, `asset`. |
| `transaction.from` | string | Yes | Sender address. |
| `transaction.to` | string | Yes | Recipient address. |
| `transaction.amount` | number | Yes | Transaction amount. |
| `transaction.asset` | string | Yes | Asset identifier (e.g., `"SOL"`, `"ETH"`, `"USDC"`). |
| `jurisdictions` | string[] | No | Jurisdictions to check against. Defaults to `["MAS", "SFC", "FSA"]`. |

**Example:**

```bash
curl -X POST https://your-endpoint.quiknode.pro/v1/check \
  -H "Content-Type: application/json" \
  -H "x-quicknode-id: qn-abc-123" \
  -d '{
    "transaction": {
      "from": "0x1234...abcd",
      "to": "0x5678...ef01",
      "amount": 15000,
      "asset": "USDC"
    },
    "jurisdictions": ["MAS", "SFC"]
  }'
```

**Response (200):**

```json
{
  "compliant": false,
  "jurisdictions": {
    "MAS": {
      "compliant": false,
      "flags": ["THRESHOLD_EXCEEDED"],
      "details": "Transaction exceeds MAS reporting threshold of SGD 20,000."
    },
    "SFC": {
      "compliant": true,
      "flags": [],
      "details": null
    }
  },
  "riskScore": 72,
  "timestamp": "2026-03-07T12:00:00.000Z"
}
```

---

### POST /v1/check/batch

Batch transaction compliance check. **Pro plan only.** Maximum 50 transactions per request.

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `transactions` | object[] | Yes | Array of transaction objects (same schema as single check). |
| `jurisdictions` | string[] | No | Jurisdictions to check against. Defaults to `["MAS", "SFC", "FSA"]`. |

**Example:**

```bash
curl -X POST https://your-endpoint.quiknode.pro/v1/check/batch \
  -H "Content-Type: application/json" \
  -H "x-quicknode-id: qn-abc-123" \
  -d '{
    "transactions": [
      {
        "from": "0x1234...abcd",
        "to": "0x5678...ef01",
        "amount": 15000,
        "asset": "USDC"
      },
      {
        "from": "0xaaaa...bbbb",
        "to": "0xcccc...dddd",
        "amount": 500,
        "asset": "ETH"
      }
    ],
    "jurisdictions": ["MAS"]
  }'
```

**Response (200):**

```json
{
  "results": [
    {
      "compliant": false,
      "jurisdictions": { "MAS": { "compliant": false, "flags": ["THRESHOLD_EXCEEDED"], "details": "..." } },
      "riskScore": 72,
      "timestamp": "2026-03-07T12:00:00.000Z"
    },
    {
      "compliant": true,
      "jurisdictions": { "MAS": { "compliant": true, "flags": [], "details": null } },
      "riskScore": 12,
      "timestamp": "2026-03-07T12:00:00.000Z"
    }
  ],
  "count": 2
}
```

---

### POST /v1/query

Natural-language regulatory query. Available on **Starter** and **Pro** plans.

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `question` | string | Yes | The compliance question in plain language. |
| `jurisdiction` | string | Yes | Jurisdiction code (e.g., `"MAS"`, `"SFC"`, `"FSA"`). |

**Example:**

```bash
curl -X POST https://your-endpoint.quiknode.pro/v1/query \
  -H "Content-Type: application/json" \
  -H "x-quicknode-id: qn-abc-123" \
  -d '{
    "question": "What are the reporting thresholds for crypto transfers in Singapore?",
    "jurisdiction": "MAS"
  }'
```

**Response (200):**

```json
{
  "answer": "Under MAS Notice PSN02, payment service providers must file a suspicious transaction report (STR) for any transaction where there are reasonable grounds to suspect money laundering. Additionally, cross-border transfers of SGD 20,000 or more require reporting.",
  "sources": [
    "MAS Notice PSN02",
    "Payment Services Act 2019"
  ],
  "jurisdiction": "MAS",
  "timestamp": "2026-03-07T12:00:00.000Z"
}
```

---

### POST /v1/report

Generate a SAR (Suspicious Activity Report) or STR (Suspicious Transaction Report). **Pro plan only.**

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `transaction` | object | Yes | The suspicious transaction (same schema as `/v1/check`). |
| `riskIndicators` | string[] | Yes | List of risk indicators (e.g., `"SANCTIONS_MATCH"`, `"STRUCTURING"`, `"RAPID_MOVEMENT"`). |
| `jurisdiction` | string | Yes | Jurisdiction for the report format. |

**Example:**

```bash
curl -X POST https://your-endpoint.quiknode.pro/v1/report \
  -H "Content-Type: application/json" \
  -H "x-quicknode-id: qn-abc-123" \
  -d '{
    "transaction": {
      "from": "0x1234...abcd",
      "to": "0x5678...ef01",
      "amount": 50000,
      "asset": "USDC"
    },
    "riskIndicators": ["SANCTIONS_PROXIMITY", "RAPID_MOVEMENT"],
    "jurisdiction": "MAS"
  }'
```

**Response (200):**

```json
{
  "reportId": "rpt-a1b2c3d4",
  "type": "STR",
  "jurisdiction": "MAS",
  "narrative": "A transfer of 50,000 USDC was initiated from address 0x1234...abcd to address 0x5678...ef01. The recipient address is one hop removed from a sanctioned entity. Funds were moved within 15 minutes of deposit, consistent with rapid layering behavior.",
  "riskIndicators": ["SANCTIONS_PROXIMITY", "RAPID_MOVEMENT"],
  "riskScore": 89,
  "filingDeadline": "2026-03-22T00:00:00.000Z",
  "timestamp": "2026-03-07T12:00:00.000Z"
}
```

---

### POST /v1/screen/address

Screen a single address against OFAC and other sanctions lists. Available on **Starter** and **Pro** plans.

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `address` | string | Yes | The blockchain address to screen. |

**Example:**

```bash
curl -X POST https://your-endpoint.quiknode.pro/v1/screen/address \
  -H "Content-Type: application/json" \
  -H "x-quicknode-id: qn-abc-123" \
  -d '{
    "address": "0x1234...abcd"
  }'
```

**Response (200):**

```json
{
  "address": "0x1234...abcd",
  "sanctioned": false,
  "lists": [],
  "chainDetected": "ethereum",
  "timestamp": "2026-03-07T12:00:00.000Z"
}
```

If the address is sanctioned:

```json
{
  "address": "0xdead...beef",
  "sanctioned": true,
  "lists": ["OFAC-SDN"],
  "chainDetected": "ethereum",
  "timestamp": "2026-03-07T12:00:00.000Z"
}
```

---

### POST /v1/screen/batch

Batch address screening. **Pro plan only.** Maximum 100 addresses per request.

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `addresses` | string[] | Yes | Array of blockchain addresses to screen. |

**Example:**

```bash
curl -X POST https://your-endpoint.quiknode.pro/v1/screen/batch \
  -H "Content-Type: application/json" \
  -H "x-quicknode-id: qn-abc-123" \
  -d '{
    "addresses": [
      "0x1234...abcd",
      "0x5678...ef01",
      "So1ana...Address1"
    ]
  }'
```

**Response (200):**

```json
{
  "results": [
    { "address": "0x1234...abcd", "sanctioned": false, "lists": [], "chainDetected": "ethereum" },
    { "address": "0x5678...ef01", "sanctioned": false, "lists": [], "chainDetected": "ethereum" },
    { "address": "So1ana...Address1", "sanctioned": false, "lists": [], "chainDetected": "solana" }
  ],
  "count": 3
}
```

---

### POST /v1/screen/wallet

Full wallet risk screening (deeper analysis than address screening). **Pro plan only.**

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `address` | string | Yes | Wallet address to screen. |
| `chain` | string | No | Chain identifier (e.g., `"ethereum"`, `"solana"`). Auto-detected if omitted. |
| `jurisdiction` | string | No | Jurisdiction for jurisdiction-specific risk factors. |

**Example:**

```bash
curl -X POST https://your-endpoint.quiknode.pro/v1/screen/wallet \
  -H "Content-Type: application/json" \
  -H "x-quicknode-id: qn-abc-123" \
  -d '{
    "address": "0x1234...abcd",
    "chain": "ethereum",
    "jurisdiction": "MAS"
  }'
```

**Response (200):**

```json
{
  "address": "0x1234...abcd",
  "chain": "ethereum",
  "riskScore": 45,
  "riskLevel": "medium",
  "flags": ["MIXER_INTERACTION", "HIGH_VOLUME"],
  "sanctioned": false,
  "exposures": {
    "directSanctioned": 0,
    "indirectSanctioned": 2
  },
  "timestamp": "2026-03-07T12:00:00.000Z"
}
```

---

## Error Handling

All errors return a JSON body with an `error` field.

### HTTP Status Codes

| Code | Meaning | Common Cause |
|---|---|---|
| `400` | Bad Request | Missing required fields, missing `x-quicknode-id` header, array limit exceeded. |
| `403` | Forbidden | Attempting to use a Pro-only endpoint on a Starter plan. |
| `404` | Not Found | Invalid or inactive `x-quicknode-id`. The instance may have been deactivated or deprovisioned. |
| `429` | Too Many Requests | Rate limit exceeded. Starter: 50 req/min. Pro: 200 req/min. |
| `500` | Internal Server Error | Unexpected server error. |

### Error Response Format

Standard validation errors:

```json
{
  "error": "Missing required transaction fields: from, to, amount, asset"
}
```

Internal errors:

```json
{
  "error": {
    "message": "Internal Server Error",
    "code": "INTERNAL_ERROR"
  }
}
```

### Rate Limiting

Rate limits are enforced per instance (keyed by `x-quicknode-id`). Standard rate limit headers are included in every response:

- `RateLimit-Limit` -- Maximum requests allowed in the window.
- `RateLimit-Remaining` -- Requests remaining in the current window.
- `RateLimit-Reset` -- Seconds until the window resets.

When the rate limit is exceeded, the API returns:

```json
{
  "error": "Too many API requests, please try again later."
}
```

---

## Use Cases

### Sanctions Screening

Screen user addresses before allowing deposits or withdrawals. This is the most basic compliance check and is available on both plans.

```bash
# Screen a deposit address before crediting funds
curl -X POST https://your-endpoint.quiknode.pro/v1/screen/address \
  -H "Content-Type: application/json" \
  -H "x-quicknode-id: qn-abc-123" \
  -d '{"address": "0xdepositor..."}'
```

For high-throughput applications, use batch screening (Pro plan) to check multiple addresses in a single request instead of making individual calls.

### Transaction Monitoring

Check each transaction against regulatory rules before execution. Integrate the `/v1/check` endpoint into your transaction pipeline:

```bash
# Check a pending transaction before broadcasting
curl -X POST https://your-endpoint.quiknode.pro/v1/check \
  -H "Content-Type: application/json" \
  -H "x-quicknode-id: qn-abc-123" \
  -d '{
    "transaction": {
      "from": "0xuser...",
      "to": "0xrecipient...",
      "amount": 25000,
      "asset": "USDC"
    },
    "jurisdictions": ["MAS"]
  }'
```

If the response includes `"compliant": false`, block or flag the transaction. Use the `riskScore` field (0-100) to implement tiered review workflows: for example, auto-approve below 30, flag for manual review between 30 and 70, and block above 70.

### Regulatory Reporting

When a suspicious transaction is detected, generate a formatted SAR/STR for the relevant jurisdiction:

```bash
# Generate a SAR/STR after detecting suspicious activity
curl -X POST https://your-endpoint.quiknode.pro/v1/report \
  -H "Content-Type: application/json" \
  -H "x-quicknode-id: qn-abc-123" \
  -d '{
    "transaction": {
      "from": "0xsuspect...",
      "to": "0xdest...",
      "amount": 49999,
      "asset": "USDC"
    },
    "riskIndicators": ["STRUCTURING", "SANCTIONS_PROXIMITY"],
    "jurisdiction": "MAS"
  }'
```

The response includes a pre-drafted narrative, filing deadline, and structured data suitable for submission to the relevant financial intelligence unit.

### Regulatory Q&A for Development Teams

Use the `/v1/query` endpoint to get quick answers about compliance requirements during development, without needing to read through regulatory documents:

```bash
curl -X POST https://your-endpoint.quiknode.pro/v1/query \
  -H "Content-Type: application/json" \
  -H "x-quicknode-id: qn-abc-123" \
  -d '{
    "question": "Do I need a license to operate a crypto exchange in Hong Kong?",
    "jurisdiction": "SFC"
  }'
```

This is useful for product teams evaluating whether a feature requires compliance controls in a particular market.
