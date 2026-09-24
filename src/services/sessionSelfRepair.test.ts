import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Setup browser-like globals for Node test environment if not present
if (typeof (globalThis as any).localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => { store.set(key, String(val)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; },
  };
}

if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {
    location: { protocol: 'http:', host: 'localhost:3000' },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

if (typeof (globalThis as any).document === 'undefined') {
  (globalThis as any).document = {
    hidden: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

import { getPlayerId, setLocalPlayerId } from './identity';
import { wsService } from './websocketService';
import { auth } from '../lib/firebase';
import type { ServerMessage } from '../../server/types';
import { RoomManager } from '../../server/rooms/roomManager';

describe('Auto-réparation de l\'identité client sur SESSION_READY', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset internal state of wsService
    (wsService as any).activeRoomCode = null;
    (wsService as any).currentRoom = null;
    (wsService as any).sessionRoomPlayerId = null;
    (wsService as any).lastConnectedPlayerId = null;
    (wsService as any).isSessionTakenOver = false;
  });

  it('adopte la nouvelle identité et le jeton hors de toute table quand le serveur attribue un playerId différent', () => {
    // 1. Initial local identity
    const initialId = 'usr_client_old_111';
    const initialToken = 'tok_client_old_111';
    setLocalPlayerId(initialId);
    wsService.setReconnectToken(initialToken);

    assert.strictEqual(getPlayerId(), initialId);
    assert.strictEqual(wsService.getReconnectToken(), initialToken);
    assert.strictEqual(wsService.getLocalPlayerId(), initialId);

    // 2. Server sends SESSION_READY with a different assigned identity
    const serverAssignedId = 'usr_server_assigned_222';
    const serverAssignedToken = 'tok_server_assigned_222';

    const sessionReadyMsg: ServerMessage = {
      type: 'SESSION_READY',
      playerId: serverAssignedId,
      reconnectToken: serverAssignedToken,
      timestamp: Date.now(),
    };

    wsService.handleServerMessage(sessionReadyMsg);

    // 3. Verify local persistent identity and token are updated
    assert.strictEqual(getPlayerId(), serverAssignedId, 'L\'identifiant persistant getPlayerId() doit être mis à jour');
    assert.strictEqual(wsService.getLocalPlayerId(), serverAssignedId, 'wsService.getLocalPlayerId() doit retourner la nouvelle identité');
    assert.strictEqual(wsService.getReconnectToken(), serverAssignedToken, 'Le reconnectToken doit être mis à jour');

    // 4. Verify no error persists on the next action (e.g. server validates client message with new identity)
    const mockSocket = {
      readyState: 1,
      send: () => {},
    } as any;

    // Register this client on server with the serverAssignedId
    const client = (RoomManager as any).registerClient(mockSocket, serverAssignedToken, serverAssignedId, 'sess_test_1');

    // Verify next client action with the adopted identity is accepted without AUTH_REQUIRED
    const clientActionMsg = {
      type: 'PING' as const,
      playerId: wsService.getLocalPlayerId(),
      timestamp: Date.now(),
    };

    let authErrorOccurred = false;
    mockSocket.send = (data: string) => {
      const parsed = JSON.parse(data);
      if (parsed.type === 'ERROR' && parsed.errorCode === 'AUTH_REQUIRED') {
        authErrorOccurred = true;
      }
    };

    (RoomManager as any).handleMessage(client, JSON.stringify(clientActionMsg));
    assert.strictEqual(authErrorOccurred, false, 'L\'action suivante ne doit pas lever d\'erreur AUTH_REQUIRED');
  });

  it('ferme proprement la table et informe l\'utilisateur si le serveur force un changement d\'identité en pleine partie', () => {
    const initialId = 'usr_player_in_room_333';
    setLocalPlayerId(initialId);
    (wsService as any).activeRoomCode = 'ROOM_ABC';
    (wsService as any).currentRoom = { id: 'ROOM_ABC', status: 'PLAYING', players: [] } as any;

    let errorNotified: { error: string; code?: string } | null = null;
    const unsubError = wsService.onError((err, code) => {
      errorNotified = { error: err, code };
    });

    let roomUpdateReceived: any = 'not_null';
    const unsubRoom = wsService.onRoomUpdate((room) => {
      roomUpdateReceived = room;
    });

    const newServerId = 'usr_forced_id_444';
    const newToken = 'tok_forced_444';

    wsService.handleServerMessage({
      type: 'SESSION_READY',
      playerId: newServerId,
      reconnectToken: newToken,
      timestamp: Date.now(),
    });

    // Table must be cleanly closed
    assert.strictEqual((wsService as any).activeRoomCode, null, 'activeRoomCode doit être réinitialisé à null');
    assert.strictEqual((wsService as any).currentRoom, null, 'currentRoom doit être réinitialisé à null');
    assert.strictEqual(roomUpdateReceived, null, 'onRoomUpdate(null) doit être émis pour fermer la table');

    // User must be notified
    assert.ok(errorNotified, 'Une notification d\'erreur doit être émise');
    assert.strictEqual(errorNotified!.code, 'SESSION_RESET');

    // Identity must be updated so rejoining works
    assert.strictEqual(getPlayerId(), newServerId);
    assert.strictEqual(wsService.getReconnectToken(), newToken);

    unsubError();
    unsubRoom();
  });

  it('protège la table et conserve l\'UID quand un joueur Google en table reçoit un SESSION_READY provisoire', () => {
    // 1. Authenticated Google user in active table
    const googleUid = 'google_user_uid_123';
    (auth as any).currentUser = {
      uid: googleUid,
      isAnonymous: false,
    };
    setLocalPlayerId(googleUid);
    wsService.setReconnectToken('google_token_123');

    (wsService as any).activeRoomCode = 'ROOM_XYZ';
    (wsService as any).currentRoom = { id: 'ROOM_XYZ', status: 'PLAYING', players: [] } as any;

    let errorNotified = false;
    const unsubError = wsService.onError(() => {
      errorNotified = true;
    });

    // 2. Server sends provisional SESSION_READY with a temporary guest ID
    const provisionalGuestId = 'usr_temp_guest_456';
    const provisionalToken = 'tok_temp_456';

    wsService.handleServerMessage({
      type: 'SESSION_READY',
      playerId: provisionalGuestId,
      reconnectToken: provisionalToken,
      provisional: true,
      timestamp: Date.now(),
    });

    // 3. Table remains intact, no SESSION_RESET error, Google UID conserved
    assert.strictEqual((wsService as any).activeRoomCode, 'ROOM_XYZ', 'La table doit rester intacte');
    assert.notStrictEqual((wsService as any).currentRoom, null, 'currentRoom ne doit pas être réinitialisé');
    assert.strictEqual(errorNotified, false, 'Aucune erreur SESSION_RESET ne doit être émise');
    assert.strictEqual(getPlayerId(), googleUid, 'L\'UID Google doit être conservé dans getPlayerId()');
    assert.strictEqual(wsService.getLocalPlayerId(), googleUid, 'getLocalPlayerId() doit retourner l\'UID Google');

    unsubError();
    (auth as any).currentUser = null;
  });

  it('réaligne l\'identité sans SESSION_RESET lorsqu\'une erreur avec expectedPlayerId est reçue pour un compte Google', () => {
    // 1. Google user whose local identity was improperly pointing to an old temporary guest ID
    const googleUid = 'google_user_uid_123';
    (auth as any).currentUser = {
      uid: googleUid,
      isAnonymous: false,
    };

    const oldTempId = 'usr_old_temp_789';
    setLocalPlayerId(oldTempId);

    (wsService as any).activeRoomCode = 'ROOM_XYZ';
    (wsService as any).currentRoom = { id: 'ROOM_XYZ', status: 'PLAYING', players: [] } as any;

    let resetErrorOccurred = false;
    const unsubError = wsService.onError((_err, code) => {
      if (code === 'SESSION_RESET') {
        resetErrorOccurred = true;
      }
    });

    (wsService as any).socket = {
      readyState: 1,
      close: () => {},
      send: () => {},
    };
    (wsService as any).authConfirmedOnThisSocket = true;

    // 2. Server rejects message and sends expectedPlayerId matching Google UID
    wsService.handleServerMessage({
      type: 'ERROR',
      errorCode: 'AUTH_REQUIRED',
      error: 'Action non autorisée : identifiant joueur invalide pour cette connexion.',
      expectedPlayerId: googleUid,
    });

    // 3. Verify identity realigned to Google UID sans SESSION_RESET
    assert.strictEqual(getPlayerId(), googleUid, 'Identité doit être réalignée vers googleUid');
    assert.strictEqual(resetErrorOccurred, false, 'Ne doit pas lever SESSION_RESET');
    assert.strictEqual((wsService as any).activeRoomCode, 'ROOM_XYZ', 'La table doit rester intacte');

    unsubError();
    (auth as any).currentUser = null;
  });

  it('protège contre l\'ouverture d\'une seconde connexion si connect() est appelé pour la même identité', async () => {
    const currentId = getPlayerId();
    (wsService as any).lastConnectedPlayerId = currentId;

    let socketConstructedCount = 0;
    const mockSocketInstance = {
      readyState: 1, // WebSocket.OPEN
      close: () => {},
      send: () => {},
    };

    (wsService as any).socket = mockSocketInstance;

    // Calling connect() when socket is already OPEN for the same identity should immediately resolve
    // without opening a new socket
    await wsService.connect();

    assert.strictEqual((wsService as any).socket, mockSocketInstance, 'Ne doit pas remplacer la socket ouverte');
  });
});

