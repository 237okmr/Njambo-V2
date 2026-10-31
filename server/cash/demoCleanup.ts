/**
 * Kora Cash — correction des soldes fictifs de démo (lecture et écriture serveur, Admin SDK).
 * L'aperçu ne modifie rien. L'application écrit une ligne « ajustement » par joueur (acteur et note obligatoires),
 * rejouable sans risque : un joueur déjà corrigé est ignoré.
 */

import { getFirebaseAdminAppDb } from '../firebaseAdmin';
import { recordServerReads } from '../katika/readBudget';
import { CASH_LEDGER_COLLECTION, CASH_WALLETS_COLLECTION, CashLedgerError } from './cashTypes';
import { CASH_DEPOSITS_COLLECTION } from './depositStore';
import { applyMovement } from './walletLedger';
import {
  DEMO_CLEANUP_NOTE,
  DemoCleanupLine,
  DemoWalletSnapshot,
  SimulatedDepositSummary,
  demoCleanupRef,
  planDemoCleanup,
} from './demoCleanupRules';

export async function previewDemoCleanup(): Promise<DemoCleanupLine[]> {
  const db = getFirebaseAdminAppDb();
  const depositsSnap = await db
    .collection(CASH_DEPOSITS_COLLECTION)
    .where('mode', '==', 'SIMULATED')
    .where('status', '==', 'SUCCESS')
    .get();
  recordServerReads(depositsSnap.size);
  const simulated: SimulatedDepositSummary[] = depositsSnap.docs.map((d) => {
    const data = d.data() as { uid?: unknown; amount?: unknown };
    return { uid: String(data.uid ?? ''), amount: Number(data.amount) };
  });

  const uids = Array.from(new Set(simulated.map((s) => s.uid).filter((u) => u !== '' && !u.includes('/'))));
  if (uids.length === 0) return [];
  const walletRefs = uids.map((uid) => db.collection(CASH_WALLETS_COLLECTION).doc(uid));
  const walletSnaps = await db.getAll(...walletRefs);
  recordServerReads(walletSnaps.length);
  const wallets: DemoWalletSnapshot[] = walletSnaps.map((snap, i) => ({
    uid: uids[i],
    available: snap.exists ? Number((snap.data() as { available?: unknown }).available) : 0,
  }));
  return planDemoCleanup(wallets, simulated);
}

export interface DemoCleanupResult {
  applied: number;
  skipped: number;
  totalDeducted: number;
}

export async function applyDemoCleanup(actorUid: string): Promise<DemoCleanupResult> {
  const db = getFirebaseAdminAppDb();
  const lines = await previewDemoCleanup();
  const result: DemoCleanupResult = { applied: 0, skipped: 0, totalDeducted: 0 };
  for (const line of lines) {
    const ref = demoCleanupRef(line.uid);
    const already = await db.collection(CASH_LEDGER_COLLECTION).doc(ref).get();
    recordServerReads(1);
    if (already.exists) {
      result.skipped += 1;
      continue;
    }
    try {
      const movement = await applyMovement({
        ref,
        uid: line.uid,
        kind: 'ADJUSTMENT',
        availableDelta: -line.deduction,
        lockedDelta: 0,
        actorUid,
        note: DEMO_CLEANUP_NOTE,
        meta: { reason: 'demo-simulated-cleanup', simulatedTotal: line.simulatedTotal },
      });
      if (movement.applied) {
        result.applied += 1;
        result.totalDeducted += line.deduction;
      } else {
        result.skipped += 1;
      }
    } catch (err) {
      if (err instanceof CashLedgerError) {
        result.skipped += 1;
        continue;
      }
      throw err;
    }
  }
  return result;
}
