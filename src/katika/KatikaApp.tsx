import React, { useEffect, useState } from 'react';
import { KatikaAuthProvider, useKatikaAuth, KATIKA_AUTHORIZED_EMAIL } from './context/KatikaAuthContext';
import { KatikaLogin } from './components/KatikaLogin';
import { KatikaMobileLogin } from './mobile/KatikaMobileLogin';
import { KatikaMobileCopilot } from './mobile/KatikaMobileCopilot';
import { isDesktopPC, isMobileUserAgent } from './utils/deviceCheck';
import { KatikaSidebar } from './components/KatikaSidebar';
import { KatikaHeader } from './components/KatikaHeader';
import { KatikaTab, KatikaGameConfig } from './types/katika';
import { KatikaService } from './services/katikaService';
import { KATIKA_NAVIGATE_EVENT, KatikaNavigationEventDetail } from './utils/katikaNavigation';
import { KatikaDashboardTab } from './components/tabs/KatikaDashboardTab';
import { KatikaRoomsTab } from './components/tabs/KatikaRoomsTab';
import { KatikaMatchesTab } from './components/tabs/KatikaMatchesTab';
import { KatikaPlayersTab } from './components/tabs/KatikaPlayersTab';
import { KatikaSettingsTab } from './components/tabs/KatikaSettingsTab';
import { KatikaLogsTab } from './components/tabs/KatikaLogsTab';
import { KatikaAiAssistantTab } from './components/tabs/KatikaAiAssistantTab';
import { KatikaAiChatProvider } from './context/KatikaAiChatContext';
import { KatikaAiFloatingBubble } from './components/KatikaAiFloatingBubble';
import { Loader2, MonitorOff, Maximize2, ArrowLeft, Bot, Sparkles } from 'lucide-react';