describe('Gating de l\'authentification côté client (authConfirmedOnThisSocket)', () => {
  beforeEach(() => {
    localStorage.clear();
    (wsService as any).activeRoomCode = null;
    (wsService as any).currentRoom = null;
    (wsService as any).sessionRoomPlayerId = null;
    (wsService as any).lastConnectedPlayerId = null;
    (wsService as any).isSessionTakenOver = false;
    (wsService as any).authConfirmedOnThisSocket = false;
    (wsService as any).pendingAuthMessages = [];
    (wsService as any).pendingMessages = [];
  });

  it('met en attente les actions de jeu si la socket est ouverte mais auth non encore confirmée pour un compte Google', () => {
    const sentMessages: string[] = [];
    const mockSocketInstance = {
      readyState: 1, // WebSocket.OPEN
      close: () => {},
      send: (data: string) => {
        sentMessages.push(data);
      },
    };
    (wsService as any).socket = mockSocketInstance;

    // Simulate authenticated Google user
    (auth as any).currentUser = {
      uid: 'google_user_abc123',
      isAnonymous: false,
    };

    // User triggers CREATE_ROOM before AUTH_CONFIRMED has arrived
    (wsService as any).send({
      type: 'CREATE_ROOM',
      playerId: 'google_user_abc123',
      roomName: 'Salon Test',
    });

    // The message should NOT be sent immediately to the socket; it must be queued
    assert.strictEqual(sentMessages.length, 0, 'CREATE_ROOM ne doit pas être envoyé avant confirmation de l\'auth');
    assert.strictEqual((wsService as any).pendingAuthMessages.length, 1, 'Le message doit être dans pendingAuthMessages');

    // Now server sends AUTH_CONFIRMED
    (wsService as any).handleServerMessage({
      type: 'AUTH_CONFIRMED',
      playerId: 'google_user_abc123',
      reconnectToken: 'reconnect_tok_verified',
    });

    // authConfirmedOnThisSocket is now true and pendingAuthMessages is flushed
    assert.strictEqual((wsService as any).authConfirmedOnThisSocket, true);
    assert.strictEqual((wsService as any).pendingAuthMessages.length, 0, 'La file d\'attente doit être vidée');
    assert.strictEqual(sentMessages.length, 1, 'Le message en attente doit être envoyé après AUTH_CONFIRMED');
    const sentPayload = JSON.parse(sentMessages[0]);
    assert.strictEqual(sentPayload.type, 'CREATE_ROOM');
    assert.strictEqual(sentPayload.playerId, 'google_user_abc123');

    // Clean up mock auth
    (auth as any).currentUser = null;
  });

  it('laisse passer les messages AUTH immédiatement sans les mettre en file d\'attente', () => {
    const sentMessages: string[] = [];
    const mockSocketInstance = {
      readyState: 1, // WebSocket.OPEN
      close: () => {},
      send: (data: string) => {
        sentMessages.push(data);
      },
    };
    (wsService as any).socket = mockSocketInstance;

    (auth as any).currentUser = {
      uid: 'google_user_abc123',
      isAnonymous: false,
    };

    (wsService as any).authConfirmedOnThisSocket = false;

    // Sending AUTH directly
    (wsService as any).send({
      type: 'AUTH',
      playerId: 'google_user_abc123',
      idToken: 'mock_firebase_id_token',
    });

    assert.strictEqual(sentMessages.length, 1, 'AUTH doit être envoyé immédiatement');
    const sent = JSON.parse(sentMessages[0]);
    assert.strictEqual(sent.type, 'AUTH');

    (auth as any).currentUser = null;
  });
});
