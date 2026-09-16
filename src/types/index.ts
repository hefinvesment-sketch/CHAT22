export type BlockchainNetwork = 'solana' | 'ethereum' | 'bitcoin' | 'evm';

export type MarketRegime = 
  | 'Risk-On'
  | 'Risk-Off'
  | 'Trending Up'
  | 'Trending Down'
  | 'Sideways'
  | 'High Volatility'
  | 'Low Volatility'
  | 'SOL Ecosystem Expansion'
  | 'Liquidity Expansion'
  | 'Liquidity Contraction';

export type SignalState = 
  | 'IGNORE'
  | 'WATCH'
  | 'STRONG RESEARCH SIGNAL'
  | 'PAPER TRADE ELIGIBLE'
  | 'HIGH-CONVICTION PAPER TRADE';

export type DecisionStatus = 'TRADED' | 'REJECTED' | 'WATCHED' | 'IGNORED';

export type TraderMomentum = 'Improving' | 'Stable' | 'Deteriorating' | 'Severely Deteriorating';

export type RelationshipType = 'Likely Independent' | 'Possibly Related' | 'Strong Relationship' | 'Unknown';

export interface WalletHolding {
  tokenSymbol: string;
  tokenAddress: string;
  amount: number;
  usdValue: number;
  percentageOfPortfolio: number;
}

export interface TraderGenome {
  overallSkill: number; // 0-100
  momentumSkill: number;
  swingTradingSkill: number;
  earlyEntrySkill: number;
  largeCapSkill: number;
  midCapSkill: number;
  smallCapSkill: number;
  solEcosystemSkill: number;
  memecoinSkill: number;
  riskOnSkill: number;
  riskOffSkill: number;
  highVolatilitySkill: number;
  lowVolatilitySkill: number;
  trendFollowingSkill: number;
  meanReversionSkill: number;
  exitSkill: number;
  entrySkill: number;
  drawdownControl: number;
  diversificationQuality: number;
  medianPositionPercent: number;
  medianHoldingTimeHours: number;
  bestMarketRegime: string;
  preferredMarketCap: string;
}

export interface WalletCopyability {
  copyabilityScore: number; // 0-100
  sourceTraderReturn: number; // e.g. +84.2%
  achievableSimulatedReturn: number; // e.g. +61.5%
  latencyLossPercent: number; // e.g. -4.8%
  slippageLossPercent: number; // e.g. -7.2%
  feeLossPercent: number; // e.g. -2.1%
  missedTradePercent: number; // e.g. 5.0%
  exitMismatchLossPercent: number; // e.g. -8.6%
  copyEfficiency: number; // e.g. 73.0% (achievable / source)
  averageDetectionLatencyMs: number;
  averageSlippageBps: number;
  recommendation: 'EXCELLENT_TO_COPY' | 'MODERATE_VIABILITY' | 'DO_NOT_COPY';
}

export interface WalletProfile {
  address: string;
  label?: string;
  firstSeenDaysAgo: number | null;
  walletAgeDays: number | null;
  portfolioValueUsd: number | null;
  solBalance: number | null;
  usdtBalance: number | null;
  usdcBalance: number | null;
  wbtcBalance: number | null;
  wethBalance: number | null;
  coreAssetRatio: number | null; // SOL + USDT + USDC + WBTC + WETH / total
  tradeCount: number;
  tokensTradedCount: number;
  realizedPnlUsd: number | null;
  unrealizedPnlUsd: number | null;
  winRate: number | null; // 0-100
  profitFactor: number | null;
  maxDrawdownPercent: number | null;
  avgHoldingTimeHours: number | null;
  qualityScore: number | null; // 0-100
  consistencyScore: number | null;
  returnScore: number | null;
  drawdownScore: number | null;
  sampleScore: number | null;
  concentrationPenalty: number | null;
  top1TradeProfitPercent: number | null;
  top3TradeProfitPercent: number | null;
  top5TradeProfitPercent: number | null;
  top10TradeProfitPercent: number | null;
  emergingAlphaScore: number | null; // 0-100
  momentumStatus: TraderMomentum | null;
  genome: TraderGenome | null;
  copyability: WalletCopyability | null;
  isEligibleSmartMoney: boolean;
  clusterId?: string | null;
  relatedWalletsCount: number;
  holdings: WalletHolding[];
  rollingScores: {
    sevenDay: number;
    fourteenDay: number;
    thirtyDay: number;
    sixtyDay: number;
    ninetyDay: number;
    oneEightyDay: number;
    lifetime: number;
  } | null;
}

