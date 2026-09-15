import { 
  AlphaSignal, 
  AlphaSignalFeatureBreakdown, 
  MarketRegime, 
  SignalState, 
  SystemSettings, 
  TraderGenome, 
  WalletProfile,
  FeatureEvidence
} from '../types';

/**
 * HEF AlphaGraph Quantitative Scoring & Research Engine
 */

export class AlphaEngine {

  /**
   * Helper to safely extract feature values.
   * In LIVE_PAPER mode, throws if the feature is synthetic.
   */
  public static extractFeatureValue(
    feature: FeatureEvidence | null, 
    appMode: string, 
    defaultValue: number | null = null
  ): number | null {
    if (!feature) return defaultValue;
    if (appMode === 'live_paper') {
      const forbiddenStatuses = [
        'DEMO', 'MOCK', 'FIXTURE', 'HARDCODED', 'SYNTHETIC_ESTIMATE', 'INSUFFICIENT_DATA'
      ];
      if (forbiddenStatuses.includes(feature.status)) {
        throw new Error(`SYNTHETIC_DATA_BLOCKED_IN_LIVE_MODE: feature has forbidden provenance ${feature.status}`);
      }
    }
    return feature.value !== null ? feature.value : defaultValue;
  }

  /**
   * Calculate Wallet Quality Score (0-100)
   * Formula:
   * 25% Consistency
   * 20% Realized Return
   * 15% Drawdown Quality
   * 15% Profit Factor
   * 10% Win Rate
   * 10% Sample Size
   * 5% Portfolio Quality
   * Minus penalties (Extreme concentration, small sample, etc.)
   */
  public static calculateWalletScore(
    consistency: number,
    realizedRoiScore: number,
    drawdownQuality: number,
    profitFactorScore: number,
    winRate: number,
    sampleSizeScore: number,
    portfolioQuality: number,
    top1TradeConcentrationPercent: number,
    top3TradeConcentrationPercent: number,
    tradeCount: number
  ): { score: number; concentrationPenalty: number; baseScore: number } {
    const baseScore = 
      (consistency * 0.25) +
      (realizedRoiScore * 0.20) +
      (drawdownQuality * 0.15) +
      (profitFactorScore * 0.15) +
      (winRate * 0.10) +
      (sampleSizeScore * 0.10) +
      (portfolioQuality * 0.05);

    // Severe concentration penalty if one trade accounted for majority of profit
    let concentrationPenalty = 0;
    if (top1TradeConcentrationPercent > 60) {
      concentrationPenalty += (top1TradeConcentrationPercent - 50) * 0.8;
    }
    if (top3TradeConcentrationPercent > 80) {
      concentrationPenalty += (top3TradeConcentrationPercent - 75) * 0.6;
    }
    if (tradeCount < 50) {
      concentrationPenalty += 15; // Small sample size penalty
    }

    const finalScore = Math.max(0, Math.min(100, Math.round(baseScore - concentrationPenalty)));

    return {
      score: finalScore,
      concentrationPenalty: Math.round(concentrationPenalty),
      baseScore: Math.round(baseScore)
    };
  }

  /**
   * Calculate Conviction Surprise
   * Compares current trade allocation against wallet's historical trade sizes.
   */
  public static calculateConvictionSurprise(
    tradeUsd: number,
    liquidPortfolioUsd: number,
    medianHistoricalAllocationPercent: number
  ): {
    allocationPercent: number;
    multiplierVsMedian: number;
    convictionSurpriseScore: number;
  } {
    const allocationPercent = (tradeUsd / Math.max(liquidPortfolioUsd, 1)) * 100;
    const median = Math.max(medianHistoricalAllocationPercent, 0.2);
    const multiplier = Number((allocationPercent / median).toFixed(2));

    // Map multiplier into 0-100 score
    // 1x = 50, 2x = 75, 4x = 90, 6x+ = 98+
    let score = 50;
    if (multiplier >= 1) {
      score = Math.min(99, Math.round(50 + Math.log2(multiplier + 0.1) * 22));
    } else {
      score = Math.max(10, Math.round(50 * multiplier));
    }

    return {
      allocationPercent: Number(allocationPercent.toFixed(2)),
      multiplierVsMedian: multiplier,
      convictionSurpriseScore: score
    };
  }

