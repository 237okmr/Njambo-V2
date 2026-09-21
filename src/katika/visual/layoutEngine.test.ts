import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeLayout, defaultMeasure } from './layoutEngine';
import { VisualSpec, VisualBlock } from './visualSpec';
import { TYPE_SCALE, SAFE_ZONES, FORMAT_DIMENSIONS } from './brandTokens';

describe('Layout Engine v2 - Tests de robustesse et conformité', () => {
  it('7 blocs très longs en STORY : aucun bloc hors zone sûre, aucun chevauchement, polices ≥ minimum', () => {
    const longSpec: VisualSpec = {
      version: 2,
      format: 'STORY',
      palette: 'EMERALD_GOLD',
      pattern: 'NDOP_CHEVRON',
      blocks: [
        { id: 'b1', type: 'BADGE', text: 'TOURNOI OFFICIEL NJAMBO', priority: 1 },
        { id: 'b2', type: 'HOOK', text: 'LE GRAND TOURNOI DE KORA DES MAÎTRES DE DOUALA', priority: 1 },
        { id: 'b3', type: 'BODY', text: 'Affrontez les meilleurs joueurs du tapis vert camerounais dans une ambiance festive et stratégique unique.', priority: 2 },
        { id: 'b4', type: 'BULLETS', items: ['Premier pli stratégique', 'Cinquième pli gagné avec un 3', 'Double Kora d anthologie'], style: 'SUIT', priority: 2 },
        { id: 'b5', type: 'STAT', value: '50 000', label: 'JETONS EN JEU POUR LES VAINQUEURS', sublabel: 'Prime spéciale', priority: 3 },
        { id: 'b6', type: 'QUOTE', text: 'Au Njambo, la patience sur le tapis vert vaut toutes les cartes.', author: 'Maître Kora', priority: 3 },
        { id: 'b7', type: 'STEPS', items: ['Télécharger l app', 'S inscrire', 'Rejoindre la table', 'Gagner le pot'], priority: 3 },
      ],
      cta: { text: 'REJOINDRE LE TOURNOI' },
      footer: { app: true, whatsapp: true, text: 'njambo-kora.ai.studio' },
    };

    const layout = computeLayout(longSpec, defaultMeasure);

    assert.equal(layout.format, 'STORY');
    assert.equal(layout.canvasWidth, 1080);
    assert.equal(layout.canvasHeight, 1920);

    const safeTop = SAFE_ZONES.STORY.top; // 250
    const safeBottom = FORMAT_DIMENSIONS.STORY.height - SAFE_ZONES.STORY.bottom; // 1920 - 340 = 1580

    // Vérification : aucun bloc au-dessus de safeTop ni en-dessous de safeBottom
    for (const b of layout.blocks) {
      assert.ok(b.y >= safeTop, `Bloc ${b.id} (${b.type}) a y=${b.y} < safeTop=${safeTop}`);
      assert.ok(
        b.y + b.height <= safeBottom + 2, // Marge tolérée de 2px
        `Bloc ${b.id} (${b.type}) a y+h=${b.y + b.height} > safeBottom=${safeBottom}`
      );
    }

    // Vérification : aucun chevauchement entre blocs consécutifs
    for (let i = 0; i < layout.blocks.length - 1; i++) {
      const b1 = layout.blocks[i];
      const b2 = layout.blocks[i + 1];
      assert.ok(
        b1.y + b1.height <= b2.y,
        `Chevauchement entre ${b1.id} (bas=${b1.y + b1.height}) et ${b2.id} (haut=${b2.y})`
      );
    }

    // Vérification : aucune police sous le minimum autorisé par TYPE_SCALE.STORY
    assert.ok(
      layout.fontScales.hook >= TYPE_SCALE.STORY.HOOK.min,
      `Police hook=${layout.fontScales.hook} < min=${TYPE_SCALE.STORY.HOOK.min}`
    );
    assert.ok(
      layout.fontScales.body >= TYPE_SCALE.STORY.BODY.min,
      `Police body=${layout.fontScales.body} < min=${TYPE_SCALE.STORY.BODY.min}`
    );
    assert.ok(
      layout.fontScales.bullets >= TYPE_SCALE.STORY.BULLETS.min,
      `Police bullets=${layout.fontScales.bullets} < min=${TYPE_SCALE.STORY.BULLETS.min}`
    );
  });

  it('Un bloc de priorité 1 n\'est JAMAIS supprimé lors du traitement de débordement', () => {
    const overflowSpec: VisualSpec = {
      version: 2,
      format: 'STORY',
      palette: 'EBONY_GOLD',
      pattern: 'NDOP_CHEVRON',
      blocks: [
        { id: 'must_keep_1', type: 'HOOK', text: 'ACCROCHE INCONTOURNABLE DU TOURNOI', priority: 1 },
        { id: 'removable_1', type: 'BODY', text: 'Paragraphe de remplissage très long numéro un.', priority: 3 },
        { id: 'removable_2', type: 'BODY', text: 'Paragraphe de remplissage très long numéro deux.', priority: 3 },
        { id: 'removable_3', type: 'BODY', text: 'Paragraphe de remplissage très long numéro trois.', priority: 3 },
        { id: 'removable_4', type: 'BODY', text: 'Paragraphe de remplissage très long numéro quatre.', priority: 3 },
        { id: 'must_keep_2', type: 'BADGE', text: 'FINALE EN DIRECT', priority: 1 },
      ],
      cta: { text: 'JOUER MAINTENANT' },
    };

    const layout = computeLayout(overflowSpec, defaultMeasure);

    // Vérifier que les blocs de priorité 1 (must_keep_1 et must_keep_2) sont toujours présents
    const blockIds = layout.blocks.map((b) => b.id);
    assert.ok(blockIds.includes('must_keep_1'), 'Le bloc P1 must_keep_1 a été supprimé !');
    assert.ok(blockIds.includes('must_keep_2'), 'Le bloc P1 must_keep_2 a été supprimé !');

    // Vérifier qu'aucun bloc supprimé n'a la priorité 1
    for (const removed of layout.removedBlocks) {
      assert.notEqual(removed.priority, 1, `Un bloc de priorité 1 (${removed.id}) s'est retrouvé dans removedBlocks !`);
    }
  });

  it('Résultat déterministe : deux exécutions identiques produisent exactement le même résultat', () => {
    const spec: VisualSpec = {
      version: 2,
      format: 'SQUARE',
      palette: 'ROYAL_SAPPHIRE',
      pattern: 'DIAMONDS',
      blocks: [
        { id: 'b1', type: 'BADGE', text: 'LE CHIFFRE DU JOUR', priority: 1 },
        { id: 'b2', type: 'STAT', value: '4 KORAS', label: 'RÉALISÉS EN UNE MANCHE', priority: 1 },
        { id: 'b3', type: 'BODY', text: 'Un record historique établi sur le tapis vert hier soir.', priority: 2 },
      ],
      cta: { text: 'VOIR LE CLASSEMENT' },
      footer: { text: 'njambo-kora.ai.studio' },
    };

    const run1 = computeLayout(spec, defaultMeasure);
    const run2 = computeLayout(spec, defaultMeasure);

    assert.deepEqual(run1, run2, 'Les deux exécutions de computeLayout diffèrent !');
  });

  it('Prise en charge conforme des 3 formats : SQUARE, STORY et BANNER', () => {
    const formats: Array<'SQUARE' | 'STORY' | 'BANNER'> = ['SQUARE', 'STORY', 'BANNER'];

    for (const format of formats) {
      const spec: VisualSpec = {
        version: 2,
        format,
        palette: 'SUNSET_TERRACOTTA',
        pattern: 'MINIMAL',
        blocks: [
          { id: 'b1', type: 'HOOK', text: 'ACCROCHE DU FORMAT', priority: 1 },
          { id: 'b2', type: 'BODY', text: 'Texte d illustration pour tester le format.', priority: 2 },
        ],
        cta: { text: 'REJOINDRE' },
      };

      const layout = computeLayout(spec, defaultMeasure);

      assert.equal(layout.format, format);
      assert.equal(layout.canvasWidth, FORMAT_DIMENSIONS[format].width);
      assert.equal(layout.canvasHeight, FORMAT_DIMENSIONS[format].height);

      const safe = SAFE_ZONES[format];
      assert.equal(layout.safeZone.top, safe.top);
      assert.equal(layout.safeZone.bottom, safe.bottom);
      assert.equal(layout.safeZone.left, safe.left);
      assert.equal(layout.safeZone.right, safe.right);

      assert.ok(layout.blocks.length >= 1, `Aucun bloc placé pour le format ${format}`);
    }
  });

  it('En STORY avec HOOK, BULLETS (4 items) et IMAGE : l\'image reste présente avec h >= 35% de la zone de contenu', () => {
    const spec: VisualSpec = {
      version: 2,
      format: 'STORY',
      palette: 'EMERALD_GOLD',
      pattern: 'NDOP_CHEVRON',
      blocks: [
        { id: 'hook-1', type: 'HOOK', text: 'LE GRAND TITRE EXTRÊMEMENT LONG QUI PREND BEAUCOUP D ESPACE', priority: 1 },
        {
          id: 'bullets-1',
          type: 'BULLETS',
          items: [
            'Bénéfice important numéro un avec détails',
            'Bénéfice important numéro deux avec détails',
            'Bénéfice important numéro trois avec détails',
            'Bénéfice important numéro quatre avec détails',
          ],
          style: 'CHECK',
          priority: 2,
        },
        {
          id: 'img-1',
          type: 'IMAGE',
          dataUrl: 'https://example.com/screenshot.png',
          priority: 2,
        },
      ],
      cta: { text: 'VIENS TESTER LA BÊTA' },
    };

    const layout = computeLayout(spec, defaultMeasure);

    // Vérifier que le bloc IMAGE (img-1) est toujours présent
    const imgBlock = layout.blocks.find((b) => b.id === 'img-1');
    assert.ok(imgBlock, "L'image a été indûment supprimée !");
    assert.equal(imgBlock.type, 'IMAGE');

    // Vérifier sa hauteur minimale : au moins 35% de la zone de contenu (contentArea.height)
    const minExpectedHeight = Math.round(layout.contentArea.height * 0.35);
    assert.ok(
      imgBlock.height >= minExpectedHeight,
      `La hauteur de l'image (${imgBlock.height}px) est inférieure à 35% de la zone de contenu (${minExpectedHeight}px)`
    );
  });
});
