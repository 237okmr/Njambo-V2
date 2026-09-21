/**
 * RÈGLE PERMANENTE DU PALMARÈS :
 * Le Palmarès ne contient que des joueurs humains authentifiés par Google, avec des statistiques valides.
 * Toute évolution future doit la respecter, sauf demande explicite du propriétaire.
 */

import { collection, getDocs, query, limit, orderBy } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import {
  LeaderboardCategory,
  LeaderboardTimeframe,
  LeaderboardEntry,
  CurrentUserRankSummary,
  PublicPlayerProfileData,
} from '../types/leaderboard';
import { computeHonorificTitle, computeMasteryScore, DEFAULT_PLAYER_STATS, playerProfileService, applyStatsFallback } from './playerProfileService';
import { FriendService } from './friendService';
import { AvatarOptionId, HONORIFIC_TITLES } from '../types/playerProfile';
import { getPlayerId } from './identity';
import { formatMasteryScore, isEligibleLeaderboardUser, LEADERBOARD_POLICY } from './masteryConfig';

const LEADERBOARD_CACHE_KEY = 'njambo_leaderboard_cache_v6';
const CACHE_TTL_MS = 20 * 1000; // 20 seconds local cache

// Purge legacy caches (v2 - v5) once on module load
(function purgeLegacyLeaderboardCaches() {
  try {
    const legacyVersions = ['v2', 'v3', 'v4', 'v5'];
    const suffixes = ['', '_ALL', '_WEEK', '_MONTH'];
    for (const v of legacyVersions) {
      for (const s of suffixes) {
        localStorage.removeItem(`njambo_leaderboard_cache_${v}${s}`);
      }
    }
  } catch {}
})();

