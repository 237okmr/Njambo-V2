export type Suit = 'COEUR' | 'CARREAU' | 'TREFLE' | 'PIQUE';

export interface SuitInfo {
  name: string; // 'Koubi', 'Zing', 'Tchaka', 'Black'
  symbol: string; // '♥', '♦', '♣', '♠'
  color: string; // 'text-rose-600', 'text-amber-500', 'text-emerald-700', 'text-slate-800'
  bgBadge: string;
  borderColor: string;
}

export const SUITS_INFO: Record<Suit, SuitInfo> = {
  COEUR: {
    name: 'Koubi',
    symbol: '♥',
    color: 'text-red-600',
    bgBadge: 'bg-red-50 text-red-700 border-red-200',
    borderColor: 'border-red-300',
  },
  CARREAU: {
    name: 'Zing',
    symbol: '♦',
    color: 'text-amber-600',
    bgBadge: 'bg-amber-50 text-amber-700 border-amber-200',
    borderColor: 'border-amber-300',
  },
  TREFLE: {
    name: 'Tchaka',
    symbol: '♣',
    color: 'text-emerald-700',
    bgBadge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    borderColor: 'border-emerald-300',
  },
  PIQUE: {
    name: 'Black',
    symbol: '♠',
    color: 'text-slate-900',
    bgBadge: 'bg-slate-100 text-slate-900 border-slate-300',
    borderColor: 'border-slate-300',
  },
};

export interface Card {
  id: string; // e.g. 'COEUR_10'
  suit: Suit;
  value: number; // 3 to 10 (or 3 to 9 for Spades)
  label: string; // e.g. "10 Koubi"
  shortLabel: string; // e.g. "10♥"
}

export type AIDifficulty = 'EASY' | 'NORMAL' | 'EXPERT' | 'GRAND_MASTER';

export interface AIDifficultyInfo {
  id: AIDifficulty;
  name: string;
  subtitle: string;
  description: string;
  icon: string;
  badgeBg: string;
}

export const AI_DIFFICULTIES_INFO: Record<AIDifficulty, AIDifficultyInfo> = {
  EASY: {
    id: 'EASY',
    name: 'Facile',
    subtitle: 'Initié',
    description: 'Adversaires d’initiation : heuristiques simples, sans suivi des cartes ni plan Kora, avec 25 % de coups aléatoires.',
    icon: '🌱',
    badgeBg: 'bg-emerald-900/60 text-emerald-300 border-emerald-700/60',
  },
  NORMAL: {
    id: 'NORMAL',
    name: 'Normal',
    subtitle: 'Stratège',
    description: 'Adversaires vigilants : heuristiques épurées, suivi des cartes maîtresses, protection des 10 sans erreurs volontaires.',
    icon: '⚔️',
    badgeBg: 'bg-amber-900/60 text-amber-300 border-amber-700/60',
  },
  EXPERT: {
    id: 'EXPERT',
    name: 'Expert',
    subtitle: 'Maître',
    description: 'Adversaires compétitifs : simulation de fins de donne en Monte Carlo léger, jeu mesuré et prudent sur le Kora, suivi des cartes et des vides adverses.',
    icon: '👑',
    badgeBg: 'bg-rose-900/60 text-rose-300 border-rose-700/60',
  },
  GRAND_MASTER: {
    id: 'GRAND_MASTER',
    name: 'Grand Katika',
    subtitle: 'Légende Infaillible',
    description: 'Adversaires d’élite : même qualité de calcul qu’Expert mais recherche activement le Kora et le Double Kora, rendant les pots plus risqués et spectaculaires.',
    icon: '⚡',
    badgeBg: 'bg-purple-900/60 text-purple-300 border-purple-700/60',
  },
};

