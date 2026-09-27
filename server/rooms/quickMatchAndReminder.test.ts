/**
 * Partie Rapide : ne doit jamais assigner un joueur à une table dont la mise est très différente de
 * celle qu'il a demandée (quickMatchBetToleranceRatio). Relance "table en attente" (botFillReminderSeconds) :
 * prévient l'hôte une seule fois si une table publique reste incomplète trop longtemps.
 */
import { describe, it, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

(globalThis as any).require = () => ({ RoomManager: { getRoom: () => null } });

import { RoomManager } from './roomManager';
import { ServerGameEngine } from '../engine/serverGameEngine';
import { DEFAULT_ENGINE_CONFIG } from '../engine/engineConfig';
import type { MultiplayerRoom, RoomPlayer } from '../../src/types';

after(() => {
  RoomManager.updateEngineConfig({ ...DEFAULT_ENGINE_CONFIG });
});

function mkPlayer(id: string, isHost = false): RoomPlayer {
  return {
    id, name: id, isHost, isHuman: true, avatarSeed: id, score: 100, capital: 100,
    isEliminated: false, isSpectator: false, hand: [], tricksWonInRound: 0, connected: true, isReady: true,
  } as RoomPlayer;
}

function mkRoom(id: string, baseBet: number, createdAt: number = Date.now()): MultiplayerRoom {
  return {
    id, hostId: id + '_host', hostName: 'Hôte', status: 'LOBBY', fillWithBots: false, maxPlayers: 2,
    baseBet, initialCapital: baseBet * 10, enableDoubleKora: true, enableUnder21: true, isPublic: true,
    players: [mkPlayer(id + '_host', true)], gameState: null, createdAt, updatedAt: createdAt,
  } as unknown as MultiplayerRoom;
}

/** Nettoie tout minuteur réel qu'un appel aurait pu armer (nouvelle table créée, partie démarrée...). */
function stopAllTimersFor(roomId: string) {
  const state = (RoomManager as any).roomStates?.get(roomId);
  if (state) ServerGameEngine.clearAllTimers(state);
}

describe('Partie Rapide : tolérance de mise', () => {
  let sentMessages: any[] = [];
  const fakeSocket = () => ({ readyState: 1, send: (data: string) => sentMessages.push(JSON.parse(data)), on: () => {} });

  beforeEach(() => {
    sentMessages = [];
  });

  it('rejoint la table dont la mise est proche, jamais celle très différente', () => {
    RoomManager.updateEngineConfig({ quickMatchBetToleranceRatio: 2 });
    const farRoom = mkRoom('QM_FAR', 10);
    const closeRoom = mkRoom('QM_CLOSE', 100);
    RoomManager.setRoomForTest(farRoom.id, farRoom);
    RoomManager.setRoomForTest(closeRoom.id, closeRoom);

    try {
      const client = RoomManager.registerClient(fakeSocket() as any, undefined, 'usr_quickmatch_1');
      (client.socket as any).send = (data: string) => sentMessages.push(JSON.parse(data));

      (RoomManager as any).handleQuickMatchRequest(client, {
        type: 'QUICK_MATCH_REQUEST',
        playerName: 'Testeur',
        settings: { baseBet: 90 },
      });

      const result = sentMessages.find((m) => m.type === 'QUICK_MATCH_RESULT');
      assert.ok(result, 'un QUICK_MATCH_RESULT doit être envoyé');
      assert.equal(result.matchedRoomCode, 'QM_CLOSE', 'doit rejoindre la table à mise proche (100), jamais celle à mise très différente (10)');
    } finally {
      stopAllTimersFor('QM_FAR');
      stopAllTimersFor('QM_CLOSE');
    }
  });

  it('crée une nouvelle table si aucune mise proche n\'est disponible', () => {
    RoomManager.updateEngineConfig({ quickMatchBetToleranceRatio: 2 });
    const farRoom = mkRoom('QM_FAR2', 10);
    RoomManager.setRoomForTest(farRoom.id, farRoom);

    let newRoomCode: string | undefined;
    try {
      const client = RoomManager.registerClient(fakeSocket() as any, undefined, 'usr_quickmatch_2');
      (client.socket as any).send = (data: string) => sentMessages.push(JSON.parse(data));

      (RoomManager as any).handleQuickMatchRequest(client, {
        type: 'QUICK_MATCH_REQUEST',
        playerName: 'Testeur2',
        settings: { baseBet: 100 },
      });

      const result = sentMessages.find((m) => m.type === 'QUICK_MATCH_RESULT');
      assert.ok(result);
      assert.notEqual(result.matchedRoomCode, 'QM_FAR2', 'ne doit jamais rejoindre une table à mise trop différente');
      newRoomCode = result.matchedRoomCode;
    } finally {
      stopAllTimersFor('QM_FAR2');
      if (newRoomCode) stopAllTimersFor(newRoomCode);
    }
  });
});

describe('Relance "table en attente" (botFillReminderSeconds)', () => {
  it('prévient l\'hôte une seule fois après le délai réglé, jamais avant', () => {
    RoomManager.updateEngineConfig({ botFillReminderSeconds: 15 }); // 15 s : minimum autorisé par le registre
    let alertsSent = 0;
    const room = mkRoom('REMIND_1', 10, Date.now() - 5000); // créée il y a 5 s : pas encore assez (< 15 s)
    RoomManager.setRoomForTest(room.id, room);
    try {
      const state = (RoomManager as any).getOrCreateActiveState(room.id, room);
      state.onPlayerAlert = (playerId: string, r: MultiplayerRoom, alert: any) => {
        if (alert.kind === 'BOT_FILL_REMINDER') alertsSent++;
      };

      RoomManager.tickRoom(room.id);
      assert.equal(alertsSent, 0, 'pas encore relancé avant le délai');
      assert.ok(!room.botFillReminderSent);

      room.createdAt = Date.now() - 16000; // recule artificiellement l'horloge de création : au-delà des 15 s
      RoomManager.tickRoom(room.id);
      assert.equal(alertsSent, 1, 'relancé une fois, passé le délai');

      RoomManager.tickRoom(room.id);
      assert.equal(alertsSent, 1, 'jamais relancé une deuxième fois pour la même table');
    } finally {
      stopAllTimersFor(room.id);
    }
  });

  it('ne relance jamais une table déjà réglée pour se remplir avec des bots', () => {
    RoomManager.updateEngineConfig({ botFillReminderSeconds: 15 });
    let alertsSent = 0;
    const room = mkRoom('REMIND_2', 10, Date.now() - 20000);
    room.fillWithBots = true;
    RoomManager.setRoomForTest(room.id, room);
    try {
      const state = (RoomManager as any).getOrCreateActiveState(room.id, room);
      state.onPlayerAlert = (playerId: string, r: MultiplayerRoom, alert: any) => {
        if (alert.kind === 'BOT_FILL_REMINDER') alertsSent++;
      };

      RoomManager.tickRoom(room.id);
      assert.equal(alertsSent, 0);
    } finally {
      stopAllTimersFor(room.id);
    }
  });
});
