/**
 * Kora Cash — stockage de la configuration générale (écriture serveur uniquement, Admin SDK).
 * Document : katika_config/kora_cash. Fermé à tous les clients : seul le serveur le lit et l'écrit.
 * Aucun secret ici (les identifiants prestataire vivent dans cashSecrets.ts), aucun délai.
 */

import { getFirebaseAdminAppDb } from '../firebaseAdmin';
import {
  DEFAULT_KORA_CASH_CONFIG_DATA,
  KoraCashConfigData,
  KoraCashConfigPatch,
  normalizeStoredConfig,
} from './cashConfigRules';

export const KORA_CASH_CONFIG_COLLECTION = 'katika_config';
export const KORA_CASH_CONFIG_DOC = 'kora_cash';

/**
 * Lecture de la configuration. Si Firestore ne répond pas (par exemple dans l'aperçu AI Studio, sans compte de service),
 * on renvoie la configuration par défaut : Kora Cash désactivé, environnement démo. Le repli ne peut donc jamais ouvrir l'argent,
 * et il est toujours journalisé.
 */
export async function getKoraCashConfig(): Promise<KoraCashConfigData> {
  try {
    const snap = await getFirebaseAdminAppDb().collection(KORA_CASH_CONFIG_COLLECTION).doc(KORA_CASH_CONFIG_DOC).get();
    return normalizeStoredConfig(snap.exists ? snap.data() : undefined);
  } catch (err) {
    console.warn('[KoraCash] Lecture de la configuration impossible : configuration par défaut (désactivé, démo) utilisée.', err instanceof Error ? err.message : String(err));
    return { ...DEFAULT_KORA_CASH_CONFIG_DATA };
  }
}

/** Enregistrement strict : si Firestore échoue, l'erreur remonte (la route répond 500 et katika l'affiche). Jamais de faux « enregistré ». */
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
