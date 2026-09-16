import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar, TabKey } from './components/Sidebar';
import { LiveEventTicker } from './components/LiveEventTicker';
import { DashboardView } from './components/views/DashboardView';
import { AlphaSignalsView } from './components/views/AlphaSignalsView';
import { SmartMoneyFlowView } from './components/views/SmartMoneyFlowView';
import { WalletDiscoveryView } from './components/views/WalletDiscoveryView';
import { WalletNetworkView } from './components/views/WalletNetworkView';
import { EmergingTradersView } from './components/views/EmergingTradersView';
import { TokensView } from './components/views/TokensView';
import { PaperPortfolioView } from './components/views/PaperPortfolioView';
import { StrategyLabView } from './components/views/StrategyLabView';
import { ResearchBacktestsView } from './components/views/ResearchBacktestsView';
import { CopyabilityAnalyticsView } from './components/views/CopyabilityAnalyticsView';
import { SystemHealthView } from './components/views/SystemHealthView';
import { AiAnalystView } from './components/views/AiAnalystView';
import { TraderGenomeView } from './components/views/TraderGenomeView';
import { TraderProfileModal } from './components/modals/TraderProfileModal';
import { SettingsModal } from './components/modals/SettingsModal';
import { 
  PaperPortfolio, 
  AlphaSignal, 
  TokenMarketData, 
  WalletProfile, 
  WalletRelationship, 
  PaperPosition, 
  PaperTradeRecord, 
  LiveEventItem,
  MarketRegime 
} from './types';
import { getErrorMessage } from './utils/errors';
import { Activity, CheckCircle2, RefreshCw, Server, AlertCircle } from 'lucide-react';

