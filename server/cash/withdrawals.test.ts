/**
 * Tests du retrait avec de fausses dépendances (aucun réseau, aucune base de données).
 * L'accent est mis sur ce qui protège l'argent : jamais deux envois, jamais deux remboursements, jamais de remboursement dans le doute.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { CashLedgerError } from './cashTypes';
import { PHONE_ALREADY_CLAIMED_ERROR, addPhoneEntry, markPhoneVerified, maskPhone } from './phoneBookRules';
import {
  DEFAULT_WITHDRAWAL_SETTINGS,
  WithdrawalDoc,
  WithdrawalStatus,
  canTransitionWithdrawal,
  computeWithdrawalQuote,
  countsTowardDailyTotal,
  dateKeyFor,
  decideWithdrawalFromReading,
  normalizeWithdrawalSettings,
  parseWithdrawalAmount,
  parseWithdrawalSettingsPatch,
  shouldAutoApprove,
} from './withdrawalRules';
import {
  WithdrawSendResult,
  WithdrawalDeps,
  WithdrawalMovement,
  WithdrawalRead,
  approveWithdrawal,
  cancelMyWithdrawal,
  handleWithdrawalWebhook,
  recheckWithdrawal,
  rejectWithdrawal,
  requestWithdrawal,
  resolveWithdrawal,
  verifyMyWithdrawal,
} from './withdrawals';

const NOW = 1_800_000_000_000;
const UID = 'joueur-1';
const PHONE = '237677123412';
const REF = '7c1e2f4a-9b3d-4c55-8a10-0f6d2e1b9a77';
const KEY = 'cle-de-webhook-de-test';
const ID = `wd_${'a'.repeat(24)}`;

function sign(payload: Record<string, unknown>, key = KEY): string {
  const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const h = enc({ alg: 'HS256', typ: 'JWT' });
  const p = enc(payload);
  return `${h}.${p}.${createHmac('sha256', key).update(`${h}.${p}`).digest('base64url')}`;
}

interface HarnessOptions {
  settings?: Partial<typeof DEFAULT_WITHDRAWAL_SETTINGS>;
  send?: WithdrawSendResult | (() => Promise<WithdrawSendResult>);
  read?: WithdrawalRead;
  available?: number;
  verified?: boolean;
  dayTotal?: number;
  holdError?: Error;
}

function harness(opts: HarnessOptions = {}) {
  const docs = new Map<string, WithdrawalDoc>();
  const slots = new Map<string, string>();
  const ledger = new Map<string, WithdrawalMovement>();
  const state = { available: opts.available ?? 25, sends: 0 };
  const gate: { current: { blockedMessage: string | null; reviewReasons: string[] } } = { current: { blockedMessage: null, reviewReasons: [] } };
  const deps: WithdrawalDeps = {
    async getSettings() {
      return { ...DEFAULT_WITHDRAWAL_SETTINGS, enabled: true, ...opts.settings };
    },
    async getProtectionGate() {
      return gate.current;
    },
    async isVerifiedPhone() {
      return opts.verified ?? true;
    },
    async createWithdrawal(doc) {
      docs.set(doc.id, { ...doc });
    },
    async getWithdrawal(id) {
      const d = docs.get(id);
      return d ? { ...d } : null;
    },
    async transition(id, from, to, patch = {}) {
      const d = docs.get(id);
      if (!d || !from.includes(d.status) || !canTransitionWithdrawal(d.status, to)) return null;
      const next = { ...d, ...patch, status: to };
      docs.set(id, next);
      return { ...next };
    },
    async acquireSlot(uid, id) {
      if (slots.has(uid)) return false;
      slots.set(uid, id);
      return true;
    },
    async releaseSlot(uid, id) {
      if (slots.get(uid) === id) slots.delete(uid);
    },
    async sumDaily() {
      return opts.dayTotal ?? 0;
    },
    async applyMovement(m) {
      if (m.kind === 'WITHDRAWAL_HOLD' && opts.holdError) throw opts.holdError;
      if (ledger.has(m.ref)) return;
      if (state.available + m.availableDelta < 0) {
        throw new CashLedgerError('INSUFFICIENT_AVAILABLE', 'Solde disponible insuffisant.');
      }
      ledger.set(m.ref, m);
      state.available += m.availableDelta;
    },
    async hasHold(id) {
      return ledger.has(`withdrawal:${id}`);
    },
    async sendToCampay() {
      state.sends++;
      const r = opts.send ?? { kind: 'ACCEPTED', reference: REF };
      return typeof r === 'function' ? r() : r;
    },
    async readTransaction() {
      return opts.read ?? { kind: 'OK', reading: { status: 'PENDING', reference: REF } };
    },
    async getWebhookKey() {
      return KEY;
    },
    newId: () => ID,
    nowMs: () => NOW,
  };
  return { deps, docs, slots, ledger, state, gate };
}

const request = (deps: WithdrawalDeps, amount: unknown = 20) => requestWithdrawal(deps, { uid: UID, amount, phone: PHONE });
const success = (amount = 20): WithdrawalRead => ({ kind: 'OK', reading: { status: 'SUCCESSFUL', amount: String(amount), reference: REF, externalReference: ID } });
const failed: WithdrawalRead = { kind: 'OK', reading: { status: 'FAILED', amount: '20', reference: REF, externalReference: ID, reason: 'Solde insuffisant' } };

describe('Retrait — contrôles de la demande', () => {
  it('refuse tout quand le retrait est coupé, sans toucher au solde', async () => {
    const h = harness({ settings: { enabled: false } });
    const r = await request(h.deps);
    assert.equal(r.success, false);
    assert.equal(r.httpStatus, 403);
    assert.equal(h.state.available, 25);
    assert.equal(h.docs.size, 0);
  });

  it('refuse un montant invalide et un numéro non vérifié', async () => {
    assert.equal((await request(harness().deps, 5)).success, false);
    assert.equal((await request(harness().deps, 26)).success, false);
    assert.equal((await request(harness().deps, 12.5)).success, false);
    const h = harness({ verified: false });
    const r = await request(h.deps);
    assert.equal(r.success, false);
    assert.match(r.message!, /pas encore vérifié/);
    assert.equal(h.state.sends, 0);
  });

  it('refuse un solde insuffisant sans laisser de place prise ni d\'envoi', async () => {
    const h = harness({ available: 10 });
    const r = await request(h.deps, 20);
    assert.equal(r.success, false);
    assert.equal(h.state.sends, 0);
    assert.equal(h.state.available, 10);
    assert.equal(h.slots.size, 0);
    assert.equal(h.docs.get(ID)?.status, 'FAILED');
  });

  it('refuse une seconde demande tant que la première est en cours', async () => {
    const h = harness();
    assert.equal((await request(h.deps)).success, true);
    const second = await request(h.deps);
    assert.equal(second.httpStatus, 409);
    assert.equal(h.state.sends, 1);
  });

  it('une mise de côté incertaine va en vérification, sans envoi', async () => {
    const h = harness({ holdError: new Error('coupure') });
    const r = await request(h.deps);
    assert.equal(r.withdrawal?.status, 'REVIEW');
    assert.equal(h.state.sends, 0);
  });
});

describe('Retrait — validation', () => {
  it('sous le seuil et le total du jour : envoi automatique, argent déjà mis de côté', async () => {
    const h = harness();
    const r = await request(h.deps);
    assert.equal(r.withdrawal?.status, 'PROCESSING');
    assert.equal(h.state.sends, 1);
    assert.equal(h.state.available, 5);
  });

  it('au-dessus du seuil : attend une validation, argent de côté, aucun envoi', async () => {
    const h = harness({ settings: { autoThresholdFcfa: 10 } });
    const r = await request(h.deps);
    assert.equal(r.withdrawal?.status, 'AWAITING_APPROVAL');
    assert.equal(h.state.sends, 0);
    assert.equal(h.state.available, 5);
  });

  it('au-delà du total du jour : attend une validation même sous le seuil', async () => {
    const h = harness({ dayTotal: 19_990 });
    const r = await request(h.deps);
    assert.equal(r.withdrawal?.status, 'AWAITING_APPROVAL');
  });

  it('le frais réduit l\'envoi, pas la somme retirée du solde', async () => {
    let sent = 0;
    const h = harness({ settings: { feePercent: 10 } });
    const send = h.deps.sendToCampay;
    h.deps.sendToCampay = async (p) => {
      sent = p.amount;
      return send(p);
    };
    await request(h.deps, 20);
    assert.equal(sent, 18);
    assert.equal(h.state.available, 5);
  });

  it('valider puis revalider ne déclenche qu\'un seul envoi', async () => {
    const h = harness({ settings: { autoThresholdFcfa: 10 } });
    await request(h.deps);
    const [a, b] = await Promise.all([approveWithdrawal(h.deps, { id: ID, actor: 'admin' }), approveWithdrawal(h.deps, { id: ID, actor: 'admin' })]);
    assert.equal(h.state.sends, 1);
    assert.deepEqual([a.success, b.success].sort(), [false, true]);
  });

  it('refuser rembourse une seule fois et libère la place', async () => {
    const h = harness({ settings: { autoThresholdFcfa: 10 } });
    await request(h.deps);
    const r = await rejectWithdrawal(h.deps, { id: ID, actor: 'admin' });
    assert.equal(r.withdrawal?.status, 'FAILED');
    assert.equal(h.state.available, 25);
    assert.equal((await rejectWithdrawal(h.deps, { id: ID, actor: 'admin' })).success, false);
    assert.equal(h.state.available, 25);
    assert.equal(h.slots.size, 0);
  });
});

describe('Retrait — annulation par le joueur', () => {
  it('rend l\'argent tant que la demande attend, puis plus rien', async () => {
    const h = harness({ settings: { autoThresholdFcfa: 10 } });
    await request(h.deps);
    const r = await cancelMyWithdrawal(h.deps, { uid: UID, id: ID });
    assert.equal(r.withdrawal?.status, 'CANCELLED');
    assert.equal(h.state.available, 25);
    assert.equal((await cancelMyWithdrawal(h.deps, { uid: UID, id: ID })).success, false);
    assert.equal(h.state.available, 25);
  });

  it('refuse l\'annulation une fois l\'envoi commencé', async () => {
    const h = harness();
    await request(h.deps);
    assert.equal((await cancelMyWithdrawal(h.deps, { uid: UID, id: ID })).httpStatus, 409);
    assert.equal(h.state.available, 5);
  });

  it('un autre joueur ne peut ni annuler ni relire', async () => {
    const h = harness({ settings: { autoThresholdFcfa: 10 } });
    await request(h.deps);
    assert.equal((await cancelMyWithdrawal(h.deps, { uid: 'autre', id: ID })).httpStatus, 404);
    assert.equal((await verifyMyWithdrawal(h.deps, { uid: 'autre', id: ID })).httpStatus, 404);
    assert.equal(h.state.available, 5);
  });
});

describe('Retrait — gel et signaux', () => {
  const FROZEN = 'Les retraits sont suspendus pour le moment.';

  it('un gel refuse la demande sans toucher au solde', async () => {
    const h = harness();
    h.gate.current = { blockedMessage: FROZEN, reviewReasons: [] };
    const r = await request(h.deps);
    assert.equal(r.success, false);
    assert.equal(r.httpStatus, 403);
    assert.equal(r.message, FROZEN);
    assert.equal(h.state.available, 25);
    assert.equal(h.state.sends, 0);
    assert.equal(h.docs.size, 0);
  });

  it('un signal envoie à la validation même sous le seuil, sans dévoiler la raison au joueur', async () => {
    const h = harness();
    h.gate.current = { blockedMessage: null, reviewReasons: ['DEPOSIT_NO_PLAY'] };
    const r = await request(h.deps);
    assert.equal(r.success, true);
    assert.equal(r.withdrawal?.status, 'AWAITING_APPROVAL');
    assert.equal(h.state.sends, 0);
    assert.equal(h.state.available, 5);
    assert.deepEqual(h.docs.get(ID)?.reviewReasons, ['DEPOSIT_NO_PLAY']);
    assert.equal(JSON.stringify(r).includes('DEPOSIT_NO_PLAY'), false);
  });

  it('sans signal, le retrait part seul comme avant', async () => {
    const h = harness();
    const r = await request(h.deps);
    assert.equal(r.success, true);
    assert.equal(h.state.sends, 1);
    assert.equal(h.docs.get(ID)?.reviewReasons, undefined);
  });

  it('un gel posé après la demande bloque la validation, et le refus reste possible', async () => {
    const h = harness();
    h.gate.current = { blockedMessage: null, reviewReasons: ['ABNORMAL_GAIN'] };
    await request(h.deps);
    h.gate.current = { blockedMessage: FROZEN, reviewReasons: [] };
    const blocked = await approveWithdrawal(h.deps, { id: ID, actor: 'admin' });
    assert.equal(blocked.success, false);
    assert.match(blocked.message!, /gel/);
    assert.equal(h.state.sends, 0);
    h.gate.current = { blockedMessage: null, reviewReasons: [] };
    assert.equal((await approveWithdrawal(h.deps, { id: ID, actor: 'admin' })).success, true);
    assert.equal(h.state.sends, 1);
  });
});

describe('Retrait — résultat de Campay', () => {
  it('refus net : remboursé, sans nouvel envoi', async () => {
    const h = harness({ send: { kind: 'REJECTED', message: 'Refusé' } });
    const r = await request(h.deps);
    assert.equal(r.withdrawal?.status, 'FAILED');
    assert.equal(h.state.available, 25);
    assert.equal(h.state.sends, 1);
  });

  it('issue incertaine : argent gardé de côté, ni remboursement ni nouvel envoi', async () => {
    const h = harness({ send: { kind: 'UNKNOWN', message: 'Aucune réponse' } });
    const r = await request(h.deps);
    assert.equal(r.withdrawal?.status, 'REVIEW');
    assert.equal(h.state.available, 5);
    await verifyMyWithdrawal(h.deps, { uid: UID, id: ID });
    assert.equal(h.state.available, 5);
    assert.equal(h.state.sends, 1);
    assert.equal((await request(h.deps)).httpStatus, 409);
  });

  it('une panne pendant l\'appel compte comme une issue incertaine', async () => {
    const h = harness({
      send: async () => {
        throw new Error('coupure');
      },
    });
    const r = await request(h.deps);
    assert.equal(r.withdrawal?.status, 'REVIEW');
    assert.equal(h.state.available, 5);
  });

  it('succès confirmé : clôturé sans remboursement, place libérée', async () => {
    const h = harness({ read: success() });
    await request(h.deps);
    const r = await verifyMyWithdrawal(h.deps, { uid: UID, id: ID });
    assert.equal(r.withdrawal?.status, 'SUCCESS');
    assert.equal(h.state.available, 5);
    assert.equal(h.slots.size, 0);
  });

  it('échec confirmé : remboursé une seule fois malgré plusieurs relectures', async () => {
    const h = harness({ read: failed });
    await request(h.deps);
    await verifyMyWithdrawal(h.deps, { uid: UID, id: ID });
    await verifyMyWithdrawal(h.deps, { uid: UID, id: ID });
    await recheckWithdrawal(h.deps, { id: ID });
    assert.equal(h.state.available, 25);
    assert.equal(h.docs.get(ID)?.status, 'FAILED');
  });

  it('montant différent chez Campay : vérification, jamais de succès', async () => {
    const h = harness({ read: success(25) });
    await request(h.deps);
    const r = await verifyMyWithdrawal(h.deps, { uid: UID, id: ID });
    assert.equal(r.withdrawal?.status, 'REVIEW');
    assert.equal(h.state.available, 5);
  });

  it('Campay injoignable à la relecture : rien ne change', async () => {
    const h = harness({ read: { kind: 'UNAVAILABLE', message: 'x' } });
    await request(h.deps);
    const r = await verifyMyWithdrawal(h.deps, { uid: UID, id: ID });
    assert.equal(r.withdrawal?.status, 'PROCESSING');
    assert.equal(h.state.available, 5);
  });
});

describe('Retrait — décision humaine', () => {
  it('confirmer l\'envoi clôture sans rembourser', async () => {
    const h = harness({ send: { kind: 'UNKNOWN', message: 'x' } });
    await request(h.deps);
    const r = await resolveWithdrawal(h.deps, { id: ID, outcome: 'SENT', actor: 'admin' });
    assert.equal(r.withdrawal?.status, 'SUCCESS');
    assert.equal(r.withdrawal && h.docs.get(ID)?.decidedBy, 'admin');
    assert.equal(h.state.available, 5);
  });

  it('rembourser rend l\'argent une seule fois', async () => {
    const h = harness({ send: { kind: 'UNKNOWN', message: 'x' } });
    await request(h.deps);
    await resolveWithdrawal(h.deps, { id: ID, outcome: 'REFUND', actor: 'admin' });
    assert.equal(h.state.available, 25);
    assert.equal((await resolveWithdrawal(h.deps, { id: ID, outcome: 'REFUND', actor: 'admin' })).httpStatus, 409);
    assert.equal(h.state.available, 25);
  });

  it('une mise de côté jamais appliquée ne donne lieu à aucun remboursement', async () => {
    const h = harness({ holdError: new Error('coupure') });
    await request(h.deps);
    await resolveWithdrawal(h.deps, { id: ID, outcome: 'REFUND', actor: 'admin' });
    assert.equal(h.state.available, 25);
    assert.equal(h.ledger.size, 0);
  });

  it('reprend un remboursement interrompu sans rembourser deux fois', async () => {
    const h = harness({ settings: { autoThresholdFcfa: 10 } });
    await request(h.deps);
    h.docs.set(ID, { ...h.docs.get(ID)!, status: 'REFUNDING' as WithdrawalStatus, refundFinal: 'CANCELLED' });
    await resolveWithdrawal(h.deps, { id: ID, outcome: 'REFUND', actor: 'admin' });
    assert.equal(h.docs.get(ID)?.status, 'CANCELLED');
    assert.equal(h.state.available, 25);
  });

  it('refuse une décision inconnue', async () => {
    const h = harness({ send: { kind: 'UNKNOWN', message: 'x' } });
    await request(h.deps);
    assert.equal((await resolveWithdrawal(h.deps, { id: ID, outcome: 'PEUT-ETRE', actor: 'admin' })).httpStatus, 400);
  });
});

describe('Retrait — notification de Campay', () => {
  const body = (signature: string, reference = REF) => ({ reference, external_reference: ID, signature });

  it('refuse une signature fausse sans rien changer', async () => {
    const h = harness({ read: success() });
    await request(h.deps);
    const r = await handleWithdrawalWebhook(h.deps, { query: {}, body: body(sign({ reference: REF }, 'mauvaise-cle')) });
    assert.equal(r.httpStatus, 401);
    assert.equal(h.docs.get(ID)?.status, 'PROCESSING');
  });

  it('ne se fie qu\'à la relecture : un signal valide avec un statut encore en attente ne clôt rien', async () => {
    const h = harness();
    await request(h.deps);
    const r = await handleWithdrawalWebhook(h.deps, { query: {}, body: { ...body(sign({ reference: REF })), status: 'SUCCESSFUL' } });
    assert.equal(r.success, true);
    assert.equal(h.docs.get(ID)?.status, 'PROCESSING');
  });

  it('clôt le retrait quand la relecture confirme, et résout un cas incertain', async () => {
    const h = harness({ send: { kind: 'UNKNOWN', message: 'x' }, read: success() });
    await request(h.deps);
    assert.equal(h.docs.get(ID)?.status, 'REVIEW');
    await handleWithdrawalWebhook(h.deps, { query: {}, body: body(sign({ reference: REF })) });
    assert.equal(h.docs.get(ID)?.status, 'SUCCESS');
    assert.equal(h.state.available, 5);
  });

  it('refuse une référence différente de celle du retrait', async () => {
    const h = harness({ read: success() });
    await request(h.deps);
    const other = 'autre-reference-1234';
    const r = await handleWithdrawalWebhook(h.deps, { query: {}, body: body(sign({ reference: other }), other) });
    assert.equal(r.httpStatus, 400);
    assert.equal(h.docs.get(ID)?.status, 'PROCESSING');
  });
});

describe('Retrait — règles pures', () => {
  it('montants de démo : 10 à 25 FCFA, entiers', () => {
    assert.equal(parseWithdrawalAmount(10).ok, true);
    assert.equal(parseWithdrawalAmount(25).ok, true);
    assert.equal(parseWithdrawalAmount(9).ok, false);
    assert.equal(parseWithdrawalAmount(26).ok, false);
    assert.equal(parseWithdrawalAmount('20').ok, false);
  });

  it('frais : arrondis à l\'entier supérieur et sans erreur de virgule', () => {
    assert.deepEqual(computeWithdrawalQuote(1000, 0), { fee: 0, net: 1000 });
    assert.deepEqual(computeWithdrawalQuote(1000, 2), { fee: 20, net: 980 });
    assert.deepEqual(computeWithdrawalQuote(1001, 2), { fee: 21, net: 980 });
    assert.deepEqual(computeWithdrawalQuote(1000, 1.5), { fee: 15, net: 985 });
  });

  it('validation automatique : seuil et total du jour, bornes incluses', () => {
    const s = { autoThresholdFcfa: 5000, dailyAutoFcfa: 20000 };
    assert.equal(shouldAutoApprove(5000, 15000, s), true);
    assert.equal(shouldAutoApprove(5001, 0, s), false);
    assert.equal(shouldAutoApprove(5000, 15001, s), false);
  });

  it('le jour suit l\'heure de Douala', () => {
    assert.equal(dateKeyFor(Date.UTC(2026, 10, 2, 22, 59)), '2026-11-02');
    assert.equal(dateKeyFor(Date.UTC(2026, 10, 2, 23, 0)), '2026-11-03');
  });

  it('total du jour : les demandes annulées ou échouées ne comptent pas', () => {
    assert.equal(countsTowardDailyTotal('SUCCESS'), true);
    assert.equal(countsTowardDailyTotal('REVIEW'), true);
    assert.equal(countsTowardDailyTotal('FAILED'), false);
    assert.equal(countsTowardDailyTotal('CANCELLED'), false);
  });

  it('un retrait clôturé ne change plus jamais d\'état', () => {
    for (const final of ['SUCCESS', 'FAILED', 'CANCELLED'] as WithdrawalStatus[]) {
      assert.equal(canTransitionWithdrawal(final, 'REFUNDING'), false);
      assert.equal(canTransitionWithdrawal(final, 'SENDING'), false);
    }
    assert.equal(canTransitionWithdrawal('REVIEW', 'SENDING'), false);
    assert.equal(canTransitionWithdrawal('PROCESSING', 'SENDING'), false);
  });

  it('décision : autre référence externe = vérification', () => {
    const d = decideWithdrawalFromReading({ id: ID, net: 20 }, { status: 'SUCCESSFUL', amount: '20', externalReference: 'autre' });
    assert.equal(d.decision, 'REVIEW');
  });

  it('réglages : coupé par défaut, valeurs par défaut demandées, bornes strictes', () => {
    const def = normalizeWithdrawalSettings(undefined);
    assert.equal(def.enabled, false);
    assert.equal(def.autoThresholdFcfa, 5000);
    assert.equal(def.dailyAutoFcfa, 20000);
    assert.equal(def.maxPhones, 3);
    assert.equal(def.feePercent, 0);
    assert.equal(normalizeWithdrawalSettings({ enabled: 'oui', feePercent: 99 }).feePercent, 0);
    assert.equal(parseWithdrawalSettingsPatch({ autoThresholdFcfa: 2000 }).ok, true);
    assert.equal(parseWithdrawalSettingsPatch({ autoThresholdFcfa: -1 }).ok, false);
    assert.equal(parseWithdrawalSettingsPatch({ feePercent: 21 }).ok, false);
    assert.equal(parseWithdrawalSettingsPatch({ maxPhones: 1.5 }).ok, false);
    assert.equal(parseWithdrawalSettingsPatch({ updatedBy: 'x' }).ok, false);
    assert.equal(parseWithdrawalSettingsPatch({}).ok, false);
  });
});

describe('Carnet de numéros', () => {
  it('limite le nombre de numéros et refuse les doublons', () => {
    const one = addPhoneEntry([], PHONE, 2, NOW);
    assert.equal(one.ok, true);
    assert.equal(one.entries![0].verified, false);
    assert.equal(addPhoneEntry(one.entries!, PHONE, 2, NOW).ok, false);
    const two = addPhoneEntry(one.entries!, '237699000011', 2, NOW);
    assert.equal(two.ok, true);
    assert.equal(addPhoneEntry(two.entries!, '237655000022', 2, NOW).ok, false);
  });

  it('un dépôt réussi vérifie le numéro, et l\'ajoute s\'il reste de la place', () => {
    const added = markPhoneVerified([], PHONE, 'MTN', 3, NOW);
    assert.equal(added?.[0].verified, true);
    assert.equal(added?.[0].operator, 'MTN');
    const existing = markPhoneVerified([{ phone: PHONE, verified: false, addedAt: 1 }], PHONE, undefined, 3, NOW);
    assert.equal(existing?.[0].verified, true);
    assert.equal(existing?.[0].addedAt, 1);
    assert.equal(markPhoneVerified([{ phone: '237699000011', verified: true, addedAt: 1 }], PHONE, undefined, 1, NOW), null);
  });

  it('masque le numéro dans les listes', () => {
    assert.equal(maskPhone(PHONE), '6 77 .. .. 12');
    assert.equal(maskPhone('abc'), '…');
    assert.ok(PHONE_ALREADY_CLAIMED_ERROR.length > 0);
  });
});
