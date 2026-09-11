import React, { useState } from 'react';
import { 
  Network, 
  ShieldCheck, 
  AlertTriangle, 
  Share2, 
  Layers, 
  Info,
  CheckCircle2,
  Users
} from 'lucide-react';
import { WalletProfile, WalletRelationship } from '../../types';

interface WalletNetworkViewProps {
  wallets: WalletProfile[];
  relationships: WalletRelationship[];
  onSelectWallet: (wallet: WalletProfile) => void;
}

export const WalletNetworkView: React.FC<WalletNetworkViewProps> = ({
  wallets,
  relationships,
  onSelectWallet
}) => {
  const [selectedRel, setSelectedRel] = useState<WalletRelationship | null>(relationships[0] || null);

  return (
    <div className="space-y-4 p-4 font-mono select-none">
      {/* Header */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-bold text-zinc-100 flex items-center gap-2">
            <Network className="w-5 h-5 text-indigo-400" />
            Wallet Relationship & Sybil Cluster Graph
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Probabilistic relationship detection. Related or co-funded wallets are disqualified from independent consensus confirmation.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-2.5 py-1 rounded bg-indigo-950 border border-indigo-500/40 text-indigo-300 font-semibold">
            Consensus Rule: Sybils Filtered
          </span>
        </div>
      </div>

      {/* Network Visual Canvas + Relationship Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Interactive SVG Network Graph (2 cols) */}
        <div className="lg:col-span-2 bg-zinc-900/80 border border-zinc-800 rounded p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs text-zinc-300 font-bold">
              <Users className="w-4 h-4 text-emerald-400" />
              <span>Wallet Cluster Topology (Solana DEX Swaps & Funding)</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-zinc-400">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                <span>Independent (Confirmed)</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-400"></span>
                <span>Co-Funded / Cluster</span>
              </span>
            </div>
          </div>

          {/* Graphical SVG Topology Representation */}
          <div className="h-80 w-full bg-zinc-950 rounded border border-zinc-800/80 relative flex items-center justify-center overflow-hidden">
            <svg className="w-full h-full" viewBox="0 0 600 320">
              {/* Relationship Links */}
              {/* Independent Edge (dashed emerald) */}
              <line x1="160" y1="110" x2="340" y2="100" stroke="#10b981" strokeWidth="2" strokeDasharray="4 4" />
              <line x1="160" y1="110" x2="220" y2="230" stroke="#10b981" strokeWidth="2" strokeDasharray="4 4" />
              <line x1="340" y1="100" x2="480" y2="120" stroke="#10b981" strokeWidth="2" strokeDasharray="4 4" />
              
              {/* Sybil Co-funded Edge (solid rose) */}
              <line x1="450" y1="240" x2="360" y2="220" stroke="#f43f5e" strokeWidth="3" />

              {/* Node 1: 7Xs Alpha Whale */}
              <g 
                transform="translate(160, 110)" 
                className="cursor-pointer group"
                onClick={() => {
                  const w = wallets.find(x => x.address.startsWith('7Xs'));
                  if (w) onSelectWallet(w);
                }}
              >
                <circle r="34" fill="#064e3b" stroke="#10b981" strokeWidth="2" />
                <text textAnchor="middle" y="-6" fill="#f4f4f5" fontSize="10" fontWeight="bold">Alpha 7Xs</text>
                <text textAnchor="middle" y="10" fill="#a7f3d0" fontSize="9">Score 93</text>
                <text textAnchor="middle" y="22" fill="#6ee7b7" fontSize="8">$1.8M (94% Core)</text>
              </g>

              {/* Node 2: 9pW Momentum Fund */}
              <g 
                transform="translate(340, 100)" 
                className="cursor-pointer group"
                onClick={() => {
                  const w = wallets.find(x => x.address.startsWith('9pW'));
                  if (w) onSelectWallet(w);
                }}
              >
                <circle r="38" fill="#064e3b" stroke="#10b981" strokeWidth="2" />
                <text textAnchor="middle" y="-6" fill="#f4f4f5" fontSize="10" fontWeight="bold">SOL Fund 9pW</text>
                <text textAnchor="middle" y="10" fill="#a7f3d0" fontSize="9">Score 95</text>
                <text textAnchor="middle" y="22" fill="#6ee7b7" fontSize="8">$3.4M (91% Core)</text>
              </g>

              {/* Node 3: 3vR Emerging Quant */}
              <g 
                transform="translate(220, 230)" 
                className="cursor-pointer group"
                onClick={() => {
                  const w = wallets.find(x => x.address.startsWith('3vR'));
                  if (w) onSelectWallet(w);
                }}
              >
                <circle r="30" fill="#064e3b" stroke="#38bdf8" strokeWidth="2" />
                <text textAnchor="middle" y="-4" fill="#f4f4f5" fontSize="10" fontWeight="bold">Emerging 3vR</text>
                <text textAnchor="middle" y="10" fill="#7dd3fc" fontSize="9">Score 91 (Rising)</text>
              </g>

              {/* Node 4: 8bNk Oracle Quant */}
              <g 
                transform="translate(480, 120)" 
                className="cursor-pointer group"
                onClick={() => {
                  const w = wallets.find(x => x.address.startsWith('8bN'));
                  if (w) onSelectWallet(w);
                }}
              >
                <circle r="32" fill="#064e3b" stroke="#10b981" strokeWidth="2" />
                <text textAnchor="middle" y="-4" fill="#f4f4f5" fontSize="10" fontWeight="bold">Oracle 8bNk</text>
                <text textAnchor="middle" y="10" fill="#a7f3d0" fontSize="9">Score 94</text>
              </g>

              {/* Sybil Cluster: Meme Gambler + Related */}
              <g transform="translate(450, 240)" className="cursor-pointer group">
                <circle r="26" fill="#881337" stroke="#f43f5e" strokeWidth="2" />
                <text textAnchor="middle" y="-3" fill="#f4f4f5" fontSize="9" fontWeight="bold">Cluster A</text>
                <text textAnchor="middle" y="10" fill="#fda4af" fontSize="8">Meme Insider</text>
              </g>

              <g transform="translate(360, 220)" className="cursor-pointer group">
                <circle r="24" fill="#881337" stroke="#f43f5e" strokeWidth="2" />
                <text textAnchor="middle" y="-3" fill="#f4f4f5" fontSize="9" fontWeight="bold">Cluster B</text>
                <text textAnchor="middle" y="9" fill="#fda4af" fontSize="8">Co-funded</text>
              </g>
            </svg>
          </div>

          <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800 text-xs text-zinc-400 mt-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>Alpha Rule Enforced:</strong> 4 distinct elite wallets (7Xs, 9pW, 3vR, 8bNk) have zero funding overlap and independent swap routes. They qualify as <strong>4 independent confirmations</strong>.
            </span>
          </div>
        </div>

        {/* Relationship Details Sidebar */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs uppercase font-bold text-zinc-200">
              Relationship Evidence Dossier
            </h3>
            <span className="text-[10px] text-zinc-400">{relationships.length} Links Evaluated</span>
          </div>

          <div className="space-y-2">
            {relationships.map(rel => (
              <div
                key={rel.id}
                onClick={() => setSelectedRel(rel)}
                className={`p-2.5 rounded border text-xs cursor-pointer transition-colors ${
                  selectedRel?.id === rel.id 
                    ? 'bg-zinc-800 border-zinc-600' 
                    : 'bg-zinc-950/60 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-200">{rel.relationshipType}</span>
                  <span className={`text-[10px] font-bold ${rel.relationshipType === 'Likely Independent' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {rel.confidenceScore}% Confidence
                  </span>
                </div>
                <div className="text-[10px] text-zinc-400 font-mono mt-1">
                  {rel.sourceWallet.slice(0, 6)}... &harr; {rel.targetWallet.slice(0, 6)}...
                </div>
                <div className="text-[11px] text-zinc-400 mt-1">
                  {rel.reasons[0]}
                </div>
              </div>
            ))}
          </div>

          {selectedRel && (
            <div className="p-3 rounded bg-zinc-950 border border-zinc-800 text-xs space-y-2 mt-4">
              <div className="font-bold text-zinc-200 text-xs uppercase">
                Selected Link Analysis
              </div>
              <div className="text-zinc-400 text-[11px] space-y-1">
                <div>Source: <span className="font-mono text-zinc-300">{selectedRel.sourceWallet.slice(0, 12)}...</span></div>
                <div>Target: <span className="font-mono text-zinc-300">{selectedRel.targetWallet.slice(0, 12)}...</span></div>
                <div>Shared Events: <strong className="text-zinc-200">{selectedRel.sharedTransactionsCount}</strong></div>
              </div>
              <div className="text-[11px] text-zinc-300 pt-1 border-t border-zinc-800">
                <div className="text-[10px] text-zinc-400 font-bold uppercase mb-1">Evidence Markers:</div>
                <ul className="list-disc list-inside space-y-0.5 text-zinc-400">
                  {selectedRel.reasons.map((r, idx) => (
                    <li key={idx}>{r}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
