import React from 'react';
import { 
  TrendingUp, 
  Sparkles, 
  Dna, 
  ShieldCheck, 
  CheckCircle2, 
  Zap, 
  ArrowUpRight 
} from 'lucide-react';
import { WalletProfile } from '../../types';

interface EmergingTradersViewProps {
  wallets: WalletProfile[];
  onSelectWallet: (wallet: WalletProfile) => void;
}

export const EmergingTradersView: React.FC<EmergingTradersViewProps> = ({
  wallets,
  onSelectWallet
}) => {
  // Wallets sorted by emergingAlphaScore with positive trajectory
  const emergingWallets = [...wallets]
    .filter(w => (w.emergingAlphaScore ?? 0) >= 75)
    .sort((a, b) => (b.emergingAlphaScore ?? 0) - (a.emergingAlphaScore ?? 0));

  return (
    <div className="space-y-4 p-4 font-mono select-none">
      {/* Header */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-bold text-zinc-100 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            Emerging Alpha & Early Trader Discovery
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Detecting rapidly improving trader skill (90d &rarr; 60d &rarr; 30d &rarr; 14d &rarr; 7d) before public leaderboard crowding.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-2.5 py-1 rounded bg-emerald-950 border border-emerald-500/40 text-emerald-400 font-semibold flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Early Edge Pre-Leaderboard</span>
          </span>
        </div>
      </div>

      {/* Grid of Emerging Wallets */}
      {emergingWallets.length === 0 ? (
        <div className="bg-zinc-900/80 border border-zinc-800 rounded p-8 text-center text-zinc-500 text-xs">
          <TrendingUp className="w-8 h-8 text-zinc-600 mx-auto mb-2 opacity-50" />
          <div className="text-zinc-400 font-semibold mb-1">Awaiting Emerging Trader Signals</div>
          <div>Wallets with accelerating alpha scores and positive multi-timeframe trajectory will appear here as activity is evaluated.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {emergingWallets.map(w => {
          const rolling = w.rollingScores || { sevenDay: 0, fourteenDay: 0, thirtyDay: 0, sixtyDay: 0, ninetyDay: 0, oneEightyDay: 0, lifetime: 0 };
          const delta = rolling.sevenDay - rolling.ninetyDay;
          return (
            <div key={w.address} className="bg-zinc-900/80 border border-zinc-800 rounded p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-zinc-100 text-sm flex items-center gap-2">
                    <span>{w.label || `${w.address.slice(0, 8)}...`}</span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                      +{delta} pts trajectory
                    </span>
                  </h3>
                  <p className="text-[10px] text-zinc-400 font-mono mt-0.5">{w.address}</p>
                </div>
                <div className="text-right">
                  <div className="text-xs text-zinc-400">Emerging Alpha Score:</div>
                  <div className="text-xl font-bold text-emerald-400 font-mono">{w.emergingAlphaScore} / 100</div>
                </div>
              </div>

              {/* Trajectory Bar */}
              <div className="bg-zinc-950 p-2.5 rounded border border-zinc-800 space-y-1.5 text-xs">
                <div className="text-[10px] text-zinc-400 font-bold uppercase">
                  Rolling Skill Acceleration Curve
                </div>
                <div className="grid grid-cols-5 gap-1 text-center font-mono">
                  <div className="p-1 rounded bg-zinc-900">
                    <div className="text-[9px] text-zinc-400">90d</div>
                    <div className="font-bold text-zinc-300">{rolling.ninetyDay}</div>
                  </div>
                  <div className="p-1 rounded bg-zinc-900">
                    <div className="text-[9px] text-zinc-400">60d</div>
                    <div className="font-bold text-zinc-300">{rolling.sixtyDay}</div>
                  </div>
                  <div className="p-1 rounded bg-zinc-900">
                    <div className="text-[9px] text-zinc-400">30d</div>
                    <div className="font-bold text-zinc-200">{rolling.thirtyDay}</div>
                  </div>
                  <div className="p-1 rounded bg-zinc-900">
                    <div className="text-[9px] text-zinc-400">14d</div>
                    <div className="font-bold text-emerald-400">{rolling.fourteenDay}</div>
                  </div>
                  <div className="p-1 rounded bg-emerald-950/80 border border-emerald-500/40">
                    <div className="text-[9px] text-emerald-400">7d</div>
                    <div className="font-bold text-emerald-300">{rolling.sevenDay}</div>
                  </div>
                </div>
              </div>

              {/* Robustness Checks */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="p-2 rounded bg-zinc-950 border border-zinc-800">
                  <div className="text-[10px] text-zinc-400">Sample Size</div>
                  <div className="font-bold text-zinc-200">{w.tradeCount} Swaps</div>
                </div>
                <div className="p-2 rounded bg-zinc-950 border border-zinc-800">
                  <div className="text-[10px] text-zinc-400">Drawdown Control</div>
                  <div className="font-bold text-emerald-400">{w.maxDrawdownPercent}% Max DD</div>
                </div>
                <div className="p-2 rounded bg-zinc-950 border border-zinc-800">
                  <div className="text-[10px] text-zinc-400">Top 1 Profit</div>
                  <div className="font-bold text-zinc-200">{w.top1TradeProfitPercent}% (Not Lucky)</div>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  onClick={() => onSelectWallet(w)}
                  className="px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs flex items-center gap-1.5 transition-colors"
                >
                  <Dna className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Inspect Trader Genome</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
);
};
