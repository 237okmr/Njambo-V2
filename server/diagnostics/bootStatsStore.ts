/**
 * Démarrages de l'application : stockage Firestore (collection serveur seul), un document par jour (jour de Douala).
 * Les signaux reçus sont additionnés en mémoire ; la boucle de sauvegarde existante des mesures (cadence réglable dans
 * katika : metricsFlushSeconds) les ajoute au document du jour. Un redémarrage brutal perd au plus une période de cumul.
 * Les documents plus anciens que la durée de conservation (bootStatsRetentionDays) sont supprimés au plus une fois par jour.
 */

import { getFirebaseAdminAppDb } from '../firebaseAdmin';
import { recordServerReads } from '../katika/readBudget';
import { getEngineConfig } from '../engine/engineConfig';
import { getDoualaDateKey } from '../../src/services/masteryConfig';
import {
  BootDay,
  BootFamily,
  BootStep,
  createBootTally,
  mergeBootDay,
  recentDayKeys,
} from './bootStatsRules';

export const BOOT_COLLECTION = 'client_boot_stats';

const tally = createBootTally();
let lastPurgeDay = '';

const maxFamilies = () => Number(getEngineConfig().bootStatsMaxFamiliesPerDay ?? 100);

/** Note un signal reçu (déjà validé et plafonné par client). */
export function recordBootSignal(step: BootStep, family: BootFamily, nowMs: number = Date.now()): void {
  tally.record(getDoualaDateKey(nowMs), step, family, maxFamilies());
}

/** Ajoute les compteurs en mémoire au document de chaque jour. En cas d'échec, ils sont remis en attente. */
export async function flushBootStats(): Promise<boolean> {
  if (tally.pendingCount() === 0) return true;
  const drained = tally.drain();
  let allOk = true;
  const db = getFirebaseAdminAppDb();
  for (const { day, rows } of drained) {
    try {
      const ref = db.collection(BOOT_COLLECTION).doc(day);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        recordServerReads(1);
        const merged = mergeBootDay(snap.exists ? (snap.data() as BootDay) : null, day, rows, maxFamilies());
        tx.set(ref, { ...merged, updatedAt: Date.now() });
      });
    } catch (err: any) {
      allOk = false;
      tally.restore(day, rows, maxFamilies());
      console.warn('[BootStats] Sauvegarde impossible (réessai au prochain cycle) :', err?.message || err);
    }
  }
  void purgeOldBootStats();
  return allOk;
}

/** Supprime les jours au-delà de la durée de conservation ; au plus une fois par jour. */
async function purgeOldBootStats(nowMs: number = Date.now()): Promise<void> {
  const today = getDoualaDateKey(nowMs);
  if (lastPurgeDay === today) return;
  lastPurgeDay = today;
  try {
    const keepDays = Math.max(1, Number(getEngineConfig().bootStatsRetentionDays ?? 30));
    const cutoff = getDoualaDateKey(nowMs - keepDays * 86_400_000); // delay-ok: calcul d'une date limite à partir d'un réglage katika
    const db = getFirebaseAdminAppDb();
    const old = await db.collection(BOOT_COLLECTION).where('day', '<', cutoff).limit(60).get();
    recordServerReads(old.size);
    if (old.empty) return;
    const batch = db.batch();
    old.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  } catch (err: any) {
    lastPurgeDay = '';
    console.warn('[BootStats] Nettoyage impossible :', err?.message || err);
  }
}

/** Lit les n derniers jours (jour en cours compris). Coût : un document par jour demandé. */
export async function readBootDays(days: number, nowMs: number = Date.now()): Promise<BootDay[]> {
  const keys = recentDayKeys(nowMs, days, getDoualaDateKey);
  const db = getFirebaseAdminAppDb();
  const snaps = await db.getAll(...keys.map((k) => db.collection(BOOT_COLLECTION).doc(k)));
  recordServerReads(keys.length);
  return snaps.filter((s) => s.exists).map((s) => s.data() as BootDay);
}
