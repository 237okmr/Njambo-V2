/**
 * RÈGLE PERMANENTE DU PALMARÈS :
 * Le Palmarès ne contient que des joueurs humains authentifiés par Google, avec des statistiques valides.
 * Toute évolution future doit la respecter, sauf demande explicite du propriétaire.
 */

/**
 * Mastery Points & Scoring Configuration Module for Njambo Kora
 * Single Source of Truth for Client & Server scoring logic.
 */

export const MIN_GAMES_TO_APPEAR = 1;

export const LEADERBOARD_POLICY =
  "Le Palmarès ne contient que des joueurs humains authentifiés par Google, avec des statistiques valides. Toute évolution future doit la respecter, sauf demande explicite du propriétaire.";

export const GENERIC_PLAYER_NAMES = new Set([
  'joueur',
  'joueur anonyme',
  'adversaire',
  'ordinateur',
  'bot',
  'vous',
  'joueur (vous)',
]);

export const FORBIDDEN_UID_PREFIXES = [
  'champ_kora_',
  'bot_',
  'usr_',
  'guest_',
  'test_',
  'demo_',
  'mock_',
  'fake_',
];

export const KNOWN_BOT_NAMES = new Set([
  "thom's kora",
  "don wizeman",
  "kora boy malo",
  "zing efoulan",
  "black bozar",
  "systemtchakap",
  "zing mignon",
  "vie2poulet",
  "kora malox",
  "robam hokuto",
]);

export type LeaderboardIneligibilityReason =
  | 'SANS_MARQUEUR_GOOGLE'
  | 'DRAPEAU_INVITE'
  | 'ID_BOT'
  | 'NOM_GENERIQUE'
  | 'STATS_INVALIDES'
  | 'AUCUNE_PARTIE';

/**
 * Identifies all specific ineligibility reasons for a player document.
 */
export function getLeaderboardIneligibilityReasons(
  uid: string | undefined | null,
  data: any
): LeaderboardIneligibilityReason[] {
  const reasons: LeaderboardIneligibilityReason[] = [];

  if (!uid || typeof uid !== 'string' || uid.trim() === '' || !data || typeof data !== 'object') {
    reasons.push('ID_BOT');
    return reasons;
  }

  const cleanUid = uid.trim().toLowerCase();
  const isPrefixForbidden = FORBIDDEN_UID_PREFIXES.some((prefix) =>
    cleanUid.startsWith(prefix.toLowerCase())
  );
  if (data.isBot === true || isPrefixForbidden) {
    reasons.push('ID_BOT');
  }

  // Detect genuine Google authenticated human user markers
  const isGoogleAuthUser =
    data.authProvider === 'google.com' ||
    Boolean(data.email) ||
    Boolean(data.photoURL);

  // Strict check: if explicitly marked as guest or lacks genuine Google auth => exclude
  if (data.isGuest === true) {
    reasons.push('DRAPEAU_INVITE');
  }

  // Marker must be a Google authenticated user
  if (!isGoogleAuthUser) {
    reasons.push('SANS_MARQUEUR_GOOGLE');
  }

  const name = typeof data.displayName === 'string' ? data.displayName.trim() : '';
  // Generic name check applies primarily to guests and bots; real Google users with default names are accepted
  if (!isGoogleAuthUser && (!name || GENERIC_PLAYER_NAMES.has(name.toLowerCase()))) {
    reasons.push('NOM_GENERIQUE');
  }

  const stats = data.stats;
  if (!stats || typeof stats !== 'object') {
    reasons.push('STATS_INVALIDES');
  } else {
    let statsValid = true;
    const numericKeys = [
      'gamesPlayed',
      'gamesWon',
      'gamesLost',
      'partiesPlayed',
      'partiesWon',
      'koraCount',
      'doubleKoraCount',
      'masteryScore',
      'manchesWon',
      'manchesPlayed',
      'soloGamesPlayed',
      'soloGamesWon',
      'multiplayerGamesPlayed',
      'multiplayerGamesWon',
      'multiplayerManchesWon',
      'soloManchesWon',
      'soloManchesWonEasy',
      'soloManchesWonNormal',
      'soloManchesWonHard',
    ];

    for (const key of numericKeys) {
      if (key in stats && stats[key] !== undefined && stats[key] !== null) {
        const val = stats[key];
        if (typeof val !== 'number' || !Number.isFinite(val) || val < 0) {
          statsValid = false;
          break;
        }
      }
    }

    if (stats.fortune !== undefined && stats.fortune !== null) {
      if (typeof stats.fortune !== 'number' || !Number.isFinite(stats.fortune)) {
        statsValid = false;
      }
    }

    const partiesPlayed = typeof stats.partiesPlayed === 'number' ? stats.partiesPlayed : 0;
    const partiesWon = typeof stats.partiesWon === 'number' ? stats.partiesWon : 0;
    const gPlayed = typeof stats.gamesPlayed === 'number' ? stats.gamesPlayed : 0;
    const gWon = typeof stats.gamesWon === 'number' ? stats.gamesWon : 0;
    const sPlayed = typeof stats.soloGamesPlayed === 'number' ? stats.soloGamesPlayed : 0;
    const mPlayed = typeof stats.multiplayerGamesPlayed === 'number' ? stats.multiplayerGamesPlayed : 0;

    const totalGamesPlayed = Math.max(partiesPlayed, gPlayed, sPlayed + mPlayed);
    const totalGamesWon = Math.max(partiesWon, gWon);

    if (totalGamesWon > totalGamesPlayed && totalGamesPlayed > 0) {
      statsValid = false;
    }

    if (!statsValid) {
      reasons.push('STATS_INVALIDES');
    }

    if (totalGamesPlayed < MIN_GAMES_TO_APPEAR) {
      reasons.push('AUCUNE_PARTIE');
    }
  }

  return reasons;
}

