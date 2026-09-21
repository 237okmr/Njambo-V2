import { build31Deck, dealCards, determineTrickWinner, getPlayableCards, shuffleDeck } from '../src/utils/deck';
import { chooseAICard } from '../src/utils/ai';
import { AIDifficulty, Card, PlayedCard, Player, Suit, Trick } from '../src/types';

function runDuel(
  diff1: AIDifficulty | 'RANDOM',
  diff2: AIDifficulty | 'RANDOM',
  numDeals: number
): { p1Wins: number; p2Wins: number; koraCount: number; doubleKoraCount: number } {
  let p1Wins = 0;
  let p2Wins = 0;
  let koraCount = 0;
  let doubleKoraCount = 0;

  for (let d = 0; d < numDeals; d++) {
    const deck = shuffleDeck(build31Deck());
    const { hands } = dealCards(deck, 2, d % 2);

    const players: Player[] = [
      {
        id: 'p0',
        name: `Bot_${diff1}`,
        avatarSeed: '1',
        isHuman: false,
        hand: [...hands[0]],
        tricksWonInRound: 0,
        score: 0,
        capital: 10,
        isEliminated: false,
      },
      {
        id: 'p1',
        name: `Bot_${diff2}`,
        avatarSeed: '2',
        isHuman: false,
        hand: [...hands[1]],
        tricksWonInRound: 0,
        score: 0,
        capital: 10,
        isEliminated: false,
      },
    ];

    let currentTurn = (d + 1) % 2; // lead rotates
    const tricksHistory: Trick[] = [];
    let p0WonTrick4WithThree = false;
    let p1WonTrick4WithThree = false;

    for (let trickNum = 1; trickNum <= 5; trickNum++) {
      const currentPlays: PlayedCard[] = [];
      let leadSuit: Suit | null = null;

      for (let step = 0; step < 2; step++) {
        const pIdx = currentTurn;
        const player = players[pIdx];
        const validCards = getPlayableCards(player.hand, leadSuit);
        let card: Card;

        const pDiff = pIdx === 0 ? diff1 : diff2;
        if (pDiff === 'RANDOM') {
          card = validCards[Math.floor(Math.random() * validCards.length)];
        } else {
          card = chooseAICard(
            player.hand,
            leadSuit,
            currentPlays,
            trickNum,
            'CONSERVATIVE',
            tricksHistory,
            2,
            pDiff,
            players,
            pIdx
          );
        }

        // remove from hand
        player.hand = player.hand.filter((c) => c.id !== card.id);
        if (step === 0) leadSuit = card.suit;

        currentPlays.push({
          playerIndex: pIdx,
          playerName: player.name,
          card,
          isLeadCard: step === 0,
          isMatchingSuit: leadSuit ? card.suit === leadSuit : true,
          isWinningSoFar: false,
          playedOrder: step + 1,
        });

        currentTurn = (currentTurn + 1) % 2;
      }

      const { winnerPlay } = determineTrickWinner(currentPlays, leadSuit);
      const winnerIdx = winnerPlay.playerIndex;
      players[winnerIdx].tricksWonInRound++;

      if (trickNum === 4 && winnerPlay.card.value === 3) {
        if (winnerIdx === 0) p0WonTrick4WithThree = true;
        else p1WonTrick4WithThree = true;
      }

      tricksHistory.push({
        trickNumber: trickNum,
        leadPlayerIndex: currentPlays[0].playerIndex,
        leadPlayerName: currentPlays[0].playerName,
        leadSuit: leadSuit!,
        plays: currentPlays,
        winnerIndex: winnerIdx,
        winnerName: players[winnerIdx].name,
        winningCard: winnerPlay.card,
        isComplete: true,
      });

      currentTurn = winnerIdx;

      // Trick 5 determines pot winner
      if (trickNum === 5) {
        if (winnerIdx === 0) {
          p1Wins++;
          if (winnerPlay.card.value === 3) {
            koraCount++;
            if (p0WonTrick4WithThree) doubleKoraCount++;
          }
        } else {
          p2Wins++;
          if (winnerPlay.card.value === 3) {
            koraCount++;
            if (p1WonTrick4WithThree) doubleKoraCount++;
          }
        }
      }
    }
  }

  return { p1Wins, p2Wins, koraCount, doubleKoraCount };
}

console.log('--- Running Duels (1,000 deals each) ---');

console.log('1. Facile vs Random:');
const r1 = runDuel('EASY', 'RANDOM', 1000);
console.log(`   Facile: ${(r1.p1Wins / 10).toFixed(1)}% | Random: ${(r1.p2Wins / 10).toFixed(1)}%`);

