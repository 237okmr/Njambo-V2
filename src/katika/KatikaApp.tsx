import React, { useEffect, useState } from 'react';
import { KatikaAuthProvider, useKatikaAuth } from './context/KatikaAuthContext';
import { KatikaLogin } from './components/KatikaLogin';
import { KatikaMobileLogin } from './mobile/KatikaMobileLogin';
import { KatikaMobileCopilot } from './mobile/KatikaMobileCopilot';
import { KatikaSidebar } from './components/KatikaSidebar';
import { KatikaHeader } from './components/KatikaHeader';
import { KatikaBottomNav } from './components/KatikaBottomNav';
import { KatikaStrongConfirm } from './components/KatikaStrongConfirm';
import { KatikaTab, KatikaGameConfig } from './types/katika';
import { KatikaService } from './services/katikaService';
import { KATIKA_NAVIGATE_EVENT, KatikaNavigationEventDetail } from './utils/katikaNavigation';
import { can, canSeeTab, firstAllowedTab } from './utils/katikaAccess';
import { useIsCompactScreen } from './hooks/useIsCompactScreen';
import { KatikaHomeTab } from './components/tabs/KatikaHomeTab';
import { KatikaDashboardTab } from './components/tabs/KatikaDashboardTab';
import { KatikaRoomsTab } from './components/tabs/KatikaRoomsTab';
import { KatikaMatchesTab } from './components/tabs/KatikaMatchesTab';
import { KatikaPlayersTab } from './components/tabs/KatikaPlayersTab';
import { KatikaSettingsTab } from './components/tabs/KatikaSettingsTab';
import { KatikaLegacyRecordsPanel } from './components/KatikaLegacyRecordsPanel';
import { KatikaLogsTab } from './components/tabs/KatikaLogsTab';
import { KatikaAiAssistantTab } from './components/tabs/KatikaAiAssistantTab';
import { KatikaKoraCashTab } from './components/tabs/KatikaKoraCashTab';
import { KatikaAiChatProvider } from './context/KatikaAiChatContext';
import { KatikaAiFloatingBubble } from './components/KatikaAiFloatingBubble';
import { Loader2 } from 'lucide-react';

const TAB_ORDER: KatikaTab[] = ['HOME', 'DASHBOARD', 'ROOMS', 'LOGS', 'PLAYERS', 'MATCHES', 'AI_ASSISTANT', 'SETTINGS', 'KORA_CASH'];

const TAB_TITLES: Record<KatikaTab, [string, string]> = {
  HOME: ['Accueil', 'Ce qui demande ton attention, puis le direct'],
  DASHBOARD: ['Statistiques', 'Parties, abandons, Koras et fréquentation'],
  ROOMS: ['Tables en direct', 'Les tables ouvertes en ce moment'],
  MATCHES: ['Parties', 'Historique des manches, scores et pots'],
  PLAYERS: ['Joueurs', 'Dossiers, sanctions et palmarès'],
  SETTINGS: ['Paramètres', 'Règles, réglages du jeu et administrateurs'],
  LOGS: ['Journal', 'Décisions des admins et alertes, avec export'],
  AI_ASSISTANT: ['Copilote', 'Conseils, analyses et visuels'],
  KORA_CASH: ['Kora Cash', 'Argent réel : dépôts, retraits, tables et sécurité'],
};

