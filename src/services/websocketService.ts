import { MultiplayerRoom, EmoteMessage, PublicRoomSummary, GameInvitation, UserPresence, PartieResult } from '../types';
import { ClientMessage, ServerMessage } from '../../server/types';
import { auth } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { APP_VERSION } from '../version';
import { playerProfileService } from './playerProfileService';
import { getPersistentItem, setPersistentItem } from '../utils/storageUtils';
import { getPlayerId, setLocalPlayerId, setInRoomStatus, onIdentityChange } from './identity';
import { noteServerConfigVersion } from './publicConfig';

export type ConnectionStateListener = (connected: boolean) => void;
export type RoomUpdateListener = (room: MultiplayerRoom | null) => void;
export type ErrorListener = (error: string, errorCode?: string, activeGameRoomCode?: string) => void;
export type EmoteListener = (emote: EmoteMessage) => void;
export type LobbyAlertListener = (message: string) => void;
export type AdminMessageListener = (data: { senderName: string; text: string; isPrivate: boolean }) => void;
export type PublicRoomsListener = (rooms: PublicRoomSummary[]) => void;
export type DirectInviteListener = (invitation: GameInvitation) => void;
export type InviteFeedbackListener = (data: { inviteId: string; agree: boolean; responderName: string; roomCode: string }) => void;
export type FriendsPresenceListener = (presences: UserPresence[]) => void;
export type QuickMatchResultListener = (roomCode: string) => void;
export type PartieResultsListener = (results: PartieResult[]) => void;
export type VersionStatusListener = (data: {
  isProtocolCompatible: boolean;
  updateRecommended: boolean;
  serverVersion?: string;
  protocolVersion?: number;
  incompatibilityReason?: string;
}) => void;
export type OfflineQueueListener = (flushedCount: number) => void;

function getDeviceSessionId(): string {
  try {
    let sId = sessionStorage.getItem('njambo_device_session_id');
    if (!sId) {
      sId = 'sess_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
      sessionStorage.setItem('njambo_device_session_id', sId);
    }
    return sId;
  } catch {
    return 'sess_' + Math.random().toString(36).substring(2, 10);
  }
}

class WebSocketService {
  private socket: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private connectionStateListeners: Set<ConnectionStateListener> = new Set();
  private roomUpdateListeners: Set<RoomUpdateListener> = new Set();
  private errorListeners: Set<ErrorListener> = new Set();
  private emoteListeners: Set<EmoteListener> = new Set();
  private lobbyAlertListeners: Set<LobbyAlertListener> = new Set();
  private adminMessageListeners: Set<AdminMessageListener> = new Set();
  private serverNotificationListeners: Set<(text: string) => void> = new Set();
  private publicRoomsListeners: Set<PublicRoomsListener> = new Set();
  private directInviteListeners: Set<DirectInviteListener> = new Set();
  private inviteFeedbackListeners: Set<InviteFeedbackListener> = new Set();
  private friendsPresenceListeners: Set<FriendsPresenceListener> = new Set();
  private quickMatchResultListeners: Set<QuickMatchResultListener> = new Set();
  private versionStatusListeners: Set<VersionStatusListener> = new Set();
  private offlineQueueListeners: Set<OfflineQueueListener> = new Set();
  private partieResultsListeners: Set<PartieResultsListener> = new Set();
  private currentRoom: MultiplayerRoom | null = null;
  private lastAcceptedState: { roomId: string; epoch: number; rev: number } | null = null;
  private isConnecting: boolean = false;
  private activeRoomCode: string | null = null;
  private sessionRoomPlayerId: string | null = null;
  private userExplicitlyLeft: boolean = false;
  private currentPresenceStatus: 'ONLINE_IDLE' | 'IN_SOLO' | 'IN_LOBBY' | 'IN_GAME' | 'OFFLINE' = 'ONLINE_IDLE';
  private connectPromise: Promise<void> | null = null;
  private pendingMessages: string[] = [];
  private pendingInRoomMessages: string[] = [];
  private serverTimeOffset: number = 0;
  private lastPingSentAt: number = 0;
  private lastPingLatencyMs: number | null = null;
  private lastServerError: { code: string; message: string; timestamp: number } | null = null;
  private lastConnectAttemptAt: number = 0;
  private authSentOnThisSocket: boolean = false;
  private authConfirmedOnThisSocket: boolean = false;
  private pendingAuthMessages: string[] = [];
  private hasAttemptedAuthRetry: boolean = false;
  private lastConnectedPlayerId: string | null = null;
  private isSessionTakenOver: boolean = false;
  private pendingJoinCancelled: boolean = false;
  private sessionRestoredListeners: Set<() => void> = new Set();
  private wasDisconnected: boolean = false;
  private roomSyncedOnThisSocket: boolean = false;

  public onSessionRestored(listener: () => void): () => void {
    this.sessionRestoredListeners.add(listener);
    return () => {
      this.sessionRestoredListeners.delete(listener);
    };
  }

  private checkSessionRestored(): void {
    if (!this.wasDisconnected) return;
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    const currentUser = auth.currentUser;
    const isGoogleUser = Boolean(currentUser && !currentUser.isAnonymous);

    if (isGoogleUser && !this.authConfirmedOnThisSocket) {
      return;
    }

    const inTable = Boolean(this.activeRoomCode || this.currentRoom);
    if (inTable && !this.roomSyncedOnThisSocket) {
      return;
    }

    this.wasDisconnected = false;
    this.sessionRestoredListeners.forEach((l) => {
      try {
        l();
      } catch (e) {
        console.warn('[WS] Session restored listener error:', e);
      }
    });
  }

  public getLocalPlayerId(): string {
    if (this.activeRoomCode && this.sessionRoomPlayerId) {
      return this.sessionRoomPlayerId;
    }
    return getPlayerId();
  }

  public updateServerTime(serverTimestamp: number, roundTripMs: number = 0): void {
    if (!serverTimestamp || typeof serverTimestamp !== 'number') return;
    const clientNow = Date.now();
    const estimatedServerNow = serverTimestamp + Math.round(roundTripMs / 2);
    const measuredOffset = estimatedServerNow - clientNow;

    if (this.serverTimeOffset === 0) {
      this.serverTimeOffset = measuredOffset;
    } else {
      this.serverTimeOffset = Math.round(this.serverTimeOffset * 0.8 + measuredOffset * 0.2);
    }
  }

  public getServerTime(): number {
    return Date.now() + this.serverTimeOffset;
  }

  public getServerTimeOffset(): number {
    return this.serverTimeOffset;
  }

  public getCurrentRoom(): MultiplayerRoom | null {
    return this.currentRoom;
  }

