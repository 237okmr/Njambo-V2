import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Card, Player, Suit } from '../types';
import { build31Deck, dealCards, shuffleDeck } from './deck';
import {
  HOKUTO_NEAR_BEST_TOLERANCE,
  chooseMonteCarloAICard,
  getHokutoCardWeight,
} from './aiMonteCarlo';
import { createHokutoPlayerModel, getHokutoTendencies } from './hokutoPlayerModel';
import type { HokutoTendencies } from './hokutoPlayerModel';

function card(suit: Suit, value: number): Card {
  return { id: `${suit}_${value}`, suit, value, label: `${value} ${suit}`, shortLabel: `${value}` };
}

function neutral(): HokutoTendencies {
  return getHokutoTendencies(createHokutoPlayerModel());
}

function makePlayers(hands: Card[][]): Player[] {
  return hands.map((hand, i) => ({
    id: `p${i}`,
    name: i === 0 ? 'Robam Hokuto' : `P${i}`,
    score: 100,
    capital: 100,
    isEliminated: false,
    hand,
    isHuman: i === 1,
    avatarSeed: `s${i}`,
    tricksWonInRound: 0,
  }));
}

describe('getHokutoCardWeight', () => {
  it('est neutre sans donnée', () => {
    assert.equal(getHokutoCardWeight(card('COEUR', 10), neutral()), 1);
    assert.equal(getHokutoCardWeight(card('PIQUE', 4), neutral()), 1);
  });

  it('juge une carte forte plus probable chez un joueur qui garde ses cartes fortes', () => {
    const t: HokutoTendencies = { ...neutral(), confidence: 1, lateStrongRate: 0.9, earlyStrongRate: 0.2 };
    assert.ok(getHokutoCardWeight(card('COEUR', 10), t) > 1);
    assert.equal(getHokutoCardWeight(card('COEUR', 5), t), 1);
  });

  it('juge une carte forte moins probable chez un joueur qui force tôt', () => {
    const t: HokutoTendencies = { ...neutral(), confidence: 1, lateStrongRate: 0.2, earlyStrongRate: 0.9 };
    assert.ok(getHokutoCardWeight(card('COEUR', 10), t) < 1);
  });

  it('juge un 3 plus probable chez un joueur qui garde un 3 pour la fin', () => {
    const t: HokutoTendencies = { ...neutral(), confidence: 1, threeAtFifthRate: 0.9 };
    assert.ok(getHokutoCardWeight(card('TREFLE', 3), t) > 1);
  });

  it('garde toujours un poids dans les bornes', () => {
    const t: HokutoTendencies = {
      ...neutral(),
      confidence: 1,
      lateStrongRate: 1,
      earlyStrongRate: 0,
      threeAtFifthRate: 1,
      favoriteLeadSuit: 'COEUR',
      favoriteDiscardSuit: 'PIQUE',
    };
    for (const c of build31Deck()) {
      const w = getHokutoCardWeight(c, t);
      assert.ok(w > 0 && w < 4, `poids hors bornes pour ${c.id}: ${w}`);
    }
  });
});

describe('chooseMonteCarloAICard - options Hokuto', () => {
  it('reste une carte jouable avec ou sans options Hokuto', () => {
    assert.ok(HOKUTO_NEAR_BEST_TOLERANCE > 0 && HOKUTO_NEAR_BEST_TOLERANCE < 0.2);
    for (let g = 0; g < 25; g++) {
      const { hands } = dealCards(shuffleDeck(build31Deck()), 3);
      const players = makePlayers(hands);
      const hand = players[0].hand;
      const tendencies = new Map<number, HokutoTendencies>([
        [1, { ...neutral(), confidence: 1, lateStrongRate: 0.8, earlyStrongRate: 0.3 }],
      ]);

      const plain = chooseMonteCarloAICard(hand, hand, null, [], 1, [], 3, players, 0, new Map(), 'EXPERT');
      assert.ok(hand.some((c) => c.id === plain.id));

      const boss = chooseMonteCarloAICard(hand, hand, null, [], 1, [], 3, players, 0, new Map(), 'EXPERT', {
        tendencies,
        bluffWeight: 1,
        pressureWeight: 1,
      });
      assert.ok(hand.some((c) => c.id === boss.id));
    }
  });

  it('sans options, le moteur reste utilisable à tous les niveaux', () => {
    const { hands } = dealCards(shuffleDeck(build31Deck()), 3);
    const players = makePlayers(hands);
    const hand = players[0].hand;
    const gm = chooseMonteCarloAICard(hand, hand, null, [], 1, [], 3, players, 0, new Map(), 'GRAND_MASTER');
    assert.ok(hand.some((c) => c.id === gm.id));
  });
});
