import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validateAndRepairSpec } from './validateSpec';
import { VisualSpec } from './visualSpec';

describe('validateAndRepairSpec Engine', () => {
  it('passes a fully valid VisualSpec without modifications', () => {
    const validSpec: VisualSpec = {
      version: 2,
      format: 'SQUARE',
      palette: 'EMERALD_GOLD',
      pattern: 'NDOP_CHEVRON',
      blocks: [
        { id: 'b1', type: 'BADGE', text: 'NJAMBO KORA', priority: 1 },
        { id: 'b2', type: 'HOOK', text: 'TOURNOI BÊTA', accentWords: ['TOURNOI'], priority: 1 },
        { id: 'b3', type: 'BODY', text: 'Rejoins-nous pour jouer en ligne.', priority: 2 },
      ],
      cta: { text: 'Viens tester la bêta' },
      footer: { text: 'njambo-kora.ai.studio', whatsapp: true, app: true },
    };

    const { spec, needsReview } = validateAndRepairSpec(validSpec);
    assert.strictEqual(spec?.version, 2);
    assert.strictEqual(spec?.blocks.length, 3);
    assert.strictEqual(needsReview, false);
  });

  it('replaces "gratuit" with "bêta" and logs a warning', () => {
    const inputSpec: VisualSpec = {
      version: 2,
      format: 'STORY',
      palette: 'ROYAL_SAPPHIRE',
      pattern: 'DIAMONDS',
      blocks: [
        { id: 'b1', type: 'HOOK', text: 'JEU GRATUIT SANS FRAIS', priority: 1 },
        { id: 'b2', type: 'BODY', text: 'Inscris-toi pour un accès 100% gratuit.', priority: 2 },
      ],
      cta: { text: 'Jouer gratuit' },
      footer: { text: 'njambo', whatsapp: true, app: true },
    };

    const { spec, warnings, needsReview } = validateAndRepairSpec(inputSpec);
    assert.strictEqual(warnings.some((w) => w.includes('gratuit')), true);
    assert.strictEqual(needsReview, true);

    const hook = spec?.blocks.find((b) => b.type === 'HOOK') as any;
    assert.strictEqual(hook.text.toUpperCase().includes('GRATUIT'), false);
    assert.strictEqual(hook.text.toLowerCase().includes('bêta'), true);
  });

  it('sanitizes illegal card ranks (As, Roi, Dame, Valet, 2, 10♠)', () => {
    const inputSpec: VisualSpec = {
      version: 2,
      format: 'SQUARE',
      palette: 'EBONY_GOLD',
      pattern: 'MINIMAL',
      blocks: [
        {
          id: 'b1',
          type: 'CARDS',
          arrangement: 'FAN',
          cards: [
            { rank: 'A', suit: '♠', label: 'AS' }, // Illegal
            { rank: 'K', suit: '♥', label: 'ROI' }, // Illegal
            { rank: '3', suit: '♥', label: 'KORA', highlight: true }, // Legal
            { rank: '10', suit: '♠', label: 'BLACK 10' }, // Illegal (10 spade)
          ],
          priority: 2,
        },
      ],
      cta: { text: 'Rejoins la partie' },
      footer: { text: 'njambo', whatsapp: true, app: true },
    };

    const { spec } = validateAndRepairSpec(inputSpec);
    const cardBlock = spec?.blocks.find((b) => b.type === 'CARDS') as any;

    assert.ok(cardBlock.cards.length > 0);
    cardBlock.cards.forEach((c: any) => {
      assert.ok(!['A', 'K', 'Q', 'J', '2'].includes(c.rank));
      if (c.rank === '10') {
        assert.notStrictEqual(c.suit, '♠');
      }
    });
  });

  it('detects unsafe political or religious keywords and triggers review', () => {
    const inputSpec: VisualSpec = {
      version: 2,
      format: 'SQUARE',
      palette: 'EMERALD_GOLD',
      pattern: 'NDOP_CHEVRON',
      blocks: [
        { id: 'b1', type: 'HOOK', text: 'POLITIQUE ET ELECTIONS AU TAPIS', priority: 1 },
      ],
      cta: { text: 'Voter maintenant' },
      footer: { text: 'njambo', whatsapp: true, app: true },
    };

    const { warnings, needsReview } = validateAndRepairSpec(inputSpec);
    assert.strictEqual(needsReview, true);
    assert.strictEqual(
      warnings.some((w) => w.toLowerCase().includes('sensible') || w.toLowerCase().includes('politique')),
      true
    );
  });

  it('validates and auto-repairs missing essential blocks like HOOK', () => {
    const emptyBlocksSpec: VisualSpec = {
      version: 2,
      format: 'SQUARE',
      palette: 'EMERALD_GOLD',
      pattern: 'NDOP_CHEVRON',
      blocks: [],
      cta: { text: 'Tester en Bêta' },
      footer: { text: 'njambo', whatsapp: true, app: true },
    };

    const { spec } = validateAndRepairSpec(emptyBlocksSpec);
    assert.ok(spec && spec.blocks.length > 0);
    assert.strictEqual(
      spec?.blocks.some((b) => b.type === 'HOOK'),
      true
    );
  });
});

