import { GameTelemetryRecord } from '../../services/telemetryService';
import { AIDifficulty } from '../../types';

export type KatikaTab = 'DASHBOARD' | 'ROOMS' | 'MATCHES' | 'PLAYERS' | 'SETTINGS' | 'LOGS' | 'AI_ASSISTANT';

export type KatikaDashboardSubTab = 'LIVE' | 'BUSINESS' | 'GAMEPLAY';

export interface KatikaActivityPoint {
  timeLabel: string;
  timestamp: number;
  totalGames: number;
  kora: number;
  doubleKora: number;
  threeSevens: number;
  under21: number;
  standard: number;
  potSum: number;
}

export interface KatikaPlayerBehaviorMetrics {
  tablePreference: {
    twoPlayers: { count: number; percentage: number };
    threePlayers: { count: number; percentage: number };
    fourPlayers: { count: number; percentage: number };
    dominantFormat: '2 Joueurs (Duels)' | '3 Joueurs' | '4 Joueurs (Classique)';
  };
  audacityBarometer: {
    koraRate: number; // % of games won with Kora (x2)
    doubleKoraRate: number; // % of games won with Double Kora (x4)
    standardRate: number; // % of defensive/standard wins
    specialWinsRate: number; // % 3x7 or Under 21
    offenseIndex: number; // Score 0-100
    styleLabel: 'TRÈS OFFENSIF (Chasseurs de Kora)' | 'ÉQUILIBRÉ & TACTIQUE' | 'PRUDENT & DÉFENSIF';
  };
  gamePacing: {
    avgMancheDurationSec: number;
    avgPartieDurationSec: number;
    avgTrickDurationSec?: number;
    fastestPartieDurationSec: number;
    longestPartieDurationSec: number;
    totalPlaytimeHours: number;
  };
}

export interface KatikaRetentionMetrics {
  dau: number; // Daily Active Users
  wau: number; // Weekly Active Users
  mau: number; // Monthly Active Users
  stickinessRatio: number; // DAU / MAU (%)
  d1Retention: number; // Day 1 Retention (%)
  d7Retention: number; // Day 7 Retention (%)
  d30Retention: number; // Day 30 Retention (%)
  hasSufficientCohortData?: boolean; // Vrai si au moins 1 joueur a plus de 24h d'historique réel
  cohortSampleSize?: number; // Nombre d'utilisateurs éligibles pour l'analyse de cohorte
  avgSessionsPerUser: number;
  hourlyHeatmap: Array<{
    hour: number;
    count: number;
    intensityPct: number;
  }>;
  peakHourLabel: string;
}

export interface KatikaAbandonmentMetrics {
  completionRate: number; // % of games completed without quit
  abandonmentRate: number; // % of rage quit / early abandonment
  postKoraAbandonRate: number; // % of quits right after suffering a Kora
  chokePoints: {
    earlyTrickQuitPct: number; // Quits during tricks 1-2
    midGameQuitPct: number; // Quits during tricks 3-4
    afterDefeatQuitPct: number; // Quits right after losing a round
  };
  healthScore: number; // Score 0-100 of game flow stability
  healthStatus: 'FLUIDE & SAIN (Très peu d’abandons)' | 'MODÉRÉ' | 'ATTENTION (Frustrations détectées)';
}

