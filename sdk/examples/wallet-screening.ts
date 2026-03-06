/**
 * @complr/sdk — Wallet Screening Example
 *
 * Demonstrates sanctions/PEP screening before allowing on-chain
 * operations. This pattern is used across DeFi platforms to gate
 * deposits, transfers, and minting behind compliance checks.
 */
import { ComplrClient } from '@complr/sdk';

const client = new ComplrClient({
  apiKey: process.env.COMPLR_API_KEY || '',
});

/**
 * Screen a wallet and return a simple allow/deny decision.
 *
 * - Sanctions match → always block
 * - Risk level "critical" or "high" → block
 * - Otherwise → allow
 */
async function screenWallet(address: string): Promise<{
  allowed: boolean;
  riskLevel: string;
  sanctions: boolean;
  flags: string[];
}> {
  const result = await client.screenWallet(address, 'solana');
  return {
    allowed:
      !result.sanctions &&
      result.riskLevel !== 'critical' &&
      result.riskLevel !== 'high',
    riskLevel: result.riskLevel,
    sanctions: result.sanctions,
    flags: result.flags,
  };
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

async function main() {
  const wallet = 'So11111111111111111111111111111111111111112';

  const screening = await screenWallet(wallet);
  console.log('Screening result:', screening);

  if (!screening.allowed) {
    console.log('Wallet blocked:', screening.flags.join(', '));
    return;
  }

  console.log('Wallet cleared — proceeding with operation');
}

main().catch(console.error);
