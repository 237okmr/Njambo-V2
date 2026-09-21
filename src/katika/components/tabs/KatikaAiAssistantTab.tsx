import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Send,
  Image as ImageIcon,
  X,
  Trash2,
  SlidersHorizontal,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  Loader2,
  Paperclip,
  CheckCircle2,
  User,
  Info,
  RotateCw,
  Activity,
  AlertTriangle,
  BarChart3,
  Database,
  WifiOff,
  TrendingUp,
  Calculator,
  Copy,
  Check,
  Gauge,
  Lightbulb,
  Pin,
  Plus,
  Edit2,
  MessageSquare,
  PanelLeftClose,
  PanelLeft,
  Search,
  ChevronRight,
  EyeOff,
  FileText,
  Share2,
  Smartphone,
  Quote,
  Download,
  Trophy,
  HelpCircle,
  BookOpen,
} from 'lucide-react';
import {
  ChatBotPreferences,
  ChatTone,
  ChatStyle,
  ChatThread,
} from '../../services/aiAdminChatClient';
import { SocialVisualTheme, STAR_VISUAL_CATEGORIES } from '../../types/socialVisuals';
import { useKatikaAiChat } from '../../context/KatikaAiChatContext';
import { KatikaChatMessageRenderer } from '../KatikaChatMessageRenderer';
import { KatikaSocialStudioModal } from '../modals/KatikaSocialStudioModal';
import { NjamboCopilotInstallModal } from '../pwa/NjamboCopilotInstallModal';
import { KatikaCopilotSettingsModal } from '../copilot/KatikaCopilotSettingsModal';
import { KatikaAdminNotesPanel } from '../modals/KatikaAdminNotesPanel';
import { useNjamboCopilotInstall } from '../../hooks/useNjamboCopilotInstall';
import { KATIKA_NAVIGATE_EVENT, KatikaNavigationEventDetail } from '../../utils/katikaNavigation';

const QUICK_SUGGESTIONS = [
  "📱 Génère un visuel 'Chiffre de la semaine' avec nos statistiques réelles pour les réseaux.",
  "💡 Rédige une astuce de jeu stratégique sur le Double Kora prête à publier.",
  "🎙️ Crée un visuel de témoignage d'un joueur passionné de Njambo Kora.",
  "🇨🇲 Compose un visuel 'Culture Njambo' sur l'ambiance des soirées de cartes au Cameroun.",
  "📊 Analyse la santé globale du jeu et le taux d'abandon actuel.",
  "🔮 Que se passerait-il si je passais le timer de tour de 15s à 10s ?",
];

