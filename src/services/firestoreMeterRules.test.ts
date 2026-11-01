import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { billedReads, labelForFirestoreTarget, normalizeFirestorePath } from './firestoreMeterRules';

describe('Mesure des lectures du téléphone — étiquettes', () => {
  it('remplace les identifiants par une étoile', () => {
    assert.equal(normalizeFirestorePath('users/abc123'), 'users/*');
    assert.equal(normalizeFirestorePath('users/abc123/history'), 'users/*/history');
    assert.equal(normalizeFirestorePath('users/abc123/friends/xyz'), 'users/*/friends/*');
    assert.equal(normalizeFirestorePath(''), 'inconnu');
  });

  it('lit le chemin d\'une référence ou d\'une requête, sinon « inconnu »', () => {
    assert.equal(labelForFirestoreTarget({ path: 'users/abc/history' }), 'users/*/history');
    assert.equal(labelForFirestoreTarget({ _query: { path: { canonicalString: () => 'users' } } }), 'users');
    assert.equal(labelForFirestoreTarget({}), 'inconnu');
    assert.equal(labelForFirestoreTarget(null), 'inconnu');
  });

  it('ne laisse jamais passer un caractère interdit', () => {
    const label = labelForFirestoreTarget({ path: 'users/a b/é' });
    assert.match(label, /^[a-zA-Z0-9_*:./-]+$/);
  });
});

describe('Mesure des lectures du téléphone — lectures facturées', () => {
  it('ne compte rien depuis le cache et au moins 1 sinon', () => {
    assert.equal(billedReads(50, true), 0);
    assert.equal(billedReads(0, false), 1);
    assert.equal(billedReads(100, false), 100);
    assert.equal(billedReads(Number.NaN, false), 1);
  });
});
