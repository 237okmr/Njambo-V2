import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from './roomManager';
import type { MultiplayerRoom, RoomPlayer } from '../../src/types';

const RM = RoomManager as any;

function player(id: string, name: string): RoomPlayer {
  return { id, name, isHost: false, isHuman: true, connected: true, avatarSeed: 's', score: 0, capital: 100, isEliminated: false, hand: [], tricksWonInRound: 0 } as RoomPlayer;
}

function room(id: string, hostId: string, patch: Partial<MultiplayerRoom> = {}): MultiplayerRoom {
  const now = Date.now();
  return {
    id, hostId, originalHostId: hostId, hostName: `Nom ${hostId}`, isPublic: true, status: 'LOBBY',
    players: [player(hostId, `Nom ${hostId}`)], maxPlayers: 4, baseBet: 10, initialCapital: 100, fillWithBots: false,
    enableDoubleKora: true, enableUnder21: true, gameState: null, createdAt: now, updatedAt: now, ...patch,
  } as MultiplayerRoom;
}

function connect(id: string, google = true) {
  const sent: any[] = [];
  const client = {
    socket: { readyState: 1, send: (d: string) => sent.push(JSON.parse(d)) },
    playerId: id, roomCode: null, reconnectToken: `tok-${id}`, lastPing: Date.now(),
    isAuthenticated: google, authUid: google ? id : undefined, authProvider: google ? 'google.com' : undefined,
  } as any;
  RM.clients.set(id, client);
  return { client, sent, last: () => sent[sent.length - 1] };
}

function reset(friends: string[] = [], blocked: Record<string, string[]> = {}) {
  RM.rooms.clear();
  RM.clients.clear();
  RM.openTableRefs.clear();
  RM.cashViewAccessCache.clear();
  RM.confirmedFriendsCache.clear();
  RM.blockedIdsCache.clear();
  const now = Date.now();
  RM.confirmedFriendsCache.set('me', { ids: new Set(friends), fetchedAt: now });
  RM.blockedIdsCache.set('me', { ids: new Set(blocked.me || []), fetchedAt: now });
  for (const id of ['h1', 'h2', 'f1', 'f2']) RM.blockedIdsCache.set(id, { ids: new Set(blocked[id] || []), fetchedAt: now });
  RoomManager.setPresenceSettingsRuntimeForTest({ load: async () => ({ hidden: false, friendsOnlyInvites: false }), save: async () => undefined });
}

test('tables ouvertes : le salon public est listé avec son code, la table d\'ami avec une référence opaque', async () => {
  reset(['f1']);
  const me = connect('me');
  connect('h1'); connect('f1');
  RM.rooms.set('PUB1', room('PUB1', 'h1'));
  RM.rooms.set('PRIV', room('PRIV', 'f1', { isPublic: false }));
  RM.rooms.set('SECRET', room('SECRET', 'h2', { isPublic: false }));

  await RoomManager.handleGetOpenTables(me.client, { type: 'GET_OPEN_TABLES', playerId: 'me', openTablesMode: 'FREE' });
  const { tables } = me.last().openTables;
  assert.equal(tables.length, 2);
  const friend = tables.find((t: any) => t.kind === 'FRIEND');
  assert.ok(friend && friend.id !== 'PRIV', 'le code d\'une table d\'ami ne sort pas dans la liste');
  assert.ok(!JSON.stringify(tables).includes('PRIV'));
  assert.ok(!JSON.stringify(tables).includes('SECRET'));
  assert.equal(tables.find((t: any) => t.kind === 'PUBLIC').id, 'PUB1');
});

test('tables ouvertes : la référence donne le code, une seule fois pour le bon joueur', async () => {
  reset(['f1']);
  const me = connect('me');
  const other = connect('other');
  connect('f1');
  RM.rooms.set('PRIV', room('PRIV', 'f1', { isPublic: false }));
  await RoomManager.handleGetOpenTables(me.client, { type: 'GET_OPEN_TABLES', playerId: 'me', openTablesMode: 'FREE' });
  const ref = me.last().openTables.tables[0].id;

  await RoomManager.handleResolveOpenTable(other.client, { type: 'RESOLVE_OPEN_TABLE', playerId: 'other', tableRef: ref });
  assert.equal(other.last().type, 'ERROR');

  await RoomManager.handleResolveOpenTable(me.client, { type: 'RESOLVE_OPEN_TABLE', playerId: 'me', tableRef: ref });
  assert.equal(me.last().type, 'OPEN_TABLE_TARGET');
  assert.equal(me.last().matchedRoomCode, 'PRIV');

  RM.rooms.get('PRIV').status = 'PLAYING';
  await RoomManager.handleResolveOpenTable(me.client, { type: 'RESOLVE_OPEN_TABLE', playerId: 'me', tableRef: ref });
  assert.equal(me.last().type, 'ERROR');

  await RoomManager.handleResolveOpenTable(me.client, { type: 'RESOLVE_OPEN_TABLE', playerId: 'me', tableRef: 'inconnue' });
  assert.equal(me.last().type, 'ERROR');
});

