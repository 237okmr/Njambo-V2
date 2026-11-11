/**
 * « Je cherche une partie », côté serveur : qui est prévenu, qui voit l'appel, délai de relance,
 * réponse « partant », table gratuite rejointe d'un geste, Kora Cash sans table ni mise.
 */

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../rooms/roomManager';
import { pushService } from '../pushService';
import { DEFAULT_CASH_TABLE_SETTINGS } from '../cash/cashTableRules';
import type { MultiplayerRoom, RoomPlayer, UserPresence } from '../../src/types';

const manager = RoomManager as any;

function player(id: string): RoomPlayer {
  return { id, name: id, isHost: false, isHuman: true, connected: true, avatarSeed: 's', score: 0, capital: 100, isEliminated: false, hand: [], tricksWonInRound: 0 } as RoomPlayer;
}

function freeRoom(id: string, hostId: string, status: 'LOBBY' | 'PLAYING' = 'LOBBY'): MultiplayerRoom {
  const now = Date.now();
  return {
    id, hostId, originalHostId: hostId, hostName: hostId, isPublic: false, status, players: [player(hostId)], maxPlayers: 4, baseBet: 10,
    initialCapital: 100, fillWithBots: false, enableDoubleKora: true, enableUnder21: true, gameState: null, createdAt: now, updatedAt: now,
  } as MultiplayerRoom;
}

function connect(uid: string, roomCode: string | null = null, verified = true) {
  const sent: any[] = [];
  const client = {
    socket: { readyState: 1, send: (raw: string) => sent.push(JSON.parse(raw)), close: () => undefined },
    playerId: uid, roomCode, reconnectToken: `tok_${uid}`, lastPing: Date.now(), isAuthenticated: verified, authUid: verified ? uid : undefined, authProvider: 'google.com',
  };
  manager.clients.set(uid, client);
  manager.userPresences.set(uid, { userId: uid, displayName: `Nom ${uid}`, avatarId: 'a1', status: 'ONLINE_IDLE', lastSeenAt: Date.now() } as UserPresence);
  // Par défaut ni amis ni blocages : rien n'est lu dans Firestore ; les tests précisent le contraire.
  manager.confirmedFriendsCache.set(uid, { ids: new Set(), fetchedAt: Date.now() });
  manager.blockedIdsCache.set(uid, { ids: new Set(), fetchedAt: Date.now() });
  return { client, sent, last: (type: string) => [...sent].reverse().find((m) => m.type === type) };
}

const settings = new Map<string, { hidden: boolean; friendsOnlyInvites: boolean; searchAlerts: boolean }>();
const pushed: Array<{ uid: string; data: any; title: string }> = [];
const realPush = pushService.sendNotificationToUser.bind(pushService);
let cashConsent = true;

function friends(uid: string, ids: string[]) {
  manager.confirmedFriendsCache.set(uid, { ids: new Set(ids), fetchedAt: Date.now() });
}
function blocks(uid: string, ids: string[]) {
  manager.blockedIdsCache.set(uid, { ids: new Set(ids), fetchedAt: Date.now() });
}
function alerts(uid: string, on: boolean) {
  settings.set(uid, { hidden: false, friendsOnlyInvites: false, searchAlerts: on });
  manager.presenceSettingsCache.set(uid, settings.get(uid));
}

beforeEach(() => {
  settings.clear();
  pushed.length = 0;
  cashConsent = true;
  for (const m of ['rooms', 'clients', 'userPresences', 'searchCalls', 'lastSearchNotifiedAt', 'confirmedFriendsCache', 'blockedIdsCache', 'presenceSettingsCache', 'cashSearchAccessCache', 'cashViewAccessCache']) manager[m].clear();
  RoomManager.updateEngineConfig({ searchCallLifetimeSeconds: 1200, searchCallCooldownSeconds: 300, searchCallMaxRecipients: 20, searchCallMaxPartants: 10 });
  RoomManager.setPresenceSettingsRuntimeForTest({
    load: async (uid) => settings.get(uid) ?? { hidden: false, friendsOnlyInvites: false, searchAlerts: false },
    save: async () => undefined,
  });
  manager.setCashTableRuntimeForTest({
    book: {} as any,
    getAccess: async () => ({ open: true, settings: { ...DEFAULT_CASH_TABLE_SETTINGS, enabled: true } }),
    hasConsent: async () => cashConsent,
    checkEntry: async () => null,
    recordPartieOutcomes: async () => undefined,
  });
  (pushService as any).sendNotificationToUser = async (uid: string, payload: any) => {
    pushed.push({ uid, data: payload.data, title: payload.title });
    return { success: 1, failed: 0, deferred: 0 };
  };
});

afterEach(() => {
  manager.setCashTableRuntimeForTest(null);
  RoomManager.setPresenceSettingsRuntimeForTest(null);
  (pushService as any).sendNotificationToUser = realPush;
});