export type AIStrategy =
  | 'CONSERVATIVE' // Prudent / Économie des maîtresses pour la main 5
  | 'TRICK_4_CONTROL' // Cible Main 4 / Prendre le contrôle de l'entame de la dernière main
  | 'PURGER' // Purgeur / Vidage des cartes faibles isolées (singletons)
  | 'AGGRESSIVE_LEADER' // Pression / Épuisement des 10 adverses
  | 'DYNAMIC' // Adaptatif selon le tirage de cartes
  | 'CARD_COUNTER' // Tacticeur / Calcul des probabilités et mémorisation
  | 'BLUFFER' // Caméléon / Masquage des cartes fortes
  | 'GATEKEEPER' // Gardien / Blocage du leader du tapis à la main 4
  | 'POSITIONAL_MASTER' // Maître de Position / Adaptation selon l'ordre de jeu
  | 'KORA_HUNTER' // Chasseur Kora / Tente de gagner le 5e pli avec un 3 pour réussir un Kora ou Double Kora
  | 'HOKUTO_ADAPTIVE'; // Maître Hokuto / S'adapte au style de jeu de l'adversaire manche après manche

export interface AIStrategyInfo {
  id: AIStrategy;
  name: string;
  description: string;
  icon: string;
  badgeBg: string;
}

export const AI_STRATEGIES_INFO: Record<AIStrategy, AIStrategyInfo> = {
  CONSERVATIVE: {
    id: 'CONSERVATIVE',
    name: 'Prudent',
    description: 'Conserve ses meilleures cartes pour la 5ème et dernière main.',
    icon: '🛡️',
    badgeBg: 'bg-blue-900/60 text-blue-300 border-blue-700/60',
  },
  TRICK_4_CONTROL: {
    id: 'TRICK_4_CONTROL',
    name: 'Cible Main 4',
    description: 'Cherche à gagner la 4ème main pour imposer son entame à la main 5.',
    icon: '🎯',
    badgeBg: 'bg-amber-900/60 text-amber-300 border-amber-700/60',
  },
  PURGER: {
    id: 'PURGER',
    name: 'Purgeur',
    description: 'Se débarrasse en priorité des cartes faibles isolées.',
    icon: '🧹',
    badgeBg: 'bg-emerald-900/60 text-emerald-300 border-emerald-700/60',
  },
  AGGRESSIVE_LEADER: {
    id: 'AGGRESSIVE_LEADER',
    name: 'Pression',
    description: 'Joue fort à l’entame pour faire tomber les 10 adverses.',
    icon: '⚡',
    badgeBg: 'bg-purple-900/60 text-purple-300 border-purple-700/60',
  },
  DYNAMIC: {
    id: 'DYNAMIC',
    name: 'Adaptatif',
    description: 'Ajuste sa stratégie au fil de la manche selon l’évolution du jeu.',
    icon: '🧠',
    badgeBg: 'bg-cyan-900/60 text-cyan-300 border-cyan-700/60',
  },
  CARD_COUNTER: {
    id: 'CARD_COUNTER',
    name: 'Tacticeur',
    description: 'Compte les cartes sorties et calcule la probabilité exacte de victoire.',
    icon: '🦊',
    badgeBg: 'bg-orange-900/60 text-orange-300 border-orange-700/60',
  },
  BLUFFER: {
    id: 'BLUFFER',
    name: 'Caméléon',
    description: 'Masque ses cartes maîtresses dans les premières mains pour surprendre.',
    icon: '🎭',
    badgeBg: 'bg-pink-900/60 text-pink-300 border-pink-700/60',
  },
  GATEKEEPER: {
    id: 'GATEKEEPER',
    name: 'Gardien',
    description: 'Cherche à bloquer le joueur en tête de table à la Main 4.',
    icon: '🧱',
    badgeBg: 'bg-rose-900/60 text-rose-300 border-rose-700/60',
  },
  POSITIONAL_MASTER: {
    id: 'POSITIONAL_MASTER',
    name: 'Maître de Position',
    description: 'Adapte ses cartes selon sa position d’entame ou de réponse dans la main.',
    icon: '⚖️',
    badgeBg: 'bg-indigo-900/60 text-indigo-300 border-indigo-700/60',
  },
  KORA_HUNTER: {
    id: 'KORA_HUNTER',
    name: 'Chasseur Kora',
    description: 'Conserve un 3 pour remporter le 5e pli et cherche l’entame au 4e pli pour réussir un Kora ou Double Kora.',
    icon: '👑',
    badgeBg: 'bg-yellow-900/60 text-yellow-300 border-yellow-700/60',
  },
  HOKUTO_ADAPTIVE: {
    id: 'HOKUTO_ADAPTIVE',
    name: 'Maître Hokuto',
    description: 'Analyse et s’adapte au style de jeu de l’adversaire humain manche après manche.',
    icon: '🥷',
    badgeBg: 'bg-red-950/80 text-red-300 border-red-600/80 ring-1 ring-red-500/50',
  },
};