test('tables ouvertes : ami masqué et joueurs bloqués (dans les deux sens) n\'exposent rien', async () => {
  reset(['f1', 'f2'], { me: ['h1'], f2: ['me'] });
  const me = connect('me');
  ['h1', 'f1', 'f2', 'h2'].forEach((id) => connect(id));
  RM.rooms.set('A', room('A', 'h1'));                       // hôte que j'ai bloqué
  RM.rooms.set('B', room('B', 'f2', { isPublic: false }));  // ami qui m'a bloqué
  RM.rooms.set('C', room('C', 'f1', { isPublic: false }));  // ami masqué
  RM.rooms.set('D', room('D', 'h2'));                       // salon public normal
  RoomManager.setPresenceSettingsRuntimeForTest({
    load: async (uid: string) => ({ hidden: uid === 'f1', friendsOnlyInvites: false }),
    save: async () => undefined,
  });
  await RoomManager.handleGetOpenTables(me.client, { type: 'GET_OPEN_TABLES', playerId: 'me', openTablesMode: 'FREE' });
  assert.deepEqual(me.last().openTables.tables.map((t: any) => t.id), ['D']);
});

test('tables ouvertes : un invité sans Google ne reçoit rien', async () => {
  reset();
  const guest = connect('usr_guest', false);
  await RoomManager.handleGetOpenTables(guest.client, { type: 'GET_OPEN_TABLES', playerId: 'usr_guest', openTablesMode: 'FREE' });
  assert.equal(guest.last().type, 'ERROR');
  assert.equal(guest.last().errorCode, 'AUTH_REQUIRED');
});

test('tables ouvertes Kora Cash : niveaux agrégés sans pseudo ni code, vides si l\'accès est refusé', async () => {
  reset();
  const me = connect('me');
  const cashRoom = (id: string, host: string, bet: number, seats: string[]) =>
    room(id, host, {
      baseBet: bet,
      players: seats.map((s) => player(s, `Joueur ${s}`)),
      cash: { tableId: `t-${id}`, environment: 'DEMO', rakePercent: 5, minBuyIn: 1000, maxBuyInMultiple: 10, betLevel: bet, seats: Object.fromEntries(seats.map((s) => [s, { settled: 0, buyInTotal: 1000, open: true }])) },
    } as Partial<MultiplayerRoom>);
  RM.rooms.set('CASH1', cashRoom('CASH1', 'h1', 500, ['h1', 'h2']));
  connect('f1');
  RM.rooms.set('PUBFREE', room('PUBFREE', 'f1'));

  let refusal: string | null = null;
  RoomManager.setCashTableRuntimeForTest({
    book: {} as any,
    getAccess: async () => ({ open: true, settings: {} as any }),
    hasConsent: async () => false,
    checkEntry: async () => refusal,
    recordPartieOutcomes: async () => undefined,
  } as any);

  await RoomManager.handleGetOpenTables(me.client, { type: 'GET_OPEN_TABLES', playerId: 'me', openTablesMode: 'CASH' });
  assert.deepEqual(me.last().openTables, { mode: 'CASH', levels: [{ baseBet: 500, tables: 1, freeSeats: 2, rakePercent: 5 }] });
  assert.ok(!JSON.stringify(me.last()).includes('CASH1'));
  assert.ok(!JSON.stringify(me.last()).includes('Joueur'));

  RM.cashViewAccessCache.clear();
  refusal = 'Accès refusé.';
  await RoomManager.handleGetOpenTables(me.client, { type: 'GET_OPEN_TABLES', playerId: 'me', openTablesMode: 'CASH' });
  assert.deepEqual(me.last().openTables, { mode: 'CASH', levels: [] });

  // La liste gratuite ne contient jamais de table Cash.
  await RoomManager.handleGetOpenTables(me.client, { type: 'GET_OPEN_TABLES', playerId: 'me', openTablesMode: 'FREE' });
  assert.deepEqual(me.last().openTables.tables.map((t: any) => t.id), ['PUBFREE']);
  RoomManager.setCashTableRuntimeForTest(null);
});
