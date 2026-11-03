import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  User as UserIcon,
  BarChart3,
  Trophy,
  History,
  Check,
  Edit2,
  ShieldCheck,
  Flame,
  Layers,
  Crown,
  Zap,
  Award,
  Lock,
  Sparkles,
  RefreshCw,
  Cloud,
  Coins,
  AlertTriangle,
  Clock,
  Users,
  Settings,
} from 'lucide-react';
import { usePlayerProfile } from '../../context/PlayerProfileContext';
import { PlayerAvatar } from './PlayerAvatar';
import { ProfileDetailsSection } from './ProfileDetailsSection';
import { RankTitleId, rankConditionLabel, rankGoalLabel } from '../../services/rankTiers';
import { formatCompactNumber } from '../../utils/leaderboardDisplay';
import { ProfileSettingsTab } from './ProfileSettingsTab';
import { AvatarPickerBottomSheet } from './AvatarPickerBottomSheet';
import { ConnectionDiagnosticModal } from '../common/ConnectionDiagnosticModal';
import { NativeScreenHeader } from '../common/NativeScreenHeader';
import { NativeSegmentedNav, SegmentTab } from '../common/NativeSegmentedNav';
import { useBackLayer } from '../../hooks/useBackLayer';
import {
  HONORIFIC_TITLES,
  AvatarOptionId,
  PlayerGameHistoryItem,
  PlayerStats,
  DEFAULT_PLAYER_STATS,
} from '../../types/playerProfile';

export type ProfileTabType = 'identity' | 'stats' | 'history' | 'settings';
export type HistoryFilter = 'ALL' | 'MANCHES' | 'DONNES' | 'SOLO' | 'MULTIPLAYER' | 'WINS' | 'KORAS';

import { GoogleIcon } from '../common/GoogleIcon';
import { SoloDailyGauge } from '../common/SoloDailyGauge';

export interface PlayerProfileScreenProps {
  isOpen: boolean;
  onClose: () => void;
  sourceScreen?: 'HOME' | 'GAME';
  isGameActive?: boolean;
  isMultiplayer?: boolean;
  gamePlayerCount?: number;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  onOpenLeaderboard?: () => void;
  onOpenKoraCash?: () => void;
  initialTab?: ProfileTabType;
}

