/**
 * Synchronisation des discussions du copilote entre PC et téléphone. Le serveur garde le texte de chaque discussion pour le seul
 * compte qui l'a écrite ; l'écran garde aussi une copie locale, séparée par compte, pour s'ouvrir sans attendre le réseau.
 * Pas de minuterie : une discussion est envoyée quand elle change (message envoyé, réponse reçue, titre, épingle, suppression).
 */
import type { ChatMessage, ChatThread } from './aiAdminChatClient';

export interface ThreadSyncState {
  /** Date de modification de chaque discussion déjà envoyée au serveur. */
  synced: Record<string, number>;
}

/** Copie sans image : les images jointes ne sont gardées ni dans le navigateur ni sur le serveur. */
export function textOnlyThread(thread: ChatThread): ChatThread {
  return {
    ...thread,
    messages: thread.messages.map((m): ChatMessage => {
      if (!m.image) return m;
      const { image, ...rest } = m;
      return { ...rest, content: rest.content || `[Image jointe : ${image.name || 'capture'}]` };
    }),
  };
}

/**
 * Réunit les discussions locales et celles du serveur. Pour une même discussion, la plus récente l'emporte.
 * Une discussion locale déjà envoyée mais absente du serveur a été supprimée sur un autre appareil : elle disparaît.
 * Une discussion locale jamais envoyée est gardée (elle partira au prochain envoi).
 */
export function mergeThreads(local: ChatThread[], remote: ChatThread[], state: ThreadSyncState): ChatThread[] {
  const byId = new Map<string, ChatThread>();
  for (const t of remote) byId.set(t.id, t);
  for (const t of local) {
    const fromServer = byId.get(t.id);
    if (fromServer) {
      if (t.updatedAt > fromServer.updatedAt) byId.set(t.id, t);
    } else if (state.synced[t.id] === undefined) {
      byId.set(t.id, t);
    }
  }
  return [...byId.values()].sort((a, b) => Number(!!b.isPinned) - Number(!!a.isPinned) || b.updatedAt - a.updatedAt);
}

/** Ce qu'il faut envoyer ou supprimer sur le serveur pour qu'il rejoigne la liste locale. */
export function pendingChanges(threads: ChatThread[], state: ThreadSyncState): { toSave: ChatThread[]; toDelete: string[] } {
  const ids = new Set(threads.map((t) => t.id));
  return {
    toSave: threads.filter((t) => t.messages.length > 0 && state.synced[t.id] !== t.updatedAt),
    toDelete: Object.keys(state.synced).filter((id) => !ids.has(id)),
  };
}
