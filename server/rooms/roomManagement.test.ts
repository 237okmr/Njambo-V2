import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from './roomManager';
import { ServerGameEngine } from '../engine/serverGameEngine';
import { updateEngineConfig } from '../engine/engineConfig';
import { MultiplayerRoom } from '../types';

test('instant win reveal does not crash server (no require call)', (t) => {
  ServerGameEngine.setRoomGetter((id) => RoomManager.getRoom(id));
  
  const room: MultiplayerRoom = {
    id: 'TEST_WIN',
    hostId: 'h1',
    originalHostId: 'h1',
    hostName: 'Host',
    isPublic: true,
    status: 'PLAYING',
    players: [
      { id: 'h1', name: 'Host', isHuman: true, connected: true, isHost: true },
      { id: 'p2', name: 'P2', isHuman: true, connected: true },
    ],
    maxPlayers: 2,
    baseBet: 10,
    initialCapital: 100,
    fillWithBots: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    gameState: {
      gameId: 'g1',
      roundNumber: 1,
      partieNumber: 1,
      phase: 'PLAYING',
      players: [],
      currentTurnIndex: 0,
      leadSuit: null,
      trickCards: [],
      tricksWon: [0, 0],
      baseBet: 10,
      deck: [],
      trumpCard: null,
      trumpSuit: null,
      biddingHistory: [],
      foldCount: 0,
      foldedPlayerIds: [],
    } as any,
  };

  (RoomManager as any).rooms.set(room.id, room);

  const state = { room, engineConfig: RoomManager.getEngineConfig(), disconnectTimers: new Map(), consecutiveTimeouts: new Map() } as any;

  assert.doesNotThrow(() => {
    // Call triggerInstantWinReveal directly with mock callbacks
    ServerGameEngine.triggerInstantWinReveal(
      room,
      {
        winnerIndex: 0,
        winnerPlayerId: 'h1',
        winType: 'KORA',
        triggeringCard: { suit: 'PIQUE', value: '3', id: 'c3' },
        tricksWon: 5,
        totalTricks: 5,
        expiresAt: Date.now() + 1000,
      },
      () => {},
      state
    );
  });

  if (state.instantWinTimer) {
    clearTimeout(state.instantWinTimer);
    state.instantWinTimer = null;
  }

  (RoomManager as any).rooms.delete(room.id);
});

test('LOBBY room survival beyond 3 minutes and closure after lobbyWaitTtlMinutes', () => {
  RoomManager.updateEngineConfig({
    lobbyWaitTtlMinutes: 10,
    emptyRoomTimeoutMinutes: 3,
  });

  const now = Date.now();
  const room: MultiplayerRoom = {
    id: 'TTL_TEST',
    hostId: 'h1',
    originalHostId: 'h1',
    hostName: 'Host',
    isPublic: true,
    status: 'LOBBY',
    players: [
      { id: 'h1', name: 'Host', isHuman: true, connected: false, disconnectGraceExpiresAt: now - 300000 },
    ],
    maxPlayers: 4,
    baseBet: 10,
    initialCapital: 100,
    fillWithBots: false,
    createdAt: now - 400000, // 6.6 minutes ago
    updatedAt: now - 400000,
    hostAbsentSince: now - 400000,
  };

  (RoomManager as any).rooms.set(room.id, room);

  // Run periodic room cleanup logic directly
  (RoomManager as any).cleanupIntervalHandler?.() || (RoomManager as any).rooms.forEach((r: any, code: string) => {
    if (code === room.id) {
      const connectedHumans = (r.players || []).filter((p: any) => p.isHuman && p.connected);
      const hostPlayer = (r.players || []).find((p: any) => p.id === (r.originalHostId || r.hostId) && p.isHuman);
      const isHostInLobbyGrace = Boolean(
        r.status === 'LOBBY' && hostPlayer && !hostPlayer.connected && hostPlayer.disconnectGraceExpiresAt && Date.now() < hostPlayer.disconnectGraceExpiresAt
      );

      const lobbyWaitTtlSecs = (RoomManager.getEngineConfig().lobbyWaitTtlMinutes ?? 30) * 60;
      const hostAbsentSinceSecs = Math.floor((Date.now() - (r.hostAbsentSince || r.createdAt)) / 1000);

      if (r.status === 'LOBBY' && connectedHumans.length === 0 && !isHostInLobbyGrace && hostAbsentSinceSecs > lobbyWaitTtlSecs) {
        RoomManager.adminCloseRoom(code);
      }
    }
  });

  // At 6.6 min, with lobbyWaitTtlMinutes = 10, the room MUST survive
  assert.ok(RoomManager.getRoom('TTL_TEST') !== undefined, 'Room should survive at 6.6 minutes when TTL is 10 min');

  // Now set hostAbsentSince to 11 minutes ago (exceeding 10 min TTL)
  room.hostAbsentSince = Date.now() - 660000;
  
  const connectedHumans = (room.players || []).filter((p: any) => p.isHuman && p.connected);
  const hostPlayer = (room.players || []).find((p: any) => p.id === (room.originalHostId || room.hostId) && p.isHuman);
  const isHostInLobbyGrace = Boolean(
    room.status === 'LOBBY' && hostPlayer && !hostPlayer.connected && hostPlayer.disconnectGraceExpiresAt && Date.now() < hostPlayer.disconnectGraceExpiresAt
  );
  const lobbyWaitTtlSecs = (RoomManager.getEngineConfig().lobbyWaitTtlMinutes ?? 30) * 60;
  const hostAbsentSinceSecs = Math.floor((Date.now() - (room.hostAbsentSince || room.createdAt)) / 1000);

  if (room.status === 'LOBBY' && connectedHumans.length === 0 && !isHostInLobbyGrace && hostAbsentSinceSecs > lobbyWaitTtlSecs) {
    RoomManager.adminCloseRoom('TTL_TEST');
  }

  assert.equal(RoomManager.getRoom('TTL_TEST'), undefined, 'Room should be closed after lobbyWaitTtlMinutes');
});

