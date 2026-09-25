import crypto from 'crypto';
import { getFirebaseAdminAppDb } from '../firebaseAdmin';
import { getEngineConfig } from '../engine/engineConfig';
import type { MultiplayerRoom } from '../../src/types';

/**
 * Persistance des tables en cours dans Firestore (collection server_rooms), pour les restaurer si le
 * serveur redémarre ou est redéployé. Accès uniquement par le SDK admin (les mains des joueurs y
 * figurent) ; les règles Firestore refusent tout accès client. Aucun secret n'y est jamais stocké : les
 * jetons de reconnexion des invités sont réduits à une empreinte SHA-256, jamais conservés en clair.
 */
const COLLECTION = 'server_rooms';
const SCHEMA_VERSION = 1;

// Un échec de sauvegarde en arrière-plan (ex. identifiants Google indisponibles) ne doit jamais faire
// planter le serveur, ni interrompre une suite de tests qui exerce ce module indirectement (via
// broadcastRoomState) : il est journalisé, jamais laissé sans gestion. Défense en profondeur, en plus
// du filet déjà posé dans server.ts pour le processus serveur lui-même.
process.on('unhandledRejection', (reason: unknown) => {
  console.warn('[RoomSnapshot] Rejet de promesse non géré (journalisé, ignoré) :', (reason as any)?.message || reason);
});

export interface RestoredRoomSnapshot {
  schemaVersion: number;
  savedAt: number;
  room: MultiplayerRoom;
  tokenFingerprints: Record<string, string>; // playerId -> SHA-256(reconnectToken)
}

export function hashReconnectToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

interface PendingState {
  timer: NodeJS.Timeout | null;
  lastWriteAt: number;
}
const pending = new Map<string, PendingState>();

// Compteur d'écritures quotidien, en mémoire (protection de quota ; se réinitialise à chaque redémarrage,
// ce qui est sans risque puisqu'un redémarrage ne peut que réduire la pression d'écriture).
let writesToday = 0;
let writesDayKey = new Date().toISOString().slice(0, 10);
function checkAndCountDailyWrite(maxPerDay: number): boolean {
  const todayKey = new Date().toISOString().slice(0, 10);
  if (todayKey !== writesDayKey) {
    writesDayKey = todayKey;
    writesToday = 0;
  }
  if (writesToday >= maxPerDay) return false;
  writesToday += 1;
  return true;
}

function buildTokenFingerprints(roomCode: string, room: MultiplayerRoom): Record<string, string> {
  // Import tardif pour éviter une dépendance circulaire avec roomManager.ts.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { RoomManager } = require('./roomManager');
  const tokens: Record<string, string> = {};
  for (const p of room.players || []) {
    if (!p.isHuman) continue;
    const token: string | undefined = RoomManager.getRoomPlayerToken?.(roomCode, p.id);
    if (token) tokens[p.id] = hashReconnectToken(token);
  }
  return tokens;
}

/** Écriture immédiate, sans attendre le repos ni l'intervalle minimal (utilisée à l'arrêt du serveur). */
export async function saveRoomSnapshotNow(roomCode: string, room: MultiplayerRoom): Promise<boolean> {
  const cfg = getEngineConfig();
  if (cfg.roomSnapshotEnabled === false) return false;
  const maxPerDay = Number(cfg.snapshotMaxWritesPerDay ?? 15000);
  if (!checkAndCountDailyWrite(maxPerDay)) return false;
  try {
    const db = getFirebaseAdminAppDb();
    const snapshot: RestoredRoomSnapshot = {
      schemaVersion: SCHEMA_VERSION,
      savedAt: Date.now(),
      room: JSON.parse(JSON.stringify(room)),
      tokenFingerprints: buildTokenFingerprints(roomCode, room),
    };
    await db.collection(COLLECTION).doc(roomCode).set(snapshot as any);
    const st = pending.get(roomCode) || { timer: null, lastWriteAt: 0 };
    st.lastWriteAt = Date.now();
    pending.set(roomCode, st);
    return true;
  } catch (err: any) {
    console.warn(`[RoomSnapshot] Sauvegarde impossible pour ${roomCode} :`, err?.message || err);
    return false;
  }
}

