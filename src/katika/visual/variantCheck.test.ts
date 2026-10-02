import { describe, it } from 'node:test';
import assert from 'node:assert';
import { applyVariantChecks, overlapRatio, postOverlapsVisual } from './variantCheck';
import { VisualSpec } from './visualSpec';

function makeSpec(hook: string, body: string, post?: { story: string; question: string }): VisualSpec {
  return {
    version: 2,
    format: 'SQUARE',
    palette: 'EMERALD_GOLD',
    pattern: 'NDOP_CHEVRON',
    blocks: [
      { id: 'b1', type: 'HOOK', text: hook },
      { id: 'b2', type: 'BODY', text: body },
    ],
    cta: { text: 'Viens jouer' },
    ...(post ? { post: { ...post, hashtags: [] } } : {}),
  };
}

describe('variantCheck - anti-répétition du post', () => {
  it('mesure la part de mots du post déjà présents dans le visuel', () => {
    assert.ok(overlapRatio('Le trône attend les meilleurs joueurs', 'Le trône attend les meilleurs joueurs') > 0.9);
    assert.strictEqual(overlapRatio('Hier soir, mon cousin a tout renversé', 'Rejoins la bêta ouverte'), 0);
  });

  it('retire un post qui répète le visuel et garde un post qui le complète', () => {
    const repeating = makeSpec('Le trône attend les maîtres', 'Défie les meilleurs joueurs sur le tapis', {
      story: 'Le trône attend les maîtres, défie les meilleurs joueurs sur le tapis',
      question: 'Qui prend le trône ?',
    });
    const completing = makeSpec('Le trône attend', 'Défie les meilleurs sur le tapis', {
      story: 'Hier soir à la table de mon quartier, un cousin a renversé la partie au dernier pli',
      question: 'Toi, tu aurais gardé quelle carte ?',
    });
    assert.strictEqual(postOverlapsVisual(repeating), true);
    assert.strictEqual(postOverlapsVisual(completing), false);

    const a = { spec: repeating, warnings: [] as string[] };
    const b = { spec: completing, warnings: [] as string[] };
    const out = applyVariantChecks([a, b]);
    assert.strictEqual(out.length, 2);
    assert.strictEqual(a.spec.post, undefined);
    assert.ok(a.warnings.length > 0);
    assert.ok(b.spec.post);
  });

  it('retire une variante dont l\'accroche est identique à une précédente', () => {
    const first = { spec: makeSpec('Le trône attend les maîtres', 'Texte un'), warnings: [] as string[] };
    const dup = { spec: makeSpec('Le trône attend les maîtres', 'Texte deux'), warnings: [] as string[] };
    const other = { spec: makeSpec('Ton Kora du dimanche', 'Texte trois'), warnings: [] as string[] };
    assert.strictEqual(applyVariantChecks([first, dup, other]).length, 2);
  });
});
