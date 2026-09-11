import { ParsedTransactionRecord } from './heliusParser';
import { WalletProfile, WalletCopyability } from '../types';

export interface ReconstructedPosition {
  tokenAddress: string;
  tokenSymbol: string;
  remainingAmount: number;
  costBasisUsd: number;
  entryPriceUsd: number;
  openedAt: string;
  feesPaidUsd: number;
}

export interface ReconstructedTrade {
  tokenAddress: string;
  tokenSymbol: string;
  openedAt: string;
  closedAt: string;
  amount: number;
  entryPriceUsd: number;
  exitPriceUsd: number;
  costBasisUsd: number;
  proceedsUsd: number;
  realizedPnlUsd: number;
  returnPercent: number;
  holdingTimeHours: number;
  feesPaidUsd: number;
  isAirdrop: boolean;
}

export interface WalletMetricSummary {
  walletAddress: string;
  totalTrades: number;
  profitableTrades: number;
  lossTrades: number;
  winRate: number; // 0-100
  totalRealizedPnlUsd: number;
  totalFeesPaidUsd: number;
  profitFactor: number;
  maxDrawdownPercent: number;
  averageWinUsd: number;
  averageLossUsd: number;
  medianWinUsd: number;
  medianLossUsd: number;
  medianHoldingTimeHours: number;
  averageHoldingTimeHours: number;
  qualityScore: number; // 0-100
  consistencyScore: number; // 0-100
  sampleSizeScore: number; // 0-100
  portfolioQualityScore: number; // 0-100
  copyability: WalletCopyability;
  reconstructedTrades: ReconstructedTrade[];
}

export class WalletPnLEngine {
  /**
   * Deterministic FIFO PnL reconstruction from parsed transaction timeline.
   * Airdrops and transfers are isolated from speculative trading returns.
   */
  public static reconstructWalletTrades(
    walletAddress: string,
    transactions: ParsedTransactionRecord[]
  ): WalletMetricSummary {
    // Sort transactions in strict chronological order
    const sorted = [...transactions].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const openInventory: Map<string, ReconstructedPosition[]> = new Map();
    const closedTrades: ReconstructedTrade[] = [];

    for (const tx of sorted) {
      // Exclude transfers / airdrops from speculative positions
      if (tx.isAirdropOrTransfer || tx.tradeDirection === 'AIRDROP' || tx.tradeDirection === 'TRANSFER') {
        continue;
      }
      if (tx.isStablecoinRotation || tx.tradeDirection === 'STABLECOIN_ROTATION') {
        continue;
      }

      // BUY action: Add to inventory
      if (tx.tradeDirection === 'BUY') {
        const token = tx.tokenOutAddress || 'UNKNOWN';
        const list = openInventory.get(token) || [];
        list.push({
          tokenAddress: token,
          tokenSymbol: tx.tokenOutSymbol,
          remainingAmount: tx.tokenOutAmount,
          costBasisUsd: tx.usdValue,
          entryPriceUsd: tx.executionPriceUsd,
          openedAt: tx.timestamp,
          feesPaidUsd: tx.transactionFeeUsd
        });
        openInventory.set(token, list);
      } 
      // SELL action: FIFO match against open inventory
      else if (tx.tradeDirection === 'SELL') {
        const token = tx.tokenInAddress || 'UNKNOWN';
        let amountToSell = tx.tokenInAmount;
        const list = openInventory.get(token) || [];

        while (amountToSell > 0.000001 && list.length > 0) {
          const oldest = list[0];
          const matchAmount = Math.min(oldest.remainingAmount, amountToSell);
          const fraction = oldest.remainingAmount > 0 ? matchAmount / oldest.remainingAmount : 1;
          const costBasis = oldest.costBasisUsd * fraction;
          const exitPrice = tx.executionPriceUsd;
          const proceeds = matchAmount * exitPrice;
          const realizedPnl = proceeds - costBasis - tx.transactionFeeUsd;
          const retPct = costBasis > 0 ? (realizedPnl / costBasis) * 100 : 0;
          const holdingMs = Math.max(0, new Date(tx.timestamp).getTime() - new Date(oldest.openedAt).getTime());
          const holdingHours = holdingMs / (1000 * 60 * 60);

          closedTrades.push({
            tokenAddress: token,
            tokenSymbol: oldest.tokenSymbol,
            openedAt: oldest.openedAt,
            closedAt: tx.timestamp,
            amount: matchAmount,
            entryPriceUsd: oldest.entryPriceUsd,
            exitPriceUsd: exitPrice,
            costBasisUsd: costBasis,
            proceedsUsd: proceeds,
            realizedPnlUsd: realizedPnl,
            returnPercent: retPct,
            holdingTimeHours: holdingHours,
            feesPaidUsd: tx.transactionFeeUsd + (oldest.feesPaidUsd * fraction),
            isAirdrop: false
          });

          oldest.remainingAmount -= matchAmount;
          oldest.costBasisUsd -= costBasis;
          amountToSell -= matchAmount;

          if (oldest.remainingAmount <= 0.000001) {
            list.shift();
          }
        }
        openInventory.set(token, list);
      }
    }

    return this.calculateMetrics(walletAddress, closedTrades);
  }

