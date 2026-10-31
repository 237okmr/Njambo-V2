import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDashboardDataService,
  toDashboardPart,
  toPlainJson,
  type DashboardDataDeps,
  type DashboardPart,
} from './dashboardData';

function harness(opts: { cacheMs?: number; failWith?: unknown } = {}) {
  const state = { now: 5_000_000, reads: 0, failWith: opts.failWith, parts: [] as DashboardPart[] };
  const deps: DashboardDataDeps = {
    now: () => state.now,
    cacheMs: () => opts.cacheMs ?? 120_000,
    readPart: async (part) => {
      state.reads += 1;
      state.parts.push(part);
      if (state.failWith) throw state.failWith;
      return [{ id: `${part}-${state.reads}` }];
    },
  };
  return { state, service: createDashboardDataService(deps) };
}

describe('Indicateurs katika — format des données', () => {
  it('accepte seulement users et records', () => {
    assert.equal(toDashboardPart('users'), 'users');
    assert.equal(toDashboardPart('records'), 'records');
    assert.equal(toDashboardPart('secrets'), null);
    assert.equal(toDashboardPart(undefined), null);
  });

  it('convertit les dates Firestore en millisecondes, y compris dans les listes et objets imbriqués', () => {
    const ts = { toMillis: () => 1234 };
    const out = toPlainJson({ a: ts, b: [ts, 'x', 3], c: { d: ts, e: null }, f: 'texte' });
    assert.deepEqual(out, { a: 1234, b: [1234, 'x', 3], c: { d: 1234, e: null }, f: 'texte' });
  });
});

describe('Indicateurs katika — cache serveur', () => {
  it('relit une seule fois par ensemble tant que le cache est valide', async () => {
    const h = harness();
    const a = await h.service.get('users');
    const b = await h.service.get('users');
    await h.service.get('records');
    assert.equal(h.state.reads, 2);
    assert.equal(a.ok && a.fromCache, false);
    assert.equal(b.ok && b.fromCache, true);
    h.state.now += 120_001;
    await h.service.get('users');
    assert.equal(h.state.reads, 3);
  });

  it('une durée de 0 désactive le cache', async () => {
    const h = harness({ cacheMs: 0 });
    await h.service.get('users');
    await h.service.get('users');
    assert.equal(h.state.reads, 2);
  });

  it('deux demandes simultanées partagent une seule lecture', async () => {
    const h = harness();
    await Promise.all([h.service.get('records'), h.service.get('records')]);
    assert.equal(h.state.reads, 1);
  });

  it('quota atteint sans ancien résultat : erreur claire QUOTA', async () => {
    const h = harness({ failWith: { code: 8, message: 'Quota exceeded' } });
    const r = await h.service.get('users');
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, 'QUOTA');
      assert.match(r.message, /quota gratuit/);
    }
  });

  it('autre panne sans ancien résultat : READ_FAILED', async () => {
    const h = harness({ failWith: new Error('connexion perdue') });
    const r = await h.service.get('records');
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, 'READ_FAILED');
  });

  it('panne avec un ancien résultat : on le renvoie marqué ancien', async () => {
    const h = harness({ cacheMs: 1000 });
    await h.service.get('users');
    h.state.now += 5000;
    h.state.failWith = { code: 8, message: 'Quota exceeded' };
    const r = await h.service.get('users');
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.stale, true);
      assert.equal(r.fetchedAt, 5_000_000);
      assert.deepEqual(r.docs, [{ id: 'users-1' }]);
    }
  });
});