export interface WalletTradeHistory {
  id: string;
  walletAddress: string;
  transactionSignature: string;
  timestamp: string;
  type: 'Buy' | 'Sell' | 'Swap' | 'Transfer' | 'Airdrop' | 'Deposit' | 'Withdrawal';
  tokenIn: string;
  tokenOut: string;
  quantityIn: number;
  quantityOut: number;
  usdValue: number;
  executionPrice: number;
  marketPriceAtExecution: number;
  feesUsd: number;
  dex: string;
  estimatedSlippagePercent: number;
  realizedPnlUsd?: number;
  returnPercent?: number;
  holdingPeriodHours?: number;
  allocationPercentOfPortfolio: number;
  convictionMultiplier: number;
}

export interface WalletRelationship {
  id: string;
  sourceWallet: string;
  targetWallet: string;
  relationshipType: RelationshipType;
  confidenceScore: number; // 0-100
  reasons: string[]; // e.g. "Shared funding source", "Synchronous trading on JUP"
  sharedTransactionsCount: number;
  lastCoordinatedAt: string;
}

export interface TokenMarketData {
  symbol: string;
  name: string;
  address: string;
  decimals: number | null | 'TOKEN_DECIMALS_UNAVAILABLE';
  priceUsd: number | null;
  priceChange1h: number | null;
  priceChange24h: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  holderCount: number | null;
  tokenAgeDays: number | null;
  top10HoldersPercent: number | null;
  top20HoldersPercent: number | null;
  devHoldingsPercent: number | null;
  hasFreezeAuthority: boolean | null;
  hasMintAuthority: boolean | null;
  liquidityLockedPercent: number | null;
  isHoneypotSafe: boolean | null;
  riskScore: number | null; // 0-100 (lower is safer)
  smartMoneyVwap: number | null;
  netFlow24hUsd: number | null;
}

export interface SmartMoneyFlowTimeframe {
  timeframe: '1m' | '5m' | '10m' | '30m' | '1h' | '4h' | '24h';
  eliteBuyVolumeUsd: number;
  eliteSellVolumeUsd: number;
  netSmartMoneyFlowUsd: number;
  eliteBuyersCount: number;
  eliteSellersCount: number;
  independentBuyersCount: number;
  averageWalletQuality: number;
  averageConviction: number;
  smartMoneyVwap: number;
  velocityScore: number; // 0-100
  accelerationScore: number; // 0-100
}

export interface AlphaSignalFeatureBreakdown {
  traderSkillScore: FeatureEvidence | null;
  copyabilityScore: FeatureEvidence | null;
  independentConsensusScore: FeatureEvidence | null;
  convictionSurpriseScore: FeatureEvidence | null;
  smartMoneyAccelerationScore: FeatureEvidence | null;
  entryQualityScore: FeatureEvidence | null;
  liquidityTokenQualityScore: FeatureEvidence | null;
  regimeFitScore: FeatureEvidence | null;
  emergingTraderScore: FeatureEvidence | null;
  penalties: {
    crowdingPenalty: number;
    relatedWalletsPenalty: number;
    poorLiquidityPenalty: number;
    pricePumpedPenalty: number;
    suspiciousTokenStructurePenalty: number;
    highSlippagePenalty: number;
    traderDeteriorationPenalty: number;
    insufficientSamplePenalty: number;
    profitConcentrationPenalty: number;
  };
  totalPenalties: number;
}

