import { describe, it } from 'node:test';
import assert from 'node:assert';
import { decodeVariantsReply, encodeVariantsReply } from './variantsPayload';
import { VisualSpec } from './visualSpec';

const makeSpec = (hook: string): VisualSpec => ({
  version: 2,
  format: 'SQUARE',
  palette: 'EMERALD_GOLD',
  pattern: 'NDOP_CHEVRON',
  blocks: [{ id: 'b1', type: 'HOOK', text: hook }],
  cta: { text: 'Viens jouer' },
});

describe('variantsPayload - variantes de visuel dans un message du chat', () => {
  it('encode puis décode 3 variantes avec leur texte d\'introduction', () => {
    const reply = encodeVariantsReply(
      [
        { spec: makeSpec('UN'), angle: 'HUMOUR' },
        { spec: makeSpec('DEUX'), angle: 'DEFI', needsReview: true },
        { spec: makeSpec('TROIS'), angle: 'CLAIR' },
      ],
      'Voici 3 idées.'
    );
    const decoded = decodeVariantsReply(reply);
    assert.ok(decoded);
    assert.strictEqual(decoded!.variants.length, 3);
    assert.strictEqual(decoded!.text, 'Voici 3 idées.');
    assert.strictEqual(decoded!.variants[1].needsReview, true);
    assert.strictEqual(decoded!.variants[2].angle, 'CLAIR');
  });

  it('renvoie null pour un message ordinaire, un ancien visuel unique ou un JSON cassé', () => {
    assert.strictEqual(decodeVariantsReply('Bonjour, voici le bilan.'), null);
    assert.strictEqual(decodeVariantsReply('```json\n' + JSON.stringify(makeSpec('X')) + '\n```'), null);
    assert.strictEqual(decodeVariantsReply('{"katikaVariants": [oups'), null);
    assert.strictEqual(decodeVariantsReply('{"katikaVariants": []}'), null);
  });

  it('ignore une variante sans visuel valide', () => {
    const decoded = decodeVariantsReply('{"katikaVariants":[{"angle":"HUMOUR"},{"spec":{"blocks":[]}}]}');
    assert.ok(decoded);
    assert.strictEqual(decoded!.variants.length, 1);
  });
});
