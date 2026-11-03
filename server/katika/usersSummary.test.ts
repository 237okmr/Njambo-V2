import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeRankTitles, summarizeUsers } from './usersSummary';

describe('Résumé du dossier des joueurs', () => {
  it('compte les comptes Google, les invités et les rangs, sans renvoyer la liste', () => {
    const summary = summarizeUsers(
      [
        { id: 'a', email: 'a@x.com' },
        { id: 'b', isGuest: false, honorificTitleId: 'CONFIRME' },
        { id: 'c', isGuest: true, honorificTitleId: 'TITRE_INCONNU' },
      ],
      { a: 'LEGENDE_KORA' }
    );
    assert.equal(summary.registered, 3);
    assert.equal(summary.google, 2);
    assert.equal(summary.guests, 1);
    assert.equal(summary.pyramid.LEGENDE_KORA, 1);
    assert.equal(summary.pyramid.CONFIRME, 1);
    assert.equal(summary.pyramid.APPRENTI, 1);
    assert.equal('users' in summary, false);
  });

  it('ignore les rangs inconnus ou mal formés envoyés par l\'écran', () => {
    assert.deepEqual(sanitizeRankTitles({ a: 'LEGENDE_KORA', b: 'ROI', c: 3 }), { a: 'LEGENDE_KORA' });
    assert.deepEqual(sanitizeRankTitles(['LEGENDE_KORA']), {});
    assert.deepEqual(sanitizeRankTitles(null), {});
  });
});
