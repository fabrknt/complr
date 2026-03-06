/**
 * @complr/sdk — NestJS Integration Example
 *
 * Demonstrates wrapping ComplrClient as a NestJS injectable service
 * for server-side compliance checks. Use this pattern when your
 * backend uses NestJS (e.g. for repo management, token platforms).
 */
import { Injectable, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ComplrClient } from '@complr/sdk';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);
  private readonly client: ComplrClient;

  constructor(private readonly configService: ConfigService) {
    this.client = new ComplrClient({
      apiKey: this.configService.get<string>('COMPLR_API_KEY', ''),
    });
  }

  async screenWallet(address: string) {
    try {
      const result = await this.client.screenWallet(address, 'solana');
      const allowed =
        !result.sanctions &&
        result.riskLevel !== 'critical' &&
        result.riskLevel !== 'high';

      if (!allowed) {
        this.logger.warn(
          `Wallet ${address} blocked: risk=${result.riskLevel}, sanctions=${result.sanctions}`,
        );
      }

      return {
        allowed,
        riskLevel: result.riskLevel,
        sanctions: result.sanctions,
        flags: result.flags,
      };
    } catch (error) {
      this.logger.error(`Screening failed for ${address}:`, error);
      return { allowed: true, riskLevel: 'unknown', sanctions: false, flags: [] };
    }
  }

  async checkTransaction(params: {
    transactionId: string;
    senderWallet: string;
    recipientWallet: string;
    amount: string;
    currency: string;
  }) {
    try {
      const result = await this.client.checkTransaction({
        transactionId: params.transactionId,
        timestamp: new Date().toISOString(),
        senderWallet: params.senderWallet,
        recipientWallet: params.recipientWallet,
        amount: params.amount,
        currency: params.currency,
        chain: 'solana',
      });

      return {
        compliant: result.overallStatus === 'compliant',
        status: result.overallStatus,
        actionItems: result.actionItems,
      };
    } catch (error) {
      this.logger.error('Transaction check failed:', error);
      return { compliant: true, status: 'unknown', actionItems: [] };
    }
  }
}

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

@Module({
  imports: [ConfigModule],
  providers: [ComplianceService],
  exports: [ComplianceService],
})
export class ComplianceModule {}

// ---------------------------------------------------------------------------
// Usage in another module:
//
//   @Module({
//     imports: [ComplianceModule],
//   })
//   export class TransferModule {
//     constructor(private compliance: ComplianceService) {}
//
//     async beforeTransfer(wallet: string) {
//       const { allowed } = await this.compliance.screenWallet(wallet);
//       if (!allowed) throw new ForbiddenException('Wallet blocked');
//     }
//   }
// ---------------------------------------------------------------------------
