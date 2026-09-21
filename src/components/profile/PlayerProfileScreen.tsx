import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
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
  LogOut,
  Volume2,
  VolumeX,
  Sparkles,
  RefreshCw,
  Cloud,
  Smartphone,
  CheckCircle2,
  Coins,
  AlertTriangle,
  Clock,
  Users,
  Activity,
} from 'lucide-react';
import { usePlayerProfile } from '../../context/PlayerProfileContext';
import { PlayerAvatar } from './PlayerAvatar';
import { FlatAvatarIcon } from './FlatAvatarIcon';
import { PushNotificationToggle } from './PushNotificationToggle';
import { AvatarPickerBottomSheet } from './AvatarPickerBottomSheet';
import { ConnectionDiagnosticModal } from '../common/ConnectionDiagnosticModal';
import { NativeScreenHeader } from '../common/NativeScreenHeader';
import { NativeSegmentedNav, SegmentTab } from '../common/NativeSegmentedNav';
import {
  AVATAR_OPTIONS,
  HONORIFIC_TITLES,
  AvatarOptionId,
  PlayerGameHistoryItem,
  PlayerStats,
  DEFAULT_PLAYER_STATS,
} from '../../types/playerProfile';

export type ProfileTabType = 'identity' | 'google' | 'stats' | 'progression' | 'history';
export type HistoryFilter = 'ALL' | 'MANCHES' | 'DONNES' | 'SOLO' | 'MULTIPLAYER' | 'WINS' | 'KORAS';

