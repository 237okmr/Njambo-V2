/**
 * Tests des règles pures du registre Kora Cash : aucun solde négatif, aucun montant décimal,
 * chaque type de mouvement garde un sens cohérent.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeMovement, isValidRef } from './cashLedgerRules';
import { CashLedgerError } from './cashTypes';

const empty = { available: 0, locked: 0 };

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof CashLedgerError ? e.code : 'OTHER';
  }
}

describe('Kora Cash — registre : règles pures', () => {
  it('un dépôt crédite le disponible', () => {
    const after = computeMovement(empty, { kind: 'DEPOSIT', availableDelta: 5000, lockedDelta: 0 });
    assert.deepEqual(after, { available: 5000, locked: 0 });
  });

  it('refuse un dépôt à zéro, négatif ou décimal', () => {
    assert.equal(codeOf(() => computeMovement(empty, { kind: 'DEPOSIT', availableDelta: 0, lockedDelta: 0 })), 'INVALID_AMOUNT');
    assert.equal(codeOf(() => computeMovement(empty, { kind: 'DEPOSIT', availableDelta: -100, lockedDelta: 0 })), 'INVALID_KIND_SIGNS');
    assert.equal(codeOf(() => computeMovement(empty, { kind: 'DEPOSIT', availableDelta: 100.5, lockedDelta: 0 })), 'INVALID_AMOUNT');
  });

  it('refuse un montant hors limites sûres', () => {
    assert.equal(codeOf(() => computeMovement(empty, { kind: 'DEPOSIT', availableDelta: Number.MAX_SAFE_INTEGER + 2, lockedDelta: 0 })), 'INVALID_AMOUNT');
    assert.equal(codeOf(() => computeMovement(empty, { kind: 'DEPOSIT', availableDelta: Number.NaN, lockedDelta: 0 })), 'INVALID_AMOUNT');
  });

  it('une entrée en table déplace le disponible vers l\'engagé', () => {
    const after = computeMovement({ available: 3000, locked: 0 }, { kind: 'TABLE_BUYIN', availableDelta: -2000, lockedDelta: 2000 });
    assert.deepEqual(after, { available: 1000, locked: 2000 });
  });

  it('refuse une entrée en table déséquilibrée (argent créé ou détruit)', () => {
    assert.equal(
      codeOf(() => computeMovement({ available: 3000, locked: 0 }, { kind: 'TABLE_BUYIN', availableDelta: -2000, lockedDelta: 2500 })),
      'INVALID_KIND_SIGNS'
    );
  });

  it('refuse une entrée en table au-delà du disponible', () => {
    assert.equal(
      codeOf(() => computeMovement({ available: 1000, locked: 0 }, { kind: 'TABLE_BUYIN', availableDelta: -2000, lockedDelta: 2000 })),
      'INSUFFICIENT_AVAILABLE'
    );
  });

  it('une sortie de table rend l\'engagé au disponible', () => {
    const after = computeMovement({ available: 500, locked: 2500 }, { kind: 'TABLE_CASHOUT', availableDelta: 2500, lockedDelta: -2500 });
    assert.deepEqual(after, { available: 3000, locked: 0 });
  });

  it('refuse une sortie de table au-delà de l\'engagé', () => {
    assert.equal(
      codeOf(() => computeMovement({ available: 0, locked: 1000 }, { kind: 'TABLE_CASHOUT', availableDelta: 2000, lockedDelta: -2000 })),
      'INSUFFICIENT_LOCKED'
    );
  });

  it('un règlement de partie ne touche jamais le disponible', () => {
    assert.equal(
      codeOf(() => computeMovement({ available: 100, locked: 1000 }, { kind: 'TABLE_SETTLEMENT', availableDelta: 50, lockedDelta: 50 })),
      'INVALID_KIND_SIGNS'
    );
    const win = computeMovement({ available: 100, locked: 1000 }, { kind: 'TABLE_SETTLEMENT', availableDelta: 0, lockedDelta: 800 });
    assert.deepEqual(win, { available: 100, locked: 1800 });
    const loss = computeMovement({ available: 100, locked: 1000 }, { kind: 'TABLE_SETTLEMENT', availableDelta: 0, lockedDelta: -1000 });
    assert.deepEqual(loss, { available: 100, locked: 0 });
  });

  it('une perte ne peut pas dépasser l\'engagé en table', () => {
    assert.equal(
      codeOf(() => computeMovement({ available: 9999, locked: 1000 }, { kind: 'TABLE_SETTLEMENT', availableDelta: 0, lockedDelta: -1001 })),
      'INSUFFICIENT_LOCKED'
    );
  });

  it('une demande de retrait met l\'argent de côté, un remboursement le rend', () => {
    const hold = computeMovement({ available: 4000, locked: 0 }, { kind: 'WITHDRAWAL_HOLD', availableDelta: -4000, lockedDelta: 0 });
    assert.deepEqual(hold, { available: 0, locked: 0 });
    const refund = computeMovement(hold, { kind: 'WITHDRAWAL_REFUND', availableDelta: 4000, lockedDelta: 0 });
    assert.deepEqual(refund, { available: 4000, locked: 0 });
  });

  it('refuse un retrait supérieur au disponible, même si de l\'argent est engagé en table', () => {
    assert.equal(
      codeOf(() => computeMovement({ available: 1000, locked: 5000 }, { kind: 'WITHDRAWAL_HOLD', availableDelta: -2000, lockedDelta: 0 })),
      'INSUFFICIENT_AVAILABLE'
    );
  });

  it('une correction manuelle exige un acteur et ne passe jamais sous zéro', () => {
    assert.equal(
      codeOf(() => computeMovement({ available: 1000, locked: 0 }, { kind: 'ADJUSTMENT', availableDelta: 500, lockedDelta: 0 })),
      'ADJUSTMENT_NEEDS_ACTOR'
    );
    assert.equal(
      codeOf(() => computeMovement({ available: 1000, locked: 0 }, { kind: 'ADJUSTMENT', availableDelta: -1500, lockedDelta: 0, actorUid: 'admin-1' })),
      'INSUFFICIENT_AVAILABLE'
    );
    const ok = computeMovement({ available: 1000, locked: 0 }, { kind: 'ADJUSTMENT', availableDelta: -400, lockedDelta: 0, actorUid: 'admin-1' });
    assert.deepEqual(ok, { available: 600, locked: 0 });
  });

  it('refuse de travailler sur un solde existant corrompu', () => {
    assert.equal(
      codeOf(() => computeMovement({ available: -5, locked: 0 }, { kind: 'DEPOSIT', availableDelta: 100, lockedDelta: 0 })),
      'CORRUPT_BALANCE'
    );
    assert.equal(
      codeOf(() => computeMovement({ available: 10.5, locked: 0 }, { kind: 'DEPOSIT', availableDelta: 100, lockedDelta: 0 })),
      'CORRUPT_BALANCE'
    );
  });

  it('valide la forme de la clé d\'idempotence', () => {
    assert.equal(isValidRef('dep_campay_abc12345'), true);
    assert.equal(isValidRef('court'), false);
    assert.equal(isValidRef('avec/barre/oblique'), false);
    assert.equal(isValidRef('x'.repeat(129)), false);
    assert.equal(isValidRef(42), false);
  });
});
