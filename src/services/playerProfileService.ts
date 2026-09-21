import {
  signInWithPopup,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  User,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  startAfter,
} from 'firebase/firestore';
import { estimateNetFromHistoryRecord } from '../utils/settlement';
import { auth, db } from '../lib/firebase';
import {
  PlayerProfile,
  PlayerStats,
  DEFAULT_PLAYER_STATS,
  PlayerFairPlay,
  DEFAULT_PLAYER_FAIR_PLAY,
  FairPlaySanction,
  PlayerOpponentSummary,
  PlayerGameHistoryItem,
  AvatarOptionId,
  HONORIFIC_TITLES,
  HonorificTitle,
} from '../types/playerProfile';
import { getPersistentItem, setPersistentItem } from '../utils/storageUtils';
import { getGuestId, setAuthenticatedUid, clearAuthenticatedUid } from './identity';
import { RivalryService } from './rivalryService';
import { LeaderboardService } from './leaderboardService';

import {
  MASTERY_CONFIG,
  getMasteryMultiplier,
  computeRawBasePoints,
  computeEventMasteryScore,
  computeMasteryScoreFromStats,
  getDoualaDateKey,
  getDoualaDayIndex,
  formatMasteryScore,
} from './masteryConfig';

export { DEFAULT_PLAYER_STATS, DEFAULT_PLAYER_FAIR_PLAY };

export function mergeSoloDaily(
  d1?: { day: number; points: number },
  d2?: { day: number; points: number }
): { day: number; points: number } | undefined {
  if (!d1) return d2;
  if (!d2) return d1;
  if (d1.day > d2.day) return d1;
  if (d2.day > d1.day) return d2;
  return { day: d1.day, points: Math.max(d1.points || 0, d2.points || 0) };
}

function computeAwardedSoloMastery(
  potentialMastery: number,
  profile: PlayerProfile,
  history: PlayerGameHistoryItem[]
): { awarded: number; soloDaily: { day: number; points: number } } {
  const today = Math.max(getDoualaDayIndex(Date.now()), profile.soloDaily?.day ?? 0);
  let alreadyAwarded = 0;

  if (profile.soloDaily && typeof profile.soloDaily.day === 'number') {
    alreadyAwarded = profile.soloDaily.day === today ? (profile.soloDaily.points || 0) : 0;
  } else {
    // Initialisation fallback pour profil existant sans soloDaily
    const todayKey = getDoualaDateKey(Date.now());
    alreadyAwarded = history
      .filter((h) => h.mode === 'SOLO' && getDoualaDateKey(h.createdAt) === todayKey)
      .reduce((sum, h) => sum + (h.masteryPointsAwarded || 0), 0);
  }

  const cap = MASTERY_CONFIG.rules.dailySoloPointsCap; // 30
  let awarded = 0;
  if (potentialMastery > 0 && alreadyAwarded < cap) {
    awarded = Math.min(potentialMastery, Math.max(0, cap - alreadyAwarded));
  }
  awarded = Math.round(awarded * 100) / 100;

  const rawPoints = alreadyAwarded + awarded;
  const roundedPoints = Math.round(rawPoints * 100) / 100;
  const points = Math.min(cap, roundedPoints);

  return {
    awarded,
    soloDaily: { day: today, points },
  };
}

const PROFILE_KEY = 'njambo_player_profile_v1';
const HISTORY_KEY = 'njambo_player_history_v1';
const GUEST_BACKUP_KEY = 'njambo_guest_profile_backup';
export const OFFLINE_QUEUE_KEY = 'njambo_offline_sync_queue_v1';

export interface PendingOfflineSyncItem {
  id: string;
  type: 'PROFILE' | 'PARTIE' | 'GAME' | 'SANCTION';
  userId: string;
  docPath: string;
  payload: any;
  queuedAt: number;
  retryCount: number;
}

function generateGuestId(): string {
  return getGuestId();
}

function getInitialDisplayName(): string {
  const existing = getPersistentItem('njambo_player_name');
  if (existing && existing.trim().toLowerCase() !== 'katika') {
    return existing.trim();
  }
  const defaultName = 'Joueur ' + Math.floor(100 + Math.random() * 900);
  setPersistentItem('njambo_player_name', defaultName);
  return defaultName;
}

export function sanitizeDisplayName(name: string): string {
  const cleaned = name.trim();
  if (cleaned.toLowerCase() === 'katika' || cleaned.toLowerCase().includes('katika admin')) {
    return 'Joueur ' + Math.floor(100 + Math.random() * 900);
  }
  return cleaned.slice(0, 24);
}

export function applyStatsFallback(stats: PlayerStats | any, scoreVersion?: number): PlayerStats {
  const finalStats = { ...stats } as any;
  const version = scoreVersion ?? finalStats.scoreVersion ?? 1;

  // 0. Legacy property mapping
  if (finalStats.korasCount !== undefined && finalStats.koraCount === undefined) {
    finalStats.koraCount = finalStats.korasCount;
  }
  if (finalStats.doubleKorasCount !== undefined && finalStats.doubleKoraCount === undefined) {
    finalStats.doubleKoraCount = finalStats.doubleKorasCount;
  }
  if (finalStats.wins !== undefined && finalStats.gamesWon === undefined) {
    finalStats.gamesWon = finalStats.wins;
  }
  if (finalStats.victories !== undefined && finalStats.gamesWon === undefined) {
    finalStats.gamesWon = finalStats.victories;
  }

  // 1. Fallback for Parties Won
  const legacyDetailedWins = (finalStats.soloGamesWon || 0) + (finalStats.multiplayerGamesWon || 0);
  let gamesWon = finalStats.partiesWon || finalStats.gamesWon || legacyDetailedWins || 0;
  
  // Ensure the root fields are correctly set
  finalStats.gamesWon = gamesWon;
  finalStats.partiesWon = gamesWon;

  const soloGamesWon = finalStats.soloGamesWon || 0;
  const multiplayerGamesWon = finalStats.multiplayerGamesWon || 0;
  const totalDetailedWins = soloGamesWon + multiplayerGamesWon;

  const soloPlayed = finalStats.soloGamesPlayed || 0;
  const multiPlayed = finalStats.multiplayerGamesPlayed || 0;
  const totalPlayed = soloPlayed + multiPlayed;
  const soloRatio = totalPlayed > 0 ? soloPlayed / totalPlayed : 1.0;

  if (totalDetailedWins < gamesWon) {
    const missingWins = gamesWon - totalDetailedWins;
    if (totalPlayed > 0) {
      const estimatedSoloWins = Math.min(soloPlayed, Math.round(missingWins * soloRatio));
      const estimatedMultiWins = missingWins - estimatedSoloWins;
      finalStats.soloGamesWon = soloGamesWon + estimatedSoloWins;
      finalStats.multiplayerGamesWon = multiplayerGamesWon + estimatedMultiWins;
    } else {
      finalStats.soloGamesWon = soloGamesWon + missingWins;
    }
  }

  // 2. Fallback for Manches Won (distribute generic manches into solo/multi)
  const legacyDetailedManches = (finalStats.soloManchesWon || 0) + (finalStats.multiplayerManchesWon || 0);
  let manchesWon = finalStats.manchesWon || legacyDetailedManches || 0;
  finalStats.manchesWon = manchesWon;

  const soloManchesWon = finalStats.soloManchesWon || 0;
  const multiplayerManchesWon = finalStats.multiplayerManchesWon || 0;
  const totalDetailedManchesCount = soloManchesWon + multiplayerManchesWon;

  if (totalDetailedManchesCount < manchesWon) {
    const missingManches = manchesWon - totalDetailedManchesCount;
    // Default unclassified manches to solo
    finalStats.soloManchesWon = soloManchesWon + missingManches;
  }

  // 2. Fallback for Koras Count
  const totalKoras = finalStats.koraCount || 0;
  const soloKoras = finalStats.soloKoraCount || 0;
  const multiKoras = finalStats.multiplayerKoraCount || 0;
  const totalDetailedKoras = soloKoras + multiKoras;

  if (totalDetailedKoras < totalKoras) {
    const missingKoras = totalKoras - totalDetailedKoras;
    const estimatedSoloKoras = Math.round(missingKoras * soloRatio);
    const estimatedMultiKoras = missingKoras - estimatedSoloKoras;
    finalStats.soloKoraCount = soloKoras + estimatedSoloKoras;
    finalStats.multiplayerKoraCount = multiKoras + estimatedMultiKoras;
  }

  // 3. Fallback for Double Koras Count
  const totalDoubleKoras = finalStats.doubleKoraCount || 0;
  const soloDoubleKoras = finalStats.soloDoubleKoraCount || 0;
  const multiDoubleKoras = finalStats.multiplayerDoubleKoraCount || 0;
  const totalDetailedDoubleKoras = soloDoubleKoras + multiDoubleKoras;

  if (totalDetailedDoubleKoras < totalDoubleKoras) {
    const missingDoubleKoras = totalDoubleKoras - totalDetailedDoubleKoras;
    const estimatedSoloDoubleKoras = Math.round(missingDoubleKoras * soloRatio);
    const estimatedMultiDoubleKoras = missingDoubleKoras - estimatedSoloDoubleKoras;
    finalStats.soloDoubleKoraCount = soloDoubleKoras + estimatedSoloDoubleKoras;
    finalStats.multiplayerDoubleKoraCount = multiDoubleKoras + estimatedMultiDoubleKoras;
  }

  // 4. Fallback for Fortune, Gains and Pertes
  if (finalStats.fortune > 0 && finalStats.multiplayerGains === 0) {
    finalStats.multiplayerGains = finalStats.fortune;
    finalStats.multiplayerPertes = 0;
  }

  // 5. Calculer les ratios de victoire
  finalStats.soloWinRate = finalStats.soloGamesPlayed > 0
    ? Math.round((finalStats.soloGamesWon / finalStats.soloGamesPlayed) * 100)
    : 0;
  finalStats.multiplayerWinRate = finalStats.multiplayerGamesPlayed > 0
    ? Math.round((finalStats.multiplayerGamesWon / finalStats.multiplayerGamesPlayed) * 100)
    : 0;

  // 6. Calculer le Score de Maîtrise consolidé
  if (version >= 2 && typeof finalStats.masteryScore === 'number' && !isNaN(finalStats.masteryScore)) {
    // Pour scoreVersion >= 2, conserver le score événementiel stocké (respect des plafonds solo, forfaits, abandons)
  } else {
    // Repli de calcul cumulatif pour profils legacy scoreVersion < 2
    finalStats.masteryScore = computeMasteryScore(finalStats);
  }

  return finalStats;
}

/**
 * Barème officiel du Score de Maîtrise :
 * Source unique de vérité importée depuis masteryConfig.ts
 */
export const MASTERY_POINTS_CONFIG = MASTERY_CONFIG;

/**
 * Calcule dynamiquement le Score de Maîtrise (avec ses décimales exactes) à partir des statistiques du joueur.
 */
export function computeMasteryScore(rawStats?: Partial<PlayerStats> | null): number {
  return computeMasteryScoreFromStats(rawStats);
}

/**
 * Calcule le détail et le total des points de Maîtrise gagnés lors d'une fin de partie ou de manche.
 */
export function computeEarnedPoints(params: {
  isMancheOver: boolean;
  isWinner: boolean;
  mode: 'SOLO' | 'MULTIPLAYER';
  winType: string;
  difficulty?: string;
  isForfeitWin?: boolean;
}): {
  total: number;
  breakdown: Array<{ label: string; points: number }>;
} {
  const breakdown: Array<{ label: string; points: number }> = [];
  if (!params.isWinner) {
    return { total: 0, breakdown };
  }

  const mult = getMasteryMultiplier(params.mode, params.difficulty);

  if (params.isMancheOver) {
    const basePts = params.isForfeitWin
      ? MASTERY_CONFIG.base.mancheWonForfeit
      : MASTERY_CONFIG.base.mancheWon;
    const pts = basePts * mult;
    const label = params.mode === 'MULTIPLAYER'
      ? 'Victoire Manche Multijoueur'
      : `Victoire Manche Solo (${params.difficulty || 'NORMAL'})`;
    breakdown.push({ label, points: pts });
  } else {
    // Single Partie
    const partiePts = MASTERY_CONFIG.base.partieWon * mult;
    breakdown.push({ label: 'Donne remportée', points: partiePts });

    if (params.winType === 'DOUBLE_KORA') {
      const dblPts = MASTERY_CONFIG.base.doubleKora * mult;
      breakdown.push({ label: 'Exploit Suprême Double Kora', points: dblPts });
    } else if (params.winType === 'KORA') {
      const koraPts = MASTERY_CONFIG.base.kora * mult;
      breakdown.push({ label: 'Exploit Kora', points: koraPts });
    }
  }

  const total = breakdown.reduce((acc, b) => acc + b.points, 0);
  return { total, breakdown };
}

