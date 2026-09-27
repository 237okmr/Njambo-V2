/**
 * Prérogative katika : exiger un compte Google pour rejoindre une table est un réglage global, par type
 * de table (publique ou privée), jamais un choix visible ou modifiable par les joueurs ni par l'hôte.
 * Toujours recalculé en direct, pour qu'un changement dans katika s'applique immédiatement, y compris
 * aux tables déjà ouvertes.
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

(globalThis as any).require = () => ({ RoomManager: { getRoom: () => null } });

import { RoomManager } from './roomManager';
import { DEFAULT_ENGINE_CONFIG } from '../engine/engineConfig';

after(() => {
  RoomManager.updateEngineConfig({ ...DEFAULT_ENGINE_CONFIG });
});

describe('politique katika : compte Google requis par type de table', () => {
  it('par défaut, aucune table (publique ou privée) n\'exige de compte Google', () => {
    RoomManager.updateEngineConfig({ publicTablesRequireGoogleAuth: false, privateTablesRequireGoogleAuth: false });
    assert.equal(RoomManager.getRequireGoogleAuthForRoom(true), false);
    assert.equal(RoomManager.getRequireGoogleAuthForRoom(false), false);
  });

  it('katika peut exiger un compte Google uniquement sur les tables publiques', () => {
    RoomManager.updateEngineConfig({ publicTablesRequireGoogleAuth: true, privateTablesRequireGoogleAuth: false });
    assert.equal(RoomManager.getRequireGoogleAuthForRoom(true), true, 'table publique : doit exiger Google');
    assert.equal(RoomManager.getRequireGoogleAuthForRoom(false), false, 'table privée : ne doit rien exiger');
  });

  it('katika peut exiger un compte Google uniquement sur les tables privées', () => {
    RoomManager.updateEngineConfig({ publicTablesRequireGoogleAuth: false, privateTablesRequireGoogleAuth: true });
    assert.equal(RoomManager.getRequireGoogleAuthForRoom(true), false, 'table publique : ne doit rien exiger');
    assert.equal(RoomManager.getRequireGoogleAuthForRoom(false), true, 'table privée : doit exiger Google');
  });

  it('un changement de politique s\'applique immédiatement, sans distinction entre tables neuves et déjà ouvertes', () => {
    RoomManager.updateEngineConfig({ publicTablesRequireGoogleAuth: false, privateTablesRequireGoogleAuth: false });
    assert.equal(RoomManager.getRequireGoogleAuthForRoom(true), false, 'avant le changement : ouverte à tous');

    RoomManager.updateEngineConfig({ publicTablesRequireGoogleAuth: true, privateTablesRequireGoogleAuth: false });
    assert.equal(RoomManager.getRequireGoogleAuthForRoom(true), true, 'après le changement : exige Google, immédiatement');
  });
});