import { GoogleIcon } from '../common/GoogleIcon';

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

  const [activeTab, setActiveTab] = useState<ProfileTabType>('identity');
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

  // Hardware Back button & Escape key listener
  useEffect(() => {
    if (!isOpen) return;

    // Push a dummy history state so hardware back button pops it and triggers onClose
    window.history.pushState({ screen: 'profile' }, '');

    const handlePopState = () => {
      onClose();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

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
    if (activeTab !== 'identity') {
      setActiveTab('identity');
      return;
    }
    if (window.history.state?.screen === 'profile') {
      window.history.back();
    } else {
      onClose();
    }
  };

  const profileTabs: SegmentTab<ProfileTabType>[] = useMemo(() => [
    { id: 'identity', label: 'Profil', shortLabel: 'Profil', icon: UserIcon },
    {
      id: 'google',
      label: 'Google',
      shortLabel: 'Google',
      icon: ShieldCheck,
      badge: isLoggedIn ? '✓' : undefined,
      badgeColor: 'bg-emerald-500 text-slate-950 font-black',
    },
    { id: 'stats', label: 'Stats', shortLabel: 'Stats', icon: BarChart3 },
    { id: 'progression', label: 'Rangs', shortLabel: 'Rangs', icon: Trophy },
    { id: 'history', label: 'Parties', shortLabel: 'Parties', icon: History },
  ], [isLoggedIn]);

  // Rule of Hooks: Return null only after all hooks have run
  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      id="player-profile-fullscreen"
      className="fixed inset-0 z-[70] bg-slate-950 text-slate-100 flex flex-col overflow-hidden"
    >
      {/* 1. TOP UNIFIED NATIVE APP BAR */}
      <NativeScreenHeader
        id="native-profile-header"
        backLabel="Retour"
        onBack={handleBackClick}
        backTitle={sourceScreen === 'GAME' ? 'Retourner à la partie en cours' : 'Retourner à l’accueil'}
        title="Mon Profil & Palmarès"
        onToggleSound={onToggleSound}
        soundEnabled={soundEnabled}
        onHome={onClose}
        contextBadge={
          (isGameActive || sourceScreen === 'GAME') ? (
            <div className="hidden xs:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>
                Partie en cours {isMultiplayer ? `(Multi ${gamePlayerCount}J)` : '(Solo vs IA)'}
              </span>
            </div>
          ) : undefined
        }
        rightActions={
          <div className="flex items-center gap-2">
            {onOpenLeaderboard && (
              <button
                type="button"
                id="btn-profile-header-leaderboard"
                onClick={onOpenLeaderboard}
                className="px-2.5 py-1 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs active:scale-95"
                title="Consulter le Palmarès"
              >
                <Trophy className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span className="hidden xs:inline">Palmarès</span>
              </button>
            )}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 font-mono font-bold text-xs shadow-xs">
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              <span>{(chips || 1000).toLocaleString()}</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 px-2.5 py-1 rounded-xl bg-slate-800/80 border border-slate-700/80">
              {isLoggedIn ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">Google lié</span>
                </>
              ) : (
                <span className="text-slate-400">Mode Invité</span>
              )}
            </div>
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
                    title="Changer d'avatar (Ouvrir le tiroir)"
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
                    className="text-[11px] font-bold text-amber-300 hover:text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 px-3 py-1 rounded-full flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-xs"
                    title="Ouvrir le tiroir des avatars"
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
                          placeholder="Votre pseudo"
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
                      {safeStats.gamesWon || 0}V / {safeStats.gamesPlayed || 0} parties ({winRate}%)
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
                        Sanction Fair-Play Active : {activeSanction.type}
                      </h4>
                      {activeSanction.expiresAt && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/30 text-rose-200 font-bold shrink-0">
                          Expire dans {Math.max(1, Math.ceil((activeSanction.expiresAt - Date.now()) / 60000))} min
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-rose-200 leading-relaxed font-medium">
                      {activeSanction.reason}
                    </p>
                    <p className="text-[11px] text-rose-300/80">
                      Les abandons et déconnexions en cours de partie impactent la communauté et limitent vos accès multijoueur.
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
                        Synchronisation en attente ({offlineQueueCount})
                      </h4>
                      <p className="text-[11px] text-amber-200/90 truncate">
                        Données enregistrées localement en attente de téléversement cloud.
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
                    Synchroniser
                  </button>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Solde de jetons */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 via-slate-900 to-slate-900 border border-amber-500/30 flex items-center justify-between gap-3 shadow-md">
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                      <Coins className="w-3.5 h-3.5 text-amber-400" />
                      Solde de Jetons
                    </span>
                    <div className="text-2xl font-black text-amber-300 font-mono tracking-tight">
                      {(chips || 1000).toLocaleString()}{' '}
                      <span className="text-xs font-bold text-amber-400/80 font-sans">jetons</span>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Synchronisé avec vos parties et gains de pot
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
                    <Coins className="w-6 h-6 animate-pulse" />
                  </div>
                </div>

                {/* Indice Fair-Play */}
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-3 shadow-md">
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      Réputation Fair-Play
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
                    <p className="text-[10px] text-slate-400">
                      {fairPlay?.totalForfeits || 0} abandon(s) • {fairPlay?.totalFoldRounds || 0} fold(s)
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400 shrink-0">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                </div>
              </div>

              {/* Quick Status banner to Google tab */}
              <button
                type="button"
                onClick={() => setActiveTab('google')}
                className={`w-full p-3.5 rounded-2xl border flex items-center justify-between gap-3 text-left transition-all duration-150 cursor-pointer active:scale-[0.99] shadow-sm ${
                  isLoggedIn
                    ? 'bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/15'
                    : 'bg-gradient-to-r from-amber-500/15 via-yellow-500/10 to-amber-500/5 border-amber-500/30 hover:border-amber-400/50'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      isLoggedIn ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {isLoggedIn ? <ShieldCheck className="w-5 h-5" /> : <GoogleIcon className="w-5 h-5" />}
                  </div>
                  <div className="truncate">
                    <p className="text-xs font-bold text-white flex items-center gap-2">
                      <span>{isLoggedIn ? 'Compte Google Protégé' : 'Liez votre Compte Google'}</span>
                      <span
                        className={`text-[10px] px-2 py-0.2 rounded-full font-bold ${
                          isLoggedIn
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-amber-400/20 text-amber-300 animate-pulse'
                        }`}
                      >
                        {isLoggedIn ? 'En ligne' : 'Recommandé'}
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {isLoggedIn
                        ? `Connecté en tant que ${safeProfile.email || safeProfile.displayName}`
                        : 'Sauvegardez vos victoires et vos trophées dans le Cloud'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-xs font-bold shrink-0 text-amber-300">
                  <span className="hidden sm:inline">Gérer</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              </button>

              {/* Avatar Selector Gallery: Option A - Grille 4x2 Confortable */}
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-md">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      Choisir votre Avatar de Table (8 disponibles)
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Touchez un avatar pour personnaliser votre présence sur le tapis.
                    </p>
                  </div>

                  {safeProfile.photoURL && (
                    <button
                      type="button"
                      onClick={() => updateAvatar('google')}
                      className={`text-xs px-3 py-1.5 rounded-xl border transition-all cursor-pointer font-bold ${
                        safeProfile.avatarId === 'google'
                          ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                          : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700'
                      }`}
                    >
                      Photo Google
                    </button>
                  )}
                </div>

                {/* 4 columns x 2 rows Grid */}
                <div className="grid grid-cols-4 gap-2 sm:gap-3">
                  {AVATAR_OPTIONS.map((opt) => {
                    const isSelected = safeProfile.avatarId === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => updateAvatar(opt.id)}
                        className={`group relative flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-xl border transition-all duration-150 cursor-pointer active:scale-95 ${
                          isSelected
                            ? 'bg-amber-500/20 border-amber-400 shadow-lg ring-2 ring-amber-400/40 scale-[1.03]'
                            : 'bg-slate-950/70 border-slate-800 hover:border-slate-700 hover:bg-slate-800/60 hover:scale-[1.02]'
                        }`}
                        title={opt.description}
                      >
                        {/* Flat Design Avatar on White Background */}
                        <div
                          className={`w-11 h-11 sm:w-13 sm:h-13 rounded-full flex items-center justify-center p-1.5 sm:p-2 bg-white border-2 ${opt.borderClass} shadow-md transition-transform group-hover:scale-105`}
                        >
                          <FlatAvatarIcon avatarId={opt.id} />
                        </div>

                        {/* Name Label */}
                        <span
                          className={`text-[10px] sm:text-xs font-semibold mt-1.5 truncate w-full text-center tracking-tight ${
                            isSelected ? 'text-amber-300 font-bold' : 'text-slate-300 group-hover:text-white'
                          }`}
                        >
                          {opt.name}
                        </span>

                        {/* Selected Indicator Checkmark */}
                        {isSelected && (
                          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center shadow">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Push Notifications Card */}
              <PushNotificationToggle
                userId={safeProfile.uid || 'guest'}
                userName={safeProfile.displayName || 'Joueur'}
              />

              {/* Diagnostic de Connexion Temps Réel Card */}
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
                <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                    <Activity className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs sm:text-sm font-bold text-white">Diagnostic de connexion</h3>
                    <p className="text-[11px] text-slate-400">Vérifier l'état du serveur, latence, jetons et erreurs.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDiagnosticModal(true)}
                  className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-400 hover:text-amber-300 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0"
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>Ouvrir le diagnostic</span>
                </button>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 2: AUTHENTIFICATION & COMPTE GOOGLE (Dédié & Moderne) */}
          {/* ========================================================= */}
          {activeTab === 'google' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {isLoggedIn ? (
                /* CONNECTED GOOGLE ACCOUNT VIEW */
                <>
                  {/* Verified Google Account Hero Card */}
                  <div className="bg-gradient-to-br from-slate-900 via-slate-900/95 to-emerald-950/40 border border-emerald-500/30 rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden space-y-4">
                    <div className="absolute -top-10 -right-10 w-36 h-36 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

                    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-5">
                      {/* Photo or Avatar with Google Verified Ring */}
                      <div className="relative shrink-0">
                        {safeProfile.photoURL ? (
                          <img
                            src={safeProfile.photoURL}
                            alt="Photo Google"
                            className="w-16 h-16 sm:w-18 sm:h-18 rounded-full border-2 border-emerald-400 shadow-lg object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-3xl shadow-lg border-2 border-emerald-400">
                            👑
                          </div>
                        )}
                        <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-slate-950 border-2 border-emerald-400 flex items-center justify-center shadow">
                          <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                        </div>
                      </div>

                      {/* Account Details */}
                      <div className="flex-1 text-center sm:text-left space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                          <h2 className="text-lg sm:text-xl font-black text-white truncate">
                            {safeProfile.displayName}
                          </h2>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            <ShieldCheck className="w-3 h-3" />
                            COMPTE GOOGLE VÉRIFIÉ
                          </span>
                        </div>

                        <p className="text-xs sm:text-sm font-semibold text-emerald-300 truncate">
                          {safeProfile.email || 'Compte Google synchronisé'}
                        </p>

                        <p className="text-[11px] text-slate-400 flex items-center justify-center sm:justify-start gap-1.5 pt-0.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          <span>Sauvegarde Cloud Firestore active et synchronisée</span>
                        </p>
                      </div>
                    </div>

                    {/* Quick Synced Metrics Recap */}
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-center">
                      <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800/60">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Parties Cloud</span>
                        <p className="text-base font-black text-white font-mono">{safeStats.gamesPlayed || 0}</p>
                      </div>
                      <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800/60">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Victoires</span>
                        <p className="text-base font-black text-emerald-400 font-mono">{safeStats.gamesWon || 0}</p>
                      </div>
                      <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800/60">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Koras 👑</span>
                        <p className="text-base font-black text-amber-400 font-mono">{safeStats.koraCount || 0}</p>
                      </div>
                    </div>
                  </div>

                  {/* 3 Cloud Advantages Pillars */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-1.5 shadow-sm">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                        <Cloud className="w-4 h-4" />
                      </div>
                      <h4 className="text-xs font-bold text-white">Sauvegarde Firestore</h4>
                      <p className="text-[11px] text-slate-400 leading-snug">
                        Chaque victoire et trophée est gravé instantanément dans votre base Cloud sécurisée.
                      </p>
                    </div>

                    <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-1.5 shadow-sm">
                      <div className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <h4 className="text-xs font-bold text-white">Multi-Appareils</h4>
                      <p className="text-[11px] text-slate-400 leading-snug">
                        Jouez sur mobile, PWA ou PC : votre rang et vos avatars vous suivent partout.
                      </p>
                    </div>

                    <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-1.5 shadow-sm">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <h4 className="text-xs font-bold text-white">Anti-Perte Absolu</h4>
                      <p className="text-[11px] text-slate-400 leading-snug">
                        Même en vidant votre cache ou en changeant de téléphone, votre historique reste intact.
                      </p>
                    </div>
                  </div>

                  {/* Account Actions Bar */}
                  <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
                    <div className="text-center sm:text-left space-y-0.5">
                      <p className="text-xs font-bold text-white">Gestion de la session</p>
                      <p className="text-[11px] text-slate-400">
                        Vous pouvez synchroniser manuellement ou vous déconnecter pour repasser en mode invité.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={loginWithGoogle}
                        disabled={isSyncing}
                        className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95 disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-amber-400' : ''}`} />
                        <span>Resynchroniser</span>
                      </button>

                      <button
                        type="button"
                        onClick={logout}
                        disabled={isSyncing}
                        className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 hover:text-rose-200 border border-rose-500/30 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95 disabled:opacity-50"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Déconnexion</span>
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                /* GUEST MODE: SLEEK CLOUD UPGRADE CTA */
                <>
                  {/* Hero CTA Card */}
                  <div className="bg-gradient-to-br from-slate-900 via-amber-950/20 to-slate-950 border border-amber-500/30 rounded-2xl p-5 sm:p-7 shadow-2xl relative overflow-hidden space-y-5 text-center">
                    <div className="absolute -top-16 -left-16 w-44 h-44 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute -bottom-16 -right-16 w-44 h-44 bg-yellow-500/10 rounded-full blur-3xl pointer-events-none" />

                    {/* Badge */}
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>SAUVEGARDE PERMANENTE DANS LE CLOUD</span>
                    </div>

                    {/* Headline */}
                    <div className="space-y-2 max-w-lg mx-auto">
                      <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                        Protégez votre Palmarès avec Google
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                        Vous jouez actuellement en <strong className="text-amber-300">Mode Invité</strong>. Associez votre compte Google en un clic pour ne jamais perdre vos victoires, vos Koras et votre titre honorifique.
                      </p>
                    </div>

                    {/* The Big Official Google Action Button */}
                    <div className="max-w-md mx-auto pt-2 space-y-2.5">
                      <button
                        type="button"
                        id="btn-google-login-dedicated"
                        onClick={loginWithGoogle}
                        disabled={isSyncing}
                        className="w-full py-3.5 px-5 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-extrabold text-sm sm:text-base flex items-center justify-center gap-3 transition-all duration-200 shadow-xl shadow-white/10 active:scale-[0.98] cursor-pointer disabled:opacity-50"
                      >
                        {isSyncing ? (
                          <>
                            <RefreshCw className="w-5 h-5 animate-spin text-slate-700" />
                            <span>Connexion sécurisée en cours...</span>
                          </>
                        ) : (
                          <>
                            <GoogleIcon className="w-5 h-5" />
                            <span>Continuer avec Google</span>
                          </>
                        )}
                      </button>

                      <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
                        <Lock className="w-3 h-3 text-slate-500" />
                        <span>Connexion officielle sans mot de passe via Google Identity Services</span>
                      </p>
                    </div>
                  </div>

                  {/* Automatic Fusion Guarantee */}
                  <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl flex items-start gap-3.5 shadow-sm">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                      <RefreshCw className="w-4 h-4" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-xs sm:text-sm font-bold text-white">
                        Fusion automatique et sans perte
                      </h4>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Toutes vos parties jouées aujourd’hui ({safeStats.gamesPlayed || 0} partie(s), {safeStats.gamesWon || 0} victoire(s)) seront instantanément rattachées à votre compte Google lors de votre première connexion.
                      </p>
                    </div>
                  </div>

                  {/* 3 Pillars Bento Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-1.5 shadow-sm">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <h4 className="text-xs font-bold text-white">Sécurité Cloud</h4>
                      <p className="text-[11px] text-slate-400 leading-snug">
                        Vos trophées restent enregistrés pour toujours, même après réinitialisation de votre navigateur.
                      </p>
                    </div>

                    <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-1.5 shadow-sm">
                      <div className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <h4 className="text-xs font-bold text-white">Multi-Appareils</h4>
                      <p className="text-[11px] text-slate-400 leading-snug">
                        Retrouvez votre progression sur votre mobile, votre tablette ou votre ordinateur de bureau.
                      </p>
                    </div>

                    <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-1.5 shadow-sm">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                        <Crown className="w-4 h-4" />
                      </div>
                      <h4 className="text-xs font-bold text-white">Statut Multijoueur</h4>
                      <p className="text-[11px] text-slate-400 leading-snug">
                        Arborez votre avatar personnalisé et votre rang honorifique dans toutes les salles multijoueurs.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 2: STATISTIQUES (6 Métriques Clés + Spéciales)        */}
          {/* ========================================================= */}
          {activeTab === 'stats' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Cloud Sync & Refresh Header */}
              <div className="flex items-center justify-between p-3.5 bg-slate-900/80 border border-slate-800 rounded-2xl">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400">
                    <Cloud className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Statistiques Consolidées</h4>
                    <p className="text-[10px] text-slate-400">
                      {isLoggedIn
                        ? 'Données synchronisées avec votre profil Firestore Cloud'
                        : 'Mode Invité : Données conservées localement avec fusion Cloud à la connexion'}
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

              {/* Palmarès Callout Banner */}
              {onOpenLeaderboard && (
                <div
                  onClick={onOpenLeaderboard}
                  className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-slate-900 to-slate-900 border border-amber-500/30 flex items-center justify-between gap-3 hover:border-amber-400/50 cursor-pointer transition shadow-md group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 group-hover:scale-105 transition shrink-0">
                      <Trophy className="w-5 h-5 fill-amber-400 text-amber-400" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-black text-white group-hover:text-amber-300 transition-colors">
                        Palmarès & Classement
                      </span>
                      <span className="text-[11px] text-slate-400 truncate">
                        Découvrez votre rang face aux autres joueurs de la communauté
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-black text-xs group-hover:bg-amber-400 transition shrink-0 shadow-sm cursor-pointer"
                  >
                    Consulter
                  </button>
                </div>
              )}

              {/* Score de Maîtrise Highlight Banner */}
              <div className="bg-gradient-to-r from-amber-950/60 via-slate-900 to-amber-950/40 border-2 border-amber-500/40 rounded-2xl p-4 sm:p-5 shadow-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 font-black flex items-center justify-center shadow-md">
                      <Award className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-bold tracking-wider text-amber-400/90">
                        Indicateur Officiel de Performance
                      </div>
                      <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-1.5">
                        <span>Score de Maîtrise</span>
                        <span className="text-xs font-bold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-md border border-amber-500/30">
                          Échelle 1-20 pts
                        </span>
                      </h3>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl sm:text-3xl font-black text-amber-400 font-mono">
                      {(safeStats.masteryScore || 0).toLocaleString()} <span className="text-xs font-bold text-amber-200">pts</span>
                    </div>
                    <span className="text-[10px] text-slate-400">Total accumulé</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-amber-500/20 text-center">
                  <div className="p-2 bg-slate-950/60 rounded-xl border border-slate-800/80">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Manches Multi</span>
                    <span className="text-sm font-black text-amber-300 font-mono">
                      {safeStats.multiplayerManchesWon || 0}
                    </span>
                    <span className="text-[9px] text-slate-500 block">(+10 pts/m)</span>
                  </div>
                  <div className="p-2 bg-slate-950/60 rounded-xl border border-slate-800/80">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Manches Solo</span>
                    <span className="text-sm font-black text-amber-300 font-mono">
                      {safeStats.soloManchesWon || (safeStats.soloManchesWonHard || 0) + (safeStats.soloManchesWonNormal || 0) + (safeStats.soloManchesWonEasy || 0)}
                    </span>
                    <span className="text-[9px] text-slate-500 block">(1 à 6 pts/m)</span>
                  </div>
                  <div className="p-2 bg-slate-950/60 rounded-xl border border-slate-800/80">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Donnes Gagnées</span>
                    <span className="text-sm font-black text-emerald-400 font-mono">
                      {safeStats.partiesWon || safeStats.gamesWon || 0}
                    </span>
                    <span className="text-[9px] text-slate-500 block">(+1 pt/donne)</span>
                  </div>
                  <div className="p-2 bg-slate-950/60 rounded-xl border border-slate-800/80">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Koras / Dbl</span>
                    <span className="text-sm font-black text-yellow-300 font-mono">
                      {safeStats.koraCount || 0} / {safeStats.doubleKoraCount || 0}
                    </span>
                    <span className="text-[9px] text-slate-500 block">(+5 / +20 pts)</span>
                  </div>
                </div>
              </div>

              {/* 6 Core Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                {/* 1. Parties Jouées (Distinction Manche / Partie) */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-1 shadow-sm">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-xs font-bold uppercase tracking-wider">Parties Jouées</span>
                    <Layers className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-white font-mono">
                    {safeStats.gamesPlayed || 0}
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5 pt-1">
                    <span className="text-slate-300 font-semibold">{safeStats.soloGamesPlayed || 0}</span> Solo
                    <span>•</span>
                    <span className="text-slate-300 font-semibold">{safeStats.multiplayerGamesPlayed || 0}</span> Multi
                  </div>
                  <div className="text-[10px] text-slate-500 pt-0.5 border-t border-slate-800/80">
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
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5 pt-1">
                    <span className="text-emerald-400 font-semibold">{safeStats.soloGamesWon || 0}</span> Solo
                    <span>•</span>
                    <span className="text-emerald-400 font-semibold">{safeStats.multiplayerGamesWon || 0}</span> Multi
                  </div>
                  <div className="text-[10px] text-slate-500 pt-0.5 border-t border-slate-800/80">
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
                  <div className="text-[11px] text-slate-400 pt-1">
                    Multiplicateur pot : <strong className="text-amber-300 font-bold">x2</strong>
                  </div>
                  <div className="text-[10px] text-slate-500 pt-0.5 border-t border-slate-800/80">
                    Koras simples infligés
                  </div>
                </div>

                {/* 4. Double Koras */}
                <div className="bg-slate-900/80 border border-yellow-500/40 rounded-2xl p-4 space-y-1 shadow-sm">
                  <div className="flex items-center justify-between text-yellow-300">
                    <span className="text-xs font-bold uppercase tracking-wider">Double Koras</span>
                    <Zap className="w-4 h-4 text-yellow-300" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-yellow-300 font-mono">
                    {safeStats.doubleKoraCount || 0}
                  </div>
                  <div className="text-[11px] text-slate-400 pt-1">
                    Multiplicateur pot : <strong className="text-yellow-300 font-bold">x4</strong>
                  </div>
                  <div className="text-[10px] text-slate-500 pt-0.5 border-t border-slate-800/80">
                    Coups suprêmes (Double Kora)
                  </div>
                </div>

                {/* 5. Plus Gros Pot Remporté */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-1 shadow-sm">
                  <div className="flex items-center justify-between text-amber-300">
                    <span className="text-xs font-bold uppercase tracking-wider">Plus Gros Pot</span>
                    <Flame className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-amber-300 font-mono">
                    {(safeStats.biggestPotWon || 0).toLocaleString()} <span className="text-xs font-bold text-slate-400">pts</span>
                  </div>
                  <div className="text-[11px] text-slate-400 pt-1">
                    Record en une seule donne
                  </div>
                  <div className="text-[10px] text-slate-500 pt-0.5 border-t border-slate-800/80">
                    Solde actuel : <strong className="text-amber-400 font-mono">{(chips || 1000).toLocaleString()}</strong>
                  </div>
                </div>

                {/* 6. Moyenne de Tours par donne */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-1 shadow-sm">
                  <div className="flex items-center justify-between text-sky-400">
                    <span className="text-xs font-bold uppercase tracking-wider">Moyenne Tours</span>
                    <Award className="w-4 h-4 text-sky-400" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-sky-400 font-mono">
                    {avgTricks} <span className="text-xs font-bold text-slate-400">/ 5</span>
                  </div>
                  <div className="text-[11px] text-slate-400 pt-1">
                    Tours remportés par donne
                  </div>
                  <div className="text-[10px] text-slate-500 pt-0.5 border-t border-slate-800/80">
                    Total : {safeStats.totalTricksWon || 0} tours
                  </div>
                </div>
              </div>

              {/* Comparatif Solo vs Multijoueur Détaillé */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-md">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs sm:text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-amber-400" />
                    Comparatif Détaillé : Solo vs Multijoueur
                  </h3>
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-md font-semibold">
                    Analyse de Style
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Taux de Victoire comparative list */}
                  <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 flex flex-col justify-between space-y-2">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Taux de Réussite</span>
                      <div className="flex items-baseline justify-between mt-1">
                        <span className="text-xs text-slate-400">Mode Solo (IA)</span>
                        <span className="text-sm font-extrabold text-amber-400 font-mono">
                          {safeStats.soloWinRate || 0}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-900 h-1 rounded-full overflow-hidden mt-1">
                        <div className="bg-amber-500 h-full rounded-full" style={{ width: `${safeStats.soloWinRate || 0}%` }}></div>
                      </div>

                      <div className="flex items-baseline justify-between mt-2">
                        <span className="text-xs text-slate-400">Mode Multi (Joueurs)</span>
                        <span className="text-sm font-extrabold text-emerald-400 font-mono">
                          {safeStats.multiplayerWinRate || 0}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-900 h-1 rounded-full overflow-hidden mt-1">
                        <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${safeStats.multiplayerWinRate || 0}%` }}></div>
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-500 pt-1.5 border-t border-slate-900 flex justify-between">
                      <span>Solo: {safeStats.soloGamesWon}/{safeStats.soloGamesPlayed}</span>
                      <span>Multi: {safeStats.multiplayerGamesWon}/{safeStats.multiplayerGamesPlayed}</span>
                    </div>
                  </div>

                  {/* Koras comparatif */}
                  <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 flex flex-col justify-between space-y-2">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Koras & Coups de Maître</span>
                      
                      <div className="flex justify-between items-center mt-2.5">
                        <span className="text-xs text-slate-300">Entraînement Solo</span>
                        <div className="text-right">
                          <span className="text-sm font-extrabold text-white font-mono">{safeStats.soloKoraCount || 0}</span>
                          <span className="text-[10px] text-slate-500 ml-1">({safeStats.soloDoubleKoraCount || 0} dbl)</span>
                        </div>
                      </div>

                      <div className="flex justify-between items-center mt-2">
                        <span className="text-xs text-slate-300">Compétition Multi</span>
                        <div className="text-right">
                          <span className="text-sm font-extrabold text-amber-400 font-mono">{safeStats.multiplayerKoraCount || 0}</span>
                          <span className="text-[10px] text-amber-500/60 ml-1">({safeStats.multiplayerDoubleKoraCount || 0} dbl)</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-500 pt-1.5 border-t border-slate-900">
                      Total: <span className="text-amber-400 font-bold">{safeStats.koraCount || 0}</span> Koras infligés au total
                    </div>
                  </div>

                  {/* Fortune accumulée */}
                  <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 flex flex-col justify-between space-y-2">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Fortune & Gains (Jetons)</span>
                      
                      <div className="flex justify-between items-center mt-2.5">
                        <span className="text-xs text-slate-300">Gains contre l'IA</span>
                        <span className={`text-sm font-extrabold font-mono ${safeStats.soloFortune >= 0 ? 'text-slate-300' : 'text-rose-400'}`}>
                          {safeStats.soloFortune >= 0 ? '+' : ''}{(safeStats.soloFortune || 0).toLocaleString()}
                        </span>
                      </div>

                      <div className="flex justify-between items-center mt-2">
                        <span className="text-xs text-slate-300">Gains en Ligne (vrais)</span>
                        <span className={`text-sm font-extrabold font-mono ${safeStats.fortune >= 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                          {safeStats.fortune >= 0 ? '+' : ''}{(safeStats.fortune || 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-500 pt-1.5 border-t border-slate-900 flex justify-between">
                      <span>Gains Multi: {safeStats.multiplayerGains.toLocaleString()}</span>
                      <span>Pertes: {safeStats.multiplayerPertes.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Fair-Play & Respect des règles (Lot 3 - C) */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3 shadow-md">
                <h3 className="text-xs sm:text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Statistiques de Fair-Play & Engagement
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Abandons / Forfaits</span>
                    <div className="text-lg font-black text-white font-mono pt-1">
                      {fairPlay?.totalForfeits || 0}
                    </div>
                    <p className="text-[10px] text-slate-400">Parties quittées prématurément</p>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Folds Stratégiques</span>
                    <div className="text-lg font-black text-amber-300 font-mono pt-1">
                      {fairPlay?.totalFoldRounds || 0}
                    </div>
                    <p className="text-[10px] text-slate-400">Rounds passés (Fold réglementaire)</p>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Sanction Actuelle</span>
                    <div className="text-xs font-bold font-mono pt-1">
                      {activeSanction && activeSanction.active ? (
                        <span className="text-rose-400 font-black">{activeSanction.type}</span>
                      ) : (
                        <span className="text-emerald-400 font-semibold">Aucune (Profil Sain)</span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400">Statut dans les salons multijoueurs</p>
                  </div>
                </div>
              </div>

              {/* Special Strategic Accomplishments */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3 shadow-md">
                <h3 className="text-xs sm:text-sm font-bold text-slate-200 uppercase tracking-wider">
                  Victoires Stratégiques & Spéciales
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-white">Moins de 21 points (Under 21)</span>
                      <p className="text-[11px] text-slate-400">Victoire mathématique par carte basse</p>
                    </div>
                    <span className="text-base font-black text-amber-400 font-mono">
                      {safeStats.under21Count || 0}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-white">Trois 7 consécutifs</span>
                      <p className="text-[11px] text-slate-400">Combinaison légendaire du jeu</p>
                    </div>
                    <span className="text-base font-black text-amber-400 font-mono">
                      {safeStats.threeSevensCount || 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 3: PROGRESSION & RANGS (Roadmap des Titres)            */}
          {/* ========================================================= */}
          {activeTab === 'progression' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Current Title Card with Progress */}
              <div
                className={`p-4 sm:p-5 rounded-2xl border bg-gradient-to-br ${safeTitle.glowClass} ${safeTitle.borderClass} space-y-3 shadow-lg`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl sm:text-4xl">{safeTitle.badge}</span>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                        Votre Grade Actuel
                      </span>
                      <h2 className={`text-lg sm:text-xl font-black ${safeTitle.colorClass}`}>
                        {safeTitle.title} ({safeTitle.subtitle})
                      </h2>
                    </div>
                  </div>

                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-900/80 border border-slate-700 text-amber-300">
                    Actif ✓
                  </span>
                </div>

                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  {safeTitle.description}
                </p>

                {/* Progress Bar to next title */}
                {nextTitle ? (
                  <div className="space-y-1.5 pt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-300 flex items-center gap-1.5">
                        Prochain grade :{' '}
                        <strong className={`font-bold ${nextTitle.colorClass}`}>{nextTitle.title}</strong>
                      </span>
                      <span className="font-bold text-amber-400">{progressPercent}%</span>
                    </div>

                    <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-700">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 rounded-full transition-all duration-500"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-amber-300 font-semibold flex items-center gap-1.5 pt-1">
                    <Crown className="w-4 h-4 text-yellow-400" />
                    Vous avez atteint le rang suprême de Légende Kora !
                  </div>
                )}
              </div>

              {/* All Titles Roadmap */}
              <div className="space-y-3">
                <h3 className="text-xs sm:text-sm font-bold text-slate-300 uppercase tracking-wider">
                  Tous les Rangs Honorifiques
                </h3>

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
                              <span className="text-[10px] text-slate-500 font-mono">
                                ({t.subtitle})
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 leading-snug">
                              {t.description}
                            </p>
                          </div>
                        </div>

                        <div className="shrink-0">
                          {isUnlocked ? (
                            <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-lg flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              Obtenu
                            </span>
                          ) : isNext ? (
                            <span className="text-[11px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-lg">
                              En cours ({progressPercent}%)
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-500 bg-slate-800 px-2.5 py-1 rounded-lg flex items-center gap-1">
                              <Lock className="w-3 h-3" />
                              Verrouillé
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
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
                    { id: 'MANCHES', label: 'Manches 🏆' },
                    { id: 'DONNES', label: 'Donnes 🎴' },
                    { id: 'SOLO', label: 'Solo' },
                    { id: 'MULTIPLAYER', label: 'Multi' },
                    { id: 'WINS', label: 'Gains' },
                    { id: 'KORAS', label: 'Koras 👑' },
                  ] as Array<{ id: HistoryFilter; label: string }>
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setHistoryFilter(f.id)}
                    className={`py-1.5 px-0.5 sm:px-1 rounded-lg text-[10px] sm:text-xs font-bold transition text-center truncate cursor-pointer ${
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
                    Disputez une manche pour enregistrer vos statistiques et vos trophées !
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
                                  ? 'Solo (vs IA)'
                                  : `Multijoueur (${item.playerCount || 4}J)`}
                              </span>

                              {/* Distinction Manche Complète vs Donne Individuelle */}
                              {item.isMancheFinalWin || item.isMancheOver || !item.partieNumber ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                                  <Trophy className="w-2.5 h-2.5" /> Manche Complète
                                </span>
                              ) : (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
                                  Donne #{item.partieNumber}
                                </span>
                              )}

                              {item.winType === 'KORA' && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  👑 KORA
                                </span>
                              )}
                              {item.winType === 'DOUBLE_KORA' && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-yellow-500/20 text-yellow-300 border border-yellow-500/40">
                                  ⚡ DOUBLE KORA
                                </span>
                              )}
                              {item.winType === 'UNDER_21' && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                  🎯 Moins de 21
                                </span>
                              )}
                              {item.winType === 'THREE_SEVENS' && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                  🎴 Trois 7
                                </span>
                              )}
                              {item.winType === 'FORFEIT' && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                  ⚠️ Forfait
                                </span>
                              )}
                            </div>

                            <p className="text-[11px] text-slate-400">
                              {isWin
                                ? `Vainqueur : Vous`
                                : `Vainqueur : ${item.winnerName || 'Adversaire'}`}{' '}
                              • {dateStr}
                            </p>

                            {/* Opponents and duration if available */}
                            <div className="flex items-center gap-3 text-[10px] text-slate-500 flex-wrap">
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
                          <span className="text-[10px] text-slate-500">
                            {item.tricksWon !== undefined ? `${item.tricksWon} tour(s) remportés` : 'Pot réel validé'}
                          </span>
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
