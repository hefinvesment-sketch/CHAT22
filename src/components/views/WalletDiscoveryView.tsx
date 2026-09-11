import React, { useState } from 'react';
import { 
  Search, 
  Filter, 
  Dna, 
  ShieldCheck, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  Percent, 
  ExternalLink 
} from 'lucide-react';
import { WalletProfile } from '../../types';

interface WalletDiscoveryViewProps {
  wallets: WalletProfile[];
  onSelectWallet: (wallet: WalletProfile) => void;
}

export const WalletDiscoveryView: React.FC<WalletDiscoveryViewProps> = ({
  wallets,
  onSelectWallet
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [minScore, setMinScore] = useState(70);
  const [filterEligibleOnly, setFilterEligibleOnly] = useState(false);

  const filteredWallets = wallets.filter(w => {
    if (filterEligibleOnly && !w.isEligibleSmartMoney) return false;
    if (w.qualityScore < minScore) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchAddr = w.address.toLowerCase().includes(q);
      const matchLabel = w.label?.toLowerCase().includes(q) || false;
      return matchAddr || matchLabel;
    }
    return true;
  });

  return (
    <div className="space-y-4 p-4 font-mono select-none">
      {/* Top Search & Filter Bar */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-bold text-zinc-100 flex items-center gap-2">
            <Search className="w-5 h-5 text-emerald-400" />
            Wallet Discovery & Trader Rankings Engine
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Institutional filtering: &gt;=$50k portfolio, &gt;=180d age, &gt;=100 trades, &gt;=40% core assets (SOL/USDC/USDT/BTC/ETH).
          </p>
        </div>

        {/* Search input & score filter */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search wallet address or label..."
              className="bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 w-56 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 px-2.5 py-1.5 rounded">
            <span className="text-zinc-400 text-[11px]">Min Score:</span>
            <select
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="bg-transparent text-zinc-200 text-xs focus:outline-none cursor-pointer"
            >
              <option value={50}>50+ Score</option>
              <option value={70}>70+ Score</option>
              <option value={85}>85+ Elite</option>
              <option value={92}>92+ Pinnacle</option>
            </select>
          </div>

          <button
            onClick={() => setFilterEligibleOnly(!filterEligibleOnly)}
            className={`px-3 py-1.5 rounded text-xs transition-colors ${
              filterEligibleOnly 
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40 font-bold' 
                : 'bg-zinc-950 text-zinc-400 border border-zinc-800 hover:text-zinc-200'
            }`}
          >
            Eligible Only
          </button>
        </div>
      </div>

      {/* Wallets Table */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded p-4 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-zinc-800 text-[10px] text-zinc-400 uppercase tracking-wider">
              <th className="pb-2.5">Trader / Wallet</th>
              <th className="pb-2.5">Quality Score</th>
              <th className="pb-2.5">Copyability</th>
              <th className="pb-2.5">Portfolio Value</th>
              <th className="pb-2.5">Core Ratio</th>
              <th className="pb-2.5">Realized P&L</th>
              <th className="pb-2.5">Win Rate</th>
              <th className="pb-2.5">Profit Factor</th>
              <th className="pb-2.5">Top 1 Conc.</th>
              <th className="pb-2.5">Momentum</th>
              <th className="pb-2.5 text-right">Genome</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {filteredWallets.map(w => {
              const isEligible = w.isEligibleSmartMoney;
              return (
                <tr key={w.address} className="hover:bg-zinc-800/40 transition-colors">
                  <td className="py-3">
                    <div className="font-bold text-zinc-100 flex items-center gap-1.5">
                      <span>{w.label || `${w.address.slice(0, 6)}...${w.address.slice(-4)}`}</span>
                      {!isEligible && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-rose-950 text-rose-400 border border-rose-800">
                          Ineligible
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-zinc-400 font-mono">
                      {w.address.slice(0, 10)}...{w.address.slice(-6)} • {w.tradeCount} trades
                    </div>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-1">
                      <span className={`text-base font-bold ${w.qualityScore >= 90 ? 'text-emerald-400' : w.qualityScore >= 75 ? 'text-cyan-300' : 'text-amber-400'}`}>
                        {w.qualityScore}
                      </span>
                      <span className="text-[10px] text-zinc-400">/ 100</span>
                    </div>
                  </td>
                  <td className="py-3">
                    <div>
                      <span className="font-bold text-zinc-200">{w.copyability.copyabilityScore}</span>
                      <span className="text-[10px] text-zinc-400 ml-1">({w.copyability.copyEfficiency}%)</span>
                    </div>
                  </td>
                  <td className="py-3 font-semibold text-zinc-200">
                    ${(w.portfolioValueUsd / 1000).toFixed(0)}k
                  </td>
                  <td className="py-3">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                      w.coreAssetRatio >= 0.4 ? 'bg-emerald-950/60 text-emerald-300' : 'bg-rose-950/60 text-rose-300'
                    }`}>
                      {(w.coreAssetRatio * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className="py-3 font-bold text-emerald-400">
                    +${(w.realizedPnlUsd / 1000).toFixed(0)}k
                  </td>
                  <td className="py-3 text-zinc-200 font-semibold">{w.winRate}%</td>
                  <td className="py-3 text-zinc-200 font-semibold">{w.profitFactor.toFixed(2)}x</td>
                  <td className="py-3">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                      w.top1TradeProfitPercent > 50 ? 'bg-rose-950/60 text-rose-400 border border-rose-800' : 'text-zinc-300'
                    }`}>
                      {w.top1TradeProfitPercent}%
                    </span>
                  </td>
                  <td className="py-3">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      w.momentumStatus === 'Improving' ? 'text-emerald-400 bg-emerald-950/80' :
                      w.momentumStatus === 'Stable' ? 'text-zinc-300 bg-zinc-800' :
                      'text-rose-400 bg-rose-950/80'
                    }`}>
                      {w.momentumStatus}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <button
                      onClick={() => onSelectWallet(w)}
                      className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs flex items-center gap-1 ml-auto transition-colors"
                    >
                      <Dna className="w-3 h-3 text-emerald-400" />
                      <span>Genome</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
