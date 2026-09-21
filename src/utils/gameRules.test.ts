import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computePartieOutcome,
  applyPartiePayout,
  detectInstantWin,
} from './gameRules';

describe('gameRules - computePartieOutcome', () => {
  it('Kora (5e pli avec un 3)', () => {
    const outcome = computePartieOutcome({
      fifthTrickWinnerIndex: 1,
      fifthTrickWinningValue: 3,
      fourthTrickWinnerIndex: 0,
      fourthTrickWinningValue: 10,
      enableDoubleKora: true,
    });
    assert.deepEqual(outcome, {
      winType: 'KORA',
      multiplier: 2,
      winnerIndex: 1,
    });
  });

  it('Double Kora (4e et 5e plis avec un 3)', () => {
    const outcome = computePartieOutcome({
      fifthTrickWinnerIndex: 2,
      fifthTrickWinningValue: 3,
      fourthTrickWinnerIndex: 2,
      fourthTrickWinningValue: 3,
      enableDoubleKora: true,
    });
    assert.deepEqual(outcome, {
      winType: 'DOUBLE_KORA',
      multiplier: 4,
      winnerIndex: 2,
    });
  });

  it('Double Kora désactivé donc Kora simple', () => {
    const outcome = computePartieOutcome({
      fifthTrickWinnerIndex: 2,
      fifthTrickWinningValue: 3,
      fourthTrickWinnerIndex: 2,
      fourthTrickWinningValue: 3,
      enableDoubleKora: false,
    });
    assert.deepEqual(outcome, {
      winType: 'KORA',
      multiplier: 2,
      winnerIndex: 2,
    });
  });

  it('Gagnant du 5e pli avec une carte différente de 3 même après avoir gagné tous les plis, donc STANDARD', () => {
    const outcome = computePartieOutcome({
      fifthTrickWinnerIndex: 0,
      fifthTrickWinningValue: 10,
      fourthTrickWinnerIndex: 0,
      fourthTrickWinningValue: 3,
      enableDoubleKora: true,
    });
    assert.deepEqual(outcome, {
      winType: 'STANDARD',
      multiplier: 1,
      winnerIndex: 0,
    });
  });
});

describe('gameRules - applyPartiePayout', () => {
  it('Paiement conserve la somme des capitals (aucun jeton créé ni perdu)', () => {
    const initialCapitals = [500, 500, 500, 500];
    const pot = 200; // 50 bet per player already in pot
    const baseBet = 50;
    const multiplier = 2; // Kora x2

    const payout = applyPartiePayout({
      capitals: initialCapitals,
      isEliminated: [false, false, false, false],
      winnerIndex: 0,
      pot,
      baseBet,
      multiplier,
      rakePct: 0,
    });

    const initialSum = initialCapitals.reduce((a, b) => a + b, 0) + pot;
    const finalSum = payout.capitals.reduce((a, b) => a + b, 0);
    assert.equal(finalSum, initialSum);
    assert.equal(payout.extraCollected, 150); // 3 losers * 50
    assert.equal(payout.winnerReceived, 350); // 200 pot + 150 extra
    assert.deepEqual(payout.capitals, [850, 450, 450, 450]);
  });

  it('Pénalité plafonnée par le capital du perdant', () => {
    const capitals = [500, 20, 100];
    const pot = 150;
    const baseBet = 50;
    const multiplier = 4; // Double Kora x4 -> penalty per loser is 3 * 50 = 150

    const payout = applyPartiePayout({
      capitals,
      isEliminated: [false, false, false],
      winnerIndex: 0,
      pot,
      baseBet,
      multiplier,
    });

    // Loser 1 (cap 20): pays min(20, 150) = 20 -> cap 0
    // Loser 2 (cap 100): pays min(100, 150) = 100 -> cap 0
    assert.equal(payout.extraCollected, 120);
    assert.equal(payout.winnerReceived, 270);
    assert.deepEqual(payout.capitals, [770, 0, 0]);
  });

  it('Joueur déjà éliminé non prélevé', () => {
    const capitals = [500, 0, 400];
    const isEliminated = [false, true, false];
    const pot = 100;
    const baseBet = 50;
    const multiplier = 2;

    const payout = applyPartiePayout({
      capitals,
      isEliminated,
      winnerIndex: 0,
      pot,
      baseBet,
      multiplier,
    });

    assert.equal(payout.extraCollected, 50); // Only player 2 pays 50
    assert.deepEqual(payout.capitals, [650, 0, 350]);
    assert.deepEqual(payout.eliminated, [false, true, false]);
  });

  it('Éliminations au seuil exact de la mise', () => {
    const capitals = [500, 49, 50];
    const isEliminated = [false, false, false];

    const payout = applyPartiePayout({
      capitals,
      isEliminated,
      winnerIndex: 0,
      pot: 150,
      baseBet: 50,
      multiplier: 1, // Standard payout
    });

    assert.deepEqual(payout.eliminated, [false, true, false]); // 49 < 50 eliminated, 50 >= 50 not eliminated
  });

  it('Le gagnant n’est jamais marqué éliminé même en Kora', () => {
    const capitals = [100, 100, 100];
    const payout = applyPartiePayout({
      capitals,
      isEliminated: [false, false, false],
      winnerIndex: 0,
      pot: 150,
      baseBet: 50,
      multiplier: 2,
    });
    assert.equal(payout.eliminated[0], false);
    assert.deepEqual(payout.capitals, [350, 50, 50]);
  });

  it('Joueur exempté de pénalité ne paie pas et n’est pas éliminé si capital >= baseBet', () => {
    const capitals = [500, 100, 100];
    const payout = applyPartiePayout({
      capitals,
      isEliminated: [false, false, false],
      exemptFromPenalty: [false, true, false], // player 1 exempt
      winnerIndex: 0,
      pot: 150,
      baseBet: 50,
      multiplier: 2, // Kora x2
    });
    // Player 1 exempt: pays 0 penalty, cap remains 100
    // Player 2 not exempt: pays 50 penalty, cap becomes 50
    assert.deepEqual(payout.capitals, [700, 100, 50]);
    assert.deepEqual(payout.eliminated, [false, false, false]);
  });

  it('Joueur déjà éliminé reste éliminé et capital sum est conservée avec exemption', () => {
    const initialCapitals = [500, 100, 0];
    const pot = 150;
    const payout = applyPartiePayout({
      capitals: initialCapitals,
      isEliminated: [false, false, true],
      exemptFromPenalty: [false, true, false],
      winnerIndex: 0,
      pot,
      baseBet: 50,
      multiplier: 4,
    });
    assert.deepEqual(payout.eliminated, [false, false, true]);
    const initialSum = initialCapitals.reduce((a, b) => a + b, 0) + pot;
    const finalSum = payout.capitals.reduce((a, b) => a + b, 0);
    assert.equal(finalSum, initialSum);
  });
});

