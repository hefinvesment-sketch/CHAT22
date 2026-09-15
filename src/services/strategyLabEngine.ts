import {
  AlphaSignal,
  PaperPosition,
  PaperTradeRecord,
  StrategyDefinition,
  StrategyPortfolio,
  StrategyDecisionRecord,
  StrategyStatus,
  SystemSettings
} from '../types';
import { StorageAdapter } from './persistence';
import { RealDataProviders } from './realDataProviders';

export const MIN_STRATEGY_SAMPLE_TRADES = 20;

export const STRATEGY_DEFINITIONS: StrategyDefinition[] = [
  {
    key: 'strategy-a-top-trader',
    name: 'A — Top Trader Copy',
    description: 'Uses signals primarily driven by highest verified Trader Skill (>=80) and Copyability (>=75).',
    enabled: true,
    eligibilityRules: {
      minAlphaScore: 75,
      minTraderSkill: 80,
      minCopyability: 75,
      minIndependentWallets: 1,
      minLiquidityUsd: 250000,
      maxPriceDisplacementPercent: 4.0
    },
    positionSizingRules: {
      allocationPercent: 5.0, // $250 of $5,000
      maxPositions: 8,
      maxTokenExposurePercent: 10.0
    },
    riskRules: {
      stopLossPercent: 7.0,
      takeProfitPercent: 18.0,
      trailingStopPercent: 5.0
    }
  },
  {
    key: 'strategy-b-independent-consensus',
    name: 'B — Independent Consensus',
    description: 'Prioritizes signals with multiple independent wallet clusters (>=3 unlinked entities).',
    enabled: true,
    eligibilityRules: {
      minAlphaScore: 75,
      minTraderSkill: 65,
      minCopyability: 60,
      minIndependentWallets: 3,
      minLiquidityUsd: 200000,
      maxPriceDisplacementPercent: 5.0,
      requiresConsensus: true
    },
    positionSizingRules: {
      allocationPercent: 6.0,
      maxPositions: 8,
      maxTokenExposurePercent: 12.0
    },
    riskRules: {
      stopLossPercent: 8.0,
      takeProfitPercent: 22.0,
      trailingStopPercent: 6.0
    }
  },
  {
    key: 'strategy-c-conviction-surprise',
    name: 'C — Conviction Surprise',
    description: 'Prioritizes unusually large wallet allocations relative to historical median wallet trade size.',
    enabled: true,
    eligibilityRules: {
      minAlphaScore: 75,
      minTraderSkill: 70,
      minCopyability: 65,
      minIndependentWallets: 1,
      minLiquidityUsd: 150000,
      maxPriceDisplacementPercent: 4.5,
      requiresConvictionSurprise: true
    },
    positionSizingRules: {
      allocationPercent: 7.0,
      maxPositions: 6,
      maxTokenExposurePercent: 14.0
    },
    riskRules: {
      stopLossPercent: 9.0,
      takeProfitPercent: 25.0,
      trailingStopPercent: 7.0
    }
  },
  {
    key: 'strategy-d-flow-acceleration',
    name: 'D — Smart-Money Flow Acceleration',
    description: 'Prioritizes actual accelerating smart-money inflows across rolling 1m/5m/10m windows.',
    enabled: true,
    eligibilityRules: {
      minAlphaScore: 78,
      minTraderSkill: 70,
      minCopyability: 65,
      minIndependentWallets: 2,
      minLiquidityUsd: 300000,
      maxPriceDisplacementPercent: 3.5,
      requiresFlowAcceleration: true
    },
    positionSizingRules: {
      allocationPercent: 5.0,
      maxPositions: 10,
      maxTokenExposurePercent: 10.0
    },
    riskRules: {
      stopLossPercent: 6.0,
      takeProfitPercent: 16.0,
      trailingStopPercent: 4.5
    }
  },
  {
    key: 'strategy-e-emerging-traders',
    name: 'E — Emerging Traders',
    description: 'Prioritizes improving wallet quality and emerging alpha trajectories before market crowding.',
    enabled: true,
    eligibilityRules: {
      minAlphaScore: 75,
      minTraderSkill: 60,
      minCopyability: 70,
      minIndependentWallets: 1,
      minLiquidityUsd: 150000,
      maxPriceDisplacementPercent: 5.0,
      requiresEmergingTrader: true
    },
    positionSizingRules: {
      allocationPercent: 4.0,
      maxPositions: 10,
      maxTokenExposurePercent: 8.0
    },
    riskRules: {
      stopLossPercent: 8.5,
      takeProfitPercent: 24.0,
      trailingStopPercent: 6.0
    }
  },
  {
    key: 'strategy-f-alpha-85',
    name: 'F — Alpha >= 85',
    description: 'Trades institutional signals with valid evidence and multi-factor Alpha Score >= 85.',
    enabled: true,
    eligibilityRules: {
      minAlphaScore: 85,
      minTraderSkill: 70,
      minCopyability: 65,
      minIndependentWallets: 2,
      minLiquidityUsd: 250000,
      maxPriceDisplacementPercent: 3.5
    },
    positionSizingRules: {
      allocationPercent: 5.0,
      maxPositions: 8,
      maxTokenExposurePercent: 10.0
    },
    riskRules: {
      stopLossPercent: 7.0,
      takeProfitPercent: 20.0,
      trailingStopPercent: 5.0
    }
  },
  {
    key: 'strategy-g-alpha-92',
    name: 'G — Alpha >= 92',
    description: 'High-conviction version demanding exceptional multi-factor Alpha Score >= 92.',
    enabled: true,
    eligibilityRules: {
      minAlphaScore: 92,
      minTraderSkill: 80,
      minCopyability: 75,
      minIndependentWallets: 3,
      minLiquidityUsd: 500000,
      maxPriceDisplacementPercent: 2.5
    },
    positionSizingRules: {
      allocationPercent: 8.0,
      maxPositions: 5,
      maxTokenExposurePercent: 15.0
    },
    riskRules: {
      stopLossPercent: 6.0,
      takeProfitPercent: 22.0,
      trailingStopPercent: 4.5
    }
  },
  {
    key: 'strategy-h-low-drawdown',
    name: 'H — Low Drawdown',
    description: 'Prioritizes lower volatility, deep liquidity ($1M+) and strictly bounded adverse excursion.',
    enabled: true,
    eligibilityRules: {
      minAlphaScore: 80,
      minTraderSkill: 75,
      minCopyability: 75,
      minIndependentWallets: 2,
      minLiquidityUsd: 1000000,
      maxPriceDisplacementPercent: 2.0,
      maxHistoricalAdverseExcursionPercent: 3.5
    },
    positionSizingRules: {
      allocationPercent: 4.0,
      maxPositions: 10,
      maxTokenExposurePercent: 8.0
    },
    riskRules: {
      stopLossPercent: 4.5,
      takeProfitPercent: 12.0,
      trailingStopPercent: 3.0
    }
  },
  {
    key: 'strategy-i-regime-adaptive',
    name: 'I — Regime Adaptive',
    description: 'Trades only when signal features strictly align with the detected macro market regime.',
    enabled: true,
    eligibilityRules: {
      minAlphaScore: 80,
      minTraderSkill: 70,
      minCopyability: 65,
      minIndependentWallets: 2,
      minLiquidityUsd: 300000,
      maxPriceDisplacementPercent: 4.0,
      allowedRegimes: ['Trending Up', 'Momentum Expansion']
    },
    positionSizingRules: {
      allocationPercent: 5.0,
      maxPositions: 8,
      maxTokenExposurePercent: 10.0
    },
    riskRules: {
      stopLossPercent: 6.5,
      takeProfitPercent: 18.0,
      trailingStopPercent: 5.0
    }
  },
  {
    key: 'strategy-j-combined-alphagraph',
    name: 'J — Combined AlphaGraph',
    description: 'Canonical institutional multi-factor AlphaGraph model balancing skill, flow, network & regime.',
    enabled: true,
    eligibilityRules: {
      minAlphaScore: 85,
      minTraderSkill: 75,
      minCopyability: 70,
      minIndependentWallets: 2,
      minLiquidityUsd: 250000,
      maxPriceDisplacementPercent: 3.5
    },
    positionSizingRules: {
      allocationPercent: 5.0,
      maxPositions: 8,
      maxTokenExposurePercent: 10.0
    },
    riskRules: {
      stopLossPercent: 7.0,
      takeProfitPercent: 20.0,
      trailingStopPercent: 5.0
    }
  }
];

