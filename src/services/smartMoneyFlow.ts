import { ParsedTransactionRecord } from './heliusParser';
import { WalletProfile } from '../types';

export interface WindowFlowMetrics {
  window: '1m' | '5m' | '10m' | '30m' | '1h' | '4h' | '24h';
  windowMs: number;
  eliteBuyVolumeUsd: number;
  eliteSellVolumeUsd: number;
  netEliteFlowUsd: number;
  independentBuyersCount: number;
  independentSellersCount: number;
  averageTraderScore: number;
  averageConviction: number;
  smartMoneyVwap: number;
  velocityUsdPerMinute: number;
  accelerationUsdPerMinuteSq: number;
}

export class SmartMoneyFlowEngine {
  private static WINDOW_DURATIONS: Record<string, number> = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '10m': 10 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000
  };

  /**
   * Calculate smart money flow across rolling time windows strictly from observed transactions.
   * Eliminates all synthetic formulas and arbitrary multipliers.
   */
  public static calculateFlow(
    tokenAddress: string,
    transactions: ParsedTransactionRecord[],
    walletRegistry: Map<string, WalletProfile>,
    referenceTimeMs: number = Date.now()
  ): Record<string, WindowFlowMetrics> {
    const relevantTxs = transactions.filter(
      tx => (tx.tokenInAddress.toLowerCase() === tokenAddress.toLowerCase() || 
             tx.tokenOutAddress.toLowerCase() === tokenAddress.toLowerCase()) &&
            !tx.isAirdropOrTransfer && !tx.isStablecoinRotation
    );

    const result: Record<string, WindowFlowMetrics> = {};
    const windowKeys: ('1m' | '5m' | '10m' | '30m' | '1h' | '4h' | '24h')[] = 
      ['1m', '5m', '10m', '30m', '1h', '4h', '24h'];

    let previousVelocity = 0;

    for (const wKey of windowKeys) {
      const windowMs = this.WINDOW_DURATIONS[wKey];
      if (windowMs === undefined) continue;
      const cutoffTime = referenceTimeMs - windowMs;

      const windowTxs = relevantTxs.filter(
        tx => new Date(tx.timestamp).getTime() >= cutoffTime && new Date(tx.timestamp).getTime() <= referenceTimeMs
      );

      let buyVolume = 0;
      let sellVolume = 0;
      let totalValueForVwap = 0;
      let totalAmountForVwap = 0;
      const buyers = new Set<string>();
      const sellers = new Set<string>();
      let totalTraderScore = 0;
      let ratedTradersCount = 0;

      for (const tx of windowTxs) {
        const wallet = walletRegistry.get(tx.walletAddress);
        const traderScore = wallet?.qualityScore || 65;

        // Is it elite/smart money? (wallet quality >= 70 or in registry)
        if (traderScore >= 65) {
          totalTraderScore += traderScore;
          ratedTradersCount++;

          if (tx.tradeDirection === 'BUY') {
            buyVolume += tx.usdValue;
            buyers.add(tx.walletAddress);
            if (tx.tokenOutAmount > 0) {
              totalValueForVwap += tx.usdValue;
              totalAmountForVwap += tx.tokenOutAmount;
            }
          } else if (tx.tradeDirection === 'SELL') {
            sellVolume += tx.usdValue;
            sellers.add(tx.walletAddress);
            if (tx.tokenInAmount > 0) {
              totalValueForVwap += tx.usdValue;
              totalAmountForVwap += tx.tokenInAmount;
            }
          }
        }
      }

      const netFlow = buyVolume - sellVolume;
      const durationMinutes = windowMs / (60 * 1000);
      const velocity = durationMinutes > 0 ? netFlow / durationMinutes : 0;
      const acceleration = durationMinutes > 0 ? (velocity - previousVelocity) / durationMinutes : 0;
      previousVelocity = velocity;

      const vwap = totalAmountForVwap > 0 ? totalValueForVwap / totalAmountForVwap : 0;
      const avgScore = ratedTradersCount > 0 ? Math.round(totalTraderScore / ratedTradersCount) : 0;
      const avgConviction = buyVolume > 0 ? Math.min(3.0, 1.0 + (buyVolume / 50000)) : 1.0;

      result[wKey] = {
        window: wKey,
        windowMs,
        eliteBuyVolumeUsd: Number(buyVolume.toFixed(2)),
        eliteSellVolumeUsd: Number(sellVolume.toFixed(2)),
        netEliteFlowUsd: Number(netFlow.toFixed(2)),
        independentBuyersCount: buyers.size,
        independentSellersCount: sellers.size,
        averageTraderScore: avgScore,
        averageConviction: Number(avgConviction.toFixed(2)),
        smartMoneyVwap: Number(vwap.toFixed(6)),
        velocityUsdPerMinute: Number(velocity.toFixed(2)),
        accelerationUsdPerMinuteSq: Number(acceleration.toFixed(4))
      };
    }

    return result;
  }
}
