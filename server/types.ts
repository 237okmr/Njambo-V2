import { OpenCashLevel, OpenTableEntry, Card, GameState, MultiplayerRoom, Player, RoomPlayer, RoomStatus, EmoteMessage, Suit, PartieWinType, PublicRoomSummary, GameInvitation, UserPresence, PartieResult } from '../src/types';

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
    | 'CASH_TABLE_OPEN'
    | 'CASH_TABLE_REBUY'
    | 'REQUEST_INTEGRATION'
    | 'RESPOND_INTEGRATION_VOTE'
    | 'PROPOSE_CAPACITY_EXTENSION'
    | 'RESPOND_CAPACITY_EXTENSION'
    | 'PROPOSE_EARLY_CLOSE'
    | 'RESPOND_EARLY_CLOSE'
    | 'GET_FRIENDS_PRESENCE'
    | 'GET_ONLINE_PLAYERS'
    | 'GET_PRESENCE_SETTINGS'
    | 'GET_OPEN_TABLES'
    | 'RESOLVE_OPEN_TABLE'
    | 'SET_PRESENCE_SETTINGS'
    | 'START_SEARCH'
    | 'STOP_SEARCH'
    | 'GET_SEARCH_CALLS'
    | 'REPLY_SEARCH'
    | 'GET_APPOINTMENTS'
    | 'CREATE_APPOINTMENT'
    | 'RESPOND_APPOINTMENT'
    | 'CANCEL_APPOINTMENT'
    | 'ACK_PARTIE_RESULTS';
  /** Rendez-vous : heure (ms), amis invités, ouverture aux alertes, identifiant et réponse. */
  startsAt?: number;
  inviteeIds?: string[];
  openToAlerts?: boolean;
  appointmentId?: string;
  answer?: 'YES' | 'NO';
  /** Mode de l'appel « je cherche une partie » (START_SEARCH). */
  searchMode?: 'FREE' | 'CASH';
  /** Liste demandée : tables gratuites ou niveaux Kora Cash. */
  openTablesMode?: 'FREE' | 'CASH';
  /** Référence opaque d'une table d'ami, reçue dans la liste. */
  tableRef?: string;
  /** Réglages de visibilité envoyés par le joueur (SET_PRESENCE_SETTINGS). */
  presenceSettings?: { hidden?: boolean; friendsOnlyInvites?: boolean; searchAlerts?: boolean };
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
  /** Entrée à une table Kora Cash : un salon public du niveau choisi, une table privée à créer, ou un code. */
  cashTable?: {
    betLevel?: number;
    capacity?: number;
    buyIn: number;
    isPublic?: boolean;
    roomCode?: string;
  };
  /** Recave à une table Kora Cash, en FCFA. */
  cashAmount?: number;
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
  | 'AUTH_TOKEN_INVALID'
  | 'RATE_LIMITED'
  | 'BANNED'
  | 'FORBIDDEN'
  | 'MAINTENANCE'
  | 'ACTIVE_GAME_IN_PROGRESS'
  | 'SEAT_TAKEN'
  | 'SELF_INVITE'
  | 'BLOCKED'
  | 'GENERIC';

export interface ServerMessage {
  type:
    | 'SESSION_READY'
    | 'CASH_WALLET_CHANGED'
    | 'AUTH_CONFIRMED'
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
    | 'ONLINE_PLAYERS_UPDATE'
    | 'PRESENCE_SETTINGS'
    | 'SEARCH_CALLS_UPDATE'
    | 'APPOINTMENTS_UPDATE'
    | 'OPEN_TABLES_UPDATE'
    | 'OPEN_TABLE_TARGET'
    | 'QUICK_MATCH_RESULT'
    | 'VERSION_HANDSHAKE'
    | 'PARTIE_RESULTS';
  errorCode?: ServerErrorCode;
  expectedPlayerId?: string;
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
  onlinePlayers?: Array<{ userId: string; displayName: string; avatarId: string; status: 'AVAILABLE' | 'IN_SOLO' | 'IN_LOBBY' | 'IN_GAME' }>;
  presenceSettings?: { hidden: boolean; friendsOnlyInvites: boolean; searchAlerts: boolean };
  /** Appels « je cherche une partie » visibles par ce joueur, et son propre appel avec ses « partants ». */
  searchCalls?: Array<{ userId: string; displayName: string; avatarId: string; mode: 'FREE' | 'CASH'; expiresAt: number; isFriend: boolean; canJoin: boolean }>;
  appointments?: Array<{ id: string; organizerId: string; organizerName: string; organizerAvatar: string; mode: 'FREE' | 'CASH'; startsAt: number; isMine: boolean; myAnswer: 'YES' | 'NO' | null; yes: Array<{ userId: string; displayName: string; avatarId: string }>; full: boolean }>;
  mySearch?: { mode: 'FREE' | 'CASH'; expiresAt: number; partants: Array<{ userId: string; displayName: string; avatarId: string }> } | null;
  openTables?: { mode: 'FREE'; tables: OpenTableEntry[] } | { mode: 'CASH'; levels: OpenCashLevel[] };
  partieResults?: PartieResult[];
  matchedRoomCode?: string;
  activeGameRoomCode?: string;
  provisional?: boolean;
  configVersion?: number;
  protocolVersion?: number;
  serverVersion?: string;
  updateRecommended?: boolean;
  isProtocolCompatible?: boolean;
  incompatibilityReason?: string;
  timestamp?: number;
}
