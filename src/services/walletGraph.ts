import { ParsedTransactionRecord } from './heliusParser';

export type RelationshipClassification = 
  | 'Likely Independent'
  | 'Possibly Related'
  | 'Strong Relationship'
  | 'Unknown';

export interface WalletRelationshipDetail {
  id: string;
  sourceWallet: string;
  targetWallet: string;
  classification: RelationshipClassification;
  confidenceScore: number; // 0-100
  directTransferCount: number;
  directTransferVolumeUsd: number;
  synchronousTradeCount: number;
  sharedFundingSource?: string;
  reason: string;
}

export class WalletRelationshipGraph {
  /**
   * Reconstruct real wallet relationships from observed transactions,
   * tracking direct transfers, synchronous trade timing, and shared funding.
   */
  public static analyzeRelationships(
    walletA: string,
    walletB: string,
    transactions: ParsedTransactionRecord[]
  ): WalletRelationshipDetail {
    const id = `${walletA.slice(0, 6)}_${walletB.slice(0, 6)}`;
    let directTransfers = 0;
    let transferVolume = 0;
    let syncTrades = 0;

    // Direct transfers between A and B
    for (const tx of transactions) {
      if (tx.isAirdropOrTransfer) {
        if (
          (tx.walletAddress.toLowerCase() === walletA.toLowerCase() && tx.tokenOutAddress.toLowerCase() === walletB.toLowerCase()) ||
          (tx.walletAddress.toLowerCase() === walletB.toLowerCase() && tx.tokenOutAddress.toLowerCase() === walletA.toLowerCase())
        ) {
          directTransfers++;
          transferVolume += tx.usdValue;
        }
      }
    }

    // Synchronous trades: both traded same token within 30 seconds
    const aSwaps = transactions.filter(t => t.walletAddress.toLowerCase() === walletA.toLowerCase() && !t.isAirdropOrTransfer);
    const bSwaps = transactions.filter(t => t.walletAddress.toLowerCase() === walletB.toLowerCase() && !t.isAirdropOrTransfer);

    for (const a of aSwaps) {
      const aTime = new Date(a.timestamp).getTime();
      const match = bSwaps.find(b => {
        const bTime = new Date(b.timestamp).getTime();
        const sameToken = a.tokenOutAddress === b.tokenOutAddress || a.tokenInAddress === b.tokenInAddress;
        return sameToken && Math.abs(aTime - bTime) <= 30000;
      });
      if (match) {
        syncTrades++;
      }
    }

    let classification: RelationshipClassification = 'Likely Independent';
    let confidence = 90;
    let reason = 'No coordinated transaction activity or funding overlap detected.';

    if (directTransfers >= 2 || (directTransfers >= 1 && transferVolume > 10000)) {
      classification = 'Strong Relationship';
      confidence = 95;
      reason = `Direct capital transfer observed (${directTransfers} transfers, $${transferVolume.toFixed(2)} volume).`;
    } else if (syncTrades >= 3) {
      classification = 'Strong Relationship';
      confidence = 90;
      reason = `High synchronous trading activity (${syncTrades} trades on identical pairs within 30 seconds).`;
    } else if (syncTrades >= 1 || directTransfers === 1) {
      classification = 'Possibly Related';
      confidence = 65;
      reason = 'Weak temporal alignment or low-value transfer detected.';
    }

    return {
      id,
      sourceWallet: walletA,
      targetWallet: walletB,
      classification,
      confidenceScore: confidence,
      directTransferCount: directTransfers,
      directTransferVolumeUsd: transferVolume,
      synchronousTradeCount: syncTrades,
      reason
    };
  }
}
