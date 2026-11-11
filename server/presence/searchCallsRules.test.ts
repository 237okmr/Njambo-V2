import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SearchCall,
  addPartant,
  buildCallViews,
  checkSearchCooldown,
  isCallLive,
  normalizeSearchMode,
  selectRecipients,
} from './searchCallsRules';

const call = (userId: string, over: Partial<SearchCall> = {}): SearchCall => ({
  userId,
  displayName: userId,
  avatarId: 'a',
  mode: 'FREE',
  startedAt: 1000,
  expiresAt: 5000,
  partants: [],
  ...over,
});

describe('searchCallsRules', () => {
  it('ne reconnaît que les deux modes', () => {
    assert.equal(normalizeSearchMode('FREE'), 'FREE');
    assert.equal(normalizeSearchMode('CASH'), 'CASH');
    assert.equal(normalizeSearchMode('cash'), null);
    assert.equal(normalizeSearchMode(undefined), null);
  });

  it('un appel est vivant jusqu\'à son échéance exclue', () => {
    assert.equal(isCallLive(call('a'), 4999), true);
    assert.equal(isCallLive(call('a'), 5000), false);
  });

  it('applique le délai entre deux appels', () => {
    assert.deepEqual(checkSearchCooldown(undefined, 10_000, 5000), { allowed: true, retryAfterMs: 0 });
    assert.deepEqual(checkSearchCooldown(8000, 10_000, 5000), { allowed: false, retryAfterMs: 3000 });
    assert.deepEqual(checkSearchCooldown(1000, 10_000, 5000), { allowed: true, retryAfterMs: 0 });
  });

  it('choisit les amis, puis les inconnus qui ont activé l\'option, sans l\'appelant ni les joueurs en partie', () => {
    const picked = selectRecipients({
      callerId: 'me',
      friendIds: new Set(['f1', 'f2', 'f3']),
      candidates: [
        { userId: 'me', status: 'AVAILABLE', online: true, searchAlerts: true },
        { userId: 'f1', status: 'AVAILABLE', online: true },
        { userId: 'f2', status: 'IN_GAME', online: true },
        { userId: 's1', status: 'AVAILABLE', online: true, searchAlerts: true },
        { userId: 's2', status: 'AVAILABLE', online: true, searchAlerts: false },
        { userId: 's3', status: 'AVAILABLE', online: true, searchAlerts: true, hidden: true },
        { userId: 's4', status: 'IN_GAME', online: true, searchAlerts: true },
        { userId: 's5', status: 'AVAILABLE', online: false, searchAlerts: true },
        { userId: 's6', status: 'AVAILABLE', online: true },
      ],
      offlineFriendIds: ['f3'],
      max: 10,
    });
    assert.deepEqual(picked, [
      { userId: 'f1', isFriend: true },
      { userId: 'f3', isFriend: true },
      { userId: 's1', isFriend: false },
    ]);
  });

  it('plafonne les destinataires, les amis passant en premier', () => {
    const picked = selectRecipients({
      callerId: 'me',
      friendIds: new Set(['f1', 'f2']),
      candidates: [
        { userId: 's1', status: 'AVAILABLE', online: true, searchAlerts: true },
        { userId: 'f1', status: 'AVAILABLE', online: true },
        { userId: 'f2', status: 'AVAILABLE', online: true },
      ],
      max: 2,
    });
    assert.deepEqual(picked.map((r) => r.userId), ['f1', 'f2']);
    assert.deepEqual(selectRecipients({ callerId: 'me', friendIds: new Set(), candidates: [], max: 0 }), []);
  });

  it('ajoute une réponse « partant » une seule fois et dans la limite', () => {
    const p = { userId: 'x', displayName: 'X', avatarId: 'a' };
    assert.deepEqual(addPartant([], p, 3), [p]);
    assert.equal(addPartant([p], p, 3), null);
    assert.equal(addPartant([p], { ...p, userId: 'y' }, 1), null);
  });

  const baseView = {
    viewerId: 'v',
    nowMs: 2000,
    friendIds: new Set(['f']) as ReadonlySet<string>,
    canSeeMode: () => true,
    isBlocked: () => false,
    isCallerAvailable: () => true,
    canJoinCaller: () => false,
    strangerAllowed: true,
    limit: 10,
  };

  it('montre à chacun les appels qu\'il a le droit de voir', () => {
    const calls = [
      call('f', { startedAt: 1100 }),
      call('s', { startedAt: 1500 }),
      call('v'),
      call('old', { expiresAt: 1500 }),
      call('cash', { mode: 'CASH', startedAt: 1200 }),
    ];
    assert.deepEqual(buildCallViews({ ...baseView, calls }).map((c) => c.userId), ['f', 's', 'cash']);
    // Sans le droit de voir le Cash : l'appel Cash disparaît.
    assert.deepEqual(buildCallViews({ ...baseView, calls, canSeeMode: (m) => m === 'FREE' }).map((c) => c.userId), ['f', 's']);
    // Option désactivée : seuls les amis restent.
    assert.deepEqual(buildCallViews({ ...baseView, calls, strangerAllowed: false }).map((c) => c.userId), ['f']);
  });

  it('écarte les joueurs bloqués ou indisponibles et ne permet de rejoindre qu\'une table gratuite', () => {
    const calls = [call('a'), call('b', { mode: 'CASH' }), call('blocked'), call('gone')];
    const views = buildCallViews({
      ...baseView,
      calls,
      isBlocked: (id) => id === 'blocked',
      isCallerAvailable: (id) => id !== 'gone',
      canJoinCaller: () => true,
    });
    assert.deepEqual(views.map((v) => [v.userId, v.canJoin]), [['a', true], ['b', false]]);
  });

  it('respecte la limite', () => {
    const calls = [call('a'), call('b'), call('c')];
    assert.equal(buildCallViews({ ...baseView, calls, limit: 2 }).length, 2);
  });
});
