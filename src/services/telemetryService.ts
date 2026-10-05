import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  orderBy,
  limit,
  getCountFromServer,
  where,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { getPublicParamNumber } from './publicConfig';
import { getGuestId, getLocalPlayerName } from './identity';

export type GameRecordStatus = 'completed' | 'in_progress' | 'abandoned';

/**
 * Normalizes and qualifies a game record status according to Katika Arbitrage 1:
 * - Explicit quit or isAbandoned => 'abandoned'
 * - 'completed' => 'completed'
 * - 'in_progress' with > 30 min of inactivity => auto-switches to 'abandoned'
 * - 'in_progress' within last 30 min => 'in_progress' (live)
 */
export function qualifyRecordStatus(
  rawStatus?: string,
  isAbandoned?: boolean,
  updatedAt?: number,
  createdAt?: number,
  isFinalWin?: boolean
): GameRecordStatus {
  if (rawStatus === 'abandoned' || isAbandoned) {
    return 'abandoned';
  }
  if (rawStatus === 'completed' || isFinalWin) {
    return 'completed';
  }
  if (rawStatus === 'in_progress') {
    const lastActive = updatedAt || createdAt || 0;
    if (lastActive > 0 && Date.now() - lastActive > getPublicParamNumber('recordInactivityAbandonMinutes') * 60 * 1000) {
      return 'abandoned';
    }
    return 'in_progress';
  }
  // Retroactive default for legacy records without status
  return 'completed';
}

export interface GameTelemetryRecord {
  id?: string;
  creatorUid?: string; // UID Firebase de l'auteur de l'enregistrement (pour corroboration)
  roomId?: string; // Identifiant de la table/salon multijoueur
  mancheNumber?: number; // Numéro de manche officiel (fourni par le serveur de jeu, identique pour toute la table)
  mode: 'SOLO' | 'MULTIPLAYER';
  playerCount: number; // 2, 3, 4
  winType: 'STANDARD' | 'KORA' | 'DOUBLE_KORA' | 'THREE_SEVENS' | 'UNDER_21';
  winnerName: string;
  winnerId?: string;
  durationSeconds?: number;
  roundsCount: number; // Nombre de parties (5 tours) disputées dans cette manche
  partiesCount?: number; // Alias explicite pour les parties (5 tours)
  manchesCount?: number; // Compatibilité ascendante
  isMancheFinalWin?: boolean; // Vrai si victoire finale de la manche (élimination des adversaires)
  isPartieFinalWin?: boolean; // Compatibilité ascendante
  partieEvent?: { partieNumber: number; partieCompleted: boolean; winnerIsHuman?: boolean }; // Fin de partie (solo) : sert à la file d'envoi au serveur
  status?: GameRecordStatus; // 'completed' (Terminée), 'in_progress' (En cours), ou 'abandoned' (Abandonnée)
  isAbandoned?: boolean; // Vrai si la manche ou partie s'est terminée par un abandon
  leaverId?: string; // ID exact du joueur ayant quitté / abandonné
  leaverName?: string; // Nom du joueur ayant quitté
  abandonmentReason?: 'RAGE_QUIT' | 'POST_KORA' | 'EARLY_QUIT' | 'USER_EXIT' | 'CONNECTION_LOST';
  trickNumberAtQuit?: number;
  potWon?: number;
  potGross?: number; // Total misé à la table
  baseBet?: number; // Mise unitaire par joueur
  currency?: 'CHIPS' | 'XAF'; // Devise : Jetons virtuels ou Francs CFA réels
  aiDifficulty?: 'EASY' | 'NORMAL' | 'EXPERT' | 'GRAND_MASTER' | string;
  createdAt: number;
  updatedAt?: number;
  players?: Array<{
    id: string;
    name: string;
    isHuman: boolean;
    score?: number;
    isWinner?: boolean;
    chipsDelta?: number;
  }>;
}

