import express, { Request, Response } from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { 
  MOCK_TOKENS, 
  MOCK_WALLETS, 
  MOCK_SIGNALS, 
  MOCK_PORTFOLIO, 
  MOCK_OPEN_POSITIONS, 
  MOCK_TRADE_HISTORY, 
  MOCK_PARALLEL_BOTS, 
  MOCK_SYSTEM_HEALTH, 
  MOCK_LIVE_EVENTS, 
  MOCK_WALLET_RELATIONSHIPS, 
  INITIAL_SETTINGS 
} from './src/data/mockData';
import { PortfolioAccountingEngine } from './src/services/portfolioAccounting';
import { RiskEngine } from './src/services/riskEngine';
import { BacktestEngine } from './src/services/backtestEngine';
import { RealDataProviders, ProviderHealthRecord } from './src/services/realDataProviders';
import { createPersistenceStore, StorageAdapter } from './src/services/persistence';
import { MarkToMarketWorker } from './src/services/markToMarketWorker';
import { HeliusIngestionWorker } from './src/services/heliusIngestionWorker';
import { WalletDiscoveryService } from './src/services/walletDiscovery';
import { SmartMoneyFlowEngine } from './src/services/smartMoneyFlow';
import { StrategyLabEngine } from './src/services/strategyLabEngine';
import { BirdeyeProvider } from './src/services/providers/birdeyeProvider';
import { 
  BacktestConfig, 
  ResearchQueryFilter, 
  PaperPosition, 
  PaperTradeRecord, 
  AlphaSignal,
  PaperPortfolio,
  WalletProfile,
  TokenMarketData,
  LiveEventItem
} from './src/types';

import { RedisClientService } from './src/services/redisClient';
import { getErrorMessage } from './src/utils/errors';

dotenv.config({ override: true });

// Sanitize Jupiter configuration
if (process.env.JUPITER_API_URL && process.env.JUPITER_API_URL.startsWith('jup_')) {
  if (!process.env.JUPITER_API_KEY) {
    process.env.JUPITER_API_KEY = process.env.JUPITER_API_URL;
  }
  process.env.JUPITER_API_URL = 'https://api.jup.ag';
} else if (!process.env.JUPITER_API_URL || process.env.JUPITER_API_URL.includes('quote-api.jup.ag')) {
  process.env.JUPITER_API_URL = 'https://api.jup.ag';
}

// Sanitize & normalize Redis configuration (enforces TLS for Upstash)
if (process.env.REDIS_URL) {
  const normalized = RedisClientService.normalizeRedisUrl(process.env.REDIS_URL);
  if (normalized) {
    process.env.REDIS_URL = normalized;
  }
}

const app = express();
const PORT = 3000;
const APP_MODE = process.env.APP_MODE || 'demo';

app.use(express.json());

// Initialize Persistence Store
const storage: StorageAdapter = createPersistenceStore(APP_MODE);

// State variables
let currentPortfolio: PaperPortfolio = {
  id: 'live-paper-portfolio',
  name: 'HEF AlphaGraph Live Paper Account',
  description: 'Persistent live-market paper execution portfolio with real Solana quotes',
  strategyKey: 'HEF_INSTITUTIONAL',
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
  profitFactor: 1.00,
  expectedValuePerTradeUsd: 0.00,
  sharpeRatio: 0.00,
  averageSlippageBps: 35,
  averageDetectionLatencyMs: 650,
  copyEfficiencyPercent: 100,
  totalTradesCount: 0,
  openPositionsCount: 0,
  totalFeesPaidUsd: 0.00,
  equityHistory: [
    { timestamp: new Date().toISOString().slice(0, 10), equity: 5000.00, drawdownPercent: 0, solBenchmark: 100, btcBenchmark: 100, ethBenchmark: 100 }
  ]
};
let openPositions: PaperPosition[] = [];
let tradeHistory: PaperTradeRecord[] = [];
let signals: AlphaSignal[] = [];
let wallets: WalletProfile[] = [];
let tokens: TokenMarketData[] = [];
let liveEvents: LiveEventItem[] = [];
let systemSettings = { ...INITIAL_SETTINGS };
const parallelBots = [...MOCK_PARALLEL_BOTS];
let systemReady = false;
let missingComponents: string[] = [];
let heliusWorker: HeliusIngestionWorker | null = null;
let markToMarketTimer: NodeJS.Timeout | null = null;

// Configurable intervals (default 10 minutes = 600000ms)
export const HELIUS_POLL_INTERVAL_MS =
  Number(process.env.HELIUS_POLL_INTERVAL_MS) || 600000;
export const PROVIDER_HEALTH_TTL_MS =
  Number(process.env.PROVIDER_HEALTH_TTL_MS) || 600000;

export let cachedProviderHealth: ProviderHealthRecord[] = [];
export let lastProviderHealthCheck = 0;
export let providerHealthRefreshPromise: Promise<ProviderHealthRecord[]> | null = null;

export async function getCachedProviderHealth(
  force = false
): Promise<ProviderHealthRecord[]> {
  const now = Date.now();
  const cacheFresh =
    cachedProviderHealth.length > 0 &&
    now - lastProviderHealthCheck < PROVIDER_HEALTH_TTL_MS;
  if (!force && cacheFresh) {
    return cachedProviderHealth;
  }
  if (providerHealthRefreshPromise) {
    return providerHealthRefreshPromise;
  }
  providerHealthRefreshPromise = (async () => {
    try {
      const records =
        await RealDataProviders.getAllProviderHealth(storage);
      cachedProviderHealth = records;
      lastProviderHealthCheck = Date.now();
      return records;
    } catch (err: unknown) {
      console.warn('[ProviderHealthCache]: Refresh failed safely:', RealDataProviders.sanitizeMessage(getErrorMessage(err)));
      if (cachedProviderHealth.length > 0) {
        return cachedProviderHealth;
      }
      return [];
    } finally {
      providerHealthRefreshPromise = null;
    }
  })();
  return providerHealthRefreshPromise;
}

