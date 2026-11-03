import { getFirebaseAdminAppDb } from '../firebaseAdmin';
import { recordServerReads } from './readBudget';

/**
 * Discussions du copilote, gardées par le serveur pour les retrouver sur PC et sur téléphone. Chaque admin ne voit que les siennes
 * (le serveur filtre par compte, la collection est fermée aux navigateurs). Texte seulement : les images jointes ne sont jamais gardées.
 */

export const COPILOT_THREADS_COLLECTION = 'katika_copilot_threads';
const MAX_TITLE = 80;
const MAX_CONTENT = 8000;

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isError?: boolean;
}

export interface StoredThread {
  id: string;
  title: string;
  isPinned: boolean;
  createdAt: number;
  updatedAt: number;
  messages: StoredMessage[];
}

const ID_PATTERN = /^[\w-]{1,80}$/;

/** Nettoie une discussion envoyée par l'écran : texte borné, messages récents seulement, aucune image. */
export function sanitizeThread(raw: unknown, maxMessages: number): StoredThread | null {
  const t = raw as Partial<StoredThread> | null;
  if (!t || typeof t !== 'object' || typeof t.id !== 'string' || !ID_PATTERN.test(t.id)) return null;
  const messages: StoredMessage[] = (Array.isArray(t.messages) ? t.messages : [])
    .filter((m): m is StoredMessage => !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-maxMessages)
    .map((m) => {
      const message: StoredMessage = {
        id: String(m.id || '').slice(0, 80),
        role: m.role,
        content: m.content.slice(0, MAX_CONTENT),
        timestamp: Number(m.timestamp) || 0,
      };
      if (m.isError === true) message.isError = true;
      return message;
    });
  return {
    id: t.id,
    title: String(t.title || 'Nouvelle discussion').slice(0, MAX_TITLE),
    isPinned: t.isPinned === true,
    createdAt: Number(t.createdAt) || 0,
    updatedAt: Number(t.updatedAt) || 0,
    messages,
  };
}

/** Document d'un admin : le compte fait partie de l'identifiant, un admin ne peut pas toucher la discussion d'un autre. */
export const threadDocId = (uid: string, threadId: string) => `${uid}__${threadId}`;

const collectionRef = () => getFirebaseAdminAppDb().collection(COPILOT_THREADS_COLLECTION);

export async function listThreads(uid: string, maxThreads: number): Promise<StoredThread[]> {
  const snap = await collectionRef().where('ownerUid', '==', uid).get();
  recordServerReads(snap.size);
  return snap.docs
    .map((d) => sanitizeThread(d.data(), Number.MAX_SAFE_INTEGER))
    .filter((t): t is StoredThread => t !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, maxThreads);
}

export async function saveThread(uid: string, thread: StoredThread): Promise<void> {
  await collectionRef().doc(threadDocId(uid, thread.id)).set({ ...thread, ownerUid: uid });
}

export async function deleteThread(uid: string, threadId: string): Promise<void> {
  await collectionRef().doc(threadDocId(uid, threadId)).delete();
}

/** Au-delà du plafond, les discussions les plus anciennes non épinglées sont supprimées. */
export function threadsToPrune(threads: StoredThread[], maxThreads: number): string[] {
  if (threads.length <= maxThreads) return [];
  const sorted = [...threads].sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || b.updatedAt - a.updatedAt);
  return sorted.slice(maxThreads).filter((t) => !t.isPinned).map((t) => t.id);
}
