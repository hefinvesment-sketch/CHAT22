import React, { useState } from 'react';
import { X, Sliders, ShieldCheck, Zap, Database, RotateCcw } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [minLiquidity, setMinLiquidity] = useState('2000000');
  const [maxPositionPct, setMaxPositionPct] = useState('2.0');
  const [maxPortfolioOpen, setMaxPortfolioOpen] = useState('10');
  const [latencyModel, setLatencyModel] = useState('850');
  const [strictSybil, setStrictSybil] = useState(true);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg max-w-2xl w-full p-5 space-y-4 font-mono select-none">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-zinc-100">Engine Configuration & Safety Rules</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div className="p-3 rounded bg-zinc-950 border border-zinc-800 space-y-2">
            <div className="font-bold text-zinc-200 uppercase text-[11px]">Hard Safety Thresholds</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-400 block mb-1">Minimum Pool Liquidity (USD):</label>
                <input
                  type="text"
                  value={minLiquidity}
                  onChange={(e) => setMinLiquidity(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-200"
                />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Max Position Sizing (% of Fund):</label>
                <input
                  type="text"
                  value={maxPositionPct}
                  onChange={(e) => setMaxPositionPct(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-200"
                />
              </div>
            </div>
          </div>

          <div className="p-3 rounded bg-zinc-950 border border-zinc-800 space-y-2">
            <div className="font-bold text-zinc-200 uppercase text-[11px]">Execution Simulator Parameters</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-400 block mb-1">Simulated Latency (ms):</label>
                <input
                  type="text"
                  value={latencyModel}
                  onChange={(e) => setLatencyModel(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-200"
                />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Max Open Positions:</label>
                <input
                  type="text"
                  value={maxPortfolioOpen}
                  onChange={(e) => setMaxPortfolioOpen(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-200"
                />
              </div>
            </div>
          </div>

          <div className="p-3 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-between">
            <div>
              <div className="font-bold text-zinc-200">Strict Sybil Cluster Disqualification</div>
              <div className="text-[11px] text-zinc-400">Collapse co-funded and related wallets into 1 independent vote.</div>
            </div>
            <input
              type="checkbox"
              checked={strictSybil}
              onChange={(e) => setStrictSybil(e.target.checked)}
              className="w-4 h-4 rounded text-emerald-500 cursor-pointer"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-xs"
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
};
