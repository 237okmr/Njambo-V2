import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { auditPlayer, engagedByTable, hasAlertingFinding, orderLedger, planIncremental, tablesToLookUp } from './cashAuditRules';
import type { CashLedgerEntry, CashMovementKind } from './cashTypes';

let seq = 0;
function line(
  kind: CashMovementKind,
  availableDelta: number,
  lockedDelta: number,
  before: [number, number],
  over: Partial<CashLedgerEntry> = {}
): CashLedgerEntry {
  seq += 1;
  return {
    ref: `ref_${seq.toString().padStart(6, '0')}`,
    uid: 'u1',
    kind,
    availableDelta,
    lockedDelta,
    availableBefore: before[0],
    availableAfter: before[0] + availableDelta,
    lockedBefore: before[1],
    lockedAfter: before[1] + lockedDelta,
    createdAt: 1000 + seq * 10,
    ...over,
  };
}

/** Parcours sain : dépôt 1000, entrée 400 en table T1, gain net de 100, sortie de 500. */
function healthy(): CashLedgerEntry[] {
  const d = line('DEPOSIT', 1000, 0, [0, 0]);
  const b = line('TABLE_BUYIN', -400, 400, [1000, 0], { meta: { tableId: 'T1' } });
  const s = line('TABLE_SETTLEMENT', 0, 100, [600, 400], { meta: { tableId: 'T1' } });
  const o = line('TABLE_CASHOUT', 500, -500, [600, 500], { meta: { tableId: 'T1' } });
  return [d, b, s, o];
}

const codes = (f: ReturnType<typeof auditPlayer>) => f.map((x) => x.code);

describe('audit du portefeuille : cas sains', () => {
  it('un parcours complet et cohérent ne donne aucun constat', () => {
    const entries = healthy();
    const f = auditPlayer({ uid: 'u1', wallet: { available: 1100, locked: 0 }, entries, seats: {} });
    assert.deepEqual(f, []);
  });

  it('une table encore ouverte avec de l\'argent engagé est normale', () => {
    const d = line('DEPOSIT', 1000, 0, [0, 0]);
    const b = line('TABLE_BUYIN', -400, 400, [1000, 0], { meta: { tableId: 'T2' } });
    const f = auditPlayer({ uid: 'u1', wallet: { available: 600, locked: 400 }, entries: [d, b], seats: { T2: { status: 'OPEN' } } });
    assert.deepEqual(f, []);
  });

  it('aucun portefeuille ni registre : rien à signaler', () => {
    assert.deepEqual(auditPlayer({ uid: 'u1', wallet: null, entries: [], seats: {} }), []);
  });
});

