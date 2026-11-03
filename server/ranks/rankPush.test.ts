import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PlannedRankPush, RankPushDeps, RankPushEntry, RankPushPlayer, RankPushSettings, RankPushState, planRankPushes, runRankPushes, seedRankPushState } from './rankPush';

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const settings: RankPushSettings = {
  enabled: true,
  cooldownMs: DAY,
  maxPerCheck: 50,
  nightStartHour: 22,
  nightEndHour: 7,
  titleName: (id) => id,
};

const player = (partial: Partial<RankPushPlayer> = {}): RankPushPlayer => ({ uid: 'ada', titleId: 'CHASSEUR_KORA', legacyTitleId: 'APPRENTI', inactivitySteps: 0, ...partial });
const entry = (partial: Partial<RankPushEntry> = {}): RankPushEntry => ({ notifiedTitleId: 'MAITRE_POSITION', bestTitleId: 'MAITRE_NJAMBO', lastPushAt: NOW - 2 * DAY, ...partial });

describe('annonces de rang : ce qui part', () => {
  it('annonce une perte et distingue dépassé d’inactif', () => {
    const lost = planRankPushes({ ada: entry() }, [player()], settings, NOW);
    assert.equal(lost.sends.length, 1);
    assert.match(lost.sends[0].body, /dépassé/);
    assert.equal(lost.next.ada.notifiedTitleId, 'CHASSEUR_KORA');
    assert.equal(lost.next.ada.lastPushAt, NOW);
    const idle = planRankPushes({ ada: entry() }, [player({ inactivitySteps: 1 })], settings, NOW);
    assert.match(idle.sends[0].body, /Rejoue/);
    assert.doesNotMatch(idle.sends[0].body, /dépassé/);
  });

  it('annonce un nouveau meilleur rang et le retient', () => {
    const result = planRankPushes({ ada: entry() }, [player({ titleId: 'LEGENDE_KORA' })], settings, NOW);
    assert.match(result.sends[0].title, /Nouveau meilleur rang/);
    assert.equal(result.next.ada.bestTitleId, 'LEGENDE_KORA');
  });

  it('une remontée sous le meilleur rang reste silencieuse, sans consommer le délai', () => {
    const before = entry({ notifiedTitleId: 'CONFIRME', lastPushAt: NOW - 1000 });
    const result = planRankPushes({ ada: before }, [player()], settings, NOW);
    assert.equal(result.sends.length, 0);
    assert.equal(result.next.ada.notifiedTitleId, 'CHASSEUR_KORA');
    assert.equal(result.next.ada.lastPushAt, before.lastPushAt);
  });

  it('sans changement, rien', () => {
    const result = planRankPushes({ ada: entry({ notifiedTitleId: 'CHASSEUR_KORA' }) }, [player()], settings, NOW);
    assert.equal(result.sends.length, 0);
  });
});

describe('annonces de rang : ce qui attend', () => {
  it('au plus une par période : la perte reste en attente, puis part', () => {
    const state = { ada: entry({ lastPushAt: NOW - 1000 }) };
    const blocked = planRankPushes(state, [player()], settings, NOW);
    assert.equal(blocked.sends.length, 0);
    assert.equal(blocked.next.ada.notifiedTitleId, 'MAITRE_POSITION');
    assert.equal(planRankPushes(blocked.next, [player()], settings, NOW + DAY).sends.length, 1);
  });

  it('une perte en attente disparaît si le rang revient', () => {
    const state = { ada: entry({ lastPushAt: NOW - 1000 }) };
    const blocked = planRankPushes(state, [player()], settings, NOW);
    assert.equal(planRankPushes(blocked.next, [player({ titleId: 'MAITRE_POSITION' })], settings, NOW + DAY).sends.length, 0);
  });

  it('le plafond par vérification laisse les suivants pour la prochaine', () => {
    const players = ['a', 'b', 'c'].map((uid) => player({ uid }));
    const state: RankPushState = { a: entry(), b: entry(), c: entry() };
    const first = planRankPushes(state, players, { ...settings, maxPerCheck: 2 }, NOW);
    assert.deepEqual(first.sends.map((s) => s.uid), ['a', 'b']);
    assert.equal(first.next.c.notifiedTitleId, 'MAITRE_POSITION');
    assert.deepEqual(planRankPushes(first.next, players, { ...settings, maxPerCheck: 2 }, NOW).sends.map((s) => s.uid), ['c']);
  });

  it('un joueur nouveau dans la liste n’est pas annoncé', () => {
    const result = planRankPushes({}, [player({ legacyTitleId: 'LEGENDE_KORA' })], settings, NOW);
    assert.equal(result.sends.length, 0);
    assert.equal(result.next.ada.bestTitleId, 'LEGENDE_KORA');
  });
});

