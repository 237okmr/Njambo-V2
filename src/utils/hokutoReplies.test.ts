import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getBotPlayReaction } from './ai';
import { build31Deck } from './deck';

const realRandom = Math.random;
afterEach(() => {
  Math.random = realRandom;
});

const card = build31Deck()[0];

function react(strategy: 'HOKUTO_BOSS' | 'HOKUTO_ADAPTIVE', botName: string) {
  return getBotPlayReaction({
    card,
    isLeadPlay: false,
    leadSuit: card.suit,
    isWinningSoFar: true,
    isCut: false,
    trickNumber: 5,
    isDynamicBoss: false,
    brokeKoraStreak: false,
    strategy,
    botName,
  });
}

describe('Répliques Robam Hokuto / Koubi Doux', () => {
  it('Le Boss a ses propres répliques au pli 5', () => {
    Math.random = () => 0;
    const r = react('HOKUTO_BOSS', 'Robam Hokuto');
    assert.ok(r);
    assert.equal(r?.text, 'Le pot ? Il m’appelait déjà par mon prénom !');
  });

  it('Koubi Doux garde les anciennes répliques, sans dire « Robam Hokuto »', () => {
    Math.random = () => 0;
    const r = react('HOKUTO_ADAPTIVE', 'Koubi Doux');
    assert.ok(r);
    assert.ok(!r?.text.includes('Robam Hokuto'));
    assert.equal(r?.text, 'Le pot est pour Koubi Doux ! C’est le quartier qui gagne !');
  });
});