  constructor() {
    // Restore persisted active room code if present
    if (typeof window !== 'undefined') {
      try {
        const savedRoom = localStorage.getItem('njambo_active_room_code');
        if (savedRoom) {
          this.activeRoomCode = savedRoom;
          setInRoomStatus(true);
        }
      } catch (e) {
        // ignore
      }

      // High-priority mobile resume & Page Visibility listeners (RFC & Zero-friction auto-sync)
      const handleAppResume = () => {
        if (typeof document !== 'undefined' && document.hidden) return;
        if (this.userExplicitlyLeft || this.isSessionTakenOver) return;

        const currentActiveRoom = this.activeRoomCode || localStorage.getItem('njambo_active_room_code');
        if (!currentActiveRoom) return;

        // Check if socket is dead, closing, or hanging in CONNECTING state
        const isStuckConnecting = this.socket?.readyState === WebSocket.CONNECTING && (Date.now() - this.lastConnectAttemptAt > 3500);
        if (!this.socket || this.socket.readyState === WebSocket.CLOSED || this.socket.readyState === WebSocket.CLOSING || isStuckConnecting) {
          console.log('[WS] App resumed from background - reconnecting immediately');
          if (isStuckConnecting && this.socket) {
            try { this.socket.close(); } catch (e) { /* ignore */ }
          }
          this.connect().then(() => {
            if (!this.userExplicitlyLeft && currentActiveRoom && this.socket && this.socket.readyState === WebSocket.OPEN) {
              const playerId = this.getLocalPlayerId();
              const playerName = localStorage.getItem('njambo_player_name') || '';
              this.send({
                type: 'JOIN_ROOM',
                roomCode: currentActiveRoom,
                playerId,
                playerName,
              });
            }
          });
        } else if (this.socket.readyState === WebSocket.OPEN && currentActiveRoom && !this.userExplicitlyLeft) {
          // Socket is open: send instant join/sync and ping
          const playerId = this.getLocalPlayerId();
          const playerName = localStorage.getItem('njambo_player_name') || '';
          this.send({
            type: 'JOIN_ROOM',
            roomCode: currentActiveRoom,
            playerId,
            playerName,
          });
          this.send({
            type: 'PING',
            playerId,
            timestamp: Date.now(),
          } as any);
        }
      };

      window.addEventListener('visibilitychange', handleAppResume);
      document.addEventListener('visibilitychange', () => this.sendPresence());
      window.addEventListener('pageshow', handleAppResume);
      window.addEventListener('focus', handleAppResume);
      window.addEventListener('online', () => {
        console.log('[WS] Network back online - reconnecting');
        handleAppResume();
      });

      // Listen for Firebase Auth state changes
      onAuthStateChanged(auth, () => {
        this.onAuthChanged();
      });

      // Listen for identity queue releases (when exiting a room)
      onIdentityChange(() => {
        this.onAuthChanged();
      });
    }
  }

  public onAuthChanged(): void {
    const currentId = getPlayerId();
    const inRoom = Boolean(this.activeRoomCode || this.currentRoom);
    const currentUser = auth.currentUser;
    const isGoogleUser = Boolean(currentUser && !currentUser.isAnonymous);

    if (inRoom) {
      if (isGoogleUser && !this.authSentOnThisSocket && currentUser?.uid === currentId) {
        console.log('[WS] Auth state restored for current in-room Google user: reconnecting socket to send AUTH.');
        if (this.socket) {
          try {
            this.socket.close(1000, 'Auth restored in room');
          } catch (e) {
            // ignore
          }
        }
        this.connect();
      } else {
        console.log('[WS] Auth state changed while in active room: preserving table session until room exit.');
      }
      return;
    }

    // Outside room: only close and reconnect if the player identity actually changed or socket does not exist
    if (!this.socket || this.socket.readyState === WebSocket.CLOSED || this.socket.readyState === WebSocket.CLOSING) {
      this.connect();
    } else if (this.lastConnectedPlayerId && this.lastConnectedPlayerId !== currentId) {
      console.log('[WS] Auth identity changed outside room (from', this.lastConnectedPlayerId, 'to', currentId, '): reconnecting.');
      try {
        this.socket.close(1000, 'Auth identity changed');
      } catch (e) {
        // ignore
      }
      this.connect();
    } else {
      console.log('[WS] Auth state changed but player identity unchanged:', currentId, '- keeping existing socket.');
    }
  }

  public getReconnectToken(): string | null {
    return getPersistentItem('njambo_reconnect_token');
  }

  public setReconnectToken(token: string): void {
    setPersistentItem('njambo_reconnect_token', token);
  }

  public connect(forceReconnect: boolean = false): Promise<void> {
    if (this.isSessionTakenOver && !forceReconnect) {
      console.log('[WS] Connection skipped: session taken over in another tab.');
      return Promise.resolve();
    }
    if (forceReconnect) {
      this.isSessionTakenOver = false;
    }

    const currentId = this.getLocalPlayerId();
    const isSameIdentity = !this.lastConnectedPlayerId || this.lastConnectedPlayerId === currentId;

    // Protection contre les connexions doublées : si une connexion est déjà ouverte ou en cours pour la même identité
    if (isSameIdentity && !forceReconnect) {
      if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
        return this.connectPromise || Promise.resolve();
      }
      if (this.isConnecting && this.connectPromise) {
        return this.connectPromise;
      }
    }

    // Si l'identité a changé et qu'une socket existe, la fermer proprement avant de reconnecter
    if (!isSameIdentity && this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      console.log(`[WS] Player identity changed (from ${this.lastConnectedPlayerId} to ${currentId}): closing old socket before reconnect.`);
      try {
        this.socket.close(1000, 'Identity changed');
      } catch (e) {
        // ignore
      }
      this.socket = null;
    }

    this.isConnecting = true;
    this.lastConnectAttemptAt = Date.now();
    this.authSentOnThisSocket = false;
    this.authConfirmedOnThisSocket = false;

