import { getFirebaseAdminAppDb } from '../firebaseAdmin';
import { getEngineConfig, getEngineConfigVersion, loadPersistedEngineConfig } from './engineConfig';

/**
 * Persistance de la config moteur dans Firestore (collection server_config, document engine).
 * Accès uniquement par le SDK admin (les règles Firestore refusent tout accès client).
 * Ne jamais y stocker de clé API ni de secret.
 */
const COLLECTION = 'server_config';
const DOC_ID = 'engine';

// Constante technique : elle s'applique avant que la config n'existe, donc elle ne peut pas être un paramètre.
const BOOT_LOAD_TIMEOUT_MS = 8000; // delay-ok: chargement de la config au démarrage, antérieur à toute config

export interface ConfigLoadResult {
  loaded: boolean;
  reason?: string;
}

export interface ConfigStoreStatus {
  lastLoad: { ok: boolean; reason?: string; at: number } | null;
  lastSave: { ok: boolean; reason?: string; at: number } | null;
}

const status: ConfigStoreStatus = { lastLoad: null, lastSave: null };

/** Statut de la sauvegarde de config, exposé par /api/health pour un diagnostic sans lire les logs. */
export function getConfigStoreStatus(): ConfigStoreStatus {
  return { lastLoad: status.lastLoad, lastSave: status.lastSave };
}

/** Charge la config persistée au démarrage. En cas d'échec, le serveur démarre avec les défauts du registre. */
export async function loadEngineConfigFromStore(): Promise<ConfigLoadResult> {
  try {
    const db = getFirebaseAdminAppDb();
    const snap = await Promise.race([
      db.collection(COLLECTION).doc(DOC_ID).get(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('CONFIG_BOOT_TIMEOUT')), BOOT_LOAD_TIMEOUT_MS) // delay-ok: voir ci-dessus
      ),
    ]);
    if (!snap.exists) {
      status.lastLoad = { ok: true, reason: 'aucune config sauvegardée (défauts du registre)', at: Date.now() };
      return { loaded: false, reason: 'absent' };
    }
    const data = snap.data() || {};
    loadPersistedEngineConfig((data.values || {}) as Record<string, unknown>, Number(data.version) || 0);
    console.log(`[ConfigStore] Config moteur chargée (version ${getEngineConfigVersion()}).`);
    status.lastLoad = { ok: true, at: Date.now() };
    return { loaded: true };
  } catch (err: any) {
    console.warn('[ConfigStore] Chargement impossible, défauts du registre utilisés :', err?.message || err);
    status.lastLoad = { ok: false, reason: String(err?.message || err), at: Date.now() };
    return { loaded: false, reason: String(err?.message || err) };
  }
}

/** Sauvegarde la config active. Renvoie false en cas d'échec (la config en mémoire reste appliquée). */
export async function persistEngineConfigToStore(): Promise<boolean> {
  try {
    const db = getFirebaseAdminAppDb();
    // JSON aller-retour : Firestore refuse les valeurs undefined.
    const values = JSON.parse(JSON.stringify(getEngineConfig()));
    await db.collection(COLLECTION).doc(DOC_ID).set({
      values,
      version: getEngineConfigVersion(),
      updatedAt: Date.now(),
    });
    status.lastSave = { ok: true, at: Date.now() };
    return true;
  } catch (err: any) {
    console.warn('[ConfigStore] Sauvegarde impossible :', err?.message || err);
    status.lastSave = { ok: false, reason: String(err?.message || err), at: Date.now() };
    return false;
  }
}
