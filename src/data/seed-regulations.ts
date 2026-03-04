import type { RegulatoryDocument } from "../types.js";

/**
 * Seed regulatory data for the knowledge base.
 * These are summaries of key regulations -- in production, full text would be
 * scraped from official regulator websites.
 */
export const SEED_REGULATIONS: RegulatoryDocument[] = [
  // === MAS (Singapore) ===
  {
    id: "mas_psa_dpt_2025",
    jurisdiction: "MAS",
    title: "Payment Services Act - Digital Payment Token Services (2025 Amendments)",
    source: "https://www.mas.gov.sg/regulation/payments",
    publishedAt: "2025-04-01",
    language: "en",
    category: "licensing",
    content: `The Payment Services Act (PSA) regulates Digital Payment Token (DPT) services in Singapore. As amended in 2024-2025, regulated DPT activities include:

1. Dealing in DPTs (buying/selling crypto)
2. Facilitating the exchange of DPTs
3. Facilitating the transmission of DPTs between accounts
4. Provision of custodial services for DPTs
5. Facilitating cross-border money transfers using DPTs

License tiers:
- Standard Payment Institution (SPI): Min capital SGD 100,000. Monthly volume caps apply.
- Major Payment Institution (MPI): Min capital SGD 250,000. No transaction limits.

All DPT service providers must comply with AML/CFT requirements including:
- Customer due diligence (CDD)
- Enhanced due diligence for high-risk customers
- Transaction monitoring and suspicious transaction reporting
- Record-keeping (5 years minimum)
- Travel Rule compliance for transfers above S$1,500

New applications (from August 2024) must include:
- Legal opinion mapping business model to regulated payment services
- Independent external audit covering AML/CFT controls and consumer protection`,
  },
  {
    id: "mas_travel_rule_2025",
    jurisdiction: "MAS",
    title: "MAS Travel Rule Requirements for DPT Service Providers",
    source: "https://www.mas.gov.sg/regulation/notices",
    publishedAt: "2025-01-01",
    language: "en",
    category: "travel_rule",
    content: `Singapore Travel Rule requirements under the Payment Services Act:

Threshold: S$1,500 (approximately USD 1,100)

For transfers at or above S$1,500, DPT service providers must:

Originator information required:
- Full name
- Account number or unique transaction reference
- Either: address, national identity number, customer identification number, or date/place of birth

Beneficiary information required:
- Full name
- Account number or unique transaction reference

For transfers below S$1,500:
- Originator name and account number must be included
- Information need not be verified unless suspicion of money laundering

Cross-border considerations:
- Information must be transmitted immediately and securely
- Receiving institutions must verify information received
- Batch transfers: each transfer treated individually

Non-compliance penalties:
- Monetary penalties up to S$1 million
- Possible revocation of license`,
  },
  {
    id: "mas_tokenisation_guide_2025",
    jurisdiction: "MAS",
    title: "Guide on the Tokenisation of Capital Markets Products (Revised Nov 2025)",
    source: "https://www.mas.gov.sg/regulation/guidelines/guide-on-tokenisation-of-cmps",
    publishedAt: "2025-11-14",
    language: "en",
    category: "token_offering",
    content: `MAS adopts a technology-neutral approach: tokenising a capital markets product (CMP) does not alter its underlying legal and economic substance.

Key principles:
1. "Same activity, same risk, same regulatory outcome"
2. Tokenised CMPs continue to be regulated under SFA and FAA
3. The Guide covers the full tokenisation lifecycle: issuance, intermediation, trading, custody

Intermediary requirements:
- Facilitating dealing, trading, or advisory services in tokenised CMPs may require CMS licence or FA licence
- Requirements can apply extra-territorially if activities target persons in Singapore
- Operating platforms for secondary trading may constitute operating an organised market

Capital requirements for CMS licence:
- Dealing in Securities: SGD 250,000 (single activity) to SGD 1,000,000 (multiple)
- Fund Management (LFMC): SGD 250,000-1,000,000 depending on tier
- Fund Management (RFMC): SGD 250,000

Custody considerations:
- Entities providing custody of tokenised CMPs should evaluate whether activities constitute regulated custodial services
- MAS assessment focuses on nature of activities, not technological form`,
  },

  // === SFC (Hong Kong) ===
  {
    id: "sfc_aspire_2025",
    jurisdiction: "SFC",
    title: "ASPIRe Regulatory Roadmap for Virtual Assets (Feb 2025)",
    source: "https://www.sfc.hk/en/News-and-announcements/Policy-statements-and-announcements/A-S-P-I-Re",
    publishedAt: "2025-02-19",
    language: "en",
    category: "licensing",
    content: `The SFC's ASPIRe roadmap for Hong Kong's virtual asset market is built on five pillars:

A - Access: Expanding market access for institutional and retail participants
S - Safeguards: Strengthening investor protections
P - Products: Diversifying virtual asset product offerings
I - Infrastructure: Building robust market infrastructure
Re - Relationships: Fostering international collaboration

Key licensing requirements:
- Type 1 (Dealing in Securities): HKD 5M paid-up share capital + HKD 3M liquid capital
- Type 7 (Automated Trading Services): Same requirements as Type 1
- Type 9 (Asset Management): HKD 5M + HKD 3M liquid (HKD 100K if no custody)
- VATP License: HKD 5M + HKD 3M liquid + 12 months operating expenses

Responsible Officers: Minimum 2, must pass "fit and proper" test, at least 3 years experience

Key 2025 developments:
- 12-month track record requirement removed for professional investors
- HKMA-licensed stablecoins exempt from track record requirement
- VATPs can now integrate order books with global affiliate platforms
- 12 VATP licenses granted as of February 2026

Upcoming 2026:
- VA dealer and VA custodian licensing legislation
- VA dealers: HKD 5M paid-up share capital
- VA custodians: HKD 10M paid-up share capital`,
  },
  {
    id: "sfc_travel_rule_2025",
    jurisdiction: "SFC",
    title: "Hong Kong Travel Rule Requirements under AMLO",
    source: "https://www.sfc.hk",
    publishedAt: "2025-01-01",
    language: "en",
    category: "travel_rule",
    content: `Hong Kong Travel Rule requirements under the Anti-Money Laundering and Counter-Terrorist Financing Ordinance (AMLO):

Threshold: HK$8,000 (approximately USD 1,025)

For transfers at or above HK$8,000:
- Full originator and beneficiary information must be transmitted
- Information must be verified by the sending institution

For transfers below HK$8,000:
- Originator's name and account number required
- Verification not mandatory unless suspicion exists

Required originator information:
- Full name
- Account number
- Address, identification number, or date/place of birth
- Name of ordering institution

Required beneficiary information:
- Full name
- Account number

Obligations of receiving institutions:
- Must have effective procedures to detect incomplete information
- Must consider filing suspicious transaction report if information missing

Cross-border wire transfers:
- Same requirements apply
- Must be able to trace transactions end-to-end`,
  },
  {
    id: "sfc_stablecoin_2025",
    jurisdiction: "SFC",
    title: "Hong Kong Stablecoins Ordinance (Effective Aug 2025)",
    source: "https://www.hkma.gov.hk",
    publishedAt: "2025-08-01",
    language: "en",
    category: "stablecoin",
    content: `Hong Kong's Stablecoins Ordinance took effect August 1, 2025. Administered by the HKMA.

Scope: Fiat-referenced stablecoins (FRS) issued in HK, HKD-linked FRS issued anywhere, or FRS actively marketed to HK public.

Capital requirements:
- Paid-up share capital: HKD 25,000,000
- Liquid capital: HKD 3,000,000 minimum
- Excess liquid capital: At least 12 months of operating expenses

Reserve requirements:
- 100% backing at all times with high-quality, highly liquid assets
- Overcollateralization expected as buffer
- Reserve assets must be completely segregated from issuer's other assets
- Protected against all creditor claims

Redemption rights:
- Holders have absolute right to redeem at par value
- Processing within 1 business day

Governance:
- At least 1/3 independent non-executive directors
- Senior management based in Hong Kong
- CEO, directors, and stablecoin manager must pass fit and proper test

Penalties:
- Up to HKD 5 million fine + 7 years imprisonment for unlicensed activity
- HKD 100,000/day continuing penalty

Status: 77 expressions of interest received; first licenses expected early 2026; only a handful will be granted initially.`,
  },

  // === FSA (Japan) ===
  {
    id: "fsa_travel_rule_2023",
    jurisdiction: "FSA",
    title: "Japan Travel Rule (Effective June 2023) - JVCEA Implementation",
    source: "https://www.fsa.go.jp",
    publishedAt: "2023-06-01",
    language: "en",
    category: "travel_rule",
    content: `Japan implements the most stringent Travel Rule in the world:

Threshold: ZERO (all transactions, regardless of amount)

All Virtual Asset Service Providers (VASPs) registered with the FSA/JVCEA must transmit originator and beneficiary information for EVERY crypto asset transfer.

Required originator information:
- Full name (in Japanese characters for domestic)
- Address or date of birth
- Account number or wallet address
- Name of originating VASP

Required beneficiary information:
- Full name
- Account number or wallet address
- Name of beneficiary VASP

Implementation:
- All VASPs must be registered under the Payment Services Act
- JVCEA (Japan Virtual and Crypto Assets Exchange Association) oversees compliance
- Self-regulatory body sets detailed implementation standards

Unhosted wallet transfers:
- Must collect and verify customer identity before transfer
- Enhanced due diligence for transfers to/from unknown wallets
- No standardized approach -- each VASP implements own procedures

Travel Rule solution providers in Japan:
- Sygna Bridge (CoolBitX): Dominant, with MoUs across SBI VC Trade, Coincheck, Bitbank, DMM Bitcoin, BITPoint
- TRUST (Coinbase): Growing presence
- Notabene: Multi-protocol, expanding in Asia

Key challenge: "Sunrise problem" -- not all counterparty VASPs globally are Travel Rule-ready`,
  },
  {
    id: "fsa_crypto_tax_2026",
    jurisdiction: "FSA",
    title: "Japan 2026 Crypto Tax Reform Proposal",
    source: "https://www.fsa.go.jp",
    publishedAt: "2025-12-15",
    language: "en",
    category: "reporting",
    content: `Japan is planning a major crypto regulatory overhaul for 2026:

Current tax treatment:
- Crypto gains taxed as miscellaneous income at up to 55% (income tax + local tax)
- This is the highest crypto tax rate among major economies

Proposed 2026 reforms:
- Move to flat 20% capital gains tax (aligned with stock market treatment)
- Separate crypto-specific tax category
- This aligns with proposals from the ruling LDP and Komeito parties

Impact on institutional adoption:
- Current 55% rate effectively blocks institutional participation
- 20% rate would make Japan competitive with Singapore (0%), Hong Kong (0%), and other jurisdictions
- Could unlock massive institutional capital flows into tokenized assets
- NISA (tax-exempt investment accounts) expansion could include crypto-related products

Timeline:
- Tax reform bill expected in 2026 legislative session
- Implementation likely from April 2027 tax year
- Regulatory framework updates to FSA/JVCEA guidelines expected in parallel

Related developments:
- SBI planning spot Bitcoin ETF launch by mid-2026
- Progmat planning tokenized stocks (24/7 trading) in 2026
- Security token market: ~$4.7B issued (Progmat + BOOSTRY)`,
  },
];
