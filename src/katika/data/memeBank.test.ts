import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MEME_BANK, convertMemeToVisualSpec, MemeEntry } from './memeBank';
import { FORBIDDEN_TOPICS, validateAndRepairSpec } from '../visual/validateSpec';
import { BLOCK_LIMITS } from '../visual/visualSpec';

describe('memeBank - Validation des mèmes de la banque (Zero-token)', () => {
  test('MEME_BANK contient au moins 24 entrées', () => {
    assert.ok(MEME_BANK.length >= 24, `La banque contient ${MEME_BANK.length} mèmes (attendu >= 24)`);
  });

  test('Chaque mème respecte les limites de mots (HOOK <= 8, BODY <= 22, COMPARE <= 14)', () => {
    MEME_BANK.forEach((meme) => {
      const countWords = (str: string) =>
        str
          .replace(/[«»"'.,!?:;()]/g, ' ')
          .trim()
          .split(/\s+/)
          .filter(Boolean).length;

      // Setup / Hook
      const setupCount = countWords(meme.setup);
      assert.ok(
        setupCount <= BLOCK_LIMITS.HOOK_MAX_WORDS,
        `Mème ${meme.id}: setup "${meme.setup}" contient ${setupCount} mots (max ${BLOCK_LIMITS.HOOK_MAX_WORDS})`
      );

      // Punchline / Body
      const punchlineCount = countWords(meme.punchline);
      assert.ok(
        punchlineCount <= BLOCK_LIMITS.BODY_MAX_WORDS,
        `Mème ${meme.id}: punchline "${meme.punchline}" contient ${punchlineCount} mots (max ${BLOCK_LIMITS.BODY_MAX_WORDS})`
      );

      // Panels / Compare
      if (meme.panels) {
        const leftText = meme.panels.leftText || meme.panels.beforeText || '';
        const rightText = meme.panels.rightText || meme.panels.afterText || '';

        if (leftText) {
          const leftCount = countWords(leftText);
          assert.ok(
            leftCount <= BLOCK_LIMITS.COMPARE_TEXT_MAX_WORDS,
            `Mème ${meme.id}: panel gauche "${leftText}" contient ${leftCount} mots (max ${BLOCK_LIMITS.COMPARE_TEXT_MAX_WORDS})`
          );
        }

        if (rightText) {
          const rightCount = countWords(rightText);
          assert.ok(
            rightCount <= BLOCK_LIMITS.COMPARE_TEXT_MAX_WORDS,
            `Mème ${meme.id}: panel droit "${rightText}" contient ${rightCount} mots (max ${BLOCK_LIMITS.COMPARE_TEXT_MAX_WORDS})`
          );
        }
      }
    });
  });

  test('Aucun mème ne contient de sujet interdit (FORBIDDEN_TOPICS)', () => {
    MEME_BANK.forEach((meme) => {
      const fullText = [
        meme.setup,
        meme.punchline,
        meme.ctaIntent,
        meme.panels?.beforeTitle,
        meme.panels?.beforeText,
        meme.panels?.afterTitle,
        meme.panels?.afterText,
        meme.panels?.leftTitle,
        meme.panels?.leftText,
        meme.panels?.rightTitle,
        meme.panels?.rightText,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      FORBIDDEN_TOPICS.forEach((topic) => {
        const regex = new RegExp(`\\b${topic}\\b`, 'i');
        assert.equal(
          regex.test(fullText),
          false,
          `Mème ${meme.id} contient le sujet interdit "${topic}" dans "${fullText}"`
        );
      });
    });
  });

  test('Aucun mème ne contient de carte invalide (pas d\'As, Roi, Dame, Valet, 2 ou 10♠)', () => {
    MEME_BANK.forEach((meme) => {
      const card = meme.card || (meme.heroCard ? { rank: meme.heroCard.rank, suit: meme.heroCard.suit } : null);
      if (card) {
        const rank = String(card.rank).toUpperCase();
        const suit = card.suit;

        assert.ok(
          !['A', 'K', 'Q', 'J', '2', 'AS', 'ROI', 'DAME', 'VALET'].includes(rank),
          `Mème ${meme.id} contient un rang invalide "${rank}"`
        );

        const suitStr = String(suit);
        assert.ok(
          !(rank === '10' && (suitStr === '♠' || suitStr === 'SPADE' || suitStr === 'BLACK')),
          `Mème ${meme.id} contient la carte interdite 10♠`
        );
      }
    });
  });

  test('Chaque mème se convertit en VisualSpec V2 valide via convertMemeToVisualSpec', () => {
    MEME_BANK.forEach((meme) => {
      const spec = convertMemeToVisualSpec(meme);
      assert.equal(spec.version, 2, `Mème ${meme.id} : version spec attendue 2`);
      assert.ok(spec.blocks.length >= 2, `Mème ${meme.id} : doit comporter au moins 2 blocs`);

      const validation = validateAndRepairSpec(spec);
      assert.ok(validation.spec !== null, `Mème ${meme.id} : la validation ne doit pas renvoyer null`);
      assert.equal(validation.spec?.blocks.length, spec.blocks.length, `Mème ${meme.id} : nombre de blocs préservé`);
    });
  });
});