console.log('2. Normal vs Facile:');
const r2 = runDuel('NORMAL', 'EASY', 1000);
console.log(`   Normal: ${(r2.p1Wins / 10).toFixed(1)}% | Facile: ${(r2.p2Wins / 10).toFixed(1)}% | Kora: ${(r2.koraCount / 10).toFixed(1)}%`);

console.log('3. Expert vs Normal:');
const r3 = runDuel('EXPERT', 'NORMAL', 1000);
console.log(`   Expert: ${(r3.p1Wins / 10).toFixed(1)}% | Normal: ${(r3.p2Wins / 10).toFixed(1)}% | Kora: ${(r3.koraCount / 10).toFixed(1)}%`);

console.log('4. Grand Katika vs Expert:');
const r4 = runDuel('GRAND_MASTER', 'EXPERT', 300);
console.log(`   Grand Katika: ${(r4.p1Wins / 3).toFixed(1)}% | Expert: ${(r4.p2Wins / 3).toFixed(1)}% | Kora: ${(r4.koraCount / 3).toFixed(1)}%`);

console.log('5. Grand Katika vs Facile:');
const r5 = runDuel('GRAND_MASTER', 'EASY', 300);
console.log(`   Grand Katika: ${(r5.p1Wins / 3).toFixed(1)}% | Facile: ${(r5.p2Wins / 3).toFixed(1)}% | Kora: ${(r5.koraCount / 3).toFixed(1)}%`);

function run4PlayerMatch(targetDiff: AIDifficulty, otherDiff: AIDifficulty, numDeals: number): number {
  let targetWins = 0;
  for (let d = 0; d < numDeals; d++) {
    const deck = shuffleDeck(build31Deck());
    const { hands } = dealCards(deck, 4, d % 4);
    const diffs: AIDifficulty[] = [targetDiff, otherDiff, otherDiff, otherDiff];
    const players: Player[] = hands.map((h, i) => ({
      id: `p${i}`,
      name: `Bot_${diffs[i]}_${i}`,
      avatarSeed: `${i}`,
      isHuman: false,
      hand: [...h],
      tricksWonInRound: 0,
      score: 0,
      capital: 10,
      isEliminated: false,
    }));

    let currentTurn = d % 4;
    const tricksHistory: Trick[] = [];

    for (let trickNum = 1; trickNum <= 5; trickNum++) {
      const currentPlays: PlayedCard[] = [];
      let leadSuit: Suit | null = null;

      for (let step = 0; step < 4; step++) {
        const pIdx = currentTurn;
        const player = players[pIdx];
        const validCards = getPlayableCards(player.hand, leadSuit);
        const card = chooseAICard(
          player.hand,
          leadSuit,
          currentPlays,
          trickNum,
          'CONSERVATIVE',
          tricksHistory,
          4,
          diffs[pIdx],
          players,
          pIdx
        );

        player.hand = player.hand.filter((c) => c.id !== card.id);
        if (step === 0) leadSuit = card.suit;

        currentPlays.push({
          playerIndex: pIdx,
          playerName: player.name,
          card,
          isLeadCard: step === 0,
          isMatchingSuit: leadSuit ? card.suit === leadSuit : true,
          isWinningSoFar: false,
          playedOrder: step + 1,
        });

        currentTurn = (currentTurn + 1) % 4;
      }

      const { winnerPlay } = determineTrickWinner(currentPlays, leadSuit);
      const winnerIdx = winnerPlay.playerIndex;
      players[winnerIdx].tricksWonInRound++;

      tricksHistory.push({
        trickNumber: trickNum,
        leadPlayerIndex: currentPlays[0].playerIndex,
        leadPlayerName: currentPlays[0].playerName,
        leadSuit: leadSuit!,
        plays: currentPlays,
        winnerIndex: winnerIdx,
        winnerName: players[winnerIdx].name,
        winningCard: winnerPlay.card,
        isComplete: true,
      });

      currentTurn = winnerIdx;

      if (trickNum === 5 && winnerIdx === 0) {
        targetWins++;
      }
    }
  }
  return (targetWins / numDeals) * 100;
}

console.log('6. 4-Player Match: 1 Expert vs 3 Normal (500 deals):');
const p4WinRate = run4PlayerMatch('EXPERT', 'NORMAL', 500);
console.log(`   Expert Win Rate (4 players): ${p4WinRate.toFixed(1)}%`);

