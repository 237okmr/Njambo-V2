import { WebSocket } from 'ws';
import { MultiplayerRoom, RoomPlayer, EmoteMessage, PublicRoomSummary, GameInvitation, UserPresence, IntegrationProposal, CapacityExtensionProposal, PartieResult } from '../../src/types';
import { ClientMessage, ServerMessage } from '../types';
import { ActiveRoomState, ServerGameEngine, maskOpponentCards, selectBotToReplace, syncRoomPlayersWithGameState, PlayerAlert } from '../engine/serverGameEngine';
import { getEngineConfig, updateEngineConfig as applyEngineConfigUpdate, KatikaEngineConfig, DEFAULT_ENGINE_CONFIG } from '../engine/engineConfig';
import { pushService, buildGameUrl } from '../pushService';
import { APP_VERSION } from '../../src/version';
import { verifyFirebaseIdToken } from '../firebaseAdmin';
import { shouldBotAcceptBetIncrease, BOT_BET_INCREASE_AGREE_EMOTES, BOT_BET_INCREASE_DECLINE_EMOTES } from '../../src/utils/ai';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../src/lib/firebase';

export interface ConnectedClient {
  socket: WebSocket;
  playerId: string;
  roomCode: string | null;
  reconnectToken: string;
  sessionId?: string;
  lastPing: number;
  isAuthenticated?: boolean;
  authUid?: string;
  isAuthenticating?: boolean;
  messageQueue?: string[];
}

const SERVER_EPOCH = Date.now();

ServerGameEngine.setRoomGetter((roomId) => RoomManager.getRoom(roomId));

export class RoomManager {
  private static rooms = new Map<string, MultiplayerRoom>();
  private static roomStates = new Map<string, ActiveRoomState>();
  private static clients = new Map<string, ConnectedClient>(); // playerId -> ConnectedClient
  private static tokenToPlayerId = new Map<string, string>(); // reconnectToken -> playerId
  private static playerIdToToken = new Map<string, string>(); // playerId -> reconnectToken
  private static roomPlayerTokens = new Map<string, Map<string, string>>(); // roomCode -> (playerId -> reconnectToken)
  private static userPresences = new Map<string, UserPresence>(); // playerId -> UserPresence
  private static pendingInvitations = new Map<string, GameInvitation>(); // inviteId -> GameInvitation
  private static lastDirectInviteTimestamps = new Map<string, number>(); // "fromUserId_toUserId" -> timestamp
  private static lastEmoteTimestamps = new Map<string, number>(); // playerId -> lastEmoteTimestamp
  private static cleanupInterval: NodeJS.Timeout | null = null;
  private static roomTickInterval: NodeJS.Timeout | null = null;
  private static isTickingRooms = new Set<string>();
  private static lastTurnAlerts = new Map<string, string>(); // roomCode -> "playerId_trickNumber_tricksCount"
  private static lastGameStartAlerts = new Set<string>(); // roomCode
  private static pendingPartieResults = new Map<string, PartieResult[]>(); // playerId -> PartieResult[]

  public static setRoomPlayerToken(roomCode: string, playerId: string, token: string): void {
    let tokens = this.roomPlayerTokens.get(roomCode);
    if (!tokens) {
      tokens = new Map<string, string>();
      this.roomPlayerTokens.set(roomCode, tokens);
    }
    tokens.set(playerId, token);
  }

  public static getRoomPlayerToken(roomCode: string, playerId: string): string | undefined {
    return this.roomPlayerTokens.get(roomCode)?.get(playerId);
  }

  public static getRoom(roomCode: string): MultiplayerRoom | undefined {
    return this.rooms.get(roomCode);
  }

  public static setRoomForTest(roomCode: string, room: MultiplayerRoom): void {
    this.rooms.set(roomCode, room);
  }

  private static botBetIncreaseTimers = new Map<string, NodeJS.Timeout[]>();

  public static clearBotBetIncreaseTimers(roomCode: string): void {
    const timers = this.botBetIncreaseTimers.get(roomCode);
    if (timers) {
      timers.forEach((t) => clearTimeout(t));
      this.botBetIncreaseTimers.delete(roomCode);
    }
  }

  /**
   * Centralized room destruction method.
   * Idempotent and safe: cancels all room timers (game engine, autoStart, hostTransfer, disconnect, aiRelay),
   * clears bot bet increase timers, deletes room state & room object, and clears room tokens.
   */
  public static destroyRoom(roomCode: string, reason?: string): void {
    const state = this.roomStates.get(roomCode);
    if (state) {
      ServerGameEngine.clearAllTimers(state);
    }
    this.clearBotBetIncreaseTimers(roomCode);
    this.roomStates.delete(roomCode);
    this.rooms.delete(roomCode);
    this.deleteRoomTokens(roomCode);
  }

  public static clearRoomForTest(roomCode: string): void {
    this.destroyRoom(roomCode, 'clearRoomForTest');
  }

  public static deleteRoomTokens(roomCode: string): void {
    this.roomPlayerTokens.delete(roomCode);
    this.lastTurnAlerts.delete(roomCode);
    this.lastGameStartAlerts.delete(roomCode);
  }

  public static deletePlayerToken(roomCode: string, playerId: string): void {
    this.roomPlayerTokens.get(roomCode)?.delete(playerId);
  }
  private static matchHistory: Array<{
    id: string;
    mode: 'MULTIPLAYER';
    playerCount: number;
    winType: string;
    winnerName: string;
    winnerId?: string;
    roundsCount: number;
    potWon?: number;
    createdAt: number;
  }> = [];

  // Audit Logs Central Store
  private static auditLogs: Array<{
    id: string;
    timestamp: number;
    type: 'SERVER_ERROR' | 'ANOMALY' | 'KATIKA_ACTION' | 'AUTH' | 'CONFIG_CHANGE';
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    actor: string;
    summary: string;
    details?: Record<string, any>;
  }> = [
    {
      id: 'log-1',
      timestamp: Date.now() - 1000 * 60 * 5,
      type: 'AUTH',
      severity: 'INFO',
      actor: 'Katika Master',
      summary: 'Session Katika Master active - Serveur centralisé connecté',
    },
    {
      id: 'log-2',
      timestamp: Date.now() - 1000 * 60 * 20,
      type: 'KATIKA_ACTION',
      severity: 'INFO',
      actor: 'Katika Engine',
      summary: 'Système d\'audit et sanctions serveur initialisé',
    }
  ];

  // Sanctions and Chip Overrides Central Store
  private static playerSanctions = new Map<string, {
    status: 'ACTIVE' | 'WARNED' | 'BANNED';
    bannedReason?: string;
    banType?: 'NONE' | 'TEMPORARY' | 'PERMANENT';
    banExpiresAt?: number | null;
    warningsCount?: number;
    warningsHistory?: Array<{ date: number; reason: string; actor: string }>;
    sanctionType?: 'WARNING' | 'RESTRICT_CREATE_ROOM' | 'RESTRICT_JOIN_PRIVATE' | 'TEMP_BAN' | 'PERM_BAN';
    consecutiveForfeits?: number;
    totalForfeits?: number;
    lastIncidentAt?: number;
  }>();

  private static playerChipOverrides = new Map<string, number>();

  public static getActivePlayerSanction(playerId: string): {
    status: 'ACTIVE' | 'WARNED' | 'BANNED';
    sanctionType?: 'WARNING' | 'RESTRICT_CREATE_ROOM' | 'RESTRICT_JOIN_PRIVATE' | 'TEMP_BAN' | 'PERM_BAN';
    banExpiresAt?: number | null;
    bannedReason?: string;
  } | null {
    const sanction = this.playerSanctions.get(playerId);
    if (!sanction) return null;

    if (sanction.banExpiresAt && Date.now() >= sanction.banExpiresAt) {
      if (sanction.status === 'BANNED' || sanction.sanctionType === 'TEMP_BAN') {
        this.playerSanctions.delete(playerId);
        return null;
      }
      sanction.status = 'ACTIVE';
      sanction.sanctionType = undefined;
      sanction.banExpiresAt = null;
    }

    if (sanction.status === 'ACTIVE' && !sanction.sanctionType) return null;
    return sanction;
  }

  public static getActiveGameForPlayer(playerId: string, excludeRoomCode?: string): { roomCode: string; room: MultiplayerRoom } | null {
    for (const [roomCode, room] of this.rooms.entries()) {
      if (excludeRoomCode && roomCode === excludeRoomCode) continue;
      if (room.status === 'PLAYING') {
        const p = (room.players || []).find((player) => player.id === playerId);
        if (p && !p.isSpectator && !p.isEliminated && !p.isForfeit) {
          return { roomCode, room };
        }
      }
    }
    return null;
  }

  public static recordPlayerForfeit(playerId: string, reason: string): {
    sanctionType?: 'WARNING' | 'RESTRICT_CREATE_ROOM' | 'RESTRICT_JOIN_PRIVATE' | 'TEMP_BAN';
    expiresAt?: number | null;
    message: string;
  } {
    const existing = this.playerSanctions.get(playerId) || {
      status: 'ACTIVE',
      consecutiveForfeits: 0,
      totalForfeits: 0,
      lastIncidentAt: 0,
    };

    const consecutive = (existing.consecutiveForfeits || 0) + 1;
    const total = (existing.totalForfeits || 0) + 1;
    const now = Date.now();

    let status: 'ACTIVE' | 'WARNED' | 'BANNED' = 'ACTIVE';
    let sanctionType: 'WARNING' | 'RESTRICT_CREATE_ROOM' | 'RESTRICT_JOIN_PRIVATE' | 'TEMP_BAN' | undefined;
    let expiresAt: number | null = null;
    let message = '';

    if (consecutive >= 5) {
      status = 'BANNED';
      sanctionType = 'TEMP_BAN';
      expiresAt = now + 60 * 60 * 1000; // 1 heure
      message = '🚫 Sanction Fair-Play : Suspension temporaire du multijoueur pendant 1 heure pour abandons répétés.';
    } else if (consecutive === 4) {
      status = 'WARNED';
      sanctionType = 'RESTRICT_JOIN_PRIVATE';
      expiresAt = now + 30 * 60 * 1000; // 30 minutes
      message = '⚠️ Sanction Fair-Play : Restriction de rejoindre des tables privées pendant 30 minutes.';
    } else if (consecutive === 3) {
      status = 'WARNED';
      sanctionType = 'RESTRICT_CREATE_ROOM';
      expiresAt = now + 15 * 60 * 1000; // 15 minutes
      message = '⚠️ Sanction Fair-Play : Restriction de création de salon pendant 15 minutes.';
    } else if (consecutive === 2) {
      status = 'WARNED';
      sanctionType = 'WARNING';
      message = '⚠️ Avertissement Fair-Play : 2 abandons consécutifs. Le prochain entraînera une suspension de création de salon (15 min).';
    } else {
      status = 'WARNED';
      sanctionType = 'WARNING';
      message = 'ℹ️ Rappel Fair-Play : Quitter une partie en cours pénalise vos adversaires.';
    }

    this.playerSanctions.set(playerId, {
      ...existing,
      status,
      sanctionType,
      banExpiresAt: expiresAt,
      consecutiveForfeits: consecutive,
      totalForfeits: total,
      lastIncidentAt: now,
      bannedReason: message,
    });

    this.addAuditLog({
      id: `log-${Date.now()}`,
      timestamp: now,
      type: 'KATIKA_ACTION',
      severity: consecutive >= 3 ? 'WARNING' : 'INFO',
      actor: 'Fair-Play Engine',
      summary: `Forfait joueur (${playerId}) : ${consecutive} consécutif(s) ➔ ${sanctionType || 'Rappel'}`,
      details: { playerId, reason, consecutive, total, sanctionType, expiresAt },
    });

    return { sanctionType, expiresAt, message };
  }

  public static recordPlayerGameCompleted(playerId: string): void {
    const existing = this.playerSanctions.get(playerId);
    if (existing) {
      existing.consecutiveForfeits = 0;
      if (existing.status === 'WARNED' && (!existing.banExpiresAt || Date.now() >= existing.banExpiresAt)) {
        existing.status = 'ACTIVE';
        existing.sanctionType = undefined;
      }
    }
  }

  public static addAuditLog(log: {
    id: string;
    timestamp: number;
    type: 'SERVER_ERROR' | 'ANOMALY' | 'KATIKA_ACTION' | 'AUTH' | 'CONFIG_CHANGE';
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    actor: string;
    summary: string;
    details?: Record<string, any>;
  }) {
    this.auditLogs.unshift(log);
    if (this.auditLogs.length > 500) {
      this.auditLogs.pop();
    }
  }

  public static getAuditLogs() {
    return [...this.auditLogs];
  }

