/**
 * Plantages des navigateurs : stockage Firestore (collection serveur seul), une ligne par signature.
 * Chaque rapport accepté coûte une lecture et une écriture ; les plafonds de crashReportRules.ts les bornent.
 */

import { getFirebaseAdminAppDb } from '../firebaseAdmin';
import { recordServerReads } from '../katika/readBudget';
import { CrashEntry, CrashReport, mergeCrash } from './crashReportRules';

export const CRASH_COLLECTION = 'client_crashes';
export const CRASH_LIST_LIMIT = 100;

export interface CrashStore {
  /** Ajoute une occurrence ; renvoie la ligne résultante et s'il s'agit d'une nouvelle signature. */
  record(signature: string, report: CrashReport, nowMs: number): Promise<{ entry: CrashEntry; isNew: boolean }>;
  list(): Promise<CrashEntry[]>;
  setResolved(signature: string, resolved: boolean): Promise<void>;
  remove(signature: string): Promise<void>;
  removeResolved(): Promise<number>;
}

const col = () => getFirebaseAdminAppDb().collection(CRASH_COLLECTION);

export const firestoreCrashStore: CrashStore = {
  async record(signature, report, nowMs) {
    const ref = col().doc(signature);
    return getFirebaseAdminAppDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      recordServerReads(1);
      const existing = snap.exists ? (snap.data() as CrashEntry) : null;
      const entry = mergeCrash(existing, report, signature, nowMs);
      tx.set(ref, entry);
      return { entry, isNew: !existing };
    });
  },
  async list() {
    const snap = await col().orderBy('lastSeenAt', 'desc').limit(CRASH_LIST_LIMIT).get();
    recordServerReads(snap.size);
    return snap.docs.map((d) => d.data() as CrashEntry);
  },
  async setResolved(signature, resolved) {
    await col().doc(signature).update({ resolved });
  },
  async remove(signature) {
    await col().doc(signature).delete();
  },
  async removeResolved() {
    const snap = await col().where('resolved', '==', true).limit(CRASH_LIST_LIMIT).get();
    recordServerReads(snap.size);
    const batch = getFirebaseAdminAppDb().batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    if (!snap.empty) await batch.commit();
    return snap.size;
  },
};
