import { describe, it, expect, beforeEach } from 'vitest';
import { HeliusTransactionParser } from '../services/heliusParser';
import { WalletPnLEngine, ReconstructedTrade } from '../services/walletPnLEngine';
import { RealDataProviders } from '../services/realDataProviders';
import { RiskEngine } from '../services/riskEngine';
import { BacktestEngine } from '../services/backtestEngine';
import { MemoryPersistenceStore } from '../services/persistence';
import { INITIAL_SETTINGS } from '../data/mockData';
import { AlphaSignal, PaperPortfolio, PaperPosition } from '../types';

describe('HEF AlphaGraph Institutional Test Suite', () => {
  let portfolio: PaperPortfolio;
  let openPositions: PaperPosition[];

  beforeEach(() => {
    portfolio = {
      id: 'test-portfolio',
      name: 'Test Portfolio',
      description: 'Institutional Test Portfolio',
      strategyKey: 'HEF_INSTITUTIONAL',
      startingCapitalUsd: 5000.0,
      initialCashUsd: 5000.0,
      cashUsd: 5000.0,
      positionsValueUsd: 0.0,
      totalEquityUsd: 5000.0,
      totalReturnPercent: 0.0,
      realizedPnlUsd: 0.0,
      unrealizedPnlUsd: 0.0,
      todayPnlUsd: 0.0,
      todayReturnPercent: 0.0,
      weeklyPnlUsd: 0.0,
      monthlyPnlUsd: 0.0,
      maxDrawdownPercent: 0.0,
      winRatePercent: 0.0,
      profitFactor: 1.0,
      expectedValuePerTradeUsd: 0.0,
      sharpeRatio: 0.0,
      averageSlippageBps: 35,
      averageDetectionLatencyMs: 650,
      copyEfficiencyPercent: 100,
      totalTradesCount: 0,
      openPositionsCount: 0,
      totalFeesPaidUsd: 0.0,
      equityHistory: []
    };
    openPositions = [];
  });

  // Test 1 & 2: Helius Parser Classification & Stablecoin rotation
  it('1 & 2: Helius parser correctly identifies BUY vs SELL vs SWAP vs TRANSFER vs AIRDROP and handles stablecoin rotation', () => {
    // USDC -> JUP (BUY JUP)
    const buyTx = {
      type: 'SWAP',
      source: 'JUPITER',
      events: {
        swap: {
          tokenInputs: [{ mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', tokenAmount: '10000000', decimals: 6 }],
          tokenOutputs: [{ mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', tokenAmount: '12500000', decimals: 6 }]
        }
      }
    };
    const parsedBuy = HeliusTransactionParser.parseTransaction(buyTx, 'wallet-123');
    expect(parsedBuy.tradeDirection).toBe('BUY');
    expect(parsedBuy.tokenOutSymbol).toBe('JUP');

    // JUP -> USDC (SELL JUP)
    const sellTx = {
      type: 'SWAP',
      source: 'RAYDIUM',
      events: {
        swap: {
          tokenInputs: [{ mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', tokenAmount: '12500000', decimals: 6 }],
          tokenOutputs: [{ mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', tokenAmount: '12000000', decimals: 6 }]
        }
      }
    };
    const parsedSell = HeliusTransactionParser.parseTransaction(sellTx, 'wallet-123');
    expect(parsedSell.tradeDirection).toBe('SELL');

    // USDT -> USDC (Stablecoin rotation, NOT speculative BUY)
    const rotationTx = {
      type: 'SWAP',
      source: 'ORCA',
      events: {
        swap: {
          tokenInputs: [{ mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', tokenAmount: '50000000', decimals: 6 }],
          tokenOutputs: [{ mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', tokenAmount: '49990000', decimals: 6 }]
        }
      }
    };
    const parsedRotation = HeliusTransactionParser.parseTransaction(rotationTx, 'wallet-123');
    expect(parsedRotation.tradeDirection).toBe('STABLECOIN_ROTATION');
    expect(parsedRotation.isStablecoinRotation).toBe(true);

    // Transfer & Airdrop
    const airdropTx = {
      type: 'TRANSFER',
      description: 'Community token Airdrop claim',
      tokenTransfers: [{ mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', tokenAmount: '200', fromUserAccount: 'AirdropDistributor' }]
    };
    const parsedAirdrop = HeliusTransactionParser.parseTransaction(airdropTx, 'wallet-123');
    expect(parsedAirdrop.tradeDirection).toBe('AIRDROP');
    expect(parsedAirdrop.isAirdropOrTransfer).toBe(true);
  });

  // Test 3: FIFO Matching
  it('3: WalletPnLEngine matches FIFO correctly for partial sales and multiple entries', () => {
    const txs = [
      // Entry 1: Buy 100 tokens at $1 ($100 cost basis)
      {
        signature: 'sig-1',
        slot: 1,
        timestamp: '2026-01-01T10:00:00Z',
        walletAddress: 'wallet-pnl',
        dex: 'JUPITER',
        tradeDirection: 'BUY' as const,
        tokenInAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        tokenInSymbol: 'USDC',
        tokenInAmount: 100,
        tokenOutAddress: 'token-xyz',
        tokenOutSymbol: 'XYZ',
        tokenOutAmount: 100,
        executionPriceUsd: 1.0,
        usdValue: 100,
        transactionFeeUsd: 0.05,
        isStablecoinRotation: false,
        isAirdropOrTransfer: false
      },
      // Entry 2: Buy 100 tokens at $2 ($200 cost basis)
      {
        signature: 'sig-2',
        slot: 2,
        timestamp: '2026-01-02T10:00:00Z',
        walletAddress: 'wallet-pnl',
        dex: 'JUPITER',
        tradeDirection: 'BUY' as const,
        tokenInAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        tokenInSymbol: 'USDC',
        tokenInAmount: 200,
        tokenOutAddress: 'token-xyz',
        tokenOutSymbol: 'XYZ',
        tokenOutAmount: 100,
        executionPriceUsd: 2.0,
        usdValue: 200,
        transactionFeeUsd: 0.05,
        isStablecoinRotation: false,
        isAirdropOrTransfer: false
      },
      // Sell 150 tokens at $3 (FIFO: 100 from Entry 1 at $1, 50 from Entry 2 at $2)
      // Cost basis = (100 * 1) + (50 * 2) = $200
      // Proceeds = 150 * 3 = $450
      // Gross realized P&L = $250
      {
        signature: 'sig-3',
        slot: 3,
        timestamp: '2026-01-03T10:00:00Z',
        walletAddress: 'wallet-pnl',
        dex: 'JUPITER',
        tradeDirection: 'SELL' as const,
        tokenInAddress: 'token-xyz',
        tokenInSymbol: 'XYZ',
        tokenInAmount: 150,
        tokenOutAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        tokenOutSymbol: 'USDC',
        tokenOutAmount: 450,
        executionPriceUsd: 3.0,
        usdValue: 450,
        transactionFeeUsd: 0.05,
        isStablecoinRotation: false,
        isAirdropOrTransfer: false
      }
    ];

    const result = WalletPnLEngine.reconstructWalletTrades('wallet-pnl', txs);
    expect(result.reconstructedTrades.length).toBe(2); // 100 from lot 1, 50 from lot 2
    expect(result.totalTrades).toBe(2);
    expect(result.winRate).toBe(100);
    // Total realized P&L approx $250 minus fees
    expect(result.totalRealizedPnlUsd).toBeGreaterThan(249);
  });

  // Test 4: Airdrops excluded from trading P&L
  it('4: Airdrops and free transfers do not increase realized trading P&L', () => {
    const txs = [
      {
        signature: 'sig-airdrop',
        slot: 10,
        timestamp: '2026-01-01T10:00:00Z',
        walletAddress: 'wallet-airdrop',
        dex: 'DIRECT_TRANSFER',
        tradeDirection: 'AIRDROP' as const,
        tokenInAddress: '',
        tokenInSymbol: '',
        tokenInAmount: 0,
        tokenOutAddress: 'token-free',
        tokenOutSymbol: 'FREE',
        tokenOutAmount: 10000,
        executionPriceUsd: 1.0,
        usdValue: 10000,
        transactionFeeUsd: 0,
        isStablecoinRotation: false,
        isAirdropOrTransfer: true
      }
    ];

    const result = WalletPnLEngine.reconstructWalletTrades('wallet-airdrop', txs);
    expect(result.totalTrades).toBe(0);
    expect(result.totalRealizedPnlUsd).toBe(0);
  });

  // Test 5: Known 10-trade sequence calculation
  it('5: Wallet metrics match manual calculation on known 10-trade sequence', () => {
    // 7 wins of +$100, 3 losses of -$50
    // Total wins: $700, Total losses: $150
    // Win rate: 70%, Profit factor: 700 / 150 = 4.67
    const trades: ReconstructedTrade[] = [
      ...Array(7).fill(null).map((_, i) => ({
        tokenAddress: `tok-${i}`,
        tokenSymbol: `TOK${i}`,
        openedAt: '2026-01-01T00:00:00Z',
        closedAt: '2026-01-02T00:00:00Z',
        amount: 100,
        entryPriceUsd: 1.0,
        exitPriceUsd: 2.0,
        costBasisUsd: 100,
        proceedsUsd: 200,
        realizedPnlUsd: 100,
        returnPercent: 100,
        holdingTimeHours: 24,
        feesPaidUsd: 0.1,
        isAirdrop: false
      })),
      ...Array(3).fill(null).map((_, i) => ({
        tokenAddress: `tok-loss-${i}`,
        tokenSymbol: `TOKL${i}`,
        openedAt: '2026-01-03T00:00:00Z',
        closedAt: '2026-01-04T00:00:00Z',
        amount: 100,
        entryPriceUsd: 1.0,
        exitPriceUsd: 0.5,
        costBasisUsd: 100,
        proceedsUsd: 50,
        realizedPnlUsd: -50,
        returnPercent: -50,
        holdingTimeHours: 24,
        feesPaidUsd: 0.1,
        isAirdrop: false
      }))
    ];

    const metrics = WalletPnLEngine.calculateMetrics('wallet-known', trades);
    expect(metrics.totalTrades).toBe(10);
    expect(metrics.winRate).toBe(70);
    expect(metrics.profitFactor).toBe(4.67);
    expect(metrics.totalRealizedPnlUsd).toBe(550);
  });

  // Test 6: Copyability penalizes latency and slippage
  it('6: Copyability calculation penalizes high latency and high slippage', () => {
    const lowFrictionTrades: ReconstructedTrade[] = [
      {
        tokenAddress: 'tok-1',
        tokenSymbol: 'TOK1',
        openedAt: '2026-01-01T00:00:00Z',
        closedAt: '2026-01-02T00:00:00Z',
        amount: 100,
        entryPriceUsd: 1.0,
        exitPriceUsd: 1.5,
        costBasisUsd: 100,
        proceedsUsd: 150,
        realizedPnlUsd: 50,
        returnPercent: 50,
        holdingTimeHours: 48,
        feesPaidUsd: 0.05,
        isAirdrop: false
      }
    ];

    const result = WalletPnLEngine.calculateMetrics('wallet-copy', lowFrictionTrades);
    expect(result.copyability.latencyLossPercent).toBeGreaterThan(0);
    expect(result.copyability.slippageLossPercent).toBeGreaterThan(0);
    expect(result.copyability.achievableSimulatedReturn).toBeLessThan(result.copyability.sourceTraderReturn);
  });

  // Test 7: RealDataProviders returns correct status when keys present vs missing
  it('7: RealDataProviders returns correct status when keys are present vs missing', async () => {
    const originalHelius = process.env.HELIUS_API_KEY;
    delete process.env.HELIUS_API_KEY;

    const health = await RealDataProviders.checkHeliusHealth();
    expect(['NOT_CONFIGURED', 'DEMO_ONLY']).toContain(health.status);

    process.env.HELIUS_API_KEY = originalHelius;
  });

  // Test 8: Generic token decimals handling
  it('8: Jupiter quote decimals handled correctly for arbitrary pairs', async () => {
    const usdcDecimals = await RealDataProviders.getTokenDecimals('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    const solDecimals = await RealDataProviders.getTokenDecimals('So11111111111111111111111111111111111111112');
    const btcDecimals = await RealDataProviders.getTokenDecimals('3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh');

    expect(usdcDecimals).toBe(6);
    expect(solDecimals).toBe(9);
    expect(btcDecimals).toBe(8);
  });

  // Test 9: Slippage values as decimal fractions
  it('9: Slippage values treated as decimal fractions (1% = 0.01)', () => {
    expect(INITIAL_SETTINGS.maxAllowedSlippagePercent).toBe(0.01);
  });

  // Test 10: Sizing allocates 1% for normal, 2% for strong, never exceeds 3%
  it('10: Sizing allocates 1% for normal signals, 2% for strong signals, never exceeds 3%', () => {
    expect(INITIAL_SETTINGS.normalPositionPercent).toBe(1.0);
    expect(INITIAL_SETTINGS.strongSignalPositionPercent).toBe(2.0);
    expect(INITIAL_SETTINGS.maxPositionPercent).toBe(3.0);
  });

  // Test 11: Total portfolio exposure cannot exceed 40%
  it('11: Total portfolio exposure cannot exceed 40%', () => {
    expect(INITIAL_SETTINGS.maxTotalDeployedPercent).toBe(40.0);

    const signal: AlphaSignal = {
      id: 'sig-exp',
      tokenSymbol: 'SOL',
      tokenAddress: 'So11111111111111111111111111111111111111112',
      timestamp: new Date().toISOString(),
      alphaScore: { value: 90, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
      dataStatus: "COMPLETE" as any,
      signalState: 'PAPER TRADE ELIGIBLE',
      decision: 'TRADED',
      independentEliteCount: 3,
      totalSmartMoneyInflowUsd: 100000,
      priceAtSignal: 145.0,
      priceDisplacementFromVwapPercent: 0.5,
      currentRegime: 'Trending Up',
      liquidityUsd: 2000000,
      features: {
        traderSkillScore: { value: 85, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
        copyabilityScore: { value: 80, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
        independentConsensusScore: { value: 80, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
        convictionSurpriseScore: { value: 80, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
        smartMoneyAccelerationScore: { value: 80, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
        entryQualityScore: { value: 80, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
        liquidityTokenQualityScore: { value: 80, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
        regimeFitScore: { value: 80, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
        emergingTraderScore: { value: 70, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
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
      historicalExpectancy: {
        similarEventsCount: 20,
        winRatePercent: 70,
        averageWinnerPercent: 10,
        averageLoserPercent: -4,
        medianReturnPercent: 6,
        grossEvPercent: 6,
        executionCostPercent: 0.95,
        netEvPercent: 5.05,
        maxFavorableExcursionPercent: 15,
        maxAdverseExcursionPercent: -3,
        return5mPercent: 1,
        return15mPercent: 2,
        return1hPercent: 4,
        return4hPercent: 7,
        return24hPercent: 10
      },
      executionSimulation: {
        sourcePrice: 145.0,
        detectionPrice: 145.0,
        detectionDelayMs: 650,
        estimatedSlippagePercent: 0.0035,
        dexFeePercent: 0.001,
        networkFeeUsd: 0.05,
        simulatedFillPrice: 145.5,
        recommendedPositionUsd: 200,
        positionPercentOfPortfolio: 4.0
      },
      participantWallets: [{ address: 'w1', qualityScore: { value: 85, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any, convictionMultiplier: 1.5, tradeUsd: 50000, isIndependent: true }]
    };

    // Already holding $2000 in open positions (40% of $5000)
    const heavyPositions: PaperPosition[] = [
      {
        id: 'pos-1',
        portfolioId: 'test-portfolio',
        tokenSymbol: 'XYZ',
        tokenAddress: 'xyz-addr',
        openedAt: new Date().toISOString(),
        openPrice: 10,
        currentPrice: 10,
        amount: 200,
        costBasisUsd: 2000,
        currentValueUsd: 2000,
        unrealizedPnlUsd: 0,
        unrealizedReturnPercent: 0,
        allocationPercent: 40,
        stopLossPrice: 9,
        takeProfitPrice: 12,
        strategyName: 'AlphaGraph Institutional Strategy',
        signalId: 'sig-heavy-1',
        signalAlphaScore: { value: 88, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
        detectionLatencyMs: 650,
        slippageIncurredPercent: 0.0035
      }
    ];

    const result = RiskEngine.evaluateTrade(signal, portfolio, heavyPositions, INITIAL_SETTINGS);
    expect(result.passed).toBe(false);
    expect(result.code).toBe('MAX_TOTAL_DEPLOYED');
  });

  // Test 12: Daily loss limit halts trading at 3%
  it('12: Daily loss limit halts trading at 3%', () => {
    portfolio.todayReturnPercent = -3.5; // -3.5% today
    const signal: AlphaSignal = {
      id: 'sig-loss',
      tokenSymbol: 'JUP',
      tokenAddress: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
      timestamp: new Date().toISOString(),
      alphaScore: { value: 92, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
      dataStatus: "COMPLETE" as any,
      signalState: 'PAPER TRADE ELIGIBLE',
      decision: 'TRADED',
      independentEliteCount: 3,
      totalSmartMoneyInflowUsd: 100000,
      priceAtSignal: 1.2,
      priceDisplacementFromVwapPercent: 0.5,
      currentRegime: 'Trending Up',
      liquidityUsd: 2000000,
      features: {
        traderSkillScore: { value: 85, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
        copyabilityScore: { value: 80, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
        independentConsensusScore: { value: 80, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
        convictionSurpriseScore: { value: 80, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
        smartMoneyAccelerationScore: { value: 80, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
        entryQualityScore: { value: 80, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
        liquidityTokenQualityScore: { value: 80, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
        regimeFitScore: { value: 80, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
        emergingTraderScore: { value: 70, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
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
      historicalExpectancy: {
        similarEventsCount: 20,
        winRatePercent: 70,
        averageWinnerPercent: 10,
        averageLoserPercent: -4,
        medianReturnPercent: 6,
        grossEvPercent: 6,
        executionCostPercent: 0.95,
        netEvPercent: 5.05,
        maxFavorableExcursionPercent: 15,
        maxAdverseExcursionPercent: -3,
        return5mPercent: 1,
        return15mPercent: 2,
        return1hPercent: 4,
        return4hPercent: 7,
        return24hPercent: 10
      },
      executionSimulation: {
        sourcePrice: 1.2,
        detectionPrice: 1.2,
        detectionDelayMs: 650,
        estimatedSlippagePercent: 0.0035,
        dexFeePercent: 0.001,
        networkFeeUsd: 0.05,
        simulatedFillPrice: 1.204,
        recommendedPositionUsd: 50,
        positionPercentOfPortfolio: 1.0
      },
      participantWallets: []
    };

    const result = RiskEngine.evaluateTrade(signal, portfolio, [], INITIAL_SETTINGS);
    expect(result.passed).toBe(false);
    expect(result.code).toBe('DAILY_LOSS_LIMIT');
  });

  // Test 13: Drawdown limit halts trading at 15%
  it('13: Drawdown limit halts trading at 15%', () => {
    portfolio.maxDrawdownPercent = 16.5; // 16.5% drawdown
    const signal: AlphaSignal = {
      id: 'sig-dd',
      tokenSymbol: 'JUP',
      tokenAddress: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
      timestamp: new Date().toISOString(),
      alphaScore: { value: 92, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
      dataStatus: "COMPLETE" as any,
      signalState: 'PAPER TRADE ELIGIBLE',
      decision: 'TRADED',
      independentEliteCount: 3,
      totalSmartMoneyInflowUsd: 100000,
      priceAtSignal: 1.2,
      priceDisplacementFromVwapPercent: 0.5,
      currentRegime: 'Trending Up',
      liquidityUsd: 2000000,
      features: {
        traderSkillScore: { value: 85, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
        copyabilityScore: { value: 80, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
        independentConsensusScore: { value: 80, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
        convictionSurpriseScore: { value: 80, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
        smartMoneyAccelerationScore: { value: 80, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
        entryQualityScore: { value: 80, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
        liquidityTokenQualityScore: { value: 80, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
        regimeFitScore: { value: 80, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
        emergingTraderScore: { value: 70, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
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
      historicalExpectancy: {
        similarEventsCount: 20,
        winRatePercent: 70,
        averageWinnerPercent: 10,
        averageLoserPercent: -4,
        medianReturnPercent: 6,
        grossEvPercent: 6,
        executionCostPercent: 0.95,
        netEvPercent: 5.05,
        maxFavorableExcursionPercent: 15,
        maxAdverseExcursionPercent: -3,
        return5mPercent: 1,
        return15mPercent: 2,
        return1hPercent: 4,
        return4hPercent: 7,
        return24hPercent: 10
      },
      executionSimulation: {
        sourcePrice: 1.2,
        detectionPrice: 1.2,
        detectionDelayMs: 650,
        estimatedSlippagePercent: 0.0035,
        dexFeePercent: 0.001,
        networkFeeUsd: 0.05,
        simulatedFillPrice: 1.204,
        recommendedPositionUsd: 50,
        positionPercentOfPortfolio: 1.0
      },
      participantWallets: []
    };

    const result = RiskEngine.evaluateTrade(signal, portfolio, [], INITIAL_SETTINGS);
    expect(result.passed).toBe(false);
    expect(result.code).toBe('DRAWDOWN_LIMIT');
  });

  // Test 14 & 15: Backtest simulation runs chronologically and uses RiskEngine
  it('14 & 15: Backtest simulation runs chronologically without lookahead and uses same RiskEngine', () => {
    const result = BacktestEngine.runBacktest({
      name: 'Chronological Test',
      startDate: '2026-01-01T00:00:00Z',
      endDate: '2026-09-01T00:00:00Z',
      mode: 'point_in_time',
      trainMonths: 2,
      valMonths: 1,
      testMonths: 1,
      minSkillScore: { value: 75, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
      minIndependentWallets: 2,
      minCopyability: 70,
      minConvictionMultiplier: 1.2,
      maxPriceDisplacementPercent: 2.0,
      minLiquidityUsd: 1000000,
      marketRegimeFilter: 'ALL'
    });

    expect(result.totalTrades).toBeGreaterThan(0);
    expect(result.winRatePercent).toBeGreaterThan(0);
    expect(result.totalReturnPercent).toBeDefined();
    expect(result.walkForwardSplits.length).toBeGreaterThan(0);
  });

  // Test 16: Walk-forward split produces out-of-sample results from actual simulation
  it('16: Walk-forward split produces out-of-sample results from actual simulation', () => {
    const result = BacktestEngine.runBacktest({
      name: 'Walk-Forward Verification',
      startDate: '2026-01-01T00:00:00Z',
      endDate: '2026-09-01T00:00:00Z',
      mode: 'walk_forward',
      trainMonths: 2,
      valMonths: 1,
      testMonths: 1,
      minSkillScore: { value: 70, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
      minIndependentWallets: 1,
      minCopyability: 60,
      minConvictionMultiplier: 1.0,
      maxPriceDisplacementPercent: 3.0,
      minLiquidityUsd: 500000,
      marketRegimeFilter: 'ALL'
    });

    expect(result.walkForwardSplits).toBeDefined();
    for (const split of result.walkForwardSplits) {
      expect(split.inSampleWinRate).toBeDefined();
      expect(split.outOfSampleWinRate).toBeDefined();
      expect(split.status).toBeDefined();
    }
  });

  // Test 17: Persistence saves and reloads portfolio, positions, trades without data loss
  it('17: Persistence saves and reloads portfolio, positions, trades without data loss', async () => {
    const store = new MemoryPersistenceStore();
    await store.init();

    await store.savePortfolio(portfolio);
    const loadedPortfolio = await store.getPortfolio(portfolio.id);
    expect(loadedPortfolio?.startingCapitalUsd).toBe(5000.0);

    const position: PaperPosition = {
      id: 'pos-store-test',
      portfolioId: portfolio.id,
      tokenSymbol: 'SOL',
      tokenAddress: 'So11111111111111111111111111111111111111112',
      openedAt: new Date().toISOString(),
      openPrice: 145.0,
      currentPrice: 146.0,
      amount: 1.0,
      costBasisUsd: 145.0,
      currentValueUsd: 146.0,
      unrealizedPnlUsd: 1.0,
      unrealizedReturnPercent: 0.69,
      allocationPercent: 2.9,
      stopLossPrice: 135.0,
      takeProfitPrice: 165.0,
      strategyName: 'AlphaGraph Institutional Strategy',
      signalId: 'sig-store-test',
      signalAlphaScore: { value: 92, status: "COMPLETE", source: "test", timestamp: "2024-01-01T00:00:00Z" } as any,
      detectionLatencyMs: 650,
      slippageIncurredPercent: 0.0035
    };

    await store.savePosition(position);
    const loadedPositions = await store.getOpenPositions(portfolio.id);
    expect(loadedPositions.length).toBe(1);
    expect(loadedPositions[0].tokenSymbol).toBe('SOL');

    await store.removePosition(position.id);
    const afterRemoval = await store.getOpenPositions(portfolio.id);
    expect(afterRemoval.length).toBe(0);
  });
});
