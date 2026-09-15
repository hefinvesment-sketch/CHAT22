import { AlphaSignal, PaperPortfolio, PaperPosition, SystemSettings } from '../types';

export type RiskRejectCode =
  | 'MIN_ALPHA_SCORE'
  | 'NEGATIVE_NET_EV'
  | 'MIN_LIQUIDITY_USD'
  | 'MIN_LIQUIDITY'
  | 'MAX_ALLOWED_SLIPPAGE'
  | 'SLIPPAGE_TOO_HIGH'
  | 'MAX_PRICE_DISPLACEMENT'
  | 'MAX_SINGLE_POSITION_PERCENT'
  | 'MAX_TOKEN_EXPOSURE'
  | 'MAX_TOTAL_DEPLOYED'
  | 'MAX_OPEN_POSITIONS'
  | 'DAILY_LOSS_LIMIT'
  | 'DRAWDOWN_LIMIT'
  | 'DUPLICATE_TOKEN_EXPOSURE'
  | 'MIN_WALLET_QUALITY'
  | 'MIN_SAMPLE_SIZE'
  | 'TOKEN_RISK'
  | 'SUSPICIOUS_TOKEN_STRUCTURE'
  | 'TRADER_DETERIORATION'
  | 'RELATED_WALLET_CONSENSUS_RISK'
  | 'INSUFFICIENT_INDEPENDENT_CONSENSUS'
  | 'MIN_COPYABILITY'
  | 'INSUFFICIENT_CASH'
  | 'STALE_MARKET_DATA';

export interface RiskEvaluationResult {
  passed: boolean;
  code: 'PASS' | RiskRejectCode;
  reason?: string;
  details?: Record<string, any>;
}

