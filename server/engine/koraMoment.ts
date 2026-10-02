/**
 * « Moment Kora » : fiche légère (5 plis, environ 20 cartes) d'un Kora ou Double Kora réussi,
 * enregistrée pour pouvoir l'illustrer ensuite dans le Studio Social.
 *
 * Confidentialité : la fiche ne contient AUCUN nom, AUCUN identifiant de joueur, AUCUNE mise ni aucun gain
 * (compatible avec un futur mode argent réel). Les joueurs sont repérés par leur siège (0 à 3).
 */
export interface KoraMomentPlay {
  seat: number;
  rank: string; // '3' à '10'
  suit: string; // ♥ ♦ ♣ ♠
}

export interface KoraMomentTrick {
  number: number; // 1 à 5
  plays: KoraMomentPlay[];
  winnerSeat: number | null;
}

export interface KoraMoment {
  id: string;
  createdAt: number;
  kind: 'KORA' | 'DOUBLE_KORA';
  playerCount: number;
  winnerSeat: number;
  tricks: KoraMomentTrick[];
}

const SUIT_SYMBOLS: Record<string, string> = {
  COEUR: '♥',
  CARREAU: '♦',
  TREFLE: '♣',
  PIQUE: '♠',
};

interface TrickLike {
  trickNumber: number;
  winnerIndex: number | null;
  plays: Array<{ playerIndex: number; card: { value: number; suit: string } }>;
}

export function buildKoraMoment(params: {
  roomId: string;
  partieCount: number;
  kind: 'KORA' | 'DOUBLE_KORA';
  winnerSeat: number;
  playerCount: number;
  tricks: TrickLike[];
  now?: number;
}): KoraMoment {
  const createdAt = params.now ?? Date.now();
  const tricks: KoraMomentTrick[] = (params.tricks || []).slice(0, 5).map((t) => ({
    number: t.trickNumber,
    winnerSeat: typeof t.winnerIndex === 'number' ? t.winnerIndex : null,
    plays: (t.plays || [])
      .filter((p) => p && p.card && SUIT_SYMBOLS[p.card.suit])
      .map((p) => ({
        seat: p.playerIndex,
        rank: String(p.card.value),
        suit: SUIT_SYMBOLS[p.card.suit],
      })),
  }));

  return {
    id: `${params.roomId}_p${params.partieCount}_${createdAt}`,
    createdAt,
    kind: params.kind,
    playerCount: params.playerCount,
    winnerSeat: params.winnerSeat,
    tricks,
  };
}
