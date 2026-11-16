/**
 * Parcours d'invitation : stockage Firestore (collection serveur seul), un document par jour (jour de Douala).
 * Même mécanique que les démarrages : cumul en mémoire, vidage par la boucle existante des mesures (metricsFlushSeconds) et à l'arrêt propre,
 * suppression des jours plus anciens que inviteStatsRetentionDays au plus une fois par jour.
 */

import { getFirebaseAdminAppDb } from '../firebaseAdmin';
import { recordServerReads } from '../katika/readBudget';
import { getEngineConfig } from '../engine/engineConfig';
import { getDoualaDateKey } from '../../src/services/masteryConfig';
import { recentDayKeys } from './bootStatsRules';
import { createInviteTally, mergeInviteDay, type InviteDay, type InviteGroup } from './inviteStatsRules';

export const INVITE_COLLECTION = 'client_invite_stats';

const tally = createInviteTally();
let lastPurgeDay = '';

const maxFamilies = () => Number(getEngineConfig().inviteStatsMaxFamiliesPerDay ?? 100);

/** Note un signal reçu (déjà validé et plafonné par client). */
export function recordInviteSignal(counter: string, group: InviteGroup, nowMs: number = Date.now()): void {
  tally.record(getDoualaDateKey(nowMs), counter, group, maxFamilies());
}

/** Ajoute les compteurs en mémoire au document de chaque jour. En cas d'échec, ils sont remis en attente. */
export async function flushInviteStats(): Promise<boolean> {
  if (tally.pendingCount() === 0) return true;
  const drained = tally.drain();
  let allOk = true;
  const db = getFirebaseAdminAppDb();
  for (const { day, rows } of drained) {
    try {
      const ref = db.collection(INVITE_COLLECTION).doc(day);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        recordServerReads(1);
        const merged = mergeInviteDay(snap.exists ? (snap.data() as InviteDay) : null, day, rows, maxFamilies());
        tx.set(ref, { ...merged, updatedAt: Date.now() });
      });
    } catch (err: any) {
      allOk = false;
      tally.restore(day, rows, maxFamilies());
      console.warn('[InviteStats] Sauvegarde impossible (réessai au prochain cycle) :', err?.message || err);
    }
  }
  void purgeOldInviteStats();
  return allOk;
}

/** Supprime les jours au-delà de la durée de conservation ; au plus une fois par jour. */
async function purgeOldInviteStats(nowMs: number = Date.now()): Promise<void> {
  const today = getDoualaDateKey(nowMs);
  if (lastPurgeDay === today) return;
  lastPurgeDay = today;
  try {
    const keepDays = Math.max(1, Number(getEngineConfig().inviteStatsRetentionDays ?? 30));
    const cutoff = getDoualaDateKey(nowMs - keepDays * 86_400_000); // delay-ok: calcul d'une date limite à partir d'un réglage katika
    const db = getFirebaseAdminAppDb();
    const old = await db.collection(INVITE_COLLECTION).where('day', '<', cutoff).limit(60).get();
    recordServerReads(old.size);
    if (old.empty) return;
    const batch = db.batch();
    old.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  } catch (err: any) {
    lastPurgeDay = '';
    console.warn('[InviteStats] Nettoyage impossible :', err?.message || err);
  }
}

/** Lit les n derniers jours (jour en cours compris). Coût : un document par jour demandé. */
export async function readInviteDays(days: number, nowMs: number = Date.now()): Promise<InviteDay[]> {
  const keys = recentDayKeys(nowMs, days, getDoualaDateKey);
  const db = getFirebaseAdminAppDb();
  const snaps = await db.getAll(...keys.map((k) => db.collection(INVITE_COLLECTION).doc(k)));
  recordServerReads(keys.length);
  return snaps.filter((s) => s.exists).map((s) => s.data() as InviteDay);
}