const start = (c: ReturnType<typeof connect>, searchMode: 'FREE' | 'CASH' = 'FREE') =>
  manager.handleStartSearch(c.client, { type: 'START_SEARCH', playerId: c.client.playerId, playerName: 'Awa', searchMode });
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('lancer un appel', () => {
  it('refuse un invité, un mode inconnu et un joueur en pleine partie', async () => {
    const guest = connect('usr_g', null, false);
    await start(guest);
    assert.equal(guest.last('ERROR')?.errorCode, 'AUTH_REQUIRED');

    const me = connect('me');
    await manager.handleStartSearch(me.client, { type: 'START_SEARCH', playerId: 'me', searchMode: 'AUTRE' });
    assert.ok(me.last('ERROR'));
    assert.equal(manager.searchCalls.size, 0);

    manager.rooms.set('R1', freeRoom('R1', 'me', 'PLAYING'));
    const busy = connect('busy', 'R1');
    await start(busy);
    assert.match(busy.last('ERROR').error, /pleine partie/);
  });

  it('prévient les amis (même hors ligne) et les inconnus en ligne qui ont activé l\'option, personne d\'autre', async () => {
    const me = connect('me');
    friends('me', ['f_on', 'f_off', 'f_blocked']);
    const fOn = connect('f_on');
    friends('f_on', ['me']);
    const optIn = connect('stranger_in');
    const optOut = connect('stranger_out');
    const hidden = connect('stranger_hidden');
    alerts('stranger_in', true);
    alerts('stranger_out', false);
    settings.set('stranger_hidden', { hidden: true, friendsOnlyInvites: false, searchAlerts: true });
    manager.presenceSettingsCache.set('stranger_hidden', settings.get('stranger_hidden'));
    connect('f_blocked');
    blocks('f_blocked', ['me']);
    blocks('me', []);
    blocks('f_on', []);
    blocks('stranger_in', []);

    await start(me);
    await flush();

    assert.deepEqual(pushed.map((p) => p.uid).sort(), ['f_off', 'f_on', 'stranger_in']);
    assert.equal(pushed[0].data.type, 'SEARCH_CALL');
    assert.match(pushed[0].data.url, /^\/game\/\?social=calls&mode=free$/);
    assert.equal(fOn.last('SEARCH_CALLS_UPDATE').searchCalls[0].userId, 'me');
    assert.equal(optIn.last('SEARCH_CALLS_UPDATE').searchCalls[0].isFriend, false);
    assert.equal(optOut.last('SEARCH_CALLS_UPDATE'), undefined);
    assert.equal(hidden.last('SEARCH_CALLS_UPDATE'), undefined);
    assert.equal(me.last('SEARCH_CALLS_UPDATE').mySearch.mode, 'FREE');
  });

  it('plafonne les destinataires', async () => {
    RoomManager.updateEngineConfig({ searchCallMaxRecipients: 2 });
    const me = connect('me');
    friends('me', ['a', 'b', 'c']);
    blocks('me', []);
    for (const id of ['a', 'b', 'c']) {
      connect(id);
      blocks(id, []);
    }
    await start(me);
    assert.equal(pushed.length, 2);
  });

  it('impose un délai avant de relancer, puis l\'oublie', async () => {
    const me = connect('me');
    friends('me', []);
    blocks('me', []);
    await start(me);
    await manager.handleStopSearch(me.client);
    assert.equal(manager.searchCalls.size, 0);
    await start(me);
    assert.equal(me.last('ERROR').errorCode, 'RATE_LIMITED');
    manager.lastSearchNotifiedAt.set('me', Date.now() - 301_000);
    me.sent.length = 0;
    await start(me);
    assert.equal(me.last('ERROR'), undefined);
    assert.equal(manager.searchCalls.size, 1);
  });

  it('un appel déjà actif n\'est pas renotifié', async () => {
    const me = connect('me');
    friends('me', ['f']);
    blocks('me', []);
    connect('f');
    blocks('f', []);
    await start(me);
    const before = pushed.length;
    await start(me);
    assert.equal(pushed.length, before);
  });
});

describe('Kora Cash', () => {
  it('refuse l\'appel sans 18 ans confirmés', async () => {
    cashConsent = false;
    const me = connect('me');
    await start(me, 'CASH');
    assert.match(me.last('ERROR').error, /Kora Cash/);
    assert.equal(manager.searchCalls.size, 0);
  });

  it('ne montre un appel Cash qu\'à ceux qui ont le droit de voir le Cash, sans aucune table créée', async () => {
    const me = connect('me');
    friends('me', ['f_ok', 'f_minor']);
    blocks('me', []);
    connect('f_ok');
    blocks('f_ok', []);
    connect('f_minor');
    blocks('f_minor', []);
    manager.cashSearchAccessCache.set('f_ok', { allowed: true, fetchedAt: Date.now() });
    manager.cashSearchAccessCache.set('f_minor', { allowed: false, fetchedAt: Date.now() });
    manager.cashSearchAccessCache.set('me', { allowed: true, fetchedAt: Date.now() });
    const roomsBefore = manager.rooms.size;

    await start(me, 'CASH');
    await flush();

    assert.deepEqual(pushed.map((p) => p.uid), ['f_ok']);
    assert.equal(pushed[0].data.mode, 'CASH');
    assert.equal(manager.rooms.size, roomsBefore);
  });
});

