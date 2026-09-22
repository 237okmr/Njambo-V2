import React, { useState, useEffect } from 'react';
import {
  Home,
  LogOut,
  Save,
  Users,
  FolderOpen,
  HelpCircle,
  Zap,
  Music,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Download,
  X,
  SlidersHorizontal,
  CheckCircle2,
  Trophy,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GameState, AI_DIFFICULTIES_INFO, BetIncreaseProposal, RoomPlayer } from '../types';
import { BetIncreaseProposalWidget } from './BetIncreaseProposalWidget';
import { usePlayerProfile } from '../context/PlayerProfileContext';
import { PlayerAvatar } from './profile/PlayerAvatar';
import { GoogleIcon } from './common/GoogleIcon';
import { Cloud, ShieldCheck } from 'lucide-react';

interface GameHeaderProps {
  currentScreen: 'HOME' | 'GAME';
  isOnlineActive: boolean;
  isMultiplayerMode: boolean;
  activeGameState: GameState;
  soundEnabled: boolean;
  ambienceEnabled: boolean;
  gameSpeed: number;
  isFullscreen: boolean;
  isPwaInstalled: boolean;
  pendingInvitesCount?: number;
  betIncreaseProposal?: BetIncreaseProposal | null;
  multiplayerRoomId?: string;
  multiplayerPlayers?: RoomPlayer[];
  localPlayerId?: string;
  onProposeBetIncrease?: (amount: number) => void;
  onRespondBetIncrease?: (agree: boolean) => void;
  onCancelBetIncrease?: () => void;
  onReturnHome: () => void;
  onQuitMultiplayer: () => void;
  onQuickSave: () => void;
  onToggleSound: () => void;
  onToggleAmbience: () => void;
  onToggleGameSpeed: () => void;
  onToggleFullscreen: () => void;
  onOpenRules: () => void;
  onOpenSavedSessions: () => void;
  onOpenMultiplayerHub: () => void;
  onOpenSetupModal?: () => void;
  onInstallPwa: () => void;
  onOpenProfile?: () => void;
}

