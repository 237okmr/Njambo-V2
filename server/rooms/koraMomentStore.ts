import { getFirebaseAdminAppDb } from '../firebaseAdmin';
import type { KoraMoment } from '../engine/koraMoment';

/**
 * Enregistrement des moments Kora (fiches anonymes de plis) dans Firestore, collection kora_moments.
 * Accès uniquement par le SDK admin : les règles Firestore refusent tout accès client.
 * Un Kora est rare : le volume d'écriture reste très faible. Aucun secret, aucune mise, aucun nom n'y figure.
 */
const COLLECTION = 'kora_moments';
const DEFAULT_LIST_LIMIT = 20;

/** Une sauvegarde qui échoue ne doit jamais perturber une partie : elle est journalisée puis ignorée. */
export async function saveKoraMoment(moment: KoraMoment): Promise<void> {
  try {
    const db = getFirebaseAdminAppDb();
    await db.collection(COLLECTION).doc(moment.id).set(moment);
  } catch (err) {
    console.warn('[KoraMoment] Sauvegarde ignorée :', (err as Error)?.message || err);
  }
}

/** Les moments les plus récents en premier. */
export async function listKoraMoments(limit: number = DEFAULT_LIST_LIMIT): Promise<KoraMoment[]> {
  const db = getFirebaseAdminAppDb();
  const snapshot = await db.collection(COLLECTION).orderBy('createdAt', 'desc').limit(limit).get();
  return snapshot.docs.map((d) => d.data() as KoraMoment);
}
