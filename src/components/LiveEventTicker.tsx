import React from 'react';
import { Terminal, ShieldAlert, CheckCircle2, AlertCircle } from 'lucide-react';
import { LiveEventItem } from '../types';

interface LiveEventTickerProps {
  events: LiveEventItem[];
}

export const LiveEventTicker: React.FC<LiveEventTickerProps> = ({ events }) => {
  if (!events || events.length === 0) return null;

  const latest = events[0];

  const getBadge = (category: LiveEventItem['category']) => {
    switch (category) {
      case 'PAPER_EXECUTION':
        return <span className="px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 text-[10px] font-mono font-bold">PAPER FILL</span>;
      case 'SIGNAL_GENERATED':
        return <span className="px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 text-[10px] font-mono font-bold">ALPHA SIGNAL</span>;
      case 'CONSENSUS_TRIGGER':
        return <span className="px-1.5 py-0.5 rounded bg-indigo-950/80 border border-indigo-500/40 text-indigo-300 text-[10px] font-mono font-bold">CONSENSUS</span>;
      case 'HARD_REJECTION':
        return <span className="px-1.5 py-0.5 rounded bg-rose-950/80 border border-rose-500/40 text-rose-300 text-[10px] font-mono font-bold">SAFETY REJECT</span>;
      default:
        return <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono">INTELLIGENCE</span>;
    }
  };

  return (
    <div className="bg-zinc-950/90 border-b border-zinc-800/80 px-4 py-1.5 flex items-center justify-between text-xs font-mono overflow-x-auto select-none">
      <div className="flex items-center gap-2.5 min-w-max">
        <div className="flex items-center gap-1.5 text-zinc-400">
          <Terminal className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[11px] font-bold text-zinc-300 uppercase">Live Intelligence Feed:</span>
        </div>

        <span className="text-zinc-400 text-[11px]">{latest.timestamp}</span>
        {getBadge(latest.category)}
        <span className="text-zinc-200 font-medium">{latest.headline}</span>
        <span className="text-zinc-400 text-[11px] hidden sm:inline">— {latest.detail}</span>
      </div>

      <div className="flex items-center gap-3 text-[11px] text-zinc-400 min-w-max pl-4 border-l border-zinc-800">
        <span>Latency: <strong className="text-zinc-300 font-mono">840ms</strong></span>
        <span>Avg Slip: <strong className="text-zinc-300 font-mono">38 bps</strong></span>
        <span className="text-emerald-400 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          <span>Point-in-Time Safe</span>
        </span>
      </div>
    </div>
  );
};
