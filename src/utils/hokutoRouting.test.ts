import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Player } from '../types';
import { build31Deck, dealCards, shuffleDeck } from './deck';
import { chooseAICard } from './ai';

function setup() {
  const { hands } = dealCards(shuffleDeck(build31Deck()), 4, 0);
  const players: Player[] = hands.map((hand, i) => ({
    id: `p${i}`,
    name: i === 0 ? 'Robam Hokuto' : `P${i}`,
    score: 100,
    capital: 100,
    isEliminated: false,
    hand,
    isHuman: i !== 0,
    avatarSeed: `s${i}`,
    tricksWonInRound: 0,
  }));
  return { hands, players };
}

describe('Aiguillage Boss Hokuto / Koubi Doux', () => {
  it('Boss Hokuto joue une carte légale même sur table EASY', () => {
    for (let i = 0; i < 20; i++) {
      const { hands, players } = setup();
      const c = chooseAICard(hands[0], null, [], 1, 'HOKUTO_BOSS', [], 4, 'EASY', players, 0);
      assert.ok(hands[0].some((h) => h.id === c.id));
    }
  });

  it('Boss Hokuto accepte une Map de tendances vide sur table NORMAL', () => {
    const { hands, players } = setup();
    const c = chooseAICard(hands[0], null, [], 1, 'HOKUTO_BOSS', [], 4, 'NORMAL', players, 0, new Map());
    assert.ok(hands[0].some((h) => h.id === c.id));
  });

  it('Koubi Doux (HOKUTO_ADAPTIVE) joue une carte légale sur table NORMAL', () => {
    const { hands, players } = setup();
    players[0].name = 'Koubi Doux';
    const c = chooseAICard(hands[0], null, [], 1, 'HOKUTO_ADAPTIVE', [], 4, 'NORMAL', players, 0);
    assert.ok(hands[0].some((h) => h.id === c.id));
  });
});