export class StrategyLabEngine {
  private static portfolios: Map<string, StrategyPortfolio> = new Map();
  private static positions: Map<string, PaperPosition[]> = new Map();
  private static trades: Map<string, PaperTradeRecord[]> = new Map();
  private static decisions: Map<string, StrategyDecisionRecord[]> = new Map();
  private static isInitialized = false;

  /**
   * Validate that signal evidence is genuine and meets point-in-time quantitative rigor
   */
  public static validateSignalEvidence(signal: AlphaSignal): {
    valid: boolean;
    reason?: string;
    code?: string;
  } {
    // 1. Valid token mint address
    if (!signal.tokenAddress || signal.tokenAddress.length < 32) {
      return { valid: false, code: 'INVALID_TOKEN_MINT', reason: 'Token address is missing or invalid format.' };
    }

    // 2. Fresh price
    if (!signal.priceAtSignal || signal.priceAtSignal <= 0) {
      return { valid: false, code: 'PRICE_UNAVAILABLE', reason: 'Signal does not contain a verified positive price.' };
    }

    // 3. Real liquidity
    if (!signal.liquidityUsd || signal.liquidityUsd <= 0) {
      return { valid: false, code: 'LIQUIDITY_UNAVAILABLE', reason: 'Real liquidity measurement is unavailable.' };
    }

    // 4. Measured Trader Skill
    if (signal.features.traderSkillScore === undefined || signal.features.traderSkillScore === null) {
      return { valid: false, code: 'TRADER_SKILL_UNAVAILABLE', reason: 'Trader Skill Score has not been measured.' };
    }

    // 5. Measured Copyability
    if (signal.features.copyabilityScore === undefined || signal.features.copyabilityScore === null) {
      return { valid: false, code: 'COPYABILITY_UNAVAILABLE', reason: 'Copyability Score has not been measured.' };
    }

    // 6. Real independent consensus
    if (signal.independentEliteCount === undefined || signal.independentEliteCount === null) {
      return { valid: false, code: 'CONSENSUS_UNAVAILABLE', reason: 'Independent wallet consensus has not been measured.' };
    }

    // 7. Market regime
    if (!signal.currentRegime) {
      return { valid: false, code: 'REGIME_UNAVAILABLE', reason: 'Current market regime classification is missing.' };
    }

    // 8. Historical expectancy with sample validation
    const exp = signal.historicalExpectancy;
    if (!exp || exp.similarEventsCount < 10) {
      return {
        valid: false,
        code: 'INSUFFICIENT_SAMPLE',
        reason: `Historical expectancy sample (${exp?.similarEventsCount ?? 0}) is under minimum sample threshold (10).`
      };
    }

    return { valid: true };
  }