export interface AlphaSignal {
  id: string;
  tokenSymbol: string;
  tokenAddress: string;
  timestamp: string;
  alphaScore: number | null; // 0-100 or null if insufficient data
  dataStatus: 'COMPLETE' | 'PARTIAL' | 'INSUFFICIENT_DATA';
  signalState: SignalState;
  decision: DecisionStatus;
  rejectionReason?: string;
  rejectionCode?: string;
  liquidityUsd?: number;
  tokenSecurityFlags?: {
    mintAuthorityRevoked: boolean | null;
    freezeAuthorityRevoked: boolean | null;
    lpBurned: boolean | null;
    isHoneypotSafe: boolean | null;
  };
  features: AlphaSignalFeatureBreakdown;
  participantWallets: {
    address: string;
    qualityScore: number | null;
    convictionMultiplier: number | null;
    tradeUsd: number;
    independenceStatus: 'UNKNOWN' | 'INDEPENDENT' | 'POSSIBLY_RELATED' | 'STRONGLY_RELATED';
    clusterId?: string;
  }[];
  independentEliteCount: number | null;
  totalSmartMoneyInflowUsd: number | null;
  priceAtSignal: number;
  priceDisplacementFromVwapPercent: number | null;
  currentRegime: MarketRegime | null;
  historicalExpectancy: {
    dataStatus: 'INSUFFICIENT_SAMPLE' | 'VALID_SAMPLE';
    similarEventsCount: number;
    winRatePercent: number | null;
    averageWinnerPercent: number | null;
    averageLoserPercent: number | null;
    medianReturnPercent: number | null;
    grossEvPercent: number | null;
    executionCostPercent: number | null;
    netEvPercent: number | null;
    maxFavorableExcursionPercent: number | null;
    maxAdverseExcursionPercent: number | null;
    return5mPercent: number | null;
    return15mPercent: number | null;
    return1hPercent: number | null;
    return4hPercent: number | null;
    return24hPercent: number | null;
  };
  executionSimulation?: {
    sourcePrice: number;
    detectionPrice: number;
    detectionDelayMs: number;
    estimatedSlippagePercent: number;
    dexFeePercent: number;
    networkFeeUsd: number;
    simulatedFillPrice: number;
    recommendedPositionUsd: number;
    positionPercentOfPortfolio: number;
  };
}

export interface PaperPosition {
  id: string;
  portfolioId: string;
  tokenSymbol: string;
  tokenAddress: string;
  openedAt: string;
  openPrice: number;
  currentPrice: number;
  amount: number;
  costBasisUsd: number;
  currentValueUsd: number;
  unrealizedPnlUsd: number;
  unrealizedReturnPercent: number;
  allocationPercent: number | null;
  stopLossPrice: number;
  takeProfitPrice: number;
  trailingStopPrice?: number;
  strategyName: string | null;
  strategyKey?: string | null;
  signalId: string;
  signalAlphaScore: number | null;
  detectionLatencyMs: number;
  slippageIncurredPercent: number;
}

export interface PaperTradeRecord {
  id: string;
  portfolioId: string;
  tokenSymbol: string;
  tokenAddress: string;
  openedAt: string;
  closedAt: string;
  openPrice: number;
  closePrice: number;
  amount: number;
  costBasisUsd: number;
  proceedsUsd: number;
  realizedPnlUsd: number;
  returnPercent: number;
  holdingPeriodMinutes: number;
  exitReason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'TRAILING_STOP' | 'SIGNAL_DETERIORATION' | 'SMART_MONEY_REVERSAL' | 'MANUAL_CLOSE';
  strategyName?: string | null;
  feesPaidUsd: number;
  slippagePaidUsd: number;
}

