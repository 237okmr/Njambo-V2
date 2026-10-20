/**
 * Kora Cash — stockage de la configuration générale (écriture serveur uniquement, Admin SDK).
 * Document : katika_config/kora_cash. Fermé à tous les clients : seul le serveur le lit et l'écrit.
 * Aucun secret ici (les identifiants prestataire vivent dans cashSecrets.ts), aucun délai.
 */

import { getFirebaseAdminAppDb } from '../firebaseAdmin';
import {
  KoraCashConfigData,
  KoraCashConfigPatch,
  normalizeStoredConfig,
} from './cashConfigRules';

export const KORA_CASH_CONFIG_COLLECTION = 'katika_config';
export const KORA_CASH_CONFIG_DOC = 'kora_cash';

export async function getKoraCashConfig(): Promise<KoraCashConfigData> {
  const snap = await getFirebaseAdminAppDb().collection(KORA_CASH_CONFIG_COLLECTION).doc(KORA_CASH_CONFIG_DOC).get();
  return normalizeStoredConfig(snap.exists ? snap.data() : undefined);
}

export async function updateKoraCashConfig(patch: KoraCashConfigPatch, actorEmail?: string): Promise<KoraCashConfigData> {
  const db = getFirebaseAdminAppDb();
  const ref = db.collection(KORA_CASH_CONFIG_COLLECTION).doc(KORA_CASH_CONFIG_DOC);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = normalizeStoredConfig(snap.exists ? snap.data() : undefined);
    const next: KoraCashConfigData = {
      ...current,
      ...patch,
      updatedAt: Date.now(),
      ...(actorEmail ? { updatedBy: actorEmail } : {}),
    };
    tx.set(ref, next);
    return next;
  });
}
