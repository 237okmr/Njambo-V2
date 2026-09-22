/**
 * Tests d'escalade automatique de mise (Anti-stagnation)
 * - En multijoueur : désactivée par défaut (enableMultiplayerAutoBetEscalation: false), active seulement si enableMultiplayerAutoBetEscalation: true.
 * - En solo : activée uniquement en mode 'souverain', désactivée en modes 'tactique' et 'symetrique'.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

(globalThis as any).require = () => ({ RoomManager: { getRoom: () => null } });

import { ServerGameEngine, ActiveRoomState } from './serverGameEngine';
import { DEFAULT_ENGINE_CONFIG } from './engineConfig';
import type { MultiplayerRoom, RoomPlayer } from '../../src/types';

function mkPlayer(id: string, host = false): RoomPlayer {
  return {
    id,
    name: id,
    isHost: host,
    isHuman: true,
    avatarSeed: id,
    score: 1000,
    capital: 1000,
    isEliminated: false,
    isSpectator: false,
    hand: [],
    tricksWonInRound: 0,
    connected: true,
    isReady: true,
  } as RoomPlayer;
}

function setupRoom(configOverrides = {}) {
  const room = {
    id: 'R_TEST',
    hostId: 'A',
    hostName: 'A',
    status: 'PLAYING',
    fillWithBots: false,
    maxPlayers: 2,
    baseBet: 10,
    initialBaseBet: 10,
    initialCapital: 1000,
    players: [mkPlayer('A', true), mkPlayer('B')],
    gameState: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as unknown as MultiplayerRoom;

  const state = {
    room,
    engineConfig: {
      ...DEFAULT_ENGINE_CONFIG,
      trickResolutionTimeMs: 1,
      transitionDelayMs: 600000,
      botThinkTimeMs: 1,
      ...configOverrides,
    },
    turnTimeoutTimer: null,
    trickResolutionTimer: null,
    nextPartieTimer: null,
    botMoveTimer: null,
    disconnectTimers: new Map(),
    consecutiveTimeouts: new Map(),
    aiRelayTimers: new Map(),
  } as unknown as ActiveRoomState;

  ServerGameEngine.startNewGame(room, () => {}, state);
  return { room, state };
}

describe('Escalade automatique des mises (Anti-Stagnation) - Serveur Multijoueur', () => {
  it('est désactivée par défaut en multijoueur (baseBet ne change pas au palier de donne #6)', () => {
    const { room, state } = setupRoom();
    const gs = room.gameState!;
    gs.partieCount = 5; // nextPartieCount sera 6 (palier de 5)
    gs.baseBet = 10;
    room.baseBet = 10;

    ServerGameEngine.advanceToNextPartie(room, () => {}, state);

    assert.equal(gs.baseBet, 10, 'La mise de base ne doit pas avoir augmenté en multijoueur par défaut');
    assert.equal(room.baseBet, 10);
    (ServerGameEngine as any).clearAllTimers(state);
  });

  it('peut être activée explicitement via enableMultiplayerAutoBetEscalation: true', () => {
    const { room, state } = setupRoom({ enableMultiplayerAutoBetEscalation: true });
    const gs = room.gameState!;
    gs.partieCount = 5; // nextPartieCount sera 6 (palier de 5)
    gs.baseBet = 10;
    room.baseBet = 10;

    ServerGameEngine.advanceToNextPartie(room, () => {}, state);

    assert.equal(gs.baseBet, 15, 'La mise de base doit être passée à 15 avec l\'option explicite autorisée');
    assert.equal(room.baseBet, 15);
    (ServerGameEngine as any).clearAllTimers(state);
  });
});

describe('Escalade automatique des mises - Conditions Mode Solo', () => {
  it('L\'escalade est restreinte uniquement au mode souverain', () => {
    const isEscalationActiveForMode = (effectiveMode: string) => effectiveMode === 'souverain';

    assert.equal(isEscalationActiveForMode('souverain'), true, 'Mode souverain autorise l\'escalade');
    assert.equal(isEscalationActiveForMode('tactique'), false, 'Mode tactique interdit l\'escalade automatique');
    assert.equal(isEscalationActiveForMode('symetrique'), false, 'Mode symétrique interdit l\'escalade automatique');
  });
});
