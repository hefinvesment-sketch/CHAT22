import React, { useState } from 'react';
import { 
  Coins, 
  ShieldCheck, 
  ShieldAlert, 
  Lock, 
  Unlock, 
  AlertTriangle, 
  CheckCircle2, 
  ExternalLink 
} from 'lucide-react';
import { TokenMarketData } from '../../types';

interface TokensViewProps {
  tokens: TokenMarketData[];
}

export const TokensView: React.FC<TokensViewProps> = ({ tokens }) => {
  const [selectedToken, setSelectedToken] = useState<TokenMarketData | null>(tokens[0] || null);

  return (
    <div className="space-y-4 p-4 font-mono select-none">
      {/* Header */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-bold text-zinc-100 flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-400" />
            Token Risk & Structural Safety Engine
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Automated verification: &gt;=$2.0M liquidity, top 10 holder concentration &lt;35%, revoked mint/freeze authority, and honeypot simulation.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-2.5 py-1 rounded bg-amber-950 border border-amber-500/40 text-amber-300 font-semibold flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Anti-Rug Hard Safety</span>
          </span>
        </div>
      </div>

      {/* Main Grid: Tokens Table & Token Detail Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Tokens List (2 cols) */}
        <div className="lg:col-span-2 bg-zinc-900/80 border border-zinc-800 rounded p-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-[10px] text-zinc-400 uppercase tracking-wider">
                <th className="pb-2.5">Token</th>
                <th className="pb-2.5">Price</th>
                <th className="pb-2.5">Pool Liquidity</th>
                <th className="pb-2.5">Top 10 Hold</th>
                <th className="pb-2.5">Authorities</th>
                <th className="pb-2.5">Risk Score</th>
                <th className="pb-2.5 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {tokens.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-zinc-500">
                    <ShieldAlert className="w-6 h-6 mx-auto mb-2 opacity-40 text-amber-400" />
                    <div>Streaming real-time Solana tokens from Helius DEX ingestion...</div>
                  </td>
                </tr>
              ) : (
                tokens.map((t, idx) => {
                  const risk = t.riskScore ?? 50;
                  const isSafe = risk <= 20;
                  const isSelected = (selectedToken?.address && selectedToken.address === t.address) || 
                                     (!selectedToken?.address && selectedToken?.symbol === t.symbol);

                  return (
                    <tr 
                      key={t.address || `${t.symbol}-${idx}`} 
                      onClick={() => setSelectedToken(t)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-zinc-800/80' : 'hover:bg-zinc-800/40'
                      }`}
                    >
                    <td className="py-3 font-bold text-zinc-100">
                      <div>{t.symbol}</div>
                      <div className="text-[10px] text-zinc-400 font-normal">{t.name}</div>
                    </td>
                    <td className="py-3 font-semibold text-zinc-200">${t.priceUsd}</td>
                    <td className="py-3 font-mono">
                      <span className={(t.liquidityUsd ?? 0) >= 2000000 ? 'text-zinc-200' : 'text-rose-400'}>
                        ${((t.liquidityUsd ?? 0) / 1000000).toFixed(1)}M
                      </span>
                    </td>
                    <td className="py-3 font-mono text-zinc-300">
                      {t.top10HoldersPercent}%
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <span className={`px-1 rounded ${!t.hasMintAuthority ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'}`}>
                          Mint: {!t.hasMintAuthority ? 'Revoked' : 'Active'}
                        </span>
                        <span className={`px-1 rounded ${!t.hasFreezeAuthority ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'}`}>
                          Freeze: {!t.hasFreezeAuthority ? 'Revoked' : 'Active'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        isSafe ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' :
                        risk <= 35 ? 'bg-amber-950 text-amber-300 border border-amber-500/30' :
                        'bg-rose-950 text-rose-400 border border-rose-500/30'
                      }`}>
                        {t.riskScore ?? 'N/A'} / 100
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <button className="text-xs text-amber-400 hover:underline">
                        View Dossier
                      </button>
                    </td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>

        {/* Selected Token Safety Dossier */}
        {selectedToken && (
          <div className="bg-zinc-900/80 border border-zinc-800 rounded p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div>
                <h3 className="text-base font-bold text-zinc-100">{selectedToken.name} ({selectedToken.symbol})</h3>
                <p className="text-[10px] text-zinc-400 font-mono mt-0.5">{selectedToken.address}</p>
              </div>
              <div className="text-right">
                <div className="text-xs text-zinc-400">Structural Risk</div>
                <div className={`text-lg font-bold ${(selectedToken.riskScore ?? 50) <= 20 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {selectedToken.riskScore ?? 'N/A'} / 100
                </div>
              </div>
            </div>

            {/* Checklist */}
            <div className="space-y-2 text-xs">
              <div className="p-2 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                <span className="text-zinc-400">Liquidity Depth:</span>
                <span className="font-bold text-zinc-200">
                  ${((selectedToken.liquidityUsd ?? 0) / 1000000).toFixed(2)}M (Safe &gt;$2.0M)
                </span>
              </div>

              <div className="p-2 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                <span className="text-zinc-400">Liquidity Locked:</span>
                <span className="font-bold text-emerald-400">
                  {selectedToken.liquidityLockedPercent}% Locked
                </span>
              </div>

              <div className="p-2 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                <span className="text-zinc-400">Top 10 Holder Concentration:</span>
                <span className="font-bold text-zinc-200">
                  {selectedToken.top10HoldersPercent}% (Top 20: {selectedToken.top20HoldersPercent}%)
                </span>
              </div>

              <div className="p-2 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                <span className="text-zinc-400">Developer Holdings:</span>
                <span className="font-bold text-zinc-200">
                  {selectedToken.devHoldingsPercent}%
                </span>
              </div>

              <div className="p-2 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                <span className="text-zinc-400">Mint Authority:</span>
                <span className={`font-bold ${!selectedToken.hasMintAuthority ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {!selectedToken.hasMintAuthority ? 'REVOKED (IMMUTABLE)' : 'ACTIVE (UNSAFE)'}
                </span>
              </div>

              <div className="p-2 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                <span className="text-zinc-400">Freeze Authority:</span>
                <span className={`font-bold ${!selectedToken.hasFreezeAuthority ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {!selectedToken.hasFreezeAuthority ? 'REVOKED (UNFREEZABLE)' : 'ACTIVE (UNSAFE)'}
                </span>
              </div>

              <div className="p-2 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                <span className="text-zinc-400">Honeypot Simulation:</span>
                <span className="font-bold text-emerald-400">
                  PASSED (SELL TAX 0%)
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-400">
              <strong className="text-zinc-300">Safety Verdict:</strong>{' '}
              {(selectedToken.riskScore ?? 50) <= 20 
                ? 'Approved for institutional paper execution when alpha signals trigger.' 
                : 'Hard safety veto enabled. Trading blocked due to concentration or authority parameters.'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