function fakeDeps(initial: RankPushState | null, outcome: Partial<{ success: number; failed: number; deferred: number }> | 'throw' = { success: 1 }) {
  const store = { state: initial, sent: [] as PlannedRankPush[], overwritten: 0 };
  const deps: RankPushDeps = {
    batchSize: 2,
    overwrite: async (state) => {
      store.state = state;
      store.overwritten++;
    },
    transact: async (update) => {
      const { next, sends } = update(store.state);
      store.state = next;
      return sends;
    },
    restore: async (uid, previous) => {
      store.state = { ...store.state, [uid]: previous };
    },
    send: async (push) => {
      store.sent.push(push);
      if (outcome === 'throw') throw new Error('réseau');
      return { success: 0, failed: 0, deferred: 0, ...outcome };
    },
  };
  return { store, deps };
}

describe('annonces de rang : déroulement', () => {
  it('premier passage : enregistre les rangs sans rien envoyer', async () => {
    const { store, deps } = fakeDeps(null);
    const delivered = await runRankPushes(deps, [player()], settings, NOW);
    assert.deepEqual(delivered, []);
    assert.equal(store.sent.length, 0);
    assert.equal(store.state?.ada.notifiedTitleId, 'CHASSEUR_KORA');
  });

  it('interrupteur fermé : rien ne part, et une ouverture n’annonce rien de vieux', async () => {
    const { store, deps } = fakeDeps({ ada: entry() });
    await runRankPushes(deps, [player()], { ...settings, enabled: false }, NOW);
    assert.equal(store.sent.length, 0);
    assert.equal(store.overwritten, 1);
    await runRankPushes(deps, [player()], settings, NOW + DAY);
    assert.equal(store.sent.length, 0);
  });

  it('envoi réussi : signalé, et non répété', async () => {
    const { store, deps } = fakeDeps({ ada: entry() });
    const delivered = await runRankPushes(deps, [player()], settings, NOW);
    assert.equal(delivered.length, 1);
    await runRankPushes(deps, [player()], settings, NOW + 2 * DAY);
    assert.equal(store.sent.length, 1);
  });

  it('la nuit : l’annonce reste en attente et repart le matin', async () => {
    const { store, deps } = fakeDeps({ ada: entry() }, { deferred: 1 });
    assert.deepEqual(await runRankPushes(deps, [player()], settings, NOW), []);
    assert.equal(store.state?.ada.notifiedTitleId, 'MAITRE_POSITION');
    assert.equal(store.state?.ada.lastPushAt, NOW - 2 * DAY);
  });

  it('panne : l’annonce reste en attente, sans casser les autres', async () => {
    const { store, deps } = fakeDeps({ ada: entry() }, 'throw');
    assert.deepEqual(await runRankPushes(deps, [player()], settings, NOW), []);
    assert.equal(store.state?.ada.notifiedTitleId, 'MAITRE_POSITION');
  });

  it('aucun appareil abonné ou notification coupée : pas de nouvel essai', async () => {
    const { store, deps } = fakeDeps({ ada: entry() }, {});
    await runRankPushes(deps, [player()], settings, NOW);
    assert.equal(store.state?.ada.notifiedTitleId, 'CHASSEUR_KORA');
  });

  it('envoie par petits groupes', async () => {
    const players = ['a', 'b', 'c', 'd', 'e'].map((uid) => player({ uid }));
    const state = Object.fromEntries(players.map((p) => [p.uid, entry()]));
    const { store, deps } = fakeDeps(state);
    assert.equal((await runRankPushes(deps, players, settings, NOW)).length, 5);
    assert.equal(store.sent.length, 5);
  });

  it('seedRankPushState retient l’ancien rang comme meilleur', () => {
    assert.equal(seedRankPushState([player({ legacyTitleId: 'MAITRE_NJAMBO' })]).ada.bestTitleId, 'MAITRE_NJAMBO');
  });
});
