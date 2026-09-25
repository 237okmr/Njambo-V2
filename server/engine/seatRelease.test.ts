/**
 * Libération d'un siège absent (tables de 3 ou 4 joueurs) : après absentSeatReleaseAfterParties
 * parties consécutives déclarées forfait pour absence, le siège est confié à un bot et redevient
 * disponible pour un observateur. Le compteur repart de zéro dès qu'un joueur est présent.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

(globalThis as any).require = () => ({ RoomManager: { getRoom: () => null } });

import { ServerGameEngine, ActiveRoomState } from './serverGameEngine';
import { DEFAULT_ENGINE_CONFIG } from './engineConfig';
import type { MultiplayerRoom, RoomPlayer, GameState } from '../../src/types';

function mkRoomPlayer(id: string, overrides: Partial<RoomPlayer> = {}): RoomPlayer {
  return {
    id, name: id, isHost: id === 'A', isHuman: true, avatarSeed: id, score: 100, capital: 100,
    isEliminated: false, isSpectator: false, hand: [], tricksWonInRound: 0, connected: true, isReady: true,
    ...overrides,
  } as RoomPlayer;
}

/** Table à 3 joueurs (A, B, C), prête à recevoir des appels répétés d'advanceToNextPartie. */
function setupTable(config: Record<string, unknown>) {
  const ids = ['A', 'B', 'C'];
  const room = {
    id: 'SEAT_' + Math.random().toString(36).slice(2, 6), hostId: 'A', hostName: 'A', status: 'PARTIE_OVER',
    fillWithBots: false, maxPlayers: 3, baseBet: 10, initialCapital: 100, enableDoubleKora: true, enableUnder21: true,
    players: ids.map((id) => mkRoomPlayer(id)),
    createdAt: Date.now(), updatedAt: Date.now(),
  } as unknown as MultiplayerRoom;

  room.gameState = {
    phase: 'PARTIE_OVER',
    players: ids.map((id) => ({
      id, name: id, capital: 100, isEliminated: false, hand: [], isHuman: true, tricksWonInRound: 0,
    })),
    pot: 0, currentTurnIndex: 0, baseBet: 10, dealerIndex: 0, partieCount: 1,
  } as unknown as GameState;

  const state = {
    room,
    engineConfig: { ...DEFAULT_ENGINE_CONFIG, transitionDelayMs: 600000, botThinkTimeMs: 1, trickResolutionTimeMs: 1, instantWinAnimationTimeMs: 1, ...config },
    turnTimeoutTimer: null, trickResolutionTimer: null, nextPartieTimer: null, botMoveTimer: null,
    disconnectTimers: new Map(), consecutiveTimeouts: new Map(), aiRelayTimers: new Map(),
    onPlayerAlert: () => {},
  } as unknown as ActiveRoomState;

  return { room, state };
}

function playerOf(room: MultiplayerRoom, id: string): RoomPlayer {
  return room.players.find((p) => p.id === id)!;
}