export function computeHonorificTitle(rawStats?: Partial<PlayerStats> | null): {
  currentTitle: HonorificTitle;
  nextTitle: HonorificTitle | null;
  progressPercent: number;
} {
  const stats: PlayerStats = {
    ...DEFAULT_PLAYER_STATS,
    ...(rawStats || {}),
  };

  // Sanitize all numeric fields against NaN/undefined
  (Object.keys(DEFAULT_PLAYER_STATS) as Array<keyof PlayerStats>).forEach((key) => {
    if (typeof stats[key] !== 'number' || isNaN(stats[key])) {
      stats[key] = 0;
    }
  });

  // Titles are in ascending difficulty: APPRENTI -> CONFIRME -> CHASSEUR_KORA -> MAITRE_POSITION -> MAITRE_NJAMBO -> LEGENDE_KORA
  let currentTitle = HONORIFIC_TITLES[0];
  let nextTitle: HonorificTitle | null = HONORIFIC_TITLES[1];

  const qualifies = (t: HonorificTitle): boolean => {
    const req = t.requirements;
    if (req.minGames && (stats.gamesPlayed || 0) < req.minGames) return false;
    if (req.minWins && (stats.gamesWon || 0) < req.minWins) return false;
    if (req.minKoras && (stats.koraCount || 0) < req.minKoras) return false;
    if (req.minDoubleKoras && (stats.doubleKoraCount || 0) < req.minDoubleKoras) return false;
    if (req.minPotWon && (stats.biggestPotWon || 0) < req.minPotWon) return false;
    return true;
  };

  for (let i = HONORIFIC_TITLES.length - 1; i >= 0; i--) {
    if (qualifies(HONORIFIC_TITLES[i])) {
      currentTitle = HONORIFIC_TITLES[i];
      nextTitle = i < HONORIFIC_TITLES.length - 1 ? HONORIFIC_TITLES[i + 1] : null;
      break;
    }
  }

  // Calculate progress towards next title
  let progressPercent = 100;
  if (nextTitle) {
    const req = nextTitle.requirements;
    const fractions: number[] = [];
    if (req.minGames) fractions.push(Math.min(1, (stats.gamesPlayed || 0) / req.minGames));
    if (req.minWins) fractions.push(Math.min(1, (stats.gamesWon || 0) / req.minWins));
    if (req.minKoras) fractions.push(Math.min(1, (stats.koraCount || 0) / req.minKoras));
    if (req.minPotWon) fractions.push(Math.min(1, (stats.biggestPotWon || 0) / req.minPotWon));

    if (fractions.length > 0) {
      const avg = fractions.reduce((a, b) => a + b, 0) / fractions.length;
      progressPercent = Math.min(100, Math.max(0, Math.round(avg * 100)));
    }
  }

  return { currentTitle, nextTitle, progressPercent: isNaN(progressPercent) ? 0 : progressPercent };
}