export interface Player {
  id: string;
  name: string;
  score: number; // Cumulative capital chips
  capital: number; // Current chips in the Manche
  isEliminated: boolean; // True if capital < baseBet
  hand: Card[];
  isHuman: boolean;
  avatarSeed: string;
  tricksWonInRound: number;
  basePersonality?: AIStrategy; // Initial personality assigned randomly at round start
  aiStrategy?: AIStrategy; // Currently active strategy
  isForfeit?: boolean;
  isFoldedInRound?: boolean;
  disconnectGraceExpiresAt?: number | null;
  isAiRelay?: boolean;
  /** Siège tenu par le relais pour la partie en cours (joueur absent) : il ne peut pas remporter le pot. */
  relayAbsent?: boolean;
  connected?: boolean;
  isSpectator?: boolean;
  isPendingIntegration?: boolean;
  prorataCapital?: number;
  consecutiveMissedTurns?: number;
  aiRelayPlaysCount?: number;
  forfeitedForManche?: boolean; // siège gelé jusqu'à la fin de la manche
  leftRoom?: boolean; // le joueur a quitté volontairement la salle
}

export interface PlayedCard {
  card: Card;
  playerIndex: number;
  playerName: string;
  playerId?: string;
  isLeadCard: boolean;
  isMatchingSuit: boolean; // True if matches the requested lead suit
  isWinningSoFar: boolean; // True if this card is currently winning the trick
  playedOrder: number; // 1, 2, 3, 4
  isAutoPlayedByEmergencyBot?: boolean;
  autoPlaySeconds?: number;
}

export interface Trick {
  trickNumber: number; // 1 to 5
  leadSuit: Suit | null;
  leadPlayerIndex: number;
  leadPlayerName: string;
  plays: PlayedCard[];
  winnerIndex: number | null;
  winnerName: string | null;
  winningCard: Card | null;
  isComplete: boolean;
}

export type GamePhase =
  | 'SETUP'
  | 'DEALING'
  | 'PLAYING'
  | 'TRICK_RESOLVED'
  | 'PARTIE_OVER'
  | 'MANCHE_OVER';

export type PartieWinType = 'STANDARD' | 'KORA' | 'DOUBLE_KORA' | 'THREE_SEVENS' | 'UNDER_21' | 'FORFEIT';

export interface InstantWinReveal {
  winnerIndex: number;
  winnerName: string;
  winType: 'THREE_SEVENS' | 'UNDER_21';
  hand: Card[];
  scoreOrCount: number;
  expiresAt?: number;
}

export interface SavedManche {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  opponentCount: number;
  baseBet: number;
  initialCapital: number;
  enableDoubleKora?: boolean;
  enableUnder21?: boolean;
  aiDifficulty?: AIDifficulty;
  gameState: GameState;
}

export type GameSpeed = 1 | 1.5 | 2;

export interface EmoteMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  emoji?: string;
  timestamp: number;
  isBot?: boolean;
}

export interface CutEvent {
  cardId: string;
  cutterName: string;
  beatenCardValue: number;
  timestamp: number;
}

