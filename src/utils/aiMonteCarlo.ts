import { Card, PlayedCard, Player, Suit, Trick } from '../types';
import { build31Deck, determineTrickWinner } from './deck';
import { EXPERT_CONFIG, GRAND_MASTER_CONFIG } from './aiLevelConfig';
import { isDynamicBossCard } from './ai';

/**
 * Normal Policy Card Selector for Rollouts:
 * Models standard competent play without advanced Kora planning.
 * Highly optimized for speed during Monte Carlo simulations.
 */
function chooseNormalPolicyRolloutCard(
  validCards: Card[],
  hand: Card[],
  leadSuit: Suit | null,
  currentPlays: PlayedCard[],
  trickNumber: number,
  playedCardsSoFar: Card[]
): Card {
  if (validCards.length === 1) return validCards[0];

  // 1. LEAD PLAY (!leadSuit)
  if (!leadSuit) {
    // Trick 5 is the decisive pot trick: always play the highest available card!
    if (trickNumber === 5) {
      return [...validCards].sort((a, b) => b.value - a.value)[0];
    }

    // Trick 4 setup:
    if (trickNumber === 4) {
      const bosses = validCards.filter((c) => isDynamicBossCard(c, playedCardsSoFar));
      if (bosses.length >= 2) {
        // Hold 2+ bosses: lead one to win trick 4 and keep the other for trick 5
        return bosses.sort((a, b) => b.value - a.value)[0];
      }
      if (bosses.length === 1) {
        // Hold 1 boss: preserve boss for trick 5 and lead lower non-boss card
        const nonBosses = validCards.filter((c) => !isDynamicBossCard(c, playedCardsSoFar));
        if (nonBosses.length > 0) {
          return nonBosses.sort((a, b) => a.value - b.value)[0];
        }
      }
      // No bosses: lead lowest card
      return [...validCards].sort((a, b) => a.value - b.value)[0];
    }

    // Tricks 1 to 3:
    // Lead lowest non-boss card to bleed/duck safely
    const nonBosses = validCards.filter((c) => !isDynamicBossCard(c, playedCardsSoFar));
    if (nonBosses.length > 0) {
      return nonBosses.sort((a, b) => a.value - b.value)[0];
    }
    return [...validCards].sort((a, b) => a.value - b.value)[0];
  }

  // 2. FOLLOWING SUIT (has lead suit)
  const hasMatchingSuit = hand.some((c) => c.suit === leadSuit);
  if (hasMatchingSuit) {
    const suitCardsAsc = [...validCards].sort((a, b) => a.value - b.value);
    const { winningValue } = determineTrickWinner(currentPlays, leadSuit);
    const winningCards = suitCardsAsc.filter((c) => c.value > winningValue);

    if (trickNumber === 5) {
      // Trick 5: win pot with lowest winning card if possible, else duck lowest
      return winningCards.length > 0 ? winningCards[0] : suitCardsAsc[0];
    }

    // If opponent already played an unbeatable card (10, 9 of pikes, or current boss):
    const isUnbeatable = winningValue === 10 || (leadSuit === 'PIQUE' && winningValue === 9);
    if (isUnbeatable) {
      return suitCardsAsc[0];
    }

    // If last player to act in the trick:
    const isLastPlayer = currentPlays.length >= (hand.length > 1 ? 3 : 1);
    if (isLastPlayer && winningCards.length > 0) {
      // Win with lowest winning card to take trick
      return winningCards[0];
    }

    // In mid-trick position: take trick if winning card is cheap or if holding boss
    if (winningCards.length > 0 && winningValue <= 6) {
      const cheapWinner = winningCards.find((c) => c.value <= 9 && !isDynamicBossCard(c, playedCardsSoFar));
      if (cheapWinner) return cheapWinner;
    }

    // Default: duck with lowest card of the suit
    return suitCardsAsc[0];
  }

  // 3. DISCARDING (cannot follow suit)
  // Protect 10s, dynamic bosses, and 3s. Discard lowest non-boss card.
  const scoredDiscards = validCards.map((c) => {
    let discardScore = 100;
    if (isDynamicBossCard(c, playedCardsSoFar)) discardScore -= 80;
    if (c.value === 10 || (c.suit === 'PIQUE' && c.value === 9)) discardScore -= 90;
    if (c.value === 3) discardScore += 50; // Discard 3s early to avoid accidental Kora
    discardScore -= c.value * 2;
    return { card: c, score: discardScore };
  });

  scoredDiscards.sort((a, b) => b.score - a.score);
  return scoredDiscards[0].card;
}

