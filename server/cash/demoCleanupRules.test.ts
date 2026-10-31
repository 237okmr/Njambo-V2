import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { demoCleanupRef, planDemoCleanup, totalDeduction } from './demoCleanupRules';
import { isValidRef } from './cashLedgerRules';

describe('Kora Cash — correction des soldes fictifs de démo', () => {
  it('retire la somme des dépôts simulés, sans toucher aux vrais essais', () => {
    const lines = planDemoCleanup(
      [{ uid: 'a', available: 1045 }],
      [
        { uid: 'a', amount: 500 },
        { uid: 'a', amount: 500 },
      ],
    );
    assert.deepEqual(lines, [{ uid: 'a', simulatedTotal: 1000, available: 1045, deduction: 1000 }]);
    assert.equal(totalDeduction(lines), 1000);
  });

  it('ne retire jamais plus que le solde disponible', () => {
    const lines = planDemoCleanup([{ uid: 'a', available: 300 }], [{ uid: 'a', amount: 1000 }]);
    assert.equal(lines[0].deduction, 300);
  });

  it('ignore un joueur sans portefeuille ou à solde nul', () => {
    assert.deepEqual(planDemoCleanup([], [{ uid: 'a', amount: 500 }]), []);
    assert.deepEqual(planDemoCleanup([{ uid: 'a', available: 0 }], [{ uid: 'a', amount: 500 }]), []);
  });

  it('ignore les montants invalides et les joueurs sans dépôt simulé', () => {
    const lines = planDemoCleanup(
      [{ uid: 'a', available: 100 }, { uid: 'b', available: 50 }],
      [{ uid: 'a', amount: -5 }, { uid: 'a', amount: 12.5 }, { uid: '', amount: 10 }],
    );
    assert.deepEqual(lines, []);
  });

  it('traite plusieurs joueurs, triés par identifiant', () => {
    const lines = planDemoCleanup(
      [{ uid: 'b', available: 700 }, { uid: 'a', available: 200 }],
      [{ uid: 'b', amount: 500 }, { uid: 'a', amount: 500 }],
    );
    assert.deepEqual(lines.map((l) => [l.uid, l.deduction]), [['a', 200], ['b', 500]]);
  });

  it('la clé de correction est valide pour le registre et propre à chaque joueur', () => {
    assert.equal(isValidRef(demoCleanupRef('AbC123xyz')), true);
    assert.notEqual(demoCleanupRef('a1'), demoCleanupRef('a2'));
  });
});
