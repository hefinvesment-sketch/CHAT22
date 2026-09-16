import { WalletProfile, SystemSettings } from '../types';
import { HeliusTransactionParser, ParsedTransactionRecord } from './heliusParser';
import { StorageAdapter } from './persistence';


export class WalletDiscoveryService {
  /**
   * Discovers and evaluates Solana DEX wallets from real on-chain transaction blocks.
   * Currently acts as an observation layer only, without fabricating missing intelligence.
   */
  public static async discoverWalletsFromActivity(
    rawTransactions: unknown[],
    settings: SystemSettings,
    storage: StorageAdapter
  ): Promise<WalletProfile[]> {

    // 1. Extract unique active wallets from transactions
    const walletTxMap: Map<string, ParsedTransactionRecord[]> = new Map();
    for (const tx of rawTransactions) {
      const parsed = HeliusTransactionParser.parseTransaction(tx);
      if (parsed.walletAddress && parsed.walletAddress !== 'UNKNOWN_WALLET') {
        const list = walletTxMap.get(parsed.walletAddress) || [];
        list.push(parsed);
        walletTxMap.set(parsed.walletAddress, list);
      }
    }

    const discoveredProfiles: WalletProfile[] = [];

    // 2. Evaluate each wallet
    for (const [address, txList] of walletTxMap.entries()) {
      // Calculate actual unique mints traded
      const uniqueMints = new Set<string>();
      for (const t of txList) {
        if (t.tokenInAddress) uniqueMints.add(t.tokenInAddress);
        if (t.tokenOutAddress) uniqueMints.add(t.tokenOutAddress);
      }

      // Wallet is observed but eligibility for smart money is false until evidence is collected
      const isEligible = false;

      const profile: WalletProfile = {
        address,
        label: `Observed-Wallet-${address.slice(0, 4)}`,
        firstSeenDaysAgo: null,
        walletAgeDays: null,
        portfolioValueUsd: null,
        solBalance: null,
        usdtBalance: null,
        usdcBalance: null,
        wbtcBalance: null,
        wethBalance: null,
        coreAssetRatio: null,
        tradeCount: txList.length,
        tokensTradedCount: uniqueMints.size,
        realizedPnlUsd: 0, // Cannot be known without full history
        unrealizedPnlUsd: 0,
        winRate: 0,
        profitFactor: 0,
        maxDrawdownPercent: 0,
        avgHoldingTimeHours: 0,
        qualityScore: null,
        consistencyScore: 0,
        returnScore: 0,
        drawdownScore: 0,
        sampleScore: 0,
        concentrationPenalty: 0,
        top1TradeProfitPercent: null,
        top3TradeProfitPercent: null,
        top5TradeProfitPercent: null,
        top10TradeProfitPercent: null,
        emergingAlphaScore: null,
        momentumStatus: null,
        isEligibleSmartMoney: isEligible,
        clusterId: null,
        relatedWalletsCount: 0,
        genome: null,
        copyability: null,
        holdings: [],
        rollingScores: null
      };

      discoveredProfiles.push(profile);
      await storage.saveWallet(profile);
    }

    return discoveredProfiles;
  }
}