export interface KatikaKPIs {
  connectedPlayersCount: number;
  activeRoomsCount: number;
  totalGamesPlayed: number; // Nombre total de Manches (succession de parties jusqu'à la victoire finale)
  totalManchesPlayed?: number; // Alias explicite pour les Manches complètes
  totalManchesStarted?: number; // Nombre global réel de toutes les manches lancées (débutées)
  totalManchesCompleted?: number; // Nombre global de manches terminées (avec vainqueur final)
  totalManchesInProgress?: number; // Nombre de manches non terminées (débutées mais abandonnées ou quittées)
  totalManchesAbandoned?: number; // Total des manches abandonnées / forfaits (> 30 min inactivité ou quit)
  totalManchesOngoing?: number; // Total des manches en cours réelles (< 30 min inactivité)
  mancheCompletionRate?: number; // Taux de complétion réel des manches en %
  totalPartiesDisputed?: number; // Nombre cumulé de parties (donnes de 5 tours) jouées
  avgPartiesPerManche?: number; // Moyenne de parties disputées par manche (ex: 8.4)
  manchesCompletedCount?: number;
  manchesAbandonedCount?: number;
  manchesOngoingCount?: number;
  bettingEconomyEnabled?: boolean; // Arbitrage 2: active ou masque l'affichage financier
  soloGamesCount: number;
  multiplayerGamesCount: number;
  // Victory Breakdown
  koraCount: number;
  doubleKoraCount: number;
  simpleVictoryCount: number;
  threeSevensCount: number;
  under21Count: number;
  forfeitWinsCount?: number;
  // Live Tension & Proposals (Temps Réel)
  liveBetProposalsActive?: number;
  liveCapacityVotesActive?: number;
  liveKoraHunterAlertsActive?: number;
  // Authentication & Users (Source /users)
  registeredUsersCount?: number;
  googleUsersCount?: number;
  guestUsersCount?: number;
  honorificPyramid?: Record<string, number>;
  // Player distribution
  twoPlayersCount: number;
  threePlayersCount: number;
  fourPlayersCount: number;
  // Player Behavior & Experience Analytics (Étape 1)
  playerBehavior: KatikaPlayerBehaviorMetrics;
  // Retention & Engagement Analytics (Étape 2)
  retentionEngagement: KatikaRetentionMetrics;
  // Abandonment & Frustrations Analytics (Étape 4)
  abandonmentFrustrations: KatikaAbandonmentMetrics;
  // Economy & Jetons
  totalChipsWon: number;
  avgPotPerGame: number;
  highestPotWon: number;
  // Matches List & Timeline
  recentMatches: GameTelemetryRecord[];
  activityTimeline: KatikaActivityPoint[];
}

export interface KatikaLiveRoom {
  roomId: string;
  roomName: string;
  status: 'WAITING' | 'IN_GAME' | 'FINISHED';
  maxPlayers: number;
  currentPlayersCount: number;
  baseBet?: number;
  initialCapital?: number;
  pot?: number;
  turnTimerSeconds?: number;
  turnRemainingSeconds?: number;
  dealerIndex?: number;
  leadIndex?: number;
  instantWinReveal?: {
    winnerIndex: number;
    winnerName: string;
    winType: string;
    multiplier: number;
    points?: number;
  } | null;
  currentTrickNumber?: number;
  activePlayerIndex?: number;
  activePlayerName?: string;
  leadSuit?: string | null;
  tableCards?: Array<{
    card: { id?: string; suit: string; value: number; label?: string; shortLabel?: string };
    playerName: string;
    playerIndex?: number;
    isWinningSoFar?: boolean;
    isLeadCard?: boolean;
  }>;
  tricksHistory?: Array<{
    trickNumber: number;
    winnerName: string;
    winnerIndex?: number;
    winningCard?: { id?: string; suit: string; value: number; label?: string; shortLabel?: string };
    plays?: Array<{
      card: { id?: string; suit: string; value: number; label?: string; shortLabel?: string };
      playerIndex: number;
      playerName: string;
      isLeadCard?: boolean;
      isWinningSoFar?: boolean;
    }>;
  }>;
  players: {
    id: string;
    name: string;
    score: number;
    capital?: number;
    cardsLeft?: number;
    hand?: Array<{ id?: string; suit: string; value: number; label?: string; shortLabel?: string }>;
    tricksWonInRound?: number;
    isHost: boolean;
    isHuman: boolean;
    isReady: boolean;
    connected: boolean;
    isEliminated?: boolean;
    isFoldedInRound?: boolean;
    aiStrategy?: string;
  }[];
  createdAt: number;
  currentRound: number;
  isPublic?: boolean;
  betIncreaseProposal?: {
    proposedBy: string;
    proposedByName: string;
    multiplier: number;
    proposedBet: number;
    status: string;
  } | null;
  capacityExtensionProposal?: {
    proposedBy: string;
    targetMaxPlayers: number;
    status: string;
  } | null;
  integrationProposal?: any | null;
  showKoraHunterAlert?: boolean;
  hunterPlayerName?: string | null;
}