  /**
   * Initialize 10 strategy portfolios at $5,000 virtual capital each.
   */
  public static async init(storage: StorageAdapter, appMode: string = 'live_paper'): Promise<void> {
    this.portfolios.clear();
    this.positions.clear();
    this.trades.clear();
    this.decisions.clear();

    for (const def of STRATEGY_DEFINITIONS) {
      const existing = await storage.getPortfolio(def.key);
      const openPositions = await storage.getOpenPositions(def.key);
      const tradeRecords = await storage.getTrades(def.key);

      this.positions.set(def.key, openPositions || []);
      this.trades.set(def.key, tradeRecords || []);

      if (existing) {
        const closedCount = tradeRecords.length;
        const wins = tradeRecords.filter(t => t.realizedPnlUsd > 0).length;
        const losses = tradeRecords.filter(t => t.realizedPnlUsd < 0).length;
        const winRate = closedCount >= MIN_STRATEGY_SAMPLE_TRADES ? Number(((wins / closedCount) * 100).toFixed(2)) : null;

        const grossProfits = tradeRecords.filter(t => t.realizedPnlUsd > 0).reduce((acc, t) => acc + t.realizedPnlUsd, 0);
        const grossLosses = Math.abs(tradeRecords.filter(t => t.realizedPnlUsd < 0).reduce((acc, t) => acc + t.realizedPnlUsd, 0));
        const profitFactor = closedCount >= MIN_STRATEGY_SAMPLE_TRADES 
          ? (grossLosses > 0 ? Number((grossProfits / grossLosses).toFixed(2)) : (grossProfits > 0 ? 10.0 : null)) 
          : null;

        const equityHistory = await storage.getStrategyEquitySnapshots(def.key, 1000);
        const stratPortfolio: StrategyPortfolio = {
          ...existing,
          status: def.enabled ? (closedCount > 0 ? 'ACTIVE' : 'WAITING_FOR_DATA') : 'PAUSED',
          strategyDefinition: def,
          closedTradesCount: closedCount,
          sampleStatus: closedCount >= MIN_STRATEGY_SAMPLE_TRADES ? 'VALID_SAMPLE' : 'INSUFFICIENT_SAMPLE',
          winsCount: wins,
          lossesCount: losses,
          winRatePercent: winRate,
          profitFactor: profitFactor,
          sharpeRatio: null,
          expectedValuePerTradeUsd: closedCount >= MIN_STRATEGY_SAMPLE_TRADES ? Number(((grossProfits - grossLosses) / closedCount).toFixed(2)) : null,
          provenanceStatus: appMode === 'demo' ? 'DEMO' : 'LIVE'
        };
        this.portfolios.set(def.key, stratPortfolio);
      } else {
        const equityHistory = await storage.getStrategyEquitySnapshots(def.key, 1000);
        const initialPortfolio: StrategyPortfolio = {
          id: def.key,
          name: def.name,
          description: def.description,
          strategyKey: def.key,
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
          winRatePercent: null,
          profitFactor: null,
          expectedValuePerTradeUsd: null,
          sharpeRatio: null,
          averageSlippageBps: 30,
          averageDetectionLatencyMs: 600,
          copyEfficiencyPercent: 100,
          totalTradesCount: 0,
          openPositionsCount: 0,
          totalFeesPaidUsd: 0.00,
          status: 'WAITING_FOR_DATA',
          strategyDefinition: def,
          closedTradesCount: 0,
          sampleStatus: 'INSUFFICIENT_SAMPLE',
          winsCount: 0,
          lossesCount: 0,
          provenanceStatus: appMode === 'demo' ? 'DEMO' : 'LIVE',
          equityHistory: [
            {
              timestamp: new Date().toISOString().slice(0, 10),
              equity: 5000.00,
              drawdownPercent: 0,
              solBenchmark: 100,
              btcBenchmark: 100,
              ethBenchmark: 100
            }
          ]
        };

        await storage.savePortfolio(initialPortfolio);
        this.portfolios.set(def.key, initialPortfolio);
      }
    }

    this.isInitialized = true;
  }

  public static isEngineInitialized(): boolean {
    return this.isInitialized;
  }

  public static getStrategies(): StrategyPortfolio[] {
    return Array.from(this.portfolios.values());
  }

  public static getBotPortfolios(): StrategyPortfolio[] {
    return this.getStrategies();
  }

  public static getStrategy(key: string): StrategyPortfolio | null {
    return this.portfolios.get(key) || null;
  }

  public static getOpenPositions(key: string): PaperPosition[] {
    return this.positions.get(key) || [];
  }

  public static getClosedTrades(key: string): PaperTradeRecord[] {
    return this.trades.get(key) || [];
  }

  public static getDecisions(key: string): StrategyDecisionRecord[] {
    return this.decisions.get(key) || [];
  }

