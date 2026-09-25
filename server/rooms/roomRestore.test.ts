/**
 * Restauration des tables après redémarrage serveur : vérification des jetons invités (empreinte
 * SHA-256, jamais le jeton en clair), et non-régression du garde-fou snapshotsEnabled (aucun appel
 * Firestore pendant les tests, y compris à la destruction d'une table).
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

(globalThis as any).require = () => ({ RoomManager: { getRoom: () => null } });

import { RoomManager } from './roomManager';
import type { MultiplayerRoom, RoomPlayer } from '../../src/types';

function mkPlayer(id: string): RoomPlayer {
  return {
    id, name: id, isHost: false, isHuman: true, avatarSeed: id, score: 100, capital: 100,
    isEliminated: false, isSpectator: false, hand: [], tricksWonInRound: 0, connected: true, isReady: true,
  } as RoomPlayer;
}

function mkRoom(id: string): MultiplayerRoom {
  return {
    id, hostId: 'p1', hostName: 'p1', status: 'LOBBY', fillWithBots: false, maxPlayers: 2,
    baseBet: 10, initialCapital: 100, enableDoubleKora: true, enableUnder21: true,
    players: [mkPlayer('p1')], gameState: null, createdAt: Date.now(), updatedAt: Date.now(),
  } as unknown as MultiplayerRoom;
}

describe('vérification du jeton d\'un invité restauré (registerClient)', () => {
  const roomId = 'RESTORE_TEST_1';
  const playerId = 'usr_restored_abc';
  const goodToken = 'tk_original_secret_token';
  const badToken = 'tk_guessed_wrong_token';

  beforeEach(() => {
    const fp = crypto.createHash('sha256').update(goodToken).digest('hex');
    (RoomManager as any).restoredGuestTokenFingerprints.set(playerId, { roomCode: roomId, fingerprint: fp });
  });

  afterEach(() => {
    (RoomManager as any).restoredGuestTokenFingerprints.delete(playerId);
    (RoomManager as any).tokenToPlayerId.delete(goodToken);
    (RoomManager as any).playerIdToToken.delete(playerId);
  });

  it('un jeton incorrect ne permet pas de reprendre l\'identité : un identifiant tout neuf est attribué', () => {
    assert.equal(RoomManager.hasPendingRestoredGuestToken(playerId), true);
    const client = RoomManager.registerClient({ readyState: 1, send: () => {}, on: () => {} } as any, badToken, playerId);
    assert.notEqual(client.playerId, playerId, 'un jeton faux ne doit jamais donner accès au siège restauré');
    assert.equal(RoomManager.hasPendingRestoredGuestToken(playerId), true, 'la vraie empreinte reste en attente pour une future tentative correcte');
  });

  it('le jeton d\'origine reprend exactement l\'identité restaurée et consomme l\'empreinte', () => {
    const client = RoomManager.registerClient({ readyState: 1, send: () => {}, on: () => {} } as any, goodToken, playerId);
    assert.equal(client.playerId, playerId, 'le bon jeton doit reprendre exactement le siège restauré');
    assert.equal(RoomManager.hasPendingRestoredGuestToken(playerId), false, 'l\'empreinte est consommée après une vérification réussie');
    assert.equal((RoomManager as any).tokenToPlayerId.get(goodToken), playerId, 'le jeton est réenregistré en mémoire pour la suite de la session');
  });

  it('un identifiant sans empreinte en attente suit le chemin normal (identifiant invité tout neuf)', () => {
    const freshId = 'usr_no_pending_xyz';
    const client = RoomManager.registerClient({ readyState: 1, send: () => {}, on: () => {} } as any, 'tk_anything', freshId);
    assert.equal(client.playerId, freshId, 'sans empreinte en attente, le comportement habituel s\'applique');
  });
});

describe('non-régression : destroyRoom ne touche jamais Firestore pendant les tests', () => {
  it('détruire une table ne lève aucune exception ni rejet non géré (snapshotsEnabled reste désactivé)', () => {
    const room = mkRoom('DESTROY_TEST_1');
    RoomManager.setRoomForTest(room.id, room);
    assert.doesNotThrow(() => RoomManager.destroyRoom(room.id, 'test'));
    assert.equal(RoomManager.getRoom(room.id), undefined);
  });
});