describe('audit du portefeuille : écarts de solde et de chaîne', () => {
  it('portefeuille différent de la dernière ligne', () => {
    const f = auditPlayer({ uid: 'u1', wallet: { available: 1200, locked: 0 }, entries: healthy(), seats: {} });
    assert.ok(codes(f).includes('WALLET_MISMATCH'));
    assert.ok(hasAlertingFinding(f));
  });

  it('portefeuille garni sans aucune ligne de registre', () => {
    const f = auditPlayer({ uid: 'u1', wallet: { available: 50, locked: 0 }, entries: [], seats: {} });
    assert.deepEqual(codes(f), ['WALLET_MISMATCH']);
  });

  it('solde négatif ou décimal dans le portefeuille', () => {
    assert.ok(codes(auditPlayer({ uid: 'u1', wallet: { available: -5, locked: 0 }, entries: [], seats: {} })).includes('WALLET_INVALID'));
    assert.ok(codes(auditPlayer({ uid: 'u1', wallet: { available: 10.5, locked: 0 }, entries: [], seats: {} })).includes('WALLET_INVALID'));
  });

  it('chaîne rompue : une ligne manquante au milieu', () => {
    const [d, b, s, o] = healthy();
    const f = auditPlayer({ uid: 'u1', wallet: { available: 1100, locked: 0 }, entries: [d, s, o, b].filter((e) => e !== b), seats: {} });
    assert.ok(codes(f).includes('CHAIN_BREAK'));
  });

  it('ligne dont le calcul après est faux', () => {
    const [d, b, s, o] = healthy();
    const bad = { ...s, availableAfter: s.availableAfter + 7 };
    const f = auditPlayer({ uid: 'u1', wallet: { available: 1100, locked: 0 }, entries: [d, b, bad, o], seats: {} });
    assert.ok(codes(f).includes('LINE_INVALID'));
  });

  it('ligne qui viole son type : un dépôt qui diminue le disponible', () => {
    const bad = line('DEPOSIT', -10, 0, [100, 0]);
    const f = auditPlayer({ uid: 'u1', wallet: { available: 90, locked: 0 }, entries: [bad], seats: {} });
    assert.ok(codes(f).includes('LINE_INVALID'));
  });

  it('une correction manuelle sans admin est refusée par les règles', () => {
    const d = line('DEPOSIT', 100, 0, [0, 0]);
    const adj = line('ADJUSTMENT', 50, 0, [100, 0]);
    const f = auditPlayer({ uid: 'u1', wallet: { available: 150, locked: 0 }, entries: [d, adj], seats: {} });
    assert.ok(codes(f).includes('LINE_INVALID'));
  });

  it('deux lignes de la même milliseconde ne sont pas prises pour une rupture', () => {
    const d = line('DEPOSIT', 1000, 0, [0, 0], { createdAt: 5000 });
    const w = line('WITHDRAWAL_HOLD', -300, 0, [1000, 0], { createdAt: 5000 });
    const r = line('WITHDRAWAL_REFUND', 300, 0, [700, 0], { createdAt: 5000 });
    for (const order of [[d, w, r], [r, d, w], [w, r, d]]) {
      const f = auditPlayer({ uid: 'u1', wallet: { available: 1000, locked: 0 }, entries: order, seats: {} });
      assert.deepEqual(f, [], `ordre ${order.map((e) => e.kind).join(', ')}`);
    }
    assert.deepEqual(orderLedger([r, w, d]).map((e) => e.kind), ['DEPOSIT', 'WITHDRAWAL_HOLD', 'WITHDRAWAL_REFUND']);
  });
});

describe('audit du portefeuille : somme et historique', () => {
  it('somme des mouvements différente du portefeuille alors que la dernière ligne concorde', () => {
    // Le registre est une chaîne qui se tient, mais le premier solde avant (0) ne colle pas à la somme : on triche sur une variation.
    const d = line('DEPOSIT', 1000, 0, [0, 0]);
    const tampered = { ...d, availableDelta: 900 };
    const f = auditPlayer({ uid: 'u1', wallet: { available: 1000, locked: 0 }, entries: [tampered], seats: {} });
    assert.ok(codes(f).includes('SUM_MISMATCH') || codes(f).includes('LINE_INVALID'));
  });

  it('un historique qui ne part pas de zéro est une information, pas une alerte', () => {
    const b = line('DEPOSIT', 100, 0, [500, 0]);
    const f = auditPlayer({ uid: 'u1', wallet: { available: 600, locked: 0 }, entries: [b], seats: {} });
    assert.deepEqual(codes(f), ['HISTORY_NOT_FROM_ZERO']);
    assert.equal(hasAlertingFinding(f), false);
  });
});

