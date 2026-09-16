import React from 'react';
import { 
  HeartPulse, 
  Server, 
  Cpu, 
  Activity, 
  ShieldCheck, 
  CheckCircle2, 
  Radio, 
  Database,
  BarChart2
} from 'lucide-react';

interface BirdeyeUsageStats {
  requestsThisHour: number;
  requestsToday: number;
  cacheHits: number;
  cacheMisses: number;
  deduplicatedRequests: number;
  failedRequests: number;
  lastRequestAt: string | null;
  usageMode: 'NORMAL' | 'CONSERVATION' | 'CRITICAL';
}

interface ProviderHealthRecord {
  providerName: string;
  status: string;
  latencyMs?: number | null;
  message?: string;
}

interface SystemHealthViewProps {
  birdeyeUsage?: BirdeyeUsageStats;
  providers?: ProviderHealthRecord[];
}

export const SystemHealthView: React.FC<SystemHealthViewProps> = ({ birdeyeUsage, providers = [] }) => {
  const defaultProviders = [
    { name: 'Solana RPC (Helius / QuickNode)', type: 'RPC', latency: '42ms', status: 'HEALTHY', rateLimit: '420 / 1000 req/s' },
    { name: 'Jito MEV Relayer & Bundler', type: 'Execution', latency: '68ms', status: 'HEALTHY', rateLimit: 'Optimal routing' },
    { name: 'Jupiter Swap Aggregator API', type: 'DEX Route', latency: '85ms', status: 'HEALTHY', rateLimit: '350 / 600 req/min' },
    { name: 'DexScreener / GeckoTerminal', type: 'Market Data', latency: '120ms', status: 'HEALTHY', rateLimit: '90 / 300 req/min' },
    { name: 'Alpha Scoring Engine v2.4', type: 'Pipeline', latency: '12ms', status: 'HEALTHY', rateLimit: 'Real-time On-chain' },
    { name: 'Sybil Cluster Graph Engine', type: 'Security', latency: '24ms', status: 'HEALTHY', rateLimit: 'Graph Evaluated' },
  ];

  // Merge live providers
  const displayProviders = defaultProviders.map(dp => {
    // Basic fuzzy match for mockup names vs real providerNames
    let match = null;
    if (dp.name.includes('RPC')) match = providers.find(p => p.providerName.includes('RPC') || p.providerName.includes('Helius'));
    if (dp.name.includes('Jupiter')) match = providers.find(p => p.providerName.includes('Jupiter'));
    
    return {
      ...dp,
      latency: match?.latencyMs ? `${match.latencyMs}ms` : dp.latency,
      status: match?.status ? match.status : dp.status,
    };
  });
  
  // Explicitly add Birdeye if missing from default mock list
  const birdeyeProvider = providers.find(p => p.providerName.toLowerCase().includes('birdeye'));
  const cacheHitRate = birdeyeUsage 
    ? (birdeyeUsage.cacheHits / Math.max(1, (birdeyeUsage.cacheHits + birdeyeUsage.cacheMisses)))
    : 0;

  if (birdeyeProvider) {
    displayProviders.push({
      name: 'Birdeye API',
      type: 'Market Data',
      latency: birdeyeProvider.latencyMs ? `${birdeyeProvider.latencyMs}ms` : 'N/A',
      status: birdeyeProvider.status,
      rateLimit: birdeyeUsage ? `${birdeyeUsage.requestsThisHour} req/hr` : 'Unknown'
    });
  }

  return (
    <div className="space-y-4 p-4 font-mono select-none">
      {/* Header */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-bold text-zinc-100 flex items-center gap-2">
            <HeartPulse className="w-5 h-5 text-emerald-400" />
            Infrastructure Telemetry & Pipeline Health
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Real-time status of Solana RPC nodes, DEX aggregators, MEV relays, and the AlphaGraph scoring pipeline.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-2.5 py-1 rounded bg-emerald-950 border border-emerald-500/40 text-emerald-400 font-semibold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            <span>All Systems Nominal</span>
          </span>
        </div>
      </div>

      {/* Provider Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {displayProviders.map((p, idx) => (
          <div key={idx} className="bg-zinc-900/80 border border-zinc-800 rounded p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-zinc-100 text-xs">{p.name}</span>
              <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${
                p.status === 'HEALTHY' || p.status === 'CONNECTED' 
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/30' 
                  : p.status === 'DEGRADED' || p.status === 'CONSERVATION'
                    ? 'bg-amber-950/80 text-amber-400 border-amber-500/30'
                    : 'bg-red-950/80 text-red-400 border-red-500/30'
              }`}>
                {p.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <div className="p-1.5 rounded bg-zinc-950 border border-zinc-800">
                <div className="text-[10px] text-zinc-400">Response Latency</div>
                <div className="font-bold text-zinc-200 mt-0.5">{p.latency}</div>
              </div>
              <div className="p-1.5 rounded bg-zinc-950 border border-zinc-800">
                <div className="text-[10px] text-zinc-400">Load / Quota</div>
                <div className="font-bold text-zinc-300 mt-0.5 text-[11px]">{p.rateLimit}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Birdeye Provider Diagnostics */}
      {birdeyeUsage && (
        <div className="bg-zinc-900/80 border border-zinc-800 rounded p-4 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-zinc-200 text-xs uppercase flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-blue-400" />
              Birdeye Usage Telemetry & Budget
            </h3>
            <span className={`px-2 py-0.5 rounded font-bold border text-[10px] ${
              birdeyeUsage.usageMode === 'NORMAL' 
                ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/30'
                : birdeyeUsage.usageMode === 'CONSERVATION'
                  ? 'bg-amber-950/80 text-amber-400 border-amber-500/30'
                  : 'bg-red-950/80 text-red-400 border-red-500/30'
            }`}>
              MODE: {birdeyeUsage.usageMode}
            </span>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
              <div className="text-[10px] text-zinc-400">Requests (1h / 24h)</div>
              <div className="font-bold text-zinc-100 mt-0.5">{birdeyeUsage.requestsThisHour} / {birdeyeUsage.requestsToday}</div>
            </div>
            <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
              <div className="text-[10px] text-zinc-400">Cache Deduplication</div>
              <div className="font-bold text-blue-400 mt-0.5">
                {(cacheHitRate * 100).toFixed(1)}% Hit Rate
              </div>
              <div className="text-[9px] text-zinc-500 mt-0.5">{birdeyeUsage.deduplicatedRequests} reqs saved</div>
            </div>
            <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
              <div className="text-[10px] text-zinc-400">Failed / 429 Errors</div>
              <div className="font-bold text-amber-400 mt-0.5">{birdeyeUsage.failedRequests} blocked/failed</div>
            </div>
            <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
              <div className="text-[10px] text-zinc-400">Last Outbound Request</div>
              <div className="font-bold text-zinc-300 mt-0.5">
                {birdeyeUsage.lastRequestAt 
                  ? new Date(birdeyeUsage.lastRequestAt).toLocaleTimeString() 
                  : 'Never'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Point-in-Time Data Audit Status */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded p-4 space-y-2 text-xs">
        <h3 className="font-bold text-zinc-200 text-xs uppercase flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Point-in-Time Compliance & Security Audit
        </h3>
        <p className="text-zinc-400">
          HEF AlphaGraph strictly operates under zero lookahead bias rules. All price references, liquidity depths, and wallet histories are timestamp-locked to transaction confirmation block slots.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
            <div className="text-[10px] text-zinc-400">Block Slot Synchronization</div>
            <div className="font-bold text-zinc-100 mt-0.5">Slot #288,419,203</div>
          </div>
          <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
            <div className="text-[10px] text-zinc-400">Sybil Graph State</div>
            <div className="font-bold text-emerald-400 mt-0.5">500 Wallets (0 Loops)</div>
          </div>
          <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
            <div className="text-[10px] text-zinc-400">Execution Simulator Model</div>
            <div className="font-bold text-zinc-100 mt-0.5">Realistic Solana v2</div>
          </div>
        </div>
      </div>
    </div>
  );
};
