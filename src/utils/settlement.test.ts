import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyPartiePayout } from './gameRules';
import {
  FORFAIT_INACTIVITE_GELE_LE_SIEGE,
  FORFAIT_PENALITE_DES_PLI,
  FORFAIT_PENALITE_MULTIPLICATEUR,
  buildPartieResult,
  computeForfeitPenalty,
  estimateNetFromHistoryRecord,
} from './settlement';

const BET = 10;

function build(
  participants: Array<{ playerId: string; ante: number; penaltyPaid: number; gross: number }>,
  extra: { winnerId?: string | null; allowBurned?: boolean } = {}
) {
  return buildPartieResult({
    id: 'T_m1_p1',
    roomId: 'T',
    mancheNumber: 1,
    partieCount: 1,
    baseBet: BET,
    winnerId: extra.winnerId === undefined ? participants[0].playerId : extra.winnerId,
    winType: 'STANDARD',
    endReason: 'NORMAL',
    participants: participants.map((p) => ({ ...p, name: p.playerId, isHuman: true })),
    allowBurned: extra.allowBurned,
    createdAt: 1,
  });
}

function nets(out: ReturnType<typeof build>) {
  return Object.fromEntries(out.result.participants.map((p) => [p.playerId, p.net]));
}

/** Règlement complet d'une donne via applyPartiePayout (mêmes règles que le serveur). */
function settleViaPayout(n: number, multiplier: number, winnerIndex: number, caps?: number[]) {
  const capsAfterAnte = caps ?? Array(n).fill(100 - BET);
  const pot = BET * n;
  const payout = applyPartiePayout({
    capitals: capsAfterAnte,
    isEliminated: Array(n).fill(false),
    winnerIndex,
    pot,
    baseBet: BET,
    multiplier,
  });
  return Array.from({ length: n }, (_, i) => {
    const penaltyPaid = i === winnerIndex ? 0 : capsAfterAnte[i] - payout.capitals[i];
    return {
      playerId: `p${i}`,
      ante: BET,
      penaltyPaid,
      gross: i === winnerIndex ? payout.winnerReceived : 0,
    };
  });
}

describe('settlement - constantes', () => {
  it('valeurs décidées : x2 dès le pli 2', () => {
    assert.equal(FORFAIT_PENALITE_MULTIPLICATEUR, 2);
    assert.equal(FORFAIT_PENALITE_DES_PLI, 2);
    assert.equal(FORFAIT_INACTIVITE_GELE_LE_SIEGE, true);
  });
});

describe('settlement - donnes normales (somme nulle)', () => {
  it('victoire simple à 2 joueurs : +10 / -10', () => {
    const out = build(settleViaPayout(2, 1, 0));
    assert.deepEqual(nets(out), { p0: 10, p1: -10 });
    assert.equal(out.invariantOk, true);
    assert.equal(out.result.burned, 0);
  });

  it('Kora à 2 joueurs : +20 / -20', () => {
    const out = build(settleViaPayout(2, 2, 0));
    assert.deepEqual(nets(out), { p0: 20, p1: -20 });
    assert.equal(out.invariantOk, true);
  });

  it('Kora à 4 joueurs : +60 et -20 chacun', () => {
    const out = build(settleViaPayout(4, 2, 1));
    assert.deepEqual(nets(out), { p0: -20, p1: 60, p2: -20, p3: -20 });
    assert.equal(out.invariantOk, true);
  });

  it('Double Kora à 4 joueurs : +120 et -40 chacun', () => {
    const out = build(settleViaPayout(4, 4, 2));
    assert.deepEqual(nets(out), { p0: -40, p1: -40, p2: 120, p3: -40 });
    assert.equal(out.invariantOk, true);
  });

  it('pénalité Kora plafonnée au capital du perdant', () => {
    const out = build(settleViaPayout(2, 4, 0, [90, 5]));
    assert.deepEqual(nets(out), { p0: 15, p1: -15 });
    assert.equal(out.invariantOk, true);
  });
});

describe('settlement - passer (fold)', () => {
  it('à 2 joueurs : victoire simple, celui qui passe perd sa mise seule', () => {
    const out = build(settleViaPayout(2, 1, 1));
    assert.deepEqual(nets(out), { p0: -10, p1: 10 });
    assert.equal(out.invariantOk, true);
  });
});

