/**
 * Aperçu d'une table Kora Cash pour l'invité : ce qu'il voit, ce qu'il ne voit jamais, et le limiteur de codes.
 */

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCashTablePreview } from './cashInvitePreview';
import { RoomManager } from '../rooms/roomManager';
import type { MultiplayerRoom } from '../../src/types';

const manager = RoomManager as any;

function cashRoom(overrides: Record<string, unknown> = {}): MultiplayerRoom {
  return {
    id: 'FJW3',
    hostId: 'host-1',
    hostName: 'Hokuto',
    isPublic: false,
    status: 'LOBBY',
    maxPlayers: 3,
    baseBet: 500,
    players: [
      { id: 'host-1', name: 'Hokuto', capital: 5000 },
      { id: 'autre-2', name: 'Secret Joueur', capital: 7777 },
    ],
    cash: {
      tableId: 'tbl-1',
      environment: 'DEMO',
      rakePercent: 4,
      minBuyIn: 2500,
      maxBuyInMultiple: 20,
      betLevel: 500,
      seats: { 'host-1': { settled: 5000, buyInTotal: 5000, open: true }, 'autre-2': { settled: 7777, buyInTotal: 7777, open: true } },
    },
    ...overrides,
  } as unknown as MultiplayerRoom;
}

describe('aperçu d’une table Kora Cash', () => {
  afterEach(() => {
    manager.rooms.clear();
    manager.failedJoinAttempts.clear();
  });

  it('montre mise, commission, places, hôte et fourchette d’entrée d’une table ouverte', () => {
    const p = buildCashTablePreview(cashRoom(), 'invite-9');
    assert.equal(p.state, 'OPEN');
    assert.equal(p.bet, 500);
    assert.equal(p.rakePercent, 4);
    assert.equal(p.seated, 2);
    assert.equal(p.capacity, 3);
    assert.equal(p.hostName, 'Hokuto');
    assert.equal(p.minBuyIn, 2500);
    assert.equal(p.maxBuyIn, 10000);
  });

  it('ne laisse sortir ni capital ni nom des autres joueurs', () => {
    const json = JSON.stringify(buildCashTablePreview(cashRoom(), 'invite-9'));
    assert.ok(!json.includes('Secret Joueur'));
    assert.ok(!json.includes('7777'));
    assert.ok(!json.includes('5000'));
    assert.ok(!json.includes('autre-2'));
  });

  it('traite pareil une table inexistante et une table gratuite', () => {
    assert.deepEqual(buildCashTablePreview(undefined, 'u'), { state: 'UNAVAILABLE' });
    assert.deepEqual(buildCashTablePreview(cashRoom({ cash: undefined }), 'u'), { state: 'UNAVAILABLE' });
  });

  it('distingue complète, commencée, terminée et « déjà assis »', () => {
    assert.equal(buildCashTablePreview(cashRoom({ maxPlayers: 2 }), 'u').state, 'FULL');
    assert.equal(buildCashTablePreview(cashRoom({ status: 'PLAYING' }), 'u').state, 'STARTED');
    const closed = cashRoom();
    closed.cash!.closed = true;
    assert.equal(buildCashTablePreview(closed, 'u').state, 'CLOSED');
    assert.equal(buildCashTablePreview(cashRoom(), 'host-1').state, 'MINE');
  });

  it('ne donne pas le détail d’une table qu’on ne peut plus rejoindre', () => {
    const p = buildCashTablePreview(cashRoom({ status: 'PLAYING' }), 'u');
    assert.equal(p.hostName, undefined);
    assert.equal(p.seated, undefined);
    assert.equal(p.minBuyIn, undefined);
    assert.equal(p.betLevel, 500);
  });

  it('refuse les codes mal formés sans les chercher', () => {
    manager.rooms.set('FJW3', cashRoom());
    assert.equal(RoomManager.previewCashTable('u1', 'x').preview.state, 'UNAVAILABLE');
    assert.equal(RoomManager.previewCashTable('u1', undefined).preview.state, 'UNAVAILABLE');
    assert.equal(RoomManager.previewCashTable('u1', 'fjw3').preview.state, 'OPEN');
  });

  it('limite les essais ratés comme l’entrée par code, puis laisse passer après un succès', () => {
    manager.rooms.set('FJW3', cashRoom());
    for (let i = 0; i < 6; i++) {
      assert.equal(RoomManager.previewCashTable('u1', 'ZZZZ').limited, false);
    }
    assert.equal(RoomManager.previewCashTable('u1', 'FJW3').limited, true);
    // Un autre joueur n'est pas pénalisé.
    assert.equal(RoomManager.previewCashTable('u2', 'FJW3').preview.state, 'OPEN');
    // Un succès remet le compteur à zéro.
    manager.failedJoinAttempts.clear();
    RoomManager.previewCashTable('u3', 'ZZZZ');
    RoomManager.previewCashTable('u3', 'FJW3');
    assert.equal(manager.failedJoinAttempts.has('cash-preview:u3'), false);
  });
});
