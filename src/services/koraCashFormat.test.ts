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

  it('en démo sans paiement Campay actif aucun dépôt n\'est proposé, et en LIVE non plus', () => {
    const demo = getDepositUi('DEMO');
    assert.equal(demo.canDeposit, false);
    assert.match(demo.banner, /aucun moyen de paiement de test/);
    const live = getDepositUi('LIVE');
    assert.equal(live.canDeposit, false);
    assert.doesNotMatch(live.banner, /fictif/);
  });

  it('en démo avec Campay : paiement de test, numéro demandé, débit réel annoncé', () => {
    const ui = getDepositUi('DEMO', 'CAMPAY');
    assert.equal(ui.canDeposit, true);
    assert.equal(ui.needsPhone, true);
    assert.match(ui.banner, /test/);
    assert.match(ui.banner, /réellement débité/);
    assert.doesNotMatch(ui.banner, /Aucun argent réel/);
    assert.match(ui.buttonLabel, /Mobile Money/);
    assert.equal(getDepositUi('DEMO').needsPhone, false);
    assert.equal(getDepositUi('LIVE', 'CAMPAY').canDeposit, false);
  });

  it('en démo avec Campay : de 10 à 25 FCFA et boutons 10, 25 ; ailleurs le minimum de 100 reste', () => {
    const ui = getDepositUi('DEMO', 'CAMPAY');
    assert.equal(ui.minAmount, 10);
    assert.equal(ui.maxAmount, 25);
    assert.deepEqual(ui.quickAmounts, [10, 25]);
    const limits = { min: ui.minAmount, max: ui.maxAmount ?? undefined };
    assert.deepEqual(parseTypedAmount('20', limits), { ok: true, amount: 20 });
    assert.equal(parseTypedAmount('10', limits).ok, true);
    assert.equal(parseTypedAmount('25', limits).ok, true);
    assert.equal(parseTypedAmount('9', limits).ok, false);
    assert.equal(parseTypedAmount('26', limits).ok, false);
    const simulated = getDepositUi('DEMO');
    assert.equal(simulated.minAmount, MIN_DEPOSIT_FCFA_CLIENT);
    assert.equal(simulated.maxAmount, null);
    assert.deepEqual(simulated.quickAmounts, QUICK_DEPOSIT_AMOUNTS);
    assert.equal(parseTypedAmount('20').ok, false);
  });
});
