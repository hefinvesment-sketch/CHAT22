import React from 'react';
import { 
  LineChart, 
  Percent, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Zap, 
  TrendingDown, 
  ShieldAlert 
} from 'lucide-react';

export const CopyabilityAnalyticsView: React.FC = () => {
  return (
    <div className="space-y-4 p-4 font-mono select-none">
      {/* Header */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-bold text-zinc-100 flex items-center gap-2">
            <LineChart className="w-5 h-5 text-cyan-400" />
            Copyability Analytics & Execution Drag Engine
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Solving why naive copy-trading loses money: modeling latency, slippage, pool impact, and exit mismatches.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-2.5 py-1 rounded bg-cyan-950 border border-cyan-500/40 text-cyan-300 font-semibold">
            Institutional Execution Guard
          </span>
        </div>
      </div>

      {/* Latency Pipeline Breakdown */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded p-4 space-y-3">
        <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
          <Clock className="w-4 h-4 text-emerald-400" />
          End-to-End Solana Execution Latency Pipeline
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
          <div className="p-3 rounded bg-zinc-950 border border-zinc-800 space-y-1">
            <div className="text-[10px] text-zinc-400 uppercase">1. Block Confirmation</div>
            <div className="text-lg font-bold text-zinc-200">400ms</div>
            <div className="text-[10px] text-zinc-400">Solana Slot confirmation time</div>
          </div>
          <div className="p-3 rounded bg-zinc-950 border border-zinc-800 space-y-1">
            <div className="text-[10px] text-zinc-400 uppercase">2. RPC Geyser Streaming</div>
            <div className="text-lg font-bold text-zinc-200">120ms</div>
            <div className="text-[10px] text-zinc-400">Yellowstone gRPC socket stream</div>
          </div>
          <div className="p-3 rounded bg-zinc-950 border border-zinc-800 space-y-1">
            <div className="text-[10px] text-zinc-400 uppercase">3. AlphaGraph Scoring</div>
            <div className="text-lg font-bold text-emerald-400">12ms</div>
            <div className="text-[10px] text-zinc-400">Multi-factor & Sybil graph filter</div>
          </div>
          <div className="p-3 rounded bg-zinc-950 border border-zinc-800 space-y-1">
            <div className="text-[10px] text-zinc-400 uppercase">4. Jito MEV Bundling</div>
            <div className="text-lg font-bold text-cyan-300">308ms</div>
            <div className="text-[10px] text-zinc-400">Fast-path block leader inclusion</div>
          </div>
        </div>

        <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 flex items-center justify-between">
          <span>Total Real-World Realistic Delay: <strong className="text-emerald-400">840ms</strong></span>
          <span className="text-zinc-400">Resulting price impact on $5M liquidity pool: <strong className="text-zinc-200">~18-35 bps</strong></span>
        </div>
      </div>

      {/* Naive vs HEF AlphaGraph Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-zinc-900/80 border border-zinc-800 rounded p-4 space-y-3">
          <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
            <ShieldAlert className="w-4 h-4" />
            <span>Why Naive Copy-Trading Fails (The Negative Alpha Trap)</span>
          </div>
          <ul className="text-xs space-y-2 text-zinc-400">
            <li className="p-2 rounded bg-zinc-950 border border-zinc-800/80">
              <strong className="text-zinc-200">Late Entries:</strong> Retail bots copy famous traders after 2-5 seconds. By then, sandwich bots and retail front-runners have already moved price 5-15%.
            </li>
            <li className="p-2 rounded bg-zinc-950 border border-zinc-800/80">
              <strong className="text-zinc-200">Sybil Cluster Trap:</strong> A marketer uses 6 coordinated wallets to pump an illiquid token. Naive bots see "6 smart whales buying" and get dumped on.
            </li>
            <li className="p-2 rounded bg-zinc-950 border border-zinc-800/80">
              <strong className="text-zinc-200">Survivorship Bias:</strong> Copying traders who made 10,000% on 1 meme token, but lose consistently across all subsequent 99 trades.
            </li>
          </ul>
        </div>

        <div className="bg-zinc-900/80 border border-zinc-800 rounded p-4 space-y-3">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
            <CheckCircle2 className="w-4 h-4" />
            <span>How HEF AlphaGraph Protects Capital ($5k Virtual Model)</span>
          </div>
          <ul className="text-xs space-y-2 text-zinc-400">
            <li className="p-2 rounded bg-zinc-950 border border-zinc-800/80">
              <strong className="text-zinc-200">Sybil Disqualification:</strong> Graphs shared funding and common swap paths. Co-funded wallets only count as 1 vote.
            </li>
            <li className="p-2 rounded bg-zinc-950 border border-zinc-800/80">
              <strong className="text-zinc-200">Hard Liquidity Floor:</strong> Trades only tokens with &gt;=$2.0M pool liquidity and revoked mint/freeze authority.
            </li>
            <li className="p-2 rounded bg-zinc-950 border border-zinc-800/80">
              <strong className="text-zinc-200">Point-in-Time Net EV:</strong> Only triggers when historical setup expectancy exceeds realistic latency, slippage, and Jupiter fee friction.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
