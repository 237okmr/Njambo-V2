import { CopilotSettingsService } from './copilotSettingsService';
import { tikaFetch } from './tikaFetch';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  image?: {
    dataUrl: string;
    name?: string;
    sizeBytes?: number;
  };
  isError?: boolean;
}

export interface ChatThread {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  isPinned?: boolean;
}

export type ChatTone = 'concise' | 'balanced' | 'detailed';
export type ChatStyle = 'direct' | 'pedagogical' | 'strategic';

export interface ChatBotPreferences {
  tone: ChatTone;
  style: ChatStyle;
  model?: string;
  temperatureMode?: 'analytical' | 'balanced' | 'creative';
  disableStreaming?: boolean;
  socialLinks?: {
    appUrl?: string;
    whatsappUrl?: string;
    facebookUrl?: string;
    tiktokUrl?: string;
    instagramUrl?: string;
  };
  defaultLinkStrategy?: 'AUTO' | 'APP_ONLY' | 'WHATSAPP_ONLY' | 'BOTH';
  customHashtags?: string[];
}

const PREF_STORAGE_KEY = 'katika_ai_assistant_prefs';
const HISTORY_STORAGE_KEY = 'katika_ai_assistant_history_v1';
const THREADS_STORAGE_KEY = 'katika_ai_assistant_threads_v2';
const ACTIVE_THREAD_ID_KEY = 'katika_ai_assistant_active_thread_id_v2';

export const DEFAULT_PREFERENCES: ChatBotPreferences = {
  tone: 'balanced',
  style: 'pedagogical',
  model: 'gemini-3.8-flash',
  temperatureMode: 'balanced',
  disableStreaming: false,
};