export interface GlobalMancheCounts {
  totalStarted: number; // Total réel de toutes les manches débutées
  totalCompleted: number; // Total des manches menées jusqu'au bout
  totalInProgress: number; // Total des manches en direct actives (< 30 min)
  totalAbandoned: number; // Total des manches abandonnées / forfaits (> 30 min ou quit)
  completionRate: number; // Taux de complétion global en %
}

const LOCAL_STORAGE_KEY = 'njambo_telemetry_game_records';
const WRITE_ERRORS_STORAGE_KEY = 'njambo_telemetry_write_errors';
const MAX_STORED_WRITE_ERRORS = 20;

/**
 * Supprime récursivement les propriétés `undefined` (objets et tableaux).
 * Firestore refuse tout document qui en contient.
 */
function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      return value;
    }
    const cleaned: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (val !== undefined) {
        cleaned[key] = stripUndefinedDeep(val);
      }
    }
    return cleaned as T;
  }
  return value;
}

/**
 * Garde en local les dernières erreurs d'écriture Firestore (20 max)
 * pour qu'un échec ne soit plus silencieux.
 */
function rememberWriteError(docId: string, err: unknown): void {
  try {
    const raw = localStorage.getItem(WRITE_ERRORS_STORAGE_KEY);
    const list: Array<{ docId: string; at: number; message: string }> = raw ? JSON.parse(raw) : [];
    list.unshift({
      docId,
      at: Date.now(),
      message: err instanceof Error ? err.message : String(err),
    });
    localStorage.setItem(WRITE_ERRORS_STORAGE_KEY, JSON.stringify(list.slice(0, MAX_STORED_WRITE_ERRORS)));
  } catch (e) {
    // ignore
  }
}

// ─── File d'attente des parties SOLO (envoi au serveur) ───────────────────────
// Le solo se joue parfois hors ligne : chaque événement de partie est mis en file sur l'appareil,
// puis envoyé au serveur (POST /api/telemetry/solo-batch) dès que le réseau le permet.
// Aucun minuteur : l'envoi est déclenché par des événements (partie enregistrée, retour du réseau,
// retour au premier plan, changement de compte, démarrage de l'application).
const SOLO_QUEUE_STORAGE_KEY = 'njambo_solo_sync_queue';
const SOLO_QUEUE_MAX_EVENTS = 300;
const SOLO_SYNC_BATCH_SIZE = 50;

interface QueuedSoloEvent {
  qid: string;
  actorUid: string | null; // UID Google si le joueur était connecté, sinon null (invité)
  guestId: string;
  displayName: string;
  item: Record<string, unknown>;
}

let soloFlushInProgress = false;

