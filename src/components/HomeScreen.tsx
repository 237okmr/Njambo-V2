import React from 'react';
import { Play, Globe, BookOpen, FolderOpen, Zap, Sparkles, Volume2, VolumeX, Smartphone, HelpCircle, ChevronRight, Trophy } from 'lucide-react';
import { motion } from 'motion/react';
import { SavedManche } from '../types';
import { APP_VERSION } from '../version';
import { usePlayerProfile } from '../context/PlayerProfileContext';
import { HeaderProfileButton } from './profile/HeaderProfileButton';
import { NativeScreenHeader } from './common/NativeScreenHeader';

interface HomeScreenProps {
  savedSessions?: SavedManche[];
  activeSessionId?: string | null;
  savedSessionsCount?: number;
  hasActiveSavedSession?: boolean;
  pendingInvitesCount?: number;
  onStartNewGame?: () => void;
  onStartSolo?: () => void;
  onResumeSession?: (sessionId: string) => void;
  onResumeActiveSession?: () => void;
  onOpenSavedSessions?: () => void;
  onOpenMultiplayerHub?: () => void;
  onOpenMultiplayer?: () => void;
  onOpenRules: () => void;
  onOpenSimpleRules?: () => void;
  onOpenTests?: () => void;
  onOpenTestMode?: () => void;
  onOpenProfile?: () => void;
  onOpenLeaderboard?: () => void;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  onOpenInstallModal?: () => void;
  deferredInstallPrompt?: any;
  isPwaInstalled?: boolean;
  activeMultiplayerRoom?: any;
  onResumeMultiplayer?: () => void;
  onLeaveMultiplayer?: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  savedSessions = [],
  activeSessionId = null,
  savedSessionsCount = 0,
  hasActiveSavedSession = false,
  pendingInvitesCount = 0,
  onStartNewGame,
  onStartSolo,
  onResumeSession,
  onResumeActiveSession,
  onOpenSavedSessions,
  onOpenMultiplayerHub,
  onOpenMultiplayer,
  onOpenRules,
  onOpenSimpleRules,
  onOpenTests,
  onOpenTestMode,
  onOpenProfile,
  onOpenLeaderboard,
  soundEnabled,
  onToggleSound,
  onOpenInstallModal,
  deferredInstallPrompt,
  isPwaInstalled,
  activeMultiplayerRoom,
  onResumeMultiplayer,
  onLeaveMultiplayer,
}) => {
  const { profile, currentTitle, isLoggedIn } = usePlayerProfile();
  const sessionsList = Array.isArray(savedSessions) ? savedSessions : [];
  const activeSession =
    (activeSessionId ? sessionsList.find((s) => s.id === activeSessionId) : null) ||
    (sessionsList.length > 0 ? sessionsList[0] : null);

  const handleStartGame = onStartSolo || onStartNewGame || (() => {});
  const handleMultiplayer = onOpenMultiplayer || onOpenMultiplayerHub || (() => {});
  const handleTests = onOpenTestMode || onOpenTests;
  const handleResume = () => {
    if (onResumeActiveSession) {
      onResumeActiveSession();
    } else if (onResumeSession && activeSession) {
      onResumeSession(activeSession.id);
    }
  };

  // 1. Left branding block for NativeScreenHeader (Logo 🎴 + Gradient text)
  const leftContent = (
    <div className="flex items-center gap-2 shrink-0">
      <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-black text-xs shadow-sm">
        🎴
      </div>
      <span className="text-xs font-black tracking-tight bg-gradient-to-r from-amber-400 to-amber-200 bg-clip-text text-transparent hidden xs:inline">
        NJAMBO KORA
      </span>
    </div>
  );

  // 2. Right action controls aligned with unified header tokens (rounded-xl, h-9)
  const rightActions = (
    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
      {/* Profile Pill Button: Modern & Sleek Ring Capsule */}
      {onOpenProfile && (
        <HeaderProfileButton
          variant="pill"
          onClick={onOpenProfile}
        />
      )}

      {/* Palmarès Quick Button */}
      {onOpenLeaderboard && (
        <button
          type="button"
          id="btn-header-leaderboard"
          onClick={onOpenLeaderboard}
          className="h-9 px-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 active:scale-95 border border-slate-700/80 hover:border-amber-400/40 text-amber-400 text-xs font-bold transition-all duration-150 flex items-center gap-1.5 cursor-pointer shadow-sm shrink-0"
          title="Consulter le Palmarès"
          aria-label="Consulter le Palmarès"
        >
          <Trophy className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />
          <span className="hidden xs:inline">Palmarès</span>
        </button>
      )}

      {/* PWA Install Button */}
      {onOpenInstallModal && (
        <button
          type="button"
          id="btn-header-install"
          onClick={onOpenInstallModal}
          className="h-9 px-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 active:scale-95 text-amber-300 border border-amber-500/40 text-xs font-bold transition-all duration-150 flex items-center gap-1.5 cursor-pointer shadow-sm shrink-0"
          title="Installer l'application sur Android"
          aria-label="Installer l'application"
        >
          <Smartphone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>{isPwaInstalled ? 'Installée ✓' : 'Installer'}</span>
        </button>
      )}

      {/* Sound Toggle Button (conditioned on onToggleSound) */}
      {onToggleSound && (
        <button
          type="button"
          id="btn-header-sound"
          onClick={onToggleSound}
          className="w-9 h-9 rounded-xl bg-slate-800/90 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-amber-300 border border-slate-700/80 transition-all duration-150 flex items-center justify-center cursor-pointer shadow-sm shrink-0"
          title={soundEnabled ? 'Couper le son' : 'Activer le son'}
          aria-label={soundEnabled ? 'Couper le son' : 'Activer le son'}
        >
          {soundEnabled ? (
            <Volume2 className="w-4 h-4 text-amber-400" />
          ) : (
            <VolumeX className="w-4 h-4 text-slate-500" />
          )}
        </button>
      )}
    </div>
  );

  return (
    <div
      id="home-screen"
      className="min-h-[100dvh] h-[100dvh] w-full bg-slate-950 text-slate-100 flex flex-col justify-between relative overflow-y-auto overflow-x-hidden font-sans select-none p-3 sm:p-4 no-scrollbar"
    >
      {/* Subtle Ambient Background Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-60 h-60 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Background Played Cards ("Cartes Jouées en Arrière-Plan") */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-0">
        {/* Card 1: 10 Koubi (Top-Left, Winner trick) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8, rotate: -25 }}
          animate={{ opacity: 1, scale: 1, rotate: -18 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="absolute top-[8%] left-[2%] sm:left-[8%] w-20 sm:w-24 h-28 sm:h-34 rounded-xl bg-slate-100 text-slate-900 border-2 border-amber-400/60 p-2 flex flex-col justify-between shadow-2xl opacity-25 sm:opacity-30 backdrop-blur-[1px]"
        >
          <div className="flex flex-col items-start leading-none">
            <span className="text-xs sm:text-sm font-black text-rose-600">10</span>
            <span className="text-[10px] sm:text-xs font-bold text-rose-600">♥</span>
          </div>
          <div className="self-center text-2xl sm:text-3xl text-rose-600 select-none">♥</div>
          <div className="flex flex-col items-end leading-none rotate-180">
            <span className="text-xs sm:text-sm font-black text-rose-600">10</span>
            <span className="text-[10px] sm:text-xs font-bold text-rose-600">♥</span>
          </div>
          <div className="absolute -top-2 -right-2 bg-amber-500 text-slate-950 text-[8px] font-black px-1.5 py-0.5 rounded-full shadow border border-amber-300">
            Main 1 ★
          </div>
        </motion.div>

        {/* Card 2: 10 Black (Top-Right) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8, rotate: 25 }}
          animate={{ opacity: 1, scale: 1, rotate: 16 }}
          transition={{ duration: 0.8, delay: 0.15 }}
          className="absolute top-[10%] right-[2%] sm:right-[8%] w-20 sm:w-24 h-28 sm:h-34 rounded-xl bg-slate-100 text-slate-900 border-2 border-slate-300/50 p-2 flex flex-col justify-between shadow-2xl opacity-25 sm:opacity-30 backdrop-blur-[1px]"
        >
          <div className="flex flex-col items-start leading-none">
            <span className="text-xs sm:text-sm font-black text-slate-900">10</span>
            <span className="text-[10px] sm:text-xs font-bold text-slate-900">♠</span>
          </div>
          <div className="self-center text-2xl sm:text-3xl text-slate-900 select-none">♠</div>
          <div className="flex flex-col items-end leading-none rotate-180">
            <span className="text-xs sm:text-sm font-black text-slate-900">10</span>
            <span className="text-[10px] sm:text-xs font-bold text-slate-900">♠</span>
          </div>
        </motion.div>

        {/* Card 3: 3 Koubi (Bottom-Left - Kora card) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8, rotate: -40 }}
          animate={{ opacity: 1, scale: 1, rotate: -32 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="absolute bottom-[16%] left-[3%] sm:left-[9%] w-20 sm:w-24 h-28 sm:h-34 rounded-xl bg-slate-100 text-slate-900 border-2 border-amber-400/80 p-2 flex flex-col justify-between shadow-2xl opacity-20 sm:opacity-25 backdrop-blur-[1px]"
        >
          <div className="flex flex-col items-start leading-none">
            <span className="text-xs sm:text-sm font-black text-rose-600">3</span>
            <span className="text-[10px] sm:text-xs font-bold text-rose-600">♥</span>
          </div>
          <div className="self-center text-2xl sm:text-3xl text-rose-600 select-none">♥</div>
          <div className="flex flex-col items-end leading-none rotate-180">
            <span className="text-xs sm:text-sm font-black text-rose-600">3</span>
            <span className="text-[10px] sm:text-xs font-bold text-rose-600">♥</span>
          </div>
          <div className="absolute -bottom-2 -left-2 bg-rose-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full shadow border border-rose-300">
            Kora 👑
          </div>
        </motion.div>

        {/* Card 4: 10 Tchaka (Bottom-Right) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8, rotate: 40 }}
          animate={{ opacity: 1, scale: 1, rotate: 28 }}
          transition={{ duration: 0.8, delay: 0.25 }}
          className="absolute bottom-[20%] right-[3%] sm:right-[9%] w-20 sm:w-24 h-28 sm:h-34 rounded-xl bg-slate-100 text-slate-900 border-2 border-slate-300/50 p-2 flex flex-col justify-between shadow-2xl opacity-20 sm:opacity-25 backdrop-blur-[1px]"
        >
          <div className="flex flex-col items-start leading-none">
            <span className="text-xs sm:text-sm font-black text-emerald-700">10</span>
            <span className="text-[10px] sm:text-xs font-bold text-emerald-700">♣</span>
          </div>
          <div className="self-center text-2xl sm:text-3xl text-emerald-700 select-none">♣</div>
          <div className="flex flex-col items-end leading-none rotate-180">
            <span className="text-xs sm:text-sm font-black text-emerald-700">10</span>
            <span className="text-[10px] sm:text-xs font-bold text-emerald-700">♣</span>
          </div>
        </motion.div>

        {/* Card 5: 9 Zing (Center-Left background fan) */}
        <motion.div
          initial={{ opacity: 0, rotate: 8 }}
          animate={{ opacity: 1, rotate: 12 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="absolute top-[42%] -left-[4%] sm:left-[1%] w-18 sm:w-22 h-26 sm:h-30 rounded-xl bg-slate-100 text-slate-900 border border-slate-300/40 p-1.5 flex flex-col justify-between shadow-xl opacity-15 sm:opacity-20"
        >
          <div className="flex flex-col items-start leading-none">
            <span className="text-xs font-black text-amber-600">9</span>
            <span className="text-[9px] font-bold text-amber-600">♦</span>
          </div>
          <div className="self-center text-xl text-amber-600 select-none">♦</div>
          <div className="flex flex-col items-end leading-none rotate-180">
            <span className="text-xs font-black text-amber-600">9</span>
            <span className="text-[9px] font-bold text-amber-600">♦</span>
          </div>
        </motion.div>

        {/* Card 6: 8 Black (Center-Right background fan) */}
        <motion.div
          initial={{ opacity: 0, rotate: -12 }}
          animate={{ opacity: 1, rotate: -15 }}
          transition={{ duration: 0.8, delay: 0.35 }}
          className="absolute top-[46%] -right-[4%] sm:right-[1%] w-18 sm:w-22 h-26 sm:h-30 rounded-xl bg-slate-100 text-slate-900 border border-slate-300/40 p-1.5 flex flex-col justify-between shadow-xl opacity-15 sm:opacity-20"
        >
          <div className="flex flex-col items-start leading-none">
            <span className="text-xs font-black text-slate-900">8</span>
            <span className="text-[9px] font-bold text-slate-900">♠</span>
          </div>
          <div className="self-center text-xl text-slate-900 select-none">♠</div>
          <div className="flex flex-col items-end leading-none rotate-180">
            <span className="text-xs font-black text-slate-900">8</span>
            <span className="text-[9px] font-bold text-slate-900">♠</span>
          </div>
        </motion.div>
      </div>

      {/* Top Header Bar (Unified NativeScreenHeader) */}
      <NativeScreenHeader
        id="home-screen-header"
        className="-mx-3 sm:-mx-4 -mt-3 sm:-mt-4 mb-1 sm:mb-2 relative z-10"
        leftContent={leftContent}
        rightActions={rightActions}
        title=""
      />

      {/* Main Content Area (Centered & Streamlined) */}
      <main className="relative z-10 max-w-md mx-auto w-full flex-1 flex flex-col justify-center items-center py-2 overflow-hidden">
        {/* Title & Tagline */}
        <div className="text-center mb-4 sm:mb-6 shrink-0">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] sm:text-xs font-bold mb-2 shadow-sm"
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Jeu de cartes du Continent</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.05 }}
            className="text-3xl sm:text-4xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-100 drop-shadow-md"
          >
            NJAMBO KORA
          </motion.h1>
        </div>

        {/* Action Buttons Container */}
        <div className="w-full flex flex-col gap-2.5 shrink-0 max-w-sm mx-auto">
          {/* Resume Active Multiplayer Table */}
          {activeMultiplayerRoom && (activeMultiplayerRoom.status === 'PLAYING' || activeMultiplayerRoom.status === 'LOBBY') && onResumeMultiplayer && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full flex flex-col gap-1.5 p-2 rounded-xl bg-gradient-to-r from-blue-900/40 via-indigo-900/40 to-sky-900/40 border border-blue-500/30"
            >
              <div className="flex items-center gap-2.5 text-left min-w-0 px-2 pt-1">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300 font-black text-sm shrink-0 animate-pulse">
                  🌐
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="leading-tight text-xs sm:text-sm font-black truncate text-blue-100">Table en direct : {activeMultiplayerRoom.id}</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-blue-600/60 text-white border border-blue-400/40 shrink-0">
                      En cours
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold text-blue-200/80 truncate">
                    {activeMultiplayerRoom.players?.length || 4} Joueurs · Mise : {activeMultiplayerRoom.baseBet || 10} 🪙
                  </span>
                </div>
              </div>
              <AbandonMultiplayerControl
                onResumeMultiplayer={onResumeMultiplayer}
                onLeaveMultiplayer={onLeaveMultiplayer}
              />
            </motion.div>
          )}

          {/* Resume Active Session (Conditionnel) */}
          {activeSession && activeSession.gameState && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              id="btn-home-resume"
              onClick={handleResume}
              className="w-full py-2.5 px-3.5 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-slate-950 font-black shadow-lg shadow-emerald-500/20 border border-emerald-400/60 flex items-center justify-between transition cursor-pointer"
            >
              <div className="flex items-center gap-2.5 text-left min-w-0">
                <div className="w-8 h-8 rounded-lg bg-slate-950/25 border border-slate-950/20 flex items-center justify-center text-slate-950 font-black text-sm shrink-0">
                  ▶
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="leading-tight text-xs sm:text-sm font-black truncate">Reprendre la Partie</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-slate-950/30 text-emerald-950 shrink-0">
                      En pause
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-950/90 truncate">
                    Partie {activeSession.gameState.partieCount || 1} · Main {activeSession.gameState.currentTrickNumber || 1}/5 · Pot: {activeSession.gameState.pot || 0} pts
                  </span>
                </div>
              </div>
              <span className="text-[11px] font-black bg-slate-950/25 px-2.5 py-1 rounded-lg border border-slate-950/20 shrink-0 ml-2">
                Reprendre →
              </span>
            </motion.button>
          )}

          {/* Primary Action: Mode Solo */}
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            whileTap={{ scale: 0.98 }}
            type="button"
            id="btn-home-new-game"
            onClick={handleStartGame}
            className="w-full py-3 px-3.5 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-slate-950 font-black shadow-lg shadow-amber-500/20 border border-amber-300/60 flex items-center justify-between transition cursor-pointer"
          >
            <div className="flex items-center gap-3 text-left">
              <div className="w-8 h-8 rounded-lg bg-slate-950/20 flex items-center justify-center text-slate-950 font-extrabold shrink-0">
                <Play className="w-4.5 h-4.5 fill-slate-950" />
              </div>
              <span className="leading-tight text-xs sm:text-sm font-black">
                Nouvelle Partie (Mode Solo)
              </span>
            </div>
            <span className="text-[11px] font-black bg-slate-950/20 px-2.5 py-1 rounded-lg shrink-0">
              Jouer →
            </span>
          </motion.button>

          {/* Multiplayer Action */}
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            whileTap={{ scale: 0.98 }}
            type="button"
            id="btn-home-multiplayer"
            onClick={handleMultiplayer}
            className="w-full py-3 px-3.5 rounded-xl bg-slate-900/90 hover:bg-slate-850 text-slate-100 font-bold border border-slate-700/80 hover:border-emerald-500/60 shadow-md flex items-center justify-between transition cursor-pointer group relative overflow-hidden"
          >
            <div className="flex items-center gap-3 text-left min-w-0">
              <div className="relative shrink-0">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold group-hover:scale-105 transition shrink-0">
                  <Globe className="w-4.5 h-4.5 text-emerald-400" />
                </div>
                {pendingInvitesCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white font-black text-[9px] flex items-center justify-center animate-bounce shadow-md">
                    {pendingInvitesCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="leading-tight text-xs sm:text-sm font-extrabold text-white truncate">
                  Multijoueur en Ligne
                </span>
                {pendingInvitesCount > 0 ? (
                  <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 uppercase tracking-wider animate-pulse shrink-0">
                    {pendingInvitesCount} Invité !
                  </span>
                ) : (
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider shrink-0">
                    Direct
                  </span>
                )}
              </div>
            </div>
            <span className="text-[11px] font-bold text-slate-400 group-hover:text-emerald-400 transition shrink-0">
              Entrer →
            </span>
          </motion.button>

          {/* Palmarès Action */}
          {onOpenLeaderboard && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              id="btn-home-leaderboard"
              onClick={onOpenLeaderboard}
              className="w-full py-2.5 px-3.5 rounded-xl bg-slate-900/90 hover:bg-slate-850 text-slate-100 font-bold border border-slate-700/80 hover:border-amber-400/60 shadow-md flex items-center justify-between transition cursor-pointer group"
            >
              <div className="flex items-center gap-3 text-left min-w-0">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold group-hover:scale-105 transition shrink-0">
                  <Trophy className="w-4.5 h-4.5 fill-amber-400 text-amber-400" />
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="leading-tight text-xs sm:text-sm font-extrabold text-white truncate">
                    Palmarès des joueurs
                  </span>
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wider shrink-0">
                    Classement
                  </span>
                </div>
              </div>
              <span className="text-[11px] font-bold text-slate-400 group-hover:text-amber-400 transition shrink-0">
                Voir →
              </span>
            </motion.button>
          )}
        </div>
      </main>

      {/* Bottom Navigation Dock (Thumb-friendly & Streamlined) */}
      <footer className="relative z-10 max-w-md mx-auto w-full shrink-0 pt-2 pb-1 flex flex-col gap-2">
        <motion.button
          whileTap={{ scale: 0.98 }}
          type="button"
          id="btn-home-rules-codex"
          onClick={onOpenRules}
          className="w-full max-w-sm mx-auto py-2.5 px-3.5 rounded-xl bg-slate-900/80 hover:bg-slate-850 text-slate-200 hover:text-white border border-slate-800 hover:border-amber-500/40 shadow-sm flex items-center justify-between transition cursor-pointer group"
          title="Académie Njambo Kora : Guide, Stratégies & Règles du jeu"
        >
          <div className="flex items-center gap-2.5 text-left">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-105 transition shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs sm:text-sm font-black text-slate-100 group-hover:text-amber-300 transition-colors">
                  Académie & Règles du Jeu
                </span>
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  31 Cartes
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                Guide complet, Kora, combos & déroulement des tours
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 transition-transform group-hover:translate-x-0.5 shrink-0" />
        </motion.button>

        {/* Subtle secondary link if there are saved sessions to resume */}
        {savedSessionsCount > 1 && onOpenSavedSessions && (
          <div className="text-center">
            <button
              type="button"
              id="btn-home-saved-sessions"
              onClick={onOpenSavedSessions}
              className="text-[11px] text-slate-400 hover:text-amber-300 transition underline underline-offset-2 cursor-pointer inline-flex items-center gap-1"
            >
              <FolderOpen className="w-3 h-3 text-amber-400" />
              <span>Gérer mes {savedSessionsCount} parties sauvegardées</span>
            </button>
          </div>
        )}

        <p className="text-[10px] text-slate-500 text-center mt-0.5 font-medium flex items-center justify-center gap-2">
          <span>Mises, Kora & Double Kora</span>
          <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800 text-slate-400 font-mono">
            v{APP_VERSION}
          </span>
        </p>
      </footer>
    </div>
  );
};

