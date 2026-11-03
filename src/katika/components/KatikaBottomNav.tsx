import React, { useState } from 'react';
import { Bot, Dices, ExternalLink, History, Home, LayoutDashboard, LogOut, MoreHorizontal, Power, ScrollText, Sliders, Users, Wallet, X } from 'lucide-react';
import { KatikaTab } from '../types/katika';

/** Onglets de la barre du bas ; les autres sont dans « Plus ». */
const MAIN_TABS: Array<{ id: KatikaTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'HOME', label: 'Accueil', icon: Home },
  { id: 'ROOMS', label: 'Tables', icon: Dices },
  { id: 'PLAYERS', label: 'Joueurs', icon: Users },
  { id: 'AI_ASSISTANT', label: 'Copilote', icon: Bot },
];

const MORE_TABS: Array<{ id: KatikaTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'DASHBOARD', label: 'Statistiques', icon: LayoutDashboard },
  { id: 'LOGS', label: 'Journal', icon: ScrollText },
  { id: 'MATCHES', label: 'Parties', icon: History },
  { id: 'SETTINGS', label: 'Paramètres', icon: Sliders },
  { id: 'KORA_CASH', label: 'Kora Cash', icon: Wallet },
];

interface KatikaBottomNavProps {
  visibleTabs: KatikaTab[];
  currentTab: KatikaTab;
  onSelectTab: (tab: KatikaTab) => void;
  email: string;
  isMaintenanceMode: boolean;
  canToggleMaintenance: boolean;
  onToggleMaintenance: () => void;
  onLogout: () => void;
}

/** Navigation de katika sur téléphone : barre du bas et menu « Plus ». */
export const KatikaBottomNav: React.FC<KatikaBottomNavProps> = ({
  visibleTabs,
  currentTab,
  onSelectTab,
  email,
  isMaintenanceMode,
  canToggleMaintenance,
  onToggleMaintenance,
  onLogout,
}) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const main = MAIN_TABS.filter((t) => visibleTabs.includes(t.id));
  const more = MORE_TABS.filter((t) => visibleTabs.includes(t.id));
  const moreActive = more.some((t) => t.id === currentTab);

  const select = (tab: KatikaTab) => {
    setMoreOpen(false);
    onSelectTab(tab);
  };

  return (
    <>
      {moreOpen && (
        <div className="lg:hidden fixed inset-0 z-[70] bg-black/60" onClick={() => setMoreOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Plus"
            className="absolute bottom-0 inset-x-0 rounded-t-2xl border-t border-slate-800 bg-slate-950 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] flex flex-col gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400 truncate">{email}</span>
              <button type="button" onClick={() => setMoreOpen(false)} className="w-11 h-11 flex items-center justify-center rounded-xl bg-slate-800" aria-label="Fermer">
                <X className="w-5 h-5" />
              </button>
            </div>
            {more.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => select(t.id)}
                  className={`min-h-[48px] px-4 rounded-xl flex items-center gap-3 text-sm ${currentTab === t.id ? 'bg-amber-500/15 text-amber-200' : 'bg-slate-900 text-slate-200'}`}
                >
                  <Icon className="w-5 h-5" />
                  {t.label}
                </button>
              );
            })}
            {canToggleMaintenance && (
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  onToggleMaintenance();
                }}
                className={`min-h-[48px] px-4 rounded-xl flex items-center gap-3 text-sm ${isMaintenanceMode ? 'bg-amber-500/20 text-amber-200' : 'bg-slate-900 text-slate-200'}`}
              >
                <Power className="w-5 h-5" />
                {isMaintenanceMode ? 'Arrêter la maintenance' : 'Passer en maintenance'}
              </button>
            )}
            <a href="/" className="min-h-[48px] px-4 rounded-xl flex items-center gap-3 text-sm bg-slate-900 text-slate-200">
              <ExternalLink className="w-5 h-5" />
              Retour au jeu
            </a>
            <button type="button" onClick={onLogout} className="min-h-[48px] px-4 rounded-xl flex items-center gap-3 text-sm bg-red-950/50 text-red-200">
              <LogOut className="w-5 h-5" />
              Se déconnecter
            </button>
          </div>
        </div>
      )}

      <nav
        aria-label="Navigation katika"
        className="lg:hidden fixed bottom-0 inset-x-0 z-[60] border-t border-slate-800 bg-slate-950/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="flex">
          {main.map((t) => {
            const Icon = t.icon;
            const active = currentTab === t.id;
            return (
              <li key={t.id} className="flex-1">
                <button
                  type="button"
                  onClick={() => select(t.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`w-full min-h-[56px] flex flex-col items-center justify-center gap-0.5 text-[11px] ${active ? 'text-amber-300' : 'text-slate-400'}`}
                >
                  <Icon className="w-5 h-5" />
                  {t.label}
                </button>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className={`w-full min-h-[56px] flex flex-col items-center justify-center gap-0.5 text-[11px] ${moreActive ? 'text-amber-300' : 'text-slate-400'}`}
            >
              <MoreHorizontal className="w-5 h-5" />
              Plus
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
};
