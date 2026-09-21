import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import {
  AiAdminChatClient,
  ChatMessage,
  ChatThread,
  ChatBotPreferences,
} from '../services/aiAdminChatClient';
import {
  KatikaMetricsSnapshotProvider,
  KatikaMetricsSnapshot,
  KatikaDetectedAnomaly,
} from '../services/katikaMetricsSnapshot';
import { buildLocalHealthReport } from '../utils/localReports';

interface SendMessageOptions {
  text?: string;
  image?: {
    dataUrl: string;
    mimeType: string;
    name: string;
    sizeBytes?: number;
  };
  includeMetrics?: boolean;
}

interface KatikaAiChatContextType {
  // Multi-thread state & operations
  threads: ChatThread[];
  activeThread: ChatThread | null;
  activeThreadId: string;
  createThread: (title?: string) => string;
  selectThread: (id: string) => void;
  renameThread: (id: string, newTitle: string) => void;
  togglePinThread: (id: string) => void;
  deleteThread: (id: string) => void;

  // Active chat state
  messages: ChatMessage[];
  isLoading: boolean;
  errorMessage: string | null;
  sendMessage: (options: SendMessageOptions) => Promise<void>;
  sendLocalReport: (reportType?: 'HEALTH') => Promise<void>;
  clearHistory: () => void;

  // Floating bubble controls
  isBubbleOpen: boolean;
  toggleBubble: () => void;
  openBubble: () => void;
  closeBubble: () => void;

  // Anomaly alert & metrics
  hasUnreadAlert: boolean;
  markAlertAsRead: () => void;
  dismissCurrentAlert: () => void;
  anomalies: KatikaDetectedAnomaly[];
  metricsSnapshot: KatikaMetricsSnapshot | null;
  loadingMetrics: boolean;
  refreshLiveMetrics: () => Promise<void>;

  // Preferences
  prefs: ChatBotPreferences;
  updatePreferences: (newPrefs: Partial<ChatBotPreferences>) => void;

  // Audit Report Export
  exportThreadToMarkdown: (threadId?: string) => string;
  downloadThreadReport: (threadId?: string) => void;
}

const KatikaAiChatContext = createContext<KatikaAiChatContextType | null>(null);

const BUBBLE_STATE_KEY = 'katika_ai_bubble_open';
const LAST_SEEN_ALERT_KEY = 'katika_ai_last_seen_alert_ts';
const DISMISSED_ANOMALIES_KEY = 'katika_ai_dismissed_anomalies_fp';

