import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { authErrorCode, authFailureReportMessage, describeGoogleSignInError, GENERIC_SIGN_IN_ERROR } from './authErrors';

describe('connexion Google : code d\'erreur', () => {
  it('lit le code Firebase', () => {
    assert.equal(authErrorCode({ code: 'auth/popup-blocked' }), 'auth/popup-blocked');
  });
  it('reconnaît l\'assertion interne de Firebase', () => {
    assert.equal(authErrorCode(new Error('INTERNAL ASSERTION FAILED: Pending promise was never set')), 'firebase-assertion');
  });
  it('une erreur sans code ni texte connu : inconnu', () => {
    assert.equal(authErrorCode(null), 'inconnu');
    assert.equal(authErrorCode(new Error('autre')), 'inconnu');
  });
});

describe('connexion Google : message au joueur', () => {
  it('une annulation volontaire ne dit rien et ne remonte rien', () => {
    for (const code of ['auth/popup-closed-by-user', 'auth/cancelled-popup-request']) {
      assert.deepEqual(describeGoogleSignInError(code), { message: null, report: false });
    }
  });
  it('fenêtre bloquée : dit quoi faire et remonte le code', () => {
    const v = describeGoogleSignInError('auth/popup-blocked');
    assert.match(v.message ?? '', /Autorise les fenêtres/);
    assert.equal(v.report, true);
  });
  it('réseau coupé : message de réseau, rien à remonter', () => {
    const v = describeGoogleSignInError('auth/network-request-failed');
    assert.match(v.message ?? '', /internet/);
    assert.equal(v.report, false);
  });
  it('navigateur non pris en charge : renvoie vers Safari ou Chrome', () => {
    assert.match(describeGoogleSignInError('auth/operation-not-supported-in-this-environment').message ?? '', /Safari ou Chrome/);
  });
  it('tout autre échec : message générique et remontée', () => {
    for (const code of ['inconnu', 'firebase-assertion', 'auth/internal-error']) {
      assert.deepEqual(describeGoogleSignInError(code), { message: GENERIC_SIGN_IN_ERROR, report: true });
    }
  });
  it('la remontée ne contient que le code', () => {
    assert.equal(authFailureReportMessage('auth/popup-blocked'), 'Connexion Google : auth/popup-blocked');
  });
});