  /**
   * Calculate Independent Consensus Score (0-100)
   * Ensures related wallets/clusters are NOT counted as independent confirmations!
   */
  public static calculateIndependentConsensus(
    participatingWallets: { qualityScore: number; isIndependent: boolean; clusterId?: string }[]
  ): {
    independentCount: number;
    independentConsensusScore: number;
  } {
    const distinctClusters = new Set<string>();
    let independentWallets = 0;
    let qualitySum = 0;

    for (const w of participatingWallets) {
      if (w.isIndependent) {
        independentWallets++;
        qualitySum += w.qualityScore;
      } else if (w.clusterId && !distinctClusters.has(w.clusterId)) {
        distinctClusters.add(w.clusterId);
        independentWallets++; // only 1 per cluster counts
        qualitySum += w.qualityScore;
      }
    }

    const avgQuality = independentWallets > 0 ? qualitySum / independentWallets : 0;

    // 1 wallet = ~35, 2 wallets = ~60, 3 wallets = ~78, 4 wallets = ~88, 5+ wallets = ~96
    let score = 0;
    if (independentWallets >= 5) score = 96;
    else if (independentWallets === 4) score = 88;
    else if (independentWallets === 3) score = 78;
    else if (independentWallets === 2) score = 62;
    else if (independentWallets === 1) score = 38;
    else score = 10;

    // Modulate with average trader quality
    const weightedScore = Math.round((score * 0.7) + (avgQuality * 0.3));

    return {
      independentCount: independentWallets,
      independentConsensusScore: Math.min(100, weightedScore)
    };
  }

  /**
   * Calculate Net Expected Value
   * EV = (P(Win) * AvgWinner) - (P(Loss) * AvgLoser) - (Fees + Slippage + LatencyCost)
   */
  public static calculateExpectedValue(
    winRatePercent: number,
    avgWinnerPercent: number,
    avgLoserPercent: number,
    estimatedFeesPercent: number = 0.5,
    estimatedSlippagePercent: number = 0.6,
    latencyCostPercent: number = 0.4
  ): {
    grossEvPercent: number;
    executionCostPercent: number;
    netEvPercent: number;
  } {
    const pWin = winRatePercent / 100;
    const pLoss = 1 - pWin;
    const grossEv = (pWin * avgWinnerPercent) - (pLoss * Math.abs(avgLoserPercent));
    const executionCost = estimatedFeesPercent + estimatedSlippagePercent + latencyCostPercent;
    const netEv = Number((grossEv - executionCost).toFixed(2));

    return {
      grossEvPercent: Number(grossEv.toFixed(2)),
      executionCostPercent: Number(executionCost.toFixed(2)),
      netEvPercent: netEv
    };
  }