export interface GameState {
  phase: GamePhase;
  players: Player[];
  pot: number;
  dealParticipantIds?: string[]; // joueurs ayant payé leur mise à cette donne
  forfeitPenaltyPaid?: Record<string, number>; // pénalités de forfait payées à cette donne
  baseBet: number;
  initialBaseBet?: number;
  initialCapital: number;
  enableDoubleKora: boolean; // Option Manche: Activer ou désactiver la règle Double Kora (x4)
  enableUnder21: boolean; // Option Manche: Activer ou désactiver la règle "Moins de 21" (Somme <= 21)
  aiDifficulty?: AIDifficulty; // Niveau de difficulté de l'IA (EASY, NORMAL, EXPERT)
  showBotPersonalityIcons: boolean; // Option d'affichage: Afficher ou masquer l'icône de stratégie des bots
  enableKoraHunterAlerts: boolean; // Option Manche: Activer ou désactiver les alertes anonymes "Chasseur de Kora"
  dealerIndex: number;
  leadIndex: number;
  currentTurnIndex: number;
  currentTrickNumber: number; // 1 to 5
  currentTrick: Trick;
  tricksHistory: Trick[];
  partieWinnerIndex: number | null;
  partieWinnerName: string | null;
  partieWinType: PartieWinType | null; // STANDARD, KORA (x2), DOUBLE_KORA (x4), THREE_SEVENS
  cardsDealtCountByPlayer?: Record<number, number>; // Suivi de la distribution 3+2 par joueur (0, 3 ou 5 cartes)
  consecutiveThreesCountByPlayer: Record<number, number>; // Suivi des '3' consécutifs par joueur
  doubleKoraAchievedByPlayer: Record<number, boolean>; // Joueurs ayant réalisé 2x '3' d'affilée dans la partie
  mancheWinnerIndex: number | null;
  mancheWinnerName: string | null;
  // Backward compatibility alias:
  roundWinnerIndex: number | null;
  roundWinnerName: string | null;
  isThinkingAI: boolean;
  aiThinkingPlayerName: string | null;
  humanSelectedCardId: string | null;
  partieCount: number; // Compteur de Partie dans la Manche
  roundCount: number;
  mancheNumber?: number; // Numéro officiel de manche dans la session (identique pour toute la table)
  showKoraHunterAlert?: boolean; // True quand une alerte alerte "Chasseur de Kora" doit être affichée à l'écran
  koraHunterAlertShown?: boolean; // Evite de réafficher l'alerte plusieurs fois au cours d'une même partie
  gameSpeed?: GameSpeed;
  autoPlaySingleCard?: boolean;
  ambienceSoundEnabled?: boolean;
  lastCutEvent?: CutEvent | null;
  activeEmotes?: EmoteMessage[];
  turnStartedAt?: number;
  instantWinReveal?: InstantWinReveal | null;
  betIncreaseProposal?: BetIncreaseProposal | null;
  soloBetIncreaseMode?: SoloBetIncreaseMode;
}

export type SoloBetIncreaseMode = 'souverain' | 'tactique' | 'symetrique';

export type RoomStatus = 'LOBBY' | 'PLAYING' | 'PARTIE_OVER' | 'MANCHE_OVER';

export interface RoomPlayer {
  id: string; // unique player ID (e.g., random string per browser session)
  name: string;
  isHost: boolean;
  isHuman: boolean;
  avatarSeed: string;
  score: number;
  capital: number;
  isEliminated: boolean;
  isForfeit?: boolean;
  isFoldedInRound?: boolean;
  hand: Card[];
  tricksWonInRound: number;
  aiStrategy?: AIStrategy;
  isReady?: boolean;
  readyForNextPartie?: boolean; // True when player is ready for next round in EndRoundModal
  connected?: boolean;
  disconnectGraceExpiresAt?: number | null;
  isAiRelay?: boolean;
  /** Siège tenu par le relais pour la partie en cours (joueur absent) : il ne peut pas remporter le pot. */
  relayAbsent?: boolean;
  isAway?: boolean; // True when page/tab is backgrounded
  lastSeen?: number;
  isSpectator?: boolean;
  isPendingIntegration?: boolean;
  prorataCapital?: number;
  consecutiveMissedTurns?: number;
  aiRelayPlaysCount?: number;
  forfeitedForManche?: boolean; // siège gelé jusqu'à la fin de la manche
  leftRoom?: boolean; // le joueur a quitté volontairement la salle
}

export interface PreviousPartieSummary {
  partieCount: number;
  winnerName: string;
  winType: PartieWinType;
  potWon: number;
  winningCard?: Card;
  playersSummary: {
    id: string;
    name: string;
    deltaCapital: number;
    finalCapital: number;
  }[];
}