export const GameHeader: React.FC<GameHeaderProps> = ({
  currentScreen,
  isOnlineActive,
  isMultiplayerMode,
  activeGameState,
  soundEnabled,
  ambienceEnabled,
  gameSpeed,
  isFullscreen,
  isPwaInstalled,
  pendingInvitesCount = 0,
  betIncreaseProposal,
  multiplayerRoomId,
  multiplayerPlayers = [],
  localPlayerId = '',
  onProposeBetIncrease,
  onRespondBetIncrease,
  onCancelBetIncrease,
  onReturnHome,
  onQuitMultiplayer,
  onQuickSave,
  onToggleSound,
  onToggleAmbience,
  onToggleGameSpeed,
  onToggleFullscreen,
  onOpenRules,
  onOpenSavedSessions,
  onOpenMultiplayerHub,
  onOpenSetupModal,
  onInstallPwa,
  onOpenProfile,
}) => {
  const { profile, stats, currentTitle, isLoggedIn, loginWithGoogle, setIsLeaderboardOpen } = usePlayerProfile();
  const [isPauseModalOpen, setIsPauseModalOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    if (isAuthLoading) return;
    setIsAuthLoading(true);
    try {
      await loginWithGoogle();
    } catch {
      // Handled in context
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Close modal on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsPauseModalOpen(false);
      }
    };
    if (isPauseModalOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPauseModalOpen]);

  const handleSaveClick = () => {
    onQuickSave();
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  const handleQuitGameFromModal = () => {
    setIsPauseModalOpen(false);
    if (isOnlineActive) {
      onQuitMultiplayer();
    } else {
      onReturnHome();
    }
  };

  return (
    <>
      <header
        id="app-header"
        className="w-full bg-slate-900/95 backdrop-blur-md border-b border-slate-800/80 px-3 sm:px-4 py-2 flex items-center justify-between z-30 shadow-sm shrink-0 relative"
      >
        {/* 1. LEFT SECTION: Safe Navigation / Identity */}
        <div className="flex items-center gap-2 shrink-0">
          {currentScreen === 'GAME' ? (
            isOnlineActive ? (
              <button
                id="btn-quit-multiplayer"
                onClick={onQuitMultiplayer}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-950/60 hover:bg-rose-900/80 text-rose-200 border border-rose-800/60 transition active:scale-95 text-xs font-semibold shadow-xs cursor-pointer shrink-0 min-h-[36px]"
                title="Quitter la partie en ligne (Forfait)"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span className="hidden sm:inline">Quitter</span>
              </button>
            ) : (
              <button
                id="btn-return-home"
                onClick={onReturnHome}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/60 transition active:scale-95 text-xs font-semibold shadow-xs cursor-pointer shrink-0 min-h-[36px]"
                title="Retourner à l'accueil (Sauvegarde automatique)"
              >
                <Home className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="hidden sm:inline">Accueil</span>
              </button>
            )
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-emerald-600 to-emerald-400 flex items-center justify-center font-black text-slate-950 text-xs shadow-sm">
                N
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-black tracking-tight bg-gradient-to-r from-emerald-400 via-teal-300 to-amber-300 bg-clip-text text-transparent leading-none">
                  NJAMBO KORA
                </span>
                <span className="text-[9px] text-slate-400 font-medium leading-tight">
                  Jeu de cartes traditionnel
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 2. CENTER SECTION: Macro Game Status Capsule (Breadcrumbs & Pot) */}
        {currentScreen === 'GAME' ? (
          <div className="flex items-center justify-center min-w-0 mx-1 flex-1 sm:flex-initial">
            <div className="flex items-center gap-1.5 sm:gap-3 px-2 sm:px-3 py-1 rounded-full bg-slate-950/90 border border-slate-800/90 shadow-inner text-xs min-w-0 max-w-full">
              {/* Breadcrumbs */}
              <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] tracking-tight min-w-0">
                {isOnlineActive ? (
                  <span className="text-cyan-400 font-semibold flex items-center gap-1 shrink-0">
                    <span className="hidden xs:inline">🌐 Multi</span>
                    <span className="xs:hidden">🌐</span>
                  </span>
                ) : (
                  <span className="text-emerald-400 font-semibold flex items-center gap-1 shrink-0">
                    <span className="hidden xs:inline">🎮 Solo</span>
                    <span className="xs:hidden">🎮</span>
                  </span>
                )}
                
                {isOnlineActive && multiplayerRoomId && (
                  <>
                    <span className="text-slate-600 shrink-0">›</span>
                    <span className="text-slate-300 font-medium hidden sm:inline">Table #{multiplayerRoomId}</span>
                    <span className="text-slate-300 font-medium sm:hidden max-w-[60px] truncate">#{multiplayerRoomId}</span>
                  </>
                )}

                <span className="text-slate-600 shrink-0">›</span>
                <span className="text-white font-bold flex items-center gap-1 shrink-0">
                  <span className="hidden xs:inline">Manche</span>
                  <span className="xs:hidden">M.</span>
                  <span className="text-amber-300">{activeGameState.partieCount || activeGameState.roundCount || 1}</span>
                </span>
              </div>

              <div className="h-3 w-px bg-slate-800" />

              {/* Pot Counter */}
              <div className="flex items-center gap-1">
                <span className="text-slate-400 text-[10px] sm:text-[11px]">Pot</span>
                <span className="font-extrabold text-emerald-400 flex items-center gap-0.5 text-[11px] sm:text-xs font-mono">
                  <span>{activeGameState.pot || 0}</span>
                  <span className="text-[11px] text-amber-400 font-normal">🪙</span>
                </span>
              </div>

            </div>
          </div>
        ) : (
          <div className="hidden md:flex items-center gap-2 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Prêt à jouer</span>
          </div>
        )}

        {/* Bet Increase Proposal Widget (rendered in header ONLY during active play, masked during PARTIE_OVER to prevent duplication with EndRoundModal) */}
        {betIncreaseProposal &&
          activeGameState.phase !== 'PARTIE_OVER' &&
          onProposeBetIncrease &&
          onRespondBetIncrease &&
          onCancelBetIncrease && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 w-full max-w-md px-2 pointer-events-auto">
              <BetIncreaseProposalWidget
                currentBaseBet={activeGameState.baseBet || 10}
                proposal={betIncreaseProposal}
                players={multiplayerPlayers}
                localPlayerId={localPlayerId}
                onPropose={onProposeBetIncrease}
                onRespond={onRespondBetIncrease}
                onCancel={onCancelBetIncrease}
                compact
              />
            </div>
          )}

        {/* 3. RIGHT SECTION: Predictable Tactile Controls (Profile + Sound + Menu) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Subtle Google Auth pill when playing as guest */}
          {!isLoggedIn && (
            <button
              type="button"
              id="btn-header-google-sync"
              disabled={isAuthLoading}
              onClick={handleGoogleSignIn}
              className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-semibold shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-50 shrink-0"
              title="Lier Google pour synchroniser vos jetons et statistiques"
            >
              <GoogleIcon className="w-3.5 h-3.5" />
              <span>{isAuthLoading ? '...' : 'Sauvegarder'}</span>
            </button>
          )}

          {/* Quick Profile Trigger: Modern Ring Avatar */}
          {onOpenProfile && (
            <button
              type="button"
              id="btn-game-header-profile"
              onClick={onOpenProfile}
              className="w-9 h-9 rounded-full bg-slate-900/60 hover:bg-slate-800/80 backdrop-blur-md border border-white/10 hover:border-amber-400/40 transition active:scale-95 flex items-center justify-center cursor-pointer shrink-0"
              title={isLoggedIn ? `Connecté: ${profile.displayName}` : 'Mon Profil (Invité)'}
              aria-label="Mon Profil & Palmarès"
            >
              <PlayerAvatar
                avatarId={profile.avatarId}
                photoURL={profile.photoURL}
                size="xs"
                title={currentTitle}
                showStatusDot
                isOnline={isLoggedIn}
              />
            </button>
          )}

          {/* Quick Sound Toggle: Ergonomic 36x36px tap target */}
          <button
            id="btn-toggle-sound"
            onClick={onToggleSound}
            className="w-9 h-9 rounded-full bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700/60 transition active:scale-95 flex items-center justify-center cursor-pointer shrink-0"
            title={soundEnabled ? 'Couper le son' : 'Activer le son'}
            aria-label={soundEnabled ? 'Couper le son' : 'Activer le son'}
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-500" />
            )}
          </button>

          {/* Pause / Menu Trigger Button */}
          <button
            id="btn-header-menu"
            onClick={() => setIsPauseModalOpen(true)}
            className="relative flex items-center gap-1.5 px-3 py-1.5 h-9 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700/60 transition active:scale-95 text-xs font-semibold cursor-pointer shrink-0"
            title="Ouvrir le menu et les options"
            aria-label="Options et menu du jeu"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-300" />
            <span className="font-medium">Menu</span>
            {pendingInvitesCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white font-black text-[9px] flex items-center justify-center animate-bounce shadow">
                {pendingInvitesCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* 4. MODAL PAUSE & OPTIONS (Central, thumb-friendly, categorized) */}
      <AnimatePresence>
        {isPauseModalOpen && (
          <div
            id="pause-menu-backdrop"
            className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3.5 sm:p-4 overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setIsPauseModalOpen(false);
              }
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="w-full max-w-sm bg-slate-900 border border-slate-700/80 rounded-3xl p-4 sm:p-5 shadow-2xl flex flex-col gap-4 text-slate-200 my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center text-slate-300">
                    <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-100 leading-tight">Pause & Options</h2>
                    <p className="text-[11px] text-slate-400">Paramètres et navigation</p>
                  </div>
                </div>

                <button
                  id="btn-close-pause-modal"
                  onClick={() => setIsPauseModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-100 flex items-center justify-center transition active:scale-95 cursor-pointer"
                  title="Fermer le menu"
                  aria-label="Fermer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable Container with Categorized Options */}
              <div className="flex flex-col gap-3.5 max-h-[70vh] overflow-y-auto pr-0.5">
                {/* Profile & Palmarès Showcase Banner */}
                {onOpenProfile && (
                  <button
                    type="button"
                    id="btn-pause-menu-profile"
                    onClick={() => {
                      setIsPauseModalOpen(false);
                      onOpenProfile();
                    }}
                    className="w-full p-3 rounded-2xl bg-gradient-to-r from-amber-500/15 via-slate-950 to-slate-950 border border-amber-500/30 hover:border-amber-400/60 transition flex items-center justify-between group cursor-pointer text-left shadow-sm active:scale-98"
                  >
                    <div className="flex items-center gap-2.5">
                      <PlayerAvatar
                        avatarId={profile.avatarId}
                        photoURL={profile.photoURL}
                        size="md"
                        title={currentTitle}
                        showTitleBadge
                      />
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs text-white group-hover:text-amber-300 transition">
                            {profile.displayName}
                          </span>
                          <span className={`text-[9px] px-1.5 py-0.2 rounded font-semibold border ${currentTitle.borderClass} ${currentTitle.colorClass} bg-slate-900`}>
                            {currentTitle.badge} {currentTitle.title}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {stats.gamesWon}V / {stats.gamesPlayed}P • {isLoggedIn ? 'Cloud Google' : 'Invité'}
                        </span>
                      </div>
                    </div>
                    <span className="text-[11px] font-bold text-amber-400 group-hover:translate-x-0.5 transition flex items-center shrink-0">
                      Palmarès →
                    </span>
                  </button>
                )}

                {/* Quick Google Auth in Pause Menu if Guest */}
                {!isLoggedIn && (
                  <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold text-white truncate">Sauvegarder la partie</span>
                        <span className="text-[10px] text-slate-300 truncate">
                          Liez votre compte Google pour conserver vos stats
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      id="btn-pause-menu-google-sync"
                      disabled={isAuthLoading}
                      onClick={handleGoogleSignIn}
                      className="h-7 px-2.5 rounded-lg bg-white hover:bg-slate-100 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow transition active:scale-95 cursor-pointer shrink-0 disabled:opacity-50"
                    >
                      <GoogleIcon className="w-3 h-3" />
                      <span>{isAuthLoading ? '...' : 'Lier'}</span>
                    </button>
                  </div>
                )}

                {/* CATEGORY 1: En jeu (Confort & Rythme) */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">
                    Gameplay & Confort
                  </span>
                  <div className="bg-slate-950/60 rounded-2xl p-1 border border-slate-800/60 flex flex-col gap-0.5">
                    {/* Game Speed Toggle */}
                    {currentScreen === 'GAME' && !isOnlineActive && (
                      <button
                        onClick={onToggleGameSpeed}
                        className="w-full min-h-[44px] flex items-center justify-between px-3 py-2 rounded-xl hover:bg-slate-800/70 transition text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <Zap className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />
                          <div>
                            <span className="font-semibold text-xs text-slate-100 block">Vitesse du jeu</span>
                            <span className="text-[10px] text-slate-400">Accélérer les tours des IA</span>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-950/70 text-amber-300 border border-amber-800/60 font-mono">
                          {gameSpeed}x
                        </span>
                      </button>
                    )}

                    {/* AI Difficulty Toggle (Solo) */}
                    {currentScreen === 'GAME' && !isOnlineActive && onOpenSetupModal && (
                      <button
                        onClick={() => {
                          setIsPauseModalOpen(false);
                          onOpenSetupModal();
                        }}
                        className="w-full min-h-[44px] flex items-center justify-between px-3 py-2 rounded-xl hover:bg-slate-800/70 transition text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-base shrink-0">
                            {AI_DIFFICULTIES_INFO[activeGameState.aiDifficulty || 'NORMAL']?.icon || '⚔️'}
                          </span>
                          <div>
                            <span className="font-semibold text-xs text-slate-100 block">Niveau des IA</span>
                            <span className="text-[10px] text-slate-400">Modifier l'intelligence adverse</span>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-950/70 text-amber-300 border border-amber-800/60">
                          {AI_DIFFICULTIES_INFO[activeGameState.aiDifficulty || 'NORMAL']?.name || 'Normal'}
                        </span>
                      </button>
                    )}

                    {/* Sound Effects */}
                    <button
                      onClick={onToggleSound}
                      className="w-full min-h-[44px] flex items-center justify-between px-3 py-2 rounded-xl hover:bg-slate-800/70 transition text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        {soundEnabled ? (
                          <Volume2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <VolumeX className="w-4 h-4 text-slate-500 shrink-0" />
                        )}
                        <div>
                          <span className="font-semibold text-xs text-slate-100 block">Effets sonores</span>
                          <span className="text-[10px] text-slate-400">Cartes, jetons et annonces</span>
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          soundEnabled
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {soundEnabled ? 'ACTIF' : 'COUPÉ'}
                      </span>
                    </button>

                    {/* Salon Ambience Music */}
                    <button
                      onClick={onToggleAmbience}
                      className="w-full min-h-[44px] flex items-center justify-between px-3 py-2 rounded-xl hover:bg-slate-800/70 transition text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <Music
                          className={`w-4 h-4 shrink-0 ${ambienceEnabled ? 'text-amber-400' : 'text-slate-500'}`}
                        />
                        <div>
                          <span className="font-semibold text-xs text-slate-100 block">Ambiance sonore</span>
                          <span className="text-[10px] text-slate-400">Musique de fond immersive</span>
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          ambienceEnabled
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {ambienceEnabled ? 'ACTIF' : 'COUPÉ'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* CATEGORY 2: Assistance & Outils */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">
                    Assistance & Outils
                  </span>
                  <div className="bg-slate-950/60 rounded-2xl p-1 border border-slate-800/60 flex flex-col gap-0.5">
                    {/* Rules */}
                    <button
                      onClick={() => {
                        setIsPauseModalOpen(false);
                        onOpenRules();
                      }}
                      className="w-full min-h-[44px] flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-800/70 transition text-left cursor-pointer"
                    >
                      <HelpCircle className="w-4 h-4 text-purple-400 shrink-0" />
                      <div>
                        <span className="font-semibold text-xs text-slate-100 block">Règles du jeu</span>
                        <span className="text-[10px] text-slate-400">Ordre des cartes, Kora et calcul du pot</span>
                      </div>
                    </button>

                    {/* Saved Sessions */}
                    <button
                      onClick={() => {
                        setIsPauseModalOpen(false);
                        onOpenSavedSessions();
                      }}
                      className="w-full min-h-[44px] flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-800/70 transition text-left cursor-pointer"
                    >
                      <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />
                      <div>
                        <span className="font-semibold text-xs text-slate-100 block">Manches sauvegardées</span>
                        <span className="text-[10px] text-slate-400">Reprendre ou organiser vos parties</span>
                      </div>
                    </button>

                    {/* Multiplayer Hub */}
                    <button
                      onClick={() => {
                        setIsPauseModalOpen(false);
                        onOpenMultiplayerHub();
                      }}
                      className="w-full min-h-[44px] flex items-center justify-between px-3 py-2 rounded-xl hover:bg-slate-800/70 transition text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <Users className="w-4 h-4 text-emerald-400 shrink-0" />
                        <div>
                          <span className="font-semibold text-xs text-slate-100 block">Multijoueur en ligne</span>
                          <span className="text-[10px] text-slate-400">Salons privés et parties rapides</span>
                        </div>
                      </div>
                      {pendingInvitesCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white animate-pulse">
                          {pendingInvitesCount} invité
                        </span>
                      )}
                    </button>

                    {/* Palmarès */}
                    <button
                      id="btn-pause-menu-leaderboard"
                      onClick={() => {
                        setIsPauseModalOpen(false);
                        setIsLeaderboardOpen(true);
                      }}
                      className="w-full min-h-[44px] flex items-center justify-between px-3 py-2 rounded-xl hover:bg-slate-800/70 transition text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
                        <div>
                          <span className="font-semibold text-xs text-slate-100 block">Palmarès</span>
                          <span className="text-[10px] text-slate-400">Classement et statistiques des joueurs</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
                        Voir
                      </span>
                    </button>

                    {/* Fullscreen Toggle */}
                    <button
                      onClick={() => {
                        setIsPauseModalOpen(false);
                        onToggleFullscreen();
                      }}
                      className="w-full min-h-[44px] flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-800/70 transition text-left cursor-pointer"
                    >
                      {isFullscreen ? (
                        <Minimize2 className="w-4 h-4 text-cyan-400 shrink-0" />
                      ) : (
                        <Maximize2 className="w-4 h-4 text-cyan-400 shrink-0" />
                      )}
                      <div>
                        <span className="font-semibold text-xs text-slate-100 block">
                          {isFullscreen ? 'Quitter le plein écran' : 'Mode plein écran'}
                        </span>
                        <span className="text-[10px] text-slate-400">Agrandir la zone de jeu</span>
                      </div>
                    </button>

                    {/* Install PWA */}
                    {!isPwaInstalled && (
                      <button
                        onClick={() => {
                          setIsPauseModalOpen(false);
                          onInstallPwa();
                        }}
                        className="w-full min-h-[44px] flex items-center gap-3 px-3 py-2 rounded-xl bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-800/40 transition text-left cursor-pointer"
                      >
                        <Download className="w-4 h-4 text-emerald-400 shrink-0" />
                        <div>
                          <span className="font-semibold text-xs text-emerald-200 block">Installer l'application</span>
                          <span className="text-[10px] text-emerald-400/80">Accès rapide depuis l'écran d'accueil</span>
                        </div>
                      </button>
                    )}
                  </div>
                </div>

                {/* CATEGORY 3: Session de jeu (Sauvegarde & Quitter) */}
                <div className="flex flex-col gap-1.5 pt-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">
                    Gestion de la partie
                  </span>
                  <div className="bg-slate-950/60 rounded-2xl p-1 border border-slate-800/60 flex flex-col gap-1">
                    {/* Save Current Session */}
                    {currentScreen === 'GAME' && !isOnlineActive && (
                      <button
                        onClick={handleSaveClick}
                        className="w-full min-h-[44px] flex items-center justify-between px-3 py-2 rounded-xl hover:bg-slate-800/70 transition text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <Save className="w-4 h-4 text-blue-400 shrink-0" />
                          <div>
                            <span className="font-semibold text-xs text-slate-100 block">
                              {justSaved ? 'Manche sauvegardée !' : 'Sauvegarder la manche'}
                            </span>
                            <span className="text-[10px] text-slate-400">Enregistrer l'état actuel</span>
                          </div>
                        </div>
                        {justSaved ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <span className="text-[10px] text-slate-400">Auto</span>
                        )}
                      </button>
                    )}

                    {/* Quit / Return Home Option */}
                    {currentScreen === 'GAME' && (
                      <button
                        onClick={handleQuitGameFromModal}
                        className="w-full min-h-[44px] flex items-center gap-3 px-3 py-2 rounded-xl bg-rose-950/30 hover:bg-rose-950/60 border border-rose-900/50 text-rose-200 transition text-left cursor-pointer"
                      >
                        <LogOut className="w-4 h-4 text-rose-400 shrink-0" />
                        <div>
                          <span className="font-semibold text-xs text-rose-100 block">
                            {isOnlineActive ? 'Quitter la partie en ligne' : "Retourner à l'accueil"}
                          </span>
                          <span className="text-[10px] text-rose-300/70">
                            {isOnlineActive
                              ? 'Déclare un forfait pour la manche'
                              : 'La partie en cours reste sauvegardée'}
                          </span>
                        </div>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Footer (Return to game button) */}
              <button
                onClick={() => setIsPauseModalOpen(false)}
                className="w-full py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-slate-950 font-bold text-xs shadow-lg transition active:scale-98 cursor-pointer mt-1"
              >
                Reprendre la partie
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