  /**
   * Evaluate an AlphaSignal against all 10 independent strategies
   */
  public static async evaluateSignalAcrossStrategies(
    signal: AlphaSignal,
    storage: StorageAdapter,
    appMode: string = 'live_paper'
  ): Promise<StrategyDecisionRecord[]> {
    const records: StrategyDecisionRecord[] = [];

    // Part H: Check evidence validation first
    const evidenceCheck = this.validateSignalEvidence(signal);

    for (const def of STRATEGY_DEFINITIONS) {
      const portfolio = this.portfolios.get(def.key);
      if (!portfolio) continue;

      const openPositions = this.positions.get(def.key) || [];
      const decisionId = `dec-${def.key}-${signal.id}-${Date.now()}`;

      // If strategy is paused
      if (signal.dataStatus === 'INSUFFICIENT_DATA') {
        const record: StrategyDecisionRecord = {
          id: decisionId,
          strategyKey: def.key,
          strategyName: def.name,
          tokenAddress: signal.tokenAddress,
          tokenSymbol: signal.tokenSymbol,
          allocatedPositionUsd: null,
          signalId: signal.id,
          decision: 'REJECTED',
          reason: 'Signal contains insufficient data or blocked synthetic features.',
          evaluatedAt: new Date().toISOString(),
          alphaScore: signal.alphaScore,
          featureSnapshot: { ...signal.features }
        };
        await this.recordDecision(def.key, record, storage);
        records.push(record);
        continue;
      }

      if (portfolio.status === 'PAUSED') {
        const record: StrategyDecisionRecord = {
          id: decisionId,
          strategyKey: def.key,
          strategyName: def.name,
          tokenAddress: signal.tokenAddress,
          tokenSymbol: signal.tokenSymbol,
          allocatedPositionUsd: null,
          signalId: signal.id,
          decision: 'REJECTED',
          reason: 'Strategy is currently paused by operator.',
          evaluatedAt: new Date().toISOString(),
          alphaScore: signal.alphaScore,
          featureSnapshot: { ...signal.features }
        };
        await this.recordDecision(def.key, record, storage);
        records.push(record);
        continue;
      }

      // If base evidence is missing or invalid
      if (!evidenceCheck.valid) {
        const record: StrategyDecisionRecord = {
          id: decisionId,
          strategyKey: def.key,
          strategyName: def.name,
          tokenAddress: signal.tokenAddress,
          tokenSymbol: signal.tokenSymbol,
          allocatedPositionUsd: null,
          signalId: signal.id,
          decision: 'WATCHED',
          reason: `Insufficient baseline evidence: ${evidenceCheck.reason}`,
          evaluatedAt: new Date().toISOString(),
          alphaScore: signal.alphaScore,
          featureSnapshot: { ...signal.features }
        };
        await this.recordDecision(def.key, record, storage);
        records.push(record);
        continue;
      }

      // Check Strategy-Specific Eligibility
      const elig = def.eligibilityRules;

      if (signal.alphaScore < elig.minAlphaScore) {
        const record: StrategyDecisionRecord = {
          id: decisionId,
          strategyKey: def.key,
          strategyName: def.name,
          tokenAddress: signal.tokenAddress,
          tokenSymbol: signal.tokenSymbol,
          allocatedPositionUsd: null,
          signalId: signal.id,
          decision: 'REJECTED',
          reason: `Alpha score (${signal.alphaScore}) is below strategy threshold (${elig.minAlphaScore}).`,
          evaluatedAt: new Date().toISOString(),
          alphaScore: signal.alphaScore,
          featureSnapshot: { ...signal.features }
        };
        await this.recordDecision(def.key, record, storage);
        records.push(record);
        continue;
      }

      if ((signal.features.traderSkillScore?.value || 0) < elig.minTraderSkill) {
        const record: StrategyDecisionRecord = {
          id: decisionId,
          strategyKey: def.key,
          strategyName: def.name,
          tokenAddress: signal.tokenAddress,
          tokenSymbol: signal.tokenSymbol,
          allocatedPositionUsd: null,
          signalId: signal.id,
          decision: 'REJECTED',
          reason: `Trader skill (${signal.features.traderSkillScore?.value || 0}) below required (${elig.minTraderSkill}).`,
          evaluatedAt: new Date().toISOString(),
          alphaScore: signal.alphaScore,
          featureSnapshot: { ...signal.features }
        };
        await this.recordDecision(def.key, record, storage);
        records.push(record);
        continue;
      }

      if ((signal.features.copyabilityScore?.value || 0) < elig.minCopyability) {
        const record: StrategyDecisionRecord = {
          id: decisionId,
          strategyKey: def.key,
          strategyName: def.name,
          tokenAddress: signal.tokenAddress,
          tokenSymbol: signal.tokenSymbol,
          allocatedPositionUsd: null,
          signalId: signal.id,
          decision: 'REJECTED',
          reason: `Copyability (${signal.features.copyabilityScore?.value || 0}) below required (${elig.minCopyability}).`,
          evaluatedAt: new Date().toISOString(),
          alphaScore: signal.alphaScore,
          featureSnapshot: { ...signal.features }
        };
        await this.recordDecision(def.key, record, storage);
        records.push(record);
        continue;
      }

      if (signal.independentEliteCount < elig.minIndependentWallets) {
        const record: StrategyDecisionRecord = {
          id: decisionId,
          strategyKey: def.key,
          strategyName: def.name,
          tokenAddress: signal.tokenAddress,
          tokenSymbol: signal.tokenSymbol,
          allocatedPositionUsd: null,
          signalId: signal.id,
          decision: 'REJECTED',
          reason: `Independent consensus count (${signal.independentEliteCount}) below required (${elig.minIndependentWallets}).`,
          evaluatedAt: new Date().toISOString(),
          alphaScore: signal.alphaScore,
          featureSnapshot: { ...signal.features }
        };
        await this.recordDecision(def.key, record, storage);
        records.push(record);
        continue;
      }

      if (elig.minLiquidityUsd && (signal.liquidityUsd || 0) < elig.minLiquidityUsd) {
        const record: StrategyDecisionRecord = {
          id: decisionId,
          strategyKey: def.key,
          strategyName: def.name,
          tokenAddress: signal.tokenAddress,
          tokenSymbol: signal.tokenSymbol,
          allocatedPositionUsd: null,
          signalId: signal.id,
          decision: 'REJECTED',
          reason: `Token liquidity ($${signal.liquidityUsd || 0}) below required ($${elig.minLiquidityUsd}).`,
          evaluatedAt: new Date().toISOString(),
          alphaScore: signal.alphaScore,
          featureSnapshot: { ...signal.features }
        };
        await this.recordDecision(def.key, record, storage);
        records.push(record);
        continue;
      }

      if (elig.maxPriceDisplacementPercent && signal.priceDisplacementFromVwapPercent > elig.maxPriceDisplacementPercent) {
        const record: StrategyDecisionRecord = {
          id: decisionId,
          strategyKey: def.key,
          strategyName: def.name,
          tokenAddress: signal.tokenAddress,
          tokenSymbol: signal.tokenSymbol,
          allocatedPositionUsd: null,
          signalId: signal.id,
          decision: 'REJECTED',
          reason: `Price displacement from VWAP (${signal.priceDisplacementFromVwapPercent}%) exceeds maximum (${elig.maxPriceDisplacementPercent}%).`,
          evaluatedAt: new Date().toISOString(),
          alphaScore: signal.alphaScore,
          featureSnapshot: { ...signal.features }
        };
        await this.recordDecision(def.key, record, storage);
        records.push(record);
        continue;
      }

      if (elig.allowedRegimes && elig.allowedRegimes.length > 0 && !elig.allowedRegimes.includes(signal.currentRegime)) {
        const record: StrategyDecisionRecord = {
          id: decisionId,
          strategyKey: def.key,
          strategyName: def.name,
          tokenAddress: signal.tokenAddress,
          tokenSymbol: signal.tokenSymbol,
          allocatedPositionUsd: null,
          signalId: signal.id,
          decision: 'REJECTED',
          reason: `Current market regime '${signal.currentRegime}' does not match allowed regimes: [${elig.allowedRegimes.join(', ')}].`,
          evaluatedAt: new Date().toISOString(),
          alphaScore: signal.alphaScore,
          featureSnapshot: { ...signal.features }
        };
        await this.recordDecision(def.key, record, storage);
        records.push(record);
        continue;
      }

      if (elig.requiresConsensus && signal.independentEliteCount < 3) {
        const record: StrategyDecisionRecord = {
          id: decisionId,
          strategyKey: def.key,
          strategyName: def.name,
          tokenAddress: signal.tokenAddress,
          tokenSymbol: signal.tokenSymbol,
          allocatedPositionUsd: null,
          signalId: signal.id,
          decision: 'REJECTED',
          reason: 'Strategy requires >= 3 independent wallet consensus clusters.',
          evaluatedAt: new Date().toISOString(),
          alphaScore: signal.alphaScore,
          featureSnapshot: { ...signal.features }
        };
        await this.recordDecision(def.key, record, storage);
        records.push(record);
        continue;
      }

      if (elig.requiresConvictionSurprise && (signal.features.convictionSurpriseScore?.value || 0) < 75) {
        const record: StrategyDecisionRecord = {
          id: decisionId,
          strategyKey: def.key,
          strategyName: def.name,
          tokenAddress: signal.tokenAddress,
          tokenSymbol: signal.tokenSymbol,
          allocatedPositionUsd: null,
          signalId: signal.id,
          decision: 'REJECTED',
          reason: `Conviction surprise score (${signal.features.convictionSurpriseScore?.value || 0}) below required 75.`,
          evaluatedAt: new Date().toISOString(),
          alphaScore: signal.alphaScore,
          featureSnapshot: { ...signal.features }
        };
        await this.recordDecision(def.key, record, storage);
        records.push(record);
        continue;
      }

      if (elig.requiresFlowAcceleration && (signal.features.smartMoneyAccelerationScore?.value || 0) < 75) {
        const record: StrategyDecisionRecord = {
          id: decisionId,
          strategyKey: def.key,
          strategyName: def.name,
          tokenAddress: signal.tokenAddress,
          tokenSymbol: signal.tokenSymbol,
          allocatedPositionUsd: null,
          signalId: signal.id,
          decision: 'REJECTED',
          reason: `Flow acceleration score (${signal.features.smartMoneyAccelerationScore?.value || 0}) below required 75.`,
          evaluatedAt: new Date().toISOString(),
          alphaScore: signal.alphaScore,
          featureSnapshot: { ...signal.features }
        };
        await this.recordDecision(def.key, record, storage);
        records.push(record);
        continue;
      }

      if (elig.requiresEmergingTrader && (signal.features.emergingTraderScore?.value || 0) < 70) {
        const record: StrategyDecisionRecord = {
          id: decisionId,
          strategyKey: def.key,
          strategyName: def.name,
          tokenAddress: signal.tokenAddress,
          tokenSymbol: signal.tokenSymbol,
          allocatedPositionUsd: null,
          signalId: signal.id,
          decision: 'REJECTED',
          reason: `Emerging trader score (${signal.features.emergingTraderScore?.value || 0}) below required 70.`,
          evaluatedAt: new Date().toISOString(),
          alphaScore: signal.alphaScore,
          featureSnapshot: { ...signal.features }
        };
        await this.recordDecision(def.key, record, storage);
        records.push(record);
        continue;
      }

      if (elig.maxHistoricalAdverseExcursionPercent) {
        const mae = signal.historicalExpectancy?.maxAdverseExcursionPercent ?? 10;
        if (mae > elig.maxHistoricalAdverseExcursionPercent) {
          const record: StrategyDecisionRecord = {
            id: decisionId,
            strategyKey: def.key,
          strategyName: def.name,
          tokenAddress: signal.tokenAddress,
          tokenSymbol: signal.tokenSymbol,
          allocatedPositionUsd: null,
            signalId: signal.id,
            decision: 'REJECTED',
            reason: `Historical MAE (${mae}%) exceeds low-drawdown threshold (${elig.maxHistoricalAdverseExcursionPercent}%).`,
            evaluatedAt: new Date().toISOString(),
            alphaScore: signal.alphaScore,
            featureSnapshot: { ...signal.features }
          };
          await this.recordDecision(def.key, record, storage);
          records.push(record);
          continue;
        }
      }

      // Check Portfolio Constraints
      if (openPositions.length >= def.positionSizingRules.maxPositions) {
        const record: StrategyDecisionRecord = {
          id: decisionId,
          strategyKey: def.key,
          strategyName: def.name,
          tokenAddress: signal.tokenAddress,
          tokenSymbol: signal.tokenSymbol,
          allocatedPositionUsd: null,
          signalId: signal.id,
          decision: 'WATCHED',
          reason: `Strategy portfolio open positions (${openPositions.length}) reached max capacity (${def.positionSizingRules.maxPositions}).`,
          evaluatedAt: new Date().toISOString(),
          alphaScore: signal.alphaScore,
          featureSnapshot: { ...signal.features }
        };
        await this.recordDecision(def.key, record, storage);
        records.push(record);
        continue;
      }

      const existingExposure = openPositions.find(p => p.tokenAddress.toLowerCase() === signal.tokenAddress.toLowerCase());
      if (existingExposure) {
        const record: StrategyDecisionRecord = {
          id: decisionId,
          strategyKey: def.key,
          strategyName: def.name,
          tokenAddress: signal.tokenAddress,
          tokenSymbol: signal.tokenSymbol,
          allocatedPositionUsd: null,
          signalId: signal.id,
          decision: 'WATCHED',
          reason: `Duplicate token exposure: Strategy already holds position in ${signal.tokenSymbol}.`,
          evaluatedAt: new Date().toISOString(),
          alphaScore: signal.alphaScore,
          featureSnapshot: { ...signal.features }
        };
        await this.recordDecision(def.key, record, storage);
        records.push(record);
        continue;
      }

      // Calculate Position Sizing
      const targetAllocationUsd = portfolio.startingCapitalUsd * (def.positionSizingRules.allocationPercent / 100);
      if (portfolio.cashUsd < targetAllocationUsd) {
        const record: StrategyDecisionRecord = {
          id: decisionId,
          strategyKey: def.key,
          strategyName: def.name,
          tokenAddress: signal.tokenAddress,
          tokenSymbol: signal.tokenSymbol,
          allocatedPositionUsd: null,
          signalId: signal.id,
          decision: 'WATCHED',
          reason: `Insufficient cash ($${portfolio.cashUsd.toFixed(2)}) for required allocation ($${targetAllocationUsd.toFixed(2)}).`,
          evaluatedAt: new Date().toISOString(),
          alphaScore: signal.alphaScore,
          featureSnapshot: { ...signal.features }
        };
        await this.recordDecision(def.key, record, storage);
        records.push(record);
        continue;
      }

      // Execution: In live mode, verify executable Jupiter quote
      let fillPrice = signal.priceAtSignal;
      let latencyMs = 350;
      let slippagePercent = 0.35;

      if (appMode === 'live_paper') {
        try {
          const decimals = await RealDataProviders.getTokenDecimals(signal.tokenAddress);
          const rawQuote = await RealDataProviders.getJupiterQuote(
            'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
            signal.tokenAddress,
            Math.round(targetAllocationUsd * 1e6)
          );
          if (rawQuote.outAmountUi > 0) {
            fillPrice = targetAllocationUsd / rawQuote.outAmountUi;
            latencyMs = rawQuote.latencyMs;
            slippagePercent = rawQuote.priceImpactPct;
          }
        } catch (err: any) {
          const record: StrategyDecisionRecord = {
            id: decisionId,
            strategyKey: def.key,
          strategyName: def.name,
          tokenAddress: signal.tokenAddress,
          tokenSymbol: signal.tokenSymbol,
          allocatedPositionUsd: null,
            signalId: signal.id,
            decision: 'WATCHED',
            reason: `Executable Jupiter quote failed: ${err.message}`,
            evaluatedAt: new Date().toISOString(),
            alphaScore: signal.alphaScore,
            featureSnapshot: { ...signal.features }
          };
          await this.recordDecision(def.key, record, storage);
          records.push(record);
          continue;
        }
      }

      // Create Position for this strategy
      const tokenAmount = fillPrice > 0 ? targetAllocationUsd / fillPrice : 0;
      const stopLossPrice = fillPrice * (1 - def.riskRules.stopLossPercent / 100);
      const takeProfitPrice = fillPrice * (1 + def.riskRules.takeProfitPercent / 100);
      const trailingStopPrice = def.riskRules.trailingStopPercent
        ? fillPrice * (1 - def.riskRules.trailingStopPercent / 100)
        : undefined;

      const newPosition: PaperPosition = {
        id: `pos-${def.key}-${signal.tokenSymbol}-${Date.now()}`,
        portfolioId: def.key,
        tokenSymbol: signal.tokenSymbol,
        tokenAddress: signal.tokenAddress,
        openedAt: new Date().toISOString(),
        openPrice: fillPrice,
        currentPrice: fillPrice,
        amount: tokenAmount,
        costBasisUsd: targetAllocationUsd,
        currentValueUsd: targetAllocationUsd,
        unrealizedPnlUsd: 0.00,
        unrealizedReturnPercent: 0.00,
        allocationPercent: def.positionSizingRules.allocationPercent,
        stopLossPrice,
        takeProfitPrice,
        trailingStopPrice,
        strategyName: def.name,
        signalId: signal.id,
        signalAlphaScore: signal.alphaScore,
        detectionLatencyMs: latencyMs,
        slippageIncurredPercent: slippagePercent
      };

      openPositions.unshift(newPosition);
      this.positions.set(def.key, openPositions);

      // Update Portfolio Ledger
      portfolio.cashUsd -= targetAllocationUsd;
      portfolio.positionsValueUsd += targetAllocationUsd;
      portfolio.openPositionsCount = openPositions.length;
      portfolio.totalTradesCount += 1;
      portfolio.status = 'ACTIVE';

      await storage.savePosition(newPosition);
      await storage.savePortfolio(portfolio);

      const tradedRecord: StrategyDecisionRecord = {
        id: decisionId,
        strategyKey: def.key,
          strategyName: def.name,
          tokenAddress: signal.tokenAddress,
          tokenSymbol: signal.tokenSymbol,
          allocatedPositionUsd: null,
        signalId: signal.id,
        decision: 'TRADED',
        reason: `Eligible signal executed. Opened $${targetAllocationUsd.toFixed(2)} position at $${fillPrice.toFixed(4)}.`,
        evaluatedAt: new Date().toISOString(),
        alphaScore: signal.alphaScore,
        featureSnapshot: { ...signal.features }
      };
      await this.recordDecision(def.key, tradedRecord, storage);
      records.push(tradedRecord);
    }

    return records;
  }

