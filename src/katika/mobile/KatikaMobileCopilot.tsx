import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  RotateCw,
  Share2,
  Image as ImageIcon,
  X,
  Plus,
  MessageSquare,
  LogOut,
  AlertTriangle,
  Flame,
  Layers,
  BarChart3,
  Shield,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  ArrowLeft,
  Loader2,
  Trash2,
  CheckCircle2,
  Mic,
  MicOff,
  Download,
  Smartphone,
  Sliders,
  BookOpen,
} from 'lucide-react';
import { useKatikaAiChat } from '../context/KatikaAiChatContext';
import { useKatikaAuth, KATIKA_AUTHORIZED_EMAIL } from '../context/KatikaAuthContext';
import { KatikaChatMessageRenderer } from '../components/KatikaChatMessageRenderer';
import { KatikaMobileSocialStudioModal } from './KatikaMobileSocialStudioModal';
import { NjamboCopilotInstallModal } from '../components/pwa/NjamboCopilotInstallModal';
import { KatikaCopilotSettingsModal } from '../components/copilot/KatikaCopilotSettingsModal';
import { KatikaAdminNotesPanel } from '../components/modals/KatikaAdminNotesPanel';
import { setPwaIdentity } from '../utils/pwaManifestSwitcher';

const MOBILE_QUICK_PROMPTS = [
  {
    label: '⚡ Salons en direct',
    prompt: 'Fais-moi un état des lieux instantané des salons actifs, joueurs connectés et parties en cours.',
  },
  {
    label: '💰 Bilan jetons & trésorerie',
    prompt: 'Quel est le bilan des jetons en circulation, la redistribution des pots et la santé de l’économie ?',
  },
  {
    label: '🛡️ Joueurs suspects & alertes',
    prompt: 'Y a-t-il des anomalies détectées, des taux d’abandon suspects ou des joueurs à surveiller ?',
  },
  {
    label: '🃏 Statistiques Kora',
    prompt: 'Donne-moi les métriques des Kora et Double Kora réussis ainsi que le taux de réussite par position.',
  },
  {
    label: '🎨 Créer un visuel réseaux',
    prompt: 'Génère un visuel officiel prêt à publier pour les réseaux sociaux avec les statistiques actuelles du jeu.',
  },
  {
    label: '📈 Audit global & rétention',
    prompt: 'Analyse la santé globale de la plateforme, le pic de joueurs et les opportunités d’optimisation des règles.',
  },
];

