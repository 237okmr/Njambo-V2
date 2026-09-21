import { Card, PlayedCard, Suit, SUITS_INFO } from '../types';

/**
 * Builds the exact 31-card deck specified for Njambo Kora:
 * - Koubi (Cœur): 10, 9, 8, 7, 6, 5, 4, 3 (8 cards)
 * - Zing (Carreau): 10, 9, 8, 7, 6, 5, 4, 3 (8 cards)
 * - Tchaka (Trèfle): 10, 9, 8, 7, 6, 5, 4, 3 (8 cards)
 * - Black (Pique): 9, 8, 7, 6, 5, 4, 3 (7 cards - 10 Black est EXCLU)
 * Total: 31 cards
 */
export function build31Deck(): Card[] {
  const deck: Card[] = [];
  const suits: Suit[] = ['COEUR', 'CARREAU', 'TREFLE', 'PIQUE'];

  for (const suit of suits) {
    const suitInfo = SUITS_INFO[suit];
    // Values: 10 down to 3, except for PIQUE where 10 is excluded (9 down to 3)
    const startValue = suit === 'PIQUE' ? 9 : 10;

    for (let val = startValue; val >= 3; val--) {
      deck.push({
        id: `${suit}_${val}`,
        suit,
        value: val,
        label: `${val} ${suitInfo.name}`,
        shortLabel: `${val}${suitInfo.symbol}`,
      });
    }
  }

  return deck;
}

/**
 * Shuffles an array of cards using Fisher-Yates algorithm
 */
export function shuffleDeck(deck: Card[]): Card[] {
  const array = [...deck];
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Distributes strictly 5 cards to each player from the 31-card deck
 * according to the Njambo tradition: 3 cards then 2 cards per player,
 * starting from the player after the dealer in turn order.
 * The remaining cards (31 - players*5) are put aside for the round.
 */
export function dealCards(
  shuffledDeck: Card[],
  playerCount: number,
  dealerIndex: number = 0
): { hands: Card[][]; remainingDeck: Card[] } {
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  const workingDeck = [...shuffledDeck];

  const leadIndex = (dealerIndex + 1) % playerCount;
  const dealOrder: number[] = [];
  for (let i = 0; i < playerCount; i++) {
    dealOrder.push((leadIndex + i) % playerCount);
  }

  // Pass 1: Give 3 cards to each player in turn order
  for (const p of dealOrder) {
    for (let c = 0; c < 3; c++) {
      if (workingDeck.length > 0) {
        hands[p].push(workingDeck.shift()!);
      }
    }
  }

  // Pass 2: Give 2 cards to each player in turn order
  for (const p of dealOrder) {
    for (let c = 0; c < 2; c++) {
      if (workingDeck.length > 0) {
        hands[p].push(workingDeck.shift()!);
      }
    }
  }

  // Sort each player's hand neatly by suit then value descending
  for (let p = 0; p < playerCount; p++) {
    hands[p].sort((a, b) => {
      if (a.suit !== b.suit) {
        const suitOrder: Record<Suit, number> = {
          COEUR: 1,
          CARREAU: 2,
          TREFLE: 3,
          PIQUE: 4,
        };
        return suitOrder[a.suit] - suitOrder[b.suit];
      }
      return b.value - a.value;
    });
  }

  return { hands, remainingDeck: workingDeck };
}

/**
 * Checks if a specific card in player's hand is playable according to the rules:
 * - If leadSuit is null (entameur): ALL cards in hand are playable.
 * - If player has at least one card of leadSuit: ONLY cards of leadSuit are playable (obligation to follow).
 * - If player has NO cards of leadSuit: ALL cards in hand are playable (can discard any).
 */
export function isCardPlayable(
  card: Card,
  hand: Card[],
  leadSuit: Suit | null
): boolean {
  if (!leadSuit) {
    return true; // Lead player can play anything
  }

  const hasLeadSuit = hand.some((c) => c.suit === leadSuit);
  if (hasLeadSuit) {
    return card.suit === leadSuit;
  }

  // Does not have the lead suit -> can discard any card
  return true;
}

/**
 * Returns all playable cards in a player's hand given the current lead suit
 */
export function getPlayableCards(hand: Card[], leadSuit: Suit | null): Card[] {
  return hand.filter((c) => isCardPlayable(c, hand, leadSuit));
}

/**
 * Determines the winning card and winning player of a completed or in-progress trick.
 * Rule:
 * 1. Only cards matching leadSuit are eligible to win.
 * 2. Highest numerical value among eligible cards wins.
 * 3. If there is an equal highest value, the first played card wins (Cas 2).
 */
export function determineTrickWinner(
  plays: PlayedCard[],
  leadSuit: Suit | null
): { winnerPlay: PlayedCard | null; winningValue: number } {
  if (plays.length === 0 || !leadSuit) {
    return { winnerPlay: null, winningValue: 0 };
  }

  // Filter only plays that followed the requested lead suit
  const eligiblePlays = plays.filter((p) => p.card.suit === leadSuit);

  if (eligiblePlays.length === 0) {
    return { winnerPlay: null, winningValue: 0 };
  }

  let bestPlay = eligiblePlays[0];

  for (let i = 1; i < eligiblePlays.length; i++) {
    const current = eligiblePlays[i];
    // Numerical hierarchy strictly: 10 > 9 > 8 > ... > 3
    // In case of tie, first played wins (strictly greater required to replace)
    if (current.card.value > bestPlay.card.value) {
      bestPlay = current;
    }
  }

  return { winnerPlay: bestPlay, winningValue: bestPlay.card.value };
}

export const DEFAULT_BASE_BET = 10;
export const DEFAULT_INITIAL_CAPITAL = 100;
