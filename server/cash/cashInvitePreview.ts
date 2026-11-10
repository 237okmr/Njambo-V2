/**
 * Kora Cash — aperçu en lecture seule d'une table, pour la page d'invitation. Fonction pure : aucun réseau, aucune écriture.
 *
 * Ce que l'invité peut voir avant de s'engager : la mise, la commission, les places, le nom de l'hôte et la fourchette
 * d'entrée. Jamais le capital, le solde ni le nom des autres joueurs. Une table inexistante et une table gratuite
 * donnent la même réponse : on ne révèle pas quels codes existent.
 */

import type { MultiplayerRoom } from '../../src/types';

export type CashPreviewState = 'OPEN' | 'FULL' | 'STARTED' | 'CLOSED' | 'MINE' | 'UNAVAILABLE';

export interface CashTablePreview {
  state: CashPreviewState;
  roomCode?: string;
  /** Mise de la table, en FCFA. */
  bet?: number;
  /** Niveau de mise choisi à l'ouverture (celui qu'on retrouve dans les tables publiques). */
  betLevel?: number;
  capacity?: number;
  rakePercent?: number;
  /** Places déjà prises. Seulement pour une table encore ouverte. */
  seated?: number;
  hostName?: string;
  minBuyIn?: number;
  maxBuyIn?: number;
  isPublic?: boolean;
}

function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 40);
}

export function buildCashTablePreview(room: MultiplayerRoom | null | undefined, uid: string): CashTablePreview {
  if (!room || !room.cash) return { state: 'UNAVAILABLE' };

  const base = {
    roomCode: room.id,
    bet: room.baseBet,
    betLevel: room.cash.betLevel,
    capacity: room.maxPlayers,
    rakePercent: room.cash.rakePercent,
  };

  if (room.cash.seats[uid]?.open) return { state: 'MINE', ...base };
  if (room.cash.closed) return { state: 'CLOSED', ...base };
  if (room.status !== 'LOBBY') return { state: 'STARTED', ...base };

  const seated = (room.players || []).length;
  if (seated >= room.maxPlayers) return { state: 'FULL', ...base };

  return {
    state: 'OPEN',
    ...base,
    seated,
    hostName: cleanName(room.hostName),
    minBuyIn: room.cash.minBuyIn,
    maxBuyIn: room.baseBet * room.cash.maxBuyInMultiple,
    isPublic: room.isPublic !== false,
  };
}
