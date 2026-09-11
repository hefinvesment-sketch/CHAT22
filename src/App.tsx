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
  MOCK_PORTFOLIO, 
  MOCK_SIGNALS, 
  MOCK_TOKENS, 
  MOCK_WALLETS, 
  MOCK_WALLET_RELATIONSHIPS, 
  MOCK_OPEN_POSITIONS, 
  MOCK_TRADE_HISTORY, 
  MOCK_PARALLEL_BOTS, 
  MOCK_LIVE_EVENTS 
} from './data/mockData';
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

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [currentRegime, setCurrentRegime] = useState<MarketRegime>('High Volatility');
  const [appMode, setAppMode] = useState<string>('demo');
  
  // Data State
  const [portfolio, setPortfolio] = useState<PaperPortfolio>(MOCK_PORTFOLIO);
  const [signals, setSignals] = useState<AlphaSignal[]>(MOCK_SIGNALS);
  const [tokens, setTokens] = useState<TokenMarketData[]>(MOCK_TOKENS);
  const [wallets, setWallets] = useState<WalletProfile[]>(MOCK_WALLETS);
  const [relationships, setRelationships] = useState<WalletRelationship[]>(MOCK_WALLET_RELATIONSHIPS);
  const [openPositions, setOpenPositions] = useState<PaperPosition[]>(MOCK_OPEN_POSITIONS);
  const [tradeHistory, setTradeHistory] = useState<PaperTradeRecord[]>(MOCK_TRADE_HISTORY);
  const [parallelBots, setParallelBots] = useState<PaperPortfolio[]>(MOCK_PARALLEL_BOTS);
  const [liveEvents, setLiveEvents] = useState<LiveEventItem[]>(MOCK_LIVE_EVENTS);

  // Modals
  const [selectedWallet, setSelectedWallet] = useState<WalletProfile | null>(null);
  const [selectedSignal, setSelectedSignal] = useState<AlphaSignal | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Load state from backend on mount
  useEffect(() => {
    fetch('/api/state')
      .then(res => {
        if (!res.ok) throw new Error('API offline');
        return res.json();
      })
      .then(data => {
        if (data.appMode) setAppMode(data.appMode);
        if (data.portfolio) setPortfolio(data.portfolio);
        if (data.signals) setSignals(data.signals);
        if (data.tokens) setTokens(data.tokens);
        if (data.wallets) setWallets(data.wallets);
        if (data.openPositions) setOpenPositions(data.openPositions);
        if (data.tradeHistory) setTradeHistory(data.tradeHistory);
        if (data.currentRegime) setCurrentRegime(data.currentRegime);
        if (data.parallelBots) setParallelBots(data.parallelBots);
      })
      .catch(() => {
        // Fallback to rich seeded mock data if offline
      });
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Simulate executing a paper trade
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
        showToast(`Trade Warning: ${data.error}`);
      }
    } catch (err) {
      // Local simulated execution fallback
      const targetSig = signals.find(s => s.id === signalId);
      if (targetSig) {
        const fillPrice = targetSig.executionSimulation?.simulatedFillPrice || targetSig.priceAtSignal;
        const sizeUsd = targetSig.executionSimulation?.recommendedPositionUsd || 90.00;
        const posAmount = Number((sizeUsd / fillPrice).toFixed(4));

        const newPos: PaperPosition = {
          id: `pos-${Date.now()}`,
          portfolioId: portfolio.id,
          tokenSymbol: targetSig.tokenSymbol,
          tokenAddress: targetSig.tokenAddress,
          openPrice: fillPrice,
          currentPrice: fillPrice,
          amount: posAmount,
          costBasisUsd: sizeUsd,
          currentValueUsd: sizeUsd,
          unrealizedPnlUsd: 0,
          unrealizedReturnPercent: 0,
          openedAt: new Date().toLocaleTimeString(),
          stopLossPrice: Number((fillPrice * 0.94).toFixed(4)),
          takeProfitPrice: Number((fillPrice * 1.15).toFixed(4)),
          allocationPercent: 1.8,
          strategyName: 'Base Alpha Model',
          signalId: targetSig.id,
          signalAlphaScore: targetSig.alphaScore,
          detectionLatencyMs: 840,
          slippageIncurredPercent: 0.0038
        };

        setOpenPositions(prev => [newPos, ...prev]);
        setPortfolio(prev => ({
          ...prev,
          cashUsd: prev.cashUsd - sizeUsd,
          positionsValueUsd: prev.positionsValueUsd + sizeUsd,
          tradeCount: prev.tradeCount + 1
        }));
        setSignals(prev => prev.map(s => s.id === signalId ? { ...s, decision: 'TRADED' } : s));
        showToast(`Simulated Paper Execution: ${targetSig.tokenSymbol} filled at $${fillPrice}`);
      }
    }
  };

  // Close position handler
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
      }
    } catch (err) {
      // Local fallback
      const pos = openPositions.find(p => p.id === positionId);
      if (pos) {
        const proceeds = pos.currentValueUsd;
        const pnl = proceeds - pos.costBasisUsd;
        setOpenPositions(prev => prev.filter(p => p.id !== positionId));
        setPortfolio(prev => ({
          ...prev,
          cashUsd: prev.cashUsd + proceeds,
          positionsValueUsd: prev.positionsValueUsd - pos.costBasisUsd,
          realizedPnlUsd: prev.realizedPnlUsd + pnl,
          totalEquityUsd: prev.cashUsd + proceeds + (prev.positionsValueUsd - pos.costBasisUsd)
        }));
        showToast(`Position closed: Realized ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`);
      }
    }
  };

  // Reset portfolio
  const handleResetPortfolio = async () => {
    try {
      const res = await fetch('/api/reset-portfolio', { method: 'POST' });
      const data = await res.json();
      if (data.portfolio) {
        setPortfolio(data.portfolio);
        setOpenPositions([]);
        showToast('Portfolio reset to $5,000.00 base capital');
      }
    } catch (err) {
      setPortfolio(MOCK_PORTFOLIO);
      setOpenPositions([]);
      showToast('Portfolio reset to $5,000.00 base capital');
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

      {/* Demo Mode Notice Banner */}
      {appMode === 'demo' && (
        <div className="bg-amber-950/40 border-b border-amber-500/30 px-4 py-1.5 text-xs text-amber-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-[10px] font-bold text-amber-400">DEMO ENVIRONMENT</span>
            <span>Deterministic synthetic prototype active. Simulated fills deduct latency displacement (800-1200ms) & slippage. Portfolio ledger enforces strict double-entry balance.</span>
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
          liveSignalCount={signals.filter(s => s.alphaScore >= 85).length}
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
              onNavigateToTab={(t) => setActiveTab(t)}
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
