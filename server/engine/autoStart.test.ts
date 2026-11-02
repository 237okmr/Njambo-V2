import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../rooms/roomManager';
import { DEFAULT_ENGINE_CONFIG } from './engineConfig';
import type { MultiplayerRoom, RoomPlayer } from '../../src/types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function createMockPlayer(id: string, isHost: boolean, isReady: boolean): RoomPlayer {
  return {
    id,
    name: `Player_${id}`,
    isHost,
    isHuman: true,
    connected: true,
    isReady,
    capital: 100,
    score: 100,
    avatarSeed: `seed_${id}`,
    hand: [],
    tricksWonInRound: 0,
    isSpectator: false,
    isEliminated: false,
    isForfeit: false,
  };
}

function createMockRoom(params: {
  id: string;
  isPublic: boolean;
  players: RoomPlayer[];
  maxPlayers?: number;
}): MultiplayerRoom {
  const host = params.players.find((p) => p.isHost) || params.players[0];
  return {
    id: params.id,
    hostId: host.id,
    hostName: host.name,
    status: 'LOBBY',
    isPublic: params.isPublic,
    maxPlayers: params.maxPlayers || 2,
    initialCapital: 100,
    baseBet: 10,
    enableDoubleKora: true,
    enableUnder21: true,
    fillWithBots: false,
    players: params.players,
    gameState: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe('Multiplayer Public Table Auto-Start', () => {
  const testRoomIds: string[] = [];

  afterEach(() => {
    for (const code of testRoomIds) {
      RoomManager.clearRoomForTest(code);
    }
    testRoomIds.length = 0;
  });

  it('declenche le compte a rebours puis passe en PLAYING sans appel direct a START_GAME', async () => {
    const roomCode = 'AUTO_TEST_' + Math.random().toString(36).slice(2, 7);
    testRoomIds.push(roomCode);

    const host = createMockPlayer('host_1', true, true);
    const guest = createMockPlayer('guest_1', false, true);

    const room = createMockRoom({
      id: roomCode,
      isPublic: true,
      players: [host, guest],
      maxPlayers: 2,
    });

    // Enregistrement de la table dans RoomManager sans état actif préexistant
    RoomManager.setRoomForTest(roomCode, room);

    // Évaluation du démarrage automatique
    RoomManager.evaluateAutoStart(roomCode);

    // 1. Vérification que le compte à rebours de 5 secondes est armé
    assert.equal(room.status, 'LOBBY');
    assert.ok(room.autoStartCountdownAt, 'autoStartCountdownAt doit être défini');
    const delayMs = room.autoStartCountdownAt! - Date.now();
    const expectedMs = Number(DEFAULT_ENGINE_CONFIG.publicAutoStartSeconds ?? 8) * 1000;
    assert.ok(delayMs > expectedMs - 2000 && delayMs <= expectedMs + 100, `Le délai restant (${delayMs}ms) doit être proche de ${expectedMs}ms`);

    // 2. Attente de l'expiration du délai sans aucun appel à START_GAME
    await sleep(expectedMs + 300);

    // 3. Vérification que la table est passée en PLAYING
    const updatedRoom = RoomManager.getRoom(roomCode);
    assert.ok(updatedRoom, 'La salle doit toujours exister');
    assert.equal(updatedRoom.status, 'PLAYING', 'Le statut doit être passé en PLAYING automatiquement');
    assert.ok(updatedRoom.gameState, 'Le gameState doit être initialisé');
    assert.ok(
      updatedRoom.gameState.phase === 'DEALING' || updatedRoom.gameState.phase === 'PLAYING',
      'La partie doit être en cours de distribution ou de jeu'
    );
  });

  it('salon public incomplet : long decompte des 2 humains, raccourci si la table se remplit', () => {
    const roomCode = 'PART_TEST_' + Math.random().toString(36).slice(2, 7);
    testRoomIds.push(roomCode);
    const third = createMockPlayer('third_part', false, true);
    const room = createMockRoom({
      id: roomCode,
      isPublic: true,
      players: [createMockPlayer('host_part', true, true), createMockPlayer('guest_part', false, true), third],
      maxPlayers: 4,
    });
    RoomManager.setRoomForTest(roomCode, room);

    room.players = room.players.slice(0, 1);
    RoomManager.evaluateAutoStart(roomCode);
    assert.equal(room.autoStartCountdownAt ?? null, null, 'Un humain seul ne declenche rien');

    room.players = [room.players[0], createMockPlayer('guest_part', false, true), third];
    RoomManager.evaluateAutoStart(roomCode);
    const partialMs = Number(DEFAULT_ENGINE_CONFIG.publicPartialStartSeconds) * 1000;
    const shortMs = Number(DEFAULT_ENGINE_CONFIG.publicAutoStartSeconds ?? 8) * 1000;
    assert.ok(room.autoStartCountdownAt! - Date.now() > partialMs - 2000, 'Long decompte tant que la table est incomplete');
    const countdown = room.autoStartCountdownAt;

    RoomManager.evaluateAutoStart(roomCode);
    assert.equal(room.autoStartCountdownAt, countdown, 'Une nouvelle evaluation ne relance pas le decompte');

    room.players.push(createMockPlayer('fourth_part', false, true));
    RoomManager.evaluateAutoStart(roomCode);
    assert.ok(room.autoStartCountdownAt! - Date.now() <= shortMs + 100, 'Table pleine : decompte court');
    assert.equal(room.status, 'LOBBY');

    room.players = room.players.slice(0, 1);
    RoomManager.evaluateAutoStart(roomCode);
    assert.equal(room.autoStartCountdownAt ?? null, null, 'Retour a un seul humain : decompte annule');
  });

  it('ne declenche pas de demarrage automatique sur une table privee', () => {
    const roomCode = 'PRIV_TEST_' + Math.random().toString(36).slice(2, 7);
    testRoomIds.push(roomCode);

    const host = createMockPlayer('host_priv', true, true);
    const guest = createMockPlayer('guest_priv', false, true);

    const room = createMockRoom({
      id: roomCode,
      isPublic: false,
      players: [host, guest],
      maxPlayers: 2,
    });

    RoomManager.setRoomForTest(roomCode, room);
    RoomManager.evaluateAutoStart(roomCode);

    assert.equal(room.status, 'LOBBY');
    assert.ok(!room.autoStartCountdownAt, 'Aucun compte à rebours ne doit être lancé sur une table privée');
  });

  it('ne demarre pas si un invite n est pas encore pret', () => {
    const roomCode = 'UNREADY_TEST_' + Math.random().toString(36).slice(2, 7);
    testRoomIds.push(roomCode);

    const host = createMockPlayer('host_unready', true, true);
    const guest = createMockPlayer('guest_unready', false, false); // Pas prêt

    const room = createMockRoom({
      id: roomCode,
      isPublic: true,
      players: [host, guest],
      maxPlayers: 2,
    });

    RoomManager.setRoomForTest(roomCode, room);
    RoomManager.evaluateAutoStart(roomCode);

    assert.equal(room.status, 'LOBBY');
    assert.ok(!room.autoStartCountdownAt, 'Aucun compte à rebours si tous les invités ne sont pas prêts');
  });
});