const AbandonMultiplayerControl: React.FC<{
  onResumeMultiplayer?: () => void;
  onLeaveMultiplayer?: () => void;
}> = ({ onResumeMultiplayer, onLeaveMultiplayer }) => {
  const [isConfirming, setIsConfirming] = React.useState(false);

  if (isConfirming) {
    return (
      <div className="flex flex-col gap-1.5 mt-2 p-2 rounded-lg bg-rose-950/80 border border-rose-800/80 text-rose-200">
        <p className="text-[11px] leading-tight font-medium">
          Abandonner la table ? Votre mise sera perdue et l'IA prendra le relais.
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <button
            type="button"
            id="btn-confirm-leave-multiplayer"
            onClick={() => {
              setIsConfirming(false);
              onLeaveMultiplayer?.();
            }}
            className="flex-1 py-1.5 px-2.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow transition active:scale-95 cursor-pointer"
          >
            Confirmer
          </button>
          <button
            type="button"
            id="btn-cancel-leave-multiplayer"
            onClick={() => setIsConfirming(false)}
            className="py-1.5 px-2.5 rounded-md bg-white/10 hover:bg-white/20 text-slate-200 font-semibold text-xs transition active:scale-95 cursor-pointer"
          >
            Annuler
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 mt-1">
      <button
        type="button"
        id="btn-home-resume-multiplayer"
        onClick={onResumeMultiplayer}
        className="flex-1 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow cursor-pointer transition active:scale-95"
      >
        Rejoindre
      </button>
      {onLeaveMultiplayer && (
        <button
          type="button"
          id="btn-home-leave-multiplayer"
          onClick={() => setIsConfirming(true)}
          className="py-2 px-3 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 font-bold text-xs border border-rose-800/60 shadow cursor-pointer transition active:scale-95"
        >
          Abandonner
        </button>
      )}
    </div>
  );
};