  /**
   * Monitor and Mark-to-Market open positions for each strategy portfolio.
   * In live mode, uses fresh prices, avoids stale SL triggers, and executes exits via Jupiter quotes.
   */
  public static async markToMarket(
    storage: StorageAdapter,
    appMode: string = 'live_paper'
  ): Promise<void> {
    for (const def of STRATEGY_DEFINITIONS) {
      const portfolio = this.portfolios.get(def.key);
      if (!portfolio) continue;

      const openPositions = this.positions.get(def.key) || [];
      if (openPositions.length === 0) continue;

      const remainingPositions: PaperPosition[] = [];
      const closedTrades = this.trades.get(def.key) || [];
      let totalPositionsValue = 0;
      let totalUnrealizedPnl = 0;
      let cashUpdated = portfolio.cashUsd;
      let realizedPnlUpdated = portfolio.realizedPnlUsd;

      for (const pos of openPositions) {
        // Fetch price with freshness check
        let currentPrice = pos.currentPrice;
        let isPriceFresh = false;

        try {
          const priceRec = await RealDataProviders.fetchBirdeyePrice(pos.tokenAddress);
          if (priceRec && priceRec.priceUsd > 0) {
            currentPrice = priceRec.priceUsd;
            isPriceFresh = true;
          }
        } catch {
          isPriceFresh = false;
        }

        const currentValue = pos.amount * currentPrice;
        const unrealizedPnl = currentValue - pos.costBasisUsd;
        const unrealizedReturnPct = pos.costBasisUsd > 0 ? (unrealizedPnl / pos.costBasisUsd) * 100 : 0;

        // Update trailing stop if price advanced
        let trailingStop = pos.trailingStopPrice;
        if (trailingStop && currentPrice > pos.openPrice * 1.05) {
          const trailPct = def.riskRules.trailingStopPercent || 5.0;
          const candidateStop = currentPrice * (1 - trailPct / 100);
          if (candidateStop > trailingStop) {
            trailingStop = candidateStop;
          }
        }

        // Only evaluate exits if price is FRESH! Stale price must NOT trigger SL/TP.
        let exitReason: 'STOP_LOSS' | 'TAKE_PROFIT' | 'TRAILING_STOP' | null = null;
        if (isPriceFresh) {
          if (currentPrice <= pos.stopLossPrice) {
            exitReason = 'STOP_LOSS';
          } else if (currentPrice >= pos.takeProfitPrice) {
            exitReason = 'TAKE_PROFIT';
          } else if (trailingStop && currentPrice <= trailingStop) {
            exitReason = 'TRAILING_STOP';
          }
        }

        if (exitReason) {
          // Execute exit
          let proceedsUsd = currentValue * 0.9965;
          let slippagePaid = currentValue * 0.0035;

          if (appMode === 'live_paper') {
            try {
              const tokenDecimals = await RealDataProviders.getTokenDecimals(pos.tokenAddress);
              const amountRaw = Math.round(pos.amount * Math.pow(10, tokenDecimals));
              const quote = await RealDataProviders.getJupiterQuote(
                pos.tokenAddress,
                'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
                amountRaw
              );
              if (quote.outAmountUi > 0) {
                proceedsUsd = quote.outAmountUi;
                slippagePaid = proceedsUsd * (quote.priceImpactPct / 100);
              }
            } catch (err: any) {
              // Exit quote unavailable; keep position open with UNAVAILABLE exit flag
              console.warn(`[StrategyLab]: Exit quote unavailable for ${pos.tokenSymbol}: ${err.message}`);
              remainingPositions.push(pos);
              totalPositionsValue += currentValue;
              totalUnrealizedPnl += unrealizedPnl;
              continue;
            }
          }

          const realizedPnl = proceedsUsd - pos.costBasisUsd;
          const returnPct = pos.costBasisUsd > 0 ? (realizedPnl / pos.costBasisUsd) * 100 : 0;

          const closedTrade: PaperTradeRecord = {
            id: `trade-${pos.id}-${Date.now()}`,
            portfolioId: def.key,
            tokenSymbol: pos.tokenSymbol,
            tokenAddress: pos.tokenAddress,
            openedAt: pos.openedAt,
            closedAt: new Date().toISOString(),
            openPrice: pos.openPrice,
            closePrice: currentPrice,
            amount: pos.amount,
            costBasisUsd: pos.costBasisUsd,
            proceedsUsd,
            realizedPnlUsd: realizedPnl,
            returnPercent: Number(returnPct.toFixed(2)),
            holdingPeriodMinutes: Math.max(1, Math.round((Date.now() - new Date(pos.openedAt).getTime()) / 60000)),
            exitReason,
            strategyName: def.name,
            feesPaidUsd: 0.05,
            slippagePaidUsd: slippagePaid
          };

          closedTrades.unshift(closedTrade);
          cashUpdated += proceedsUsd;
          realizedPnlUpdated += realizedPnl;

          await storage.saveTrade(closedTrade);
          await storage.removePosition(pos.id);
        } else {
          const updatedPos: PaperPosition = {
            ...pos,
            currentPrice,
            currentValueUsd: currentValue,
            unrealizedPnlUsd: unrealizedPnl,
            unrealizedReturnPercent: Number(unrealizedReturnPct.toFixed(2)),
            trailingStopPrice: trailingStop
          };
          remainingPositions.push(updatedPos);
          totalPositionsValue += currentValue;
          totalUnrealizedPnl += unrealizedPnl;

          await storage.savePosition(updatedPos);
        }
      }

      this.positions.set(def.key, remainingPositions);
      this.trades.set(def.key, closedTrades);

      const totalEquity = cashUpdated + totalPositionsValue;
      const totalReturnPct = portfolio.startingCapitalUsd > 0
        ? Number((((totalEquity - portfolio.startingCapitalUsd) / portfolio.startingCapitalUsd) * 100).toFixed(2))
        : 0;

      // Metrics
      const closedCount = closedTrades.length;
      const wins = closedTrades.filter(t => t.realizedPnlUsd > 0).length;
      const losses = closedTrades.filter(t => t.realizedPnlUsd < 0).length;
      const winRate = closedCount >= MIN_STRATEGY_SAMPLE_TRADES ? Number(((wins / closedCount) * 100).toFixed(2)) : null;

      const grossProfits = closedTrades.filter(t => t.realizedPnlUsd > 0).reduce((acc, t) => acc + t.realizedPnlUsd, 0);
      const grossLosses = Math.abs(closedTrades.filter(t => t.realizedPnlUsd < 0).reduce((acc, t) => acc + t.realizedPnlUsd, 0));
      const profitFactor = closedCount >= MIN_STRATEGY_SAMPLE_TRADES
        ? (grossLosses > 0 ? Number((grossProfits / grossLosses).toFixed(2)) : (grossProfits > 0 ? 10.0 : null))
        : null;

      portfolio.cashUsd = Number(cashUpdated.toFixed(2));
      portfolio.positionsValueUsd = Number(totalPositionsValue.toFixed(2));
      portfolio.totalEquityUsd = Number(totalEquity.toFixed(2));
      portfolio.totalReturnPercent = totalReturnPct;
      portfolio.realizedPnlUsd = Number(realizedPnlUpdated.toFixed(2));
      portfolio.unrealizedPnlUsd = Number(totalUnrealizedPnl.toFixed(2));
      portfolio.openPositionsCount = remainingPositions.length;
      portfolio.closedTradesCount = closedCount;
      portfolio.winsCount = wins;
      portfolio.lossesCount = losses;
      portfolio.winRatePercent = winRate;
      portfolio.profitFactor = profitFactor;
      
      portfolio.sampleStatus = closedCount >= MIN_STRATEGY_SAMPLE_TRADES ? 'VALID_SAMPLE' : 'INSUFFICIENT_SAMPLE';

      // Calculate Real Drawdown
      const peakEquity = portfolio.equityHistory.reduce((max, point) => Math.max(max, point.equity), portfolio.startingCapitalUsd);
      const currentDrawdown = peakEquity > 0 ? ((totalEquity - peakEquity) / peakEquity) * 100 : 0;
      portfolio.maxDrawdownPercent = Math.min(portfolio.maxDrawdownPercent, currentDrawdown);

      // Append equity point if changed
      const lastPoint = portfolio.equityHistory.length > 0 ? portfolio.equityHistory[portfolio.equityHistory.length - 1] : null;
      if (!lastPoint || Math.abs(lastPoint.equity - totalEquity) > 0.01) {
        const timestampIso = new Date().toISOString();
        portfolio.equityHistory.push({
          timestamp: timestampIso,
          equity: Number(totalEquity.toFixed(2)),
          drawdownPercent: Number(currentDrawdown.toFixed(2)),
          solBenchmark: 100,
          btcBenchmark: 100,
          ethBenchmark: 100
        });
        
        await storage.saveStrategyEquitySnapshot({
          id: `snap-${def.key}-${Date.now()}`,
          strategyKey: def.key,
          timestamp: timestampIso,
          equityUsd: Number(totalEquity.toFixed(2)),
          drawdownPercent: Number(currentDrawdown.toFixed(2))
        });
      }

      await storage.savePortfolio(portfolio);

    }
  }

  public static async pauseStrategy(key: string, storage: StorageAdapter): Promise<boolean> {
    const portfolio = this.portfolios.get(key);
    if (!portfolio) return false;
    portfolio.status = 'PAUSED';
    await storage.savePortfolio(portfolio);
    return true;
  }

  public static async resumeStrategy(key: string, storage: StorageAdapter): Promise<boolean> {
    const portfolio = this.portfolios.get(key);
    if (!portfolio) return false;
    portfolio.status = portfolio.closedTradesCount > 0 ? 'ACTIVE' : 'WAITING_FOR_DATA';
    await storage.savePortfolio(portfolio);
    return true;
  }

  private static async recordDecision(strategyKey: string, record: StrategyDecisionRecord, storage?: StorageAdapter): Promise<void> {
    const list = this.decisions.get(strategyKey) || [];
    list.unshift(record);
    if (list.length > 50) list.pop();
    this.decisions.set(strategyKey, list);
    if (storage) { await storage.saveStrategyDecision(record); }
  }
}