describe('gameRules - detectInstantWin', () => {
  it('trois 7 (THREE_SEVENS)', () => {
    const result = detectInstantWin({
      hands: [
        [{ value: 7 }, { value: 7 }, { value: 7 }, { value: 4 }, { value: 5 }],
        [{ value: 10 }, { value: 9 }, { value: 8 }, { value: 4 }, { value: 5 }],
      ],
      eligible: [true, true],
      dealerIndex: 1,
    });
    assert.deepEqual(result, {
      winnerIndex: 0,
      winType: 'THREE_SEVENS',
    });
  });

  it('moins de 21 (UNDER_21)', () => {
    const result = detectInstantWin({
      hands: [
        [{ value: 3 }, { value: 4 }, { value: 3 }, { value: 4 }, { value: 5 }], // sum 19
        [{ value: 10 }, { value: 9 }, { value: 8 }, { value: 4 }, { value: 5 }], // sum 36
      ],
      eligible: [true, true],
      dealerIndex: 1,
      enableUnder21: true,
    });
    assert.deepEqual(result, {
      winnerIndex: 0,
      winType: 'UNDER_21',
    });
  });

  it("égalité départagée par l'ordre après le donneur", () => {
    // Dealer is 0. Order after dealer: 1, 2, 3, 0
    const result = detectInstantWin({
      hands: [
        [{ value: 3 }, { value: 3 }, { value: 4 }, { value: 4 }, { value: 4 }], // sum 18 (index 0, distance 3)
        [{ value: 10 }, { value: 10 }, { value: 10 }, { value: 10 }, { value: 10 }], // sum 50
        [{ value: 3 }, { value: 3 }, { value: 4 }, { value: 4 }, { value: 4 }], // sum 18 (index 2, distance 1)
        [{ value: 10 }, { value: 10 }, { value: 10 }, { value: 10 }, { value: 10 }], // sum 50
      ],
      eligible: [true, true, true, true],
      dealerIndex: 0,
      enableUnder21: true,
    });
    assert.deepEqual(result, {
      winnerIndex: 2,
      winType: 'UNDER_21',
    });
  });

  it('aucune main gagnante', () => {
    const result = detectInstantWin({
      hands: [
        [{ value: 10 }, { value: 10 }, { value: 10 }, { value: 4 }, { value: 5 }], // sum 39
        [{ value: 10 }, { value: 9 }, { value: 8 }, { value: 4 }, { value: 5 }], // sum 36
      ],
      eligible: [true, true],
      dealerIndex: 0,
      enableUnder21: true,
    });
    assert.equal(result, null);
  });
});

describe('gameRules - tables de 2, 3 et 4 joueurs', () => {
  it('Table de 2 joueurs', () => {
    const outcome = computePartieOutcome({
      fifthTrickWinnerIndex: 1,
      fifthTrickWinningValue: 3,
      enableDoubleKora: true,
    });
    assert.equal(outcome.winType, 'KORA');

    const payout = applyPartiePayout({
      capitals: [200, 200],
      isEliminated: [false, false],
      winnerIndex: 1,
      pot: 100,
      baseBet: 50,
      multiplier: 2,
    });
    assert.deepEqual(payout.capitals, [150, 350]);
  });

  it('Table de 3 joueurs', () => {
    const outcome = computePartieOutcome({
      fifthTrickWinnerIndex: 0,
      fifthTrickWinningValue: 3,
      fourthTrickWinnerIndex: 0,
      fourthTrickWinningValue: 3,
      enableDoubleKora: true,
    });
    assert.equal(outcome.winType, 'DOUBLE_KORA');

    const payout = applyPartiePayout({
      capitals: [300, 300, 300],
      isEliminated: [false, false, false],
      winnerIndex: 0,
      pot: 150,
      baseBet: 50,
      multiplier: 4,
    });
    // Extra penalty per loser: 3 * 50 = 150
    // Total extra: 300. Pot: 150. Winner gets 450 -> total 750
    assert.deepEqual(payout.capitals, [750, 150, 150]);
  });

  it('Table de 4 joueurs', () => {
    const outcome = computePartieOutcome({
      fifthTrickWinnerIndex: 3,
      fifthTrickWinningValue: 10,
    });
    assert.equal(outcome.winType, 'STANDARD');

    const payout = applyPartiePayout({
      capitals: [100, 100, 100, 100],
      isEliminated: [false, false, false, false],
      winnerIndex: 3,
      pot: 200,
      baseBet: 50,
      multiplier: 1,
    });
    assert.deepEqual(payout.capitals, [100, 100, 100, 300]);
  });
});