export const KatikaAiAssistantTab: React.FC = () => {
  const {
    threads,
    activeThread,
    activeThreadId,
    createThread,
    selectThread,
    renameThread,
    togglePinThread,
    deleteThread,
    messages,
    isLoading,
    errorMessage,
    metricsSnapshot,
    loadingMetrics,
    refreshLiveMetrics,
    prefs,
    updatePreferences,
    sendMessage,
    sendLocalReport,
    clearHistory,
    markAlertAsRead,
    dismissCurrentAlert,
    anomalies,
    downloadThreadReport,
  } = useKatikaAiChat();

  const {
    deferredPrompt: copilotDeferredPrompt,
    showModal: showCopilotInstallModal,
    setShowModal: setShowCopilotInstallModal,
    triggerInstall: triggerCopilotInstall,
    isInstalled: isCopilotInstalled,
  } = useNjamboCopilotInstall();

  const [inputValue, setInputValue] = useState('');
  const [showCopilotSettings, setShowCopilotSettings] = useState(false);
  const [showMetricsPreview, setShowMetricsPreview] = useState(false);
  const [showWhatIf, setShowWhatIf] = useState(false);
  const [showAdminNotes, setShowAdminNotes] = useState(false);
  const [showSocialStudio, setShowSocialStudio] = useState(false);
  const [socialStudioInitialTheme, setSocialStudioInitialTheme] = useState<SocialVisualTheme>('TACTICAL_PUZZLE');

  const handleOpenStudioWithTheme = (theme: SocialVisualTheme) => {
    setSocialStudioInitialTheme(theme);
    setShowSocialStudio(true);
  };

  // Multi-thread drawer state
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [threadSearch, setThreadSearch] = useState('');
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  // What-If Simulator state
  const [hypoTimer, setHypoTimer] = useState<number>(12);
  const [hypoKoraMult, setHypoKoraMult] = useState<number>(3);
  const [hypoDoubleKoraMult, setHypoDoubleKoraMult] = useState<number>(5);
  const [hypoMinBet, setHypoMinBet] = useState<number>(200);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Metrics connection state
  const [includeMetrics, setIncludeMetrics] = useState<boolean>(true);

  // Multimodal image state
  const [selectedImage, setSelectedImage] = useState<{
    dataUrl: string;
    mimeType: string;
    name: string;
    sizeBytes: number;
  } | null>(null);

  const [dragActive, setDragActive] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Mark alerts as consulted upon entering the dedicated tab
  useEffect(() => {
    markAlertAsRead();
  }, [markAlertAsRead]);

  // Contextual initialPrompt handling from other tabs
  useEffect(() => {
    const handleNav = (e: Event) => {
      const customEvent = e as CustomEvent<KatikaNavigationEventDetail>;
      if (customEvent.detail?.tab === 'AI_ASSISTANT' && customEvent.detail.initialPrompt) {
        setInputValue(customEvent.detail.initialPrompt);
        setTimeout(() => {
          textareaRef.current?.focus();
        }, 100);
      }
    };
    window.addEventListener(KATIKA_NAVIGATE_EVENT, handleNav);
    return () => window.removeEventListener(KATIKA_NAVIGATE_EVENT, handleNav);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  useEffect(() => {
    if (editingThreadId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [editingThreadId]);

  const handleUpdatePreferences = (newPrefs: Partial<ChatBotPreferences>) => {
    updatePreferences(newPrefs);
  };

  const handleClearCurrentThread = () => {
    if (window.confirm('Voulez-vous effacer l’historique de cette discussion ?')) {
      clearHistory();
      setLocalError(null);
    }
  };

  const handleStartRename = (t: ChatThread) => {
    setEditingThreadId(t.id);
    setEditingTitle(t.title);
  };

  const handleSaveRename = (id: string) => {
    if (editingTitle.trim()) {
      renameThread(id, editingTitle.trim());
    }
    setEditingThreadId(null);
  };

  const handleFileChange = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setLocalError('Seuls les fichiers image (PNG, JPG, WEBP) sont acceptés.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setLocalError("L'image ne doit pas dépasser 8 Mo.");
      return;
    }

    setLocalError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setSelectedImage({
        dataUrl,
        mimeType: file.type,
        name: file.name,
        sizeBytes: file.size,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend !== undefined ? textToSend : inputValue).trim();
    if ((!text && !selectedImage) || isLoading) return;

    setLocalError(null);
    const img = selectedImage || undefined;
    setInputValue('');
    setSelectedImage(null);

    await sendMessage({
      text,
      image: img,
      includeMetrics,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleLaunchWhatIf = () => {
    const curTimer = metricsSnapshot?.activeEngineConfig?.turnTimerSeconds ?? 15;
    const curKora = metricsSnapshot?.activeEngineConfig?.koraMultiplier ?? 2;
    const curDblKora = metricsSnapshot?.activeEngineConfig?.doubleKoraMultiplier ?? 4;
    const curBet = metricsSnapshot?.activeEngineConfig?.minTableBet ?? 100;

    const simulationPrompt = `🔮 **SIMULATION HYPOTHÉTIQUE "WHAT-IF" & ANALYSE D'IMPACT** :
Que se passerait-il si j'ajustais les paramètres du jeu avec ces valeurs hypothétiques ?
- **Timer de tour** : ${hypoTimer}s (actuel : ${curTimer}s)
- **Multiplicateur Kora** : x${hypoKoraMult} (actuel : x${curKora})
- **Multiplicateur Double Kora** : x${hypoDoubleKoraMult} (actuel : x${curDblKora})
- **Mise minimale** : ${hypoMinBet} jetons (actuelle : ${curBet} jetons)

Consignes de restitution :
1. Génère impérativement en ouverture un **TABLEAU COMPARATIF SYNTHÉTIQUE** Markdown :
| Paramètre | Actuel (Baseline) | Scénario Testé | Impact Économique Estimé | Impact Frustration & Rythme |
2. Développe ensuite tes 4 axes d'analyse approfondie (Fluidité des 5 tours, Économie des jetons, Frustration/Rage-quit, Protocole de test prudentiel).
3. Conclus par 3 recommandations clés et le bouton direct vers les réglages : [Ouvrir les Paramètres](#katika-nav:SETTINGS).`;

    setShowWhatIf(false);
    handleSendMessage(simulationPrompt);
  };

  const handleCopyContent = (id: string, text: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (e) {
      console.warn('Clipboard write error:', e);
    }
  };

  // Filter threads by search query
  const filteredThreads = threads.filter((t) =>
    t.title.toLowerCase().includes(threadSearch.toLowerCase())
  );

  const pinnedThreads = filteredThreads
    .filter((t) => t.isPinned)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const regularThreads = filteredThreads
    .filter((t) => !t.isPinned)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const anomalyCount = anomalies.length;

  return (
    <div
      id="katika-ai-assistant-view"
      onDragEnter={handleDrag}
      className="flex flex-col h-[calc(100vh-14rem)] min-h-[640px] bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl relative"
    >
      {/* Top Banner: Status, Metrics & Global Tools */}
      <div className="px-5 py-3 bg-slate-900 border-b border-slate-800/90 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-bold text-white tracking-wide">Assistant IA Katika Master</h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-3 h-3" />
                {prefs.model || 'gemini-3.6-flash'}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                <ShieldCheck className="w-3 h-3" />
                Lecture Seule Stricte
              </span>

              {/* Dynamic Metrics Status Pill */}
              <button
                type="button"
                onClick={() => setShowMetricsPreview(!showMetricsPreview)}
                title="Afficher l'instantané des métriques connectées"
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 transition cursor-pointer"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                <Database className="w-3 h-3 text-blue-400" />
                <span>
                  {metricsSnapshot
                    ? `${metricsSnapshot.summary.totalManches} manches • ${metricsSnapshot.summary.connectedPlayers} en ligne`
                    : 'Connexion aux métriques...'}
                </span>
              </button>

              {/* Anomalies badge if any */}
              {anomalyCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowMetricsPreview(true)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 transition cursor-pointer"
                >
                  <AlertTriangle className="w-3 h-3 text-rose-400" />
                  <span>{anomalyCount} anomalie{anomalyCount > 1 ? 's' : ''}</span>
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Conseiller en lecture seule connecté en direct aux métriques opérationnelles du jeu Katika
            </p>
          </div>
        </div>

        {/* Global Action buttons */}
        <div className="flex items-center gap-2">
          {/* Refresh metrics */}
          <button
            type="button"
            id="katika-ai-refresh-metrics"
            onClick={refreshLiveMetrics}
            disabled={loadingMetrics}
            title="Rafraîchir l'instantané des métriques"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800/70 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 transition cursor-pointer"
          >
            <RotateCw className={`w-3.5 h-3.5 text-blue-400 ${loadingMetrics ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Rafraîchir</span>
          </button>

          {/* Studio Visuels Réseaux button */}
          <button
            type="button"
            id="katika-ai-social-studio-btn"
            onClick={() => setShowSocialStudio(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-emerald-500/20 text-amber-300 hover:text-white border border-amber-500/40 hover:border-amber-300 transition cursor-pointer shadow-sm"
            title="Créer et télécharger des visuels HD pour les réseaux sociaux (WhatsApp, Instagram, etc.)"
          >
            <Share2 className="w-3.5 h-3.5 text-amber-400" />
            <span>Studio Réseaux</span>
          </button>

          {/* Carnet de Bord & Roadmap button */}
          <button
            type="button"
            id="katika-ai-admin-notes-btn"
            onClick={() => setShowAdminNotes(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-amber-600/20 text-amber-300 hover:text-white border border-amber-500/40 hover:border-amber-300 transition cursor-pointer shadow-sm"
            title="Ouvrir le Carnet de Bord : Bugs, retours testeurs et roadmap de développement"
          >
            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
            <span>Carnet</span>
          </button>

          {/* Télécharger / Installer Njambo Copilote Button */}
          <button
            type="button"
            id="katika-ai-install-copilot-btn"
            onClick={triggerCopilotInstall}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition cursor-pointer shadow-sm active:scale-[0.98]"
            title="Télécharger et installer l'application autonome Njambo Copilote"
          >
            <Download className="w-3.5 h-3.5 text-slate-950" />
            <span>Télécharger l'App</span>
          </button>

          {/* What-If Simulation button */}
          <button
            type="button"
            id="katika-ai-whatif-toggle"
            onClick={() => setShowWhatIf(!showWhatIf)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer border ${
              showWhatIf
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                : 'bg-slate-800/60 text-slate-300 hover:text-white hover:bg-slate-800 border-slate-700/60'
            }`}
          >
            <Calculator className="w-3.5 h-3.5 text-purple-400" />
            <span>Simulateur What-If</span>
          </button>

          {/* Options Copilote & Centre de Contrôle Unifié (Prompt, Modèle Gemini, BYOK, Liens Sociaux) */}
          <button
            type="button"
            id="katika-ai-copilot-settings-btn"
            onClick={() => setShowCopilotSettings(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-amber-500/15 via-amber-500/20 to-amber-600/15 hover:from-amber-500/25 hover:to-amber-600/25 text-amber-300 hover:text-amber-200 border border-amber-500/40 hover:border-amber-400 transition cursor-pointer shadow-sm"
            title="Ouvrir le Centre de Contrôle : Style & Prompt IA, Modèle Gemini, Clé BYOK et Réseaux Sociaux"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
            <span>Réglages Copilote</span>
          </button>
        </div>
      </div>

      {/* Main Split Layout: Left Drawer (Discussions) + Right Pane (Active Chat) */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Discussions Sidebar (Gemini / DeepSeek style) */}
        <div
          className={`${
            isSidebarOpen ? 'w-64 sm:w-72' : 'w-0'
          } border-r border-slate-800/80 bg-slate-950/70 flex flex-col shrink-0 transition-all duration-200 overflow-hidden select-none`}
        >
          {/* New Discussion Button & Search */}
          <div className="p-3 border-b border-slate-800/80 space-y-2 shrink-0">
            <button
              type="button"
              id="katika-ai-new-thread-btn"
              onClick={() => createThread()}
              className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500/20 via-amber-500/15 to-amber-600/10 hover:from-amber-500/30 hover:to-amber-600/20 border border-amber-500/40 text-amber-300 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Nouvelle discussion</span>
            </button>

            {threads.length > 4 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={threadSearch}
                  onChange={(e) => setThreadSearch(e.target.value)}
                  placeholder="Rechercher une discussion..."
                  className="w-full pl-8 pr-2.5 py-1.5 bg-slate-900/90 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-amber-500/50 transition"
                />
              </div>
            )}
          </div>

          {/* Threads List (Pinned & Recent) */}
          <div className="flex-1 overflow-y-auto p-2 space-y-3 text-xs">
            {/* Pinned Threads */}
            {pinnedThreads.length > 0 && (
              <div className="space-y-1">
                <div className="px-2.5 py-1 text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Pin className="w-3 h-3 fill-amber-400" />
                  <span>Épinglées ({pinnedThreads.length})</span>
                </div>
                <div className="space-y-0.5">
                  {pinnedThreads.map((t) => (
                    <ThreadListItem
                      key={t.id}
                      thread={t}
                      isActive={t.id === activeThreadId}
                      isEditing={editingThreadId === t.id}
                      editingTitle={editingTitle}
                      setEditingTitle={setEditingTitle}
                      onSelect={() => selectThread(t.id)}
                      onStartRename={() => handleStartRename(t)}
                      onSaveRename={() => handleSaveRename(t.id)}
                      onCancelRename={() => setEditingThreadId(null)}
                      onTogglePin={() => togglePinThread(t.id)}
                      onDelete={() => {
                        if (window.confirm(`Supprimer définitivement la discussion "${t.title}" ?`)) {
                          deleteThread(t.id);
                        }
                      }}
                      canDelete={threads.length > 1}
                      renameInputRef={renameInputRef}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Regular Threads */}
            <div className="space-y-1">
              <div className="px-2.5 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                <span>Discussions ({regularThreads.length})</span>
              </div>
              {regularThreads.length === 0 && pinnedThreads.length === 0 ? (
                <div className="px-3 py-6 text-center text-slate-500 text-xs">
                  Aucune discussion trouvée.
                </div>
              ) : (
                <div className="space-y-0.5">
                  {regularThreads.map((t) => (
                    <ThreadListItem
                      key={t.id}
                      thread={t}
                      isActive={t.id === activeThreadId}
                      isEditing={editingThreadId === t.id}
                      editingTitle={editingTitle}
                      setEditingTitle={setEditingTitle}
                      onSelect={() => selectThread(t.id)}
                      onStartRename={() => handleStartRename(t)}
                      onSaveRename={() => handleSaveRename(t.id)}
                      onCancelRename={() => setEditingThreadId(null)}
                      onTogglePin={() => togglePinThread(t.id)}
                      onDelete={() => {
                        if (window.confirm(`Supprimer définitivement la discussion "${t.title}" ?`)) {
                          deleteThread(t.id);
                        }
                      }}
                      canDelete={threads.length > 1}
                      renameInputRef={renameInputRef}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Active Discussion Area */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-slate-900/40 relative">
          {/* Active Discussion Subheader */}
          <div className="px-4 py-2 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Sidebar toggle button */}
              <button
                type="button"
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer shrink-0"
                title={isSidebarOpen ? 'Masquer la liste des discussions' : 'Afficher la liste des discussions'}
              >
                {isSidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
              </button>

              {/* Active Thread Title & Quick Rename */}
              {editingThreadId === activeThread?.id ? (
                <div className="flex items-center gap-1.5">
                  <input
                    ref={renameInputRef}
                    type="text"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveRename(activeThread.id);
                      if (e.key === 'Escape') setEditingThreadId(null);
                    }}
                    onBlur={() => handleSaveRename(activeThread.id)}
                    className="px-2 py-0.5 rounded bg-slate-900 border border-amber-500/60 text-xs text-white font-medium outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveRename(activeThread.id)}
                    className="p-1 text-emerald-400 hover:bg-slate-800 rounded"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 truncate">
                  <span className="text-xs font-bold text-slate-200 truncate">
                    {activeThread?.title || 'Discussion en cours'}
                  </span>
                  <button
                    type="button"
                    onClick={() => activeThread && handleStartRename(activeThread)}
                    className="p-1 text-slate-400 hover:text-amber-300 transition cursor-pointer"
                    title="Renommer la discussion"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  {activeThread?.isPinned && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 font-semibold px-1.5 py-0.2 rounded bg-amber-500/10 border border-amber-500/30">
                      <Pin className="w-2.5 h-2.5 fill-amber-400" />
                      Épinglée
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Clear thread history */}
            <div className="flex items-center gap-1 shrink-0">
              {activeThread && (
                <button
                  type="button"
                  onClick={() => togglePinThread(activeThread.id)}
                  className={`p-1.5 rounded-lg border transition cursor-pointer text-xs flex items-center gap-1 ${
                    activeThread.isPinned
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                  title={activeThread.isPinned ? 'Désépingler cette discussion' : 'Épingler cette discussion'}
                >
                  <Pin className={`w-3.5 h-3.5 ${activeThread.isPinned ? 'fill-amber-400' : ''}`} />
                  <span className="hidden md:inline">
                    {activeThread.isPinned ? 'Épinglée' : 'Épingler'}
                  </span>
                </button>
              )}

              {messages.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => downloadThreadReport()}
                    title="Télécharger le rapport d'audit au format Markdown (.md)"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-amber-500/10 border border-slate-800 hover:border-amber-500/30 transition cursor-pointer text-xs flex items-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5 text-amber-400" />
                    <span className="hidden sm:inline text-[11px] font-medium">Exporter Rapport (.md)</span>
                  </button>

                  <button
                    type="button"
                    id="katika-ai-clear-history"
                    onClick={handleClearCurrentThread}
                    title="Effacer les messages de cette discussion"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Quick Analytical Actions Bar */}
          <div className="px-5 py-2 bg-slate-950/70 border-b border-slate-800/80 flex items-center gap-2 overflow-x-auto text-[11px] shrink-0 no-scrollbar">
            <span className="text-slate-500 font-medium whitespace-nowrap flex items-center gap-1">
              <Lightbulb className="w-3 h-3 text-amber-400" />
              Actions 1-Clic :
            </span>
            <button
              type="button"
              onClick={() => handleSendMessage("🩺 Fais un bilan de santé opérationnel complet en t'appuyant sur les métriques et anomalies réelles.")}
              className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-emerald-300 border border-slate-700/60 transition cursor-pointer whitespace-nowrap flex items-center gap-1"
            >
              <Activity className="w-3 h-3 text-emerald-400" />
              <span>Bilan Santé</span>
            </button>
            <button
              type="button"
              onClick={() => handleSendMessage("⚠️ Recherche et liste toutes les anomalies sur les parties (abandons anormaux, donnes suspectes, asymétries de victoires).")}
              className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-amber-300 border border-slate-700/60 transition cursor-pointer whitespace-nowrap flex items-center gap-1"
            >
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              <span>Audit Anomalies</span>
            </button>
            <button
              type="button"
              onClick={() => handleSendMessage("📊 Analyse les formats de tables les plus joués, les ratios de donnes normales vs Kora/Double Kora, et la vitesse moyenne des tours.")}
              className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-blue-300 border border-slate-700/60 transition cursor-pointer whitespace-nowrap flex items-center gap-1"
            >
              <BarChart3 className="w-3 h-3 text-blue-400" />
              <span>Format Dominant</span>
            </button>
            <button
              type="button"
              onClick={() => handleSendMessage("👥 Analyse le comportement des joueurs récents (abandons fréquents, solde de jetons, ratios de victoires).")}
              className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-purple-300 border border-slate-700/60 transition cursor-pointer whitespace-nowrap flex items-center gap-1"
            >
              <User className="w-3 h-3 text-purple-400" />
              <span>Comportement Joueurs</span>
            </button>
            <button
              type="button"
              onClick={() => handleSendMessage("🏆 Génère une affiche de tournoi pour ce samedi 21h00 avec cagnotte de 50 000 jetons, palette ébène et or, et message WhatsApp prêt à diffuser.")}
              className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition cursor-pointer whitespace-nowrap flex items-center gap-1 font-semibold"
              title="Générer une affiche officielle de Tournoi avec cagnotte"
            >
              <Trophy className="w-3 h-3 text-amber-400" />
              <span>Affiche Tournoi</span>
            </button>
            <button
              type="button"
              onClick={() => handleSendMessage("🧩 Crée un casse-tête tactique du jour au 4e tour avec choix de cartes A/B/C pour engager la communauté sur les réseaux.")}
              className="px-2.5 py-1 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 border border-blue-500/30 transition cursor-pointer whitespace-nowrap flex items-center gap-1"
              title="Générer un casse-tête tactique avec cartes et dilemme"
            >
              <HelpCircle className="w-3 h-3 text-blue-400" />
              <span>Casse-tête Tactique</span>
            </button>
            <button
              type="button"
              onClick={() => handleSendMessage("😂 Crée un visuel humour/mème sur le joueur qui prétend n'avoir aucun atout mais sort le Double Kora au 5e tour.")}
              className="px-2.5 py-1 rounded-lg bg-orange-500/15 hover:bg-orange-500/25 text-orange-300 border border-orange-500/30 transition cursor-pointer whitespace-nowrap flex items-center gap-1"
              title="Générer un mème / punchline Njambo pour les réseaux"
            >
              <Sparkles className="w-3 h-3 text-orange-400" />
              <span>Mème Njambo</span>
            </button>
            <button
              type="button"
              onClick={() => handleSendMessage("📱 Génère un visuel 'Chiffre de la semaine' basé sur les statistiques réelles des parties et des Kora.")}
              className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 transition cursor-pointer whitespace-nowrap flex items-center gap-1"
              title="Générer une carte visuelle HD Chiffre de la semaine"
            >
              <BarChart3 className="w-3 h-3 text-emerald-400" />
              <span>Chiffre Semaine</span>
            </button>
            <button
              type="button"
              onClick={() => setShowSocialStudio(true)}
              className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500/20 to-purple-500/20 hover:from-amber-500/30 hover:to-purple-500/30 text-amber-200 border border-amber-500/40 transition cursor-pointer whitespace-nowrap flex items-center gap-1"
              title="Ouvrir le studio complet avec les 12 thèmes et formats marketing"
            >
              <Share2 className="w-3 h-3 text-amber-400" />
              <span>Studio 12 Thèmes...</span>
            </button>
          </div>

          {/* Collapsible What-If Simulator Panel */}
          {showWhatIf && (
            <div
              id="katika-ai-whatif-panel"
              className="p-4 bg-purple-950/20 border-b border-purple-500/30 text-xs shrink-0 space-y-3 animate-in fade-in duration-150"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-purple-300">
                  <Calculator className="w-4 h-4 text-purple-400" />
                  <span>Simulateur Prédictif "What-If" (Scénarios de Paramétrage Moteur)</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowWhatIf(false)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Turn Timer */}
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                  <div className="flex justify-between items-center text-slate-300 font-semibold">
                    <span>Timer de tour :</span>
                    <span className="text-purple-400 font-mono font-bold">{hypoTimer}s</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {[8, 10, 12, 15, 20].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setHypoTimer(t)}
                        className={`flex-1 py-1 rounded text-[10px] font-mono border transition cursor-pointer ${
                          hypoTimer === t
                            ? 'bg-purple-600 text-white border-purple-500'
                            : 'bg-slate-800 text-slate-400 hover:text-white border-slate-700'
                        }`}
                      >
                        {t}s
                      </button>
                    ))}
                  </div>
                  <div className="text-[9px] text-slate-500">
                    Actuel : {metricsSnapshot?.activeEngineConfig?.turnTimerSeconds ?? 15}s
                  </div>
                </div>

                {/* Kora Multiplier */}
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                  <div className="flex justify-between items-center text-slate-300 font-semibold">
                    <span>Kora Simple :</span>
                    <span className="text-purple-400 font-mono font-bold">x{hypoKoraMult}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {[2, 3, 4].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setHypoKoraMult(m)}
                        className={`flex-1 py-1 rounded text-[10px] font-mono border transition cursor-pointer ${
                          hypoKoraMult === m
                            ? 'bg-purple-600 text-white border-purple-500'
                            : 'bg-slate-800 text-slate-400 hover:text-white border-slate-700'
                        }`}
                      >
                        x{m}
                      </button>
                    ))}
                  </div>
                  <div className="text-[9px] text-slate-500">
                    Actuel : x{metricsSnapshot?.activeEngineConfig?.koraMultiplier ?? 2}
                  </div>
                </div>

                {/* Double Kora Multiplier */}
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                  <div className="flex justify-between items-center text-slate-300 font-semibold">
                    <span>Double Kora :</span>
                    <span className="text-purple-400 font-mono font-bold">x{hypoDoubleKoraMult}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {[3, 4, 5, 6].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setHypoDoubleKoraMult(m)}
                        className={`flex-1 py-1 rounded text-[10px] font-mono border transition cursor-pointer ${
                          hypoDoubleKoraMult === m
                            ? 'bg-purple-600 text-white border-purple-500'
                            : 'bg-slate-800 text-slate-400 hover:text-white border-slate-700'
                        }`}
                      >
                        x{m}
                      </button>
                    ))}
                  </div>
                  <div className="text-[9px] text-slate-500">
                    Actuel : x{metricsSnapshot?.activeEngineConfig?.doubleKoraMultiplier ?? 4}
                  </div>
                </div>

                {/* Min Table Bet */}
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                  <div className="flex justify-between items-center text-slate-300 font-semibold">
                    <span>Mise de base :</span>
                    <span className="text-purple-400 font-mono font-bold">{hypoMinBet}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {[50, 100, 200, 500].map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setHypoMinBet(b)}
                        className={`flex-1 py-1 rounded text-[10px] font-mono border transition cursor-pointer ${
                          hypoMinBet === b
                            ? 'bg-purple-600 text-white border-purple-500'
                            : 'bg-slate-800 text-slate-400 hover:text-white border-slate-700'
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                  <div className="text-[9px] text-slate-500">
                    Actuel : {metricsSnapshot?.activeEngineConfig?.minTableBet ?? 100}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="text-[10px] text-slate-500 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                  <span>Simulation théorique uniquement. Aucun paramètre du jeu n'est modifié.</span>
                </div>

                <button
                  type="button"
                  onClick={handleLaunchWhatIf}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-amber-600 hover:from-purple-500 hover:to-amber-500 text-white font-bold text-xs shadow-lg transition cursor-pointer flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Lancer la Simulation Prédictive IA</span>
                </button>
              </div>
            </div>
          )}

          {/* Collapsible Metrics Snapshot Preview */}
          {showMetricsPreview && metricsSnapshot && (
            <div
              id="katika-ai-metrics-preview-panel"
              className="p-4 bg-slate-950/95 border-b border-blue-500/20 text-xs shrink-0 max-h-56 overflow-y-auto space-y-3 animate-in fade-in duration-150"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-slate-200">
                  <Activity className="w-4 h-4 text-blue-400" />
                  <span>Instantané des Métriques en Direct (Lecture Seule)</span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {new Date(metricsSnapshot.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMetricsPreview(false)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-400">Joueurs Connectés</div>
                  <div className="text-sm font-bold text-emerald-400 font-mono">
                    {metricsSnapshot.summary.connectedPlayers}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-400">Tables Actives</div>
                  <div className="text-sm font-bold text-blue-400 font-mono">
                    {metricsSnapshot.liveRooms.count}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-400">Total Manches</div>
                  <div className="text-sm font-bold text-amber-400 font-mono">
                    {metricsSnapshot.summary.totalManches}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-400">Taux de Complétion</div>
                  <div className="text-sm font-bold text-indigo-400 font-mono">
                    {metricsSnapshot.summary.completionRatePct}%
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-400">Ratio Kora / Double</div>
                  <div className="text-sm font-bold text-purple-400 font-mono">
                    {metricsSnapshot.kpis?.allTime?.koraCount ?? 0} / {metricsSnapshot.kpis?.allTime?.doubleKoraCount ?? 0}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-400">Rage-Quits / Forfaits</div>
                  <div className={`text-sm font-bold font-mono ${(metricsSnapshot.kpis?.allTime?.manchesAbandonedCount ?? 0) > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                    {metricsSnapshot.kpis?.allTime?.manchesAbandonedCount ?? 0}
                  </div>
                </div>
              </div>

              {/* Detected Anomalies List */}
              {anomalies.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-rose-300">
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                      Anomalies Détectées en Temps Réel :
                    </span>
                    <button
                      type="button"
                      onClick={dismissCurrentAlert}
                      className="text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                    >
                      <EyeOff className="w-3 h-3" />
                      Ignorer pour cette session
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {anomalies.map((anom) => (
                      <div
                        key={anom.title + '_' + anom.metricKey}
                        className="p-2 rounded-lg bg-rose-950/40 border border-rose-800/60 text-xs flex items-start gap-2"
                      >
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-semibold text-rose-200">{anom.title}</div>
                          <div className="text-[11px] text-slate-400 leading-snug">{anom.description}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Main Conversation Stream */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto py-6 space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-700/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
                  <Sparkles className="w-7 h-7" />
                </div>

                <div className="space-y-1.5">
                  <h3 className="text-base font-bold text-white">
                    {activeThread?.title || 'Nouvelle discussion'}
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Discussion dédiée connectée en <strong>lecture seule</strong> aux métriques opérationnelles du jeu et à <strong>Gemini 3.8 Flash</strong>.
                  </p>
                </div>

                {/* Read-Only Safety Reminder Pill */}
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-left w-full space-y-1">
                  <div className="flex items-center gap-1.5 text-amber-400 text-xs font-semibold">
                    <ShieldCheck className="w-4 h-4" />
                    Garantie de sécurité (Règle Absolue)
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Le chatbot ne dispose d'aucun accès d'écriture, ni sur le code source, ni sur la base de données, ni sur les paramètres d'administration. Il conseille, alerte et analyse exclusivement.
                  </p>
                </div>

                {/* Quick Prompts / Zero-AI Fast Actions */}
                <div className="w-full space-y-2 pt-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium text-left">
                    <span>Actions rapides & Visuels prêts à l'emploi :</span>
                    <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      Instantané • 0 requête IA
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
                    <button
                      type="button"
                      onClick={() => handleOpenStudioWithTheme('STAT_OF_THE_WEEK')}
                      className="p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-900 border border-slate-800 hover:border-amber-500/40 text-xs text-slate-300 hover:text-white transition cursor-pointer leading-snug flex items-start gap-2.5 group"
                    >
                      <span className="text-base shrink-0">📱</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-200 group-hover:text-amber-300 flex items-center justify-between">
                          <span>Chiffre de la semaine</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 font-medium">Studio HD</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">Génère un visuel statistique à partir des métriques réelles</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenStudioWithTheme('TACTICAL_PUZZLE')}
                      className="p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-900 border border-slate-800 hover:border-amber-500/40 text-xs text-slate-300 hover:text-white transition cursor-pointer leading-snug flex items-start gap-2.5 group"
                    >
                      <span className="text-base shrink-0">💡</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-200 group-hover:text-amber-300 flex items-center justify-between">
                          <span>Astuce Double Kora</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 font-medium">Studio HD</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">Créer un visuel d'astuce tactique prêt à publier</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenStudioWithTheme('TESTIMONIAL')}
                      className="p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-900 border border-slate-800 hover:border-amber-500/40 text-xs text-slate-300 hover:text-white transition cursor-pointer leading-snug flex items-start gap-2.5 group"
                    >
                      <span className="text-base shrink-0">🎙️</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-200 group-hover:text-amber-300 flex items-center justify-between">
                          <span>Témoignage Joueur</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 font-medium">Studio HD</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">Visuel citation authentique pour la communauté</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenStudioWithTheme('CULTURE_NJAMBO')}
                      className="p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-900 border border-slate-800 hover:border-amber-500/40 text-xs text-slate-300 hover:text-white transition cursor-pointer leading-snug flex items-start gap-2.5 group"
                    >
                      <span className="text-base shrink-0">🇨🇲</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-200 group-hover:text-amber-300 flex items-center justify-between">
                          <span>Culture Njambo</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 font-medium">Studio HD</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">Visuel d'ambiance et convivialité des soirées de jeu</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => sendLocalReport('HEALTH')}
                      className="p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-900 border border-slate-800 hover:border-emerald-500/40 text-xs text-slate-300 hover:text-white transition cursor-pointer leading-snug flex items-start gap-2.5 group"
                    >
                      <span className="text-base shrink-0">🩺</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-200 group-hover:text-emerald-300 flex items-center justify-between">
                          <span>Bilan de santé global</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-300 font-medium">Rapport Local</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">Analyse instantanée des KPIs, taux d'abandon et alertes</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowWhatIf(true)}
                      className="p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-900 border border-slate-800 hover:border-purple-500/40 text-xs text-slate-300 hover:text-white transition cursor-pointer leading-snug flex items-start gap-2.5 group"
                    >
                      <span className="text-base shrink-0">🔮</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-200 group-hover:text-purple-300 flex items-center justify-between">
                          <span>Simulateur What-If</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/15 text-purple-300 font-medium">Simulation</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">Tester l'impact d'un changement de timer ou de règles</div>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              messages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-3 ${
                      isUser ? 'flex-row-reverse' : 'flex-row'
                    }`}
                  >
                    {/* Avatar */}
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                        isUser
                          ? 'bg-amber-500 text-slate-950 font-bold text-xs'
                          : msg.isError
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : 'bg-slate-800 border border-slate-700 text-amber-400'
                      }`}
                    >
                      {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>

                    {/* Bubble */}
                    <div
                      className={`flex flex-col max-w-[85%] sm:max-w-[75%] space-y-1.5 ${
                        isUser ? 'items-end' : 'items-start'
                      }`}
                    >
                      {/* Attached Image if any */}
                      {msg.image && (
                        <div className="rounded-xl overflow-hidden border border-slate-700 bg-slate-950 max-w-sm">
                          <img
                            src={msg.image.dataUrl}
                            alt={msg.image.name || 'Capture jointe'}
                            className="w-full h-auto max-h-60 object-contain"
                          />
                          {msg.image.name && (
                            <div className="px-2.5 py-1 text-[10px] text-slate-400 border-t border-slate-800 truncate">
                              {msg.image.name}
                            </div>
                          )}
                        </div>
                      )}

                      <div
                        className={`px-4 py-3 rounded-2xl text-xs leading-relaxed shadow-sm ${
                          isUser
                            ? 'bg-amber-500 text-slate-950 font-medium rounded-tr-none'
                            : msg.isError
                            ? 'bg-rose-950/40 border border-rose-800/80 text-rose-200 rounded-tl-none'
                            : 'bg-slate-950/80 border border-slate-800 text-slate-200 rounded-tl-none'
                        }`}
                      >
                        {isUser ? (
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        ) : (
                          <KatikaChatMessageRenderer content={msg.content} />
                        )}
                      </div>

                      {/* Footer: timestamp + copy button */}
                      <div className="flex items-center gap-2 px-1 text-[10px] text-slate-500">
                        <span>
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>

                        {!isUser && !msg.isError && (
                          <button
                            type="button"
                            onClick={() => handleCopyContent(msg.id, msg.content)}
                            className="hover:text-slate-300 transition cursor-pointer flex items-center gap-1"
                            title="Copier la réponse"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span className="text-emerald-400">Copié !</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copier</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {/* AI Generation Loader */}
            {isLoading && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400 shrink-0">
                  <Bot className="w-4 h-4 animate-pulse" />
                </div>
                <div className="px-4 py-3 rounded-2xl rounded-tl-none bg-slate-950/80 border border-slate-800 text-xs text-slate-400 flex items-center gap-2.5">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  <span>Gemini 3.8 Flash analyse les métriques opérationnelles du jeu Katika...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Drag & Drop Visual Overlay */}
          {dragActive && (
            <div
              onDragLeave={() => setDragActive(false)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="absolute inset-0 bg-slate-950/85 backdrop-blur-xs border-2 border-dashed border-amber-500 rounded-2xl flex flex-col items-center justify-center gap-3 z-30 pointer-events-auto"
            >
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 animate-bounce">
                <ImageIcon className="w-8 h-8" />
              </div>
              <div className="text-center">
                <h4 className="text-sm font-bold text-white">Déposez votre capture d'écran ici</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Format image (PNG, JPG, WEBP) jusqu'à 8 Mo
                </p>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {(localError || errorMessage) && (
            <div className="px-5 py-2 bg-rose-950/80 border-t border-rose-800 text-xs text-rose-300 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{localError || errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setLocalError(null)}
                className="text-rose-400 hover:text-white p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Bottom Bar: Image Chip + Quick Visual Actions + Input */}
          <div className="p-4 bg-slate-900 border-t border-slate-800 shrink-0 space-y-2.5">
            {/* Quick Visuals Launch Bar (Contextual Bridge: Du Chat au Visuel) */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider shrink-0 flex items-center gap-1 mr-1">
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>Créer visuel :</span>
              </span>
              <button
                type="button"
                onClick={() => handleOpenStudioWithTheme('TACTICAL_PUZZLE')}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-700/50 hover:border-cyan-400 transition cursor-pointer shrink-0 active:scale-95 flex items-center gap-1"
                title="Créer un casse-tête tactique avec 3 options de cartes ou tapis de jeu"
              >
                <span>🧩 Casse-tête</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenStudioWithTheme('STAT_OF_THE_WEEK')}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-700/50 hover:border-emerald-400 transition cursor-pointer shrink-0 active:scale-95 flex items-center gap-1"
                title="Générer l'affiche statistique de la semaine avec les données réelles du serveur"
              >
                <span>📊 Stat Hebdo</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenStudioWithTheme('TESTIMONIAL')}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border border-amber-700/50 hover:border-amber-400 transition cursor-pointer shrink-0 active:scale-95 flex items-center gap-1"
                title="Créer une affiche de témoignage et parole de maître"
              >
                <span>🎙️ Témoignage</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenStudioWithTheme('TIP_OR_RULE')}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-blue-950/40 hover:bg-blue-900/60 text-blue-300 border border-blue-700/50 hover:border-blue-400 transition cursor-pointer shrink-0 active:scale-95 flex items-center gap-1"
                title="Créer un conseil stratégique ou rappel des 31 cartes"
              >
                <span>💡 Règle & Astuce</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenStudioWithTheme('MEME_OR_PUNCHLINE')}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-orange-950/40 hover:bg-orange-900/60 text-orange-300 border border-orange-700/50 hover:border-orange-400 transition cursor-pointer shrink-0 active:scale-95 flex items-center gap-1"
                title="Créer un mème ou une punchline sur l'ambiance du quartier"
              >
                <span>😂 Mème & Humour</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenStudioWithTheme('TOURNAMENT_ANNOUNCEMENT')}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-purple-950/40 hover:bg-purple-900/60 text-purple-300 border border-purple-700/50 hover:border-purple-400 transition cursor-pointer shrink-0 active:scale-95 flex items-center gap-1"
                title="Créer une annonce de tournoi du week-end"
              >
                <span>🏆 Tournoi</span>
              </button>
            </div>

            {/* Selected image preview chip */}
            {selectedImage && (
              <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-950 border border-amber-500/30 text-xs text-amber-300">
                <div className="flex items-center gap-2 truncate">
                  <ImageIcon className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="font-medium truncate">{selectedImage.name}</span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    ({Math.round(selectedImage.sizeBytes / 1024)} Ko)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedImage(null)}
                  className="p-1 text-slate-400 hover:text-white transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Input Bar */}
            <div className="flex items-end gap-2 bg-slate-950 border border-slate-800 rounded-xl p-2 focus-within:border-amber-500/50 transition shadow-inner">
              {/* Hidden File Input */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileChange(e.target.files[0]);
                  }
                  e.target.value = '';
                }}
                accept="image/*"
                className="hidden"
              />

              {/* Upload Image Button */}
              <button
                type="button"
                id="katika-ai-upload-btn"
                onClick={() => fileInputRef.current?.click()}
                title="Joindre une image ou capture d'écran (support multimodal)"
                className="p-2 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-900 transition cursor-pointer shrink-0"
              >
                <ImageIcon className="w-4 h-4" />
              </button>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                id="katika-ai-input-field"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  selectedImage
                    ? "Ajoutez une consigne pour cette image (ex: 'Que penses-tu de cette disposition ?')..."
                    : "Posez une question sur les métriques (ex: 'Quelle est la santé des parties ?') ou glissez une capture..."
                }
                rows={1}
                disabled={isLoading}
                className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 resize-none outline-none max-h-28 py-1.5 leading-relaxed"
              />

              {/* Send Button */}
              <button
                type="button"
                id="katika-ai-send-btn"
                onClick={() => handleSendMessage()}
                disabled={isLoading || (!inputValue.trim() && !selectedImage)}
                className={`p-2 rounded-lg font-bold text-xs transition cursor-pointer shrink-0 flex items-center justify-center ${
                  isLoading || (!inputValue.trim() && !selectedImage)
                    ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md'
                }`}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Footnote tips & Metrics toggle */}
            <div className="flex flex-wrap items-center justify-between text-[10px] text-slate-500 px-1 gap-2">
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-400 hover:text-slate-200 select-none">
                  <input
                    type="checkbox"
                    id="katika-ai-metrics-toggle"
                    checked={includeMetrics}
                    onChange={(e) => setIncludeMetrics(e.target.checked)}
                    className="rounded border-slate-700 text-amber-500 focus:ring-0 focus:ring-offset-0 bg-slate-950 cursor-pointer"
                  />
                  <span className="flex items-center gap-1">
                    <Database className="w-3 h-3 text-blue-400" />
                    <span>Transmettre les métriques en direct</span>
                  </span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer text-slate-400 hover:text-slate-200 select-none">
                  <input
                    type="checkbox"
                    id="katika-ai-stream-toggle"
                    checked={prefs.disableStreaming || false}
                    onChange={(e) => handleUpdatePreferences({ disableStreaming: e.target.checked })}
                    className="rounded border-slate-700 text-amber-500 focus:ring-0 focus:ring-offset-0 bg-slate-950 cursor-pointer"
                  />
                  <span className="flex items-center gap-1">
                    <WifiOff className="w-3 h-3 text-amber-500" />
                    <span>Mode anti-coupure (Désactive le streaming, plus robuste en 4G)</span>
                  </span>
                </label>
              </div>

              <span className="font-mono text-slate-600">Lecture Seule Stricte • Katika AI Assistant</span>
            </div>
          </div>
        </div>
      </div>

      {/* Social Media Visuals Studio Modal */}
      <KatikaSocialStudioModal
        isOpen={showSocialStudio}
        onClose={() => setShowSocialStudio(false)}
        onSendToAi={(prompt) => handleSendMessage(prompt)}
        metricsSnapshot={metricsSnapshot}
        initialTheme={socialStudioInitialTheme}
      />

      {/* Njambo Copilote PWA Install Modal */}
      <NjamboCopilotInstallModal
        isOpen={showCopilotInstallModal}
        onClose={() => setShowCopilotInstallModal(false)}
        deferredPrompt={copilotDeferredPrompt}
      />

      {/* Copilote Options Modal (Gemini API BYOK, Social Links, Model, Tone & Style) */}
      <KatikaCopilotSettingsModal
        isOpen={showCopilotSettings}
        onClose={() => setShowCopilotSettings(false)}
        currentTone={prefs.tone}
        currentStyle={prefs.style}
        onUpdateToneStyle={(tone, style, model) => {
          updatePreferences({ tone, style, model });
        }}
      />

      {/* Carnet de Bord & Roadmap Modal */}
      <KatikaAdminNotesPanel
        isOpen={showAdminNotes}
        onClose={() => setShowAdminNotes(false)}
        onInsertInChat={(prompt) => handleSendMessage(prompt)}
      />
    </div>
  );
};

// Sub-component for each thread row in sidebar
interface ThreadListItemProps {
  thread: ChatThread;
  isActive: boolean;
  isEditing: boolean;
  editingTitle: string;
  setEditingTitle: (v: string) => void;
  onSelect: () => void;
  onStartRename: () => void;
  onSaveRename: () => void;
  onCancelRename: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
  canDelete: boolean;
  renameInputRef: React.RefObject<HTMLInputElement>;
}

const ThreadListItem: React.FC<ThreadListItemProps> = ({
  thread,
  isActive,
  isEditing,
  editingTitle,
  setEditingTitle,
  onSelect,
  onStartRename,
  onSaveRename,
  onCancelRename,
  onTogglePin,
  onDelete,
  canDelete,
  renameInputRef,
}) => {
  if (isEditing) {
    return (
      <div className="p-1.5 rounded-xl bg-slate-900 border border-amber-500/50 flex items-center gap-1.5">
        <input
          ref={renameInputRef}
          type="text"
          value={editingTitle}
          onChange={(e) => setEditingTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSaveRename();
            if (e.key === 'Escape') onCancelRename();
          }}
          className="flex-1 bg-transparent text-xs text-white outline-none px-1"
        />
        <button
          type="button"
          onClick={onSaveRename}
          className="p-1 text-emerald-400 hover:bg-slate-800 rounded cursor-pointer"
          title="Valider"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onCancelRename}
          className="p-1 text-slate-400 hover:bg-slate-800 rounded cursor-pointer"
          title="Annuler"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={onSelect}
      className={`group relative flex items-center justify-between p-2 rounded-xl transition cursor-pointer select-none ${
        isActive
          ? 'bg-amber-500/15 border border-amber-500/30 text-amber-200'
          : 'text-slate-300 hover:bg-slate-800/60 hover:text-white border border-transparent'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1 mr-1">
        {thread.isPinned ? (
          <Pin className="w-3.5 h-3.5 text-amber-400 shrink-0 fill-amber-400" />
        ) : (
          <MessageSquare className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-400 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-xs leading-snug">
            {thread.title}
          </div>
          <div className="text-[10px] text-slate-500 flex items-center gap-1 font-mono mt-0.5">
            <span>{thread.messages.length} msg{thread.messages.length > 1 ? 's' : ''}</span>
            <span>•</span>
            <span>{new Date(thread.updatedAt).toLocaleDateString([], { month: 'numeric', day: 'numeric' })}</span>
          </div>
        </div>
      </div>

      {/* Action buttons (Pin, Rename, Delete) visible on hover or if active */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
          className={`p-1 rounded hover:bg-slate-700/80 transition cursor-pointer ${
            thread.isPinned ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
          }`}
          title={thread.isPinned ? 'Désépingler' : 'Épingler'}
        >
          <Pin className={`w-3 h-3 ${thread.isPinned ? 'fill-amber-400' : ''}`} />
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onStartRename();
          }}
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700/80 transition cursor-pointer"
          title="Renommer"
        >
          <Edit2 className="w-3 h-3" />
        </button>

        {canDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
            title="Supprimer la discussion"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
};
