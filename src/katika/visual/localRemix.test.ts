import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildLocalRemixVariants, shouldFallbackToLocalRemix } from './localRemix';

describe('localRemix - visuels sans IA quand le quota est épuisé', () => {
  it('bascule pour un quota Gemini ou un plafond horaire, pas pour une requête déjà en cours', () => {
    assert.strictEqual(shouldFallbackToLocalRemix(429, { quotaExceeded: true }), true);
    assert.strictEqual(shouldFallbackToLocalRemix(429, { error: 'Limite du copilote atteinte, réessaie dans 12 min.' }), true);
    assert.strictEqual(
      shouldFallbackToLocalRemix(429, { error: 'Limite du copilote atteinte : une requête IA est déjà en cours, patiente quelques secondes.' }),
      false
    );
    assert.strictEqual(shouldFallbackToLocalRemix(500, { error: 'Erreur interne' }), false);
    assert.strictEqual(shouldFallbackToLocalRemix(502, null), false);
  });

  it('produit 3 visuels valides, avec 3 mèmes et 3 palettes différents', () => {
    let seed = 7;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const { specs, memeIds } = buildLocalRemixVariants(3, { rand });
    assert.strictEqual(specs.length, 3);
    assert.strictEqual(new Set(memeIds).size, 3);
    assert.strictEqual(new Set(specs.map((s) => s.palette)).size, 3);
    for (const spec of specs) {
      assert.strictEqual(spec.version, 2);
      assert.ok(spec.blocks.some((b) => b.type === 'HOOK'));
    }
  });

  it('évite les mèmes demandés quand la banque en contient assez d\'autres', () => {
    const first = buildLocalRemixVariants(3, { rand: () => 0.3 });
    const second = buildLocalRemixVariants(3, { rand: () => 0.3, avoidIds: first.memeIds });
    assert.ok(second.memeIds.every((id) => !first.memeIds.includes(id)));
  });
});
