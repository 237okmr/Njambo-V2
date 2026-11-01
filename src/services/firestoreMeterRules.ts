/**
 * Mesure des lectures Firestore du téléphone : règles pures (aucun réseau, aucune minuterie).
 * Une lecture est rangée sous une étiquette qui décrit le TYPE de document, jamais l'identifiant d'un joueur :
 * « users/*/history » veut dire « l'historique d'un joueur ». Aucune donnée personnelle ne quitte le téléphone.
 */

/** Remplace chaque identifiant (segments de rang impair) par « * » : users/abc/history -> users/*/history. */
export function normalizeFirestorePath(path: string): string {
  const segments = String(path || '').split('/').filter((s) => s !== '');
  if (segments.length === 0) return 'inconnu';
  return segments.map((s, i) => (i % 2 === 0 ? s : '*')).join('/');
}

function cleanLabel(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_*:./-]/g, '_').slice(0, 60);
  return cleaned === '' ? 'inconnu' : cleaned;
}

/** Étiquette d'une cible Firestore : référence de document ou de collection (chemin public), requête (chemin interne, au mieux). */
export function labelForFirestoreTarget(target: unknown): string {
  try {
    const t = target as any;
    if (t && typeof t.path === 'string') return cleanLabel(normalizeFirestorePath(t.path));
    const canonical = t?._query?.path?.canonicalString;
    if (typeof canonical === 'function') return cleanLabel(normalizeFirestorePath(String(canonical.call(t._query.path))));
  } catch {
    // étiquette inconnue : la lecture est comptée quand même
  }
  return 'inconnu';
}

/** Nombre de lectures facturées pour un résultat : rien si tout vient du cache de l'appareil, au moins 1 sinon. */
export function billedReads(docCount: number, fromCache: boolean): number {
  if (fromCache) return 0;
  const n = Number.isFinite(docCount) ? Math.floor(docCount) : 0;
  return Math.max(1, n);
}