const KatikaWorkspace: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<KatikaTab>('DASHBOARD');
  const [config, setConfig] = useState<KatikaGameConfig | null>(null);

  useEffect(() => {
    KatikaService.getConfig().then(setConfig);
  }, []);

  useEffect(() => {
    const handleNavigation = (e: Event) => {
      const customEvent = e as CustomEvent<KatikaNavigationEventDetail>;
      if (customEvent.detail && customEvent.detail.tab) {
        setCurrentTab(customEvent.detail.tab);
      }
    };

    window.addEventListener(KATIKA_NAVIGATE_EVENT, handleNavigation);
    return () => window.removeEventListener(KATIKA_NAVIGATE_EVENT, handleNavigation);
  }, []);

  const handleToggleMaintenance = async () => {
    if (!config) return;
    const updated = await KatikaService.updateConfig({
      isMaintenanceMode: !config.isMaintenanceMode,
    });
    setConfig(updated);
    window.dispatchEvent(new CustomEvent('katika-config-updated', { detail: updated }));
  };

  return (
    <KatikaAiChatProvider>
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500/30">
        {/* Top Cockpit Bar */}
        <KatikaHeader 
          isMaintenanceMode={config?.isMaintenanceMode || false}
          onToggleMaintenance={handleToggleMaintenance}
        />

        {/* Cockpit Layout: Sidebar + Main Area */}
        <div className="flex-1 flex overflow-hidden">
          <KatikaSidebar 
            currentTab={currentTab} 
            onSelectTab={setCurrentTab}
            isMaintenanceMode={config?.isMaintenanceMode || false}
          />

          {/* Main Content Pane with bottom clearance for floating assistant */}
          <main className="flex-1 overflow-y-auto p-8 pb-28 sm:pb-32 bg-slate-950">
            <div className="max-w-7xl mx-auto space-y-6">
              {/* CRM Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
                <div>
                  <h1 className="text-xl font-bold text-white tracking-tight">
                    {currentTab === 'DASHBOARD' && 'Tableau de Bord & KPIs'}
                    {currentTab === 'ROOMS' && 'Salons & Tables en Direct'}
                    {currentTab === 'MATCHES' && 'Historique & Archives des Parties'}
                    {currentTab === 'PLAYERS' && 'Base Joueurs & Sanctions'}
                    {currentTab === 'SETTINGS' && 'Paramètres, Économie & Règles de Jeu'}
                    {currentTab === 'LOGS' && "Journal d'Audit & Traçabilité des Actions"}
                    {currentTab === 'AI_ASSISTANT' && 'Assistant IA Katika (Conseil & Analyse)'}
                  </h1>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {currentTab === 'MATCHES' && 'Registre officiel des manches disputées, scores, donnes et redistribution des pots'}
                    {currentTab === 'SETTINGS' && 'Règles authentiques, seuils de mises, forfaits et annonces globales'}
                    {currentTab === 'LOGS' && 'Historique complet des décisions de modération et export Excel / CSV'}
                    {currentTab === 'AI_ASSISTANT' && 'Assistant conversationnel multimodal Gemini 3.8 Flash • Mode lecture seule strict'}
                    {currentTab !== 'MATCHES' && currentTab !== 'SETTINGS' && currentTab !== 'LOGS' && currentTab !== 'AI_ASSISTANT' && 'Supervision opérationnelle • Station Katika Master'}
                  </p>
                </div>

                <div className="text-xs font-mono px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400">
                  Session : <span className="text-amber-400">{KATIKA_AUTHORIZED_EMAIL}</span>
                </div>
              </div>

              {/* Tab Content Render */}
              {currentTab === 'DASHBOARD' && <KatikaDashboardTab onNavigateTab={setCurrentTab} />}
              {currentTab === 'ROOMS' && <KatikaRoomsTab />}
              {currentTab === 'MATCHES' && <KatikaMatchesTab />}
              {currentTab === 'PLAYERS' && <KatikaPlayersTab />}
              {currentTab === 'SETTINGS' && <KatikaSettingsTab onConfigUpdated={setConfig} />}
              {currentTab === 'LOGS' && <KatikaLogsTab />}
              {currentTab === 'AI_ASSISTANT' && <KatikaAiAssistantTab />}

            </div>
          </main>
        </div>

        {/* Global Floating AI Assistant Bubble & Panel across all Katika pages */}
        <KatikaAiFloatingBubble
          currentTab={currentTab}
          onNavigateTab={setCurrentTab}
        />
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
  const [isCopilotMode, setIsCopilotMode] = useState<boolean>(() => isCopilotPath());
  const [isDesktopSize, setIsDesktopSize] = useState<boolean>(true);
  const [isMobileDevice, setIsMobileDevice] = useState<boolean>(false);

  useEffect(() => {
    const checkRoute = () => {
      setIsCopilotMode(isCopilotPath());
    };

    window.addEventListener('popstate', checkRoute);
    window.addEventListener('hashchange', checkRoute);
    return () => {
      window.removeEventListener('popstate', checkRoute);
      window.removeEventListener('hashchange', checkRoute);
    };
  }, []);

  useEffect(() => {
    // Check mobile user agent
    const isMobile = isMobileUserAgent();
    setIsMobileDevice(isMobile);

    if (isCopilotPath()) {
      // Mobile Copilot is fully authorized on mobile!
      return;
    }

    // 2. Check initial screen resolution for desktop PC workspace
    setIsDesktopSize(isDesktopPC());

    // 3. Dynamic non-destructive resize listener for PC
    const handleResize = () => {
      setIsDesktopSize(isDesktopPC());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isCopilotMode]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center gap-3 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        <span className="text-xs tracking-wide font-mono">
          {isCopilotMode ? 'Vérification des accès Copilot IA...' : 'Vérification des accès Katika...'}
        </span>
      </div>
    );
  }

  // --- 1. DEDICATED MOBILE COPILOT ROUTE (/katika/copilot or ?copilot=1) ---
  if (isCopilotMode) {
    if (!isAuthorized) {
      return <KatikaMobileLogin />;
    }

    return (
      <KatikaAiChatProvider>
        <KatikaMobileCopilot />
      </KatikaAiChatProvider>
    );
  }

  // --- 2. DESKTOP WORKSPACE (Accessed from mobile without /copilot) ---
  if (isMobileDevice) {
    return (
      <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center select-none font-sans relative overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-sm w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl backdrop-blur flex flex-col items-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <Bot className="w-7 h-7" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-lg font-bold text-white tracking-wide">
              Njambo Copilote sur Mobile
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Le grand poste de commandement multi-écrans requiert un PC. Pour piloter le jeu depuis votre smartphone, utilisez l'application <strong className="text-amber-400">Njambo Copilote</strong>.
            </p>
          </div>

          <div className="w-full pt-2 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => {
                window.history.pushState({}, '', '/katika/copilot');
                setIsCopilotMode(true);
              }}
              className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg transition cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Ouvrir l'Agent IA (Njambo Copilote)</span>
            </button>

            <button
              type="button"
              onClick={() => window.location.replace('/')}
              className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Retourner au jeu</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Non-destructive Screen Adjustment Overlay for Desktop PC
  if (!isDesktopSize) {
    return (
      <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center select-none font-sans">
        <div className="max-w-md w-full bg-slate-900/90 border border-amber-500/30 rounded-2xl p-8 shadow-2xl backdrop-blur flex flex-col items-center space-y-5">
          <div className="w-14 h-14 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <MonitorOff className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-bold text-white tracking-wide">
              Station Katika Master Verrouillée
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Le poste de commandement requiert un affichage de bureau d'au moins <span className="text-amber-400 font-semibold font-mono">1024px</span> de largeur pour garantir la visibilité des métriques en direct.
            </p>
          </div>

          <div className="w-full bg-slate-950/80 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-300 flex items-center justify-between">
            <span className="text-slate-500">Dimensions actuelles :</span>
            <span className="text-rose-400 font-bold">{window.innerWidth}px × {window.innerHeight}px</span>
          </div>

          <div className="pt-2 w-full flex flex-col gap-2">
            <button
              onClick={() => {
                if (document.documentElement.requestFullscreen) {
                  document.documentElement.requestFullscreen().catch(() => {});
                }
              }}
              className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition"
            >
              <Maximize2 className="w-4 h-4" />
              Basculer en plein écran
            </button>
            <button
              onClick={() => window.location.replace('/')}
              className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs rounded-xl flex items-center justify-center gap-2 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Retourner à l'accueil du jeu
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return <KatikaLogin />;
  }

  return <KatikaWorkspace />;
};

export const KatikaApp: React.FC = () => {
  return (
    <KatikaAuthProvider>
      <KatikaGate />
    </KatikaAuthProvider>
  );
};

