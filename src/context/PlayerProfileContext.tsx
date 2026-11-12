import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { authErrorCode, authFailureReportMessage, describeGoogleSignInError, GoogleSignInOutcome } from '../utils/authErrors';
import { auth } from '../lib/firebase';
import { setLocalPlayerName } from '../services/identity';
import { getPublicParamNumber } from '../services/publicConfig';
import { ConfirmedGoal, RankProgress, RankTitleId, TierSummary, rankProgress } from '../services/rankTiers';
import { RankSnapshot, fetchRankSnapshot, readStoredRank } from '../services/rankClient';
import {
  PlayerProfile,
  PlayerStats,
  PlayerGameHistoryItem,
  AvatarOptionId,
  HonorificTitle,
  HONORIFIC_TITLES,
  FairPlaySanction,
  PlayerFairPlay,
  PlayerOpponentSummary,
} from '../types/playerProfile';
import {
  playerProfileService,
  DEFAULT_PLAYER_STATS,
} from '../services/playerProfileService';
import { FriendService } from '../services/friendService';
import { useVisibleInterval } from '../hooks/useVisibleInterval';

interface PlayerProfileContextValue {
  profile: PlayerProfile;
  chips: number;
  stats: PlayerStats;
  fairPlay: PlayerFairPlay | undefined;
  activeSanction: FairPlaySanction | null;
  history: PlayerGameHistoryItem[];
  currentTitle: HonorificTitle;
  nextTitle: HonorificTitle | null;
  progressPercent: number;
  rankProgress: RankProgress;
  /** Dernière réponse du serveur : déclenche les annonces de changement de rang. */
  liveRank: RankSnapshot | null;
  rankTiers: TierSummary[];
  rankConfirmedGoal: ConfirmedGoal;
  isLoggedIn: boolean;
  isSyncing: boolean;
  syncMessage: string | null;
  isProfileModalOpen: boolean;
  setIsProfileModalOpen: (open: boolean) => void;
  isLeaderboardOpen: boolean;
  setIsLeaderboardOpen: (open: boolean) => void;
  loginWithGoogle: () => Promise<GoogleSignInOutcome>;
  logout: () => Promise<void>;
  updateDisplayName: (name: string) => Promise<void>;
  updateAvatar: (avatarId: AvatarOptionId) => Promise<void>;
  recordPartieResult: (params: {
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
  }) => Promise<void>;
  recordGameResult: (
    item: Omit<PlayerGameHistoryItem, 'id' | 'createdAt'> & { id?: string; createdAt?: number },
    options?: { skipStatsIncrement?: boolean; skipGamesPlayedIncrement?: boolean }
  ) => Promise<void>;
  registerFairPlayIncident: (params: {
    type: 'FORFEIT' | 'FOLD_ROUND' | 'PROLONGED_DISCONNECT';
    roomId?: string;
    gameId?: string;
  }) => Promise<{ sanction: FairPlaySanction | null; message: string }>;
  refreshConsolidatedStats: () => Promise<void>;
  offlineQueueCount: number;
  flushOfflineQueue: () => Promise<void>;
}

const PlayerProfileContext = createContext<PlayerProfileContextValue | null>(null);

