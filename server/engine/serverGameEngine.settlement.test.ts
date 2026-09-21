/**
 * Tests d'intégration du moteur serveur : règlement des donnes (PartieResult).
 * Vérifie sur le vrai moteur que chaque fin de donne (normale, Kora, victoires instantanées,
 * « Passer », forfait) produit un résultat dont la somme des nets est nulle et qui correspond
 * exactement à la variation réelle des capitaux.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Le moteur charge RoomManager via require() dans un chronomètre (bundle CommonJS en production).
(globalThis as any).require = () => ({ RoomManager: { getRoom: () => null } });

import { ServerGameEngine, ActiveRoomState } from './serverGameEngine';
import { DEFAULT_ENGINE_CONFIG } from './engineConfig';
import { getPlayableCards } from '../../src/utils/deck';
import type { MultiplayerRoom, RoomPlayer, PartieResult } from '../../src/types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mkPlayer(id: string, host = false): RoomPlayer {
  return {
    id, name: id, isHost: host, isHuman: true, avatarSeed: id, score: 100, capital: 100,
    isEliminated: false, isSpectator: false, hand: [], tricksWonInRound: 0, connected: true, isReady: true,
  } as RoomPlayer;
}

function setup(n: number) {
  const ids = ['A', 'B', 'C', 'D'].slice(0, n);
  const room = {
    id: 'R' + Math.random().toString(36).slice(2, 6), hostId: 'A', hostName: 'A', status: 'LOBBY',
    fillWithBots: false, maxPlayers: n, baseBet: 10, initialCapital: 100, enableDoubleKora: true, enableUnder21: true,
    players: ids.map((id, i) => mkPlayer(id, i === 0)), gameState: null, createdAt: Date.now(), updatedAt: Date.now(),
  } as unknown as MultiplayerRoom;
  const results: PartieResult[] = [];
  const state = {
    room,
    engineConfig: { ...DEFAULT_ENGINE_CONFIG, trickResolutionTimeMs: 3, transitionDelayMs: 600000, botThinkTimeMs: 1, instantWinAnimationTimeMs: 3 },
    turnTimeoutTimer: null, trickResolutionTimer: null, nextPartieTimer: null, botMoveTimer: null,
    disconnectTimers: new Map(), consecutiveTimeouts: new Map(), aiRelayTimers: new Map(),
    onPartieResult: (r: PartieResult) => results.push(r),
  } as unknown as ActiveRoomState;
  ServerGameEngine.startNewGame(room, () => {}, state);
  return { room, state, results };
}

const stop = (state: ActiveRoomState) => (ServerGameEngine as any).clearAllTimers(state);
const nets = (r: PartieResult) => Object.fromEntries(r.participants.map((p) => [p.playerId, p.net]));

describe('moteur serveur - forfait (départ, inactivité, déconnexion)', () => {
  it('2 joueurs, forfait au pli 1 : -10 / +10 (aucune pénalité)', () => {
    const { room, state, results } = setup(2);
    room.gameState!.currentTrickNumber = 1;
    ServerGameEngine.forfeitPlayer(room, 'A', () => {}, state, false, { notify: false });
    assert.equal(results.length, 1);
    assert.deepEqual(nets(results[0]), { A: -10, B: 10 });
    assert.equal(results[0].burned, 0);
    stop(state);
  });

  it('2 joueurs, forfait au pli 3 : -20 / +20 (mise + pénalité)', () => {
    const { room, state, results } = setup(2);
    room.gameState!.currentTrickNumber = 3;
    ServerGameEngine.forfeitPlayer(room, 'A', () => {}, state, false, { notify: false });
    assert.deepEqual(nets(results[0]), { A: -20, B: 20 });
    stop(state);
  });

  it('un second appel de forfait est ignoré (idempotence)', () => {
    const { room, state, results } = setup(2);
    room.gameState!.currentTrickNumber = 3;
    ServerGameEngine.forfeitPlayer(room, 'A', () => {}, state, false, { notify: false });
    ServerGameEngine.forfeitPlayer(room, 'A', () => {}, state, false, { notify: false });
    assert.equal(results.length, 1);
    stop(state);
  });

  it('3 joueurs, forfait au pli 3 : la donne continue, pot 40, siège gelé et conservé', () => {
    const { room, state, results } = setup(3);
    room.gameState!.currentTrickNumber = 3;
    ServerGameEngine.forfeitPlayer(room, 'C', () => {}, state, false, { notify: false });
    const gs = room.gameState!;
    assert.equal(results.length, 0);
    assert.equal(gs.pot, 40);
    assert.equal(gs.forfeitPenaltyPaid?.C, 10);
    assert.equal(gs.players.length, 3);
    assert.equal(gs.players.find((p) => p.id === 'C')?.forfeitedForManche, true);
    stop(state);
  });

  it('freezeSeat=false : le siège n\'est pas gelé (inactivité, ancien comportement)', () => {
    const { room, state } = setup(2);
    room.gameState!.currentTrickNumber = 2;
    ServerGameEngine.forfeitPlayer(room, 'A', () => {}, state, false, { freezeSeat: false });
    assert.notEqual(room.players.find((p) => p.id === 'A')?.forfeitedForManche, true);
    stop(state);
  });

  it('2 joueurs : la fin de manche qui suit un forfait ne crée pas de second résultat', () => {
    const { room, state, results } = setup(2);
    room.gameState!.currentTrickNumber = 3;
    ServerGameEngine.forfeitPlayer(room, 'A', () => {}, state, false, { notify: false });
    if (state.nextPartieTimer) clearTimeout(state.nextPartieTimer);
    ServerGameEngine.advanceToNextPartie(room, () => {}, state);
    assert.equal(results.length, 1);
    stop(state);
  });
});

async function playOneGame(n: number, event: 'none' | 'forfeit' | 'fold', eventAt: number) {
  const { room, state, results } = setup(n);
  let plays = 0;
  let eventDone = false;
  let steps = 0;
  while (room.status === 'PLAYING' && steps < 600) {
    const gs = room.gameState!;
    if (event !== 'none' && !eventDone && plays >= eventAt && gs.phase === 'PLAYING') {
      eventDone = true;
      const alive = gs.players.filter((p) => !p.isEliminated && !p.isForfeit);
      const victim = alive[Math.floor(Math.random() * alive.length)];
      if (event === 'forfeit') ServerGameEngine.forfeitPlayer(room, victim.id, () => {}, state, false, { notify: false });
      else ServerGameEngine.handleFoldRound(room, victim.id, () => {}, state);
    }
    if (room.status === 'PLAYING' && gs.phase === 'PLAYING') {
      const p = gs.players[gs.currentTurnIndex];
      if (p && !p.isEliminated && !p.isForfeit && !p.isFoldedInRound && p.hand.length > 0) {
        const playable = getPlayableCards(p.hand, gs.currentTrick?.leadSuit ?? null);
        const card = playable[Math.floor(Math.random() * playable.length)];
        if (card && ServerGameEngine.handlePlayCard(room, p.id, card.id, () => {}, state)) plays++;
      }
    }
    await sleep(4);
    steps++;
  }
  stop(state);
  return { room, results };
}

describe('moteur serveur - donnes aléatoires (conservation des jetons)', () => {
  it('60 donnes (2 à 4 joueurs, avec forfaits et « Passer ») : somme nulle et net = variation du capital', async () => {
    const problems: string[] = [];
    for (let i = 0; i < 60; i++) {
      const n = 2 + (i % 3);
      const event = (['none', 'none', 'forfeit', 'fold'] as const)[i % 4];
      const { room, results } = await playOneGame(n, event, Math.floor(Math.random() * n * 4));
      if (results.length === 0) {
        if (room.status === 'PARTIE_OVER' || room.status === 'MANCHE_OVER') problems.push(`donne terminée sans résultat (n=${n}, ${event})`);
        continue;
      }
      const r = results[0];
      const sum = r.participants.reduce((s, p) => s + p.net, 0);
      if (sum !== 0 || r.burned !== 0) problems.push(`somme=${sum} détruit=${r.burned} (n=${n}, ${event}, ${r.winType})`);
      for (const p of r.participants) {
        const cap = room.gameState!.players.find((g) => g.id === p.playerId)?.capital ?? 0;
        if (cap - 100 !== p.net) problems.push(`net ${p.net} != variation ${cap - 100} pour ${p.playerId} (n=${n}, ${event}, ${r.winType})`);
      }
    }
    assert.deepEqual(problems, []);
  });
});
