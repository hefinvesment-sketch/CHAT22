import React, { useState, useEffect } from 'react';
import { 
  Bot, 
  TrendingUp, 
  Info, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  Activity,
  Layers,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { ResponsiveContainer, LineChart as RechartsLine, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { PaperPortfolio, StrategyDecisionRecord } from '../../types';

interface StrategyLabViewProps {
  bots?: PaperPortfolio[];
}

export const StrategyLabView: React.FC<StrategyLabViewProps> = ({ bots = [] }) => {
  const safeBots = Array.isArray(bots) ? bots : [];
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<StrategyDecisionRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'decisions'>('leaderboard');
  const [isLoadingDecisions, setIsLoadingDecisions] = useState<boolean>(false);

  // Auto-select first bot when bots load
  useEffect(() => {
    if (safeBots.length > 0 && (!selectedBotId || !safeBots.some(b => b.id === selectedBotId))) {
      setSelectedBotId(safeBots[0].id);
    }
  }, [safeBots, selectedBotId]);

  // Fetch real point-in-time signal decisions
  useEffect(() => {
    let isMounted = true;
    const fetchDecisions = async () => {
      try {
        setIsLoadingDecisions(true);
        const res = await fetch('/api/strategy-lab/decisions?limit=50');
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setDecisions(Array.isArray(data) ? data : []);
          }
        }
      } catch (err) {
        console.warn('[StrategyLabView] Error fetching decisions:', err);
      } finally {
        if (isMounted) setIsLoadingDecisions(false);
      }
    };

    fetchDecisions();
    const timer = setInterval(fetchDecisions, 10000);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, []);

  const selectedBot = safeBots.find(b => b.id === selectedBotId) || safeBots[0] || null;
  const sortedBots = [...safeBots].sort((a, b) => (b.totalReturnPercent || 0) - (a.totalReturnPercent || 0));

  return (
    <div id="strategy-lab-root" className="space-y-4 p-4 font-mono select-none">
      {/* Header Banner */}
      <div id="strategy-lab-header" className="bg-zinc-900/80 border border-zinc-800 rounded p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-bold text-zinc-100 flex items-center gap-2">
            <Bot className="w-5 h-5 text-emerald-400" />
            Strategy Lab (10 Parallel $5,000 Paper Bots)
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Quantitative research evaluating 10 independent mathematical hypotheses on live Solana DEX feeds.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-2.5 py-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-300 font-semibold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            {safeBots.length} Active Hypotheses ($50k Combined Base)
          </span>
          <div className="flex bg-zinc-950 border border-zinc-800 rounded p-0.5 text-xs">
            <button
              id="tab-leaderboard-btn"
              onClick={() => setActiveTab('leaderboard')}
              className={`px-3 py-1 rounded transition-colors ${
                activeTab === 'leaderboard' ? 'bg-zinc-800 text-zinc-100 font-semibold' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Leaderboard
            </button>
            <button
              id="tab-decisions-btn"
              onClick={() => setActiveTab('decisions')}
              className={`px-3 py-1 rounded transition-colors ${
                activeTab === 'decisions' ? 'bg-zinc-800 text-zinc-100 font-semibold' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Signal Decisions ({decisions.length})
            </button>
          </div>
        </div>
      </div>

      {safeBots.length === 0 ? (
        /* Empty / Loading State */
        <div id="strategy-lab-empty" className="bg-zinc-900/80 border border-zinc-800 rounded p-12 text-center space-y-3">
          <Activity className="w-8 h-8 text-emerald-400/60 mx-auto animate-pulse" />
          <h2 className="text-sm font-bold text-zinc-200">Initializing Quantitative Strategy Portfolios...</h2>
          <p className="text-xs text-zinc-400 max-w-lg mx-auto">
            10 isolated $5,000 research portfolios are connecting to the point-in-time execution feed.
            Performance metrics and decisions will be displayed here as real on-chain signals arrive.
          </p>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-zinc-950 border border-zinc-800 text-xs text-zinc-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            No synthetic equity curves: Live point-in-time results only
          </div>
        </div>
      ) : activeTab === 'decisions' ? (
        /* Point-in-Time Evidence & Signal Decisions View */
        <div id="strategy-lab-decisions" className="bg-zinc-900/80 border border-zinc-800 rounded p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              Point-in-Time Evidence & Strategy Decision Log
            </h2>
            <span className="text-[11px] text-zinc-400">
              Each strategy independently evaluates signals based on real risk criteria.
            </span>
          </div>

          {decisions.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-400 bg-zinc-950 rounded border border-zinc-800/80">
              No signal decisions recorded yet. Decisions will appear as live tokens are evaluated against strategy criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-[10px] text-zinc-400 uppercase tracking-wider">
                    <th className="pb-2">Timestamp</th>
                    <th className="pb-2">Strategy</th>
                    <th className="pb-2">Token</th>
                    <th className="pb-2">Alpha Score</th>
                    <th className="pb-2">Decision</th>
                    <th className="pb-2">Sizing USD</th>
                    <th className="pb-2">Reason / Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {decisions.slice(0, 30).map((dec, idx) => {
                    const isPassed = dec.decision === 'ELIGIBLE';
                    const isWatch = dec.decision === 'WATCHED';
                    return (
                      <tr key={idx} className="hover:bg-zinc-800/40">
                        <td className="py-2 text-zinc-400 text-[11px]">
                          {new Date(dec.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="py-2 font-semibold text-zinc-200">
                          {dec.strategyName || dec.strategyId}
                        </td>
                        <td className="py-2 text-zinc-100 font-bold">
                          {dec.tokenSymbol}
                        </td>
                        <td className="py-2 text-zinc-300">
                          {dec.alphaScore.toFixed(1)}
                        </td>
                        <td className="py-2 font-bold">
                          <span className={`px-2 py-0.5 rounded text-[10px] ${
                            isPassed 
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' 
                              : isWatch 
                              ? 'bg-amber-950 text-amber-400 border border-amber-500/30' 
                              : 'bg-rose-950 text-rose-400 border border-rose-500/30'
                          }`}>
                            {dec.decision}
                          </span>
                        </td>
                        <td className="py-2 text-zinc-300">
                          ${(dec.allocatedPositionUsd || 0).toFixed(2)}
                        </td>
                        <td className="py-2 text-zinc-400 text-[11px] max-w-md truncate">
                          {dec.rejectionReason || 'Strategy threshold met'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* Leaderboard & Selected Bot View */
        <>
          {/* Leaderboard Table */}
          <div id="strategy-lab-table" className="bg-zinc-900/80 border border-zinc-800 rounded p-4 overflow-x-auto">
            <h2 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-3 flex items-center justify-between">
              <span>Cross-Strategy Quantitative Leaderboard</span>
              <span className="text-[10px] text-zinc-400 font-normal">All bots share $5,000 initial virtual capital</span>
            </h2>

            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-[10px] text-zinc-400 uppercase tracking-wider">
                  <th className="pb-2">Rank</th>
                  <th className="pb-2">Strategy Hypothesis</th>
                  <th className="pb-2">Total Equity</th>
                  <th className="pb-2">Return %</th>
                  <th className="pb-2">Win Rate</th>
                  <th className="pb-2">Profit Factor</th>
                  <th className="pb-2">Max DD</th>
                  <th className="pb-2">Sharpe</th>
                  <th className="pb-2">Trades</th>
                  <th className="pb-2 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {sortedBots.map((bot, index) => {
                  const isSelected = selectedBot?.id === bot.id;
                  const ret = bot.totalReturnPercent ?? 0;
                  const isPos = ret >= 0;

                  return (
                    <tr 
                      key={bot.id} 
                      id={`bot-row-${bot.id}`}
                      onClick={() => setSelectedBotId(bot.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-zinc-800/80 border-l-2 border-emerald-400' : 'hover:bg-zinc-800/40'
                      }`}
                    >
                      <td className="py-2.5 font-bold text-zinc-400">
                        {index === 0 ? <span className="text-amber-400 font-bold">#1</span> : `#${index + 1}`}
                      </td>
                      <td className="py-2.5 font-bold text-zinc-100">
                        <div>{bot.name}</div>
                        <div className="text-[10px] text-zinc-400 font-normal">
                          {bot.description || 'Systematic rule-based execution'}
                        </div>
                      </td>
                      <td className="py-2.5 font-mono text-zinc-200 font-semibold">
                        ${(bot.totalEquityUsd ?? 5000).toFixed(2)}
                      </td>
                      <td className="py-2.5 font-bold">
                        <span className={`inline-flex items-center gap-0.5 ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isPos ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          {isPos ? '+' : ''}{ret.toFixed(2)}%
                        </span>
                      </td>
                      <td className="py-2.5 text-zinc-200">{(bot.winRatePercent ?? 0).toFixed(1)}%</td>
                      <td className="py-2.5 text-zinc-200 font-semibold">{(bot.profitFactor ?? 0).toFixed(2)}x</td>
                      <td className="py-2.5 text-zinc-300">{(bot.maxDrawdownPercent ?? 0).toFixed(1)}%</td>
                      <td className="py-2.5 text-cyan-400 font-semibold">{(bot.sharpeRatio ?? 0).toFixed(2)}</td>
                      <td className="py-2.5 text-zinc-400">{bot.totalTradesCount ?? (bot as any).tradeCount ?? 0}</td>
                      <td className="py-2.5 text-right">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBotId(bot.id);
                          }}
                          className={`text-xs px-2 py-0.5 rounded transition-colors ${
                            isSelected ? 'bg-emerald-500/20 text-emerald-300 font-semibold' : 'text-emerald-400 hover:underline'
                          }`}
                        >
                          {isSelected ? 'Viewing' : 'Inspect'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Selected Bot Details & Equity Curve */}
          {selectedBot && (
            <div id="selected-bot-panel" className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Equity Chart (2 cols) */}
              <div className="lg:col-span-2 bg-zinc-900/80 border border-zinc-800 rounded p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                      <span>{selectedBot.name} — Real Equity Curve ($5,000 Base)</span>
                    </h3>
                    <p className="text-[11px] text-zinc-400">
                      Real-time mark-to-market valuations strictly derived from actual trades and point-in-time DEX quotes.
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    (selectedBot.totalReturnPercent ?? 0) >= 0 
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' 
                      : 'bg-rose-950 text-rose-400 border border-rose-500/30'
                  }`}>
                    {(selectedBot.totalReturnPercent ?? 0) >= 0 ? '+' : ''}
                    {(selectedBot.totalReturnPercent ?? 0).toFixed(2)}%
                  </span>
                </div>

                <div className="h-60 w-full">
                  {selectedBot.equityHistory && selectedBot.equityHistory.length > 1 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsLine data={selectedBot.equityHistory}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="timestamp" stroke="#71717a" fontSize={11} />
                        <YAxis domain={['dataMin - 20', 'dataMax + 20']} stroke="#71717a" fontSize={11} tickFormatter={(v) => `$${v}`} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46', borderRadius: '4px', fontSize: '11px' }} 
                          itemStyle={{ color: '#e4e4e7' }}
                          formatter={(val: any) => [`$${Number(val).toFixed(2)}`, 'Equity']}
                        />
                        <Line type="monotone" dataKey="equity" stroke="#10b981" strokeWidth={2.5} dot={{ r: 2 }} />
                      </RechartsLine>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded">
                      <TrendingUp className="w-6 h-6 text-zinc-600 mb-2" />
                      <span>Baseline Equity: ${(selectedBot.totalEquityUsd ?? 5000).toFixed(2)}</span>
                      <span className="text-[11px] text-zinc-600 mt-0.5">Curve will advance as trades complete via point-in-time signals</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Selected Bot Rules & Specs */}
              <div className="bg-zinc-900/80 border border-zinc-800 rounded p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase text-zinc-200 flex items-center justify-between">
                  <span>Strategy Configuration</span>
                  <span className="text-[10px] text-emerald-400 font-mono">ISOLATED $5K</span>
                </h3>

                <div className="space-y-2 text-xs">
                  <div className="p-2 rounded bg-zinc-950 border border-zinc-800 flex justify-between items-center">
                    <span className="text-[10px] text-zinc-400">Cash Available:</span>
                    <span className="text-sm font-bold text-zinc-200 font-mono">
                      ${(selectedBot.cashUsd ?? 5000).toFixed(2)}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-zinc-950 border border-zinc-800 flex justify-between items-center">
                    <span className="text-[10px] text-zinc-400">Position Value:</span>
                    <span className="text-sm font-bold text-zinc-200 font-mono">
                      ${(selectedBot.positionsValueUsd ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-zinc-950 border border-zinc-800 flex justify-between items-center">
                    <span className="text-[10px] text-zinc-400">Realized P&L:</span>
                    <span className={`text-sm font-bold font-mono ${
                      (selectedBot.realizedPnlUsd ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {(selectedBot.realizedPnlUsd ?? 0) >= 0 ? '+' : ''}${(selectedBot.realizedPnlUsd ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-zinc-950 border border-zinc-800 flex justify-between items-center">
                    <span className="text-[10px] text-zinc-400">Sharpe Ratio:</span>
                    <span className="text-sm font-bold text-cyan-400 font-mono">
                      {(selectedBot.sharpeRatio ?? 0).toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-400 space-y-1">
                  <div className="flex items-center gap-1.5 text-zinc-300 font-semibold">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    Strict Scientific Testing
                  </div>
                  <p>
                    Every strategy is presented with identical market signals. Differences in performance represent genuine empirical edge under slippage and fees.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
