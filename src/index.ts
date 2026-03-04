import { RegulatoryKnowledgeBase } from "./regulatory/knowledge-base.js";
import { RegulatoryAnalyzer } from "./regulatory/analyzer.js";
import { PolicyEngine } from "./policy/engine.js";
import { ReportGenerator } from "./reports/generator.js";
import type {
  ComplrConfig,
  Jurisdiction,
  RegulatoryDocument,
  RegulatoryObligation,
  TransactionDetails,
  ComplianceCheckResult,
  SarReport,
  RegDelta,
  DEFAULT_CONFIG,
} from "./types.js";

export class Complr {
  private config: ComplrConfig;
  private knowledgeBase: RegulatoryKnowledgeBase;
  private analyzer: RegulatoryAnalyzer;
  private policyEngine: PolicyEngine;
  private reportGenerator: ReportGenerator;

  constructor(config: Pick<ComplrConfig, "anthropicApiKey"> & Partial<ComplrConfig>) {
    this.config = {
      anthropicApiKey: config.anthropicApiKey,
      model: config.model ?? "claude-sonnet-4-5-20250929",
      port: config.port ?? 3000,
      jurisdictions: config.jurisdictions ?? ["MAS", "SFC", "FSA"],
    };

    this.knowledgeBase = new RegulatoryKnowledgeBase();
    this.analyzer = new RegulatoryAnalyzer(
      this.config.anthropicApiKey,
      this.config.model
    );
    this.policyEngine = new PolicyEngine(
      this.config.anthropicApiKey,
      this.config.model,
      this.knowledgeBase
    );
    this.reportGenerator = new ReportGenerator(
      this.config.anthropicApiKey,
      this.config.model
    );
  }

  /** Add a regulatory document to the knowledge base */
  addDocument(doc: RegulatoryDocument): void {
    this.knowledgeBase.add(doc);
  }

  /** Number of documents in the knowledge base */
  get documentCount(): number {
    return this.knowledgeBase.size;
  }

  /** Query the regulatory knowledge base with natural language */
  async query(question: string, jurisdiction: Jurisdiction): Promise<string> {
    const docs = this.knowledgeBase.byJurisdiction(jurisdiction);
    return this.analyzer.query(question, jurisdiction, docs);
  }

  /** Extract obligations from a regulatory document */
  async analyzeDocument(
    doc: RegulatoryDocument
  ): Promise<RegulatoryObligation[]> {
    this.knowledgeBase.add(doc);
    return this.analyzer.extractObligations(doc);
  }

  /** Compare two versions of a regulation */
  async analyzeDelta(
    oldDoc: RegulatoryDocument,
    newDoc: RegulatoryDocument
  ): Promise<RegDelta> {
    return this.analyzer.analyzeDelta(oldDoc, newDoc);
  }

  /** Check transaction compliance across jurisdictions */
  async checkTransaction(
    tx: TransactionDetails,
    jurisdictions?: Jurisdiction[]
  ): Promise<ComplianceCheckResult> {
    return this.policyEngine.checkTransaction(
      tx,
      jurisdictions ?? this.config.jurisdictions
    );
  }

  /** Generate a SAR/STR report */
  async generateReport(
    tx: TransactionDetails,
    riskIndicators: string[],
    jurisdiction: Jurisdiction,
    additionalContext?: string
  ): Promise<SarReport> {
    return this.reportGenerator.generateSar(
      tx,
      riskIndicators,
      jurisdiction,
      additionalContext
    );
  }
}

// Re-export types
export type {
  ComplrConfig,
  Jurisdiction,
  RegulatoryDocument,
  RegulatoryObligation,
  TransactionDetails,
  ComplianceCheckResult,
  SarReport,
  RegDelta,
} from "./types.js";

export { RegulatoryKnowledgeBase } from "./regulatory/index.js";
export { RegulatoryAnalyzer } from "./regulatory/index.js";
export { PolicyEngine } from "./policy/index.js";
export { ReportGenerator } from "./reports/index.js";
