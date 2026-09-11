import React from 'react';
import { 
  LayoutDashboard, 
  Radio, 
  Waves, 
  Search, 
  Trophy, 
  Dna, 
  Network, 
  TrendingUp, 
  Coins, 
  Briefcase, 
  Bot, 
  FlaskConical, 
  LineChart, 
  HeartPulse, 
  Settings as SettingsIcon,
  Sparkles
} from 'lucide-react';

export type TabKey = 
  | 'dashboard'
  | 'signals'
  | 'flows'
  | 'discovery'
  | 'genome'
  | 'network'
  | 'emerging'
  | 'tokens'
  | 'portfolio'
  | 'lab'
  | 'research'
  | 'analytics'
  | 'health'
  | 'ai_analyst';

interface SidebarProps {
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
  liveSignalCount?: number;
  openPositionCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  liveSignalCount = 3,
  openPositionCount = 3,
}) => {
  const navGroups = [
    {
      group: 'Core Alpha Engine',
      items: [
        { key: 'dashboard' as TabKey, label: 'Dashboard', icon: LayoutDashboard },
        { 
          key: 'signals' as TabKey, 
          label: 'Alpha Signals', 
          icon: Radio, 
          badge: `${liveSignalCount} Active`,
          badgeColor: 'bg-emerald-950 text-emerald-400 border-emerald-800/60'
        },
        { key: 'flows' as TabKey, label: 'Smart Money Flow', icon: Waves },
      ]
    },
    {
      group: 'Wallet Intelligence',
      items: [
        { key: 'discovery' as TabKey, label: 'Wallet Discovery', icon: Search },
        { key: 'genome' as TabKey, label: 'Trader Genome', icon: Dna },
        { key: 'network' as TabKey, label: 'Wallet Network', icon: Network },
        { key: 'emerging' as TabKey, label: 'Emerging Traders', icon: TrendingUp },
      ]
    },
    {
      group: 'Execution & Safety',
      items: [
        { key: 'tokens' as TabKey, label: 'Token Risk Engine', icon: Coins },
        { 
          key: 'portfolio' as TabKey, 
          label: 'Paper Portfolio', 
          icon: Briefcase,
          badge: `${openPositionCount} Open`,
          badgeColor: 'bg-cyan-950 text-cyan-400 border-cyan-800/60'
        },
        { key: 'lab' as TabKey, label: 'Strategy Lab (10 Bots)', icon: Bot },
      ]
    },
    {
      group: 'Quantitative Research',
      items: [
        { key: 'research' as TabKey, label: 'Research & Backtests', icon: FlaskConical },
        { key: 'analytics' as TabKey, label: 'Copyability Analytics', icon: LineChart },
        { key: 'ai_analyst' as TabKey, label: 'AI Analyst', icon: Sparkles },
        { key: 'health' as TabKey, label: 'System Health', icon: HeartPulse },
      ]
    }
  ];

  return (
    <aside className="w-60 bg-zinc-950 border-r border-zinc-800/80 flex flex-col justify-between h-[calc(100vh-53px)] shrink-0 overflow-y-auto select-none">
      <div className="py-3 px-2 space-y-4">
        {navGroups.map((group, gIdx) => (
          <div key={gIdx} className="space-y-1">
            <div className="px-3 text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-semibold">
              {group.group}
            </div>
            <div className="space-y-0.5">
              {group.items.map(item => {
                const Icon = item.icon;
                const isActive = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => onSelectTab(item.key)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs font-mono transition-all ${
                      isActive 
                        ? 'bg-zinc-800/90 text-zinc-100 font-semibold border-l-2 border-emerald-400 pl-2' 
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/80'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-400' : 'text-zinc-400'}`} />
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className={`text-[9px] px-1.5 py-0.2 rounded border font-medium ${item.badgeColor}`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* System Status Footer */}
      <div className="p-3 border-t border-zinc-800/80 bg-zinc-950/60 font-mono">
        <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1.5">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Stream: ACTIVE
          </span>
          <span className="text-zinc-400">Solana RPC</span>
        </div>
        <div className="text-[10px] text-zinc-400 flex justify-between">
          <span>Tracked Wallets:</span>
          <span className="text-zinc-300 font-semibold">500 Elite</span>
        </div>
        <div className="text-[10px] text-zinc-400 flex justify-between">
          <span>Starting Virtual:</span>
          <span className="text-emerald-400 font-semibold">$5,000.00</span>
        </div>
      </div>
    </aside>
  );
};
