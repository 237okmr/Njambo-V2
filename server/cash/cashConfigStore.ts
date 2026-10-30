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

let memoryConfigCache: KoraCashConfigData = { ...DEFAULT_KORA_CASH_CONFIG_DATA };

export async function getKoraCashConfig(): Promise<KoraCashConfigData> {
  try {
    const snap = await getFirebaseAdminAppDb().collection(KORA_CASH_CONFIG_COLLECTION).doc(KORA_CASH_CONFIG_DOC).get();
    const config = normalizeStoredConfig(snap.exists ? snap.data() : undefined);
    memoryConfigCache = config;
    return config;
  } catch (_err) {
    // Si Firestore n'est pas accessible par l'Admin SDK (ex: environnement sandbox sans clé de compte de service),
    // on renvoie la configuration en mémoire (défaut : désactivé / démo) sans bloquer ni lever d'erreur.
    return memoryConfigCache;
  }
}

export async function updateKoraCashConfig(patch: KoraCashConfigPatch, actorEmail?: string): Promise<KoraCashConfigData> {
  try {
    const db = getFirebaseAdminAppDb();
    const ref = db.collection(KORA_CASH_CONFIG_COLLECTION).doc(KORA_CASH_CONFIG_DOC);

    const next = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = normalizeStoredConfig(snap.exists ? snap.data() : undefined);
      const nextData: KoraCashConfigData = {
        ...current,
        ...patch,
        updatedAt: Date.now(),
        ...(actorEmail ? { updatedBy: actorEmail } : {}),
      };
      tx.set(ref, nextData);
      return nextData;
    });
    memoryConfigCache = next;
    return next;
  } catch (_err) {
    memoryConfigCache = {
      ...memoryConfigCache,
      ...patch,
      updatedAt: Date.now(),
      ...(actorEmail ? { updatedBy: actorEmail } : {}),
    };
    return memoryConfigCache;
  }
}