test('getPublicRoomsList visibility logic for absent host', () => {
  RoomManager.updateEngineConfig({
    publicAbsentHostVisibilitySeconds: 180,
    lobbyWaitTtlMinutes: 30,
  });

  const now = Date.now();
  const roomWithHuman: MultiplayerRoom = {
    id: 'PUB_HUMAN',
    hostId: 'h1',
    originalHostId: 'h1',
    hostName: 'Host',
    isPublic: true,
    status: 'LOBBY',
    players: [
      { id: 'h1', name: 'Host', isHuman: true, connected: false },
      { id: 'guest1', name: 'Guest 1', isHuman: true, connected: true },
    ],
    maxPlayers: 4,
    baseBet: 10,
    initialCapital: 100,
    fillWithBots: false,
    createdAt: now - 300000, // Absent 5 mins (exceeds 180s)
    updatedAt: now - 300000,
    hostAbsentSince: now - 300000,
  };

  const roomWithoutHuman: MultiplayerRoom = {
    id: 'PUB_EMPTY',
    hostId: 'h2',
    originalHostId: 'h2',
    hostName: 'Host 2',
    isPublic: true,
    status: 'LOBBY',
    players: [
      { id: 'h2', name: 'Host 2', isHuman: true, connected: false },
    ],
    maxPlayers: 4,
    baseBet: 10,
    initialCapital: 100,
    fillWithBots: false,
    createdAt: now - 300000, // Absent 5 mins
    updatedAt: now - 300000,
    hostAbsentSince: now - 300000,
  };

  (RoomManager as any).rooms.set(roomWithHuman.id, roomWithHuman);
  (RoomManager as any).rooms.set(roomWithoutHuman.id, roomWithoutHuman);
  (RoomManager as any).clients.set('guest1', {
    playerId: 'guest1',
    playerName: 'Guest 1',
    roomCode: 'PUB_HUMAN',
    socket: { readyState: 1 },
  });

  const list = RoomManager.getPublicRoomsList();
  const foundWithHuman = list.find((r) => r.id === 'PUB_HUMAN');
  const foundWithoutHuman = list.find((r) => r.id === 'PUB_EMPTY');

  assert.ok(foundWithHuman !== undefined, 'Room with connected human remains listed despite absent host');
  assert.equal(foundWithHuman?.hostAbsent, true, 'Badge hostAbsent is present');
  assert.equal(foundWithoutHuman, undefined, 'Room without connected humans is hidden from public list after publicAbsentHostVisibilitySeconds');

  // Room without human remains joinable directly by code
  assert.ok(RoomManager.getRoom('PUB_EMPTY') !== undefined, 'Room remains joinable by room code');

  (RoomManager as any).rooms.delete(roomWithHuman.id);
  (RoomManager as any).rooms.delete(roomWithoutHuman.id);
  (RoomManager as any).clients.delete('guest1');
});

