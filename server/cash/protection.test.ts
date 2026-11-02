/**
 * Protection Kora Cash : limites, pauses et exclusions, gel et signaux du retrait, collusion.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PROTECTION_SETTINGS,
  EMPTY_DAILY_TOTALS,
  PairStats,
  PlayerProtection,
  applyOutcomeToPair,
  changePersonalLimit,
  checkDeposit,
  checkTableEntry,
  effectiveLimit,
  emptyPairStats,
  exclusionEnd,
  liftExclusion,
  newCollusionReasons,
  normalizeProtectionSettings,
  pairIdFor,
  pairOutcomesFromResult,
  parseProtectionSettingsPatch,
  startExclusion,
  withdrawalFreezeMessage,
  withdrawalReviewReasons,
} from './protectionRules';

const settings = DEFAULT_PROTECTION_SETTINGS;
const now = 1_000_000_000_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const player = (extra: Partial<PlayerProtection> = {}): PlayerProtection => ({ uid: 'u1', ...extra });

function applyChange(p: PlayerProtection, kind: 'deposit' | 'loss', value: unknown, at = now) {
  const change = changePersonalLimit(p, kind, value, settings, at);
  assert.equal(change.ok, true);
  return { next: { ...p, ...(change as any).patch } as PlayerProtection, delayed: (change as any).delayed as boolean };
}

describe('Protection — réglages', () => {
  it('démarre à 25 000 FCFA, sans gel', () => {
    assert.equal(settings.depositDailyFcfa, 25000);
    assert.equal(settings.lossDailyFcfa, 25000);
    assert.equal(settings.withdrawalsFrozen, false);
    assert.equal(normalizeProtectionSettings(undefined).lossDailyFcfa, 25000);
  });

  it('accepte de monter comme de baisser le plafond, et refuse une valeur douteuse', () => {
    assert.equal(parseProtectionSettingsPatch({ lossDailyFcfa: 100000 }).patch?.lossDailyFcfa, 100000);
    assert.equal(parseProtectionSettingsPatch({ depositDailyFcfa: 500 }).patch?.depositDailyFcfa, 500);
    assert.equal(parseProtectionSettingsPatch({ depositDailyFcfa: 0 }).ok, false);
    assert.equal(parseProtectionSettingsPatch({ depositDailyFcfa: 2.5 }).ok, false);
    assert.equal(parseProtectionSettingsPatch({}).ok, false);
    assert.equal(normalizeProtectionSettings({ lossDailyFcfa: -4 }).lossDailyFcfa, 25000);
  });

  it('exige un motif pour geler tous les retraits, pas pour dégeler', () => {
    assert.equal(parseProtectionSettingsPatch({ withdrawalsFrozen: true }).ok, false);
    assert.equal(parseProtectionSettingsPatch({ withdrawalsFrozen: true, withdrawalsFrozenNote: '  ' }).ok, false);
    assert.equal(parseProtectionSettingsPatch({ withdrawalsFrozen: true, withdrawalsFrozenNote: 'Écart Campay' }).ok, true);
    assert.equal(parseProtectionSettingsPatch({ withdrawalsFrozen: false }).ok, true);
  });
});

describe('Protection — limites personnelles', () => {
  it('baisser s’applique tout de suite', () => {
    const { next, delayed } = applyChange(player(), 'loss', 5000);
    assert.equal(delayed, false);
    assert.equal(effectiveLimit(next, settings, 'loss', now), 5000);
    assert.equal(effectiveLimit(next, settings, 'deposit', now), 25000);
  });

  it('remonter attend le délai, et la limite basse tient jusque-là', () => {
    const low = applyChange(player(), 'loss', 5000).next;
    const { next, delayed } = applyChange(low, 'loss', 20000, now + HOUR);
    assert.equal(delayed, true);
    assert.equal(effectiveLimit(next, settings, 'loss', now + 2 * HOUR), 5000);
    assert.equal(effectiveLimit(next, settings, 'loss', now + HOUR + 24 * HOUR), 20000);
  });

  it('revenir au plafond commun compte comme une remontée', () => {
    const low = applyChange(player(), 'deposit', 1000).next;
    const { next, delayed } = applyChange(low, 'deposit', null);
    assert.equal(delayed, true);
    assert.equal(effectiveLimit(next, settings, 'deposit', now + HOUR), 1000);
    assert.equal(effectiveLimit(next, settings, 'deposit', now + 25 * HOUR), 25000);
  });

  it('une baisse annule une remontée en attente', () => {
    const low = applyChange(player(), 'loss', 5000).next;
    const raising = applyChange(low, 'loss', 20000).next;
    const { next, delayed } = applyChange(raising, 'loss', 3000);
    assert.equal(delayed, false);
    assert.equal(effectiveLimit(next, settings, 'loss', now + 48 * HOUR), 3000);
  });

  it('une limite personnelle ne dépasse jamais le plafond, même si Katika le baisse ensuite', () => {
    assert.equal(changePersonalLimit(player(), 'loss', 25001, settings, now).ok, false);
    assert.equal(changePersonalLimit(player(), 'loss', 0, settings, now).ok, false);
    assert.equal(changePersonalLimit(player(), 'loss', 10.5, settings, now).ok, false);
    const mine = applyChange(player(), 'loss', 20000).next;
    assert.equal(effectiveLimit(mine, { ...settings, lossDailyFcfa: 8000 }, 'loss', now), 8000);
  });
});

describe('Protection — dépôt et tables', () => {
  const deposit = (daily: number, pending: number, amount: number, p = player()) =>
    checkDeposit({ player: p, daily: { deposits: daily, settlementNet: 0 }, pendingAmount: pending, amount, settings, now });

  it('compte les dépôts du jour et ceux encore en attente', () => {
    assert.equal(deposit(0, 0, 25000), null);
    assert.equal(deposit(24990, 0, 10), null);
    assert.match(deposit(24990, 0, 11) ?? '', /il te reste 10 FCFA/);
    assert.match(deposit(24990, 5, 6) ?? '', /il te reste 5 FCFA/);
    assert.match(deposit(25000, 0, 1) ?? '', /atteint/);
  });

  it('ferme les tables quand la perte du jour atteint la limite, et les gains compensent', () => {
    const entry = (settlementNet: number, p = player()) => checkTableEntry({ player: p, daily: { deposits: 0, settlementNet }, settings, now });
    assert.equal(entry(0), null);
    assert.equal(entry(-24999), null);
    assert.match(entry(-25000) ?? '', /limite de pertes/);
    assert.equal(entry(5000), null);
    assert.match(entry(-5000, applyChange(player(), 'loss', 5000).next) ?? '', /limite de pertes/);
  });
});

describe('Protection — pauses et exclusions', () => {
  const pause = (days: number, p = player(), at = now) => {
    const started = startExclusion(p, { kind: 'PAUSE', days }, at);
    assert.equal(started.ok, true);
    return { ...p, exclusion: (started as any).exclusion } as PlayerProtection;
  };

  it('propose 24 heures, 7 jours ou 30 jours, rien d’autre', () => {
    assert.equal(startExclusion(player(), { kind: 'PAUSE', days: 2 }, now).ok, false);
    assert.equal(startExclusion(player(), { kind: 'AUTRE' }, now).ok, false);
    assert.equal(exclusionEnd(pause(7), now), now + 7 * DAY);
  });

  it('bloque dépôts et tables pendant la pause, et les rouvre à la fin', () => {
    const paused = pause(1);
    const inside = { player: paused, daily: EMPTY_DAILY_TOTALS, settings, now: now + HOUR };
    assert.match(checkTableEntry(inside) ?? '', /pause/);
    assert.match(checkDeposit({ ...inside, pendingAmount: 0, amount: 10 }) ?? '', /pause/);
    assert.equal(checkTableEntry({ ...inside, now: now + DAY + 1 }), null);
  });

  it('une pause s’allonge mais ne se raccourcit pas', () => {
    const long = pause(30);
    assert.equal(startExclusion(long, { kind: 'PAUSE', days: 1 }, now + HOUR).ok, false);
    assert.equal(exclusionEnd(pause(30, pause(7)), now), now + 30 * DAY);
  });

  it('une exclusion définitive n’a pas de fin, sauf levée', () => {
    const started = startExclusion(player(), { kind: 'PERMANENT' }, now);
    const excluded = { ...player(), exclusion: (started as any).exclusion } as PlayerProtection;
    assert.equal(exclusionEnd(excluded, now + 3650 * DAY), Infinity);
  });

  it('une levée exige une note et n’agit qu’après 24 heures, en gardant la trace', () => {
    const started = startExclusion(player(), { kind: 'PERMANENT' }, now);
    const excluded = { ...player(), exclusion: (started as any).exclusion } as PlayerProtection;
    assert.equal(liftExclusion(excluded, { actor: 'admin', note: ' ' }, settings, now).ok, false);
    const lifted = liftExclusion(excluded, { actor: 'admin', note: 'Demande écrite' }, settings, now);
    assert.equal(lifted.ok, true);
    const next = { ...excluded, exclusion: (lifted as any).exclusion } as PlayerProtection;
    assert.equal(next.exclusion?.liftedBy, 'admin');
    assert.equal(next.exclusion?.liftNote, 'Demande écrite');
    assert.equal(exclusionEnd(next, now + 23 * HOUR), now + 24 * HOUR);
    assert.equal(exclusionEnd(next, now + 24 * HOUR), null);
    assert.equal(liftExclusion(next, { actor: 'admin', note: 'x' }, settings, now + 25 * HOUR).ok, false);
  });

  it('une nouvelle pause efface une levée en attente', () => {
    const started = startExclusion(player(), { kind: 'PERMANENT' }, now);
    const excluded = { ...player(), exclusion: (started as any).exclusion } as PlayerProtection;
    const lifted = { ...excluded, exclusion: (liftExclusion(excluded, { actor: 'a', note: 'n' }, settings, now) as any).exclusion } as PlayerProtection;
    assert.equal(exclusionEnd(pause(30, lifted, now + HOUR), now + 2 * DAY), now + HOUR + 30 * DAY);
  });
});

describe('Protection — gel et signaux du retrait', () => {
  it('gèle pour tous ou pour un joueur, sans dévoiler le motif', () => {
    assert.equal(withdrawalFreezeMessage(player(), settings), null);
    const global = withdrawalFreezeMessage(player(), { ...settings, withdrawalsFrozen: true, withdrawalsFrozenNote: 'Enquête secrète' });
    assert.match(global ?? '', /suspendus/);
    assert.doesNotMatch(global ?? '', /Enquête/);
    assert.match(withdrawalFreezeMessage(player({ freeze: { by: 'a', note: 'Enquête', at: now } }), settings) ?? '', /reste sur ton solde/);
  });

  const reasons = (extra: Partial<Parameters<typeof withdrawalReviewReasons>[0]> = {}) =>
    withdrawalReviewReasons({ activity: {}, daily: EMPTY_DAILY_TOTALS, openAlertCount: 0, settings, ...extra });

  it('ne signale rien sans raison', () => {
    assert.deepEqual(reasons(), []);
    assert.deepEqual(reasons({ activity: { lastDepositAt: 10, lastPlayAt: 20 } }), []);
    assert.deepEqual(reasons({ daily: { deposits: 0, settlementNet: 9999 } }), []);
  });

  it('signale un dépôt sans jeu, un gain anormal et un joueur signalé', () => {
    assert.deepEqual(reasons({ activity: { lastDepositAt: 10 } }), ['DEPOSIT_NO_PLAY']);
    assert.deepEqual(reasons({ activity: { lastDepositAt: 30, lastPlayAt: 20 } }), ['DEPOSIT_NO_PLAY']);
    assert.deepEqual(reasons({ daily: { deposits: 0, settlementNet: 10000 } }), ['ABNORMAL_GAIN']);
    assert.deepEqual(reasons({ openAlertCount: 1 }), ['FLAGGED_TABLE']);
  });
});

describe('Protection — collusion', () => {
  const part = (playerId: string, gross: number, net: number) => ({ playerId, isHuman: true, gross, net });

  it('identifie une paire de la même façon dans les deux sens', () => {
    assert.deepEqual(pairIdFor('x', 'y'), pairIdFor('y', 'x'));
    assert.equal(pairIdFor('y', 'x').a, 'x');
  });

  it('lit une partie : qui a pris quoi à qui, pot partagé compris', () => {
    assert.deepEqual(pairOutcomesFromResult({ participants: [part('w', 50, 25), part('l', 0, -25)] }, []), [{ winner: 'w', loser: 'l', amount: 25, forfeit: false }]);
    const shared = pairOutcomesFromResult({ participants: [part('w1', 36, 11), part('w2', 36, 11), part('l', 0, -25)] }, ['l']);
    assert.deepEqual(shared.map((o) => o.amount), [12, 12]);
    assert.equal(shared[0].forfeit, true);
  });

  function play(stats: PairStats, winner: string, loser: string, amount: number, times: number, forfeit = false): PairStats {
    let next = stats;
    for (let i = 0; i < times; i++) next = applyOutcomeToPair(next, { winner, loser, amount, forfeit });
    return next;
  }

  it('ne signale rien sous les seuils', () => {
    const stats = play(play(emptyPairStats('a', 'b'), 'a', 'b', 25, 5), 'b', 'a', 25, 5);
    assert.deepEqual(newCollusionReasons(stats, settings), []);
  });

  it('signale deux joueurs qui jouent très souvent ensemble', () => {
    const stats = play(play(emptyPairStats('a', 'b'), 'a', 'b', 25, 15), 'b', 'a', 25, 15);
    assert.deepEqual(newCollusionReasons(stats, settings).map((r) => r.reason), ['FREQUENT']);
  });

  it('signale l’argent qui va presque toujours dans le même sens', () => {
    const oneWay = play(emptyPairStats('a', 'b'), 'b', 'a', 1000, 5);
    assert.deepEqual(newCollusionReasons(oneWay, settings).map((r) => r.reason), ['ONE_WAY']);
    const balanced = play(play(emptyPairStats('a', 'b'), 'b', 'a', 2000, 5), 'a', 'b', 1, 5);
    assert.deepEqual(newCollusionReasons(balanced, settings), []);
  });

  it('signale les forfaits répétés face au même joueur', () => {
    const stats = play(emptyPairStats('a', 'b'), 'a', 'b', 25, 5, true);
    assert.equal(stats.forfeitsB, 5);
    assert.deepEqual(newCollusionReasons(stats, settings).map((r) => r.reason), ['FORFEITS']);
  });

  it('ne signale de nouveau une paire que si l’indicateur a doublé', () => {
    const stats = play(play(emptyPairStats('a', 'b'), 'a', 'b', 25, 15), 'b', 'a', 25, 15);
    const reported = { ...stats, reported: { FREQUENT: 30 } };
    assert.deepEqual(newCollusionReasons(reported, settings), []);
    const later = { ...reported, parties: 60 };
    assert.deepEqual(newCollusionReasons(later, settings), [{ reason: 'FREQUENT', metric: 60 }]);
  });
});
