import React from 'react';
import { Play, Globe, BookOpen, FolderOpen, Zap, Sparkles, Volume2, VolumeX, Smartphone, HelpCircle, ChevronRight, Trophy, Wallet, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { SavedManche } from '../types';
import { APP_VERSION } from '../version';
import { usePlayerProfile } from '../context/PlayerProfileContext';
import { HeaderProfileButton } from './profile/HeaderProfileButton';
import { NativeScreenHeader } from './common/NativeScreenHeader';
import { KoraCashModal } from './KoraCashModal';
import { fetchKoraCashStatus } from '../services/koraCashClient';
import { KoraCashPublicStatus, resolveEntryState, formatFcfa } from '../services/koraCashFormat';
import { useKoraCashWallet } from '../services/koraCashWalletStore';

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
  isModeSheetOpen?: boolean;
  onOpenModeSheet?: () => void;
  onCloseModeSheet?: () => void;
}

// --- Bespoke Animated Contextual Flat Icons ---
const AnimatedDealingDeckIcon: React.FC = () => (
  <div className="w-5 h-5 relative flex items-center justify-center select-none">
    {/* Deck stack base */}
    <div className="w-3.5 h-4.5 rounded-[3px] bg-rose-600/30 border border-rose-500/40 absolute translate-y-0.5" />
    <div className="w-3.5 h-4.5 rounded-[3px] bg-rose-500/40 border border-rose-400/50 absolute" />
    {/* Top card dealing sliding out */}
    <motion.div
      animate={{ x: [0, 3, 0], y: [0, -3, 0], rotate: [0, 6, 0] }}
      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
      className="w-3.5 h-4.5 rounded-[3px] bg-rose-400 border border-rose-200 absolute flex items-center justify-center shadow-sm text-slate-950"
    >
      <span className="text-[7px] font-black">★</span>
    </motion.div>
  </div>
);

const AnimatedConnectedTableIcon: React.FC = () => (
  <div className="w-5 h-5 relative flex items-center justify-center select-none">
    {/* Concentric radar pulse wave */}
    <motion.div
      animate={{ scale: [0.9, 1.55, 0.9], opacity: [0.85, 0.15, 0.85] }}
      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
      className="absolute w-3.5 h-3.5 rounded-full border border-cyan-400/80 pointer-events-none"
    />
    {/* Round table center */}
    <div className="w-3.5 h-3.5 rounded-full bg-cyan-500/30 border border-cyan-400 flex items-center justify-center relative z-10">
      <div className="w-1 h-1 rounded-full bg-cyan-200" />
    </div>
    {/* 4 Player seats */}
    <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_4px_rgba(6,182,212,0.8)]" />
    <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_4px_rgba(6,182,212,0.8)]" />
    <span className="absolute -left-0.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_4px_rgba(6,182,212,0.8)]" />
    <span className="absolute -right-0.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_4px_rgba(6,182,212,0.8)]" />
  </div>
);

const AnimatedBanknotesIcon: React.FC = () => (
  <div className="w-5 h-5 relative flex items-center justify-center select-none">
    {/* Back banknote */}
    <div className="w-5 h-3 rounded-[2px] bg-amber-600/30 border border-amber-500/40 -rotate-12 absolute -translate-x-0.5 translate-y-0.5" />
    {/* Middle banknote */}
    <div className="w-5 h-3 rounded-[2px] bg-amber-500/40 border border-amber-400/50 rotate-[-4deg] absolute translate-y-0" />
    {/* Front banknote with money-counting fan flutter animation */}
    <motion.div
      animate={{ y: [0, -2.5, 0], rotate: [0, 8, 0], scale: [1, 1.04, 1] }}
      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
      className="w-5 h-3.2 rounded-[2px] bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 border border-amber-200 absolute -top-0.5 flex items-center justify-between px-0.5 shadow-sm"
    >
      <span className="text-[5px] font-black text-amber-950 leading-none">₣</span>
      <div className="w-1.5 h-1.5 rounded-full border border-amber-900/50 bg-amber-400/50 flex items-center justify-center">
        <span className="text-[5px] font-black text-amber-950 leading-none">★</span>
      </div>
      <span className="text-[5px] font-black text-amber-950 leading-none">₣</span>
    </motion.div>
  </div>
);

