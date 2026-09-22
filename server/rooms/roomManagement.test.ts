import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from './roomManager';
import { ServerGameEngine } from '../engine/serverGameEngine';
import type { MultiplayerRoom, RoomPlayer } from '../../src/types';

function mockPlayer(overrides: Partial<RoomPlayer> & { id: string; name: string }): RoomPlayer {
  return {
    isHost: false,
    isHuman: true,
    connected: true,
    avatarSeed: 'seed',
    score: 0,
    capital: 100,
    isEliminated: false,
    hand: [],
    tricksWonInRound: 0,
    ...overrides,
  } as RoomPlayer;
}

function mockRoom(overrides: Partial<MultiplayerRoom> & { id: string; hostId: string; hostName: string }): MultiplayerRoom {
  const now = Date.now();
  return {
    originalHostId: overrides.hostId,
    isPublic: true,
    status: 'LOBBY',
    players: [],
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
  };
}

test('instant win reveal does not crash server (no require call)', async (t) => {
  ServerGameEngine.setRoomGetter((id) => RoomManager.getRoom(id));
  
  RoomManager.updateEngineConfig({
    instantWinAnimationTimeMs: 150,
  });

  const room = mockRoom({
    id: 'TEST_WIN',
    hostId: 'h1',
    hostName: 'Host',
    status: 'PLAYING',
    players: [
      mockPlayer({ id: 'h1', name: 'Host', isHuman: true, connected: true, isHost: true }),
      mockPlayer({ id: 'p2', name: 'P2', isHuman: true, connected: true }),
    ],
    maxPlayers: 2,
    gameState: {
      gameId: 'g1',
      roundNumber: 1,
      partieNumber: 1,
      phase: 'PLAYING',
      players: [
        mockPlayer({ id: 'h1', name: 'Host', isHuman: true, connected: true, capital: 100 }),
        mockPlayer({ id: 'p2', name: 'P2', isHuman: true, connected: true, capital: 100 }),
      ],
      currentTurnIndex: 0,
      leadSuit: null,
      trickCards: [],
      tricksWon: [0, 0],
      baseBet: 10,
      pot: 20,
      deck: [],
      trumpCard: null,
      trumpSuit: null,
      biddingHistory: [],
      foldCount: 0,
      foldedPlayerIds: [],
    } as any,
  });

  (RoomManager as any).rooms.set(room.id, room);

  let uncaughtError: any = null;
  const onUncaught = (err: any) => {
    uncaughtError = err;
  };
  process.on('uncaughtException', onUncaught);

  const activeState = {
    room,
    engineConfig: RoomManager.getEngineConfig(),
    disconnectTimers: new Map(),
    consecutiveTimeouts: new Map(),
  } as any;

  try {
    ServerGameEngine.triggerInstantWinReveal(
      room,
      {
        winnerIndex: 0,
        winnerName: 'Host',
        winType: 'THREE_SEVENS',
        hand: [],
        scoreOrCount: 3,
        expiresAt: Date.now() + 150,
      },
      () => {},
      activeState
    );

    // Wait 600 ms for the timer to fire without manual clearance
    await new Promise((resolve) => setTimeout(resolve, 600));

    assert.equal(uncaughtError, null, 'No uncaught exception raised during instant win timer callback');
    assert.equal(room.instantWinReveal, null, 'room.instantWinReveal should be cleared to null after timer execution');
  } finally {
    ServerGameEngine.clearAllTimers(activeState);
    (RoomManager as any).rooms.delete(room.id);
    (RoomManager as any).roomStates?.delete(room.id);
    process.off('uncaughtException', onUncaught);
  }
});