describe('settlement - pénalité de forfait', () => {
  it('pli 1 : aucune pénalité', () => {
    assert.equal(computeForfeitPenalty({ baseBet: BET, capital: 90, currentTrickNumber: 1 }), 0);
  });

  it('pli 2 et suivants : une mise de pénalité', () => {
    assert.equal(computeForfeitPenalty({ baseBet: BET, capital: 90, currentTrickNumber: 2 }), 10);
    assert.equal(computeForfeitPenalty({ baseBet: BET, capital: 90, currentTrickNumber: 5 }), 10);
  });

  it('plafonnée au capital restant du partant', () => {
    assert.equal(computeForfeitPenalty({ baseBet: BET, capital: 4, currentTrickNumber: 3 }), 4);
    assert.equal(computeForfeitPenalty({ baseBet: BET, capital: 0, currentTrickNumber: 3 }), 0);
  });

  it('2 joueurs, départ au pli 1 : partant -10, adversaire +10', () => {
    const out = build([
      { playerId: 'B', ante: BET, penaltyPaid: 0, gross: 20 },
      { playerId: 'A', ante: BET, penaltyPaid: 0, gross: 0 },
    ]);
    assert.deepEqual(nets(out), { B: 10, A: -10 });
    assert.equal(out.invariantOk, true);
  });

  it('2 joueurs, départ au pli 3 : partant -20, adversaire +20', () => {
    const penalty = computeForfeitPenalty({ baseBet: BET, capital: 90, currentTrickNumber: 3 });
    const out = build([
      { playerId: 'B', ante: BET, penaltyPaid: 0, gross: 20 + penalty },
      { playerId: 'A', ante: BET, penaltyPaid: penalty, gross: 0 },
    ]);
    assert.deepEqual(nets(out), { B: 20, A: -20 });
    assert.equal(out.invariantOk, true);
  });

  it('3 joueurs, départ de C au pli 3 : A gagne 40 (net +30), B -10, C -20', () => {
    const penalty = computeForfeitPenalty({ baseBet: BET, capital: 90, currentTrickNumber: 3 });
    const out = build([
      { playerId: 'A', ante: BET, penaltyPaid: 0, gross: 30 + penalty },
      { playerId: 'B', ante: BET, penaltyPaid: 0, gross: 0 },
      { playerId: 'C', ante: BET, penaltyPaid: penalty, gross: 0 },
    ]);
    assert.deepEqual(nets(out), { A: 30, B: -10, C: -20 });
    assert.equal(out.invariantOk, true);
    assert.equal(Object.values(nets(out)).reduce((a, b) => a + b, 0), 0);
  });
});

describe('settlement - clôture anticipée', () => {
  it('chaque joueur reçoit sa part du pot moins sa mise', () => {
    const out = build(
      [
        { playerId: 'A', ante: BET, penaltyPaid: 0, gross: 20 },
        { playerId: 'B', ante: BET, penaltyPaid: 0, gross: 5 },
        { playerId: 'C', ante: BET, penaltyPaid: 0, gross: 5 },
      ],
      { winnerId: null }
    );
    assert.deepEqual(nets(out), { A: 10, B: -5, C: -5 });
    assert.equal(out.invariantOk, true);
  });

  it('reste d\'une division entière : toléré uniquement avec allowBurned', () => {
    const rows = [
      { playerId: 'A', ante: 5, penaltyPaid: 0, gross: 3 },
      { playerId: 'B', ante: 5, penaltyPaid: 0, gross: 3 },
      { playerId: 'C', ante: 5, penaltyPaid: 0, gross: 3 },
    ];
    const strict = build(rows, { winnerId: null });
    assert.equal(strict.invariantOk, false);
    assert.equal(strict.result.burned, 6);
    const tolerant = build(rows, { winnerId: null, allowBurned: true });
    assert.equal(tolerant.invariantOk, true);
  });
});

describe('settlement - plus aucun humain (pot détruit)', () => {
  it('le partant est débité et les jetons détruits sont déclarés', () => {
    const out = build([{ playerId: 'A', ante: BET, penaltyPaid: 10, gross: 0 }], {
      winnerId: null,
      allowBurned: true,
    });
    assert.deepEqual(nets(out), { A: -20 });
    assert.equal(out.result.burned, 20);
    assert.equal(out.invariantOk, true);
  });
});

describe('settlement - garde-fou d\'invariant', () => {
  it('ne lance pas d\'erreur et signale la création de jetons', () => {
    const out = build([
      { playerId: 'A', ante: BET, penaltyPaid: 0, gross: 50 },
      { playerId: 'B', ante: BET, penaltyPaid: 0, gross: 0 },
    ]);
    assert.equal(out.invariantOk, false);
    assert.ok(out.invariantError && out.invariantError.includes('créés'));
    assert.equal(out.result.participants.length, 2);
  });
});

describe('settlement - estimateNetFromHistoryRecord', () => {
  it('victoire simple', () => {
    assert.equal(estimateNetFromHistoryRecord({ isWinner: true, winType: 'STANDARD', baseBet: 10, playerCount: 4 }), 30);
    assert.equal(estimateNetFromHistoryRecord({ isWinner: false, winType: 'STANDARD', baseBet: 10, playerCount: 4 }), -10);
  });
  it('Kora', () => {
    assert.equal(estimateNetFromHistoryRecord({ isWinner: true, winType: 'KORA', baseBet: 10, playerCount: 4 }), 60);
    assert.equal(estimateNetFromHistoryRecord({ isWinner: false, winType: 'KORA', baseBet: 10, playerCount: 4 }), -20);
  });
  it('Double Kora', () => {
    assert.equal(estimateNetFromHistoryRecord({ isWinner: true, winType: 'DOUBLE_KORA', baseBet: 10, playerCount: 4 }), 120);
    assert.equal(estimateNetFromHistoryRecord({ isWinner: false, winType: 'DOUBLE_KORA', baseBet: 10, playerCount: 2 }), -40);
  });
  it('forfeit : multiplicateur 1', () => {
    assert.equal(estimateNetFromHistoryRecord({ isWinner: true, winType: 'FORFEIT', baseBet: 10, playerCount: 2 }), 10);
  });
});
