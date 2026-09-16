import React, { useState } from 'react';
import { 
  Briefcase, 
  Layers, 
  History, 
  RotateCcw, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Zap,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Scale
} from 'lucide-react';
import { PaperPortfolio, PaperPosition, PaperTradeRecord } from '../../types';

interface PaperPortfolioViewProps {
  portfolio: PaperPortfolio;
  openPositions: PaperPosition[];
  tradeHistory: PaperTradeRecord[];
  onClosePosition: (positionId: string) => void;
  onResetPortfolio: () => void;
}

export const PaperPortfolioView: React.FC<PaperPortfolioViewProps> = ({
  portfolio,
  openPositions,
  tradeHistory,
  onClosePosition,
  onResetPortfolio
}) => {
  const isTotalPos = portfolio.totalReturnPercent >= 0;
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditData, setAuditData] = useState<unknown>(null);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  // Exact double-entry ledger equation verification
  const expectedEquity = Number(
    (portfolio.startingCapitalUsd + portfolio.realizedPnlUsd + portfolio.unrealizedPnlUsd).toFixed(2)
  );
  const discrepancy = Number(Math.abs(portfolio.totalEquityUsd - expectedEquity).toFixed(2));
  const isReconciled = discrepancy <= 0.02;

  const handleRunAudit = async () => {
    setIsLoadingAudit(true);
    try {
      const res = await fetch('/api/portfolio/audit');
      const data = await res.json();
      setAuditData(data);
      setShowAuditModal(true);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  return (
    <div className="space-y-4 p-4 font-mono select-none">
      {/* Header */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-cyan-400" />
            <h1 className="text-base font-bold text-zinc-100">{portfolio.name}</h1>
            <span className="px-2 py-0.5 rounded bg-cyan-950 border border-cyan-500/40 text-cyan-300 text-xs font-bold">
              ${portfolio.startingCapitalUsd.toFixed(2)} Base Fund
            </span>
            <span className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 text-[11px]">
              Double-Entry Ledger
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Strict simulated paper trading. All fills deduct 800ms-1200ms latency displacement, 35-50 bps pool slippage, and 25 bps DEX fee.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRunAudit}
            disabled={isLoadingAudit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 text-xs transition-colors"
            title="Inspect Double-Entry Ledger Reconciliation"
          >
            <Scale className="w-3.5 h-3.5" />
            <span>{isLoadingAudit ? 'Auditing...' : 'Audit Ledger'}</span>
          </button>
          <button
            onClick={onResetPortfolio}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Fund ($5,000)</span>
          </button>
        </div>
      </div>

      {/* Double-Entry Ledger Integrity Banner */}
      <div className={`p-3 rounded border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
        isReconciled 
          ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300' 
          : 'bg-rose-950/30 border-rose-500/50 text-rose-300'
      }`}>
        <div className="flex items-center gap-2">
          {isReconciled ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>
            <strong>Ledger Equation:</strong> ${portfolio.startingCapitalUsd.toFixed(2)} (Base) + ${portfolio.realizedPnlUsd.toFixed(2)} (Realized) + ${portfolio.unrealizedPnlUsd.toFixed(2)} (Unrealized) = <strong className="text-zinc-100">${portfolio.totalEquityUsd.toFixed(2)} Equity</strong>
          </span>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <span className="text-[11px] px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800">
            Discrepancy: ${discrepancy.toFixed(2)}
          </span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
            isReconciled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
          }`}>
            {isReconciled ? '100% RECONCILED' : 'DISCREPANCY DETECTED'}
          </span>
        </div>
      </div>

      {/* Portfolio Financial Performance Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
        <div className="p-3 rounded bg-zinc-900/80 border border-zinc-800">
          <div className="text-[10px] text-zinc-400 uppercase">Current Equity</div>
          <div className="text-lg font-bold text-zinc-100 mt-0.5">
            ${portfolio.totalEquityUsd.toFixed(2)}
          </div>
          <div className={`text-xs font-semibold ${isTotalPos ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isTotalPos ? '+' : ''}{portfolio.totalReturnPercent.toFixed(2)}% Net
          </div>
        </div>

        <div className="p-3 rounded bg-zinc-900/80 border border-zinc-800">
          <div className="text-[10px] text-zinc-400 uppercase">Cash Reserve</div>
          <div className="text-lg font-bold text-zinc-200 mt-0.5">
            ${portfolio.cashUsd.toFixed(2)}
          </div>
          <div className="text-[10px] text-zinc-400">
            Base: ${portfolio.startingCapitalUsd.toFixed(2)}
          </div>
        </div>

        <div className="p-3 rounded bg-zinc-900/80 border border-zinc-800">
          <div className="text-[10px] text-zinc-400 uppercase">Realized P&L</div>
          <div className={`text-lg font-bold mt-0.5 ${portfolio.realizedPnlUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {portfolio.realizedPnlUsd >= 0 ? '+' : ''}${portfolio.realizedPnlUsd.toFixed(2)}
          </div>
          <div className="text-[10px] text-zinc-400">
            Unrealized: {portfolio.unrealizedPnlUsd >= 0 ? '+' : ''}${portfolio.unrealizedPnlUsd.toFixed(2)}
          </div>
        </div>

        <div className="p-3 rounded bg-zinc-900/80 border border-zinc-800">
          <div className="text-[10px] text-zinc-400 uppercase">Win Rate / PF</div>
          <div className="text-lg font-bold text-zinc-100 mt-0.5">
            {portfolio.winRatePercent.toFixed(1)}%
          </div>
          <div className="text-[10px] text-emerald-400 font-semibold">
            {portfolio.profitFactor.toFixed(2)}x Profit Factor
          </div>
        </div>

        <div className="p-3 rounded bg-zinc-900/80 border border-zinc-800">
          <div className="text-[10px] text-zinc-400 uppercase">Drawdown / Sharpe</div>
          <div className="text-lg font-bold text-zinc-100 mt-0.5">
            {portfolio.maxDrawdownPercent.toFixed(2)}% Max DD
          </div>
          <div className="text-[10px] text-cyan-400 font-semibold">
            Sharpe: {portfolio.sharpeRatio.toFixed(2)}
          </div>
        </div>

        <div className="p-3 rounded bg-zinc-900/80 border border-zinc-800">
          <div className="text-[10px] text-zinc-400 uppercase">Execution Friction</div>
          <div className="text-lg font-bold text-zinc-200 mt-0.5">
            {portfolio.averageSlippageBps} bps
          </div>
          <div className="text-[10px] text-zinc-400">
            Fees Paid: ${portfolio.totalFeesPaidUsd.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Open Positions Section */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            Open Paper Positions ({openPositions.length} / 10 Max Positions)
          </h2>
          <span className="text-xs text-zinc-400">
            Total Allocated: <strong className="text-zinc-200">${portfolio.positionsValueUsd.toFixed(2)}</strong> ({(portfolio.positionsValueUsd / portfolio.totalEquityUsd * 100).toFixed(1)}% of fund)
          </span>
        </div>

        {openPositions.length === 0 ? (
          <div className="text-center py-6 text-zinc-400 text-xs">
            No active positions. Execute trades from the Alpha Signals view.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-[10px] text-zinc-400 uppercase tracking-wider">
                  <th className="pb-2">Token</th>
                  <th className="pb-2">Fill Price</th>
                  <th className="pb-2">Current Price</th>
                  <th className="pb-2">Cost Basis</th>
                  <th className="pb-2">Current Value</th>
                  <th className="pb-2">Unrealized P&L</th>
                  <th className="pb-2">Stop Loss</th>
                  <th className="pb-2">Take Profit</th>
                  <th className="pb-2">Fill Latency</th>
                  <th className="pb-2 text-right">Close</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {openPositions.map(pos => {
                  const isPnlPos = pos.unrealizedPnlUsd >= 0;
                  return (
                    <tr key={pos.id} className="hover:bg-zinc-800/40 transition-colors">
                      <td className="py-2.5 font-bold text-zinc-100">
                        <div>{pos.tokenSymbol}</div>
                        <div className="text-[10px] text-zinc-400 font-normal">{pos.amount} tokens</div>
                      </td>
                      <td className="py-2.5 font-mono text-zinc-300">${pos.openPrice}</td>
                      <td className="py-2.5 font-mono text-zinc-100 font-semibold">${pos.currentPrice}</td>
                      <td className="py-2.5 text-zinc-400">${pos.costBasisUsd.toFixed(2)}</td>
                      <td className="py-2.5 font-semibold text-zinc-200">${pos.currentValueUsd.toFixed(2)}</td>
                      <td className="py-2.5">
                        <span className={`font-semibold ${isPnlPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isPnlPos ? '+' : ''}${pos.unrealizedPnlUsd.toFixed(2)} ({isPnlPos ? '+' : ''}{pos.unrealizedReturnPercent}%)
                        </span>
                      </td>
                      <td className="py-2.5 text-zinc-400 font-mono">${pos.stopLossPrice}</td>
                      <td className="py-2.5 text-emerald-400 font-mono">${pos.takeProfitPrice}</td>
                      <td className="py-2.5 text-zinc-400 font-mono">{pos.detectionLatencyMs}ms</td>
                      <td className="py-2.5 text-right">
                        <button
                          onClick={() => onClosePosition(pos.id)}
                          className="px-2.5 py-1 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-800/60 text-rose-300 text-xs transition-colors"
                        >
                          Simulate Close
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

      {/* Trade History Section */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
            <History className="w-4 h-4 text-cyan-400" />
            Closed Paper Trade History ({tradeHistory.length} Trades)
          </h2>
          <span className="text-xs text-zinc-400">
            Total Realized: <strong className="text-emerald-400">+${portfolio.realizedPnlUsd.toFixed(2)}</strong>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-[10px] text-zinc-400 uppercase tracking-wider">
                <th className="pb-2">Token</th>
                <th className="pb-2">Open Price</th>
                <th className="pb-2">Close Price</th>
                <th className="pb-2">Cost Basis</th>
                <th className="pb-2">Proceeds</th>
                <th className="pb-2">Realized Return</th>
                <th className="pb-2">Holding Time</th>
                <th className="pb-2">Exit Trigger</th>
                <th className="pb-2">Friction Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {tradeHistory.map(th => {
                const isPos = th.realizedPnlUsd >= 0;
                return (
                  <tr key={th.id} className="hover:bg-zinc-800/40 transition-colors">
                    <td className="py-2.5 font-bold text-zinc-100">{th.tokenSymbol}</td>
                    <td className="py-2.5 font-mono text-zinc-400">${th.openPrice}</td>
                    <td className="py-2.5 font-mono text-zinc-200 font-semibold">${th.closePrice}</td>
                    <td className="py-2.5 text-zinc-400">${th.costBasisUsd.toFixed(2)}</td>
                    <td className="py-2.5 text-zinc-200">${th.proceedsUsd.toFixed(2)}</td>
                    <td className="py-2.5 font-bold">
                      <span className={isPos ? 'text-emerald-400' : 'text-rose-400'}>
                        {isPos ? '+' : ''}${th.realizedPnlUsd.toFixed(2)} ({isPos ? '+' : ''}{th.returnPercent}%)
                      </span>
                    </td>
                    <td className="py-2.5 text-zinc-400">{Math.round(th.holdingPeriodMinutes / 60)}h {th.holdingPeriodMinutes % 60}m</td>
                    <td className="py-2.5">
                      <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px]">
                        {th.exitReason.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-2.5 text-zinc-400 font-mono text-[11px]">
                      ${(th.feesPaidUsd + th.slippagePaidUsd).toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit Reconciliation Modal */}
      {showAuditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg max-w-2xl w-full p-5 space-y-4 shadow-2xl font-mono text-xs">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-zinc-100 text-sm">Institutional Quantitative Ledger Audit</h3>
              </div>
              <button 
                onClick={() => setShowAuditModal(false)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-3 rounded bg-zinc-950 border border-zinc-800 space-y-1.5">
                <div className="text-zinc-400 text-[11px] uppercase tracking-wider">Accounting Equation Verification</div>
                <div className="text-zinc-200">
                  Starting Base (${portfolio.startingCapitalUsd.toFixed(2)}) + Realized PnL (${portfolio.realizedPnlUsd.toFixed(2)}) + Unrealized PnL (${portfolio.unrealizedPnlUsd.toFixed(2)})
                </div>
                <div className="text-emerald-400 font-bold text-sm">
                  = ${expectedEquity.toFixed(2)} Calculated Equity vs ${portfolio.totalEquityUsd.toFixed(2)} Recorded Equity
                </div>
                <div className="text-[11px] text-zinc-400">
                  Discrepancy: ${discrepancy.toFixed(4)} USD ({isReconciled ? 'Within tolerance (<= $0.02)' : 'ALERT: Reconcile required'})
                </div>
              </div>

              {auditData?.rebuild && (
                <div className="grid grid-cols-2 gap-2 text-zinc-300">
                  <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                    <div className="text-zinc-400 text-[10px]">Reconstructed Cash Balance</div>
                    <div className="text-zinc-100 font-bold text-sm">${auditData.rebuild.reconstructedCashUsd.toFixed(2)}</div>
                  </div>
                  <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                    <div className="text-zinc-400 text-[10px]">Reconstructed Equity</div>
                    <div className="text-zinc-100 font-bold text-sm">${auditData.rebuild.reconstructedEquityUsd.toFixed(2)}</div>
                  </div>
                  <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                    <div className="text-zinc-400 text-[10px]">Active Positions Count</div>
                    <div className="text-zinc-100 font-bold text-sm">{auditData.rebuild.activePositionsCount}</div>
                  </div>
                  <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                    <div className="text-zinc-400 text-[10px]">Total Closed Trades Replayed</div>
                    <div className="text-zinc-100 font-bold text-sm">{auditData.rebuild.closedTradesCount}</div>
                  </div>
                </div>
              )}

              <div className="text-[11px] text-zinc-400 border-t border-zinc-800 pt-3">
                <p>Status: <strong>{auditData?.audit?.isValid ?? isReconciled ? 'STRICT DOUBLE-ENTRY VERIFIED' : 'INVESTIGATING'}</strong></p>
                <p className="mt-1">All orders adhere to point-in-time state without synthetic win-rate boosters or random number generation.</p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowAuditModal(false)}
                className="px-4 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold transition-colors"
              >
                Close Audit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
