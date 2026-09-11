import React from 'react';
import { 
  Activity, 
  ShieldCheck, 
  RotateCcw, 
  Sliders, 
  Layers, 
  Sparkles,
  TrendingUp
} from 'lucide-react';
import { MarketRegime, PaperPortfolio } from '../types';

interface HeaderProps {
  portfolio: PaperPortfolio;
  currentRegime: MarketRegime;
  appMode?: 'demo' | 'live_paper' | 'historical_backtest' | string;
  onResetPortfolio: () => void;
  onOpenSettings: () => void;
  onOpenAIAnalyst: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  portfolio,
  currentRegime,
  appMode = 'demo',
  onResetPortfolio,
  onOpenSettings,
  onOpenAIAnalyst
}) => {
  const isPositive = portfolio.totalReturnPercent >= 0;

  return (
    <header className="bg-zinc-950 border-b border-zinc-800/80 px-4 py-2.5 flex items-center justify-between sticky top-0 z-30 select-none">
      {/* Brand & Platform Identifier */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-emerald-500/20 via-cyan-500/20 to-blue-500/20 border border-emerald-500/40 flex items-center justify-center">
            <span className="text-emerald-400 font-mono font-bold text-base tracking-tighter">αG</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-zinc-100 text-sm font-mono">HEF ALPHAGRAPH</span>
              {appMode === 'demo' ? (
                <span 
                  title="Demo Mode: Synthetic prototype data. Not evidence of actual trading performance."
                  className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/40 text-amber-400 font-bold tracking-wide"
                >
                  DEMO DATA
                </span>
              ) : appMode === 'live_paper' ? (
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/40 text-cyan-300 font-bold tracking-wide">
                  LIVE PAPER
                </span>
              ) : (
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/40 text-purple-300 font-bold tracking-wide">
                  HISTORICAL BACKTEST
                </span>
              )}
            </div>
            <p className="text-[10px] text-zinc-400 font-mono">
              Smart-Money Pattern Discovery & Deterministic Execution Engine
            </p>
          </div>
        </div>

        {/* Network & Protocol Badges */}
        <div className="hidden lg:flex items-center gap-1.5 ml-4 pl-4 border-l border-zinc-800">
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Solana Mainnet-Beta</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900/60 border border-zinc-800/60 text-[10px] text-zinc-400 font-mono">
            <span>EVM / BTC: Standby</span>
          </div>
        </div>
      </div>

      {/* Center Macro Regime & Telemetry */}
      <div className="hidden md:flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-xs font-mono">
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-zinc-400">Regime:</span>
          <span className="text-cyan-300 font-semibold">{currentRegime}</span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-xs font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-zinc-400">Hard Safety:</span>
          <span className="text-emerald-400 font-semibold">ENFORCED</span>
        </div>
      </div>

      {/* Right Virtual Capital & Actions */}
      <div className="flex items-center gap-3">
        {/* $5,000 Paper Capital Badge */}
        <div className="flex items-center gap-2.5 px-3 py-1.5 rounded bg-zinc-900/90 border border-zinc-800 font-mono">
          <div>
            <div className="text-[10px] text-zinc-400 uppercase tracking-wider">Virtual Equity</div>
            <div className="text-sm font-bold text-zinc-100 tracking-tight">
              ${portfolio.totalEquityUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
            isPositive ? 'text-emerald-400 bg-emerald-950/60' : 'text-rose-400 bg-rose-950/60'
          }`}>
            {isPositive ? '+' : ''}{portfolio.totalReturnPercent.toFixed(2)}%
          </div>
          <div className="text-[10px] text-zinc-400 border-l border-zinc-800 pl-2">
            Base: $5,000
          </div>
        </div>

        {/* AI Analyst Trigger */}
        <button
          onClick={onOpenAIAnalyst}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-gradient-to-r from-cyan-950 to-blue-950 border border-cyan-600/40 text-cyan-300 hover:border-cyan-400 text-xs font-mono transition-colors"
          title="Open AI Quantitative Analyst"
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden sm:inline">AI Analyst</span>
        </button>

        {/* Reset Virtual Capital */}
        <button
          onClick={onResetPortfolio}
          className="p-1.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs transition-colors"
          title="Reset Paper Portfolio to $5,000.00 base"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs transition-colors"
          title="Engine Settings & Model Weights"
        >
          <Sliders className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
