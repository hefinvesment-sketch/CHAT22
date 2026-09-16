process.env.LIVE_PAPER_EXECUTION_ENABLED = "true";
import { describe, it, expect } from 'vitest';
import { PortfolioAccountingEngine } from '../src/services/portfolioAccounting';
import { RiskEngine } from '../src/services/riskEngine';
import { AlphaEngine } from '../src/services/alphaEngine';
import { BacktestEngine } from '../src/services/backtestEngine';
import { RedisClientService } from '../src/services/redisClient';
import { PaperPortfolio, PaperPosition, AlphaSignal, SystemSettings } from '../src/types';
import { MOCK_PORTFOLIO, MOCK_OPEN_POSITIONS, MOCK_TRADE_HISTORY } from '../src/data/mockData';

describe('PortfolioAccountingEngine - Strict Double-Entry Ledger', () => {
  it('verifies default demo MOCK_PORTFOLIO passes double-entry reconciliation with $0 discrepancy', () => {
    const audit = PortfolioAccountingEngine.validatePortfolioReconciliation(
      MOCK_PORTFOLIO,
      MOCK_OPEN_POSITIONS,
      MOCK_TRADE_HISTORY
    );
    expect(audit.isValid).toBe(true);
    expect(audit.discrepancyUsd).toBe(0.00);
    expect(audit.expectedEquityUsd).toBe(audit.actualEquityUsd);
    expect(audit.actualEquityUsd).toBe(5015.09);
  });
  const initialPortfolio: PaperPortfolio = {
    id: 'test-port-1',
    name: 'Institutional Paper Fund',
    description: 'Test Fund',
    strategyKey: 'alpha-graph',
    startingCapitalUsd: 5000.00,
    initialCashUsd: 5000.00,
    cashUsd: 5000.00,
    positionsValueUsd: 0.00,
    totalEquityUsd: 5000.00,
    totalReturnPercent: 0.00,
    realizedPnlUsd: 0.00,
    unrealizedPnlUsd: 0.00,
    todayPnlUsd: 0.00,
    todayReturnPercent: 0.00,
    weeklyPnlUsd: 0.00,
    monthlyPnlUsd: 0.00,
    maxDrawdownPercent: 0.00,
    winRatePercent: 0.00,
    profitFactor: 0.00,
    expectedValuePerTradeUsd: 0.00,
    sharpeRatio: 0.00,
    averageSlippageBps: 35,
    averageDetectionLatencyMs: 650,
    copyEfficiencyPercent: 82.5,
    totalTradesCount: 0,
    openPositionsCount: 0,
    totalFeesPaidUsd: 0.00,
    equityHistory: []
  };

  it('verifies starting capital is exactly $5,000.00', () => {
    expect(initialPortfolio.startingCapitalUsd).toBe(5000.00);
    expect(initialPortfolio.cashUsd).toBe(5000.00);
    expect(initialPortfolio.totalEquityUsd).toBe(5000.00);
  });

  it('accurately calculates net entry cost including fees and slippage', () => {
    const entry = PortfolioAccountingEngine.calculateEntryCost(
      100, // 100 tokens
      1.00, // $1.00 each = $100 gross
      0.001, // 10 bps fee = $0.10
      0.05, // network fee = $0.05
      0.0035 // 35 bps slippage = $0.35
    );

    expect(entry.grossPositionValueUsd).toBe(100.00);
    expect(entry.entryFeeUsd).toBe(0.10);
    expect(entry.networkFeeUsd).toBe(0.05);
    expect(entry.slippageCostUsd).toBe(0.35);
    expect(entry.netEntryCostUsd).toBe(100.50);
  });

  it('deducts full net entry cost from cash on open position and reconciles equity', () => {
    const { updatedPortfolio, updatedPositions, newPosition } = PortfolioAccountingEngine.openPosition(
      initialPortfolio,
      [],
      {
        id: 'pos-1',
        tokenSymbol: 'SOL',
        tokenAddress: 'So11111111111111111111111111111111111111112',
        openPrice: 100.00,
        amount: 1.0,
        strategyName: 'AlphaGraph Strategy',
        signalId: 'sig-1',
        signalAlphaScore: 92,
        detectionLatencyMs: 650,
        slippageIncurredPercent: 0.0035,
        entryFeeRate: 0.001,
        networkFeeUsd: 0.05
      }
    );

    // Entry cost: 100 + 0.10 + 0.05 + 0.35 = 100.50
    expect(newPosition.costBasisUsd).toBe(100.50);
    expect(newPosition.currentValueUsd).toBe(100.00);
    expect(updatedPortfolio.cashUsd).toBe(4899.50);
    expect(updatedPortfolio.positionsValueUsd).toBe(100.00);
    expect(updatedPortfolio.totalEquityUsd).toBe(4999.50); // initial 5000 - 0.50 friction
    expect(updatedPortfolio.openPositionsCount).toBe(1);

    // Double-entry reconciliation check
    const audit = PortfolioAccountingEngine.validatePortfolioReconciliation(
      updatedPortfolio,
      updatedPositions,
      []
    );
    expect(audit.isValid).toBe(true);
    expect(audit.discrepancyUsd).toBeLessThanOrEqual(0.01);
  });

  it('credits net proceeds on closing profitable position and reconciles realized PnL', () => {
    // Open position
    const { updatedPortfolio: p1, updatedPositions: posList, newPosition } = PortfolioAccountingEngine.openPosition(
      initialPortfolio,
      [],
      {
        id: 'pos-profit',
        tokenSymbol: 'JUP',
        tokenAddress: 'JUP1111111111111111111111111111111111111111',
        openPrice: 1.00,
        amount: 100, // 100 * $1.00 = $100 gross
        strategyName: 'AlphaGraph Strategy',
        signalId: 'sig-profit',
        signalAlphaScore: 94,
        detectionLatencyMs: 500,
        slippageIncurredPercent: 0.0035
      }
    );

    // Close position at $1.20 (+20% gain)
    // Gross exit = 100 * 1.20 = 120.00
    // Exit fee (10 bps) = 0.12, network fee = 0.05, slippage (35 bps) = 0.42
    // Net proceeds = 120 - 0.12 - 0.05 - 0.42 = 119.41
    // Cost basis = 100.50
    // Net realized PnL = 119.41 - 100.50 = +18.91
    const { updatedPortfolio: p2, updatedPositions: emptyPositions, updatedClosedTrades, closedTrade } =
      PortfolioAccountingEngine.closePosition(
        p1,
        posList,
        [],
        newPosition.id,
        1.20,
        'TAKE_PROFIT'
      );

    expect(emptyPositions.length).toBe(0);
    expect(closedTrade.realizedPnlUsd).toBe(18.91);
    expect(p2.cashUsd).toBe(Number((4899.50 + 119.41).toFixed(2))); // 5018.91
    expect(p2.totalEquityUsd).toBe(5018.91);
    expect(p2.realizedPnlUsd).toBe(18.91);
    expect(p2.winRatePercent).toBe(100.0);

    const audit = PortfolioAccountingEngine.validatePortfolioReconciliation(
      p2,
      emptyPositions,
      updatedClosedTrades
    );
    expect(audit.isValid).toBe(true);
    expect(audit.discrepancyUsd).toBeLessThanOrEqual(0.01);
  });

  it('deducts net losses on closing losing position and reconciles equity accurately', () => {
    // Open position
    const { updatedPortfolio: p1, updatedPositions: posList, newPosition } = PortfolioAccountingEngine.openPosition(
      initialPortfolio,
      [],
      {
        id: 'pos-loss',
        tokenSymbol: 'ORCA',
        tokenAddress: 'ORCA111111111111111111111111111111111111111',
        openPrice: 2.00,
        amount: 50, // 50 * $2.00 = $100 gross
        strategyName: 'AlphaGraph Strategy',
        signalId: 'sig-loss',
        signalAlphaScore: 82,
        detectionLatencyMs: 600,
        slippageIncurredPercent: 0.0035
      }
    );

    // Close position at $1.90 (-5% loss)
    const { updatedPortfolio: p2, updatedPositions: emptyPositions, updatedClosedTrades, closedTrade } =
      PortfolioAccountingEngine.closePosition(
        p1,
        posList,
        [],
        newPosition.id,
        1.90,
        'STOP_LOSS'
      );

    expect(closedTrade.realizedPnlUsd).toBeLessThan(0);
    expect(p2.realizedPnlUsd).toBe(closedTrade.realizedPnlUsd);
    expect(p2.winRatePercent).toBe(0.0);

    const audit = PortfolioAccountingEngine.validatePortfolioReconciliation(
      p2,
      emptyPositions,
      updatedClosedTrades
    );
    expect(audit.isValid).toBe(true);
  });

  it('reconstructs entire portfolio from ledger events (audit check)', () => {
    // 1. Open and close trade 1 (+10)
    const { updatedPortfolio: p1, updatedPositions: pos1, newPosition: n1 } = PortfolioAccountingEngine.openPosition(
      initialPortfolio,
      [],
      {
        id: 'pos-1',
        tokenSymbol: 'JUP',
        tokenAddress: 'JUP1',
        openPrice: 1.00,
        amount: 100,
        strategyName: 'AlphaGraph',
        signalId: 'sig-1',
        signalAlphaScore: 90,
        detectionLatencyMs: 500,
        slippageIncurredPercent: 0.0035
      }
    );
    const { updatedPortfolio: p2, updatedPositions: pos2, updatedClosedTrades: trades1 } = PortfolioAccountingEngine.closePosition(
      p1,
      pos1,
      [],
      n1.id,
      1.10,
      'TAKE_PROFIT'
    );

    // 2. Open active position 2
    const { updatedPortfolio: p3, updatedPositions: activePositions } = PortfolioAccountingEngine.openPosition(
      p2,
      pos2,
      {
        id: 'pos-2',
        tokenSymbol: 'DRIFT',
        tokenAddress: 'DRIFT1',
        openPrice: 0.50,
        amount: 200,
        strategyName: 'AlphaGraph',
        signalId: 'sig-2',
        signalAlphaScore: 94,
        detectionLatencyMs: 400,
        slippageIncurredPercent: 0.0035
      }
    );

    const rebuild = PortfolioAccountingEngine.rebuildPortfolioFromLedger(
      5000.00,
      trades1,
      activePositions
    );

    expect(rebuild.reconstructedCashUsd).toBe(p3.cashUsd);
    expect(rebuild.reconstructedEquityUsd).toBe(p3.totalEquityUsd);
    expect(rebuild.reconstructedRealizedPnlUsd).toBe(p3.realizedPnlUsd);
    expect(rebuild.auditResult.isValid).toBe(true);
  });
});

