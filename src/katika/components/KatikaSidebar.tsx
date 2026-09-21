import React from 'react';
import { 
  LayoutDashboard, 
  Dices, 
  History,
  Users, 
  Sliders, 
  ScrollText, 
  ExternalLink,
  ShieldAlert,
  Bot
} from 'lucide-react';
import { KatikaTab } from '../types/katika';

interface KatikaSidebarProps {
  currentTab: KatikaTab;
  onSelectTab: (tab: KatikaTab) => void;
  isMaintenanceMode: boolean;
}

export const KatikaSidebar: React.FC<KatikaSidebarProps> = ({
  currentTab,
  onSelectTab,
  isMaintenanceMode,
}) => {
  const groups: {
    title: string;
    items: { id: KatikaTab; label: string; icon: React.ComponentType<{ className?: string }> }[];
  }[] = [
    {
      title: '📡 Supervision & Live',
      items: [
        { id: 'DASHBOARD', label: 'Tableau de Bord', icon: LayoutDashboard },
        { id: 'ROOMS', label: 'Salons & Tables en direct', icon: Dices },
        { id: 'LOGS', label: "Journal d'Audit & Alertes", icon: ScrollText },
      ],
    },
    {
      title: '👥 Gestion des Joueurs',
      items: [
        { id: 'PLAYERS', label: 'Base Joueurs & Sanctions', icon: Users },
        { id: 'MATCHES', label: 'Historique des Parties', icon: History },
      ],
    },
    {
      title: '🤖 Intelligence & Conseil',
      items: [
        { id: 'AI_ASSISTANT', label: 'Assistant IA (Conseil)', icon: Bot },
      ],
    },
    {
      title: '⚙️ Configuration & Technique',
      items: [
        { id: 'SETTINGS', label: 'Moteur & Paramètres', icon: Sliders },
      ],
    },
  ];

  return (
    <aside className="w-64 bg-slate-900/95 border-r border-slate-800/90 flex flex-col justify-between select-none h-[calc(100vh-4rem)] sticky top-16 z-40">
      {/* Top Nav List */}
      <div className="p-3 space-y-4">
        {groups.map((group, groupIdx) => (
          <div key={groupIdx} className="space-y-1">
            <div className="px-3 py-1.5 text-[10px] font-mono tracking-wider text-slate-500 uppercase">
              {group.title}
            </div>

            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  id={`katika-tab-${item.id.toLowerCase()}`}
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-medium transition-all duration-150 cursor-pointer ${
                    isActive
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-amber-400' : 'text-slate-500'}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}

        {/* Maintenance Mode Alert Banner */}
        {isMaintenanceMode && (
          <div className="mt-4 p-3 rounded-xl bg-amber-950/50 border border-amber-700/50 text-amber-300 text-xs flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
            <div className="leading-tight">
              <div className="font-bold text-[11px]">Mode Maintenance Actif</div>
              <div className="text-[10px] text-amber-400/80">Salons fermés aux joueurs</div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Link to Public Game */}
      <div className="p-3 border-t border-slate-800/80 space-y-2">
        <a
          href="/"
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800/40 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs transition-colors border border-slate-800"
        >
          <span className="truncate">Accéder au jeu public</span>
          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
        </a>

        <div className="px-2 py-1 text-[10px] text-slate-600 font-mono flex items-center justify-between">
          <span>v1.2.0 • Katika Cockpit</span>
          <span className="text-emerald-500">Secured</span>
        </div>
      </div>
    </aside>
  );
};
