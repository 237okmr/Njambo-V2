/**
 * Finances Kora Cash : frais annoncés, recettes et marge, rapprochement entre l'argent réel et ce qui est dû.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FINANCE_SETTINGS,
  EMPTY_FINANCE_COUNTERS,
  addCounters,
  computeDepositQuote,
  computeReconciliation,
  lastDateKeys,
  normalizeFinanceSettings,
  parseCampayBalance,
  parseFinanceSettingsPatch,
  parseManualBalance,
  summarize,
  toCounters,
  dateKeyToNoonMs,
  parseDashboardDays,
  parseOperatorWithdrawal,
} from './financeRules';
import { DEFAULT_WITHDRAWAL_SETTINGS, computeWithdrawalQuote, dateKeyFor } from './withdrawalRules';

const settings = DEFAULT_FINANCE_SETTINGS;

describe('Finances — frais', () => {
  it('annonce un dépôt à 2 %, arrondi au franc supérieur', () => {
    assert.deepEqual(computeDepositQuote(25, 2), { fee: 1, credited: 24 });
    assert.deepEqual(computeDepositQuote(10, 2), { fee: 1, credited: 9 });
    assert.deepEqual(computeDepositQuote(100, 2), { fee: 2, credited: 98 });
    assert.deepEqual(computeDepositQuote(101, 2), { fee: 3, credited: 98 });
    assert.deepEqual(computeDepositQuote(25, 0), { fee: 0, credited: 25 });
  });

  it('le retrait démarre à 1,5 %, arrondi au franc supérieur', () => {
    assert.equal(DEFAULT_WITHDRAWAL_SETTINGS.feePercent, 1.5);
    assert.deepEqual(computeWithdrawalQuote(25, 1.5), { fee: 1, net: 24 });
    assert.deepEqual(computeWithdrawalQuote(1000, 1.5), { fee: 15, net: 985 });
  });

  it('valide les réglages et retombe sur les défauts au moindre doute', () => {
    assert.equal(parseFinanceSettingsPatch({ depositFeePercent: 0 }).ok, true);
    assert.equal(parseFinanceSettingsPatch({ depositFeePercent: 21 }).ok, false);
    assert.equal(parseFinanceSettingsPatch({ gapAlertFcfa: -1 }).ok, false);
    assert.equal(parseFinanceSettingsPatch({}).ok, false);
    assert.equal(normalizeFinanceSettings({ depositFeePercent: 'x' }).depositFeePercent, 2);
    assert.equal(normalizeFinanceSettings({ depositFeePercent: 0 }).depositFeePercent, 0);
  });
});

describe('Finances — recettes et marge', () => {
  it('additionne commission et frais, moins ce que garde Campay', () => {
    const summary = summarize({ depositsGross: 1000, depositFees: 20, withdrawalsNet: 400, withdrawalFees: 6, rake: 50, operatorWithdrawals: 0 }, settings);
    assert.equal(summary.campayFees, 26);
    assert.equal(summary.margin, 50);
  });

  it('une valeur absente ou illisible vaut zéro', () => {
    assert.deepEqual(toCounters(undefined), EMPTY_FINANCE_COUNTERS);
    assert.equal(toCounters({ rake: 'x', depositFees: 3 }).depositFees, 3);
    assert.equal(toCounters({ rake: 'x' }).rake, 0);
    assert.equal(addCounters({ ...EMPTY_FINANCE_COUNTERS, rake: 1 }, { ...EMPTY_FINANCE_COUNTERS, rake: 2 }).rake, 3);
  });

  it('compte les jours à l’heure de Douala, aujourd’hui compris', () => {
    const lateEvening = Date.UTC(2026, 10, 2, 23, 30);
    assert.deepEqual(lastDateKeys(lateEvening, 2, dateKeyFor), ['2026-11-03', '2026-11-02']);
  });
});

describe('Finances — rapprochement', () => {
  const counters = { depositsGross: 1000, depositFees: 20, withdrawalsNet: 400, withdrawalFees: 6, rake: 50, operatorWithdrawals: 0 };
  // Entrées 1000, sorties 400, Campay garde 20 + 6 : il reste 574 chez Campay. Dû aux joueurs : 524. Marge attendue : 50.

  it('ne signale rien quand les comptes tombent juste', () => {
    const r = computeReconciliation({ campayBalance: 574, owed: 524, counters, baseline: null, settings });
    assert.equal(r.realMargin, 50);
    assert.equal(r.expectedMargin, 50);
    assert.equal(r.gap, 0);
    assert.equal(r.alert, false);
  });

  it('signale l’argent manquant comme l’argent en trop, à partir du seuil', () => {
    assert.equal(computeReconciliation({ campayBalance: 524, owed: 524, counters, baseline: null, settings }).alert, true);
    assert.equal(computeReconciliation({ campayBalance: 524, owed: 524, counters, baseline: null, settings }).gap, -50);
    assert.equal(computeReconciliation({ campayBalance: 624, owed: 524, counters, baseline: null, settings }).alert, true);
    assert.equal(computeReconciliation({ campayBalance: 570, owed: 524, counters, baseline: null, settings }).alert, false);
    assert.equal(computeReconciliation({ campayBalance: 573, owed: 524, counters, baseline: null, settings: { ...settings, gapAlertFcfa: 0 } }).alert, true);
    assert.equal(computeReconciliation({ campayBalance: 574, owed: 524, counters, baseline: null, settings: { ...settings, gapAlertFcfa: 0 } }).alert, false);
  });

  it('depuis un point de départ, seul ce qui a changé compte', () => {
    const baseline = { realMargin: -30, counters };
    const same = computeReconciliation({ campayBalance: 494, owed: 524, counters, baseline, settings });
    assert.equal(same.expectedMargin, -30);
    assert.equal(same.gap, 0);
    const later = { ...counters, rake: 60 };
    const after = computeReconciliation({ campayBalance: 494, owed: 514, counters: later, baseline, settings });
    assert.equal(after.expectedMargin, -20);
    assert.equal(after.gap, 0);
  });

  it('ne prend jamais une réponse illisible pour un solde à zéro', () => {
    assert.equal(parseCampayBalance({ total_balance: 574.5 }), 574.5);
    assert.equal(parseCampayBalance({ total_balance: '574' }), 574);
    assert.equal(parseCampayBalance({ total_balance: 0 }), 0);
    assert.equal(parseCampayBalance({}), null);
    assert.equal(parseCampayBalance({ total_balance: null }), null);
    assert.equal(parseCampayBalance({ total_balance: 'erreur' }), null);
    assert.equal(parseCampayBalance(null), null);
    assert.equal(parseManualBalance(10), 10);
    assert.equal(parseManualBalance(-1), null);
    assert.equal(parseManualBalance('10'), null);
  });
});


describe('Finances — retraits de l\'exploitant', () => {
  const dateKeyFor = (ms: number) => new Date(ms + 3_600_000).toISOString().slice(0, 10);
  const now = Date.parse('2026-11-19T10:00:00+01:00');

  it('retire ce que l\'exploitant a sorti de la marge restante, sans changer la marge', () => {
    const summary = summarize({ ...EMPTY_FINANCE_COUNTERS, rake: 100, operatorWithdrawals: 30 }, settings);
    assert.equal(summary.margin, 100);
    assert.equal(summary.kept, 70);
  });

  it('attend un solde Campay plus bas après un retrait de l\'exploitant : pas de fausse alerte', () => {
    const counters = { depositsGross: 1000, depositFees: 20, withdrawalsNet: 400, withdrawalFees: 6, rake: 50, operatorWithdrawals: 30 };
    const r = computeReconciliation({ campayBalance: 544, owed: 524, counters, baseline: null, settings });
    assert.equal(r.expectedMargin, 20);
    assert.equal(r.gap, 0);
    assert.equal(r.alert, false);
  });

  it('accepte un montant entier positif, daté aujourd\'hui par défaut', () => {
    const r = parseOperatorWithdrawal({ amount: 5000, note: ' loyer ' }, now, dateKeyFor);
    assert.equal(r.ok, true);
    assert.deepEqual(r.value, { amount: 5000, dateKey: '2026-11-19', note: 'loyer' });
  });

  it('refuse montant nul, négatif, décimal ou énorme', () => {
    [0, -5, 12.5, 2_000_000_000, '100', undefined].forEach((amount) => assert.equal(parseOperatorWithdrawal({ amount }, now, dateKeyFor).ok, false));
  });

  it('refuse une date future, mal formée ou vieille de plus d\'un an', () => {
    assert.equal(parseOperatorWithdrawal({ amount: 10, dateKey: '2026-11-20' }, now, dateKeyFor).ok, false);
    assert.equal(parseOperatorWithdrawal({ amount: 10, dateKey: '19/11/2026' }, now, dateKeyFor).ok, false);
    assert.equal(parseOperatorWithdrawal({ amount: 10, dateKey: '2026-02-30' }, now, dateKeyFor).ok, false);
    assert.equal(parseOperatorWithdrawal({ amount: 10, dateKey: '2025-01-01' }, now, dateKeyFor).ok, false);
    assert.equal(parseOperatorWithdrawal({ amount: 10, dateKey: '2026-11-10' }, now, dateKeyFor).ok, true);
  });

  it('range un retrait ancien dans la bonne case journalière', () => {
    const noon = dateKeyToNoonMs('2026-11-10');
    assert.notEqual(noon, null);
    assert.equal(dateKeyFor(noon as number), '2026-11-10');
  });

  it('ne retient que 7, 30 ou 90 jours, 30 par défaut', () => {
    assert.equal(parseDashboardDays('7'), 7);
    assert.equal(parseDashboardDays('90'), 90);
    assert.equal(parseDashboardDays('15'), 30);
    assert.equal(parseDashboardDays(undefined), 30);
  });
});
