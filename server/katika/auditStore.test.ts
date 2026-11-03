import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClientAudit,
  createAuditStore,
  mergeAuditLogs,
  shouldPersistAudit,
  toStorableAudit,
  type AuditLogEntry,
  type AuditStoreDeps,
} from './auditStore';

const NOW = Date.UTC(2026, 10, 3, 12, 0, 0);

const entry = (patch: Partial<AuditLogEntry> = {}): AuditLogEntry => ({
  id: 'a1',
  timestamp: NOW,
  type: 'KATIKA_ACTION',
  severity: 'INFO',
  actor: 'admin@exemple.com',
  summary: 'Action',
  ...patch,
});

function harness(patch: Partial<AuditStoreDeps> = {}) {
  const state = { writes: [] as Array<[string, AuditLogEntry]>, reads: 0 };
  const store = createAuditStore({
    now: () => NOW,
    maxAutomaticPerDay: () => 2,
    loadCount: () => 200,
    readsBlocked: () => false,
    write: async (id, log) => {
      state.writes.push([id, log]);
    },
    readRecent: async () => {
      state.reads += 1;
      return [entry({ id: 'ancien', timestamp: NOW - 1000 })];
    },
    ...patch,
  });
  return { state, store };
}

describe('Journal d\'audit durable', () => {
  it('garde les décisions et les alertes, pas les événements automatiques ordinaires', () => {
    assert.equal(shouldPersistAudit(entry()), true);
    assert.equal(shouldPersistAudit(entry({ actor: 'Auth Manager' })), false);
    assert.equal(shouldPersistAudit(entry({ actor: 'Fair-Play Engine', severity: 'WARNING' })), true);
    assert.equal(shouldPersistAudit(entry({ actor: 'Katika Engine', type: 'CONFIG_CHANGE' })), true);
  });

  it('le plafond quotidien ne touche que les événements automatiques, et il est signalé', async () => {
    const { state, store } = harness();
    for (let i = 0; i < 4; i++) store.persist(entry({ id: `auto${i}`, actor: 'Fair-Play Engine', severity: 'WARNING' }));
    for (let i = 0; i < 4; i++) store.persist(entry({ id: `adm${i}` }));
    assert.equal(state.writes.length, 6);
    const history = await store.getHistory();
    assert.match(history.message, /2 événement\(s\)/);
  });

  it('deux entrées de même identifiant ne s\'écrasent pas en base', () => {
    const { state, store } = harness();
    store.persist(entry());
    store.persist(entry());
    assert.notEqual(state.writes[0][0], state.writes[1][0]);
  });

  it('une écriture ratée ne fait pas échouer l\'action et reste signalée', async () => {
    const { store } = harness({ write: async () => Promise.reject(new Error('panne')) });
    assert.doesNotThrow(() => store.persist(entry()));
    await new Promise((resolve) => setImmediate(resolve));
    assert.match((await store.getHistory()).message, /écriture\(s\) du journal ont échoué/);
  });

  it('relit l\'historique à la première demande seulement', async () => {
    const { state, store } = harness();
    assert.equal(state.reads, 0);
    const first = await store.getHistory();
    await store.getHistory();
    assert.equal(state.reads, 1);
    assert.equal(first.loaded, true);
    assert.equal(first.logs[0].id, 'ancien');
  });

  it('une relecture ratée le dit et sera retentée', async () => {
    let fail = true;
    const { store } = harness({
      readRecent: async () => {
        if (fail) throw new Error('quota');
        return [];
      },
    });
    const failed = await store.getHistory();
    assert.equal(failed.loaded, false);
    assert.match(failed.message, /quota/);
    fail = false;
    assert.equal((await store.getHistory()).loaded, true);
  });

  it('le pare-feu empêche la relecture et le dit', async () => {
    const { state, store } = harness({ readsBlocked: () => true });
    const result = await store.getHistory();
    assert.equal(state.reads, 0);
    assert.equal(result.loaded, false);
    assert.match(result.message, /pare-feu/);
  });

  it('l\'auteur et l\'heure viennent du serveur, jamais du navigateur', () => {
    const log = buildClientAudit(
      { id: 'x1', timestamp: 5, actor: 'autre@exemple.com', type: 'FAUX', severity: 'FAUX', summary: 'Ban' },
      'vrai@exemple.com',
      NOW
    );
    assert.equal(log?.actor, 'vrai@exemple.com');
    assert.equal(log?.timestamp, NOW);
    assert.equal(log?.type, 'KATIKA_ACTION');
    assert.equal(log?.severity, 'INFO');
    assert.equal(buildClientAudit({ summary: '  ' }, 'a', NOW), null);
    assert.equal(buildClientAudit(null, 'a', NOW), null);
  });

  it('prépare une entrée que Firestore accepte', () => {
    const stored = toStorableAudit(entry({ details: { a: undefined, b: 1 } }));
    assert.deepEqual(stored.details, { b: 1 });
    assert.equal('details' in toStorableAudit(entry()), false);
    assert.ok(JSON.stringify(toStorableAudit(entry({ details: { t: 'x'.repeat(9000) } })).details).length < 4100);
  });

  it('réunit mémoire et historique sans doublon, du plus récent au plus ancien', () => {
    const merged = mergeAuditLogs(
      [{ id: 'b', timestamp: 3 }, { id: 'a', timestamp: 2 }],
      [{ id: 'a', timestamp: 2 }, { id: 'c', timestamp: 1 }]
    );
    assert.deepEqual(merged.map((l) => l.id), ['b', 'a', 'c']);
  });
});
