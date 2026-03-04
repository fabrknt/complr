#!/usr/bin/env node

/**
 * Complr Demo -- Runs through all key features with real LLM calls.
 *
 * Usage: ANTHROPIC_API_KEY=sk-ant-... npx tsx src/demo.ts
 */

import { Complr } from "./index.js";
import { SEED_REGULATIONS } from "./data/seed-regulations.js";
import type { TransactionDetails } from "./types.js";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("Error: ANTHROPIC_API_KEY is required");
  console.error("Run: ANTHROPIC_API_KEY=sk-ant-... npx tsx src/demo.ts");
  process.exit(1);
}

const complr = new Complr({ anthropicApiKey: apiKey });

// Load seed regulatory data
for (const doc of SEED_REGULATIONS) {
  complr.addDocument(doc);
}

function divider(title: string) {
  console.log("\n" + "=".repeat(70));
  console.log(`  ${title}`);
  console.log("=".repeat(70) + "\n");
}

async function main() {
  console.log("Complr - AI-Native Compliance Intelligence for Asia");
  console.log("====================================================");
  console.log(`Loaded ${complr.documentCount} regulatory documents\n`);

  // ──────────────────────────────────────────────────────────
  // DEMO 1: Regulatory Query
  // ──────────────────────────────────────────────────────────
  divider("DEMO 1: Regulatory Query -- Travel Rule Comparison");

  console.log("Question: What are the Travel Rule thresholds and requirements");
  console.log("          across Singapore, Hong Kong, and Japan?\n");

  const jurisdictions = ["MAS", "SFC", "FSA"] as const;
  for (const j of jurisdictions) {
    console.log(`--- ${j} ---`);
    const answer = await complr.query(
      "What is the Travel Rule threshold and what information must be transmitted for crypto transfers?",
      j
    );
    console.log(answer);
    console.log("");
  }

  // ──────────────────────────────────────────────────────────
  // DEMO 2: Transaction Compliance Check
  // ──────────────────────────────────────────────────────────
  divider("DEMO 2: Multi-Jurisdiction Transaction Compliance Check");

  const sampleTx: TransactionDetails = {
    transactionId: "tx_demo_001",
    timestamp: "2026-03-04T10:30:00Z",
    senderWallet: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    recipientWallet: "3Kz9bMiVYFhBEbJSiRvNaDEM8TM2qMYyHQfJwcQpzLr2",
    amount: "25000",
    currency: "USDC",
    chain: "solana",
    senderKycLevel: "standard",
    recipientKycLevel: "basic",
  };

  console.log("Transaction:");
  console.log(`  From:   ${sampleTx.senderWallet.slice(0, 8)}... (KYC: ${sampleTx.senderKycLevel})`);
  console.log(`  To:     ${sampleTx.recipientWallet.slice(0, 8)}... (KYC: ${sampleTx.recipientKycLevel})`);
  console.log(`  Amount: ${sampleTx.amount} ${sampleTx.currency}`);
  console.log(`  Chain:  ${sampleTx.chain}\n`);

  console.log("Checking compliance across MAS, SFC, FSA...\n");

  const result = await complr.checkTransaction(sampleTx);

  console.log(`Overall Status: ${statusIcon(result.overallStatus)} ${result.overallStatus.toUpperCase()}\n`);

  for (const jr of result.jurisdictions) {
    console.log(`  ${jr.jurisdiction}: ${statusIcon(jr.status)} ${jr.status}`);
    console.log(`    Travel Rule Required: ${jr.travelRuleRequired ? "YES" : "No"}`);
    console.log(`    Reporting Required:   ${jr.reportingRequired ? "YES" : "No"}`);
    if (jr.obligations.length > 0) {
      console.log(`    Obligations:`);
      jr.obligations.forEach((o) => console.log(`      - ${o}`));
    }
    if (jr.issues.length > 0) {
      console.log(`    Issues:`);
      jr.issues.forEach((i) => console.log(`      ! ${i}`));
    }
    console.log("");
  }

  if (result.actionItems.length > 0) {
    console.log("Action Items:");
    result.actionItems.forEach((a) => console.log(`  -> ${a}`));
    console.log("");
  }

  // ──────────────────────────────────────────────────────────
  // DEMO 3: SAR/STR Report Generation
  // ──────────────────────────────────────────────────────────
  divider("DEMO 3: SAR/STR Report Generation (FSA Japan Format)");

  const suspiciousTx: TransactionDetails = {
    transactionId: "tx_suspicious_002",
    timestamp: "2026-03-04T03:15:00Z",
    senderWallet: "9wFFyRfZBsuAha4YcuxcXLKwMxJR43S7fPfQLusDBzvT",
    recipientWallet: "HN7cABqLq46Es1jh92dQQisAi5YqBXMWUZbzPLGUoJqo",
    amount: "98500",
    currency: "USDC",
    chain: "solana",
    senderKycLevel: "basic",
    recipientKycLevel: "unknown",
  };

  const riskIndicators = [
    "Transaction just below 100,000 USDC threshold (possible structuring)",
    "Recipient wallet has no KYC verification",
    "Transaction executed at 3:15 AM local time (unusual hours)",
    "Sender account opened 48 hours ago with immediate large transfer",
    "Recipient wallet previously associated with mixer service",
  ];

  console.log("Suspicious Transaction:");
  console.log(`  Amount: ${suspiciousTx.amount} ${suspiciousTx.currency}`);
  console.log(`  Sender KYC: ${suspiciousTx.senderKycLevel}`);
  console.log(`  Recipient KYC: ${suspiciousTx.recipientKycLevel}\n`);
  console.log("Risk Indicators:");
  riskIndicators.forEach((r) => console.log(`  ! ${r}`));
  console.log("\nGenerating FSA Japan STR...\n");

  const report = await complr.generateReport(
    suspiciousTx,
    riskIndicators,
    "FSA"
  );

  console.log(`Report ID: ${report.id}`);
  console.log(`Format:    ${report.format}`);
  console.log(`Status:    ${report.status}`);
  console.log(`Generated: ${report.generatedAt}\n`);
  console.log("--- Suspicion Narrative ---");
  console.log(report.suspicionNarrative);
  console.log("\n--- Recommended Action ---");
  console.log(report.recommendedAction);

  // ──────────────────────────────────────────────────────────
  // DEMO 4: Obligation Extraction
  // ──────────────────────────────────────────────────────────
  divider("DEMO 4: Regulatory Obligation Extraction");

  const stablecoinDoc = SEED_REGULATIONS.find(
    (d) => d.id === "sfc_stablecoin_2025"
  );
  if (stablecoinDoc) {
    console.log(`Analyzing: ${stablecoinDoc.title}\n`);
    console.log("Extracting compliance obligations...\n");

    const obligations = await complr.analyzeDocument(stablecoinDoc);

    console.log(`Found ${obligations.length} obligations:\n`);
    for (const obl of obligations) {
      console.log(`  [${obl.obligationType}] ${obl.summary}`);
      if (obl.threshold) console.log(`    Threshold: ${obl.threshold}`);
      if (obl.penalties) console.log(`    Penalties: ${obl.penalties}`);
      if (obl.applicableTo?.length) {
        console.log(`    Applies to: ${obl.applicableTo.join(", ")}`);
      }
      if (obl.controlMapping?.length) {
        console.log(`    Controls: ${obl.controlMapping.join("; ")}`);
      }
      console.log("");
    }
  }

  // ──────────────────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────────────────
  divider("DEMO COMPLETE");
  console.log("Complr demonstrated:");
  console.log("  1. Multi-jurisdiction regulatory queries (MAS, SFC, FSA)");
  console.log("  2. Transaction compliance checks across 3 jurisdictions");
  console.log("  3. Auto-generated SAR/STR in regulator-specific format");
  console.log("  4. Obligation extraction from regulatory documents");
  console.log("\nNext: Load real regulatory text, onboard beta customers.");
}

function statusIcon(status: string): string {
  switch (status) {
    case "compliant":
      return "[OK]";
    case "requires_action":
      return "[!!]";
    case "blocked":
      return "[XX]";
    default:
      return "[??]";
  }
}

main().catch(console.error);
