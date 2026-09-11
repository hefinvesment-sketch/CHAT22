import React, { useState } from 'react';
import { 
  Bot, 
  Trophy, 
  TrendingUp, 
  Sliders, 
  Play, 
  Pause, 
  Info, 
  CheckCircle2,
  LineChart
} from 'lucide-react';
import { ResponsiveContainer, LineChart as RechartsLine, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { PaperPortfolio } from '../../types';

interface StrategyLabViewProps {
  bots: PaperPortfolio[];
}

export const StrategyLabView: React.FC<StrategyLabViewProps> = ({ bots }) => {
  const [selectedBot, setSelectedBot] = useState<PaperPortfolio>(bots[0]);
  const sortedBots = [...bots].sort((a, b) => b.totalReturnPercent - a.totalReturnPercent);

  return (
    <div className="space-y-4 p-4 font-mono select-none">
      {/* Header */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-bold text-zinc-100 flex items-center gap-2">
            <Bot className="w-5 h-5 text-emerald-400" />
            Strategy Lab (10 Parallel $5,000 Paper Bots)
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Running 10 distinct mathematical hypotheses on identical $5,000 capital and live Solana DEX feeds.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-2.5 py-1 rounded bg-emerald-950 border border-emerald-500/40 text-emerald-400 font-semibold">
            All 10 Bots Active ($50k Total Paper Capital)
          </span>
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded p-4 overflow-x-auto">
        <h2 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-3">
          Cross-Strategy Leaderboard
        </h2>

        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-zinc-800 text-[10px] text-zinc-400 uppercase tracking-wider">
              <th className="pb-2">Rank</th>
              <th className="pb-2">Strategy Bot</th>
              <th className="pb-2">Equity ($5k Basis)</th>
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
              const isSelected = selectedBot.id === bot.id;
              const isPos = bot.totalReturnPercent >= 0;

              return (
                <tr 
                  key={bot.id} 
                  onClick={() => setSelectedBot(bot)}
                  className={`cursor-pointer transition-colors ${
                    isSelected ? 'bg-zinc-800/80' : 'hover:bg-zinc-800/40'
                  }`}
                >
                  <td className="py-2.5 font-bold text-zinc-400">
                    {index === 0 ? <span className="text-amber-400 font-bold">#1</span> : `#${index + 1}`}
                  </td>
                  <td className="py-2.5 font-bold text-zinc-100">
                    <div>{bot.name}</div>
                    <div className="text-[10px] text-zinc-400 font-normal">Starting: $5,000.00</div>
                  </td>
                  <td className="py-2.5 font-mono text-zinc-200 font-semibold">${bot.totalEquityUsd.toFixed(2)}</td>
                  <td className="py-2.5 font-bold">
                    <span className={isPos ? 'text-emerald-400' : 'text-rose-400'}>
                      {isPos ? '+' : ''}{bot.totalReturnPercent.toFixed(2)}%
                    </span>
                  </td>
                  <td className="py-2.5 text-zinc-200">{bot.winRatePercent}%</td>
                  <td className="py-2.5 text-zinc-200 font-semibold">{bot.profitFactor.toFixed(2)}x</td>
                  <td className="py-2.5 text-zinc-300">{bot.maxDrawdownPercent}%</td>
                  <td className="py-2.5 text-cyan-400 font-semibold">{bot.sharpeRatio.toFixed(2)}</td>
                  <td className="py-2.5 text-zinc-400">{bot.tradeCount}</td>
                  <td className="py-2.5 text-right">
                    <button className="text-xs text-emerald-400 hover:underline">
                      View Curve
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Selected Bot Details & Equity Curve */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Equity Chart (2 cols) */}
        <div className="lg:col-span-2 bg-zinc-900/80 border border-zinc-800 rounded p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <span>{selectedBot.name} — Equity Curve ($5,000 Base)</span>
              </h3>
              <p className="text-[11px] text-zinc-400">
                Testing hypothesis performance after simulated execution friction.
              </p>
            </div>
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
              selectedBot.totalReturnPercent >= 0 ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' : 'bg-rose-950 text-rose-400 border border-rose-500/30'
            }`}>
              {selectedBot.totalReturnPercent >= 0 ? '+' : ''}{selectedBot.totalReturnPercent.toFixed(2)}%
            </span>
          </div>

          <div className="h-60 w-full">
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
                <Line type="monotone" dataKey="equity" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} />
              </RechartsLine>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Selected Bot Rules & Specs */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded p-4 space-y-3">
          <h3 className="text-xs font-bold uppercase text-zinc-200">
            Bot Strategy Parameters & Rules
          </h3>

          <div className="space-y-2 text-xs">
            <div className="p-2 rounded bg-zinc-950 border border-zinc-800">
              <div className="text-[10px] text-zinc-400">Starting Virtual Capital:</div>
              <div className="text-sm font-bold text-zinc-200">$5,000.00</div>
            </div>
            <div className="p-2 rounded bg-zinc-950 border border-zinc-800">
              <div className="text-[10px] text-zinc-400">Max Open Positions:</div>
              <div className="text-sm font-bold text-zinc-200">5-10 Positions</div>
            </div>
            <div className="p-2 rounded bg-zinc-950 border border-zinc-800">
              <div className="text-[10px] text-zinc-400">Average Slippage Model:</div>
              <div className="text-sm font-bold text-zinc-200">{selectedBot.averageSlippageBps} bps</div>
            </div>
            <div className="p-2 rounded bg-zinc-950 border border-zinc-800">
              <div className="text-[10px] text-zinc-400">Copy Efficiency:</div>
              <div className="text-sm font-bold text-emerald-400">{selectedBot.copyEfficiencyPercent}%</div>
            </div>
          </div>

          <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-400">
            <strong className="text-zinc-300">Hypothesis Note:</strong> Identical market data inputs across all 10 bots ensure unbiased comparative strategy testing.
          </div>
        </div>
      </div>
    </div>
  );
};
