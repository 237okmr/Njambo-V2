import { Card, GameState, MultiplayerRoom, Player, RoomPlayer, RoomStatus, EmoteMessage, Suit, PartieWinType, PublicRoomSummary, GameInvitation, UserPresence, PartieResult } from '../src/types';

export interface ClientMessage {
  type:
    | 'AUTH'
    | 'JOIN_ROOM'
    | 'CREATE_ROOM'
    | 'SET_READY'
    | 'START_GAME'
    | 'PLAY_CARD'
    | 'SEND_EMOTE'
    | 'READY_NEXT_PARTIE'
    | 'FORCE_NEXT_PARTIE'
    | 'LEAVE_ROOM'
    | 'FOLD_ROUND'
    | 'KORA_HUNTER_ALERT'
    | 'PING'
    | 'DISMISS_KORA_ALERT'
    | 'UPDATE_SETTINGS'
    | 'ALERT_UNREADY_PLAYERS'
    | 'CLAIM_HOST'
    | 'KICK_PLAYER'
    | 'VOTE_BOTS'
    | 'PROPOSE_BET_INCREASE'
    | 'RESPOND_BET_INCREASE'
    | 'CANCEL_BET_INCREASE'
    | 'CLAIM_FORFEIT_VICTORY'
    | 'GET_PUBLIC_ROOMS'
    | 'HEARTBEAT_PRESENCE'
    | 'SEND_DIRECT_INVITE'
    | 'RESPOND_DIRECT_INVITE'
    | 'QUICK_MATCH_REQUEST'
    | 'REQUEST_INTEGRATION'
    | 'RESPOND_INTEGRATION_VOTE'
    | 'PROPOSE_CAPACITY_EXTENSION'
    | 'RESPOND_CAPACITY_EXTENSION'
    | 'PROPOSE_EARLY_CLOSE'
    | 'RESPOND_EARLY_CLOSE'
    | 'GET_FRIENDS_PRESENCE'
    | 'ACK_PARTIE_RESULTS';
  roomCode?: string;
  resultIds?: string[];
  playerId: string;
  playerName?: string;
  idToken?: string;
  avatarSeed?: string;
  reconnectToken?: string;
  cardId?: string;
  isReady?: boolean;
  text?: string;
  emoji?: string;
  proposedBet?: number;
  agree?: boolean;
  targetPlayerId?: string;
  inviteId?: string;
  proposalId?: string;
  newMaxPlayers?: number;
  friendUserIds?: string[];
  statusPresence?: 'ONLINE_IDLE' | 'IN_SOLO' | 'IN_LOBBY' | 'IN_GAME' | 'OFFLINE';
  settings?: {
    fillWithBots: boolean;
    maxPlayers: number;
    baseBet: number;
    initialCapital: number;
    enableDoubleKora: boolean;
    enableUnder21: boolean;
    turnTimerSeconds?: number;
    disconnectGraceSeconds?: number;
    afkAction?: 'auto_play' | 'replace_bot';
    isPublic?: boolean;
    requireGoogleAuth?: boolean;
  };
  isGuest?: boolean;
  authProvider?: string;
  fairPlaySanction?: { type: string; reason: string; expiresAt: number | null; active: boolean };
  confirmLeaveCurrent?: boolean;
  clientVersion?: string;
  protocolVersion?: number;
  timestamp?: number;
}

export type ServerErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'TURN_EXPIRED'
  | 'VOTE_CLOSED'
  | 'INVITE_EXPIRED'
  | 'JOIN_REFUSED'
  | 'AUTH_REQUIRED'
  | 'AUTH_TIMEOUT'
  | 'RATE_LIMITED'
  | 'BANNED'
  | 'FORBIDDEN'
  | 'MAINTENANCE'
  | 'ACTIVE_GAME_IN_PROGRESS'
  | 'SEAT_TAKEN'
  | 'GENERIC';

export interface ServerMessage {
  type:
    | 'SESSION_READY'
    | 'SYNC_STATE'
    | 'ROOM_JOINED'
    | 'ERROR'
    | 'EMOTE'
    | 'PONG'
    | 'NOTIFICATION'
    | 'LOBBY_ALERT'
    | 'ADMIN_MESSAGE'
    | 'PUBLIC_ROOMS_UPDATE'
    | 'DIRECT_INVITE_RECEIVED'
    | 'INVITE_FEEDBACK'
    | 'PRESENCE_STATUS_CHANGED'
    | 'FRIENDS_PRESENCE_UPDATE'
    | 'QUICK_MATCH_RESULT'
    | 'VERSION_HANDSHAKE'
    | 'PARTIE_RESULTS';
  errorCode?: ServerErrorCode;
  room?: MultiplayerRoom;
  playerId?: string;
  reconnectToken?: string;
  error?: string;
  emote?: EmoteMessage;
  notification?: string;
  alertMessage?: string;
  adminMessage?: {
    senderName: string;
    text: string;
    isPrivate: boolean;
  };
  publicRooms?: PublicRoomSummary[];
  invitation?: GameInvitation;
  inviteFeedback?: {
    inviteId: string;
    agree: boolean;
    responderName: string;
    roomCode: string;
  };
  presence?: UserPresence;
  presences?: UserPresence[];
  partieResults?: PartieResult[];
  matchedRoomCode?: string;
  activeGameRoomCode?: string;
  protocolVersion?: number;
  serverVersion?: string;
  updateRecommended?: boolean;
  isProtocolCompatible?: boolean;
  incompatibilityReason?: string;
  timestamp?: number;
}