describe('répondre « partant »', () => {
  function setup() {
    const caller = connect('caller');
    const viewer = connect('viewer');
    friends('viewer', ['caller']);
    friends('caller', ['viewer']);
    blocks('viewer', []);
    blocks('caller', []);
    return { caller, viewer };
  }

  it('prévient l\'appelant, une seule fois par joueur', async () => {
    const { caller, viewer } = setup();
    await start(caller);
    await manager.handleReplySearch(viewer.client, { type: 'REPLY_SEARCH', playerId: 'viewer', playerName: 'Ben', targetPlayerId: 'caller' });
    await flush();
    const mine = caller.last('SEARCH_CALLS_UPDATE').mySearch;
    assert.deepEqual(mine.partants.map((p: any) => p.userId), ['viewer']);
    assert.ok(pushed.some((p) => p.uid === 'caller' && p.data.reply === true));

    await manager.handleReplySearch(viewer.client, { type: 'REPLY_SEARCH', playerId: 'viewer', targetPlayerId: 'caller' });
    assert.match(viewer.last('ERROR').error, /déjà répondu/);
  });

  it('envoie directement vers la table gratuite de l\'appelant quand elle est libre', async () => {
    const { caller, viewer } = setup();
    manager.rooms.set('T1', freeRoom('T1', 'caller'));
    caller.client.roomCode = 'T1';
    await start(caller);
    const entry = (await manager.buildSearchViewFor('viewer')).views[0];
    assert.equal(entry.canJoin, true);
    await manager.handleReplySearch(viewer.client, { type: 'REPLY_SEARCH', playerId: 'viewer', targetPlayerId: 'caller' });
    assert.equal(viewer.last('OPEN_TABLE_TARGET').matchedRoomCode, 'T1');
    assert.equal(manager.searchCalls.get('caller').partants.length, 0);
  });

  it('ne fait jamais rejoindre une table côté Cash', async () => {
    const { caller, viewer } = setup();
    manager.cashSearchAccessCache.set('caller', { allowed: true, fetchedAt: Date.now() });
    manager.cashSearchAccessCache.set('viewer', { allowed: true, fetchedAt: Date.now() });
    manager.rooms.set('T1', freeRoom('T1', 'caller'));
    caller.client.roomCode = 'T1';
    await start(caller, 'CASH');
    await manager.handleReplySearch(viewer.client, { type: 'REPLY_SEARCH', playerId: 'viewer', targetPlayerId: 'caller' });
    assert.equal(viewer.last('OPEN_TABLE_TARGET'), undefined);
    assert.equal(manager.searchCalls.get('caller').partants.length, 1);
  });

  it('refuse un appel échu, un appel inconnu et un joueur bloqué', async () => {
    const { caller, viewer } = setup();
    await start(caller);
    manager.searchCalls.get('caller').expiresAt = Date.now() - 1;
    await manager.handleReplySearch(viewer.client, { type: 'REPLY_SEARCH', playerId: 'viewer', targetPlayerId: 'caller' });
    assert.match(viewer.last('ERROR').error, /plus actif/);

    manager.searchCalls.delete('caller');
    manager.lastSearchNotifiedAt.clear();
    await start(caller);
    blocks('caller', ['viewer']);
    viewer.sent.length = 0;
    await manager.handleReplySearch(viewer.client, { type: 'REPLY_SEARCH', playerId: 'viewer', targetPlayerId: 'caller' });
    assert.match(viewer.last('ERROR').error, /plus actif/);
    assert.equal(manager.searchCalls.get('caller').partants.length, 0);
  });

  it('un inconnu qui n\'a pas activé l\'option ne voit pas l\'appel et ne peut pas y répondre', async () => {
    const caller = connect('caller');
    const stranger = connect('stranger');
    friends('caller', []);
    friends('stranger', []);
    blocks('caller', []);
    blocks('stranger', []);
    await start(caller);
    await manager.handleReplySearch(stranger.client, { type: 'REPLY_SEARCH', playerId: 'stranger', targetPlayerId: 'caller' });
    assert.match(stranger.last('ERROR').error, /plus actif/);
  });
});

describe('fin d\'un appel', () => {
  it('l\'appel disparaît quand l\'appelant lance une partie ou quitte', async () => {
    const caller = connect('caller');
    const viewer = connect('viewer');
    friends('viewer', ['caller']);
    friends('caller', ['viewer']);
    blocks('viewer', []);
    blocks('caller', []);
    await start(caller);
    assert.equal((await manager.buildSearchViewFor('viewer')).views.length, 1);
    manager.userPresences.set('caller', { ...manager.userPresences.get('caller'), status: 'IN_GAME' });
    assert.equal((await manager.buildSearchViewFor('viewer')).views.length, 0);
    manager.userPresences.set('caller', { ...manager.userPresences.get('caller'), status: 'ONLINE_IDLE' });
    manager.clients.delete('caller');
    assert.equal((await manager.buildSearchViewFor('viewer')).views.length, 0);
    void viewer;
  });
});