export const PlayerProfileScreen: React.FC<PlayerProfileScreenProps> = ({
  isOpen,
  onClose,
  sourceScreen = 'HOME',
  isGameActive = false,
  isMultiplayer = false,
  gamePlayerCount = 4,
  soundEnabled,
  onToggleSound,
  onOpenLeaderboard,
  onOpenKoraCash,
  initialTab = 'identity',
}) => {
  const {
    profile,
    chips,
    stats,
    fairPlay,
    activeSanction,
    history,
    currentTitle,
    nextTitle,
    progressPercent,
    rankProgress,
    rankTiers,
    rankConfirmedGoal,
    isLoggedIn,
    isSyncing,
    syncMessage,
    loginWithGoogle,
    logout,
    updateDisplayName,
    updateAvatar,
    refreshConsolidatedStats,
    offlineQueueCount,
    flushOfflineQueue,
  } = usePlayerProfile();

  const [activeTab, setActiveTab] = useState<ProfileTabType>(initialTab);
  const [showAvatarSheet, setShowAvatarSheet] = useState<boolean>(false);
  const [showDiagnosticModal, setShowDiagnosticModal] = useState<boolean>(false);
  const [isRefreshingCloud, setIsRefreshingCloud] = useState<boolean>(false);
  const [cloudRefreshSuccess, setCloudRefreshSuccess] = useState<boolean>(false);

  // Safe fallback profile
  const safeProfile = profile || {
    uid: 'guest',
    displayName: 'Joueur',
    email: null,
    photoURL: null,
    avatarId: 'lion',
    isGuest: true,
    stats: DEFAULT_PLAYER_STATS,
    honorificTitleId: 'APPRENTI',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // Safe numeric stats object
  const safeStats: PlayerStats = useMemo(() => {
    const s = { ...DEFAULT_PLAYER_STATS, ...(stats || safeProfile.stats || {}) };
    (Object.keys(DEFAULT_PLAYER_STATS) as Array<keyof PlayerStats>).forEach((key) => {
      if (typeof s[key] !== 'number' || isNaN(s[key])) {
        s[key] = 0;
      }
    });
    return s;
  }, [stats, safeProfile.stats]);

  const safeTitle = currentTitle && currentTitle.title ? currentTitle : HONORIFIC_TITLES[0];
  const safeHistory = Array.isArray(history) ? history : [];

  // Editing display name
  const [isEditingName, setIsEditingName] = useState<boolean>(false);
  const [nameInput, setNameInput] = useState<string>(safeProfile.displayName || 'Joueur');
  const [nameError, setNameError] = useState<string | null>(null);

  // Keep nameInput in sync when profile changes
  useEffect(() => {
    if (safeProfile.displayName) {
      setNameInput(safeProfile.displayName);
    }
  }, [safeProfile.displayName]);

  // History filtering & pagination
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('ALL');
  const [historyDisplayCount, setHistoryDisplayCount] = useState<number>(25);

  const filteredHistory = useMemo(() => {
    return safeHistory.filter((item) => {
      if (!item) return false;
      if (historyFilter === 'MANCHES') return Boolean(item.isMancheFinalWin || !item.partieNumber || item.isMancheOver);
      if (historyFilter === 'DONNES') return Boolean(item.partieNumber && !item.isMancheFinalWin);
      if (historyFilter === 'SOLO') return item.mode === 'SOLO';
      if (historyFilter === 'MULTIPLAYER') return item.mode === 'MULTIPLAYER';
      if (historyFilter === 'WINS') return Boolean(item.isWinner);
      if (historyFilter === 'KORAS') return item.winType === 'KORA' || item.winType === 'DOUBLE_KORA';
      return true;
    });
  }, [safeHistory, historyFilter]);

  const visibleHistory = filteredHistory.slice(0, historyDisplayCount);

  const winRate = (safeStats.gamesPlayed || 0) > 0
    ? Math.round(((safeStats.gamesWon || 0) / safeStats.gamesPlayed) * 100)
    : 0;
  const avgTricks = (safeStats.gamesPlayed || 0) > 0
    ? ((safeStats.totalTricksWon || 0) / safeStats.gamesPlayed).toFixed(1)
    : '0.0';

  // Escape key listener (le bouton Retour est géré dans App.tsx)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  useBackLayer(isOpen && showAvatarSheet, () => setShowAvatarSheet(false));

  const handleStartEditName = () => {
    setNameInput(safeProfile.displayName || 'Joueur');
    setNameError(null);
    setIsEditingName(true);
  };

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (trimmed.length < 2) {
      setNameError('Le pseudo doit contenir au moins 2 caractères.');
      return;
    }
    if (trimmed.toLowerCase() === 'katika' || trimmed.toLowerCase().includes('katika admin')) {
      setNameError('Le préfixe « Katika » est réservé à l’administration.');
      return;
    }
    await updateDisplayName(trimmed);
    setIsEditingName(false);
    setNameError(null);
  };

  const handleBackClick = () => {
    if (showAvatarSheet) {
      setShowAvatarSheet(false);
      return;
    }
    onClose();
  };

  const profileTabs: SegmentTab<ProfileTabType>[] = [
    { id: 'identity', label: 'Profil', icon: UserIcon },
    { id: 'stats', label: 'Stats', icon: BarChart3 },
    { id: 'history', label: 'Parties', icon: History },
    { id: 'settings', label: 'Réglages', icon: Settings },
  ];

  // Rule of Hooks: Return null only after all hooks have run
  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      id="player-profile-fullscreen"
      className="fixed inset-x-0 top-0 bottom-[var(--app-bottom-nav,0px)] z-[70] bg-slate-950 text-slate-100 flex flex-col overflow-hidden comfort-ui"
    >
      {/* 1. TOP UNIFIED NATIVE APP BAR */}
      <NativeScreenHeader
        id="native-profile-header"
        backLabel="Retour"
        onBack={handleBackClick}
        backTitle={sourceScreen === 'GAME' ? 'Retourner à la partie en cours' : 'Retourner à l’accueil'}
        title={<span className="hidden min-[360px]:block text-xs sm:text-sm md:text-base font-black tracking-tight uppercase text-white truncate">Profil</span>}
        contextBadge={
          (isGameActive || sourceScreen === 'GAME') ? (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>
                Partie en cours {isMultiplayer ? `(Multi ${gamePlayerCount}J)` : '(solo)'}
              </span>
            </div>
          ) : undefined
        }
        rightActions={
          <div className="flex items-center gap-2">
            {sourceScreen === 'GAME' && onOpenLeaderboard && (
              <button
                type="button"
                id="btn-profile-header-leaderboard"
                onClick={onOpenLeaderboard}
                className="px-2.5 py-1 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs active:scale-95"
                title="Consulter le Palmarès"
              >
                <Trophy className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span className="hidden sm:inline">Palmarès</span>
              </button>
            )}
          </div>
        }
      />

      {/* Sync / Action toast message */}
      {syncMessage && (
        <div className="shrink-0 px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 text-amber-300 text-xs flex items-center justify-center gap-2 shadow-inner">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          <span className="font-medium">{syncMessage}</span>
        </div>
      )}

      {/* 2. FIXED UNIFIED SEGMENTED NAV */}
      <NativeSegmentedNav
        tabs={profileTabs}
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId)}
        ariaLabel="Navigation du profil"
      />

      {/* 3. MAIN CONTENT SCROLLER (Natural, smooth vertical flow) */}
      <main className="flex-1 overflow-y-auto custom-dark-scrollbar px-3 sm:px-6 py-4 sm:py-6">
        <div className="max-w-2xl mx-auto space-y-5">
          {/* ========================================================= */}
          {/* TAB 1: IDENTITÉ (Avatar, Pseudo)                          */}
          {/* ========================================================= */}
          {activeTab === 'identity' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Hero Identity Card */}
              <div className="bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 shadow-xl relative overflow-hidden">
                {/* Glow accent */}
                <div className="absolute -top-12 -right-12 w-36 h-36 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

                {/* Hero Avatar with Honorific Badge + Bottom Sheet Trigger */}
                <div className="relative shrink-0 flex flex-col items-center gap-2">
                  <div
                    onClick={() => setShowAvatarSheet(true)}
                    className="cursor-pointer group relative rounded-full"
                    title="Changer d'avatar"
                  >
                    <PlayerAvatar
                      avatarId={safeProfile.avatarId}
                      photoURL={safeProfile.photoURL}
                      size="xl"
                      title={safeTitle}
                      showTitleBadge
                    />
                    <div className="absolute inset-0 rounded-full bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity border-2 border-amber-400">
                      <Sparkles className="w-5 h-5 text-amber-300 drop-shadow-md" />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAvatarSheet(true)}
                    className="text-xs font-bold text-amber-300 hover:text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 px-3 py-1 rounded-full flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-xs"
                    title="Choisir un avatar"
                  >
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span>Changer d'avatar</span>
                  </button>
                </div>

                {/* Info & Pseudo Editor */}
                <div className="flex-1 text-center sm:text-left space-y-2 w-full min-w-0">
                  {/* Pseudo editor */}
                  <div className="flex flex-col sm:flex-row items-center gap-2">
                    {isEditingName ? (
                      <div className="flex items-center gap-2 w-full max-w-sm">
                        <input
                          type="text"
                          value={nameInput}
                          onChange={(e) => setNameInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                          maxLength={24}
                          className="flex-1 px-3 py-1.5 bg-slate-950 border border-amber-400 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400/50 font-semibold"
                          placeholder="Ton pseudo"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={handleSaveName}
                          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1 transition shadow cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          OK
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsEditingName(false)}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl transition cursor-pointer"
                        >
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center sm:justify-start gap-2 group min-w-0">
                        <h2 className="text-xl sm:text-2xl font-black text-white tracking-wide truncate">
                          {safeProfile.displayName}
                        </h2>
                        <button
                          type="button"
                          id="btn-edit-displayname"
                          onClick={handleStartEditName}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-slate-800/80 transition cursor-pointer active:scale-95"
                          title="Modifier mon pseudo"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {nameError && (
                    <p className="text-xs text-rose-400 font-semibold">{nameError}</p>
                  )}

                  {/* Rank Badge & Performance Summary */}
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-bold border ${safeTitle.borderClass} ${safeTitle.colorClass} bg-slate-950 shadow-xs`}
                    >
                      <span>{safeTitle.badge}</span>
                      <span>{safeTitle.title}</span>
                      <span className="text-slate-400 font-normal">({safeTitle.subtitle})</span>
                    </span>

                    <span className="text-xs text-slate-300 font-semibold px-2.5 py-0.5 rounded-md bg-slate-800/80 border border-slate-700/60">
                      {safeStats.gamesWon || 0} victoires sur {safeStats.gamesPlayed || 0} parties ({winRate} %)
                    </span>
                  </div>

                  {/* Rank Motto */}
                  <p className="text-xs text-slate-400 italic leading-relaxed pt-1">
                    « {safeTitle.description} »
                  </p>
                </div>
              </div>

              {/* ACTIVE FAIR-PLAY SANCTION BANNER (Lot 3 - C) */}
              {activeSanction && activeSanction.active && (
                <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-200 flex items-start gap-3.5 shadow-lg animate-in fade-in">
                  <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-black uppercase tracking-wider text-rose-300">
                        Sanction fair-play : {activeSanction.type}
                      </h4>
                      {activeSanction.expiresAt && (
                        <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-rose-500/30 text-rose-200 font-bold shrink-0">
                          Expire dans {Math.max(1, Math.ceil((activeSanction.expiresAt - Date.now()) / 60000))} min
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-rose-200 leading-relaxed font-medium">
                      {activeSanction.reason}
                    </p>
                    <p className="text-xs text-rose-300/80">
                      Les abandons et déconnexions en cours de partie impactent la communauté et limitent tes accès multijoueur.
                    </p>
                  </div>
                </div>
              )}

              {/* OFFLINE SYNC QUEUE BANNER (Lot 3 - B) */}
              {offlineQueueCount > 0 && (
                <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-200 flex items-center justify-between gap-3 shadow-md">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    </div>
                    <div className="space-y-0.5 min-w-0">
                      <h4 className="text-xs font-black uppercase tracking-wider text-amber-300">
                        Envoi en attente ({offlineQueueCount})
                      </h4>
                      <p className="text-xs text-amber-200/90 truncate">
                        Tes derniers résultats sont gardés sur ce téléphone en attendant.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await flushOfflineQueue();
                    }}
                    className="h-8 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black shrink-0 transition active:scale-95 cursor-pointer shadow"
                  >
                    Envoyer
                  </button>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Solde de jetons */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 via-slate-900 to-slate-900 border border-amber-500/30 flex items-center justify-between gap-3 shadow-md">
                  <div className="space-y-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                      <Coins className="w-3.5 h-3.5 text-amber-400" />
                      Solde de jetons
                    </span>
                    <div className="text-2xl font-black text-amber-300 font-mono tracking-tight">
                      {chips.toLocaleString()}{' '}
                      <span className="text-xs font-bold text-amber-400/80 font-sans">jetons</span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Tes gains et pertes en Solo et Multijoueur
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
                    <Coins className="w-6 h-6" />
                  </div>
                </div>

                {/* Indice Fair-Play */}
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-3 shadow-md">
                  <div className="space-y-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      Fair-play
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-black px-2.5 py-0.5 rounded-full ${
                          (fairPlay?.consecutiveForfeits || 0) === 0
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : (fairPlay?.consecutiveForfeits || 0) === 1
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {(fairPlay?.consecutiveForfeits || 0) === 0
                          ? 'Impeccable (100%)'
                          : (fairPlay?.consecutiveForfeits || 0) === 1
                          ? 'Avertissement (1 abandon)'
                          : 'Pénalisé'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      {fairPlay?.totalForfeits || 0} abandon(s) • {fairPlay?.totalFoldRounds || 0} forfait(s)
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400 shrink-0">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                </div>
              </div>

              {/* Invité : invitation à sauvegarder avec Google */}
              {!isLoggedIn && (
                <button
                  type="button"
                  onClick={() => setActiveTab('settings')}
                  className="w-full p-3.5 rounded-2xl border bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-amber-500/5 border-amber-500/30 hover:border-amber-400/50 flex items-center justify-between gap-3 text-left transition-all duration-150 cursor-pointer active:scale-[0.99] shadow-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-amber-500/20 text-amber-300">
                      <GoogleIcon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white">Sauvegarder avec Google</p>
                      <p className="text-xs text-slate-400">Garde tes victoires et tes trophées, même sur un autre téléphone</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 shrink-0 text-amber-300" />
                </button>
              )}



            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 2: STATISTIQUES (6 Métriques Clés + Spéciales)        */}
          {/* ========================================================= */}
          {activeTab === 'stats' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Current Title Card with Progress */}
              <div
                className={`p-4 sm:p-5 rounded-2xl border bg-gradient-to-br ${safeTitle.glowClass} ${safeTitle.borderClass} space-y-3 shadow-lg`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl sm:text-4xl">{safeTitle.badge}</span>
                    <div>
                      <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">
                        Ton rang actuel
                      </span>
                      <h2 className={`text-lg sm:text-xl font-black ${safeTitle.colorClass}`}>
                        {safeTitle.title} ({safeTitle.subtitle})
                      </h2>
                    </div>
                  </div>

                </div>

                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  {safeTitle.description}
                </p>

                {/* Progress Bar to next title */}
                {nextTitle ? (
                  <div className="space-y-1.5 pt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-300 flex items-center gap-1.5">
                        Prochain rang :{' '}
                        <strong className={`font-bold ${nextTitle.colorClass}`}>{nextTitle.title}</strong>
                      </span>
                      <span className="font-bold text-amber-400">{progressPercent}%</span>
                    </div>

                    <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-700">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-500"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-300">
                      {rankGoalLabel(rankProgress)}
                    </p>
                  </div>
                ) : (
                  <div className="text-xs text-amber-300 font-semibold flex items-center gap-1.5 pt-1">
                    <Crown className="w-4 h-4 text-amber-400" />
                    Tu tiens le rang suprême de Légende du Kora !
                  </div>
                )}
              </div>



              {/* Comment se joue le rang */}
              <p className="-mt-2 px-1 text-xs text-slate-400">Ton rang suit ta place parmi les joueurs : il monte et il peut redescendre.</p>

              {/* Score de Maîtrise Highlight Banner */}
              <div className="bg-gradient-to-r from-amber-950/60 via-slate-900 to-amber-950/40 border-2 border-amber-500/40 rounded-2xl p-4 sm:p-5 shadow-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 font-black flex items-center justify-center shadow-md">
                      <Award className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-1.5">
                        <span>Score de Maîtrise</span>
                      </h3>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl sm:text-3xl font-black text-amber-400 font-mono">
                      {(safeStats.masteryScore || 0).toLocaleString()} <span className="text-xs font-bold text-amber-200">points</span>
                    </div>
                    <span className="text-xs text-slate-400">Total accumulé</span>
                  </div>
                </div>

                <SoloDailyGauge soloDaily={profile?.soloDaily} />

              </div>

              {/* 6 Core Metrics Grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* 1. Parties jouées (Distinction Manche / Partie) */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-1 shadow-sm">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-xs font-bold uppercase tracking-wider">Parties jouées</span>
                    <Layers className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-white font-mono">
                    {safeStats.gamesPlayed || 0}
                  </div>
                  <div className="text-xs text-slate-400 flex items-center gap-1.5 pt-1">
                    <span className="text-slate-300 font-semibold">{safeStats.soloGamesPlayed || 0}</span> Solo
                    <span>•</span>
                    <span className="text-slate-300 font-semibold">{safeStats.multiplayerGamesPlayed || 0}</span> Multi
                  </div>
                  <div className="text-xs text-slate-500 pt-0.5 border-t border-slate-800/80">
                    Dont <span className="text-amber-400 font-bold">{safeStats.partiesWon || safeStats.gamesWon || 0}</span> parties remportées
                  </div>
                </div>

                {/* 2. Victoires & Taux */}
                <div className="bg-slate-900/80 border border-emerald-500/30 rounded-2xl p-4 space-y-1 shadow-sm">
                  <div className="flex items-center justify-between text-emerald-400">
                    <span className="text-xs font-bold uppercase tracking-wider">Victoires</span>
                    <Trophy className="w-4 h-4" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">
                    {safeStats.gamesWon || 0}
                  </div>
                  <div className="text-xs text-slate-400 flex items-center gap-1.5 pt-1">
                    <span className="text-emerald-400 font-semibold">{safeStats.soloGamesWon || 0}</span> Solo
                    <span>•</span>
                    <span className="text-emerald-400 font-semibold">{safeStats.multiplayerGamesWon || 0}</span> Multi
                  </div>
                  <div className="text-xs text-slate-500 pt-0.5 border-t border-slate-800/80">
                    Taux : <strong className="text-emerald-300 font-bold">{winRate}%</strong> · Défaites : {(safeStats.gamesPlayed || 0) - (safeStats.gamesWon || 0)}
                  </div>
                </div>

                {/* 3. Koras Infligés */}
                <div className="bg-slate-900/80 border border-amber-500/40 rounded-2xl p-4 space-y-1 shadow-sm">
                  <div className="flex items-center justify-between text-amber-400">
                    <span className="text-xs font-bold uppercase tracking-wider">Koras 👑</span>
                    <Crown className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-amber-400 font-mono">
                    {safeStats.koraCount || 0}
                  </div>
                  <div className="text-xs text-slate-400 pt-1">
                    Pot multiplié par <strong className="text-amber-300 font-bold">2</strong>
                  </div>
                  <div className="text-xs text-slate-500 pt-0.5 border-t border-slate-800/80">
                    Koras simples
                  </div>
                </div>

                {/* 4. Double Koras */}
                <div className="bg-slate-900/80 border border-amber-500/40 rounded-2xl p-4 space-y-1 shadow-sm">
                  <div className="flex items-center justify-between text-amber-300">
                    <span className="text-xs font-bold uppercase tracking-wider">Double Koras</span>
                    <Zap className="w-4 h-4 text-amber-300" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-amber-300 font-mono">
                    {safeStats.doubleKoraCount || 0}
                  </div>
                  <div className="text-xs text-slate-400 pt-1">
                    Pot multiplié par <strong className="text-amber-300 font-bold">4</strong>
                  </div>
                  <div className="text-xs text-slate-500 pt-0.5 border-t border-slate-800/80">
                    Doubles Koras réussis
                  </div>
                </div>

              </div>

              <ProfileDetailsSection title="Détail du score de Maîtrise">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className="p-2 bg-slate-950/60 rounded-xl border border-slate-800/80">
                    <span className="text-xs uppercase font-bold text-slate-400 block">Manches multijoueur</span>
                    <span className="text-sm font-black text-amber-300 font-mono">
                      {safeStats.multiplayerManchesWon || 0}
                    </span>
                    <span className="text-xs text-slate-500 block">+10 points par manche</span>
                  </div>
                  <div className="p-2 bg-slate-950/60 rounded-xl border border-slate-800/80">
                    <span className="text-xs uppercase font-bold text-slate-400 block">Manches solo</span>
                    <span className="text-sm font-black text-amber-300 font-mono">
                      {safeStats.soloManchesWon || (safeStats.soloManchesWonHard || 0) + (safeStats.soloManchesWonNormal || 0) + (safeStats.soloManchesWonEasy || 0)}
                    </span>
                    <span className="text-xs text-slate-500 block">1 à 6 points par manche</span>
                  </div>
                  <div className="p-2 bg-slate-950/60 rounded-xl border border-slate-800/80">
                    <span className="text-xs uppercase font-bold text-slate-400 block">Parties gagnées</span>
                    <span className="text-sm font-black text-emerald-400 font-mono">
                      {safeStats.partiesWon || safeStats.gamesWon || 0}
                    </span>
                    <span className="text-xs text-slate-500 block">+1 point par partie</span>
                  </div>
                  <div className="p-2 bg-slate-950/60 rounded-xl border border-slate-800/80">
                    <span className="text-xs uppercase font-bold text-slate-400 block">Koras / Doubles</span>
                    <span className="text-sm font-black text-amber-300 font-mono">
                      {safeStats.koraCount || 0} / {safeStats.doubleKoraCount || 0}
                    </span>
                    <span className="text-xs text-slate-500 block">+5 et +15 points</span>
                  </div>
                </div>
              </ProfileDetailsSection>

              <ProfileDetailsSection title="Records">
                <div className="grid grid-cols-2 gap-3">
                {/* 5. Plus gros pot Remporté */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-1 shadow-sm">
                  <div className="flex items-center justify-between text-amber-300">
                    <span className="text-xs font-bold uppercase tracking-wider">Plus gros pot</span>
                    <Flame className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-amber-300 font-mono">
                    {(safeStats.biggestPotWon || 0).toLocaleString()} <span className="text-xs font-bold text-slate-400">jetons</span>
                  </div>
                  <div className="text-xs text-slate-400 pt-1">
                    Record en une seule partie
                  </div>
                </div>

                {/* 6. Moyenne de Tours par donne */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-1 shadow-sm">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-xs font-bold uppercase tracking-wider">Tours gagnés</span>
                    <Award className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-slate-400 font-mono">
                    {avgTricks} <span className="text-xs font-bold text-slate-400">/ 5</span>
                  </div>
                  <div className="text-xs text-slate-400 pt-1">
                    Tours remportés par partie
                  </div>
                  <div className="text-xs text-slate-500 pt-0.5 border-t border-slate-800/80">
                    Total : {safeStats.totalTricksWon || 0} tours
                  </div>
                </div>
                </div>
              </ProfileDetailsSection>

              <ProfileDetailsSection title="Solo et Multijoueur">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Taux de Victoire comparative list */}
                  <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 flex flex-col justify-between space-y-2">
                    <div>
                      <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">Taux de victoire</span>
                      <div className="flex items-baseline justify-between mt-1">
                        <span className="text-xs text-slate-400">Solo</span>
                        <span className="text-sm font-extrabold text-amber-400 font-mono">
                          {safeStats.soloWinRate || 0}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-900 h-1 rounded-full overflow-hidden mt-1">
                        <div className="bg-amber-500 h-full rounded-full" style={{ width: `${safeStats.soloWinRate || 0}%` }}></div>
                      </div>

                      <div className="flex items-baseline justify-between mt-2">
                        <span className="text-xs text-slate-400">Multijoueur</span>
                        <span className="text-sm font-extrabold text-emerald-400 font-mono">
                          {safeStats.multiplayerWinRate || 0}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-900 h-1 rounded-full overflow-hidden mt-1">
                        <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${safeStats.multiplayerWinRate || 0}%` }}></div>
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 pt-1.5 border-t border-slate-900 flex justify-between">
                      <span>Solo : {safeStats.soloGamesWon}/{safeStats.soloGamesPlayed}</span>
                      <span>Multi : {safeStats.multiplayerGamesWon}/{safeStats.multiplayerGamesPlayed}</span>
                    </div>
                  </div>

                  {/* Koras comparatif */}
                  <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 flex flex-col justify-between space-y-2">
                    <div>
                      <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">Koras</span>
                      
                      <div className="flex justify-between items-center mt-2.5">
                        <span className="text-xs text-slate-300">Solo</span>
                        <div className="text-right">
                          <span className="text-sm font-extrabold text-white font-mono">{safeStats.soloKoraCount || 0}</span>
                          <span className="text-xs text-slate-500 ml-1">({safeStats.soloDoubleKoraCount || 0} doubles)</span>
                        </div>
                      </div>

                      <div className="flex justify-between items-center mt-2">
                        <span className="text-xs text-slate-300">Multijoueur</span>
                        <div className="text-right">
                          <span className="text-sm font-extrabold text-amber-400 font-mono">{safeStats.multiplayerKoraCount || 0}</span>
                          <span className="text-xs text-amber-500/60 ml-1">({safeStats.multiplayerDoubleKoraCount || 0} doubles)</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 pt-1.5 border-t border-slate-900">
                      Total : <span className="text-amber-400 font-bold">{safeStats.koraCount || 0}</span> Koras au total
                    </div>
                  </div>

                  {/* Fortune accumulée */}
                  <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 flex flex-col justify-between space-y-2">
                    <div>
                      <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">Gains en jetons</span>
                      
                      <div className="flex justify-between items-center mt-2.5">
                        <span className="text-xs text-slate-300">Solo</span>
                        <span className={`text-sm font-extrabold font-mono ${safeStats.soloFortune >= 0 ? 'text-slate-300' : 'text-rose-400'}`}>
                          {safeStats.soloFortune >= 0 ? '+' : ''}{(safeStats.soloFortune || 0).toLocaleString()}
                        </span>
                      </div>

                      <div className="flex justify-between items-center mt-2">
                        <span className="text-xs text-slate-300">Multijoueur</span>
                        <span className={`text-sm font-extrabold font-mono ${safeStats.fortune >= 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                          {safeStats.fortune >= 0 ? '+' : ''}{(safeStats.fortune || 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 pt-1.5 border-t border-slate-900 flex justify-between">
                      <span>Gagnés : {safeStats.multiplayerGains.toLocaleString()}</span>
                      <span>Perdus : {safeStats.multiplayerPertes.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </ProfileDetailsSection>

              <ProfileDetailsSection title="Fair-play">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="text-xs uppercase font-bold text-slate-400">Abandons</span>
                    <div className="text-lg font-black text-white font-mono pt-1">
                      {fairPlay?.totalForfeits || 0}
                    </div>
                    <p className="text-xs text-slate-400">Parties quittées prématurément</p>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="text-xs uppercase font-bold text-slate-400">Forfaits déclarés</span>
                    <div className="text-lg font-black text-amber-300 font-mono pt-1">
                      {fairPlay?.totalFoldRounds || 0}
                    </div>
                    <p className="text-xs text-slate-400">Parties passées en déclarant forfait</p>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="text-xs uppercase font-bold text-slate-400">Sanction en cours</span>
                    <div className="text-xs font-bold font-mono pt-1">
                      {activeSanction && activeSanction.active ? (
                        <span className="text-rose-400 font-black">{activeSanction.type}</span>
                      ) : (
                        <span className="text-emerald-400 font-semibold">Aucune</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">Statut dans les salons multijoueurs</p>
                  </div>
                </div>
              </ProfileDetailsSection>

              <ProfileDetailsSection title="Victoires spéciales">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-white">Moins de 21 points</span>
                    </div>
                    <span className="text-base font-black text-amber-400 font-mono">
                      {safeStats.under21Count || 0}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-white">Trois 7</span>
                      <p className="text-xs text-slate-400">Combinaison légendaire du jeu</p>
                    </div>
                    <span className="text-base font-black text-amber-400 font-mono">
                      {safeStats.threeSevensCount || 0}
                    </span>
                  </div>
                </div>
              </ProfileDetailsSection>

              <ProfileDetailsSection title="Tous les rangs">
                <div className="space-y-2.5">
                  {HONORIFIC_TITLES.map((t) => {
                    const isUnlocked =
                      t.id === safeTitle.id ||
                      HONORIFIC_TITLES.findIndex((x) => x.id === t.id) <=
                        HONORIFIC_TITLES.findIndex((x) => x.id === safeTitle.id);
                    const isNext = nextTitle?.id === t.id;

                    return (
                      <div
                        key={t.id}
                        className={`p-3.5 sm:p-4 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                          isUnlocked
                            ? 'bg-slate-900/80 border-slate-700/80 shadow-xs'
                            : isNext
                            ? 'bg-amber-500/10 border-amber-500/30'
                            : 'bg-slate-950/40 border-slate-800/40 opacity-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl sm:text-3xl">{t.badge}</span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-sm font-bold ${
                                  isUnlocked ? t.colorClass : 'text-slate-400'
                                }`}
                              >
                                {t.title}
                              </span>
                              <span className="text-xs text-slate-500 font-mono">
                                ({t.subtitle})
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 leading-snug">
                              {rankConditionLabel(t.id as RankTitleId, rankTiers, rankConfirmedGoal)}
                            </p>
                          </div>
                        </div>

                        <div className="shrink-0">
                          {isUnlocked ? (
                            <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-lg flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              {t.id === safeTitle.id ? 'Ton rang' : 'Dépassé'}
                            </span>
                          ) : isNext ? (
                            <span className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-lg">
                              {rankProgress.pointsToNext !== null ? `Encore ${formatCompactNumber(rankProgress.pointsToNext)}` : `${progressPercent} %`}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-500 bg-slate-800 px-2.5 py-1 rounded-lg flex items-center gap-1">
                              <Lock className="w-3 h-3" />
                              À conquérir
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ProfileDetailsSection>

              {/* Cloud Sync & Refresh Header */}
              <div className="flex items-center justify-between p-3.5 bg-slate-900/80 border border-slate-800 rounded-2xl">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400">
                    <Cloud className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Tes statistiques</h4>
                    <p className="text-xs text-slate-400">
                      {isLoggedIn
                        ? 'Sauvegardées sur ton compte Google'
                        : 'Enregistrées sur ce téléphone jusqu’à ta connexion à Google'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    setIsRefreshingCloud(true);
                    setCloudRefreshSuccess(false);
                    try {
                      await refreshConsolidatedStats();
                      setCloudRefreshSuccess(true);
                      setTimeout(() => setCloudRefreshSuccess(false), 2500);
                    } catch (e) {
                      console.warn(e);
                    } finally {
                      setIsRefreshingCloud(false);
                    }
                  }}
                  disabled={isRefreshingCloud}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-xs font-bold text-slate-200 border border-slate-700 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  title="Rafraîchir les statistiques"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingCloud ? 'animate-spin text-amber-400' : 'text-slate-400'}`} />
                  <span>{cloudRefreshSuccess ? 'Synchronisé !' : isRefreshingCloud ? 'Calcul...' : 'Actualiser'}</span>
                </button>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* RÉGLAGES DU COMPTE (tous modes de jeu)                    */}
          {/* ========================================================= */}
          {activeTab === 'settings' && (
            <ProfileSettingsTab
              uid={safeProfile.uid}
              displayName={safeProfile.displayName || 'Joueur'}
              email={safeProfile.email}
              photoURL={safeProfile.photoURL}
              gamesPlayed={safeStats.gamesPlayed || 0}
              gamesWon={safeStats.gamesWon || 0}
              isLoggedIn={isLoggedIn}
              isSyncing={isSyncing}
              onLogin={loginWithGoogle}
              onLogout={logout}
              soundEnabled={soundEnabled}
              onToggleSound={onToggleSound}
              onOpenDiagnostic={() => setShowDiagnosticModal(true)}
              onOpenKoraCash={onOpenKoraCash}
            />
          )}

          {/* ========================================================= */}
          {/* TAB 4: HISTORIQUE DES PARTIES                            */}
          {/* ========================================================= */}
          {activeTab === 'history' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* History Filters: Segmented grid */}
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-1 p-1 bg-slate-900/90 rounded-xl border border-slate-800">
                {(
                  [
                    { id: 'ALL', label: 'Toutes' },
                    { id: 'MANCHES', label: 'Manches' },
                    { id: 'DONNES', label: 'Parties' },
                    { id: 'SOLO', label: 'Solo' },
                    { id: 'MULTIPLAYER', label: 'Multi' },
                    { id: 'WINS', label: 'Gains' },
                    { id: 'KORAS', label: 'Koras' },
                  ] as Array<{ id: HistoryFilter; label: string }>
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setHistoryFilter(f.id)}
                    className={`py-1.5 px-0.5 sm:px-1 rounded-lg text-xs font-bold transition text-center truncate cursor-pointer ${
                      historyFilter === f.id
                        ? 'bg-amber-500 text-slate-950 shadow font-black'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* History List */}
              {visibleHistory.length === 0 ? (
                <div className="py-12 text-center space-y-2 bg-slate-900/40 rounded-2xl border border-slate-800">
                  <Trophy className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-sm font-semibold text-slate-300">
                    Aucune partie trouvée pour ce filtre
                  </p>
                  <p className="text-xs text-slate-500">
                    Dispute une manche pour enregistrer tes statistiques et tes trophées !
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {visibleHistory.map((item) => {
                    const isWin = item.isWinner;
                    let dateStr = 'Récemment';
                    try {
                      if (item.createdAt) {
                        const d = new Date(item.createdAt);
                        if (!isNaN(d.getTime())) {
                          dateStr = d.toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          });
                        }
                      }
                    } catch {
                      dateStr = 'Récemment';
                    }

                    return (
                      <div
                        key={item.id}
                        className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                          isWin
                            ? 'bg-slate-900/90 border-emerald-500/30'
                            : 'bg-slate-900/40 border-slate-800'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs shadow shrink-0 mt-0.5 ${
                              isWin
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}
                          >
                            {isWin ? 'VIC' : 'DÉF'}
                          </div>

                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-white">
                                {item.mode === 'SOLO'
                                  ? 'Solo'
                                  : `Multijoueur (${item.playerCount || 4}J)`}
                              </span>

                              {/* Distinction Manche Complète vs Donne Individuelle */}
                              {item.isMancheFinalWin || item.isMancheOver || !item.partieNumber ? (
                                <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                                  <Trophy className="w-2.5 h-2.5" /> Manche complète
                                </span>
                              ) : (
                                <span className="text-xs px-2 py-0.5 rounded-full font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
                                  Partie #{item.partieNumber}
                                </span>
                              )}

                              {item.winType === 'KORA' && (
                                <span className="text-xs px-1.5 py-0.2 rounded font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  👑 KORA
                                </span>
                              )}
                              {item.winType === 'DOUBLE_KORA' && (
                                <span className="text-xs px-1.5 py-0.2 rounded font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                  ⚡ DOUBLE KORA
                                </span>
                              )}
                              {item.winType === 'UNDER_21' && (
                                <span className="text-xs px-1.5 py-0.2 rounded font-bold bg-slate-500/20 text-slate-300 border border-slate-500/30">
                                  🎯 Moins de 21
                                </span>
                              )}
                              {item.winType === 'THREE_SEVENS' && (
                                <span className="text-xs px-1.5 py-0.2 rounded font-bold bg-slate-500/20 text-slate-300 border border-slate-500/30">
                                  🎴 Trois 7
                                </span>
                              )}
                              {item.winType === 'FORFEIT' && (
                                <span className="text-xs px-1.5 py-0.2 rounded font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                  ⚠️ Forfait
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-slate-400">
                              {isWin
                                ? `Vainqueur : Toi`
                                : `Vainqueur : ${item.winnerName || 'Adversaire'}`}{' '}
                              • {dateStr}
                            </p>

                            {/* Opponents and duration if available */}
                            <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                              {item.durationSeconds && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-slate-400" />
                                  {Math.floor(item.durationSeconds / 60)}m {item.durationSeconds % 60}s
                                </span>
                              )}
                              {item.opponents && item.opponents.length > 0 && (
                                <span className="flex items-center gap-1 truncate max-w-xs">
                                  <Users className="w-3 h-3 text-slate-400 shrink-0" />
                                  vs {item.opponents.map(o => o.name).slice(0, 3).join(', ')}
                                  {item.opponents.length > 3 ? ` +${item.opponents.length - 3}` : ''}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-800/80 shrink-0">
                          <div
                            className={`text-sm font-black font-mono flex items-center gap-1 ${
                              isWin ? 'text-amber-400' : 'text-slate-400'
                            }`}
                          >
                            <Coins className="w-3.5 h-3.5" />
                            <span>{isWin ? `+${item.potWon}` : `-${item.baseBet || 5}`} jetons</span>
                          </div>
                          <span className="text-xs text-slate-500">
                            {item.tricksWon !== undefined ? `${item.tricksWon} tour(s) gagné(s)` : null}
                          </span>
                          {item.mode === 'SOLO' && item.isWinner && typeof item.masteryPointsAwarded === 'number' && (
                            <span
                              className={`text-xs font-mono font-bold ${
                                item.masteryPointsAwarded > 0 ? 'text-amber-300' : 'text-slate-500'
                              }`}
                            >
                              {item.masteryPointsAwarded > 0
                                ? `+${Number(item.masteryPointsAwarded.toFixed(2))} points de Maîtrise`
                                : 'Plafond solo atteint : 0 point'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Load more button */}
                  {filteredHistory.length > historyDisplayCount && (
                    <div className="pt-2 text-center">
                      <button
                        type="button"
                        onClick={() => setHistoryDisplayCount((prev) => prev + 25)}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition cursor-pointer"
                      >
                        Afficher plus de parties ({filteredHistory.length - historyDisplayCount} restantes)
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Mobile-ready Bottom Sheet for Avatar Selection */}
      <AvatarPickerBottomSheet
        isOpen={showAvatarSheet}
        onClose={() => setShowAvatarSheet(false)}
        currentAvatarId={safeProfile.avatarId}
        photoURL={safeProfile.photoURL}
        onSelectAvatar={updateAvatar}
      />

      {/* Connection Diagnostic Modal */}
      <ConnectionDiagnosticModal
        isOpen={showDiagnosticModal}
        onClose={() => setShowDiagnosticModal(false)}
      />
    </motion.div>
  );
};
