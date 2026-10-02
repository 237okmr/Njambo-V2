import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildCaptions } from './captionEngine';
import { VisualSpec } from './visualSpec';

describe('captionEngine - Générateur de légendes V2', () => {
  it('garantit une accroche Facebook <= 100 caractères', () => {
    const longHook = 'Ceci est une très très très très longue accroche de test qui dépasse largement les cent caractères autorisés pour la première ligne du visuel Katika Social Studio';
    const spec: VisualSpec = {
      version: 2,
      format: 'SQUARE',
      palette: 'EMERALD_GOLD',
      pattern: 'NDOP_CHEVRON',
      blocks: [
        { id: 'b1', type: 'HOOK', text: longHook },
      ],
      cta: { text: 'Jouer' },
    };

    const captions = buildCaptions(spec);
    const fbFirstLine = captions.facebook.split('\n')[0];

    assert.ok(
      fbFirstLine.length <= 100,
      `L'accroche Facebook dépasse 100 caractères: ${fbFirstLine.length} (valeur: "${fbFirstLine}")`
    );
  });

  it('ne contient aucun hashtag dans les légendes WhatsApp (Groupe & Statut)', () => {
    const spec: VisualSpec = {
      version: 2,
      format: 'SQUARE',
      palette: 'EMERALD_GOLD',
      pattern: 'NDOP_CHEVRON',
      blocks: [
        { id: 'b1', type: 'HOOK', text: 'Victoire au Njambo #Kora #Jeu' },
        { id: 'b2', type: 'BODY', text: 'Rejoins les meilleurs sur #Katika' },
      ],
      cta: { text: 'Tester' },
    };

    const captions = buildCaptions(spec);

    assert.strictEqual(
      captions.whatsappGroup.includes('#'),
      false,
      'La légende WhatsApp Groupe contient un hashtag !'
    );
    assert.strictEqual(
      captions.whatsappStatus.includes('#'),
      false,
      'La légende WhatsApp Statut contient un hashtag !'
    );
  });

  it('ne produit aucune ligne "page Facebook" quand facebookUrl est vide', () => {
    const spec: VisualSpec = {
      version: 2,
      format: 'SQUARE',
      palette: 'EMERALD_GOLD',
      pattern: 'NDOP_CHEVRON',
      blocks: [
        { id: 'b1', type: 'HOOK', text: 'Bêta ouverte Njambo' },
      ],
      cta: { text: 'Tester' },
    };

    const captionsNoFb = buildCaptions(spec, { links: { facebookUrl: '' } });
    assert.strictEqual(
      captionsNoFb.whatsappGroup.includes('Page Facebook'),
      false,
      'Affiche "Page Facebook" alors que facebookUrl est vide'
    );

    const captionsWithFb = buildCaptions(spec, { links: { facebookUrl: 'https://facebook.com/katikagame' } });
    assert.ok(
      captionsWithFb.whatsappGroup.includes('Page Facebook'),
      'N\'affiche pas "Page Facebook" alors que facebookUrl est renseigné'
    );
  });

  it('inclut la mention (jetons virtuels) quand EVENT.prize est renseigné', () => {
    const spec: VisualSpec = {
      version: 2,
      format: 'SQUARE',
      palette: 'EBONY_GOLD',
      pattern: 'NDOP_CHEVRON',
      blocks: [
        { id: 'b1', type: 'HOOK', text: 'Grand Tournoi du Samedi' },
        { id: 'b2', type: 'EVENT', date: 'Samedi 20h', prize: '10 000 Jetons' },
      ],
      cta: { text: 'S’inscrire' },
    };

    const captions = buildCaptions(spec);

    assert.ok(
      captions.facebook.includes('jetons virtuels'),
      'Facebook ne contient pas la mention obligatoire (jetons virtuels)'
    );
    assert.ok(
      captions.whatsappGroup.includes('jetons virtuels'),
      'WhatsApp Groupe ne contient pas la mention obligatoire (jetons virtuels)'
    );
  });
});

describe('captionEngine - le post complète le visuel et ne le recopie pas', () => {
  const bodyText = 'Texte unique du visuel que le post ne doit jamais recopier';
  const makeSpec = (post?: VisualSpec['post']): VisualSpec => ({
    version: 2,
    format: 'SQUARE',
    palette: 'EMERALD_GOLD',
    pattern: 'NDOP_CHEVRON',
    blocks: [
      { id: 'b1', type: 'HOOK', text: 'LE KORA DU DIMANCHE' },
      { id: 'b2', type: 'BODY', text: bodyText },
      { id: 'b3', type: 'BULLETS', items: ['Puce exclusive du visuel', 'Autre puce du visuel'] },
    ],
    cta: { text: 'Viens jouer' },
    ...(post ? { post } : {}),
  });

  it('utilise l\'histoire et la question de l\'IA, sans le texte du visuel', () => {
    const captions = buildCaptions(
      makeSpec({ story: 'Hier soir un cousin a tout renversé au dernier pli.', question: 'Tu aurais gardé quelle carte ?', hashtags: ['#Kora'] })
    );
    assert.ok(captions.facebook.startsWith('Hier soir un cousin'));
    assert.ok(captions.facebook.includes('Tu aurais gardé quelle carte ?'));
    assert.ok(captions.facebook.includes('#Kora'));
    for (const text of [captions.facebook, captions.whatsappGroup, captions.whatsappStatus]) {
      assert.strictEqual(text.includes(bodyText), false);
      assert.strictEqual(text.includes('Puce exclusive'), false);
    }
    assert.ok(captions.whatsappStatus.split('\n')[0].startsWith('Tu aurais gardé'));
  });

  it('sans post de l\'IA : accroche courte puis histoire locale, jamais le texte du visuel', () => {
    const captions = buildCaptions(makeSpec());
    const paragraphs = captions.facebook.split('\n\n');
    assert.strictEqual(paragraphs[0], 'LE KORA DU DIMANCHE');
    assert.ok(paragraphs.length >= 5);
    assert.ok(captions.facebook.includes('?') || captions.facebook.includes('!'));
    assert.strictEqual(captions.facebook.includes(bodyText), false);
    assert.strictEqual(captions.whatsappGroup.includes(bodyText), false);
  });

  it('un même visuel donne toujours les mêmes légendes (choix stable)', () => {
    assert.deepStrictEqual(buildCaptions(makeSpec()), buildCaptions(makeSpec()));
  });

  it('utilise les liens réels et des liens de jeu suivis (UTM) par plateforme', () => {
    const captions = buildCaptions(makeSpec());
    assert.ok(captions.facebook.includes('utm_source=facebook'));
    assert.ok(captions.whatsappGroup.includes('utm_source=whatsapp'));
    assert.ok(captions.whatsappGroup.includes('utm_medium=group'));
    assert.ok(captions.whatsappStatus.includes('utm_medium=status'));
    assert.ok(captions.facebook.includes('JmIYaCOSjy1Lycd2OANd5l'));
    assert.strictEqual(captions.facebook.includes('njambokora'), false);
  });
});
