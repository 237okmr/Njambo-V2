/**
 * Tests des règles pures des dépôts Kora Cash : montant entier minimum, transitions de statut, clés.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_DEPOSIT_FCFA,
  parseDepositAmount,
  canTransition,
  isValidDepositId,
  newDepositId,
  ledgerRefForDeposit,
} from './depositRules';
import { isValidRef } from './cashLedgerRules';

describe('Kora Cash — dépôts : règles pures', () => {
  it('accepte un montant entier au-dessus du minimum, sans plafond', () => {
    assert.deepEqual(parseDepositAmount(MIN_DEPOSIT_FCFA), { ok: true, amount: MIN_DEPOSIT_FCFA });
    assert.deepEqual(parseDepositAmount(5000), { ok: true, amount: 5000 });
    assert.equal(parseDepositAmount(2_000_000).ok, true);
  });

  it('refuse un montant sous le minimum, nul ou négatif', () => {
    assert.equal(parseDepositAmount(MIN_DEPOSIT_FCFA - 1).ok, false);
    assert.equal(parseDepositAmount(0).ok, false);
    assert.equal(parseDepositAmount(-500).ok, false);
  });

  it('refuse un décimal, un texte, un NaN ou une valeur absente', () => {
    assert.equal(parseDepositAmount(1000.5).ok, false);
    assert.equal(parseDepositAmount('1000').ok, false);
    assert.equal(parseDepositAmount(Number.NaN).ok, false);
    assert.equal(parseDepositAmount(Infinity).ok, false);
    assert.equal(parseDepositAmount(undefined).ok, false);
    assert.equal(parseDepositAmount(null).ok, false);
  });

  it('un dépôt ne quitte PENDING qu\'une fois', () => {
    assert.equal(canTransition('PENDING', 'SUCCESS'), true);
    assert.equal(canTransition('PENDING', 'FAILED'), true);
    assert.equal(canTransition('SUCCESS', 'FAILED'), false);
    assert.equal(canTransition('SUCCESS', 'SUCCESS'), false);
    assert.equal(canTransition('FAILED', 'SUCCESS'), false);
  });

  it('génère des identifiants de dépôt valides et distincts', () => {
    const a = newDepositId();
    const b = newDepositId();
    assert.equal(isValidDepositId(a), true);
    assert.notEqual(a, b);
    assert.equal(isValidDepositId('dep_court'), false);
    assert.equal(isValidDepositId('../etc'), false);
    assert.equal(isValidDepositId(42), false);
  });

  it('la clé de registre d\'un dépôt est valide et stable', () => {
    const id = newDepositId();
    assert.equal(ledgerRefForDeposit(id), ledgerRefForDeposit(id));
    assert.equal(isValidRef(ledgerRefForDeposit(id)), true);
  });
});
