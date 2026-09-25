/**
 * Grâce réelle avant le relais : tant que aiRelayGraceSeconds n'est pas écoulé, l'expiration du seul
 * chrono de tour ne doit PAS faire jouer une carte neutre à la place d'un joueur déconnecté.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

(globalThis as any).require = () => ({ RoomManager: { getRoom: () => null } });

import { ServerGameEngine, ActiveRoomState } from './serverGameEngine';
import { DEFAULT_ENGINE_CONFIG } from './engineConfig';
import type { MultiplayerRoom, RoomPlayer, PartieResult } from '../../src/types';

function mkPlayer(id: string, host = false): RoomPlayer {
  return {
    id, name: id, isHost: host, isHuman: true, avatarSeed: id, score: 100, capital: 100,
    isEliminated: false, isSpectator: false, hand: [], tricksWonInRound: 0, connected: true, isReady: true,
  } as RoomPlayer;
}

function createTable(n: number, config: Record<string, number>, turnTimerSeconds: number) {
  const ids = ['A', 'B'].slice(0, n);
  const room = {
    id: 'RG' + Math.random().toString(36).slice(2, 6), hostId: 'A', hostName: 'A', status: 'LOBBY',
    fillWithBots: false, maxPlayers: n, baseBet: 10, initialCapital: 100, enableDoubleKora: true, enableUnder21: true,
    players: ids.map((id, i) => mkPlayer(id, i === 0)), gameState: null, createdAt: Date.now(), updatedAt: Date.now(),
    turnTimerSeconds,
  } as unknown as MultiplayerRoom;
  const results: PartieResult[] = [];
  const state = {
    room,
    engineConfig: { ...DEFAULT_ENGINE_CONFIG, trickResolutionTimeMs: 3, transitionDelayMs: 600000, botThinkTimeMs: 1, instantWinAnimationTimeMs: 3, ...config },
    turnTimeoutTimer: null, trickResolutionTimer: null, nextPartieTimer: null, botMoveTimer: null,
    disconnectTimers: new Map(), consecutiveTimeouts: new Map(), aiRelayTimers: new Map(),
    onPartieResult: (r: PartieResult) => results.push(r),
    onPlayerAlert: () => {},
  } as unknown as ActiveRoomState;
  ServerGameEngine.startNewGame(room, () => {}, state);
  return { room, state };
}

/** Une donne en cours, avec un tour à jouer (pas de victoire instantanée). */
function setupPlayable(config: Record<string, number>, turnTimerSeconds: number) {
  for (let i = 0; i < 200; i++) {
    const table = createTable(2, config, turnTimerSeconds);
    const gs = table.room.gameState;
    if (gs && gs.phase === 'PLAYING' && gs.currentTurnIndex >= 0 && !gs.instantWinReveal) return table;
    (ServerGameEngine as any).clearAllTimers(table.state);
  }
  throw new Error('Impossible d\'obtenir une donne jouable après 200 tirages');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stop = (state: ActiveRoomState) => (ServerGameEngine as any).clearAllTimers(state);

describe('grâce réelle avant le relais (aiRelayGraceSeconds)', () => {
  it('chrono de tour court + grâce plus longue : aucune carte jouée avant la fin de la grâce', async () => {
    // Le chrono de tour (30 ms + 500 ms de tampon réseau fixe = 530 ms) expire AVANT la grâce (1000 ms) :
    // c'est exactement le rapport réel (turnTimerSeconds ~20 s < aiRelayGraceSeconds ~25 s), à l'échelle de la ms.
    const { room, state } = setupPlayable({ aiRelayGraceSeconds: 1.0 }, 0.03);
    try {
      const gs = room.gameState!;
      const currentId = gs.players[gs.currentTurnIndex].id;
      const handBefore = gs.players[gs.currentTurnIndex].hand.length;

      room.players.find((p) => p.id === currentId)!.connected = false;
      ServerGameEngine.handlePlayerDisconnect(room, currentId, () => {}, state);

      // Bien après l'expiration du seul chrono de tour (530 ms), mais avant la fin de la grâce (1000 ms).
      await sleep(750);
      const midHand = room.gameState!.players.find((p) => p.id === currentId)!.hand.length;
      assert.equal(midHand, handBefore, 'aucune carte ne doit être jouée avant la fin du délai de grâce');
      assert.notEqual(room.gameState!.players.find((p) => p.id === currentId)!.isAiRelay, true, 'le relais ne doit pas encore avoir pris le siège');

      // Après la fin de la grâce (1000 ms) + le délai de jeu du relais (800 ms fixe) : la carte a dû être jouée.
      await sleep(1200);
      const afterHand = room.gameState!.players.find((p) => p.id === currentId)!.hand.length;
      assert.ok(afterHand < handBefore, 'le relais doit avoir joué une carte après la fin de la grâce');
    } finally {
      stop(state);
    }
  });

  it('reconnexion pendant la grâce : le joueur reprend la main, aucune carte perdue', async () => {
    const { room, state } = setupPlayable({ aiRelayGraceSeconds: 1.0 }, 0.03);
    try {
      const gs = room.gameState!;
      const currentId = gs.players[gs.currentTurnIndex].id;
      const handBefore = gs.players[gs.currentTurnIndex].hand.length;

      room.players.find((p) => p.id === currentId)!.connected = false;
      ServerGameEngine.handlePlayerDisconnect(room, currentId, () => {}, state);

      await sleep(750); // après le chrono de tour (530 ms), avant la fin de la grâce (1000 ms)
      room.players.find((p) => p.id === currentId)!.connected = true;
      ServerGameEngine.handlePlayerReconnect(room, currentId, () => {}, state);

      const handAfterReconnect = room.gameState!.players.find((p) => p.id === currentId)!.hand.length;
      assert.equal(handAfterReconnect, handBefore, 'le joueur reprend la main avec toutes ses cartes, sans coup forcé');
      assert.notEqual(room.gameState!.players.find((p) => p.id === currentId)!.relayAbsent, true);
      assert.notEqual(room.gameState!.players.find((p) => p.id === currentId)!.isAiRelay, true, 'le relais ne doit jamais avoir démarré : la reconnexion a annulé le minuteur de grâce à temps');
    } finally {
      stop(state);
    }
  });
});