export const KatikaMobileCopilot: React.FC = () => {
  const { logout } = useKatikaAuth();
  const {
    threads,
    activeThread,
    activeThreadId,
    createThread,
    selectThread,
    deleteThread,
    messages,
    isLoading,
    errorMessage,
    metricsSnapshot,
    loadingMetrics,
    refreshLiveMetrics,
    sendMessage,
    clearHistory,
    anomalies,
    markAlertAsRead,
    prefs,
    updatePreferences,
  } = useKatikaAiChat();

  const [inputVal, setInputVal] = useState('');
  const [showSocialModal, setShowSocialModal] = useState(false);
  const [showAdminNotes, setShowAdminNotes] = useState(false);
  const [showCopilotSettings, setShowCopilotSettings] = useState(false);
  const [showThreadDrawer, setShowThreadDrawer] = useState(false);
  const [showMenuDropdown, setShowMenuDropdown] = useState(false);
  const [isAlertsExpanded, setIsAlertsExpanded] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null);
  const [showPwaInstallModal, setShowPwaInstallModal] = useState(false);
  const [isCopilotPwaInstalled, setIsCopilotPwaInstalled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return (
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true
      );
    }
    return false;
  });

  // Attached image for multimodal Gemini analysis
  const [attachedImage, setAttachedImage] = useState<{
    dataUrl: string;
    mimeType: string;
    name: string;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const speechRecognitionRef = useRef<any>(null);

  // Sync PWA Identity on mount
  useEffect(() => {
    setPwaIdentity('COPILOT');
  }, []);

  // Capture PWA Install prompt for Njambo Copilote
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };
    const handleAppInstalled = () => {
      setIsCopilotPwaInstalled(true);
      setDeferredInstallPrompt(null);
      setShowPwaInstallModal(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallCopilotApp = async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsCopilotPwaInstalled(true);
      }
      setDeferredInstallPrompt(null);
    } else {
      setShowPwaInstallModal(true);
    }
  };

  // Auto-scroll to bottom on new messages or loading
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Mark alerts read on mount
  useEffect(() => {
    markAlertAsRead();
  }, [markAlertAsRead]);

  // Point 3: visualViewport listener for iOS & Android keyboard detection
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const handleViewportResize = () => {
      if (window.visualViewport) {
        setViewportHeight(window.visualViewport.height);
        scrollToBottom();
      }
    };

    window.visualViewport.addEventListener('resize', handleViewportResize);
    window.visualViewport.addEventListener('scroll', handleViewportResize);

    return () => {
      window.visualViewport?.removeEventListener('resize', handleViewportResize);
      window.visualViewport?.removeEventListener('scroll', handleViewportResize);
    };
  }, []);

  // Point 2: Native Speech-to-Text setup
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognitionAPI) {
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'fr-FR';

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript) {
          setInputVal((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      speechRecognitionRef.current = recognition;
    }
  }, []);

  const toggleVoiceRecording = () => {
    if (!speechRecognitionRef.current) {
      alert('La reconnaissance vocale n’est pas disponible sur ce navigateur. Vous pouvez utiliser la dictée vocale de votre clavier.');
      return;
    }

    if (isListening) {
      speechRecognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        speechRecognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.warn('Speech recognition start error:', err);
      }
    }
  };

  // Auto-expand textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputVal(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  const handleSend = async (customText?: string) => {
    const textToSend = (customText !== undefined ? customText : inputVal).trim();
    if (!textToSend && !attachedImage) return;

    if (!customText) {
      setInputVal('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }

    const imgToSend = attachedImage ? { ...attachedImage } : undefined;
    setAttachedImage(null);

    await sendMessage({
      text: textToSend,
      image: imgToSend,
      includeMetrics: true,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Multimodal file upload
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Veuillez sélectionner un fichier image valide (PNG, JPEG, WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAttachedImage({
        dataUrl: reader.result as string,
        mimeType: file.type,
        name: file.name,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleQuickPromptClick = (prompt: string) => {
    handleSend(prompt);
  };

  // KPIs derived
  const activeRooms = metricsSnapshot?.summary?.activeRooms ?? 0;
  const connectedPlayers = metricsSnapshot?.summary?.connectedPlayers ?? 0;
  const totalManches = metricsSnapshot?.summary?.totalManches ?? 0;
  const hasAnomalies = (anomalies && anomalies.length > 0);

  return (
    <div
      style={viewportHeight ? { height: `${viewportHeight}px` } : undefined}
      className="h-[100dvh] w-full bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-hidden relative"
    >
      {/* Top Mobile App Bar */}
      <header className="shrink-0 h-14 bg-slate-900/90 border-b border-slate-800 backdrop-blur px-3.5 flex items-center justify-between z-30">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Bot className="w-5 h-5" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-slate-950" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm font-bold text-white truncate">Njambo Copilote</h1>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">
                PRO
              </span>
            </div>
            <p className="text-[10px] text-slate-400 truncate">
              {loadingMetrics ? 'Actualisation...' : `En direct • ${prefs?.model || 'gemini-3.6-flash'}`}
            </p>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-1">
          {/* Direct Install PWA Button on mobile browser */}
          {!isCopilotPwaInstalled && (
            <button
              type="button"
              onClick={handleInstallCopilotApp}
              title="Installer l'application Njambo Copilote"
              className="h-8 px-2 rounded-lg bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-bold text-[11px] flex items-center gap-1 shadow-sm active:scale-95 transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-950" />
              <span className="hidden xs:inline">Installer</span>
            </button>
          )}

          {/* Refresh live metrics */}
          <button
            type="button"
            onClick={() => refreshLiveMetrics()}
            disabled={loadingMetrics}
            title="Rafraîchir les données"
            className="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 flex items-center justify-center transition active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <RotateCw className={`w-4 h-4 ${loadingMetrics ? 'animate-spin text-amber-400' : ''}`} />
          </button>

          {/* Social visual studio button */}
          <button
            type="button"
            onClick={() => setShowSocialModal(true)}
            title="Studio Visuels Réseaux"
            className="w-8 h-8 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 flex items-center justify-center transition active:scale-95 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
          </button>

          {/* Admin Notes Carnet button */}
          <button
            type="button"
            onClick={() => setShowAdminNotes(true)}
            title="Carnet de Bord & Roadmap"
            className="w-8 h-8 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 flex items-center justify-center transition active:scale-95 cursor-pointer"
          >
            <BookOpen className="w-4 h-4" />
          </button>

          {/* Threads drawer button */}
          <button
            type="button"
            onClick={() => setShowThreadDrawer(true)}
            title="Historique des discussions"
            className="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 flex items-center justify-center transition active:scale-95 cursor-pointer"
          >
            <MessageSquare className="w-4 h-4" />
          </button>

          {/* Context menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMenuDropdown(!showMenuDropdown)}
              className="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 flex items-center justify-center transition cursor-pointer"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showMenuDropdown && (
              <div className="absolute right-0 top-10 w-56 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1.5 z-50 text-xs space-y-1 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-2.5 py-1.5 border-b border-slate-800 text-[10px] text-slate-400 font-mono truncate">
                  Connecté : <span className="text-amber-300">{KATIKA_AUTHORIZED_EMAIL}</span>
                </div>
                
                {/* Install Njambo Copilote Action */}
                {!isCopilotPwaInstalled && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenuDropdown(false);
                      handleInstallCopilotApp();
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 flex items-center gap-2 cursor-pointer font-semibold"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-400" />
                    <span>Installer Njambo Copilote</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setShowMenuDropdown(false);
                    setShowCopilotSettings(true);
                  }}
                  className="w-full text-left px-2.5 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 flex items-center gap-2 cursor-pointer font-semibold"
                >
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  <span>Options Copilote (API, Liens...)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowMenuDropdown(false);
                    createThread();
                  }}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-800 text-slate-200 flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-400" />
                  <span>Nouvelle discussion</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMenuDropdown(false);
                    clearHistory();
                  }}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-800 text-slate-300 flex items-center gap-2 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>Effacer ce fil</span>
                </button>

                {/* Model switcher */}
                <div className="border-t border-slate-800 my-1 pt-1">
                  <div className="px-2.5 py-1 text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span>Modèle Gemini actif :</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 px-1 py-0.5">
                    {[
                      { id: 'gemini-3.6-flash', label: '3.6 Flash' },
                      { id: 'gemini-flash-latest', label: 'Flash Latest' },
                      { id: 'gemini-3.1-flash-lite', label: '3.1 Lite' },
                      { id: 'gemini-3.8-flash', label: '3.8 Flash' },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          updatePreferences({ model: m.id });
                        }}
                        className={`px-2 py-1 rounded text-[10px] font-medium border text-center transition cursor-pointer ${
                          (prefs?.model || 'gemini-3.6-flash') === m.id
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowMenuDropdown(false);
                    window.location.replace('/');
                  }}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-800 text-slate-300 flex items-center gap-2 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-slate-400" />
                  <span>Retourner au jeu</span>
                </button>
                <div className="border-t border-slate-800 my-1" />
                <button
                  type="button"
                  onClick={() => {
                    setShowMenuDropdown(false);
                    logout();
                  }}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-red-950/60 text-red-400 flex items-center gap-2 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Se déconnecter</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Proactive Live Status & Alerts Strip */}
      <div className="shrink-0 bg-slate-900/60 border-b border-slate-800/80 px-3.5 py-2">
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-3 overflow-x-auto scrollbar-none font-mono">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <strong className="text-white">{activeRooms}</strong> salons
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-slate-300">
              <strong className="text-white">{connectedPlayers}</strong> joueurs
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-amber-400 font-semibold">
              {totalManches} manches
            </span>
          </div>

          {hasAnomalies && (
            <button
              type="button"
              onClick={() => setIsAlertsExpanded(!isAlertsExpanded)}
              className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold flex items-center gap-1 shrink-0 ml-2 cursor-pointer"
            >
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              <span>{anomalies.length} alerte{anomalies.length > 1 ? 's' : ''}</span>
              {isAlertsExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>

        {/* Expandable Anomaly Alert Banner */}
        {hasAnomalies && isAlertsExpanded && (
          <div className="mt-2 p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/40 space-y-2 animate-in fade-in duration-150">
            <div className="flex items-center justify-between text-xs font-bold text-amber-300">
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                Anomalies détectées par le moteur
              </span>
            </div>
            <div className="space-y-1.5">
              {anomalies.slice(0, 3).map((a, idx) => (
                <div key={idx} className="text-[11px] text-slate-300 flex items-start gap-1.5">
                  <span className="text-amber-400 font-bold">•</span>
                  <div className="flex-1">
                    <span className="font-semibold text-white">{a.title} : </span>
                    <span className="text-slate-300">{a.description}</span>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                handleSend("Analyse les alertes et anomalies actuellement détectées et propose-moi des recommandations immédiates.");
                setIsAlertsExpanded(false);
              }}
              className="w-full py-1.5 px-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Sparkles className="w-3 h-3" />
              <span>Demander l'analyse d'alerte à l'IA</span>
            </button>
          </div>
        )}
      </div>

      {/* Quick Prompts Carousel */}
      <div className="shrink-0 bg-slate-950/80 border-b border-slate-900 px-3 py-2 overflow-x-auto scrollbar-none flex items-center gap-2 z-10">
        {MOBILE_QUICK_PROMPTS.map((qp, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleQuickPromptClick(qp.prompt)}
            disabled={isLoading}
            className="shrink-0 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-850 active:bg-slate-800 border border-slate-800 text-slate-300 text-[11px] font-medium transition cursor-pointer disabled:opacity-50"
          >
            {qp.label}
          </button>
        ))}
      </div>

      {/* Chat Messages Stream Area */}
      <main className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-6 space-y-4 text-slate-400">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-lg">
              <Bot className="w-7 h-7" />
            </div>
            <div className="space-y-1 max-w-xs">
              <h2 className="text-base font-bold text-white">Katika Mobile Copilot</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Posez une question sur les parties, demandez un audit des tables ou générez un visuel pour les réseaux.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 w-full max-w-xs pt-2">
              <button
                type="button"
                onClick={() => handleQuickPromptClick("Fais-moi un état des lieux instantané des salons actifs et des joueurs connectés.")}
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-500/40 text-left text-xs text-slate-200 transition cursor-pointer"
              >
                ⚡ État des salons en direct
              </button>
              <button
                type="button"
                onClick={() => setShowSocialModal(true)}
                className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 hover:border-amber-500/60 text-left text-xs text-amber-300 transition cursor-pointer flex items-center justify-between"
              >
                <span>🎨 Créer un visuel officiel pour les réseaux</span>
                <Sparkles className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}
              >
                {/* Message Bubble */}
                <div
                  className={`max-w-[92%] rounded-2xl p-3.5 text-xs shadow-md ${
                    isUser
                      ? 'bg-amber-500 text-slate-950 font-medium rounded-tr-sm'
                      : 'bg-slate-900 border border-slate-800/90 text-slate-200 rounded-tl-sm'
                  }`}
                >
                  {/* If user attached image */}
                  {msg.image && (
                    <div className="mb-2 rounded-lg overflow-hidden border border-black/20">
                      <img
                        src={msg.image.dataUrl}
                        alt="Image jointe"
                        className="max-h-48 w-auto object-cover rounded-lg"
                      />
                    </div>
                  )}

                  {/* Render content */}
                  {isUser ? (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  ) : (
                    <KatikaChatMessageRenderer
                      content={msg.content}
                      onNavigate={(tab) => {
                        handleSend(`Explique-moi les détails de la section ${tab}.`);
                      }}
                    />
                  )}
                </div>

                {/* Timestamp */}
                <span className="text-[9px] text-slate-500 px-1 font-mono">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            );
          })
        )}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex items-center gap-2 p-3 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-amber-400 max-w-[80%] animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>L'agent analyse les données en direct...</span>
          </div>
        )}

        {/* Error message */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-red-950/60 border border-red-800 text-red-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div ref={messagesEndRef} className="h-2" />
      </main>

      {/* Multimodal image preview before sending */}
      {attachedImage && (
        <div className="shrink-0 bg-slate-900 border-t border-slate-800 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src={attachedImage.dataUrl}
              alt="Aperçu"
              className="w-10 h-10 object-cover rounded-lg border border-slate-700"
            />
            <span className="text-xs text-slate-300 truncate max-w-[200px]">
              {attachedImage.name}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setAttachedImage(null)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Bottom Sticky Input Dock */}
      <footer className="shrink-0 bg-slate-900/95 border-t border-slate-800/90 p-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))] backdrop-blur z-20">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-end gap-2"
        >
          {/* Attachment button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Joindre une image pour analyse"
            className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center shrink-0 transition active:scale-95 cursor-pointer"
          >
            <ImageIcon className="w-5 h-5" />
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageFileChange}
            accept="image/*"
            className="hidden"
          />

          {/* Text input */}
          <div className="flex-1 bg-slate-950 border border-slate-800 focus-within:border-amber-500/60 rounded-2xl px-3.5 py-2 transition shadow-inner">
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputVal}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Message à l'agent Katika..."
              className="w-full bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none resize-none leading-relaxed max-h-28"
            />
          </div>

          {/* Speech to text Mic button */}
          <button
            type="button"
            onClick={toggleVoiceRecording}
            title={isListening ? 'Arrêter l’écoute vocale' : 'Parler au micro'}
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition active:scale-95 cursor-pointer ${
              isListening
                ? 'bg-rose-500 text-white animate-pulse shadow-lg shadow-rose-500/40'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            {isListening ? <MicOff className="w-5 h-5 text-white" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Send button */}
          <button
            type="submit"
            disabled={isLoading || (!inputVal.trim() && !attachedImage)}
            className="w-10 h-10 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold flex items-center justify-center shrink-0 transition shadow-md disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </footer>

      {/* Threads Drawer / Modal */}
      {showThreadDrawer && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex justify-start animate-in fade-in duration-150">
          <div className="w-4/5 max-w-xs h-full bg-slate-900 border-r border-slate-800 p-4 flex flex-col justify-between shadow-2xl">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <MessageSquare className="w-4 h-4 text-amber-400" />
                  <span>Discussions</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowThreadDrawer(false)}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* New thread button */}
              <button
                type="button"
                onClick={() => {
                  createThread();
                  setShowThreadDrawer(false);
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Nouvelle discussion</span>
              </button>

              {/* Threads list */}
              <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
                {threads.map((t) => {
                  const isActive = t.id === activeThreadId;
                  return (
                    <div
                      key={t.id}
                      onClick={() => {
                        selectThread(t.id);
                        setShowThreadDrawer(false);
                      }}
                      className={`p-2.5 rounded-xl text-xs flex items-center justify-between transition cursor-pointer ${
                        isActive
                          ? 'bg-amber-500/15 border border-amber-500/50 text-amber-300 font-semibold'
                          : 'bg-slate-950/60 border border-slate-800/80 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span className="truncate flex-1 pr-2">{t.title}</span>
                      {threads.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteThread(t.id);
                          }}
                          className="text-slate-500 hover:text-red-400 p-1"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom info */}
            <div className="pt-3 border-t border-slate-800 text-[10px] text-slate-500 flex items-center justify-between">
              <span>{threads.length} fil(s) sauvegardé(s)</span>
              <span className="font-mono text-amber-400">Katika AI</span>
            </div>
          </div>

          <div className="flex-1" onClick={() => setShowThreadDrawer(false)} />
        </div>
      )}

      {/* Social Studio Modal */}
      <KatikaMobileSocialStudioModal
        isOpen={showSocialModal}
        onClose={() => setShowSocialModal(false)}
        onSendToAi={(prompt) => handleSend(prompt)}
        metricsSnapshot={metricsSnapshot}
      />

      {/* Njambo Copilote PWA Install Modal */}
      <NjamboCopilotInstallModal
        isOpen={showPwaInstallModal}
        onClose={() => setShowPwaInstallModal(false)}
        deferredPrompt={deferredInstallPrompt}
        onInstalled={() => setIsCopilotPwaInstalled(true)}
      />

      {/* Copilote Options Modal (API Gemini BYOK, Social Links, Temperature) */}
      <KatikaCopilotSettingsModal
        isOpen={showCopilotSettings}
        onClose={() => setShowCopilotSettings(false)}
      />

      {/* Carnet de Bord & Roadmap Modal */}
      <KatikaAdminNotesPanel
        isOpen={showAdminNotes}
        onClose={() => setShowAdminNotes(false)}
        onInsertInChat={(prompt) => handleSend(prompt)}
      />
    </div>
  );
};