export class RiskEngine {
  /**
   * Centralized institutional risk enforcement:
   * Every proposed paper trade (live_paper or historical_backtest) MUST pass all checks.
   * Returns structured PASS or REJECT with exact machine-readable code.
   */
  public static evaluateTrade(
    signal: AlphaSignal,
    portfolio: PaperPortfolio,
    openPositions: PaperPosition[],
    settings: SystemSettings,
    options?: {
      marketDataTimestampMs?: number;
      maxDataAgeMs?: number;
      tokenSecurityFlags?: { mintRevoked: boolean; freezeRevoked: boolean; lpBurned: boolean };
    }
  ): RiskEvaluationResult {
    // 1. Data Freshness Check (Stale Data)
    if (options?.marketDataTimestampMs) {
      const maxAgeMs = options.maxDataAgeMs ?? 30000; // 30s
      const dataAgeMs = Date.now() - options.marketDataTimestampMs;
      if (dataAgeMs > maxAgeMs) {
        return {
          passed: false,
          code: 'STALE_MARKET_DATA',
          reason: `Market data is stale (${Math.round(dataAgeMs / 1000)}s old > ${Math.round(maxAgeMs / 1000)}s limit). Trade rejected.`
        };
      }
    }

    // 2. Token Security Risk Check (Honeypot, Mint, Freeze)
    const securityFlags = options?.tokenSecurityFlags || (signal.tokenSecurityFlags ? {
      mintRevoked: signal.tokenSecurityFlags.mintAuthorityRevoked,
      freezeRevoked: signal.tokenSecurityFlags.freezeAuthorityRevoked,
      lpBurned: signal.tokenSecurityFlags.lpBurned
    } : undefined);

    if (securityFlags) {
      const { mintRevoked, freezeRevoked, lpBurned } = securityFlags;
      if (!mintRevoked || !freezeRevoked || lpBurned === false) {
        return {
          passed: false,
          code: 'SUSPICIOUS_TOKEN_STRUCTURE',
          reason: `Token security hazard: Mint authority (${mintRevoked ? 'Revoked' : 'ACTIVE'}), Freeze authority (${freezeRevoked ? 'Revoked' : 'ACTIVE'}), or LP burned (${lpBurned ? 'YES' : 'NO'}).`
        };
      }
    }

    // 3. Minimum Alpha Score (Configurable setting, default 85)
    const minAlphaScore = settings.minExecutionAlphaScore ?? 85;
    if (signal.alphaScore < minAlphaScore) {
      return {
        passed: false,
        code: 'MIN_ALPHA_SCORE',
        reason: `Signal alpha score (${signal.alphaScore}) is below minimum paper execution threshold (${minAlphaScore}).`
      };
    }

    // 4. Positive Net EV Check
    const netEv = signal.historicalExpectancy?.netEvPercent ?? 0;
    if (netEv <= 0) {
      return {
        passed: false,
        code: 'NEGATIVE_NET_EV',
        reason: `Point-in-time Net Expected Value (${netEv.toFixed(2)}%) is not positive after friction.`
      };
    }

    // 5. Minimum Absolute Liquidity Check in USD
    const minLiquidityUsd = settings.minTokenLiquidityUsd ?? 2000000;
    if (signal.liquidityUsd !== undefined && signal.liquidityUsd < minLiquidityUsd) {
      return {
        passed: false,
        code: 'MIN_LIQUIDITY_USD',
        reason: `Actual token liquidity ($${(signal.liquidityUsd / 1e6).toFixed(2)}M) is below required minimum ($${(minLiquidityUsd / 1e6).toFixed(2)}M).`
      };
    }
    if ((signal.features.liquidityTokenQualityScore?.value || 0) < 60) {
      return {
        passed: false,
        code: 'MIN_LIQUIDITY',
        reason: `Token pool liquidity score (${signal.features.liquidityTokenQualityScore}) fails safety threshold (minimum equivalent $${(minLiquidityUsd / 1e6).toFixed(1)}M).`
      };
    }

    // 6. Max Allowed Slippage (Decimal Fraction: 0.01 = 1%, 0.005 = 0.5%)
    const maxSlippage = settings.maxAllowedSlippagePercent ?? 0.01;
    const estSlippage = signal.executionSimulation?.estimatedSlippagePercent ?? 0.0035;
    if (estSlippage > maxSlippage) {
      return {
        passed: false,
        code: 'MAX_ALLOWED_SLIPPAGE',
        reason: `Simulated pool slippage (${(estSlippage * 100).toFixed(2)}%) exceeds maximum allowed threshold (${(maxSlippage * 100).toFixed(2)}%).`
      };
    }

    // 7. Max Price Displacement from Smart-Money VWAP
    const maxDisplacement = 2.5; // 2.5% max displacement
    if (signal.priceDisplacementFromVwapPercent > maxDisplacement) {
      return {
        passed: false,
        code: 'MAX_PRICE_DISPLACEMENT',
        reason: `Price is chasing: current price is +${signal.priceDisplacementFromVwapPercent.toFixed(2)}% above smart-money VWAP (limit: ${maxDisplacement}%).`
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
    const proposedPositionUsd = signal.executionSimulation?.recommendedPositionUsd ?? 
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
        reason: `Trade would exceed maximum total deployed capital (${maxTotalDeployedPercent}% = $${maxAllowedDeployedUsd.toFixed(2)}). Current deployed: $${currentDeployedUsd.toFixed(2)}.`
      };
    }

    // 12. Available Cash Check
    if (portfolio.cashUsd < proposedPositionUsd) {
      return {
        passed: false,
        code: 'INSUFFICIENT_CASH',
        reason: `Insufficient cash ($${portfolio.cashUsd.toFixed(2)}) for proposed trade ($${proposedPositionUsd.toFixed(2)}).`
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
        reason: `Portfolio daily loss limit hit (-${todayLossPercent.toFixed(2)}% >= ${dailyLossLimitPercent}%). Risk circuit breaker active.`
      };
    }

    // 15. Maximum Portfolio Drawdown Limit
    const maxDrawdownLimit = settings.maxPortfolioDrawdownPercent ?? 15.0;
    if (portfolio.maxDrawdownPercent >= maxDrawdownLimit) {
      return {
        passed: false,
        code: 'DRAWDOWN_LIMIT',
        reason: `Portfolio max drawdown (${portfolio.maxDrawdownPercent.toFixed(2)}%) breached risk threshold (${maxDrawdownLimit}%). Capital protection freeze.`
      };
    }

    // 16. Minimum Wallet Quality Check
    if (signal.participantWallets && signal.participantWallets.length > 0) {
      const avgQuality = signal.participantWallets.reduce((s, w) => s + w.qualityScore, 0) / signal.participantWallets.length;
      if (avgQuality < 60) {
        return {
          passed: false,
          code: 'MIN_WALLET_QUALITY',
          reason: `Participating wallets average quality (${avgQuality.toFixed(1)}) is below minimum threshold (60.0).`
        };
      }
    }

    // 17. Independent Consensus & Related Wallet Risk Check
    if (signal.features.penalties.relatedWalletsPenalty > 10) {
      return {
        passed: false,
        code: 'RELATED_WALLET_CONSENSUS_RISK',
        reason: `Consensus invalidated by Sybil/coordinated funding cluster penalty (${signal.features.penalties.relatedWalletsPenalty} pts).`
      };
    }

    if (signal.independentEliteCount < 2) {
      return {
        passed: false,
        code: 'INSUFFICIENT_INDEPENDENT_CONSENSUS',
        reason: `Only ${signal.independentEliteCount} independent wallet confirmed the move (minimum 2 required).`
      };
    }

    // 18. Minimum Copyability Score
    if ((signal.features.copyabilityScore?.value || 0) < 60) {
      return {
        passed: false,
        code: 'MIN_COPYABILITY',
        reason: `Participating traders copyability score (${signal.features.copyabilityScore}) indicates severe execution drag in live DEX conditions.`
      };
    }

    // 19. Trader Deterioration Check
    if (signal.features.penalties.traderDeteriorationPenalty > 8) {
      return {
        passed: false,
        code: 'TRADER_DETERIORATION',
        reason: `Lead trader exhibits rolling performance decay (${signal.features.penalties.traderDeteriorationPenalty} pts penalty).`
      };
    }

    // 20. Minimum Sample Size Check
    if (signal.features.penalties.insufficientSamplePenalty > 10) {
      return {
        passed: false,
        code: 'MIN_SAMPLE_SIZE',
        reason: `Participating wallet trade sample size is too low (< 20 historical trades).`
      };
    }

    return {
      passed: true,
      code: 'PASS',
      reason: 'All institutional risk criteria satisfied.'
    };
  }
}