/**
 * Validates whether a player document satisfies all permanent leaderboard eligibility criteria.
 */
export function isEligibleLeaderboardUser(uid: string | undefined | null, data: any): boolean {
  return getLeaderboardIneligibilityReasons(uid, data).length === 0;
}


export interface MasteryPointsConfig {
  base: {
    mancheWon: number; // 10
    mancheWonForfeit: number; // 5
    partieWon: number; // 1
    kora: number; // 5
    doubleKora: number; // 15 (Does not stack with simple Kora)
  };
  multipliers: {
    multiplayer: number; // 1.0
    soloHard: number; // 0.4 (Expert & Grand Master)
    soloNormal: number; // 0.2
    soloEasy: number; // 0.05
  };
  rules: {
    dailySoloPointsCap: number; // Max 30 points per calendar day
    timezone: string; // 'Africa/Douala' (UTC+1)
    minQualifyingGamesForRatio: number; // Threshold for WinRate qualification (10)
    forfeitPenaltyMultiplayer: number; // -5 points
    forfeitCheckWindow: number; // 20 games for forfeit penalty check
    fairPlayWindow: number; // 30 multiplayer games
  };
}

export const MASTERY_CONFIG: MasteryPointsConfig = {
  base: {
    mancheWon: 10,
    mancheWonForfeit: 5,
    partieWon: 1,
    kora: 5,
    doubleKora: 15,
  },
  multipliers: {
    multiplayer: 1.0,
    soloHard: 0.4,
    soloNormal: 0.2,
    soloEasy: 0.05,
  },
  rules: {
    dailySoloPointsCap: 30,
    timezone: 'Africa/Douala',
    minQualifyingGamesForRatio: 10,
    forfeitPenaltyMultiplayer: 5,
    forfeitCheckWindow: 20,
    fairPlayWindow: 30,
  },
};

/**
 * Returns the multiplier corresponding to the game mode and difficulty.
 */
export function getMasteryMultiplier(
  mode: 'SOLO' | 'MULTIPLAYER' | string,
  difficulty?: 'EASY' | 'NORMAL' | 'EXPERT' | 'GRAND_MASTER' | string
): number {
  if (mode === 'MULTIPLAYER') {
    return MASTERY_CONFIG.multipliers.multiplayer;
  }
  const diff = (difficulty || '').toUpperCase();
  if (diff === 'EXPERT' || diff === 'GRAND_MASTER' || diff === 'HARD') {
    return MASTERY_CONFIG.multipliers.soloHard;
  }
  if (diff === 'EASY') {
    return MASTERY_CONFIG.multipliers.soloEasy;
  }
  return MASTERY_CONFIG.multipliers.soloNormal;
}

/**
 * Computes base points earned for raw game achievements (without multiplier applied).
 */
export function computeRawBasePoints(params: {
  isMancheWinner?: boolean;
  isForfeitWin?: boolean;
  partiesWon?: number;
  koras?: number;
  doubleKoras?: number;
}): number {
  let points = 0;

  // Manche points
  if (params.isMancheWinner) {
    points += params.isForfeitWin
      ? MASTERY_CONFIG.base.mancheWonForfeit
      : MASTERY_CONFIG.base.mancheWon;
  }

  // Parties points
  points += (params.partiesWon || 0) * MASTERY_CONFIG.base.partieWon;

  // Koras points: Double Kora = 15, Simple Kora = 5 (strictly non-stacking)
  if (params.doubleKoras && params.doubleKoras > 0) {
    points += params.doubleKoras * MASTERY_CONFIG.base.doubleKora;
  }
  if (params.koras && params.koras > 0) {
    points += params.koras * MASTERY_CONFIG.base.kora;
  }

  return points;
}

/**
 * Computes exact floating-point mastery score for an event.
 */
export function computeEventMasteryScore(params: {
  mode: 'SOLO' | 'MULTIPLAYER' | string;
  difficulty?: string;
  isMancheWinner?: boolean;
  isForfeitWin?: boolean;
  partiesWon?: number;
  koras?: number;
  doubleKoras?: number;
}): number {
  const rawBase = computeRawBasePoints(params);
  const multiplier = getMasteryMultiplier(params.mode, params.difficulty);
  return rawBase * multiplier;
}

