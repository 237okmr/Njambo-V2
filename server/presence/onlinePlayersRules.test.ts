import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { UserPresence } from '../../src/types';
import {
  DEFAULT_PRESENCE_SETTINGS,
  buildOnlinePlayers,
  checkInviteQuota,
  isGoogleUserId,
  isInvitableStatus,
  mayReceiveInvite,
  normalizePresenceSettings,
} from './onlinePlayersRules';

const NOW = 1_000_000;

function presence(userId: string, patch: Partial<UserPresence> = {}): UserPresence {
  return { userId, displayName: `Nom ${userId}`, avatarId: 'a1', status: 'ONLINE_IDLE', lastSeenAt: NOW - 1000, ...patch } as UserPresence;
}

function build(presences: UserPresence[], extra: Record<string, unknown> = {}) {
  return buildOnlinePlayers({
    presences,
    nowMs: NOW,
    freshMs: 25_000,
    selfId: 'me',
    settingsOf: () => DEFAULT_PRESENCE_SETTINGS,
    isSocketOpen: () => false,
    roomStatusOf: () => undefined,
    limit: 50,
    ...extra,
  });
}

describe('liste des joueurs en ligne', () => {
  it('exclut moi-même, les invités, les joueurs sans signal récent et les hors ligne', () => {
    const list = build([
      presence('me'),
      presence('usr_guest'),
      presence('old', { lastSeenAt: NOW - 60_000 }),
      presence('gone', { status: 'OFFLINE' }),
      presence('ok'),
    ]);
    assert.deepEqual(list.map((p) => p.userId), ['ok']);
  });

  it('garde un joueur au signal ancien si sa connexion est ouverte', () => {
    const list = build([presence('slow', { lastSeenAt: NOW - 60_000 })], { isSocketOpen: () => true });
    assert.equal(list.length, 1);
  });

  it('cache les joueurs qui se sont cachés, et ceux dont les réglages ne sont pas encore lus', () => {
    const list = build([presence('hidden'), presence('unknown'), presence('shown')], {
      settingsOf: (id: string) => (id === 'hidden' ? { hidden: true, friendsOnlyInvites: false } : id === 'unknown' ? undefined : DEFAULT_PRESENCE_SETTINGS),
    });
    assert.deepEqual(list.map((p) => p.userId), ['shown']);
  });

  it('ne montre que pseudo, avatar et statut', () => {
    const [entry] = build([{ ...presence('ok'), email: 'x@y.z', capital: 999 } as any]);
    assert.deepEqual(Object.keys(entry).sort(), ['avatarId', 'displayName', 'status', 'userId']);
  });

  it('prend le statut réel de la table plutôt que le signal de présence', () => {
    const list = build([presence('a', { currentRoomCode: 'T1', status: 'IN_LOBBY' }), presence('b', { currentRoomCode: 'T2' }), presence('c')], {
      roomStatusOf: (code: string) => (code === 'T1' ? 'PLAYING' : code === 'T2' ? 'LOBBY' : undefined),
    });
    const byId = Object.fromEntries(list.map((p) => [p.userId, p.status]));
    assert.deepEqual(byId, { a: 'IN_GAME', b: 'IN_LOBBY', c: 'AVAILABLE' });
  });

  it('classe les disponibles d’abord, puis les plus récents, et plafonne', () => {
    const list = build(
      [presence('lobby', { status: 'IN_LOBBY' }), presence('old', { lastSeenAt: NOW - 9000 }), presence('new', { lastSeenAt: NOW - 100 }), presence('solo', { status: 'IN_SOLO' })],
      { limit: 3 },
    );
    assert.deepEqual(list.map((p) => p.userId), ['new', 'old', 'solo']);
  });

  it('nettoie les noms (balises, caractères de contrôle, longueur) et donne un nom par défaut', () => {
    const list = build([presence('a', { displayName: '<b>Awa</b>\u0007'.padEnd(80, 'x') }), presence('b', { displayName: '   ' })]);
    assert.ok(list.every((p) => !/[<>\u0007]/.test(p.displayName) && p.displayName.length <= 40));
    assert.equal(list.find((p) => p.userId === 'b')?.displayName, 'Joueur');
  });

  it('seuls les joueurs disponibles ou en solo sont invitables', () => {
    assert.deepEqual((['AVAILABLE', 'IN_SOLO', 'IN_LOBBY', 'IN_GAME'] as const).map(isInvitableStatus), [true, true, false, false]);
  });
});

describe('réglages, plafond et réception', () => {
  it('lit des réglages inconnus comme « visible, invitations de tous »', () => {
    assert.deepEqual(normalizePresenceSettings(undefined), DEFAULT_PRESENCE_SETTINGS);
    assert.deepEqual(normalizePresenceSettings({ hidden: 'oui', friendsOnlyInvites: 1 }), DEFAULT_PRESENCE_SETTINGS);
    assert.deepEqual(normalizePresenceSettings({ hidden: true, friendsOnlyInvites: true }), { hidden: true, friendsOnlyInvites: true });
  });

  it('reconnaît un compte Google par son identifiant', () => {
    assert.equal(isGoogleUserId('AbC123'), true);
    assert.equal(isGoogleUserId('usr_ab12'), false);
    assert.equal(isGoogleUserId(''), false);
    assert.equal(isGoogleUserId(undefined), false);
  });

  it('plafonne les invitations sur une fenêtre glissante', () => {
    const win = 3_600_000;
    const stamps = [NOW - 3_000_000, NOW - 2_000_000, NOW - 3_500_000];
    const full = checkInviteQuota(stamps, NOW, 3, win);
    assert.equal(full.allowed, false);
    assert.equal(full.retryAfterMs, 100_000);
    assert.equal(checkInviteQuota(stamps, NOW, 4, win).allowed, true);
    const aged = checkInviteQuota([NOW - 3_700_000, NOW - 10], NOW, 2, win);
    assert.equal(aged.allowed, true);
    assert.equal(aged.kept.length, 1);
  });

  it('un joueur caché ou « amis seulement » ne reçoit que des amis', () => {
    assert.equal(mayReceiveInvite(DEFAULT_PRESENCE_SETTINGS, false), true);
    assert.equal(mayReceiveInvite({ hidden: false, friendsOnlyInvites: true }, false), false);
    assert.equal(mayReceiveInvite({ hidden: true, friendsOnlyInvites: false }, false), false);
    assert.equal(mayReceiveInvite({ hidden: true, friendsOnlyInvites: true }, true), true);
  });
});