function readSoloQueue(): QueuedSoloEvent[] {
  try {
    const raw = localStorage.getItem(SOLO_QUEUE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function writeSoloQueue(queue: QueuedSoloEvent[]): void {
  try {
    localStorage.setItem(SOLO_QUEUE_STORAGE_KEY, JSON.stringify(queue.slice(-SOLO_QUEUE_MAX_EVENTS)));
  } catch (e) {
    console.warn('[TelemetryService] Could not write solo sync queue:', e);
  }
}

function removeFromSoloQueue(qids: string[]): void {
  if (qids.length === 0) return;
  const toRemove = new Set(qids);
  writeSoloQueue(readSoloQueue().filter((ev) => !toRemove.has(ev.qid)));
}

/** Transforme un enregistrement solo en événement de partie attendu par le serveur. */
function buildSoloQueueItem(entry: GameTelemetryRecord): Record<string, unknown> | null {
  if (!entry.id) return null;
  const partiesCount = Math.max(1, Math.round(entry.partiesCount ?? entry.roundsCount ?? 1));
  const abandoned = Boolean(entry.isAbandoned) || entry.status === 'abandoned';
  const mancheStatus = abandoned ? 'abandoned' : entry.status === 'completed' ? 'completed' : 'in_progress';
  const partieCompleted = entry.partieEvent?.partieCompleted === true || mancheStatus === 'completed';
  const partieStatus = partieCompleted ? 'completed' : abandoned ? 'abandoned' : 'in_progress';
  const partieNumber = Math.max(1, Math.round(entry.partieEvent?.partieNumber ?? partiesCount));
  const humanWinnerFromPlayers = Boolean(entry.players?.some((p) => p.isHuman && p.isWinner));
  return {
    mancheId: entry.id,
    partieNumber,
    partieStatus,
    mancheStatus,
    partiesCount: Math.max(partiesCount, partieNumber),
    winType: partieCompleted ? entry.winType : undefined,
    winnerIsHuman: entry.partieEvent?.winnerIsHuman ?? humanWinnerFromPlayers,
    playerCount: entry.playerCount,
    aiDifficulty: typeof entry.aiDifficulty === 'string' ? entry.aiDifficulty.toUpperCase() : undefined,
    baseBet: entry.baseBet,
    startedAt: entry.createdAt,
    endedAt: partieStatus === 'in_progress' ? undefined : Date.now(),
    abandonmentReason: abandoned ? entry.abandonmentReason : undefined,
    trickNumberAtQuit: abandoned ? entry.trickNumberAtQuit : undefined,
  };
}

function enqueueSoloEvent(entry: GameTelemetryRecord): void {
  const item = buildSoloQueueItem(entry);
  if (!item) return;
  const user = auth.currentUser;
  const actorUid = user && !user.isAnonymous ? user.uid : null;
  const kept = readSoloQueue().filter(
    (ev) =>
      !(
        ev.actorUid === actorUid &&
        ev.item.mancheId === item.mancheId &&
        ev.item.partieNumber === item.partieNumber &&
        ev.item.partieStatus === item.partieStatus
      )
  );
  kept.push({
    qid: `q_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    actorUid,
    guestId: getGuestId(),
    displayName: (actorUid && user?.displayName) || getLocalPlayerName(),
    item,
  });
  writeSoloQueue(kept);
}

/** Envoie un lot ; renvoie les événements à retirer de la file et si l'on peut continuer. */
async function sendSoloChunk(chunk: QueuedSoloEvent[]): Promise<{ doneQids: string[]; canContinue: boolean }> {
  const first = chunk[0];
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const body: Record<string, unknown> = {
    items: chunk.map((ev) => ev.item),
    displayName: first.displayName,
  };
  try {
    if (first.actorUid) {
      const user = auth.currentUser;
      if (!user || user.uid !== first.actorUid) return { doneQids: [], canContinue: true };
      headers.Authorization = `Bearer ${await user.getIdToken()}`;
    } else {
      body.guestId = first.guestId;
    }
    const res = await fetch('/api/telemetry/solo-batch', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    let json: any = null;
    try {
      json = await res.json();
    } catch (e) {
      json = null;
    }
    const done = new Set<number>();
    if (json && Array.isArray(json.accepted)) {
      json.accepted.forEach((i: unknown) => typeof i === 'number' && done.add(i));
    }
    if (json && Array.isArray(json.rejected)) {
      json.rejected.forEach((r: any) => typeof r?.index === 'number' && done.add(r.index));
    }
    if (res.status === 400) {
      chunk.forEach((_, idx) => done.add(idx)); // lot jugé invalide : inutile de le renvoyer
    }
    return {
      doneQids: chunk.filter((_, idx) => done.has(idx)).map((ev) => ev.qid),
      canContinue: res.status < 500 && res.status !== 429,
    };
  } catch (err) {
    console.warn('[TelemetryService] Solo sync will retry later:', err);
    return { doneQids: [], canContinue: false };
  }
}

/** Envoie la file au serveur. Sans réseau ou en cas d'échec, la file est conservée pour le prochain déclencheur. */
async function flushSoloQueue(): Promise<void> {
  if (soloFlushInProgress) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  soloFlushInProgress = true;
  try {
    const user = auth.currentUser;
    const currentUid = user && !user.isAnonymous ? user.uid : null;
    const groups = new Map<string, QueuedSoloEvent[]>();
    for (const ev of readSoloQueue()) {
      if (ev.actorUid && ev.actorUid !== currentUid) continue; // attend la reconnexion de ce compte
      const key = ev.actorUid ? `g:${ev.actorUid}` : `u:${ev.guestId}`;
      const list = groups.get(key) || [];
      list.push(ev);
      groups.set(key, list);
    }
    for (const events of groups.values()) {
      for (let i = 0; i < events.length; i += SOLO_SYNC_BATCH_SIZE) {
        const outcome = await sendSoloChunk(events.slice(i, i + SOLO_SYNC_BATCH_SIZE));
        removeFromSoloQueue(outcome.doneQids);
        if (!outcome.canContinue) return;
      }
    }
  } catch (err) {
    console.warn('[TelemetryService] Solo queue flush error:', err);
  } finally {
    soloFlushInProgress = false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void flushSoloQueue();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flushSoloQueue();
  });
  // Se déclenche aussi au démarrage, une fois l'état de connexion connu.
  onAuthStateChanged(auth, () => {
    void flushSoloQueue();
  });
}

export const telemetryService = {
  /**
   * Records a game or round (in_progress or completed) in Firestore + local cache (Idempotent)
   * Note: This strictly persists records to njambo_game_records without modifying profile stats.
   */
  recordGame: async (record: Omit<GameTelemetryRecord, 'createdAt'> & { createdAt?: number }): Promise<void> => {
    const docId = record.id || `rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    
    // Default status: if not explicitly supplied, treat final win as 'completed', quit as 'in_progress'
    const status: GameRecordStatus =
      record.status || (record.isAbandoned ? 'in_progress' : 'completed');

    const currentUid = auth.currentUser?.uid;
    const entry: GameTelemetryRecord = {
      ...record,
      id: docId,
      creatorUid: currentUid || record.creatorUid || 'guest',
      roomId: record.roomId || (record.mode === 'MULTIPLAYER' ? 'multiplayer' : undefined),
      mancheNumber: record.mancheNumber !== undefined ? record.mancheNumber : (record.mode === 'MULTIPLAYER' ? 1 : undefined),
      status,
      partiesCount: record.partiesCount ?? record.roundsCount,
      isMancheFinalWin: record.isMancheFinalWin ?? (status === 'completed'),
      createdAt: record.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    // 1. Solo : l'envoi passe par la file d'attente puis le serveur (jamais d'écriture directe dans Firestore).
    if (entry.mode === 'SOLO') {
      enqueueSoloEvent(entry);
      void flushSoloQueue();
      return;
    }

    // 2. Multijoueur : le serveur est l'unique écrivain de la fiche de manche et du journal de partie
    //    (voir server/rooms/gameRecordStore.ts). Le téléphone n'écrit plus rien, pour éviter tout double comptage.
  },

  /**
   * Fast server-side aggregation for total manches started, completed, and in-progress.
   * Leverages getCountFromServer for instantaneous and cost-free total calculation without downloading all documents.
   * All legacy documents without a status field are seamlessly treated as completed.
   */
  getGlobalMancheCounts: async (): Promise<GlobalMancheCounts> => {
    try {
      const colRef = collection(db, 'njambo_game_records');
      const [totalSnap, inProgressSnap, abandonedSnap] = await Promise.all([
        getCountFromServer(colRef),
        getCountFromServer(query(colRef, where('status', '==', 'in_progress'))),
        getCountFromServer(query(colRef, where('status', '==', 'abandoned'))),
      ]);

      const totalStarted = totalSnap.data().count;
      const totalInProgress = inProgressSnap.data().count;
      const totalAbandoned = abandonedSnap.data().count;
      // Retroactive rule: all legacy documents lacking status are treated as completed
      const totalCompleted = Math.max(0, totalStarted - totalInProgress - totalAbandoned);
      const completionRate = totalStarted > 0 ? Math.round((totalCompleted / totalStarted) * 100) : 100;

      return {
        totalStarted,
        totalCompleted,
        totalInProgress,
        totalAbandoned,
        completionRate,
      };
    } catch (err) {
      console.warn('[TelemetryService] Could not query getCountFromServer, fallback to cache:', err);
      try {
        const local = localStorage.getItem(LOCAL_STORAGE_KEY);
        const localList: GameTelemetryRecord[] = local ? JSON.parse(local) : [];
        const totalStarted = localList.length;
        let totalCompleted = 0;
        let totalAbandoned = 0;
        let totalInProgress = 0;

        localList.forEach((r) => {
          const st = qualifyRecordStatus(r.status, r.isAbandoned, r.updatedAt, r.createdAt, r.isMancheFinalWin);
          if (st === 'completed') totalCompleted++;
          else if (st === 'abandoned') totalAbandoned++;
          else totalInProgress++;
        });

        const completionRate = totalStarted > 0 ? Math.round((totalCompleted / totalStarted) * 100) : 100;
        return { totalStarted, totalCompleted, totalInProgress, totalAbandoned, completionRate };
      } catch (e) {
        return { totalStarted: 0, totalCompleted: 0, totalInProgress: 0, totalAbandoned: 0, completionRate: 100 };
      }
    }
  },

  /**
   * Fetches real game records from Firestore with local cache fallback.
   * Uncapped limit (default 1000) allowing full historical analysis.
   * All records are normalized with qualifyRecordStatus (Arbitrage 1: >30min inactivity => abandoned).
   */
  getGameRecords: async (maxCount = 50): Promise<GameTelemetryRecord[]> => {
    const memoryRecords: GameTelemetryRecord[] = [];

    // 1. Try Firestore
    try {
      const q = query(
        collection(db, 'njambo_game_records'),
        orderBy('createdAt', 'desc'),
        limit(maxCount)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        snapshot.forEach((docSnap) => {
          const rawData = docSnap.data() as Omit<GameTelemetryRecord, 'id'>;
          const normalizedStatus = qualifyRecordStatus(
            rawData.status,
            rawData.isAbandoned,
            rawData.updatedAt,
            rawData.createdAt,
            rawData.isMancheFinalWin
          );
          const isAbandoned = normalizedStatus === 'abandoned' || Boolean(rawData.isAbandoned);
          const winnerName = (isAbandoned && (!rawData.winnerName || rawData.winnerName === 'En cours...'))
            ? 'Abandon / Forfait'
            : (rawData.winnerName || (isAbandoned ? 'Abandon / Forfait' : 'Joueur'));

          memoryRecords.push({
            id: docSnap.id,
            ...rawData,
            status: normalizedStatus,
            isAbandoned,
            winnerName,
          });
        });
      }
    } catch (err) {
      console.warn('[TelemetryService] Could not query Firestore records, falling back to cache:', err);
    }

    // 2. Merge with Local Cache
    try {
      const local = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (local) {
        const localList: GameTelemetryRecord[] = JSON.parse(local);
        localList.forEach((lRec) => {
          if (!memoryRecords.some((r) => r.id === lRec.id)) {
            const normalizedStatus = qualifyRecordStatus(
              lRec.status,
              lRec.isAbandoned,
              lRec.updatedAt,
              lRec.createdAt,
              lRec.isMancheFinalWin
            );
            const isAbandoned = normalizedStatus === 'abandoned' || Boolean(lRec.isAbandoned);
            const winnerName = (isAbandoned && (!lRec.winnerName || lRec.winnerName === 'En cours...'))
              ? 'Abandon / Forfait'
              : (lRec.winnerName || (isAbandoned ? 'Abandon / Forfait' : 'Joueur'));

            memoryRecords.push({
              ...lRec,
              status: normalizedStatus,
              isAbandoned,
              winnerName,
            });
          }
        });
      }
    } catch (e) {
      // ignore
    }

    // Sort descending by createdAt
    return memoryRecords.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  },
};

