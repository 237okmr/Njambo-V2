/**
 * Carte d'arrivée d'un lien de table gratuite : ce que l'invité voit avant de rejoindre.
 * Jamais le capital, jamais les autres joueurs. Table inexistante, Kora Cash ou fermée : même réponse neutre.
 */
import type { MultiplayerRoom } from '../../src/types';

export type FreeTableState = 'OPEN' | 'FULL' | 'STARTED' | 'UNAVAILABLE';

export interface FreeTablePreview {
  state: FreeTableState;
  hostName?: string;
  seated?: number;
  capacity?: number;
}

function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 40);
}

export function buildFreeTablePreview(room: MultiplayerRoom | null | undefined): FreeTablePreview {
  if (!room || room.cash) return { state: 'UNAVAILABLE' };
  if (room.status !== 'LOBBY') return { state: 'STARTED' };
  const seated = (room.players || []).length;
  const base = { hostName: cleanName(room.hostName) || undefined, seated, capacity: room.maxPlayers };
  if (seated >= room.maxPlayers) return { state: 'FULL', ...base };
  return { state: 'OPEN', ...base };
}
