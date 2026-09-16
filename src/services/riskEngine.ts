import { AlphaSignal, SystemSettings, PaperPortfolio, PaperPosition, FeatureEvidence } from '../types';

export interface RiskEvaluationResult {
  passed: boolean;
  code: string;
  reason: string;
}

export class RiskEngine {
  private static validateFeatureEvidence(evidence: FeatureEvidence<number> | null, featureName: string): boolean {
    if (!evidence) return false;
    if (evidence.value == null) return false;
    if (evidence.status !== 'OBSERVED' && evidence.status !== 'DERIVED') {
      if (evidence.status === 'MODELED_EXECUTION') {
        return ['copyabilityScore', 'entryQualityScore', 'convictionSurpriseScore'].includes(featureName);
      }
      return false;
    }
    return true;
  }

  public static evaluateTrade(
    signal: AlphaSignal,
    portfolio: PaperPortfolio,
    openPositions: PaperPosition[],
    settings: SystemSettings
  ): RiskEvaluationResult {
    // Phase 6: Kill Switches
    if (process.env.LIVE_PAPER_EXECUTION_ENABLED !== 'true') {
      return {
        passed: false,
        code: 'EXECUTION_DISABLED_PENDING_DATA_VALIDATION',
        reason: 'Live paper execution disabled pending validated research evidence.'
      };
    }

    if (signal.liquidityUsd == null) {
      return {
        passed: false,
        code: 'LIQUIDITY_UNAVAILABLE',
        reason: 'Liquidity USD is null.'
      };
    }

    if (!signal.executionSimulation?.estimatedSlippagePercent) {
      return {
        passed: false,
        code: 'EXECUTION_QUOTE_REQUIRED',
        reason: 'Execution quote (slippage/price) is required.'
      };
    }

    if (signal.independentEliteCount == null) {
      return { passed: false, code: 'CONSENSUS_UNAVAILABLE', reason: 'Independent elite consensus count is null.' };
    }

    if (signal.priceDisplacementFromVwapPercent == null) {
      return { passed: false, code: 'PRICE_DISPLACEMENT_UNAVAILABLE', reason: 'Price displacement from VWAP is null.' };
    }

    if ((signal.historicalExpectancy.dataStatus !== 'VALID_SAMPLE' || 
        signal.historicalExpectancy.similarEventsCount < (Number(process.env.MIN_HISTORICAL_EXPECTANCY_SAMPLE) || 30) || 
        signal.historicalExpectancy.netEvPercent == null)) {
      return { passed: false, code: 'HISTORICAL_EXPECTANCY_UNAVAILABLE', reason: 'Historical expectancy is missing or sample is insufficient.' };
    }

    if (signal.participantWallets.some(w => w.qualityScore == null)) {
      return { passed: false, code: 'WALLET_QUALITY_UNAVAILABLE', reason: 'One or more participant wallets are missing a quality score.' };
    }

    if (!this.validateFeatureEvidence(signal.features.copyabilityScore, 'copyabilityScore')) {
      return { passed: false, code: 'COPYABILITY_UNAVAILABLE', reason: 'Copyability score is unavailable or invalid.' };
    }

    // 1. Alpha Score Minimum Check
    const minAlpha = settings.minExecutionAlphaScore ?? 75;
    if (!signal.alphaScore || signal.alphaScore < minAlpha) {
      return {
        passed: false,
        code: 'MIN_ALPHA_SCORE',
        reason: `Alpha score (${signal.alphaScore}) is below required minimum (${minAlpha}).`
      };
    }

    // 2. Minimum Win Rate Check
    const minWinRate = 60.0;
    if (signal.historicalExpectancy.winRatePercent == null || signal.historicalExpectancy.winRatePercent < minWinRate) {
      return {
        passed: false,
        code: 'MIN_WIN_RATE',
        reason: `Signal win rate (${signal.historicalExpectancy.winRatePercent}%) is below required minimum (${minWinRate}%).`
      };
    }

    // 3. Minimum Profit Factor Check
    const minProfitFactor = 1.5;
    const pf = Math.abs((signal.historicalExpectancy.averageWinnerPercent || 0) / (signal.historicalExpectancy.averageLoserPercent || -1));
    if (pf < minProfitFactor) {
      return {
        passed: false,
        code: 'MIN_PROFIT_FACTOR',
        reason: `Calculated Profit Factor (${pf.toFixed(2)}) is below required minimum (${minProfitFactor}).`
      };
    }

    // 4. Positive Net EV Check
    if (signal.historicalExpectancy.netEvPercent <= 0) {
      return {
        passed: false,
        code: 'NEGATIVE_NET_EV',
        reason: `Point-in-time Net Expected Value (${signal.historicalExpectancy.netEvPercent.toFixed(2)}%) is not positive after friction.`
      };
    }

    // 5. Minimum Absolute Liquidity Check in USD
    const minLiquidityUsd = settings.minTokenLiquidityUsd ?? 2000000;
    if (signal.liquidityUsd < minLiquidityUsd) {
      return {
        passed: false,
        code: 'MIN_LIQUIDITY_USD',
        reason: `Actual token liquidity ($${(signal.liquidityUsd / 1e6).toFixed(2)}M) is below required minimum ($${(minLiquidityUsd / 1e6).toFixed(2)}M).`
      };
    }

    if (!this.validateFeatureEvidence(signal.features.liquidityTokenQualityScore, 'liquidityTokenQualityScore')) {
      return { passed: false, code: 'LIQUIDITY_UNAVAILABLE', reason: 'Liquidity score is invalid or missing.' };
    }
    const liqScore = signal.features.liquidityTokenQualityScore?.value || 0;
    if (liqScore < 60) {
      return {
        passed: false,
        code: 'MIN_LIQUIDITY',
        reason: `Token pool liquidity score (${liqScore}) fails safety threshold.`
      };
    }

    // 6. Max Allowed Slippage
    const maxSlippage = settings.maxAllowedSlippagePercent ?? 0.01;
    const estSlippage = signal.executionSimulation.estimatedSlippagePercent;
    if (estSlippage > maxSlippage) {
      return {
        passed: false,
        code: 'MAX_ALLOWED_SLIPPAGE',
        reason: `Simulated pool slippage (${(estSlippage * 100).toFixed(2)}%) exceeds maximum allowed threshold (${(maxSlippage * 100).toFixed(2)}%).`
      };
    }

    // 7. Max Price Displacement from Smart-Money VWAP
    const maxDisplacement = 2.5;
    if (signal.priceDisplacementFromVwapPercent > maxDisplacement) {
      return {
        passed: false,
        code: 'MAX_PRICE_DISPLACEMENT',
        reason: `Price is chasing: current price is +${signal.priceDisplacementFromVwapPercent.toFixed(2)}% above VWAP.`
      };
    }

    // 8. Max Open Positions
    const maxPositions = settings.maxOpenPositions ?? 10;
    if (openPositions.length >= maxPositions) {
      return {
        passed: false,
        code: 'MAX_OPEN_POSITIONS',
        reason: `Portfolio already holds ${openPositions.length} open positions (maximum allowed: ${maxPositions}).`
      };
    }

    // 9. Duplicate Token Exposure
    const existingPosition = openPositions.find(
      p => p.tokenAddress.toLowerCase() === signal.tokenAddress.toLowerCase() ||
            p.tokenSymbol.toUpperCase() === signal.tokenSymbol.toUpperCase()
    );
    if (existingPosition) {
      return {
        passed: false,
        code: 'DUPLICATE_TOKEN_EXPOSURE',
        reason: `Portfolio already holds active exposure to ${signal.tokenSymbol} (${existingPosition.id}).`
      };
    }

    // 10. Maximum Token Exposure Check
    const maxTokenExposurePercent = settings.maxTokenExposurePercent ?? 5.0;
    const proposedPositionUsd = signal.executionSimulation.recommendedPositionUsd ?? 
       (portfolio.totalEquityUsd * ((settings.normalPositionPercent || 1.0) / 100));
    const tokenExposurePercent = (proposedPositionUsd / portfolio.totalEquityUsd) * 100;
    if (tokenExposurePercent > maxTokenExposurePercent) {
      return {
        passed: false,
        code: 'MAX_TOKEN_EXPOSURE',
        reason: `Proposed exposure (${tokenExposurePercent.toFixed(2)}%) exceeds max token limit (${maxTokenExposurePercent}%).`
      };
    }

    // 11. Maximum Total Deployed Capital Limit
    const currentDeployedUsd = openPositions.reduce((acc, p) => acc + p.costBasisUsd, 0);
    const maxTotalDeployedPercent = settings.maxTotalDeployedPercent ?? 40.0;
    const maxAllowedDeployedUsd = (portfolio.totalEquityUsd * maxTotalDeployedPercent) / 100;
    if (currentDeployedUsd + proposedPositionUsd > maxAllowedDeployedUsd) {
      return {
        passed: false,
        code: 'MAX_TOTAL_DEPLOYED',
        reason: `Trade would exceed maximum total deployed capital (${maxTotalDeployedPercent}% = $${maxAllowedDeployedUsd.toFixed(2)}).`
      };
    }

    // 12. Available Cash Check
    if (portfolio.cashUsd < proposedPositionUsd) {
      return {
        passed: false,
        code: 'INSUFFICIENT_CASH',
        reason: `Insufficient cash ($${portfolio.cashUsd.toFixed(2)}) for proposed trade.`
      };
    }

    // 13. Maximum Single Position Percentage
    const maxSinglePosPercent = settings.maxPositionPercent ?? 3.0;
    const proposedPosPercent = (proposedPositionUsd / portfolio.totalEquityUsd) * 100;
    if (proposedPosPercent > maxSinglePosPercent) {
      return {
        passed: false,
        code: 'MAX_SINGLE_POSITION_PERCENT',
        reason: `Position sizing (${proposedPosPercent.toFixed(2)}%) exceeds single-trade allocation ceiling (${maxSinglePosPercent}%).`
      };
    }

    // 14. Daily Loss Limit Check
    const dailyLossLimitPercent = settings.dailyLossLimitPercent ?? 3.0;
    const todayLossPercent = portfolio.todayReturnPercent < 0 ? Math.abs(portfolio.todayReturnPercent) : 0;
    if (todayLossPercent >= dailyLossLimitPercent) {
      return {
        passed: false,
        code: 'DAILY_LOSS_LIMIT',
        reason: `Portfolio daily loss limit hit.`
      };
    }

    // 15. Maximum Portfolio Drawdown Limit
    const maxDrawdownLimit = settings.maxPortfolioDrawdownPercent ?? 15.0;
    if (portfolio.maxDrawdownPercent !== null && portfolio.maxDrawdownPercent >= maxDrawdownLimit) {
      return {
        passed: false,
        code: 'DRAWDOWN_LIMIT',
        reason: `Portfolio max drawdown (${portfolio.maxDrawdownPercent.toFixed(2)}%) breached risk threshold.`
      };
    }

    // 16. Minimum Wallet Quality Check
    if (signal.participantWallets && signal.participantWallets.length > 0) {
      const avgQuality = signal.participantWallets.reduce((s, w) => s + (w.qualityScore ?? 0), 0) / signal.participantWallets.length;
      if (avgQuality < 60) {
        return {
          passed: false,
          code: 'MIN_WALLET_QUALITY',
          reason: `Participating wallets average quality (${avgQuality.toFixed(1)}) is below minimum threshold.`
        };
      }
    }

    // 17. Independent Consensus & Related Wallet Risk Check
    if (signal.features.penalties.relatedWalletsPenalty > 10) {
      return {
        passed: false,
        code: 'RELATED_WALLET_CONSENSUS_RISK',
        reason: `Consensus invalidated by Sybil/coordinated funding cluster penalty.`
      };
    }
    
    if (signal.independentEliteCount < 2) {
      return {
        passed: false,
        code: 'INSUFFICIENT_INDEPENDENT_CONSENSUS',
        reason: `Only ${signal.independentEliteCount} independent wallet confirmed the move.`
      };
    }

    // 18. Minimum Copyability Score
    const copyScore = signal.features.copyabilityScore?.value || 0;
    if (copyScore < 60) {
      return {
        passed: false,
        code: 'MIN_COPYABILITY',
        reason: `Participating traders copyability score (${copyScore}) indicates severe execution drag in live DEX conditions.`
      };
    }

    // 19. Trader Deterioration Check
    if (signal.features.penalties.traderDeteriorationPenalty > 8) {
      return {
        passed: false,
        code: 'TRADER_DETERIORATION',
        reason: `Lead trader exhibits rolling performance decay.`
      };
    }

    // 20. Minimum Sample Size Check
    if (signal.features.penalties.insufficientSamplePenalty > 10) {
      return {
        passed: false,
        code: 'MIN_SAMPLE_SIZE',
        reason: `Participating wallet trade sample size is too low.`
      };
    }

    return {
      passed: true,
      code: 'PASS',
      reason: 'All institutional risk criteria satisfied.'
    };
  }
}