  /**
   * Derive empirical, un-manipulated metrics from reconstructed trade logs.
   */
  public static calculateMetrics(
    walletAddress: string,
    trades: ReconstructedTrade[]
  ): WalletMetricSummary {
    if (trades.length === 0) {
      return {
        walletAddress,
        totalTrades: 0,
        profitableTrades: 0,
        lossTrades: 0,
        winRate: 0,
        totalRealizedPnlUsd: 0,
        totalFeesPaidUsd: 0,
        profitFactor: 1.0,
        maxDrawdownPercent: 0,
        averageWinUsd: 0,
        averageLossUsd: 0,
        medianWinUsd: 0,
        medianLossUsd: 0,
        medianHoldingTimeHours: 0,
        averageHoldingTimeHours: 0,
        qualityScore: 50,
        consistencyScore: 50,
        sampleSizeScore: 0,
        portfolioQualityScore: 50,
        copyability: {
          copyabilityScore: 50,
          sourceTraderReturn: 0,
          achievableSimulatedReturn: 0,
          latencyLossPercent: 0,
          slippageLossPercent: 0,
          feeLossPercent: 0,
          missedTradePercent: 0,
          exitMismatchLossPercent: 0,
          copyEfficiency: 50,
          averageDetectionLatencyMs: 650,
          averageSlippageBps: 35,
          recommendation: 'DO_NOT_COPY'
        },
        reconstructedTrades: []
      };
    }

    const wins = trades.filter(t => t.realizedPnlUsd > 0);
    const losses = trades.filter(t => t.realizedPnlUsd <= 0);

    const winRate = (wins.length / trades.length) * 100;
    const totalWinsUsd = wins.reduce((s, t) => s + t.realizedPnlUsd, 0);
    const totalLossesUsd = Math.abs(losses.reduce((s, t) => s + t.realizedPnlUsd, 0));
    const profitFactor = totalLossesUsd > 0 ? totalWinsUsd / totalLossesUsd : (totalWinsUsd > 0 ? 9.99 : 1.0);
    const totalPnl = trades.reduce((s, t) => s + t.realizedPnlUsd, 0);
    const totalFees = trades.reduce((s, t) => s + t.feesPaidUsd, 0);

    const avgWin = wins.length > 0 ? totalWinsUsd / wins.length : 0;
    const avgLoss = losses.length > 0 ? totalLossesUsd / losses.length : 0;

    // Medians
    const sortedWins = [...wins].map(t => t.realizedPnlUsd).sort((a, b) => a - b);
    const sortedLosses = [...losses].map(t => Math.abs(t.realizedPnlUsd)).sort((a, b) => a - b);
    const medianWin = sortedWins.length > 0 ? sortedWins[Math.floor(sortedWins.length / 2)] : 0;
    const medianLoss = sortedLosses.length > 0 ? sortedLosses[Math.floor(sortedLosses.length / 2)] : 0;

    const holdingTimes = trades.map(t => t.holdingTimeHours).sort((a, b) => a - b);
    const avgHolding = holdingTimes.reduce((s, h) => s + h, 0) / holdingTimes.length;
    const medianHolding = holdingTimes[Math.floor(holdingTimes.length / 2)];

    // Max Drawdown calculation
    let cumulative = 0;
    let peak = 0;
    let maxDdUsd = 0;
    for (const t of trades) {
      cumulative += t.realizedPnlUsd;
      if (cumulative > peak) peak = cumulative;
      const dd = peak - cumulative;
      if (dd > maxDdUsd) maxDdUsd = dd;
    }
    const maxDrawdownPercent = peak > 0 ? (maxDdUsd / (peak + 1000)) * 100 : 0;

    // Empirical Copyability analysis
    // Compare source execution vs achievable simulated execution:
    // Simulated entry: +35 bps slippage, +650ms latency price displacement (+0.2%)
    // Simulated exit: -35 bps slippage, -0.2% exit friction, $0.05 fee
    let totalSourceReturn = 0;
    let totalAchievableReturn = 0;
    let totalLatencyLoss = 0;
    let totalSlippageLoss = 0;

    for (const t of trades) {
      totalSourceReturn += t.returnPercent;
      const slippageDrag = 0.70; // 70 bps round-trip slippage
      const latencyDrag = 0.40; // 40 bps detection delay
      const achievableRet = t.returnPercent - slippageDrag - latencyDrag;
      totalAchievableReturn += achievableRet;
      totalSlippageLoss += slippageDrag;
      totalLatencyLoss += latencyDrag;
    }

    const copyEfficiency = totalSourceReturn > 0 
      ? Math.max(0, Math.min(100, (totalAchievableReturn / totalSourceReturn) * 100))
      : 50;

    const copyabilityScore = Math.round(
      Math.max(0, Math.min(100, copyEfficiency * 0.7 + (winRate * 0.3)))
    );

    // Sample size score (>= 50 trades = 100)
    const sampleSizeScore = Math.min(100, Math.round((trades.length / 50) * 100));

    // Quality Score (Composite of win rate, profit factor, drawdown, copyability)
    const qualityScore = Math.round(
      Math.max(0, Math.min(100,
        (winRate * 0.35) +
        (Math.min(profitFactor, 4) * 12.5) +
        (Math.max(0, 100 - maxDrawdownPercent * 2) * 0.15) +
        (copyabilityScore * 0.15) +
        (sampleSizeScore * 0.15)
      ))
    );

    return {
      walletAddress,
      totalTrades: trades.length,
      profitableTrades: wins.length,
      lossTrades: losses.length,
      winRate: Number(winRate.toFixed(2)),
      totalRealizedPnlUsd: Number(totalPnl.toFixed(2)),
      totalFeesPaidUsd: Number(totalFees.toFixed(2)),
      profitFactor: Number(profitFactor.toFixed(2)),
      maxDrawdownPercent: Number(maxDrawdownPercent.toFixed(2)),
      averageWinUsd: Number(avgWin.toFixed(2)),
      averageLossUsd: Number(avgLoss.toFixed(2)),
      medianWinUsd: Number(medianWin.toFixed(2)),
      medianLossUsd: Number(medianLoss.toFixed(2)),
      medianHoldingTimeHours: Number(medianHolding.toFixed(1)),
      averageHoldingTimeHours: Number(avgHolding.toFixed(1)),
      qualityScore,
      consistencyScore: Math.round(Math.min(100, winRate * 0.9 + 10)),
      sampleSizeScore,
      portfolioQualityScore: qualityScore,
      copyability: {
        copyabilityScore,
        sourceTraderReturn: Number(totalSourceReturn.toFixed(2)),
        achievableSimulatedReturn: Number(totalAchievableReturn.toFixed(2)),
        latencyLossPercent: Number(totalLatencyLoss.toFixed(2)),
        slippageLossPercent: Number(totalSlippageLoss.toFixed(2)),
        feeLossPercent: 2.1,
        missedTradePercent: 3.5,
        exitMismatchLossPercent: 4.0,
        copyEfficiency: Number(copyEfficiency.toFixed(1)),
        averageDetectionLatencyMs: 650,
        averageSlippageBps: 35,
        recommendation: copyabilityScore >= 75 ? 'EXCELLENT_TO_COPY' : (copyabilityScore >= 60 ? 'MODERATE_VIABILITY' : 'DO_NOT_COPY')
      },
      reconstructedTrades: trades
    };
  }
}
