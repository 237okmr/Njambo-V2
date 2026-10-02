import type { KoraMoment } from '../../../server/engine/koraMoment';
import { BLOCK_LIMITS, CardItem, CardsBlock, VisualBlock, VisualSpec } from './visualSpec';

/**
 * Situations de jeu pour les visuels : le CODE dessine les cartes à partir de données réelles,
 * l'IA n'écrit que l'accroche, la chute et le post. Aucune carte inventée, aucun nom de joueur.
 */
const SEAT_LABELS = ['Joueur A', 'Joueur B', 'Joueur C', 'Joueur D'];

export function seatLabel(seat: number): string {
  return SEAT_LABELS[seat] ?? `Joueur ${seat + 1}`;
}

/** Vérifie la forme d'un moment reçu d'un client (jamais de confiance aveugle). */
export function isKoraMoment(value: unknown): value is KoraMoment {
  const m = value as KoraMoment | null;
  return Boolean(
    m &&
      typeof m === 'object' &&
      typeof m.id === 'string' &&
      (m.kind === 'KORA' || m.kind === 'DOUBLE_KORA') &&
      typeof m.winnerSeat === 'number' &&
      typeof m.playerCount === 'number' &&
      Array.isArray(m.tricks) &&
      m.tricks.length > 0 &&
      m.tricks.length <= 5
  );
}

/** Bloc « pli » du dernier pli du moment : une carte par joueur, gagnant mis en valeur, Kora sur le 3 gagnant. */
export function buildTrickBlock(moment: KoraMoment, id: string = 'b-trick'): CardsBlock | null {
  const trick = moment.tricks.find((t) => t.number === 5) ?? moment.tricks[moment.tricks.length - 1];
  if (!trick || trick.plays.length === 0) return null;

  const cards: CardItem[] = trick.plays.slice(0, 4).map((play) => {
    const isWinner = trick.winnerSeat === play.seat;
    const isKoraCard = isWinner && trick.number === 5 && play.rank === '3';
    const label = isKoraCard ? (moment.kind === 'DOUBLE_KORA' ? 'DOUBLE KORA' : 'KORA') : undefined;
    return {
      rank: play.rank,
      suit: play.suit,
      player: seatLabel(play.seat),
      highlight: isWinner,
      ...(label ? { label } : {}),
    };
  });

  return { id, type: 'CARDS', cards, arrangement: 'TRICK', priority: 1 };
}

/** Résumé très court de la situation, donné à l'IA à la place d'un long historique. */
export function momentToBrief(moment: KoraMoment): string {
  const kind = moment.kind === 'DOUBLE_KORA' ? 'Double Kora' : 'Kora';
  const lastTrick = moment.tricks.find((t) => t.number === 5) ?? moment.tricks[moment.tricks.length - 1];
  const winnerPlay = lastTrick?.plays.find((p) => p.seat === moment.winnerSeat);
  const winnerTricks = moment.tricks.filter((t) => t.winnerSeat === moment.winnerSeat).length;
  const winnerLabel = seatLabel(moment.winnerSeat);
  const winningCard = winnerPlay ? `${winnerPlay.rank}${winnerPlay.suit}` : 'un 3';
  return `${kind} réussi à ${moment.playerCount} joueurs : ${winnerLabel} gagne le 5e pli avec ${winningCard} et remporte ${winnerTricks} plis sur ${moment.tricks.length}.`;
}

/**
 * Remplace les blocs de cartes d'un visuel par le pli réel du moment, juste après l'accroche.
 * Respecte le maximum de blocs. Renvoie false si le moment ne contient aucun pli exploitable.
 */
export function injectTrickBlock(spec: VisualSpec, moment: KoraMoment): boolean {
  const trick = buildTrickBlock(moment);
  if (!trick) return false;

  const blocks: VisualBlock[] = spec.blocks.filter((b) => b.type !== 'CARDS');
  while (blocks.length >= BLOCK_LIMITS.MAX_BLOCKS) {
    let removeIndex = -1;
    for (let i = blocks.length - 1; i >= 0; i--) {
      if (blocks[i].type !== 'HOOK' && blocks[i].type !== 'BADGE') {
        removeIndex = i;
        break;
      }
    }
    if (removeIndex === -1) break;
    blocks.splice(removeIndex, 1);
  }

  const hookIndex = blocks.findIndex((b) => b.type === 'HOOK');
  blocks.splice(hookIndex >= 0 ? hookIndex + 1 : blocks.length, 0, trick);
  spec.blocks = blocks;
  return true;
}

/**
 * Une carte n'existe qu'une fois dans le paquet de 31 cartes : retire toute carte en double
 * dans les blocs de cartes d'un visuel et renvoie la liste des cartes retirées (ex. « 3♥ »).
 */
export function removeDuplicateCards(spec: VisualSpec): string[] {
  const seen = new Set<string>();
  const removed: string[] = [];

  for (const block of spec.blocks) {
    if (block.type !== 'CARDS') continue;
    block.cards = block.cards.filter((card) => {
      const key = `${card.rank}${card.suit}`;
      if (seen.has(key)) {
        removed.push(key);
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  return removed;
}