export const PlayerProfileProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<PlayerProfile>(() => playerProfileService.getLocalProfile());
  const [history, setHistory] = useState<PlayerGameHistoryItem[]>(() => playerProfileService.getLocalHistory());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState<boolean>(false);
  const [offlineQueueCount, setOfflineQueueCount] = useState<number>(() => {
    return playerProfileService.getPendingOfflineQueue().length;
  });

  const flushOfflineQueue = useCallback(async () => {
    try {
      const res = await playerProfileService.flushOfflineSyncQueue();
      setOfflineQueueCount(res.remainingCount);
      if (res.syncedCount > 0) {
        console.log(`[PlayerProfileContext] Synced ${res.syncedCount} offline records.`);
      }
    } catch (e) {
      console.warn('[PlayerProfileContext] Error flushing offline queue:', e);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      console.log('[PlayerProfileContext] Network recovered: flushing offline queue');
      flushOfflineQueue();
    };
    // Le retour au premier plan est un signal bien plus fiable que l'événement réseau sur mobile
    // (celui-ci est connu pour manquer ou arriver en retard) : on retente à chaque réouverture.
    const handleVisible = () => {
      if (!document.hidden) flushOfflineQueue();
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisible);
    // Tentative immédiate au montage, sans condition sur navigator.onLine (peu fiable) : flushOfflineQueue
    // échoue silencieusement et sans casse si l'appareil est réellement hors ligne.
    flushOfflineQueue();
    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [flushOfflineQueue]);

  // Filet de sécurité périodique (toutes les 2 minutes, en pause si l'app est en arrière-plan) : couvre
  // les cas où ni l'événement réseau ni le retour au premier plan ne se sont déclenchés correctement,
  // notamment les joueurs solo qui restent longtemps hors ligne puis retrouvent une connexion sans que le
  // navigateur ne le signale (fréquent sur certains appareils Android d'entrée de gamme).
  useVisibleInterval(() => {
    if (offlineQueueCount > 0) flushOfflineQueue();
  }, 120000);

  // Rang dynamique : donné par le serveur pour un compte Google, objectifs fixes jusqu'à Confirmé pour un invité.
  const isGuestProfile = !profile || profile.isGuest;
  const rankUid = isGuestProfile ? '' : profile.uid;
  const [rankSnapshot, setRankSnapshot] = useState<RankSnapshot | null>(() => readStoredRank(rankUid));
  const [liveRank, setLiveRank] = useState<RankSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRankSnapshot(readStoredRank(rankUid));
    fetchRankSnapshot(rankUid).then((snapshot) => {
      if (cancelled || !snapshot) return;
      setRankSnapshot(snapshot);
      setLiveRank(snapshot);
    });
    return () => {
      cancelled = true;
    };
    // Relu à l'ouverture du profil et du Palmarès : les places bougent avec les autres joueurs.
  }, [rankUid, isProfileModalOpen, isLeaderboardOpen]);

  const rankView = useMemo(() => {
    const stats = profile?.stats || DEFAULT_PLAYER_STATS;
    const confirmed = {
      minGames: getPublicParamNumber('rankConfirmedMinGames'),
      minWins: getPublicParamNumber('rankConfirmedMinWins'),
    };
    const gamesPlayed = stats.gamesPlayed || 0;
    const gamesWon = stats.gamesWon || 0;
    const baseTitleId: RankTitleId = gamesPlayed >= confirmed.minGames && gamesWon >= confirmed.minWins ? 'CONFIRME' : 'APPRENTI';
    const titleId = (!isGuestProfile && rankSnapshot?.uid === rankUid && rankSnapshot.rank?.titleId) || baseTitleId;
    const tiers = rankSnapshot?.tiers ?? [];
    const progress = rankProgress({
      titleId,
      masteryScore: stats.masteryScore || 0,
      gamesPlayed,
      gamesWon,
      isGuest: isGuestProfile,
      inactivitySteps: rankSnapshot?.rank?.inactivitySteps ?? 0,
      tiers,
      confirmed,
    });
    const findTitle = (id: string | null) => HONORIFIC_TITLES.find((t) => t.id === id) ?? null;
    return {
      currentTitle: findTitle(titleId) ?? HONORIFIC_TITLES[0],
      nextTitle: findTitle(progress.nextTitleId),
      progressPercent: progress.percent,
      rankProgress: progress,
      rankTiers: tiers,
      rankConfirmedGoal: confirmed,
    };
  }, [profile?.stats, isGuestProfile, rankUid, rankSnapshot]);
  const { currentTitle, nextTitle, progressPercent } = rankView;

  // Sync with auth changes and reconcile cloud state on app startup / page refresh
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        if (profile.isGuest) {
          // User is logged in via Firebase but local state was guest or cache was wiped: perform silent fusion check
          try {
            setIsSyncing(true);
            const result = await playerProfileService.loginWithGoogle();
            setProfile(result.profile);
            setHistory(result.history);
            // Auto-merge local contacts into cloud friends
            FriendService.mergeLocalContactsToCloud(result.profile.uid).catch((e) => {
              console.warn('[PlayerProfileContext] Auto merge friends warning:', e);
            });
          } catch (e) {
            console.warn('[PlayerProfileContext] Auto sync warning:', e);
          } finally {
            setIsSyncing(false);
          }
        } else {
          // Reconcile and consolidate cloud chips and stats at startup
          try {
            const consolidated = await playerProfileService.fetchConsolidatedStats(user.uid);
            if (consolidated) {
              setProfile((prev) => ({
                ...prev,
                stats: consolidated.stats,
                chips: consolidated.chips,
              }));
              setHistory(consolidated.history);
            }
          } catch (e) {
            console.warn('[PlayerProfileContext] Reconcile on boot warning:', e);
          }
        }
      }
    });
    return () => unsub();
  }, [profile.isGuest]);

  // Le nom envoyé aux tables suit toujours le pseudo du profil, y compris au premier lancement après une mise à jour.
  useLayoutEffect(() => {
    if (profile.displayName) setLocalPlayerName(profile.displayName);
  }, [profile.displayName]);

  // Silent background stats consolidation to prevent desynchronization (Lot 3 Recommendation 2)
  useEffect(() => {
    if (!profile.isGuest && profile.uid) {
      playerProfileService.fetchConsolidatedStats(profile.uid)
        .then((consolidated) => {
          if (consolidated) {
            setProfile((prev) => ({
              ...prev,
              stats: consolidated.stats,
              chips: consolidated.chips,
            }));
            setHistory(consolidated.history);
            console.log('[PlayerProfileContext] Background stats consolidation completed successfully.');
          }
        })
        .catch((err) => {
          console.warn('[PlayerProfileContext] Silent background consolidation error:', err);
        });
    }
  }, [profile.isGuest, profile.uid]);

  // Ensure logged-in user profile has a unique stored friendCode
  useEffect(() => {
    if (!profile.isGuest && profile.uid && !profile.friendCode) {
      FriendService.ensureUserFriendCode(profile.uid, profile)
        .then((code) => {
          if (code) {
            setProfile((prev) => ({ ...prev, friendCode: code }));
          }
        })
        .catch((err) => {
          console.warn('[PlayerProfileContext] Ensure friend code error:', err);
        });
    }
  }, [profile.isGuest, profile.uid, profile.friendCode]);

  const loginWithGoogle = useCallback(async (): Promise<GoogleSignInOutcome> => {
    setIsSyncing(true);
    setSyncMessage('Fusion de tes données locales avec ton compte Google...');
    try {
      const result = await playerProfileService.loginWithGoogle();
      setProfile(result.profile);
      setHistory(result.history);
      // Auto-merge local contacts into cloud friends
      FriendService.mergeLocalContactsToCloud(result.profile.uid).catch((e) => {
        console.warn('[PlayerProfileContext] Merge friends warning:', e);
      });
      setSyncMessage('Synchronisation réussie ! Ton palmarès est sécurisé.');
      setTimeout(() => setSyncMessage(null), 4000);
      return { ok: true };
    } catch (err: unknown) {
      const code = authErrorCode(err);
      const view = describeGoogleSignInError(code);
      if (view.message === null) {
        setSyncMessage(null);
      } else {
        console.error('[PlayerProfile] Login error:', err);
        setSyncMessage(view.message);
        setTimeout(() => setSyncMessage(null), 5000);
      }
      // Code d'erreur seul (jamais de nom ni de courriel), pour savoir combien de joueurs échouent et pourquoi.
      if (view.report) {
        (window as unknown as { __njamboReportCrash?: (kind: string, message: string, stack?: string) => void }).__njamboReportCrash?.('auth', authFailureReportMessage(code), '');
      }
      return { ok: false, message: view.message };
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsSyncing(true);
    try {
      const guest = await playerProfileService.logout();
      setProfile(guest);
      setSyncMessage('Déconnecté du compte Google. Mode invité réactivé.');
      setTimeout(() => setSyncMessage(null), 3000);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const updateDisplayName = useCallback(async (name: string) => {
    const updated = await playerProfileService.updateDisplayName(name);
    setProfile(updated);
  }, []);

  const updateAvatar = useCallback(async (avatarId: AvatarOptionId) => {
    const updated = await playerProfileService.updateAvatar(avatarId);
    setProfile(updated);
  }, []);

  const recordPartieResult = useCallback(
    async (params: {
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
    }) => {
      const updatedProfile = await playerProfileService.recordPartieResult(params);
      setProfile(updatedProfile);
      setHistory(playerProfileService.getLocalHistory());
      setOfflineQueueCount(playerProfileService.getPendingOfflineQueue().length);
    },
    []
  );

  const recordGameResult = useCallback(
    async (
      item: Omit<PlayerGameHistoryItem, 'id' | 'createdAt'> & { id?: string; createdAt?: number },
      options?: { skipStatsIncrement?: boolean; skipGamesPlayedIncrement?: boolean }
    ) => {
      const updatedProfile = await playerProfileService.recordGame(item, options);
      setProfile(updatedProfile);
      setHistory(playerProfileService.getLocalHistory());
      setOfflineQueueCount(playerProfileService.getPendingOfflineQueue().length);
    },
    []
  );

  const registerFairPlayIncident = useCallback(
    async (params: {
      type: 'FORFEIT' | 'FOLD_ROUND' | 'PROLONGED_DISCONNECT';
      roomId?: string;
      gameId?: string;
    }) => {
      const res = await playerProfileService.registerFairPlayIncident(params);
      setProfile(res.profile);
      setOfflineQueueCount(playerProfileService.getPendingOfflineQueue().length);
      return { sanction: res.sanction, message: res.message };
    },
    []
  );

  const refreshConsolidatedStats = useCallback(async () => {
    if (!profile.uid) return;
    const consolidated = await playerProfileService.fetchConsolidatedStats(profile.uid);
    if (consolidated) {
      setProfile((prev) => ({
        ...prev,
        stats: consolidated.stats,
        chips: consolidated.chips,
      }));
      setHistory(consolidated.history);
    }
  }, [profile.uid]);

  const activeSanction = useMemo(() => {
    return playerProfileService.getActiveSanction(profile);
  }, [profile]);

  const safeStats: PlayerStats = useMemo(() => {
    const s = { ...DEFAULT_PLAYER_STATS, ...(profile?.stats || {}) };
    (Object.keys(DEFAULT_PLAYER_STATS) as Array<keyof PlayerStats>).forEach((k) => {
      if (typeof s[k] !== 'number' || isNaN(s[k])) {
        s[k] = 0;
      }
    });
    return s;
  }, [profile?.stats]);

  return (
    <PlayerProfileContext.Provider
      value={{
        profile,
        chips: typeof profile?.chips === 'number' && !isNaN(profile.chips) ? profile.chips : 1000,
        stats: safeStats,
        fairPlay: profile?.fairPlay,
        activeSanction,
        history: Array.isArray(history) ? history : [],
        currentTitle: currentTitle || HONORIFIC_TITLES[0],
        nextTitle,
        progressPercent: isNaN(progressPercent) ? 0 : progressPercent,
        rankProgress: rankView.rankProgress,
        liveRank,
        rankTiers: rankView.rankTiers,
        rankConfirmedGoal: rankView.rankConfirmedGoal,
        isLoggedIn: Boolean(profile && !profile.isGuest),
        isSyncing,
        syncMessage,
        isProfileModalOpen,
        setIsProfileModalOpen,
        isLeaderboardOpen,
        setIsLeaderboardOpen,
        loginWithGoogle,
        logout,
        updateDisplayName,
        updateAvatar,
        recordPartieResult,
        recordGameResult,
        registerFairPlayIncident,
        refreshConsolidatedStats,
        offlineQueueCount,
        flushOfflineQueue,
      }}
    >
      {children}
    </PlayerProfileContext.Provider>
  );
};

export const usePlayerProfile = (): PlayerProfileContextValue => {
  const context = useContext(PlayerProfileContext);
  if (!context) {
    throw new Error('usePlayerProfile must be used within a PlayerProfileProvider');
  }
  return context;
};