export class LeaderboardService {
  /**
   * Fetches the official player leaderboard for a given category and timeframe.
   * Exclusively includes real, authentic Google authenticated users in the Palmarès (no bots, guests, or fictitious players).
   */
  public static async getLeaderboard(
    category: LeaderboardCategory = 'WINS',
    forceRefresh: boolean = false,
    timeframe: LeaderboardTimeframe = 'ALL'
  ): Promise<{
    entries: LeaderboardEntry[];
    currentUserRank: CurrentUserRankSummary | null;
  }> {
    const localProfile = playerProfileService.getLocalProfile();
    const localPlayerId = localProfile.uid || getPlayerId();
    const localPlayerName = localProfile.displayName || localStorage.getItem('njambo_player_name') || 'Joueur';
    const localAvatar = (localProfile.avatarId || (localStorage.getItem('njambo_avatar_seed') as AvatarOptionId)) || 'lion';
    const isGoogleAuth = Boolean(
      auth.currentUser &&
        !auth.currentUser.isAnonymous &&
        auth.currentUser.providerData?.some((p) => p.providerId === 'google.com')
    );
    const isGuest = !isGoogleAuth;
    const currentUserId = auth.currentUser?.uid || localPlayerId;

    const cacheKey = `${LEADERBOARD_CACHE_KEY}_${timeframe}`;
    const cached = this.getCachedData(cacheKey);

    // 1. Check local cache
    if (!forceRefresh) {
      if (cached && cached.rawUsers && cached.rawUsers.length > 0 && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return this.formatCategoryView(cached.rawUsers, category, currentUserId, isGuest);
      }
    }

    // 2. Fetch raw real users from Node.js Cache Server
    let cloudUsers: any[] = [];
    try {
      const response = await fetch(`/api/leaderboard/cached?timeframe=${timeframe}${forceRefresh ? '&force=true' : ''}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.users)) {
          cloudUsers = data.users.filter((u: any) => isEligibleLeaderboardUser(u?.uid, u));
        }
      }
    } catch (err: any) {
      console.warn('[LeaderboardService] Error contacting server cache:', err);
    }

    // 2b. Fallback directly to Firestore if no cloud users were fetched
    if (cloudUsers.length === 0) {
      try {
        const snap = await getDocs(
          query(collection(db, 'users'), orderBy('stats.masteryScore', 'desc'), limit(50))
        );
        // Strict filter: Google-authenticated players only with valid statistics
        cloudUsers = snap.docs
          .map((doc) => ({ uid: doc.id, ...doc.data() }))
          .filter((u: any) => isEligibleLeaderboardUser(u.uid, u));
      } catch (err) {
        console.warn('[LeaderboardService] Direct Firestore fallback soft warning:', err);
      }
    }

    // 3. Consolidate: Authoritative verified Google accounts exclusively
    const mergedMap = new Map<string, any>();

    // Step A: Merge existing cached users if present (strictly authenticated accounts)
    if (cached && Array.isArray(cached.rawUsers)) {
      cached.rawUsers.forEach((u: any) => {
        if (isEligibleLeaderboardUser(u.uid, u)) {
          mergedMap.set(u.uid, u);
        }
      });
    }

    // Step B: Add cloud users (official verified Google accounts from server / Firestore)
    cloudUsers.forEach((u) => {
      if (isEligibleLeaderboardUser(u.uid, u)) {
        mergedMap.set(u.uid, u);
      }
    });

    // Step C: Include current user ONLY IF authenticated with Google and eligible
    if (isGoogleAuth && currentUserId) {
      const existingCloudUser = cloudUsers.find((u) => u.uid === currentUserId) || mergedMap.get(currentUserId);
      const candidateCurrentUser = existingCloudUser
        ? {
            ...existingCloudUser,
            uid: currentUserId,
            displayName: existingCloudUser.displayName || localProfile.displayName || localPlayerName,
            avatarId: existingCloudUser.avatarId || localProfile.avatarId || localAvatar,
            photoURL: auth.currentUser?.photoURL || existingCloudUser.photoURL || null,
            isGuest: false,
            authProvider: 'google.com',
          }
        : {
            uid: currentUserId,
            displayName: localProfile.displayName || localPlayerName,
            avatarId: localProfile.avatarId || localAvatar,
            photoURL: auth.currentUser?.photoURL || null,
            isGuest: false,
            authProvider: 'google.com',
            chips: Math.max(0, localProfile.chips ?? 1000),
            stats: localProfile.stats || DEFAULT_PLAYER_STATS,
            scoreVersion: localProfile.scoreVersion || 1,
            fairPlay: localProfile.fairPlay || { activeSanction: null },
          };

      if (isEligibleLeaderboardUser(currentUserId, candidateCurrentUser)) {
        mergedMap.set(currentUserId, candidateCurrentUser);
      }
    }

    const rawUsers = Array.from(mergedMap.values()).filter((u) => isEligibleLeaderboardUser(u.uid, u));

    // Save to cache
    if (rawUsers.length > 0) {
      try {
        localStorage.setItem(
          cacheKey,
          JSON.stringify({
            timestamp: Date.now(),
            rawUsers,
          })
        );
      } catch {}
    }

    return this.formatCategoryView(rawUsers, category, currentUserId, isGuest);
  }

  private static getCachedData(cacheKey: string = LEADERBOARD_CACHE_KEY): { timestamp: number; rawUsers: any[] } | null {
    try {
      const data = localStorage.getItem(cacheKey);
      if (!data) return null;
      const parsed = JSON.parse(data);
      if (!parsed || !Array.isArray(parsed.rawUsers) || parsed.rawUsers.length === 0) {
        return null;
      }
      // Purge any ineligible users from cache
      parsed.rawUsers = parsed.rawUsers.filter((u: any) => isEligibleLeaderboardUser(u?.uid, u));
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Clears the leaderboard local cache to force a fresh pull.
   */
  public static clearCache(): void {
    try {
      const legacyVersions = ['v2', 'v3', 'v4', 'v5', 'v6'];
      const suffixes = ['', '_ALL', '_WEEK', '_MONTH'];
      for (const v of legacyVersions) {
        for (const s of suffixes) {
          localStorage.removeItem(`njambo_leaderboard_cache_${v}${s}`);
        }
      }
    } catch {}
  }

  /**
   * Sorts and formats entries according to category
   */
  private static formatCategoryView(
    rawUsers: any[],
    category: LeaderboardCategory,
    currentUserId: string,
    isGuest: boolean = false
  ): {
    entries: LeaderboardEntry[];
    currentUserRank: CurrentUserRankSummary | null;
  } {
    const formatted: LeaderboardEntry[] = rawUsers.map((u) => {
      const stats = applyStatsFallback(u.stats || DEFAULT_PLAYER_STATS, u.scoreVersion);
      const gamesWon = stats.partiesWon || stats.gamesWon || 0;
      const partiesWon = stats.partiesWon || gamesWon;
      const gamesPlayed = Math.max(stats.partiesPlayed || stats.gamesPlayed || 0, gamesWon);
      const winRate = gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : 0;
      const koraCount = stats.koraCount || 0;
      const doubleKoraCount = stats.doubleKoraCount || 0;
      const totalKorasScore = koraCount + doubleKoraCount * 2;
      const chips = u.chips !== undefined ? u.chips : 1000;
      const biggestPotWon = stats.biggestPotWon || 0;

      const { currentTitle } = computeHonorificTitle(stats);
      const isCurrentUser = !isGuest && u.uid === currentUserId;

      let soloGamesWon = stats.soloGamesWon || 0;
      let multiplayerGamesWon = stats.multiplayerGamesWon || 0;
      const totalDetailedWins = soloGamesWon + multiplayerGamesWon;
      if (totalDetailedWins < gamesWon) {
        const missingWins = gamesWon - totalDetailedWins;
        const soloPlayed = stats.soloGamesPlayed || 0;
        const multiPlayed = stats.multiplayerGamesPlayed || 0;
        const totalPlayed = soloPlayed + multiPlayed;

        if (totalPlayed > 0) {
          const soloRatio = soloPlayed / totalPlayed;
          const estimatedSoloWins = Math.min(soloPlayed, Math.round(missingWins * soloRatio));
          const estimatedMultiWins = missingWins - estimatedSoloWins;
          soloGamesWon += estimatedSoloWins;
          multiplayerGamesWon += estimatedMultiWins;
        } else {
          soloGamesWon += missingWins;
        }
      }

      let scoreValue = 0;
      let scoreFormatted = '0';
      let scoreUnit = 'pts';

      const masteryScore = typeof stats.masteryScore === 'number' && stats.masteryScore > 0
        ? stats.masteryScore
        : computeMasteryScore(stats);

      if (category === 'WINS') {
        scoreValue = masteryScore;
        scoreFormatted = formatMasteryScore(masteryScore);
        scoreUnit = 'pts';
      } else if (category === 'KORAS') {
        scoreValue = totalKorasScore;
        scoreFormatted = `${koraCount} (${doubleKoraCount} Dbl)`;
        scoreUnit = 'Koras';
      } else if (category === 'CHIPS') {
        const fortune = stats.fortune || 0;
        scoreValue = fortune;
        scoreFormatted = fortune > 0 ? `+${fortune.toLocaleString('fr-FR')}` : `${fortune.toLocaleString('fr-FR')}`;
        scoreUnit = '🪙';
      } else if (category === 'WIN_RATE') {
        scoreValue = winRate;
        scoreFormatted = `${winRate}%`;
        scoreUnit = `(${gamesWon}/${gamesPlayed} j.)`;
      }

      // Fair play status
      let fairPlayStatus: 'IMPECCABLE' | 'WARNING' | 'SANCTIONED' = 'IMPECCABLE';
      if (u.fairPlay?.activeSanction?.active) {
        fairPlayStatus = 'SANCTIONED';
      } else if (u.fairPlay?.totalForfeits && u.fairPlay.totalForfeits > 0) {
        fairPlayStatus = 'WARNING';
      }

      const friendCode = FriendService.getFriendCode(u.uid);

      return {
        rank: 0, // Assigned after sorting
        uid: u.uid,
        displayName: u.displayName || 'Joueur Anonyme',
        avatarId: (u.avatarId as AvatarOptionId) || 'lion',
        photoURL: u.photoURL || null,
        title: currentTitle,
        isGuest: Boolean(u.isGuest),
        isCurrentUser,
        scoreValue,
        scoreFormatted,
        scoreUnit,
        masteryScore,
        manchesWon: stats.manchesWon || 0,
        soloManchesWon: stats.soloManchesWon || 0,
        multiplayerManchesWon: stats.multiplayerManchesWon || 0,
        soloManchesWonEasy: stats.soloManchesWonEasy || 0,
        soloManchesWonNormal: stats.soloManchesWonNormal || 0,
        soloManchesWonHard: stats.soloManchesWonHard || 0,
        gamesWon,
        partiesWon,
        gamesPlayed,
        winRate,
        koraCount,
        doubleKoraCount,
        chips,
        biggestPotWon,
        fortune: stats.fortune || 0,
        multiplayerGains: stats.multiplayerGains || 0,
        multiplayerPertes: stats.multiplayerPertes || 0,
        soloGamesPlayed: stats.soloGamesPlayed || 0,
        multiplayerGamesPlayed: stats.multiplayerGamesPlayed || 0,
        soloGamesWon,
        multiplayerGamesWon,
        fairPlayStatus,
        friendCode,
      };
    });

    // Sort descending by scoreValue, with tie-breakers
    formatted.sort((a, b) => {
      if (b.scoreValue !== a.scoreValue) {
        return b.scoreValue - a.scoreValue;
      }
      // Tie-breaker 1: masteryScore if category is not WINS, or gamesWon
      if (category !== 'WINS' && (b.masteryScore || 0) !== (a.masteryScore || 0)) {
        return (b.masteryScore || 0) - (a.masteryScore || 0);
      }
      // Tie-breaker 2: gamesWon
      if (b.gamesWon !== a.gamesWon) {
        return b.gamesWon - a.gamesWon;
      }
      // Tie-breaker 3: koraCount
      if (b.koraCount !== a.koraCount) {
        return b.koraCount - a.koraCount;
      }
      // Tie-breaker 4: chips
      return b.chips - a.chips;
    });

    // Assign rank
    formatted.forEach((entry, idx) => {
      entry.rank = idx + 1;
    });

    // Compute Current User summary
    const currentUserIdx = formatted.findIndex((e) => e.isCurrentUser);
    let currentUserRank: CurrentUserRankSummary | null = null;

    if (currentUserIdx >= 0) {
      const currentEntry = formatted[currentUserIdx];
      const rank = currentUserIdx + 1;
      const totalRankedPlayers = formatted.length;
      const percentile = Math.max(1, Math.round(((totalRankedPlayers - rank + 1) / totalRankedPlayers) * 100));

      let pointsToNextRank = 0;
      let nextPlayerName: string | undefined;

      if (currentUserIdx > 0) {
        const playerAbove = formatted[currentUserIdx - 1];
        pointsToNextRank = Math.max(1, playerAbove.scoreValue - currentEntry.scoreValue + 1);
        nextPlayerName = playerAbove.displayName;
      }

      currentUserRank = {
        rank,
        totalRankedPlayers,
        percentile,
        pointsToNextRank,
        nextPlayerName,
        isGuest: currentEntry.isGuest,
      };
    }

    return {
      entries: formatted,
      currentUserRank,
    };
  }

  /**
   * Retrieves public details for a specific player
   */
  public static getPublicPlayerProfile(
    entry: LeaderboardEntry
  ): PublicPlayerProfileData {
    return {
      uid: entry.uid,
      displayName: entry.displayName,
      avatarId: entry.avatarId,
      photoURL: entry.photoURL,
      title: entry.title,
      friendCode: entry.friendCode,
      isGuest: entry.isGuest,
      chips: entry.chips,
      gamesPlayed: entry.gamesPlayed,
      gamesWon: entry.gamesWon,
      partiesWon: entry.partiesWon,
      winRate: entry.winRate,
      koraCount: entry.koraCount,
      doubleKoraCount: entry.doubleKoraCount,
      biggestPotWon: entry.biggestPotWon,
      totalTricksWon: entry.gamesWon * 3,
      masteryScore: entry.masteryScore,
      manchesWon: entry.manchesWon,
      soloManchesWon: entry.soloManchesWon,
      multiplayerManchesWon: entry.multiplayerManchesWon,
      soloManchesWonEasy: entry.soloManchesWonEasy,
      soloManchesWonNormal: entry.soloManchesWonNormal,
      soloManchesWonHard: entry.soloManchesWonHard,
      fairPlayStatus: entry.fairPlayStatus,
      isOnline: entry.isOnline,
      currentRoomCode: entry.currentRoomCode,
      fortune: entry.fortune || 0,
      multiplayerGains: entry.multiplayerGains || 0,
      multiplayerPertes: entry.multiplayerPertes || 0,
      soloGamesWon: entry.soloGamesWon || 0,
      multiplayerGamesWon: entry.multiplayerGamesWon || 0,
    };
  }
}
