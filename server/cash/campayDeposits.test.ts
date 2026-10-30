/**
 * Tests du service de dépôt Campay avec de fausses dépendances (aucun réseau, aucune base de données).
 * L'accent est mis sur ce qui protège l'argent : jamais de crédit dans le doute, jamais deux crédits.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  CampayDeps,
  CollectResult,
  TransactionRead,
  handleCampayWebhook,
  startCampayDeposit,
  verifyMyDeposit,
} from './campayDeposits';
import { DepositDoc, newDepositId } from './depositRules';

const KEY = 'cle-de-webhook-de-test';
const NOW = 1_800_000_000_000;
const REF = '7c1e2f4a-9b3d-4c55-8a10-0f6d2e1b9a77';

function sign(payload: Record<string, unknown>, key = KEY): string {
  const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const h = enc({ alg: 'HS256', typ: 'JWT' });
  const p = enc(payload);
  return `${h}.${p}.${createHmac('sha256', key).update(`${h}.${p}`).digest('base64url')}`;
}

interface Harness {
  deps: CampayDeps;
  deposits: Map<string, DepositDoc>;
  calls: { collect: number; read: number; confirm: number; failed: number };
}

function harness(opts: { collect?: CollectResult; read?: TransactionRead; webhookKey?: string | null } = {}): Harness {
  const deposits = new Map<string, DepositDoc>();
  const calls = { collect: 0, read: 0, confirm: 0, failed: 0 };
  const deps: CampayDeps = {
    async createDeposit(uid, amount, mode) {
      const d: DepositDoc = { id: newDepositId(), uid, amount, mode, status: 'PENDING', createdAt: NOW, updatedAt: NOW };
      deposits.set(d.id, d);
      return d;
    },
    async getDeposit(id) {
      return deposits.get(id) ?? null;
    },
    async attachCampayReference(id, campayReference) {
      const d = deposits.get(id)!;
      if (d.status === 'PENDING' && !d.campayReference) d.campayReference = campayReference;
      return d;
    },
    async markDepositFailed(id, reason) {
      calls.failed++;
      const d = deposits.get(id)!;
      if (d.status === 'PENDING') {
        d.status = 'FAILED';
        d.failReason = reason;
      }
      return d;
    },
    async confirmDeposit(id, providerRef) {
      calls.confirm++;
      const d = deposits.get(id)!;
      const first = d.status !== 'SUCCESS';
      d.status = 'SUCCESS';
      if (providerRef) d.providerRef = providerRef;
      return { deposit: d, credited: first, wallet: { uid: d.uid, available: d.amount, locked: 0, createdAt: NOW, updatedAt: NOW } };
    },
    async startCollect() {
      calls.collect++;
      return opts.collect ?? { kind: 'ACCEPTED', reference: REF };
    },
    async readTransaction() {
      calls.read++;
      return opts.read ?? { kind: 'OK', reading: { status: 'PENDING' } };
    },
    async getWebhookKey() {
      return opts.webhookKey === undefined ? KEY : opts.webhookKey;
    },
    nowMs: () => NOW,
  };
  return { deps, deposits, calls };
}

function pendingDeposit(h: Harness, over: Partial<DepositDoc> = {}): DepositDoc {
  const d: DepositDoc = {
    id: newDepositId(),
    uid: 'joueur-1',
    amount: 1000,
    mode: 'CAMPAY',
    status: 'PENDING',
    createdAt: NOW,
    updatedAt: NOW,
    campayReference: REF,
    ...over,
  };
  h.deposits.set(d.id, d);
  return d;
}

const successReading = (id: string, extra: Record<string, unknown> = {}): TransactionRead => ({
  kind: 'OK',
  reading: { status: 'SUCCESSFUL', amount: '1000.00', reference: REF, externalReference: id, ...extra },
});

describe('Campay — démarrer un dépôt', () => {
  it('refuse un montant ou un numéro invalide sans créer de dépôt', async () => {
    const h = harness();
    const a = await startCampayDeposit(h.deps, { uid: 'joueur-1', amount: 50, phone: '677123456' });
    assert.equal(a.httpStatus, 400);
    const b = await startCampayDeposit(h.deps, { uid: 'joueur-1', amount: 1000, phone: '12345' });
    assert.equal(b.httpStatus, 400);
    assert.equal(h.deposits.size, 0);
    assert.equal(h.calls.collect, 0);
  });

  it('crée un dépôt en attente et enregistre la référence Campay', async () => {
    const h = harness();
    const r = await startCampayDeposit(h.deps, { uid: 'joueur-1', amount: 1000, phone: '+237 677 12 34 56' });
    assert.equal(r.httpStatus, 200);
    assert.equal(r.state, 'PENDING');
    const d = h.deposits.get(r.depositId!)!;
    assert.equal(d.mode, 'CAMPAY');
    assert.equal(d.status, 'PENDING');
    assert.equal(d.campayReference, REF);
    assert.equal(h.calls.confirm, 0);
  });

  it('marque le dépôt en échec si Campay refuse nettement la demande', async () => {
    const h = harness({ collect: { kind: 'REJECTED', message: 'Numéro refusé par l\'opérateur.' } });
    const r = await startCampayDeposit(h.deps, { uid: 'joueur-1', amount: 1000, phone: '677123456' });
    assert.equal(r.success, false);
    assert.equal(r.state, 'FAILED');
    assert.equal(h.deposits.get(r.depositId!)!.status, 'FAILED');
  });

  it('laisse le dépôt en attente si l\'issue est incertaine (jamais d\'échec dans le doute)', async () => {
    const h = harness({ collect: { kind: 'UNKNOWN', message: 'délai dépassé' } });
    const r = await startCampayDeposit(h.deps, { uid: 'joueur-1', amount: 1000, phone: '677123456' });
    assert.equal(r.success, true);
    assert.equal(r.state, 'PENDING');
    assert.equal(h.deposits.get(r.depositId!)!.status, 'PENDING');
    assert.equal(h.calls.failed, 0);
  });
});

describe('Campay — notification (webhook)', () => {
  it('ignore la notification si la clé webhook n\'est pas configurée', async () => {
    const h = harness({ webhookKey: null });
    const d = pendingDeposit(h);
    const r = await handleCampayWebhook(h.deps, { query: { reference: REF, external_reference: d.id, signature: sign({ reference: REF }) }, body: undefined });
    assert.equal(r.httpStatus, 503);
    assert.equal(h.calls.confirm, 0);
  });

  it('refuse une signature fausse ou absente sans rien lire ni créditer', async () => {
    const h = harness({ read: successReading('x') });
    const d = pendingDeposit(h);
    const bad = await handleCampayWebhook(h.deps, { query: { reference: REF, external_reference: d.id, signature: sign({ reference: REF }, 'autre-cle') }, body: undefined });
    assert.equal(bad.httpStatus, 401);
    const none = await handleCampayWebhook(h.deps, { query: { reference: REF, external_reference: d.id }, body: undefined });
    assert.equal(none.httpStatus, 401);
    assert.equal(h.calls.read, 0);
    assert.equal(h.calls.confirm, 0);
  });

  it('crédite une seule fois un paiement réussi, même si la notification est rejouée', async () => {
    const h = harness();
    const d = pendingDeposit(h);
    h.deps.readTransaction = async () => {
      h.calls.read++;
      return successReading(d.id);
    };
    const query = { reference: REF, external_reference: d.id, signature: sign({ reference: REF, exp: NOW / 1000 + 600 }) };
    const first = await handleCampayWebhook(h.deps, { query, body: undefined });
    const second = await handleCampayWebhook(h.deps, { query, body: undefined });
    assert.equal(first.httpStatus, 200);
    assert.equal(first.state, 'SUCCESS');
    assert.equal(second.state, 'SUCCESS');
    assert.equal(h.calls.confirm, 1);
    assert.equal(h.deposits.get(d.id)!.status, 'SUCCESS');
  });

  it('ne crédite pas si Campay dit encore en attente, ne répond pas, ou si le montant diffère', async () => {
    for (const read of [
      { kind: 'OK', reading: { status: 'PENDING', amount: '1000', reference: REF } } as TransactionRead,
      { kind: 'UNAVAILABLE', message: 'panne' } as TransactionRead,
      { kind: 'OK', reading: { status: 'SUCCESSFUL', amount: '10', reference: REF } } as TransactionRead,
      { kind: 'OK', reading: { status: 'SUCCESSFUL', reference: REF } } as TransactionRead,
    ]) {
      const h = harness({ read });
      const d = pendingDeposit(h);
      const r = await handleCampayWebhook(h.deps, { query: { reference: REF, external_reference: d.id, signature: sign({ reference: REF }) }, body: undefined });
      assert.equal(r.state, 'PENDING');
      assert.equal(h.calls.confirm, 0);
      assert.equal(h.deposits.get(d.id)!.status, 'PENDING');
    }
  });

  it('ne crédite pas une relecture qui parle d\'un autre dépôt', async () => {
    const h = harness({ read: successReading(newDepositId()) });
    const d = pendingDeposit(h);
    const r = await handleCampayWebhook(h.deps, { query: { reference: REF, external_reference: d.id, signature: sign({ reference: REF }) }, body: undefined });
    assert.equal(r.state, 'PENDING');
    assert.equal(h.calls.confirm, 0);
  });

  it('ne crédite pas si rien ne rattache la relecture au dépôt (pas de référence enregistrée, pas d\'identifiant rappelé)', async () => {
    const h = harness({ read: { kind: 'OK', reading: { status: 'SUCCESSFUL', amount: '1000', reference: REF } } });
    const d = pendingDeposit(h, { campayReference: undefined });
    const r = await handleCampayWebhook(h.deps, { query: { reference: REF, external_reference: d.id, signature: sign({ reference: REF }) }, body: undefined });
    assert.equal(r.state, 'PENDING');
    assert.equal(h.calls.confirm, 0);
  });

  it('crédite si la référence n\'était pas enregistrée mais que Campay rappelle l\'identifiant du dépôt', async () => {
    const h = harness();
    const d = pendingDeposit(h, { campayReference: undefined });
    h.deps.readTransaction = async () => successReading(d.id);
    const r = await handleCampayWebhook(h.deps, { query: { reference: REF, external_reference: d.id, signature: sign({ reference: REF }) }, body: undefined });
    assert.equal(r.state, 'SUCCESS');
    assert.equal(h.calls.confirm, 1);
  });

  it('refuse une notification dont la référence diffère de celle du dépôt, et un dépôt inconnu ou non Campay', async () => {
    const h = harness({ read: successReading('x') });
    const d = pendingDeposit(h, { campayReference: 'une-autre-reference-1234' });
    const sig = sign({ reference: REF });
    const mismatch = await handleCampayWebhook(h.deps, { query: { reference: REF, external_reference: d.id, signature: sig }, body: undefined });
    assert.equal(mismatch.httpStatus, 400);
    const unknown = await handleCampayWebhook(h.deps, { query: { reference: REF, external_reference: newDepositId(), signature: sig }, body: undefined });
    assert.equal(unknown.httpStatus, 404);
    const simulated = pendingDeposit(h, { mode: 'SIMULATED', campayReference: undefined });
    const wrongMode = await handleCampayWebhook(h.deps, { query: { reference: REF, external_reference: simulated.id, signature: sig }, body: undefined });
    assert.equal(wrongMode.httpStatus, 400);
    assert.equal(h.calls.read, 0);
    assert.equal(h.calls.confirm, 0);
  });

  it('marque le dépôt en échec quand Campay annonce un échec rattaché au dépôt', async () => {
    const h = harness({ read: { kind: 'OK', reading: { status: 'FAILED', amount: '1000', reference: REF } } });
    const d = pendingDeposit(h);
    const r = await handleCampayWebhook(h.deps, { query: { reference: REF, external_reference: d.id, signature: sign({ reference: REF }) }, body: undefined });
    assert.equal(r.state, 'FAILED');
    assert.equal(h.deposits.get(d.id)!.status, 'FAILED');
    assert.equal(h.calls.confirm, 0);
  });
});

describe('Campay — « Vérifier mon paiement »', () => {
  it('ne montre un dépôt qu\'à son propriétaire', async () => {
    const h = harness({ read: successReading('x') });
    const d = pendingDeposit(h);
    const other = await verifyMyDeposit(h.deps, { uid: 'joueur-2', depositId: d.id });
    assert.equal(other.httpStatus, 404);
    const bad = await verifyMyDeposit(h.deps, { uid: 'joueur-1', depositId: 'n-importe-quoi' });
    assert.equal(bad.httpStatus, 400);
    assert.equal(h.calls.read, 0);
  });

  it('crédite le joueur quand Campay confirme, et reste en attente sans référence', async () => {
    const h = harness();
    const d = pendingDeposit(h);
    h.deps.readTransaction = async () => successReading(d.id);
    const ok = await verifyMyDeposit(h.deps, { uid: 'joueur-1', depositId: d.id });
    assert.equal(ok.state, 'SUCCESS');
    assert.equal(ok.wallet?.available, 1000);
    assert.equal(h.calls.confirm, 1);

    const h2 = harness();
    const d2 = pendingDeposit(h2, { campayReference: undefined });
    const wait = await verifyMyDeposit(h2.deps, { uid: 'joueur-1', depositId: d2.id });
    assert.equal(wait.state, 'PENDING');
    assert.equal(h2.calls.read, 0);
  });

  it('ne recrédite pas un dépôt déjà confirmé', async () => {
    const h = harness();
    const d = pendingDeposit(h, { status: 'SUCCESS' });
    const r = await verifyMyDeposit(h.deps, { uid: 'joueur-1', depositId: d.id });
    assert.equal(r.state, 'SUCCESS');
    assert.equal(h.calls.read, 0);
    assert.equal(h.calls.confirm, 0);
  });
});
