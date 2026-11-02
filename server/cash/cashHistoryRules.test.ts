import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CashLedgerEntry } from './cashTypes';
import { toPublicMovements } from './cashHistoryRules';

function entry(partial: Partial<CashLedgerEntry>): CashLedgerEntry {
  return {
    ref: 'ref-12345678',
    uid: 'joueur-1',
    kind: 'DEPOSIT',
    availableDelta: 0,
    lockedDelta: 0,
    availableBefore: 0,
    availableAfter: 0,
    lockedBefore: 0,
    lockedAfter: 0,
    createdAt: 1,
    ...partial,
  };
}

describe('historique Kora Cash du joueur', () => {
  it('donne le montant vu par le joueur selon le type de mouvement', () => {
    const [deposit, buyIn, settlement, cashOut, adjustment] = [
      toPublicMovements([entry({ kind: 'DEPOSIT', availableDelta: 25 })])[0],
      toPublicMovements([entry({ kind: 'TABLE_BUYIN', availableDelta: -100, lockedDelta: 100 })])[0],
      toPublicMovements([entry({ kind: 'TABLE_SETTLEMENT', lockedDelta: -10 })])[0],
      toPublicMovements([entry({ kind: 'TABLE_CASHOUT', availableDelta: 90, lockedDelta: -90 })])[0],
      toPublicMovements([entry({ kind: 'ADJUSTMENT', availableDelta: 5, lockedDelta: -2 })])[0],
    ];
    assert.equal(deposit.amount, 25);
    assert.equal(buyIn.amount, -100);
    assert.equal(settlement.amount, -10);
    assert.equal(cashOut.amount, 90);
    assert.equal(adjustment.amount, 3);
  });

  it('ne laisse sortir ni note, ni acteur, ni clé, ni référence interne', () => {
    const [movement] = toPublicMovements([
      entry({ availableDelta: 25, note: 'note interne', actorUid: 'admin-1', meta: { depositId: 'd-1' } }),
    ]);
    assert.deepEqual(Object.keys(movement).sort(), ['amount', 'createdAt', 'kind']);
  });

  it('classe du plus récent au plus ancien, retire les lignes nulles et respecte le plafond', () => {
    const movements = toPublicMovements(
      [
        entry({ availableDelta: 1, createdAt: 10 }),
        entry({ availableDelta: 2, createdAt: 30 }),
        entry({ kind: 'TABLE_SETTLEMENT', lockedDelta: 0, createdAt: 40 }),
        entry({ availableDelta: 3, createdAt: 20 }),
      ],
      2
    );
    assert.deepEqual(movements.map((m) => m.createdAt), [30, 20]);
  });
});
