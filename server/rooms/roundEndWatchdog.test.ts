import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from './roomManager';
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
    status: 'PARTIE_OVER',
    players: [],
    maxPlayers: 2,
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

test('filet de sécurité : un compte à rebours expiré depuis longtemps relance la partie suivante', () => {
  const now = Date.now();
  const p1 = mockPlayer({ id: 'p1', name: 'Alice', isHost: true });
  const p2 = mockPlayer({ id: 'p2', name: 'Bob' });
  const room = mockRoom({
    id: 'WATCH1',
    hostId: 'p1',
    hostName: 'Alice',
    players: [p1, p2],
    roundEndAutoAdvanceAt: now - 5000, // expiré depuis longtemps : le timer d'origine a été « perdu »
    gameState: { phase: 'PARTIE_OVER', players: [
      { id: 'p1', name: 'Alice', capital: 100, isEliminated: false, hand: [], isHuman: true, tricksWonInRound: 0 },
      { id: 'p2', name: 'Bob', capital: 100, isEliminated: false, hand: [], isHuman: true, tricksWonInRound: 0 },
    ], pot: 0, currentTurnIndex: 0, baseBet: 10, dealerIndex: 0, partieCount: 1 } as any,
  });
  (RoomManager as any).rooms.set(room.id, room);
  try {
    RoomManager.tickRoom(room.id);
    const after = (RoomManager as any).rooms.get(room.id);
    // Le filet a dû relancer : soit une nouvelle partie (PLAYING), soit la manche est terminée
    // (MANCHE_OVER, capital insuffisant) — jamais rester bloqué en PARTIE_OVER indéfiniment.
    assert.notEqual(after.status, 'PARTIE_OVER');
  } finally {
    const state = (RoomManager as any).roomStates?.get(room.id);
    if (state?.nextPartieTimer) clearTimeout(state.nextPartieTimer);
    (RoomManager as any).roomStates?.delete(room.id);
    (RoomManager as any).rooms.delete(room.id);
  }
});

test('compte à rebours manquant (après un vote refusé) : le filet le réarme au lieu de laisser la table bloquée', () => {
  const now = Date.now();
  const p1 = mockPlayer({ id: 'p1', name: 'Alice', isHost: true });
  const p2 = mockPlayer({ id: 'p2', name: 'Bob' });
  const room = mockRoom({
    id: 'WATCH2',
    hostId: 'p1',
    hostName: 'Alice',
    players: [p1, p2],
    roundEndAutoAdvanceAt: null,
    gameState: { phase: 'PARTIE_OVER', players: [
      { id: 'p1', name: 'Alice', capital: 100, isEliminated: false, hand: [], isHuman: true, tricksWonInRound: 0 },
      { id: 'p2', name: 'Bob', capital: 100, isEliminated: false, hand: [], isHuman: true, tricksWonInRound: 0 },
    ], pot: 0, currentTurnIndex: 0, baseBet: 10, dealerIndex: 0, partieCount: 1 } as any,
  });
  (RoomManager as any).rooms.set(room.id, room);
  try {
    RoomManager.tickRoom(room.id);
    const after = (RoomManager as any).rooms.get(room.id);
    assert.equal(after.status, 'PARTIE_OVER', 'la table reste en attente, mais avec un compte à rebours');
    assert.ok(after.roundEndAutoAdvanceAt && after.roundEndAutoAdvanceAt > now, 'un nouveau compte à rebours doit être armé');
  } finally {
    const state = (RoomManager as any).roomStates?.get(room.id);
    if (state?.nextPartieTimer) clearTimeout(state.nextPartieTimer);
    (RoomManager as any).roomStates?.delete(room.id);
    (RoomManager as any).rooms.delete(room.id);
  }
});

