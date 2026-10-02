import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildKoraMoment } from '../../../server/engine/koraMoment';
import { buildTrickBlock, injectTrickBlock, isKoraMoment, momentToBrief, removeDuplicateCards } from './situation';
import { VisualSpec } from './visualSpec';

const tricks = [1, 2, 3, 4, 5].map((n) => ({
  trickNumber: n,
  winnerIndex: 1,
  plays: [
    { playerIndex: 0, card: { value: 7, suit: 'COEUR' } },
    { playerIndex: 1, card: { value: n === 5 ? 3 : 9, suit: 'PIQUE' } },
  ],
}));
const moment = buildKoraMoment({ roomId: 'R1', partieCount: 1, kind: 'KORA', winnerSeat: 1, playerCount: 2, tricks });

describe('situation - pli réel dessiné par le code', () => {
  it('met en valeur le gagnant et pose KORA sur le 3 gagnant du 5e pli', () => {
    const block = buildTrickBlock(moment);
    assert.ok(block);
    assert.strictEqual(block!.arrangement, 'TRICK');
    assert.deepStrictEqual(block!.cards.map((c) => c.player), ['Joueur A', 'Joueur B']);
    assert.strictEqual(block!.cards[1].highlight, true);
    assert.strictEqual(block!.cards[1].label, 'KORA');
    assert.strictEqual(block!.cards[0].label, undefined);
  });

  it('le résumé ne contient aucun nom et reste court', () => {
    const brief = momentToBrief(moment);
    assert.ok(brief.includes('Joueur B'));
    assert.ok(brief.length < 200);
  });

  it('remplace les cartes inventées par le pli réel sans dépasser 7 blocs', () => {
    const spec: VisualSpec = {
      version: 2,
      format: 'SQUARE',
      palette: 'EMERALD_GOLD',
      pattern: 'NDOP_CHEVRON',
      blocks: [
        { id: '1', type: 'BADGE', text: 'NJAMBO' },
        { id: '2', type: 'HOOK', text: 'LE KORA' },
        { id: '3', type: 'CARDS', cards: [{ rank: '8', suit: '♣' }] },
        { id: '4', type: 'BODY', text: 'a' },
        { id: '5', type: 'BULLETS', items: ['a'] },
        { id: '6', type: 'QUOTE', text: 'a' },
        { id: '7', type: 'STEPS', items: ['a', 'b'] },
        { id: '8', type: 'BODY', text: 'b' },
      ] as VisualSpec['blocks'],
      cta: { text: 'Jouer' },
    };
    assert.strictEqual(injectTrickBlock(spec, moment), true);
    assert.ok(spec.blocks.length <= 7);
    const cardsBlocks = spec.blocks.filter((b) => b.type === 'CARDS');
    assert.strictEqual(cardsBlocks.length, 1);
    assert.strictEqual((cardsBlocks[0] as any).arrangement, 'TRICK');
    assert.strictEqual(spec.blocks[2].type, 'CARDS');
  });

  it('retire les cartes en double', () => {
    const spec: VisualSpec = {
      version: 2,
      format: 'SQUARE',
      palette: 'EMERALD_GOLD',
      pattern: 'NDOP_CHEVRON',
      blocks: [
        { id: '1', type: 'HOOK', text: 'LE KORA' },
        { id: '2', type: 'CARDS', cards: [{ rank: '3', suit: '♥' }, { rank: '3', suit: '♥' }, { rank: '9', suit: '♠' }] },
      ],
      cta: { text: 'Jouer' },
    };
    assert.deepStrictEqual(removeDuplicateCards(spec), ['3♥']);
    assert.strictEqual((spec.blocks[1] as any).cards.length, 2);
  });

  it('reconnaît un moment valide et refuse le reste', () => {
    assert.strictEqual(isKoraMoment(moment), true);
    assert.strictEqual(isKoraMoment({ id: 'x' }), false);
    assert.strictEqual(isKoraMoment(null), false);
  });
});