export const AiAdminChatClient = {
  getPreferences(): ChatBotPreferences {
    const copilotSettings = CopilotSettingsService.getSettings();
    let localPrefs: Partial<ChatBotPreferences> = {};
    try {
      const stored = localStorage.getItem(PREF_STORAGE_KEY);
      if (stored) {
        localPrefs = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('[AI Assistant] Error reading preferences:', e);
    }

    return {
      ...DEFAULT_PREFERENCES,
      ...localPrefs,
      model: copilotSettings.geminiModel || localPrefs.model || DEFAULT_PREFERENCES.model,
      temperatureMode: copilotSettings.aiTemperatureMode || 'balanced',
      socialLinks: copilotSettings.socialLinks,
      defaultLinkStrategy: copilotSettings.defaultLinkStrategy,
      customHashtags: copilotSettings.customHashtags,
    };
  },

  savePreferences(prefs: ChatBotPreferences): void {
    try {
      localStorage.setItem(PREF_STORAGE_KEY, JSON.stringify(prefs));
    } catch (e) {
      console.warn('[AI Assistant] Error saving preferences:', e);
    }
  },

  // Multi-thread management
  getThreads(): ChatThread[] {
    try {
      const stored = localStorage.getItem(THREADS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ChatThread[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }

      // Backward compatibility: migrate legacy single history if present
      const legacyHistory = this.getSavedHistory();
      const defaultThread: ChatThread = {
        id: 'thread_default_' + Date.now(),
        title: legacyHistory.length > 0 ? 'Discussion principale' : 'Nouvelle discussion',
        messages: legacyHistory,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isPinned: false,
      };

      this.saveThreads([defaultThread]);
      this.setActiveThreadId(defaultThread.id);
      return [defaultThread];
    } catch (e) {
      console.warn('[AI Assistant] Error reading threads:', e);
      return [
        {
          id: 'thread_fallback',
          title: 'Nouvelle discussion',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isPinned: false,
        },
      ];
    }
  },

  saveThreads(threads: ChatThread[]): void {
    try {
      localStorage.setItem(THREADS_STORAGE_KEY, JSON.stringify(threads));
    } catch (e) {
      console.warn('[AI Assistant] Error saving threads:', e);
    }
  },

  getActiveThreadId(): string | null {
    try {
      return localStorage.getItem(ACTIVE_THREAD_ID_KEY);
    } catch {
      return null;
    }
  },

  setActiveThreadId(threadId: string): void {
    try {
      localStorage.setItem(ACTIVE_THREAD_ID_KEY, threadId);
    } catch (e) {
      console.warn('[AI Assistant] Error setting active thread id:', e);
    }
  },

  getSavedHistory(): ChatMessage[] {
    try {
      const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('[AI Assistant] Error reading history:', e);
    }
    return [];
  },

  saveHistory(messages: ChatMessage[]): void {
    try {
      // Keep up to 30 most recent messages
      const pruned = messages.slice(-30);
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(pruned));
    } catch (e) {
      console.warn('[AI Assistant] Error saving history:', e);
    }
  },

  clearHistory(): void {
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch (e) {
      console.warn('[AI Assistant] Error clearing history:', e);
    }
  },

  cleanClientHistoryItem(content: string): string {
    let text = content || '';
    if (text.includes('```json')) {
      text = text.replace(/```json[\s\S]*?```/g, '[Visuel généré précédemment]');
    }
    text = text.replace(/(\|.*?\|\n){3,}/g, '[Données tabulaires du tour précédent]\n');
    if (text.length > 1200) {
      text = text.slice(0, 900) + '\n...\n' + text.slice(-300);
    }
    return text;
  },

  buildHistoryPayload(messages: ChatMessage[] = []): {
    history: Array<{ role: 'user' | 'model'; text: string }>;
    recentTopics: string[];
  } {
    const valid = (messages || []).filter(
      (m) => !m.isError && m.content && m.content.trim().length > 0
    );

    let lastAssistantIdx = -1;
    for (let i = valid.length - 1; i >= 0; i--) {
      if (valid[i].role === 'assistant') {
        lastAssistantIdx = i;
        break;
      }
    }

    let lastUserIdx = -1;
    if (lastAssistantIdx !== -1) {
      for (let i = lastAssistantIdx - 1; i >= 0; i--) {
        if (valid[i].role === 'user') {
          lastUserIdx = i;
          break;
        }
      }
    }

    if (lastAssistantIdx === -1 || lastUserIdx === -1) {
      return { history: [], recentTopics: [] };
    }

    const userMsg = valid[lastUserIdx];
    const assistantMsg = valid[lastAssistantIdx];

    const cleanUserText = (userMsg.content || '').trim().slice(0, 300);
    const cleanAssistantText = this.cleanClientHistoryItem(assistantMsg.content || '');

    const history: Array<{ role: 'user' | 'model'; text: string }> = [
      { role: 'user', text: cleanUserText },
      { role: 'model', text: cleanAssistantText },
    ];

    const priorUserMsgs: string[] = [];
    for (let i = 0; i < lastUserIdx; i++) {
      if (valid[i].role === 'user') {
        const cleaned = valid[i].content.trim().replace(/\n+/g, ' ').slice(0, 120);
        if (cleaned) {
          priorUserMsgs.push(cleaned);
        }
      }
    }

    const recentTopics = priorUserMsgs.slice(-2);

    return { history, recentTopics };
  },

  buildRequestBody(params: {
    message: string;
    image?: { data: string; mimeType: string; name?: string };
    history?: ChatMessage[];
    config?: ChatBotPreferences;
    metricsSnapshot?: any;
  }): {
    message: string;
    image?: { data: string; mimeType: string; name?: string };
    history: Array<{ role: 'user' | 'model'; text: string }>;
    recentTopics?: string[];
    config: ChatBotPreferences;
    metricsSnapshot?: any;
  } {
    const { history, recentTopics } = this.buildHistoryPayload(params.history || []);
    return {
      message: params.message,
      image: params.image,
      history,
      recentTopics: recentTopics.length > 0 ? recentTopics : undefined,
      config: params.config || this.getPreferences(),
      metricsSnapshot: params.metricsSnapshot,
    };
  },

  async sendMessage(params: {
    message: string;
    image?: { data: string; mimeType: string; name?: string };
    history?: ChatMessage[];
    config?: ChatBotPreferences;
    metricsSnapshot?: any;
  }): Promise<string> {
    const requestBody = this.buildRequestBody(params);

    const response = await tikaFetch('/api/katika/ai-chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Échec de communication avec le serveur IA.');
    }

    return data.reply;
  },

  /**
   * Real-time streaming response using Server-Sent Events (SSE).
   * Automatically falls back to standard HTTP POST if streaming is interrupted,
   * EXCEPT for HTTP 429 rate limit errors which are propagated directly.
   */
  async sendMessageStream(params: {
    message: string;
    image?: { data: string; mimeType: string; name?: string };
    history?: ChatMessage[];
    config?: ChatBotPreferences;
    metricsSnapshot?: any;
    onChunk: (accumulatedText: string, chunk: string) => void;
  }): Promise<string> {
    const requestBody = this.buildRequestBody(params);

    let accumulated = '';
    try {
      const response = await tikaFetch('/api/katika/ai-chat-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      // Gestion des erreurs 4xx (429 rate limit, 400 bad request, etc.) : ne jamais réessayer
      if (response.status >= 400 && response.status < 500) {
        let errMessage = response.status === 429
          ? 'Limite du copilote atteinte, réessaie plus tard.'
          : `Erreur client copilote (${response.status})`;
        try {
          const rawText = await response.text();
          const sseMatch = rawText.match(/data:\s*({.*})/);
          if (sseMatch) {
            const parsed = JSON.parse(sseMatch[1]);
            if (parsed.error) errMessage = parsed.error;
          } else {
            const parsed = JSON.parse(rawText);
            if (parsed.error) errMessage = parsed.error;
          }
        } catch {
          // Utilisation du message par défaut
        }
        const clientErr = new Error(errMessage);
        (clientErr as any).isClientError = true;
        (clientErr as any).status = response.status;
        if (response.status === 429) {
          (clientErr as any).isRateLimit = true;
        }
        throw clientErr;
      }

      if (!response.ok || !response.body) {
        const httpErr = new Error(`HTTP ${response.status}: Streaming indisponible`);
        (httpErr as any).status = response.status;
        throw httpErr;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;

          try {
            const parsed = JSON.parse(payload);
            if (parsed.error) {
              const streamErr = new Error(parsed.error);
              if (parsed.error.toLowerCase().includes('limite') || parsed.error.includes('429')) {
                (streamErr as any).isRateLimit = true;
              }
              (streamErr as any).isClientError = true;
              throw streamErr;
            }
            if (parsed.text) {
              accumulated += parsed.text;
              params.onChunk(accumulated, parsed.text);
            }
          } catch (e: any) {
            if (e.isRateLimit || e.isClientError || (e.message && !e.message.includes('JSON'))) {
              throw e;
            }
          }
        }
      }

      if (accumulated && accumulated.trim().length > 0) {
        return accumulated;
      }

      // Si aucun texte n'a été reçu via le stream et qu'aucune erreur 4xx n'a été levée
      return await this.sendMessage(params);
    } catch (streamError: any) {
      // 1. Ne JAMAIS relancer sur une erreur 4xx (quota 429, 400, etc.)
      if (
        streamError?.isClientError ||
        streamError?.isRateLimit ||
        (streamError?.status && streamError.status >= 400 && streamError.status < 500) ||
        (streamError?.message &&
          (streamError.message.toLowerCase().includes('limite du copilote') ||
            streamError.message.includes('429')))
      ) {
        throw streamError;
      }

      // 2. Si du texte partiel a déjà été reçu, ne jamais relancer un second appel (éviter doublon et gaspillage quota)
      if (accumulated && accumulated.trim().length > 0) {
        console.warn('[AI Assistant Client] Stream interrompu après réception partielle :', streamError);
        return accumulated;
      }

      // 3. Repli statique UNIQUEMENT en cas d'erreur réseau / 5xx sans aucun texte reçu
      console.warn('[AI Assistant Client] Streaming error (réseau/5xx sans texte reçu), fallback to static fetch:', streamError);
      const staticResult = await this.sendMessage(params);
      params.onChunk(staticResult, staticResult);
      return staticResult;
    }
  },
};