const EMPTY_PORTFOLIO: PaperPortfolio = {
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

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [currentRegime, setCurrentRegime] = useState<MarketRegime>('High Volatility');
  const [appMode, setAppMode] = useState<string>('live_paper');
  const [systemReady, setSystemReady] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [providers, setProviders] = useState<unknown[]>([]);
  const [ingestionStats, setIngestionStats] = useState<{
    isRunning: boolean;
    transactionsIngested: number;
    walletsDiscovered: number;
    tokensDiscovered: number;
    signalsGenerated: number;
    lastProcessedTimestamp: string | null;
  } | null>(null);
  
  // Real Data State (strictly non-mock in live_paper)
  const [portfolio, setPortfolio] = useState<PaperPortfolio>(EMPTY_PORTFOLIO);
  const [signals, setSignals] = useState<AlphaSignal[]>([]);
  const [tokens, setTokens] = useState<TokenMarketData[]>([]);
  const [wallets, setWallets] = useState<WalletProfile[]>([]);
  const [relationships, setRelationships] = useState<WalletRelationship[]>([]);
  const [openPositions, setOpenPositions] = useState<PaperPosition[]>([]);
  const [tradeHistory, setTradeHistory] = useState<PaperTradeRecord[]>([]);
  const [parallelBots, setParallelBots] = useState<PaperPortfolio[]>([]);
  const [liveEvents, setLiveEvents] = useState<LiveEventItem[]>([]);

  // Modals
  const [selectedWallet, setSelectedWallet] = useState<WalletProfile | null>(null);
  const [selectedSignal, setSelectedSignal] = useState<AlphaSignal | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Poll real state from backend API
  useEffect(() => {
    let isMounted = true;

    const fetchState = async () => {
      try {
        const res = await fetch('/api/state');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!isMounted) return;

        if (data.appMode) setAppMode(data.appMode);
        if (data.systemReady !== undefined) setSystemReady(data.systemReady);
        if (data.providers) setProviders(data.providers);
        if (data.ingestionStats) setIngestionStats(data.ingestionStats);
        if (data.portfolio) setPortfolio(data.portfolio);
        if (data.signals) setSignals(data.signals || []);
        if (data.tokens) setTokens(data.tokens || []);
        if (data.wallets) setWallets(data.wallets || []);
        if (data.relationships) setRelationships(data.relationships || []);
        if (data.openPositions) setOpenPositions(data.openPositions || []);
        if (data.tradeHistory) setTradeHistory(data.tradeHistory || []);
        if (data.currentRegime) setCurrentRegime(data.currentRegime);
        if (data.parallelBots) setParallelBots(data.parallelBots || []);
        if (data.liveEvents) setLiveEvents(data.liveEvents || []);
        setIsInitializing(false);
      } catch (err: unknown) {
        if (!isMounted) return;
        console.warn('[Real State Sync]:', getErrorMessage(err));
      }
    };

    fetchState();
    const pollTimer = setInterval(fetchState, 2500);

    return () => {
      isMounted = false;
      clearInterval(pollTimer);
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Real paper execution via backend risk engine and real Jupiter/Birdeye pricing
  const handleExecuteTrade = async (signalId: string) => {
    try {
      const res = await fetch('/api/paper-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signalId })
      });
      const data = await res.json();

      if (data.position && data.portfolio) {
        setPortfolio(data.portfolio);
        setOpenPositions(prev => [data.position, ...prev]);
        setSignals(prev => prev.map(s => s.id === signalId ? { ...s, decision: 'TRADED' } : s));
        showToast(`Paper Execution Success: Filled ${data.position.tokenSymbol} at $${data.position.openPrice} (${data.position.detectionLatencyMs}ms latency)`);
      } else if (data.rejectionReason) {
        showToast(`Trade Rejected by Safety Guard: ${data.rejectionReason}`);
      } else if (data.error) {
        showToast(`Trade Error: ${data.error}`);
      }
    } catch (err: unknown) {
      showToast(`Execution Error: ${getErrorMessage(err)}`);
    }
  };

  // Real position close handler via backend MTM/Jupiter liquidation
  const handleClosePosition = async (positionId: string) => {
    try {
      const res = await fetch('/api/close-position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionId })
      });
      const data = await res.json();
      if (data.portfolio && data.tradeRecord) {
        setPortfolio(data.portfolio);
        setOpenPositions(prev => prev.filter(p => p.id !== positionId));
        setTradeHistory(prev => [data.tradeRecord, ...prev]);
        showToast(`Position closed: Realized ${data.tradeRecord.realizedPnlUsd >= 0 ? '+' : ''}$${data.tradeRecord.realizedPnlUsd.toFixed(2)} (${data.tradeRecord.returnPercent}%)`);
      } else if (data.error) {
        showToast(`Close Error: ${data.error}`);
      }
    } catch (err: unknown) {
      showToast(`Close Error: ${getErrorMessage(err)}`);
    }
  };

  // Reset portfolio to clean $5,000.00
  const handleResetPortfolio = async () => {
    try {
      const res = await fetch('/api/reset-portfolio', { method: 'POST' });
      const data = await res.json();
      if (data.portfolio) {
        setPortfolio(data.portfolio);
        setOpenPositions([]);
        setTradeHistory([]);
        showToast('Portfolio reset to $5,000.00 base capital');
      }
    } catch (err: unknown) {
      showToast(`Reset Error: ${getErrorMessage(err)}`);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-mono selection:bg-emerald-500 selection:text-zinc-950">
      {/* Institutional Global Header */}
      <Header
        portfolio={portfolio}
        currentRegime={currentRegime}
        appMode={appMode}
        onResetPortfolio={handleResetPortfolio}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenAIAnalyst={() => setActiveTab('ai_analyst')}
      />

      {/* Real-Time Live Paper System Status Banner */}
      {appMode === 'live_paper' && (
        <div className={`px-4 py-2 text-xs border-b flex items-center justify-between transition-colors ${
          systemReady 
            ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
            : 'bg-amber-950/40 border-amber-500/30 text-amber-300'
        }`}>
          <div className="flex items-center gap-2.5 flex-wrap">
            {systemReady ? (
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold text-[10px]">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                LIVE PAPER ACTIVE
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold text-[10px]">
                <RefreshCw className="w-3 h-3 animate-spin" />
                AWAITING SERVER INITIALIZATION
              </span>
            )}

            <span>
              {systemReady ? (
                <>
                  Helius on-chain worker active: <strong>{ingestionStats?.transactionsIngested || 0}</strong> transactions ingested • <strong>{ingestionStats?.walletsDiscovered || wallets.length}</strong> wallets discovered • <strong>{tokens.length}</strong> tokens • <strong>{signals.length}</strong> alpha signals • Continuous MTM worker running
                </>
              ) : (
                <>
                  Verifying provider health before READY (PostgreSQL, Redis, Helius, Birdeye, Solana RPC, Jupiter)...
                </>
              )}
            </span>
          </div>

          <div className="hidden lg:flex items-center gap-3 text-[11px] font-mono">
            {(providers as Array<{ providerName: string; status: string }>).slice(0, 4).map(p => (
              <span key={p.providerName} className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${p.status === 'CONNECTED' ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
                <span className="text-zinc-400">{p.providerName}:</span>
                <span className={p.status === 'CONNECTED' ? 'text-emerald-300' : 'text-amber-300'}>{p.status}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Demo Mode Notice Banner (only if running in demo mode) */}
      {appMode === 'demo' && (
        <div className="bg-amber-950/40 border-b border-amber-500/30 px-4 py-1.5 text-xs text-amber-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-[10px] font-bold text-amber-400">DEMO ENVIRONMENT</span>
            <span>Deterministic synthetic prototype active. Simulated fills deduct latency displacement & slippage.</span>
          </div>
          <span className="text-[11px] text-amber-400/80 hidden md:inline">Base Fund: $5,000.00</span>
        </div>
      )}

      {/* Real-time Event Intelligence Ticker */}
      <LiveEventTicker events={liveEvents} />

      {/* Main Workspace Layout (Sidebar + Content Stage) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onSelectTab={(tab) => setActiveTab(tab)}
          liveSignalCount={signals.filter(s => (s.alphaScore ?? 0) >= 85).length}
          openPositionCount={openPositions.length}
        />

        {/* Dynamic Content View Area */}
        <main className="flex-1 h-[calc(100vh-85px)] overflow-y-auto bg-zinc-950/60 pb-12">
          {activeTab === 'dashboard' && (
            <DashboardView
              portfolio={portfolio}
              signals={signals}
              tokens={tokens}
              liveEvents={liveEvents}
              openPositions={openPositions}
              parallelBots={parallelBots}
              onSelectSignal={(sig) => setSelectedSignal(sig)}
              onExecuteTrade={handleExecuteTrade}
              onNavigateToTab={(t) => setActiveTab(t as TabKey)}
            />
          )}

          {activeTab === 'signals' && (
            <AlphaSignalsView
              signals={signals}
              onExecuteTrade={handleExecuteTrade}
              selectedSignal={selectedSignal}
              onSelectSignal={setSelectedSignal}
            />
          )}

          {activeTab === 'flows' && (
            <SmartMoneyFlowView tokens={tokens} />
          )}

          {activeTab === 'discovery' && (
            <WalletDiscoveryView
              wallets={wallets}
              onSelectWallet={(w) => setSelectedWallet(w)}
            />
          )}

          {activeTab === 'genome' && (
            <TraderGenomeView
              wallets={wallets}
              onSelectWallet={(w) => setSelectedWallet(w)}
            />
          )}

          {activeTab === 'network' && (
            <WalletNetworkView
              wallets={wallets}
              relationships={relationships}
              onSelectWallet={(w) => setSelectedWallet(w)}
            />
          )}

          {activeTab === 'emerging' && (
            <EmergingTradersView
              wallets={wallets}
              onSelectWallet={(w) => setSelectedWallet(w)}
            />
          )}

          {activeTab === 'tokens' && (
            <TokensView tokens={tokens} />
          )}

          {activeTab === 'portfolio' && (
            <PaperPortfolioView
              portfolio={portfolio}
              openPositions={openPositions}
              tradeHistory={tradeHistory}
              onClosePosition={handleClosePosition}
              onResetPortfolio={handleResetPortfolio}
            />
          )}

          {activeTab === 'lab' && (
            <StrategyLabView bots={parallelBots} />
          )}

          {activeTab === 'research' && (
            <ResearchBacktestsView />
          )}

          {activeTab === 'analytics' && (
            <CopyabilityAnalyticsView />
          )}

          {activeTab === 'health' && (
            <SystemHealthView />
          )}

          {activeTab === 'ai_analyst' && (
            <AiAnalystView
              signals={signals}
              portfolio={portfolio}
              wallets={wallets}
            />
          )}
        </main>
      </div>

      {/* Floating Action Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 bg-zinc-900 border border-emerald-500/60 shadow-lg shadow-black/80 rounded px-4 py-2.5 text-xs text-zinc-100 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Trader Profile / Genome Modal */}
      <TraderProfileModal
        wallet={selectedWallet}
        onClose={() => setSelectedWallet(null)}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}
