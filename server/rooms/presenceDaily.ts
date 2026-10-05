import { getFirebaseAdminAppDb } from '../firebaseAdmin';
import { getDoualaDateKey } from '../../src/services/masteryConfig';

/**
 * Présence quotidienne : qui a ouvert l'application chaque jour (« Actifs : app ouverte » dans katika).
 * Alimentée par le signal de présence déjà envoyé par l'application (HEARTBEAT_PRESENCE) : aucun nouveau
 * signal, aucun minuteur ici. Les passages sont gardés en mémoire puis ajoutés au document du jour
 * (server_metrics, document active_AAAA-MM-JJ) par la boucle de sauvegarde existante des mesures
 * (cadence réglable dans katika : metricsFlushSeconds). Accès uniquement par le SDK admin.
 * Aucune donnée personnelle autre que l'identifiant de joueur et son nom d'affichage ; jamais d'e-mail.
 */
const COLLECTION = 'server_metrics';
const MAX_PLAYERS_PER_DAY = 2000;

export interface PresencePlayer {
  id: string;
  name: string;
  kind: 'google' | 'guest';
  firstSeen: number;
  lastSeen: number;
  visibleSignals: number;
  backgroundSignals: number;
}

type AnyDoc = Record<string, any>;

// dateKey -> (identifiant joueur -> passages non encore sauvegardés)
const pending = new Map<string, Map<string, PresencePlayer>>();

function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const cleaned = raw.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 40);
  return cleaned.toLowerCase() === 'katika' ? '' : cleaned;
}

export function presenceDisplayName(playerId: string, rawName: unknown): string {
  if (playerId.startsWith('usr_')) {
    const suffix = playerId.replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase();
    return `Invité #${suffix}`;
  }
  return cleanName(rawName) || 'Joueur Google';
}

/** Note qu'un joueur a ouvert l'application (appelé à chaque signal de présence reçu). */
export function recordPresenceSeen(params: {
  playerId: string;
  playerName?: unknown;
  isAway?: boolean;
  nowMs?: number;
}): void {
  const playerId = params.playerId;
  if (typeof playerId !== 'string' || playerId.length < 3 || playerId.length > 128) return;
  const nowMs = params.nowMs ?? Date.now();
  const dateKey = getDoualaDateKey(nowMs);
  let day = pending.get(dateKey);
  if (!day) {
    day = new Map<string, PresencePlayer>();
    pending.set(dateKey, day);
  }
  const existing = day.get(playerId);
  if (!existing && day.size >= MAX_PLAYERS_PER_DAY) return;
  const entry: PresencePlayer = existing || {
    id: playerId,
    name: presenceDisplayName(playerId, params.playerName),
    kind: playerId.startsWith('usr_') ? 'guest' : 'google',
    firstSeen: nowMs,
    lastSeen: nowMs,
    visibleSignals: 0,
    backgroundSignals: 0,
  };
  entry.name = presenceDisplayName(playerId, params.playerName) || entry.name;
  entry.lastSeen = Math.max(entry.lastSeen, nowMs);
  if (params.isAway === true) entry.backgroundSignals += 1;
  else entry.visibleSignals += 1;
  day.set(playerId, entry);
}

/** Fusionne les passages en mémoire dans le document déjà enregistré pour ce jour. */
export function mergePresenceDay(existing: AnyDoc | undefined, delta: PresencePlayer[]): PresencePlayer[] {
  const byId = new Map<string, PresencePlayer>();
  (Array.isArray(existing?.players) ? existing!.players : []).forEach((p: AnyDoc) => {
    if (p && typeof p.id === 'string') {
      byId.set(p.id, {
        id: p.id,
        name: typeof p.name === 'string' ? p.name : presenceDisplayName(p.id, ''),
        kind: p.kind === 'guest' ? 'guest' : 'google',
        firstSeen: Number(p.firstSeen) || 0,
        lastSeen: Number(p.lastSeen) || 0,
        visibleSignals: Number(p.visibleSignals) || 0,
        backgroundSignals: Number(p.backgroundSignals) || 0,
      });
    }
  });
  delta.forEach((d) => {
    const cur = byId.get(d.id);
    if (!cur) {
      if (byId.size < MAX_PLAYERS_PER_DAY) byId.set(d.id, { ...d });
      return;
    }
    cur.name = d.name || cur.name;
    cur.firstSeen = cur.firstSeen > 0 ? Math.min(cur.firstSeen, d.firstSeen) : d.firstSeen;
    cur.lastSeen = Math.max(cur.lastSeen, d.lastSeen);
    cur.visibleSignals += d.visibleSignals;
    cur.backgroundSignals += d.backgroundSignals;
  });
  return Array.from(byId.values());
}

/** Lecture des passages non encore sauvegardés (tests et diagnostic). */
export function getPendingPresence(dateKey: string): PresencePlayer[] {
  return Array.from(pending.get(dateKey)?.values() || []);
}

/** Ajoute les passages en mémoire au document de chaque jour concerné. En cas d'échec, ils sont conservés. */
export async function flushPresenceDaily(): Promise<boolean> {
  if (pending.size === 0) return true;
  let allOk = true;
  for (const dateKey of Array.from(pending.keys())) {
    const day = pending.get(dateKey);
    if (!day || day.size === 0) {
      pending.delete(dateKey);
      continue;
    }
    const delta = Array.from(day.values());
    try {
      const db = getFirebaseAdminAppDb();
      const ref = db.collection(COLLECTION).doc(`active_${dateKey}`);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const players = mergePresenceDay(snap.exists ? (snap.data() as AnyDoc) : undefined, delta);
        tx.set(ref, { dateKey, players, updatedAt: Date.now(), source: 'server' }, { merge: false });
      });
      // Retire seulement ce qui vient d'être sauvegardé (de nouveaux passages ont pu arriver pendant l'écriture).
      const current = pending.get(dateKey);
      if (current) {
        delta.forEach((d) => {
          const now = current.get(d.id);
          if (!now) return;
          const visible = now.visibleSignals - d.visibleSignals;
          const background = now.backgroundSignals - d.backgroundSignals;
          if (visible <= 0 && background <= 0) current.delete(d.id);
          else {
            now.visibleSignals = Math.max(0, visible);
            now.backgroundSignals = Math.max(0, background);
            now.firstSeen = now.lastSeen;
          }
        });
        if (current.size === 0) pending.delete(dateKey);
      }
    } catch (err: any) {
      allOk = false;
      console.warn('[PresenceDaily] Sauvegarde impossible (réessai au prochain cycle) :', err?.message || err);
    }
  }
  return allOk;
}