export interface PartieParticipantResult {
  playerId: string;
  name: string;
  isHuman: boolean;
  ante: number; // mise payée à cette donne
  penaltyPaid: number; // pénalités payées (Kora de fin de donne + forfait)
  gross: number; // montant reçu du pot (0 pour un perdant)
  net: number; // gross - ante - penaltyPaid
  tricksWon?: number;
}

export type PartieResultWinType = PartieWinType | 'EARLY_CLOSE';

export type PartieEndReason =
  | 'NORMAL'
  | 'INSTANT_WIN'
  | 'FOLD'
  | 'FORFEIT'
  | 'EARLY_CLOSE'
  | 'CLAIM'
  | 'THREE_SEVENS'
  | 'UNDER_21'
  | 'KORA'
  | 'DOUBLE_KORA'
  | 'TRICKS_COMPLETED'
  | 'RELAY_SPLIT'
  | 'FORFEIT_VICTORY'
  | 'FOLD_VICTORY';

export interface PartieResult {
  id: string; // `${roomId}_m${mancheNumber}_p${partieCount}`
  roomId: string;
  mancheNumber: number;
  partieCount: number;
  baseBet: number;
  winnerId: string | null;
  winType: PartieResultWinType;
  endReason: PartieEndReason;
  participants: PartieParticipantResult[];
  burned: number; // jetons détruits (0 dans le cas normal)
  mancheOver: boolean;
  createdAt: number;
}

export interface BetIncreaseProposal {
  id: string;
  proposedBet: number;
  proposerId: string;
  proposerName: string;
  agreedPlayerIds: string[]; // Player IDs who voted "Yes"
  createdAt: number;
  expiresAt?: number; // 15s expiration timestamp
  previousReadyStates?: Record<string, boolean>; // Ready states before proposal
}

export interface IntegrationProposal {
  id: string;
  applicantId: string;
  applicantName: string;
  applicantAvatar: string;
  prorataCapital: number;
  targetBotIdToReplace: string | null;
  targetBotNameToReplace?: string | null;
  agreedPlayerIds: string[]; // Human players who voted YES
  declinedPlayerIds: string[]; // Human players who voted NO
  createdAt: number;
  expiresAt: number; // e.g. 20s auto-expiry
  status: 'VOTING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
}

export interface CapacityExtensionProposal {
  id: string;
  proposerId: string;
  proposerName: string;
  newMaxPlayers: number;
  agreedPlayerIds: string[];
  declinedPlayerIds: string[];
  createdAt: number;
  status: 'VOTING' | 'ACCEPTED' | 'DECLINED';
}

export interface EarlyCloseProposal {
  id: string;
  proposerId: string;
  proposerName: string;
  agreedPlayerIds: string[];
  declinedPlayerIds: string[];
  createdAt: number;
}

export interface LocalContact {
  id: string; // Player ID (local usr_xxx or google uid)
  name: string;
  normalizedName?: string;
  avatarSeed: string;
  addedAt: number;
  lastPlayedAt?: number;
  isFavorite?: boolean;
  isBlocked?: boolean;
  status?: FriendStatus;
  friendCode?: string;
  notes?: string;
}

export type FriendStatus = 'ACCEPTED' | 'PENDING_SENT' | 'PENDING_RECEIVED' | 'DECLINED' | 'BLOCKED';

export interface FriendDocument {
  friendUid: string;
  displayName: string;
  avatarId: string;
  status: FriendStatus;
  createdAt: number;
  updatedAt: number;
  friendCode?: string;
}

export type PresenceStatus = 'ONLINE_IDLE' | 'IN_SOLO' | 'IN_LOBBY' | 'IN_GAME' | 'OFFLINE';

export interface UserPresence {
  userId: string;
  displayName: string;
  avatarId: string;
  status: PresenceStatus;
  currentRoomCode?: string | null;
  currentRoomSummary?: {
    maxPlayers: number;
    humanPlayersCount: number;
    botPlayersCount: number;
    hasReplaceableBot: boolean;
    baseBet: number;
    status: RoomStatus;
    opponentNames?: string[];
  } | null;
  lastSeenAt: number;
}

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';