describe('validateAndRepairSpec - post d\'accompagnement', () => {
  const baseSpec = {
    version: 2,
    format: 'SQUARE',
    palette: 'EMERALD_GOLD',
    pattern: 'NDOP_CHEVRON',
    blocks: [{ id: 'b1', type: 'HOOK', text: 'LE KORA DU SIÈCLE', priority: 1 }],
    cta: { text: 'Viens jouer' },
  };

  it('conserve le post, le tronque et filtre les hashtags non autorisés', () => {
    const longStory = Array.from({ length: 60 }, (_, i) => `mot${i}`).join(' ');
    const { spec } = validateAndRepairSpec({
      ...baseSpec,
      post: {
        story: longStory,
        question: 'Tu aurais joué quoi à ma place ?',
        hashtags: ['#NjamboKora', 'kora', '#Foot', '#NjamboKora', '#Katika', '#JeuDeCartes'],
      },
    });
    assert.ok(spec?.post);
    assert.ok(spec!.post!.story.split(/\s+/).length <= 40);
    assert.strictEqual(spec!.post!.question, 'Tu aurais joué quoi à ma place ?');
    assert.deepStrictEqual(spec!.post!.hashtags, ['#NjamboKora', '#Kora', '#Katika']);
  });

  it('ne produit pas de post quand story et question sont vides', () => {
    const { spec } = validateAndRepairSpec({ ...baseSpec, post: { story: '', question: '' } });
    assert.strictEqual(spec?.post, undefined);
  });
});

describe('validateAndRepairSpec - pli (disposition TRICK)', () => {
  it('conserve la disposition TRICK et les libellés de joueurs', () => {
    const { spec } = validateAndRepairSpec({
      version: 2,
      format: 'SQUARE',
      palette: 'EMERALD_GOLD',
      pattern: 'NDOP_CHEVRON',
      blocks: [
        { id: 'b1', type: 'HOOK', text: 'LE KORA DU DIMANCHE', priority: 1 },
        {
          id: 'b2',
          type: 'CARDS',
          arrangement: 'TRICK',
          cards: [
            { rank: '7', suit: '♥', player: 'Joueur A' },
            { rank: '3', suit: '♠', player: 'Joueur B', highlight: true, label: 'KORA' },
          ],
        },
      ],
      cta: { text: 'Viens jouer' },
    });
    const cards = spec?.blocks.find((b) => b.type === 'CARDS');
    assert.ok(cards && cards.type === 'CARDS');
    assert.strictEqual(cards.arrangement, 'TRICK');
    assert.strictEqual(cards.cards[0].player, 'Joueur A');
    assert.strictEqual(cards.cards[1].label, 'KORA');
  });
});