const KatikaWorkspace: React.FC<{ initialTab?: KatikaTab }> = ({ initialTab }) => {
  const { user, access, logout } = useKatikaAuth();
  const compact = useIsCompactScreen();
  const sessionEmail = user?.email || '';
  const visibleTabs = TAB_ORDER.filter((tab) => canSeeTab(access, tab));
  const [currentTab, setCurrentTab] = useState<KatikaTab>(() =>
    initialTab && canSeeTab(access, initialTab) ? initialTab : firstAllowedTab(access, TAB_ORDER) ?? 'HOME'
  );
  const [config, setConfig] = useState<KatikaGameConfig | null>(null);

  useEffect(() => {
    KatikaService.getConfig().then(setConfig);
  }, []);

  useEffect(() => {
    const handleNavigation = (e: Event) => {
      const customEvent = e as CustomEvent<KatikaNavigationEventDetail>;
      if (customEvent.detail && customEvent.detail.tab && canSeeTab(access, customEvent.detail.tab)) {
        setCurrentTab(customEvent.detail.tab);
      }
    };

    window.addEventListener(KATIKA_NAVIGATE_EVENT, handleNavigation);
    return () => window.removeEventListener(KATIKA_NAVIGATE_EVENT, handleNavigation);
  }, [access]);

  const handleToggleMaintenance = async () => {
    if (!config) return;
    const updated = await KatikaService.updateConfig({
      isMaintenanceMode: !config.isMaintenanceMode,
    });
    setConfig(updated);
    window.dispatchEvent(new CustomEvent('katika-config-updated', { detail: updated }));
  };

  const shows = (tab: KatikaTab) => visibleTabs.includes(tab) && currentTab === tab;
  const backTab = firstAllowedTab(access, TAB_ORDER.filter((t) => t !== 'AI_ASSISTANT')) ?? 'HOME';
  const [title, subtitle] = TAB_TITLES[currentTab];

  return (
    <KatikaAiChatProvider>
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500/30">
        <KatikaHeader
          isMaintenanceMode={config?.isMaintenanceMode || false}
          onToggleMaintenance={handleToggleMaintenance}
        />

        <div className="flex-1 flex overflow-hidden">
          <KatikaSidebar
            visibleTabs={visibleTabs}
            currentTab={currentTab}
            onSelectTab={setCurrentTab}
            isMaintenanceMode={config?.isMaintenanceMode || false}
          />

          {/* Sur téléphone : marge réduite et place laissée à la barre du bas */}
          <main className="flex-1 overflow-y-auto p-4 pb-28 lg:p-8 lg:pb-32 bg-slate-950 comfort-ui">
            <div className="max-w-7xl mx-auto space-y-5 lg:space-y-6">
              <div className="flex items-center justify-between gap-3 pb-3 lg:pb-4 border-b border-slate-800/80">
                <div className="min-w-0">
                  <h1 className="text-lg lg:text-xl font-bold text-white tracking-tight">{title}</h1>
                  <p className="text-sm lg:text-xs text-slate-400 mt-0.5">{subtitle}</p>
                </div>
                <div className="hidden lg:block text-xs font-mono px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400">
                  Session : <span className="text-amber-400">{sessionEmail}</span>
                </div>
              </div>

              {visibleTabs.length === 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-6 text-sm text-slate-300">
                  Ton compte a accès à katika, mais aucun droit ne lui est encore donné. Demande au propriétaire de régler tes droits.
                </div>
              )}

              {shows('HOME') && (
                <KatikaHomeTab access={access} maintenance={config?.isMaintenanceMode || false} onNavigateTab={setCurrentTab} />
              )}
              {shows('DASHBOARD') && <KatikaDashboardTab onNavigateTab={setCurrentTab} />}
              {shows('ROOMS') && <KatikaRoomsTab />}
              {shows('MATCHES') && <KatikaMatchesTab />}
              {shows('PLAYERS') && <KatikaPlayersTab />}
              {shows('SETTINGS') && (
                <div className="space-y-6">
                  <KatikaSettingsTab onConfigUpdated={setConfig} />
                  {access?.isOwner && <KatikaLegacyRecordsPanel />}
                </div>
              )}
              {shows('LOGS') && <KatikaLogsTab />}
              {shows('AI_ASSISTANT') && !compact && <KatikaAiAssistantTab />}
              {shows('KORA_CASH') && <KatikaKoraCashTab />}
            </div>
          </main>
        </div>

        {/* Copilote sur téléphone : plein écran, avec retour vers katika */}
        {shows('AI_ASSISTANT') && compact && (
          <div className="fixed inset-0 z-[65]">
            <KatikaMobileCopilot onBack={() => setCurrentTab(backTab)} />
          </div>
        )}

        {!compact && canSeeTab(access, 'AI_ASSISTANT') && (
          <KatikaAiFloatingBubble currentTab={currentTab} onNavigateTab={setCurrentTab} />
        )}

        {compact && !shows('AI_ASSISTANT') && (
          <KatikaBottomNav
            visibleTabs={visibleTabs}
            currentTab={currentTab}
            onSelectTab={setCurrentTab}
            email={sessionEmail}
            isMaintenanceMode={config?.isMaintenanceMode || false}
            canToggleMaintenance={can(access, 'settings.edit')}
            onToggleMaintenance={handleToggleMaintenance}
            onLogout={logout}
          />
        )}

        <KatikaStrongConfirm />
      </div>
    </KatikaAiChatProvider>
  );
};

const isCopilotPath = (): boolean => {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.toLowerCase();
  const search = window.location.search.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  return (
    path.includes('/copilot') ||
    search.includes('copilot') ||
    hash.includes('copilot') ||
    search.includes('mode=copilot')
  );
};

const KatikaGate: React.FC = () => {
  const { isAuthorized, loading } = useKatikaAuth();
  const compact = useIsCompactScreen();
  const [isCopilotMode, setIsCopilotMode] = useState<boolean>(() => isCopilotPath());

  useEffect(() => {
    const checkRoute = () => setIsCopilotMode(isCopilotPath());
    window.addEventListener('popstate', checkRoute);
    window.addEventListener('hashchange', checkRoute);
    return () => {
      window.removeEventListener('popstate', checkRoute);
      window.removeEventListener('hashchange', checkRoute);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center gap-3 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        <span className="text-sm">Vérification des accès…</span>
      </div>
    );
  }

  // Une seule application, sur PC comme sur téléphone ; l'adresse /copilot ouvre directement le Copilote.
  if (!isAuthorized) {
    return compact ? <KatikaMobileLogin /> : <KatikaLogin />;
  }

  return <KatikaWorkspace initialTab={isCopilotMode ? 'AI_ASSISTANT' : undefined} />;
};

export const KatikaApp: React.FC = () => {
  return (
    <KatikaAuthProvider>
      <KatikaGate />
    </KatikaAuthProvider>
  );
};
