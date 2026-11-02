/**
 * Tables Cash : réglages, bornes d'entrée, et livre de compte sur un registre en mémoire qui applique les vraies règles.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CashPartieDoc, CashSeatDoc, CashTableBook, CashTableDeps } from './cashTables';
import { computeMovement } from './cashLedgerRules';
import { CashLedgerEntry, CashMovementInput } from './cashTypes';
import {
  DEFAULT_CASH_TABLE_SETTINGS,
  buyInRangeFor,
  normalizeCashTableSettings,
  parseCashTableSettingsPatch,
  seatDocId,
  validateBuyIn,
  validateRebuy,
} from './cashTableRules';

function fakeBook(balances: Record<string, number>) {
  const wallets = new Map(Object.entries(balances).map(([uid, available]) => [uid, { available, locked: 0 }]));
  const ledger = new Map<string, CashLedgerEntry>();
  const seats = new Map<string, CashSeatDoc>();
  const parties: CashPartieDoc[] = [];
  const failNext = { kinds: [] as string[] };

  const deps: CashTableDeps = {
    applyMovement: async (input: CashMovementInput) => {
      if (failNext.kinds[0] === input.kind) {
        failNext.kinds.shift();
        throw new Error('panne simulée');
      }
      const existing = ledger.get(input.ref);
      const wallet = wallets.get(input.uid) ?? { available: 0, locked: 0 };
      if (existing) {
        return { applied: false, entry: existing, wallet: { uid: input.uid, ...wallet, createdAt: 0, updatedAt: 0 } };
      }
      const after = computeMovement(wallet, input);
      wallets.set(input.uid, after);
      const entry = { ...input, availableBefore: 0, availableAfter: after.available, lockedBefore: 0, lockedAfter: after.locked, createdAt: 0 } as CashLedgerEntry;
      ledger.set(input.ref, entry);
      return { applied: true, entry, wallet: { uid: input.uid, ...after, createdAt: 0, updatedAt: 0 } };
    },
    openSeat: async (doc) => {
      seats.set(doc.id, doc);
    },
    addSeatBuyIn: async (id, amount) => {
      const seat = seats.get(id);
      if (seat) seat.buyInTotal += amount;
    },
    closeSeat: async (id, patch) => {
      const seat = seats.get(id);
      if (seat) Object.assign(seat, patch, { status: 'CLOSED', closedAt: 1 });
    },
    getSeat: async (id) => seats.get(id) ?? null,
    recordPartie: async (doc) => {
      parties.push(doc);
    },
    sumTableLocked: async (uid, tableId) =>
      [...ledger.values()].filter((e) => e.uid === uid && e.meta?.tableId === tableId).reduce((t, e) => t + e.lockedDelta, 0),
  };
  return { book: new CashTableBook(deps), wallets, ledger, seats, parties, failNext };
}

const buyIn = (book: CashTableBook, uid: string, amount: number) => book.buyIn({ tableId: 'ct1', uid, amount, betLevel: 5, roomCode: 'ABCD' });

describe('Tables Cash — réglages', () => {
  it('reste fermé par défaut et au moindre doute', () => {
    assert.equal(DEFAULT_CASH_TABLE_SETTINGS.enabled, false);
    assert.equal(normalizeCashTableSettings(undefined).enabled, false);
    assert.equal(normalizeCashTableSettings({ enabled: 'true' }).enabled, false);
  });

  it('retombe sur des valeurs saines si le stockage est incohérent', () => {
    const s = normalizeCashTableSettings({ betLevels: 'x', minBuyInMultiple: 60, maxBuyInMultiple: 10, rakePercent: 90 });
    assert.deepEqual(s.betLevels, [5, 10, 25]);
    assert.ok(s.maxBuyInMultiple >= s.minBuyInMultiple);
    assert.equal(s.rakePercent, 5);
  });

  it('refuse un réglage Katika incohérent', () => {
    const current = DEFAULT_CASH_TABLE_SETTINGS;
    assert.equal(parseCashTableSettingsPatch({ rakePercent: 21 }, current).ok, false);
    assert.equal(parseCashTableSettingsPatch({ betLevels: [] }, current).ok, false);
    assert.equal(parseCashTableSettingsPatch({ betLevels: [2.5] }, current).ok, false);
    assert.equal(parseCashTableSettingsPatch({ maxBuyInMultiple: 5 }, current).ok, false);
    assert.equal(parseCashTableSettingsPatch({}, current).ok, false);
  });

  it('trie et dédoublonne les niveaux', () => {
    assert.deepEqual(parseCashTableSettingsPatch({ betLevels: [25, 5, 5] }, DEFAULT_CASH_TABLE_SETTINGS).patch?.betLevels, [5, 25]);
  });
});

describe('Tables Cash — entrée et recave', () => {
  const range = buyInRangeFor(5, DEFAULT_CASH_TABLE_SETTINGS);

  it('encadre l’entrée entre 10 et 50 fois la mise', () => {
    assert.deepEqual(range, { min: 50, max: 250 });
    assert.equal(validateBuyIn(50, range), null);
    assert.equal(validateBuyIn(250, range), null);
    assert.ok(validateBuyIn(49, range));
    assert.ok(validateBuyIn(251, range));
    assert.ok(validateBuyIn(50.5, range));
    assert.ok(validateBuyIn('50', range));
  });

  it('ne laisse pas la recave dépasser le maximum ni rester sous la mise', () => {
    const base = { capital: 3, bet: 5, maxBuyInMultiple: 50 };
    assert.equal(validateRebuy({ ...base, amount: 2 }), null);
    assert.equal(validateRebuy({ ...base, amount: 247 }), null);
    assert.ok(validateRebuy({ ...base, amount: 1 }));
    assert.ok(validateRebuy({ ...base, amount: 248 }));
    assert.ok(validateRebuy({ ...base, amount: -1 }));
  });
});

describe('Tables Cash — livre de compte', () => {
  it('une partie déplace l’argent et la commission est ce qui manque à la somme', async () => {
    const { book, wallets, seats } = fakeBook({ a: 100, b: 100 });
    await buyIn(book, 'a', 50);
    await buyIn(book, 'b', 50);
    assert.deepEqual(wallets.get('a'), { available: 50, locked: 50 });
    assert.equal(seats.get(seatDocId('ct1', 'a'))?.buyInTotal, 50);

    // Pot de 10, commission floor(10 x 5 %) = 0 ; pot de 40 : commission 2. b perd 20, a gagne 18.
    await book.settle({ tableId: 'ct1', uid: 'a', target: 68, tag: 'm1p1' });
    await book.settle({ tableId: 'ct1', uid: 'b', target: 30, tag: 'm1p1' });
    assert.equal(wallets.get('a')?.locked, 68);
    assert.equal(wallets.get('b')?.locked, 30);

    await book.cashOut({ tableId: 'ct1', uid: 'a', target: 68 });
    await book.cashOut({ tableId: 'ct1', uid: 'b', target: 30 });
    assert.deepEqual(wallets.get('a'), { available: 118, locked: 0 });
    assert.deepEqual(wallets.get('b'), { available: 80, locked: 0 });
    assert.equal(200 - (118 + 80), 2);
    assert.equal(seats.get(seatDocId('ct1', 'a'))?.status, 'CLOSED');
    assert.equal(seats.get(seatDocId('ct1', 'a'))?.paidOut, 68);
  });

  it('refuse une entrée sans solde et ne laisse aucun siège ouvert', async () => {
    const { book, wallets, seats } = fakeBook({ a: 10 });
    await assert.rejects(() => buyIn(book, 'a', 50));
    assert.deepEqual(wallets.get('a'), { available: 10, locked: 0 });
    assert.equal(seats.get(seatDocId('ct1', 'a'))?.status, 'CLOSED');
  });

  it('un résultat rejoué n’écrit rien de plus', async () => {
    const { book, wallets, ledger } = fakeBook({ a: 100 });
    await buyIn(book, 'a', 50);
    await book.settle({ tableId: 'ct1', uid: 'a', target: 40, tag: 'm1p1' });
    const lines = ledger.size;
    await book.settle({ tableId: 'ct1', uid: 'a', target: 40, tag: 'm1p1' });
    assert.equal(ledger.size, lines);
    assert.equal(wallets.get('a')?.locked, 40);
  });

  it('une écriture échouée repart avec la suivante, sans argent perdu', async () => {
    const { book, wallets, failNext } = fakeBook({ a: 100 });
    await buyIn(book, 'a', 50);
    failNext.kinds.push('TABLE_SETTLEMENT');
    assert.equal(await book.settle({ tableId: 'ct1', uid: 'a', target: 60, tag: 'm1p1' }), false);
    assert.equal(wallets.get('a')?.locked, 50);
    assert.equal(await book.settle({ tableId: 'ct1', uid: 'a', target: 70, tag: 'm1p2' }), true);
    assert.equal(wallets.get('a')?.locked, 70);
  });

  it('une sortie échouée laisse le siège ouvert pour Katika', async () => {
    const { book, wallets, seats, failNext } = fakeBook({ a: 100 });
    await buyIn(book, 'a', 50);
    failNext.kinds.push('TABLE_CASHOUT');
    assert.equal(await book.cashOut({ tableId: 'ct1', uid: 'a', target: 50 }), false);
    assert.equal(seats.get(seatDocId('ct1', 'a'))?.status, 'OPEN');
    assert.equal(wallets.get('a')?.locked, 50);
  });

  it('garde l’ordre : le résultat est écrit avant la sortie, même lancés sans attendre', async () => {
    const { book, wallets } = fakeBook({ a: 100 });
    await buyIn(book, 'a', 50);
    void book.settle({ tableId: 'ct1', uid: 'a', target: 80, tag: 'm1p1' });
    void book.cashOut({ tableId: 'ct1', uid: 'a', target: 80 });
    await book.flush('ct1');
    assert.deepEqual(wallets.get('a'), { available: 130, locked: 0 });
  });

  it('la recave s’ajoute au capital connu du registre', async () => {
    const { book, wallets } = fakeBook({ a: 100 });
    await buyIn(book, 'a', 50);
    await book.settle({ tableId: 'ct1', uid: 'a', target: 3, tag: 'm1p1' });
    await buyIn(book, 'a', 20);
    assert.deepEqual(wallets.get('a'), { available: 30, locked: 23 });
    await book.settle({ tableId: 'ct1', uid: 'a', target: 23, tag: 'm1p2' });
    await book.cashOut({ tableId: 'ct1', uid: 'a', target: 23 });
    assert.deepEqual(wallets.get('a'), { available: 53, locked: 0 });
  });

  it('une sortie à zéro ferme le siège sans mouvement', async () => {
    const { book, wallets, seats } = fakeBook({ a: 100 });
    await buyIn(book, 'a', 50);
    assert.equal(await book.cashOut({ tableId: 'ct1', uid: 'a', target: 0 }), true);
    assert.deepEqual(wallets.get('a'), { available: 50, locked: 0 });
    assert.equal(seats.get(seatDocId('ct1', 'a'))?.status, 'CLOSED');
  });

  it('après une panne, Katika rend ce que dit le registre, une seule fois', async () => {
    const first = fakeBook({ a: 100 });
    await buyIn(first.book, 'a', 50);
    await first.book.settle({ tableId: 'ct1', uid: 'a', target: 35, tag: 'm1p1' });

    assert.equal(await first.book.adminRefund({ tableId: 'ct1', uid: 'a', actor: 'admin@test' }), 35);
    assert.deepEqual(first.wallets.get('a'), { available: 85, locked: 0 });
    assert.equal(first.seats.get(seatDocId('ct1', 'a'))?.closedBy, 'admin@test');
    assert.equal(await first.book.adminRefund({ tableId: 'ct1', uid: 'a', actor: 'admin@test' }), 0);
    assert.deepEqual(first.wallets.get('a'), { available: 85, locked: 0 });
  });
});
