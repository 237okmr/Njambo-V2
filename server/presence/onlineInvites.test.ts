/**
 * Joueurs en ligne et invitations directes, côté serveur : visibilité, invitations réservées aux amis,
 * plafond par heure, tables Kora Cash (jamais d'entrée automatique) et règles de la réponse.
 */

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../rooms/roomManager';
import { DEFAULT_CASH_TABLE_SETTINGS } from '../cash/cashTableRules';
import type { MultiplayerRoom, RoomPlayer, UserPresence } from '../../src/types';

const manager = RoomManager as any;

function player(id: string, name = id): RoomPlayer {
  return { id, name, isHost: false, isHuman: true, connected: true, avatarSeed: 's', score: 0, capital: 100, isEliminated: false, hand: [], tricksWonInRound: 0 } as RoomPlayer;
}

function room(overrides: Partial<MultiplayerRoom> & { id: string }): MultiplayerRoom {
  const now = Date.now();
  return {
    hostId: 'host',
    originalHostId: 'host',
    hostName: 'Hôte',
    isPublic: false,
    status: 'LOBBY',
    players: [player('host')],
    maxPlayers: 4,
    baseBet: 10,
    initialCapital: 100,
    fillWithBots: false,
    enableDoubleKora: true,
    enableUnder21: true,
    gameState: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as MultiplayerRoom;
}

function connect(uid: string, roomCode: string | null = null, verified = true) {
  const sent: any[] = [];
  const client = {
    socket: { readyState: 1, send: (raw: string) => sent.push(JSON.parse(raw)), close: () => undefined },
    playerId: uid,
    roomCode,
    reconnectToken: `tok_${uid}`,
    lastPing: Date.now(),
    isAuthenticated: verified,
    authUid: verified ? uid : undefined,
    authProvider: 'google.com',
  };
  manager.clients.set(uid, client);
  return { client, sent, last: (type: string) => [...sent].reverse().find((m) => m.type === type) };
}

function presenceOf(userId: string, patch: Partial<UserPresence> = {}) {
  manager.userPresences.set(userId, { userId, displayName: `Nom ${userId}`, avatarId: 'a1', status: 'ONLINE_IDLE', lastSeenAt: Date.now(), ...patch });
}

const store = new Map<string, { hidden: boolean; friendsOnlyInvites: boolean; searchAlerts: boolean }>();
let saveFails = false;
let loads = 0;

function installStore() {
  RoomManager.setPresenceSettingsRuntimeForTest({
    load: async (uid) => {
      loads += 1;
      return store.get(uid) ?? { hidden: false, friendsOnlyInvites: false, searchAlerts: false };
    },
    save: async (uid, settings) => {
      if (saveFails) throw new Error('hors ligne');
      store.set(uid, settings);
    },
  });
}

function installCash(options: { consent?: boolean; refusal?: string | null; open?: boolean } = {}) {
  manager.setCashTableRuntimeForTest({
    book: {} as any,
    getAccess: async () => ({ open: options.open ?? true, settings: { ...DEFAULT_CASH_TABLE_SETTINGS, enabled: true } }),
    hasConsent: async () => options.consent ?? true,
    checkEntry: async () => options.refusal ?? null,
    recordPartieOutcomes: async () => undefined,
  });
}

function cashRoom(id: string, hostId = 'host'): MultiplayerRoom {
  return room({
    id,
    hostId,
    baseBet: 500,
    players: [player(hostId)],
    cash: { tableId: id, environment: 'DEMO', rakePercent: 5, minBuyIn: 500, maxBuyInMultiple: 10, betLevel: 500, seats: { [hostId]: { open: true } as any } },
  } as any);
}

beforeEach(() => {
  store.clear();
  saveFails = false;
  loads = 0;
  manager.rooms.clear();
  manager.clients.clear();
  manager.userPresences.clear();
  manager.pendingInvitations.clear();
  manager.lastDirectInviteTimestamps.clear();
  manager.directInviteSendLog.clear();
  manager.confirmedFriendsCache.clear();
  RoomManager.updateEngineConfig({ directInviteMaxPerHour: 10, directInviteCooldownSeconds: 10 });
  installStore();
  installCash();
});

afterEach(() => {
  manager.setCashTableRuntimeForTest(null);
  RoomManager.setPresenceSettingsRuntimeForTest(null);
});

async function invite(from: ReturnType<typeof connect>, target: string, roomCode: string) {
  await manager.handleSendDirectInvite(from.client, { type: 'SEND_DIRECT_INVITE', playerId: from.client.playerId, playerName: 'Awa', targetPlayerId: target, roomCode });
}

describe('liste des joueurs en ligne', () => {
  it('refuse un invité', () => {
    const guest = connect('usr_guest', null, false);
    manager.handleGetOnlinePlayers(guest.client);
    assert.equal(guest.last('ERROR')?.errorCode, 'AUTH_REQUIRED');
  });

  it('montre les joueurs visibles, jamais soi-même, jamais un joueur caché', async () => {
    store.set('hidden', { hidden: true, friendsOnlyInvites: false, searchAlerts: false });
    const me = connect('me');
    presenceOf('me');
    presenceOf('ok');
    presenceOf('hidden');
    presenceOf('usr_guest');
    await Promise.all(['me', 'ok', 'hidden'].map((id) => manager.loadPresenceSettings(id)));
    manager.handleGetOnlinePlayers(me.client);
    const list = me.last('ONLINE_PLAYERS_UPDATE').onlinePlayers;
    assert.deepEqual(list.map((p: any) => p.userId), ['ok']);
  });

  it('lit les réglages une seule fois par joueur', async () => {
    await manager.loadPresenceSettings('ok');
    await manager.loadPresenceSettings('ok');
    assert.equal(loads, 1);
  });
});

describe('réglages de visibilité', () => {
  it('enregistre le choix, le garde en mémoire et le renvoie', async () => {
    const me = connect('me');
    await manager.handleSetPresenceSettings(me.client, { type: 'SET_PRESENCE_SETTINGS', playerId: 'me', presenceSettings: { hidden: true } });
    assert.deepEqual(store.get('me'), { hidden: true, friendsOnlyInvites: false, searchAlerts: false });
    assert.deepEqual(me.last('PRESENCE_SETTINGS').presenceSettings, { hidden: true, friendsOnlyInvites: false, searchAlerts: false });
    await manager.handleSetPresenceSettings(me.client, { type: 'SET_PRESENCE_SETTINGS', playerId: 'me', presenceSettings: { friendsOnlyInvites: true } });
    assert.deepEqual(store.get('me'), { hidden: true, friendsOnlyInvites: true, searchAlerts: false });
  });

  it('si l’écriture échoue, le choix n’est pas appliqué et le joueur le sait', async () => {
    const me = connect('me');
    saveFails = true;
    await manager.handleSetPresenceSettings(me.client, { type: 'SET_PRESENCE_SETTINGS', playerId: 'me', presenceSettings: { hidden: true } });
    assert.equal(store.has('me'), false);
    assert.equal(me.last('ERROR')?.errorCode, 'GENERIC');
    assert.deepEqual(me.last('PRESENCE_SETTINGS').presenceSettings, { hidden: false, friendsOnlyInvites: false, searchAlerts: false });
  });

  it('ignore un invité', async () => {
    const guest = connect('usr_guest', null, false);
    await manager.handleSetPresenceSettings(guest.client, { type: 'SET_PRESENCE_SETTINGS', playerId: 'usr_guest', presenceSettings: { hidden: true } });
    assert.equal(guest.sent.length, 0);
    assert.equal(store.size, 0);
  });
});

describe('invitations directes', () => {
  it('seul un joueur assis dans une table en attente peut inviter', async () => {
    manager.rooms.set('T1', room({ id: 'T1' }));
    manager.rooms.set('T2', room({ id: 'T2', status: 'PLAYING' }));
    const outsider = connect('outsider', 'T1');
    await invite(outsider, 'ben', 'T1');
    assert.equal(outsider.last('ERROR')?.errorCode, 'FORBIDDEN');

    const host = connect('host', 'T2');
    manager.rooms.get('T2').players = [player('host')];
    await invite(host, 'ben', 'T2');
    assert.match(host.last('ERROR')?.error, /déjà commencé/);
  });

  it('un invité ne peut pas inviter', async () => {
    manager.rooms.set('T1', room({ id: 'T1', hostId: 'usr_g', players: [player('usr_g')] }));
    const guest = connect('usr_g', 'T1', false);
    await invite(guest, 'ben', 'T1');
    assert.equal(guest.last('ERROR')?.errorCode, 'JOIN_REFUSED');
  });

  it('une invitation vers un invité ou un joueur caché est refusée avec le même message', async () => {
    manager.rooms.set('T1', room({ id: 'T1' }));
    store.set('shy', { hidden: true, friendsOnlyInvites: false, searchAlerts: false });
    const host = connect('host', 'T1');
    await invite(host, 'usr_other', 'T1');
    const first = host.last('ERROR')?.error;
    await invite(host, 'shy', 'T1');
    assert.equal(host.last('ERROR')?.error, first);
    assert.equal(manager.pendingInvitations.size, 0);
  });

  it('« amis seulement » : refusé pour un inconnu, accepté pour un ami confirmé', async () => {
    manager.rooms.set('T1', room({ id: 'T1' }));
    store.set('ben', { hidden: false, friendsOnlyInvites: true, searchAlerts: false });
    const host = connect('host', 'T1');
    const ben = connect('ben');
    manager.confirmedFriendsCache.set('ben', { ids: new Set<string>(), fetchedAt: Date.now() });
    await invite(host, 'ben', 'T1');
    assert.equal(manager.pendingInvitations.size, 0);
    assert.equal(ben.last('DIRECT_INVITE_RECEIVED'), undefined);

    manager.confirmedFriendsCache.set('ben', { ids: new Set(['host']), fetchedAt: Date.now() });
    await invite(host, 'ben', 'T1');
    assert.equal(manager.pendingInvitations.size, 1);
    assert.equal(ben.last('DIRECT_INVITE_RECEIVED').invitation.cash, undefined);
  });

  it('plafonne les invitations par heure, avec le plafond réglé dans katika', async () => {
    RoomManager.updateEngineConfig({ directInviteMaxPerHour: 2 });
    manager.rooms.set('T1', room({ id: 'T1' }));
    const host = connect('host', 'T1');
    await invite(host, 'p1', 'T1');
    await invite(host, 'p2', 'T1');
    await invite(host, 'p3', 'T1');
    assert.equal(manager.pendingInvitations.size, 2);
    assert.equal(host.last('ERROR')?.errorCode, 'RATE_LIMITED');
    assert.match(host.last('ERROR')?.error, /2 invitations/);
  });

  it('seul le destinataire répond à une invitation', async () => {
    manager.rooms.set('T1', room({ id: 'T1' }));
    const host = connect('host', 'T1');
    const ben = connect('ben');
    const eve = connect('eve');
    await invite(host, 'ben', 'T1');
    const id = ben.last('DIRECT_INVITE_RECEIVED').invitation.id;
    manager.handleRespondDirectInvite(eve.client, { type: 'RESPOND_DIRECT_INVITE', playerId: 'eve', inviteId: id, agree: true });
    assert.equal(manager.pendingInvitations.has(id), true);
    assert.equal(host.last('INVITE_FEEDBACK'), undefined);
  });

  it('une invitation expirée n’est plus acceptée', async () => {
    manager.rooms.set('T1', room({ id: 'T1' }));
    const host = connect('host', 'T1');
    const ben = connect('ben');
    await invite(host, 'ben', 'T1');
    const id = ben.last('DIRECT_INVITE_RECEIVED').invitation.id;
    manager.pendingInvitations.get(id).expiresAt = Date.now() - 1;
    manager.handleRespondDirectInvite(ben.client, { type: 'RESPOND_DIRECT_INVITE', playerId: 'ben', inviteId: id, agree: true });
    assert.equal(ben.last('ERROR')?.errorCode, 'INVITE_EXPIRED');
    assert.equal(ben.client.roomCode, null);
  });
});

describe('invitations à une table Kora Cash', () => {
  it('invite avec la mise en FCFA, sans capital en jetons', async () => {
    manager.rooms.set('C1', cashRoom('C1'));
    const host = connect('host', 'C1');
    const ben = connect('ben');
    await invite(host, 'ben', 'C1');
    const inv = ben.last('DIRECT_INVITE_RECEIVED').invitation;
    assert.equal(inv.cash, true);
    assert.equal(inv.baseBet, 500);
    assert.equal(inv.rakePercent, 5);
    assert.equal(inv.initialCapital, undefined);
  });

  it('refuse sans confirmation 18 ans, pendant une pause ou une exclusion, ou table fermée, avec le même message', async () => {
    manager.rooms.set('C1', cashRoom('C1'));
    const host = connect('host', 'C1');
    connect('ben');
    installCash({ consent: false });
    await invite(host, 'ben', 'C1');
    const noConsent = host.last('ERROR')?.error;
    installCash({ refusal: 'Exclusion en cours' });
    await invite(host, 'ben', 'C1');
    assert.equal(host.last('ERROR')?.error, noConsent);
    assert.ok(!/exclusion/i.test(noConsent));
    installCash({ open: false });
    await invite(host, 'ben', 'C1');
    assert.equal(host.last('ERROR')?.error, noConsent);
    assert.equal(manager.pendingInvitations.size, 0);
  });

  it('refuse si l’hôte n’a pas de siège ouvert à la table', async () => {
    const r = cashRoom('C1');
    r.cash!.seats = {};
    manager.rooms.set('C1', r);
    const host = connect('host', 'C1');
    connect('ben');
    await invite(host, 'ben', 'C1');
    assert.equal(manager.pendingInvitations.size, 0);
  });

  it('accepter ne fait jamais entrer à la table : la page d’invitation Cash décide', async () => {
    manager.rooms.set('C1', cashRoom('C1'));
    const host = connect('host', 'C1');
    const ben = connect('ben');
    await invite(host, 'ben', 'C1');
    const id = ben.last('DIRECT_INVITE_RECEIVED').invitation.id;
    manager.handleRespondDirectInvite(ben.client, { type: 'RESPOND_DIRECT_INVITE', playerId: 'ben', inviteId: id, agree: true, playerName: 'Ben' });
    assert.equal(ben.client.roomCode, null);
    assert.equal(manager.rooms.get('C1').players.length, 1);
    assert.equal(host.last('INVITE_FEEDBACK').inviteFeedback.agree, true);
  });
});
