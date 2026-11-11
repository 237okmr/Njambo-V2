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
  formatPhone,
  quoteWithdrawal,
  withdrawalStatusLabel,
  CASH_BALANCE_LABEL,
  depositButtonLabel,
  cashMovementLabel,
  defaultKoraCashTab,
  formatSignedFcfa,
} from './koraCashFormat';

describe('Kora Cash joueur — page', () => {
  const tables = { enabled: true, betLevels: [10, 5, 25], minBuyInMultiple: 10, myTableCode: null };

  it('arrive sur Tables si le joueur peut s’asseoir au plus petit niveau, sinon sur Portefeuille', () => {
    assert.equal(defaultKoraCashTab(tables, 50), 'tables');
    assert.equal(defaultKoraCashTab(tables, 49), 'wallet');
  });

  it('arrive sur Tables si le joueur y a un siège, même sans solde libre', () => {
    assert.equal(defaultKoraCashTab({ ...tables, myTableCode: 'K8T4' }, 0), 'tables');
  });

  it('arrive sur Portefeuille si les tables sont fermées, sans niveau ou illisibles', () => {
    assert.equal(defaultKoraCashTab({ ...tables, enabled: false }, 1000), 'wallet');
    assert.equal(defaultKoraCashTab({ ...tables, betLevels: [] }, 1000), 'wallet');
    assert.equal(defaultKoraCashTab(null, 1000), 'wallet');
  });

  it('le bandeau reste le même avant et après le lancement', () => {
    assert.equal(CASH_BALANCE_LABEL, 'Mon solde');
  });

  it('nomme chaque mouvement et signe les montants', () => {
    assert.equal(cashMovementLabel('DEPOSIT', 25), 'Dépôt');
    assert.equal(cashMovementLabel('TABLE_SETTLEMENT', 10), 'Partie gagnée');
    assert.equal(cashMovementLabel('TABLE_SETTLEMENT', -10), 'Partie perdue');
    assert.equal(cashMovementLabel('INCONNU', 1), 'Mouvement');
    assert.equal(formatSignedFcfa(25), '+25 FCFA');
    assert.equal(formatSignedFcfa(-25), '-25 FCFA');
  });
});

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
    assert.match(demo.banner, /indisponible pour l’instant/);
    assert.equal(demo.closedTitle, 'Dépôt indisponible');
    const live = getDepositUi('LIVE');
    assert.equal(live.canDeposit, false);
    assert.match(live.banner, /ouvre bientôt/);
    assert.equal(live.closedTitle, 'Dépôt bientôt ouvert');
  });

  it('en démo avec Campay : numéro demandé, débit annoncé, aucun mot banni de la charte', () => {
    const ui = getDepositUi('DEMO', 'CAMPAY');
    assert.equal(ui.canDeposit, true);
    assert.equal(ui.needsPhone, true);
    assert.match(ui.banner, /débité de ton compte MTN MoMo ou Orange Money/);
    for (const text of [ui.banner, ui.buttonLabel, getDepositUi('DEMO', 'CAMPAY', true).banner, getDepositUi('DEMO').banner, getDepositUi('LIVE').banner]) {
      assert.doesNotMatch(text, /d[ée]mo|\btest\b|fictif|b[êe]ta|campay/i);
    }
    assert.match(ui.buttonLabel, /Orange Money/);
    assert.equal(depositButtonLabel(ui, undefined), 'Payer par MTN MoMo ou Orange Money');
    assert.equal(depositButtonLabel(ui, 25), 'Payer 25 FCFA par MTN MoMo ou Orange Money');
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
    assert.equal(parseTypedAmount('26', limits).error, 'Le dépôt maximum est de 25 FCFA pour le moment.');
    const simulated = getDepositUi('DEMO');
    assert.equal(simulated.minAmount, MIN_DEPOSIT_FCFA_CLIENT);
    assert.equal(simulated.maxAmount, null);
    assert.deepEqual(simulated.quickAmounts, QUICK_DEPOSIT_AMOUNTS);
    assert.equal(parseTypedAmount('20').ok, false);
  });
});

describe('Kora Cash — retrait : affichage', () => {
  it('annonce le même net que le serveur', () => {
    assert.deepEqual(quoteWithdrawal(1000, 0), { fee: 0, net: 1000 });
    assert.deepEqual(quoteWithdrawal(1001, 2), { fee: 21, net: 980 });
    assert.deepEqual(quoteWithdrawal(1000, 1.5), { fee: 15, net: 985 });
  });

  it('dit clairement où en est une demande', () => {
    assert.equal(withdrawalStatusLabel('AWAITING_APPROVAL'), 'En attente de validation');
    assert.equal(withdrawalStatusLabel('PROCESSING'), 'En cours d’envoi');
    assert.equal(withdrawalStatusLabel('REVIEW'), 'En vérification');
    assert.equal(withdrawalStatusLabel('FAILED'), 'Échoué, argent rendu');
  });

  it('affiche le numéro lisiblement', () => {
    assert.equal(formatPhone('237677123412'), '6 77 12 34 12');
  });

  it('ne promet le retrait dans le bandeau que si le retrait est ouvert', () => {
    assert.match(getDepositUi('DEMO', 'CAMPAY').banner, /ne peut pas encore être retiré/);
    assert.match(getDepositUi('DEMO', 'CAMPAY', true).banner, /Tu peux retirer/);
  });
});