  public static banPlayer(playerId: string, reason: string, banType: 'TEMPORARY' | 'PERMANENT', expiresAt?: number | null): void {
    this.playerSanctions.set(playerId, {
      status: 'BANNED',
      bannedReason: reason,
      banType,
      banExpiresAt: expiresAt || null,
    });

    // Disconnect active socket immediately
    const client = this.clients.get(playerId);
    if (client && client.socket.readyState === WebSocket.OPEN) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'BANNED',
        error: `Votre compte a été suspendu par le Katika Master. Motif: ${reason}`,
      });
      client.socket.close();
    }

    // Kick from active rooms
    this.rooms.forEach((room, roomCode) => {
      if ((room.players || []).some((p) => p.id === playerId)) {
        this.adminKickPlayer(roomCode, playerId);
      }
    });

    this.addAuditLog({
      id: `log-${Date.now()}`,
      timestamp: Date.now(),
      type: 'KATIKA_ACTION',
      severity: 'CRITICAL',
      actor: 'Katika Master',
      summary: `Sanction joueur (${playerId}) : BANNED (${banType})`,
      details: { playerId, reason, banType, expiresAt },
    });
  }

  public static updatePlayerChips(playerId: string, newBalance: number, reason: string): void {
    this.playerChipOverrides.set(playerId, Math.max(0, newBalance));

    this.addAuditLog({
      id: `log-${Date.now()}`,
      timestamp: Date.now(),
      type: 'KATIKA_ACTION',
      severity: 'WARNING',
      actor: 'Katika Master',
      summary: `Ajustement jetons pour (${playerId}) ➔ ${newBalance} FCFA`,
      details: { playerId, newBalance, reason },
    });
  }

  public static getPlayerSanctions() {
    const obj: Record<string, any> = {};
    this.playerSanctions.forEach((val, key) => {
      obj[key] = val;
    });
    return obj;
  }

  public static getPlayerChipOverrides() {
    const obj: Record<string, number> = {};
    this.playerChipOverrides.forEach((val, key) => {
      obj[key] = val;
    });
    return obj;
  }

  public static recordFinishedMatch(record: {
    id: string;
    mode: 'MULTIPLAYER';
    playerCount: number;
    winType: string;
    winnerName: string;
    winnerId?: string;
    roundsCount: number;
    potWon?: number;
    createdAt: number;
  }): void {
    if (!this.matchHistory.some((m) => m.id === record.id)) {
      this.matchHistory.unshift(record);
      if (this.matchHistory.length > 200) {
        this.matchHistory.pop();
      }
    }
  }

  public static getMatchHistory() {
    return [...this.matchHistory];
  }

  public static readonly CURRENT_PROTOCOL_VERSION = 3;
  public static readonly SERVER_VERSION = APP_VERSION;

  private static failedJoinAttempts = new Map<string, { count: number; resetAt: number }>();

  // Katika Master Hot Engine Config
  private static engineConfig: KatikaEngineConfig = { ...DEFAULT_ENGINE_CONFIG };

  public static getEngineConfig(): KatikaEngineConfig {
    return getEngineConfig();
  }

  public static updateEngineConfig(newConfig: Partial<KatikaEngineConfig>) {
    const updated = applyEngineConfigUpdate(newConfig);
    this.engineConfig = updated;
    // Keep active states synced with latest engine settings
    this.roomStates.forEach((state) => {
      state.engineConfig = updated;
    });
    // If maintenance mode toggled on, broadcast warning to all clients
    if (newConfig.isMaintenanceMode) {
      this.clients.forEach((c) => {
        if (c.socket.readyState === WebSocket.OPEN) {
          this.sendMessage(c.socket, {
            type: 'ERROR',
            errorCode: 'MAINTENANCE',
            error: updated.maintenanceNotice,
          });
        }
      });
    }
    return updated;
  }

  public static getOrCreateActiveState(roomCode: string, room: MultiplayerRoom): ActiveRoomState {
    let state = this.roomStates.get(roomCode);
    if (!state) {
      state = {
        room,
        engineConfig: getEngineConfig(),
        turnTimeoutTimer: null,
        trickResolutionTimer: null,
        nextPartieTimer: null,
        botMoveTimer: null,
        instantWinTimer: null,
        disconnectTimers: new Map<string, NodeJS.Timeout>(),
        consecutiveTimeouts: new Map<string, number>(),
        onPlayerAlert: (playerId: string, r: MultiplayerRoom, alert: PlayerAlert) => {
          this.pushPlayerAlert(playerId, r, alert);
        },
        onPlayerForfeit: (playerId: string, r: MultiplayerRoom, isExplicit?: boolean) => {
          if (isExplicit) {
            const result = this.recordPlayerForfeit(playerId, `Forfait explicite partie #${r.gameState?.partieCount || 1} table ${r.id}`);
            const client = this.clients.get(playerId);
            if (client && client.socket.readyState === WebSocket.OPEN) {
              this.sendMessage(client.socket, {
                type: 'NOTIFICATION',
                notification: result.message,
              });
            }
          } else {
            // Implicit forfeit (timeout/network) -> no bans, just info
            const client = this.clients.get(playerId);
            if (client && client.socket.readyState === WebSocket.OPEN) {
              this.sendMessage(client.socket, {
                type: 'NOTIFICATION',
                notification: '⚠️ Avertissement de stabilité de connexion : vous avez été déclaré forfait pour cette donne suite à une déconnexion prolongée.',
              });
            }
          }
        },
        onPartieCompleted: (r: MultiplayerRoom) => {
          r.players.forEach((p) => {
            if (p.isHuman && !p.isForfeit) {
              this.recordPlayerGameCompleted(p.id);
            }
          });
        },
        onPartieResult: (result: PartieResult, r: MultiplayerRoom) => {
          this.handleNewPartieResult(result, r);
        },
      };
      this.roomStates.set(roomCode, state);
    }
    return state;
  }

  private static handleNewPartieResult(result: PartieResult, room: MultiplayerRoom): void {
    result.participants.forEach((p) => {
      if (!p.isHuman) return;
      const pid = p.playerId;
      let pending = this.pendingPartieResults.get(pid);
      if (!pending) {
        pending = [];
        this.pendingPartieResults.set(pid, pending);
      }
      if (!pending.some((r) => r.id === result.id)) {
        pending.push(result);
      }
      if (pending.length > 50) {
        pending.shift();
      }

      const client = this.clients.get(pid);
      if (client && client.socket.readyState === WebSocket.OPEN) {
        this.deliverPartieResults(client.socket, pid);
      }
    });
  }

  public static deliverPartieResults(socket: WebSocket, playerId: string): void {
    const pending = this.pendingPartieResults.get(playerId);
    if (!pending || pending.length === 0) return;

    if (socket.readyState === WebSocket.OPEN) {
      this.sendMessage(socket, {
        type: 'PARTIE_RESULTS',
        partieResults: [...pending],
      });
    }
  }

  public static registerClient(socket: WebSocket, reconnectToken?: string, requestedPlayerId?: string, sessionId?: string): ConnectedClient {
    let playerId: string;
    let token: string;

    if (reconnectToken && this.tokenToPlayerId.has(reconnectToken)) {
      const tokenPlayerId = this.tokenToPlayerId.get(reconnectToken)!;
      if (tokenPlayerId.startsWith('usr_')) {
        playerId = tokenPlayerId;
        token = reconnectToken;
        this.playerIdToToken.set(playerId, token);
      } else {
        // Google UID token: assign temporary guest until AUTH message confirms identity
        playerId = 'usr_' + Math.random().toString(36).substring(2, 9);
        token = 'tk_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
        this.tokenToPlayerId.set(token, playerId);
        this.playerIdToToken.set(playerId, token);
      }
    } else if (requestedPlayerId) {
      if (!requestedPlayerId.startsWith('usr_')) {
        // Unverified Google UID: reject claim on connection. Assign temporary guest id until AUTH is received.
        playerId = 'usr_' + Math.random().toString(36).substring(2, 9);
        token = 'tk_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
        this.tokenToPlayerId.set(token, playerId);
        this.playerIdToToken.set(playerId, token);
      } else {
        // Guest ID ('usr_...')
        const existingToken = this.playerIdToToken.get(requestedPlayerId);
        if (existingToken) {
          if (reconnectToken && reconnectToken === existingToken) {
            // Valid reconnect token for guest
            playerId = requestedPlayerId;
            token = reconnectToken;
          } else {
            // Missing or invalid reconnect token: allocate fresh guest ID (prevent session hijack)
            console.warn(`[Security] Denied claim of guest ID '${requestedPlayerId}' without matching reconnectToken.`);
            playerId = 'usr_' + Math.random().toString(36).substring(2, 9);
            token = 'tk_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
            this.tokenToPlayerId.set(token, playerId);
            this.playerIdToToken.set(playerId, token);
          }
        } else {
          // Fresh unbound guest ID
          playerId = requestedPlayerId;
          token = reconnectToken || ('tk_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36));
          this.tokenToPlayerId.set(token, playerId);
          this.playerIdToToken.set(playerId, token);
        }
      }
    } else {
      playerId = 'usr_' + Math.random().toString(36).substring(2, 9);
      token = 'tk_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      this.tokenToPlayerId.set(token, playerId);
      this.playerIdToToken.set(playerId, token);
    }

    // Close any previous socket for this confirmed playerId (e.g. valid guest token reconnect)
    const prevClient = this.clients.get(playerId);
    if (prevClient && prevClient.socket !== socket && prevClient.socket.readyState === WebSocket.OPEN) {
      const isDifferentSession = Boolean(
        prevClient.sessionId && sessionId && prevClient.sessionId !== sessionId
      );
      console.log(`[Session Reconnect] Replacing previous connection for playerId '${playerId}' (differentSession: ${isDifferentSession}).`);
      try {
        if (isDifferentSession) {
          prevClient.socket.close(4001, 'SESSION_TAKEOVER');
        } else {
          prevClient.socket.close(1000, 'Connexion transférée vers nouvelle socket');
        }
      } catch (e) {
        // ignore
      }
    }

    const client: ConnectedClient = {
      socket,
      playerId,
      roomCode: prevClient?.roomCode || null,
      reconnectToken: token,
      sessionId,
      lastPing: Date.now(),
      isAuthenticated: false,
      authUid: undefined,
      isAuthenticating: false,
      messageQueue: [],
    };

    this.clients.set(playerId, client);
    this.deliverPartieResults(socket, playerId);
    return client;
  }

  public static handleDisconnect(playerId: string, socket: WebSocket): void {
    const client = this.clients.get(playerId);
    if (!client) return;
    
    // Si la socket qui se ferme n'est plus la socket active (suite à une reconnexion), on ignore.
    if (client.socket !== socket) return;

    if (!client.roomCode) return;

    const roomCode = client.roomCode;
    const room = this.rooms.get(roomCode);
    if (!room) return;

    this.handleVoteStateOnDisconnect(room, playerId);

    const state = this.getOrCreateActiveState(roomCode, room);
    ServerGameEngine.handlePlayerDisconnect(
      room,
      playerId,
      (updatedRoom) => {
        this.broadcastRoomState(updatedRoom.id);
          this.evaluateAutoStart(updatedRoom.id);
      },
      state
    );

    if (room.status === 'LOBBY' || room.status === 'MANCHE_OVER') {
      const rp = (room.players || []).find(p => p.id === playerId);
      if (rp && !rp.isSpectator) {
        room.originalHostId = room.originalHostId || room.hostId;
        const isHost = rp.isHost || (room.hostId === playerId) || (room.originalHostId === playerId);
        if (isHost && !room.hostAbsentSince) {
          room.hostAbsentSince = Date.now();
        }

        const lobbyWaitTtlSecs = (this.engineConfig.lobbyWaitTtlMinutes ?? 30) * 60;
        const hostGrace = room.status === 'LOBBY' ? lobbyWaitTtlSecs : (state.engineConfig?.hostLobbyGraceSeconds || 180);
        const guestGrace = state.engineConfig?.guestLobbyGraceSeconds || this.engineConfig.guestLobbyGraceSeconds || 60;
        const graceSecs = isHost ? hostGrace : guestGrace;
        rp.disconnectGraceExpiresAt = Date.now() + graceSecs * 1000;
        
        if (state.disconnectTimers.has(playerId)) {
          clearTimeout(state.disconnectTimers.get(playerId)!);
        }
        
        const timer = setTimeout(() => {
          state.disconnectTimers.delete(playerId);
          const currentRoom = this.rooms.get(roomCode);
          if (!currentRoom) return;
          const targetPlayer = currentRoom.players.find(p => p.id === playerId);
          if (targetPlayer && !targetPlayer.connected) {
            console.log(`[Lobby Timeout] Kicking disconnected player ${targetPlayer.name} from room ${roomCode}`);
            this.forceRemovePlayer(roomCode, playerId);
            const connectedHumans = (currentRoom.players || []).filter(p => p.isHuman && p.connected);
            if (connectedHumans.length === 0) {
              this.adminCloseRoom(roomCode);
            } else {
              this.evaluateLobbyHostTakeover(roomCode);
            }
          }
        }, graceSecs * 1000);
        
        state.disconnectTimers.set(playerId, timer);
        this.evaluateLobbyHostTakeover(roomCode);
        this.broadcastRoomState(roomCode);
        this.evaluateAutoStart(roomCode);
      }
      this.evaluateLobbyHostInactivity(roomCode);
    } else if (room.status === 'PARTIE_OVER') {
      // Règle du relais : pas de délai de reconnexion. Le joueur a jusqu'à la fin du compte à rebours entre deux
      // parties pour revenir ; sinon il est forfait pour la partie suivante et revient quand il veut.
      const rp = (room.players || []).find((p) => p.id === playerId);
      if (rp && !rp.isSpectator) {
        rp.disconnectGraceExpiresAt = null;
        this.broadcastRoomState(roomCode);
      }
    }
  }

  private static handleVoteStateOnDisconnect(room: MultiplayerRoom, playerId: string): void {
    // 1. Bet Increase Proposal
    if (room.betIncreaseProposal) {
      this.clearBotBetIncreaseTimers(room.id);
      if (room.betIncreaseProposal.proposerId === playerId) {
        if (room.betIncreaseProposal.previousReadyStates) {
          const prev = room.betIncreaseProposal.previousReadyStates;
          (room.players || []).forEach((p) => {
            p.readyForNextPartie = prev[p.id] ?? p.readyForNextPartie;
          });
        }
        room.betIncreaseProposal = null;
        const emote: EmoteMessage = {
          id: 'em_' + Math.random().toString(36).substring(2, 9),
          playerId: 'system',
          playerName: 'Table',
          text: `ℹ️ Proposition de hausse de mise annulée (l'initiateur s'est déconnecté).`,
          emoji: '❌',
          timestamp: Date.now(),
          isBot: true,
        };
        room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
        room.updatedAt = Date.now();
      } else {
        // Disconnected player counts as abstention
        const remainingActiveHumans = (room.players || []).filter(
          (p) => p.isHuman && !p.isEliminated && !p.isForfeit && !p.isSpectator && p.connected && p.id !== playerId
        );
        if (remainingActiveHumans.length > 0) {
          const allAgreed = remainingActiveHumans.every((h) =>
            room.betIncreaseProposal!.agreedPlayerIds.includes(h.id)
          );
          if (allAgreed) {
            const newBet = room.betIncreaseProposal.proposedBet;
            room.baseBet = newBet;
            if (room.gameState) {
              room.gameState.baseBet = newBet;
            }
            room.betIncreaseProposal = null;
            (room.players || []).forEach((p) => {
              if (p.isHuman && !p.isEliminated && !p.isSpectator && p.connected && p.id !== playerId) {
                p.readyForNextPartie = true;
              }
            });
            const emote: EmoteMessage = {
              id: 'em_' + Math.random().toString(36).substring(2, 9),
              playerId: 'system',
              playerName: 'Table',
              text: `⚡ Accord unanime des joueurs présents ! La mise passe à ${newBet} 🪙 dès la prochaine partie !`,
              emoji: '🔥',
              timestamp: Date.now(),
              isBot: true,
            };
            room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
            room.updatedAt = Date.now();
          }
        }
      }
    }

    // 2. Capacity Extension Proposal
    if (room.capacityExtensionProposal && room.capacityExtensionProposal.status === 'VOTING') {
      if (room.capacityExtensionProposal.proposerId === playerId) {
        room.capacityExtensionProposal = null;
        room.updatedAt = Date.now();
      }
    }

    // 3. Integration Proposal
    if (room.integrationProposal && room.integrationProposal.status === 'VOTING') {
      if (room.integrationProposal.applicantId === playerId) {
        room.integrationProposal = null;
        room.updatedAt = Date.now();
      }
    }
  }

  private static handleAuthMessage(client: ConnectedClient, msg: ClientMessage): void {
    if (!msg.idToken) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'GENERIC',
        error: 'Jeton d\'authentification manquant.',
      });
      return;
    }

    client.isAuthenticating = true;

    const AUTH_TIMEOUT_MS = 8000;
    let timeoutId: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('AUTH_TIMEOUT'));
      }, AUTH_TIMEOUT_MS);
    });

    Promise.race([
      verifyFirebaseIdToken(msg.idToken),
      timeoutPromise,
    ])
      .then((result) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        client.isAuthenticating = false;
        if (!result || !result.uid) {
          console.warn(`[Auth] ID token verification failed for client ${client.playerId}`);
          this.sendMessage(client.socket, {
            type: 'ERROR',
            errorCode: 'JOIN_REFUSED',
            error: 'Authentification Google invalide ou expirée.',
          });
          return;
        }

        const verifiedUid = result.uid;
        const oldPlayerId = client.playerId;

        if (oldPlayerId !== verifiedUid) {
          // Takeover handling for verified Google user
          const existingClient = this.clients.get(verifiedUid);
          if (existingClient && existingClient.socket !== client.socket && existingClient.socket.readyState === WebSocket.OPEN) {
            const isDifferentSession = Boolean(
              existingClient.sessionId && client.sessionId && existingClient.sessionId !== client.sessionId
            );
            console.log(`[Auth Takeover] Closing previous socket for verified Google user '${verifiedUid}' (diffSession: ${isDifferentSession})`);
            try {
              if (isDifferentSession) {
                existingClient.socket.close(4001, 'SESSION_TAKEOVER');
              } else {
                existingClient.socket.close(1000, 'Connexion transférée vers nouvelle socket');
              }
            } catch (e) {
              // ignore
            }
          }

          // Clean up temporary guest mappings if any
          if (oldPlayerId.startsWith('usr_')) {
            this.clients.delete(oldPlayerId);
            this.playerIdToToken.delete(oldPlayerId);
          }

          client.playerId = verifiedUid;
          if (existingClient?.roomCode && !client.roomCode) {
            client.roomCode = existingClient.roomCode;
          }
        }

        client.isAuthenticated = true;
        client.authUid = verifiedUid;
        this.clients.set(verifiedUid, client);

        // Bind a reconnect token for this verified user
        let userToken = this.playerIdToToken.get(verifiedUid) || client.reconnectToken;
        this.tokenToPlayerId.set(userToken, verifiedUid);
        this.playerIdToToken.set(verifiedUid, userToken);
        client.reconnectToken = userToken;

        console.log(`[Auth] Authenticated Google player: ${verifiedUid} (email: ${result.email || 'n/a'})`);
        this.deliverPartieResults(client.socket, verifiedUid);

        // Send explicit confirmation that authentication succeeded on this socket
        this.sendMessage(client.socket, {
          type: 'AUTH_CONFIRMED',
          playerId: verifiedUid,
          reconnectToken: userToken,
          timestamp: Date.now(),
        });

        // If client was previously associated with an active room and is a non-spectator non-forfeit member, resume seat
        if (client.roomCode && this.rooms.has(client.roomCode)) {
          const room = this.rooms.get(client.roomCode)!;
          const player = (room.players || []).find((p) => p.id === verifiedUid);
          if (player && !player.isSpectator && !player.isForfeit) {
            console.log(`[Auth] Resuming seat automatically for authenticated player '${verifiedUid}' in room '${client.roomCode}'`);
            this.resumeSeat(client, client.roomCode);
          }
        }

        // Drain any messages that arrived while authenticating
        if (client.messageQueue && client.messageQueue.length > 0) {
          const queue = [...client.messageQueue];
          client.messageQueue = [];
          for (const raw of queue) {
            this.handleMessage(client, raw);
          }
        }
      })
      .catch((err) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        client.isAuthenticating = false;
        client.messageQueue = [];

        if (err?.message === 'AUTH_TIMEOUT') {
          const timestamp = new Date().toISOString();
          console.warn(`[Auth Timeout] Google ID token verification timed out (8s) for playerId '${client.playerId}' at ${timestamp}`);
          this.addAuditLog({
            id: `log-${Date.now()}`,
            timestamp: Date.now(),
            type: 'AUTH',
            severity: 'WARNING',
            actor: 'Auth Manager',
            summary: `Timeout vérification Google (8s) pour le joueur (${client.playerId})`,
            details: { playerId: client.playerId, timestamp },
          });
          this.sendMessage(client.socket, {
            type: 'ERROR',
            errorCode: 'AUTH_TIMEOUT',
            error: 'La vérification de ton compte Google a pris trop de temps. Réessaie ou joue en invité.',
          });
          return;
        }

        console.error('[Auth] Unexpected error verifying idToken:', err);
        this.sendMessage(client.socket, {
          type: 'ERROR',
          errorCode: 'GENERIC',
          error: 'Erreur lors de la vérification de votre identité.',
        });
      });
  }

  public static handleMessage(client: ConnectedClient, rawData: string): void {
    if (client.isAuthenticating) {
      if (!client.messageQueue) client.messageQueue = [];
      client.messageQueue.push(rawData);
      return;
    }

    try {
      const msg: ClientMessage = JSON.parse(rawData);

      if (msg.type === 'AUTH') {
        this.handleAuthMessage(client, msg);
        return;
      }

      // Step 3 (Security): Reject any msg.playerId different from client.playerId
      if (msg.playerId && msg.playerId !== client.playerId) {
        console.warn(`[Security] Rejected message: msg.playerId '${msg.playerId}' != client.playerId '${client.playerId}' (type: ${msg.type})`);
        this.sendMessage(client.socket, {
          type: 'ERROR',
          errorCode: 'AUTH_REQUIRED',
          error: 'Action non autorisée : identifiant joueur invalide pour cette connexion.',
        });
        return;
      }

      // Step 1 (Security): A non-guest playerId (Google UID) is rejected without valid AUTH
      if (!client.playerId.startsWith('usr_') && !client.isAuthenticated) {
        console.warn(`[Security] Unauthenticated client attempting action with Google UID '${client.playerId}' without AUTH verification.`);
        this.sendMessage(client.socket, {
          type: 'ERROR',
          errorCode: 'AUTH_REQUIRED',
          error: 'Action non autorisée : authentification requise.',
        });
        return;
      }

      // Check if player is banned
      const sanction = this.playerSanctions.get(client.playerId);
      if (sanction && sanction.status === 'BANNED') {
        const isExpired = sanction.banExpiresAt && sanction.banExpiresAt < Date.now();
        if (!isExpired) {
          this.sendMessage(client.socket, {
            type: 'ERROR',
            errorCode: 'BANNED',
            error: `Accès refusé : Votre compte a été suspendu. Motif: ${sanction.bannedReason || 'Sanction administrative'}`,
          });
          try {
            client.socket.close();
          } catch (e) {
            // ignore
          }
          return;
        } else {
          this.playerSanctions.delete(client.playerId);
        }
      }

      // Step 3 (Security): Only set client.roomCode if player is an active member or spectator of that room
      if (msg.roomCode && (!client.roomCode || client.roomCode !== msg.roomCode)) {
        const targetRoom = this.rooms.get(msg.roomCode);
        if (targetRoom) {
          const isMember = (targetRoom.players || []).some((p) => p.id === client.playerId);
          if (isMember) {
            client.roomCode = msg.roomCode;
          }
        }
      }

      switch (msg.type) {
        case 'PING':
          this.sendMessage(client.socket, {
            type: 'PONG',
            timestamp: Date.now(),
          });
          break;

        case 'ACK_PARTIE_RESULTS': {
          const ackedIds = new Set(msg.resultIds || []);
          const pending = this.pendingPartieResults.get(client.playerId);
          if (pending && ackedIds.size > 0) {
            const remaining = pending.filter((r) => !ackedIds.has(r.id));
            if (remaining.length > 0) {
              this.pendingPartieResults.set(client.playerId, remaining);
            } else {
              this.pendingPartieResults.delete(client.playerId);
            }
          }
          break;
        }

        case 'CREATE_ROOM':
          this.handleCreateRoom(client, msg);
          break;

        case 'JOIN_ROOM':
          this.handleJoinRoom(client, msg);
          break;

        case 'SET_READY':
          this.handleSetReady(client, msg);
          break;

        case 'START_GAME':
          this.handleStartGame(client, msg);
          break;

        case 'PLAY_CARD':
          this.handlePlayCard(client, msg);
          break;

        case 'READY_NEXT_PARTIE':
          this.handleReadyNextPartie(client, msg);
          break;

        case 'FORCE_NEXT_PARTIE':
          this.handleForceNextPartie(client, msg);
          break;

        case 'SEND_EMOTE':
          this.handleSendEmote(client, msg);
          break;

        case 'UPDATE_SETTINGS':
          this.handleUpdateSettings(client, msg);
          break;

        case 'ALERT_UNREADY_PLAYERS':
          this.handleAlertUnreadyPlayers(client, msg);
          break;

        case 'KICK_PLAYER':
          this.handleKickPlayer(client, msg);
          break;

        case 'CLAIM_HOST':
          this.handleClaimHost(client, msg);
          break;

        case 'VOTE_BOTS':
          this.handleVoteBots(client, msg);
          break;

        case 'LEAVE_ROOM':
          this.handleLeaveRoom(client, msg);
          break;

        case 'FOLD_ROUND':
          this.handleFoldRound(client, msg);
          break;

        case 'KORA_HUNTER_ALERT':
          this.handleKoraHunterAlert(client, msg);
          break;

        case 'DISMISS_KORA_ALERT':
          this.handleDismissKoraAlert(client, msg);
          break;

        case 'PROPOSE_BET_INCREASE':
          this.handleProposeBetIncrease(client, msg);
          break;

        case 'RESPOND_BET_INCREASE':
          this.handleRespondBetIncrease(client, msg);
          break;

        case 'CANCEL_BET_INCREASE':
          this.handleCancelBetIncrease(client, msg);
          break;

        case 'REQUEST_INTEGRATION':
          this.handleRequestIntegration(client, msg);
          break;

        case 'RESPOND_INTEGRATION_VOTE':
          this.handleRespondIntegrationVote(client, msg);
          break;

        case 'PROPOSE_CAPACITY_EXTENSION':
          this.handleProposeCapacityExtension(client, msg);
          break;

        case 'RESPOND_CAPACITY_EXTENSION':
          this.handleRespondCapacityExtension(client, msg);
          break;

        case 'PROPOSE_EARLY_CLOSE':
          this.handleProposeEarlyClose(client, msg);
          break;

        case 'RESPOND_EARLY_CLOSE':
          this.handleRespondEarlyClose(client, msg);
          break;

        case 'CLAIM_FORFEIT_VICTORY':
          this.handleClaimForfeitVictory(client, msg);
          break;

        case 'GET_PUBLIC_ROOMS':
          this.handleGetPublicRooms(client);
          break;

        case 'HEARTBEAT_PRESENCE':
          this.handleHeartbeatPresence(client, msg);
          break;

        case 'SEND_DIRECT_INVITE':
          this.handleSendDirectInvite(client, msg);
          break;

        case 'RESPOND_DIRECT_INVITE':
          this.handleRespondDirectInvite(client, msg);
          break;

        case 'QUICK_MATCH_REQUEST':
          this.handleQuickMatchRequest(client, msg);
          break;

        case 'GET_FRIENDS_PRESENCE':
          this.handleGetFriendsPresence(client, msg);
          break;

        default:
          break;
      }
    } catch (err) {
      console.error('[RoomManager] Failed to handle message:', err);
    }
  }

  private static handleCreateRoom(client: ConnectedClient, msg: ClientMessage): void {
    // PREVENT SPAM/GHOST ROOMS: Check if player already hosts a lobby room
    let existingLobbyRoom: MultiplayerRoom | null = null;
    for (const room of this.rooms.values()) {
      if (room.hostId === client.playerId && room.status === 'LOBBY') {
        existingLobbyRoom = room;
        break;
      }
    }

    if (existingLobbyRoom) {
      const humanPlayersCount = (existingLobbyRoom.players || []).filter(p => p.isHuman).length;
      if (humanPlayersCount > 1) {
        // There are other humans in the room. Force redirect instead of creating a new one.
        this.setRoomPlayerToken(existingLobbyRoom.id, client.playerId, client.reconnectToken);
        client.roomCode = existingLobbyRoom.id;
        
        // Re-connect the host to their existing room
        const hostPlayer = (existingLobbyRoom.players || []).find(p => p.id === client.playerId);
        if (hostPlayer) {
          hostPlayer.connected = true;
          hostPlayer.lastSeen = Date.now();
        }

        this.sendMessage(client.socket, {
          type: 'ROOM_JOINED',
          room: maskOpponentCards(existingLobbyRoom, client.playerId),
          reconnectToken: client.reconnectToken,
          protocolVersion: this.CURRENT_PROTOCOL_VERSION,
          serverVersion: this.SERVER_VERSION,
          isProtocolCompatible: true,
          updateRecommended: false,
        });
        return; // Abort creation
      } else {
        // Host was alone in their old lobby room. Safely delete it before creating a new one.
        this.adminCloseRoom(existingLobbyRoom.id);
      }
    }

    // Active game protection: block if player is in an active PLAYING game unless confirmed
    if (!msg.confirmLeaveCurrent) {
      const activeGame = this.getActiveGameForPlayer(client.playerId);
      if (activeGame) {
        this.sendMessage(client.socket, {
          type: 'ERROR',
          errorCode: 'ACTIVE_GAME_IN_PROGRESS',
          error: `Vous avez une partie en cours (salon ${activeGame.roomCode}). Retournez-y ou quittez-la explicitement.`,
          activeGameRoomCode: activeGame.roomCode,
        });
        return;
      }
    }

    if (this.engineConfig.isMaintenanceMode) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'MAINTENANCE',
        error: 'Impossible de créer un salon : ' + this.engineConfig.maintenanceNotice,
      });
      return;
    }

    if (this.engineConfig.allowNewRooms === false) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'JOIN_REFUSED',
        error: "L'ouverture de nouvelles tables est temporairement suspendue par l'administration Katika.",
      });
      return;
    }

    const playerName = msg.playerName?.trim() || 'Hôte';
    if (playerName.toLowerCase() === 'katika') {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'JOIN_REFUSED',
        error: "Le pseudonyme 'Katika' est réservé à l'administration.",
      });
      return;
    }

    // Fair-play sanction enforcement: RESTRICT_CREATE_ROOM, TEMP_BAN, PERM_BAN
    const serverSanction = this.getActivePlayerSanction(client.playerId);
    const effectiveSanction = serverSanction ? {
      type: serverSanction.sanctionType || (serverSanction.status === 'BANNED' ? 'TEMP_BAN' : undefined),
      reason: serverSanction.bannedReason || 'Sanction Fair-Play active',
      expiresAt: serverSanction.banExpiresAt,
      active: true,
    } : (msg.fairPlaySanction && msg.fairPlaySanction.active ? msg.fairPlaySanction : null);

    if (effectiveSanction && effectiveSanction.active) {
      const sType = effectiveSanction.type;
      if (sType === 'RESTRICT_CREATE_ROOM' || sType === 'TEMP_BAN' || sType === 'PERM_BAN') {
        const isStillActive = !effectiveSanction.expiresAt || Date.now() < effectiveSanction.expiresAt;
        if (isStillActive) {
          const remainingMinutes = effectiveSanction.expiresAt ? Math.ceil((effectiveSanction.expiresAt - Date.now()) / 60000) : 0;
          this.sendMessage(client.socket, {
            type: 'ERROR',
            errorCode: 'BANNED',
            error: `🚫 Action restreinte par le Fair-Play (${sType}) : ${effectiveSanction.reason}${
              remainingMinutes > 0 ? ` (expire dans ${remainingMinutes} min)` : ''
            }`,
          });
          return;
        }
      }
    }

    const roomCode = msg.roomCode?.toUpperCase() || Math.random().toString(36).substring(2, 6).toUpperCase();
    const minBet = this.engineConfig.minTableBet || 10;
    const settings = msg.settings || {
      fillWithBots: this.engineConfig.defaultFillWithBots ?? false,
      maxPlayers: this.engineConfig.defaultTableMaxPlayers || 2,
      baseBet: minBet,
      initialCapital: this.engineConfig.defaultInitialCapital || 100,
      enableDoubleKora: true,
      enableUnder21: true,
      turnTimerSeconds: this.engineConfig.turnTimerSeconds,
      isPublic: true,
      requireGoogleAuth: false,
      afkAction: 'auto_play',
    };
    const effectiveBaseBet = Math.max(minBet, settings.baseBet || minBet);
    const effectiveInitialCapital = Math.max(effectiveBaseBet * 5, settings.initialCapital || this.engineConfig.defaultInitialCapital || 100);
    const validMaxPlayers = Math.min(4, Math.max(2, settings.maxPlayers || this.engineConfig.defaultTableMaxPlayers || 2));

    // Host policy: Enforce Google login ONLY if the host explicitly enabled requireGoogleAuth
    if (settings.requireGoogleAuth && msg.isGuest) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'JOIN_REFUSED',
        error: "Connexion Google requise : Cette table a été configurée pour exiger un compte Google.",
      });
      return;
    }

    // Now that all validations have passed, remove player from other rooms
    this.removePlayerFromOtherRooms(client.playerId);

    const hostPlayer: RoomPlayer = {
      id: client.playerId,
      name: playerName,
      isHost: true,
      isHuman: true,
      avatarSeed: msg.avatarSeed || 'host',
      score: effectiveInitialCapital,
      capital: effectiveInitialCapital,
      isEliminated: false,
      isSpectator: false,
      isPendingIntegration: false,
      hand: [],
      tricksWonInRound: 0,
      isReady: true,
      connected: true,
      lastSeen: Date.now(),
    };

    const room: MultiplayerRoom = {
      id: roomCode,
      hostId: client.playerId,
      originalHostId: client.playerId,
      hostName: hostPlayer.name,
      isPublic: settings.isPublic !== undefined ? settings.isPublic : true,
      requireGoogleAuth: settings.requireGoogleAuth || false,
      status: 'LOBBY',
      fillWithBots: settings.fillWithBots,
      maxPlayers: validMaxPlayers,
      baseBet: effectiveBaseBet,
      initialBaseBet: effectiveBaseBet,
      initialCapital: effectiveInitialCapital,
      enableDoubleKora: settings.enableDoubleKora,
      enableUnder21: settings.enableUnder21,
      turnTimerSeconds: settings.turnTimerSeconds || 15,
      afkAction: settings.afkAction || 'auto_play',
      disconnectGraceSeconds: (settings as any).disconnectGraceSeconds || this.engineConfig.reconnectGracePeriodSeconds || 30,
      players: [hostPlayer],
      gameState: null,
      mancheNumber: 1,
      protocolVersion: this.CURRENT_PROTOCOL_VERSION,
      serverVersion: this.SERVER_VERSION,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastSeenAt: Date.now(),
    };

    this.rooms.set(roomCode, room);
    this.setRoomPlayerToken(roomCode, client.playerId, client.reconnectToken);
    client.roomCode = roomCode;

    this.sendMessage(client.socket, {
      type: 'ROOM_JOINED',
      room: maskOpponentCards(room, client.playerId),
      reconnectToken: client.reconnectToken,
      protocolVersion: this.CURRENT_PROTOCOL_VERSION,
      serverVersion: this.SERVER_VERSION,
      isProtocolCompatible: true,
      updateRecommended: false,
    });

    this.broadcastRoomState(roomCode);
    this.evaluateAutoStart(roomCode);
  }

  private static removePlayerFromOtherRooms(playerId: string, targetRoomCode?: string): void {
    for (const [roomCode, room] of this.rooms.entries()) {
      if (targetRoomCode && roomCode === targetRoomCode) continue;
      
      const playerIndex = (room.players || []).findIndex(p => p.id === playerId);
      if (playerIndex !== -1) {
        if (room.status === 'PLAYING') {
          // Règle du relais : rejoindre une autre table = quitter celle-ci, même règle que l'absence.
          const state = this.getOrCreateActiveState(roomCode, room);
          this.relayLeavingPlayer(room, roomCode, playerId, state);
        } else if (room.status === 'PARTIE_OVER') {
          // Entre deux parties : le siège est conservé, le joueur sera forfait pour la partie suivante s'il n'est pas revenu.
          const rp = (room.players || [])[playerIndex];
          if (rp) {
            rp.leftRoom = true;
            rp.connected = false;
          }
          this.broadcastRoomState(roomCode);
        } else {
          room.players = (room.players || []).filter(p => p.id !== playerId);
          
          if ((room.players || []).length === 0) {
            this.destroyRoom(roomCode, 'removePlayerFromOtherRooms');
          } else {
            if (room.hostId === playerId) {
              const nextHuman = (room.players || []).find((p) => p.isHuman);
              if (nextHuman) {
                room.hostId = nextHuman.id;
                room.hostName = nextHuman.name;
                nextHuman.isHost = true;
              }
            }

            if (room.status === 'LOBBY' || room.status === 'MANCHE_OVER') {
              const activeCount = (room.players || []).filter((p) => !p.isSpectator).length;
              if (activeCount < (room.maxPlayers || 4)) {
                const nextSpectator = (room.players || []).find((p) => p.isSpectator && p.connected);
                if (nextSpectator) {
                  nextSpectator.isSpectator = false;
                  nextSpectator.isEliminated = false;
                  nextSpectator.isForfeit = false;
                  nextSpectator.isReady = true;
                  nextSpectator.capital = room.initialCapital;
                  nextSpectator.score = room.initialCapital;
                  if (nextSpectator.name.endsWith(' (Obs)')) {
                    nextSpectator.name = nextSpectator.name.replace(/\s*\(Obs\)$/, '');
                  }
                }
              }
            }
            this.broadcastRoomState(roomCode);
    this.evaluateAutoStart(roomCode);
          }
        }
      }
    }
  }

  private static handleJoinRoom(client: ConnectedClient, msg: ClientMessage): void {
    const roomCode = msg.roomCode?.toUpperCase();
    
    const clientKey = client.playerId || client.reconnectToken;

    // Rate limiting on brute force room code guesses
    if (clientKey) {
      const now = Date.now();
      const attemptInfo = this.failedJoinAttempts.get(clientKey);
      if (attemptInfo && attemptInfo.resetAt > now && attemptInfo.count >= 6) {
        this.sendMessage(client.socket, {
          type: 'ERROR',
          errorCode: 'RATE_LIMITED',
          error: 'Trop de tentatives de connexion. Veuillez patienter quelques secondes.',
        });
        return;
      }
    }

    if (!roomCode || !this.rooms.has(roomCode)) {
      if (clientKey) {
        const now = Date.now();
        const prev = this.failedJoinAttempts.get(clientKey);
        if (prev && prev.resetAt > now) {
          prev.count += 1;
        } else {
          this.failedJoinAttempts.set(clientKey, { count: 1, resetAt: now + 20000 });
        }
      }

      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'ROOM_NOT_FOUND',
        error: `Salon introuvable : ${roomCode || 'Code vide'}`,
      });
      return;
    }

    // Reset rate limiter on successful room lookup
    if (clientKey) {
      this.failedJoinAttempts.delete(clientKey);
    }

    const room = this.rooms.get(roomCode)!;
    client.roomCode = roomCode;

    // Version Handshake & Protocol Negotiation
    const clientProto = msg.protocolVersion !== undefined ? msg.protocolVersion : 1;
    let isProtocolCompatible = true;
    let updateRecommended = false;

    if (clientProto < this.CURRENT_PROTOCOL_VERSION) {
      if (this.engineConfig.versionPolicy === 'STRICT') {
        this.sendMessage(client.socket, {
          type: 'ERROR',
          errorCode: 'GENERIC',
          error: "Protocole obsolète : Veuillez recharger l'application pour synchroniser la version compatible du jeu.",
          isProtocolCompatible: false,
          serverVersion: this.SERVER_VERSION,
          protocolVersion: this.CURRENT_PROTOCOL_VERSION,
        });
        return;
      } else {
        updateRecommended = true;
      }
    }

    // Check if player is reconnecting to existing seat (by playerId or by reconnectToken)
    let existingPlayer = (room.players || []).find((p) => p.id === client.playerId);
    if (!existingPlayer && msg.playerId) {
      existingPlayer = (room.players || []).find((p) => p.id === msg.playerId);
    }
    const tokenToMatch = msg.reconnectToken || client.reconnectToken;
    if (!existingPlayer && tokenToMatch) {
      const tokenPlayerId = this.tokenToPlayerId.get(tokenToMatch);
      if (tokenPlayerId) {
        existingPlayer = (room.players || []).find((p) => p.id === tokenPlayerId);
      }
      if (!existingPlayer) {
        const roomTokens = this.roomPlayerTokens.get(roomCode);
        if (roomTokens) {
          for (const [pId, pToken] of roomTokens.entries()) {
            if (pToken === tokenToMatch) {
              existingPlayer = (room.players || []).find((p) => p.id === pId);
              if (existingPlayer) break;
            }
          }
        }
      }
    }

    if (existingPlayer && client.playerId !== existingPlayer.id) {
      // Adopt the existing seated playerId
      this.clients.delete(client.playerId);
      this.playerIdToToken.delete(client.playerId);
      client.playerId = existingPlayer.id;
      if (tokenToMatch) {
        client.reconnectToken = tokenToMatch;
      }
      this.tokenToPlayerId.set(client.reconnectToken, client.playerId);
      this.playerIdToToken.set(client.playerId, client.reconnectToken);
      this.clients.set(client.playerId, client);
    }


    // Check if player was kicked from this room
    if (room.bannedPlayerIds && room.bannedPlayerIds.includes(client.playerId) && !existingPlayer) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'BANNED',
        error: "Vous avez été expulsé de ce salon et ne pouvez pas le rejoindre.",
      });
      return;
    }

    // Fair-play sanction enforcement: TEMP_BAN, PERM_BAN, RESTRICT_JOIN_PRIVATE
    const serverSanction = this.getActivePlayerSanction(client.playerId);
    const effectiveSanction = serverSanction ? {
      type: serverSanction.sanctionType || (serverSanction.status === 'BANNED' ? 'TEMP_BAN' : undefined),
      reason: serverSanction.bannedReason || 'Sanction Fair-Play active',
      expiresAt: serverSanction.banExpiresAt,
      active: true,
    } : (msg.fairPlaySanction && msg.fairPlaySanction.active ? msg.fairPlaySanction : null);

    if (effectiveSanction && effectiveSanction.active && !existingPlayer) {
      const isPrivateRoom = room.isPublic === false;
      const sType = effectiveSanction.type;
      if (
        sType === 'TEMP_BAN' ||
        sType === 'PERM_BAN' ||
        (isPrivateRoom && sType === 'RESTRICT_JOIN_PRIVATE')
      ) {
        const isStillActive = !effectiveSanction.expiresAt || Date.now() < effectiveSanction.expiresAt;
        if (isStillActive) {
          const remainingMinutes = effectiveSanction.expiresAt ? Math.ceil((effectiveSanction.expiresAt - Date.now()) / 60000) : 0;
          this.sendMessage(client.socket, {
            type: 'ERROR',
            errorCode: 'BANNED',
            error: `🚫 Accès refusé par le Fair-Play (${sType}) : ${effectiveSanction.reason}${
              remainingMinutes > 0 ? ` (expire dans ${remainingMinutes} min)` : ''
            }`,
          });
          return;
        }
      }
    }

    // Host policy: Enforce Google login ONLY if room has requireGoogleAuth explicitly set
    if (room.requireGoogleAuth && !existingPlayer && msg.isGuest) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'JOIN_REFUSED',
        error: "Connexion Google requise : L'hôte de cette table a restreint l'accès aux comptes Google.",
      });
      return;
    }

    // Maintenance check: Allow existing players to reconnect, but block new players
    if (this.engineConfig.isMaintenanceMode && !existingPlayer) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'MAINTENANCE',
        error: "Accès restreint : " + this.engineConfig.maintenanceNotice,
      });
      return;
    }

    const playerName = msg.playerName?.trim() || `Joueur ${(room.players || []).length + 1}`;
    if (playerName.toLowerCase() === 'katika') {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'JOIN_REFUSED',
        error: "Le pseudonyme 'Katika' est réservé à l'administration.",
      });
      return;
    }

    // Active game protection: block if player is in an active PLAYING game on another table unless confirmed
    if (!msg.confirmLeaveCurrent) {
      const activeGame = this.getActiveGameForPlayer(client.playerId, roomCode);
      if (activeGame) {
        this.sendMessage(client.socket, {
          type: 'ERROR',
          errorCode: 'ACTIVE_GAME_IN_PROGRESS',
          error: `Vous avez une partie en cours (salon ${activeGame.roomCode}). Retournez-y ou quittez-la explicitement.`,
          activeGameRoomCode: activeGame.roomCode,
        });
        return;
      }
    }

    if (existingPlayer) {
      const expectedToken = this.getRoomPlayerToken(roomCode, existingPlayer.id);
      const providedToken = msg.reconnectToken || client.reconnectToken;
      const oldClient = this.clients.get(existingPlayer.id);
      const isOldSocketAlive = oldClient && oldClient.socket !== client.socket && oldClient.socket.readyState === WebSocket.OPEN;

      // Step 1: For Google authenticated accounts, verified UID identity proves ownership
      const isGoogleVerified = Boolean(client.isAuthenticated && client.authUid === existingPlayer.id);
      // Step 2: For guests, the reconnect token proves ownership
      const isTokenValid = isGoogleVerified || (providedToken && expectedToken && providedToken === expectedToken) || !expectedToken;

      if (!isTokenValid) {
        console.warn(`[Security] Session reconnect token mismatch for player '${client.playerId}' in room '${roomCode}'.`);
        if (room.status !== 'LOBBY') {
          // Ongoing match: admit player as spectator under a new safe identity
          const safeSpectatorId = 'usr_' + Math.random().toString(36).substring(2, 9);
          this.clients.delete(client.playerId);
          client.playerId = safeSpectatorId;
          this.clients.set(client.playerId, client);

          const partiesPlayed = room.manchePartiesPlayed !== undefined
            ? room.manchePartiesPlayed
            : (room.gameState ? Math.max(0, room.gameState.partieCount - 1) : 0);
          const prorataCapital = Math.max(room.baseBet, room.initialCapital - (partiesPlayed * room.baseBet));

          const spectatorPlayer: RoomPlayer = {
            id: client.playerId,
            name: `${playerName} (Obs)`,
            isHost: false,
            isHuman: true,
            avatarSeed: msg.avatarSeed || `avatar_${(room.players || []).length + 1}`,
            score: room.initialCapital,
            capital: room.initialCapital,
            prorataCapital,
            isEliminated: false,
            isSpectator: true,
            isPendingIntegration: false,
            hand: [],
            tricksWonInRound: 0,
            isReady: false,
            connected: true,
            lastSeen: Date.now(),
          };

          this.removePlayerFromOtherRooms(client.playerId, roomCode);
          room.players.push(spectatorPlayer);
          this.setRoomPlayerToken(roomCode, client.playerId, client.reconnectToken);

          this.sendMessage(client.socket, {
            type: 'ERROR',
            errorCode: 'SEAT_TAKEN',
            error: "Session protégée : Ce siège est réservé par un autre appareil. Vous avez été admis sur la table en mode spectateur.",
          });
        } else {
          // In LOBBY
          if (isOldSocketAlive) {
            this.sendMessage(client.socket, {
              type: 'ERROR',
              errorCode: 'SEAT_TAKEN',
              error: 'Ce siège est déjà occupé par un joueur actif.',
            });
            return;
          }

          const safePlayerId = 'usr_' + Math.random().toString(36).substring(2, 9);
          this.clients.delete(client.playerId);
          client.playerId = safePlayerId;
          this.clients.set(client.playerId, client);

          const isFull = (room.players || []).filter((p) => !p.isSpectator).length >= room.maxPlayers;
          const newPlayer: RoomPlayer = {
            id: client.playerId,
            name: isFull ? `${playerName} (Obs)` : playerName,
            isHost: false,
            isHuman: true,
            avatarSeed: msg.avatarSeed || `avatar_${(room.players || []).length + 1}`,
            score: room.initialCapital,
            capital: room.initialCapital,
            isEliminated: false,
            isSpectator: isFull,
            isPendingIntegration: false,
            hand: [],
            tricksWonInRound: 0,
            isReady: !isFull,
            connected: true,
            lastSeen: Date.now(),
          };

          this.removePlayerFromOtherRooms(client.playerId, roomCode);
          room.players.push(newPlayer);
          this.setRoomPlayerToken(roomCode, client.playerId, client.reconnectToken);
        }
      } else {
        this.resumeSeat(client, roomCode, playerName, providedToken, isProtocolCompatible, updateRecommended);
        return;
      }
    } else {
      // Prune permanently disconnected players whose grace expired before joining.
      // Règle du relais : en cours de manche, un joueur absent GARDE son siège (retour possible sans limite).
      const graceTimeoutMs = (room.disconnectGraceSeconds || this.engineConfig.reconnectGracePeriodSeconds || 30) * 1000;
      const seatsAreReserved = room.status === 'PLAYING' || room.status === 'PARTIE_OVER';
      room.players = (room.players || []).filter((p) => {
        if (!p.connected && !seatsAreReserved) {
          const isExpired = p.disconnectGraceExpiresAt
            ? Date.now() > p.disconnectGraceExpiresAt
            : (Date.now() - (p.lastSeen || room.createdAt || Date.now()) > graceTimeoutMs);
          if (isExpired) return false;
        }
        return true;
      });

      if (room.status === 'LOBBY') {
        const isFull = (room.players || []).filter((p) => !p.isSpectator).length >= room.maxPlayers;
        
        // Phase F: Race conditions handling with friendly feedback
        if (isFull) {
          this.sendMessage(client.socket, {
            type: 'ERROR',
            errorCode: 'JOIN_REFUSED',
            error: "Mince, un autre joueur a été plus rapide ! La table est déjà complète.",
          });
          return;
        }

        this.removePlayerFromOtherRooms(client.playerId, roomCode);

        const newPlayer: RoomPlayer = {
          id: client.playerId,
          name: playerName,
          isHost: false,
          isHuman: true,
          avatarSeed: msg.avatarSeed || `avatar_${(room.players || []).length + 1}`,
          score: room.initialCapital,
          capital: room.initialCapital,
          isEliminated: false,
          isSpectator: isFull,
          isPendingIntegration: false,
          hand: [],
          tricksWonInRound: 0,
          isReady: !isFull,
          connected: true,
          lastSeen: Date.now(),
        };

        room.players.push(newPlayer);
        this.setRoomPlayerToken(roomCode, client.playerId, client.reconnectToken);
      } else if (room.status === 'MANCHE_OVER') {
        // Between rounds: join directly as seated player if seats available, or as observer
        const activeCount = (room.players || []).filter((p) => !p.isSpectator).length;
        const willBeSpectator = activeCount >= room.maxPlayers;
        
        this.removePlayerFromOtherRooms(client.playerId, roomCode);

        const newPlayer: RoomPlayer = {
          id: client.playerId,
          name: willBeSpectator ? `${playerName} (Obs)` : playerName,
          isHost: false,
          isHuman: true,
          avatarSeed: msg.avatarSeed || `avatar_${(room.players || []).length + 1}`,
          score: room.initialCapital,
          capital: room.initialCapital,
          isEliminated: false,
          isSpectator: willBeSpectator,
          isPendingIntegration: false,
          hand: [],
          tricksWonInRound: 0,
          isReady: !willBeSpectator,
          connected: true,
          lastSeen: Date.now(),
        };

        room.players.push(newPlayer);
        this.setRoomPlayerToken(roomCode, client.playerId, client.reconnectToken);
      } else {
        // Game is ongoing (PLAYING, PARTIE_OVER) -> Spectator Mode
        const partiesPlayed = room.manchePartiesPlayed !== undefined
          ? room.manchePartiesPlayed
          : (room.gameState ? Math.max(0, room.gameState.partieCount - 1) : 0);
        const prorataCapital = Math.max(room.baseBet, room.initialCapital - (partiesPlayed * room.baseBet));

        this.removePlayerFromOtherRooms(client.playerId, roomCode);

        const spectatorPlayer: RoomPlayer = {
          id: client.playerId,
          name: `${playerName} (Obs)`,
          isHost: false,
          isHuman: true,
          avatarSeed: msg.avatarSeed || `avatar_${(room.players || []).length + 1}`,
          score: room.initialCapital,
          capital: room.initialCapital,
          prorataCapital,
          isEliminated: false,
          isSpectator: true,
          isPendingIntegration: false,
          hand: [],
          tricksWonInRound: 0,
          isReady: false,
          connected: true,
          lastSeen: Date.now(),
        };

        room.players.push(spectatorPlayer);
        this.setRoomPlayerToken(roomCode, client.playerId, client.reconnectToken);
      }
    }

    // Strictly deduplicate room.players to prevent any duplicate player entries
    const seenPlayerIds = new Set<string>();
    room.players = (room.players || []).filter((p) => {
      if (seenPlayerIds.has(p.id)) return false;
      seenPlayerIds.add(p.id);
      return true;
    });

    room.updatedAt = Date.now();

    // Check if original host or returning host
    room.originalHostId = room.originalHostId || room.hostId;
    if (client.playerId === room.originalHostId) {
      if (room.hostId !== room.originalHostId) {
        room.hostId = room.originalHostId;
        room.hostName = playerName;
        (room.players || []).forEach((p) => { p.isHost = (p.id === room.originalHostId); });
      }
      room.hostAbsentSince = undefined;
    } else {
      // Evaluate fallback host
      this.evaluateLobbyHostTakeover(roomCode);
      // Notify host if a human joined while host is absent
      this.notifyHostPlayerJoined(room, playerName, client.playerId);
    }

    this.sendMessage(client.socket, {
      type: 'ROOM_JOINED',
      room: maskOpponentCards(room, client.playerId),
      playerId: client.playerId,
      reconnectToken: client.reconnectToken,
      protocolVersion: this.CURRENT_PROTOCOL_VERSION,
      serverVersion: this.SERVER_VERSION,
      isProtocolCompatible,
      updateRecommended,
    });

    this.broadcastRoomState(roomCode);
    this.evaluateAutoStart(roomCode);
  }

  /**
   * Resumes seat of an existing player in a room upon reconnection (from handleJoinRoom or handleAuthMessage).
   * Strictly idempotent to avoid duplicated messages or emotes.
   */
  private static resumeSeat(
    client: ConnectedClient,
    roomCode: string,
    playerName?: string,
    providedToken?: string,
    isProtocolCompatible: boolean = true,
    updateRecommended: boolean = false
  ): boolean {
    const room = this.rooms.get(roomCode);
    if (!room) return false;

    const existingPlayer = (room.players || []).find((p) => p.id === client.playerId);
    if (!existingPlayer) return false;

    const token = providedToken || client.reconnectToken;
    const oldClient = this.clients.get(existingPlayer.id);

    this.removePlayerFromOtherRooms(client.playerId, roomCode);

    if (oldClient && oldClient.socket !== client.socket && oldClient.socket.readyState === WebSocket.OPEN) {
      try {
        oldClient.socket.close(1000, 'Session remplacée par une nouvelle connexion');
      } catch (e) {
        // ignore
      }
    }

    if (token) {
      this.setRoomPlayerToken(roomCode, client.playerId, token);
      client.reconnectToken = token;
      this.tokenToPlayerId.set(token, client.playerId);
      this.playerIdToToken.set(client.playerId, token);
    }
    client.roomCode = roomCode;
    this.clients.set(client.playerId, client);

    const displayName = playerName || existingPlayer.name;

    // [Droit du sang] - Host recovery
    if (room.originalHostId === client.playerId && room.hostId !== client.playerId) {
      const previousHost = (room.players || []).find((p) => p.id === room.hostId);
      if (previousHost) previousHost.isHost = false;
      existingPlayer.isHost = true;
      room.hostId = client.playerId;
      room.hostName = displayName;
      this.broadcastRoomState(roomCode);
      this.evaluateAutoStart(roomCode);
      const emote: EmoteMessage = {
        id: 'em_' + Math.random().toString(36).substring(2, 9),
        playerId: 'system',
        playerName: 'Table',
        text: `👑 L'hôte original (${displayName}) est de retour et récupère ses droits !`,
        emoji: '👑',
        timestamp: Date.now(),
        isBot: true,
      };
      room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
    }

    existingPlayer.connected = true;
    existingPlayer.lastSeen = Date.now();
    const activeCount = (room.players || []).filter((p) => !p.isSpectator && p.id !== client.playerId).length;

    if (room.status === 'LOBBY' || room.status === 'MANCHE_OVER') {
      existingPlayer.isSpectator = activeCount >= room.maxPlayers;
      if (!existingPlayer.isSpectator) {
        existingPlayer.isEliminated = false;
        existingPlayer.isForfeit = false;
        existingPlayer.isReady = true;
        existingPlayer.forfeitedForManche = false;
        existingPlayer.leftRoom = false;
        if (room.status === 'LOBBY') {
          existingPlayer.capital = room.initialCapital;
          existingPlayer.score = room.initialCapital;
        }
      }
    }

    const state = this.getOrCreateActiveState(roomCode, room);
    ServerGameEngine.handlePlayerReconnect(
      room,
      client.playerId,
      (updatedRoom) => {
        this.broadcastRoomState(updatedRoom.id);
        this.evaluateAutoStart(updatedRoom.id);
      },
      state
    );

    if (playerName) existingPlayer.name = playerName;

    // Strictly deduplicate room.players to prevent any duplicate player entries
    const seenPlayerIds = new Set<string>();
    room.players = (room.players || []).filter((p) => {
      if (seenPlayerIds.has(p.id)) return false;
      seenPlayerIds.add(p.id);
      return true;
    });

    room.updatedAt = Date.now();

    this.sendMessage(client.socket, {
      type: 'ROOM_JOINED',
      room: maskOpponentCards(room, client.playerId),
      playerId: client.playerId,
      reconnectToken: client.reconnectToken,
      protocolVersion: this.CURRENT_PROTOCOL_VERSION,
      serverVersion: this.SERVER_VERSION,
      isProtocolCompatible,
      updateRecommended,
    });
    this.deliverPartieResults(client.socket, client.playerId);

    this.broadcastRoomState(roomCode);
    this.evaluateAutoStart(roomCode);
    return true;
  }

  public static evaluateLobbyHostInactivity(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    const state = this.getOrCreateActiveState(roomCode, room);

    // Seul MANCHE_OVER est géré ici. LOBBY utilise evaluateLobbyHostTakeover (hôte de repli).
    if (room.status !== 'MANCHE_OVER') {
      if (state.hostTransferTimer) {
        clearTimeout(state.hostTransferTimer);
        state.hostTransferTimer = null;
      }
      room.hostTransferGraceExpiresAt = null;
      return;
    }

    const connectedHumans = (room.players || []).filter((p) => p.isHuman && p.connected);
    const currentHost = (room.players || []).find((p) => p.isHost);
    const isHostDisconnected = !currentHost || !currentHost.connected;

    // Cas 1 : L'hôte est déconnecté dans le lobby
    if (isHostDisconnected) {
      const liveGuests = connectedHumans.filter((p) => !p.isHost);
      if (liveGuests.length > 0) {
        if (!state.hostTransferTimer || !state.isHostDisconnectTimer) {
          if (state.hostTransferTimer) clearTimeout(state.hostTransferTimer);
          // Délai de grâce étendu (180s / 3 min) pour permettre le partage de code, micro-coupures et reconnexion sereine de l'hôte
          const hostGraceSecs = this.engineConfig.lobbyDisconnectGraceSeconds || 180;
          room.hostTransferGraceExpiresAt = Date.now() + hostGraceSecs * 1000;
          this.broadcastRoomState(roomCode);
          this.evaluateAutoStart(roomCode);
          state.isHostDisconnectTimer = true;

          state.hostTransferTimer = setTimeout(() => {
            state.hostTransferTimer = null;
            state.isHostDisconnectTimer = false;
            const currentRoom = this.rooms.get(roomCode);
            if (!currentRoom || (currentRoom.status !== 'LOBBY' && currentRoom.status !== 'MANCHE_OVER')) return;

            const updatedHost = currentRoom.players.find((p) => p.isHost);
            if (updatedHost && updatedHost.connected) {
              // L'hôte s'est reconnecté à temps
              currentRoom.hostTransferGraceExpiresAt = null;
              this.broadcastRoomState(roomCode);
              this.evaluateAutoStart(roomCode);
              return;
            }

            const candidates = currentRoom.players.filter((p) => p.isHuman && p.connected);
            if (candidates.length > 0) {
              const newHost = candidates.find((p) => !p.isSpectator && p.isReady) ||
                              candidates.find((p) => !p.isSpectator) ||
                              candidates[0];
              if (updatedHost) updatedHost.isHost = false;

              newHost.isHost = true;
              newHost.isReady = true;
              currentRoom.hostId = newHost.id;
              currentRoom.hostName = newHost.name;
              currentRoom.hostTransferGraceExpiresAt = null;
              currentRoom.updatedAt = Date.now();

              this.broadcastRoomState(roomCode);
              this.evaluateAutoStart(roomCode);

              const alertMsg = `👑 Transfert d'Hôte : L'ancien hôte s'est déconnecté. Le rôle d'hôte a été confié à ${newHost.name} !`;
              this.clients.forEach((c) => {
                if (c.roomCode === roomCode && c.socket.readyState === WebSocket.OPEN) {
                  this.sendMessage(c.socket, {
                    type: 'LOBBY_ALERT',
                    alertMessage: alertMsg,
                    timestamp: Date.now(),
                  });
                }
              });
            } else {
              currentRoom.hostTransferGraceExpiresAt = null;
              this.broadcastRoomState(roomCode);
              this.evaluateAutoStart(roomCode);
            }
          }, hostGraceSecs * 1000);
        }
      }
      return;
    } else {
      // L'hôte est connecté, on annule le décompte de déconnexion si existant
      if (state.hostTransferTimer && state.isHostDisconnectTimer) {
        clearTimeout(state.hostTransferTimer);
        state.hostTransferTimer = null;
        state.isHostDisconnectTimer = false;
        room.hostTransferGraceExpiresAt = null;
        this.broadcastRoomState(roomCode);
        this.evaluateAutoStart(roomCode);
      }
    }

    // Cas 2 : L'hôte est connecté, vérification des conditions de lancement et d'inactivité
    const connectedGuests = connectedHumans.filter((p) => !p.isHost);
    const maxCapacity = Math.min(4, Math.max(2, room.maxPlayers || 4));
    const hasRequiredHumansToStart = room.fillWithBots
      ? connectedHumans.length >= 2
      : connectedHumans.length >= maxCapacity;

    const unreadyGuests = connectedGuests.filter((p) => !p.isReady);
    const isLaunchReady = hasRequiredHumansToStart && unreadyGuests.length === 0 && connectedGuests.length >= 1;

    if (isLaunchReady) {
      if (!state.hostTransferTimer) {
        // Démarrer la fenêtre de grâce d'inactivité de l'hôte
        const graceSeconds = this.engineConfig.lobbyDisconnectGraceSeconds || 180;
        room.hostTransferGraceExpiresAt = Date.now() + graceSeconds * 1000;
        this.broadcastRoomState(roomCode);
        state.isHostDisconnectTimer = false;

        state.hostTransferTimer = setTimeout(() => {
          state.hostTransferTimer = null;
          const currentRoom = this.rooms.get(roomCode);
          if (!currentRoom || (currentRoom.status !== 'LOBBY' && currentRoom.status !== 'MANCHE_OVER')) return;

          const liveHumans = currentRoom.players.filter((p) => p.isHuman && p.connected);
          const liveGuests = liveHumans.filter((p) => !p.isHost && p.isReady);

          if (liveGuests.length > 0) {
            const newHost = liveGuests[0];
            const oldHost = currentRoom.players.find((p) => p.isHost);
            if (oldHost) oldHost.isHost = false;

            newHost.isHost = true;
            newHost.isReady = true;
            currentRoom.hostId = newHost.id;
            currentRoom.hostName = newHost.name;
            currentRoom.hostTransferGraceExpiresAt = null;
            currentRoom.updatedAt = Date.now();

            this.broadcastRoomState(roomCode);
            this.evaluateAutoStart(roomCode);

            // Diffusion d'une alerte du transfert d'hôte aux joueurs
            const alertMsg = `⚠️ Transfert d'Hôte : L'hôte était inactif. Le rôle d'hôte a été transféré à ${newHost.name} !`;
            this.clients.forEach((c) => {
              if (c.roomCode === roomCode && c.socket.readyState === WebSocket.OPEN) {
                this.sendMessage(c.socket, {
                  type: 'LOBBY_ALERT',
                  alertMessage: alertMsg,
                  timestamp: Date.now(),
                });
              }
            });
          } else {
            currentRoom.hostTransferGraceExpiresAt = null;
            this.broadcastRoomState(roomCode);
            this.evaluateAutoStart(roomCode);
          }
        }, graceSeconds * 1000);
      }
    } else {
      // Si les conditions de lancement ne sont plus remplies, annuler le timer
      if (state.hostTransferTimer) {
        clearTimeout(state.hostTransferTimer);
        state.hostTransferTimer = null;
      }
      if (room.hostTransferGraceExpiresAt !== null && room.hostTransferGraceExpiresAt !== undefined) {
        room.hostTransferGraceExpiresAt = null;
        this.broadcastRoomState(roomCode);
    this.evaluateAutoStart(roomCode);
      }
    }
  }


  public static evaluateAutoStart(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    const state = this.getOrCreateActiveState(roomCode, room);

    if (!room.isPublic || (room.status !== 'LOBBY' && room.status !== 'MANCHE_OVER')) {
      this.cancelAutoStart(roomCode);
      return;
    }

    const connectedHumans = (room.players || []).filter(p => p.isHuman && p.connected && !p.isSpectator);
    const maxCapacity = Math.min(4, Math.max(2, room.maxPlayers || 4));
    
    // Auto-start conditions for public rooms:
    // Either room is full of humans, OR fillWithBots is enabled and we have at least 2 humans.
    // AND all connected humans are ready (except host which is implicitly ready).
    // Note: Never auto-start a room with only 1 human so the host has time to wait for friends.
    const isFullWithHumans = connectedHumans.length >= maxCapacity;
    const canFillWithBots = room.fillWithBots && connectedHumans.length >= 2;
    const allReady = connectedHumans.every(p => p.isReady || p.isHost);
    const hasEnoughHumans = connectedHumans.length >= 2;

    const shouldAutoStart = (isFullWithHumans || (canFillWithBots && hasEnoughHumans)) && allReady;

    if (shouldAutoStart) {
      if (!state.autoStartTimer) {
        const delay = 5000; // 5 seconds countdown
        room.autoStartCountdownAt = Date.now() + delay;
        state.autoStartTimer = setTimeout(() => {
          state.autoStartTimer = null;
          room.autoStartCountdownAt = null;
          
          const targetRoom = this.rooms.get(roomCode);
          if (targetRoom && (targetRoom.status === 'LOBBY' || targetRoom.status === 'MANCHE_OVER')) {
             const hostPlayer = targetRoom.players.find(p => p.isHost) || connectedHumans[0];
             if (hostPlayer) {
               // Mock a client message to start game
               const mockClient: any = { roomCode: roomCode, playerId: hostPlayer.id, socket: { send: () => {} } };
               this.handleStartGame(mockClient, { type: 'START_GAME', roomCode, playerId: hostPlayer.id });
             }
          }
        }, delay);
        this.broadcastRoomState(roomCode);
      }
    } else {
      this.cancelAutoStart(roomCode);
    }
  }

  private static cancelAutoStart(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    const state = this.roomStates.get(roomCode);
    if (state && state.autoStartTimer) {
      clearTimeout(state.autoStartTimer);
      state.autoStartTimer = null;
      if (room) {
        room.autoStartCountdownAt = null;
        this.broadcastRoomState(roomCode);
      }
    }
  }

  private static resetHostActivityTimer(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    const state = this.getOrCreateActiveState(roomCode, room);
    if (state.hostTransferTimer) {
      clearTimeout(state.hostTransferTimer);
      state.hostTransferTimer = null;
    }
    room.hostTransferGraceExpiresAt = null;
  }

  private static handleSetReady(client: ConnectedClient, msg: ClientMessage): void {
    if (!client.roomCode || !this.rooms.has(client.roomCode)) return;
    const room = this.rooms.get(client.roomCode)!;

    const player = (room.players || []).find((p) => p.id === client.playerId);
    if (player) {
      if (room.status === 'LOBBY' && player.isSpectator) {
        const activeCount = (room.players || []).filter((p) => !p.isSpectator && p.id !== player.id).length;
        if (activeCount < (room.maxPlayers || 4)) {
          player.isSpectator = false;
          player.isEliminated = false;
          player.isForfeit = false;
          player.forfeitedForManche = false;
          player.leftRoom = false;
          player.capital = room.initialCapital;
          player.score = room.initialCapital;
        }
      }
      player.isReady = !!msg.isReady;
      room.updatedAt = Date.now();

      // Si l'hôte change son statut, réinitialiser son timer d'activité
      if (player.isHost) {
        this.resetHostActivityTimer(client.roomCode);
      }

      this.broadcastRoomState(client.roomCode);
    if (client.roomCode) this.evaluateAutoStart(client.roomCode);
      this.evaluateLobbyHostInactivity(client.roomCode);
    }
  }

  private static handleStartGame(client: ConnectedClient, msg: ClientMessage): void {
    const targetRoomCode = client.roomCode || msg.roomCode;
    if (!targetRoomCode || !this.rooms.has(targetRoomCode)) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'ROOM_NOT_FOUND',
        error: 'Salon introuvable pour démarrer la partie.',
      });
      return;
    }
    client.roomCode = targetRoomCode;
    const room = this.rooms.get(targetRoomCode)!;

    if (room.status === 'MANCHE_OVER') {
      room.players = (room.players || []).filter((p) => !p.leftRoom);
    }

    const isHost = room.hostId === client.playerId;
    const connectedHumans = (room.players || []).filter((p) => p.isHuman && p.connected);
    const maxCapacity = Math.min(4, Math.max(2, room.maxPlayers || 4));
    const seatedHumans = connectedHumans.slice(0, maxCapacity);
    const unreadyGuests = seatedHumans.filter((p) => !p.isHost && !p.isReady);

    // Si ce n'est pas l'hôte, vérifier s'il s'agit d'une action d'urgence autorisée
    const isEmergencyStart = !isHost && (
      (room.botVotes && room.botVotes.length >= 2) ||
      (room.hostTransferGraceExpiresAt && Date.now() >= room.hostTransferGraceExpiresAt - 1000)
    );

    if (!isHost && !isEmergencyStart) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'GENERIC',
        error: 'Seul l’hôte peut lancer la partie.',
      });
      return;
    }

    if (connectedHumans.length < 2 && !(room.isPublic && room.fillWithBots)) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'GENERIC',
        error: 'Un salon multijoueur requiert au moins 2 joueurs humains connectés pour démarrer la partie.',
      });
      return;
    }

    if (!room.fillWithBots && connectedHumans.length < maxCapacity) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'GENERIC',
        error: `Ce salon 100% humains est configuré pour ${maxCapacity} joueurs. Veuillez attendre ${maxCapacity - connectedHumans.length} joueur(s) supplémentaire(s) ou activer l'option "Remplir avec des Bots".`,
      });
      return;
    }

    if (room.status === 'MANCHE_OVER') {
      // Revanche / Nouvelle manche : incrémenter le numéro de manche officiel pour toute la table
      room.mancheNumber = (room.mancheNumber || 1) + 1;
      // Promouvoir d'abord les spectateurs connectés s'il y a des places libres
      const activePlayerCount = (room.players || []).filter(p => !p.isSpectator).length;
      if (activePlayerCount < maxCapacity) {
        (room.players || []).forEach(p => {
          if (p.isSpectator && p.connected) {
            p.isSpectator = false;
            p.name = p.name.replace(/\s*\(Obs\)$/, '');
          }
        });
      }

      // Réinitialiser symétriquement TOUS les joueurs de la table (humains et bots restants)
      (room.players || []).forEach((p) => {
        p.isReady = true;
        p.isSpectator = false;
        p.isEliminated = false;
        p.isForfeit = false;
        p.isAiRelay = false;
        p.readyForNextPartie = false;
        p.forfeitedForManche = false;
        p.leftRoom = false;
        p.capital = room.initialCapital;
        p.score = room.initialCapital;
        p.tricksWonInRound = 0;
      });
      room.botVotes = [];
    } else if (unreadyGuests.length > 0) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'GENERIC',
        error: 'Tous les invités doivent avoir cliqué sur "Prêt" avant de lancer la partie.',
      });
      return;
    }

    // Réinitialiser le timer d'inactivité
    this.resetHostActivityTimer(targetRoomCode);

    const state = this.getOrCreateActiveState(client.roomCode, room);

    ServerGameEngine.startNewGame(
      room,
      (updatedRoom) => {
        this.broadcastRoomState(updatedRoom.id);
          this.evaluateAutoStart(updatedRoom.id);
      },
      state
    );
  }

  
  private static handleKickPlayer(client: ConnectedClient, msg: ClientMessage): void {
    if (!client.roomCode || !this.rooms.has(client.roomCode) || !msg.targetPlayerId) return;
    const room = this.rooms.get(client.roomCode)!;
    
    // Only host can kick, and only in LOBBY or MANCHE_OVER
    if (room.hostId !== client.playerId) return;
    if (room.status !== 'LOBBY' && room.status !== 'MANCHE_OVER') return;

    if (msg.targetPlayerId === room.originalHostId) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'FORBIDDEN',
        error: "Impossible d'expulser l'hôte d'origine !",
      });
      return;
    }

    if (room.originalHostId && client.playerId !== room.originalHostId) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'FORBIDDEN',
        error: "L'hôte de repli ne peut pas expulser de joueurs.",
      });
      return;
    }
    
    const targetPlayerId = msg.targetPlayerId;
    if (targetPlayerId === client.playerId) return; // Cannot kick oneself
    
    const targetPlayerIndex = (room.players || []).findIndex(p => p.id === targetPlayerId);
    if (targetPlayerIndex !== -1) {
      // Clean up disconnect timers and tokens
      this.deletePlayerToken(room.id, targetPlayerId);
      const state = this.roomStates.get(room.id);
      if (state && state.disconnectTimers.has(targetPlayerId)) {
        clearTimeout(state.disconnectTimers.get(targetPlayerId)!);
        state.disconnectTimers.delete(targetPlayerId);
      }

      // Add to banned list
      if (!room.bannedPlayerIds) room.bannedPlayerIds = [];
      if (!room.bannedPlayerIds.includes(targetPlayerId)) {
        room.bannedPlayerIds.push(targetPlayerId);
      }
      
      const targetPlayerName = room.players[targetPlayerIndex].name;
      room.players.splice(targetPlayerIndex, 1);
      
      // Notify the kicked player if they are connected and detach room
      const targetClient = this.clients.get(targetPlayerId);
      if (targetClient) {
        targetClient.roomCode = null;
        if (targetClient.socket.readyState === WebSocket.OPEN) {
          this.sendMessage(targetClient.socket, {
            type: 'ERROR',
            errorCode: 'BANNED',
            error: "Vous avez été expulsé du salon par l'hôte.",
          });
        }
      }
      
      // Send alert to the room
      this.clients.forEach(c => {
        if (c.roomCode === room.id && c.socket.readyState === WebSocket.OPEN) {
          this.sendMessage(c.socket, {
            type: 'LOBBY_ALERT',
            alertMessage: `${targetPlayerName} a été expulsé(e) du salon.`,
            timestamp: Date.now()
          });
        }
      });
      
      room.updatedAt = Date.now();
      this.broadcastRoomState(room.id);
      this.evaluateAutoStart(room.id);
    }
  }

  private static handleClaimHost(client: ConnectedClient, msg: ClientMessage): void {
    if (!client.roomCode || !this.rooms.has(client.roomCode)) return;
    const room = this.rooms.get(client.roomCode)!;

    const claimant = (room.players || []).find((p) => p.id === client.playerId);
    if (!claimant || !claimant.isHuman || !claimant.connected) return;

    if (claimant.isHost) return;

    if (room.status !== 'LOBBY' && room.status !== 'MANCHE_OVER') {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'GENERIC',
        error: "Le rôle d'hôte ne peut être repris que dans le salon d'attente.",
      });
      return;
    }

    const currentHost = (room.players || []).find((p) => p.isHost);
    const isHostDisconnected = !currentHost || !currentHost.connected;
    const isGraceExpiredOrNear = Boolean(
      room.hostTransferGraceExpiresAt && Date.now() >= (room.hostTransferGraceExpiresAt - 2000)
    );

    if (!isHostDisconnected && !isGraceExpiredOrNear) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'GENERIC',
        error: "L'hôte actuel est encore actif. Le transfert n'est autorisé qu'en cas d'inactivité ou de déconnexion de l'hôte.",
      });
      return;
    }

    (room.players || []).forEach((p) => {
      p.isHost = p.id === client.playerId;
    });
    room.hostId = client.playerId;
    room.hostName = claimant.name;
    claimant.isReady = true;
    room.hostTransferGraceExpiresAt = null;
    room.updatedAt = Date.now();

    this.resetHostActivityTimer(client.roomCode);
    this.broadcastRoomState(client.roomCode);
    if (client.roomCode) this.evaluateAutoStart(client.roomCode);

    const alertMsg = `👑 ${claimant.name} a repris le rôle d'hôte du salon !`;
    this.clients.forEach((c) => {
      if (c.roomCode === room.id && c.socket.readyState === WebSocket.OPEN) {
        this.sendMessage(c.socket, {
          type: 'LOBBY_ALERT',
          alertMessage: alertMsg,
          timestamp: Date.now(),
        });
      }
    });
  }

  private static handleVoteBots(client: ConnectedClient, msg: ClientMessage): void {
    if (!client.roomCode || !this.rooms.has(client.roomCode)) return;
    this.tickRoom(client.roomCode);
    const room = this.rooms.get(client.roomCode);
    if (!room) return;

    const player = (room.players || []).find((p) => p.id === client.playerId);
    if (!player || !player.isHuman) return;

    if (player.isHost) {
      if (room.originalHostId && client.playerId !== room.originalHostId) {
        this.sendMessage(client.socket, {
          type: 'ERROR',
          errorCode: 'FORBIDDEN',
          error: "L'hôte de repli ne peut pas ajouter de bots à la table.",
        });
        return;
      }
      room.fillWithBots = true;
      this.resetHostActivityTimer(client.roomCode);
      const alertMsg = `🤖 L'hôte a activé l'option : les places vacantes seront complétées avec des bots.`;
      this.clients.forEach((c) => {
        if (c.roomCode === room.id && c.socket.readyState === WebSocket.OPEN) {
          this.sendMessage(c.socket, {
            type: 'LOBBY_ALERT',
            alertMessage: alertMsg,
            timestamp: Date.now(),
          });
        }
      });
    } else {
      if (!room.botVotes) room.botVotes = [];
      if (!room.botVotes.includes(client.playerId)) {
        room.botVotes.push(client.playerId);
      }
      const connectedHumans = (room.players || []).filter((p) => p.isHuman && p.connected);
      const connectedGuests = connectedHumans.filter((p) => !p.isHost);
      const requiredVotes = connectedGuests.length <= 1 ? 1 : Math.ceil(connectedGuests.length / 2);
      const guestVotes = (room.botVotes || []).filter((id) => connectedGuests.some((g) => g.id === id)).length;

      if (guestVotes >= requiredVotes && connectedHumans.length >= 2) {
        room.fillWithBots = true;
        const alertMsg = `🤖 Vote validé (${guestVotes}/${connectedGuests.length}) : Le salon complétera désormais les places vacantes avec des bots !`;
        this.clients.forEach((c) => {
          if (c.roomCode === room.id && c.socket.readyState === WebSocket.OPEN) {
            this.sendMessage(c.socket, {
              type: 'LOBBY_ALERT',
              alertMessage: alertMsg,
              timestamp: Date.now(),
            });
          }
        });
      }
    }

    room.updatedAt = Date.now();
    this.broadcastRoomState(client.roomCode);
    if (client.roomCode) this.evaluateAutoStart(client.roomCode);
    this.evaluateLobbyHostInactivity(client.roomCode);
  }

  private static handlePlayCard(client: ConnectedClient, msg: ClientMessage): void {
    if (!client.roomCode || !this.rooms.has(client.roomCode) || !msg.cardId) return;
    const room = this.rooms.get(client.roomCode)!;
    const state = this.getOrCreateActiveState(client.roomCode, room);

    const success = ServerGameEngine.handlePlayCard(
      room,
      client.playerId,
      msg.cardId,
      (updatedRoom) => {
        this.broadcastRoomState(updatedRoom.id);
          this.evaluateAutoStart(updatedRoom.id);
      },
      state
    );

    if (!success) {
      const gs = room.gameState;
      const nominalDuration = (room.turnTimerSeconds || 15) * 1000;
      const turnExpired = gs && gs.phase === 'PLAYING' && (
        gs.players[gs.currentTurnIndex]?.id !== client.playerId ||
        (gs.turnStartedAt && Date.now() > gs.turnStartedAt + nominalDuration + 500)
      );
      if (turnExpired) {
        this.sendMessage(client.socket, {
          type: 'ERROR',
          errorCode: 'TURN_EXPIRED',
          error: 'Tour expiré',
        });
      }
    }
  }

  private static handleReadyNextPartie(client: ConnectedClient, msg: ClientMessage): void {
    if (!client.roomCode || !this.rooms.has(client.roomCode)) return;
    this.tickRoom(client.roomCode);
    const room = this.rooms.get(client.roomCode);
    if (!room) return;

    const player = (room.players || []).find((p) => p.id === client.playerId);
    if (!player || player.isSpectator) return;

    player.readyForNextPartie = true;
    // Confirmer sa présence = reprendre la main : le relais s'efface et le compteur d'inactivité repart de zéro.
    ServerGameEngine.endRelay(room, player.id);
    this.getOrCreateActiveState(client.roomCode, room).consecutiveTimeouts?.set(player.id, 0);
    room.updatedAt = Date.now();

    // Règle du relais : tant qu'un humain est absent, la partie suivante n'est PAS lancée en avance.
    // On laisse courir le compte à rebours de fin de partie : c'est la dernière chance de retour de l'absent.
    const seatedHumans = room.players.filter((p) => p.isHuman && !p.isEliminated && !p.isSpectator);
    const allReady =
      seatedHumans.length > 0 &&
      !ServerGameEngine.hasAbsentHuman(room) &&
      seatedHumans.every((p) => p.readyForNextPartie);

    if (allReady) {
      const state = this.getOrCreateActiveState(client.roomCode, room);
      ServerGameEngine.advanceToNextPartie(
        room,
        (updatedRoom) => {
          this.broadcastRoomState(updatedRoom.id);
          this.evaluateAutoStart(updatedRoom.id);
        },
        state
      );
    } else {
      this.broadcastRoomState(client.roomCode);
      if (client.roomCode) this.evaluateAutoStart(client.roomCode);
    }
  }

  private static handleForceNextPartie(client: ConnectedClient, msg: ClientMessage): void {
    if (!client.roomCode || !this.rooms.has(client.roomCode)) return;
    this.tickRoom(client.roomCode);
    const room = this.rooms.get(client.roomCode);
    if (!room) return;

    // Only host can force the next partie
    if (client.playerId !== room.hostId) {
      return;
    }

    if (room.status !== 'PARTIE_OVER' && room.status !== 'MANCHE_OVER') {
      return;
    }

    // Set all seated non-eliminated players as ready (activate AI relay for disconnected ones)
    (room.players || []).forEach((p) => {
      if (p.isHuman && !p.isEliminated && !p.isSpectator) {
        p.readyForNextPartie = true;
        if (!p.connected) {
          p.isAiRelay = true;
        }
      }
    });

    const emote: EmoteMessage = {
      id: 'em_' + Math.random().toString(36).substring(2, 9),
      playerId: 'system',
      playerName: 'Table',
      text: `⚡ ${room.hostName || "L'hôte"} a forcé le lancement de la donne suivante.`,
      emoji: '⚡',
      timestamp: Date.now(),
      isBot: true,
    };
    room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
    room.updatedAt = Date.now();

    const state = this.getOrCreateActiveState(client.roomCode, room);
    ServerGameEngine.advanceToNextPartie(
      room,
      (updatedRoom) => {
        this.broadcastRoomState(updatedRoom.id);
        this.evaluateAutoStart(updatedRoom.id);
      },
      state
    );
  }

  private static handleSendEmote(client: ConnectedClient, msg: ClientMessage): void {
    if (!client.roomCode || !this.rooms.has(client.roomCode)) return;
    const room = this.rooms.get(client.roomCode)!;

    const player = (room.players || []).find((p) => p.id === client.playerId);
    if (!player) return;

    // Rate limiting: 1 emote per 1200ms per player to prevent chat spam
    const now = Date.now();
    const lastEmote = this.lastEmoteTimestamps.get(client.playerId) || 0;
    if (now - lastEmote < 1200) {
      return; // Drop spam emotes
    }
    this.lastEmoteTimestamps.set(client.playerId, now);

    const gsPlayer = room.gameState?.players?.find((gsp) => gsp.id === player.id);
    if (player.isEliminated || player.isForfeit || gsPlayer?.isEliminated || gsPlayer?.isForfeit || gsPlayer?.isFoldedInRound) {
      return;
    }

    const emote: EmoteMessage = {
      id: 'em_' + Math.random().toString(36).substring(2, 9),
      playerId: player.id,
      playerName: player.name,
      text: msg.text || '',
      emoji: msg.emoji,
      timestamp: Date.now(),
      isBot: false,
    };

    const active = (room.activeEmotes || []).filter(
      (e) => now - e.timestamp < 3500 && e.playerId !== player.id
    );
    room.activeEmotes = [...active, emote].slice(-5);
    room.updatedAt = Date.now();
    this.broadcastRoomState(client.roomCode);
    if (client.roomCode) this.evaluateAutoStart(client.roomCode);

    setTimeout(() => {
      if (this.rooms.has(client.roomCode!)) {
        const r = this.rooms.get(client.roomCode!)!;
        if (r.activeEmotes && r.activeEmotes.some((e) => e.id === emote.id)) {
          r.activeEmotes = r.activeEmotes.filter((e) => e.id !== emote.id);
          r.updatedAt = Date.now();
          this.broadcastRoomState(client.roomCode!);
        }
      }
    }, 3600);
  }

  private static handleUpdateSettings(client: ConnectedClient, msg: ClientMessage): void {
    if (!client.roomCode || !this.rooms.has(client.roomCode) || !msg.settings) return;
    const room = this.rooms.get(client.roomCode)!;

    if (room.hostId !== client.playerId) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'GENERIC',
        error: 'Seul l’hôte peut modifier les paramètres du salon.',
      });
      return;
    }

    if (room.originalHostId && client.playerId !== room.originalHostId) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'FORBIDDEN',
        error: "L'hôte de repli ne peut pas modifier les réglages de la table.",
      });
      return;
    }

    if (msg.settings.fillWithBots !== undefined) room.fillWithBots = msg.settings.fillWithBots;
    if (msg.settings.baseBet !== undefined) {
      room.baseBet = msg.settings.baseBet;
      room.initialBaseBet = msg.settings.baseBet;
    }
    if (msg.settings.initialCapital !== undefined) room.initialCapital = msg.settings.initialCapital;
    if (msg.settings.enableDoubleKora !== undefined) room.enableDoubleKora = msg.settings.enableDoubleKora;
    if (msg.settings.enableUnder21 !== undefined) room.enableUnder21 = msg.settings.enableUnder21;
    if (msg.settings.turnTimerSeconds !== undefined) room.turnTimerSeconds = msg.settings.turnTimerSeconds;
    if (msg.settings.disconnectGraceSeconds !== undefined) room.disconnectGraceSeconds = msg.settings.disconnectGraceSeconds;
    if (msg.settings.afkAction !== undefined) room.afkAction = msg.settings.afkAction;
    if (msg.settings.isPublic !== undefined) room.isPublic = msg.settings.isPublic;

    room.updatedAt = Date.now();
    room.lastSeenAt = Date.now();
    this.broadcastRoomState(client.roomCode);
    if (client.roomCode) this.evaluateAutoStart(client.roomCode);
  }

  private static handleAlertUnreadyPlayers(client: ConnectedClient, msg: ClientMessage): void {
    if (!client.roomCode || !this.rooms.has(client.roomCode)) return;
    const room = this.rooms.get(client.roomCode)!;

    if (room.hostId !== client.playerId) return;

    const hostName = room.hostName || 'L’hôte';
    const alertMsg = `${hostName} souhaite lancer la partie ! Veuillez cliquer sur "Prêt".`;

    this.clients.forEach((c) => {
      if (c.roomCode === room.id && c.playerId !== room.hostId && c.socket.readyState === WebSocket.OPEN) {
        this.sendMessage(c.socket, {
          type: 'LOBBY_ALERT',
          alertMessage: alertMsg,
          timestamp: Date.now(),
        });
      }
    });
  }

  public static forceRemovePlayer(roomCode: string, playerId: string, isExplicit: boolean = false): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    // Remove the player from the room broadcasting group FIRST,
    // so they do not receive SYNC_STATE updates for a room they just left.
    this.deletePlayerToken(roomCode, playerId);
    const c = this.clients.get(playerId);
    if (c && c.roomCode === roomCode) {
      c.roomCode = null;
    }

    const state = this.roomStates.get(roomCode);
    if (state) {
      if (state.disconnectTimers.has(playerId)) {
        clearTimeout(state.disconnectTimers.get(playerId)!);
        state.disconnectTimers.delete(playerId);
      }
      if (state.aiRelayTimers && state.aiRelayTimers.has(playerId)) {
        clearTimeout(state.aiRelayTimers.get(playerId)!);
        state.aiRelayTimers.delete(playerId);
      }
    }

    if (room.status === 'PLAYING') {
      const state = this.getOrCreateActiveState(roomCode, room);
      
      const rp = (room.players || []).find((p) => p.id === playerId);
      const gs = room.gameState;
      const gp = gs ? (gs.players || []).find((p) => p.id === playerId) : null;
      const isSeated = rp && rp.isHuman && !rp.isSpectator && !rp.isEliminated && !rp.forfeitedForManche;

      if (isSeated) {
        // Règle du relais : quitter la table = même règle que l'absence. Le siège est conservé, un relais joue
        // des cartes neutres jusqu'à la fin de la partie, le joueur peut revenir à tout moment.
        this.relayLeavingPlayer(room, roomCode, playerId, state);
      } else {
        // When a player leaves, hot-swap their seat with an AI bot so the table stays at 4 players,
        // no ghost player with an empty hand is left, and the game never hangs at 0s.
        ServerGameEngine.replacePlayerWithBot(
          room,
          playerId,
          (updatedRoom) => {
            this.broadcastRoomState(updatedRoom.id);
            this.evaluateAutoStart(updatedRoom.id);
          },
          state,
          isExplicit ? 'Départ volontaire' : 'Déconnexion'
        );
      }

      if (room.hostId === playerId) {
        const nextHost = (room.players || []).find((p) => p.isHuman && p.connected && !p.isEliminated && !p.isForfeit && p.id !== playerId) ||
                         (room.players || []).find((p) => p.isHuman && !p.isEliminated && !p.isForfeit && p.id !== playerId) ||
                         (room.players || []).find((p) => !p.isEliminated && !p.isForfeit && p.id !== playerId);
        if (nextHost) {
          room.hostId = nextHost.id;
          room.hostName = nextHost.name;
          nextHost.isHost = true;
        } else {
          room.hostName = 'Table Katika (Bots en relais)';
        }
      }

      // Check remaining connected humans
      const remainingHumans = (room.players || []).filter((p) => p.isHuman && p.connected);
      if (remainingHumans.length === 0) {
        room.lastSeenAt = Date.now();
        room.updatedAt = Date.now();
        this.updateHumanAbsentTimestamp(room);
        console.log(`[Room Cleanup] All human players left room ${roomCode}. Inactive countdown started.`);
      }
      return;
    }

    if (room.status === 'PARTIE_OVER') {
      // Règle du relais : quitter entre deux parties = même règle que l'absence. Le siège est conservé (aucune
      // élimination, aucun gel) ; sans retour avant la partie suivante, le joueur est forfait pour cette partie
      // et peut revenir au début de n'importe quelle partie suivante.
      const rp = (room.players || []).find((p) => p.id === playerId);
      if (rp) {
        rp.leftRoom = true;
        rp.connected = false;
      }
      const gs = room.gameState;
      const gp = gs ? (gs.players || []).find((p) => p.id === playerId) : null;
      if (gp) {
        gp.leftRoom = true;
        gp.connected = false;
      }

      if (room.hostId === playerId) {
        const nextHost = (room.players || []).find((p) => p.isHuman && p.connected && !p.isEliminated && !p.isForfeit && p.id !== playerId) ||
                         (room.players || []).find((p) => p.isHuman && !p.isEliminated && !p.isForfeit && p.id !== playerId) ||
                         (room.players || []).find((p) => !p.isEliminated && !p.isForfeit && p.id !== playerId);
        if (nextHost) {
          room.hostId = nextHost.id;
          room.hostName = nextHost.name;
          nextHost.isHost = true;
        } else {
          room.hostName = 'Table Katika (Bots en relais)';
        }
      }

      this.resetHostActivityTimer(roomCode);
      room.updatedAt = Date.now();
      this.broadcastRoomState(roomCode);
      this.evaluateAutoStart(roomCode);
      this.evaluateLobbyHostInactivity(roomCode);
      return;
    }

    room.players = (room.players || []).filter((p) => p.id !== playerId);
    if ((room.players || []).length === 0) {
      // Room empty, clean up
      this.destroyRoom(roomCode, 'leaveRoom');
    } else {
      if (room.hostId === playerId) {
        // Pass host to next connected human
        const nextHost = (room.players || []).find((p) => p.isHuman && p.connected) || (room.players || []).find((p) => p.isHuman) || room.players[0];
        if (nextHost) {
          room.hostId = nextHost.id;
          room.hostName = nextHost.name;
          nextHost.isHost = true;
          nextHost.isReady = true;
        }
      }

      if (room.status === 'LOBBY' || room.status === 'MANCHE_OVER') {
        const activeCount = (room.players || []).filter((p) => !p.isSpectator).length;
        if (activeCount < (room.maxPlayers || 4)) {
          const nextSpectator = (room.players || []).find((p) => p.isSpectator && p.connected);
          if (nextSpectator) {
            nextSpectator.isSpectator = false;
            nextSpectator.isEliminated = false;
            nextSpectator.isForfeit = false;
            nextSpectator.isReady = true;
            nextSpectator.capital = room.initialCapital;
            nextSpectator.score = room.initialCapital;
            if (nextSpectator.name.endsWith(' (Obs)')) {
              nextSpectator.name = nextSpectator.name.replace(/\s*\(Obs\)$/, '');
            }
          }
        }
      }

      this.resetHostActivityTimer(roomCode);
      room.updatedAt = Date.now();
      this.broadcastRoomState(roomCode);
    this.evaluateAutoStart(roomCode);
      this.evaluateLobbyHostInactivity(roomCode);
    }
  }

  /**
   * Règle du relais : un joueur quitte la table (bouton Quitter, ou il rejoint une autre table) pendant une partie.
   * Il garde son siège (retour possible), un relais joue à sa place jusqu'à la fin de la partie.
   */
  private static relayLeavingPlayer(room: MultiplayerRoom, roomCode: string, playerId: string, state: ActiveRoomState): void {
    const rp = (room.players || []).find((p) => p.id === playerId);
    const gp = room.gameState ? (room.gameState.players || []).find((p) => p.id === playerId) : undefined;
    if (rp) {
      rp.leftRoom = true;
      rp.connected = false;
      rp.lastSeen = Date.now();
    }
    if (gp) {
      gp.leftRoom = true;
      gp.connected = false;
    }
    // Un joueur déjà forfait pour cette partie n'a plus de cartes en jeu : rien à relayer.
    if (rp && !rp.isForfeit) {
      ServerGameEngine.startRelay(
        room,
        playerId,
        (updatedRoom) => {
          this.broadcastRoomState(updatedRoom.id);
          this.evaluateAutoStart(updatedRoom.id);
        },
        state,
        'LEFT'
      );
    } else {
      this.broadcastRoomState(roomCode);
    }
  }

  private static handleLeaveRoom(client: ConnectedClient, msg: ClientMessage): void {
    if (!client.roomCode) return;
    this.forceRemovePlayer(client.roomCode, client.playerId, true);
  }

  private static handleFoldRound(client: ConnectedClient, msg: ClientMessage): void {
    if (!client.roomCode || !this.rooms.has(client.roomCode)) return;
    const room = this.rooms.get(client.roomCode)!;
    if (room.status !== 'PLAYING') return;

    const state = this.getOrCreateActiveState(client.roomCode, room);
    ServerGameEngine.handleFoldRound(
      room,
      client.playerId,
      (updatedRoom) => {
        this.broadcastRoomState(updatedRoom.id);
          this.evaluateAutoStart(updatedRoom.id);
      },
      state
    );
  }

  private static handleKoraHunterAlert(client: ConnectedClient, msg: ClientMessage): void {
    if (!client.roomCode || !this.rooms.has(client.roomCode)) return;
    const room = this.rooms.get(client.roomCode)!;
    if (!room.gameState) return;

    const player = (room.players || []).find((p) => p.id === client.playerId);
    if (!player) return;

    const gsPlayer = room.gameState.players?.find((gsp) => gsp.id === player.id);
    if (player.isEliminated || player.isForfeit || gsPlayer?.isEliminated || gsPlayer?.isForfeit || gsPlayer?.isFoldedInRound) {
      return;
    }

    room.gameState.showKoraHunterAlert = true;
    room.updatedAt = Date.now();
    this.broadcastRoomState(client.roomCode);
    if (client.roomCode) this.evaluateAutoStart(client.roomCode);
  }

  private static handleDismissKoraAlert(client: ConnectedClient, msg: ClientMessage): void {
    if (!client.roomCode || !this.rooms.has(client.roomCode)) return;
    const room = this.rooms.get(client.roomCode)!;
    if (!room.gameState) return;

    room.gameState.showKoraHunterAlert = false;
    room.updatedAt = Date.now();
    this.broadcastRoomState(client.roomCode);
    if (client.roomCode) this.evaluateAutoStart(client.roomCode);
  }

  private static handleProposeBetIncrease(client: ConnectedClient, msg: ClientMessage): void {
    if (!client.roomCode || !this.rooms.has(client.roomCode)) return;
    const room = this.rooms.get(client.roomCode)!;

    const player = (room.players || []).find((p) => p.id === client.playerId);
    if (!player || !player.isHuman || player.isEliminated || player.isForfeit) return;

    // Bet increase proposals can ONLY be made between parties (PARTIE_OVER or LOBBY)
    if (room.gameState && room.gameState.phase === 'PLAYING') {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'ACTIVE_GAME_IN_PROGRESS',
        error: 'Les demandes de hausse de mise se font uniquement entre deux parties.',
      });
      return;
    }

    if (room.betIncreaseProposal) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'GENERIC',
        error: 'Une proposition de hausse de mise est déjà en cours de vote.',
      });
      return;
    }

    const rawProposed = Math.round(Number(msg.proposedBet) || 0);
    const currentBet = room.baseBet || 10;
    if (rawProposed <= currentBet) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'GENERIC',
        error: `La nouvelle mise doit être supérieure à la mise actuelle (${currentBet} 🪙).`,
      });
      return;
    }

    // Solvability / Equity Check: proposed bet cannot exceed minimum capital of any active player
    const activePlayers = (room.players || []).filter((p) => !p.isEliminated && !p.isForfeit && !p.isSpectator);
    if (activePlayers.length < 2) return;

    const minCapital = Math.min(...activePlayers.map((p) => p.capital));
    if (rawProposed > minCapital || minCapital <= currentBet) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'GENERIC',
        error: `Impossible d'augmenter la mise à ${rawProposed} 🪙 : un joueur le moins fortuné n'a que ${minCapital} jetons.`,
      });
      return;
    }

    const proposedBet = rawProposed;
    const activeHumans = activePlayers.filter((p) => p.isHuman && p.connected);
    const activeBots = activePlayers.filter((p) => !p.isHuman);

    // Save previous ready states before proposal
    const previousReadyStates: Record<string, boolean> = {};
    (room.players || []).forEach((p) => {
      previousReadyStates[p.id] = !!p.readyForNextPartie;
    });

    // Pause auto-advance timer while voting is active
    const state = this.roomStates.get(client.roomCode);
    if (state && state.nextPartieTimer) {
      clearTimeout(state.nextPartieTimer);
      state.nextPartieTimer = null;
    }

    // If solo human player with NO active bots, accept immediately
    if (activeHumans.length <= 1 && activeBots.length === 0) {
      room.baseBet = proposedBet;
      if (room.gameState) {
        room.gameState.baseBet = proposedBet;
      }
      room.betIncreaseProposal = null;

      const emote: EmoteMessage = {
        id: 'em_' + Math.random().toString(36).substring(2, 9),
        playerId: 'system',
        playerName: 'Table',
        text: `⚡ Mise augmentée à ${proposedBet} 🪙 dès la prochaine partie !`,
        emoji: '🔥',
        timestamp: Date.now(),
        isBot: true,
      };
      room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
      room.updatedAt = Date.now();
      this.broadcastRoomState(client.roomCode);
      if (client.roomCode) this.evaluateAutoStart(client.roomCode);
      return;
    }

    const proposalId = 'prop_' + Math.random().toString(36).substring(2, 9);
    room.betIncreaseProposal = {
      id: proposalId,
      proposedBet,
      proposerId: client.playerId,
      proposerName: player.name,
      agreedPlayerIds: [client.playerId],
      createdAt: Date.now(),
      expiresAt: Date.now() + 15000, // 15s voting window
      previousReadyStates,
    };

    room.updatedAt = Date.now();
    this.broadcastRoomState(client.roomCode);
    if (client.roomCode) this.evaluateAutoStart(client.roomCode);

    // Trigger asynchronous voting for active bots
    if (activeBots.length > 0) {
      this.triggerBotBetIncreaseVotes(client.roomCode, proposalId);
    }
  }

  private static triggerBotBetIncreaseVotes(roomCode: string, proposalId: string): void {
    const room = this.rooms.get(roomCode);
    if (!room || !room.betIncreaseProposal || room.betIncreaseProposal.id !== proposalId) return;

    const activeBots = (room.players || []).filter(
      (p) => !p.isHuman && !p.isEliminated && !p.isForfeit && !p.isSpectator
    );
    if (activeBots.length === 0) return;

    this.clearBotBetIncreaseTimers(roomCode);

    const timers: NodeJS.Timeout[] = [];
    const proposedBet = room.betIncreaseProposal.proposedBet;

    activeBots.forEach((botPlayer) => {
      const delay = 800 + Math.random() * 1200; // 800 to 2000 ms
      const timer = setTimeout(() => {
        const currentRoom = this.rooms.get(roomCode);
        if (
          !currentRoom ||
          !currentRoom.betIncreaseProposal ||
          currentRoom.betIncreaseProposal.id !== proposalId
        ) {
          return;
        }

        const bot = (currentRoom.players || []).find(
          (p) => p.id === botPlayer.id && !p.isHuman && !p.isEliminated && !p.isForfeit
        );
        if (!bot) return;

        const diff = currentRoom.gameState?.aiDifficulty || 'NORMAL';
        const agree = shouldBotAcceptBetIncrease(proposedBet, bot.capital, bot.aiStrategy, diff);

        const chosenEmoteText = agree
          ? BOT_BET_INCREASE_AGREE_EMOTES[Math.floor(Math.random() * BOT_BET_INCREASE_AGREE_EMOTES.length)]
          : BOT_BET_INCREASE_DECLINE_EMOTES[Math.floor(Math.random() * BOT_BET_INCREASE_DECLINE_EMOTES.length)];

        const botEmote: EmoteMessage = {
          id: 'em_' + Math.random().toString(36).substring(2, 9),
          playerId: bot.id,
          playerName: bot.name,
          text: chosenEmoteText,
          emoji: agree ? '👍' : '👎',
          timestamp: Date.now(),
          isBot: true,
        };
        currentRoom.activeEmotes = [...(currentRoom.activeEmotes || []), botEmote].slice(-5);

        if (!agree) {
          // Bot refused the proposal
          this.clearBotBetIncreaseTimers(roomCode);
          currentRoom.roundEndAutoAdvanceAt = null;
          if (currentRoom.betIncreaseProposal.previousReadyStates) {
            const prev = currentRoom.betIncreaseProposal.previousReadyStates;
            (currentRoom.players || []).forEach((p) => {
              p.readyForNextPartie = prev[p.id] ?? p.readyForNextPartie;
            });
          }
          currentRoom.betIncreaseProposal = null;

          const systemEmote: EmoteMessage = {
            id: 'em_' + Math.random().toString(36).substring(2, 9),
            playerId: bot.id,
            playerName: bot.name,
            text: `${bot.name} a refusé la hausse. La mise reste à ${currentRoom.baseBet} 🪙. Attente des joueurs...`,
            emoji: '✋',
            timestamp: Date.now(),
            isBot: true,
          };
          currentRoom.activeEmotes = [...(currentRoom.activeEmotes || []), systemEmote].slice(-5);
          currentRoom.updatedAt = Date.now();
          this.broadcastRoomState(roomCode);
          if (roomCode) this.evaluateAutoStart(roomCode);
          return;
        }

        // Bot agreed
        if (!currentRoom.betIncreaseProposal.agreedPlayerIds.includes(bot.id)) {
          currentRoom.betIncreaseProposal.agreedPlayerIds.push(bot.id);
        }

        const activePlayers = (currentRoom.players || []).filter(
          (p) => !p.isEliminated && !p.isForfeit && !p.isSpectator
        );
        const allAgreed = activePlayers.every((p) =>
          currentRoom.betIncreaseProposal!.agreedPlayerIds.includes(p.id)
        );

        if (allAgreed) {
          this.clearBotBetIncreaseTimers(roomCode);
          const newBet = currentRoom.betIncreaseProposal.proposedBet;
          currentRoom.baseBet = newBet;
          if (currentRoom.gameState) {
            currentRoom.gameState.baseBet = newBet;
          }
          currentRoom.betIncreaseProposal = null;

          (currentRoom.players || []).forEach((p) => {
            if (!p.isEliminated && !p.isSpectator) {
              p.readyForNextPartie = true;
            }
          });

          const successEmote: EmoteMessage = {
            id: 'em_' + Math.random().toString(36).substring(2, 9),
            playerId: 'system',
            playerName: 'Table',
            text: `⚡ Accord unanime ! La mise passe à ${newBet} 🪙 dès la prochaine partie !`,
            emoji: '🔥',
            timestamp: Date.now(),
            isBot: true,
          };
          currentRoom.activeEmotes = [...(currentRoom.activeEmotes || []), successEmote].slice(-5);
          currentRoom.updatedAt = Date.now();
          this.broadcastRoomState(roomCode);
          if (roomCode) this.evaluateAutoStart(roomCode);

          // Advance to next partie if all ready
          const activeHumans = activePlayers.filter((p) => p.isHuman && p.connected);
          const allHumansReady = activeHumans.every((p) => p.readyForNextPartie);
          if (allHumansReady && (currentRoom.status === 'PARTIE_OVER' || currentRoom.gameState?.phase === 'PARTIE_OVER')) {
            const state = this.getOrCreateActiveState(roomCode, currentRoom);
            ServerGameEngine.advanceToNextPartie(
              currentRoom,
              (updatedRoom) => {
                this.broadcastRoomState(updatedRoom.id);
                this.evaluateAutoStart(updatedRoom.id);
              },
              state
            );
          }
          return;
        }

        currentRoom.updatedAt = Date.now();
        this.broadcastRoomState(roomCode);
        if (roomCode) this.evaluateAutoStart(roomCode);
      }, delay);

      timers.push(timer);
    });

    this.botBetIncreaseTimers.set(roomCode, timers);
  }

  private static handleRespondBetIncrease(client: ConnectedClient, msg: ClientMessage): void {
    if (!client.roomCode || !this.rooms.has(client.roomCode)) return;
    this.tickRoom(client.roomCode);
    const room = this.rooms.get(client.roomCode);
    if (!room) return;
    if (!room.betIncreaseProposal) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'VOTE_CLOSED',
        error: 'Ce vote est déjà clos ou expiré.',
      });
      return;
    }

    const player = (room.players || []).find((p) => p.id === client.playerId);
    if (!player || !player.isHuman || player.isEliminated || player.isForfeit || player.isSpectator) return;

    if (msg.agree) {
      if (!room.betIncreaseProposal.agreedPlayerIds.includes(client.playerId)) {
        room.betIncreaseProposal.agreedPlayerIds.push(client.playerId);
      }

      // Requires 100% agreement among all active players (humans + bots)
      const activePlayers = (room.players || []).filter((p) => !p.isEliminated && !p.isForfeit && !p.isSpectator);
      const allAgreed = activePlayers.every((p) => room.betIncreaseProposal!.agreedPlayerIds.includes(p.id));

      if (allAgreed) {
        this.clearBotBetIncreaseTimers(client.roomCode);
        const newBet = room.betIncreaseProposal.proposedBet;
        room.baseBet = newBet;
        if (room.gameState) {
          room.gameState.baseBet = newBet;
        }
        room.betIncreaseProposal = null;

        // Restore / confirm ready status for next partie
        (room.players || []).forEach((p) => {
          if (!p.isEliminated && !p.isSpectator) {
            p.readyForNextPartie = true;
          }
        });

        const emote: EmoteMessage = {
          id: 'em_' + Math.random().toString(36).substring(2, 9),
          playerId: 'system',
          playerName: 'Table',
          text: `⚡ Accord unanime ! La mise passe à ${newBet} 🪙 dès la prochaine partie !`,
          emoji: '🔥',
          timestamp: Date.now(),
          isBot: true,
        };
        room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
        room.updatedAt = Date.now();
        this.broadcastRoomState(client.roomCode);
        if (client.roomCode) this.evaluateAutoStart(client.roomCode);

        // Advance to next partie if all ready
        const activeHumans = activePlayers.filter((p) => p.isHuman && p.connected);
        const allHumansReady = activeHumans.every((p) => p.readyForNextPartie);
        if (allHumansReady && (room.status === 'PARTIE_OVER' || room.gameState?.phase === 'PARTIE_OVER')) {
          const state = this.getOrCreateActiveState(client.roomCode, room);
          ServerGameEngine.advanceToNextPartie(
            room,
            (updatedRoom) => {
              this.broadcastRoomState(updatedRoom.id);
              this.evaluateAutoStart(updatedRoom.id);
            },
            state
          );
        }
        return;
      }
    } else {
      // Declined by player
      this.clearBotBetIncreaseTimers(client.roomCode);
      const declinedBy = player.name;
      room.roundEndAutoAdvanceAt = null; // Kill auto-advance
      if (room.betIncreaseProposal.previousReadyStates) {
        const prev = room.betIncreaseProposal.previousReadyStates;
        (room.players || []).forEach((p) => {
          p.readyForNextPartie = prev[p.id] ?? p.readyForNextPartie;
        });
      }
      room.betIncreaseProposal = null;

      const emote: EmoteMessage = {
        id: 'em_' + Math.random().toString(36).substring(2, 9),
        playerId: player.id,
        playerName: declinedBy,
        text: `${declinedBy} a refusé la hausse. La mise reste à ${room.baseBet} 🪙. Attente des joueurs...`,
        emoji: '✋',
        timestamp: Date.now(),
        isBot: false,
      };
      room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
    }

    room.updatedAt = Date.now();
    this.broadcastRoomState(client.roomCode);
    if (client.roomCode) this.evaluateAutoStart(client.roomCode);
  }

  private static handleCancelBetIncrease(client: ConnectedClient, msg: ClientMessage): void {
    if (!client.roomCode || !this.rooms.has(client.roomCode)) return;
    this.tickRoom(client.roomCode);
    const room = this.rooms.get(client.roomCode);
    if (!room) return;
    if (!room.betIncreaseProposal) return;

    if (room.betIncreaseProposal.proposerId === client.playerId) {
      this.clearBotBetIncreaseTimers(client.roomCode);
      room.roundEndAutoAdvanceAt = null; // Kill auto-advance
      if (room.betIncreaseProposal.previousReadyStates) {
        const prev = room.betIncreaseProposal.previousReadyStates;
        (room.players || []).forEach((p) => {
          p.readyForNextPartie = prev[p.id] ?? p.readyForNextPartie;
        });
      }
      room.betIncreaseProposal = null;
      room.updatedAt = Date.now();
      this.broadcastRoomState(client.roomCode);
      if (client.roomCode) this.evaluateAutoStart(client.roomCode);
    }
  }

  private static handleRequestIntegration(client: ConnectedClient, msg: ClientMessage): void {
    const roomCode = client.roomCode || msg.roomCode;
    if (!roomCode || !this.rooms.has(roomCode)) return;
    const room = this.rooms.get(roomCode)!;

    const humanPlayers = (room.players || []).filter((p) => p.isHuman && !p.isSpectator);
    if (humanPlayers.length >= 4) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'JOIN_REFUSED',
        error: 'La table contient déjà 4 joueurs humains.',
      });
      return;
    }

    const partiesPlayed = room.manchePartiesPlayed !== undefined
      ? room.manchePartiesPlayed
      : (room.gameState ? Math.max(0, room.gameState.partieCount - 1) : 0);
    const prorataCapital = Math.max(0, room.initialCapital - (partiesPlayed * room.baseBet));

    if (prorataCapital < room.baseBet) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'JOIN_REFUSED',
        error: `Capital restant insuffisant (${prorataCapital} 🪙 < mise de ${room.baseBet} 🪙). Vous pouvez continuer à observer.`,
      });
      return;
    }

    if (room.integrationProposal && room.integrationProposal.status === 'VOTING') {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'GENERIC',
        error: "Un vote d'intégration est déjà en cours pour cette table.",
      });
      return;
    }

    const botEntries = (room.gameState?.players || room.players)
      .map((p, index) => ({ id: p.id, name: p.name, capital: p.capital, tricksWonInRound: p.tricksWonInRound, index, isHuman: p.isHuman }))
      .filter((p) => !p.isHuman);
    const targetBot = selectBotToReplace(botEntries);

    if (!targetBot) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'GENERIC',
        error: "Aucun bot n'est disponible pour être remplacé dans cette partie.",
      });
      return;
    }

    const pIdx = (room.players || []).findIndex((p) => p.id === client.playerId);
    if (pIdx !== -1) {
      room.players[pIdx].isSpectator = true;
      room.players[pIdx].isPendingIntegration = true;
      room.players[pIdx].prorataCapital = prorataCapital;
    }

    const activeHumans = (room.players || []).filter(
      (p) => p.isHuman && !p.isSpectator && !p.isEliminated && p.connected && p.id !== client.playerId
    );

    const proposalId = 'integ_' + Math.random().toString(36).substring(2, 9);
    // Phase E: Remplacement de l'IA en temps réel / Hot-Swap (3.1)
    // If the game is ongoing, apply the swap IMMEDIATELY instead of a proposal
    if (room.status === 'PLAYING' || room.status === 'PARTIE_OVER') {
      const gs = room.gameState;
      if (gs) {
        const gsBotIndex = (gs.players || []).findIndex(p => p.id === targetBot.id);
        const roomBotIndex = (room.players || []).findIndex(p => p.id === targetBot.id);
        
        if (gsBotIndex !== -1 && roomBotIndex !== -1 && pIdx !== -1) {
          const humanSpectator = room.players[pIdx];
          const botPlayer = gs.players[gsBotIndex];
          
          // We swap the IDs in both arrays so the engine knows it's the new human
          const humanId = humanSpectator.id;
          const humanName = humanSpectator.name.replace(/\s*\(Obs\)$/, '');
          
          // Update game state player
          botPlayer.id = humanId;
          botPlayer.isHuman = true;
          botPlayer.name = humanName;
          botPlayer.avatarSeed = humanSpectator.avatarSeed;
          botPlayer.isSpectator = false;
          botPlayer.isPendingIntegration = false;
          botPlayer.connected = true;
          botPlayer.disconnectGraceExpiresAt = undefined;
          botPlayer.isAiRelay = false;
          
          // Update room player at bot's index
          const rpBot = room.players[roomBotIndex];
          rpBot.id = humanId;
          rpBot.isHuman = true;
          rpBot.name = humanName;
          rpBot.avatarSeed = humanSpectator.avatarSeed;
          rpBot.isSpectator = false;
          rpBot.isPendingIntegration = false;
          rpBot.connected = true;
          
          // Remove the spectator entry (since they took the bot's place)
          room.players.splice(pIdx, 1);
          
          // Clear any pending bot timer for the replaced seat and reschedule turn if needed
          const activeState = this.roomStates.get(roomCode);
          if (activeState) {
            if (activeState.botMoveTimer) {
              clearTimeout(activeState.botMoveTimer);
              activeState.botMoveTimer = null;
            }
            if (gs.players[gs.currentTurnIndex]?.id === humanId) {
              ServerGameEngine.scheduleTurnAction(room, (r) => this.broadcastRoomState(r.id), activeState);
            }
          }

          // Add a system emote to celebrate the hot-swap
          const emote = {
            id: 'em_' + Math.random().toString(36).substring(2, 9),
            playerId: 'system',
            playerName: 'Table',
            text: `⚡ ${humanName} a pris le relais en temps réel (remplace ${targetBot.name}) !`,
            emoji: '👋',
            timestamp: Date.now(),
            isBot: true,
          };
          room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
          room.updatedAt = Date.now();
          this.broadcastRoomState(roomCode);
          this.evaluateAutoStart(roomCode);
          return; // Hot-swap done, no need for proposal
        }
      }
    }

    if (activeHumans.length === 0) {
      room.integrationProposal = {
        id: proposalId,
        applicantId: client.playerId,
        applicantName: msg.playerName || (pIdx !== -1 ? room.players[pIdx].name : 'Nouveau joueur'),
        applicantAvatar: msg.avatarSeed || 'spectator',
        prorataCapital,
        targetBotIdToReplace: targetBot?.id || null,
        targetBotNameToReplace: targetBot?.name || null,
        agreedPlayerIds: [client.playerId],
        declinedPlayerIds: [],
        createdAt: Date.now(),
        status: 'ACCEPTED',
        expiresAt: Date.now() + 1000 * 10,
      };
    } else {
      room.integrationProposal = {
        id: proposalId,
        applicantId: client.playerId,
        applicantName: msg.playerName || (pIdx !== -1 ? room.players[pIdx].name : 'Nouveau joueur'),
        applicantAvatar: msg.avatarSeed || 'spectator',
        prorataCapital,
        targetBotIdToReplace: targetBot?.id || null,
        targetBotNameToReplace: targetBot?.name || null,
        agreedPlayerIds: [],
        declinedPlayerIds: [],
        createdAt: Date.now(),
        status: 'VOTING',
        expiresAt: Date.now() + 1000 * 10,
      };

      // 10s vote timer: auto-accept if abstained
      setTimeout(() => {
        if (this.rooms.has(roomCode)) {
          const r = this.rooms.get(roomCode)!;
          if (r.integrationProposal && r.integrationProposal.id === proposalId && r.integrationProposal.status === 'VOTING') {
            r.integrationProposal.status = 'ACCEPTED';
            const emote: EmoteMessage = {
              id: 'em_' + Math.random().toString(36).substring(2, 9),
              playerId: 'system',
              playerName: 'Table',
              text: `🤝 Intégration acceptée pour ${r.integrationProposal.applicantName} (délai de 10s écoulé).`,
              emoji: '✅',
              timestamp: Date.now(),
              isBot: true,
            };
            r.activeEmotes = [...(r.activeEmotes || []), emote].slice(-5);
            r.updatedAt = Date.now();
            this.broadcastRoomState(roomCode);
    this.evaluateAutoStart(roomCode);
          }
        }
      }, 10500);
    }

    room.updatedAt = Date.now();
    this.broadcastRoomState(roomCode);
    this.evaluateAutoStart(roomCode);
  }

  private static handleRespondIntegrationVote(client: ConnectedClient, msg: ClientMessage): void {
    if (!client.roomCode || !this.rooms.has(client.roomCode)) return;
    const room = this.rooms.get(client.roomCode)!;
    if (!room.integrationProposal || room.integrationProposal.status !== 'VOTING') {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'VOTE_CLOSED',
        error: 'Ce vote est déjà clos ou expiré.',
      });
      return;
    }

    const voter = (room.players || []).find((p) => p.id === client.playerId);
    if (!voter || !voter.isHuman || voter.isSpectator || voter.isEliminated) return;

    const proposal = room.integrationProposal;
    if (msg.agree) {
      if (!proposal.agreedPlayerIds.includes(client.playerId)) {
        proposal.agreedPlayerIds.push(client.playerId);
      }
      proposal.declinedPlayerIds = (proposal.declinedPlayerIds || []).filter((id) => id !== client.playerId);
    } else {
      if (!proposal.declinedPlayerIds.includes(client.playerId)) {
        proposal.declinedPlayerIds.push(client.playerId);
      }
      proposal.agreedPlayerIds = (proposal.agreedPlayerIds || []).filter((id) => id !== client.playerId);
    }

    const eligibleHumans = (room.players || []).filter(
      (p) => p.isHuman && !p.isSpectator && !p.isEliminated && p.connected && p.id !== proposal.applicantId
    );
    const totalEligible = eligibleHumans.length;
    const majority = Math.floor(totalEligible / 2) + 1;

    const hostAgreed = proposal.agreedPlayerIds.includes(room.hostId);
    const hostDeclined = proposal.declinedPlayerIds.includes(room.hostId);

    if (proposal.agreedPlayerIds.length >= majority || (totalEligible === 2 && hostAgreed)) {
      proposal.status = 'ACCEPTED';
      const emote: EmoteMessage = {
        id: 'em_' + Math.random().toString(36).substring(2, 9),
        playerId: 'system',
        playerName: 'Table',
        text: `🤝 Intégration acceptée pour ${proposal.applicantName} ! Il rejoindra la prochaine partie.`,
        emoji: '✅',
        timestamp: Date.now(),
        isBot: true,
      };
      room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
    } else if (proposal.declinedPlayerIds.length >= majority || (totalEligible === 2 && hostDeclined)) {
      proposal.status = 'DECLINED';
      const applicant = (room.players || []).find((p) => p.id === proposal.applicantId);
      if (applicant) {
        applicant.isPendingIntegration = false;
        applicant.isSpectator = true;
      }
      const emote: EmoteMessage = {
        id: 'em_' + Math.random().toString(36).substring(2, 9),
        playerId: 'system',
        playerName: 'Table',
        text: `🚫 Intégration refusée par la table pour ${proposal.applicantName}.`,
        emoji: '❌',
        timestamp: Date.now(),
        isBot: true,
      };
      room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
    }

    room.updatedAt = Date.now();
    this.broadcastRoomState(client.roomCode);
    if (client.roomCode) this.evaluateAutoStart(client.roomCode);
  }

  private static handleProposeCapacityExtension(client: ConnectedClient, msg: ClientMessage): void {
    if (!client.roomCode || !this.rooms.has(client.roomCode)) return;
    const room = this.rooms.get(client.roomCode)!;
    if (room.hostId !== client.playerId) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'GENERIC',
        error: 'Seul l’hôte peut proposer d’étendre la capacité.',
      });
      return;
    }

    const newMax = Math.min(4, Math.max(room.maxPlayers + 1, 4));
    const activeHumans = (room.players || []).filter((p) => p.isHuman && !p.isSpectator && !p.isEliminated && p.connected);

    if (activeHumans.length <= 1) {
      room.maxPlayers = newMax;
      room.capacityExtensionProposal = null;
      room.updatedAt = Date.now();
      this.broadcastRoomState(client.roomCode);
    if (client.roomCode) this.evaluateAutoStart(client.roomCode);
      return;
    }

    room.capacityExtensionProposal = {
      id: 'capext_' + Math.random().toString(36).substring(2, 9),
      proposerId: client.playerId,
      proposerName: room.hostName || 'L’hôte',
      newMaxPlayers: newMax,
      agreedPlayerIds: [client.playerId],
      declinedPlayerIds: [],
      createdAt: Date.now(),
      status: 'VOTING',
    };

    room.updatedAt = Date.now();
    this.broadcastRoomState(client.roomCode);
    if (client.roomCode) this.evaluateAutoStart(client.roomCode);
  }

  private static handleRespondCapacityExtension(client: ConnectedClient, msg: ClientMessage): void {
    if (!client.roomCode || !this.rooms.has(client.roomCode)) return;
    this.tickRoom(client.roomCode);
    const room = this.rooms.get(client.roomCode);
    if (!room) return;
    if (!room.capacityExtensionProposal || room.capacityExtensionProposal.status !== 'VOTING') {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'VOTE_CLOSED',
        error: 'Ce vote est déjà clos ou expiré.',
      });
      return;
    }

    const voter = (room.players || []).find((p) => p.id === client.playerId);
    if (!voter || !voter.isHuman || voter.isSpectator || voter.isEliminated) return;

    const proposal = room.capacityExtensionProposal;
    if (msg.agree) {
      if (!proposal.agreedPlayerIds.includes(client.playerId)) {
        proposal.agreedPlayerIds.push(client.playerId);
      }
      proposal.declinedPlayerIds = (proposal.declinedPlayerIds || []).filter((id) => id !== client.playerId);
    } else {
      if (!proposal.declinedPlayerIds.includes(client.playerId)) {
        proposal.declinedPlayerIds.push(client.playerId);
      }
      proposal.agreedPlayerIds = (proposal.agreedPlayerIds || []).filter((id) => id !== client.playerId);
    }

    const eligibleHumans = (room.players || []).filter(
      (p) => p.isHuman && !p.isSpectator && !p.isEliminated && p.connected
    );
    const majority = Math.floor(eligibleHumans.length / 2) + 1;

    if (proposal.agreedPlayerIds.length >= majority) {
      proposal.status = 'ACCEPTED';
      room.maxPlayers = proposal.newMaxPlayers;
      room.capacityExtensionProposal = null;
    } else if (proposal.declinedPlayerIds.length >= majority) {
      proposal.status = 'DECLINED';
      room.capacityExtensionProposal = null;
    }

    room.updatedAt = Date.now();
    this.broadcastRoomState(client.roomCode);
    if (client.roomCode) this.evaluateAutoStart(client.roomCode);
  }

  private static handleProposeEarlyClose(client: ConnectedClient, msg: ClientMessage): void {
    if (!client.roomCode || !this.rooms.has(client.roomCode)) return;
    const room = this.rooms.get(client.roomCode)!;
    if (room.status !== 'PLAYING' || !room.gameState) return;

    const player = (room.players || []).find((p) => p.id === client.playerId);
    if (!player || !player.isHuman || player.isEliminated || player.isForfeit) return;

    const activeHumans = (room.players || []).filter((p) => p.isHuman && !p.isEliminated && !p.isForfeit && p.connected);

    // If only 1 active human is left, resolve immediately
    if (activeHumans.length <= 1) {
      const state = this.getOrCreateActiveState(client.roomCode, room);
      ServerGameEngine.resolveEarlyClose(room, (updatedRoom) => this.broadcastRoomState(updatedRoom.id), state);
      return;
    }

    room.earlyCloseProposal = {
      id: 'ec_' + Math.random().toString(36).substring(2, 9),
      proposerId: client.playerId,
      proposerName: player.name,
      agreedPlayerIds: [client.playerId],
      declinedPlayerIds: [],
      createdAt: Date.now(),
    };

    const emote: EmoteMessage = {
      id: 'em_' + Math.random().toString(36).substring(2, 9),
      playerId: player.id,
      playerName: player.name,
      text: `🤝 ${player.name} propose de terminer la partie d'un commun accord !`,
      emoji: '🤝',
      timestamp: Date.now(),
      isBot: false,
    };
    room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);

    room.updatedAt = Date.now();
    this.broadcastRoomState(client.roomCode);
    if (client.roomCode) this.evaluateAutoStart(client.roomCode);
  }

  private static handleRespondEarlyClose(client: ConnectedClient, msg: ClientMessage): void {
    if (!client.roomCode || !this.rooms.has(client.roomCode)) return;
    this.tickRoom(client.roomCode);
    const room = this.rooms.get(client.roomCode);
    if (!room) return;
    if (!room.earlyCloseProposal || room.status !== 'PLAYING' || !room.gameState) return;

    const player = (room.players || []).find((p) => p.id === client.playerId);
    if (!player || !player.isHuman || player.isEliminated || player.isForfeit) return;

    if (msg.agree) {
      if (!room.earlyCloseProposal.agreedPlayerIds.includes(client.playerId)) {
        room.earlyCloseProposal.agreedPlayerIds.push(client.playerId);
      }

      const activeHumans = (room.players || []).filter((p) => p.isHuman && !p.isEliminated && !p.isForfeit && p.connected);
      const allAgreed = activeHumans.every((h) => room.earlyCloseProposal!.agreedPlayerIds.includes(h.id));

      if (allAgreed) {
        const state = this.getOrCreateActiveState(client.roomCode, room);
        ServerGameEngine.resolveEarlyClose(room, (updatedRoom) => this.broadcastRoomState(updatedRoom.id), state);
        return;
      }
    } else {
      if (!room.earlyCloseProposal.declinedPlayerIds.includes(client.playerId)) {
        room.earlyCloseProposal.declinedPlayerIds.push(client.playerId);
      }
      const declinedName = player.name;
      room.earlyCloseProposal = null;

      const emote: EmoteMessage = {
        id: 'em_' + Math.random().toString(36).substring(2, 9),
        playerId: player.id,
        playerName: declinedName,
        text: `✋ ${declinedName} a refusé la clôture anticipée. La partie continue !`,
        emoji: '✋',
        timestamp: Date.now(),
        isBot: false,
      };
      room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
    }

    room.updatedAt = Date.now();
    this.broadcastRoomState(client.roomCode);
    if (client.roomCode) this.evaluateAutoStart(client.roomCode);
  }

  private static handleClaimForfeitVictory(client: ConnectedClient, msg: ClientMessage): void {
    const targetRoomCode = client.roomCode || msg.roomCode;
    if (!targetRoomCode || !this.rooms.has(targetRoomCode)) return;
    const room = this.rooms.get(targetRoomCode)!;
    const state = this.getOrCreateActiveState(targetRoomCode, room);

    const success = ServerGameEngine.claimForfeitVictory(
      room,
      client.playerId,
      (updatedRoom) => {
        this.broadcastRoomState(updatedRoom.id);
          this.evaluateAutoStart(updatedRoom.id);
      },
      state
    );

    if (!success) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'GENERIC',
        error: 'Impossible de réclamer la victoire par forfait actuellement.',
      });
    }
  }

  public static tickRoom(roomCode: string): boolean {
    if (!roomCode || this.isTickingRooms.has(roomCode)) return false;
    const room = this.rooms.get(roomCode);
    if (!room) return false;

    this.updateHumanAbsentTimestamp(room);

    this.isTickingRooms.add(roomCode);
    try {
      const now = Date.now();
      let changed = false;

      // 0. Lobby Host Takeover check
      if (room.status === 'LOBBY') {
        if (this.evaluateLobbyHostTakeover(roomCode)) {
          changed = true;
        }
      }

      // 1. Auto-expire bet increase proposals after 15 seconds
      if (
        room.betIncreaseProposal &&
        room.betIncreaseProposal.expiresAt &&
        now >= room.betIncreaseProposal.expiresAt
      ) {
        this.clearBotBetIncreaseTimers(roomCode);
        if (room.betIncreaseProposal.previousReadyStates) {
          const prev = room.betIncreaseProposal.previousReadyStates;
          (room.players || []).forEach((p) => {
            p.readyForNextPartie = prev[p.id] ?? p.readyForNextPartie;
          });
        }
        room.betIncreaseProposal = null;

        const emote: EmoteMessage = {
          id: 'em_' + Math.random().toString(36).substring(2, 9),
          playerId: 'system',
          playerName: 'Table',
          text: `⏳ Vote expiré (15s) : la hausse de mise n'a pas été validée. La mise reste à ${room.baseBet} 🪙.`,
          emoji: '⏳',
          timestamp: Date.now(),
          isBot: true,
        };
        room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
        room.updatedAt = Date.now();
        changed = true;

        // If everyone was ready, advance to next partie
        const activeHumans = (room.players || []).filter(
          (p) => p.isHuman && !p.isEliminated && !p.isSpectator && p.connected
        );
        const allReady = activeHumans.length > 0 && activeHumans.every((p) => p.readyForNextPartie);
        if (allReady && (room.status === 'PARTIE_OVER' || room.gameState?.phase === 'PARTIE_OVER')) {
          const state = this.getOrCreateActiveState(room.id, room);
          ServerGameEngine.advanceToNextPartie(
            room,
            (updatedRoom) => {
              this.broadcastRoomState(updatedRoom.id);
              this.evaluateAutoStart(updatedRoom.id);
            },
            state
          );
        }
      }

      // 2. Cleanup permanently disconnected players from LOBBY or MANCHE_OVER if grace period expired
      if (room.status === 'LOBBY' || room.status === 'MANCHE_OVER') {
        const graceTimeoutMs = (room.disconnectGraceSeconds || this.engineConfig.reconnectGracePeriodSeconds || 30) * 1000;
        const initialCount = (room.players || []).length;
        room.players = (room.players || []).filter((p) => {
          if (!p.connected) {
            const isGraceExpired = p.disconnectGraceExpiresAt
              ? now > p.disconnectGraceExpiresAt
              : (now - (p.lastSeen || room.createdAt || now) > graceTimeoutMs);
            if (isGraceExpired) {
              console.log(`[Lobby Cleanup] Kicking permanently disconnected player ${p.name} (${p.id}) from room ${roomCode}`);
              return false;
            }
          }
          return true;
        });

        if (room.players.length !== initialCount) {
          changed = true;
          if (room.players.length === 0) {
            this.destroyRoom(roomCode, 'tickRoom empty lobby');
            return false;
          } else {
            const currentHost = (room.players || []).find((p) => p.id === room.hostId);
            if (!currentHost) {
              const activeHumans = (room.players || []).filter((p) => p.isHuman && p.connected);
              if (activeHumans.length > 0) {
                room.hostId = activeHumans[0].id;
              } else if ((room.players || []).length > 0) {
                room.hostId = room.players[0].id;
              }
            }
            (room.players || []).forEach((p) => (p.isHost = p.id === room.hostId));
            room.updatedAt = now;
          }
        }
      }

      // 3. Trigger push notification alerts for offline / inactive players
      try {
        this.triggerPushNotificationsForRoom(room);
      } catch (err) {
        console.error('[RoomManager] Failed to trigger push notifications:', err);
      }

      // 4. Filter out expired emotes (older than 3.5 seconds)
      if (room.activeEmotes && room.activeEmotes.length > 0) {
        const initialEmotesCount = room.activeEmotes.length;
        room.activeEmotes = room.activeEmotes.filter((e) => now - e.timestamp < 3500);
        if (room.activeEmotes.length !== initialEmotesCount) {
          changed = true;
        }
      }

      return changed;
    } finally {
      this.isTickingRooms.delete(roomCode);
    }
  }

  public static broadcastRoomState(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    const now = Date.now();

    // Synchronize room.players with room.gameState.players for atomic data consistency
    syncRoomPlayersWithGameState(room);

    // Optimize performance: create base clone ONCE per broadcast tick instead of N times for N players
    room.rev = (room.rev || 0) + 1;
    room.epoch = SERVER_EPOCH;
    room.serverTimestamp = now;
    const baseClonedRoom: MultiplayerRoom = JSON.parse(JSON.stringify(room));

    // Send a tailored, masked state to each player
    this.clients.forEach((client) => {
      if (client.roomCode === roomCode && client.socket.readyState === WebSocket.OPEN) {
        const maskedRoom = maskOpponentCards(baseClonedRoom, client.playerId);
        this.sendMessage(client.socket, {
          type: 'SYNC_STATE',
          room: maskedRoom,
          timestamp: Date.now(),
        });
      }
    });
  }

  /**
   * Notifications « table en danger » (niveau critique) : relais en jeu, tours manqués, coût de l'absence, forfait pour
   * la partie, manche perdue par forfait. Textes sobres et exacts, sans aucune information de jeu (pas de cartes).
   * Règle du relais : le joueur n'a AUCUN délai chronométré ; il peut reprendre la main jusqu'à la fin de la partie,
   * puis revenir au début de n'importe quelle partie suivante.
   */
  private static pushPlayerAlert(playerId: string, room: MultiplayerRoom, alert: PlayerAlert): void {
    const send = (
      type: 'DISCONNECTED' | 'FORFEIT_WARNING' | 'FORFEIT_DECLARED',
      title: string,
      body: string,
      opts?: { openTable?: boolean }
    ) => {
      pushService
        .sendNotificationToUser(playerId, {
          title,
          body,
          icon: '/icon-192.png',
          badge: '/badge-96.png',
          tag: `table-${room.id}`, // une seule notification critique par table : la plus récente remplace l'autre
          data: {
            type,
            roomCode: room.id,
            url: opts?.openTable === false ? buildGameUrl() : buildGameUrl(room.id),
          },
        })
        .catch((err) => console.warn(`[RoomManager] Critical push (${type}) failed for ${playerId}:`, err));
    };

    const player = (room.players || []).find((p) => p.id === playerId);
    const client = this.clients.get(playerId);
    const atTableInForeground = Boolean(
      client && client.socket.readyState === WebSocket.OPEN && client.roomCode === room.id && !player?.isAway
    );
    const gs = room.gameState;

    switch (alert.kind) {
      case 'RELAY_STARTED': {
        // Un joueur qui a la table sous les yeux (inactif mais connecté, app visible) voit déjà le relais à l'écran.
        if (alert.reason === 'AFK' && atTableInForeground) return;
        // Combien d'autres joueurs peuvent jouer la partie suivante ? S'il n'en reste qu'un, l'absence coûte la manche.
        const othersAbleToPlay = (gs?.players || []).filter(
          (p) => p.id !== playerId && !p.isEliminated && !p.isForfeit && !(p.isHuman && p.relayAbsent) && p.capital >= (gs?.baseBet || 0)
        ).length;
        const mancheAtStake = othersAbleToPlay <= 1;
        send(
          'DISCONNECTED',
          `⚠️ Table #${room.id} : un relais joue pour vous`,
          mancheAtStake
            ? 'Revenez avant la fin de la partie (et de son compte à rebours) : sinon la manche est perdue par forfait.'
            : 'Revenez avant la fin de la partie pour reprendre la main. Sinon la mise de la partie est perdue.'
        );
        return;
      }
      case 'TIMEOUT_WARNING': {
        if (atTableInForeground) return; // le joueur voit déjà la table et le chrono
        const last = alert.maxMissed - alert.missed <= 1;
        send(
          'FORFEIT_WARNING',
          last ? `🚨 Table #${room.id} : dernier avertissement` : `⏱ Table #${room.id} : tour manqué`,
          last
            ? `Au prochain tour manqué, un relais jouera à votre place jusqu'à la fin de la partie et la mise sera perdue.`
            : `${alert.missed} tour manqué sur ${alert.maxMissed}. Au ${alert.maxMissed}e, un relais jouera à votre place jusqu'à la fin de la partie.`
        );
        return;
      }
      case 'RELAY_COST': {
        const kora = alert.koraPenalty > 0 ? ` La pénalité de Kora (${alert.koraPenalty} 🪙) a aussi été prélevée.` : '';
        send(
          'FORFEIT_DECLARED',
          `📉 Table #${room.id} : partie perdue par absence`,
          `Votre mise de la partie est perdue.${kora} Revenez au début de la prochaine partie pour rejouer avec votre capital.`,
          { openTable: false }
        );
        return;
      }
      case 'PARTIE_FORFEIT':
        send(
          'FORFEIT_DECLARED',
          `🚪 Table #${room.id} : forfait pour la partie`,
          "Vous n'êtes pas de retour : vous passez la partie suivante. Vous pouvez revenir au début de n'importe quelle partie, avec votre capital.",
          { openTable: false }
        );
        return;
      case 'MANCHE_LOST_BY_FORFEIT':
        send(
          'FORFEIT_DECLARED',
          `🏁 Table #${room.id} : manche perdue par forfait`,
          "Il ne restait qu'un seul joueur présent : la manche est terminée en sa faveur.",
          { openTable: false }
        );
        return;
    }
  }

  private static triggerPushNotificationsForRoom(room: MultiplayerRoom): void {
    if (!room) return;

    // 1. GAME_START Alert
    if (room.status === 'PLAYING' && !this.lastGameStartAlerts.has(room.id)) {
      this.lastGameStartAlerts.add(room.id);
      console.log(`[RoomManager] Table ${room.id} started. Triggering game start push alerts.`);

      (room.players || []).forEach((p) => {
        // Send a game start push to all human players who are offline or not currently looking at the game room
        if (p.isHuman) {
          const client = this.clients.get(p.id);
          const isOnlineAndAtTable = client && client.socket.readyState === WebSocket.OPEN && client.roomCode === room.id && !p.isAway;
          
          if (!isOnlineAndAtTable) {
            pushService.sendNotificationToUser(p.id, {
              title: '⚔️ La partie commence',
              body: `Table #${room.id} : les cartes sont distribuées. Reprenez la partie.`,
              icon: '/icon-192.png',
              badge: '/badge-96.png',
              tag: `gamestart-${room.id}`,
              data: {
                type: 'GAME_START',
                roomCode: room.id,
                url: buildGameUrl(room.id),
              },
            }).catch((err) => {
              console.error(`[RoomManager] Error sending GAME_START push to ${p.id}:`, err);
            });
          }
        }
      });
    }

    // 2. YOUR_TURN Alert
    if (room.status === 'PLAYING' && room.gameState) {
      const gs = room.gameState;
      const turnIdx = gs.currentTurnIndex;
      const currentPlayer = gs.players && gs.players[turnIdx];

      if (currentPlayer && currentPlayer.isHuman) {
        const currentTrickNumber = gs.currentTrickNumber || 0;
        const tricksCount = gs.tricksHistory ? gs.tricksHistory.length : 0;
        const alertKey = `${currentPlayer.id}_${currentTrickNumber}_${tricksCount}`;

        // Check if we already sent an alert for this exact turn/trick to avoid spamming
        const lastAlert = this.lastTurnAlerts.get(room.id);
        if (lastAlert !== alertKey) {
          this.lastTurnAlerts.set(room.id, alertKey);

          // Check if player is offline or has active WebSocket but roomCode is different (meaning they are in home screen/lobby, not looking at the table!)
          const client = this.clients.get(currentPlayer.id);
          const isAtTable = client && client.socket.readyState === WebSocket.OPEN && client.roomCode === room.id && !(room.players || []).find((rp) => rp.id === currentPlayer.id)?.isAway;

          // Joueur déconnecté : le relais joue à sa place et l'alerte « un relais joue pour vous » le prévient déjà.
          const roomPlayer = (room.players || []).find((rp) => rp.id === currentPlayer.id);
          const coveredByDisconnectAlert = roomPlayer?.connected === false || Boolean(roomPlayer?.isAiRelay);

          if (!isAtTable && !coveredByDisconnectAlert) {
            console.log(`[RoomManager] Active player ${currentPlayer.name} (${currentPlayer.id}) is not at table. Dispatching "YOUR_TURN" push alert.`);
            pushService.sendNotificationToUser(currentPlayer.id, {
              title: '⏳ À vous de jouer',
              body: `Table #${room.id} : posez votre carte, le tour est chronométré.`,
              icon: '/icon-192.png',
              badge: '/badge-96.png',
              tag: `turn-${room.id}`,
              data: {
                type: 'YOUR_TURN',
                roomCode: room.id,
                url: buildGameUrl(room.id),
              },
            }).catch((err) => {
              console.error(`[RoomManager] Error sending YOUR_TURN push to ${currentPlayer.id}:`, err);
            });
          }
        }
      }
    }
  }

  private static sendMessage(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  public static getActiveRoomsCount(): number {
    return this.rooms.size;
  }

  public static getLiveTelemetry(): {
    connectedSockets: number;
    activeRooms: number;
    lobbyRooms: number;
    inGameRooms: number;
    twoPlayersRooms: number;
    threePlayersRooms: number;
    fourPlayersRooms: number;
    roomsList: Array<{
      id: string;
      hostName: string;
      status: string;
      playerCount: number;
      maxPlayers: number;
      baseBet?: number;
      initialCapital?: number;
      pot?: number;
      turnTimerSeconds: number;
      turnRemainingSeconds?: number;
      dealerIndex?: number;
      leadIndex?: number;
      instantWinReveal?: any;
      currentRound?: number;
      currentTrickNumber?: number;
      activePlayerIndex?: number | null;
      activePlayerName?: string | null;
      leadSuit?: string | null;
      tableCards?: any[];
      tricksHistory?: any[];
      createdAt: number;
      isPublic: boolean;
      betIncreaseProposal?: any;
      capacityExtensionProposal?: any;
      integrationProposal?: any;
      showKoraHunterAlert?: boolean;
      hunterPlayerName?: string | null;
      players: Array<{
        id: string;
        name: string;
        isHost: boolean;
        isHuman: boolean;
        connected: boolean;
        score: number;
        capital?: number;
        cardsLeft?: number;
        hand?: any[];
        tricksWonInRound?: number;
        isEliminated?: boolean;
        isFoldedInRound?: boolean;
        aiStrategy?: string;
      }>;
    }>;
    liveBetProposalsActive: number;
    liveCapacityVotesActive: number;
    liveKoraHunterAlertsActive: number;
  } {
    let connectedSockets = 0;
    this.clients.forEach((c) => {
      if (c.socket.readyState === WebSocket.OPEN) {
        connectedSockets++;
      }
    });

    let lobbyRooms = 0;
    let inGameRooms = 0;
    let twoPlayersRooms = 0;
    let threePlayersRooms = 0;
    let fourPlayersRooms = 0;
    let liveBetProposalsActive = 0;
    let liveCapacityVotesActive = 0;
    let liveKoraHunterAlertsActive = 0;

    const roomsList = Array.from(this.rooms.values()).map((room) => {
      if (room.status === 'LOBBY') lobbyRooms++;
      if (room.status === 'PLAYING') inGameRooms++;
      if (room.maxPlayers === 2) twoPlayersRooms++;
      else if (room.maxPlayers === 3) threePlayersRooms++;
      else if (room.maxPlayers === 4) fourPlayersRooms++;

      const gs = room.gameState;
      const currentTrick = gs ? gs.currentTrick : null;

      if (room.betIncreaseProposal) {
        liveBetProposalsActive++;
      }
      if (room.capacityExtensionProposal && room.capacityExtensionProposal.status === 'VOTING') {
        liveCapacityVotesActive++;
      }
      if (gs?.showKoraHunterAlert) {
        liveKoraHunterAlertsActive++;
      }

      const hunterPlayer = gs?.showKoraHunterAlert
        ? (gs.players || []).find((p) => p.tricksWonInRound >= 3 && !p.isEliminated && !p.isFoldedInRound)
        : null;

      return {
        id: room.id,
        hostName: room.hostName,
        status: room.status,
        playerCount: (room.players || []).length,
        maxPlayers: room.maxPlayers,
        baseBet: room.baseBet,
        initialCapital: room.initialCapital,
        pot: gs?.pot || 0,
        turnTimerSeconds: room.turnTimerSeconds || 15,
        turnRemainingSeconds: gs?.turnStartedAt
          ? Math.max(0, (room.turnTimerSeconds || 15) - Math.floor((Date.now() - gs.turnStartedAt) / 1000))
          : (room.turnTimerSeconds || 15),
        dealerIndex: gs?.dealerIndex ?? 0,
        leadIndex: gs?.leadIndex ?? 0,
        instantWinReveal: gs?.instantWinReveal || null,
        currentRound: gs?.partieCount || 1,
        currentTrickNumber: currentTrick?.trickNumber || (gs?.tricksHistory?.length ? gs.tricksHistory.length + 1 : 1),
        activePlayerIndex: gs?.currentTurnIndex ?? null,
        activePlayerName: gs && gs.players[gs.currentTurnIndex] ? gs.players[gs.currentTurnIndex].name : null,
        leadSuit: currentTrick?.leadSuit || null,
        tableCards: currentTrick?.plays?.map((play) => ({
          card: play.card,
          playerName: play.playerName,
          playerIndex: play.playerIndex,
          isWinningSoFar: play.isWinningSoFar,
          isLeadCard: play.isLeadCard,
        })) || [],
        tricksHistory: gs?.tricksHistory?.map((th) => ({
          trickNumber: th.trickNumber,
          winnerName: th.winnerName || 'Joueur',
          winnerIndex: th.winnerIndex,
          winningCard: th.winningCard || undefined,
          plays: th.plays || [],
        })) || [],
        createdAt: room.createdAt,
        isPublic: room.isPublic !== false,
        betIncreaseProposal: room.betIncreaseProposal ? {
          proposedBy: room.betIncreaseProposal.proposerId,
          proposedByName: room.betIncreaseProposal.proposerName,
          multiplier: room.baseBet > 0 ? (room.betIncreaseProposal.proposedBet / room.baseBet) : 1,
          proposedBet: room.betIncreaseProposal.proposedBet,
          status: 'PENDING',
        } : null,
        capacityExtensionProposal: room.capacityExtensionProposal ? {
          proposedBy: room.capacityExtensionProposal.proposerId,
          targetMaxPlayers: room.capacityExtensionProposal.newMaxPlayers,
          status: room.capacityExtensionProposal.status,
        } : null,
        integrationProposal: room.integrationProposal || null,
        showKoraHunterAlert: !!gs?.showKoraHunterAlert,
        hunterPlayerName: hunterPlayer?.name || null,
        players: (room.players || []).map((p, pIdx) => {
          const gsPlayer = gs?.players?.find((gsp) => gsp.id === p.id) || gs?.players?.[pIdx];
          return {
            id: p.id,
            name: p.name,
            isHost: p.isHost,
            isHuman: p.isHuman,
            connected: p.connected,
            score: p.score,
            capital: gsPlayer?.capital ?? room.initialCapital,
            cardsLeft: p.hand ? p.hand.length : 0,
            hand: p.hand || [],
            tricksWonInRound: gsPlayer?.tricksWonInRound ?? p.tricksWonInRound ?? 0,
            isEliminated: gsPlayer?.isEliminated ?? false,
            isFoldedInRound: gsPlayer?.isFoldedInRound ?? false,
            aiStrategy: (p as any).aiStrategy || (p as any).basePersonality,
          };
        }),
      };
    });

    return {
      connectedSockets,
      activeRooms: this.rooms.size,
      lobbyRooms,
      inGameRooms,
      twoPlayersRooms,
      threePlayersRooms,
      fourPlayersRooms,
      liveBetProposalsActive,
      liveCapacityVotesActive,
      liveKoraHunterAlertsActive,
      roomsList,
    };
  }

  /**
   * Katika Master Admin: Force kick a player from a room
   */
  public static adminKickPlayer(roomCode: string, playerId: string): boolean {
    const room = this.rooms.get(roomCode);
    if (!room) return false;

    const playerIndex = (room.players || []).findIndex((p) => p.id === playerId);
    if (playerIndex === -1) return false;

    const player = room.players[playerIndex];

    // Disconnect their client if active
    const client = this.clients.get(playerId);
    if (client && client.socket.readyState === WebSocket.OPEN) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'BANNED',
        error: 'Vous avez été expulsé de la table par le Katika Master.',
      });
      client.socket.close();
    }

    // Remove player or replace with bot if game is running
    room.players.splice(playerIndex, 1);

    // If no players remain, clean up room
    if ((room.players || []).length === 0) {
      this.destroyRoom(roomCode, 'adminKickPlayer empty room');
      return true;
    }

    // If host was kicked, assign next human or first player as host
    if (room.hostId === playerId) {
      const nextHost = (room.players || []).find((p) => p.isHuman) || room.players[0];
      if (nextHost) {
        room.hostId = nextHost.id;
        room.hostName = nextHost.name;
        nextHost.isHost = true;
      }
    }

    this.broadcastRoomState(roomCode);
    this.evaluateAutoStart(roomCode);
    return true;
  }

  /**
   * Katika Master Admin: Force close a room
   */
  public static adminCloseRoom(roomCode: string): boolean {
    const room = this.rooms.get(roomCode);
    if (!room) return false;

    // Notify all connected players
    (room.players || []).forEach((p) => {
      const client = this.clients.get(p.id);
      if (client && client.socket.readyState === WebSocket.OPEN) {
        this.sendMessage(client.socket, {
          type: 'ERROR',
          errorCode: 'ROOM_NOT_FOUND',
          error: 'Cette table a été fermée administrativement par le Katika Master.',
        });
      }
    });

    this.destroyRoom(roomCode, 'adminCloseRoom');
    return true;
  }

  /**
   * Katika Master Admin: Reset active round
   */
  public static adminResetRound(roomCode: string): boolean {
    const room = this.rooms.get(roomCode);
    if (!room) return false;

    this.roomStates.delete(roomCode);
    room.status = 'LOBBY';
    room.gameState = null;
    const maxCapacity = Math.min(4, Math.max(2, room.maxPlayers || 4));
    (room.players || []).forEach((p, idx) => {
      p.hand = [];
      p.tricksWonInRound = 0;
      p.isReady = true;
      p.isSpectator = idx >= maxCapacity;
      p.isEliminated = false;
      p.isForfeit = false;
      p.forfeitedForManche = false;
      p.leftRoom = false;
      p.score = room.initialCapital;
      p.capital = room.initialCapital;
      p.readyForNextPartie = false;
      if (idx < maxCapacity && p.name.endsWith(' (Obs)')) {
        p.name = p.name.replace(/\s*\(Obs\)$/, '');
      }
    });

    this.broadcastRoomState(roomCode);
    this.evaluateAutoStart(roomCode);
    return true;
  }

  /**
   * Katika Master Admin: Send admin message to a room or specific player
   */
  public static adminSendMessage(roomCode: string, playerId: string | undefined, message: string): boolean {
    const room = this.rooms.get(roomCode);
    if (!room) return false;

    if (playerId) {
      // Send private message to target player
      const targetPlayer = (room.players || []).find((p) => p.id === playerId);
      if (!targetPlayer) return false;

      const client = this.clients.get(playerId);
      if (client && client.socket.readyState === WebSocket.OPEN) {
        this.sendMessage(client.socket, {
          type: 'ADMIN_MESSAGE',
          adminMessage: {
            senderName: 'Katika',
            text: message,
            isPrivate: true,
          },
        });
      }
    } else {
      // Broadcast message to all room players
      (room.players || []).forEach((p) => {
        const client = this.clients.get(p.id);
        if (client && client.socket.readyState === WebSocket.OPEN) {
          this.sendMessage(client.socket, {
            type: 'ADMIN_MESSAGE',
            adminMessage: {
              senderName: 'Katika',
              text: message,
              isPrivate: false,
            },
          });
        }
      });
    }

    this.addAuditLog({
      id: `log-${Date.now()}`,
      timestamp: Date.now(),
      type: 'KATIKA_ACTION',
      severity: 'INFO',
      actor: 'Katika Master',
      summary: `Message administratif envoyé sur la table ${roomCode}${playerId ? ` au joueur (${playerId})` : ''} : "${message}"`,
      details: { roomCode, playerId, message },
    });

    return true;
  }

  // ==========================================
  // SOCIAL, PRESENCE & PUBLIC ROOM DISCOVERY
  // ==========================================

  public static handleGetPublicRooms(client: ConnectedClient): void {
    const publicRooms = this.getPublicRoomsList();
    this.sendMessage(client.socket, {
      type: 'PUBLIC_ROOMS_UPDATE',
      publicRooms,
      timestamp: Date.now(),
    });
  }

  public static getPublicRoomsList(): PublicRoomSummary[] {
    const list: PublicRoomSummary[] = [];
    const now = Date.now();

    this.rooms.forEach((room) => {
      // Reject corrupted/headless rooms
      if (!room || !room.id || room.id === 'TEST_CLI' || !room.players || room.players.length === 0) {
        return;
      }

      // Only return public rooms in LOBBY or PLAYING (within reasonable limits)
      if (room.isPublic !== false) {
        const humanPlayers = (room.players || []).filter((p) => p.isHuman && !p.isSpectator);
        const connectedHumans = humanPlayers.filter((p) => {
          const client = this.clients.get(p.id);
          return Boolean(p.connected && client && client.socket.readyState === WebSocket.OPEN);
        });

        // Host presence resolution
        const hostPlayer = (room.players || []).find((p) => p.id === (room.originalHostId || room.hostId) && p.isHuman);
        const hostClient = hostPlayer ? this.clients.get(hostPlayer.id) : undefined;
        const isHostConnected = Boolean(
          hostPlayer &&
          hostPlayer.connected &&
          hostClient &&
          hostClient.socket.readyState === WebSocket.OPEN
        );

        const pubVisibilitySecs = this.engineConfig.publicAbsentHostVisibilitySeconds ?? 180;
        const hostAbsentSince = room.hostAbsentSince || (hostPlayer?.disconnectGraceExpiresAt ? (hostPlayer.disconnectGraceExpiresAt - (this.engineConfig.lobbyWaitTtlMinutes ?? 30) * 60000) : room.createdAt);
        const absentDurationSecs = Math.max(0, Math.floor((now - hostAbsentSince) / 1000));

        // Anti-ghost: Hide rooms with 0 connected humans immediately UNLESS in LOBBY within publicAbsentHostVisibilitySeconds
        if (connectedHumans.length === 0) {
          if (room.status !== 'LOBBY' || absentDurationSecs > pubVisibilitySecs) {
            return;
          }
        }

        // Host absent under grace in LOBBY (e.g. sharing link via WhatsApp)
        const isHostInLobbyGrace = Boolean(
          room.status === 'LOBBY' &&
          !isHostConnected
        );

        // Host name & ID resolution:
        let hostId = room.hostId;
        let hostName = room.hostName;
        let hostAvatarSeed = hostPlayer?.avatarSeed || (room.players || []).find((p) => p.id === room.hostId)?.avatarSeed;
        let hostAbsent: boolean | undefined = undefined;
        let hostAbsentUntil: number | undefined = undefined;

        if (isHostInLobbyGrace) {
          hostAbsent = true;
          hostAbsentUntil = hostPlayer?.disconnectGraceExpiresAt || undefined;
          if (hostPlayer) {
            hostId = hostPlayer.id;
            hostName = hostPlayer.name;
            hostAvatarSeed = hostPlayer.avatarSeed;
          }
        } else if (!isHostConnected) {
          const nextActive = connectedHumans[0];
          if (nextActive) {
            hostId = nextActive.id;
            hostName = nextActive.name;
            hostAvatarSeed = nextActive.avatarSeed;
            room.hostId = nextActive.id;
            room.hostName = nextActive.name;
            nextActive.isHost = true;
          } else {
            hostName = 'Table Katika (Bots en relais)';
          }
        }

        const activeHumanPlayers = (room.players || []).filter((p) => {
          if (!p.isHuman || p.isSpectator) return false;
          const client = this.clients.get(p.id);
          const isConnected = Boolean(p.connected && client && client.socket.readyState === WebSocket.OPEN);
          const hasGrace = Boolean(p.disconnectGraceExpiresAt && Date.now() < p.disconnectGraceExpiresAt);
          // Règle du relais : en cours de manche, le siège d'un absent reste réservé.
          const keepsSeat = room.status === 'PLAYING' || room.status === 'PARTIE_OVER';
          return isConnected || hasGrace || keepsSeat;
        });
        const botPlayers = (room.players || []).filter((p) => !p.isHuman);
        const spectators = (room.players || []).filter((p) => p.isHuman && p.isSpectator);
        const totalSeated = activeHumanPlayers.length + botPlayers.length;
        const clampedPlayersCount = Math.min(room.maxPlayers, totalSeated);

        const partiesPlayed = room.manchePartiesPlayed !== undefined
          ? room.manchePartiesPlayed
          : (room.gameState ? Math.max(0, (room.gameState.partieCount || 1) - 1) : 0);
        const prorataCapitalEstimate = Math.max(0, (room.initialCapital || 100) - (partiesPlayed * (room.baseBet || 10)));

        list.push({
          id: room.id,
          hostId,
          hostName,
          hostAvatarSeed,
          isPublic: room.isPublic ?? true,
          status: room.status,
          playersCount: clampedPlayersCount,
          humanPlayersCount: activeHumanPlayers.length,
          botPlayersCount: botPlayers.length,
          spectatorsCount: spectators.length,
          hasReplaceableBot: botPlayers.length > 0 && prorataCapitalEstimate >= (room.baseBet || 10),
          currentPartie: room.gameState?.partieCount || 1,
          prorataCapitalEstimate,
          maxPlayers: room.maxPlayers,
          fillWithBots: room.fillWithBots,
          baseBet: room.baseBet,
          initialCapital: room.initialCapital,
          turnTimerSeconds: room.turnTimerSeconds,
          enableDoubleKora: room.enableDoubleKora,
          enableUnder21: room.enableUnder21,
          createdAt: room.createdAt,
          lastSeenAt: room.lastSeenAt || room.updatedAt || now,
          hostAbsent: hostAbsent || (!isHostConnected ? true : undefined),
          hostAbsentUntil,
          hostAbsentSince: (!isHostConnected ? hostAbsentSince : undefined),
        });
      }
    });

    return list.sort((a, b) => {
      const aActive = !a.hostAbsent && a.humanPlayersCount > 0;
      const bActive = !b.hostAbsent && b.humanPlayersCount > 0;
      if (aActive !== bActive) {
        return aActive ? -1 : 1;
      }
      return b.createdAt - a.createdAt;
    });
  }

  public static handleHeartbeatPresence(client: ConnectedClient, msg: ClientMessage): void {
    const now = Date.now();
    client.lastPing = now;

    // Update room lastSeenAt if in a room
    if (client.roomCode && this.rooms.has(client.roomCode)) {
      const room = this.rooms.get(client.roomCode)!;
      room.lastSeenAt = now;
      const player = (room.players || []).find((p) => p.id === client.playerId);
      if (player) {
        player.lastSeen = now;
        player.connected = true;
        if ((msg as any).isAway !== undefined) {
          player.isAway = (msg as any).isAway;
        }
      }
    }

    // Determine current room summary if active
    let currentRoomSummary = null;
    if (client.roomCode && this.rooms.has(client.roomCode)) {
      const room = this.rooms.get(client.roomCode)!;
      const humanPlayers = (room.players || []).filter((p) => p.isHuman && !p.isSpectator);
      const botPlayers = (room.players || []).filter((p) => !p.isHuman);
      const opponentNames = room.players
        .filter((p) => p.id !== client.playerId && !p.isSpectator)
        .map((p) => p.name);

      currentRoomSummary = {
        maxPlayers: room.maxPlayers,
        humanPlayersCount: humanPlayers.length,
        botPlayersCount: botPlayers.length,
        hasReplaceableBot: botPlayers.length > 0,
        baseBet: room.baseBet,
        status: room.status,
        opponentNames,
      };
    }

    // Update user presence
    const status = msg.statusPresence || (client.roomCode ? (this.rooms.get(client.roomCode)?.status === 'PLAYING' ? 'IN_GAME' : 'IN_LOBBY') : 'ONLINE_IDLE');
    const presence: UserPresence = {
      userId: client.playerId,
      displayName: msg.playerName || 'Joueur',
      avatarId: msg.avatarSeed || 'default',
      status,
      currentRoomCode: client.roomCode,
      currentRoomSummary,
      lastSeenAt: now,
    };
    this.userPresences.set(client.playerId, presence);

    this.sendMessage(client.socket, {
      type: 'PONG',
      timestamp: now,
    });
  }

  public static async handleGetFriendsPresence(client: ConnectedClient, msg: ClientMessage): Promise<void> {
    const friendUserIds = msg.friendUserIds || [];
    const now = Date.now();
    const presences: UserPresence[] = [];

    if (!client.playerId || friendUserIds.length === 0) {
      this.sendMessage(client.socket, {
        type: 'FRIENDS_PRESENCE_UPDATE',
        presences: [],
        timestamp: now,
      });
      return;
    }

    // Vérification en base Firestore : ne retenir que les vrais amis confirmés (status === 'ACCEPTED')
    const confirmedFriendIds = new Set<string>();
    try {
      const friendsRef = collection(db, 'users', client.playerId, 'friends');
      const q = query(friendsRef, where('status', '==', 'ACCEPTED'));
      const snapshot = await getDocs(q);
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const fId = data?.friendUid || docSnap.id;
        if (fId) confirmedFriendIds.add(fId);
      });
    } catch (err) {
      console.error('[RoomManager] Erreur lors de la récupération des amis pour la présence:', err);
    }

    for (const friendId of friendUserIds) {
      if (!friendId) continue;
      // Filtrer silencieusement les UIDs qui ne sont pas de vrais amis confirmés
      if (!confirmedFriendIds.has(friendId)) continue;

      let presence = this.userPresences.get(friendId);
      const friendClient = this.clients.get(friendId);
      const isSocketOpen = friendClient && friendClient.socket.readyState === WebSocket.OPEN;

      if (presence && (now - presence.lastSeenAt < 25000 || isSocketOpen)) {
        if (presence.currentRoomCode && this.rooms.has(presence.currentRoomCode)) {
          const room = this.rooms.get(presence.currentRoomCode)!;
          const humanPlayers = (room.players || []).filter((p) => p.isHuman && !p.isSpectator);
          const botPlayers = (room.players || []).filter((p) => !p.isHuman);
          const opponentNames = room.players
            .filter((p) => p.id !== friendId && !p.isSpectator)
            .map((p) => p.name);
          presence = {
            ...presence,
            status: room.status === 'PLAYING' ? 'IN_GAME' : 'IN_LOBBY',
            currentRoomSummary: {
              maxPlayers: room.maxPlayers,
              humanPlayersCount: humanPlayers.length,
              botPlayersCount: botPlayers.length,
              hasReplaceableBot: botPlayers.length > 0,
              baseBet: room.baseBet,
              status: room.status,
              opponentNames,
            },
          };
        }
        presences.push(presence);
      } else {
        presences.push({
          userId: friendId,
          displayName: 'Ami',
          avatarId: 'default',
          status: 'OFFLINE',
          lastSeenAt: presence ? presence.lastSeenAt : 0,
        });
      }
    }

    this.sendMessage(client.socket, {
      type: 'FRIENDS_PRESENCE_UPDATE',
      presences,
      timestamp: now,
    });
  }

  public static async handleSendDirectInvite(client: ConnectedClient, msg: ClientMessage): Promise<void> {
    if (msg.isGuest) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'JOIN_REFUSED',
        error: "Connexion Google requise : L'envoi d'invitations privées nécessite un compte Google authentifié.",
      });
      return;
    }

    if (!msg.targetPlayerId || !msg.roomCode) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'GENERIC',
        error: 'Paramètres d\'invitation incomplets.',
      });
      return;
    }

    // 1. Protection Auto-invitation (SELF_INVITE)
    if (msg.targetPlayerId === client.playerId) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'SELF_INVITE',
        error: 'Vous ne pouvez pas vous inviter vous-même.',
      });
      return;
    }

    // 2. Protection Sanction Fair-Play sur l'expéditeur (BANNED)
    const serverSanction = this.getActivePlayerSanction(client.playerId);
    const effectiveSanction = serverSanction ? {
      type: serverSanction.sanctionType || (serverSanction.status === 'BANNED' ? 'TEMP_BAN' : undefined),
      reason: serverSanction.bannedReason || 'Sanction Fair-Play active',
      expiresAt: serverSanction.banExpiresAt,
      active: true,
    } : (msg.fairPlaySanction && msg.fairPlaySanction.active ? msg.fairPlaySanction : null);

    if (effectiveSanction && effectiveSanction.active) {
      if (effectiveSanction.type === 'TEMP_BAN' || effectiveSanction.type === 'PERM_BAN') {
        const isStillActive = !effectiveSanction.expiresAt || Date.now() < effectiveSanction.expiresAt;
        if (isStillActive) {
          const remainingMinutes = effectiveSanction.expiresAt ? Math.ceil((effectiveSanction.expiresAt - Date.now()) / 60000) : 0;
          this.sendMessage(client.socket, {
            type: 'ERROR',
            errorCode: 'BANNED',
            error: `🚫 Accès refusé par le Fair-Play (${effectiveSanction.type}) : ${effectiveSanction.reason}${
              remainingMinutes > 0 ? ` (expire dans ${remainingMinutes} min)` : ''
            }`,
          });
          return;
        }
      }
    }

    const room = this.rooms.get(msg.roomCode);
    if (!room) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'ROOM_NOT_FOUND',
        error: 'Salon introuvable pour envoyer l\'invitation.',
      });
      return;
    }

    // 3. Protection Liste de blocage bi-directionnelle (BLOCKED)
    let isBlocked = false;
    try {
      const senderDocRef = doc(db, 'blocked_players', client.playerId);
      const targetDocRef = doc(db, 'blocked_players', msg.targetPlayerId);

      const [senderSnap, targetSnap] = await Promise.all([
        getDoc(senderDocRef),
        getDoc(targetDocRef),
      ]);

      if (senderSnap.exists()) {
        const senderBlocked = (senderSnap.data()?.blockedUserIds as string[]) || [];
        if (senderBlocked.includes(msg.targetPlayerId)) {
          isBlocked = true;
        }
      }

      if (!isBlocked && targetSnap.exists()) {
        const targetBlocked = (targetSnap.data()?.blockedUserIds as string[]) || [];
        if (targetBlocked.includes(client.playerId)) {
          isBlocked = true;
        }
      }
    } catch (err) {
      console.error('[RoomManager] Erreur lors de la vérification des blocages:', err);
    }

    if (isBlocked) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'BLOCKED',
        error: 'Impossible d\'envoyer l\'invitation à ce joueur.',
      });
      return;
    }

    // 4. Protection Limitation de fréquence / Anti-Spam (RATE_LIMITED)
    const now = Date.now();
    let existingPendingInvite = false;
    for (const invite of this.pendingInvitations.values()) {
      if (
        invite.fromUserId === client.playerId &&
        invite.toUserId === msg.targetPlayerId &&
        invite.status === 'PENDING' &&
        invite.expiresAt > now
      ) {
        existingPendingInvite = true;
        break;
      }
    }

    if (existingPendingInvite) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'RATE_LIMITED',
        error: 'Une invitation est déjà en cours avec ce joueur.',
      });
      return;
    }

    const invitePairKey = `${client.playerId}_${msg.targetPlayerId}`;
    const lastInviteTime = this.lastDirectInviteTimestamps.get(invitePairKey) || 0;
    const elapsedSeconds = (now - lastInviteTime) / 1000;
    if (elapsedSeconds < 30) {
      const remainingSeconds = Math.ceil(30 - elapsedSeconds);
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'RATE_LIMITED',
        error: `Veuillez patienter ${remainingSeconds} seconde${remainingSeconds > 1 ? 's' : ''} avant de réinviter ce joueur.`,
      });
      return;
    }

    const targetClient = this.clients.get(msg.targetPlayerId);
    const inviteId = 'inv_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
    const fromName = msg.playerName || room.hostName || 'Un joueur';
    const invitation: GameInvitation = {
      id: inviteId,
      fromUserId: client.playerId,
      fromUserName: fromName,
      fromUserAvatar: msg.avatarSeed || 'host',
      toUserId: msg.targetPlayerId,
      roomCode: msg.roomCode,
      baseBet: room.baseBet,
      initialCapital: room.initialCapital,
      status: 'PENDING',
      createdAt: now,
      expiresAt: now + 1000 * 120, // 2 minutes
    };

    this.pendingInvitations.set(inviteId, invitation);
    this.lastDirectInviteTimestamps.set(invitePairKey, now);

    let deliveredViaWs = false;
    // 1. Forward invitation via active WebSocket if online
    if (targetClient && targetClient.socket.readyState === WebSocket.OPEN) {
      this.sendMessage(targetClient.socket, {
        type: 'DIRECT_INVITE_RECEIVED',
        invitation,
        timestamp: Date.now(),
      });
      deliveredViaWs = true;
    }

    // 2. Dispatch Web Push Notification (PWA / Mobile / Background)
    pushService.sendNotificationToUser(msg.targetPlayerId, {
      title: `🃏 ${fromName} te lance un défi !`,
      body: `Table #${msg.roomCode} · ${room.baseBet} jetons · ça part dans 2 min.`,
      icon: '/icon-192.png',
      badge: '/badge-96.png',
      tag: `invite-${inviteId}`,
      data: {
        type: 'INVITATION',
        roomCode: msg.roomCode,
        inviteId,
        fromUserId: client.playerId,
        fromUserName: fromName,
        expiresAt: invitation.expiresAt,
        url: buildGameUrl(msg.roomCode),
      },
    }).catch((err) => {
      console.warn('[RoomManager] Web Push dispatch notice:', err);
    });

    // Acknowledge to sender
    this.sendMessage(client.socket, {
      type: 'NOTIFICATION',
      notification: deliveredViaWs
        ? `Invitation transmise à votre contact pour le salon ${msg.roomCode}.`
        : `Invitation envoyée par notification Push mobile pour le salon ${msg.roomCode}.`,
    });
  }

  public static handleRespondDirectInvite(client: ConnectedClient, msg: ClientMessage): void {
    if (!msg.inviteId) return;
    const invite = this.pendingInvitations.get(msg.inviteId);
    if (!invite) {
      this.sendMessage(client.socket, {
        type: 'ERROR',
        errorCode: 'INVITE_EXPIRED',
        error: 'Cette invitation a expiré ou n\'existe plus.',
      });
      return;
    }

    invite.status = msg.agree ? 'ACCEPTED' : 'DECLINED';
    this.pendingInvitations.delete(msg.inviteId);

    // Notify sender of response
    const senderClient = this.clients.get(invite.fromUserId);
    if (senderClient && senderClient.socket.readyState === WebSocket.OPEN) {
      this.sendMessage(senderClient.socket, {
        type: 'INVITE_FEEDBACK',
        inviteFeedback: {
          inviteId: invite.id,
          agree: !!msg.agree,
          responderName: msg.playerName || 'Votre invité',
          roomCode: invite.roomCode,
        },
        timestamp: Date.now(),
      });
    }

    // If accepted, auto join the room
    if (msg.agree) {
      this.handleJoinRoom(client, {
        type: 'JOIN_ROOM',
        playerId: client.playerId,
        playerName: msg.playerName,
        avatarSeed: msg.avatarSeed,
        roomCode: invite.roomCode,
        confirmLeaveCurrent: msg.confirmLeaveCurrent,
      });
    }
  }

  public static handleQuickMatchRequest(client: ConnectedClient, msg: ClientMessage): void {
    // Fair-play check: reject if player has active TEMP_BAN or BANNED status
    const serverSanction = this.getActivePlayerSanction(client.playerId);
    const effectiveSanction = serverSanction ? {
      type: serverSanction.sanctionType || (serverSanction.status === 'BANNED' ? 'TEMP_BAN' : undefined),
      reason: serverSanction.bannedReason || 'Sanction Fair-Play active',
      expiresAt: serverSanction.banExpiresAt,
      active: true,
    } : (msg.fairPlaySanction && msg.fairPlaySanction.active ? msg.fairPlaySanction : null);

    if (effectiveSanction && effectiveSanction.active) {
      if (effectiveSanction.type === 'TEMP_BAN' || effectiveSanction.type === 'PERM_BAN') {
        const isStillActive = !effectiveSanction.expiresAt || Date.now() < effectiveSanction.expiresAt;
        if (isStillActive) {
          const remainingMinutes = effectiveSanction.expiresAt ? Math.ceil((effectiveSanction.expiresAt - Date.now()) / 60000) : 0;
          this.sendMessage(client.socket, {
            type: 'ERROR',
            errorCode: 'BANNED',
            error: `🚫 Accès refusé par le Fair-Play (${effectiveSanction.type}) : ${effectiveSanction.reason}${
              remainingMinutes > 0 ? ` (expire dans ${remainingMinutes} min)` : ''
            }`,
          });
          return;
        }
      }
    }

    // Active game protection: block if player is in an active PLAYING game unless confirmed
    if (!msg.confirmLeaveCurrent) {
      const activeGame = this.getActiveGameForPlayer(client.playerId);
      if (activeGame) {
        this.sendMessage(client.socket, {
          type: 'ERROR',
          errorCode: 'ACTIVE_GAME_IN_PROGRESS',
          error: `Vous avez une partie en cours (salon ${activeGame.roomCode}). Retournez-y ou quittez-la explicitement.`,
          activeGameRoomCode: activeGame.roomCode,
        });
        return;
      }
    }

    // 1. Look for an available public room in LOBBY with matching settings or empty seats
    let candidateRoom: MultiplayerRoom | null = null;
    for (const room of this.rooms.values()) {
      if (
        room.isPublic !== false &&
        room.status === 'LOBBY' &&
        (room.players || []).length < room.maxPlayers
      ) {
        candidateRoom = room;
        break;
      }
    }

    if (candidateRoom) {
      // Join candidate room
      this.handleJoinRoom(client, {
        type: 'JOIN_ROOM',
        playerId: client.playerId,
        playerName: msg.playerName,
        avatarSeed: msg.avatarSeed,
        roomCode: candidateRoom.id,
        fairPlaySanction: msg.fairPlaySanction,
        confirmLeaveCurrent: msg.confirmLeaveCurrent,
      });
      this.sendMessage(client.socket, {
        type: 'QUICK_MATCH_RESULT',
        matchedRoomCode: candidateRoom.id,
        timestamp: Date.now(),
      });
    } else {
      // Create new public room and return code
      const newRoomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
      this.handleCreateRoom(client, {
        type: 'CREATE_ROOM',
        playerId: client.playerId,
        playerName: msg.playerName || 'Hôte',
        avatarSeed: msg.avatarSeed,
        roomCode: newRoomCode,
        fairPlaySanction: msg.fairPlaySanction,
        confirmLeaveCurrent: msg.confirmLeaveCurrent,
        settings: {
          fillWithBots: true,
          maxPlayers: 4,
          baseBet: msg.settings?.baseBet || 10,
          initialCapital: msg.settings?.initialCapital || 100,
          enableDoubleKora: true,
          enableUnder21: true,
          isPublic: true,
        },
      });
      this.sendMessage(client.socket, {
        type: 'QUICK_MATCH_RESULT',
        matchedRoomCode: newRoomCode,
        timestamp: Date.now(),
      });
    }
  }

  public static updateHumanAbsentTimestamp(room: MultiplayerRoom): void {
    if (!room || !room.players) return;
    const connectedHumans = room.players.filter((p) => {
      if (!p.isHuman || !p.connected) return false;
      const client = this.clients.get(p.id);
      if (client && client.socket.readyState !== WebSocket.OPEN) {
        return false;
      }
      return true;
    });

    if (connectedHumans.length === 0) {
      if (!room.allHumansAbsentSince) {
        room.allHumansAbsentSince = Date.now();
      }
    } else {
      room.allHumansAbsentSince = null;
    }
  }

  /**
   * Periodic room cleanup task:
   * Dynamically removes rooms from memory when all human players have left
   * for more than emptyRoomTimeoutMinutes (default 5 min, configured in Katika Master settings).
   */
  public static initRoomCleanupInterval(): void {
    if (!this.roomTickInterval) {
      this.roomTickInterval = setInterval(() => {
        const roomCodes = Array.from(this.rooms.keys());
        for (const roomCode of roomCodes) {
          const changed = this.tickRoom(roomCode);
          if (changed) {
            this.broadcastRoomState(roomCode);
            this.evaluateAutoStart(roomCode);
          }
        }
      }, 1000);
    }

    if (this.cleanupInterval) return;

    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const defaultTimeoutMinutes = this.engineConfig.emptyRoomTimeoutMinutes ?? 5;
      const lobbyWaitTtlMinutes = this.engineConfig.lobbyWaitTtlMinutes ?? 30;

      this.rooms.forEach((room, roomCode) => {
        // Corrupted / invalid / headless room cleanup
        if (!room || !roomCode || roomCode === 'TEST_CLI' || !room.players || room.players.length === 0) {
          console.log(`[Room Cleanup] Removing corrupted room ${roomCode}`);
          this.adminCloseRoom(roomCode);
          return;
        }

        this.updateHumanAbsentTimestamp(room);

        const humanPlayers = (room.players || []).filter((p) => p.isHuman);
        const connectedHumans = humanPlayers.filter((p) => {
          const client = this.clients.get(p.id);
          if (!p.connected) return false;
          if (client && client.socket.readyState !== WebSocket.OPEN) return false;
          return true;
        });

        // If at least 1 human is connected, keep open!
        if (connectedHumans.length > 0) {
          room.allHumansAbsentSince = null;
          return;
        }

        // When 0 connected humans:
        if (room.status === 'LOBBY') {
          const hostPlayer = (room.players || []).find(
            (p) => p.id === (room.originalHostId || room.hostId) && p.isHuman
          );
          const isHostInLobbyGrace = Boolean(
            hostPlayer &&
              !hostPlayer.connected &&
              hostPlayer.disconnectGraceExpiresAt &&
              now < hostPlayer.disconnectGraceExpiresAt
          );

          const lobbyWaitTtlMs = lobbyWaitTtlMinutes * 60 * 1000;
          const lobbyRefTime = room.hostAbsentSince || room.allHumansAbsentSince || room.lastSeenAt || room.updatedAt || room.createdAt || now;
          const inactiveDuration = now - lobbyRefTime;

          if (!isHostInLobbyGrace && inactiveDuration >= lobbyWaitTtlMs) {
            console.log(
              `[Room Cleanup] Auto-closing LOBBY room ${roomCode} after ${Math.round(
                inactiveDuration / 60000
              )}m without connected humans (threshold: ${lobbyWaitTtlMinutes}m).`
            );
            this.adminCloseRoom(roomCode);
            return;
          }
        } else {
          // Non-LOBBY rooms (PLAYING, PARTIE_OVER, MANCHE_OVER) with 0 connected humans:
          // Use emptyRoomTimeoutMinutes based on allHumansAbsentSince (NOT affected by bot updatedAt)
          const absentSince = room.allHumansAbsentSince || now;
          const absentDuration = now - absentSince;
          const activeTimeoutMs = defaultTimeoutMinutes * 60 * 1000;

          if (absentDuration >= activeTimeoutMs) {
            console.log(
              `[Room Cleanup] Auto-closing room ${roomCode} (${room.status}) after ${Math.round(
                absentDuration / 60000
              )}m without connected humans (threshold: ${defaultTimeoutMinutes}m, absentSince: ${absentSince}).`
            );
            this.adminCloseRoom(roomCode);
            return;
          }
        }
      });

      // Also clean up expired pending invitations (> 2 mins)
      this.pendingInvitations.forEach((inv, id) => {
        if (now > inv.expiresAt) {
          this.pendingInvitations.delete(id);
        }
      });

      // Clean up expired join attempt rate limiters
      this.failedJoinAttempts.forEach((val, key) => {
        if (val.resetAt < now) {
          this.failedJoinAttempts.delete(key);
        }
      });

      // Clean up stale user presences (> 15 mins inactive)
      this.userPresences.forEach((pres, key) => {
        if (now - pres.lastSeenAt > 15 * 60 * 1000) {
          this.userPresences.delete(key);
        }
      });

      // Clean up stale emote rate limiters (> 1 min inactive)
      this.lastEmoteTimestamps.forEach((ts, key) => {
        if (now - ts > 60000) {
          this.lastEmoteTimestamps.delete(key);
        }
      });
    }, 1000 * 60); // Run every 1 minute
  }

  public static evaluateLobbyHostTakeover(roomCode: string): boolean {
    const room = this.rooms.get(roomCode);
    if (!room || room.status !== 'LOBBY') return false;

    room.originalHostId = room.originalHostId || room.hostId;
    const origHostPlayer = (room.players || []).find((p) => p.id === room.originalHostId);
    const origHostClient = origHostPlayer ? this.clients.get(origHostPlayer.id) : undefined;
    const isOrigHostConnected = Boolean(
      origHostPlayer &&
      origHostPlayer.connected &&
      origHostClient &&
      origHostClient.socket.readyState === WebSocket.OPEN
    );

    const takeoverSecs = this.engineConfig.hostTakeoverSeconds ?? 180;

    if (isOrigHostConnected) {
      if (room.hostId !== room.originalHostId && origHostPlayer) {
        room.hostId = room.originalHostId;
        room.hostName = origHostPlayer.name;
        (room.players || []).forEach((p) => { p.isHost = (p.id === room.originalHostId); });
        room.hostAbsentSince = undefined;

        const emote: EmoteMessage = {
          id: 'em_' + Math.random().toString(36).substring(2, 9),
          playerId: 'system',
          playerName: 'Système',
          text: `👑 ${origHostPlayer.name} a repris son rôle d'hôte.`,
          emoji: '👑',
          timestamp: Date.now(),
          isBot: true,
        };
        room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
        room.updatedAt = Date.now();

        this.broadcastRoomState(roomCode);
        return true;
      }
      return false;
    }

    if (!room.hostAbsentSince) {
      room.hostAbsentSince = Date.now();
    }

    if (takeoverSecs > 0) {
      const absentMs = Date.now() - room.hostAbsentSince;
      if (absentMs >= takeoverSecs * 1000) {
        const takeoverPlayer = (room.players || []).find((p) => {
          if (!p.isHuman || p.isSpectator || !p.connected) return false;
          const c = this.clients.get(p.id);
          return Boolean(c && c.socket.readyState === WebSocket.OPEN);
        });

        if (takeoverPlayer && takeoverPlayer.id !== room.hostId) {
          room.hostId = takeoverPlayer.id;
          room.hostName = takeoverPlayer.name;
          (room.players || []).forEach((p) => { p.isHost = (p.id === takeoverPlayer.id); });

          const emote: EmoteMessage = {
            id: 'em_' + Math.random().toString(36).substring(2, 9),
            playerId: 'system',
            playerName: 'Système',
            text: `👑 ${takeoverPlayer.name} est hôte temporaire.`,
            emoji: '👑',
            timestamp: Date.now(),
            isBot: true,
          };
          room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
          room.updatedAt = Date.now();

          this.broadcastRoomState(roomCode);
          return true;
        }
      }
    }
    return false;
  }

  private static notifyHostPlayerJoined(room: MultiplayerRoom, joiningPlayerName: string, joiningPlayerId: string): void {
    if (this.engineConfig.joinPushEnabled === false) return;
    const origHostId = room.originalHostId || room.hostId;
    if (!origHostId || origHostId === joiningPlayerId) return;

    const origHostPlayer = (room.players || []).find((p) => p.id === origHostId);
    const hostClient = origHostPlayer ? this.clients.get(origHostPlayer.id) : undefined;
    const isHostConnected = Boolean(
      origHostPlayer &&
      origHostPlayer.connected &&
      hostClient &&
      hostClient.socket.readyState === WebSocket.OPEN
    );

    if (isHostConnected) return;

    const now = Date.now();
    if (room.lastJoinPushTime && (now - room.lastJoinPushTime < 120_000)) return;
    if ((room.joinPushCount || 0) >= 3) return;

    room.joinPushCount = (room.joinPushCount || 0) + 1;
    room.lastJoinPushTime = now;

    pushService.sendNotificationToUser(origHostId, {
      title: 'Katika - Nouveau joueur à votre table !',
      body: `${joiningPlayerName} a rejoint votre table #${room.id}. Cliquez pour revenir jouer.`,
      icon: '/icon-192.png',
      badge: '/badge-96.png',
      tag: `join_${room.id}`,
      data: {
        type: 'PLAYER_JOINED',
        roomCode: room.id,
        url: `/game/?join=${encodeURIComponent(room.id)}`,
      },
    }).catch((err) => console.error('[Push] Error sending PLAYER_JOINED:', err));
  }
}