describe('RiskEngine - Institutional Risk Enforcement', () => {
  const basePortfolio: PaperPortfolio = {
    id: 'port-risk',
    name: 'Risk Test',
    description: 'Testing',
    strategyKey: 'alpha',
    startingCapitalUsd: 5000,
    initialCashUsd: 5000,
    cashUsd: 5000,
    positionsValueUsd: 0,
    totalEquityUsd: 5000,
    totalReturnPercent: 0,
    realizedPnlUsd: 0,
    unrealizedPnlUsd: 0,
    todayPnlUsd: 0,
    todayReturnPercent: 0,
    weeklyPnlUsd: 0,
    monthlyPnlUsd: 0,
    maxDrawdownPercent: 1.2,
    winRatePercent: 65,
    profitFactor: 2.1,
    expectedValuePerTradeUsd: 12,
    sharpeRatio: 2.3,
    averageSlippageBps: 35,
    averageDetectionLatencyMs: 650,
    copyEfficiencyPercent: 85,
    totalTradesCount: 15,
    openPositionsCount: 0,
    totalFeesPaidUsd: 5.4,
    equityHistory: []
  };

  const baseSettings: SystemSettings = {
    startingCapital: 5000,
    minExecutionAlphaScore: 80,
    normalPositionPercent: 2.0,
    strongSignalPositionPercent: 2.5,
    maxPositionPercent: 2.5,
    maxTokenExposurePercent: 5.0,
    maxTotalDeployedPercent: 25.0,
    maxOpenPositions: 10,
    dailyLossLimitPercent: 3.0,
    maxPortfolioDrawdownPercent: 8.0,
    maxAllowedSlippagePercent: 0.008,
    minTokenLiquidityUsd: 2000000,
    minWalletPortfolioValue: 50000,
    minWalletAgeDays: 60,
    minHistoricalTrades: 30,
    minCoreAssetRatioPercent: 40,
    signalThresholds: {
      ignoreMax: 50,
      watchMax: 65,
      strongResearchMax: 79,
      paperEligibleMax: 89,
      highConvictionMin: 90
    },
    alphaWeights: {
      traderSkill: 0.18,
      copyability: 0.15,
      independentConsensus: 0.15,
      convictionSurprise: 0.12,
      smartMoneyAcceleration: 0.10,
      entryQuality: 0.10,
      liquidityTokenQuality: 0.08,
      marketRegimeFit: 0.07,
      emergingTrader: 0.05
    }
  };

  const validSignal: AlphaSignal = {
    id: 'sig-valid',
    tokenSymbol: 'JUP',
    tokenAddress: 'JUP1111111111111111111111111111111111111111',
    timestamp: new Date().toISOString(),
    liquidityUsd: 5000000, 
    alphaScore: 92,
    dataStatus: "COMPLETE",
    signalState: 'HIGH-CONVICTION PAPER TRADE',
    decision: 'TRADED',
    independentEliteCount: 4,
    totalSmartMoneyInflowUsd: 450000,
    priceAtSignal: 1.05,
    priceDisplacementFromVwapPercent: 0.8,
    currentRegime: 'Risk-On',
    features: {
      traderSkillScore: { value: 94, status: "OBSERVED", source: "test_fixture", timestamp: "2024-01-01T00:00:00Z" },
      copyabilityScore: { value: 88, status: "OBSERVED", source: "test_fixture", timestamp: "2024-01-01T00:00:00Z" },
      independentConsensusScore: { value: 92, status: "OBSERVED", source: "test_fixture", timestamp: "2024-01-01T00:00:00Z" },
      convictionSurpriseScore: { value: 85, status: "OBSERVED", source: "test_fixture", timestamp: "2024-01-01T00:00:00Z" },
      smartMoneyAccelerationScore: { value: 88, status: "OBSERVED", source: "test_fixture", timestamp: "2024-01-01T00:00:00Z" },
      entryQualityScore: { value: 90, status: "OBSERVED", source: "test_fixture", timestamp: "2024-01-01T00:00:00Z" },
      liquidityTokenQualityScore: { value: 92, status: "OBSERVED", source: "test_fixture", timestamp: "2024-01-01T00:00:00Z" },
      regimeFitScore: { value: 85, status: "OBSERVED", source: "test_fixture", timestamp: "2024-01-01T00:00:00Z" },
      emergingTraderScore: { value: 70, status: "OBSERVED", source: "test_fixture", timestamp: "2024-01-01T00:00:00Z" },
      penalties: {
        crowdingPenalty: 0,
        relatedWalletsPenalty: 0,
        poorLiquidityPenalty: 0,
        pricePumpedPenalty: 0,
        suspiciousTokenStructurePenalty: 0,
        highSlippagePenalty: 0,
        traderDeteriorationPenalty: 0,
        insufficientSamplePenalty: 0,
        profitConcentrationPenalty: 0
      },
      totalPenalties: 0
    },
    participantWallets: [
      { address: 'W1', qualityScore: 95, convictionMultiplier: 3.5, tradeUsd: 45000, independenceStatus: 'INDEPENDENT' as any },
      { address: 'W2', qualityScore: 92, convictionMultiplier: 2.8, tradeUsd: 32000, independenceStatus: 'INDEPENDENT' as any }
    ],
    historicalExpectancy: {
      similarEventsCount: 142,
      winRatePercent: 68.4,
      averageWinnerPercent: 12.8,
      averageLoserPercent: -4.2,
      medianReturnPercent: 4.1,
      grossEvPercent: 7.43,
      executionCostPercent: 0.95,
      netEvPercent: 6.48,
      maxFavorableExcursionPercent: 18.4,
      maxAdverseExcursionPercent: -1.8,
      return5mPercent: 0.4,
      return15mPercent: 1.2,
      return1hPercent: 2.8,
      return4hPercent: 5.6,
      return24hPercent: 10.4, dataStatus: "VALID_SAMPLE" },
    executionSimulation: {
      sourcePrice: 1.05,
      detectionPrice: 1.054,
      detectionDelayMs: 650,
      estimatedSlippagePercent: 0.0035,
      dexFeePercent: 0.001,
      networkFeeUsd: 0.05,
      simulatedFillPrice: 1.058,
      recommendedPositionUsd: 100,
      positionPercentOfPortfolio: 2.0
    }
  };

  it('passes a fully compliant institutional signal', () => {
    const result = RiskEngine.evaluateTrade(validSignal, basePortfolio, [], baseSettings);
    expect(result.passed).toBe(true);
    expect(result.code).toBe('PASS');
  });

  it('rejects signals with alpha score below threshold', () => {
    const lowAlphaSig: AlphaSignal = { ...validSignal, alphaScore: 74 };
    const result = RiskEngine.evaluateTrade(lowAlphaSig, basePortfolio, [], baseSettings);
    expect(result.passed).toBe(false);
    expect(result.code).toBe('MIN_ALPHA_SCORE');
  });

  it('rejects signals with negative net EV', () => {
    const negEvSig: AlphaSignal = {
      ...validSignal,
      historicalExpectancy: { ...validSignal.historicalExpectancy, netEvPercent: -0.85 }
    };
    const result = RiskEngine.evaluateTrade(negEvSig, basePortfolio, [], baseSettings);
    expect(result.passed).toBe(false);
    expect(result.code).toBe('NEGATIVE_NET_EV');
  });

  it('rejects trades when price displacement from VWAP is excessive', () => {
    const displacedSig: AlphaSignal = {
      ...validSignal,
      priceDisplacementFromVwapPercent: 3.8 // > 2.5 limit
    };
    const result = RiskEngine.evaluateTrade(displacedSig, basePortfolio, [], baseSettings);
    expect(result.passed).toBe(false);
    expect(result.code).toBe('MAX_PRICE_DISPLACEMENT');
  });

  it('rejects trades when duplicate token exposure exists', () => {
    const existingPosition: PaperPosition = {
      id: 'pos-dup',
      portfolioId: 'port-risk',
      tokenSymbol: 'JUP',
      tokenAddress: 'JUP1111111111111111111111111111111111111111',
      openedAt: new Date().toISOString(),
      openPrice: 1.00,
      currentPrice: 1.05,
      amount: 100,
      costBasisUsd: 100.5,
      currentValueUsd: 105,
      unrealizedPnlUsd: 4.5,
      unrealizedReturnPercent: 4.47,
      allocationPercent: 2.0,
      stopLossPrice: 0.95,
      takeProfitPrice: 1.15,
      strategyName: 'AlphaGraph',
      signalId: 'sig-prev',
      signalAlphaScore: 90,
      detectionLatencyMs: 500,
      slippageIncurredPercent: 0.0035
    };

    const result = RiskEngine.evaluateTrade(validSignal, basePortfolio, [existingPosition], baseSettings);
    expect(result.passed).toBe(false);
    expect(result.code).toBe('DUPLICATE_TOKEN_EXPOSURE');
  });

  it('rejects trades when daily loss limit is hit', () => {
    const losingPortfolio: PaperPortfolio = {
      ...basePortfolio,
      todayReturnPercent: -3.5 // >= 3.0% daily loss limit
    };
    const result = RiskEngine.evaluateTrade(validSignal, losingPortfolio, [], baseSettings);
    expect(result.passed).toBe(false);
    expect(result.code).toBe('DAILY_LOSS_LIMIT');
  });

  it('rejects trades when maximum portfolio drawdown is breached', () => {
    const ddPortfolio: PaperPortfolio = {
      ...basePortfolio,
      maxDrawdownPercent: 9.2 // >= 8.0% limit
    };
    const result = RiskEngine.evaluateTrade(validSignal, ddPortfolio, [], baseSettings);
    expect(result.passed).toBe(false);
    expect(result.code).toBe('DRAWDOWN_LIMIT');
  });

  it('rejects trades with insufficient independent consensus', () => {
    const singleWalletSig: AlphaSignal = {
      ...validSignal,
      independentEliteCount: 1 // < 2 required
    };
    const result = RiskEngine.evaluateTrade(singleWalletSig, basePortfolio, [], baseSettings);
    expect(result.passed).toBe(false);
    expect(result.code).toBe('INSUFFICIENT_INDEPENDENT_CONSENSUS');
  });
});

