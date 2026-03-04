import type { InvestorProfile, Jurisdiction } from "../types.js";
import type { Complr } from "../index.js";
import { randomBytes } from "node:crypto";

/**
 * Investor registration and compliance screening.
 * Uses the existing Complr compliance engine for sanctions screening.
 */
export class InvestorCompliance {
  private investors = new Map<string, InvestorProfile>();
  private complr: Complr;

  constructor(complr: Complr) {
    this.complr = complr;
  }

  /** Register a new investor */
  register(data: {
    name: string;
    email: string;
    jurisdiction: Jurisdiction;
    accredited: boolean;
  }): InvestorProfile {
    const id = `inv_${randomBytes(8).toString("hex")}`;
    const investor: InvestorProfile = {
      id,
      name: data.name,
      email: data.email,
      jurisdiction: data.jurisdiction,
      accredited: data.accredited,
      kycStatus: "pending",
      sanctionsCleared: false,
      registeredAt: new Date().toISOString(),
    };

    this.investors.set(id, investor);
    return investor;
  }

  /** Run KYC and sanctions screening on an investor */
  async screen(id: string): Promise<InvestorProfile | { error: string }> {
    const investor = this.investors.get(id);
    if (!investor) return { error: "Investor not found" };

    // Use the compliance engine to check the investor's jurisdiction
    const question = `What are the KYC/AML requirements for an ${
      investor.accredited ? "accredited" : "retail"
    } investor in the ${investor.jurisdiction} jurisdiction for participating in tokenized yield products?`;

    try {
      await this.complr.query(question, investor.jurisdiction);
    } catch {
      // Non-blocking — screening continues even if query fails
    }

    // Simulate KYC/sanctions check using compliance engine
    const tx = {
      transactionId: `kyc_${id}`,
      timestamp: new Date().toISOString(),
      senderWallet: `investor_${id}`,
      recipientWallet: "vault_deposit",
      amount: "0",
      currency: "USDC",
      chain: "ethereum",
      senderKycLevel: investor.accredited ? "enhanced" : "standard",
      recipientKycLevel: "enhanced",
    };

    const complianceResult = await this.complr.checkTransaction(tx, [
      investor.jurisdiction,
    ]);

    // Update investor based on compliance result
    investor.screenedAt = new Date().toISOString();
    investor.sanctionsCleared = complianceResult.overallStatus !== "blocked";
    investor.kycStatus =
      complianceResult.overallStatus === "blocked"
        ? "rejected"
        : "approved";
    investor.riskRating =
      complianceResult.overallStatus === "compliant"
        ? "low"
        : complianceResult.overallStatus === "requires_action"
          ? "medium"
          : "high";

    return investor;
  }

  /** Get investor by ID */
  getById(id: string): InvestorProfile | undefined {
    return this.investors.get(id);
  }

  /** Check if investor is eligible for a vault */
  isEligible(
    investorId: string,
    accreditedOnly: boolean
  ): { eligible: boolean; reason?: string } {
    const investor = this.investors.get(investorId);
    if (!investor) return { eligible: false, reason: "Investor not found" };
    if (investor.kycStatus !== "approved")
      return { eligible: false, reason: "KYC not approved" };
    if (!investor.sanctionsCleared)
      return { eligible: false, reason: "Sanctions screening not cleared" };
    if (accreditedOnly && !investor.accredited)
      return { eligible: false, reason: "Accredited investor status required" };
    return { eligible: true };
  }

  /** Seed demo investors */
  seed(investors: Array<{
    name: string;
    email: string;
    jurisdiction: Jurisdiction;
    accredited: boolean;
  }>): InvestorProfile[] {
    return investors.map((data) => this.register(data));
  }

  /** List all investors */
  listAll(): InvestorProfile[] {
    return Array.from(this.investors.values());
  }
}
