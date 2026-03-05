import { config } from "../config";

// ---- Types ----

export type AddressFormat = "solana" | "ethereum" | "bitcoin" | null;

export type Jurisdiction = "MAS" | "SFC" | "FSA";

export interface TransactionInput {
  hash?: string;
  from: string;
  to: string;
  amount: string;
  asset: string;
  chain?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface ComplianceResult {
  jurisdiction: Jurisdiction;
  compliant: boolean;
  riskLevel: "low" | "medium" | "high" | "critical";
  flags: string[];
  recommendations: string[];
}

export interface TransactionCheckResult {
  transactionId: string;
  results: ComplianceResult[];
  checkedAt: string;
}

export interface WalletScreeningResult {
  address: string;
  addressFormat: AddressFormat;
  chain: string | null;
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  flags: string[];
  sanctions: boolean;
  screenedAt: string;
}

export interface RegulatoryQueryResult {
  question: string;
  jurisdiction: string;
  answer: string;
  sources: string[];
  disclaimer: string;
  queriedAt: string;
}

export interface SARReport {
  transactionId: string;
  jurisdiction: string;
  reportType: "SAR" | "STR";
  narrative: string;
  riskIndicators: string[];
  suggestedActions: string[];
  generatedAt: string;
}

export interface AddressScreeningResult {
  address: string;
  addressFormat: AddressFormat;
  sanctionsMatch: boolean;
  riskLevel: "low" | "medium" | "high" | "critical";
  details: string;
  screenedAt: string;
}

// ---- Address detection ----

export function detectAddressFormat(address: string): AddressFormat {
  if (!address || typeof address !== "string") return null;

  const trimmed = address.trim();

  // Ethereum: starts with 0x, 42 chars hex
  if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    return "ethereum";
  }

  // Bitcoin: starts with 1, 3, or bc1
  if (/^(1|3)[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(trimmed) || /^bc1[a-zA-HJ-NP-Z0-9]{25,90}$/.test(trimmed)) {
    return "bitcoin";
  }

  // Solana: base58, 32-44 chars
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) {
    return "solana";
  }

  return null;
}

// ---- Anthropic API helper ----

async function callAnthropic(systemPrompt: string, userMessage: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
  };

  const textBlock = data.content.find((c) => c.type === "text");
  if (!textBlock) {
    throw new Error("No text content in Anthropic response");
  }

  return textBlock.text;
}

function parseJSON<T>(raw: string): T {
  // Extract JSON from markdown code fences if present
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const toParse = jsonMatch ? jsonMatch[1].trim() : raw.trim();
  return JSON.parse(toParse) as T;
}

// ---- Service functions ----

export async function checkTransaction(
  transaction: TransactionInput,
  jurisdictions: Jurisdiction[]
): Promise<TransactionCheckResult> {
  const systemPrompt = `You are a cryptocurrency compliance analysis engine. Analyze transactions for regulatory compliance across specified jurisdictions (MAS = Monetary Authority of Singapore, SFC = Securities and Futures Commission of Hong Kong, FSA = Financial Services Agency of Japan). Return ONLY valid JSON, no other text.`;

  const userMessage = `Analyze this transaction for compliance across these jurisdictions: ${jurisdictions.join(", ")}

Transaction:
${JSON.stringify(transaction, null, 2)}

Return JSON in this exact format:
{
  "results": [
    {
      "jurisdiction": "<jurisdiction code>",
      "compliant": <boolean>,
      "riskLevel": "<low|medium|high|critical>",
      "flags": ["<flag descriptions>"],
      "recommendations": ["<recommendation descriptions>"]
    }
  ]
}`;

  const raw = await callAnthropic(systemPrompt, userMessage);
  const parsed = parseJSON<{ results: ComplianceResult[] }>(raw);

  return {
    transactionId: transaction.hash || `tx_${Date.now()}`,
    results: parsed.results,
    checkedAt: new Date().toISOString(),
  };
}