export interface PaperPortfolio {
  id: string;
  name: string;
  description: string;
  strategyKey: string;
  startingCapitalUsd: number; // 5000
  initialCashUsd: number; // 5000
  cashUsd: number;
  positionsValueUsd: number;
  totalEquityUsd: number;
  totalReturnPercent: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  todayPnlUsd: number;
  todayReturnPercent: number;
  weeklyPnlUsd: number;
  monthlyPnlUsd: number;
  maxDrawdownPercent: number | null;
  winRatePercent: number | null;
  profitFactor: number | null;
  expectedValuePerTradeUsd: number | null;
  sharpeRatio: number | null;
  averageSlippageBps: number | null;
  averageDetectionLatencyMs: number | null;
  copyEfficiencyPercent: number | null;
  totalTradesCount: number;
  openPositionsCount: number;
  totalFeesPaidUsd: number;
  equityHistory: {
    timestamp: string;
    equity: number;
    drawdownPercent: number;
    solBenchmark: number;
    btcBenchmark: number;
    ethBenchmark: number;
  }[];
}

export interface SystemHealthStatus {
  blockchainStream: 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';
  marketData: 'CONNECTED' | 'DEGRADED' | 'DISCONNECTED';
  walletDiscovery: 'RUNNING' | 'PAUSED' | 'IDLE';
  walletScoring: 'RUNNING' | 'UPDATING' | 'IDLE';
  networkGraph: 'RUNNING' | 'IDLE';
  signalEngine: 'RUNNING' | 'EVALUATING';
  paperTrader: 'ACTIVE' | 'PAUSED';
  riskEngine: 'ACTIVE' | 'ENFORCING';
  postgresql: 'CONNECTED' | 'SYNTHETIC_STORE';
  redis: 'CONNECTED' | 'SYNTHETIC_CACHE';
  lastEventTimestamp: string;
  lastPriceUpdateTimestamp: string;
  lastWalletUpdateTimestamp: string;
  eventsProcessed24h: number;
  activeTrackedWallets: number;
  candidatePoolSize: number;
}

export interface LiveEventItem {
  id: string;
  timestamp: string;
  category: 
    | 'WALLET_DETECTED' 
    | 'SMART_BUY' 
    | 'SMART_SELL' 
    | 'DEX_BUY_OBSERVED'
    | 'DEX_SELL_OBSERVED'
    | 'CONSENSUS_TRIGGER' 
    | 'SIGNAL_GENERATED' 
    | 'PAPER_EXECUTION' 
    | 'POSITION_CLOSED' 
    | 'HARD_REJECTION';
  headline: string;
  detail: string;
  badgeType?: 'success' | 'warning' | 'info' | 'danger';
  tokenSymbol?: string;
  alphaScore?: number;
}

export interface SystemSettings {
  startingCapital: number;
  minExecutionAlphaScore: number;
  normalPositionPercent: number;
  strongSignalPositionPercent: number;
  maxPositionPercent: number;
  maxTokenExposurePercent: number;
  maxTotalDeployedPercent: number;
  maxOpenPositions: number;
  dailyLossLimitPercent: number;
  maxPortfolioDrawdownPercent: number;
  maxAllowedSlippagePercent: number;
  minTokenLiquidityUsd: number;
  minWalletPortfolioValue: number;
  minWalletAgeDays: number;
  minHistoricalTrades: number;
  minCoreAssetRatioPercent: number;
  signalThresholds: {
    ignoreMax: number;
    watchMax: number;
    strongResearchMax: number;
    paperEligibleMax: number;
    highConvictionMin: number;
  };
  alphaWeights: {
    traderSkill: number;
    copyability: number;
    independentConsensus: number;
    convictionSurprise: number;
    smartMoneyAcceleration: number;
    entryQuality: number;
    liquidityTokenQuality: number;
    marketRegimeFit: number;
    emergingTrader: number;
  };
}

export interface BacktestConfig {
  name: string;
  startDate: string;
  endDate: string;
  mode: 'point_in_time' | 'walk_forward';
  trainMonths: number;
  valMonths: number;
  testMonths: number;
  minSkillScore: number;
  minIndependentWallets: number;
  minCopyability: number;
  minConvictionMultiplier: number;
  maxPriceDisplacementPercent: number;
  minLiquidityUsd: number;
  marketRegimeFilter: string;
}