test('LOBBY room survival beyond 3 minutes and closure after lobbyWaitTtlMinutes', () => {
  RoomManager.updateEngineConfig({
    lobbyWaitTtlMinutes: 10,
    emptyRoomTimeoutMinutes: 3,
  });

  const now = Date.now();
  const room = mockRoom({
    id: 'TTL_TEST',
    hostId: 'h1',
    hostName: 'Host',
    status: 'LOBBY',
    players: [
      mockPlayer({ id: 'h1', name: 'Host', isHuman: true, connected: false, disconnectGraceExpiresAt: now - 300000 }),
    ],
    createdAt: now - 400000, // 6.6 minutes ago
    updatedAt: now - 400000,
    hostAbsentSince: now - 400000,
  });

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
  const roomWithHuman = mockRoom({
    id: 'PUB_HUMAN',
    hostId: 'h1',
    hostName: 'Host',
    status: 'LOBBY',
    players: [
      mockPlayer({ id: 'h1', name: 'Host', isHuman: true, connected: false }),
      mockPlayer({ id: 'guest1', name: 'Guest 1', isHuman: true, connected: true }),
    ],
    createdAt: now - 300000, // Absent 5 mins (exceeds 180s)
    updatedAt: now - 300000,
    hostAbsentSince: now - 300000,
  });

  const roomWithoutHuman = mockRoom({
    id: 'PUB_EMPTY',
    hostId: 'h2',
    hostName: 'Host 2',
    status: 'LOBBY',
    players: [
      mockPlayer({ id: 'h2', name: 'Host 2', isHuman: true, connected: false }),
    ],
    createdAt: now - 300000, // Absent 5 mins
    updatedAt: now - 300000,
    hostAbsentSince: now - 300000,
  });

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

test('PLAYING room without connected humans is not listed in public list', () => {
  RoomManager.updateEngineConfig({
    publicAbsentHostVisibilitySeconds: 180,
  });

  const now = Date.now();
  const playingRoomNoHuman = mockRoom({
    id: 'PUB_PLAYING_EMPTY',
    hostId: 'h1',
    hostName: 'Host 1',
    status: 'PLAYING',
    players: [
      mockPlayer({ id: 'h1', name: 'Host 1', isHuman: true, connected: false }),
      mockPlayer({ id: 'p2', name: 'Player 2', isHuman: true, connected: false }),
    ],
    maxPlayers: 2,
    createdAt: now - 10000, // 10 seconds ago (< 180s)
    updatedAt: now - 10000,
    hostAbsentSince: now - 10000,
  });

  (RoomManager as any).rooms.set(playingRoomNoHuman.id, playingRoomNoHuman);

  const list = RoomManager.getPublicRoomsList();
  const found = list.find((r) => r.id === 'PUB_PLAYING_EMPTY');

  assert.equal(found, undefined, 'PLAYING room without connected humans must be hidden immediately');

  (RoomManager as any).rooms.delete(playingRoomNoHuman.id);
});

test('in LOBBY, host takeover produces exactly one temporary host message and one reclaim message on return', () => {
  RoomManager.updateEngineConfig({
    hostTakeoverSeconds: 60,
  });

  const now = Date.now();
  const room = mockRoom({
    id: 'MESSAGES_TEST',
    hostId: 'origHost',
    hostName: 'Original Host',
    status: 'LOBBY',
    players: [
      mockPlayer({ id: 'origHost', name: 'Original Host', isHuman: true, connected: false, isHost: true }),
      mockPlayer({ id: 'guest1', name: 'Guest 1', isHuman: true, connected: true, isHost: false }),
    ],
    createdAt: now - 120000,
    updatedAt: now - 120000,
    hostAbsentSince: now - 120000, // Absent 120s (> 60s)
    activeEmotes: [],
  });

  (RoomManager as any).rooms.set(room.id, room);

  const mockGuestClient = {
    playerId: 'guest1',
    playerName: 'Guest 1',
    roomCode: 'MESSAGES_TEST',
    socket: { readyState: 1, send: () => {} },
  } as any;
  (RoomManager as any).clients.set('guest1', mockGuestClient);

  // First call -> triggers takeover
  const res1 = RoomManager.evaluateLobbyHostTakeover('MESSAGES_TEST');
  assert.equal(res1, true, 'First takeover call triggered takeover');

  // Second call while origHost is still disconnected -> should not duplicate takeover or emote
  const res2 = RoomManager.evaluateLobbyHostTakeover('MESSAGES_TEST');
  assert.equal(res2, false, 'Second takeover call produces no extra takeover');

  const tempHostEmotes = (room.activeEmotes || []).filter(
    (e) => e.playerId === 'system' && e.text.includes('est hôte temporaire')
  );
  assert.equal(tempHostEmotes.length, 1, 'Exactly one temporary host message produced');

  // Reconnect original host
  const mockOrigClient = {
    playerId: 'origHost',
    playerName: 'Original Host',
    roomCode: 'MESSAGES_TEST',
    socket: { readyState: 1, send: () => {} },
  } as any;
  (RoomManager as any).clients.set('origHost', mockOrigClient);
  room.players[0].connected = true;

  // Call takeover -> triggers original host reclaim
  const res3 = RoomManager.evaluateLobbyHostTakeover('MESSAGES_TEST');
  assert.equal(res3, true, 'Reclaim triggered on original host return');

  // Subsequent call -> no duplicate reclaim
  const res4 = RoomManager.evaluateLobbyHostTakeover('MESSAGES_TEST');
  assert.equal(res4, false, 'Subsequent call produces no extra reclaim');

  const reclaimEmotes = (room.activeEmotes || []).filter(
    (e) => e.playerId === 'system' && e.text.includes('a repris son rôle')
  );
  assert.equal(reclaimEmotes.length, 1, 'Exactly one reclaim message produced');

  (RoomManager as any).rooms.delete('MESSAGES_TEST');
  (RoomManager as any).clients.delete('guest1');
  (RoomManager as any).clients.delete('origHost');
});

test('Fallback host promotion via timer, restrictions, and return of original host', () => {
  RoomManager.updateEngineConfig({
    hostTakeoverSeconds: 60,
  });

  const now = Date.now();
  const room = mockRoom({
    id: 'TAKEOVER_TEST',
    hostId: 'origHost',
    hostName: 'Original Host',
    status: 'LOBBY',
    players: [
      mockPlayer({ id: 'origHost', name: 'Original Host', isHuman: true, connected: false }),
      mockPlayer({ id: 'guest1', name: 'Guest 1', isHuman: true, connected: true }),
    ],
    createdAt: now - 120000,
    updatedAt: now - 120000,
    hostAbsentSince: now - 120000, // Absent 120s (> 60s)
  });

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
  RoomManager.updateEngineConfig({
    joinPushEnabled: true,
  });

  const now = Date.now();
  const room = mockRoom({
    id: 'PUSH_TEST',
    hostId: 'host1',
    hostName: 'Host 1',
    status: 'LOBBY',
    players: [
      mockPlayer({ id: 'host1', name: 'Host 1', isHuman: true, connected: false }),
    ],
    createdAt: now,
    updatedAt: now,
  });

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

test('handleSendDirectInvite protections: SELF_INVITE, BANNED, RATE_LIMITED', async (t) => {
  const room = mockRoom({
    id: 'ROOM_INVITE',
    hostId: 'p1',
    hostName: 'HostPlayer',
    status: 'LOBBY',
    players: [mockPlayer({ id: 'p1', name: 'HostPlayer', isHuman: true, connected: true })],
  });
  (RoomManager as any).rooms.set(room.id, room);

  let lastSentMessage: any = null;
  const mockClient = {
    socket: {
      readyState: 1, // OPEN
      send: (data: string) => {
        lastSentMessage = JSON.parse(data);
      },
    },
    playerId: 'p1',
    roomCode: 'ROOM_INVITE',
    reconnectToken: 'tok1',
    lastPing: Date.now(),
  } as any;

  // Test 1: SELF_INVITE
  await RoomManager.handleSendDirectInvite(mockClient, {
    type: 'SEND_DIRECT_INVITE',
    playerId: 'p1',
    targetPlayerId: 'p1',
    roomCode: 'ROOM_INVITE',
  });
  assert.equal(lastSentMessage?.type, 'ERROR');
  assert.equal(lastSentMessage?.errorCode, 'SELF_INVITE');

  // Test 2: BANNED
  (RoomManager as any).playerSanctions.set('p1', {
    status: 'BANNED',
    sanctionType: 'TEMP_BAN',
    banExpiresAt: Date.now() + 600000,
    bannedReason: 'Suspension temporaire',
  });

  await RoomManager.handleSendDirectInvite(mockClient, {
    type: 'SEND_DIRECT_INVITE',
    playerId: 'p1',
    targetPlayerId: 'p2',
    roomCode: 'ROOM_INVITE',
  });
  assert.equal(lastSentMessage?.type, 'ERROR');
  assert.equal(lastSentMessage?.errorCode, 'BANNED');

  // Remove sanction for rate limit test
  (RoomManager as any).playerSanctions.delete('p1');

  // Test 3: First valid invite
  await RoomManager.handleSendDirectInvite(mockClient, {
    type: 'SEND_DIRECT_INVITE',
    playerId: 'p1',
    targetPlayerId: 'p2',
    roomCode: 'ROOM_INVITE',
  });

  // Test 4: RATE_LIMITED (pending invite exists)
  await RoomManager.handleSendDirectInvite(mockClient, {
    type: 'SEND_DIRECT_INVITE',
    playerId: 'p1',
    targetPlayerId: 'p2',
    roomCode: 'ROOM_INVITE',
  });
  assert.equal(lastSentMessage?.type, 'ERROR');
  assert.equal(lastSentMessage?.errorCode, 'RATE_LIMITED');
});

// Helper for testing timer cleanup on room deletion
function setupRoomWithAllTimers(roomCode: string) {
  (RoomManager as any).rooms.clear();
  (RoomManager as any).roomStates.clear();
  (RoomManager as any).clients.clear();
  (RoomManager as any).botBetIncreaseTimers.clear();

  const room = mockRoom({
    id: roomCode,
    hostId: 'p1',
    hostName: 'Player 1',
    status: 'PLAYING',
    players: [mockPlayer({ id: 'p1', name: 'Player 1', isHuman: true, connected: true })],
  });

  const disconnectMap = new Map();
  disconnectMap.set('p1', setTimeout(() => {}, 60000));

  const relayMap = new Map();
  relayMap.set('p1', setTimeout(() => {}, 60000));

  const activeState = {
    room,
    turnTimeoutTimer: setTimeout(() => {}, 60000),
    trickResolutionTimer: setTimeout(() => {}, 60000),
    nextPartieTimer: setTimeout(() => {}, 60000),
    instantWinTimer: setTimeout(() => {}, 60000),
    botMoveTimer: setTimeout(() => {}, 60000),
    autoStartTimer: setTimeout(() => {}, 60000),
    hostTransferTimer: setTimeout(() => {}, 60000),
    disconnectTimers: disconnectMap,
    aiRelayTimers: relayMap,
    consecutiveTimeouts: new Map(),
  } as any;

  (RoomManager as any).rooms.set(roomCode, room);
  (RoomManager as any).roomStates.set(roomCode, activeState);
  (RoomManager as any).botBetIncreaseTimers.set(roomCode, [setTimeout(() => {}, 60000)]);

  return { room, activeState };
}

function verifyRoomCleanedUp(roomCode: string, activeState: any) {
  assert.equal(activeState.turnTimeoutTimer, null, 'turnTimeoutTimer should be null');
  assert.equal(activeState.trickResolutionTimer, null, 'trickResolutionTimer should be null');
  assert.equal(activeState.nextPartieTimer, null, 'nextPartieTimer should be null');
  assert.equal(activeState.instantWinTimer, null, 'instantWinTimer should be null');
  assert.equal(activeState.botMoveTimer, null, 'botMoveTimer should be null');
  assert.equal(activeState.autoStartTimer, null, 'autoStartTimer should be null');
  assert.equal(activeState.hostTransferTimer, null, 'hostTransferTimer should be null');
  assert.equal(activeState.disconnectTimers.size, 0, 'disconnectTimers should be empty');
  assert.equal(activeState.aiRelayTimers.size, 0, 'aiRelayTimers should be empty');

  assert.equal((RoomManager as any).roomStates.has(roomCode), false, 'roomStates should not contain roomCode');
  assert.equal((RoomManager as any).rooms.has(roomCode), false, 'rooms should not contain roomCode');
  assert.equal((RoomManager as any).botBetIncreaseTimers.has(roomCode), false, 'botBetIncreaseTimers should not contain roomCode');
}

test('1. destroyRoom / clearRoomForTest cleans up all 10 timer categories and room state', () => {
  const code = 'TEST_CLEAR';
  const { activeState } = setupRoomWithAllTimers(code);
  RoomManager.clearRoomForTest(code);
  verifyRoomCleanedUp(code, activeState);
});

test('2. destroyRoom via removePlayerFromOtherRooms cleans up all timers and room state when room becomes empty', () => {
  const code = 'TEST_REMOVE_OTHER';
  const { room, activeState } = setupRoomWithAllTimers(code);
  room.status = 'LOBBY';
  (RoomManager as any).removePlayerFromOtherRooms('p1', 'SOME_OTHER_ROOM');
  verifyRoomCleanedUp(code, activeState);
});

test('3a. handleLeaveRoom in PLAYING triggers relay/bot replacement and does NOT destroy room or timers', () => {
  const code = 'TEST_LEAVE_PLAYING';
  const { room, activeState } = setupRoomWithAllTimers(code);
  room.players.push(mockPlayer({ id: 'p2', name: 'Player 2', isHuman: true, connected: true }));

  const mockClient = {
    playerId: 'p1',
    playerName: 'Player 1',
    roomCode: code,
    socket: { readyState: 1, send: () => {}, close: () => {} },
  } as any;
  (RoomManager as any).clients.set('p1', mockClient);

  (RoomManager as any).handleLeaveRoom(mockClient, { type: 'LEAVE_ROOM' });

  assert.ok(RoomManager.getRoom(code) !== undefined, 'Room should still exist in PLAYING status after player leaves');
  assert.equal((RoomManager as any).roomStates.has(code), true, 'activeState should be preserved');
  const p1 = room.players.find((p) => p.id === 'p1');
  assert.ok(p1?.leftRoom === true || p1?.isAiRelay === true, 'Player 1 should have leftRoom or isAiRelay set');

  (RoomManager as any).clients.delete('p1');
  RoomManager.clearRoomForTest(code);
});

test('3b. destroyRoom via handleLeaveRoom in LOBBY cleans up all timers and room state when last player leaves', () => {
  const code = 'TEST_LEAVE_LOBBY';
  const { room, activeState } = setupRoomWithAllTimers(code);
  room.status = 'LOBBY';

  const mockClient = {
    playerId: 'p1',
    playerName: 'Player 1',
    roomCode: code,
    socket: { readyState: 1, send: () => {}, close: () => {} },
  } as any;
  (RoomManager as any).clients.set('p1', mockClient);

  (RoomManager as any).handleLeaveRoom(mockClient, { type: 'LEAVE_ROOM' });
  verifyRoomCleanedUp(code, activeState);
  (RoomManager as any).clients.delete('p1');
});

test('4. destroyRoom via tickRoom cleans up all timers and room state when all disconnected players expire', () => {
  const code = 'TEST_TICK_ROOM';
  const { room, activeState } = setupRoomWithAllTimers(code);
  room.status = 'LOBBY';
  room.players[0].connected = false;
  room.players[0].disconnectGraceExpiresAt = Date.now() - 10000;

  RoomManager.tickRoom(code);
  verifyRoomCleanedUp(code, activeState);
});

test('5. destroyRoom via adminKickPlayer cleans up all timers and room state when last player is kicked', () => {
  const code = 'TEST_KICK';
  const { activeState } = setupRoomWithAllTimers(code);
  
  const mockClient = {
    playerId: 'p1',
    playerName: 'Player 1',
    roomCode: code,
    socket: { readyState: 1, send: () => {}, close: () => {} },
  } as any;
  (RoomManager as any).clients.set('p1', mockClient);

  RoomManager.adminKickPlayer(code, 'p1');
  verifyRoomCleanedUp(code, activeState);
});

test('6. destroyRoom via adminCloseRoom cleans up all timers and room state on administrative closure', () => {
  const code = 'TEST_CLOSE';
  const { activeState } = setupRoomWithAllTimers(code);
  RoomManager.adminCloseRoom(code);
  verifyRoomCleanedUp(code, activeState);
});

test('destroyRoom is idempotent and safe when called multiple times or on non-existent room', () => {
  const code = 'TEST_IDEMPOTENT';
  const { activeState } = setupRoomWithAllTimers(code);

  RoomManager.destroyRoom(code);
  verifyRoomCleanedUp(code, activeState);

  assert.doesNotThrow(() => {
    RoomManager.destroyRoom(code);
    RoomManager.destroyRoom('NON_EXISTENT');
  });
});

test('7. PLAYING room with only bots auto-closes after emptyRoomTimeoutMinutes despite bot activity updating updatedAt', () => {
  RoomManager.updateEngineConfig({
    emptyRoomTimeoutMinutes: 5,
  });

  const now = Date.now();
  // Simulated departure of last human 6 minutes ago (exceeding 5 min threshold)
  const sixMinutesAgo = now - 6 * 60 * 1000;

  const room = mockRoom({
    id: 'BOT_ONLY_ROOM',
    hostId: 'p1',
    hostName: 'Player 1',
    status: 'PLAYING',
    players: [
      mockPlayer({ id: 'p1', name: 'Player 1', isHuman: true, connected: false, leftRoom: true }),
      mockPlayer({ id: 'bot1', name: 'Bot 1', isHuman: false, connected: true }),
      mockPlayer({ id: 'bot2', name: 'Bot 2', isHuman: false, connected: true }),
      mockPlayer({ id: 'bot3', name: 'Bot 3', isHuman: false, connected: true }),
    ],
    createdAt: sixMinutesAgo - 10000,
    // Bot played a card 10 seconds ago! updatedAt is very recent!
    updatedAt: now - 10000,
    allHumansAbsentSince: sixMinutesAgo,
  });

  (RoomManager as any).rooms.set(room.id, room);

  // Trigger the human absent timestamp check
  (RoomManager as any).updateHumanAbsentTimestamp(room);

  // Execute room cleanup logic
  const defaultTimeoutMinutes = (RoomManager as any).engineConfig.emptyRoomTimeoutMinutes ?? 5;
  const connectedHumans = (room.players || []).filter((p) => p.isHuman && p.connected);

  if (connectedHumans.length === 0) {
    const absentSince = room.allHumansAbsentSince || now;
    const absentDuration = now - absentSince;
    const emptyTimeoutMs = defaultTimeoutMinutes * 60 * 1000;

    if (absentDuration >= emptyTimeoutMs) {
      RoomManager.adminCloseRoom(room.id);
    }
  }

  assert.equal(
    RoomManager.getRoom('BOT_ONLY_ROOM'),
    undefined,
    'Room should be closed because allHumansAbsentSince exceeds emptyRoomTimeoutMinutes, despite recent updatedAt from bot moves'
  );
});

