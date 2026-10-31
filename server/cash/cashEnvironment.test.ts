import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CASH_LEDGER_COLLECTION,
  CASH_LEDGER_LIVE_COLLECTION,
  CASH_WALLETS_COLLECTION,
  CASH_WALLETS_LIVE_COLLECTION,
  ledgerCollectionFor,
  walletCollectionFor,
} from './cashTypes';

describe('Kora Cash — séparation démo / réel', () => {
  it('la démo garde les collections d\'origine, par défaut aussi', () => {
    assert.equal(walletCollectionFor('DEMO'), CASH_WALLETS_COLLECTION);
    assert.equal(ledgerCollectionFor('DEMO'), CASH_LEDGER_COLLECTION);
    assert.equal(walletCollectionFor(), CASH_WALLETS_COLLECTION);
    assert.equal(ledgerCollectionFor(), CASH_LEDGER_COLLECTION);
  });

  it('l\'argent réel vit dans des collections distinctes de la démo', () => {
    assert.equal(walletCollectionFor('LIVE'), CASH_WALLETS_LIVE_COLLECTION);
    assert.equal(ledgerCollectionFor('LIVE'), CASH_LEDGER_LIVE_COLLECTION);
    assert.notEqual(CASH_WALLETS_LIVE_COLLECTION, CASH_WALLETS_COLLECTION);
    assert.notEqual(CASH_LEDGER_LIVE_COLLECTION, CASH_LEDGER_COLLECTION);
  });
});