const AnimatedCrownPalmaresIcon: React.FC = () => (
  <div className="w-5 h-5 relative flex items-center justify-center select-none">
    {/* Crown body breathing */}
    <motion.div
      animate={{ scale: [1, 1.1, 1] }}
      transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      className="relative flex items-center justify-center"
    >
      <svg className="w-4 h-4 text-purple-400 fill-purple-400" viewBox="0 0 24 24">
        <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
      </svg>
    </motion.div>
    {/* Sparkling star on crown peak */}
    <motion.span
      animate={{ opacity: [0.2, 1, 0.2], rotate: [0, 90, 180], scale: [0.8, 1.25, 0.8] }}
      transition={{ duration: 2.0, repeat: Infinity, ease: 'easeInOut' }}
      className="absolute -top-1 -right-0.5 text-[8px] text-purple-200 pointer-events-none select-none font-bold"
    >
      ✦
    </motion.span>
  </div>
);

// Bouton principal de l'accueil (« Jouer » ou « Reprendre ») : plein, doré, avec un reflet animé.
const PRIMARY_BUTTON_CLASSES =
  'relative overflow-hidden w-full min-h-16 py-3 px-4 rounded-2xl bg-gradient-to-r from-amber-300 via-amber-500 to-amber-600 hover:from-amber-200 hover:to-amber-500 text-slate-950 ring-1 ring-amber-300/70 shadow-lg shadow-amber-500/30 flex flex-col items-center justify-center gap-0.5 transition-all duration-200 cursor-pointer';

