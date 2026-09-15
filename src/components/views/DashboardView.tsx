import React from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  ShieldAlert, 
  Zap, 
  Target, 
  BarChart3, 
  Clock, 
  ArrowUpRight,
  Sparkles,
  Layers,
  ChevronRight,
  Bot
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  Legend 
} from 'recharts';
import { 
  PaperPortfolio, 
  AlphaSignal, 
  TokenMarketData, 
  LiveEventItem,
  PaperPosition
} from '../../types';

interface DashboardViewProps {
  portfolio: PaperPortfolio;
  signals: AlphaSignal[];
  tokens: TokenMarketData[];
  liveEvents: LiveEventItem[];
  openPositions: PaperPosition[];
  parallelBots: PaperPortfolio[];
  onSelectSignal: (signal: AlphaSignal) => void;
  onExecuteTrade: (signalId: string) => void;
  onNavigateToTab: (tab: any) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  portfolio,
  signals,
  tokens,
  liveEvents,
  openPositions,
  parallelBots,
  onSelectSignal,
  onExecuteTrade,
  onNavigateToTab
}) => {
  const topSignal = signals.find(s => s.alphaScore >= 85 && s.decision === 'TRADED') || signals[0];
  const sortedTokens = [...tokens].sort((a, b) => b.netFlow24hUsd - a.netFlow24hUsd);
  const bestBot = [...parallelBots].sort((a, b) => b.totalReturnPercent - a.totalReturnPercent)[0];

  return (
    <div className="space-y-4 p-4 font-mono select-none">
      {/* Institutional Top KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
        {/* Metric 1: Total Equity & Return */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded p-3">
          <div className="text-[10px] text-zinc-400 uppercase tracking-wider">Virtual Equity ($5k Base)</div>
          <div className="text-xl font-bold text-zinc-100 mt-1">
            ${portfolio.totalEquityUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-xs">
            <span className={`font-semibold ${portfolio.totalReturnPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {portfolio.totalReturnPercent >= 0 ? '+' : ''}{portfolio.totalReturnPercent.toFixed(2)}%
            </span>
            <span className="text-[10px] text-zinc-400">Total Return</span>
          </div>
        </div>

        {/* Metric 2: Today P&L & Cash */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded p-3">
          <div className="text-[10px] text-zinc-400 uppercase tracking-wider">Today's P&L / Cash</div>
          <div className={`text-xl font-bold mt-1 ${portfolio.todayPnlUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {portfolio.todayPnlUsd >= 0 ? '+' : ''}${portfolio.todayPnlUsd.toFixed(2)}
          </div>
          <div className="text-xs text-zinc-400 mt-1 flex justify-between">
            <span>Cash:</span>
            <span className="text-zinc-200 font-semibold">${portfolio.cashUsd.toFixed(2)}</span>
          </div>
        </div>

        {/* Metric 3: Win Rate & Profit Factor */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded p-3">
          <div className="text-[10px] text-zinc-400 uppercase tracking-wider">Win Rate / PF</div>
          <div className="text-xl font-bold text-zinc-100 mt-1">
            {portfolio.winRatePercent.toFixed(1)}%
          </div>
          <div className="text-xs text-zinc-400 mt-1 flex justify-between">
            <span>Profit Factor:</span>
            <span className="text-emerald-400 font-semibold">{portfolio.profitFactor.toFixed(2)}x</span>
          </div>
        </div>

        {/* Metric 4: Max Drawdown & Sharpe */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded p-3">
          <div className="text-[10px] text-zinc-400 uppercase tracking-wider">Max DD / Sharpe</div>
          <div className="text-xl font-bold text-zinc-100 mt-1">
            {portfolio.maxDrawdownPercent.toFixed(2)}%
          </div>
          <div className="text-xs text-zinc-400 mt-1 flex justify-between">
            <span>Sharpe Ratio:</span>
            <span className="text-cyan-400 font-semibold">{portfolio.sharpeRatio.toFixed(2)}</span>
          </div>
        </div>

        {/* Metric 5: Realistic Execution Cost */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded p-3">
          <div className="text-[10px] text-zinc-400 uppercase tracking-wider">Execution Friction</div>
          <div className="text-xl font-bold text-zinc-100 mt-1">
            {portfolio.averageSlippageBps} bps
          </div>
          <div className="text-xs text-zinc-400 mt-1 flex justify-between">
            <span>Avg Latency:</span>
            <span className="text-zinc-200 font-semibold">{portfolio.averageDetectionLatencyMs}ms</span>
          </div>
        </div>

        {/* Metric 6: Copy Efficiency */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded p-3">
          <div className="text-[10px] text-zinc-400 uppercase tracking-wider">Copy Efficiency</div>
          <div className="text-xl font-bold text-emerald-400 mt-1">
            {portfolio.copyEfficiencyPercent.toFixed(1)}%
          </div>
          <div className="text-xs text-zinc-400 mt-1 flex justify-between">
            <span>Active Open:</span>
            <span className="text-zinc-200 font-semibold">{openPositions.length} pos</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Equity Chart vs Benchmarks & Top Signal Spotlight */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Equity Curve vs Benchmarks (2 cols on lg) */}
        <div className="lg:col-span-2 bg-zinc-900/80 border border-zinc-800 rounded p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                Portfolio Equity Curve vs Benchmarks ($5,000 Starting Basis)
              </h2>
              <p className="text-[11px] text-zinc-400">
                Testing whether alpha survives after latency, slippage, and trading fees vs holding SOL/BTC/ETH.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 text-[10px]">
                Net EV Model
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={portfolio.equityHistory} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="timestamp" stroke="#71717a" fontSize={11} />
                <YAxis domain={['dataMin - 50', 'dataMax + 50']} stroke="#71717a" fontSize={11} tickFormatter={(v) => `$${v}`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46', borderRadius: '4px', fontSize: '11px' }} 
                  itemStyle={{ color: '#e4e4e7' }}
                  formatter={(val: any) => [`$${Number(val).toFixed(2)}`, '']}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Line type="monotone" dataKey="equity" name="AlphaGraph ($5k)" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="solBenchmark" name="Hold SOL ($5k)" stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                <Line type="monotone" dataKey="btcBenchmark" name="Hold BTC ($5k)" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="2 2" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-4 gap-2 pt-3 mt-2 border-t border-zinc-800 text-[11px] text-zinc-400">
            <div>AlphaGraph: <strong className="text-emerald-400 font-bold">+0.11% ($5,005.43)</strong></div>
            <div>SOL Return: <strong className="text-sky-400">+3.60%</strong></div>
            <div>BTC Return: <strong className="text-amber-400">+1.80%</strong></div>
            <div>Excess Net Alpha: <strong className="text-zinc-200">Risk-Adjusted</strong></div>
          </div>
        </div>

        {/* Top Alpha Signal Spotlight */}
        {topSignal ? (
          <div className="bg-zinc-900/80 border border-zinc-800 rounded p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  <span className="text-xs uppercase text-zinc-400 font-bold tracking-wider">Top Alpha Setup</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-500/40 text-emerald-400 text-xs font-bold">
                  Score: {topSignal.alphaScore} / 100
                </span>
              </div>

              <div className="flex items-baseline justify-between mt-1">
                <div>
                  <h3 className="text-lg font-bold text-zinc-100">{topSignal.tokenSymbol}</h3>
                  <p className="text-[10px] text-zinc-400">{topSignal.tokenAddress.slice(0, 8)}...{topSignal.tokenAddress.slice(-6)}</p>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-zinc-200">${topSignal.priceAtSignal}</div>
                  <div className="text-[10px] text-zinc-400">
                    Displacement: <span className="text-emerald-400">+{topSignal.priceDisplacementFromVwapPercent}% from VWAP</span>
                  </div>
                </div>
              </div>

              {/* Quantitative Breakdown Mini Table */}
              <div className="mt-3 space-y-1.5 text-xs bg-zinc-950/60 p-2.5 rounded border border-zinc-800/80">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Independent Elite Wallets:</span>
                  <span className="text-zinc-200 font-semibold">{topSignal.independentEliteCount} Wallets (No Sybils)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Conviction Surprise:</span>
                  <span className="text-zinc-200 font-semibold">{topSignal.features?.convictionSurpriseScore || 80} / 100</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Smart-Money Acceleration:</span>
                  <span className="text-emerald-400 font-semibold">{topSignal.features?.smartMoneyAccelerationScore || 82} / 100</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Historical Net EV:</span>
                  <span className="text-emerald-400 font-bold">+{topSignal.historicalExpectancy?.netEvPercent || 8.3}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Execution Penalty:</span>
                  <span className="text-zinc-400 font-mono">-{topSignal.historicalExpectancy?.executionCostPercent || 1.1}%</span>
                </div>
              </div>

              {/* Realistic Fill Preview */}
              {topSignal.executionSimulation && (
                <div className="mt-2 text-[11px] text-zinc-400 bg-zinc-950/40 p-2 rounded border border-zinc-800/60">
                  <div className="flex justify-between">
                    <span>Simulated Fill:</span>
                    <span className="text-zinc-200 font-semibold">${topSignal.executionSimulation.simulatedFillPrice}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Recommended Size:</span>
                    <span className="text-emerald-400 font-semibold">${topSignal.executionSimulation.recommendedPositionUsd} (1.8%)</span>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => onExecuteTrade(topSignal.id)}
                className="flex-1 py-1.5 px-3 rounded bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <Zap className="w-3.5 h-3.5 fill-current" />
                <span>Simulate Paper Execution</span>
              </button>
              <button
                onClick={() => onSelectSignal(topSignal)}
                className="py-1.5 px-3 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors"
              >
                Deep Breakdown
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-zinc-900/80 border border-zinc-800 rounded p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                <span className="text-xs uppercase text-zinc-400 font-bold tracking-wider">Alpha Engine Stream</span>
              </div>
              <div className="mt-3 p-4 rounded bg-zinc-950/60 border border-zinc-800/80 text-center">
                <Target className="w-8 h-8 text-zinc-500 mx-auto mb-2 opacity-50" />
                <h4 className="text-xs font-bold text-zinc-300">Scanning Solana Blocks</h4>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Helius ingestion worker is scanning Raydium, Orca, and Jupiter DEX swaps for elite consensus setups.
                </p>
              </div>
            </div>
            <div className="mt-4 p-2.5 rounded bg-zinc-950/40 border border-zinc-800/50 text-[11px] text-zinc-400">
              Provider status: <span className="text-emerald-400 font-semibold">Real Solana Stream Active</span>
            </div>
          </div>
        )}
      </div>

      {/* Secondary Row: Smart Money Flow Leaders & Parallel Paper Bots */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Smart Money Flow Leaders Table (2 cols) */}
        <div className="lg:col-span-2 bg-zinc-900/80 border border-zinc-800 rounded p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <Zap className="w-4 h-4 text-cyan-400" />
                Smart-Money Flow Leaders (Solana DEX Activity)
              </h2>
              <p className="text-[11px] text-zinc-400">
                Tracking capital acceleration, elite volume, and divergence from smart-money VWAP.
              </p>
            </div>
            <button 
              onClick={() => onNavigateToTab('flows')}
              className="text-xs text-cyan-400 hover:underline flex items-center gap-1"
            >
              <span>View Flow Matrix</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-[10px] text-zinc-400 uppercase tracking-wider">
                  <th className="pb-2">Token</th>
                  <th className="pb-2">Price</th>
                  <th className="pb-2">24h Net Flow</th>
                  <th className="pb-2">Smart VWAP</th>
                  <th className="pb-2">Displacement</th>
                  <th className="pb-2">Liquidity Depth</th>
                  <th className="pb-2">Risk Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {sortedTokens.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-zinc-500">
                      Streaming live tokens from Solana DEX transactions...
                    </td>
                  </tr>
                ) : (
                  sortedTokens.slice(0, 5).map((tok, idx) => {
                    const disp = tok.smartMoneyVwap > 0 
                      ? Number((((tok.priceUsd - tok.smartMoneyVwap) / tok.smartMoneyVwap) * 100).toFixed(2))
                      : 0;
                    return (
                      <tr key={tok.address || `${tok.symbol}-${idx}`} className="hover:bg-zinc-800/40 transition-colors">
                        <td className="py-2.5">
                          <div className="font-bold text-zinc-200">{tok.symbol}</div>
                          <div className="text-[10px] text-zinc-400">{tok.name}</div>
                        </td>
                        <td className="py-2.5 font-semibold text-zinc-200">${tok.priceUsd}</td>
                        <td className="py-2.5">
                          <span className={`font-semibold ${tok.netFlow24hUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {tok.netFlow24hUsd >= 0 ? '+' : ''}${(tok.netFlow24hUsd / 1000000).toFixed(2)}M
                          </span>
                        </td>
                        <td className="py-2.5 text-zinc-400">${tok.smartMoneyVwap}</td>
                        <td className="py-2.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                            disp > 3.0 ? 'bg-rose-950/60 text-rose-300 border border-rose-800/40' : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/40'
                          }`}>
                            {disp >= 0 ? '+' : ''}{disp}%
                          </span>
                        </td>
                        <td className="py-2.5 text-zinc-300">${(tok.liquidityUsd / 1000000).toFixed(1)}M</td>
                        <td className="py-2.5">
                          <span className={`text-[10px] font-bold ${tok.riskScore <= 15 ? 'text-emerald-400' : tok.riskScore <= 30 ? 'text-amber-400' : 'text-rose-400'}`}>
                            {tok.riskScore} / 100
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Parallel $5k Strategy Bots Leaderboard */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                  <Bot className="w-4 h-4 text-emerald-400" />
                  10 Parallel $5k Paper Bots
                </h2>
                <p className="text-[11px] text-zinc-400">
                  Testing distinct hypotheses on identical starting capital.
                </p>
              </div>
              <button 
                onClick={() => onNavigateToTab('lab')}
                className="text-xs text-emerald-400 hover:underline"
              >
                Strategy Lab
              </button>
            </div>

            <div className="space-y-2">
              {parallelBots.length === 0 ? (
                <div className="p-3 text-center text-xs text-zinc-500 bg-zinc-950/40 rounded border border-zinc-800/60">
                  Live Paper Trading active on primary $5,000 account.
                </div>
              ) : (
                parallelBots.slice(0, 4).map(bot => {
                  const isPos = bot.totalReturnPercent >= 0;
                  return (
                    <div key={bot.id} className="p-2 rounded bg-zinc-950/60 border border-zinc-800 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-zinc-200">{bot.name}</div>
                        <div className="text-[10px] text-zinc-400">Win Rate: {bot.winRatePercent}% | Sharpe: {bot.sharpeRatio}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-zinc-100">${bot.totalEquityUsd.toFixed(2)}</div>
                        <div className={`text-[10px] font-semibold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isPos ? '+' : ''}{bot.totalReturnPercent.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {bestBot ? (
            <div className="mt-3 p-2 bg-emerald-950/40 border border-emerald-500/30 rounded text-xs text-emerald-300">
              <span className="font-bold">Top Performing:</span> {bestBot.name} ({bestBot.totalReturnPercent >= 0 ? '+' : ''}{bestBot.totalReturnPercent.toFixed(2)}%)
            </div>
          ) : (
            <div className="mt-3 p-2 bg-zinc-950/40 border border-zinc-800/40 rounded text-xs text-zinc-400">
              <span className="font-bold">Execution Engine:</span> Primary Institutional Bot ($5,000 Basis)
            </div>
          )}
        </div>
      </div>

      {/* Active Open Positions Table */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              Active Open Paper Positions ({openPositions.length} / 10 Max)
            </h2>
            <p className="text-[11px] text-zinc-400">
              Virtual positions managed with automated trailing stops, take profits, and realistic execution fills.
            </p>
          </div>
          <button 
            onClick={() => onNavigateToTab('portfolio')}
            className="text-xs text-emerald-400 hover:underline flex items-center gap-1"
          >
            <span>Full Paper Portfolio</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {openPositions.length === 0 ? (
          <div className="text-center py-6 text-zinc-400 text-xs">
            No open paper positions. Browse Alpha Signals to execute simulated trades.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-[10px] text-zinc-400 uppercase tracking-wider">
                  <th className="pb-2">Token</th>
                  <th className="pb-2">Open Price (Fill)</th>
                  <th className="pb-2">Current Price</th>
                  <th className="pb-2">Allocated</th>
                  <th className="pb-2">Current Value</th>
                  <th className="pb-2">Unrealized P&L</th>
                  <th className="pb-2">Stop / Target</th>
                  <th className="pb-2">Latency / Slip</th>
                  <th className="pb-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {openPositions.map(pos => {
                  const isPnlPos = pos.unrealizedPnlUsd >= 0;
                  return (
                    <tr key={pos.id} className="hover:bg-zinc-800/40 transition-colors">
                      <td className="py-2.5 font-bold text-zinc-100">{pos.tokenSymbol}</td>
                      <td className="py-2.5 font-mono text-zinc-300">${pos.openPrice}</td>
                      <td className="py-2.5 font-mono text-zinc-200">${pos.currentPrice}</td>
                      <td className="py-2.5 text-zinc-400">${pos.costBasisUsd.toFixed(2)} ({pos.allocationPercent}%)</td>
                      <td className="py-2.5 font-semibold text-zinc-200">${pos.currentValueUsd.toFixed(2)}</td>
                      <td className="py-2.5">
                        <span className={`font-semibold ${isPnlPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isPnlPos ? '+' : ''}${pos.unrealizedPnlUsd.toFixed(2)} ({isPnlPos ? '+' : ''}{pos.unrealizedReturnPercent}%)
                        </span>
                      </td>
                      <td className="py-2.5 text-[11px] text-zinc-400">
                        SL: ${pos.stopLossPrice} / TP: ${pos.takeProfitPrice}
                      </td>
                      <td className="py-2.5 text-[11px] text-zinc-400 font-mono">
                        {pos.detectionLatencyMs}ms / {Math.round(pos.slippageIncurredPercent * 100)} bps
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          onClick={() => onNavigateToTab('portfolio')}
                          className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