describe('libération d\'un siège absent après plusieurs parties consécutives', () => {
  it('le siège est confié à un bot au seuil réglé, jamais avant', () => {
    const { room, state } = setupTable({ absentSeatReleaseAfterParties: 3 });
    // C est absent (déconnecté) dès le départ, A et B sont présents.
    playerOf(room, 'C').connected = false;

    try {
      // Partie 1 : C est declared forfait pour cette partie (compteur = 1), toujours humain.
      ServerGameEngine.advanceToNextPartie(room, () => {}, state);
      assert.equal(playerOf(room, 'C').consecutiveAbsentParties, 1);
      assert.equal(playerOf(room, 'C').isHuman, true, 'pas encore libéré (1 < 3)');

      // Partie 2 : compteur = 2, toujours humain.
      ServerGameEngine.advanceToNextPartie(room, () => {}, state);
      assert.equal(playerOf(room, 'C').consecutiveAbsentParties, 2);
      assert.equal(playerOf(room, 'C').isHuman, true, 'pas encore libéré (2 < 3)');

      // Partie 3 : le seuil est atteint, le siège est libéré (converti en bot).
      ServerGameEngine.advanceToNextPartie(room, () => {}, state);
      const c = playerOf(room, 'C');
      assert.equal(c.isHuman, false, 'le siège doit être confié à un bot au seuil');
      assert.ok(c.name.includes('(Bot)'), 'le siège porte désormais le nom de bot habituel');
      assert.equal(c.isForfeit, false, 'un bot ne reste pas marqué forfait : il rejoue normalement');
      // Le bot rejoue aussitôt cette même partie (mise de 10 déduite comme pour tout participant) :
      // le capital n'est jamais détruit ni remis à zéro, il reste à la table sous contrôle du bot.
      assert.equal(c.capital, 90, 'le capital du siège est conservé (transféré au bot, ante de la donne en cours déduite comme pour tout joueur)');

      // Les joueurs présents ne sont jamais comptabilisés comme absents.
      assert.equal(playerOf(room, 'A').consecutiveAbsentParties || 0, 0);
      assert.equal(playerOf(room, 'B').consecutiveAbsentParties || 0, 0);
    } finally {
      ServerGameEngine.clearAllTimers(state);
    }
  });

  it('le retour du joueur avant le seuil remet le compteur à zéro', () => {
    const { room, state } = setupTable({ absentSeatReleaseAfterParties: 3 });
    playerOf(room, 'C').connected = false;

    try {
      ServerGameEngine.advanceToNextPartie(room, () => {}, state); // 1
      ServerGameEngine.advanceToNextPartie(room, () => {}, state); // 2
      assert.equal(playerOf(room, 'C').consecutiveAbsentParties, 2);

      // C revient et confirme sa présence pour la partie suivante.
      playerOf(room, 'C').connected = true;
      playerOf(room, 'C').readyForNextPartie = true;
      ServerGameEngine.advanceToNextPartie(room, () => {}, state); // présent

      const c = playerOf(room, 'C');
      assert.equal(c.consecutiveAbsentParties, 0, 'le compteur repart de zéro dès la présence');
      assert.equal(c.isHuman, true, 'le siège n\'est jamais libéré s\'il revient à temps');
    } finally {
      ServerGameEngine.clearAllTimers(state);
    }
  });

  it('à 2 joueurs, aucun siège n\'est jamais libéré (règle du forfait de manche déjà applicable)', () => {
    const ids = ['A', 'B'];
    const room = {
      id: 'SEAT2', hostId: 'A', hostName: 'A', status: 'PARTIE_OVER', fillWithBots: false, maxPlayers: 2,
      baseBet: 10, initialCapital: 100, enableDoubleKora: true, enableUnder21: true,
      players: ids.map((id) => mkRoomPlayer(id)), createdAt: Date.now(), updatedAt: Date.now(),
      gameState: {
        phase: 'PARTIE_OVER',
        players: ids.map((id) => ({ id, name: id, capital: 100, isEliminated: false, hand: [], isHuman: true, tricksWonInRound: 0 })),
        pot: 0, currentTurnIndex: 0, baseBet: 10, dealerIndex: 0, partieCount: 1,
      },
    } as unknown as MultiplayerRoom;
    const state = {
      room,
      engineConfig: { ...DEFAULT_ENGINE_CONFIG, absentSeatReleaseAfterParties: 2, transitionDelayMs: 600000, botThinkTimeMs: 1, trickResolutionTimeMs: 1, instantWinAnimationTimeMs: 1 },
      turnTimeoutTimer: null, trickResolutionTimer: null, nextPartieTimer: null, botMoveTimer: null,
      disconnectTimers: new Map(), consecutiveTimeouts: new Map(), aiRelayTimers: new Map(),
      onPlayerAlert: () => {},
    } as unknown as ActiveRoomState;

    playerOf(room, 'B').connected = false;
    try {
      for (let i = 0; i < 5 && room.status !== 'MANCHE_OVER'; i++) {
        ServerGameEngine.advanceToNextPartie(room, () => {}, state);
      }
      // À 2 joueurs, l'absence donne la manche par forfait avant même que la libération n'entre en jeu.
      assert.equal(playerOf(room, 'B').isHuman, true, 'le siège n\'est jamais transformé en bot à 2 joueurs');
    } finally {
      ServerGameEngine.clearAllTimers(state);
    }
  });
});