describe('audit du portefeuille : engagé et sièges', () => {
  it('l\'argent engagé par table se lit dans le registre', () => {
    assert.deepEqual(engagedByTable(healthy()), { T1: 0 });
    const d = line('DEPOSIT', 1000, 0, [0, 0]);
    const b = line('TABLE_BUYIN', -400, 400, [1000, 0], { meta: { tableId: 'T9' } });
    assert.deepEqual(engagedByTable([d, b]), { T9: 400 });
    assert.deepEqual(tablesToLookUp([d, b]), ['T9']);
    assert.deepEqual(tablesToLookUp(healthy()), [], 'rien d\'engagé : aucune fiche à lire');
  });

  it('siège fermé alors que de l\'argent reste engagé', () => {
    const d = line('DEPOSIT', 1000, 0, [0, 0]);
    const b = line('TABLE_BUYIN', -400, 400, [1000, 0], { meta: { tableId: 'T3' } });
    const f = auditPlayer({ uid: 'u1', wallet: { available: 600, locked: 400 }, entries: [d, b], seats: { T3: { status: 'CLOSED' } } });
    assert.deepEqual(codes(f), ['SEAT_CLOSED_ENGAGED']);
    assert.ok(hasAlertingFinding(f));
  });

  it('argent engagé sans fiche de siège', () => {
    const d = line('DEPOSIT', 1000, 0, [0, 0]);
    const b = line('TABLE_BUYIN', -400, 400, [1000, 0], { meta: { tableId: 'T4' } });
    const f = auditPlayer({ uid: 'u1', wallet: { available: 600, locked: 400 }, entries: [d, b], seats: { T4: null } });
    assert.deepEqual(codes(f), ['SEAT_MISSING']);
  });

  it('engagé négatif sur une table', () => {
    const d = line('DEPOSIT', 1000, 0, [0, 0]);
    const b = line('TABLE_BUYIN', -400, 400, [1000, 0], { meta: { tableId: 'T5' } });
    const o = line('TABLE_CASHOUT', 500, -500, [600, 400], { meta: { tableId: 'T5' } });
    const f = auditPlayer({ uid: 'u1', wallet: { available: 1100, locked: -100 }, entries: [d, b, o], seats: {} });
    assert.ok(codes(f).includes('TABLE_NEGATIVE'));
  });

  it('un mouvement d\'engagé sans table est une information', () => {
    const d = line('DEPOSIT', 1000, 0, [0, 0]);
    const b = line('TABLE_BUYIN', -400, 400, [1000, 0]);
    const f = auditPlayer({ uid: 'u1', wallet: { available: 600, locked: 400 }, entries: [d, b], seats: {} });
    assert.deepEqual(codes(f), ['LOCKED_WITHOUT_TABLE']);
    assert.equal(hasAlertingFinding(f), false);
  });

  it('plafonne le nombre de constats par joueur', () => {
    const entries: CashLedgerEntry[] = [];
    for (let i = 0; i < 30; i++) entries.push(line('DEPOSIT', 10, 0, [999, 0], { createdAt: 100 + i }));
    const f = auditPlayer({ uid: 'u1', wallet: { available: 0, locked: 0 }, entries, seats: {} });
    assert.ok(f.length <= 10);
  });
});

describe('audit : préparation d\'un passage incrémental', () => {
  const l = (uid: string, createdAt: number) => ({ uid, createdAt });

  it('passage complet : joueurs distincts dans l\'ordre, repère reculé du chevauchement', () => {
    const plan = planIncremental([l('a', 10), l('b', 20), l('a', 30)], 5, 10, 100, 1000, 300);
    assert.deepEqual(plan, { uids: ['a', 'b'], nextCheckpoint: 700, partial: false });
  });

  it('aucune écriture : le repère avance, jamais en arrière', () => {
    assert.deepEqual(planIncremental([], 900, 10, 100, 1000, 300), { uids: [], nextCheckpoint: 900, partial: false });
  });

  it('plafond de joueurs : le repère s\'arrête juste avant le premier joueur non traité', () => {
    const plan = planIncremental([l('a', 10), l('b', 20), l('c', 30), l('d', 40)], 5, 2, 100, 1000, 300);
    assert.deepEqual(plan, { uids: ['a', 'b'], nextCheckpoint: 29, partial: true });
  });

  it('plafond de lignes : reprise à la dernière ligne vue, sans jamais rester bloqué', () => {
    assert.deepEqual(planIncremental([l('a', 10), l('b', 20)], 5, 10, 2, 1000, 300), { uids: ['a', 'b'], nextCheckpoint: 19, partial: true });
    // toutes les lignes sur la même milliseconde que le repère : on avance quand même
    assert.deepEqual(planIncremental([l('a', 5), l('b', 5)], 5, 10, 2, 1000, 300), { uids: ['a', 'b'], nextCheckpoint: 5, partial: true });
  });

  it('un passage partiel progresse toujours : le repère ne recule jamais sous celui de départ', () => {
    const plan = planIncremental([l('a', 5), l('b', 5), l('c', 5)], 5, 2, 100, 1000, 300);
    assert.equal(plan.partial, true);
    assert.ok(plan.nextCheckpoint >= 5);
  });
});