describe('AlphaEngine - Quantitative Formulation', () => {
  it('computes wallet quality score and penalizes heavy concentration', () => {
    const diversified = AlphaEngine.calculateWalletScore(
      85, 80, 85, 80, 65, 80, 85,
      25, 45, 120
    );
    expect(diversified.score).toBeGreaterThan(75);
    expect(diversified.concentrationPenalty).toBe(0);

    const concentrated = AlphaEngine.calculateWalletScore(
      85, 80, 85, 80, 65, 80, 85,
      75, // top 1 trade = 75% of profit!
      90, // top 3 trades = 90%!
      25 // small sample
    );
    expect(concentrated.concentrationPenalty).toBeGreaterThan(25);
    expect(concentrated.score).toBeLessThan(diversified.score);
  });

  it('calculates independent consensus deduplicating Sybil clusters', () => {
    const wallets = [
      { qualityScore: 90, independenceStatus: 'INDEPENDENT' as any },
      { qualityScore: 88, independenceStatus: 'UNKNOWN' as any, clusterId: 'cluster-A' },
      { qualityScore: 85, independenceStatus: 'UNKNOWN' as any, clusterId: 'cluster-A' }, // duplicate cluster
      { qualityScore: 84, independenceStatus: 'UNKNOWN' as any, clusterId: 'cluster-B' }
    ];

    const consensus = AlphaEngine.calculateIndependentConsensus(wallets);
    // Should count 1 independent + 1 from cluster-A + 1 from cluster-B = 3
    expect(consensus.independentCount).toBe(3);
    expect(consensus.independentConsensusScore).toBeGreaterThan(70);
  });

  it('computes Net Expected Value factoring in fees and slippage friction', () => {
    const ev = AlphaEngine.calculateExpectedValue(65.0, 12.0, -4.0, 0.5, 0.4, 0.3);
    // Gross EV = (0.65 * 12) - (0.35 * 4) = 7.8 - 1.4 = 6.4%
    // Execution Cost = 0.5 + 0.4 + 0.3 = 1.2%
    // Net EV = 6.4 - 1.2 = 5.2%
    expect(ev.grossEvPercent).toBe(6.4);
    expect(ev.executionCostPercent).toBe(1.2);
    expect(ev.netEvPercent).toBe(5.2);
  });
});

