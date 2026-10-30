import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  activityWindowFor,
  createActivityDataService,
  isQuotaError,
  toActivityBucket,
  type ActivityDataDeps,
  type ActivityRawData,
} from './activityData';

function rawData(tag: string): ActivityRawData {
  return { journal: [{ id: tag }], fiches: [], presenceDays: [] };
}

function harness(opts: { cacheMs?: number; failWith?: unknown } = {}) {
  const state = { now: 1_000_000, reads: 0, failWith: opts.failWith, windows: [] as Array<{ cutoffMs: number }> };
  const deps: ActivityDataDeps = {
    now: () => state.now,
    cacheMs: () => opts.cacheMs ?? 300_000,
    readAll: async (window) => {
      state.reads += 1;
      state.windows.push({ cutoffMs: window.cutoffMs });
      if (state.failWith) throw state.failWith;
      return rawData(`lecture-${state.reads}`);
    },
  };
  return { state, service: createActivityDataService(deps) };
}

describe('Activité katika — périodes et erreurs', () => {
  it('regroupe Aujourd\'hui et 24 heures, refuse les périodes inconnues', () => {
    assert.equal(toActivityBucket('TODAY'), '24H');
    assert.equal(toActivityBucket('24H'), '24H');
    assert.equal(toActivityBucket('7D'), '7D');
    assert.equal(toActivityBucket('ALL'), 'ALL');
    assert.equal(toActivityBucket('1Y'), null);
    assert.equal(toActivityBucket(undefined), null);
  });

  it('calcule le début de la période : 24 h, 7 jours ou depuis toujours', () => {
    const now = Date.UTC(2026, 9, 30, 12, 0, 0);
    assert.equal(activityWindowFor('24H', now).cutoffMs, now - 86_400_000);
    assert.equal(activityWindowFor('7D', now).cutoffMs, now - 7 * 86_400_000);
    const all = activityWindowFor('ALL', now);
    assert.equal(all.cutoffMs, 0);
    assert.equal(all.startKey, '0000-00-00');
    assert.match(all.endKey, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('reconnaît le refus de quota de Firestore', () => {
    assert.equal(isQuotaError({ code: 8, message: 'x' }), true);
    assert.equal(isQuotaError(new Error("Quota exceeded for quota metric 'Free daily read units per project'")), true);
    assert.equal(isQuotaError(new Error('RESOURCE_EXHAUSTED: boom')), true);
    assert.equal(isQuotaError(new Error('connexion perdue')), false);
    assert.equal(isQuotaError(null), false);
  });
});

describe('Activité katika — cache serveur', () => {
  it('relit une seule fois tant que le cache est valide, puis relit', async () => {
    const h = harness({ cacheMs: 300_000 });
    const a = await h.service.get('7D');
    const b = await h.service.get('7D');
    assert.equal(h.state.reads, 1);
    assert.equal(a.ok && a.fromCache, false);
    assert.equal(b.ok && b.fromCache, true);
    h.state.now += 299_999;
    await h.service.get('7D');
    assert.equal(h.state.reads, 1);
    h.state.now += 2;
    const c = await h.service.get('7D');
    assert.equal(h.state.reads, 2);
    assert.equal(c.ok && c.fromCache, false);
  });

  it('une durée de 0 désactive le cache', async () => {
    const h = harness({ cacheMs: 0 });
    await h.service.get('7D');
    await h.service.get('7D');
    assert.equal(h.state.reads, 2);
  });

  it('chaque période a son propre cache', async () => {
    const h = harness();
    await h.service.get('7D');
    await h.service.get('24H');
    await h.service.get('7D');
    assert.equal(h.state.reads, 2);
  });

  it('deux demandes simultanées partagent une seule lecture', async () => {
    const h = harness();
    const [a, b] = await Promise.all([h.service.get('ALL'), h.service.get('ALL')]);
    assert.equal(h.state.reads, 1);
    assert.equal(a.ok && b.ok, true);
  });

  it('quota atteint sans ancien résultat : erreur claire, rien n\'est mis en cache', async () => {
    const h = harness({ failWith: new Error("Quota exceeded for quota metric 'Free daily read units per project'") });
    const r = await h.service.get('7D');
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, 'QUOTA');
      assert.match(r.message, /quota gratuit/);
    }
    h.state.failWith = undefined;
    const again = await h.service.get('7D');
    assert.equal(again.ok && again.fromCache === false, true);
    assert.equal(h.state.reads, 2);
  });

  it('panne autre que le quota : erreur READ_FAILED', async () => {
    const h = harness({ failWith: new Error('connexion perdue') });
    const r = await h.service.get('24H');
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, 'READ_FAILED');
      assert.match(r.message, /connexion perdue/);
    }
  });

  it('quota atteint avec un ancien résultat : on le renvoie, marqué ancien, avec la raison', async () => {
    const h = harness({ cacheMs: 1000 });
    const first = await h.service.get('7D');
    assert.equal(first.ok, true);
    h.state.now += 5000;
    h.state.failWith = { code: 8, message: 'Quota exceeded' };
    const r = await h.service.get('7D');
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.stale, true);
      assert.equal(r.fromCache, true);
      assert.equal(r.fetchedAt, 1_000_000);
      assert.match(r.staleMessage, /quota gratuit/);
      assert.deepEqual(r.data, rawData('lecture-1'));
    }
  });
});