export const playerProfileService = {
  /**
   * Initializes or loads the current player profile from localStorage with full schema guarantees.
   */
  getLocalProfile(): PlayerProfile {
    const guestId = generateGuestId();
    const guestName = getInitialDisplayName();

    const defaultProfile: PlayerProfile = {
      uid: guestId,
      displayName: guestName,
      email: null,
      photoURL: null,
      avatarId: 'lion',
      isGuest: true,
      chips: 1000,
      stats: { ...DEFAULT_PLAYER_STATS },
      fairPlay: { ...DEFAULT_PLAYER_FAIR_PLAY },
      honorificTitleId: 'APPRENTI',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      const stored = localStorage.getItem(PROFILE_KEY);
      const storedChips = localStorage.getItem('njambo_player_chips');
      let fallbackChips = 1000;
      if (storedChips) {
        const parsedChips = parseInt(storedChips, 10);
        if (!isNaN(parsedChips)) fallbackChips = parsedChips;
      }

      if (stored) {
        const parsed = JSON.parse(stored) as Partial<PlayerProfile>;
        if (parsed && typeof parsed === 'object') {
          // Merge stats safely with default zero-values
          const mergedStats: PlayerStats = {
            ...DEFAULT_PLAYER_STATS,
            ...(parsed.stats || {}),
          };

          (Object.keys(DEFAULT_PLAYER_STATS) as Array<keyof PlayerStats>).forEach((key) => {
            if (typeof mergedStats[key] !== 'number' || isNaN(mergedStats[key])) {
              mergedStats[key] = 0;
            }
          });

          // Calculate win rate & lost games if not explicitly set
          if (mergedStats.gamesPlayed > 0 && mergedStats.winRate === 0 && mergedStats.gamesWon > 0) {
            mergedStats.winRate = Math.round((mergedStats.gamesWon / mergedStats.gamesPlayed) * 100);
          }
          mergedStats.gamesLost = Math.max(0, mergedStats.gamesPlayed - mergedStats.gamesWon);

          // Apply fallback rule for older users who have victories but no detail set
          const finalStats = applyStatsFallback(mergedStats, parsed.scoreVersion);

          // Fair play defaults
          const mergedFairPlay: PlayerFairPlay = {
            ...DEFAULT_PLAYER_FAIR_PLAY,
            ...(parsed.fairPlay || {}),
          };

          // Check if active sanction has expired
          if (
            mergedFairPlay.activeSanction &&
            typeof mergedFairPlay.activeSanction === 'object' &&
            mergedFairPlay.activeSanction.expiresAt
          ) {
            if (Date.now() > mergedFairPlay.activeSanction.expiresAt) {
              try {
                mergedFairPlay.activeSanction.active = false;
                mergedFairPlay.activeSanction = null;
              } catch (_) {}
            }
          }

          const completeProfile: PlayerProfile = {
            uid: parsed.uid || guestId,
            displayName: sanitizeDisplayName(parsed.displayName || guestName),
            email: parsed.email || null,
            photoURL: parsed.photoURL || null,
            avatarId: (parsed.avatarId as AvatarOptionId) || 'lion',
            isGuest: parsed.isGuest !== false,
            chips: typeof parsed.chips === 'number' && !isNaN(parsed.chips) ? parsed.chips : fallbackChips,
            stats: finalStats,
            scoreVersion: parsed.scoreVersion,
            chipsFixVersion: parsed.chipsFixVersion,
            fortuneFixVersion: parsed.fortuneFixVersion,
            soloDaily: parsed.soloDaily,
            fairPlay: mergedFairPlay,
            honorificTitleId: parsed.honorificTitleId || 'APPRENTI',
            createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now(),
            updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
          };

          return completeProfile;
        }
      }
    } catch (e) {
      console.warn('[PlayerProfileService] Failed reading local profile:', e);
    }

    this.saveLocalProfile(defaultProfile);
    return defaultProfile;
  },

  /**
   * Vérifie si le joueur courant est authentifié avec Google.
   */
  isGoogleAuthenticated(): boolean {
    return Boolean(
      auth.currentUser &&
        !auth.currentUser.isAnonymous &&
        auth.currentUser.providerData?.some((p) => p.providerId === 'google.com')
    );
  },

  /**
   * Saves profile locally and syncs legacy keys for engine compatibility.
   */
  saveLocalProfile(profile: PlayerProfile): void {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      if (!profile.isGuest && profile.uid) {
        setAuthenticatedUid(profile.uid);
      } else {
        clearAuthenticatedUid();
      }
      setPersistentItem('njambo_player_name', profile.displayName);
      localStorage.setItem('njambo_player_chips', (profile.chips ?? 1000).toString());
      if (profile.stats) {
        localStorage.setItem('njambo_player_stats', JSON.stringify(profile.stats));
      }
    } catch (e) {
      console.warn('[PlayerProfileService] Failed writing local profile:', e);
    }
  },

  /**
   * Retrieves player game history items (up to 100).
   */
  getLocalHistory(): PlayerGameHistoryItem[] {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (stored) {
        return JSON.parse(stored) as PlayerGameHistoryItem[];
      }
    } catch (e) {
      console.warn('[PlayerProfileService] Failed reading local history:', e);
    }
    return [];
  },

  /**
   * Saves game history locally.
   */
  saveLocalHistory(history: PlayerGameHistoryItem[]): void {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 100)));
    } catch (e) {
      console.warn('[PlayerProfileService] Failed writing local history:', e);
    }
  },

  /**
   * Retrieves pending offline sync queue (Lot 3 - B).
   */
  getPendingOfflineQueue(): PendingOfflineSyncItem[] {
    try {
      const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  /**
   * Persists pending offline sync queue to localStorage (Lot 3 - B).
   */
  savePendingOfflineQueue(queue: PendingOfflineSyncItem[]): void {
    try {
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue.slice(0, 150)));
    } catch (e) {
      console.warn('[PlayerProfileService] Failed to persist offline queue:', e);
    }
  },

  /**
   * Enqueues an operation for asynchronous background sync to Firestore (Lot 3 - B).
   */
  enqueueOfflineSync(item: Omit<PendingOfflineSyncItem, 'queuedAt' | 'retryCount'>): void {
    const queue = this.getPendingOfflineQueue();
    const filtered = queue.filter((q) => q.id !== item.id);

    // Sanitize payload: never store 'email' in offline queue for users/{uid} root document
    let sanitizedPayload = item.payload;
    if (
      item.docPath.startsWith('users/') &&
      !item.docPath.includes('/private') &&
      sanitizedPayload &&
      typeof sanitizedPayload === 'object' &&
      'email' in sanitizedPayload
    ) {
      const { email, ...rest } = sanitizedPayload;
      sanitizedPayload = rest;
    }

    filtered.push({
      ...item,
      payload: sanitizedPayload,
      queuedAt: Date.now(),
      retryCount: 0,
    });
    this.savePendingOfflineQueue(filtered);
    console.log(`[PlayerProfileService] Enqueued offline item: ${item.type} (${item.id})`);
  },

  /**
   * Flushes all pending offline sync items to Firestore (Lot 3 - B).
   */
  async flushOfflineSyncQueue(): Promise<{ syncedCount: number; remainingCount: number }> {
    const queue = this.getPendingOfflineQueue();
    if (queue.length === 0) return { syncedCount: 0, remainingCount: 0 };
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { syncedCount: 0, remainingCount: queue.length };
    }
    if (!auth.currentUser) {
      return { syncedCount: 0, remainingCount: queue.length };
    }

    let syncedCount = 0;
    const remaining: PendingOfflineSyncItem[] = [];

    for (const item of queue) {
      try {
        let payload = item.payload;
        // Strict guard: ensure email is never written to users/{uid} root document and Google markers are set
        if (
          item.docPath.startsWith('users/') &&
          !item.docPath.includes('/private') &&
          !item.docPath.includes('/history') &&
          payload &&
          typeof payload === 'object'
        ) {
          const { email, ...rest } = payload;
          payload = {
            ...rest,
            isGuest: false,
            authProvider: 'google.com',
          };
        }

        const docRef = doc(db, item.docPath);
        await setDoc(docRef, payload, { merge: true });
        syncedCount++;
      } catch (err) {
        console.warn(`[PlayerProfileService] Retry failed for offline item ${item.id}:`, err);
        const nextRetry = (item.retryCount || 0) + 1;
        if (nextRetry < 10) {
          remaining.push({ ...item, retryCount: nextRetry });
        }
      }
    }

    this.savePendingOfflineQueue(remaining);
    if (syncedCount > 0) {
      console.log(`[PlayerProfileService] Successfully flushed ${syncedCount} offline sync items to Firestore.`);
    }
    return { syncedCount, remainingCount: remaining.length };
  },

  /**
   * Records the result of an individual Partie (Lot 3 - A & B).
   * Calculates actual pot, credits winner, debits losers, applies Kora/Double Kora multipliers,
   * updates persistent chips balance, updates statistics, and saves to Firestore.
   */
  async recordPartieResult(params: {
    id?: string;
    mode: 'SOLO' | 'MULTIPLAYER';
    partieNumber: number;
    playerCount: number;
    winType: 'STANDARD' | 'KORA' | 'DOUBLE_KORA' | 'THREE_SEVENS' | 'UNDER_21' | 'FORFEIT';
    isWinner: boolean;
    winnerName: string;
    winnerId?: string;
    potWon: number;
    netChipsDelta: number;
    baseBet: number;
    durationSeconds?: number;
    opponents?: PlayerOpponentSummary[];
    tricksWon?: number;
    roomId?: string;
    difficulty?: 'EASY' | 'NORMAL' | 'EXPERT' | 'GRAND_MASTER' | string;
    settlement?: { gross: number; net: number };
  }): Promise<PlayerProfile> {
    const profile = this.getLocalProfile();
    if (params.id) {
      try {
        const storedIdsRaw = localStorage.getItem('njambo_recorded_result_ids_v1');
        let recordedIds: string[] = storedIdsRaw ? JSON.parse(storedIdsRaw) : [];
        if (!Array.isArray(recordedIds)) {
          recordedIds = [];
        }
        if (recordedIds.includes(params.id)) {
          console.log(`[PlayerProfileService] Duplicate recordPartieResult detected for ID: ${params.id}. Aborting.`);
          return profile;
        }
      } catch (e) {
        console.warn('[PlayerProfileService] Error checking duplicate result ID:', e);
      }
    }

    const history = this.getLocalHistory();

    const partieId = params.id || `partie_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const historyItem: PlayerGameHistoryItem = {
      id: partieId,
      recordType: 'PARTIE',
      mode: params.mode,
      partieNumber: params.partieNumber,
      playerCount: params.playerCount,
      winType: params.winType,
      isWinner: params.isWinner,
      winnerName: params.winnerName,
      winnerId: params.winnerId,
      potWon: params.potWon,
      netChipsDelta: params.netChipsDelta,
      baseBet: params.baseBet,
      roundsCount: params.partieNumber,
      durationSeconds: params.durationSeconds || 30,
      opponents: params.opponents || [],
      tricksWon: params.tricksWon || 0,
      difficulty: params.difficulty,
      status: 'completed',
      createdAt: Date.now(),
      isDoubleKora: params.winType === 'DOUBLE_KORA',
      isUnder21: params.winType === 'UNDER_21',
      isThreeSevens: params.winType === 'THREE_SEVENS',
      roomId: params.roomId,
    };

    // Keep up to 100 items
    const updatedHistory = [historyItem, ...history.filter((h) => h.id !== partieId)].slice(0, 100);
    this.saveLocalHistory(updatedHistory);

    // Record direct rivalry matches against human opponents
    if (params.opponents && params.opponents.length > 0) {
      try {
        params.opponents.forEach((opp) => {
          if (opp.name && opp.name.toLowerCase() !== 'katika' && !opp.id?.startsWith('bot_')) {
            RivalryService.recordDirectMatch(
              {
                id: partieId,
                createdAt: Date.now(),
                isPlayerWinner: params.isWinner,
                winnerName: params.winnerName,
                winnerId: params.winnerId,
                winType: params.winType,
                baseBet: params.baseBet,
                potWon: params.potWon,
                netDelta: params.netChipsDelta,
                playerTricks: params.tricksWon || 0,
                opponentTricks: (opp as any).tricksWon || 0,
                mode: params.mode,
                recordType: 'PARTIE',
              },
              opp.id,
              opp.name
            );
          }
        });
      } catch (rErr) {
        console.warn('[PlayerProfileService] Failed to record direct rivalry match:', rErr);
      }
    }

    // Update persistent chips balance
    const currentChips = typeof profile.chips === 'number' && !isNaN(profile.chips) ? profile.chips : 1000;
    const newChips = Math.max(0, currentChips + params.netChipsDelta);

    // Update stats safely
    const stats: PlayerStats = { ...DEFAULT_PLAYER_STATS, ...(profile.stats || {}) };
    (Object.keys(DEFAULT_PLAYER_STATS) as Array<keyof PlayerStats>).forEach((key) => {
      if (typeof stats[key] !== 'number' || isNaN(stats[key])) {
        stats[key] = 0;
      }
    });

    stats.partiesPlayed += 1;
    if (params.isWinner) {
      stats.partiesWon += 1;
      if (params.mode === 'SOLO') {
        stats.soloGamesWon = (stats.soloGamesWon || 0) + 1;
        const diff = (params.difficulty || '').toUpperCase();
        if (diff === 'EXPERT' || diff === 'GRAND_MASTER' || diff === 'HARD') {
          stats.soloGamesWonHard = (stats.soloGamesWonHard || 0) + 1;
        } else if (diff === 'EASY') {
          stats.soloGamesWonEasy = (stats.soloGamesWonEasy || 0) + 1;
        } else {
          stats.soloGamesWonNormal = (stats.soloGamesWonNormal || 0) + 1;
        }
      } else {
        stats.multiplayerGamesWon = (stats.multiplayerGamesWon || 0) + 1;
      }

      if (params.winType === 'KORA') {
        stats.koraCount += 1;
        if (params.mode === 'SOLO') {
          stats.soloKoraCount = (stats.soloKoraCount || 0) + 1;
          const diff = (params.difficulty || '').toUpperCase();
          if (diff === 'EXPERT' || diff === 'GRAND_MASTER' || diff === 'HARD') {
            stats.soloKorasHard = (stats.soloKorasHard || 0) + 1;
          } else if (diff === 'EASY') {
            stats.soloKorasEasy = (stats.soloKorasEasy || 0) + 1;
          } else {
            stats.soloKorasNormal = (stats.soloKorasNormal || 0) + 1;
          }
        } else {
          stats.multiplayerKoraCount = (stats.multiplayerKoraCount || 0) + 1;
        }
      } else if (params.winType === 'DOUBLE_KORA') {
        stats.koraCount += 1;
        stats.doubleKoraCount += 1;
        if (params.mode === 'SOLO') {
          stats.soloKoraCount = (stats.soloKoraCount || 0) + 1;
          stats.soloDoubleKoraCount = (stats.soloDoubleKoraCount || 0) + 1;
          const diff = (params.difficulty || '').toUpperCase();
          if (diff === 'EXPERT' || diff === 'GRAND_MASTER' || diff === 'HARD') {
            stats.soloDoubleKorasHard = (stats.soloDoubleKorasHard || 0) + 1;
          } else if (diff === 'EASY') {
            stats.soloDoubleKorasEasy = (stats.soloDoubleKorasEasy || 0) + 1;
          } else {
            stats.soloDoubleKorasNormal = (stats.soloDoubleKorasNormal || 0) + 1;
          }
        } else {
          stats.multiplayerKoraCount = (stats.multiplayerKoraCount || 0) + 1;
          stats.multiplayerDoubleKoraCount = (stats.multiplayerDoubleKoraCount || 0) + 1;
        }
      } else if (params.winType === 'UNDER_21') {
        stats.under21Count += 1;
      } else if (params.winType === 'THREE_SEVENS') {
        stats.threeSevensCount += 1;
      }
    }

    if (params.mode === 'SOLO') {
      stats.soloGamesPlayed = (stats.soloGamesPlayed || 0) + 1;
      const gain = params.isWinner ? params.potWon : 0;
      const loss = params.isWinner ? params.baseBet : Math.abs(params.netChipsDelta);
      stats.soloGains = (stats.soloGains || 0) + gain;
      stats.soloPertes = (stats.soloPertes || 0) + loss;
      stats.soloFortune = stats.soloGains - stats.soloPertes;
    } else {
      stats.multiplayerGamesPlayed = (stats.multiplayerGamesPlayed || 0) + 1;
      if (params.settlement) {
        const { gross, net } = params.settlement;
        stats.multiplayerGains = (stats.multiplayerGains || 0) + gross;
        stats.multiplayerPertes = (stats.multiplayerPertes || 0) + (gross - net);
        stats.fortune = stats.multiplayerGains - stats.multiplayerPertes;
      } else {
        const gain = params.isWinner ? params.potWon : 0;
        const loss = params.isWinner ? params.baseBet : Math.abs(params.netChipsDelta);
        stats.multiplayerGains = (stats.multiplayerGains || 0) + gain;
        stats.multiplayerPertes = (stats.multiplayerPertes || 0) + loss;
        stats.fortune = stats.multiplayerGains - stats.multiplayerPertes;
      }
    }

    // Calculer les ratios de victoire
    stats.soloWinRate = stats.soloGamesPlayed > 0 
      ? Math.round(((stats.soloGamesWon || 0) / stats.soloGamesPlayed) * 100) 
      : 0;
    stats.multiplayerWinRate = stats.multiplayerGamesPlayed > 0 
      ? Math.round(((stats.multiplayerGamesWon || 0) / stats.multiplayerGamesPlayed) * 100) 
      : 0;

    stats.gamesPlayed = (stats.soloGamesPlayed || 0) + (stats.multiplayerGamesPlayed || 0);
    stats.gamesWon = (stats.soloGamesWon || 0) + (stats.multiplayerGamesWon || 0);
    stats.gamesLost = Math.max(0, stats.gamesPlayed - stats.gamesWon);
    stats.winRate = stats.gamesPlayed > 0 ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0;

    if (params.isWinner && params.potWon > stats.biggestPotWon) {
      stats.biggestPotWon = params.potWon;
    }

    if (typeof params.tricksWon === 'number') {
      stats.totalTricksWon += params.tricksWon;
    }
    if (stats.partiesPlayed > 0) {
      stats.averageTricksPerGame = parseFloat((stats.totalTricksWon / stats.partiesPlayed).toFixed(1));
    }

    // Compute potential mastery points for this partie
    let potentialMastery = 0;
    if (params.isWinner) {
      potentialMastery = computeEventMasteryScore({
        mode: params.mode,
        difficulty: params.difficulty,
        partiesWon: 1,
        koras: params.winType === 'KORA' ? 1 : 0,
        doubleKoras: params.winType === 'DOUBLE_KORA' ? 1 : 0,
      });
    }

    // Apply daily solo cap (30 pts Douala date)
    let partieMasteryAwarded = 0;
    let updatedSoloDaily = profile.soloDaily;

    if (params.mode === 'SOLO' && potentialMastery > 0) {
      const res = computeAwardedSoloMastery(potentialMastery, profile, history);
      partieMasteryAwarded = res.awarded;
      updatedSoloDaily = res.soloDaily;
    } else {
      partieMasteryAwarded = potentialMastery;
    }

    historyItem.masteryPointsAwarded = partieMasteryAwarded;
    stats.masteryScore = (stats.masteryScore || 0) + partieMasteryAwarded;

    const { currentTitle } = computeHonorificTitle(stats);

    // Clean completion of a partie resets consecutive forfeits
    const fairPlay: PlayerFairPlay = {
      ...DEFAULT_PLAYER_FAIR_PLAY,
      ...(profile.fairPlay || {}),
    };
    if (params.winType !== 'FORFEIT') {
      fairPlay.consecutiveForfeits = 0;
    }

    const updatedProfile: PlayerProfile = {
      ...profile,
      chips: newChips,
      stats,
      fairPlay,
      soloDaily: updatedSoloDaily,
      honorificTitleId: currentTitle.id,
      updatedAt: Date.now(),
    };

    this.saveLocalProfile(updatedProfile);

    if (params.id) {
      try {
        const storedIdsRaw = localStorage.getItem('njambo_recorded_result_ids_v1');
        let recordedIds: string[] = storedIdsRaw ? JSON.parse(storedIdsRaw) : [];
        if (!Array.isArray(recordedIds)) {
          recordedIds = [];
        }
        recordedIds.push(params.id);
        if (recordedIds.length > 200) {
          recordedIds = recordedIds.slice(recordedIds.length - 200);
        }
        localStorage.setItem('njambo_recorded_result_ids_v1', JSON.stringify(recordedIds));
      } catch (e) {
        console.warn('[PlayerProfileService] Error saving duplicate result ID:', e);
      }
    }

    // Invalidate local leaderboard cache to force fresh fetch on next open
    try {
      LeaderboardService.clearCache();
    } catch {}

    // Firestore persistence for Google authenticated users (with offline queue tolerance - Lot 3 - B)
    if (this.isGoogleAuthenticated() && auth.currentUser) {
      const uid = auth.currentUser.uid;
      const { email: _unusedEmail, ...profilePayloadWithoutEmail } = updatedProfile;
      profilePayloadWithoutEmail.isGuest = false;
      profilePayloadWithoutEmail.authProvider = 'google.com';
      try {
        const userRef = doc(db, 'users', uid);
        await setDoc(userRef, profilePayloadWithoutEmail, { merge: true });
      } catch (err) {
        console.warn('[PlayerProfileService] Firestore user profile sync failed, enqueuing to offline sync queue:', err);
        this.enqueueOfflineSync({
          id: `profile_${uid}_${Date.now()}`,
          type: 'PROFILE',
          userId: uid,
          docPath: `users/${uid}`,
          payload: profilePayloadWithoutEmail,
        });
      }

      try {
        const historyRef = doc(db, 'users', uid, 'history', partieId);
        await setDoc(historyRef, historyItem, { merge: true });
        // Trigger asynchronous flush of any previously queued offline operations
        this.flushOfflineSyncQueue().catch(() => {});
      } catch (histErr) {
        console.warn('[PlayerProfileService] Firestore partie history sync failed, enqueuing to offline sync queue:', histErr);
        this.enqueueOfflineSync({
          id: `history_${partieId}`,
          type: 'PARTIE',
          userId: uid,
          docPath: `users/${uid}/history/${partieId}`,
          payload: historyItem,
        });
      }
    }

    return updatedProfile;
  },

  /**
   * Records a completed or abandoned Manche into player history and updates aggregated stats.
   * If skipStatsIncrement is true or recordType is 'MANCHE', only history and fair-play state are updated,
   * preventing double-counting of games/wins already recorded by recordPartieResult.
   */
  async recordGame(
    item: Omit<PlayerGameHistoryItem, 'id' | 'createdAt'> & { id?: string; createdAt?: number },
    options?: { skipStatsIncrement?: boolean; skipGamesPlayedIncrement?: boolean }
  ): Promise<PlayerProfile> {
    const profile = this.getLocalProfile();
    const history = this.getLocalHistory();

    const gameId = item.id || `game_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const historyItem: PlayerGameHistoryItem = {
      ...item,
      id: gameId,
      recordType: item.recordType || 'MANCHE',
      createdAt: item.createdAt || Date.now(),
    };

    // Deduplicate
    const updatedHistory = [historyItem, ...history.filter((h) => h.id !== gameId)].slice(0, 100);
    this.saveLocalHistory(updatedHistory);

    // Update stats safely
    const stats: PlayerStats = { ...DEFAULT_PLAYER_STATS, ...(profile.stats || {}) };
    (Object.keys(DEFAULT_PLAYER_STATS) as Array<keyof PlayerStats>).forEach((key) => {
      if (typeof stats[key] !== 'number' || isNaN(stats[key])) {
        stats[key] = 0;
      }
    });

    const shouldIncrementStats = !options?.skipStatsIncrement && item.recordType === 'PARTIE';

    if (shouldIncrementStats) {
      stats.gamesPlayed += 1;
      if (item.isWinner) {
        stats.gamesWon += 1;
        if (item.winType === 'KORA') {
          stats.koraCount += 1;
        } else if (item.winType === 'DOUBLE_KORA') {
          stats.doubleKoraCount += 1;
        } else if (item.winType === 'UNDER_21') {
          stats.under21Count += 1;
        } else if (item.winType === 'THREE_SEVENS') {
          stats.threeSevensCount += 1;
        }
      }
      stats.gamesLost = Math.max(0, stats.gamesPlayed - stats.gamesWon);
      stats.winRate = Math.round((stats.gamesWon / Math.max(1, stats.gamesPlayed)) * 100);

      if (item.mode === 'SOLO') {
        stats.soloGamesPlayed += 1;
      } else {
        stats.multiplayerGamesPlayed += 1;
      }
    }

    // Record Manche stats
    if (item.recordType === 'MANCHE' || !item.recordType) {
      if (item.status === 'abandoned' || item.winType === 'FORFEIT') {
        // Abandon: count as 1 played game without win (once)
        if (!options?.skipGamesPlayedIncrement) {
          stats.gamesPlayed = (stats.gamesPlayed || 0) + 1;
          if (item.mode === 'SOLO') {
            stats.soloGamesPlayed = (stats.soloGamesPlayed || 0) + 1;
          } else {
            stats.multiplayerGamesPlayed = (stats.multiplayerGamesPlayed || 0) + 1;
          }
        }
        stats.gamesLost = Math.max(0, stats.gamesPlayed - stats.gamesWon);
        stats.winRate = stats.gamesPlayed > 0 ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0;
      } else {
        // Normal finished manche
        stats.manchesPlayed = (stats.manchesPlayed || 0) + 1;
        if (item.isWinner) {
          stats.manchesWon = (stats.manchesWon || 0) + 1;
          if (item.mode === 'MULTIPLAYER') {
            stats.multiplayerManchesWon = (stats.multiplayerManchesWon || 0) + 1;
          } else {
            stats.soloManchesWon = (stats.soloManchesWon || 0) + 1;
            const diff = (item.difficulty || '').toUpperCase();
            if (diff === 'EXPERT' || diff === 'GRAND_MASTER' || diff === 'HARD') {
              stats.soloManchesWonHard = (stats.soloManchesWonHard || 0) + 1;
            } else if (diff === 'EASY') {
              stats.soloManchesWonEasy = (stats.soloManchesWonEasy || 0) + 1;
            } else {
              stats.soloManchesWonNormal = (stats.soloManchesWonNormal || 0) + 1;
            }
          }
        }
      }
    }

    if (item.isWinner && item.potWon > stats.biggestPotWon) {
      stats.biggestPotWon = item.potWon;
    }

    // Compute potential mastery points for this event
    let potentialMastery = 0;
    if (item.isWinner) {
      potentialMastery = computeEventMasteryScore({
        mode: item.mode,
        difficulty: item.difficulty,
        isMancheWinner: item.recordType === 'MANCHE' || !item.recordType,
        isForfeitWin: item.winType === 'FORFEIT',
        partiesWon: item.recordType === 'PARTIE' ? 1 : 0,
        koras: item.winType === 'KORA' ? 1 : 0,
        doubleKoras: item.winType === 'DOUBLE_KORA' ? 1 : 0,
      });
    } else if (item.status === 'abandoned' || item.winType === 'FORFEIT') {
      // Forfeit penalty check in multiplayer
      if (item.mode === 'MULTIPLAYER') {
        const last20Multi = history
          .filter((h) => h.mode === 'MULTIPLAYER')
          .slice(0, MASTERY_CONFIG.rules.forfeitCheckWindow);
        const hasRecentForfeit = last20Multi.some(
          (h) => h.status === 'abandoned' || h.winType === 'FORFEIT'
        );
        if (hasRecentForfeit) {
          potentialMastery = -MASTERY_CONFIG.rules.forfeitPenaltyMultiplayer; // -5
        }
      }
    }

    let gameMasteryAwarded = 0;
    let updatedSoloDaily = profile.soloDaily;

    if (item.mode === 'SOLO' && potentialMastery > 0) {
      const res = computeAwardedSoloMastery(potentialMastery, profile, history);
      gameMasteryAwarded = res.awarded;
      updatedSoloDaily = res.soloDaily;
    } else {
      gameMasteryAwarded = potentialMastery;
    }

    historyItem.masteryPointsAwarded = gameMasteryAwarded;
    stats.masteryScore = Math.max(0, (stats.masteryScore || 0) + gameMasteryAwarded);

    const { currentTitle } = computeHonorificTitle(stats);

    const fairPlay: PlayerFairPlay = {
      ...DEFAULT_PLAYER_FAIR_PLAY,
      ...(profile.fairPlay || {}),
    };
    if (item.status === 'completed' && item.winType !== 'FORFEIT') {
      fairPlay.consecutiveForfeits = 0;
    }

    const updatedProfile: PlayerProfile = {
      ...profile,
      stats,
      fairPlay,
      soloDaily: updatedSoloDaily,
      honorificTitleId: currentTitle.id,
      updatedAt: Date.now(),
    };

    this.saveLocalProfile(updatedProfile);

    // Invalidate local leaderboard cache to force fresh fetch on next open
    try {
      LeaderboardService.clearCache();
    } catch {}

    // If authenticated with Google in Firestore, persist there asynchronously (with offline queue tolerance - Lot 3 - B)
    if (this.isGoogleAuthenticated() && auth.currentUser) {
      const uid = auth.currentUser.uid;
      const { email: _unusedEmail, ...profilePayloadWithoutEmail } = updatedProfile;
      profilePayloadWithoutEmail.isGuest = false;
      profilePayloadWithoutEmail.authProvider = 'google.com';
      try {
        const userRef = doc(db, 'users', uid);
        await setDoc(userRef, profilePayloadWithoutEmail, { merge: true });
      } catch (err) {
        console.warn('[PlayerProfileService] Firestore game user profile sync failed, enqueuing to offline sync queue:', err);
        this.enqueueOfflineSync({
          id: `profile_${uid}_${Date.now()}`,
          type: 'PROFILE',
          userId: uid,
          docPath: `users/${uid}`,
          payload: profilePayloadWithoutEmail,
        });
      }

      try {
        const historyRef = doc(db, 'users', uid, 'history', gameId);
        await setDoc(historyRef, historyItem, { merge: true });
        this.flushOfflineSyncQueue().catch(() => {});
      } catch (histErr) {
        console.warn('[PlayerProfileService] Firestore game history sync failed, enqueuing to offline sync queue:', histErr);
        this.enqueueOfflineSync({
          id: `history_${gameId}`,
          type: 'GAME',
          userId: uid,
          docPath: `users/${uid}/history/${gameId}`,
          payload: historyItem,
        });
      }
    }

    return updatedProfile;
  },

  /**
   * Registers a forfeit, Fold Round, or prolonged disconnect and applies graduated fair-play sanctions.
   * Lot 3 - C: Détection des abandons & sanctions graduées.
   */
  async registerFairPlayIncident(params: {
    type: 'FORFEIT' | 'FOLD_ROUND' | 'PROLONGED_DISCONNECT';
    roomId?: string;
    gameId?: string;
  }): Promise<{ profile: PlayerProfile; sanction: FairPlaySanction | null; message: string }> {
    const profile = this.getLocalProfile();
    const fairPlay: PlayerFairPlay = {
      ...DEFAULT_PLAYER_FAIR_PLAY,
      ...(profile.fairPlay || {}),
    };

    fairPlay.consecutiveForfeits += 1;
    if (params.type === 'FORFEIT') fairPlay.totalForfeits += 1;
    if (params.type === 'FOLD_ROUND') fairPlay.totalFoldRounds += 1;
    if (params.type === 'PROLONGED_DISCONNECT') fairPlay.prolongedDisconnects += 1;

    const totalGames = (profile.stats.gamesPlayed || 0) + 1;
    const totalIncidents = fairPlay.totalForfeits + fairPlay.prolongedDisconnects;
    fairPlay.disconnectRate = parseFloat((totalIncidents / Math.max(1, totalGames)).toFixed(2));

    const now = Date.now();
    let newSanction: FairPlaySanction | null = null;
    let message = '';

    // Graduated sanctions:
    // 1st: Friendly warning notification
    // 2nd: Formal WARNING
    // 3rd: RESTRICT_CREATE_ROOM (15 minutes)
    // 4th: RESTRICT_JOIN_PRIVATE (30 minutes)
    // 5th+ or disconnectRate >= 40%: TEMP_BAN (1 hour)
    if (fairPlay.consecutiveForfeits >= 5 || (totalGames >= 10 && fairPlay.disconnectRate >= 0.4)) {
      newSanction = {
        type: 'TEMP_BAN',
        reason: 'Abandons excessifs ou déconnexions prolongées répétées',
        issuedAt: now,
        expiresAt: now + 60 * 60 * 1000, // 1 heure
        active: true,
      };
      message = '🚫 Sanction Fair-Play : Suspension temporaire du multijoueur pendant 1 heure.';
    } else if (fairPlay.consecutiveForfeits === 4) {
      newSanction = {
        type: 'RESTRICT_JOIN_PRIVATE',
        reason: '4 abandons consécutifs',
        issuedAt: now,
        expiresAt: now + 30 * 60 * 1000, // 30 minutes
        active: true,
      };
      message = '⚠️ Sanction Fair-Play : Restriction de rejoindre des tables privées pendant 30 minutes.';
    } else if (fairPlay.consecutiveForfeits === 3) {
      newSanction = {
        type: 'RESTRICT_CREATE_ROOM',
        reason: '3 abandons consécutifs',
        issuedAt: now,
        expiresAt: now + 15 * 60 * 1000, // 15 minutes
        active: true,
      };
      message = '⚠️ Sanction Fair-Play : Création de salon suspendue pendant 15 minutes.';
    } else if (fairPlay.consecutiveForfeits === 2) {
      newSanction = {
        type: 'WARNING',
        reason: '2 abandons consécutifs détectés',
        issuedAt: now,
        expiresAt: now + 24 * 60 * 60 * 1000,
        active: true,
      };
      message = '⚠️ Avertissement Fair-Play : 2 abandons consécutifs. Le prochain entraînera une suspension de création de salon (15 min).';
    } else {
      message = 'ℹ️ Rappel Fair-Play : Quitter une partie pénalise les autres joueurs et affecte votre réputation.';
    }

    if (newSanction) {
      fairPlay.activeSanction = newSanction;
      fairPlay.sanctionsHistory = [newSanction, ...(fairPlay.sanctionsHistory || [])].slice(0, 20);
    }

    const updatedProfile: PlayerProfile = {
      ...profile,
      fairPlay,
      updatedAt: now,
    };

    this.saveLocalProfile(updatedProfile);

    // Sync to Firestore & log to Katika fair-play audit (with offline queue tolerance - Lot 3 - B)
    if (this.isGoogleAuthenticated() && auth.currentUser) {
      const uid = auth.currentUser.uid;
      const { email: _unusedEmail, ...profilePayloadWithoutEmail } = updatedProfile;
      profilePayloadWithoutEmail.isGuest = false;
      profilePayloadWithoutEmail.authProvider = 'google.com';
      try {
        const userRef = doc(db, 'users', uid);
        await setDoc(userRef, profilePayloadWithoutEmail, { merge: true });

        if (newSanction) {
          const sanctionRef = doc(db, 'fairplay_sanctions', `sanction_${uid}_${now}`);
          await setDoc(sanctionRef, {
            id: `sanction_${uid}_${now}`,
            userId: uid,
            userName: profile.displayName,
            sanction: newSanction,
            incidentType: params.type,
            roomId: params.roomId || null,
            createdAt: now,
          });
        }
      } catch (err) {
        console.warn('[PlayerProfileService] Fair play sync warning, enqueuing to offline sync queue:', err);
        this.enqueueOfflineSync({
          id: `profile_${uid}_${now}`,
          type: 'PROFILE',
          userId: uid,
          docPath: `users/${uid}`,
          payload: profilePayloadWithoutEmail,
        });
        if (newSanction) {
          this.enqueueOfflineSync({
            id: `sanction_${uid}_${now}`,
            type: 'SANCTION',
            userId: uid,
            docPath: `fairplay_sanctions/sanction_${uid}_${now}`,
            payload: {
              id: `sanction_${uid}_${now}`,
              userId: uid,
              userName: profile.displayName,
              sanction: newSanction,
              incidentType: params.type,
              roomId: params.roomId || null,
              createdAt: now,
            },
          });
        }
      }
    }

    return { profile: updatedProfile, sanction: newSanction, message };
  },

  /**
   * Checks if the player currently has an active, unexpired sanction.
   */
  getActiveSanction(profile?: PlayerProfile): FairPlaySanction | null {
    const p = profile || this.getLocalProfile();
    const sanction = p.fairPlay?.activeSanction;
    if (!sanction || typeof sanction !== 'object' || !sanction.active) return null;
    if (sanction.expiresAt && Date.now() > sanction.expiresAt) {
      // Expired!
      try {
        sanction.active = false;
        if (p.fairPlay) p.fairPlay.activeSanction = null;
        this.saveLocalProfile(p);
      } catch (e) {
        console.error('Error auto-expiring sanction:', e);
      }
      return null;
    }
    return sanction;
  },

  /**
   * Real-time consolidation of player stats from Firestore /users/{uid} and /users/{uid}/history.
   * Caches result locally for offline tolerance and resilience (Lot 3 - B).
   */
  async fetchConsolidatedStats(userId: string): Promise<{
    stats: PlayerStats;
    history: PlayerGameHistoryItem[];
    chips: number;
  } | null> {
    try {
      const userRef = doc(db, 'users', userId);
      const snap = await getDoc(userRef);
      if (!snap.exists()) return null;

      const profileData = snap.data() as PlayerProfile;
      const histQuery = query(
        collection(db, 'users', userId, 'history'),
        orderBy('createdAt', 'desc'),
        limit(15)
      );
      const histSnap = await getDocs(histQuery);
      const historyItems: PlayerGameHistoryItem[] = histSnap.docs.map((d) => d.data() as PlayerGameHistoryItem);

      // Consolidate real-time stats using the maximum between the cloud profile and local profile
      const cloudStats: Partial<PlayerStats> = profileData.stats || {};
      const localProfile = this.getLocalProfile();
      const localStats = localProfile.stats || {};

      // Les compteurs cumulés numériques
      const cumulativeFields: Array<keyof PlayerStats> = [
        'partiesPlayed',
        'partiesWon',
        'soloGamesWon',
        'multiplayerGamesWon',
        'soloGamesPlayed',
        'multiplayerGamesPlayed',
        'soloKoraCount',
        'multiplayerKoraCount',
        'soloDoubleKoraCount',
        'multiplayerDoubleKoraCount',
        'soloGains',
        'soloPertes',
        'multiplayerGains',
        'multiplayerPertes',
        'gamesPlayed',
        'gamesWon',
      ];

      const consolidatedStats: PlayerStats = {
        ...DEFAULT_PLAYER_STATS,
        ...localStats,
        ...cloudStats,
      };

      // Étape 1 : Diagnostic - Calculer à titre de diagnostic ce qu'aurait été la valeur avec l'ancien algorithme basé sur l'historique des 15 derniers items.
      const parties = historyItems.filter((h) => h.recordType === 'PARTIE');
      const manches = historyItems.filter((h) => h.recordType === 'MANCHE' || !h.recordType);
      const soloParties = parties.filter((p) => p.mode === 'SOLO');
      const multiParties = parties.filter((p) => p.mode === 'MULTIPLAYER');

      const diagRecalc: Partial<PlayerStats> = {
        partiesPlayed: parties.length > 0 ? parties.length : cloudStats.partiesPlayed || 0,
        partiesWon: parties.filter((p) => p.isWinner).length,
        soloGamesWon: parties.filter((p) => p.isWinner && p.mode === 'SOLO').length,
        multiplayerGamesWon: parties.filter((p) => p.isWinner && p.mode === 'MULTIPLAYER').length,
        soloGamesPlayed: soloParties.length,
        multiplayerGamesPlayed: multiParties.length,
        soloKoraCount: soloParties.filter((p) => p.winType === 'KORA' || p.winType === 'DOUBLE_KORA').length,
        multiplayerKoraCount: multiParties.filter((p) => p.winType === 'KORA' || p.winType === 'DOUBLE_KORA').length,
        soloDoubleKoraCount: soloParties.filter((p) => p.winType === 'DOUBLE_KORA').length,
        multiplayerDoubleKoraCount: multiParties.filter((p) => p.winType === 'DOUBLE_KORA').length,
      };

      let diagSoloGains = 0;
      let diagSoloPertes = 0;
      soloParties.forEach((p) => {
        const gain = p.isWinner ? (p.potWon || 0) : 0;
        const loss = p.isWinner ? (p.baseBet || 0) : Math.abs(p.netChipsDelta || 0);
        diagSoloGains += gain;
        diagSoloPertes += loss;
      });
      diagRecalc.soloGains = diagSoloGains;
      diagRecalc.soloPertes = diagSoloPertes;

      let diagMultiGains = 0;
      let diagMultiPertes = 0;
      multiParties.forEach((p) => {
        const gain = p.isWinner ? (p.potWon || 0) : 0;
        const loss = p.isWinner ? (p.baseBet || 0) : Math.abs(p.netChipsDelta || 0);
        diagMultiGains += gain;
        diagMultiPertes += loss;
      });
      diagRecalc.multiplayerGains = diagMultiGains;
      diagRecalc.multiplayerPertes = diagMultiPertes;
      diagRecalc.gamesPlayed = manches.length > 0 ? manches.length : cloudStats.gamesPlayed || 0;
      diagRecalc.gamesWon = manches.filter((m) => m.isWinner).length;

      // Afficher le diagnostic si une valeur recalculée à partir des 15 derniers items est inférieure à la valeur du profil cloud
      Object.entries(diagRecalc).forEach(([field, val]) => {
        const cloudVal = (cloudStats as any)[field] || 0;
        const recalcVal = (val as number) || 0;
        if (recalcVal < cloudVal) {
          console.warn(
            `[PlayerProfileService] [LOT 5 DIAGNOSTIC] Le champ '${field}' recalculé à partir des 15 dernières donnes (${recalcVal}) est inférieur à la valeur du profil cloud (${cloudVal}).`
          );
        }
      });

      // Étape 2 : Correction - Prendre le maximum pour chaque compteur cumulé numérique entre le profil cloud et local
      cumulativeFields.forEach((field) => {
        const cloudVal = typeof cloudStats[field] === 'number' ? (cloudStats[field] as number) : 0;
        const localVal = typeof localStats[field] === 'number' ? (localStats[field] as number) : 0;
        (consolidatedStats as any)[field] = Math.max(cloudVal, localVal);
      });

      // Recalculer les valeurs dérivées
      consolidatedStats.fortune = (consolidatedStats.multiplayerGains || 0) - (consolidatedStats.multiplayerPertes || 0);
      consolidatedStats.soloFortune = (consolidatedStats.soloGains || 0) - (consolidatedStats.soloPertes || 0);
      consolidatedStats.gamesLost = Math.max(0, (consolidatedStats.gamesPlayed || 0) - (consolidatedStats.gamesWon || 0));
      consolidatedStats.winRate =
        (consolidatedStats.gamesPlayed || 0) > 0
          ? Math.round(((consolidatedStats.gamesWon || 0) / (consolidatedStats.gamesPlayed || 0)) * 100)
          : 0;

      // Apply fallback rule for older users who have victories but no detail set
      const rootScoreVersion = profileData.scoreVersion || profileData.stats?.scoreVersion || 1;
      const isV2 = rootScoreVersion >= 2;
      const finalConsolidatedStats = applyStatsFallback(consolidatedStats, rootScoreVersion);

      // Pour scoreVersion >= 2, fetchConsolidatedStats ne doit JAMAIS réécrire masteryScore
      if (isV2) {
        finalConsolidatedStats.masteryScore = profileData.stats?.masteryScore ?? consolidatedStats.masteryScore ?? 0;
      }

      // Reconcile chips: protect against browser cache wipe by prioritizing cloud balance
      const serverChips = typeof profileData.chips === 'number' && !isNaN(profileData.chips) ? profileData.chips : 1000;
      const localChips = typeof localProfile.chips === 'number' && !isNaN(localProfile.chips) ? localProfile.chips : 1000;
      const resolvedChips = Math.max(serverChips, localChips);

      // Update local cache
      if (historyItems.length > 0) {
        this.saveLocalHistory(historyItems);
      }
      const updatedProfile: PlayerProfile = {
        ...profileData,
        chips: resolvedChips,
        stats: finalConsolidatedStats,
        soloDaily: mergeSoloDaily(profileData.soloDaily, localProfile.soloDaily),
      };
      this.saveLocalProfile(updatedProfile);

      // Trigger retroactive migrations sequentially to avoid concurrent state overwriting (protected by isChipsFixRunning)
      if (profileData) {
        if (profileData.chipsFixVersion !== 1) {
          this.migrateSoloFortuneHistory(updatedProfile, userId)
            .then(() => {
              if (profileData.fortuneFixVersion !== 2) {
                const latestProfile = this.getLocalProfile();
                return this.migrateMultiplayerFortuneHistory(latestProfile, userId);
              }
            })
            .catch((err) => {
              console.warn('[PlayerProfileService] Error during sequenced migrations:', err);
            });
        } else if (profileData.fortuneFixVersion !== 2) {
          this.migrateMultiplayerFortuneHistory(updatedProfile, userId).catch((err) => {
            console.warn('[PlayerProfileService] migrateMultiplayerFortuneHistory error:', err);
          });
        }
      }

      // Déterminer s'il y a des différences par rapport au cloud pour éviter des écritures inutiles
      let hasChanges = resolvedChips !== serverChips;
      if (!hasChanges) {
        const cloudStatsKeys = Object.keys(cloudStats) as Array<keyof PlayerStats>;
        for (const key of cloudStatsKeys) {
          if (finalConsolidatedStats[key] !== cloudStats[key]) {
            hasChanges = true;
            break;
          }
        }
        if (!hasChanges) {
          const finalStatsKeys = Object.keys(finalConsolidatedStats) as Array<keyof PlayerStats>;
          for (const key of finalStatsKeys) {
            if (finalConsolidatedStats[key] !== cloudStats[key]) {
              hasChanges = true;
              break;
            }
          }
        }
      }

      // Save consolidated stats back to Firestore for authenticated users to ensure permanent server-side correctness
      if (profileData.isGuest === false && hasChanges) {
        try {
          const userRef = doc(db, 'users', userId);
          const statsToSave = { ...finalConsolidatedStats };
          if (isV2) {
            // Pour scoreVersion >= 2, ne JAMAIS réécrire masteryScore
            statsToSave.masteryScore = profileData.stats?.masteryScore ?? 0;
          }

          // Double garde-fou : s'assurer qu'aucun compteur cumulé numérique n'est inférieur au cloud
          cumulativeFields.forEach((field) => {
            const cloudVal = typeof cloudStats[field] === 'number' ? (cloudStats[field] as number) : 0;
            const currentVal = typeof statsToSave[field] === 'number' ? (statsToSave[field] as number) : 0;
            if (currentVal < cloudVal) {
              (statsToSave as any)[field] = cloudVal;
            }
          });

          await setDoc(
            userRef,
            {
              chips: resolvedChips,
              stats: statsToSave,
              isGuest: false,
              authProvider: 'google.com',
              updatedAt: Date.now(),
            },
            { merge: true }
          );
          console.log('[PlayerProfileService] Successfully consolidated and synced stats & chips to Firestore in background.');
          await this.flushOfflineSyncQueue();
        } catch (err) {
          console.warn('[PlayerProfileService] Failed syncing consolidated stats to Firestore:', err);
        }
      } else if (this.isGoogleAuthenticated()) {
        console.log('[PlayerProfileService] Stats consolidated. No changes compared to Firestore profile. Sync skipped.');
      }

      return {
        stats: finalConsolidatedStats,
        history: historyItems,
        chips: resolvedChips,
      };
    } catch (e) {
      console.warn('[PlayerProfileService] Offline / error fetching consolidated stats:', e);
      return null;
    }
  },

  /**
   * Merges guest data into a Google account seamlessly without data loss.
   */
  async loginWithGoogle(): Promise<{ profile: PlayerProfile; history: PlayerGameHistoryItem[] }> {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const credential = await signInWithPopup(auth, provider);
    const user: User = credential.user;

    const guestProfile = this.getLocalProfile();
    const guestHistory = this.getLocalHistory();

    // Make local emergency backup of guest data
    try {
      localStorage.setItem(
        GUEST_BACKUP_KEY,
        JSON.stringify({ profile: guestProfile, history: guestHistory, backedUpAt: Date.now() })
      );
    } catch (e) {
      console.warn('Backup error:', e);
    }

    // Try fetching existing cloud profile
    let cloudProfile: PlayerProfile | null = null;
    let cloudHistory: PlayerGameHistoryItem[] = [];

    try {
      const userRef = doc(db, 'users', user.uid);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        cloudProfile = snap.data() as PlayerProfile;
      }

      const histQuery = query(
        collection(db, 'users', user.uid, 'history'),
        orderBy('createdAt', 'desc'),
        limit(100)
      );
      const histSnap = await getDocs(histQuery);
      cloudHistory = histSnap.docs.map((d) => d.data() as PlayerGameHistoryItem);
    } catch (err) {
      console.warn('[PlayerProfileService] Could not fetch remote profile:', err);
    }

    // Deduplicate and merge history (cloud + guest)
    const historyMap = new Map<string, PlayerGameHistoryItem>();
    cloudHistory.forEach((item) => historyMap.set(item.id, item));
    guestHistory.forEach((item) => {
      if (!historyMap.has(item.id)) {
        historyMap.set(item.id, item);
      }
    });

    const mergedHistory = Array.from(historyMap.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 100);

    // Merge statistics non-destructively
    const cloudStats = cloudProfile?.stats || { ...DEFAULT_PLAYER_STATS };
    const guestStats = guestProfile.isGuest ? guestProfile.stats : { ...DEFAULT_PLAYER_STATS };
    const isGuestMerge = guestProfile.isGuest;

    // Plafonds stricts de contribution de l'invité selon les limites de firestore.rules
    const cap100 = (v?: number) => Math.min(100, Math.max(0, v || 0));
    const cap30 = (v?: number) => Math.min(30, Math.max(0, v || 0));
    const cap10 = (v?: number) => Math.min(10, Math.max(0, v || 0));

    // Compteurs de parties et de manches (max 100)
    const gPartiesPlayed = isGuestMerge ? cap100(guestStats.partiesPlayed) : 0;
    const gPartiesWon = isGuestMerge ? Math.min(gPartiesPlayed, cap100(guestStats.partiesWon)) : 0;

    const gGamesPlayed = isGuestMerge ? cap100(guestStats.gamesPlayed) : 0;
    const gGamesWon = isGuestMerge ? Math.min(gGamesPlayed, cap100(guestStats.gamesWon)) : 0;
    const gGamesLost = isGuestMerge ? Math.min(cap100(gGamesPlayed - gGamesWon), cap100(guestStats.gamesLost)) : 0;

    const gManchesPlayed = isGuestMerge ? cap100(guestStats.manchesPlayed || guestStats.gamesPlayed) : 0;
    const gManchesWon = isGuestMerge ? Math.min(gManchesPlayed, cap100(guestStats.manchesWon)) : 0;

    const gSoloGamesPlayed = isGuestMerge ? cap100(guestStats.soloGamesPlayed) : 0;
    const gSoloGamesWon = isGuestMerge ? Math.min(gSoloGamesPlayed, cap100(guestStats.soloGamesWon)) : 0;
    const gMultiGamesPlayed = isGuestMerge ? cap100(guestStats.multiplayerGamesPlayed) : 0;
    const gMultiGamesWon = isGuestMerge ? Math.min(gMultiGamesPlayed, cap100(guestStats.multiplayerGamesWon)) : 0;

    const gSoloManchesWon = isGuestMerge ? cap100(guestStats.soloManchesWon) : 0;
    const gMultiManchesWon = isGuestMerge ? cap100(guestStats.multiplayerManchesWon) : 0;
    const gSoloManchesWonEasy = isGuestMerge ? cap100(guestStats.soloManchesWonEasy) : 0;
    const gSoloManchesWonNormal = isGuestMerge ? cap100(guestStats.soloManchesWonNormal) : 0;
    const gSoloManchesWonHard = isGuestMerge ? cap100(guestStats.soloManchesWonHard) : 0;

    const gSoloGamesWonEasy = isGuestMerge ? cap100(guestStats.soloGamesWonEasy) : 0;
    const gSoloGamesWonNormal = isGuestMerge ? cap100(guestStats.soloGamesWonNormal) : 0;
    const gSoloGamesWonHard = isGuestMerge ? cap100(guestStats.soloGamesWonHard) : 0;

    // Compteurs de Koras (max 30) et Doubles Koras (max 10)
    const gKoraCount = isGuestMerge ? cap30(guestStats.koraCount) : 0;
    const gDoubleKoraCount = isGuestMerge ? Math.min(gKoraCount, cap10(guestStats.doubleKoraCount)) : 0;

    const gSoloKoraCount = isGuestMerge ? cap30(guestStats.soloKoraCount) : 0;
    const gMultiKoraCount = isGuestMerge ? cap30(guestStats.multiplayerKoraCount) : 0;
    const gSoloKorasEasy = isGuestMerge ? cap30(guestStats.soloKorasEasy) : 0;
    const gSoloKorasNormal = isGuestMerge ? cap30(guestStats.soloKorasNormal) : 0;
    const gSoloKorasHard = isGuestMerge ? cap30(guestStats.soloKorasHard) : 0;

    const gSoloDoubleKoraCount = isGuestMerge ? cap10(guestStats.soloDoubleKoraCount) : 0;
    const gMultiDoubleKoraCount = isGuestMerge ? cap10(guestStats.multiplayerDoubleKoraCount) : 0;
    const gSoloDoubleKorasEasy = isGuestMerge ? cap10(guestStats.soloDoubleKorasEasy) : 0;
    const gSoloDoubleKorasNormal = isGuestMerge ? cap10(guestStats.soloDoubleKorasNormal) : 0;
    const gSoloDoubleKorasHard = isGuestMerge ? cap10(guestStats.soloDoubleKorasHard) : 0;

    // Recalcul du score de maîtrise de l'invité à partir de son historique local avec plafond quotidien de 30 pts solo
    let guestMasteryPoints = 0;
    if (isGuestMerge) {
      const sortedGuestHistory = [...guestHistory].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      const dailySoloPointsMap = new Map<string, number>();

      for (const h of sortedGuestHistory) {
        let eventPotential = 0;
        if (typeof h.masteryPointsAwarded === 'number' && !isNaN(h.masteryPointsAwarded)) {
          eventPotential = h.masteryPointsAwarded;
        } else if (h.isWinner) {
          if (h.recordType === 'PARTIE') {
            eventPotential = computeEventMasteryScore({
              mode: h.mode,
              difficulty: h.difficulty ?? h.aiDifficulty,
              partiesWon: 1,
              koras: h.winType === 'KORA' ? 1 : 0,
              doubleKoras: h.winType === 'DOUBLE_KORA' ? 1 : 0,
            });
          } else if (h.isMancheFinalWin === true || h.isMancheOver || !h.recordType) {
            eventPotential = computeEventMasteryScore({
              mode: h.mode,
              difficulty: h.difficulty ?? h.aiDifficulty,
              isMancheWinner: true,
              isForfeitWin: h.winType === 'FORFEIT',
              koras: h.winType === 'KORA' ? 1 : 0,
              doubleKoras: h.winType === 'DOUBLE_KORA' ? 1 : 0,
            });
          }
        } else if (h.mode === 'MULTIPLAYER' && (h.status === 'abandoned' || h.winType === 'FORFEIT')) {
          eventPotential = -MASTERY_CONFIG.rules.forfeitPenaltyMultiplayer; // -5
        }

        if (h.mode === 'SOLO' && eventPotential > 0) {
          const dayKey = getDoualaDateKey(h.createdAt || Date.now());
          const currentDaySolo = dailySoloPointsMap.get(dayKey) || 0;
          const cap = MASTERY_CONFIG.rules.dailySoloPointsCap; // 30
          if (currentDaySolo < cap) {
            const awarded = Math.min(eventPotential, cap - currentDaySolo);
            dailySoloPointsMap.set(dayKey, currentDaySolo + awarded);
            guestMasteryPoints += awarded;
          }
        } else {
          guestMasteryPoints = Math.max(0, guestMasteryPoints + eventPotential);
        }
      }

      // Plafonner la contribution totale de l'invité à 300 points de maîtrise
      guestMasteryPoints = Math.min(300, Math.max(0, guestMasteryPoints));
    }

    const partiesCount = (cloudStats.partiesPlayed || 0) + gPartiesPlayed;
    const partiesWonCount = Math.min(partiesCount, (cloudStats.partiesWon || 0) + gPartiesWon);

    const gamesPlayedCount = (cloudStats.gamesPlayed || 0) + gGamesPlayed;
    const gamesWonCount = Math.min(gamesPlayedCount, (cloudStats.gamesWon || 0) + gGamesWon);
    const gamesLostCount = Math.max(0, gamesPlayedCount - gamesWonCount);
    const winRate = gamesPlayedCount > 0 ? Math.round((gamesWonCount / gamesPlayedCount) * 100) : 0;

    const manchesWonCount = (cloudStats.manchesWon || 0) + gManchesWon;
    const manchesPlayedCount = Math.max(
      manchesWonCount,
      (cloudStats.manchesPlayed || cloudStats.gamesPlayed || 0) + gManchesPlayed
    );

    const mergedKoraCount = (cloudStats.koraCount || 0) + gKoraCount;
    const mergedDoubleKoraCount = Math.min(mergedKoraCount, (cloudStats.doubleKoraCount || 0) + gDoubleKoraCount);

    const totalTricks = (cloudStats.totalTricksWon || 0) + (isGuestMerge ? (guestStats.totalTricksWon || 0) : 0);

    const mergedStats: PlayerStats = {
      gamesPlayed: gamesPlayedCount,
      gamesWon: gamesWonCount,
      gamesLost: gamesLostCount,
      winRate,
      partiesPlayed: partiesCount,
      partiesWon: partiesWonCount,
      manchesPlayed: manchesPlayedCount,
      manchesWon: manchesWonCount,
      soloManchesWon: (cloudStats.soloManchesWon || 0) + gSoloManchesWon,
      multiplayerManchesWon: (cloudStats.multiplayerManchesWon || 0) + gMultiManchesWon,
      soloManchesWonHard: (cloudStats.soloManchesWonHard || 0) + gSoloManchesWonHard,
      soloManchesWonNormal: (cloudStats.soloManchesWonNormal || 0) + gSoloManchesWonNormal,
      soloManchesWonEasy: (cloudStats.soloManchesWonEasy || 0) + gSoloManchesWonEasy,
      soloGamesWonEasy: (cloudStats.soloGamesWonEasy || 0) + gSoloGamesWonEasy,
      soloGamesWonNormal: (cloudStats.soloGamesWonNormal || 0) + gSoloGamesWonNormal,
      soloGamesWonHard: (cloudStats.soloGamesWonHard || 0) + gSoloGamesWonHard,
      koraCount: mergedKoraCount,
      doubleKoraCount: mergedDoubleKoraCount,
      soloKorasEasy: (cloudStats.soloKorasEasy || 0) + gSoloKorasEasy,
      soloKorasNormal: (cloudStats.soloKorasNormal || 0) + gSoloKorasNormal,
      soloKorasHard: (cloudStats.soloKorasHard || 0) + gSoloKorasHard,
      soloDoubleKorasEasy: (cloudStats.soloDoubleKorasEasy || 0) + gSoloDoubleKorasEasy,
      soloDoubleKorasNormal: (cloudStats.soloDoubleKorasNormal || 0) + gSoloDoubleKorasNormal,
      soloDoubleKorasHard: (cloudStats.soloDoubleKorasHard || 0) + gSoloDoubleKorasHard,
      under21Count: (cloudStats.under21Count || 0) + (isGuestMerge ? (guestStats.under21Count || 0) : 0),
      threeSevensCount: (cloudStats.threeSevensCount || 0) + (isGuestMerge ? (guestStats.threeSevensCount || 0) : 0),
      biggestPotWon: Math.max(cloudStats.biggestPotWon || 0, isGuestMerge ? Math.min(50000, guestStats.biggestPotWon || 0) : 0),
      totalTricksWon: totalTricks,
      averageTricksPerGame: partiesCount > 0 ? parseFloat((totalTricks / partiesCount).toFixed(1)) : 0,
      soloGamesPlayed: (cloudStats.soloGamesPlayed || 0) + gSoloGamesPlayed,
      multiplayerGamesPlayed: (cloudStats.multiplayerGamesPlayed || 0) + gMultiGamesPlayed,
      soloGamesWon: (cloudStats.soloGamesWon || 0) + gSoloGamesWon,
      multiplayerGamesWon: (cloudStats.multiplayerGamesWon || 0) + gMultiGamesWon,
      forfeitCount: (cloudStats.forfeitCount || 0) + (isGuestMerge ? (guestStats.forfeitCount || 0) : 0),
      foldCount: (cloudStats.foldCount || 0) + (isGuestMerge ? (guestStats.foldCount || 0) : 0),
      fortune: (cloudStats.fortune || 0) + (isGuestMerge ? Math.min(50000, Math.max(-25000, guestStats.fortune || 0)) : 0),
      multiplayerGains: (cloudStats.multiplayerGains || 0) + (isGuestMerge ? Math.min(50000, guestStats.multiplayerGains || 0) : 0),
      multiplayerPertes: (cloudStats.multiplayerPertes || 0) + (isGuestMerge ? Math.min(25000, guestStats.multiplayerPertes || 0) : 0),
      soloKoraCount: (cloudStats.soloKoraCount || 0) + gSoloKoraCount,
      multiplayerKoraCount: (cloudStats.multiplayerKoraCount || 0) + gMultiKoraCount,
      soloDoubleKoraCount: (cloudStats.soloDoubleKoraCount || 0) + gSoloDoubleKoraCount,
      multiplayerDoubleKoraCount: (cloudStats.multiplayerDoubleKoraCount || 0) + gMultiDoubleKoraCount,
      soloGains: (cloudStats.soloGains || 0) + (isGuestMerge ? Math.min(50000, guestStats.soloGains || 0) : 0),
      soloPertes: (cloudStats.soloPertes || 0) + (isGuestMerge ? Math.min(25000, guestStats.soloPertes || 0) : 0),
      soloFortune: (cloudStats.soloFortune || 0) + (isGuestMerge ? Math.min(50000, Math.max(-25000, guestStats.soloFortune || 0)) : 0),
      soloWinRate: 0,
      multiplayerWinRate: 0,
    };

    // Version du score : 2 par défaut pour un compte neuf, version existante pour un compte déjà enregistré
    const targetScoreVersion = cloudProfile ? (cloudProfile.scoreVersion || cloudProfile.stats?.scoreVersion || 1) : 2;
    const isTargetV2 = targetScoreVersion >= 2;

    // Pour scoreVersion >= 2 : somme du score cloud v2 et des points recalculés de l'invité (plafonnés à 300)
    if (isTargetV2) {
      mergedStats.masteryScore = (cloudStats.masteryScore || 0) + guestMasteryPoints;
    }

    // Jetons : plafonnement strict à 20 000 jetons de gain maximum
    const cloudChips = typeof cloudProfile?.chips === 'number' && !isNaN(cloudProfile.chips) ? cloudProfile.chips : 1000;
    const guestChips = typeof guestProfile?.chips === 'number' && !isNaN(guestProfile.chips) ? guestProfile.chips : 1000;
    let mergedChips: number;
    if (cloudProfile) {
      // Compte existant : gain plafonné à 20 000 jetons supplémentaires apportés par l'invité
      const guestGain = isGuestMerge ? Math.min(20000, Math.max(0, guestChips - 1000)) : 0;
      mergedChips = Math.min(cloudChips + 20000, Math.max(cloudChips, cloudChips + guestGain));
    } else {
      // Compte neuf : solde plafonné à 20 000 jetons max (1 000 min)
      mergedChips = isGuestMerge ? Math.min(20000, Math.max(1000, guestChips)) : 1000;
    }

    // Fair play fusion
    const mergedFairPlay: PlayerFairPlay = {
      consecutiveForfeits: 0,
      totalForfeits: (cloudProfile?.fairPlay?.totalForfeits || 0) + (isGuestMerge ? (guestProfile?.fairPlay?.totalForfeits || 0) : 0),
      totalFoldRounds: (cloudProfile?.fairPlay?.totalFoldRounds || 0) + (isGuestMerge ? (guestProfile?.fairPlay?.totalFoldRounds || 0) : 0),
      prolongedDisconnects: (cloudProfile?.fairPlay?.prolongedDisconnects || 0) + (isGuestMerge ? (guestProfile?.fairPlay?.prolongedDisconnects || 0) : 0),
      totalGamesStarted: (cloudProfile?.fairPlay?.totalGamesStarted || 0) + (isGuestMerge ? (guestProfile?.fairPlay?.totalGamesStarted || 0) : 0),
      disconnectRate: 0,
      activeSanction: cloudProfile?.fairPlay?.activeSanction || null,
      sanctionsHistory: [...(cloudProfile?.fairPlay?.sanctionsHistory || []), ...(isGuestMerge ? (guestProfile?.fairPlay?.sanctionsHistory || []) : [])].slice(0, 20),
    };
    mergedFairPlay.disconnectRate = parseFloat(
      ((mergedFairPlay.totalForfeits + mergedFairPlay.prolongedDisconnects) / Math.max(1, gamesPlayedCount + 1)).toFixed(2)
    );

    const finalMergedStats = applyStatsFallback(mergedStats, targetScoreVersion);
    if (isTargetV2) {
      finalMergedStats.masteryScore = mergedStats.masteryScore;
    }
    const { currentTitle } = computeHonorificTitle(finalMergedStats);

    // Resolve display name: keep existing custom name if meaningful, else Google name
    let chosenName = cloudProfile?.displayName || guestProfile.displayName;
    if (chosenName.startsWith('Joueur ') && user.displayName) {
      chosenName = user.displayName;
    }
    chosenName = sanitizeDisplayName(chosenName);

    // guestMergedAt: written once during guest-to-Google fusion, never modified thereafter
    const existingMergedAt = cloudProfile?.guestMergedAt;
    const guestMergedAt = existingMergedAt || (guestProfile.isGuest ? Date.now() : undefined);

    const mergedProfile: PlayerProfile = {
      uid: user.uid,
      displayName: chosenName,
      email: user.email || null,
      photoURL: user.photoURL || null,
      avatarId: cloudProfile?.avatarId || (user.photoURL ? 'google' : guestProfile.avatarId),
      isGuest: false,
      authProvider: 'google.com',
      chips: mergedChips,
      stats: finalMergedStats,
      fairPlay: mergedFairPlay,
      honorificTitleId: currentTitle.id,
      scoreVersion: targetScoreVersion,
      chipsFixVersion: cloudProfile?.chipsFixVersion || guestProfile?.chipsFixVersion,
      fortuneFixVersion: cloudProfile?.fortuneFixVersion || guestProfile?.fortuneFixVersion,
      soloDaily: mergeSoloDaily(cloudProfile?.soloDaily, guestProfile?.soloDaily),
      guestMergedAt,
      createdAt: cloudProfile?.createdAt || guestProfile.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    // Save locally
    this.saveLocalProfile(mergedProfile);
    this.saveLocalHistory(mergedHistory);

    // Sync to Firestore: strip email from public doc, persist email exclusively in private/profile
    try {
      const { email: _unusedEmail, ...profilePayloadWithoutEmail } = mergedProfile;
      profilePayloadWithoutEmail.isGuest = false;
      profilePayloadWithoutEmail.authProvider = 'google.com';
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, profilePayloadWithoutEmail, { merge: true });

      // Store private email in users/{uid}/private/profile
      if (user.email) {
        const privateProfileRef = doc(db, 'users', user.uid, 'private', 'profile');
        await setDoc(
          privateProfileRef,
          {
            email: user.email,
            uid: user.uid,
            updatedAt: Date.now(),
          },
          { merge: true }
        );
      }

      // Write merged history items to subcollection
      for (const item of mergedHistory.slice(0, 30)) {
        const itemRef = doc(db, 'users', user.uid, 'history', item.id);
        await setDoc(itemRef, item, { merge: true });
      }
    } catch (err) {
      console.warn('[PlayerProfileService] Error saving merged profile to Firestore:', err);
    }

    return { profile: mergedProfile, history: mergedHistory };
  },

  /**
   * Signs out to guest mode while preserving local history and stats safely.
   */
  async logout(): Promise<PlayerProfile> {
    try {
      await firebaseSignOut(auth);
    } catch (e) {
      console.warn('Logout error:', e);
    }

    const current = this.getLocalProfile();
    const guestProfile: PlayerProfile = {
      ...current,
      uid: generateGuestId(),
      email: null,
      photoURL: null,
      avatarId: current.avatarId === 'google' ? 'lion' : current.avatarId,
      isGuest: true,
      updatedAt: Date.now(),
    };

    this.saveLocalProfile(guestProfile);
    return guestProfile;
  },

  /**
   * Updates player's display name.
   */
  async updateDisplayName(newName: string): Promise<PlayerProfile> {
    const sanitized = sanitizeDisplayName(newName);
    const profile = this.getLocalProfile();
    const updated: PlayerProfile = {
      ...profile,
      displayName: sanitized,
      updatedAt: Date.now(),
    };
    this.saveLocalProfile(updated);

    if (this.isGoogleAuthenticated() && auth.currentUser) {
      try {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        await setDoc(
          userRef,
          { displayName: sanitized, isGuest: false, authProvider: 'google.com', updatedAt: Date.now() },
          { merge: true }
        );
      } catch (err) {
        console.warn('Firestore update name error:', err);
      }
    }

    return updated;
  },

  /**
   * Updates avatar choice.
   */
  async updateAvatar(avatarId: AvatarOptionId): Promise<PlayerProfile> {
    const profile = this.getLocalProfile();
    const updated: PlayerProfile = {
      ...profile,
      avatarId,
      updatedAt: Date.now(),
    };
    this.saveLocalProfile(updated);

    if (this.isGoogleAuthenticated() && auth.currentUser) {
      try {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        await setDoc(
          userRef,
          { avatarId, isGuest: false, authProvider: 'google.com', updatedAt: Date.now() },
          { merge: true }
        );
      } catch (err) {
        console.warn('Firestore update avatar error:', err);
      }
    }

    return updated;
  },

  /**
   * Recalcul rétroactif approximatif du Score de Maîtrise v2.
   * Reconstruit la grille de statistiques et le score à partir de l'historique users/{uid}/history.
   * Idempotent (scoreVersion = 2). Ne s'exécute JAMAIS deux fois sur un profil déjà migré.
   */
  async migratePlayerScoreVersion2(userId?: string): Promise<PlayerProfile> {
    const profile = this.getLocalProfile();
    const uid = userId || profile.uid || auth.currentUser?.uid;

    if (profile.scoreVersion === 2) {
      console.log(`[PlayerProfileService] Profile ${uid} already on scoreVersion = 2. Migration skipped.`);
      return profile;
    }

    console.log(`[PlayerProfileService] Starting scoreVersion = 2 migration for player ${uid}...`);

    let historyItems: PlayerGameHistoryItem[] = [];

    // Fetch full history from Firestore if available
    if (uid && !profile.isGuest && db) {
      try {
        const histSnap = await getDocs(
          query(collection(db, 'users', uid, 'history'), orderBy('createdAt', 'asc'))
        );
        historyItems = histSnap.docs.map((d) => d.data() as PlayerGameHistoryItem);
      } catch (err) {
        console.warn('[PlayerProfileService] Error fetching history for migration:', err);
      }
    }

    if (historyItems.length === 0) {
      historyItems = this.getLocalHistory().reverse(); // sort ascending chronologically
    }

    // Deduplicate history items by id
    const historyMap = new Map<string, PlayerGameHistoryItem>();
    historyItems.forEach((h) => historyMap.set(h.id, h));
    const sortedHistory = Array.from(historyMap.values()).sort((a, b) => a.createdAt - b.createdAt);

    // Save legacy backup
    const statsLegacyBackup = { ...(profile.stats || DEFAULT_PLAYER_STATS) };

    // Reconstruct stats from scratch
    const newStats: PlayerStats = {
      ...DEFAULT_PLAYER_STATS,
    };

    const dailySoloPointsMap = new Map<string, number>();
    let totalMasteryScore = 0;

    sortedHistory.forEach((item) => {
      let eventPotential = 0;

      if (item.recordType === 'PARTIE') {
        newStats.partiesPlayed += 1;
        if (item.mode === 'SOLO') {
          newStats.soloGamesPlayed += 1;
        } else {
          newStats.multiplayerGamesPlayed += 1;
        }

        if (item.isWinner) {
          newStats.partiesWon += 1;
          if (item.mode === 'SOLO') {
            newStats.soloGamesWon += 1;
            const diff = (item.difficulty || '').toUpperCase();
            if (diff === 'EXPERT' || diff === 'GRAND_MASTER' || diff === 'HARD') {
              newStats.soloGamesWonHard = (newStats.soloGamesWonHard || 0) + 1;
            } else if (diff === 'EASY') {
              newStats.soloGamesWonEasy = (newStats.soloGamesWonEasy || 0) + 1;
            } else {
              newStats.soloGamesWonNormal = (newStats.soloGamesWonNormal || 0) + 1;
            }
          } else {
            newStats.multiplayerGamesWon += 1;
          }

          if (item.winType === 'KORA') {
            newStats.koraCount += 1;
            if (item.mode === 'SOLO') {
              newStats.soloKoraCount += 1;
              const diff = (item.difficulty || '').toUpperCase();
              if (diff === 'EXPERT' || diff === 'GRAND_MASTER' || diff === 'HARD') {
                newStats.soloKorasHard = (newStats.soloKorasHard || 0) + 1;
              } else if (diff === 'EASY') {
                newStats.soloKorasEasy = (newStats.soloKorasEasy || 0) + 1;
              } else {
                newStats.soloKorasNormal = (newStats.soloKorasNormal || 0) + 1;
              }
            } else {
              newStats.multiplayerKoraCount += 1;
            }
          } else if (item.winType === 'DOUBLE_KORA') {
            newStats.koraCount += 1;
            newStats.doubleKoraCount += 1;
            if (item.mode === 'SOLO') {
              newStats.soloKoraCount += 1;
              newStats.soloDoubleKoraCount += 1;
              const diff = (item.difficulty || '').toUpperCase();
              if (diff === 'EXPERT' || diff === 'GRAND_MASTER' || diff === 'HARD') {
                newStats.soloDoubleKorasHard = (newStats.soloDoubleKorasHard || 0) + 1;
              } else if (diff === 'EASY') {
                newStats.soloDoubleKorasEasy = (newStats.soloDoubleKorasEasy || 0) + 1;
              } else {
                newStats.soloDoubleKorasNormal = (newStats.soloDoubleKorasNormal || 0) + 1;
              }
            } else {
              newStats.multiplayerKoraCount += 1;
              newStats.multiplayerDoubleKoraCount += 1;
            }
          }
        }

        // Calculate potential event mastery score
        if (item.isWinner) {
          eventPotential = computeEventMasteryScore({
            mode: item.mode,
            difficulty: item.difficulty,
            partiesWon: 1,
            koras: item.winType === 'KORA' ? 1 : 0,
            doubleKoras: item.winType === 'DOUBLE_KORA' ? 1 : 0,
          });
        }
      } else if (item.recordType === 'MANCHE' || !item.recordType) {
        newStats.manchesPlayed += 1;
        if (item.isWinner) {
          newStats.manchesWon += 1;
          if (item.mode === 'MULTIPLAYER') {
            newStats.multiplayerManchesWon += 1;
          } else {
            newStats.soloManchesWon += 1;
            const diff = (item.difficulty || '').toUpperCase();
            if (diff === 'EXPERT' || diff === 'GRAND_MASTER' || diff === 'HARD') {
              newStats.soloManchesWonHard = (newStats.soloManchesWonHard || 0) + 1;
            } else if (diff === 'EASY') {
              newStats.soloManchesWonEasy = (newStats.soloManchesWonEasy || 0) + 1;
            } else {
              newStats.soloManchesWonNormal = (newStats.soloManchesWonNormal || 0) + 1;
            }
          }
        }

        if (item.isWinner) {
          eventPotential = computeEventMasteryScore({
            mode: item.mode,
            difficulty: item.difficulty,
            isMancheWinner: true,
            isForfeitWin: item.winType === 'FORFEIT',
          });
        }
      }

      // Calculate awarded points taking into account daily solo cap
      let awarded = 0;
      if (item.mode === 'SOLO' && eventPotential > 0) {
        const dateKey = getDoualaDateKey(item.createdAt);
        const currentDailySum = dailySoloPointsMap.get(dateKey) || 0;
        const cap = MASTERY_CONFIG.rules.dailySoloPointsCap; // 30
        if (currentDailySum < cap) {
          awarded = Math.min(eventPotential, cap - currentDailySum);
          dailySoloPointsMap.set(dateKey, currentDailySum + awarded);
        } else {
          awarded = 0;
        }
      } else {
        awarded = eventPotential;
      }

      item.masteryPointsAwarded = awarded;
      totalMasteryScore += awarded;
    });

    // Compute final win rates
    newStats.gamesPlayed = newStats.partiesPlayed;
    newStats.gamesWon = newStats.partiesWon;
    newStats.gamesLost = Math.max(0, newStats.gamesPlayed - newStats.gamesWon);
    newStats.winRate = newStats.gamesPlayed > 0 ? Math.round((newStats.gamesWon / newStats.gamesPlayed) * 100) : 0;
    newStats.soloWinRate = newStats.soloGamesPlayed > 0 ? Math.round((newStats.soloGamesWon / newStats.soloGamesPlayed) * 100) : 0;
    newStats.multiplayerWinRate = newStats.multiplayerGamesPlayed > 0 ? Math.round((newStats.multiplayerGamesWon / newStats.multiplayerGamesPlayed) * 100) : 0;

    // Set final mastery score
    newStats.masteryScore = totalMasteryScore > 0 ? totalMasteryScore : computeMasteryScoreFromStats(newStats);

    const { currentTitle } = computeHonorificTitle(newStats);

    const isHistoryIncomplete = sortedHistory.length < (profile.stats?.partiesPlayed || 0);
    if (isHistoryIncomplete) {
      console.warn(
        `[PlayerProfileService] Profile ${uid} has incomplete history: ${sortedHistory.length} entries in history journal vs ${profile.stats?.partiesPlayed || 0} parties counted.`
      );
    }

    const updatedProfile: PlayerProfile = {
      ...profile,
      stats: newStats,
      scoreVersion: 2,
      statsLegacyBackup,
      honorificTitleId: currentTitle.id,
      updatedAt: Date.now(),
    };

    // Save updated profile & history locally
    this.saveLocalProfile(updatedProfile);
    this.saveLocalHistory(sortedHistory.reverse().slice(0, 100));

    // Save to Firestore if authenticated with Google
    if (uid && this.isGoogleAuthenticated() && db) {
      try {
        const { email: _unusedEmail, ...profilePayloadWithoutEmail } = updatedProfile;
        profilePayloadWithoutEmail.isGuest = false;
        profilePayloadWithoutEmail.authProvider = 'google.com';
        const userRef = doc(db, 'users', uid);
        await setDoc(userRef, profilePayloadWithoutEmail, { merge: true });

        if (profile.email) {
          const privateProfileRef = doc(db, 'users', uid, 'private', 'profile');
          await setDoc(privateProfileRef, { email: profile.email, uid, updatedAt: Date.now() }, { merge: true });
        }

        // Update history items with new masteryPointsAwarded
        for (const h of sortedHistory.slice(0, 30)) {
          const itemRef = doc(db, 'users', uid, 'history', h.id);
          await setDoc(itemRef, { masteryPointsAwarded: h.masteryPointsAwarded }, { merge: true });
        }
        console.log(`[PlayerProfileService] Successfully migrated player ${uid} to scoreVersion = 2 in Firestore.`);
      } catch (err) {
        console.warn('[PlayerProfileService] Firestore migration sync error:', err);
      }
    }

    return updatedProfile;
  },

  isChipsFixRunning: false,

  /**
   * Lot 4 - F: Migration rétroactive de la Fortune solo basée sur les gains réels des Koras.
   * Exécutée une seule fois par profil (chipsFixVersion = 1), protégée par un verrou contre les exécutions concourantes.
   */
  async migrateSoloFortuneHistory(profileParam?: PlayerProfile, targetUserId?: string): Promise<boolean> {
    if (this.isChipsFixRunning) return false;

    const profile = profileParam || this.getLocalProfile();
    if (profile.chipsFixVersion === 1) return false;

    this.isChipsFixRunning = true;
    try {
      const uid = targetUserId || (auth?.currentUser ? auth.currentUser.uid : (profile.isGuest ? undefined : profile.uid));
      let historyItems: PlayerGameHistoryItem[] = [];

      if (uid && db && !profile.isGuest) {
        try {
          const histQuery = query(
            collection(db, 'users', uid, 'history'),
            orderBy('createdAt', 'desc'),
            limit(1000)
          );
          const histSnap = await getDocs(histQuery);
          historyItems = histSnap.docs.map((d) => d.data() as PlayerGameHistoryItem);
        } catch (err) {
          console.warn('[PlayerProfileService] Error fetching cloud history for solo fortune migration:', err);
        }
      }

      if (historyItems.length === 0) {
        historyItems = this.getLocalHistory();
      }

      let C = 0;
      let itemsCorrectedCount = 0;
      const modifiedHistoryItems: PlayerGameHistoryItem[] = [];

      for (const h of historyItems) {
        if (
          h.recordType === 'PARTIE' &&
          h.mode === 'SOLO' &&
          (h.winType === 'KORA' || h.winType === 'DOUBLE_KORA') &&
          !h.chipsFix
        ) {
          const m = h.winType === 'DOUBLE_KORA' ? 4 : 2;
          const b = h.baseBet || 50;
          const n = h.playerCount || 2;
          const isWinner = Boolean(h.isWinner);

          const newValue = isWinner ? m * b * (n - 1) : -m * b;
          const recordedNet = typeof h.netChipsDelta === 'number' ? h.netChipsDelta : 0;
          const ecart = newValue - recordedNet;

          C += ecart;
          itemsCorrectedCount++;

          const updatedItem: PlayerGameHistoryItem = {
            ...h,
            netChipsDelta: newValue,
            chipsFix: 1,
          };
          modifiedHistoryItems.push(updatedItem);
        }
      }

      const currentStats: PlayerStats = { ...DEFAULT_PLAYER_STATS, ...(profile.stats || {}) };
      if (itemsCorrectedCount > 0 && C !== 0) {
        if (C < 0) {
          currentStats.soloPertes = (currentStats.soloPertes || 0) + Math.abs(C);
        } else if (C > 0) {
          currentStats.soloGains = (currentStats.soloGains || 0) + C;
        }
        currentStats.soloFortune = (currentStats.soloGains || 0) - (currentStats.soloPertes || 0);
      }

      const updatedProfile: PlayerProfile = {
        ...profile,
        stats: currentStats,
        chipsFixVersion: 1,
        updatedAt: Date.now(),
      };

      // Save local profile and updated history
      this.saveLocalProfile(updatedProfile);

      if (modifiedHistoryItems.length > 0) {
        const localHist = this.getLocalHistory();
        const localMap = new Map<string, PlayerGameHistoryItem>();
        localHist.forEach((item) => localMap.set(item.id, item));
        modifiedHistoryItems.forEach((item) => localMap.set(item.id, item));
        this.saveLocalHistory(Array.from(localMap.values()).slice(0, 100));
      }

      // Sync to Firestore if authenticated with Google
      if (uid && db && this.isGoogleAuthenticated()) {
        try {
          const userRef = doc(db, 'users', uid);
          await setDoc(
            userRef,
            {
              stats: currentStats,
              isGuest: false,
              authProvider: 'google.com',
              chipsFixVersion: 1,
              updatedAt: Date.now(),
            },
            { merge: true }
          );

          // Batch update history items safely (max 400 items per batch)
          for (let i = 0; i < modifiedHistoryItems.length; i += 400) {
            const batchChunk = modifiedHistoryItems.slice(i, i + 400);
            for (const item of batchChunk) {
              const itemRef = doc(db, 'users', uid, 'history', item.id);
              await setDoc(itemRef, { netChipsDelta: item.netChipsDelta, chipsFix: 1 }, { merge: true });
            }
          }
        } catch (err) {
          console.warn('[PlayerProfileService] Error syncing solo fortune migration to Firestore:', err);
        }
      }

      console.log(
        `[PlayerProfileService] Solo fortune migration completed: ${itemsCorrectedCount} items corrected, adjustment C = ${C}.`
      );
      return true;
    } finally {
      this.isChipsFixRunning = false;
    }
  },

  /**
   * Lot 6 — Recalcul rétroactif approximatif de la Fortune multijoueur.
   * Exécutée une seule fois par profil (fortuneFixVersion = 2), protégée par le même verrou isChipsFixRunning.
   */
  async migrateMultiplayerFortuneHistory(profileParam?: PlayerProfile, targetUserId?: string): Promise<boolean> {
    if (this.isChipsFixRunning) return false;

    const profile = profileParam || this.getLocalProfile();
    const uid = targetUserId || (auth?.currentUser ? auth.currentUser.uid : (profile.isGuest ? undefined : profile.uid));

    // La migration ne s'exécute que si fortuneFixVersion !== 2, uniquement pour les comptes authentifiés.
    if (profile.isGuest || !uid || !db) return false;
    if (profile.fortuneFixVersion === 2) return false;

    this.isChipsFixRunning = true;
    try {
      console.log('[PlayerProfileService] [LOT 6] Starting multiplayer fortune migration for user:', uid);
      const historyItems: PlayerGameHistoryItem[] = [];

      // 3. Lecture par pages de 500 triées par createdAt desc
      try {
        let lastDoc = null;
        let hasMore = true;
        while (hasMore) {
          let q = query(
            collection(db, 'users', uid, 'history'),
            orderBy('createdAt', 'desc'),
            limit(500)
          );
          if (lastDoc) {
            q = query(
              collection(db, 'users', uid, 'history'),
              orderBy('createdAt', 'desc'),
              startAfter(lastDoc),
              limit(500)
            );
          }
          const snap = await getDocs(q);
          if (snap.empty) {
            hasMore = false;
          } else {
            const pageDocs = snap.docs;
            const items = pageDocs.map((d) => d.data() as PlayerGameHistoryItem);
            historyItems.push(...items);
            lastDoc = pageDocs[pageDocs.length - 1];
            if (pageDocs.length < 500) {
              hasMore = false;
            }
          }
        }
      } catch (err) {
        console.warn('[PlayerProfileService] Error reading history collection for multiplayer migration:', err);
      }

      // Si l'historique cloud est vide, essayer de lire l'historique local en dernier recours
      let itemsToProcess = historyItems;
      if (itemsToProcess.length === 0) {
        itemsToProcess = this.getLocalHistory();
      }

      // Ne garder que recordType === 'PARTIE' et mode === 'MULTIPLAYER'.
      // Ignorer les enregistrements déjà fixés et ceux commençant par res_ (Lot 4, déjà corrects).
      const candidateItems = itemsToProcess.filter((h) => {
        return (
          h.recordType === 'PARTIE' &&
          h.mode === 'MULTIPLAYER' &&
          h.fortuneFix !== 2 &&
          !h.id.startsWith('res_')
        );
      });

      // --- SEQUENCE SYNCHRONE ET ATOMIQUE POUR RELIRE ET METTRE A JOUR LE PROFIL LOCAL ---
      // Relis le profil local juste avant d'appliquer la correction, et fais la lecture, la modification et la sauvegarde locale dans une même séquence synchrone, sans await entre elles.
      const latestProfile = this.getLocalProfile();
      if (latestProfile.fortuneFixVersion === 2) return false;

      // 4. Doublons. Grouper par roomId, roundsCount et isWinner
      const groups = new Map<string, PlayerGameHistoryItem[]>();
      candidateItems.forEach((item) => {
        const rId = item.roomId || 'unknown_room';
        const rounds = typeof item.roundsCount === 'number' ? item.roundsCount : (item.partieNumber || 1);
        const win = Boolean(item.isWinner);
        const key = `${rId}_${rounds}_${win}`;
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)!.push(item);
      });

      const duplicateItemIds = new Set<string>();
      const keptItems: PlayerGameHistoryItem[] = [];

      groups.forEach((items) => {
        // Trier par createdAt ascendant (plus ancien d'abord)
        const sorted = [...items].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        let lastKept: PlayerGameHistoryItem | null = null;
        for (const item of sorted) {
          if (!lastKept) {
            lastKept = item;
            keptItems.push(item);
          } else {
            const diffSec = Math.abs((item.createdAt || 0) - (lastKept.createdAt || 0)) / 1000;
            if (diffSec < 300) {
              duplicateItemIds.add(item.id);
            } else {
              lastKept = item;
              keptItems.push(item);
            }
          }
        }
      });

      // 5 et 6. Calcul correct et cumul de l'écart total C
      let totalC = 0;
      const modifiedItems: PlayerGameHistoryItem[] = [];

      for (const item of candidateItems) {
        const isDup = duplicateItemIds.has(item.id);
        const correctValue = isDup ? 0 : estimateNetFromHistoryRecord({
          isWinner: Boolean(item.isWinner),
          winType: item.winType || 'STANDARD',
          baseBet: item.baseBet || 50,
          playerCount: item.playerCount || 2,
        });

        let recordedNet = 0;
        if (typeof item.netChipsDelta === 'number') {
          recordedNet = item.netChipsDelta;
        } else {
          recordedNet = item.isWinner
            ? (item.potWon || 0) - (item.baseBet || 50)
            : -(item.baseBet || 50);
        }

        const ecart = correctValue - recordedNet;
        totalC += ecart;

        const updatedItem: PlayerGameHistoryItem = {
          ...item,
          netChipsDelta: correctValue,
          fortuneFix: 2,
        };
        if (isDup) {
          updatedItem.isDuplicate = true;
        }
        modifiedItems.push(updatedItem);
      }

      // LIMITES DE LA MIGRATION :
      // - Les départs et déconnexions passés ne peuvent pas être récupérés (aucune trace de la perte).
      // - Les plafonds de pénalité au capital, les joueurs exemptés et la mise escaladée sont ignorés : le résultat est une estimation.

      // 7. Découpe de l'application en tranches d'au plus 20 000
      const steps: number[] = [];
      let remaining = Math.abs(totalC);
      const CHUNK_LIMIT = 20000;
      while (remaining > 0) {
        const chunk = Math.min(remaining, CHUNK_LIMIT);
        steps.push(chunk);
        remaining -= chunk;
      }

      const cloudStats = latestProfile.stats || {};
      let currentGains = typeof latestProfile.stats?.multiplayerGains === 'number' ? latestProfile.stats.multiplayerGains : 0;
      let currentPertes = typeof latestProfile.stats?.multiplayerPertes === 'number' ? latestProfile.stats.multiplayerPertes : 0;
      let currentStats = {
        ...DEFAULT_PLAYER_STATS,
        ...cloudStats,
        multiplayerGains: currentGains,
        multiplayerPertes: currentPertes,
      };

      let currentProfileState = { ...latestProfile };

      if (totalC !== 0) {
        for (const chunk of steps) {
          if (totalC > 0) {
            currentGains += chunk;
          } else {
            currentPertes += chunk;
          }

          currentStats = {
            ...currentStats,
            multiplayerGains: currentGains,
            multiplayerPertes: currentPertes,
            fortune: currentGains - currentPertes,
          };

          currentProfileState = {
            ...currentProfileState,
            stats: currentStats,
            updatedAt: Date.now(),
          };

          this.saveLocalProfile(currentProfileState);
        }
      }

      const finalProfile: PlayerProfile = {
        ...currentProfileState,
        fortuneFixVersion: 2,
        updatedAt: Date.now(),
      };

      // Sauvegarde du profil local final
      this.saveLocalProfile(finalProfile);

      // Enregistrer l'historique mis à jour localement
      if (modifiedItems.length > 0) {
        const localHist = this.getLocalHistory();
        const localMap = new Map<string, PlayerGameHistoryItem>();
        localHist.forEach((item) => localMap.set(item.id, item));
        modifiedItems.forEach((item) => localMap.set(item.id, item));
        this.saveLocalHistory(Array.from(localMap.values()).slice(0, 100));
      }
      // --- FIN DE LA SEQUENCE SYNCHRONE ET ATOMIQUE ---

      // --- DEBUT DES OPERATIONS ASYNCHRONES DE SYNC FIRESTORE ---
      if (uid && db && this.isGoogleAuthenticated()) {
        try {
          // Sync des tranches d'écriture de stats vers Firestore
          let firestoreGains = typeof cloudStats.multiplayerGains === 'number' ? cloudStats.multiplayerGains : 0;
          let firestorePertes = typeof cloudStats.multiplayerPertes === 'number' ? cloudStats.multiplayerPertes : 0;

          if (totalC !== 0) {
            for (const chunk of steps) {
              if (totalC > 0) {
                firestoreGains += chunk;
              } else {
                firestorePertes += chunk;
              }
              const tempStats = {
                ...currentStats,
                multiplayerGains: firestoreGains,
                multiplayerPertes: firestorePertes,
                fortune: firestoreGains - firestorePertes,
              };
              await setDoc(
                doc(db, 'users', uid),
                {
                  stats: tempStats,
                  isGuest: false,
                  authProvider: 'google.com',
                  updatedAt: Date.now(),
                },
                { merge: true }
              );
            }
          }

          // Écriture de fortuneFixVersion: 2 finale
          await setDoc(
            doc(db, 'users', uid),
            {
              isGuest: false,
              authProvider: 'google.com',
              fortuneFixVersion: 2,
              updatedAt: Date.now(),
            },
            { merge: true }
          );

          // Batch update history items vers Firestore (max 400 par lot)
          if (modifiedItems.length > 0) {
            for (let i = 0; i < modifiedItems.length; i += 400) {
              const batchChunk = modifiedItems.slice(i, i + 400);
              for (const item of batchChunk) {
                const itemRef = doc(db, 'users', uid, 'history', item.id);
                const payload: any = {
                  netChipsDelta: item.netChipsDelta,
                  fortuneFix: 2,
                };
                if (item.isDuplicate) {
                  payload.isDuplicate = true;
                }
                await setDoc(itemRef, payload, { merge: true });
              }
            }
          }
        } catch (err) {
          console.warn('[PlayerProfileService] Error syncing progressive multiplayer fortune to Firestore:', err);
        }
      }

      // Invalider les caches du classement
      try {
        const { LeaderboardService } = await import('./leaderboardService');
        LeaderboardService.clearCache();
      } catch (err) {
        console.warn('[PlayerProfileService] Error clearing leaderboard cache:', err);
      }

      // Rapport final
      const report = {
        timestamp: Date.now(),
        userId: uid,
        totalHistoryItemsFetched: historyItems.length,
        candidateItemsCount: candidateItems.length,
        duplicatesCount: duplicateItemIds.size,
        adjustedValue: totalC,
      };

      localStorage.setItem('njambo_fortune_fix_report', JSON.stringify(report));
      console.log('[PlayerProfileService] [LOT 6] Multiplayer fortune migration completed successfully.', report);

      return true;
    } finally {
      this.isChipsFixRunning = false;
    }
  },
};

export const PlayerProfileService = playerProfileService;