describe('BacktestEngine - Deterministic Historical Replay', () => {
  it('produces identical deterministic results given the same config', () => {
    const config = {
      name: 'Deterministic Test Run',
      startDate: '2026-01-01',
      endDate: '2026-09-01',
      mode: 'point_in_time' as const,
      trainMonths: 6,
      valMonths: 2,
      testMonths: 2,
      minSkillScore: 80,
      minIndependentWallets: 2,
      minCopyability: 60,
      minConvictionMultiplier: 1.5,
      maxPriceDisplacementPercent: 2.5,
      minLiquidityUsd: 10000000,
      marketRegimeFilter: 'ALL'
    };

    const run1 = BacktestEngine.runBacktest(config);
    const run2 = BacktestEngine.runBacktest(config);

    expect(run1.totalTrades).toBe(run2.totalTrades);
    expect(run1.winRatePercent).toBe(run2.winRatePercent);
    expect(run1.totalReturnPercent).toBe(run2.totalReturnPercent);
    expect(run1.profitFactor).toBe(run2.profitFactor);
    expect(run1.maxDrawdownPercent).toBe(run2.maxDrawdownPercent);
    expect(run1.sharpeRatio).toBe(run2.sharpeRatio);
  });

  it('queries historical research database deterministically with real metrics', () => {
    const query = BacktestEngine.queryResearch({
      minTraderSkill: 88,
      minIndependentWallets: 3,
      minCopyability: 60,
      minConvictionMultiplier: 2.0,
      maxPriceDisplacementPercent: 2.0,
      minLiquidityUsd: 10000000,
      marketRegime: 'ALL'
    });

    expect(query.sampleSize).toBeGreaterThan(0);
    expect(query.winRatePercent).toBeGreaterThan(50);
    expect(query.executionCostPercent).toBe(0.95);
    expect(query.confidenceInterval95[0]).toBeLessThanOrEqual(query.netEvPercent);
    expect(query.confidenceInterval95[1]).toBeGreaterThanOrEqual(query.netEvPercent);
    expect(query.sampleMatches.length).toBeGreaterThan(0);
  });
});