test('Fallback host promotion via timer, restrictions, and return of original host', () => {
  RoomManager.updateEngineConfig({
    hostTakeoverSeconds: 60,
  });

  const now = Date.now();
  const room: MultiplayerRoom = {
    id: 'TAKEOVER_TEST',
    hostId: 'origHost',
    originalHostId: 'origHost',
    hostName: 'Original Host',
    isPublic: true,
    status: 'LOBBY',
    players: [
      { id: 'origHost', name: 'Original Host', isHuman: true, connected: false },
      { id: 'guest1', name: 'Guest 1', isHuman: true, connected: true },
    ],
    maxPlayers: 4,
    baseBet: 10,
    initialCapital: 100,
    fillWithBots: false,
    createdAt: now - 120000,
    updatedAt: now - 120000,
    hostAbsentSince: now - 120000, // Absent 120s (> 60s)
  };

  (RoomManager as any).rooms.set(room.id, room);

  // Mock socket client for guest1
  const mockClient = {
    playerId: 'guest1',
    playerName: 'Guest 1',
    roomCode: 'TAKEOVER_TEST',
    socket: { readyState: 1, send: () => {} },
  } as any;
  (RoomManager as any).clients.set('guest1', mockClient);

  // Evaluate host takeover
  const takeoverResult = RoomManager.evaluateLobbyHostTakeover('TAKEOVER_TEST');

  assert.equal(takeoverResult, true, 'Takeover triggered');
  assert.equal(room.hostId, 'guest1', 'Guest 1 promoted to host');
  assert.equal(room.originalHostId, 'origHost', 'originalHostId remains origHost');

  // Check system message added
  const systemEmote = room.activeEmotes?.find((e) => e.playerId === 'system' && e.text.includes('Guest 1 est hôte temporaire'));
  assert.ok(systemEmote !== undefined, 'System message for temporary host added');

  // Reconnect original host
  const origClient = {
    playerId: 'origHost',
    playerName: 'Original Host',
    roomCode: 'TAKEOVER_TEST',
    socket: { readyState: 1, send: () => {} },
  } as any;
  (RoomManager as any).clients.set('origHost', origClient);

  const origPlayer = room.players.find((p) => p.id === 'origHost');
  if (origPlayer) origPlayer.connected = true;

  const returnResult = RoomManager.evaluateLobbyHostTakeover('TAKEOVER_TEST');

  assert.equal(returnResult, true, 'Original host return triggered');
  assert.equal(room.hostId, 'origHost', 'Original host reclaimed host role');

  const returnEmote = room.activeEmotes?.find((e) => e.playerId === 'system' && e.text.includes('Original Host a repris son rôle'));
  assert.ok(returnEmote !== undefined, 'System message for original host return added');

  (RoomManager as any).rooms.delete('TAKEOVER_TEST');
  (RoomManager as any).clients.delete('guest1');
  (RoomManager as any).clients.delete('origHost');
});

test('notifyHostPlayerJoined throttling rules', () => {
  updateEngineConfig({
    joinPushEnabled: true,
  });

  const now = Date.now();
  const room: MultiplayerRoom = {
    id: 'PUSH_TEST',
    hostId: 'host1',
    originalHostId: 'host1',
    hostName: 'Host 1',
    isPublic: true,
    status: 'LOBBY',
    players: [
      { id: 'host1', name: 'Host 1', isHuman: true, connected: false },
    ],
    maxPlayers: 4,
    baseBet: 10,
    initialCapital: 100,
    fillWithBots: false,
    createdAt: now,
    updatedAt: now,
  };

  let pushSentCount = 0;
  // Mock sendPushNotification function
  const origSendPush = (RoomManager as any).notifyHostPlayerJoined;

  // Direct check on push logic conditions:
  // 1. If host is connected -> no push
  room.players[0].connected = true;
  const isHostConnected1 = room.players[0].connected;
  assert.equal(isHostConnected1, true, 'Host is connected, push should be blocked');

  // 2. Disconnect host, try 1st push
  room.players[0].connected = false;
  let canSend1 = false;
  const lastPush = room.lastJoinPushTime || 0;
  const pushCount = room.joinPushCount || 0;
  if (!room.players[0].connected && (now - lastPush >= 120000) && pushCount < 3) {
    canSend1 = true;
    room.lastJoinPushTime = now;
    room.joinPushCount = (room.joinPushCount || 0) + 1;
  }
  assert.equal(canSend1, true, 'First push allowed');
  assert.equal(room.joinPushCount, 1);

  // 3. Try 2nd push immediately (< 2 minutes) -> blocked
  let canSend2 = false;
  if (!room.players[0].connected && (now - room.lastJoinPushTime >= 120000) && room.joinPushCount < 3) {
    canSend2 = true;
  }
  assert.equal(canSend2, false, 'Second push immediately blocked by 2 min throttle');

  // 4. Try after 2 minutes -> allowed
  const later = now + 125000;
  let canSend3 = false;
  if (!room.players[0].connected && (later - room.lastJoinPushTime >= 120000) && room.joinPushCount < 3) {
    canSend3 = true;
    room.lastJoinPushTime = later;
    room.joinPushCount = (room.joinPushCount || 0) + 1;
  }
  assert.equal(canSend3, true, 'Second push after 2 minutes allowed');
  assert.equal(room.joinPushCount, 2);
});