const PrimaryButtonShimmer: React.FC = () => (
  <motion.div
    animate={{ x: ['-120%', '240%'] }}
    transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut', repeatDelay: 2 }}
    className="absolute inset-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-12 pointer-events-none"
  />
);

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
  isModeSheetOpen = false,
  onOpenModeSheet,
  onCloseModeSheet,
}) => {
  const { profile, currentTitle, isLoggedIn } = usePlayerProfile();

  // Kora Cash : statut public lu une fois à l'ouverture du menu (activé ou non, démo ou réel).
  const [koraCashStatus, setKoraCashStatus] = React.useState<KoraCashPublicStatus | null>(null);
  const [koraCashLoaded, setKoraCashLoaded] = React.useState<boolean>(false);
  const [isKoraCashOpen, setIsKoraCashOpen] = React.useState<boolean>(false);
  React.useEffect(() => {
    let cancelled = false;
    fetchKoraCashStatus().then((status) => {
      if (cancelled) return;
      setKoraCashStatus(status);
      setKoraCashLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const koraCashEntry = resolveEntryState(koraCashStatus, isLoggedIn);
  // Solde Kora Cash affiché sur l'accueil et mis à jour en direct (connexion temps réel) quand le joueur est connecté.
  const koraCashWallet = useKoraCashWallet(koraCashLoaded && koraCashEntry !== 'COMING_SOON' && koraCashEntry !== 'LOGIN_REQUIRED');
  const sessionsList = Array.isArray(savedSessions) ? savedSessions : [];
  const activeSession =
    (activeSessionId ? sessionsList.find((s) => s.id === activeSessionId) : null) ||
    (sessionsList.length > 0 ? sessionsList[0] : null);
  const hasResumableSession = Boolean(activeSession && activeSession.gameState);

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

  // 1. Left branding block for NativeScreenHeader (le grand titre NJAMBO KORA est juste en dessous)
  const leftContent = (
    <div className="flex items-center gap-2 shrink-0">
      <img src="/icon-192.svg" alt="Njambo Kora" className="w-7 h-7 rounded-lg shadow-sm" />
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

      {/* Académie & Règles Quick Button */}
      {onOpenRules && (
        <button
          type="button"
          id="btn-header-rules"
          onClick={onOpenRules}
          className="h-9 px-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 active:scale-95 border border-slate-700/80 hover:border-amber-400/40 text-amber-300 text-xs font-bold transition-all duration-150 flex items-center gap-1.5 cursor-pointer shadow-sm shrink-0"
          title="Consulter l'Académie & Règles du jeu"
          aria-label="Consulter l'Académie & Règles du jeu"
        >
          <BookOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        </button>
      )}

      {/* PWA Install Button (Options 1 & 2: masqué si déjà installée, icône compacte w-9 h-9 sur mobile) */}
      {!isPwaInstalled && onOpenInstallModal && (
        <button
          type="button"
          id="btn-header-install"
          onClick={onOpenInstallModal}
          className="h-9 w-9 sm:w-auto px-0 sm:px-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 active:scale-95 text-amber-300 border border-amber-500/40 text-xs font-bold transition-all duration-150 flex items-center justify-center sm:gap-1.5 cursor-pointer shadow-sm shrink-0"
          title="Installer l'application sur ton appareil"
          aria-label="Installer l'application"
        >
          <Smartphone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="hidden sm:inline">Installer</span>
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
      className="min-h-[100dvh] h-[100dvh] w-full bg-gradient-to-b from-[#0b0805] via-[#080604] to-[#050403] text-slate-100 flex flex-col justify-between relative overflow-y-auto overflow-x-hidden font-sans select-none p-3 sm:p-4 no-scrollbar"
    >
      {/* Lueur ambrée unique, qui respire lentement derrière le titre (piste "Braise sous les cendres") */}
      <div className="home-glow absolute top-[30%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 sm:w-96 sm:h-96 rounded-full bg-[radial-gradient(circle,rgba(245,158,11,0.55)_0%,rgba(217,119,6,0.22)_45%,rgba(217,119,6,0)_72%)] pointer-events-none" />

      {/* Background Played Cards ("Cartes Jouées en Arrière-Plan") */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-0">
        {/* Card 1: 10 Koubi (Top-Left, Winner trick) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8, rotate: -25 }}
          animate={{ opacity: 0.4, scale: 1, rotate: -18 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="absolute top-[8%] left-[2%] sm:left-[8%] w-20 sm:w-24 h-28 sm:h-34 rounded-xl bg-slate-100 text-slate-900 border-2 border-amber-400/60 p-2 flex flex-col justify-between shadow-2xl"
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
            Tour 1 ★
          </div>
        </motion.div>

        {/* Card 2: 10 Black (Top-Right) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8, rotate: 25 }}
          animate={{ opacity: 0.4, scale: 1, rotate: 16 }}
          transition={{ duration: 0.8, delay: 0.15 }}
          className="absolute top-[10%] right-[2%] sm:right-[8%] w-20 sm:w-24 h-28 sm:h-34 rounded-xl bg-slate-100 text-slate-900 border-2 border-slate-300/50 p-2 flex flex-col justify-between shadow-2xl"
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
          animate={{ opacity: 0.36, scale: 1, rotate: -32 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="absolute bottom-[16%] left-[3%] sm:left-[9%] w-20 sm:w-24 h-28 sm:h-34 rounded-xl bg-slate-100 text-slate-900 border-2 border-amber-400/80 p-2 flex flex-col justify-between shadow-2xl"
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
          animate={{ opacity: 0.36, scale: 1, rotate: 28 }}
          transition={{ duration: 0.8, delay: 0.25 }}
          className="absolute bottom-[20%] right-[3%] sm:right-[9%] w-20 sm:w-24 h-28 sm:h-34 rounded-xl bg-slate-100 text-slate-900 border-2 border-slate-300/50 p-2 flex flex-col justify-between shadow-2xl"
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
          animate={{ opacity: 0.3, rotate: 12 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="absolute top-[42%] -left-[4%] sm:left-[1%] w-18 sm:w-22 h-26 sm:h-30 rounded-xl bg-slate-100 text-slate-900 border border-slate-300/40 p-1.5 flex flex-col justify-between shadow-xl"
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
          animate={{ opacity: 0.3, rotate: -15 }}
          transition={{ duration: 0.8, delay: 0.35 }}
          className="absolute top-[46%] -right-[4%] sm:right-[1%] w-18 sm:w-22 h-26 sm:h-30 rounded-xl bg-slate-100 text-slate-900 border border-slate-300/40 p-1.5 flex flex-col justify-between shadow-xl"
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
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold mb-2 shadow-sm"
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
              className="w-full flex flex-col gap-1.5 p-2 rounded-xl bg-slate-900/90 border border-slate-700"
            >
              <div className="flex items-center gap-2.5 text-left min-w-0 px-2 pt-1">
                <div className="w-8 h-8 rounded-lg bg-slate-500/20 border border-slate-400/30 flex items-center justify-center text-slate-300 font-black text-sm shrink-0 animate-pulse">
                  🌐
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="leading-tight text-xs sm:text-sm font-black truncate text-slate-100">Table en direct : {activeMultiplayerRoom.id}</span>
                    <span className="text-xs font-bold px-1.5 py-0.2 rounded-full bg-emerald-600/60 text-white border border-emerald-400/40 shrink-0">
                      En cours
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-slate-300 truncate">
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

          {/* 1. Kora Cash (En premier, visible une fois le statut connu) - Couleur signature : Or Solaire / Ambre */}
          {koraCashLoaded && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            whileTap={koraCashEntry === 'COMING_SOON' ? undefined : { scale: 0.98 }}
            type="button"
            id="btn-home-kora-cash"
            disabled={koraCashEntry === 'COMING_SOON'}
            aria-disabled={koraCashEntry === 'COMING_SOON'}
            onClick={() => setIsKoraCashOpen(true)}
            className={`relative overflow-hidden w-full py-2.5 px-3.5 rounded-xl bg-slate-900/90 backdrop-blur-md text-slate-100 font-bold border border-slate-700 shadow-md flex items-center justify-between transition-all duration-200 group ${
              koraCashEntry === 'COMING_SOON'
                ? 'order-last opacity-60 cursor-default'
                : 'hover:bg-slate-800 hover:border-slate-500 cursor-pointer'
            }`}
          >
            {koraCashEntry !== 'COMING_SOON' && (
              <motion.div
                animate={{ x: ['-120%', '240%'] }}
                transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut', repeatDelay: 3.5 }}
                className="absolute inset-0 w-1/2 h-full bg-gradient-to-r from-transparent via-amber-400/20 to-transparent skew-x-12 pointer-events-none"
              />
            )}

            <div className="flex items-center gap-3 text-left min-w-0 relative z-10">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-amber-400 shrink-0 shadow-[0_0_12px_rgba(245,158,11,0.35)] group-hover:scale-105 transition">
                <AnimatedBanknotesIcon />
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="leading-tight text-xs sm:text-sm font-extrabold text-white truncate group-hover:text-amber-200 transition">Kora Cash</span>
                <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wider shrink-0">
                  {koraCashEntry === 'COMING_SOON' ? 'Bientôt' : koraCashStatus?.environment === 'LIVE' ? 'Argent réel' : 'Démo'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 group-hover:text-amber-400 transition shrink-0 relative z-10">
              {koraCashWallet.wallet && (
                <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-200 border border-amber-500/30 font-black">
                  {formatFcfa(koraCashWallet.wallet.available)}
                </span>
              )}
              <span>{koraCashEntry === 'COMING_SOON' ? 'Bientôt disponible' : koraCashEntry === 'LOGIN_REQUIRED' ? 'Se connecter →' : 'Ouvrir →'}</span>
            </div>
          </motion.button>
          )}

          {/* 2. Bouton principal : « Reprendre » si une partie est en cours */}
          {hasResumableSession && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              id="btn-home-resume"
              onClick={handleResume}
              className={PRIMARY_BUTTON_CLASSES}
            >
              <PrimaryButtonShimmer />
              <span className="relative z-10 flex items-center gap-2 text-base sm:text-lg font-black">
                <Play className="w-5 h-5 fill-slate-950" />
                Reprendre
              </span>
              <span className="relative z-10 text-xs font-bold text-slate-900/80 truncate max-w-full">
                Partie {activeSession.gameState.partieCount || 1} · Tour {activeSession.gameState.currentTrickNumber || 1}/5 · Pot: {activeSession.gameState.pot || 0} pts
              </span>
            </motion.button>
          )}

          {/* 3. « Jouer » : ouvre le choix du mode. Bouton principal, sauf si une partie est à reprendre. */}
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            whileTap={{ scale: 0.98 }}
            type="button"
            id="btn-home-play"
            onClick={onOpenModeSheet}
            className={
              hasResumableSession
                ? 'relative w-full py-3 px-3.5 rounded-xl bg-slate-900/95 backdrop-blur-md text-amber-200 font-black text-sm border border-amber-500/60 hover:border-amber-400 shadow-lg flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer'
                : PRIMARY_BUTTON_CLASSES
            }
          >
            {!hasResumableSession && <PrimaryButtonShimmer />}
            <span className={`relative z-10 flex items-center gap-2 font-black ${hasResumableSession ? 'text-sm' : 'text-base sm:text-lg'}`}>
              <Play className={hasResumableSession ? 'w-4 h-4 fill-amber-300 text-amber-300' : 'w-5 h-5 fill-slate-950'} />
              Jouer
            </span>
            {pendingInvitesCount > 0 && (
              <span className="absolute top-1.5 right-2 z-10 min-w-5 h-5 px-1 rounded-full bg-rose-600 text-white font-black text-xs flex items-center justify-center shadow-md">
                {pendingInvitesCount}
              </span>
            )}
          </motion.button>

          {/* 4. Palmarès Action - Couleur signature : Violet Néon / Améthyste */}
          {onOpenLeaderboard && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              id="btn-home-leaderboard"
              onClick={onOpenLeaderboard}
              className="relative overflow-hidden w-full py-2.5 px-3.5 rounded-xl bg-slate-900/90 backdrop-blur-md hover:bg-slate-800 text-slate-100 font-bold border border-slate-700 hover:border-slate-500 shadow-md flex items-center justify-between transition-all duration-200 cursor-pointer group"
            >
              <div className="flex items-center gap-3 text-left min-w-0 relative z-10">
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-400/50 flex items-center justify-center text-purple-400 shrink-0 shadow-[0_0_12px_rgba(168,85,247,0.35)] group-hover:scale-105 transition">
                  <AnimatedCrownPalmaresIcon />
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="leading-tight text-xs sm:text-sm font-extrabold text-white truncate group-hover:text-purple-200 transition">
                    Palmarès
                  </span>
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase tracking-wider shrink-0">
                    Classement
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 text-xs font-bold text-slate-400 group-hover:text-purple-300 transition shrink-0 relative z-10">
                <span>Voir</span>
                <span>→</span>
              </div>
            </motion.button>
          )}
        </div>
      </main>

      {isKoraCashOpen && koraCashStatus && koraCashEntry !== 'COMING_SOON' && (
        <KoraCashModal environment={koraCashStatus.environment} depositMode={koraCashStatus.depositMode} onClose={() => setIsKoraCashOpen(false)} />
      )}

      {/* Panneau du bas : choix du mode de jeu */}
      <AnimatePresence>
        {isModeSheetOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-slate-950/70 flex items-end sm:items-center justify-center"
            onClick={onCloseModeSheet}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 300 }}
              id="home-mode-sheet"
              role="dialog"
              aria-modal="true"
              aria-labelledby="home-mode-sheet-title"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl p-4 pb-6 sm:p-5 shadow-2xl flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <h2 id="home-mode-sheet-title" className="text-base font-black text-white">Choisis ton mode</h2>
                <button
                  type="button"
                  onClick={onCloseModeSheet}
                  aria-label="Fermer"
                  className="w-9 h-9 rounded-xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                id="btn-home-new-game"
                onClick={() => {
                  onCloseModeSheet?.();
                  handleStartGame();
                }}
                className="w-full py-3 px-3.5 rounded-xl bg-slate-950/60 text-slate-100 border border-slate-700 hover:border-slate-500 flex items-center justify-between gap-3 transition cursor-pointer active:scale-[0.98] group"
              >
                <span className="flex items-center gap-3 min-w-0 text-left">
                  <span className="w-9 h-9 rounded-lg bg-rose-500/20 border border-rose-400/50 flex items-center justify-center shrink-0">
                    <AnimatedDealingDeckIcon />
                  </span>
                  <span className="flex flex-col min-w-0">
                    <span className="text-sm font-black text-white group-hover:text-rose-200 transition">Partie solo</span>
                    <span className="text-xs text-slate-400">Contre 1 à 3 bots</span>
                  </span>
                </span>
                <ChevronRight className="w-4 h-4 text-rose-300 shrink-0" />
              </button>

              <button
                type="button"
                id="btn-home-multiplayer"
                onClick={() => {
                  onCloseModeSheet?.();
                  handleMultiplayer();
                }}
                className="w-full py-3 px-3.5 rounded-xl bg-slate-950/60 text-slate-100 border border-slate-700 hover:border-slate-500 flex items-center justify-between gap-3 transition cursor-pointer active:scale-[0.98] group"
              >
                <span className="flex items-center gap-3 min-w-0 text-left">
                  <span className="relative w-9 h-9 rounded-lg bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center shrink-0">
                    <AnimatedConnectedTableIcon />
                    {pendingInvitesCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-0.5 rounded-full bg-rose-600 text-white font-black text-xs flex items-center justify-center shadow-md">
                        {pendingInvitesCount}
                      </span>
                    )}
                  </span>
                  <span className="flex flex-col min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="text-sm font-black text-white group-hover:text-cyan-200 transition">Multijoueur</span>
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 uppercase tracking-wider shrink-0">
                        Direct
                      </span>
                    </span>
                    <span className="text-xs text-slate-400">Avec de vrais joueurs</span>
                  </span>
                </span>
                <ChevronRight className="w-4 h-4 text-cyan-300 shrink-0" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Navigation Dock (Thumb-friendly & Streamlined) */}
      <footer className="relative z-10 max-w-md mx-auto w-full shrink-0 pt-2 pb-1 flex flex-col gap-2">
        {/* Subtle secondary link if there are saved sessions to resume */}
        {savedSessionsCount > 1 && onOpenSavedSessions && (
          <div className="text-center">
            <button
              type="button"
              id="btn-home-saved-sessions"
              onClick={onOpenSavedSessions}
              className="text-xs text-slate-400 hover:text-amber-300 transition underline underline-offset-2 cursor-pointer inline-flex items-center gap-1"
            >
              <FolderOpen className="w-3 h-3 text-amber-400" />
              <span>Gérer mes {savedSessionsCount} parties sauvegardées</span>
            </button>
          </div>
        )}

        <p className="text-xs text-slate-500 text-center mt-0.5 font-medium flex items-center justify-center gap-2">
          <span>Mises, Kora & Double Kora</span>
          <span className="text-xs px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800 text-slate-400 font-mono">
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
        <p className="text-xs leading-tight font-medium">
          Abandonner la table ? Ta mise sera perdue et l'IA prendra le relais.
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
        className="flex-1 py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow cursor-pointer transition active:scale-95"
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