/**
 * Planifie une sauvegarde après un temps de repos (snapshotDebounceSeconds), sans dépasser
 * snapshotMinIntervalSeconds entre deux écritures effectives pour une même table.
 */
export function scheduleRoomSnapshot(roomCode: string, room: MultiplayerRoom): void {
  const cfg = getEngineConfig();
  if (cfg.roomSnapshotEnabled === false) return;
  const debounceMs = Number(cfg.snapshotDebounceSeconds ?? 3) * 1000;
  const minIntervalMs = Number(cfg.snapshotMinIntervalSeconds ?? 5) * 1000;

  const st = pending.get(roomCode) || { timer: null, lastWriteAt: 0 };
  if (st.timer) clearTimeout(st.timer);

  const sinceLast = Date.now() - st.lastWriteAt;
  const delay = sinceLast >= minIntervalMs ? Math.min(debounceMs, minIntervalMs) : Math.max(debounceMs, minIntervalMs - sinceLast);

  st.timer = setTimeout(() => {
    st.timer = null;
    void saveRoomSnapshotNow(roomCode, room);
  }, delay);
  pending.set(roomCode, st);
}

/** À appeler quand une table est fermée ou nettoyée : supprime sa sauvegarde et annule toute écriture prévue. */
export async function deleteRoomSnapshot(roomCode: string): Promise<void> {
  const st = pending.get(roomCode);
  if (st?.timer) clearTimeout(st.timer);
  pending.delete(roomCode);
  try {
    const db = getFirebaseAdminAppDb();
    await db.collection(COLLECTION).doc(roomCode).delete();
  } catch (err: any) {
    console.warn(`[RoomSnapshot] Suppression impossible pour ${roomCode} :`, err?.message || err);
  }
}

/** Sauvegarde immédiate de toutes les tables ayant une écriture en attente (utilisé à l'arrêt du serveur). */
export async function flushAllPendingSnapshots(getRoom: (roomCode: string) => MultiplayerRoom | undefined): Promise<void> {
  const codes = [...pending.keys()];
  await Promise.allSettled(
    codes.map((code) => {
      const room = getRoom(code);
      return room ? saveRoomSnapshotNow(code, room) : Promise.resolve(false);
    })
  );
}

export interface RoomRestoreResult {
  restored: RestoredRoomSnapshot[];
  ignoredCount: number;
}

/** Charge les sauvegardes récentes au démarrage ; supprime les sauvegardes corrompues ou trop anciennes. */
export async function loadRoomsAtBoot(): Promise<RoomRestoreResult> {
  const cfg = getEngineConfig();
  const result: RoomRestoreResult = { restored: [], ignoredCount: 0 };
  if (cfg.roomSnapshotEnabled === false) return result;

  const maxAgeMs = Number(cfg.roomRestoreMaxAgeMinutes ?? 20) * 60 * 1000;
  const timeoutMs = Number(cfg.bootRestoreTimeoutSeconds ?? 10) * 1000;

  try {
    const db = getFirebaseAdminAppDb();
    const snap = await Promise.race([
      db.collection(COLLECTION).get(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('ROOM_RESTORE_TIMEOUT')), timeoutMs)),
    ]);
    const now = Date.now();
    const toDelete: string[] = [];

    snap.forEach((doc: any) => {
      const data = doc.data();
      if (!data || data.schemaVersion !== SCHEMA_VERSION || !data.room || typeof data.savedAt !== 'number') {
        toDelete.push(doc.id);
        result.ignoredCount += 1;
        return;
      }
      if (now - data.savedAt > maxAgeMs) {
        toDelete.push(doc.id);
        result.ignoredCount += 1;
        return;
      }
      result.restored.push(data as RestoredRoomSnapshot);
    });

    if (toDelete.length > 0) {
      const batch = db.batch();
      toDelete.forEach((id: string) => batch.delete(db.collection(COLLECTION).doc(id)));
      await batch.commit().catch((err: any) => console.warn('[RoomSnapshot] Nettoyage des sauvegardes obsolètes impossible :', err?.message || err));
    }
  } catch (err: any) {
    console.warn('[RoomSnapshot] Chargement des tables sauvegardées impossible, démarrage sans restauration :', err?.message || err);
  }

  return result;
}