export interface BacktestResult {
  id: string;
  config: BacktestConfig;
  totalTrades: number;
  winRatePercent: number;
  totalReturnPercent: number;
  profitFactor: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  averageHoldingPeriodHours: number;
  inSampleReturnPercent: number;
  outOfSampleReturnPercent: number;
  solBenchmarkReturnPercent: number;
  alphaOverBenchmarkPercent: number;
  robustnessScore: number;
  walkForwardSplits: {
    period: string;
    inSampleWinRate: number;
    outOfSampleWinRate: number;
    netReturnPercent: number;
    status: 'PASSED' | 'STABLE' | 'DEGRADED';
  }[];
}

export interface ResearchQueryFilter {
  minTraderSkill: number;
  minIndependentWallets: number;
  minCopyability: number;
  minConvictionMultiplier: number;
  maxPriceDisplacementPercent: number;
  minLiquidityUsd: number;
  marketRegime: string;
}

export interface ResearchQueryResult {
  sampleSize: number;
  winRatePercent: number;
  averageReturnPercent: number;
  medianReturnPercent: number;
  grossEvPercent: number;
  executionCostPercent: number;
  netEvPercent: number;
  maxDrawdownPercent: number;
  confidenceInterval95: [number, number];
  sampleMatches: {
    id: string;
    token: string;
    timestamp: string;
    alphaScore: number;
    returnPercent: number;
    independentWallets: number;
    displacementPercent: number;
    regime: string;
  }[];
}

export type StrategyStatus = 'ACTIVE' | 'PAUSED' | 'WAITING_FOR_DATA' | 'DEGRADED';
export type SampleStatus = 'INSUFFICIENT_SAMPLE' | 'VALID_SAMPLE';

export interface StrategyDefinition {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  eligibilityRules: {
    minAlphaScore: number;
    minTraderSkill: number;
    minCopyability: number;
    minIndependentWallets: number;
    minLiquidityUsd: number;
    maxPriceDisplacementPercent: number;
    allowedRegimes?: string[];
    requiresConsensus?: boolean;
    requiresConvictionSurprise?: boolean;
    requiresFlowAcceleration?: boolean;
    requiresEmergingTrader?: boolean;
    maxHistoricalAdverseExcursionPercent?: number;
  };
  positionSizingRules: {
    allocationPercent: number;
    maxPositions: number;
    maxTokenExposurePercent: number;
  };
  riskRules: {
    stopLossPercent: number;
    takeProfitPercent: number;
    trailingStopPercent?: number;
    maxDrawdownStopPercent?: number;
  };
}

export interface StrategyDecisionRecord {
  id: string;
  strategyKey: string;
  strategyName: string;
  signalId: string;
  tokenAddress: string;
  tokenSymbol: string;
  decision: 'ELIGIBLE' | 'WATCHED' | 'REJECTED' | 'TRADED';
  reason: string;
  evaluatedAt: string;
  alphaScore: number | null;
  allocatedPositionUsd: number | null;
  featureSnapshot: Record<string, unknown>;
}

export interface StrategyEquitySnapshot {
  id?: string;
  strategyKey: string;
  timestamp: string;
  equityUsd: number;
  drawdownPercent: number;
}

export interface StrategyPortfolio extends PaperPortfolio {
  status: StrategyStatus;
  strategyDefinition: StrategyDefinition;
  closedTradesCount: number;
  sampleStatus: SampleStatus;
  winsCount: number;
  lossesCount: number;
  winRatePercent: number | null;
  profitFactor: number | null;
  sharpeRatio: number | null;
  expectedValuePerTradeUsd: number | null;
  provenanceStatus?: 'LIVE' | 'DEMO' | 'HISTORICAL';
}

export type FeatureProvenanceStatus =
  | 'OBSERVED'
  | 'DERIVED'
  | 'MODELED_EXECUTION'
  | 'INSUFFICIENT_DATA'
  | 'DEMO'
  | 'MOCK'
  | 'FIXTURE'
  | 'HARDCODED'
  | 'SYNTHETIC_ESTIMATE';

export interface FeatureEvidence<T = number> {
  value: T | null;
  status: FeatureProvenanceStatus;
  source: string;
  timestamp: string;
  sampleSize?: number;
}