export interface KatikaPlayerMatchHistory {
  id: string;
  date: number;
  mode: 'SOLO' | 'MULTIPLAYER';
  playerCount: number;
  result: 'WIN' | 'LOSS';
  winType: string;
  chipsDelta: number;
  opponents: string[];
  partiesCount?: number; // Nombre de parties (5 tours) disputées lors de cette manche
  manchesCount?: number; // Compatibilité ascendante
  isMancheFinalWin?: boolean; // Vrai si victoire finale de la manche
  isPartieFinalWin?: boolean; // Compatibilité ascendante
}

export interface KatikaPlayer {
  id: string;
  name: string;
  isHuman?: boolean;
  email?: string;
  photoURL?: string | null;
  avatarId?: string;
  honorificTitleId?: string;
  isGuest?: boolean;
  authProvider?: string;
  isBot?: boolean;
  rawUserData?: any;
  ipAddress?: string;
  chipsBalance: number;
  totalGames: number; // Manches disputées (successions de parties)
  victories: number; // Manches remportées (Victoires finales de la manche)
  defeats?: number; // Manches perdues
  winRate?: number; // Taux de victoire réel en % (victories / totalGames * 100)
  chipsWon?: number; // Total cumulé des gains
  chipsLost?: number; // Total cumulé des mises perdues
  totalPartiesPlayed?: number; // Total cumulé des parties de 5 tours disputées
  totalPartiesWon?: number; // Total de parties individuelles de 5 tours gagnées (pots empochés)
  totalManchesPlayed?: number; // Alias pour Manches disputées
  totalManchesWon?: number; // Alias pour Manches remportées
  soloGamesPlayed?: number; // Nombre de parties solo contre IA
  multiplayerGamesPlayed?: number; // Nombre de parties en ligne PvP
  totalTricksWon?: number; // Tours totaux empochés
  koraCount: number; // Kora réalisés en partie (5 tours)
  doubleKoraCount?: number; // Double Kora réalisés en partie (5 tours)
  masteryScore?: number; // Score de Maîtrise
  status: 'ACTIVE' | 'WARNED' | 'BANNED';
  bannedReason?: string;
  banType?: 'NONE' | 'TEMPORARY' | 'PERMANENT';
  banExpiresAt?: number | null;
  warningsCount: number;
  warningsHistory?: Array<{ date: number; reason: string; actor: string }>;
  abandonCount: number;
  abandonRate: number; // percentage 0-100
  forfeitsCount?: number; // Total des forfaits constatés ou réclamés
  recentForfeitsInLastHour?: number; // Forfaits dans la dernière heure
  isAntiJeuRisk?: boolean; // Tag automatique anti-jeu (ex: 3+ forfaits/h)
  winsByFormat: {
    twoPlayers: { wins: number; total: number };
    threePlayers: { wins: number; total: number };
    fourPlayers: { wins: number; total: number };
  };
  antifraudAlerts: {
    highAbandonRisk: boolean;
    collusionRisk: boolean;
    collusionPartner?: string;
    collusionPercentage?: number;
    spamAntiFairplayRisk: boolean;
    actionsPerSecondPeak?: number;
  };
  recentMatches?: KatikaPlayerMatchHistory[];
  lastActive: number;
  firstJoined: number;
}