export interface GameInvitation {
  id: string;
  fromUserId: string;
  fromUserName: string;
  fromUserAvatar: string;
  toUserId: string;
  roomCode: string;
  baseBet: number;
  initialCapital?: number;
  status: InvitationStatus;
  createdAt: number;
  expiresAt: number; // 2 minutes expiration
}

export interface PublicRoomSummary {
  id: string;
  hostId: string;
  hostName: string;
  hostAvatarSeed?: string;
  isPublic: boolean;
  status: RoomStatus;
  playersCount: number;
  humanPlayersCount?: number;
  botPlayersCount?: number;
  spectatorsCount?: number;
  hasReplaceableBot?: boolean;
  currentPartie?: number;
  prorataCapitalEstimate?: number;
  maxPlayers: number;
  fillWithBots: boolean;
  baseBet: number;
  initialCapital: number;
  turnTimerSeconds: number;
  enableDoubleKora: boolean;
  enableUnder21: boolean;
  hasFriendInside?: boolean;
  createdAt: number;
  lastSeenAt: number;
  hostAbsent?: boolean;
  hostAbsentUntil?: number;
  hostAbsentSince?: number;
}

export interface RoomFilters {
  betTier: 'ALL' | 'LOW' | 'MEDIUM' | 'HIGH';
  playerCount: 'ALL' | '2' | '3' | '4';
  ruleVariant: 'ALL' | 'STANDARD' | 'DOUBLE_KORA' | 'UNDER_21';
  onlyWithFriends?: boolean;
  searchQuery?: string;
}

export interface MultiplayerRoom {
  id: string; // e.g. "K8T4"
  hostId: string;
  originalHostId?: string;
  hostName: string;
  isPublic?: boolean;
  requireGoogleAuth?: boolean; // Optionnel : l'hôte peut exiger un compte Google
  status: RoomStatus;
  fillWithBots: boolean;
  maxPlayers: number; // 2, 3, or 4
  baseBet: number;
  initialBaseBet?: number;
  initialCapital: number;
  enableDoubleKora: boolean;
  enableUnder21: boolean;
  turnTimerSeconds?: number; // 10, 15, 20, 30, or 0 for unlimited
  disconnectGraceSeconds?: number; // 15, 30, 45, 60 (default 30)
  afkAction?: 'auto_play' | 'replace_bot';
  players: RoomPlayer[];
  playerIds?: string[];
  gameState: GameState | null;
  activeEmotes?: EmoteMessage[];
  roundEndAutoAdvanceAt?: number | null; // Timestamp for auto-advance countdown in EndRoundModal
  autoStartCountdownAt?: number | null; // Timestamp for auto-start in the lobby
  hostTransferGraceExpiresAt?: number | null; // Timestamp when host role will auto-transfer due to inactivity
  bannedPlayerIds?: string[]; // Player IDs kicked by host
  botVotes?: string[]; // Player IDs who voted to start with bots in lobby
  hostAbsentSince?: number;
  lastJoinPushTime?: number;
  joinPushCount?: number;
  betIncreaseProposal?: BetIncreaseProposal | null;
  integrationProposal?: IntegrationProposal | null;
  capacityExtensionProposal?: CapacityExtensionProposal | null;
  earlyCloseProposal?: EarlyCloseProposal | null;
  mancheNumber?: number; // Numéro de manche officiel (identique pour tous les joueurs de la table)
  manchePartiesPlayed?: number;
  lastBetIncreaseProposalPartie?: number;
  previousPartieSummary?: PreviousPartieSummary | null;
  instantWinReveal?: InstantWinReveal | null;
  allHumansAbsentSince?: number | null;
  createdAt: number;
  updatedAt: number;
  lastSeenAt?: number;
  actionSequence?: number; // Sequence ID to prevent race conditions
  serverTimestamp?: number; // Server-authoritative timestamp for clock sync and timers
  rev?: number;
  epoch?: number;
  version?: number;
  protocolVersion?: number;
  serverVersion?: string;
}

