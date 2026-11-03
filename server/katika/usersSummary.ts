/**
 * Résumé du dossier des joueurs pour le tableau de bord : des totaux, jamais la liste.
 * Un admin qui a seulement le droit de voir le tableau de bord n'a pas besoin des fiches des joueurs.
 */

export const RANK_TITLES = ['APPRENTI', 'CONFIRME', 'CHASSEUR_KORA', 'MAITRE_POSITION', 'MAITRE_NJAMBO', 'LEGENDE_KORA'] as const;

export interface UsersSummary {
  registered: number;
  google: number;
  guests: number;
  pyramid: Record<string, number>;
}

/** Rangs publics du Palmarès envoyés par l'écran : uid -> rang. Tout ce qui est douteux est ignoré. */
export function sanitizeRankTitles(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const known = new Set<string>(RANK_TITLES);
  const out: Record<string, string> = {};
  let count = 0;
  for (const [uid, title] of Object.entries(raw as Record<string, unknown>)) {
    if (count >= 5000) break;
    if (typeof title === 'string' && known.has(title) && uid.length <= 128) {
      out[uid] = title;
      count += 1;
    }
  }
  return out;
}

export function summarizeUsers(docs: Array<Record<string, any>>, rankTitles: Record<string, string>): UsersSummary {
  const pyramid: Record<string, number> = Object.fromEntries(RANK_TITLES.map((t) => [t, 0]));
  let google = 0;
  for (const u of docs) {
    if (u.email || u.isGuest === false) google += 1;
    const title = rankTitles[u.id || u.uid] || u.honorificTitleId || 'APPRENTI';
    if (pyramid[title] !== undefined) pyramid[title] += 1;
    else pyramid.APPRENTI += 1;
  }
  return { registered: docs.length, google, guests: docs.length - google, pyramid };
}