export interface KatikaGameConfig {
  turnTimerSeconds: number;
  reconnectTimeoutSeconds: number;
  lobbyDisconnectGraceSeconds?: number; // Délai de grâce déconnexion lobby avant éjection (défaut: 20s)
  inactivityTimeoutSeconds: number;
  targetWinningScore: number;
  isMaintenanceMode: boolean;
  allowNewRooms: boolean;
  defaultInitialCapital: number;
  minTableBet: number;
  globalAnnouncement: string;
  bettingEconomyEnabled?: boolean; // Arbitrage 2: Mises et jetons financiers visibles sur le dashboard
  // PWA Versioning & Graduated Response (Arbitrage PWA)
  pwaPolicyMode?: 'PERMISSIVE' | 'MODERATE' | 'STRICT';
  minPwaVersion?: string;
  currentPwaVersion?: string;
  neverInterruptActiveMatch?: boolean; // Règle d'or: Ne jamais interrompre un joueur en partie active
  // Engine & Pacing (Rythme & Moteur - Solo & Multi)
  transitionDelayMs?: number;
  botThinkTimeMs?: number;
  trickResolutionTimeMs?: number;
  instantWinAnimationTimeMs?: number;
  foldForfeitDelayMs?: number;
  
  // Multiplayer & AI Behavior
  defaultTableMaxPlayers?: 2 | 4; // 2 (1vs1) par défaut
  defaultFillWithBots?: boolean; // false (100% humain) par défaut
  allowJoinInProgress?: boolean; // Accepter spectateurs / nouveaux arrivants si table < 4
  emptyRoomTimeoutMinutes?: number; // Fermeture et suppression automatique des tables abandonnées sans humains (défaut: 5 min)
  lobbyWaitTtlMinutes?: number; // Durée de vie d'une table en LOBBY sans humain (défaut: 30 min)
  publicAbsentHostVisibilitySeconds?: number; // Visibilité publique d'une table avec hôte absent (défaut: 180 s)
  hostTakeoverSeconds?: number; // Délai avant qu'un invité devienne hôte de repli (défaut: 180 s)
  guestLobbyGraceSeconds?: number; // Délai de grâce pour invité déconnecté dans le lobby (défaut: 60 s)
  joinPushEnabled?: boolean; // Activer la notification push à l'hôte quand un joueur rejoint sa table (défaut: true)
  defaultAiDifficulty?: AIDifficulty;
  hokutoSpawnRatePct?: number;
  globalRakePct?: number;
  allowAutoAdvance?: boolean;

  // Bot Dialogue & Commentary Pacing (Répliques & Provocations des Robots IA)
  botEmoteCooldownSeconds?: number; // Délai de silence minimal entre deux répliques bots (défaut: 7s)
  botMaxEmotesPerRound?: number; // Nombre max d'interventions par manche pour la table (défaut: 2, 0 = muet)
  botEmoteHokutoRatePct?: number; // Taux de bavardage / provocations Robam Hokuto (défaut: 28%)
  botEmoteMbapRatePct?: number; // Taux de commentaires prises de contrôle & coupes (« Couper la carte ») (défaut: 25%)
  botEmoteLeadDiscardRatePct?: number; // Taux de commentaires entames et cartes sans couleur (défaut: 10%)
  botEmoteCriticalBypassLimit?: boolean; // Autorise Kora-break et pli 5 décisif à dépasser le plafond de manche (défaut: true)

  // Rules & Multipliers
  enableUnder21?: boolean;
  enableThreeSevens?: boolean;
  enableDoubleKora?: boolean;
  readonly koraMultiplier: 2;
  readonly doubleKoraMultiplier: 4;

  // Anti-stagnation & Auto Bet Escalation (Escalade automatique des mises)
  enableAutoBetEscalation?: boolean;
  autoBetEscalationInterval?: number;
  autoBetEscalationRatePct?: number;
  maxAutoBetMultiplier?: number;
}

export interface KatikaAuditLog {
  id: string;
  timestamp: number;
  type: 'SERVER_ERROR' | 'ANOMALY' | 'KATIKA_ACTION' | 'AUTH' | 'CONFIG_CHANGE';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  actor: string;
  summary: string;
  details?: Record<string, any>;
}