describe('RedisClientService - TLS Connection & Normalization', () => {
  it('normalizes redis:// with upstash.io to rediss:// for mandatory TLS', () => {
    const raw = 'redis://default:token123@apparent-ibex-139990.upstash.io:6379';
    const normalized = RedisClientService.normalizeRedisUrl(raw);
    expect(normalized).toBe('rediss://default:token123@apparent-ibex-139990.upstash.io:6379');
  });

  it('preserves existing rediss:// URLs', () => {
    const raw = 'rediss://default:token123@apparent-ibex-139990.upstash.io:6379';
    const normalized = RedisClientService.normalizeRedisUrl(raw);
    expect(normalized).toBe(raw);
  });

  it('correctly parses UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN strings into rediss://', () => {
    const raw = 'UPSTASH_REDIS_REST_URL="https://apparent-ibex-139990.upstash.io" UPSTASH_REDIS_REST_TOKEN="token123"';
    const normalized = RedisClientService.normalizeRedisUrl(raw);
    expect(normalized).toBe('rediss://default:token123@apparent-ibex-139990.upstash.io:6379');
  });

  it('performs live PING and returns connection status', async () => {
    const health = await RedisClientService.checkHealth();
    expect(health).toHaveProperty('connected');
    expect(health).toHaveProperty('latencyMs');
    expect(typeof health.connected).toBe('boolean');
    if (health.connected) {
      expect(health.latencyMs).toBeGreaterThan(0);
      expect(health.message).toContain('active');
    }
  });
});

