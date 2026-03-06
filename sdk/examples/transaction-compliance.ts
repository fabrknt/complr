/**
 * @complr/sdk — Transaction Compliance Check Example
 *
 * Demonstrates checking a transaction against multi-jurisdiction
 * compliance rules before execution. Works for any chain supported
 * by complr (Solana, Ethereum, etc.).
 */
import { ComplrClient } from '@complr/sdk';

const client = new ComplrClient({
  apiKey: process.env.COMPLR_API_KEY || '',
});

/**
 * Check a transfer for compliance across applicable jurisdictions.
 * Returns a compliant/non-compliant decision with actionable items.
 */
async function checkTransferCompliance(params: {
  transactionId: string;
  senderWallet: string;
  recipientWallet: string;
  amount: string;
  currency: string;
  chain?: string;
}): Promise<{
  compliant: boolean;
  status: string;
  actionItems: string[];
}> {
  const result = await client.checkTransaction({
    transactionId: params.transactionId,
    timestamp: new Date().toISOString(),
    senderWallet: params.senderWallet,
    recipientWallet: params.recipientWallet,
    amount: params.amount,
    currency: params.currency,
    chain: params.chain ?? 'solana',
  });

  return {
    compliant: result.overallStatus === 'compliant',
    status: result.overallStatus,
    actionItems: result.actionItems,
  };
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

async function main() {
  const result = await checkTransferCompliance({
    transactionId: 'tx-2024-001',
    senderWallet: 'SenderWa11etAddress111111111111111111111111',
    recipientWallet: 'RecipientWa11etAddress1111111111111111111',
    amount: '10000',
    currency: 'USDC',
  });

  console.log('Compliance check:', result);

  if (!result.compliant) {
    console.log('Action items:', result.actionItems);
  }
}

main().catch(console.error);