export function resetProviderHealthCacheForTesting() {
  cachedProviderHealth = [];
  lastProviderHealthCheck = 0;
  providerHealthRefreshPromise = null;
}

// Initialize application state according to strict APP_MODE separation
async function initializeState() {
  try {
    await storage.init();
  } catch (err: unknown) {
    console.warn(`[Storage Init Warning] Mode ${APP_MODE}: ${getErrorMessage(err)}`);
  }

  if (APP_MODE === 'live_paper') {
    console.log('[System]: Starting in LIVE_PAPER mode with strict real data separation.');
    
    // Check required environment variables
    missingComponents = [];
    if (!process.env.HELIUS_API_KEY) missingComponents.push('HELIUS_API_KEY');
    if (!process.env.BIRDEYE_API_KEY) missingComponents.push('BIRDEYE_API_KEY');
    if (!process.env.SOLANA_RPC_URL) missingComponents.push('SOLANA_RPC_URL');
    if (!process.env.DATABASE_URL) missingComponents.push('DATABASE_URL');

    // Clean $5,000 paper portfolio
    const cleanLivePortfolio: PaperPortfolio = {
      id: 'live-paper-portfolio',
      name: 'HEF AlphaGraph Live Paper Account',
      description: 'Persistent live-market paper execution portfolio with real Solana quotes',
      strategyKey: 'HEF_INSTITUTIONAL',
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
      averageSlippageBps: null,
      averageDetectionLatencyMs: null,
      copyEfficiencyPercent: null,
      totalTradesCount: 0,
      openPositionsCount: 0,
      totalFeesPaidUsd: 0.00,
      equityHistory: [
        { timestamp: new Date().toISOString().slice(0, 10), equity: 5000.00, drawdownPercent: 0, solBenchmark: 100, btcBenchmark: 100, ethBenchmark: 100 }
      ]
    };

    // Try to load existing live paper portfolio from PostgreSQL
    try {
      const persisted = await storage.getPortfolio('live-paper-portfolio');
      if (persisted) {
        openPositions = await storage.getOpenPositions('live-paper-portfolio');
        tradeHistory = await storage.getTrades('live-paper-portfolio');
        signals = await storage.getSignals(50);
        wallets = await storage.getWallets();
        tokens = await storage.getTokens();

        const closedCount = tradeHistory.length;
        const wins = tradeHistory.filter(t => t.realizedPnlUsd > 0).length;
        const grossProfits = tradeHistory.filter(t => t.realizedPnlUsd > 0).reduce((acc, t) => acc + t.realizedPnlUsd, 0);
        const grossLosses = Math.abs(tradeHistory.filter(t => t.realizedPnlUsd < 0).reduce((acc, t) => acc + t.realizedPnlUsd, 0));

        const positionsValue = openPositions.reduce((acc, p) => acc + (p.currentValueUsd ?? (p.amount * (p.currentPrice || p.openPrice))), 0);
        const unrealizedPnl = openPositions.reduce((acc, p) => acc + (p.unrealizedPnlUsd ?? 0), 0);
        const totalEquity = (persisted.cashUsd ?? 5000.00) + positionsValue;
        const totalReturnPercent = persisted.startingCapitalUsd > 0
          ? Number((((totalEquity - persisted.startingCapitalUsd) / persisted.startingCapitalUsd) * 100).toFixed(2))
          : 0;

        currentPortfolio = {
          ...persisted,
          positionsValueUsd: Number(positionsValue.toFixed(2)),
          unrealizedPnlUsd: Number(unrealizedPnl.toFixed(2)),
          openPositionsCount: openPositions.length,
          totalTradesCount: closedCount + openPositions.length,
          totalEquityUsd: Number(totalEquity.toFixed(2)),
          totalReturnPercent,
          winRatePercent: closedCount >= 1 ? Number(((wins / closedCount) * 100).toFixed(2)) : null,
          profitFactor: closedCount >= 1 ? (grossLosses > 0 ? Number((grossProfits / grossLosses).toFixed(2)) : (grossProfits > 0 ? 10.0 : null)) : null,
          expectedValuePerTradeUsd: closedCount >= 1 ? Number(((grossProfits - grossLosses) / closedCount).toFixed(2)) : null,
          sharpeRatio: null,
          averageSlippageBps: closedCount > 0 ? persisted.averageSlippageBps : null,
          averageDetectionLatencyMs: closedCount > 0 ? persisted.averageDetectionLatencyMs : null,
          copyEfficiencyPercent: closedCount > 0 ? persisted.copyEfficiencyPercent : null
        };
        console.log(`[System]: Loaded persisted live portfolio with ${openPositions.length} positions, ${tradeHistory.length} trades, and ${tokens.length} tokens.`);
      } else {
        currentPortfolio = cleanLivePortfolio;
        await storage.savePortfolio(cleanLivePortfolio);
      }
    } catch {
      currentPortfolio = cleanLivePortfolio;
    }

    // Initialize Strategy Lab Engine for 10 parallel portfolios
    try {
      await StrategyLabEngine.init(storage, APP_MODE);
      console.log(`[Strategy Lab]: Successfully initialized 10 parallel strategy portfolios.`);
    } catch (err: unknown) {
      console.warn('[Strategy Lab]: Initialization warning:', getErrorMessage(err));
    }

    // 1. Verify provider health before setting systemReady
    console.log('[System]: Verifying provider health before READY...');
    const providerRecords = await getCachedProviderHealth(true);
    // Redis is optional for readiness; critical providers: PostgreSQL, Helius, Birdeye, Solana RPC, Jupiter
    const requiredProviders = ['PostgreSQL', 'Helius', 'Birdeye', 'Solana RPC', 'Jupiter'];
    const unreadyProviders = providerRecords.filter(p => requiredProviders.includes(p.providerName) && p.status !== 'CONNECTED');

    if (unreadyProviders.length > 0) {
      console.warn('[System]: Some providers not CONNECTED before READY:', unreadyProviders.map(u => `${u.providerName}: ${u.status}`));
      systemReady = false;
    } else {
      systemReady = true;
      console.log('[System]: All critical providers verified healthy (PostgreSQL, Helius, Birdeye, Solana RPC, Jupiter). System is READY.');
    }

    liveEvents = [
      {
        id: `ev-init-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        category: 'SIGNAL_GENERATED',
        headline: 'Live Paper Trading Session Initialized',
        detail: `Starting capital: $5,000.00. System status: ${systemReady ? 'READY (All critical providers connected)' : 'INITIALIZING'}.`,
        badgeType: systemReady ? 'success' : 'warning'
      }
    ];

    // 2. Start Helius Ingestion Worker automatically
    if (!heliusWorker) {
      heliusWorker = new HeliusIngestionWorker(
        storage,
        systemSettings,
        (update) => {
          if (update.tokens && update.tokens.length > 0) {
            for (const t of update.tokens) {
              const idx = tokens.findIndex(e => e.symbol === t.symbol || e.address === t.address);
              if (idx >= 0) tokens[idx] = t;
              else tokens.unshift(t);
            }
            tokens = tokens.slice(0, 100);
          }
          if (update.signals && update.signals.length > 0) {
            for (const s of update.signals) {
              const idx = signals.findIndex(e => e.id === s.id);
              if (idx >= 0) signals[idx] = s;
              else signals.unshift(s);

              // Evaluate signal across Strategy Lab parallel hypotheses
              StrategyLabEngine.evaluateSignalAcrossStrategies(s, storage, APP_MODE).catch(err => {
                console.warn('[StrategyLabEngine]: Signal evaluation error:', err.message);
              });
            }
            signals = signals.slice(0, 50);
          }
          if (update.wallets && update.wallets.length > 0) {
            for (const w of update.wallets) {
              const idx = wallets.findIndex(e => e.address === w.address);
              if (idx >= 0) wallets[idx] = w;
              else wallets.unshift(w);
            }
            wallets = wallets.slice(0, 50);
          }
          if (update.liveEvent) {
            liveEvents.unshift(update.liveEvent);
            liveEvents = liveEvents.slice(0, 50);
          }
        }
      );
      heliusWorker.start();
      console.log(`[System]: Helius Ingestion Worker automatically started for live_paper with interval ${HELIUS_POLL_INTERVAL_MS}ms.`);
    }

    // 3. Continuous mark-to-market worker
    if (!markToMarketTimer) {
      markToMarketTimer = setInterval(async () => {
        if (openPositions.length > 0) {
          try {
            const mtmResult = await MarkToMarketWorker.monitorAndEvaluatePositions(
              currentPortfolio,
              openPositions,
              storage
            );
            openPositions = mtmResult.remainingPositions;
            currentPortfolio = mtmResult.updatedPortfolio;
            if (mtmResult.closedTrades.length > 0) {
              tradeHistory = [...mtmResult.closedTrades, ...tradeHistory];
              for (const ct of mtmResult.closedTrades) {
                liveEvents.unshift({
                  id: `ev-close-${ct.id}`,
                  timestamp: new Date().toLocaleTimeString(),
                  category: 'POSITION_CLOSED',
                  headline: `MTM Position Closed: ${ct.tokenSymbol} (${ct.exitReason})`,
                  detail: `Realized P&L: ${ct.realizedPnlUsd >= 0 ? '+' : ''}$${ct.realizedPnlUsd.toFixed(2)} (${ct.returnPercent.toFixed(2)}%)`,
                  badgeType: ct.realizedPnlUsd >= 0 ? 'success' : 'danger'
                });
              }
            }
          } catch (err: unknown) {
            console.warn('[Continuous MTM Worker]:', getErrorMessage(err));
          }
        }

        // Strategy Lab Mark-to-Market
        try {
          await StrategyLabEngine.markToMarket(storage, APP_MODE);
        } catch (err: unknown) {
          console.warn('[StrategyLabEngine MTM]:', getErrorMessage(err));
        }
      }, 4000);
      console.log('[System]: Continuous Mark-to-Market Worker active.');
    }

  } else if (APP_MODE === 'historical_backtest') {
    console.log('[System]: Starting in HISTORICAL_BACKTEST mode.');
    currentPortfolio = { ...MOCK_PORTFOLIO, startingCapitalUsd: 5000.00, initialCashUsd: 5000.00, cashUsd: 5000.00, positionsValueUsd: 0, totalEquityUsd: 5000.00 };
    openPositions = [];
    tradeHistory = [];
    signals = [];
    wallets = [];
    tokens = [];
    liveEvents = [];
    systemReady = true;
  } else {
    // APP_MODE === 'demo'
    console.log('[System]: Starting in DEMO mode with verified double-entry mock data.');
    currentPortfolio = { ...MOCK_PORTFOLIO, startingCapitalUsd: 5000.00, initialCashUsd: 5000.00 };
    openPositions = [...MOCK_OPEN_POSITIONS];
    tradeHistory = [...MOCK_TRADE_HISTORY];
    signals = [...MOCK_SIGNALS];
    wallets = [...MOCK_WALLETS];
    tokens = [...MOCK_TOKENS];
    liveEvents = [...MOCK_LIVE_EVENTS];
    systemReady = true;

    try {
      await StrategyLabEngine.init(storage, APP_MODE);
    } catch (e: unknown) {
      console.warn('[StrategyLabEngine demo init]:', getErrorMessage(e));
    }

    // Strict double-entry reconciliation
    try {
      const initialAudit = PortfolioAccountingEngine.validatePortfolioReconciliation(
        currentPortfolio,
        openPositions,
        tradeHistory
      );
      if (!initialAudit.isValid) {
        const fixed = PortfolioAccountingEngine.rebuildPortfolioFromLedger(
          5000.00,
          tradeHistory,
          openPositions
        );
        currentPortfolio.cashUsd = fixed.reconstructedCashUsd;
        currentPortfolio.positionsValueUsd = fixed.reconstructedPositionsValueUsd;
        currentPortfolio.realizedPnlUsd = fixed.reconstructedRealizedPnlUsd;
        currentPortfolio.unrealizedPnlUsd = fixed.reconstructedUnrealizedPnlUsd;
        currentPortfolio.totalEquityUsd = fixed.reconstructedEquityUsd;
      }
    } catch (e: unknown) {
      console.error('[Startup Reconcile Error]:', getErrorMessage(e));
    }
  }
}

// Lazy initialization for Google GenAI
let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!geminiClient && process.env.GEMINI_API_KEY) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return geminiClient;
}

// ---------------- API ENDPOINTS ----------------

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    appMode: APP_MODE, 
    systemReady,
    timestamp: new Date().toISOString() 
  });
});

app.get('/api/system/status', async (req: Request, res: Response) => {
  const providers = await getCachedProviderHealth();
  // Redis is optional for readiness; critical providers must be CONNECTED or DEMO_ONLY
  const isHealthy = providers
    .filter(p => p.providerName !== 'Redis')
    .every(p => p.status === 'CONNECTED' || p.status === 'DEMO_ONLY');

  const now = Date.now();
  const cacheAgeSeconds = lastProviderHealthCheck > 0 ? Math.max(0, Math.round((now - lastProviderHealthCheck) / 1000)) : 0;
  const nextRefreshAt = lastProviderHealthCheck > 0 ? new Date(lastProviderHealthCheck + PROVIDER_HEALTH_TTL_MS).toISOString() : new Date().toISOString();

  res.json({
    appMode: APP_MODE,
    isDemo: APP_MODE === 'demo',
    isReady: APP_MODE === 'demo' ? true : (systemReady && isHealthy),
    status: (APP_MODE === 'demo' || (systemReady && isHealthy)) ? 'READY' : 'NOT_READY',
    missingComponents,
    providers,
    lastProviderHealthCheck: lastProviderHealthCheck > 0 ? new Date(lastProviderHealthCheck).toISOString() : null,
    nextProviderHealthRefreshAt: nextRefreshAt,
    healthCacheAgeSeconds: cacheAgeSeconds,
    heliusPollIntervalMs: HELIUS_POLL_INTERVAL_MS,
    providerHealthTtlMs: PROVIDER_HEALTH_TTL_MS,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/providers/health', async (req: Request, res: Response) => {
  const forceRefresh = req.query.refresh === 'true';
  const records = await getCachedProviderHealth(forceRefresh);
  const now = Date.now();
  const cacheAgeSeconds = lastProviderHealthCheck > 0 ? Math.max(0, Math.round((now - lastProviderHealthCheck) / 1000)) : 0;
  const nextRefreshAt = lastProviderHealthCheck > 0 ? new Date(lastProviderHealthCheck + PROVIDER_HEALTH_TTL_MS).toISOString() : new Date().toISOString();

  res.json({
    appMode: APP_MODE,
    providers: records,
    lastProviderHealthCheck: lastProviderHealthCheck > 0 ? new Date(lastProviderHealthCheck).toISOString() : null,
    nextProviderHealthRefreshAt: nextRefreshAt,
    healthCacheAgeSeconds: cacheAgeSeconds,
    heliusPollIntervalMs: HELIUS_POLL_INTERVAL_MS,
    providerHealthTtlMs: PROVIDER_HEALTH_TTL_MS,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/redis/test', async (req: Request, res: Response) => {
  const health = await RedisClientService.checkHealth();
  let cacheTest = 'SKIPPED';
  if (health.connected) {
    const testKey = `hef:ping:${Date.now()}`;
    const setOk = await RedisClientService.set(testKey, 'ok', 60);
    const readVal = await RedisClientService.get(testKey);
    cacheTest = (setOk && readVal === 'ok') ? 'VERIFIED' : 'FAILED';
  }
  res.json({
    ...health,
    cacheOperation: cacheTest,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/state', async (req: Request, res: Response) => {
  const audit = PortfolioAccountingEngine.validatePortfolioReconciliation(
    currentPortfolio,
    openPositions,
    tradeHistory
  );

  const providers = await getCachedProviderHealth();
  const ingestionStats = heliusWorker ? heliusWorker.getStatus() : null;

  const now = Date.now();
  const cacheAgeSeconds = lastProviderHealthCheck > 0 ? Math.max(0, Math.round((now - lastProviderHealthCheck) / 1000)) : 0;
  const nextRefreshAt = lastProviderHealthCheck > 0 ? new Date(lastProviderHealthCheck + PROVIDER_HEALTH_TTL_MS).toISOString() : new Date().toISOString();

  res.json({
    appMode: APP_MODE,
    isDemo: APP_MODE === 'demo',
    systemReady,
    providers,
    lastProviderHealthCheck: lastProviderHealthCheck > 0 ? new Date(lastProviderHealthCheck).toISOString() : null,
    nextProviderHealthRefreshAt: nextRefreshAt,
    healthCacheAgeSeconds: cacheAgeSeconds,
    heliusPollIntervalMs: HELIUS_POLL_INTERVAL_MS,
    providerHealthTtlMs: PROVIDER_HEALTH_TTL_MS,
    ingestionStats,
    portfolio: currentPortfolio,
    openPositions,
    tradeHistory,
    signals,
    tokens,
    wallets,
    systemHealth: APP_MODE === 'demo' ? {
      ...MOCK_SYSTEM_HEALTH,
      blockchainStream: providers.find(p => p.providerName === 'Helius')?.status === 'CONNECTED' ? 'CONNECTED' : 'DISCONNECTED',
      marketData: (providers.find(p => p.providerName === 'Birdeye')?.status === 'CONNECTED' || providers.find(p => p.providerName === 'Jupiter')?.status === 'CONNECTED') ? 'CONNECTED' : 'DEGRADED',
      postgresql: providers.find(p => p.providerName === 'PostgreSQL')?.status === 'CONNECTED' ? 'CONNECTED' : 'NOT_CONFIGURED',
      redis: providers.find(p => p.providerName === 'Redis')?.status === 'CONNECTED' ? 'CONNECTED' : 'SYNTHETIC_CACHE',
      lastEventTimestamp: new Date().toISOString()
    } : {
      blockchainStream: providers.find(p => p.providerName === 'Helius')?.status === 'CONNECTED' ? 'CONNECTED' : 'DISCONNECTED',
      marketData: (providers.find(p => p.providerName === 'Birdeye')?.status === 'CONNECTED' || providers.find(p => p.providerName === 'Jupiter')?.status === 'CONNECTED') ? 'CONNECTED' : 'DEGRADED',
      walletDiscovery: heliusWorker ? 'RUNNING' : 'STOPPED',
      walletScoring: wallets.length > 0 ? 'RUNNING' : 'IDLE',
      networkGraph: wallets.length > 0 ? 'RUNNING' : 'IDLE',
      signalEngine: 'RUNNING',
      paperTrader: process.env.LIVE_PAPER_EXECUTION_ENABLED === 'true' ? 'ACTIVE' : 'STANDBY',
      riskEngine: 'ACTIVE',
      postgresql: providers.find(p => p.providerName === 'PostgreSQL')?.status === 'CONNECTED' ? 'CONNECTED' : 'NOT_CONFIGURED',
      redis: providers.find(p => p.providerName === 'Redis')?.status === 'CONNECTED' ? 'CONNECTED' : 'SYNTHETIC_CACHE',
      lastEventTimestamp: liveEvents.length > 0 ? (liveEvents[0]?.timestamp ?? new Date().toISOString()) : new Date().toISOString(),
      lastPriceUpdateTimestamp: tokens.length > 0 ? (tokens[0]?.lastUpdated ?? new Date().toISOString()) : new Date().toISOString(),
      lastWalletUpdateTimestamp: wallets.length > 0 ? new Date().toISOString() : null,
      eventsProcessed24h: ingestionStats?.transactionsIngested ?? 0,
      activeTrackedWallets: wallets.length,
      candidatePoolSize: tokens.length
    },
    liveEvents,
    settings: systemSettings,
    birdeyeUsage: BirdeyeProvider.getUsageStats(),
    parallelBots: StrategyLabEngine.isEngineInitialized()
      ? StrategyLabEngine.getBotPortfolios()
      : (APP_MODE === 'live_paper' ? [] : parallelBots),
    portfolioAudit: audit
  });
});

app.get('/api/portfolio', (req: Request, res: Response) => {
  const audit = PortfolioAccountingEngine.validatePortfolioReconciliation(
    currentPortfolio,
    openPositions,
    tradeHistory
  );
  res.json({
    portfolio: currentPortfolio,
    openPositions,
    tradeHistory,
    audit
  });
});

app.get('/api/portfolio/audit', (req: Request, res: Response) => {
  const audit = PortfolioAccountingEngine.validatePortfolioReconciliation(
    currentPortfolio,
    openPositions,
    tradeHistory
  );
  const rebuild = PortfolioAccountingEngine.rebuildPortfolioFromLedger(
    currentPortfolio.startingCapitalUsd,
    tradeHistory,
    openPositions
  );
  res.json({
    audit,
    rebuild,
    currentPortfolio
  });
});

app.get('/api/portfolios/bots', (req: Request, res: Response) => {
  if (StrategyLabEngine.isEngineInitialized()) {
    return res.json(StrategyLabEngine.getBotPortfolios());
  }
  res.json(APP_MODE === 'live_paper' ? [] : parallelBots);
});

// Strategy Lab Endpoints
app.get('/api/strategy-lab/bots', (req: Request, res: Response) => {
  if (StrategyLabEngine.isEngineInitialized()) {
    return res.json(StrategyLabEngine.getBotPortfolios());
  }
  res.json(APP_MODE === 'live_paper' ? [] : parallelBots);
});

app.get('/api/strategy-lab/decisions', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const allDecisions = await storage.getStrategyDecisions(limit);
    res.json(allDecisions);
  } catch (err: unknown) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

app.get('/api/strategy-lab/summary', (req: Request, res: Response) => {
  const strategies = StrategyLabEngine.getStrategies();
  const sorted = [...strategies].sort((a, b) => (b.totalReturnPercent || 0) - (a.totalReturnPercent || 0));
  res.json({
    totalHypotheses: strategies.length,
    activeHypotheses: strategies.filter(s => s.status === 'ACTIVE').length,
    totalEquityUsd: strategies.reduce((sum, s) => sum + (s.totalEquityUsd || 5000), 0),
    bestPerformer: sorted[0] || null,
    worstPerformer: sorted[sorted.length - 1] || null
  });
});

app.get('/api/strategy-lab/:key', (req: Request, res: Response) => {
  const key = req.params.key;
  if (!key) return res.status(400).json({ error: 'Strategy key is required' });
  const strat = StrategyLabEngine.getStrategy(key);
  if (!strat) return res.status(404).json({ error: 'Strategy not found' });
  const openPositions = StrategyLabEngine.getOpenPositions(key);
  const closedTrades = StrategyLabEngine.getClosedTrades(key);
  const decisions = StrategyLabEngine.getDecisions(key);
  res.json({
    strategy: strat,
    openPositions,
    closedTrades,
    decisions
  });
});

app.get('/api/signals', (req: Request, res: Response) => {
  res.json(signals);
});

app.get('/api/signals/:id', (req: Request, res: Response) => {
  const signal = signals.find(s => s.id === req.params.id);
  if (!signal) return res.status(404).json({ error: 'Signal not found' });
  res.json(signal);
});

app.get('/api/wallets', (req: Request, res: Response) => {
  res.json(wallets);
});

app.get('/api/wallets/:address', (req: Request, res: Response) => {
  const address = req.params.address;
  if (!address) return res.status(400).json({ error: 'Address is required' });
  const wallet = wallets.find(w => w.address.toLowerCase() === address.toLowerCase());
  if (!wallet) return res.status(404).json({ error: 'Wallet not found' });

  let relationships: unknown[] = [];
  if (APP_MODE === 'demo') {
    relationships = MOCK_WALLET_RELATIONSHIPS.filter(
      r => r.sourceWallet === wallet.address || r.targetWallet === wallet.address
    );
  }

  res.json({
    wallet,
    relationships
  });
});

app.get('/api/wallet-graph', (req: Request, res: Response) => {
  const nodes = wallets.map(w => ({
    id: w.address,
    label: w.label || `${w.address.slice(0, 4)}...${w.address.slice(-4)}`,
    score: w.qualityScore,
    copyability: w.copyability?.copyabilityScore || 50,
    clusterId: w.clusterId,
    portfolioUsd: w.portfolioValueUsd,
    isEligible: w.isEligibleSmartMoney
  }));

  let edges: unknown[] = [];
  if (APP_MODE === 'demo') {
    edges = MOCK_WALLET_RELATIONSHIPS.map(r => ({
      id: r.id,
      source: r.sourceWallet,
      target: r.targetWallet,
      type: r.relationshipType,
      confidence: r.confidenceScore,
      reasons: r.reasons
    }));
  }

  res.json({ nodes, edges });
});

app.get('/api/tokens', (req: Request, res: Response) => {
  res.json(tokens);
});

// Empirical Smart Money Flow
app.get('/api/flows', async (req: Request, res: Response) => {
  const walletMap = new Map(wallets.map(w => [w.address, w]));

  const flowMatrix = await Promise.all(tokens.map(async t => {
    // Generate empirical flow from real stored transactions
    const tokenTxs = await storage.getTransactionsForToken(t.address);
    const flows = SmartMoneyFlowEngine.calculateFlow(t.address, tokenTxs, walletMap);
    const flow24h = flows['24h']?.netEliteFlowUsd || 0;
    const vwap = flows['24h']?.smartMoneyVwap ?? t.smartMoneyVwap ?? t.priceUsd ?? 0;
    const currentPrice = t.priceUsd ?? 0;
    const displacement = vwap > 0 ? Number((((currentPrice - vwap) / vwap) * 100).toFixed(2)) : 0;

    return {
      symbol: t.symbol,
      address: t.address,
      priceUsd: t.priceUsd,
      smartMoneyVwap: vwap,
      vwapDisplacementPercent: displacement,
      netFlow24hUsd: flow24h,
      velocityScore: Math.min(100, Math.max(0, Math.round(50 + (flows['24h']?.velocityUsdPerMinute || 0)))),
      accelerationScore: Math.min(100, Math.max(0, Math.round(50 + (flows['5m']?.accelerationUsdPerMinuteSq || 0)))),
      timeframes: {
        '1m': { netUsd: flows['1m']?.netEliteFlowUsd || 0, buyers: flows['1m']?.independentBuyersCount || 0, velocity: flows['1m']?.velocityUsdPerMinute || 0 },
        '5m': { netUsd: flows['5m']?.netEliteFlowUsd || 0, buyers: flows['5m']?.independentBuyersCount || 0, velocity: flows['5m']?.velocityUsdPerMinute || 0 },
        '10m': { netUsd: flows['10m']?.netEliteFlowUsd || 0, buyers: flows['10m']?.independentBuyersCount || 0, velocity: flows['10m']?.velocityUsdPerMinute || 0 },
        '30m': { netUsd: flows['30m']?.netEliteFlowUsd || 0, buyers: flows['30m']?.independentBuyersCount || 0, velocity: flows['30m']?.velocityUsdPerMinute || 0 },
        '1h': { netUsd: flows['1h']?.netEliteFlowUsd || 0, buyers: flows['1h']?.independentBuyersCount || 0, velocity: flows['1h']?.velocityUsdPerMinute || 0 },
        '4h': { netUsd: flows['4h']?.netEliteFlowUsd || 0, buyers: flows['4h']?.independentBuyersCount || 0, velocity: flows['4h']?.velocityUsdPerMinute || 0 },
        '24h': { netUsd: flow24h, buyers: flows['24h']?.independentBuyersCount || 0, velocity: flows['24h']?.velocityUsdPerMinute || 0 }
      }
    };
  }));

  res.json(flowMatrix);
});

app.get('/api/settings', (req: Request, res: Response) => {
  res.json(systemSettings);
});

app.post('/api/settings', (req: Request, res: Response) => {
  systemSettings = { ...systemSettings, ...req.body };
  res.json({ success: true, settings: systemSettings });
});

// Execute Paper Trade with Strict RiskEngine & MarkToMarketWorker
const handleExecuteTradeRequest = async (req: Request, res: Response) => {
  const { signalId } = req.body;
  const signal = signals.find(s => s.id === signalId);
  if (!signal) return res.status(404).json({ error: 'Signal not found' });

  // If live_paper mode and required providers are missing, block execution
  if (APP_MODE === 'live_paper' && !systemReady) {
    return res.status(400).json({
      error: 'LIVE PAPER EXECUTION BLOCKED: System providers are not ready or missing required API keys.',
      code: 'SYSTEM_NOT_READY',
      missingComponents
    });
  }

  // 1. Evaluate Risk Engine
  const riskResult = RiskEngine.evaluateTrade(
    signal,
    currentPortfolio,
    openPositions,
    systemSettings
  );

  if (!riskResult.passed) {
    const rejectEvent = {
      id: `ev-rej-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      category: 'HARD_REJECTION' as const,
      headline: `Risk rejected: ${signal.tokenSymbol} (${riskResult.code})`,
      detail: riskResult.reason || 'Institutional risk check failed',
      badgeType: 'danger' as const,
      tokenSymbol: signal.tokenSymbol,
      alphaScore: signal.alphaScore
    };
    liveEvents.unshift(rejectEvent);

    await storage.saveRiskEvent({
      portfolioId: currentPortfolio.id,
      signalId: signal.id,
      eventType: 'HARD_REJECTION',
      rejectionCode: riskResult.code,
      reason: riskResult.reason || 'Risk policy violated'
    });

    return res.status(400).json({
      error: 'Execution blocked by RiskEngine',
      code: riskResult.code,
      reason: riskResult.reason,
      rejectionReason: riskResult.reason
    });
  }

  // 2. Execute via MarkToMarketWorker using real Jupiter Quote
  const execResult = await MarkToMarketWorker.executePaperTrade(
    signal,
    currentPortfolio,
    openPositions,
    systemSettings,
    storage
  );

  if (!execResult.success || !execResult.position) {
    return res.status(400).json({
      error: execResult.rejectionReason || 'Trade execution failed',
      code: execResult.rejectionCode || 'EXECUTION_FAILED'
    });
  }

  openPositions.unshift(execResult.position);

  const eventItem = {
    id: `ev-${Date.now()}`,
    timestamp: new Date().toLocaleTimeString(),
    category: 'PAPER_EXECUTION' as const,
    headline: `Paper position opened: ${signal.tokenSymbol}`,
    detail: `Allocated $${execResult.position.costBasisUsd.toFixed(2)} at $${execResult.position.openPrice.toFixed(4)}. Latency: ${execResult.position.detectionLatencyMs}ms.`,
    badgeType: 'success' as const,
    tokenSymbol: signal.tokenSymbol,
    alphaScore: signal.alphaScore
  };
  liveEvents.unshift(eventItem);

  res.json({
    success: true,
    position: execResult.position,
    portfolio: currentPortfolio
  });
};

app.post('/api/trade/execute', handleExecuteTradeRequest);
app.post('/api/paper-trade', handleExecuteTradeRequest);
app.post('/api/paper/execute', handleExecuteTradeRequest);

// Close Paper Position with Net Proceeds Crediting
const handleCloseTradeRequest = async (req: Request, res: Response) => {
  const { positionId, exitReason = 'MANUAL_CLOSE' } = req.body;
  const pos = openPositions.find(p => p.id === positionId);
  if (!pos) return res.status(404).json({ error: 'Position not found' });

  try {
    let exitPrice = pos.currentPrice;
    if (APP_MODE === 'live_paper') {
      try {
        const tokenDecimals = await RealDataProviders.getTokenDecimals(pos.tokenAddress);
        const amountRaw = Math.round(pos.amount * Math.pow(10, tokenDecimals));
        const quote = await RealDataProviders.getJupiterQuote(
          pos.tokenAddress,
          'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
          amountRaw
        );
        if (quote.outAmountUi > 0 && pos.amount > 0) {
          exitPrice = quote.outAmountUi / pos.amount;
        }
      } catch (err: unknown) {
        return res.status(503).json({
          error: 'EXIT_QUOTE_UNAVAILABLE',
          message: `Cannot execute exit without real executable quote: ${getErrorMessage(err)}`
        });
      }
    }

    const result = PortfolioAccountingEngine.closePosition(
      currentPortfolio,
      openPositions,
      tradeHistory,
      positionId,
      exitPrice,
      exitReason
    );

    currentPortfolio = result.updatedPortfolio;
    openPositions = result.updatedPositions;
    tradeHistory = result.updatedClosedTrades;

    await storage.saveTrade(result.closedTrade);
    await storage.removePosition(positionId);
    await storage.savePortfolio(currentPortfolio);

    const pnl = result.closedTrade.realizedPnlUsd;
    const eventItem = {
      id: `ev-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      category: 'POSITION_CLOSED' as const,
      headline: `Position closed: ${pos.tokenSymbol} (${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)})`,
      detail: `Net return: ${result.closedTrade.returnPercent >= 0 ? '+' : ''}${result.closedTrade.returnPercent}%. Exit Reason: ${exitReason}`,
      badgeType: pnl >= 0 ? 'success' as const : 'warning' as const,
      tokenSymbol: pos.tokenSymbol
    };
    liveEvents.unshift(eventItem);

    res.json({
      success: true,
      closedTrade: result.closedTrade,
      tradeRecord: result.closedTrade,
      portfolio: currentPortfolio,
      exitBreakdown: result.exitBreakdown
    });
  } catch (err: unknown) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
};

app.post('/api/trade/close', handleCloseTradeRequest);
app.post('/api/close-position', handleCloseTradeRequest);

// Mark-to-Market trigger for open positions
app.post('/api/paper/mtm', async (req: Request, res: Response) => {
  // If zero open positions, perform no pricing requests
  if (!openPositions || openPositions.length === 0) {
    return res.json({
      success: true,
      closedTradesCount: 0,
      openPositionsCount: 0,
      portfolio: currentPortfolio
    });
  }

  const mtm = await MarkToMarketWorker.monitorAndEvaluatePositions(
    currentPortfolio,
    openPositions,
    storage
  );
  currentPortfolio = mtm.updatedPortfolio;
  openPositions = mtm.remainingPositions;
  if (mtm.closedTrades.length > 0) {
    tradeHistory.unshift(...mtm.closedTrades);
  }
  res.json({
    success: true,
    closedTradesCount: mtm.closedTrades.length,
    openPositionsCount: openPositions.length,
    portfolio: currentPortfolio
  });
});

// Reset Portfolio (handles live_paper and demo modes)
app.post('/api/reset-portfolio', async (req: Request, res: Response) => {
  if (APP_MODE === 'live_paper') {
    currentPortfolio = {
      id: 'live-paper-portfolio',
      name: 'HEF AlphaGraph Live Paper Account',
      description: 'Persistent live-market paper execution portfolio with real Solana quotes',
      strategyKey: 'HEF_INSTITUTIONAL',
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
      profitFactor: 1.00,
      expectedValuePerTradeUsd: 0.00,
      sharpeRatio: 0.00,
      averageSlippageBps: 35,
      averageDetectionLatencyMs: 650,
      copyEfficiencyPercent: 100,
      totalTradesCount: 0,
      openPositionsCount: 0,
      totalFeesPaidUsd: 0.00,
      equityHistory: [
        { timestamp: new Date().toISOString().slice(0, 10), equity: 5000.00, drawdownPercent: 0, solBenchmark: 100, btcBenchmark: 100, ethBenchmark: 100 }
      ]
    };
    openPositions = [];
    tradeHistory = [];
    try {
      await storage.savePortfolio(currentPortfolio);
    } catch (err: unknown) {
      console.warn('[Reset Portfolio] Storage error:', getErrorMessage(err));
    }
    return res.json({ success: true, portfolio: currentPortfolio, mode: 'live_paper' });
  } else {
    currentPortfolio = {
      ...MOCK_PORTFOLIO,
      startingCapitalUsd: 5000.00,
      initialCashUsd: 5000.00,
      cashUsd: 5000.00,
      positionsValueUsd: 0.00,
      totalEquityUsd: 5000.00,
      realizedPnlUsd: 0.00,
      unrealizedPnlUsd: 0.00,
      totalReturnPercent: 0.00,
      openPositionsCount: 0,
      totalTradesCount: 0
    };
    openPositions = [];
    tradeHistory = [];
    return res.json({ success: true, portfolio: currentPortfolio, mode: 'demo' });
  }
});

// Reset Demo Portfolio to Exactly $5,000 Base (Protected in live_paper)
app.post('/api/reset-demo', (req: Request, res: Response) => {
  if (APP_MODE !== 'demo') {
    return res.status(403).json({ error: 'Reset demo is only permitted in demo mode' });
  }
  currentPortfolio = {
    ...MOCK_PORTFOLIO,
    startingCapitalUsd: 5000.00,
    initialCashUsd: 5000.00,
    cashUsd: 5000.00,
    positionsValueUsd: 0.00,
    totalEquityUsd: 5000.00,
    realizedPnlUsd: 0.00,
    unrealizedPnlUsd: 0.00,
    totalReturnPercent: 0.00,
    openPositionsCount: 0,
    totalTradesCount: 0
  };
  openPositions = [];
  tradeHistory = [];
  res.json({ success: true, portfolio: currentPortfolio });
});

// Deterministic Event-Driven Point-in-Time Historical Backtesting Engine
app.post('/api/backtests/run', (req: Request, res: Response) => {
  try {
    const config: BacktestConfig = req.body;
    const result = BacktestEngine.runBacktest(config);
    res.json(result);
  } catch (err: unknown) {
    res.status(400).json({ error: getErrorMessage(err) });
  }
});

// Deterministic Historical Expectancy Research Query
app.post('/api/research/query', (req: Request, res: Response) => {
  const filter: ResearchQueryFilter = req.body;
  const result = BacktestEngine.queryHistoricalExpectancy(filter);
  res.json(result);
});

// Wallet Discovery Endpoint
app.post('/api/wallets/discover', async (req: Request, res: Response) => {
  const rawTxs = req.body.transactions || [];
  const discovered = await WalletDiscoveryService.discoverWalletsFromActivity(
    rawTxs,
    systemSettings,
    storage
  );
  wallets.push(...discovered);
  res.json({ success: true, discoveredCount: discovered.length, wallets: discovered });
});

// AI Quantitative Research Assistant (Server-Side Gemini)
app.post('/api/ai-analyst', async (req: Request, res: Response) => {
  const { prompt, dataPayload } = req.body;
  const ai = getGeminiClient();

  if (!ai) {
    return res.json({
      analysis: 'AI analyst unavailable. No quantitative conclusion generated. Please configure GEMINI_API_KEY in Settings to enable live algorithmic analysis.'
    });
  }

  try {
    const isDemo = APP_MODE === 'demo';
    const demoWarning = isDemo
      ? 'Note: Analysis is based on synthetic demo data and is not evidence of actual trading performance.\n\n'
      : '';

    const systemPrompt = `You are the lead quantitative research analyst for HEF AlphaGraph, an institutional crypto smart-money research and paper-trading platform.
Objective: Discover statistically repeatable trading patterns, quantify copyability after latency/slippage/fees, identify trader deterioration, detect wallet clustering/sybil coordination, and validate positive net expected value.
Analyze the following request with rigorous mathematical precision, objective risk mindset, and clear quantitative structure. Never manufacture confidence or claim edge without evidence.`;

    const fullPrompt = `${demoWarning}${systemPrompt}\n\nUser Question/Task: ${prompt}\n\nContext Data: ${JSON.stringify(dataPayload || {}, null, 2)}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: fullPrompt,
    });

    res.json({
      analysis: `${demoWarning}${response.text || 'No quantitative conclusion generated.'}`
    });
  } catch (err: unknown) {
    console.error('Gemini API error:', err);
    res.json({
      analysis: 'AI analyst unavailable. No quantitative conclusion generated.'
    });
  }
});

// Vite Middleware for Development / Static serving for Production
async function startServer() {
  console.log(`[Server Boot]: Awaiting HEF AlphaGraph initialization [APP_MODE=${APP_MODE}]...`);
  await initializeState();
  console.log(`[Server Boot]: Initialization complete. systemReady=${systemReady}`);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`HEF AlphaGraph server running on http://0.0.0.0:${PORT} [APP_MODE=${APP_MODE}]`);
  });
}

const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST) || (typeof process.argv[1] === 'string' && process.argv[1].includes('vitest'));
if (!isTest) {
  startServer();
}

export { app, startServer, initializeState, storage };
