/**
 * Tests des fonctions pures Kora Cash côté joueur : format FCFA, saisie du montant, état de l'entrée, libellés démo.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  NARROW_NBSP,
  MIN_DEPOSIT_FCFA_CLIENT,
  QUICK_DEPOSIT_AMOUNTS,
  formatFcfa,
  parseTypedAmount,
  resolveEntryState,
  getDepositUi,
} from './koraCashFormat';

describe('Kora Cash joueur — format et saisie', () => {
  it('formate les montants avec espace fine insécable', () => {
    assert.equal(formatFcfa(0), '0 FCFA');
    assert.equal(formatFcfa(500), '500 FCFA');
    assert.equal(formatFcfa(12500), `12${NARROW_NBSP}500 FCFA`);
    assert.equal(formatFcfa(1000000), `1${NARROW_NBSP}000${NARROW_NBSP}000 FCFA`);
  });

  it('un montant invalide s\'affiche zéro', () => {
    assert.equal(formatFcfa(Number.NaN), '0 FCFA');
    assert.equal(formatFcfa(undefined), '0 FCFA');
    assert.equal(formatFcfa('1000'), '0 FCFA');
    assert.equal(formatFcfa(1234.9), `1${NARROW_NBSP}234 FCFA`);
  });

  it('accepte une saisie de chiffres, espaces de groupement tolérés', () => {
    assert.deepEqual(parseTypedAmount('2500'), { ok: true, amount: 2500 });
    assert.deepEqual(parseTypedAmount(' 2 500 '), { ok: true, amount: 2500 });
    assert.deepEqual(parseTypedAmount(`2${NARROW_NBSP}500`), { ok: true, amount: 2500 });
    assert.equal(parseTypedAmount(String(MIN_DEPOSIT_FCFA_CLIENT)).ok, true);
  });

  it('refuse vide, décimal, lettres, négatif et sous le minimum', () => {
    assert.equal(parseTypedAmount('').ok, false);
    assert.equal(parseTypedAmount('   ').ok, false);
    assert.equal(parseTypedAmount('12,5').ok, false);
    assert.equal(parseTypedAmount('12.5').ok, false);
    assert.equal(parseTypedAmount('abc').ok, false);
    assert.equal(parseTypedAmount('-500').ok, false);
    assert.equal(parseTypedAmount(String(MIN_DEPOSIT_FCFA_CLIENT - 1)).ok, false);
    assert.equal(parseTypedAmount('99999999999999999999').ok, false);
  });

  it('les montants rapides respectent tous le minimum', () => {
    for (const a of QUICK_DEPOSIT_AMOUNTS) {
      assert.equal(Number.isSafeInteger(a) && a >= MIN_DEPOSIT_FCFA_CLIENT, true);
    }
  });

  it('l\'entrée du menu : bientôt, connexion requise ou ouverte', () => {
    assert.equal(resolveEntryState(null, true), 'COMING_SOON');
    assert.equal(resolveEntryState({ enabled: false, environment: 'DEMO' }, true), 'COMING_SOON');
    assert.equal(resolveEntryState({ enabled: true, environment: 'DEMO' }, false), 'LOGIN_REQUIRED');
    assert.equal(resolveEntryState({ enabled: true, environment: 'DEMO' }, true), 'OPEN');
    assert.equal(resolveEntryState({ enabled: true, environment: 'LIVE' }, true), 'OPEN');
  });

  it('en démo tout est annoncé fictif et le dépôt est proposé, en LIVE il ne l\'est pas encore', () => {
    const demo = getDepositUi('DEMO');
    assert.equal(demo.canDeposit, true);
    assert.match(demo.banner, /fictif/);
    assert.match(demo.buttonLabel, /fictif/);
    const live = getDepositUi('LIVE');
    assert.equal(live.canDeposit, false);
    assert.doesNotMatch(live.banner, /fictif/);
  });
});