/**
 * Shared Monte Carlo Determinization (PIMC) Engine:
 * Used for both EXPERT (light MC: 8ms, 20-120 samples) and GRAND_MASTER (25ms, 60-400 samples).
 * Evaluates every legal candidate card by sampling plausible assignments
 * of unseen cards across opponents respecting known voids, and playing out
 * the remainder of the deal under the Normal policy.
 *
 * Chooses the card that maximizes expected pot payoff according to level configuration.
 * NEVER accesses opponent hands: strictly legal public information inference.
 */
export function chooseMonteCarloAICard(
  validCards: Card[],
  hand: Card[],
  leadSuit: Suit | null,
  currentPlays: PlayedCard[],
  trickNumber: number,
  tricksHistory: Trick[],
  activePlayerCount: number,
  players: Player[],
  myPlayerIndex: number,
  knownVoids: Map<number, Set<Suit>>,
  level: 'EXPERT' | 'GRAND_MASTER' = 'GRAND_MASTER'
): Card {
  if (validCards.length === 1) return validCards[0];

  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const config = level === 'EXPERT' ? EXPERT_CONFIG : GRAND_MASTER_CONFIG;
  const {
    TIME_BUDGET_MS,
    MIN_SAMPLES,
    MAX_SAMPLES,
    BATCH_SIZE,
    STANDARD_PAYOFF_MULTIPLIER,
    KORA_PAYOFF_MULTIPLIER,
  } = config;

  // 1. Gather all public cards played so far
  const cardsPlayedSoFar: Card[] = [];
  tricksHistory.forEach((t) => t.plays.forEach((p) => cardsPlayedSoFar.push(p.card)));
  currentPlays.forEach((p) => cardsPlayedSoFar.push(p.card));

  // 2. Identify all unseen cards (31 total in deck minus hand minus cardsPlayedSoFar)
  const all31 = build31Deck();
  const seenCardIds = new Set<string>();
  hand.forEach((c) => seenCardIds.add(c.id));
  cardsPlayedSoFar.forEach((c) => seenCardIds.add(c.id));
  const unseenCards = all31.filter((c) => !seenCardIds.has(c.id));

  // 3. Identify active opponents and their remaining unplayed card counts
  interface ActiveOpponentInfo {
    playerIndex: number;
    cardsNeeded: number;
    forbiddenSuits: Set<Suit>;
  }

  const activeOpponents: ActiveOpponentInfo[] = [];
  players.forEach((p, idx) => {
    if (idx !== myPlayerIndex && !p.isEliminated) {
      const cardsNeeded = p.hand.length;
      if (cardsNeeded > 0) {
        activeOpponents.push({
          playerIndex: idx,
          cardsNeeded,
          forbiddenSuits: knownVoids.get(idx) || new Set<Suit>(),
        });
      }
    }
  });

  // Sort opponents by number of restrictions (most constrained first for clean bipartite sampling)
  activeOpponents.sort((a, b) => b.forbiddenSuits.size - a.forbiddenSuits.size);

  // Track payoffs, wins, and kora successes per candidate card
  const wins: Record<string, number> = {};
  const koraWins: Record<string, number> = {};
  validCards.forEach((c) => {
    wins[c.id] = 0;
    koraWins[c.id] = 0;
  });

  // Active seat order around the table
  const activeIndices = players
    .map((p, idx) => ({ idx, isEliminated: p.isEliminated }))
    .filter((p) => !p.isEliminated)
    .map((p) => p.idx);

  const totalSeats = players.length;

  // Determine who led the current trick
  const trickLeadPlayerIndex = currentPlays.length > 0 ? currentPlays[0].playerIndex : myPlayerIndex;

  // Check if bot already won trick 4 with a 3 in tricksHistory (for Double Kora tracking)
  const trick4History = tricksHistory.find((t) => t.trickNumber === 4);
  const botWonTrick4WithThreeInHistory = Boolean(
    trick4History &&
    trick4History.winnerIndex === myPlayerIndex &&
    trick4History.winningCard?.value === 3
  );

  let samplesDone = 0;

  // Main adaptive Monte Carlo loop
  while (samplesDone < MAX_SAMPLES) {
    for (let b = 0; b < BATCH_SIZE && samplesDone < MAX_SAMPLES; b++) {
      // A. Determinization: Sample a plausible world
      const remainingPool = [...unseenCards];
      // Fisher-Yates shuffle
      for (let i = remainingPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = remainingPool[i];
        remainingPool[i] = remainingPool[j];
        remainingPool[j] = temp;
      }

      const sampledHands = new Map<number, Card[]>();

      for (const opp of activeOpponents) {
        const needed = opp.cardsNeeded;
        const handForOpp: Card[] = [];

        // Pick eligible cards from pool respecting known voids
        for (let i = remainingPool.length - 1; i >= 0 && handForOpp.length < needed; i--) {
          if (!opp.forbiddenSuits.has(remainingPool[i].suit)) {
            handForOpp.push(remainingPool[i]);
            remainingPool.splice(i, 1);
          }
        }

        // Fallback in rare constraint conflict
        while (handForOpp.length < needed && remainingPool.length > 0) {
          handForOpp.push(remainingPool.pop()!);
        }

        sampledHands.set(opp.playerIndex, handForOpp);
      }

      // B. Rollout each candidate card under this sampled world
      for (const candidate of validCards) {
        // Clone hands for this simulation
        const simHands = new Map<number, Card[]>();
        for (const [pIdx, cards] of sampledHands.entries()) {
          simHands.set(pIdx, [...cards]);
        }
        simHands.set(
          myPlayerIndex,
          hand.filter((c) => c.id !== candidate.id)
        );

        const simPlayedCards = [...cardsPlayedSoFar, candidate];
        const simTrickPlays: PlayedCard[] = [
          ...currentPlays,
          {
            playerIndex: myPlayerIndex,
            playerName: players[myPlayerIndex]?.name || '',
            card: candidate,
            isLeadCard: currentPlays.length === 0,
            isMatchingSuit: leadSuit ? candidate.suit === leadSuit : true,
            isWinningSoFar: false,
            playedOrder: currentPlays.length + 1,
          },
        ];

        let simLeadSuit: Suit = leadSuit || candidate.suit;

        // Finish CURRENT trick:
        // Identify remaining players to act in current trick in seating order
        const alreadyPlayedInTrick = new Set(simTrickPlays.map((p) => p.playerIndex));

        // Start from trick lead player and advance clockwise
        let seat = (trickLeadPlayerIndex + 1) % totalSeats;
        while (alreadyPlayedInTrick.size < activePlayerCount) {
          if (activeIndices.includes(seat) && !alreadyPlayedInTrick.has(seat)) {
            const pHands = simHands.get(seat) || [];
            if (pHands.length > 0) {
              const matching = pHands.filter((c) => c.suit === simLeadSuit);
              const playables = matching.length > 0 ? matching : pHands;
              const cardChosen = chooseNormalPolicyRolloutCard(
                playables,
                pHands,
                simLeadSuit,
                simTrickPlays,
                trickNumber,
                simPlayedCards
              );

              // Remove card from sim hand
              const cardIdx = pHands.findIndex((c) => c.id === cardChosen.id);
              if (cardIdx !== -1) pHands.splice(cardIdx, 1);

              simPlayedCards.push(cardChosen);
              simTrickPlays.push({
                playerIndex: seat,
                playerName: players[seat]?.name || '',
                card: cardChosen,
                isLeadCard: false,
                isMatchingSuit: cardChosen.suit === simLeadSuit,
                isWinningSoFar: false,
                playedOrder: simTrickPlays.length + 1,
              });
              alreadyPlayedInTrick.add(seat);
            } else {
              alreadyPlayedInTrick.add(seat);
            }
          }
          seat = (seat + 1) % totalSeats;
        }

        // Resolve current trick winner
        const { winnerPlay } = determineTrickWinner(simTrickPlays, simLeadSuit);
        let lastWinner = winnerPlay ? winnerPlay.playerIndex : myPlayerIndex;
        let lastWinningCard = winnerPlay ? winnerPlay.card : candidate;
        let botWonTrick4WithThree =
          botWonTrick4WithThreeInHistory ||
          (trickNumber === 4 && lastWinner === myPlayerIndex && lastWinningCard.value === 3);

        // Subsequent tricks up to Trick 5
        for (let tNum = trickNumber + 1; tNum <= 5; tNum++) {
          const nextTrickPlays: PlayedCard[] = [];
          let nextLeadSuit: Suit | null = null;

          // Trick leader plays first
          const leaderHand = simHands.get(lastWinner) || [];
          if (leaderHand.length === 0) break;

          const leadCard = chooseNormalPolicyRolloutCard(
            leaderHand,
            leaderHand,
            null,
            [],
            tNum,
            simPlayedCards
          );
          const lIdx = leaderHand.findIndex((c) => c.id === leadCard.id);
          if (lIdx !== -1) leaderHand.splice(lIdx, 1);

          simPlayedCards.push(leadCard);
          nextLeadSuit = leadCard.suit;
          nextTrickPlays.push({
            playerIndex: lastWinner,
            playerName: players[lastWinner]?.name || '',
            card: leadCard,
            isLeadCard: true,
            isMatchingSuit: true,
            isWinningSoFar: false,
            playedOrder: 1,
          });

          // Other active players in clockwise order
          let nextSeat = (lastWinner + 1) % totalSeats;
          while (nextTrickPlays.length < activePlayerCount) {
            if (activeIndices.includes(nextSeat) && nextSeat !== lastWinner) {
              const followerHand = simHands.get(nextSeat) || [];
              if (followerHand.length > 0) {
                const matching = followerHand.filter((c) => c.suit === nextLeadSuit);
                const playables = matching.length > 0 ? matching : followerHand;
                const fCard = chooseNormalPolicyRolloutCard(
                  playables,
                  followerHand,
                  nextLeadSuit,
                  nextTrickPlays,
                  tNum,
                  simPlayedCards
                );

                const fIdx = followerHand.findIndex((c) => c.id === fCard.id);
                if (fIdx !== -1) followerHand.splice(fIdx, 1);

                simPlayedCards.push(fCard);
                nextTrickPlays.push({
                  playerIndex: nextSeat,
                  playerName: players[nextSeat]?.name || '',
                  card: fCard,
                  isLeadCard: false,
                  isMatchingSuit: fCard.suit === nextLeadSuit,
                  isWinningSoFar: false,
                  playedOrder: nextTrickPlays.length + 1,
                });
              }
            }
            nextSeat = (nextSeat + 1) % totalSeats;
          }

          // Resolve trick tNum winner
          const res = determineTrickWinner(nextTrickPlays, nextLeadSuit);
          lastWinner = res.winnerPlay ? res.winnerPlay.playerIndex : lastWinner;
          lastWinningCard = res.winnerPlay ? res.winnerPlay.card : leadCard;

          if (tNum === 4 && lastWinner === myPlayerIndex && lastWinningCard.value === 3) {
            botWonTrick4WithThree = true;
          }
        }

        // Pot outcome at Trick 5:
        if (lastWinner === myPlayerIndex) {
          wins[candidate.id]++;
          if (lastWinningCard.value === 3) {
            koraWins[candidate.id]++;
          }
        }
      }

      samplesDone++;
    }

    // Adaptive time budget check
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const elapsed = now - startTime;
    if (samplesDone >= MIN_SAMPLES && elapsed >= TIME_BUDGET_MS * 0.85) {
      break;
    }
    if (elapsed >= TIME_BUDGET_MS) {
      break;
    }
  }

  // 4. Select candidate maximizing pot win rate, with a Kora bonus weighted by level configuration
  let bestCard = validCards[0];
  let bestScore = -1;

  // Weight Kora bonus based on level's KORA_PAYOFF_MULTIPLIER relative to standard payoff
  const koraWeight = (KORA_PAYOFF_MULTIPLIER - STANDARD_PAYOFF_MULTIPLIER) * 0.15;

  for (const candidate of validCards) {
    const winRate = wins[candidate.id] / Math.max(1, samplesDone);
    const koraRate = koraWins[candidate.id] / Math.max(1, samplesDone);
    const score = winRate * STANDARD_PAYOFF_MULTIPLIER + koraRate * koraWeight;

    if (
      score > bestScore ||
      (Math.abs(score - bestScore) < 1e-4 &&
        (trickNumber === 5 ? candidate.value > bestCard.value : candidate.value < bestCard.value))
    ) {
      bestScore = score;
      bestCard = candidate;
    }
  }

  return bestCard;
}

/** Backward-compatible export wrapper for Grand Katika */
export function chooseGrandMasterMonteCarlo(
  validCards: Card[],
  hand: Card[],
  leadSuit: Suit | null,
  currentPlays: PlayedCard[],
  trickNumber: number,
  tricksHistory: Trick[],
  activePlayerCount: number,
  players: Player[],
  myPlayerIndex: number,
  knownVoids: Map<number, Set<Suit>>
): Card {
  return chooseMonteCarloAICard(
    validCards,
    hand,
    leadSuit,
    currentPlays,
    trickNumber,
    tricksHistory,
    activePlayerCount,
    players,
    myPlayerIndex,
    knownVoids,
    'GRAND_MASTER'
  );
}
