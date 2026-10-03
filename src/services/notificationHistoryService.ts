import { getPublicParamNumber } from './publicConfig';

/**
 * Historique des notifications du joueur (cloche), stocké localement sur l'appareil.
 *
 * Conception « Kora Cash ready » : chaque notification a un type extensible, un identifiant stable
 * (clé de fusion le jour où l'historique sera synchronisé via Firestore) et une date de mise à jour.
 * Aucun montant, aucun secret, aucune donnée de paiement ne doit être stocké ici.
 *
 * Règle permanente : aucun délai codé en dur. Le plafond de l'historique vient du registre
 * (notificationHistoryMaxItems, réglable dans katika).
 */

export type NotificationKind = 'DIRECT_INVITE' | 'FRIEND_REQUEST';
export type NotificationOutcome = 'ACCEPTED' | 'DECLINED';

export interface HistoryNotification {
  /** Identifiant stable : « invite:<id> » ou « friend:<uid>:<createdAt> ». */
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  read: boolean;
  actorId?: string;
  actorName?: string;
  actorAvatar?: string;
  roomCode?: string;
  /** Invitations uniquement : horodatage d'expiration (serveur). */
  expiresAt?: number;
  /** Renseigné quand la notification a été traitée (acceptée / refusée). */
  outcome?: NotificationOutcome;
}

export type RecordInput = Omit<HistoryNotification, 'read' | 'updatedAt'> & {
  read?: boolean;
  updatedAt?: number;
};

// ---------------------------------------------------------------------------
// Fonctions pures (testées) : aucune dépendance au navigateur.
// ---------------------------------------------------------------------------

/** Trie du plus récent au plus ancien et supprime les plus anciens au-delà du plafond. */
export function applyCap(items: HistoryNotification[], maxItems: number): HistoryNotification[] {
  const safeMax = Math.max(1, Math.floor(maxItems));
  const sorted = [...items].sort((a, b) => b.createdAt - a.createdAt);
  return sorted.length > safeMax ? sorted.slice(0, safeMax) : sorted;
}

/** Ajoute ou met à jour (par id) une notification. Une notification déjà lue le reste. */
export function upsertNotification(
  items: HistoryNotification[],
  incoming: RecordInput,
  now: number,
  maxItems: number
): HistoryNotification[] {
  const existing = items.find((item) => item.id === incoming.id);
  if (existing) {
    const merged: HistoryNotification = {
      ...existing,
      ...incoming,
      createdAt: existing.createdAt,
      read: existing.read,
      outcome: existing.outcome ?? incoming.outcome,
      updatedAt: incoming.updatedAt ?? now,
    };
    return applyCap(items.map((item) => (item.id === incoming.id ? merged : item)), maxItems);
  }
  const created: HistoryNotification = {
    ...incoming,
    read: incoming.read ?? false,
    updatedAt: incoming.updatedAt ?? now,
  };
  return applyCap([created, ...items], maxItems);
}

export function markReadInList(items: HistoryNotification[], id: string, now: number): HistoryNotification[] {
  return items.map((item) => (item.id === id && !item.read ? { ...item, read: true, updatedAt: now } : item));
}

export function markAllReadInList(items: HistoryNotification[], now: number): HistoryNotification[] {
  return items.map((item) => (item.read ? item : { ...item, read: true, updatedAt: now }));
}

export function removeFromList(items: HistoryNotification[], id: string): HistoryNotification[] {
  return items.filter((item) => item.id !== id);
}

export function resolveInList(
  items: HistoryNotification[],
  id: string,
  outcome: NotificationOutcome,
  now: number
): HistoryNotification[] {
  return items.map((item) =>
    item.id === id && !item.outcome ? { ...item, outcome, updatedAt: now } : item
  );
}

export function countUnread(items: HistoryNotification[]): number {
  return items.reduce((total, item) => (item.read ? total : total + 1), 0);
}

/**
 * Une notification est « actionnable » tant qu'on peut encore agir dessus :
 * une invitation expirée ou déjà traitée ne l'est plus (aucun bouton d'action).
 */
export function isActionable(item: HistoryNotification, now: number): boolean {
  if (item.outcome) return false;
  if (item.kind === 'DIRECT_INVITE') return typeof item.expiresAt === 'number' && item.expiresAt > now;
  return true;
}

