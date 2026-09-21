import React, { useState, useRef, useEffect } from 'react';
import { 
  Bot, 
  X, 
  Send, 
  Paperclip, 
  Sparkles, 
  ShieldCheck, 
  Maximize2, 
  Loader2, 
  AlertTriangle, 
  Trash2, 
  Copy, 
  Check, 
  Activity,
  Image as ImageIcon,
  Pin,
  Plus,
  ChevronDown,
  MessageSquare,
  EyeOff,
  FileText
} from 'lucide-react';
import { useKatikaAiChat } from '../context/KatikaAiChatContext';
import { KatikaTab } from '../types/katika';
import { KatikaChatMessageRenderer } from './KatikaChatMessageRenderer';

interface KatikaAiFloatingBubbleProps {
  currentTab: KatikaTab;
  onNavigateTab?: (tab: KatikaTab) => void;
}

export const KatikaAiFloatingBubble: React.FC<KatikaAiFloatingBubbleProps> = ({
  currentTab,
  onNavigateTab,
}) => {
  const {
    threads,
    activeThread,
    activeThreadId,
    createThread,
    selectThread,
    togglePinThread,
    deleteThread,
    messages,
    isLoading,
    errorMessage,
    isBubbleOpen,
    toggleBubble,
    closeBubble,
    hasUnreadAlert,
    dismissCurrentAlert,
    anomalies,
    metricsSnapshot,
    sendMessage,
    clearHistory,
    downloadThreadReport,
  } = useKatikaAiChat();

  const [inputVal, setInputVal] = useState('');
  const [selectedImage, setSelectedImage] = useState<{
    dataUrl: string;
    mimeType: string;
    name: string;
    sizeBytes: number;
  } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [showThreadDropdown, setShowThreadDropdown] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const bubbleButtonRef = useRef<HTMLButtonElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Auto-scroll messages
  useEffect(() => {
    if (isBubbleOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, isBubbleOpen]);

  // Click outside dropdown to close thread selector
  useEffect(() => {
    const handleDropdownOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowThreadDropdown(false);
      }
    };
    if (showThreadDropdown) {
      document.addEventListener('mousedown', handleDropdownOutside);
      return () => document.removeEventListener('mousedown', handleDropdownOutside);
    }
  }, [showThreadDropdown]);

  // Focus textarea when panel opens
  useEffect(() => {
    if (isBubbleOpen) {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    } else {
      setShowThreadDropdown(false);
    }
  }, [isBubbleOpen]);

  // Hide the floating bubble when user is already in the dedicated full-screen AI Assistant tab
  if (currentTab === 'AI_ASSISTANT') {
    return null;
  }

  const handleFileChange = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 8 * 1024 * 1024) return;

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

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend !== undefined ? textToSend : inputVal).trim();
    if ((!text && !selectedImage) || isLoading) return;

    const img = selectedImage || undefined;
    setInputVal('');
    setSelectedImage(null);

    await sendMessage({
      text,
      image: img,
      includeMetrics: true,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = (id: string, text: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore
    }
  };

  const handleClear = () => {
    if (window.confirm('Voulez-vous effacer l’historique de cette discussion ?')) {
      clearHistory();
    }
  };

  const handleOpenDedicatedTab = () => {
    closeBubble();
    onNavigateTab?.('AI_ASSISTANT');
  };

  const handleNewThread = () => {
    createThread();
    setShowThreadDropdown(false);
  };

  // Sort threads: pinned first, then by updatedAt desc
  const sortedThreads = [...threads].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return b.updatedAt - a.updatedAt;
  });

  return (
    <>
      {/* 
        Friction 3 Fix: Backdrop Overlay (z-40)
        Absorbs any clicks outside the panel so accidental clicks on underlying table rows/buttons are completely prevented!
      */}
      {isBubbleOpen && (
        <div
          id="katika-ai-bubble-backdrop"
          onClick={closeBubble}
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[0.5px] transition-opacity animate-in fade-in duration-150"
          aria-hidden="true"
        />
      )}

      {/* Floating Chat Panel (Unfolded State, z-50) */}
      {isBubbleOpen && (
        <div
          ref={panelRef}
          id="katika-ai-floating-panel"
          className="fixed bottom-22 right-6 z-50 w-[390px] sm:w-[420px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-6.5rem)] bg-slate-900/95 backdrop-blur-md border border-amber-500/30 rounded-2xl shadow-2xl shadow-black/80 flex flex-col overflow-hidden text-slate-100 font-sans transition-all duration-200 animate-in fade-in slide-in-from-bottom-4"
        >
          {/* Header */}
          <div className="p-3 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-white tracking-wide">Assistant IA Katika</span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 font-medium">
                    Lecture seule
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Métriques en direct</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 transition cursor-pointer"
                  title="Effacer la discussion active"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}

              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => downloadThreadReport()}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-slate-800/80 transition cursor-pointer"
                  title="Télécharger le rapport d'audit (.md)"
                >
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                </button>
              )}

              {onNavigateTab && (
                <button
                  type="button"
                  onClick={handleOpenDedicatedTab}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-slate-800/80 transition cursor-pointer"
                  title="Ouvrir dans l'onglet dédié en plein écran"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={closeBubble}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition cursor-pointer"
                title="Réduire"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Discussion Switcher Bar (DeepSeek / Gemini multi-conversation) */}
          <div className="px-3 py-1.5 bg-slate-950/70 border-b border-slate-800/80 flex items-center justify-between gap-2 shrink-0 relative">
            <div className="relative flex-1 min-w-0" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setShowThreadDropdown(!showThreadDropdown)}
                className="w-full flex items-center justify-between gap-1.5 px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800/80 border border-slate-800 text-[11px] text-slate-200 transition cursor-pointer"
                title="Changer de discussion"
              >
                <span className="flex items-center gap-1.5 truncate">
                  {activeThread?.isPinned ? (
                    <Pin className="w-3 h-3 text-amber-400 shrink-0 fill-amber-400" />
                  ) : (
                    <MessageSquare className="w-3 h-3 text-slate-400 shrink-0" />
                  )}
                  <span className="truncate font-medium">
                    {activeThread?.title || 'Discussion en cours'}
                  </span>
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${showThreadDropdown ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu of Threads */}
              {showThreadDropdown && (
                <div className="absolute left-0 top-full mt-1 w-full bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl z-50 overflow-hidden py-1 max-h-60 overflow-y-auto animate-in fade-in duration-100">
                  <div className="px-2 py-1 flex items-center justify-between border-b border-slate-800 text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                    <span>Mes Discussions ({threads.length})</span>
                    <button
                      type="button"
                      onClick={handleNewThread}
                      className="text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer font-bold lowercase first-letter:uppercase"
                    >
                      <Plus className="w-3 h-3" />
                      Nouvelle
                    </button>
                  </div>

                  <div className="divide-y divide-slate-800/60">
                    {sortedThreads.map((t) => {
                      const isActive = t.id === activeThreadId;
                      return (
                        <div
                          key={t.id}
                          className={`flex items-center justify-between px-2.5 py-1.5 text-xs transition cursor-pointer ${
                            isActive
                              ? 'bg-amber-500/15 text-amber-200 font-semibold'
                              : 'text-slate-300 hover:bg-slate-800/70'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              selectThread(t.id);
                              setShowThreadDropdown(false);
                            }}
                            className="flex-1 flex items-center gap-1.5 truncate text-left mr-2"
                          >
                            {t.isPinned ? (
                              <Pin className="w-3 h-3 text-amber-400 shrink-0 fill-amber-400" />
                            ) : (
                              <MessageSquare className="w-3 h-3 text-slate-500 shrink-0" />
                            )}
                            <span className="truncate">{t.title}</span>
                            <span className="text-[10px] text-slate-500 font-mono shrink-0">
                              ({t.messages.length})
                            </span>
                          </button>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                togglePinThread(t.id);
                              }}
                              className={`p-1 rounded hover:bg-slate-700 transition ${
                                t.isPinned ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'
                              }`}
                              title={t.isPinned ? 'Désépingler' : 'Épingler'}
                            >
                              <Pin className={`w-3 h-3 ${t.isPinned ? 'fill-amber-400' : ''}`} />
                            </button>
                            {threads.length > 1 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (window.confirm(`Supprimer la discussion "${t.title}" ?`)) {
                                    deleteThread(t.id);
                                  }
                                }}
                                className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-700 transition"
                                title="Supprimer la discussion"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Quick New Thread Button */}
            <button
              type="button"
              onClick={handleNewThread}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[11px] font-medium transition cursor-pointer shrink-0"
              title="Créer une nouvelle discussion distincte"
            >
              <Plus className="w-3 h-3" />
              <span>Nouveau</span>
            </button>
          </div>

          {/* Quick Anomaly Banner if active with dismiss option (Friction 4 fix) */}
          {anomalies.length > 0 && (
            <div className="px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-[10px] text-amber-300 flex items-center justify-between shrink-0">
              <span className="flex items-center gap-1.5 font-medium truncate">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>{anomalies.length} anomalie(s) détectée(s)</span>
              </span>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <button
                  type="button"
                  onClick={() => handleSend("⚠️ Fais un diagnostic des anomalies détectées actuellement.")}
                  className="underline hover:text-white transition font-semibold"
                >
                  Analyser
                </button>
                <button
                  type="button"
                  onClick={dismissCurrentAlert}
                  className="text-amber-400/80 hover:text-white p-0.5 transition cursor-pointer"
                  title="Masquer cette alerte"
                >
                  <EyeOff className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          {/* Messages Scroll Area */}
          <div
            className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-slate-950/40 text-xs"
            onDragEnter={() => setDragActive(true)}
            onDragLeave={() => setDragActive(false)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              if (e.dataTransfer.files?.[0]) handleFileChange(e.dataTransfer.files[0]);
            }}
          >
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 space-y-3 text-slate-400">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="space-y-1 max-w-[280px]">
                  <p className="font-semibold text-slate-200 text-xs">
                    {activeThread?.title || 'Nouvelle discussion'}
                  </p>
                  <p className="text-[11px] text-slate-400 leading-normal">
                    Posez vos questions sur les métriques du jeu, les joueurs, ou collez une capture d'écran.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5 w-full pt-1">
                  <button
                    type="button"
                    onClick={() => handleSend("📊 Analyse la santé globale du jeu et le taux d'abandon.")}
                    className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-300 text-left text-[11px] transition cursor-pointer"
                  >
                    📊 Analyse de santé globale
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSend("⚠️ Détectes-tu des anomalies sur les manches récentes ?")}
                    className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-300 text-left text-[11px] transition cursor-pointer"
                  >
                    ⚠️ Recherche d'anomalies
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSend("🎯 Quel est le format de table le plus populaire ?")}
                    className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-300 text-left text-[11px] transition cursor-pointer"
                  >
                    🎯 Baromètre d'audience des tables
                  </button>
                </div>
              </div>
            ) : (
              messages.map((m) => {
                const isUser = m.role === 'user';
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}
                  >
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 px-1">
                      {isUser ? (
                        <span>Vous</span>
                      ) : (
                        <span className="flex items-center gap-1 text-amber-400 font-medium">
                          <Bot className="w-3 h-3" />
                          Assistant IA
                        </span>
                      )}
                      <span>•</span>
                      <span>{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    <div
                      className={`p-3 rounded-2xl max-w-[90%] leading-relaxed ${
                        isUser
                          ? 'bg-amber-500 text-slate-950 font-medium rounded-tr-sm shadow-md'
                          : m.isError
                          ? 'bg-rose-950/60 border border-rose-800/80 text-rose-200 rounded-tl-sm'
                          : 'bg-slate-800/90 border border-slate-700/60 text-slate-200 rounded-tl-sm shadow-sm'
                      }`}
                    >
                      {/* Attached Image Preview */}
                      {m.image && (
                        <div className="mb-2 rounded-lg overflow-hidden border border-slate-700 max-w-[200px]">
                          <img
                            src={m.image.dataUrl}
                            alt="Capture jointe"
                            className="w-full h-auto max-h-36 object-cover"
                          />
                        </div>
                      )}

                      {isUser ? (
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      ) : (
                        <KatikaChatMessageRenderer
                          content={m.content}
                          onNavigate={(tab, query) => {
                            if (onNavigateTab) {
                              onNavigateTab(tab);
                            }
                          }}
                        />
                      )}
                    </div>

                    {/* Copy reply button */}
                    {!isUser && !m.isError && (
                      <div className="flex items-center gap-1 px-1">
                        <button
                          type="button"
                          onClick={() => handleCopy(m.id, m.content)}
                          className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-1 transition cursor-pointer"
                        >
                          {copiedId === m.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">Copié</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copier</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* Loading / Thinking indicator */}
            {isLoading && (
              <div className="flex items-center gap-2 p-3 rounded-2xl bg-slate-800/60 border border-slate-700/40 text-slate-400 max-w-[80%]">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                <span className="text-[11px]">Gemini 3.8 Flash analyse les données...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Drag Overlay */}
          {dragActive && (
            <div className="absolute inset-0 bg-amber-500/20 backdrop-blur-xs border-2 border-dashed border-amber-400 rounded-2xl flex flex-col items-center justify-center pointer-events-none z-20">
              <ImageIcon className="w-10 h-10 text-amber-300 mb-2 animate-bounce" />
              <p className="text-xs font-bold text-white">Déposez l'image ici pour analyse</p>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="mx-3 my-1 p-2 rounded-xl bg-rose-950/80 border border-rose-800/80 text-rose-300 text-[11px] flex items-center justify-between shrink-0">
              <span className="truncate">{errorMessage}</span>
            </div>
          )}

          {/* Input Bar */}
          <div className="p-3 bg-slate-950/90 border-t border-slate-800 shrink-0 space-y-2">
            {/* Selected Image Chip */}
            {selectedImage && (
              <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs text-amber-300">
                <div className="flex items-center gap-1.5 truncate">
                  <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate max-w-[200px]">{selectedImage.name}</span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    ({Math.round(selectedImage.sizeBytes / 1024)} Ko)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedImage(null)}
                  className="text-slate-400 hover:text-white p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex items-end gap-1.5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFileChange(e.target.files[0]);
                }}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-amber-300 transition cursor-pointer shrink-0 disabled:opacity-50"
                title="Joindre une capture d'écran"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Posez votre question (ou Maj+Entrée)..."
                  rows={1}
                  disabled={isLoading}
                  className="w-full bg-slate-900 border border-slate-700/80 focus:border-amber-500/80 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 resize-none focus:outline-none transition leading-normal max-h-24"
                />
              </div>

              <button
                type="button"
                onClick={() => handleSend()}
                disabled={(!inputVal.trim() && !selectedImage) || isLoading}
                className="p-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:hover:bg-amber-500 text-slate-950 font-bold transition cursor-pointer shrink-0"
                title="Envoyer"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-between text-[9px] text-slate-500 px-1">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-amber-400/80" />
                Mode consultation • Entrée pour envoyer
              </span>
              {metricsSnapshot?.summary && (
                <span>
                  {metricsSnapshot.summary.totalManches} manches • {metricsSnapshot.summary.connectedPlayers} en ligne
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Bubble Button (Folded State) */}
      <button
        ref={bubbleButtonRef}
        id="katika-ai-floating-bubble-btn"
        type="button"
        onClick={toggleBubble}
        aria-label="Ouvrir l'Assistant IA Katika"
        className={`fixed bottom-6 right-6 z-50 w-13 h-13 rounded-full flex items-center justify-center transition-all duration-200 shadow-2xl cursor-pointer group select-none ${
          isBubbleOpen
            ? 'bg-slate-900 border-2 border-amber-500/50 text-amber-400 rotate-90 scale-100 shadow-black/60'
            : 'bg-gradient-to-tr from-amber-500 via-amber-400 to-amber-500 text-slate-950 hover:scale-105 active:scale-95 shadow-amber-500/30'
        }`}
        title={isBubbleOpen ? "Réduire l'Assistant IA" : "Assistant IA Katika (Conseil & Analyse)"}
      >
        {isBubbleOpen ? (
          <X className="w-6 h-6 transition-transform group-hover:rotate-90" />
        ) : (
          <div className="relative flex items-center justify-center">
            <Bot className="w-6 h-6" />
            {/* Discrete Visual Anomaly / Alert Notification Dot */}
            {hasUnreadAlert && (
              <span
                id="katika-ai-bubble-notification-dot"
                className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-rose-500 rounded-full border-2 border-slate-950 shadow-sm"
                title="Anomalie ou alerte importante détectée dans les métriques"
              />
            )}
          </div>
        )}
      </button>
    </>
  );
};
