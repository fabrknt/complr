#!/usr/bin/env node

import * as readline from "node:readline";
import { Complr } from "./index.js";
import type { Jurisdiction, TransactionDetails } from "./types.js";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("Error: ANTHROPIC_API_KEY environment variable is required");
  console.error("Set it: export ANTHROPIC_API_KEY=sk-ant-...");
  process.exit(1);
}

const complr = new Complr({ anthropicApiKey: apiKey });

console.log("Complr - AI-Native Compliance Intelligence");
console.log("==========================================");
console.log("");
console.log("Commands:");
console.log("  query <jurisdiction> <question>  - Ask about regulations");
console.log("  check <json>                     - Check transaction compliance");
console.log("  report <jurisdiction> <json>      - Generate SAR/STR");
console.log("  help                             - Show this help");
console.log("  exit                             - Exit");
console.log("");
console.log("Jurisdictions: MAS (Singapore), SFC (Hong Kong), FSA (Japan)");
console.log("");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "complr> ",
});

rl.prompt();

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) {
    rl.prompt();
    return;
  }

  const [command, ...rest] = trimmed.split(" ");

  try {
    switch (command) {
      case "query": {
        const jurisdiction = rest[0]?.toUpperCase() as Jurisdiction;
        const question = rest.slice(1).join(" ");
        if (!jurisdiction || !question) {
          console.log("Usage: query <MAS|SFC|FSA> <question>");
          break;
        }
        if (!["MAS", "SFC", "FSA"].includes(jurisdiction)) {
          console.log("Invalid jurisdiction. Use MAS, SFC, or FSA.");
          break;
        }
        console.log(`\nQuerying ${jurisdiction} regulations...\n`);
        const answer = await complr.query(question, jurisdiction);
        console.log(answer);
        console.log("");
        break;
      }

      case "check": {
        const txJson = rest.join(" ");
        if (!txJson) {
          console.log("Usage: check <transaction JSON>");
          console.log(
            'Example: check {"transactionId":"tx1","timestamp":"2026-03-01","senderWallet":"ABC","recipientWallet":"DEF","amount":"10000","currency":"USDC","chain":"solana"}'
          );
          break;
        }
        const tx = JSON.parse(txJson) as TransactionDetails;
        console.log("\nChecking transaction across all jurisdictions...\n");
        const result = await complr.checkTransaction(tx);
        console.log(JSON.stringify(result, null, 2));
        console.log("");
        break;
      }

      case "report": {
        const jurisdiction = rest[0]?.toUpperCase() as Jurisdiction;
        const reportJson = rest.slice(1).join(" ");
        if (!jurisdiction || !reportJson) {
          console.log("Usage: report <MAS|SFC|FSA> <transaction JSON>");
          break;
        }
        const reportData = JSON.parse(reportJson) as {
          transaction: TransactionDetails;
          riskIndicators: string[];
        };
        console.log(`\nGenerating ${jurisdiction} SAR/STR...\n`);
        const report = await complr.generateReport(
          reportData.transaction,
          reportData.riskIndicators,
          jurisdiction
        );
        console.log(JSON.stringify(report, null, 2));
        console.log("");
        break;
      }

      case "help":
        console.log("Commands:");
        console.log("  query <jurisdiction> <question>  - Ask about regulations");
        console.log("  check <json>                     - Check transaction compliance");
        console.log("  report <jurisdiction> <json>      - Generate SAR/STR");
        console.log("  exit                             - Exit");
        break;

      case "exit":
      case "quit":
        console.log("Goodbye.");
        process.exit(0);

      default:
        // Treat as a general query if no command prefix
        console.log("\nQuerying across all jurisdictions...\n");
        const answer = await complr.query(trimmed, "MAS");
        console.log(answer);
        console.log("");
        break;
    }
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : String(err));
  }

  rl.prompt();
});

rl.on("close", () => {
  console.log("\nGoodbye.");
  process.exit(0);
});
