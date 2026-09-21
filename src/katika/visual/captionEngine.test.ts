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
