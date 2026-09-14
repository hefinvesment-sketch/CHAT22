import React from 'react';
import { 
  Dna, 
  Sparkles, 
  Target, 
  TrendingUp, 
  CheckCircle2, 
  ShieldCheck 
} from 'lucide-react';
import { WalletProfile } from '../../types';

interface TraderGenomeViewProps {
  wallets: WalletProfile[];
  onSelectWallet: (wallet: WalletProfile) => void;
}

export const TraderGenomeView: React.FC<TraderGenomeViewProps> = ({
  wallets,
  onSelectWallet
}) => {
  return (
    <div className="space-y-4 p-4 font-mono select-none">
      {/* Header */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-bold text-zinc-100 flex items-center gap-2">
            <Dna className="w-5 h-5 text-emerald-400" />
            Trader Genome & Behavioral Archetype Engine
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Clustering traders by specialized edge: Momentum, Swing, Early Entry, Ecosystem vs Memecoin specialists.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-2.5 py-1 rounded bg-emerald-950 border border-emerald-500/40 text-emerald-400 font-semibold">
            15 Quantitative Skill Vectors
          </span>
        </div>
      </div>

      {/* Grid of Trader Genomes */}
      {wallets.length === 0 ? (
        <div className="bg-zinc-900/80 border border-zinc-800 rounded p-8 text-center text-zinc-500 text-xs">
          <Dna className="w-8 h-8 text-zinc-600 mx-auto mb-2 opacity-50" />
          <div className="text-zinc-400 font-semibold mb-1">Awaiting Discovered Wallets</div>
          <div>Trader genome clustering will extract behavioral archetypes once wallets are discovered by the ingestion worker.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {wallets.map(w => {
          const g = w.genome;
          return (
            <div 
              key={w.address} 
              className="bg-zinc-900/80 border border-zinc-800 rounded p-4 space-y-3 hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-zinc-100 text-sm flex items-center gap-2">
                    <span>{w.label || w.address.slice(0, 8)}</span>
                    <span className="text-[10px] text-zinc-400 font-normal">Score: {w.qualityScore}</span>
                  </h3>
                  <p className="text-[10px] text-zinc-400 font-mono mt-0.5">{w.address}</p>
                </div>
                <div className="text-right">
                  <span className="px-2 py-0.5 rounded bg-zinc-950 text-cyan-300 border border-zinc-800 text-xs font-bold">
                    {g.preferredMarketCap} / {g.bestMarketRegime}
                  </span>
                </div>
              </div>

              {/* Skills Matrix */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded bg-zinc-950 border border-zinc-800 space-y-1">
                  <div className="flex justify-between text-[10px] text-zinc-400">
                    <span>Momentum Skill</span>
                    <span className="font-bold text-zinc-200">{g.momentumSkill}</span>
                  </div>
                  <div className="w-full bg-zinc-900 h-1.5 rounded overflow-hidden">
                    <div className="h-full bg-emerald-400" style={{ width: `${g.momentumSkill}%` }} />
                  </div>
                </div>

                <div className="p-2 rounded bg-zinc-950 border border-zinc-800 space-y-1">
                  <div className="flex justify-between text-[10px] text-zinc-400">
                    <span>Early Entry Skill</span>
                    <span className="font-bold text-zinc-200">{g.earlyEntrySkill}</span>
                  </div>
                  <div className="w-full bg-zinc-900 h-1.5 rounded overflow-hidden">
                    <div className="h-full bg-cyan-400" style={{ width: `${g.earlyEntrySkill}%` }} />
                  </div>
                </div>

                <div className="p-2 rounded bg-zinc-950 border border-zinc-800 space-y-1">
                  <div className="flex justify-between text-[10px] text-zinc-400">
                    <span>SOL Ecosystem Skill</span>
                    <span className="font-bold text-zinc-200">{g.solEcosystemSkill}</span>
                  </div>
                  <div className="w-full bg-zinc-900 h-1.5 rounded overflow-hidden">
                    <div className="h-full bg-amber-400" style={{ width: `${g.solEcosystemSkill}%` }} />
                  </div>
                </div>

                <div className="p-2 rounded bg-zinc-950 border border-zinc-800 space-y-1">
                  <div className="flex justify-between text-[10px] text-zinc-400">
                    <span>Drawdown Control</span>
                    <span className="font-bold text-zinc-200">{g.drawdownControl}</span>
                  </div>
                  <div className="w-full bg-zinc-900 h-1.5 rounded overflow-hidden">
                    <div className="h-full bg-emerald-400" style={{ width: `${g.drawdownControl}%` }} />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-800/80">
                <span className="text-[11px] text-zinc-400">
                  Median Hold: <strong className="text-zinc-200">{g.medianHoldingTimeHours}h</strong> | Size: <strong className="text-zinc-200">{g.medianPositionPercent}%</strong>
                </span>
                <button
                  onClick={() => onSelectWallet(w)}
                  className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs transition-colors"
                >
                  Full Profile
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
