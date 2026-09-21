export interface PlayerStats {
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  winRate: number; // percentage (0 to 100)
  partiesPlayed: number;
  partiesWon: number;
  manchesPlayed?: number;
  manchesWon?: number;
  soloManchesWon?: number;
  multiplayerManchesWon?: number;
  soloManchesWonEasy?: number;
  soloManchesWonNormal?: number;
  soloManchesWonHard?: number;
  soloGamesWonEasy?: number;
  soloGamesWonNormal?: number;
  soloGamesWonHard?: number;
  soloKorasEasy?: number;
  soloKorasNormal?: number;
  soloKorasHard?: number;
  soloDoubleKorasEasy?: number;
  soloDoubleKorasNormal?: number;
  soloDoubleKorasHard?: number;
  masteryScore?: number; // Score de Maîtrise
  koraCount: number;
  doubleKoraCount: number;
  under21Count: number;
  threeSevensCount: number;
  biggestPotWon: number;
  totalTricksWon: number;
  averageTricksPerGame: number;
  soloGamesPlayed: number;
  multiplayerGamesPlayed: number;
  soloGamesWon: number;
  multiplayerGamesWon: number;
  forfeitCount: number;
  foldCount: number;
  fortune: number; // Benefice net cumulé en mode Multijoueur
  multiplayerGains: number; // Total des gains de pot en multijoueur
  multiplayerPertes: number; // Total des pertes en multijoueur
  soloKoraCount: number;
  multiplayerKoraCount: number;
  soloDoubleKoraCount: number;
  multiplayerDoubleKoraCount: number;
  soloGains: number;
  soloPertes: number;
  soloFortune: number;
  soloWinRate: number;
  multiplayerWinRate: number;
  scoreVersion?: number;
}

export const DEFAULT_PLAYER_STATS: PlayerStats = {
  gamesPlayed: 0,
  gamesWon: 0,
  gamesLost: 0,
  winRate: 0,
  partiesPlayed: 0,
  partiesWon: 0,
  manchesPlayed: 0,
  manchesWon: 0,
  soloManchesWon: 0,
  multiplayerManchesWon: 0,
  soloManchesWonEasy: 0,
  soloManchesWonNormal: 0,
  soloManchesWonHard: 0,
  soloGamesWonEasy: 0,
  soloGamesWonNormal: 0,
  soloGamesWonHard: 0,
  soloKorasEasy: 0,
  soloKorasNormal: 0,
  soloKorasHard: 0,
  soloDoubleKorasEasy: 0,
  soloDoubleKorasNormal: 0,
  soloDoubleKorasHard: 0,
  masteryScore: 0,
  koraCount: 0,
  doubleKoraCount: 0,
  under21Count: 0,
  threeSevensCount: 0,
  biggestPotWon: 0,
  totalTricksWon: 0,
  averageTricksPerGame: 0,
  soloGamesPlayed: 0,
  multiplayerGamesPlayed: 0,
  soloGamesWon: 0,
  multiplayerGamesWon: 0,
  forfeitCount: 0,
  foldCount: 0,
  fortune: 0,
  multiplayerGains: 0,
  multiplayerPertes: 0,
  soloKoraCount: 0,
  multiplayerKoraCount: 0,
  soloDoubleKoraCount: 0,
  multiplayerDoubleKoraCount: 0,
  soloGains: 0,
  soloPertes: 0,
  soloFortune: 0,
  soloWinRate: 0,
  multiplayerWinRate: 0,
};

export type FairPlaySanctionType =
  | 'NONE'
  | 'WARNING'
  | 'RESTRICT_CREATE_ROOM'
  | 'RESTRICT_JOIN_PRIVATE'
  | 'TEMP_BAN'
  | 'PERM_BAN';

export interface FairPlaySanction {
  type: FairPlaySanctionType;
  reason: string;
  issuedAt: number;
  expiresAt: number | null; // null for permanent ban
  active: boolean;
}

export interface PlayerFairPlay {
  consecutiveForfeits: number;
  totalForfeits: number;
  totalFoldRounds: number;
  prolongedDisconnects: number;
  totalGamesStarted: number;
  disconnectRate: number; // e.g. 0.05 (5%)
  activeSanction: FairPlaySanction | null;
  sanctionsHistory: FairPlaySanction[];
}

export const DEFAULT_PLAYER_FAIR_PLAY: PlayerFairPlay = {
  consecutiveForfeits: 0,
  totalForfeits: 0,
  totalFoldRounds: 0,
  prolongedDisconnects: 0,
  totalGamesStarted: 0,
  disconnectRate: 0,
  activeSanction: null,
  sanctionsHistory: [],
};