export const KatikaAiChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 1. Multi-Thread State
  const [threads, setThreads] = useState<ChatThread[]>(() => AiAdminChatClient.getThreads());
  const [activeThreadId, setActiveThreadId] = useState<string>(() => {
    const savedId = AiAdminChatClient.getActiveThreadId();
    const initialThreads = AiAdminChatClient.getThreads();
    if (savedId && initialThreads.some((t) => t.id === savedId)) {
      return savedId;
    }
    return initialThreads[0]?.id || 'thread_default';
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Active thread derivation
  const activeThread = useMemo(() => {
    const found = threads.find((t) => t.id === activeThreadId);
    return found || threads[0] || null;
  }, [threads, activeThreadId]);

  const messages = useMemo(() => activeThread?.messages || [], [activeThread]);

  // Persisted folded/open state
  const [isBubbleOpen, setIsBubbleOpen] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(BUBBLE_STATE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [prefs, setPrefs] = useState<ChatBotPreferences>(() => AiAdminChatClient.getPreferences());
  const [metricsSnapshot, setMetricsSnapshot] = useState<KatikaMetricsSnapshot | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState<boolean>(false);
  const [hasUnreadAlert, setHasUnreadAlert] = useState<boolean>(false);

  // Sync bubble open state to sessionStorage
  const updateBubbleOpen = useCallback((open: boolean) => {
    setIsBubbleOpen(open);
    try {
      sessionStorage.setItem(BUBBLE_STATE_KEY, String(open));
    } catch {
      // ignore
    }
    if (open) {
      // Opening the bubble marks current alert as consulted
      markAlertAsRead();
    }
  }, []);

  const toggleBubble = useCallback(() => {
    updateBubbleOpen(!isBubbleOpen);
  }, [isBubbleOpen, updateBubbleOpen]);

  const openBubble = useCallback(() => {
    updateBubbleOpen(true);
  }, [updateBubbleOpen]);

  const closeBubble = useCallback(() => {
    updateBubbleOpen(false);
  }, [updateBubbleOpen]);

  const markAlertAsRead = useCallback(() => {
    setHasUnreadAlert(false);
    try {
      sessionStorage.setItem(LAST_SEEN_ALERT_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  }, []);

  const dismissCurrentAlert = useCallback(() => {
    setHasUnreadAlert(false);
    try {
      if (metricsSnapshot?.detectedAnomalies) {
        const fp = metricsSnapshot.detectedAnomalies.map((a) => a.title).sort().join('|');
        sessionStorage.setItem(DISMISSED_ANOMALIES_KEY, fp);
      }
      sessionStorage.setItem(LAST_SEEN_ALERT_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  }, [metricsSnapshot]);

  // Fetch or refresh live metrics
  const refreshLiveMetrics = useCallback(async () => {
    setLoadingMetrics(true);
    try {
      const snap = await KatikaMetricsSnapshotProvider.buildSnapshot();
      setMetricsSnapshot(snap);

      // Evaluate anomaly alerts for notification badge
      const anomalies = snap.detectedAnomalies || [];
      if (anomalies.length > 0) {
        let lastSeenTs = 0;
        let dismissedFp = '';
        try {
          const stored = sessionStorage.getItem(LAST_SEEN_ALERT_KEY);
          if (stored) lastSeenTs = parseInt(stored, 10) || 0;
          dismissedFp = sessionStorage.getItem(DISMISSED_ANOMALIES_KEY) || '';
        } catch {
          // ignore
        }

        const currentFp = anomalies.map((a) => a.title).sort().join('|');
        const isDismissed = dismissedFp && dismissedFp === currentFp;

        // If anomalies were detected, not permanently dismissed in this session,
        // and haven't been consulted within 60s
        if (!isDismissed && (!lastSeenTs || snap.timestamp > lastSeenTs + 60000)) {
          if (!isBubbleOpen) {
            setHasUnreadAlert(true);
          }
        }
      }
    } catch (e) {
      console.warn('[KatikaAiChatContext] Error loading metrics snapshot:', e);
    } finally {
      setLoadingMetrics(false);
    }
  }, [isBubbleOpen]);

  // Fetch initial et intervalle périodique (300 secondes = 5 min), mis en pause si l'onglet est inactif
  useEffect(() => {
    refreshLiveMetrics();

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return; // Pause du rafraîchissement si l'onglet est masqué
      }
      refreshLiveMetrics();
    }, 300000); // 300s au lieu de 60s

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setMetricsSnapshot((currentSnap) => {
          // Si le dernier snapshot date de plus de 120 secondes, on rafraîchit à la réactivation
          if (!currentSnap || Date.now() - currentSnap.timestamp > 120000) {
            refreshLiveMetrics();
          }
          return currentSnap;
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshLiveMetrics]);

  const updatePreferences = useCallback((newPrefs: Partial<ChatBotPreferences>) => {
    setPrefs((prev) => {
      const updated = { ...prev, ...newPrefs };
      AiAdminChatClient.savePreferences(updated);
      return updated;
    });
  }, []);

  // Thread Operations
  const createThread = useCallback((title?: string): string => {
    const newId = `thread_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newThread: ChatThread = {
      id: newId,
      title: title?.trim() || 'Nouvelle discussion',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isPinned: false,
    };

    setThreads((prev) => {
      const next = [newThread, ...prev];
      AiAdminChatClient.saveThreads(next);
      return next;
    });

    setActiveThreadId(newId);
    AiAdminChatClient.setActiveThreadId(newId);
    setErrorMessage(null);
    return newId;
  }, []);

  const selectThread = useCallback((id: string) => {
    setActiveThreadId(id);
    AiAdminChatClient.setActiveThreadId(id);
    setErrorMessage(null);
  }, []);

  const renameThread = useCallback((id: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;

    setThreads((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, title: trimmed, updatedAt: Date.now() } : t));
      AiAdminChatClient.saveThreads(next);
      return next;
    });
  }, []);

  const togglePinThread = useCallback((id: string) => {
    setThreads((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, isPinned: !t.isPinned } : t));
      AiAdminChatClient.saveThreads(next);
      return next;
    });
  }, []);

  const deleteThread = useCallback(
    (id: string) => {
      setThreads((prev) => {
        const next = prev.filter((t) => t.id !== id);
        let finalThreads = next;

        // If all threads deleted, create a fresh one
        if (finalThreads.length === 0) {
          const freshThread: ChatThread = {
            id: `thread_${Date.now()}`,
            title: 'Nouvelle discussion',
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            isPinned: false,
          };
          finalThreads = [freshThread];
        }

        AiAdminChatClient.saveThreads(finalThreads);

        // If the active thread was deleted, select the first remaining
        if (activeThreadId === id) {
          const nextActiveId = finalThreads[0].id;
          setActiveThreadId(nextActiveId);
          AiAdminChatClient.setActiveThreadId(nextActiveId);
        }

        return finalThreads;
      });
    },
    [activeThreadId]
  );

  const clearHistory = useCallback(() => {
    if (!activeThreadId) return;

    setThreads((prev) => {
      const next = prev.map((t) => (t.id === activeThreadId ? { ...t, messages: [], updatedAt: Date.now() } : t));
      AiAdminChatClient.saveThreads(next);
      return next;
    });
    setErrorMessage(null);
  }, [activeThreadId]);

  const sendMessage = useCallback(
    async (options: SendMessageOptions) => {
      const text = (options.text || '').trim();
      if ((!text && !options.image) || isLoading || !activeThreadId) return;

      setErrorMessage(null);
      const userMessageId = `user_${Date.now()}`;
      const userMessage: ChatMessage = {
        id: userMessageId,
        role: 'user',
        content: text || (options.image ? `[Image jointe : ${options.image.name}]` : ''),
        timestamp: Date.now(),
        image: options.image
          ? {
              dataUrl: options.image.dataUrl,
              name: options.image.name,
              sizeBytes: options.image.sizeBytes,
            }
          : undefined,
      };

      // Auto-name thread if it's the very first user message and has a placeholder title
      let updatedTitle: string | undefined = undefined;
      const currentThread = threads.find((t) => t.id === activeThreadId);
      if (currentThread && (currentThread.title === 'Nouvelle discussion' || !currentThread.title) && text) {
        updatedTitle = text.slice(0, 36).replace(/\n/g, ' ') + (text.length > 36 ? '...' : '');
      }

      const currentMessages = currentThread?.messages || [];
      const nextMessages = [...currentMessages, userMessage];

      // Optimistically update thread in memory
      setThreads((prev) => {
        const next = prev.map((t) =>
          t.id === activeThreadId
            ? {
                ...t,
                title: updatedTitle || t.title,
                messages: nextMessages,
                updatedAt: Date.now(),
              }
            : t
        );
        AiAdminChatClient.saveThreads(next);
        return next;
      });

      setIsLoading(true);

      try {
        let snapshotToSend = metricsSnapshot;
        // Détecter si la demande est un visuel créatif sans requête statistique explicite
        const isVisualCreativePrompt = /visuel|affiche|créer post|nouveau post|bannière|flyer|story|générer image|studio réseau|post facebook|post instagram|post whatsapp|pack marketing|casse-t[eê]te|tactique|dilemme|m[eè]me|punchline|sondage|invitation/i.test(text);
        const asksForStatsExplicitly = /chiffre|statistique|stat|kpi|bilan|taux|abandon|joueur|player|partie|table|santé|arène|donnée|télémétrie|rapport|audit|combien|podium|top|champion|palmar[eè]s|classement|ma[iî]tre/i.test(text);
        const shouldFetchMetrics = options.includeMetrics !== false && (!isVisualCreativePrompt || asksForStatsExplicitly);

        if (shouldFetchMetrics) {
          if (!snapshotToSend || Date.now() - snapshotToSend.timestamp > 30000) {
            try {
              snapshotToSend = await KatikaMetricsSnapshotProvider.buildSnapshot();
              setMetricsSnapshot(snapshotToSend);
            } catch (e) {
              console.warn('[KatikaAiChatContext] Snapshot refresh error:', e);
            }
          }
        } else {
          // Pour les visuels créatifs sans demande de statistiques, on évite d'envoyer un snapshot lourd
          snapshotToSend = undefined;
        }

        const imagePayload = options.image
          ? {
              data: options.image.dataUrl,
              mimeType: options.image.mimeType,
              name: options.image.name,
            }
          : undefined;

        const assistantId = `assistant_${Date.now()}`;
        let accumulatedText = '';

        // Add an initial empty assistant message so the user sees real-time typing
        setThreads((prev) => {
          const next = prev.map((t) =>
            t.id === activeThreadId
              ? {
                  ...t,
                  messages: [
                    ...nextMessages,
                    {
                      id: assistantId,
                      role: 'assistant' as const,
                      content: '',
                      timestamp: Date.now(),
                    },
                  ],
                  updatedAt: Date.now(),
                }
              : t
          );
          return next;
        });

        let reply = '';
        if (prefs.disableStreaming) {
          // Static Mode: Standard POST request, extremely robust on unstable network connections
          reply = await AiAdminChatClient.sendMessage({
            message: text,
            image: imagePayload,
            history: currentMessages,
            config: prefs,
            metricsSnapshot: options.includeMetrics !== false ? snapshotToSend : undefined,
          });
          accumulatedText = reply;
          setThreads((prev) =>
            prev.map((t) => {
              if (t.id !== activeThreadId) return t;
              const msgs = t.messages.map((m) =>
                m.id === assistantId ? { ...m, content: reply } : m
              );
              return { ...t, messages: msgs, updatedAt: Date.now() };
            })
          );
        } else {
          reply = await AiAdminChatClient.sendMessageStream({
            message: text,
            image: imagePayload,
            history: currentMessages,
            config: prefs,
            metricsSnapshot: options.includeMetrics !== false ? snapshotToSend : undefined,
            onChunk: (accumulated) => {
              accumulatedText = accumulated;
              setThreads((prev) =>
                prev.map((t) => {
                  if (t.id !== activeThreadId) return t;
                  const msgs = t.messages.map((m) =>
                    m.id === assistantId ? { ...m, content: accumulated } : m
                  );
                  return { ...t, messages: msgs, updatedAt: Date.now() };
                })
              );
            },
          });
        }

        const finalReply = accumulatedText || reply;
        const finalAssistantMessage: ChatMessage = {
          id: assistantId,
          role: 'assistant',
          content: finalReply,
          timestamp: Date.now(),
        };

        const finalMessages = [...nextMessages, finalAssistantMessage];

        setThreads((prev) => {
          const next = prev.map((t) =>
            t.id === activeThreadId
              ? {
                  ...t,
                  messages: finalMessages,
                  updatedAt: Date.now(),
                }
              : t
          );
          AiAdminChatClient.saveThreads(next);
          return next;
        });
      } catch (err: unknown) {
        console.error('[KatikaAiChatContext] Send error:', err);
        const errMsg = err instanceof Error ? err.message : 'Erreur inattendue.';
        setErrorMessage(errMsg);

        const errorReply: ChatMessage = {
          id: `err_${Date.now()}`,
          role: 'assistant',
          content: `⚠️ **Erreur lors de la génération** : ${errMsg}\n\nVérifiez que votre clé \`GEMINI_API_KEY\` est bien configurée dans les paramètres de votre environnement.`,
          timestamp: Date.now(),
          isError: true,
        };

        const finalMessages = [...nextMessages, errorReply];

        setThreads((prev) => {
          const next = prev.map((t) =>
            t.id === activeThreadId
              ? {
                  ...t,
                  messages: finalMessages,
                  updatedAt: Date.now(),
                }
              : t
          );
          AiAdminChatClient.saveThreads(next);
          return next;
        });
      } finally {
        setIsLoading(false);
      }
    },
    [activeThreadId, threads, isLoading, metricsSnapshot, prefs]
  );

  const sendLocalReport = useCallback(
    async (_reportType: 'HEALTH' = 'HEALTH') => {
      if (isLoading || !activeThreadId) return;

      setErrorMessage(null);
      const userMessageId = `user_${Date.now()}`;
      const userMessage: ChatMessage = {
        id: userMessageId,
        role: 'user',
        content: '🩺 Générer un bilan de santé opérationnel (Diagnostic local)',
        timestamp: Date.now(),
      };

      let updatedTitle: string | undefined = undefined;
      const currentThread = threads.find((t) => t.id === activeThreadId);
      if (currentThread && (currentThread.title === 'Nouvelle discussion' || !currentThread.title)) {
        updatedTitle = 'Bilan de santé opérationnel (Local)';
      }

      const currentMessages = currentThread?.messages || [];
      const assistantId = `assistant_${Date.now() + 1}`;

      // Récupérer le snapshot local (ou rafraîchir si expiré)
      let currentSnap = metricsSnapshot;
      if (!currentSnap || Date.now() - currentSnap.timestamp > 30000) {
        try {
          currentSnap = await KatikaMetricsSnapshotProvider.buildSnapshot();
          setMetricsSnapshot(currentSnap);
        } catch (e) {
          console.warn('[KatikaAiChatContext] Snapshot refresh error for local report:', e);
        }
      }

      // Génération 100% locale sans aucun appel Gemini / réseau
      const reportContent = buildLocalHealthReport(currentSnap);

      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: reportContent,
        timestamp: Date.now() + 1,
      };

      const finalMessages = [...currentMessages, userMessage, assistantMessage];

      setThreads((prev) => {
        const next = prev.map((t) =>
          t.id === activeThreadId
            ? {
                ...t,
                title: updatedTitle || t.title,
                messages: finalMessages,
                updatedAt: Date.now(),
              }
            : t
        );
        AiAdminChatClient.saveThreads(next);
        return next;
      });
    },
    [activeThreadId, threads, isLoading, metricsSnapshot]
  );

  const exportThreadToMarkdown = useCallback(
    (targetThreadId?: string): string => {
      const tId = targetThreadId || activeThreadId;
      const thread = threads.find((t) => t.id === tId) || activeThread;
      if (!thread) return '';

      const dateStr = new Date(thread.updatedAt).toLocaleString('fr-FR', {
        dateStyle: 'full',
        timeStyle: 'medium',
      });

      const kpisSummary = metricsSnapshot?.summary
        ? `- **Total Manches :** ${metricsSnapshot.summary.totalManches}
- **Total Parties :** ${metricsSnapshot.summary.totalParties}
- **Joueurs en direct :** ${metricsSnapshot.summary.connectedPlayers}
- **Ratio Kora / Double Kora :** ${metricsSnapshot.kpis?.allTime?.koraCount ?? 0} / ${metricsSnapshot.kpis?.allTime?.doubleKoraCount ?? 0}
- **Abandons / Forfaits :** ${metricsSnapshot.kpis?.allTime?.manchesAbandonedCount ?? 0}`
        : '_Métriques non disponibles lors de cet export._';

      const anomaliesList =
        (metricsSnapshot?.detectedAnomalies || []).length > 0
          ? (metricsSnapshot?.detectedAnomalies || [])
              .map((a) => `- [${a.severity}] **${a.title}** : ${a.description}`)
              .join('\n')
          : '_Aucune anomalie active au moment de la génération._';

      const messagesMd = thread.messages
        .map((m) => {
          const author =
            m.role === 'user' ? '👤 Administrateur Katika' : '🤖 Assistant IA Katika Master';
          const time = new Date(m.timestamp).toLocaleTimeString('fr-FR');
          const imgNote = m.image ? `\n\n> 📷 *Image jointe : ${m.image.name || 'Capture'}*\n` : '';
          return `### ${author} (${time})\n${imgNote}\n${m.content}\n`;
        })
        .join('\n---\n\n');

      return `# 📋 Rapport d'Audit & Investigation Katika Master
**Discussion :** ${thread.title}
**Date du rapport :** ${dateStr}
**Identifiant de Session :** \`${thread.id}\`
**Statut de Sécurité :** Mode Lecture Seule Certifié (Aucune altération directe du jeu)

---

## 📊 Synthèse Opérationnelle au moment de l'Audit
${kpisSummary}

### Alertes & Détection d'Anomalies
${anomaliesList}

---

## 💬 Historique & Recommandations de la Session

${messagesMd}

---
*Rapport généré automatiquement depuis le cockpit Katika Master • Moteur Njambo*
`;
    },
    [threads, activeThreadId, activeThread, metricsSnapshot]
  );

  const downloadThreadReport = useCallback(
    (targetThreadId?: string) => {
      const md = exportThreadToMarkdown(targetThreadId);
      if (!md) return;
      const tId = targetThreadId || activeThreadId;
      const thread = threads.find((t) => t.id === tId) || activeThread;
      const cleanTitle = (thread?.title || 'rapport_audit')
        .toLowerCase()
        .replace(/[^a-z0-9]/gi, '_')
        .slice(0, 30);
      const filename = `katika_audit_${cleanTitle}_${Date.now()}.md`;

      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [exportThreadToMarkdown, threads, activeThreadId, activeThread]
  );

  const anomalies = useMemo(() => metricsSnapshot?.detectedAnomalies || [], [metricsSnapshot]);

  const value = useMemo<KatikaAiChatContextType>(
    () => ({
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
      isBubbleOpen,
      toggleBubble,
      openBubble,
      closeBubble,
      hasUnreadAlert,
      markAlertAsRead,
      dismissCurrentAlert,
      anomalies,
      metricsSnapshot,
      loadingMetrics,
      refreshLiveMetrics,
      prefs,
      updatePreferences,
      exportThreadToMarkdown,
      downloadThreadReport,
      sendMessage,
      sendLocalReport,
      clearHistory,
    }),
    [
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
      isBubbleOpen,
      toggleBubble,
      openBubble,
      closeBubble,
      hasUnreadAlert,
      markAlertAsRead,
      dismissCurrentAlert,
      anomalies,
      metricsSnapshot,
      loadingMetrics,
      refreshLiveMetrics,
      prefs,
      updatePreferences,
      exportThreadToMarkdown,
      downloadThreadReport,
      sendMessage,
      sendLocalReport,
      clearHistory,
    ]
  );

  return <KatikaAiChatContext.Provider value={value}>{children}</KatikaAiChatContext.Provider>;
};

export const useKatikaAiChat = (): KatikaAiChatContextType => {
  const ctx = useContext(KatikaAiChatContext);
  if (!ctx) {
    throw new Error('useKatikaAiChat must be used within a KatikaAiChatProvider');
  }
  return ctx;
};