export function isExpiredInvite(item: HistoryNotification, now: number): boolean {
  return item.kind === 'DIRECT_INVITE' && !item.outcome && typeof item.expiresAt === 'number' && item.expiresAt <= now;
}

function sanitizeList(raw: unknown): HistoryNotification[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is HistoryNotification =>
      !!item &&
      typeof item === 'object' &&
      typeof (item as HistoryNotification).id === 'string' &&
      ((item as HistoryNotification).kind === 'DIRECT_INVITE' || (item as HistoryNotification).kind === 'FRIEND_REQUEST') &&
      typeof (item as HistoryNotification).createdAt === 'number'
  );
}

// ---------------------------------------------------------------------------
// Stockage local + abonnement (compatible useSyncExternalStore).
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = 'njambo_notif_history_v1:';
const TOMBSTONE_PREFIX = 'njambo_notif_removed_v1:';
/** Mémoire des notifications supprimées par le joueur : évite qu'une demande encore en attente réapparaisse. */
const MAX_TOMBSTONES = 300;

let ownerKey = 'guest';
let items: HistoryNotification[] = [];
let tombstones: string[] = [];
let loadedFor: string | null = null;
const listeners = new Set<() => void>();

function readStorage(key: string): unknown {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: unknown): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota ou navigation privée : l'historique reste en mémoire pour la session
  }
}

function ensureLoaded(): void {
  if (loadedFor === ownerKey) return;
  items = applyCap(sanitizeList(readStorage(STORAGE_PREFIX + ownerKey)), getMax());
  const rawTomb = readStorage(TOMBSTONE_PREFIX + ownerKey);
  tombstones = Array.isArray(rawTomb) ? rawTomb.filter((t): t is string => typeof t === 'string') : [];
  loadedFor = ownerKey;
}

function getMax(): number {
  return getPublicParamNumber('notificationHistoryMaxItems');
}

function commit(next: HistoryNotification[]): void {
  items = next;
  writeStorage(STORAGE_PREFIX + ownerKey, items);
  listeners.forEach((listener) => listener());
}

function addTombstones(ids: string[]): void {
  if (ids.length === 0) return;
  tombstones = [...tombstones, ...ids].slice(-MAX_TOMBSTONES);
  writeStorage(TOMBSTONE_PREFIX + ownerKey, tombstones);
}

export const notificationHistory = {
  getSnapshot(): HistoryNotification[] {
    ensureLoaded();
    return items;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /** Compte propriétaire de l'historique : uid Google, ou null pour un invité. */
  setOwner(uid: string | null): void {
    const next = uid || 'guest';
    if (next === ownerKey && loadedFor === ownerKey) return;
    ownerKey = next;
    loadedFor = null;
    ensureLoaded();
    listeners.forEach((listener) => listener());
  },

  getOwner(): string {
    return ownerKey;
  },

  record(input: RecordInput): void {
    ensureLoaded();
    if (tombstones.includes(input.id)) return;
    commit(upsertNotification(items, input, Date.now(), getMax()));
  },

  markRead(id: string): void {
    ensureLoaded();
    const next = markReadInList(items, id, Date.now());
    if (next.some((item, index) => item !== items[index])) commit(next);
  },

  markAllRead(): void {
    ensureLoaded();
    if (countUnread(items) === 0) return;
    commit(markAllReadInList(items, Date.now()));
  },

  resolve(id: string, outcome: NotificationOutcome): void {
    ensureLoaded();
    const next = resolveInList(items, id, outcome, Date.now());
    if (next.some((item, index) => item !== items[index])) commit(next);
  },

  remove(id: string): void {
    ensureLoaded();
    addTombstones([id]);
    commit(removeFromList(items, id));
  },

  clearAll(): void {
    ensureLoaded();
    addTombstones(items.map((item) => item.id));
    commit([]);
  },

  getUnreadCount(): number {
    ensureLoaded();
    return countUnread(items);
  },
};

/** Réservé aux tests : remet le module à zéro. */
export function resetNotificationHistoryForTests(): void {
  ownerKey = 'guest';
  items = [];
  tombstones = [];
  loadedFor = null;
  listeners.clear();
}
