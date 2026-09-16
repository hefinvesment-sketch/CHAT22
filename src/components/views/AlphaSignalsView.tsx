import React, { useState } from 'react';
import { 
  Radio, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Eye, 
  Zap, 
  Clock, 
  ShieldAlert, 
  TrendingUp,
  Info,
  X
} from 'lucide-react';
import { AlphaSignal, SignalState, DecisionStatus } from '../../types';

interface AlphaSignalsViewProps {
  signals: AlphaSignal[];
  onExecuteTrade: (signalId: string) => void;
  selectedSignal: AlphaSignal | null;
  onSelectSignal: (signal: AlphaSignal | null) => void;
}

export const AlphaSignalsView: React.FC<AlphaSignalsViewProps> = ({
  signals,
  onExecuteTrade,
  selectedSignal,
  onSelectSignal
}) => {
  const [filterState, setFilterState] = useState<'ALL' | 'TRADED' | 'ELIGIBLE' | 'WATCH' | 'REJECTED'>('ALL');

  const filteredSignals = signals.filter(sig => {
    if (filterState === 'TRADED') return sig.decision === 'TRADED';
    if (filterState === 'ELIGIBLE') return sig.signalState === 'PAPER TRADE ELIGIBLE' || sig.signalState === 'HIGH-CONVICTION PAPER TRADE';
    if (filterState === 'WATCH') return sig.signalState === 'WATCH';
    if (filterState === 'REJECTED') return sig.decision === 'REJECTED';
    return true;
  });

  const getDecisionBadge = (decision: DecisionStatus) => {
    switch (decision) {
      case 'TRADED':
        return <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 text-xs font-bold font-mono">PAPER TRADED</span>;
      case 'WATCHED':
        return <span className="px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 text-xs font-bold font-mono">WATCHING</span>;
      case 'REJECTED':
        return <span className="px-2 py-0.5 rounded bg-rose-950/80 border border-rose-500/40 text-rose-400 text-xs font-bold font-mono">SAFETY REJECTED</span>;
      case 'IGNORED':
        return <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 text-xs font-mono">IGNORED</span>;
    }
  };

  const getStateBadge = (state: SignalState) => {
    switch (state) {
      case 'HIGH-CONVICTION PAPER TRADE':
        return <span className="text-emerald-400 font-bold">92+ High-Conviction</span>;
      case 'PAPER TRADE ELIGIBLE':
        return <span className="text-emerald-400 font-medium">85-91 Eligible</span>;
      case 'STRONG RESEARCH SIGNAL':
        return <span className="text-cyan-300 font-medium">75-84 Strong Research</span>;
      case 'WATCH':
        return <span className="text-amber-400 font-medium">60-74 Watch</span>;
      case 'IGNORE':
        return <span className="text-zinc-400 font-medium">0-59 Ignore</span>;
    }
  };

  return (
    <div className="space-y-4 p-4 font-mono select-none">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900/80 border border-zinc-800 rounded p-4">
        <div>
          <h1 className="text-base font-bold text-zinc-100 flex items-center gap-2">
            <Radio className="w-5 h-5 text-emerald-400 animate-pulse" />
            Alpha Signals & Setup Pipeline
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Statistical multi-factor setups combining wallet skill, consensus, conviction, acceleration, and realistic fill models.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded border border-zinc-800 text-xs">
          {(['ALL', 'ELIGIBLE', 'TRADED', 'WATCH', 'REJECTED'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setFilterState(tab)}
              className={`px-2.5 py-1 rounded transition-colors ${
                filterState === tab ? 'bg-zinc-800 text-zinc-100 font-semibold' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Signals Table */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded p-4 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-zinc-800 text-[10px] text-zinc-400 uppercase tracking-wider">
              <th className="pb-2.5">Token / Asset</th>
              <th className="pb-2.5">Alpha Score</th>
              <th className="pb-2.5">Signal State</th>
              <th className="pb-2.5">Decision</th>
              <th className="pb-2.5">Independent Elite</th>
              <th className="pb-2.5">Smart Inflow</th>
              <th className="pb-2.5">VWAP Disp.</th>
              <th className="pb-2.5">Historical Net EV</th>
              <th className="pb-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {filteredSignals.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-zinc-500">
                  <Radio className="w-6 h-6 mx-auto mb-2 opacity-40 animate-pulse text-emerald-400" />
                  <div>No signals matching filter. Scanning live Solana blocks via Helius...</div>
                </td>
              </tr>
            ) : (
              filteredSignals.map(sig => {
                const score = sig.alphaScore ?? 0;
                const isHighConviction = score >= 92;
                const isEligible = score >= 85;

                return (
                  <tr key={sig.id} className="hover:bg-zinc-800/40 transition-colors">
                  <td className="py-3">
                    <div className="font-bold text-zinc-100 text-sm">{sig.tokenSymbol}</div>
                    <div className="text-[10px] text-zinc-400">{sig.tokenAddress.slice(0, 6)}...{sig.tokenAddress.slice(-4)}</div>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-base font-bold ${
                        isHighConviction ? 'text-emerald-400' : isEligible ? 'text-emerald-400' : score >= 70 ? 'text-cyan-300' : 'text-zinc-400'
                      }`}>
                        {sig.alphaScore ?? 'N/A'}
                      </span>
                      <span className="text-[10px] text-zinc-400">/ 100</span>
                    </div>
                  </td>
                  <td className="py-3 text-xs">{getStateBadge(sig.signalState)}</td>
                  <td className="py-3">{getDecisionBadge(sig.decision)}</td>
                  <td className="py-3">
                    <span className="font-semibold text-zinc-200">{sig.independentEliteCount} Wallets</span>
                  </td>
                  <td className="py-3 text-zinc-300 font-semibold">
                    ${((sig.totalSmartMoneyInflowUsd ?? 0) / 1000).toFixed(0)}k
                  </td>
                  <td className="py-3">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                      (sig.priceDisplacementFromVwapPercent ?? 0) > 3.0 ? 'bg-rose-950/60 text-rose-300' : 'bg-emerald-950/60 text-emerald-300'
                    }`}>
                      +{sig.priceDisplacementFromVwapPercent ?? 0}%
                    </span>
                  </td>
                  <td className="py-3 font-semibold">
                    <span className={(sig.historicalExpectancy?.netEvPercent ?? 0) > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {(sig.historicalExpectancy?.netEvPercent ?? 0) > 0 ? '+' : ''}{sig.historicalExpectancy?.netEvPercent ?? 0}%
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => onSelectSignal(sig)}
                        className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors"
                      >
                        Inspect Breakdown
                      </button>
                      {sig.decision !== 'TRADED' && sig.decision !== 'REJECTED' && (
                        <button
                          onClick={() => onExecuteTrade(sig.id)}
                          className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-xs flex items-center gap-1 transition-colors"
                        >
                          <Zap className="w-3 h-3 fill-current" />
                          <span>Simulate Fill</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            }))}
          </tbody>
        </table>
      </div>

      {/* Signal Deep-Dive Modal */}
      {selectedSignal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto p-5 space-y-4 font-mono">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-zinc-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-zinc-100">{selectedSignal.tokenSymbol}</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-500/40 text-emerald-400 text-xs font-bold">
                    Alpha Score: {selectedSignal.alphaScore} / 100
                  </span>
                  {getDecisionBadge(selectedSignal.decision)}
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  Mint: {selectedSignal.tokenAddress} | Timestamp: {selectedSignal.timestamp}
                </p>
              </div>
              <button
                onClick={() => onSelectSignal(null)}
                className="p-1 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* If Rejection Reason exists */}
            {selectedSignal.rejectionReason && (
              <div className="p-3 rounded bg-rose-950/60 border border-rose-700/60 text-xs text-rose-300 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold">Hard Rejection Enforced:</strong> {selectedSignal.rejectionReason}
                </div>
              </div>
            )}

            {/* 9-Factor Component Weights & Penalties */}
            <div>
              <h3 className="text-xs uppercase font-bold text-zinc-300 tracking-wider mb-2">
                Quantitative Alpha Factor Breakdown (Weights & Sub-Scores)
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                  <div className="text-[10px] text-zinc-400">18% Trader Skill</div>
                  <div className="text-base font-bold text-zinc-100">{selectedSignal.features.traderSkillScore?.value ?? 0} / 100</div>
                </div>
                <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                  <div className="text-[10px] text-zinc-400">15% Copyability</div>
                  <div className="text-base font-bold text-zinc-100">{selectedSignal.features.copyabilityScore?.value ?? 0} / 100</div>
                </div>
                <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                  <div className="text-[10px] text-zinc-400">15% Independent Consensus</div>
                  <div className="text-base font-bold text-zinc-100">{selectedSignal.features.independentConsensusScore?.value ?? 0} / 100</div>
                </div>
                <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                  <div className="text-[10px] text-zinc-400">12% Conviction Surprise</div>
                  <div className="text-base font-bold text-zinc-100">{selectedSignal.features.convictionSurpriseScore?.value ?? 0} / 100</div>
                </div>
                <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                  <div className="text-[10px] text-zinc-400">10% Smart-Money Acceleration</div>
                  <div className="text-base font-bold text-emerald-400">{selectedSignal.features.smartMoneyAccelerationScore?.value ?? 0} / 100</div>
                </div>
                <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                  <div className="text-[10px] text-zinc-400">10% Entry Quality</div>
                  <div className="text-base font-bold text-zinc-100">{selectedSignal.features.entryQualityScore?.value ?? 0} / 100</div>
                </div>
                <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                  <div className="text-[10px] text-zinc-400">8% Token Liquidity</div>
                  <div className="text-base font-bold text-zinc-100">{selectedSignal.features.liquidityTokenQualityScore?.value ?? 0} / 100</div>
                </div>
                <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                  <div className="text-[10px] text-zinc-400">7% Market Regime Fit</div>
                  <div className="text-base font-bold text-zinc-100">{selectedSignal.features.regimeFitScore?.value ?? 0} / 100</div>
                </div>
                <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                  <div className="text-[10px] text-zinc-400">5% Emerging Trader Signal</div>
                  <div className="text-base font-bold text-zinc-100">{selectedSignal.features.emergingTraderScore?.value ?? 0} / 100</div>
                </div>
              </div>
            </div>

            {/* Total Penalties Applied */}
            <div className="p-3 rounded bg-zinc-950 border border-zinc-800 text-xs">
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-zinc-300">Penalties Subtracted:</span>
                <span className="font-bold text-rose-400">-{selectedSignal.features.totalPenalties} points</span>
              </div>
              <div className="text-[11px] text-zinc-400 flex flex-wrap gap-3 mt-1">
                <span>Crowding: -{selectedSignal.features.penalties.crowdingPenalty}</span>
                <span>Related Wallets: -{selectedSignal.features.penalties.relatedWalletsPenalty}</span>
                <span>Pumped Price: -{selectedSignal.features.penalties.pricePumpedPenalty}</span>
                <span>High Slippage: -{selectedSignal.features.penalties.highSlippagePenalty}</span>
              </div>
            </div>

            {/* Historical Expectancy & Realistic Execution Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Historical Expectancy */}
              <div className="p-3.5 rounded bg-zinc-950 border border-zinc-800 text-xs space-y-1.5">
                <h4 className="font-bold text-zinc-200 text-xs uppercase mb-1">Historical Setup Expectancy</h4>
                <div className="flex justify-between text-zinc-400">
                  <span>Similar Historical Setups:</span>
                  <span className="text-zinc-200 font-semibold">{selectedSignal.historicalExpectancy.similarEventsCount}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Historical Win Rate:</span>
                  <span className="text-zinc-200 font-semibold">{selectedSignal.historicalExpectancy.winRatePercent}%</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Avg Winner / Loser:</span>
                  <span className="text-zinc-200 font-semibold">+{selectedSignal.historicalExpectancy.averageWinnerPercent}% / {selectedSignal.historicalExpectancy.averageLoserPercent}%</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Gross Expectancy (EV):</span>
                  <span className="text-zinc-200 font-semibold">+{selectedSignal.historicalExpectancy.grossEvPercent}%</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Execution Friction (Slip + Fees):</span>
                  <span className="text-rose-400 font-semibold">-{selectedSignal.historicalExpectancy.executionCostPercent}%</span>
                </div>
                <div className="flex justify-between border-t border-zinc-800 pt-1 font-bold">
                  <span className="text-zinc-300">Net Achievable EV:</span>
                  <span className={(selectedSignal.historicalExpectancy?.netEvPercent ?? 0) > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {(selectedSignal.historicalExpectancy?.netEvPercent ?? 0) > 0 ? '+' : ''}{selectedSignal.historicalExpectancy?.netEvPercent ?? 0}%
                  </span>
                </div>
              </div>

              {/* Realistic Execution Model */}
              {selectedSignal.executionSimulation && (
                <div className="p-3.5 rounded bg-zinc-950 border border-zinc-800 text-xs space-y-1.5">
                  <h4 className="font-bold text-zinc-200 text-xs uppercase mb-1">Simulated Realistic Fill</h4>
                  <div className="flex justify-between text-zinc-400">
                    <span>Source Trader Price:</span>
                    <span className="text-zinc-200 font-mono">${selectedSignal.executionSimulation.sourcePrice}</span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>Detection Price (after {selectedSignal.executionSimulation.detectionDelayMs}ms):</span>
                    <span className="text-zinc-200 font-mono">${selectedSignal.executionSimulation.detectionPrice}</span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>DEX Routing + Pool Slippage:</span>
                    <span className="text-zinc-400 font-mono">+{selectedSignal.executionSimulation.estimatedSlippagePercent * 100} bps</span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>Jupiter Fee:</span>
                    <span className="text-zinc-400 font-mono">{selectedSignal.executionSimulation.dexFeePercent * 100} bps</span>
                  </div>
                  <div className="flex justify-between border-t border-zinc-800 pt-1 font-bold">
                    <span className="text-zinc-300">Achievable Fill Price:</span>
                    <span className="text-emerald-400 font-mono">${selectedSignal.executionSimulation.simulatedFillPrice}</span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>Position Sizing ($5k Portfolio):</span>
                    <span className="text-zinc-200 font-semibold">${selectedSignal.executionSimulation.recommendedPositionUsd}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Participating Wallets (Confirming Independent vs Related) */}
            <div>
              <h4 className="font-bold text-zinc-300 text-xs uppercase mb-1.5">Participating Smart Wallets</h4>
              <div className="space-y-1 text-xs">
                {selectedSignal.participantWallets.map((w, idx) => (
                  <div key={idx} className="p-2 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                    <div>
                      <span className="font-mono text-zinc-200">{w.address}</span>
                      <span className="text-[10px] text-zinc-400 ml-2">Score: {w.qualityScore} | Trade: ${(w.tradeUsd / 1000).toFixed(0)}k</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-amber-400 font-semibold">{w.convictionMultiplier}x Conviction</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                        w.isIndependent ? 'bg-emerald-950/80 text-emerald-400' : 'bg-rose-950/80 text-rose-400'
                      }`}>
                        {w.isIndependent ? 'Independent' : 'Cluster Sybil'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Modal Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => onSelectSignal(null)}
                className="px-4 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors"
              >
                Close
              </button>
              {selectedSignal.decision !== 'TRADED' && selectedSignal.decision !== 'REJECTED' && (
                <button
                  onClick={() => {
                    onExecuteTrade(selectedSignal.id);
                    onSelectSignal(null);
                  }}
                  className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-xs flex items-center gap-1.5 transition-colors"
                >
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  <span>Execute Simulated Paper Trade</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