    this.connectPromise = (async () => {
      // Wait for authStateReady with a 3s max timeout to ensure restored Firebase session
      try {
        if (typeof (auth as any).authStateReady === 'function') {
          await Promise.race([
            auth.authStateReady(),
            new Promise((resolve) => setTimeout(resolve, 3000)),
          ]);
        }
      } catch (e) {
        console.warn('[WS] authStateReady wait error:', e);
      }

      // If socket opened in the meantime, finish early
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.isConnecting = false;
        return;
      }

      // Retrieve Firebase Auth ID Token for authenticated Google user
      let idToken: string | null = null;
      const currentUser = auth.currentUser;
      if (currentUser && !currentUser.isAnonymous) {
        try {
          idToken = await currentUser.getIdToken();
        } catch (e) {
          console.warn('[WS] Failed to get auth ID token for handshake:', e);
        }
      }

      return new Promise<void>((resolve) => {
        try {
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const token = this.getReconnectToken();
          const playerId = this.getLocalPlayerId();
          this.lastConnectedPlayerId = playerId;
          const sessionId = getDeviceSessionId();
          const params = new URLSearchParams();
          if (token) params.set('token', token);
          if (playerId) params.set('playerId', playerId);
          if (sessionId) params.set('sessionId', sessionId);
          const wsUrl = `${protocol}//${window.location.host}/ws${params.toString() ? `?${params.toString()}` : ''}`;

          this.socket = new WebSocket(wsUrl);

          this.socket.onopen = () => {
            this.isConnecting = false;
            this.connectPromise = null;
            this.lastAcceptedState = null;
            this.roomSyncedOnThisSocket = false;
            this.startHeartbeat();
            this.notifyConnectionState(true);

            // Step 1: Send AUTH as the very first message if user is authenticated
            if (idToken && this.socket && this.socket.readyState === WebSocket.OPEN) {
              const authMsg: ClientMessage = {
                type: 'AUTH',
                playerId: currentUser?.uid || playerId,
                idToken,
                timestamp: Date.now(),
              };
              this.socket.send(JSON.stringify(authMsg));
              this.authSentOnThisSocket = true;
            }

            // Intelligent Offline Queue Purge (Lot 2 Resilience)
            const now = Date.now();
            const filteredPending: string[] = [];

            for (const raw of this.pendingMessages) {
              try {
                const msg: ClientMessage = JSON.parse(raw);
                const ageMs = msg.timestamp ? now - msg.timestamp : 0;

                // Always preserve presence, connection, heartbeat and join requests
                if (
                  msg.type === 'HEARTBEAT_PRESENCE' ||
                  msg.type === 'PING' ||
                  msg.type === 'JOIN_ROOM'
                ) {
                  filteredPending.push(raw);
                  continue;
                }

                // Preserve critical social invites if fresh (< 30 seconds)
                if (msg.type === 'SEND_DIRECT_INVITE' || msg.type === 'RESPOND_DIRECT_INVITE') {
                  if (ageMs <= 30000) {
                    filteredPending.push(raw);
                  }
                  continue;
                }

                // Purge stale card plays: game state has already progressed or AI Relay took over
                if (msg.type === 'PLAY_CARD') {
                  console.log(`[WS Offline Queue] Purged obsolete PLAY_CARD (${msg.cardId}, age: ${ageMs}ms)`);
                  continue;
                }

                // Ready actions: keep if recent (< 15 seconds)
                if (msg.type === 'SET_READY' || msg.type === 'READY_NEXT_PARTIE') {
                  if (ageMs <= 15000) {
                    filteredPending.push(raw);
                  }
                  continue;
                }

                // General messages: keep if < 10 seconds
                if (ageMs <= 10000) {
                  filteredPending.push(raw);
                }
              } catch {
                // Ignore corrupted messages
              }
            }

            this.pendingMessages = filteredPending;
            const initialQueueLength = this.pendingMessages.length;

            const isRoomBoundType = (t: string) =>
              t === 'READY_NEXT_PARTIE' ||
              t === 'FORCE_NEXT_PARTIE' ||
              t === 'PLAY_CARD' ||
              t === 'SEND_EMOTE' ||
              t === 'SET_READY' ||
              t === 'START_GAME' ||
              t === 'FOLD_ROUND' ||
              t === 'PROPOSE_BET_INCREASE' ||
              t === 'RESPOND_BET_INCREASE' ||
              t === 'CANCEL_BET_INCREASE';

            const requiresAuthGating = Boolean(auth.currentUser && !auth.currentUser.isAnonymous);

            if (this.activeRoomCode) {
              // Segregate room-bound messages: hold them until ROOM_JOINED confirms room attachment
              const immediateMessages: string[] = [];
              this.pendingInRoomMessages = [];
              for (const raw of this.pendingMessages) {
                try {
                  const parsed = JSON.parse(raw);
                  if (isRoomBoundType(parsed.type)) {
                    this.pendingInRoomMessages.push(raw);
                  } else {
                    immediateMessages.push(raw);
                  }
                } catch {
                  immediateMessages.push(raw);
                }
              }

              // Flush global non-room messages
              while (immediateMessages.length > 0) {
                const raw = immediateMessages.shift();
                if (raw) {
                  if (requiresAuthGating && !this.authConfirmedOnThisSocket) {
                    this.pendingAuthMessages.push(raw);
                  } else if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                    this.socket.send(raw);
                  } else {
                    this.pendingMessages.push(raw);
                  }
                }
              }
              this.pendingMessages = [];

              // If we had an active room, rejoin immediately with reconnect token
              const pid = this.getLocalPlayerId();
              const pname = getPersistentItem('njambo_player_name') || localStorage.getItem('njambo_player_name') || '';
              const reconnectToken = this.getReconnectToken();
              this.send({
                type: 'JOIN_ROOM',
                roomCode: this.activeRoomCode,
                playerId: pid,
                playerName: pname,
                reconnectToken,
              });
            } else {
              // Flush all surviving messages immediately (or route to pendingAuthMessages if waiting for AUTH_CONFIRMED)
              while (this.pendingMessages.length > 0) {
                const raw = this.pendingMessages.shift();
                if (raw) {
                  if (requiresAuthGating && !this.authConfirmedOnThisSocket) {
                    this.pendingAuthMessages.push(raw);
                  } else if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                    this.socket.send(raw);
                  } else {
                    this.pendingMessages.push(raw);
                  }
                }
              }
            }

            if (initialQueueLength > 0) {
              this.offlineQueueListeners.forEach((l) => l(initialQueueLength));
            }

            if (!this.activeRoomCode && !this.currentRoom) {
              this.checkSessionRestored();
            }

            resolve();
          };

          this.socket.onmessage = (event) => {
            try {
              const msg: ServerMessage = JSON.parse(event.data);
              this.handleServerMessage(msg);
            } catch (e) {
              console.error('[WS] Failed to parse message:', e);
            }
          };

          this.socket.onclose = (event) => {
            this.wasDisconnected = true;
            this.roomSyncedOnThisSocket = false;
            this.isConnecting = false;
            this.connectPromise = null;
            this.authConfirmedOnThisSocket = false;
            this.stopHeartbeat();
            if (this.pendingAuthMessages.length > 0) {
              this.pendingMessages.unshift(...this.pendingAuthMessages);
              this.pendingAuthMessages = [];
            }
            if (this.pendingInRoomMessages.length > 0) {
              this.pendingMessages.unshift(...this.pendingInRoomMessages);
              this.pendingInRoomMessages = [];
            }
            this.notifyConnectionState(false);
            
            if (event.code === 4001) {
              console.log('[WS] Session takeover detected (4001). Halting auto-reconnect.');
              this.isSessionTakenOver = true;
              this.activeRoomCode = null;
              this.sessionRoomPlayerId = null;
              this.lastAcceptedState = null;
              setInRoomStatus(false);
              this.currentRoom = null;
              try {
                localStorage.removeItem('njambo_active_room_code');
              } catch (e) {
                // ignore
              }
              this.notifyError('SESSION_TAKEOVER');
              return resolve();
            }

            // Auto reconnect if we have an active room or connected presence
            if (!this.isSessionTakenOver && (this.activeRoomCode || this.currentPresenceStatus !== 'OFFLINE')) {
              this.scheduleReconnect();
            }
            resolve();
          };

          this.socket.onerror = (event) => {
            const readyState = this.socket ? this.socket.readyState : -1;
            const msg = (event as ErrorEvent)?.message;
            if (msg) {
              console.warn(`[WS] Socket connection error: ${msg} (readyState: ${readyState})`);
            } else {
              console.warn(`[WS] Socket connection event (readyState: ${readyState})`);
            }
            this.isConnecting = false;
            this.connectPromise = null;
            this.notifyConnectionState(false);
            if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
              this.socket.close();
            }
            resolve();
          };
        } catch (err) {
          this.isConnecting = false;
          this.connectPromise = null;
          console.error('[WS] Connection failed:', err);
          resolve();
        }
      });
    })().catch((err) => {
      this.isConnecting = false;
      this.connectPromise = null;
      console.error('[WS] connectPromise error:', err);
    });

    return this.connectPromise;
  }

  public forceReconnect(): Promise<void> {
    this.isSessionTakenOver = false;
    this.userExplicitlyLeft = false;
    if (this.socket) {
      try {
        this.socket.close(1000, 'Force reconnect requested');
      } catch (e) {
        // ignore
      }
      this.socket = null;
    }
    return this.connect(true);
  }

  private scheduleReconnect(): void {
    if (this.isSessionTakenOver) return;
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => {
      if (this.userExplicitlyLeft || this.isSessionTakenOver) return;
      this.connect().then(() => {
        const currentActiveRoom = this.activeRoomCode || localStorage.getItem('njambo_active_room_code');
        if (!this.userExplicitlyLeft && currentActiveRoom && this.socket && this.socket.readyState === WebSocket.OPEN) {
          const playerId = this.getLocalPlayerId();
          const playerName = localStorage.getItem('njambo_player_name') || '';
          this.send({
            type: 'JOIN_ROOM',
            roomCode: currentActiveRoom,
            playerId,
            playerName,
          });
        }
      });
    }, 1200);
  }

  public setPresenceStatus(status: 'ONLINE_IDLE' | 'IN_SOLO' | 'IN_LOBBY' | 'IN_GAME' | 'OFFLINE'): void {
    this.currentPresenceStatus = status;
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      const playerId = this.getLocalPlayerId();
      const playerName = localStorage.getItem('njambo_player_name') || '';
      const avatarSeed = localStorage.getItem('njambo_avatar_seed') || '';
      const statusPresence = this.activeRoomCode
        ? (this.currentRoom?.status === 'PLAYING' ? 'IN_GAME' : 'IN_LOBBY')
        : this.currentPresenceStatus;

      this.send({
        type: 'HEARTBEAT_PRESENCE',
        playerId,
        playerName,
        avatarSeed,
        roomCode: this.activeRoomCode || undefined,
        statusPresence,
      });
    }
  }

  /**
   * Envoie l'état de présence (au premier plan / en arrière-plan). Appelé toutes les 25 s ET
   * immédiatement à chaque changement de visibilité : le serveur sait ainsi tout de suite s'il
   * doit envoyer une notification push ou si le joueur regarde déjà la table.
   */
  public sendPresence(withPing: boolean = false): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    const playerId = this.getLocalPlayerId();
    const playerName = localStorage.getItem('njambo_player_name') || '';
    const avatarSeed = localStorage.getItem('njambo_avatar_seed') || '';
    const statusPresence = this.activeRoomCode
      ? (this.currentRoom?.status === 'PLAYING' ? 'IN_GAME' : 'IN_LOBBY')
      : this.currentPresenceStatus;

    const isAway = typeof document !== 'undefined' ? document.hidden : false;

    this.send({
      type: 'HEARTBEAT_PRESENCE',
      playerId,
      playerName,
      avatarSeed,
      roomCode: this.activeRoomCode || undefined,
      statusPresence,
      isAway,
    } as any);

    if (withPing) {
      // Ping périodique pour la synchronisation d'horloge et la latence
      this.lastPingSentAt = Date.now();
      this.send({
        type: 'PING',
        playerId,
        timestamp: this.lastPingSentAt,
      } as any);
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    // 25s client heartbeat (harmonized with server RFC-6455 20s transport ping/pong to save battery)
    this.pingInterval = setInterval(() => {
      this.sendPresence(true);
    }, 25000);
  }

  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  public handleServerMessage(msg: ServerMessage): void {
    if (msg.timestamp) {
      const rtt = msg.type === 'PONG' && this.lastPingSentAt > 0 ? Math.max(0, Date.now() - this.lastPingSentAt) : 0;
      if (msg.type === 'PONG' && this.lastPingSentAt > 0) {
        this.lastPingLatencyMs = rtt;
      }
      this.updateServerTime(msg.timestamp, rtt);
    }
    if (msg.room?.serverTimestamp) {
      this.updateServerTime(msg.room.serverTimestamp, 0);
    }

    if (msg.isProtocolCompatible !== undefined || msg.updateRecommended !== undefined) {
      this.versionStatusListeners.forEach((l) =>
        l({
          isProtocolCompatible: msg.isProtocolCompatible !== false,
          updateRecommended: !!msg.updateRecommended,
          serverVersion: msg.serverVersion,
          protocolVersion: msg.protocolVersion,
          incompatibilityReason: msg.incompatibilityReason,
        })
      );
    }

    switch (msg.type) {
      case 'SESSION_READY': {
        noteServerConfigVersion(msg.configVersion);
        const inTable = Boolean(this.activeRoomCode || this.currentRoom);
        const currentLocalId = getPlayerId();
        const serverAssignedId = msg.playerId;
        const currentUser = auth.currentUser;
        const isGoogleUser = Boolean(currentUser && !currentUser.isAnonymous);

        const isGoogleOrNonGuest = isGoogleUser || !currentLocalId.startsWith('usr_');
        if ((msg.provisional && isGoogleOrNonGuest) || (isGoogleUser && serverAssignedId && serverAssignedId.startsWith('usr_'))) {
          console.log(`[WS] Ignoring provisional SESSION_READY identity '${serverAssignedId}'. Keeping local identity '${currentLocalId}'.`);
          this.checkSessionRestored();
          break;
        }

        if (serverAssignedId && serverAssignedId !== currentLocalId) {
          if (!inTable) {
            console.warn(`[WS] Server assigned new identity '${serverAssignedId}' (previous: '${currentLocalId}'). Adopting new identity.`);
            this.lastConnectedPlayerId = serverAssignedId;
            setLocalPlayerId(serverAssignedId);
            if (msg.reconnectToken) {
              this.setReconnectToken(msg.reconnectToken);
            }
          } else {
            console.warn(`[WS] Server forced identity change while in table (new: '${serverAssignedId}', previous: '${currentLocalId}'). Closing table cleanly.`);
            this.activeRoomCode = null;
            this.sessionRoomPlayerId = null;
            this.lastAcceptedState = null;
            setInRoomStatus(false);
            this.currentRoom = null;
            try {
              localStorage.removeItem('njambo_active_room_code');
            } catch (e) {
              // ignore
            }
            this.notifyRoomUpdate(null);
            this.notifyError(
              'Votre session a été réinitialisée par le serveur. Veuillez rejoindre la table à nouveau.',
              'SESSION_RESET'
            );
            this.lastConnectedPlayerId = serverAssignedId;
            setLocalPlayerId(serverAssignedId);
            if (msg.reconnectToken) {
              this.setReconnectToken(msg.reconnectToken);
            }
          }
        } else {
          if (serverAssignedId) {
            this.lastConnectedPlayerId = serverAssignedId;
          }
          if (msg.reconnectToken) {
            this.setReconnectToken(msg.reconnectToken);
          }
        }
        this.checkSessionRestored();
        break;
      }

      case 'AUTH_CONFIRMED': {
        this.authConfirmedOnThisSocket = true;
        if (msg.playerId) {
          this.lastConnectedPlayerId = msg.playerId;
        }
        if (msg.reconnectToken) {
          this.setReconnectToken(msg.reconnectToken);
        }
        // Drain any messages queued while waiting for auth confirmation on this socket
        if (this.pendingAuthMessages.length > 0) {
          const toSend = [...this.pendingAuthMessages];
          this.pendingAuthMessages = [];
          for (const raw of toSend) {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
              this.socket.send(raw);
            } else {
              this.pendingMessages.push(raw);
            }
          }
        }
        this.checkSessionRestored();
        break;
      }

      case 'ROOM_JOINED':
      case 'SYNC_STATE':
        if (msg.type === 'ROOM_JOINED' && this.pendingJoinCancelled) {
          console.log('[WS] ROOM_JOINED arrived after cancellation: sending LEAVE_ROOM');
          this.pendingJoinCancelled = false;
          const roomCodeToLeave = msg.room?.id || this.activeRoomCode;
          if (roomCodeToLeave) {
            this.send({
              type: 'LEAVE_ROOM',
              roomCode: roomCodeToLeave,
              playerId: msg.playerId || this.getLocalPlayerId(),
            });
          }
          this.activeRoomCode = null;
          this.sessionRoomPlayerId = null;
          this.lastAcceptedState = null;
          this.currentRoom = null;
          setInRoomStatus(false);
          try {
            localStorage.removeItem('njambo_active_room_code');
            localStorage.removeItem('njambo_reconnect_token');
            sessionStorage.removeItem('njambo_reconnect_token');
          } catch (e) {
            // ignore
          }
          return;
        }

        this.hasAttemptedAuthRetry = false;
        if (msg.playerId) {
          const canonicalId = getPlayerId();
          if (msg.playerId !== canonicalId) {
            this.sessionRoomPlayerId = msg.playerId;
          } else {
            this.sessionRoomPlayerId = null;
          }
        }
        if (msg.reconnectToken) {
          this.setReconnectToken(msg.reconnectToken);
        }
        if (msg.room) {
          const incomingRoom = msg.room;
          const incomingEpoch = incomingRoom.epoch || 0;
          const incomingRev = incomingRoom.rev || 0;

          // Stale state rejection for SYNC_STATE:
          // Ignore if same room, same server epoch, and incoming revision is <= last accepted revision
          if (msg.type === 'SYNC_STATE' && this.lastAcceptedState) {
            if (
              this.lastAcceptedState.roomId === incomingRoom.id &&
              this.lastAcceptedState.epoch === incomingEpoch &&
              incomingRev <= this.lastAcceptedState.rev
            ) {
              console.debug(
                `[WS] Stale SYNC_STATE ignored for room ${incomingRoom.id} (rev: ${incomingRev} <= lastAccepted: ${this.lastAcceptedState.rev}, epoch: ${incomingEpoch})`
              );
              return;
            }
          }

          // Always accept ROOM_JOINED, newer SYNC_STATE, or state from a new room / new epoch
          this.lastAcceptedState = {
            roomId: incomingRoom.id,
            epoch: incomingEpoch,
            rev: incomingRev,
          };

          this.currentRoom = incomingRoom;
          this.activeRoomCode = incomingRoom.id;
          setInRoomStatus(true);
          try {
            localStorage.setItem('njambo_active_room_code', incomingRoom.id);
          } catch (e) {
            // ignore
          }
          this.notifyRoomUpdate(incomingRoom);
        }

        // Flush any queued room-bound messages now that room connection is fully confirmed
        if (this.pendingInRoomMessages.length > 0 && this.socket && this.socket.readyState === WebSocket.OPEN) {
          while (this.pendingInRoomMessages.length > 0) {
            const raw = this.pendingInRoomMessages.shift();
            if (raw) {
              this.socket.send(raw);
            }
          }
        }
        this.roomSyncedOnThisSocket = true;
        this.checkSessionRestored();
        break;

      case 'ERROR': {
        const errorCode = msg.errorCode || 'GENERIC';
        let isFirstRepair = false;

        if (errorCode === 'AUTH_REQUIRED') {
          const currentUser = auth.currentUser;
          const isGoogleAuthUser = Boolean(currentUser && !currentUser.isAnonymous);
          const shouldAutoRepair =
            Boolean(msg.expectedPlayerId) &&
            isGoogleAuthUser &&
            msg.expectedPlayerId === currentUser!.uid &&
            getPlayerId() !== msg.expectedPlayerId;

          if (shouldAutoRepair && msg.expectedPlayerId) {
            console.warn(`[WS Auto-repair] Server expectedPlayerId '${msg.expectedPlayerId}' matches Google UID. Realigning identity.`);
            setLocalPlayerId(msg.expectedPlayerId);
            this.sessionRoomPlayerId = null;
            if (!this.hasAttemptedAuthRetry) {
              isFirstRepair = true;
            }
          }

          if (!this.hasAttemptedAuthRetry) {
            this.hasAttemptedAuthRetry = true;
            console.warn('[WS] Server returned AUTH_REQUIRED: attempting one-time reconnection with AUTH.');
            if (this.socket) {
              try {
                this.socket.close(1000, 'AUTH_REQUIRED retry');
              } catch (e) {
                // ignore
              }
            }
            this.connect();
          }
        } else if (errorCode === 'ROOM_NOT_FOUND') {
          this.wasDisconnected = false;
          this.activeRoomCode = null;
          this.sessionRoomPlayerId = null;
          this.lastAcceptedState = null;
          setInRoomStatus(false);
          this.currentRoom = null;
          try {
            localStorage.removeItem('njambo_active_room_code');
          } catch (e) {
            // ignore
          }
          this.notifyRoomUpdate(null);
        }

        if (msg.error) {
          this.lastServerError = {
            code: errorCode,
            message: msg.error,
            timestamp: Date.now(),
          };
          if (!isFirstRepair) {
            this.notifyError(msg.error, errorCode, msg.activeGameRoomCode);
          }
        }
        break;
      }

      case 'EMOTE':
        if (msg.emote) {
          this.notifyEmote(msg.emote);
        }
        break;

      case 'PARTIE_RESULTS':
        if (msg.partieResults) {
          this.partieResultsListeners.forEach((l) => l(msg.partieResults!));
        }
        break;

      case 'LOBBY_ALERT':
        if (msg.alertMessage) {
          this.notifyLobbyAlert(msg.alertMessage);
        }
        break;

      case 'NOTIFICATION':
        // Messages d'information du serveur (avertissement de forfait, invitation transmise…)
        // jusqu'ici ignorés par le client.
        if (msg.notification) {
          this.serverNotificationListeners.forEach((l) => l(msg.notification!));
        }
        break;

      case 'ADMIN_MESSAGE':
        if (msg.adminMessage) {
          this.adminMessageListeners.forEach((l) => l(msg.adminMessage!));
        }
        break;

      case 'PUBLIC_ROOMS_UPDATE':
        if (msg.publicRooms) {
          this.publicRoomsListeners.forEach((l) => l(msg.publicRooms!));
        }
        break;

      case 'DIRECT_INVITE_RECEIVED':
        if (msg.invitation) {
          this.directInviteListeners.forEach((l) => l(msg.invitation!));
        }
        break;

      case 'INVITE_FEEDBACK':
        if (msg.inviteFeedback) {
          this.inviteFeedbackListeners.forEach((l) => l(msg.inviteFeedback!));
        }
        break;

      case 'FRIENDS_PRESENCE_UPDATE':
        if (msg.presences) {
          this.friendsPresenceListeners.forEach((l) => l(msg.presences!));
        }
        break;

      case 'QUICK_MATCH_RESULT':
        if (msg.matchedRoomCode) {
          this.quickMatchResultListeners.forEach((l) => l(msg.matchedRoomCode!));
        }
        break;

      default:
        break;
    }
  }

  public async createRoom(
    hostName: string,
    settings: {
      fillWithBots: boolean;
      maxPlayers: number;
      baseBet: number;
      initialCapital: number;
      enableDoubleKora: boolean;
      enableUnder21: boolean;
      turnTimerSeconds?: number;
      isPublic?: boolean;
    },
    confirmLeaveCurrent?: boolean
  ): Promise<void> {
    await this.connect();
    const playerId = this.getLocalPlayerId();

    const activeSanction = playerProfileService.getActiveSanction();

    this.pendingJoinCancelled = false;
    this.userExplicitlyLeft = false;
    this.lastAcceptedState = null;
    this.send({
      type: 'CREATE_ROOM',
      playerId,
      playerName: hostName,
      confirmLeaveCurrent,
      fairPlaySanction: activeSanction ? {
        type: activeSanction.type,
        reason: activeSanction.reason,
        expiresAt: activeSanction.expiresAt,
        active: activeSanction.active,
      } : undefined,
      settings,
    });
  }

  public async joinRoom(roomCode: string, playerName: string, confirmLeaveCurrent?: boolean): Promise<void> {
    await this.connect();
    this.pendingJoinCancelled = false;
    this.userExplicitlyLeft = false;
    const upperCode = roomCode.toUpperCase();
    if (this.lastAcceptedState && this.lastAcceptedState.roomId !== upperCode) {
      this.lastAcceptedState = null;
    }
    this.activeRoomCode = upperCode;
    setInRoomStatus(true);
    const playerId = this.getLocalPlayerId();
    try {
      localStorage.setItem('njambo_active_room_code', this.activeRoomCode);
    } catch (e) {
      // ignore
    }

    const activeSanction = playerProfileService.getActiveSanction();

    this.send({
      type: 'JOIN_ROOM',
      roomCode: this.activeRoomCode,
      playerId,
      playerName,
      confirmLeaveCurrent,
      fairPlaySanction: activeSanction ? {
        type: activeSanction.type,
        reason: activeSanction.reason,
        expiresAt: activeSanction.expiresAt,
        active: activeSanction.active,
      } : undefined,
    });
  }

  public setReady(isReady: boolean): void {
    if (!this.activeRoomCode) return;
    const playerId = this.getLocalPlayerId();
    this.send({
      type: 'SET_READY',
      roomCode: this.activeRoomCode,
      playerId,
      isReady,
    });
  }

  public startGame(): void {
    const roomCode = this.activeRoomCode || this.currentRoom?.id || localStorage.getItem('njambo_active_room_code') || '';
    if (!roomCode) {
      console.warn('[WS] Cannot start game: no active room code found');
      return;
    }
    this.activeRoomCode = roomCode;
    setInRoomStatus(true);
    const playerId = this.getLocalPlayerId();
    this.send({
      type: 'START_GAME',
      roomCode,
      playerId,
    });
  }

  public playCard(cardId: string): void {
    if (!this.activeRoomCode) return;
    const playerId = this.getLocalPlayerId();
    this.send({
      type: 'PLAY_CARD',
      roomCode: this.activeRoomCode,
      playerId,
      cardId,
    });
  }

  public readyForNextPartie(): void {
    if (!this.activeRoomCode) return;
    const playerId = this.getLocalPlayerId();
    this.send({
      type: 'READY_NEXT_PARTIE',
      roomCode: this.activeRoomCode,
      playerId,
    });
  }

  public forceNextPartie(): void {
    if (!this.activeRoomCode) return;
    const playerId = this.getLocalPlayerId();
    this.send({
      type: 'FORCE_NEXT_PARTIE',
      roomCode: this.activeRoomCode,
      playerId,
    });
  }

  public updateRoomSettings(settings: Partial<MultiplayerRoom>): void {
    if (!this.activeRoomCode) return;
    const playerId = this.getLocalPlayerId();
    this.send({
      type: 'UPDATE_SETTINGS',
      roomCode: this.activeRoomCode,
      playerId,
      settings: {
        fillWithBots: settings.fillWithBots ?? true,
        maxPlayers: settings.maxPlayers ?? 4,
        baseBet: settings.baseBet ?? 10,
        initialCapital: settings.initialCapital ?? 100,
        enableDoubleKora: settings.enableDoubleKora ?? true,
        enableUnder21: settings.enableUnder21 ?? true,
        turnTimerSeconds: settings.turnTimerSeconds,
      },
    });
  }

  public kickPlayer(targetPlayerId: string): void {
    if (!this.activeRoomCode) return;
    const playerId = this.getLocalPlayerId();
    if (!playerId) return;
    this.send({ type: 'KICK_PLAYER', roomCode: this.activeRoomCode, playerId, targetPlayerId });
  }

  public alertUnreadyPlayers(): void {
    if (!this.activeRoomCode) return;
    const playerId = this.getLocalPlayerId();
    this.send({
      type: 'ALERT_UNREADY_PLAYERS',
      roomCode: this.activeRoomCode,
      playerId,
    });
  }

  public claimHost(): void {
    if (!this.activeRoomCode) return;
    const playerId = this.getLocalPlayerId();
    this.send({
      type: 'CLAIM_HOST',
      roomCode: this.activeRoomCode,
      playerId,
    });
  }

  public voteBots(): void {
    if (!this.activeRoomCode) return;
    const playerId = this.getLocalPlayerId();
    this.send({
      type: 'VOTE_BOTS',
      roomCode: this.activeRoomCode,
      playerId,
    });
  }

  public sendEmote(text: string, emoji?: string): void {
    if (!this.activeRoomCode) return;
    const playerId = this.getLocalPlayerId();
    this.send({
      type: 'SEND_EMOTE',
      roomCode: this.activeRoomCode,
      playerId,
      text,
      emoji,
    });
  }

  public foldRound(): void {
    if (!this.activeRoomCode) return;
    const playerId = this.getLocalPlayerId();
    this.send({
      type: 'FOLD_ROUND',
      roomCode: this.activeRoomCode,
      playerId,
    });
  }

  public claimForfeitVictory(): void {
    if (!this.activeRoomCode) return;
    const playerId = this.getLocalPlayerId();
    this.send({
      type: 'CLAIM_FORFEIT_VICTORY',
      roomCode: this.activeRoomCode,
      playerId,
    });
  }

  public triggerKoraHunterAlert(): void {
    if (!this.activeRoomCode) return;
    const playerId = this.getLocalPlayerId();
    this.send({
      type: 'KORA_HUNTER_ALERT',
      roomCode: this.activeRoomCode,
      playerId,
    });
  }

  public dismissKoraHunterAlert(): void {
    if (!this.activeRoomCode) return;
    const playerId = this.getLocalPlayerId();
    this.send({
      type: 'DISMISS_KORA_ALERT',
      roomCode: this.activeRoomCode,
      playerId,
    });
  }

  public proposeBetIncrease(proposedBet: number): void {
    if (!this.activeRoomCode) return;
    const playerId = this.getLocalPlayerId();
    this.send({
      type: 'PROPOSE_BET_INCREASE',
      roomCode: this.activeRoomCode,
      playerId,
      proposedBet,
    });
  }

  public respondBetIncrease(agree: boolean): void {
    if (!this.activeRoomCode) return;
    const playerId = this.getLocalPlayerId();
    this.send({
      type: 'RESPOND_BET_INCREASE',
      roomCode: this.activeRoomCode,
      playerId,
      agree,
    });
  }

  public cancelBetIncrease(): void {
    if (!this.activeRoomCode) return;
    const playerId = this.getLocalPlayerId();
    this.send({
      type: 'CANCEL_BET_INCREASE',
      roomCode: this.activeRoomCode,
      playerId,
    });
  }

  public requestIntegration(): void {
    if (!this.activeRoomCode) return;
    const playerId = this.getLocalPlayerId();
    const playerName = localStorage.getItem('njambo_player_name') || 'Joueur';
    const avatarSeed = localStorage.getItem('njambo_avatar_seed') || 'avatar_1';
    this.send({
      type: 'REQUEST_INTEGRATION',
      roomCode: this.activeRoomCode,
      playerId,
      playerName,
      avatarSeed,
    });
  }

  public respondIntegrationVote(agree: boolean): void {
    if (!this.activeRoomCode) return;
    const playerId = this.getLocalPlayerId();
    this.send({
      type: 'RESPOND_INTEGRATION_VOTE',
      roomCode: this.activeRoomCode,
      playerId,
      agree,
    });
  }

  public proposeCapacityExtension(): void {
    if (!this.activeRoomCode) return;
    const playerId = this.getLocalPlayerId();
    this.send({
      type: 'PROPOSE_CAPACITY_EXTENSION',
      roomCode: this.activeRoomCode,
      playerId,
    });
  }

  public respondCapacityExtension(agree: boolean): void {
    if (!this.activeRoomCode) return;
    const playerId = this.getLocalPlayerId();
    this.send({
      type: 'RESPOND_CAPACITY_EXTENSION',
      roomCode: this.activeRoomCode,
      playerId,
      agree,
    });
  }

  public proposeEarlyClose(): void {
    if (!this.activeRoomCode) return;
    const playerId = this.getLocalPlayerId();
    this.send({
      type: 'PROPOSE_EARLY_CLOSE',
      roomCode: this.activeRoomCode,
      playerId,
    });
  }

  public respondEarlyClose(agree: boolean): void {
    if (!this.activeRoomCode) return;
    const playerId = this.getLocalPlayerId();
    this.send({
      type: 'RESPOND_EARLY_CLOSE',
      roomCode: this.activeRoomCode,
      playerId,
      agree,
    });
  }

  public leaveRoom(): void {
    this.userExplicitlyLeft = true;
    if (this.activeRoomCode) {
      const playerId = this.getLocalPlayerId();
      this.send({
        type: 'LEAVE_ROOM',
        roomCode: this.activeRoomCode,
        playerId,
      });
      this.activeRoomCode = null;
      this.sessionRoomPlayerId = null;
      this.lastAcceptedState = null;
      setInRoomStatus(false);
      this.currentRoom = null;
      try {
        localStorage.removeItem('njambo_active_room_code');
        localStorage.removeItem('njambo_reconnect_token');
        sessionStorage.removeItem('njambo_reconnect_token');
      } catch (e) {
        // ignore
      }
      this.notifyRoomUpdate(null);
    }
  }

  public cancelPendingJoin(): void {
    this.pendingJoinCancelled = true;

    // Retire de la file les messages JOIN_ROOM, CREATE_ROOM et QUICK_MATCH_REQUEST en attente
    const isJoinOrCreate = (raw: string) => {
      try {
        const parsed = JSON.parse(raw);
        return (
          parsed.type === 'JOIN_ROOM' ||
          parsed.type === 'CREATE_ROOM' ||
          parsed.type === 'QUICK_MATCH_REQUEST'
        );
      } catch {
        return false;
      }
    };

    this.pendingMessages = this.pendingMessages.filter((msg) => !isJoinOrCreate(msg));
    this.pendingInRoomMessages = this.pendingInRoomMessages.filter((msg) => !isJoinOrCreate(msg));

    // Remet activeRoomCode à null s'il n'y a pas de salle confirmée, supprime njambo_active_room_code du stockage et appelle setInRoomStatus(false)
    if (!this.currentRoom) {
      this.activeRoomCode = null;
      this.sessionRoomPlayerId = null;
      this.lastAcceptedState = null;
      try {
        localStorage.removeItem('njambo_active_room_code');
      } catch (e) {
        // ignore
      }
      setInRoomStatus(false);
    }
  }

  public ackPartieResults(resultIds: string[]): void {
    const playerId = this.getLocalPlayerId();
    this.send({
      type: 'ACK_PARTIE_RESULTS',
      playerId,
      resultIds,
    } as any);
  }

  private send(msg: ClientMessage): void {
    if (msg.clientVersion === undefined) {
      msg.clientVersion = APP_VERSION;
    }
    if (msg.protocolVersion === undefined) {
      msg.protocolVersion = 3;
    }
    if (!msg.reconnectToken) {
      const token = this.getReconnectToken();
      if (token) {
        msg.reconnectToken = token;
      }
    }
    if (msg.isGuest === undefined) {
      msg.isGuest = !auth.currentUser || auth.currentUser.isAnonymous;
      if (!msg.isGuest) {
        msg.authProvider = 'google';
      }
    }

    // Attach timestamp for queue pruning and latency estimation
    if (!msg.timestamp) {
      msg.timestamp = Date.now();
    }

    const raw = JSON.stringify(msg);
    const requiresAuthGating = Boolean(auth.currentUser && !auth.currentUser.isAnonymous);

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      if (requiresAuthGating && !this.authConfirmedOnThisSocket && msg.type !== 'AUTH') {
        console.log(`[WS] Authenticated Google user: socket open but auth unconfirmed, queueing ${msg.type} in pendingAuthMessages`);
        if (this.pendingAuthMessages.length >= 50) {
          this.pendingAuthMessages.shift();
        }
        this.pendingAuthMessages.push(raw);
      } else {
        this.socket.send(raw);
      }
    } else {
      console.log(`[WS] Socket not open (readyState: ${this.socket ? this.socket.readyState : 'null'}), queueing message: ${msg.type}`);
      // Hard cap queue size to 50 to prevent unbounded memory growth
      if (this.pendingMessages.length >= 50) {
        this.pendingMessages.shift();
      }
      this.pendingMessages.push(raw);
      this.connect();
    }
  }

  public async requestPublicRooms(): Promise<void> {
    await this.connect();
    const playerId = this.getLocalPlayerId();
    this.send({
      type: 'GET_PUBLIC_ROOMS',
      playerId,
    });
  }

  public async quickMatch(settings?: { baseBet?: number; initialCapital?: number }, confirmLeaveCurrent?: boolean): Promise<void> {
    await this.connect();
    this.pendingJoinCancelled = false;
    const playerId = this.getLocalPlayerId();
    const playerName = localStorage.getItem('njambo_player_name') || 'Joueur';
    const avatarSeed = localStorage.getItem('njambo_avatar_seed') || 'avatar_1';

    const activeSanction = playerProfileService.getActiveSanction();

    this.send({
      type: 'QUICK_MATCH_REQUEST',
      playerId,
      playerName,
      avatarSeed,
      confirmLeaveCurrent,
      fairPlaySanction: activeSanction ? {
        type: activeSanction.type,
        reason: activeSanction.reason,
        expiresAt: activeSanction.expiresAt,
        active: activeSanction.active,
      } : undefined,
      settings: {
        fillWithBots: true,
        maxPlayers: 4,
        baseBet: settings?.baseBet || 10,
        initialCapital: settings?.initialCapital || 100,
        enableDoubleKora: true,
        enableUnder21: true,
        isPublic: true,
      },
    });
  }

  public async sendDirectInvite(targetPlayerId: string, roomCode: string): Promise<void> {
    await this.connect();
    const playerId = this.getLocalPlayerId();
    const playerName = localStorage.getItem('njambo_player_name') || 'Ami';
    const avatarSeed = localStorage.getItem('njambo_avatar_seed') || 'host';

    this.send({
      type: 'SEND_DIRECT_INVITE',
      playerId,
      playerName,
      avatarSeed,
      targetPlayerId,
      roomCode,
    });
  }

  public respondDirectInvite(inviteId: string, agree: boolean, confirmLeaveCurrent?: boolean): void {
    const playerId = this.getLocalPlayerId();
    const playerName = localStorage.getItem('njambo_player_name') || 'Joueur';
    const avatarSeed = localStorage.getItem('njambo_avatar_seed') || 'avatar_1';

    this.send({
      type: 'RESPOND_DIRECT_INVITE',
      playerId,
      playerName,
      avatarSeed,
      inviteId,
      agree,
      confirmLeaveCurrent,
    });
  }

  public isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  public getSocketReadyState(): number {
    return this.socket ? this.socket.readyState : WebSocket.CLOSED;
  }

  public getActiveRoomCode(): string | null {
    return this.activeRoomCode || this.currentRoom?.id || null;
  }

  public getLastPingLatencyMs(): number | null {
    return this.lastPingLatencyMs;
  }

  public getLastServerError(): { code: string; message: string; timestamp: number } | null {
    return this.lastServerError;
  }

  public triggerPing(): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.sendPresence(true);
    }
  }

  public onPublicRooms(listener: PublicRoomsListener): () => void {
    this.publicRoomsListeners.add(listener);
    return () => {
      this.publicRoomsListeners.delete(listener);
    };
  }

  public onDirectInvite(listener: DirectInviteListener): () => void {
    this.directInviteListeners.add(listener);
    return () => {
      this.directInviteListeners.delete(listener);
    };
  }

  public onInviteFeedback(listener: InviteFeedbackListener): () => void {
    this.inviteFeedbackListeners.add(listener);
    return () => {
      this.inviteFeedbackListeners.delete(listener);
    };
  }

  public getFriendsPresence(friendUserIds: string[]): void {
    if (!friendUserIds || friendUserIds.length === 0) return;
    const playerId = this.getLocalPlayerId();
    this.send({
      type: 'GET_FRIENDS_PRESENCE',
      playerId,
      friendUserIds,
    });
  }

  public onFriendsPresence(listener: FriendsPresenceListener): () => void {
    this.friendsPresenceListeners.add(listener);
    return () => {
      this.friendsPresenceListeners.delete(listener);
    };
  }

  public onQuickMatchResult(listener: QuickMatchResultListener): () => void {
    this.quickMatchResultListeners.add(listener);
    return () => {
      this.quickMatchResultListeners.delete(listener);
    };
  }

  public onRoomUpdate(listener: RoomUpdateListener): () => void {
    this.roomUpdateListeners.add(listener);
    if (this.currentRoom) {
      listener(this.currentRoom);
    }
    return () => {
      this.roomUpdateListeners.delete(listener);
    };
  }

  public onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  public onEmote(listener: EmoteListener): () => void {
    this.emoteListeners.add(listener);
    return () => {
      this.emoteListeners.delete(listener);
    };
  }

  public onPartieResults(listener: PartieResultsListener): () => void {
    this.partieResultsListeners.add(listener);
    return () => {
      this.partieResultsListeners.delete(listener);
    };
  }

  public onLobbyAlert(listener: LobbyAlertListener): () => void {
    this.lobbyAlertListeners.add(listener);
    return () => {
      this.lobbyAlertListeners.delete(listener);
    };
  }

  public onConnectionStateChange(listener: ConnectionStateListener): () => void {
    this.connectionStateListeners.add(listener);
    listener(this.isConnected());
    return () => {
      this.connectionStateListeners.delete(listener);
    };
  }

  public onServerNotification(listener: (text: string) => void): () => void {
    this.serverNotificationListeners.add(listener);
    return () => {
      this.serverNotificationListeners.delete(listener);
    };
  }

  public onAdminMessage(listener: AdminMessageListener): () => void {
    this.adminMessageListeners.add(listener);
    return () => {
      this.adminMessageListeners.delete(listener);
    };
  }

  public onVersionStatus(listener: VersionStatusListener): () => void {
    this.versionStatusListeners.add(listener);
    return () => {
      this.versionStatusListeners.delete(listener);
    };
  }

  public onOfflineQueueFlushed(listener: OfflineQueueListener): () => void {
    this.offlineQueueListeners.add(listener);
    return () => {
      this.offlineQueueListeners.delete(listener);
    };
  }

  private notifyConnectionState(connected: boolean): void {
    this.connectionStateListeners.forEach((l) => l(connected));
  }

  private notifyRoomUpdate(room: MultiplayerRoom | null): void {
    this.roomUpdateListeners.forEach((l) => l(room));
  }

  private notifyError(error: string, errorCode?: string, activeGameRoomCode?: string): void {
    this.errorListeners.forEach((l) => l(error, errorCode, activeGameRoomCode));
  }

  private notifyEmote(emote: EmoteMessage): void {
    this.emoteListeners.forEach((l) => l(emote));
  }

  private notifyLobbyAlert(message: string): void {
    this.lobbyAlertListeners.forEach((l) => l(message));
  }
}

export const wsService = new WebSocketService();
export const webSocketService = wsService;
export const getServerTime = () => wsService.getServerTime();
