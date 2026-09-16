import React from 'react';
import { 
  X, 
  Dna, 
  ShieldCheck, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  Zap, 
  Percent, 
  Clock, 
  DollarSign, 
  PieChart 
} from 'lucide-react';
import { WalletProfile } from '../../types';

interface TraderProfileModalProps {
  wallet: WalletProfile | null;
  onClose: () => void;
}

export const TraderProfileModal: React.FC<TraderProfileModalProps> = ({ wallet, onClose }) => {
  if (!wallet) return null;

  const genome = wallet.genome || {
    overallSkill: wallet.qualityScore ?? 50,
    momentumSkill: 50,
    swingTradingSkill: 50,
    earlyEntrySkill: 50,
    largeCapSkill: 50,
    midCapSkill: 50,
    smallCapSkill: 50,
    solEcosystemSkill: 50,
    memecoinSkill: 50,
    riskOnSkill: 50,
    riskOffSkill: 50,
    highVolatilitySkill: 50,
    lowVolatilitySkill: 50,
    trendFollowingSkill: 50,
    meanReversionSkill: 50,
    exitSkill: 50,
    entrySkill: 50,
    drawdownControl: 50,
    diversificationQuality: 50,
    medianPositionPercent: 5,
    medianHoldingTimeHours: 12,
    bestMarketRegime: 'TRENDING_UP',
    preferredMarketCap: 'MID_CAP'
  };

  const copy = wallet.copyability || {
    copyabilityScore: 50,
    copyEfficiency: 70,
    sourceTraderReturn: 100,
    achievableSimulatedReturn: 70,
    latencyLossPercent: 10,
    slippageLossPercent: 20,
    averageDetectionLatencyMs: 1200,
    averageSlippageBps: 45,
    recommendation: 'MODERATE_VIABILITY' as const,
    reasoning: 'Standard execution fidelity'
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg max-w-5xl w-full max-h-[92vh] overflow-y-auto p-5 space-y-4 font-mono select-none">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-zinc-800 pb-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-zinc-100">{wallet.label || 'Elite Solana Trader'}</h2>
              <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-500/40 text-emerald-400 text-xs font-bold">
                Score: {wallet.qualityScore} / 100
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                wallet.momentumStatus === 'Improving' ? 'bg-emerald-950/80 text-emerald-300' :
                wallet.momentumStatus === 'Stable' ? 'bg-zinc-800 text-zinc-300' :
                'bg-rose-950/80 text-rose-300'
              }`}>
                Momentum: {wallet.momentumStatus}
              </span>
            </div>
            <p className="text-xs text-zinc-400 font-mono mt-1">
              Address: {wallet.address} | Age: {wallet.walletAgeDays} days | Trades: {wallet.tradeCount}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Top Summary Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 text-xs">
          <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
            <div className="text-[10px] text-zinc-400 uppercase">Portfolio Value</div>
            <div className="text-base font-bold text-zinc-100 mt-0.5">
              ${wallet.portfolioValueUsd != null ? `${(wallet.portfolioValueUsd / 1000).toFixed(0)}k` : 'N/A'}
            </div>
            <div className="text-[10px] text-emerald-400 font-semibold">
              {wallet.coreAssetRatio != null ? `${(wallet.coreAssetRatio * 100).toFixed(0)}% Core Assets` : 'N/A'}
            </div>
          </div>

          <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
            <div className="text-[10px] text-zinc-400 uppercase">Realized P&L</div>
            <div className="text-base font-bold text-emerald-400 mt-0.5">
              {wallet.realizedPnlUsd != null ? `+${(wallet.realizedPnlUsd / 1000).toFixed(0)}k` : 'N/A'}
            </div>
            <div className="text-[10px] text-zinc-400">
              Win Rate: {wallet.winRate != null ? `${wallet.winRate}%` : 'N/A'}
            </div>
          </div>

          <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
            <div className="text-[10px] text-zinc-400 uppercase">Profit Factor</div>
            <div className="text-base font-bold text-zinc-100 mt-0.5">
              {wallet.profitFactor != null ? `${wallet.profitFactor.toFixed(2)}x` : 'N/A'}
            </div>
            <div className="text-[10px] text-zinc-400">
              Max DD: {wallet.maxDrawdownPercent != null ? `${wallet.maxDrawdownPercent}%` : 'N/A'}
            </div>
          </div>

          <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
            <div className="text-[10px] text-zinc-400 uppercase">Copyability</div>
            <div className="text-base font-bold text-cyan-300 mt-0.5">
              {copy.copyabilityScore} / 100
            </div>
            <div className="text-[10px] text-emerald-400">
              {copy.copyEfficiency}% Efficiency
            </div>
          </div>

          <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
            <div className="text-[10px] text-zinc-400 uppercase">Median Position</div>
            <div className="text-base font-bold text-zinc-100 mt-0.5">
              {genome.medianPositionPercent}%
            </div>
            <div className="text-[10px] text-zinc-400">
              Hold: {genome.medianHoldingTimeHours}h
            </div>
          </div>

          <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
            <div className="text-[10px] text-zinc-400 uppercase">Top 1 Trade Concentration</div>
            <div className="text-base font-bold text-zinc-100 mt-0.5">
              {wallet.top1TradeProfitPercent != null ? `${wallet.top1TradeProfitPercent}%` : 'N/A'}
            </div>
            <div className={`text-[10px] ${(wallet.concentrationPenalty ?? 0) > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              Penalty: -{wallet.concentrationPenalty ?? 0} pts
            </div>
          </div>
        </div>

        {/* Trader Genome & Behavioral Fingerprint */}
        <div className="p-4 rounded bg-zinc-950 border border-zinc-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs uppercase font-bold text-zinc-200 flex items-center gap-1.5">
              <Dna className="w-4 h-4 text-emerald-400" />
              Trader Genome & Specialist Skill Fingerprint
            </h3>
            <span className="text-[11px] text-zinc-400">
              Best Regime: <strong className="text-cyan-300">{genome.bestMarketRegime}</strong> ({genome.preferredMarketCap})
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 text-xs">
            {[
              { label: 'Momentum Skill', val: genome.momentumSkill },
              { label: 'Swing Trading', val: genome.swingTradingSkill },
              { label: 'Early Entry Skill', val: genome.earlyEntrySkill },
              { label: 'Large-Cap Skill', val: genome.largeCapSkill },
              { label: 'Mid-Cap Skill', val: genome.midCapSkill },
              { label: 'Small-Cap Skill', val: genome.smallCapSkill },
              { label: 'SOL Ecosystem Skill', val: genome.solEcosystemSkill },
              { label: 'Memecoin Skill', val: genome.memecoinSkill },
              { label: 'Risk-On Skill', val: genome.riskOnSkill },
              { label: 'Risk-Off Skill', val: genome.riskOffSkill },
              { label: 'High-Volatility Skill', val: genome.highVolatilitySkill },
              { label: 'Drawdown Control', val: genome.drawdownControl },
            ].map((skill, idx) => (
              <div key={idx} className="p-2 rounded bg-zinc-900 border border-zinc-800 space-y-1">
                <div className="flex justify-between text-[10px] text-zinc-400">
                  <span>{skill.label}</span>
                  <span className="font-bold text-zinc-200">{skill.val}</span>
                </div>
                <div className="w-full bg-zinc-950 h-1.5 rounded overflow-hidden">
                  <div 
                    className={`h-full ${
                      skill.val >= 85 ? 'bg-emerald-400' :
                      skill.val >= 70 ? 'bg-cyan-400' :
                      skill.val >= 50 ? 'bg-amber-400' : 'bg-rose-400'
                    }`} 
                    style={{ width: `${skill.val}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Copyability Analytics Deep-Dive */}
        <div className="p-4 rounded bg-zinc-950 border border-zinc-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs uppercase font-bold text-zinc-200 flex items-center gap-1.5">
              <Percent className="w-4 h-4 text-cyan-400" />
              Realistic Copyability Breakdown (Our Achievable Alpha)
            </h3>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              copy.recommendation === 'EXCELLENT_TO_COPY' ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' :
              copy.recommendation === 'MODERATE_VIABILITY' ? 'bg-amber-950 text-amber-300 border border-amber-500/30' :
              'bg-rose-950 text-rose-400 border border-rose-500/30'
            }`}>
              {copy.recommendation.replace(/_/g, ' ')}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800">
              <div className="text-[10px] text-zinc-400">Source Trader Return</div>
              <div className="text-base font-bold text-zinc-100 font-mono">+{copy.sourceTraderReturn}%</div>
            </div>
            <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800">
              <div className="text-[10px] text-zinc-400">Our Achievable Fill Return</div>
              <div className="text-base font-bold text-emerald-400 font-mono">+{copy.achievableSimulatedReturn}%</div>
            </div>
            <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800">
              <div className="text-[10px] text-zinc-400">Latency & Slip Friction</div>
              <div className="text-sm font-bold text-rose-400 font-mono">
                {copy.latencyLossPercent}% / {copy.slippageLossPercent}%
              </div>
            </div>
            <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800">
              <div className="text-[10px] text-zinc-400">Avg Detection Delay</div>
              <div className="text-sm font-bold text-zinc-200 font-mono">
                {copy.averageDetectionLatencyMs}ms ({copy.averageSlippageBps} bps)
              </div>
            </div>
          </div>
        </div>

        {/* Rolling Trajectory & Profit Concentration */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Rolling Skill Scores */}
          <div className="p-3.5 rounded bg-zinc-950 border border-zinc-800 text-xs space-y-2">
            <h4 className="font-bold text-zinc-300 text-xs uppercase">Rolling Skill Trajectory</h4>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-1.5 rounded bg-zinc-900">
                <div className="text-[10px] text-zinc-400">7-Day</div>
                <div className="font-bold text-zinc-100">{wallet.rollingScores?.sevenDay ?? 'N/A'}</div>
              </div>
              <div className="p-1.5 rounded bg-zinc-900">
                <div className="text-[10px] text-zinc-400">30-Day</div>
                <div className="font-bold text-zinc-100">{wallet.rollingScores?.thirtyDay ?? 'N/A'}</div>
              </div>
              <div className="p-1.5 rounded bg-zinc-900">
                <div className="text-[10px] text-zinc-400">90-Day</div>
                <div className="font-bold text-zinc-100">{wallet.rollingScores?.ninetyDay ?? 'N/A'}</div>
              </div>
              <div className="p-1.5 rounded bg-zinc-900">
                <div className="text-[10px] text-zinc-400">Lifetime</div>
                <div className="font-bold text-emerald-400">{wallet.rollingScores?.lifetime ?? 'N/A'}</div>
              </div>
            </div>
          </div>

          {/* Profit Concentration Bars */}
          <div className="p-3.5 rounded bg-zinc-950 border border-zinc-800 text-xs space-y-1.5">
            <h4 className="font-bold text-zinc-300 text-xs uppercase">Profit Concentration Curve</h4>
            <div className="flex justify-between text-zinc-400">
              <span>Top 1 Trade:</span>
              <span className="text-zinc-200 font-semibold">{wallet.top1TradeProfitPercent}% of profit</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Top 3 Trades:</span>
              <span className="text-zinc-200 font-semibold">{wallet.top3TradeProfitPercent}% of profit</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Top 10 Trades:</span>
              <span className="text-zinc-200 font-semibold">{wallet.top10TradeProfitPercent}% of profit</span>
            </div>
          </div>
        </div>

        {/* Current Holdings */}
        <div>
          <h4 className="font-bold text-zinc-300 text-xs uppercase mb-1.5">Current Portfolio Holdings</h4>
          <div className="space-y-1 text-xs">
            {wallet.holdings.map((h, idx) => (
              <div key={idx} className="p-2 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-zinc-100">{h.tokenSymbol}</span>
                  <span className="text-zinc-400">{h.amount.toLocaleString()} tokens</span>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-zinc-200">${h.usdValue.toLocaleString()}</div>
                  <div className="text-[10px] text-zinc-400">{h.percentageOfPortfolio.toFixed(1)}% of fund</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