test('un vote de hausse en cours empêche le filet de relancer la partie', () => {
  const now = Date.now();
  const p1 = mockPlayer({ id: 'p1', name: 'Alice', isHost: true });
  const p2 = mockPlayer({ id: 'p2', name: 'Bob' });
  const room = mockRoom({
    id: 'WATCH3',
    hostId: 'p1',
    hostName: 'Alice',
    players: [p1, p2],
    roundEndAutoAdvanceAt: now - 5000,
    betIncreaseProposal: { proposerId: 'p1', proposedBet: 20, expiresAt: now + 10000 } as any,
    gameState: { phase: 'PARTIE_OVER', players: [], pot: 0, currentTurnIndex: 0 } as any,
  });
  (RoomManager as any).rooms.set(room.id, room);
  try {
    RoomManager.tickRoom(room.id);
    const after = (RoomManager as any).rooms.get(room.id);
    assert.equal(after.status, 'PARTIE_OVER');
    assert.equal(after.gameState.phase, 'PARTIE_OVER', 'le vote en cours doit être respecté, pas court-circuité');
  } finally {
    const state = (RoomManager as any).roomStates?.get(room.id);
    if (state?.nextPartieTimer) clearTimeout(state.nextPartieTimer);
    (RoomManager as any).roomStates?.delete(room.id);
    (RoomManager as any).rooms.delete(room.id);
  }
});

test('Forcer le départ : un joueur non-hôte peut forcer si l\'hôte est absent depuis longtemps', () => {
  const now = Date.now();
  const p1 = mockPlayer({ id: 'p1', name: 'Alice', isHost: true, connected: false, lastSeen: now - 30000 } as any);
  const p2 = mockPlayer({ id: 'p2', name: 'Bob' });
  const room = mockRoom({
    id: 'WATCH4',
    hostId: 'p1',
    hostName: 'Alice',
    players: [p1, p2],
    status: 'PARTIE_OVER',
    gameState: { phase: 'PARTIE_OVER', players: [
      { id: 'p1', name: 'Alice', capital: 100, isEliminated: false, hand: [], isHuman: true, tricksWonInRound: 0 },
      { id: 'p2', name: 'Bob', capital: 100, isEliminated: false, hand: [], isHuman: true, tricksWonInRound: 0 },
    ], pot: 0, currentTurnIndex: 0, baseBet: 10 } as any,
  });
  (RoomManager as any).rooms.set(room.id, room);
  const fakeSocket = { readyState: 1, send: () => {} } as any;
  try {
    (RoomManager as any).handleForceNextPartie({ playerId: 'p2', roomCode: room.id, socket: fakeSocket }, {});
    const after = (RoomManager as any).rooms.get(room.id);
    assert.notEqual(after.status, 'PARTIE_OVER', 'la table doit avancer même si c\'est un non-hôte qui a forcé');
  } finally {
    const state = (RoomManager as any).roomStates?.get(room.id);
    if (state?.nextPartieTimer) clearTimeout(state.nextPartieTimer);
    (RoomManager as any).roomStates?.delete(room.id);
    (RoomManager as any).rooms.delete(room.id);
  }
});

test('Forcer le départ : un non-hôte ne peut pas forcer si l\'hôte est encore récemment présent', () => {
  const now = Date.now();
  const p1 = mockPlayer({ id: 'p1', name: 'Alice', isHost: true, connected: false, lastSeen: now - 2000 } as any);
  const p2 = mockPlayer({ id: 'p2', name: 'Bob' });
  const room = mockRoom({
    id: 'WATCH5',
    hostId: 'p1',
    hostName: 'Alice',
    players: [p1, p2],
    status: 'PARTIE_OVER',
    gameState: { phase: 'PARTIE_OVER', players: [], pot: 0, currentTurnIndex: 0 } as any,
  });
  (RoomManager as any).rooms.set(room.id, room);
  const fakeSocket = { readyState: 1, send: () => {} } as any;
  try {
    (RoomManager as any).handleForceNextPartie({ playerId: 'p2', roomCode: room.id, socket: fakeSocket }, {});
    const after = (RoomManager as any).rooms.get(room.id);
    assert.equal(after.status, 'PARTIE_OVER', 'trop tôt : la demande doit être ignorée');
  } finally {
    const state = (RoomManager as any).roomStates?.get(room.id);
    if (state?.nextPartieTimer) clearTimeout(state.nextPartieTimer);
    (RoomManager as any).roomStates?.delete(room.id);
    (RoomManager as any).rooms.delete(room.id);
  }
});