/**
 * Returns formatted calendar date string 'YYYY-MM-DD' in Africa/Douala timezone.
 */
export function getDoualaDateKey(timestamp: number = Date.now()): string {
  try {
    const formatter = new Intl.DateTimeFormat('fr-CA', {
      timeZone: MASTERY_CONFIG.rules.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date(timestamp));
  } catch {
    // Fallback if timezone not supported in local environment
    const d = new Date(timestamp + 3600 * 1000); // UTC+1
    return d.toISOString().slice(0, 10);
  }
}

/**
 * UI Display Helper: Formats mastery score rounded to the nearest integer.
 */
export function formatMasteryScore(score: number | undefined | null): string {
  if (typeof score !== 'number' || isNaN(score)) return '0';
  return Math.round(score).toLocaleString('fr-FR');
}

/**
 * Returns integer day index for Douala timezone (UTC+1).
 */
export function getDoualaDayIndex(timestamp = Date.now()): number {
  return Math.floor((timestamp + 3600000) / 86400000);
}

/**
 * Computes exact floating-point mastery score from cumulative profile stats.
 * Used as fallback or for profile calculation when history log is not available.
 */
export function computeMasteryScoreFromStats(stats?: Partial<any> | null): number {
  if (!stats) return 0;

  // Multiplayer
  const mpManches = stats.multiplayerManchesWon || 0;
  const mpParties = stats.multiplayerGamesWon || 0;
  const mpDoubleKoras = stats.multiplayerDoubleKoraCount || 0;
  const mpTotalKoras = stats.multiplayerKoraCount || 0;
  const mpSimpleKoras = Math.max(0, mpTotalKoras - mpDoubleKoras);

  const mpBase = (mpManches * MASTERY_CONFIG.base.mancheWon) +
    (mpParties * MASTERY_CONFIG.base.partieWon) +
    (mpSimpleKoras * MASTERY_CONFIG.base.kora) +
    (mpDoubleKoras * MASTERY_CONFIG.base.doubleKora);
  const mpPoints = mpBase * MASTERY_CONFIG.multipliers.multiplayer;

  // Solo Hard (Expert / Grand Master)
  const soloHardManches = stats.soloManchesWonHard || 0;
  const soloHardParties = stats.soloGamesWonHard || 0;
  const soloHardDoubleKoras = stats.soloDoubleKorasHard || 0;
  const soloHardSimpleKoras = stats.soloKorasHard || 0;
  const soloHardBase = (soloHardManches * MASTERY_CONFIG.base.mancheWon) +
    (soloHardParties * MASTERY_CONFIG.base.partieWon) +
    (soloHardSimpleKoras * MASTERY_CONFIG.base.kora) +
    (soloHardDoubleKoras * MASTERY_CONFIG.base.doubleKora);
  const soloHardPoints = soloHardBase * MASTERY_CONFIG.multipliers.soloHard;

  // Solo Normal
  const soloNormalManches = stats.soloManchesWonNormal || 0;
  const soloNormalParties = stats.soloGamesWonNormal || 0;
  const soloNormalDoubleKoras = stats.soloDoubleKorasNormal || 0;
  const soloNormalSimpleKoras = stats.soloKorasNormal || 0;
  const soloNormalBase = (soloNormalManches * MASTERY_CONFIG.base.mancheWon) +
    (soloNormalParties * MASTERY_CONFIG.base.partieWon) +
    (soloNormalSimpleKoras * MASTERY_CONFIG.base.kora) +
    (soloNormalDoubleKoras * MASTERY_CONFIG.base.doubleKora);
  const soloNormalPoints = soloNormalBase * MASTERY_CONFIG.multipliers.soloNormal;

  // Solo Easy
  const soloEasyManches = stats.soloManchesWonEasy || 0;
  const soloEasyParties = stats.soloGamesWonEasy || 0;
  const soloEasyDoubleKoras = stats.soloDoubleKorasEasy || 0;
  const soloEasySimpleKoras = stats.soloKorasEasy || 0;
  const soloEasyBase = (soloEasyManches * MASTERY_CONFIG.base.mancheWon) +
    (soloEasyParties * MASTERY_CONFIG.base.partieWon) +
    (soloEasySimpleKoras * MASTERY_CONFIG.base.kora) +
    (soloEasyDoubleKoras * MASTERY_CONFIG.base.doubleKora);
  const soloEasyPoints = soloEasyBase * MASTERY_CONFIG.multipliers.soloEasy;

  // Untracked legacy solo manches (fallback to Normal multiplier 0.2)
  const totalTrackedSoloManches = soloHardManches + soloNormalManches + soloEasyManches;
  const totalSoloManches = stats.soloManchesWon || 0;
  const untrackedSoloManches = Math.max(0, totalSoloManches - totalTrackedSoloManches);
  const untrackedPoints = untrackedSoloManches * MASTERY_CONFIG.base.mancheWon * MASTERY_CONFIG.multipliers.soloNormal;

  const total = mpPoints + soloHardPoints + soloNormalPoints + soloEasyPoints + untrackedPoints;
  return Math.max(0, total);
}
