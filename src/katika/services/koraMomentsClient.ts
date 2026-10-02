import type { KoraMoment } from '../../../server/engine/koraMoment';
import { tikaFetch } from './tikaFetch';

/** Lit les moments Kora enregistrés (route réservée à l'admin Katika). */
export async function fetchKoraMoments(): Promise<KoraMoment[]> {
  const response = await tikaFetch('/api/katika/moments');
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Lecture des moments Kora impossible.');
  }
  return Array.isArray(data.moments) ? (data.moments as KoraMoment[]) : [];
}

/** Libellé court d'un moment pour une liste (type, nombre de joueurs, date et heure à Douala). */
export function describeMoment(moment: KoraMoment): string {
  const kind = moment.kind === 'DOUBLE_KORA' ? 'Double Kora' : 'Kora';
  const when = new Date(moment.createdAt).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Douala',
  });
  return `${kind} · ${moment.playerCount} joueurs · ${when}`;
}
