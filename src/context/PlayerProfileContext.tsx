import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';
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
  computeHonorificTitle,
  DEFAULT_PLAYER_STATS,
} from '../services/playerProfileService';
import { FriendService } from '../services/friendService';

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
  isLoggedIn: boolean;
  isSyncing: boolean;
  syncMessage: string | null;
  isProfileModalOpen: boolean;
  setIsProfileModalOpen: (open: boolean) => void;
  isLeaderboardOpen: boolean;
  setIsLeaderboardOpen: (open: boolean) => void;
  loginWithGoogle: () => Promise<void>;
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

    window.addEventListener('online', handleOnline);
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      flushOfflineQueue();
    }
    return () => window.removeEventListener('online', handleOnline);
  }, [flushOfflineQueue]);

  // Derive honorific title
  const { currentTitle, nextTitle, progressPercent } = useMemo(() => {
    return computeHonorificTitle(profile?.stats || DEFAULT_PLAYER_STATS);
  }, [profile?.stats]);

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

  const loginWithGoogle = useCallback(async () => {
    setIsSyncing(true);
    setSyncMessage('Fusion de vos données locales avec votre compte Google...');
    try {
      const result = await playerProfileService.loginWithGoogle();
      setProfile(result.profile);
      setHistory(result.history);
      // Auto-merge local contacts into cloud friends
      FriendService.mergeLocalContactsToCloud(result.profile.uid).catch((e) => {
        console.warn('[PlayerProfileContext] Merge friends warning:', e);
      });
      setSyncMessage('Synchronisation réussie ! Votre palmarès est sécurisé.');
      setTimeout(() => setSyncMessage(null), 4000);
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        console.error('[PlayerProfile] Login error:', err);
        setSyncMessage('Erreur lors de la connexion. Vos données locales restent intactes.');
        setTimeout(() => setSyncMessage(null), 5000);
      } else {
        setSyncMessage(null);
      }
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