export async function screenWallet(
  address: string,
  chain?: string,
  jurisdiction?: string
): Promise<WalletScreeningResult> {
  const addressFormat = detectAddressFormat(address);
  const detectedChain = chain || (addressFormat === "ethereum" ? "ethereum" : addressFormat === "solana" ? "solana" : addressFormat === "bitcoin" ? "bitcoin" : "unknown");

  const systemPrompt = `You are a cryptocurrency wallet risk screening engine. Assess wallet addresses for risk indicators including sanctions exposure, mixing service usage, darknet market association, and other compliance concerns. Return ONLY valid JSON, no other text.`;

  const userMessage = `Screen this wallet address for risk:

Address: ${address}
Detected format: ${addressFormat || "unknown"}
Chain: ${detectedChain}
${jurisdiction ? `Jurisdiction context: ${jurisdiction}` : ""}

Return JSON in this exact format:
{
  "riskScore": <0-100>,
  "riskLevel": "<low|medium|high|critical>",
  "flags": ["<flag descriptions>"],
  "sanctions": <boolean>
}`;

  const raw = await callAnthropic(systemPrompt, userMessage);
  const parsed = parseJSON<{
    riskScore: number;
    riskLevel: "low" | "medium" | "high" | "critical";
    flags: string[];
    sanctions: boolean;
  }>(raw);

  return {
    address,
    addressFormat,
    chain: detectedChain,
    riskScore: parsed.riskScore,
    riskLevel: parsed.riskLevel,
    flags: parsed.flags,
    sanctions: parsed.sanctions,
    screenedAt: new Date().toISOString(),
  };
}

export async function queryRegulation(
  question: string,
  jurisdiction: string
): Promise<RegulatoryQueryResult> {
  const systemPrompt = `You are a cryptocurrency regulatory expert. Answer regulatory questions accurately with reference to specific regulations, guidelines, and compliance frameworks. Focus on the specified jurisdiction. Return ONLY valid JSON, no other text.`;

  const userMessage = `Answer this regulatory question for jurisdiction "${jurisdiction}":

${question}

Return JSON in this exact format:
{
  "answer": "<detailed answer>",
  "sources": ["<relevant regulation or guideline references>"]
}`;

  const raw = await callAnthropic(systemPrompt, userMessage);
  const parsed = parseJSON<{ answer: string; sources: string[] }>(raw);

  return {
    question,
    jurisdiction,
    answer: parsed.answer,
    sources: parsed.sources,
    disclaimer:
      "This response is generated by AI and should not be considered legal advice. Consult a qualified compliance professional for authoritative guidance.",
    queriedAt: new Date().toISOString(),
  };
}

export async function generateSar(
  transaction: TransactionInput,
  riskIndicators: string[],
  jurisdiction: string
): Promise<SARReport> {
  const reportType = jurisdiction === "MAS" || jurisdiction === "SFC" ? "STR" : "SAR";

  const systemPrompt = `You are a compliance reporting specialist. Generate ${reportType} (${reportType === "SAR" ? "Suspicious Activity Report" : "Suspicious Transaction Report"}) narratives for cryptocurrency transactions. Follow the reporting requirements for the specified jurisdiction. Return ONLY valid JSON, no other text.`;

  const userMessage = `Generate a ${reportType} for this transaction in jurisdiction "${jurisdiction}":

Transaction:
${JSON.stringify(transaction, null, 2)}

Risk indicators:
${riskIndicators.map((r) => `- ${r}`).join("\n")}

Return JSON in this exact format:
{
  "narrative": "<detailed SAR/STR narrative>",
  "suggestedActions": ["<recommended follow-up actions>"]
}`;

  const raw = await callAnthropic(systemPrompt, userMessage);
  const parsed = parseJSON<{ narrative: string; suggestedActions: string[] }>(raw);

  return {
    transactionId: transaction.hash || `tx_${Date.now()}`,
    jurisdiction,
    reportType,
    narrative: parsed.narrative,
    riskIndicators,
    suggestedActions: parsed.suggestedActions,
    generatedAt: new Date().toISOString(),
  };
}

export async function screenAddress(address: string): Promise<AddressScreeningResult> {
  const addressFormat = detectAddressFormat(address);

  const systemPrompt = `You are a sanctions and address screening engine for cryptocurrency addresses. Check the address against known sanctions lists (OFAC SDN, EU sanctions, UN sanctions). Return ONLY valid JSON, no other text.`;

  const userMessage = `Screen this cryptocurrency address against sanctions lists:

Address: ${address}
Detected format: ${addressFormat || "unknown"}

Return JSON in this exact format:
{
  "sanctionsMatch": <boolean>,
  "riskLevel": "<low|medium|high|critical>",
  "details": "<explanation of screening result>"
}`;

  const raw = await callAnthropic(systemPrompt, userMessage);
  const parsed = parseJSON<{
    sanctionsMatch: boolean;
    riskLevel: "low" | "medium" | "high" | "critical";
    details: string;
  }>(raw);

  return {
    address,
    addressFormat,
    sanctionsMatch: parsed.sanctionsMatch,
    riskLevel: parsed.riskLevel,
    details: parsed.details,
    screenedAt: new Date().toISOString(),
  };
}