  /**
   * Calculate Alpha Score (0-100)
   * Initial Weights:
   * 18% Trader Skill
   * 15% Copyability
   * 15% Independent Consensus
   * 12% Conviction Surprise
   * 10% Smart-Money Acceleration
   * 10% Entry Quality
   * 8% Liquidity / Token Quality
   * 7% Market-Regime Fit
   * 5% Emerging-Trader Signal
   * Minus penalties: Crowding, related wallets, high slippage, trader deterioration, etc.
   */
  public static computeAlphaScore(
    features: AlphaSignalFeatureBreakdown,
    appMode: string,
    settings?: SystemSettings
  ): {
    alphaScore: number | null;
    signalState: SignalState;
    dataStatus: 'COMPLETE' | 'PARTIAL' | 'INSUFFICIENT_DATA';
  } {
    const w = settings?.alphaWeights || {
      traderSkill: 0.18,
      copyability: 0.15,
      independentConsensus: 0.15,
      convictionSurprise: 0.12,
      smartMoneyAcceleration: 0.10,
      entryQuality: 0.10,
      liquidityTokenQuality: 0.08,
      marketRegimeFit: 0.07,
      emergingTrader: 0.05
    };

    try {
      const traderSkillScore = this.extractFeatureValue(features.traderSkillScore, appMode);
      const copyabilityScore = this.extractFeatureValue(features.copyabilityScore, appMode);
      const independentConsensusScore = this.extractFeatureValue(features.independentConsensusScore, appMode);
      const convictionSurpriseScore = this.extractFeatureValue(features.convictionSurpriseScore, appMode);
      const smartMoneyAccelerationScore = this.extractFeatureValue(features.smartMoneyAccelerationScore, appMode);
      const entryQualityScore = this.extractFeatureValue(features.entryQualityScore, appMode);
      const liquidityTokenQualityScore = this.extractFeatureValue(features.liquidityTokenQualityScore, appMode);
      const regimeFitScore = this.extractFeatureValue(features.regimeFitScore, appMode);
      const emergingTraderScore = this.extractFeatureValue(features.emergingTraderScore, appMode);

      const allMandatoryFeatures = [
        traderSkillScore, copyabilityScore, independentConsensusScore,
        convictionSurpriseScore, smartMoneyAccelerationScore, entryQualityScore,
        liquidityTokenQualityScore, regimeFitScore, emergingTraderScore
      ];

      if (allMandatoryFeatures.some(f => f === null)) {
        return {
          alphaScore: null,
          signalState: 'INSUFFICIENT DATA' as any, // Mapped to WATCH or similar upstream if necessary, but 'INSUFFICIENT DATA' conveys intent
          dataStatus: 'INSUFFICIENT_DATA'
        };
      }

      const rawScore = 
        (traderSkillScore! * w.traderSkill) +
        (copyabilityScore! * w.copyability) +
        (independentConsensusScore! * w.independentConsensus) +
        (convictionSurpriseScore! * w.convictionSurprise) +
        (smartMoneyAccelerationScore! * w.smartMoneyAcceleration) +
        (entryQualityScore! * w.entryQuality) +
        (liquidityTokenQualityScore! * w.liquidityTokenQuality) +
        (regimeFitScore! * w.marketRegimeFit) +
        (emergingTraderScore! * w.emergingTrader);

      const totalPenalties = 
        features.penalties.crowdingPenalty +
        features.penalties.relatedWalletsPenalty +
        features.penalties.poorLiquidityPenalty +
        features.penalties.pricePumpedPenalty +
        features.penalties.suspiciousTokenStructurePenalty +
        features.penalties.highSlippagePenalty +
        features.penalties.traderDeteriorationPenalty +
        features.penalties.insufficientSamplePenalty +
        features.penalties.profitConcentrationPenalty;

      const finalAlpha = Math.max(0, Math.min(100, Math.round(rawScore - totalPenalties)));

      // Signal States
      let signalState: SignalState = 'IGNORE';
      if (finalAlpha >= 92) {
        signalState = 'HIGH-CONVICTION PAPER TRADE';
      } else if (finalAlpha >= 85) {
        signalState = 'PAPER TRADE ELIGIBLE';
      } else if (finalAlpha >= 75) {
        signalState = 'STRONG RESEARCH SIGNAL';
      } else if (finalAlpha >= 60) {
        signalState = 'WATCH';
      } else {
        signalState = 'IGNORE';
      }

      return {
        alphaScore: finalAlpha,
        signalState,
        dataStatus: 'COMPLETE'
      };
    } catch (err: any) {
      if (err.message.includes('SYNTHETIC_DATA_BLOCKED_IN_LIVE_MODE')) {
        return {
          alphaScore: null,
          signalState: 'WATCH',
          dataStatus: 'INSUFFICIENT_DATA'
        };
      }
      throw err;
    }
  }
}