export type AvatarOptionId =
  | 'google'
  | 'lion'
  | 'cheetah'
  | 'eagle'
  | 'ace'
  | 'diamond'
  | 'shield'
  | 'lightning'
  | 'star';

export interface AvatarOption {
  id: AvatarOptionId;
  name: string;
  emoji: string;
  bgGradient: string;
  borderClass: string;
  iconName?: string;
  description: string;
}

export interface HonorificTitle {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  colorClass: string;
  glowClass: string;
  borderClass: string;
  description: string;
  requirements: {
    minGames?: number;
    minWins?: number;
    minKoras?: number;
    minDoubleKoras?: number;
    minPotWon?: number;
  };
}

export interface PlayerProfile {
  uid: string;
  displayName: string;
  email: string | null;
  photoURL: string | null;
  avatarId: AvatarOptionId;
  isGuest: boolean;
  authProvider?: 'google.com' | null;
  chips: number; // Persistent wallet / token balance (default: 1000 for guests and new accounts)
  stats: PlayerStats;
  scoreVersion?: number;
  chipsFixVersion?: number;
  fortuneFixVersion?: number;
  soloDaily?: { day: number; points: number };
  statsLegacyBackup?: PlayerStats;
  fairPlay?: PlayerFairPlay;
  honorificTitleId: string;
  guestMergedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface PlayerOpponentSummary {
  id: string;
  name: string;
  isHuman: boolean;
  delta?: number;
}

export interface PlayerGameHistoryItem {
  id: string;
  recordType?: 'PARTIE' | 'MANCHE';
  isMancheFinalWin?: boolean;
  isMancheOver?: boolean;
  mode: 'SOLO' | 'MULTIPLAYER';
  playerCount: number;
  winType: 'STANDARD' | 'KORA' | 'DOUBLE_KORA' | 'THREE_SEVENS' | 'UNDER_21' | 'FORFEIT';
  isWinner: boolean;
  winnerName: string;
  winnerId?: string;
  potWon: number;
  netChipsDelta?: number; // Net positive or negative change in chips for this player
  chipsFix?: number;
  fortuneFix?: number;
  isDuplicate?: boolean;
  baseBet: number;
  roundsCount: number;
  partieNumber?: number;
  durationSeconds?: number;
  opponents?: PlayerOpponentSummary[];
  status: 'completed' | 'in_progress' | 'abandoned';
  createdAt: number;
  difficulty?: 'EASY' | 'NORMAL' | 'EXPERT' | 'GRAND_MASTER' | string;
  pointsEarned?: number;
  masteryPointsAwarded?: number;
  tricksWon?: number;
  isDoubleKora?: boolean;
  isUnder21?: boolean;
  isThreeSevens?: boolean;
  roomId?: string;
}

export interface HeadToHeadMatch {
  id: string;
  createdAt: number;
  isPlayerWinner: boolean;
  winnerName: string;
  winnerId?: string;
  winType: 'STANDARD' | 'KORA' | 'DOUBLE_KORA' | 'THREE_SEVENS' | 'UNDER_21' | 'FORFEIT';
  baseBet: number;
  potWon: number;
  netDelta: number;
  playerTricks?: number;
  opponentTricks?: number;
  mode: 'SOLO' | 'MULTIPLAYER';
  recordType?: 'PARTIE' | 'MANCHE';
}

export interface HeadToHeadStats {
  opponentId: string;
  opponentName: string;
  opponentAvatar?: string;
  opponentFriendCode?: string;
  totalMatches: number;
  playerWins: number;
  opponentWins: number;
  winRate: number; // Percentage 0 - 100
  korasInflicted: number;
  korasSuffered: number;
  doubleKorasInflicted: number;
  doubleKorasSuffered: number;
  netChipsDelta: number; // Net positive or negative jetons
  totalPotExchanged: number;
  currentStreak: {
    winner: 'player' | 'opponent' | 'none';
    count: number;
  };
  playerAvgTricks: number;
  opponentAvgTricks: number;
  lastMatches: HeadToHeadMatch[];
  lastPlayedAt: number;
}

export const AVATAR_OPTIONS: AvatarOption[] = [
  {
    id: 'lion',
    name: 'Roi du Kora',
    emoji: '👑',
    bgGradient: 'bg-white',
    borderClass: 'border-amber-400',
    description: 'Noblesse et autorité sur le tapis de jeu',
  },
  {
    id: 'cheetah',
    name: 'Guépard Agile',
    emoji: '🐆',
    bgGradient: 'bg-white',
    borderClass: 'border-orange-400',
    description: 'Vitesse de réaction et prise de main foudroyante',
  },
  {
    id: 'eagle',
    name: 'Aigle Stratège',
    emoji: '🦅',
    bgGradient: 'bg-white',
    borderClass: 'border-sky-400',
    description: 'Vision panoramique de la table et du jeu adverse',
  },
  {
    id: 'ace',
    name: 'As Cartomancien',
    emoji: '🎴',
    bgGradient: 'bg-white',
    borderClass: 'border-emerald-400',
    description: 'Calcul des cartes restantes et des atouts maîtres',
  },
  {
    id: 'diamond',
    name: 'Maître Diamant',
    emoji: '💎',
    bgGradient: 'bg-white',
    borderClass: 'border-cyan-400',
    description: 'Pureté de jeu et précision mathématique',
  },
  {
    id: 'shield',
    name: 'Gardien Njambo',
    emoji: '🛡️',
    bgGradient: 'bg-white',
    borderClass: 'border-purple-400',
    description: 'Défense impénétrable contre les tentatives de Kora',
  },
  {
    id: 'lightning',
    name: 'Éclair Foudroyant',
    emoji: '⚡',
    bgGradient: 'bg-white',
    borderClass: 'border-yellow-400',
    description: 'Énergie électrique et audace permanente',
  },
  {
    id: 'star',
    name: 'Étoile Montante',
    emoji: '🌟',
    bgGradient: 'bg-white',
    borderClass: 'border-rose-400',
    description: 'Talent éclatant et flair infaillible',
  },
];

export const HONORIFIC_TITLES: HonorificTitle[] = [
  {
    id: 'APPRENTI',
    title: 'Apprenti',
    subtitle: 'Niveau I',
    badge: '🌱',
    colorClass: 'text-emerald-400',
    glowClass: 'from-emerald-500/20 to-emerald-700/10',
    borderClass: 'border-emerald-500/40',
    description: 'Fait ses premiers pas sur le tapis de Njambo Kora.',
    requirements: { minGames: 0 },
  },
  {
    id: 'CONFIRME',
    title: 'Joueur Confirmé',
    subtitle: 'Niveau II',
    badge: '⚔️',
    colorClass: 'text-sky-400',
    glowClass: 'from-sky-500/20 to-sky-700/10',
    borderClass: 'border-sky-500/40',
    description: 'Connaît les ficelles du jeu et a validé ses premières victoires.',
    requirements: { minGames: 5, minWins: 2 },
  },
  {
    id: 'CHASSEUR_KORA',
    title: 'Chasseur de Kora',
    subtitle: 'Niveau III',
    badge: '🎯',
    colorClass: 'text-amber-400',
    glowClass: 'from-amber-500/20 to-amber-700/10',
    borderClass: 'border-amber-500/40',
    description: 'A infligé son premier Kora magistral et fait trembler la table.',
    requirements: { minKoras: 1 },
  },
  {
    id: 'MAITRE_POSITION',
    title: 'Maître de Position',
    subtitle: 'Niveau IV',
    badge: '🛡️',
    colorClass: 'text-purple-400',
    glowClass: 'from-purple-500/20 to-purple-700/10',
    borderClass: 'border-purple-500/40',
    description: 'Domine la table par son sens du jeu et sa régularité de victoires.',
    requirements: { minGames: 15, minWins: 8 },
  },
  {
    id: 'MAITRE_NJAMBO',
    title: 'Maître Njambo',
    subtitle: 'Niveau V',
    badge: '👑',
    colorClass: 'text-yellow-300',
    glowClass: 'from-yellow-500/30 to-amber-700/20',
    borderClass: 'border-yellow-400/60',
    description: 'Pilier redouté, collectionneur de Koras et expert du bluff.',
    requirements: { minGames: 30, minWins: 15, minKoras: 3 },
  },
  {
    id: 'LEGENDE_KORA',
    title: 'Légende du Kora',
    subtitle: 'Niveau Suprême',
    badge: '🏆',
    colorClass: 'text-amber-300',
    glowClass: 'from-amber-400/40 to-yellow-600/30',
    borderClass: 'border-amber-300 shadow-amber-500/30 shadow-lg',
    description: 'Le sommet absolu : champion de prestige aux gains colossaux.',
    requirements: { minGames: 50, minWins: 30, minKoras: 5, minPotWon: 500 },
  },
];
