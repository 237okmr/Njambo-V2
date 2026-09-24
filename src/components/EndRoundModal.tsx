import React, { useState, useEffect } from 'react';
import { getPublicParamNumber } from '../services/publicConfig';
import { Player, Trick, SUITS_INFO, PartieWinType, GameState, BetIncreaseProposal, RoomPlayer, GamePhase } from '../types';
import { BetIncreaseProposalWidget } from './BetIncreaseProposalWidget';
import {
  Trophy,
  Coins,
  RotateCcw,
  PlayCircle,
  Crown,
  Flame,
  Zap,
  Sparkles,
  Skull,
  Award,
  LogOut,
  SlidersHorizontal,
  Home,
  BookmarkCheck,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  Radio,
  Ban,
  Swords,
  Share2,
  ShieldCheck,
  Cloud,
  Eye,
  Users,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { usePlayerProfile } from '../context/PlayerProfileContext';
import { GoogleIcon } from './common/GoogleIcon';
import { computeEarnedPoints } from '../services/playerProfileService';

interface EndRoundModalProps {
  gameState?: GameState;
  phase?: GamePhase | 'LOBBY' | string;
  partieWinnerName?: string | null;
  partieWinnerIndex?: number | null;
  mancheWinnerName?: string | null;
  mancheWinnerIndex?: number | null;
  partieWinType?: PartieWinType | null;
  pot?: number;
  baseBet?: number;
  players?: Player[];
  tricksHistory?: Trick[];
  partieCount?: number;
  onNextPartie: () => void;
  onNewManche: () => void;
  onChangeOpponents?: () => void;
  onQuitManche?: () => void;
  onOpenHome?: () => void;
  onReturnHome?: () => void;
  onOpenRules?: () => void;
  onSaveManche?: () => void;
  onSendRematch?: () => void;
  onShareMatch?: () => void;
  isOnlineMultiplayer?: boolean;
  isHost?: boolean;
  isReadyForNext?: boolean;
  onToggleReady?: () => void;
  roundEndRemainingSeconds?: number | null;
  multiplayerPlayers?: {
    id: string;
    name: string;
    isHuman: boolean;
    readyForNextPartie?: boolean;
    isAway?: boolean;
    connected?: boolean;
    disconnectGraceExpiresAt?: number | null;
    isAiRelay?: boolean;
    isSpectator?: boolean;
  }[];
  roomPlayers?: RoomPlayer[];
  betIncreaseProposal?: BetIncreaseProposal | null;
  onProposeBetIncrease?: (amount: number) => void;
  onRespondBetIncrease?: (agree: boolean) => void;
  onCancelBetIncrease?: () => void;
  localPlayerId?: string;
  onClaimHost?: () => void;
  isSpectator?: boolean;
  onRequestIntegration?: () => void;
  canRequestIntegration?: boolean;
  prorataCapitalEstimate?: number;
  isPendingIntegration?: boolean;
}

export const EndRoundModal: React.FC<EndRoundModalProps> = ({
  gameState,
  phase: propPhase,
  partieWinnerName: propPartieWinnerName,
  partieWinnerIndex: propPartieWinnerIndex,
  mancheWinnerName: propMancheWinnerName,
  mancheWinnerIndex: propMancheWinnerIndex,
  partieWinType: propPartieWinType,
  pot: propPot,
  baseBet: propBaseBet,
  players: propPlayers,
  tricksHistory: propTricksHistory,
  partieCount: propPartieCount,
  onNextPartie,
  onNewManche,
  onChangeOpponents,
  onQuitManche,
  onOpenHome,
  onReturnHome,
  onOpenRules,
  onSaveManche,
  onSendRematch,
  onShareMatch,
  isOnlineMultiplayer = false,
  isHost = true,
  isReadyForNext = false,
  onToggleReady,
  roundEndRemainingSeconds,
  multiplayerPlayers,
  roomPlayers,
  betIncreaseProposal,
  onProposeBetIncrease,
  onRespondBetIncrease,
  onCancelBetIncrease,
  localPlayerId,
  onClaimHost,
  isSpectator = false,
  onRequestIntegration,
  canRequestIntegration = false,
  prorataCapitalEstimate = 0,
  isPendingIntegration = false,
}) => {
  const currentPhase = propPhase || gameState?.phase;
  if (currentPhase !== 'PARTIE_OVER' && currentPhase !== 'MANCHE_OVER') {
    return null;
  }

  const isMancheOver = currentPhase === 'MANCHE_OVER';
  const players = propPlayers || gameState?.players || [];
  const tricksHistory = propTricksHistory || gameState?.tricksHistory || [];
  const partieCount = propPartieCount ?? gameState?.partieCount ?? 1;
  const pot = propPot ?? gameState?.pot ?? 0;
  const baseBet = propBaseBet ?? gameState?.baseBet ?? 10;
  const partieWinType = (propPartieWinType !== undefined ? propPartieWinType : gameState?.partieWinType) || 'STANDARD';

  const partieWinnerName = propPartieWinnerName !== undefined ? propPartieWinnerName : (gameState?.partieWinnerName ?? null);
  const partieWinnerIndex = propPartieWinnerIndex !== undefined ? propPartieWinnerIndex : (gameState?.partieWinnerIndex ?? null);
  const mancheWinnerName = propMancheWinnerName !== undefined ? propMancheWinnerName : (gameState?.mancheWinnerName ?? null);
  const mancheWinnerIndex = propMancheWinnerIndex !== undefined ? propMancheWinnerIndex : (gameState?.mancheWinnerIndex ?? null);

  const winnerName = isMancheOver ? (mancheWinnerName || 'Gagnant') : (partieWinnerName || 'Gagnant');
  const winnerIndex = isMancheOver ? mancheWinnerIndex : partieWinnerIndex;

  const humanPlayer = players.find((p) => p.isHuman);
  const isHumanEliminated = Boolean(humanPlayer && (humanPlayer.isEliminated || (humanPlayer.capital !== undefined && humanPlayer.capital < baseBet)));

  const isHumanWinner =
    winnerIndex !== null && winnerIndex !== undefined && players[winnerIndex]?.isHuman && !isHumanEliminated;
  const finalTrick = tricksHistory.find((t) => t.trickNumber === 5);

  const currentDifficulty = isOnlineMultiplayer
    ? 'MULTIPLAYER'
    : ((gameState as any)?.aiDifficulty || (gameState as any)?.difficulty || 'NORMAL');

  const levelTheme = React.useMemo(() => {
    if (isOnlineMultiplayer) {
      return {
        label: 'Multijoueur',
        badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-400/50',
        badgeText: '🌐 MULTIJOUEUR',
        modalBorder: 'border-cyan-500/60 shadow-cyan-500/30 ring-1 ring-cyan-500/20',
        bannerGradient: 'from-cyan-950 via-slate-900 to-cyan-950 border-2 border-cyan-400 shadow-cyan-500/30',
        winnerGlow: 'bg-cyan-400 text-slate-950 ring-4 ring-cyan-400/40',
        accentText: 'text-cyan-400',
      };
    }

    switch (currentDifficulty) {
      case 'EASY':
        return {
          label: 'Facile',
          badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50',
          badgeText: '🌱 MODE FACILE',
          modalBorder: 'border-emerald-500/60 shadow-emerald-500/30 ring-1 ring-emerald-500/20',
          bannerGradient: 'from-emerald-950 via-slate-900 to-emerald-950 border-2 border-emerald-400 shadow-emerald-500/30',
          winnerGlow: 'bg-emerald-400 text-slate-950 ring-4 ring-emerald-400/40',
          accentText: 'text-emerald-400',
        };
      case 'EXPERT':
        return {
          label: 'Expert',
          badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-400/50',
          badgeText: '🔥 MODE EXPERT',
          modalBorder: 'border-rose-500/60 shadow-rose-500/30 ring-1 ring-rose-500/20',
          bannerGradient: 'from-rose-950 via-slate-900 to-rose-950 border-2 border-rose-500 shadow-rose-500/30',
          winnerGlow: 'bg-rose-500 text-slate-950 ring-4 ring-rose-500/40',
          accentText: 'text-rose-400',
        };
      case 'GRAND_MASTER':
      case 'MASTER':
        return {
          label: 'Grand Katika',
          badgeClass: 'bg-gradient-to-r from-purple-500/25 to-indigo-500/25 text-purple-200 border-purple-400/60 shadow-purple-500/20',
          badgeText: '👑 GRAND KATIKA',
          modalBorder: 'border-purple-500/60 shadow-purple-500/30 ring-1 ring-purple-500/20',
          bannerGradient: 'from-purple-950 via-indigo-900 to-purple-950 border-2 border-purple-400 shadow-purple-500/40',
          winnerGlow: 'bg-purple-400 text-slate-950 ring-4 ring-purple-400/40',
          accentText: 'text-purple-300',
        };
      case 'NORMAL':
      default:
        return {
          label: 'Normale',
          badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-400/50',
          badgeText: '🎯 MODE NORMAL',
          modalBorder: 'border-amber-500/50 shadow-amber-500/20 ring-1 ring-amber-500/10',
          bannerGradient: 'from-amber-950 via-amber-900 to-amber-950 border-2 border-amber-400 shadow-amber-500/20',
          winnerGlow: 'bg-amber-400 text-slate-950 ring-4 ring-amber-400/40',
          accentText: 'text-amber-400',
        };
    }
  }, [isOnlineMultiplayer, currentDifficulty]);

  const victoryTheme = React.useMemo(() => {
    if (isHumanEliminated && !isSpectator) {
      return {
        badgeClass: 'bg-rose-500 text-slate-950 font-black',
        badgeText: 'Banqueroute · Élimination',
        modalBorder: 'border-rose-500/80 shadow-rose-950/60 ring-1 ring-rose-500/30',
        bannerGradient: 'from-rose-950 via-slate-900 to-rose-950 border-2 border-rose-500 shadow-rose-900/40',
        icon: <Skull className="w-3.5 h-3.5 fill-slate-950" />,
      };
    }

    if (!isMancheOver && partieWinType) {
      switch (partieWinType) {
        case 'DOUBLE_KORA':
          return {
            badgeClass: 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-black shadow-purple-500/40',
            badgeText: 'Double Kora (x4)',
            modalBorder: 'border-purple-500/70 shadow-purple-500/30 ring-1 ring-purple-500/20',
            bannerGradient: 'from-purple-950 via-indigo-900 to-purple-950 border-2 border-purple-400 shadow-purple-500/30',
            icon: <Zap className="w-3.5 h-3.5 text-yellow-300 fill-yellow-300" />,
          };
        case 'KORA':
          return {
            badgeClass: 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black shadow-amber-500/40',
            badgeText: 'Kora (x2)',
            modalBorder: 'border-orange-500/70 shadow-orange-500/30 ring-1 ring-orange-500/20',
            bannerGradient: 'from-amber-950 via-orange-900 to-amber-950 border-2 border-amber-500 shadow-amber-500/20',
            icon: <Flame className="w-3.5 h-3.5 text-slate-950 fill-slate-950" />,
          };
        case 'THREE_SEVENS':
          return {
            badgeClass: 'bg-gradient-to-r from-yellow-400 to-amber-400 text-slate-950 font-black shadow-yellow-500/40',
            badgeText: '777 · Trois Septs',
            modalBorder: 'border-yellow-400/80 shadow-yellow-500/30 ring-1 ring-yellow-400/20',
            bannerGradient: 'from-amber-950 via-yellow-900 to-amber-950 border-2 border-yellow-400 shadow-yellow-500/30',
            icon: <Sparkles className="w-3.5 h-3.5" />,
          };
        case 'UNDER_21':
          return {
            badgeClass: 'bg-gradient-to-r from-emerald-400 to-teal-400 text-slate-950 font-black shadow-emerald-500/40',
            badgeText: 'Moins de 21 (≤ 21)',
            modalBorder: 'border-emerald-400/80 shadow-emerald-500/30 ring-1 ring-emerald-400/20',
            bannerGradient: 'from-emerald-950 via-teal-900 to-emerald-950 border-2 border-emerald-400 shadow-emerald-500/30',
            icon: <Sparkles className="w-3.5 h-3.5" />,
          };
        case 'FORFEIT':
          return {
            badgeClass: 'bg-amber-400 text-slate-950 font-black shadow-amber-500/40',
            badgeText: 'Victoire par forfait',
            modalBorder: 'border-amber-400/80 shadow-amber-500/30 ring-1 ring-amber-400/20',
            bannerGradient: 'from-amber-950 via-slate-900 to-amber-950 border-2 border-amber-400 shadow-amber-500/30',
            icon: <Trophy className="w-3.5 h-3.5 text-slate-950" />,
          };
        case 'STANDARD':
        default:
          return {
            badgeClass: 'bg-slate-800/90 text-amber-300 border border-amber-400/40 font-black',
            badgeText: 'Victoire au 5ᵉ Tour',
            modalBorder: levelTheme.modalBorder,
            bannerGradient: levelTheme.bannerGradient,
            icon: <Trophy className="w-3.5 h-3.5 text-amber-400" />,
          };
      }
    }

    return {
      badgeClass: 'bg-slate-800/90 text-amber-300 border border-amber-400/40 font-black',
      badgeText: isMancheOver ? 'Victoire de la Manche' : 'Victoire au 5ᵉ Tour',
      modalBorder: levelTheme.modalBorder,
      bannerGradient: levelTheme.bannerGradient,
      icon: <Trophy className="w-3.5 h-3.5 text-amber-400" />,
    };
  }, [isHumanEliminated, isSpectator, isMancheOver, partieWinType, levelTheme]);

  const earnedPoints = isHumanWinner ? computeEarnedPoints({
    isMancheOver,
    isWinner: true,
    mode: isOnlineMultiplayer ? 'MULTIPLAYER' : 'SOLO',
    winType: partieWinType,
    difficulty: (gameState as any)?.aiDifficulty || (gameState as any)?.difficulty || 'NORMAL',
  }) : null;

  const [showTricksHistory, setShowTricksHistory] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authSuccess, setAuthSuccess] = useState(false);
  const [isTogglingReady, setIsTogglingReady] = useState(false);
  const [isForcingStart, setIsForcingStart] = useState(false);

  useEffect(() => {
    if (isReadyForNext) {
      setIsTogglingReady(false);
    }
  }, [isReadyForNext]);

  const { isLoggedIn, loginWithGoogle } = usePlayerProfile();

  const handleGoogleSignIn = async () => {
    if (isAuthLoading) return;
    setIsAuthLoading(true);
    try {
      await loginWithGoogle();
      setAuthSuccess(true);
    } catch {
      // Handled in context
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleHome = onReturnHome || onOpenHome || onQuitManche;

  const activePlayers = players.filter((p) => !p.isEliminated);
  const eliminatedPlayers = players.filter((p) => p.isEliminated);

  const gridColsClass =
    players.length === 2
      ? 'grid-cols-2 max-w-xs mx-auto'
      : players.length === 3
      ? 'grid-cols-3 max-w-sm mx-auto'
      : 'grid-cols-2 sm:grid-cols-4';

  return (
    <div
      id="end-round-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className={`w-full max-w-md bg-slate-900 rounded-2xl p-4 sm:p-5 shadow-2xl text-slate-100 flex flex-col gap-3.5 my-auto max-h-[96vh] overflow-y-auto transition-all ${victoryTheme.modalBorder}`}
      >
        {/* Header: Streamlined Victory or Elimination Banner */}
        <div
          id="victory-banner"
          className={`relative bg-gradient-to-br ${victoryTheme.bannerGradient} rounded-xl p-3.5 text-center flex flex-col items-center gap-2 shadow-lg`}
        >
          {/* Top Level / Mode Badge + Special Victory Pills */}
          <div className="flex items-center justify-center gap-1.5 flex-wrap">
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-sm flex items-center gap-1 ${levelTheme.badgeClass}`}>
              <span>{levelTheme.badgeText}</span>
            </span>

            <span className={`px-2.5 py-0.5 rounded-full text-[11px] uppercase shadow flex items-center gap-1 ${victoryTheme.badgeClass}`}>
              {victoryTheme.icon}
              <span>{victoryTheme.badgeText}</span>
            </span>
          </div>

          {/* Winner Identity & Points */}
          <div className="flex items-center justify-center gap-3">
            <div
              className={`w-11 h-11 rounded-full flex items-center justify-center shadow-md shrink-0 font-bold ${
                isHumanEliminated && !isSpectator
                  ? 'bg-rose-500 text-slate-950 ring-4 ring-rose-500/40'
                  : isMancheOver
                  ? 'bg-amber-400 text-slate-950 ring-4 ring-amber-400/40 animate-bounce'
                  : partieWinType === 'UNDER_21'
                  ? 'bg-emerald-400 text-slate-950'
                  : 'bg-amber-400 text-slate-950'
              }`}
            >
              {isHumanEliminated && !isSpectator ? (
                <Skull className="w-6 h-6 text-slate-950" />
              ) : isMancheOver ? (
                <Award className="w-6 h-6" />
              ) : (
                <Trophy className="w-5 h-5" />
              )}
            </div>
            <div className="text-left">
              <div className={`text-[10px] uppercase font-bold tracking-wider leading-none mb-1 ${
                isHumanEliminated && !isSpectator ? 'text-rose-400' : 'text-amber-400/90'
              }`}>
                {isHumanEliminated && !isSpectator
                  ? '☠️ Fin de partie (Éliminé)'
                  : isMancheOver
                  ? '🏆 Victoire de la Manche'
                  : `Partie ${partieCount}`}
              </div>
              <div className={`text-base sm:text-lg font-black flex items-center gap-2 leading-tight ${
                isHumanEliminated && !isSpectator ? 'text-rose-200' : 'text-amber-200'
              }`}>
                {isHumanEliminated && !isSpectator ? (
                  <span>Banqueroute du Joueur</span>
                ) : (
                  <>
                    <Crown className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="truncate max-w-[150px] sm:max-w-[190px]">{winnerName}</span>
                    {!isMancheOver && (
                      <span className="text-xs font-bold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-md border border-amber-500/40">
                        +{pot} jetons
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Concise Decisive Context */}
          <div className="flex items-center justify-center gap-1.5 text-xs text-slate-300 flex-wrap pt-0.5">
            {isHumanEliminated && !isSpectator ? (
              <span className="text-xs text-rose-300 font-semibold text-center leading-relaxed">
                Votre capital est épuisé (0 jeton). Vous n'avez plus assez de jetons pour régler la mise ({baseBet} 🪙). Recommencez une manche pour retenter votre chance !
              </span>
            ) : isMancheOver ? (
              <span className="text-xs text-amber-300 font-bold text-center">
                {partieWinType === 'FORFEIT'
                  ? '👑 Victoire par forfait (tous les autres joueurs humains ont quitté la partie).'
                  : isHumanWinner
                  ? '🎉 Félicitations ! Vous avez éliminé tous vos adversaires.'
                  : `🏆 ${winnerName} remporte définitivement la Manche.`}
              </span>
            ) : partieWinType === 'FORFEIT' ? (
              <span className="text-xs text-amber-300 font-bold text-center">
                👑 Victoire par forfait : les adversaires ont abandonné la table.
              </span>
            ) : partieWinType === 'UNDER_21' ? (
              <span className="text-xs text-emerald-300 font-medium">
                Main initiale ≤ 21 · Victoire instantanée
              </span>
            ) : partieWinType === 'THREE_SEVENS' ? (
              <span className="text-xs text-yellow-300 font-medium">
                3x Septs reçus dès la distribution
              </span>
            ) : (
              finalTrick?.winningCard && (() => {
                const card = finalTrick.winningCard;
                const suitInfo = SUITS_INFO[card.suit];
                return (
                  <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-950/80 border border-amber-500/30 text-amber-300 text-xs font-medium shadow-sm">
                    <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>5ᵉ tour remporté avec</span>
                    {/* Visual Card Tile */}
                    <div
                      id="winning-card-visual"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white text-slate-950 shadow-md border border-amber-400 font-black text-xs leading-none select-none"
                    >
                      <span className={`font-black text-sm ${suitInfo?.color || 'text-slate-900'}`}>
                        {card.value}
                      </span>
                      <span className={`text-base font-bold ${suitInfo?.color || 'text-slate-900'}`}>
                        {suitInfo?.symbol || ''}
                      </span>
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        </div>

        {/* Earned Mastery Points Notification */}
        {earnedPoints && earnedPoints.total > 0 && (
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full bg-gradient-to-r from-amber-500/15 via-yellow-500/20 to-amber-500/15 border border-amber-500/40 rounded-xl p-2.5 flex items-center justify-between text-xs shadow-md"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-yellow-500 text-slate-950 font-black flex items-center justify-center text-sm shadow shrink-0">
                ⭐
              </div>
              <div className="text-left min-w-0">
                <div className="font-black text-amber-200 text-xs flex items-center gap-1">
                  <span>+{Number(earnedPoints.total.toFixed(2))} {earnedPoints.total >= 1 ? 'points de Maîtrise' : 'point de Maîtrise'}</span>
                  <span className="text-[10px] text-amber-400/80 font-normal">au Classement</span>
                </div>
                <div className="text-[10px] text-amber-300/80 truncate">
                  {earnedPoints.breakdown.map((b) => `${b.label} (+${Number(b.points.toFixed(2))})`).join(' · ')}
                </div>
              </div>
            </div>
            <span className="font-mono font-black text-sm sm:text-base text-amber-400 shrink-0 ml-2">
              +{Number(earnedPoints.total.toFixed(2))} pts
            </span>
          </motion.div>
        )}

        {/* Hand details for Instant Special Wins */}
        {(partieWinType === 'UNDER_21' || partieWinType === 'THREE_SEVENS') && (() => {
          const winningPlayer =
            (partieWinnerIndex !== null && partieWinnerIndex !== undefined ? players[partieWinnerIndex] : null) ||
            (winnerIndex !== null && winnerIndex !== undefined ? players[winnerIndex] : null);
          const winningHand = winningPlayer?.hand || [];

          if (winningHand.length === 0) return null;

          return (
            <div className="bg-slate-950/85 border border-emerald-500/40 rounded-xl p-3 text-center shadow-lg">
              <div className="text-[11px] font-bold text-emerald-300 mb-2 uppercase tracking-wider flex items-center justify-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Main Victorieuse</span>
              </div>
              <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap py-1">
                {winningHand.map((card, idx) => {
                  const suitInfo = SUITS_INFO[card.suit];
                  const isHighlightedSeven = partieWinType === 'THREE_SEVENS' && card.value === 7;

                  return (
                    <motion.div
                      key={card.id || `win-card-${idx}`}
                      initial={{ scale: 0.8, opacity: 0, y: 8 }}
                      animate={{ scale: 1, opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.06, type: 'spring', damping: 15 }}
                      className={`relative w-12 sm:w-14 h-18 sm:h-20 rounded-lg bg-white text-slate-950 p-1 flex flex-col justify-between shadow-md select-none border-2 transition-all ${
                        isHighlightedSeven
                          ? 'border-amber-400 ring-2 ring-amber-400/80 shadow-amber-400/30'
                          : 'border-slate-300 shadow-slate-950/50'
                      }`}
                    >
                      <div className="flex flex-col items-start leading-none pointer-events-none">
                        <span className={`text-xs font-black ${suitInfo?.color || 'text-slate-900'}`}>
                          {card.value}
                        </span>
                        <span className={`text-[10px] font-bold ${suitInfo?.color || 'text-slate-900'} -mt-0.5`}>
                          {suitInfo?.symbol || ''}
                        </span>
                      </div>
                      <div className={`self-center text-base leading-none pointer-events-none select-none ${suitInfo?.color || 'text-slate-900'}`}>
                        {suitInfo?.symbol || ''}
                      </div>
                      <div className="flex flex-col items-end leading-none rotate-180 pointer-events-none">
                        <span className={`text-xs font-black ${suitInfo?.color || 'text-slate-900'}`}>
                          {card.value}
                        </span>
                        <span className={`text-[10px] font-bold ${suitInfo?.color || 'text-slate-900'} -mt-0.5`}>
                          {suitInfo?.symbol || ''}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Capital & Elimination Status */}
        <div id="players-capital-section">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 px-1 flex items-center justify-between">
            <span>Capital des Joueurs (Mise : {baseBet} jetons)</span>
            <span className="text-slate-400 text-[9px]">
              {activePlayers.length} actif{activePlayers.length > 1 ? 's' : ''} / {eliminatedPlayers.length} éliminé{eliminatedPlayers.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className={`grid ${gridColsClass} gap-1.5`}>
            {(players || []).map((p, idx) => {
              const isPartieWinner = idx === partieWinnerIndex;
              const isMancheWinner = idx === mancheWinnerIndex;
              const isForfeit = (p as any).isForfeit;
              const isEliminated = p.isEliminated || isForfeit;

              return (
                <div
                  key={p.id}
                  id={`player-capital-card-${p.id}`}
                  className={`p-2 rounded-xl border flex flex-col items-center text-center transition-all ${
                    isForfeit
                      ? 'bg-rose-950/30 border-rose-800/60 text-slate-400 grayscale opacity-80'
                      : isEliminated
                      ? 'bg-rose-950/20 border-rose-800/50 text-slate-400 grayscale opacity-75'
                      : isMancheWinner || isPartieWinner
                      ? 'bg-amber-500/20 border-amber-400 text-amber-100 ring-1 ring-amber-400/30'
                      : p.isHuman
                      ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-100'
                      : 'bg-slate-950/60 border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1 w-full px-0.5">
                    <span className="text-[11px] font-bold truncate max-w-[75px] sm:max-w-[90px]" title={p.name}>
                      {p.isHuman ? (p.name.includes('Vous') ? 'Joueur (Vous)' : p.name) : p.name.replace(/^Joueur\s+/i, '')}
                    </span>
                    {isForfeit ? (
                      <span title="Forfait"><Ban className="w-3 h-3 text-rose-400 shrink-0" /></span>
                    ) : isEliminated ? (
                      <span title="Éliminé"><Skull className="w-3 h-3 text-rose-400 shrink-0" /></span>
                    ) : null}
                  </div>
                  <span
                    className={`text-sm font-black flex items-center justify-center gap-0.5 mt-0.5 ${
                      isEliminated ? 'text-rose-400 line-through' : 'text-amber-400'
                    }`}
                  >
                    <Coins className="w-3 h-3 shrink-0" />
                    <span>{p.capital}</span>
                  </span>
                  <span className="text-[9px] mt-0.5">
                    {isForfeit ? (
                      <span className="text-rose-400 font-bold bg-rose-950/80 px-1.5 py-0.2 rounded border border-rose-800">
                        Forfait
                      </span>
                    ) : isEliminated ? (
                      <span className="text-rose-400 font-bold bg-rose-950/80 px-1.5 py-0.2 rounded border border-rose-800">
                        Éliminé
                      </span>
                    ) : isOnlineMultiplayer && !isMancheOver ? (
                      (() => {
                        const mpPlayer = (multiplayerPlayers || roomPlayers || []).find(
                          (rp) => rp.id === p.id || rp.name === p.name
                        );
                        if (!mpPlayer) {
                          return <span className="text-emerald-400 font-semibold">En lice</span>;
                        }
                        if (mpPlayer.connected === false) {
                          const graceLeft = mpPlayer.disconnectGraceExpiresAt
                            ? Math.max(0, Math.ceil((mpPlayer.disconnectGraceExpiresAt - Date.now()) / 1000))
                            : 0;
                          return (
                            <span className="text-rose-300 font-bold bg-rose-950/80 px-1.5 py-0.5 rounded border border-rose-500/40 flex items-center gap-1 animate-pulse">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                              <span>{graceLeft > 0 ? `Reconnexion ${graceLeft}s` : 'Hors-ligne'}</span>
                            </span>
                          );
                        }
                        if (mpPlayer.isAiRelay) {
                          return (
                            <span className="text-slate-300 font-semibold bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700">
                              🤖 Relais IA
                            </span>
                          );
                        }
                        if (mpPlayer.readyForNextPartie) {
                          return (
                            <span className="text-emerald-300 font-bold bg-emerald-950/90 px-1.5 py-0.5 rounded border border-emerald-500/50 flex items-center gap-0.5 shadow-sm">
                              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                              <span>Prêt</span>
                            </span>
                          );
                        }
                        return (
                          <span className="text-amber-300/90 font-semibold bg-amber-950/70 px-1.5 py-0.5 rounded border border-amber-500/30 flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5 text-amber-400 animate-pulse" />
                            <span>Lecture...</span>
                          </span>
                        );
                      })()
                    ) : (
                      <span className="text-emerald-400 font-semibold">En lice</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Collapsible Accordion for Tricks History */}
        {!isMancheOver && tricksHistory.length > 0 && (
          <div className="pt-0.5" id="tricks-details-accordion">
            <button
              id="btn-toggle-tricks-details"
              type="button"
              onClick={() => setShowTricksHistory((prev) => !prev)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] text-slate-400 hover:text-amber-300 bg-slate-950/50 hover:bg-slate-950/80 rounded-lg border border-slate-800/80 transition-colors cursor-pointer"
            >
              <span className="font-semibold">
                {showTricksHistory ? 'Masquer le détail des tours' : 'Voir le détail des 5 tours de la partie'}
              </span>
              {showTricksHistory ? (
                <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>

            <AnimatePresence>
              {showTricksHistory && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden mt-1.5"
                >
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl divide-y divide-slate-800/80 overflow-hidden text-[11px]">
                    {tricksHistory.map((trick) => {
                      const leadSuitInfo = trick.leadSuit ? SUITS_INFO[trick.leadSuit] : null;
                      const isFinalTrick = trick.trickNumber === 5;
                      return (
                        <div
                          key={trick.trickNumber}
                          className={`px-2.5 py-1.5 flex items-center justify-between gap-2 ${
                            isFinalTrick ? 'bg-amber-500/10 font-medium' : ''
                          }`}
                        >
                          {/* Left: Tour # + Couleur */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                                isFinalTrick
                                  ? 'text-amber-300 bg-amber-950 border border-amber-500/50'
                                  : 'text-slate-300 bg-slate-800'
                              }`}
                            >
                              Tour {trick.trickNumber}
                            </span>
                            {leadSuitInfo && (
                              <span className={`text-[11px] font-semibold ${leadSuitInfo.color} flex items-center gap-0.5`}>
                                <span>{leadSuitInfo.symbol}</span>
                                <span className="hidden sm:inline text-[10px]">{leadSuitInfo.name}</span>
                              </span>
                            )}
                          </div>

                          {/* Right: Winner + Card */}
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-200 flex items-center gap-1 text-[11px]">
                              {isFinalTrick && <Crown className="w-3 h-3 text-amber-400" />}
                              <span className="truncate max-w-[90px]">{trick.winnerName}</span>
                            </span>
                            {trick.winningCard && (() => {
                              const card = trick.winningCard;
                              const cardSuit = SUITS_INFO[card.suit];
                              return (
                                <div
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white text-slate-950 shadow-sm border ${
                                    isFinalTrick
                                      ? 'border-amber-400 ring-1 ring-amber-400/60'
                                      : 'border-slate-300'
                                  } text-[11px] font-black leading-none select-none`}
                                >
                                  <span className={`font-black ${cardSuit?.color || 'text-slate-900'}`}>
                                    {card.value}
                                  </span>
                                  <span className={`text-xs font-bold ${cardSuit?.color || 'text-slate-900'}`}>
                                    {cardSuit?.symbol || ''}
                                  </span>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Action Buttons: Clear Hierarchy */}
        <div id="modal-actions" className="pt-2 border-t border-slate-800 flex flex-col gap-2">
          {/* Multiplayer Ready Status & Auto-advance Bar */}
          {isOnlineMultiplayer && !isMancheOver && (
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5 flex flex-col gap-2">
              {/* Barre de compte à rebours sur la durée réglée dans katika (transitionDelayMs) */}
              {roundEndRemainingSeconds !== null && roundEndRemainingSeconds !== undefined && roundEndRemainingSeconds > 0 && (
                <div className="w-full bg-slate-900/90 h-1.5 rounded-full overflow-hidden border border-slate-800/80">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-400 transition-all duration-300 rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(0, (roundEndRemainingSeconds / (getPublicParamNumber('transitionDelayMs') / 1000)) * 100))}%`,
                    }}
                  />
                </div>
              )}

              {/* Ready status badges for all seated players */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-semibold flex items-center gap-1">
                  <Radio className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    Joueurs prêts ({
                      (multiplayerPlayers || []).filter(
                        (p) => !(p as RoomPlayer).isSpectator && p.readyForNextPartie
                      ).length
                    }/{(multiplayerPlayers || []).filter((p) => !(p as RoomPlayer).isSpectator).length}) :
                  </span>
                </span>
                {roundEndRemainingSeconds !== null && roundEndRemainingSeconds !== undefined && (
                  <span className="text-amber-300 font-bold flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30 text-[11px]">
                    <Clock className="w-3 h-3 text-amber-400 animate-pulse" />
                    <span>Lancement auto : {roundEndRemainingSeconds}s</span>
                  </span>
                )}
              </div>

              {/* Player pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                {(multiplayerPlayers || [])
                  .filter((p) => !(p as RoomPlayer).isSpectator)
                  .map((p) => {
                    const isCurrent = p.id === localPlayerId;
                    const isReady = p.readyForNextPartie;
                    return (
                      <div
                        key={p.id}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border transition-colors ${
                          isReady
                            ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                            : 'bg-slate-900 border-slate-800 text-slate-400'
                        }`}
                      >
                        {isReady ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Clock className="w-3 h-3 text-slate-500" />
                        )}
                        <span className="truncate max-w-[80px]">
                          {isCurrent ? `${p.name} (Vous)` : p.name}
                        </span>
                      </div>
                    );
                  })}
                {(multiplayerPlayers || []).some((p) => (p as RoomPlayer).isSpectator) && (
                  <span className="text-[10px] text-cyan-300 bg-cyan-950/80 border border-cyan-500/30 px-2 py-0.5 rounded-md flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    <span>
                      {(multiplayerPlayers || []).filter((p) => (p as RoomPlayer).isSpectator).length} observateur(s)
                    </span>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Bet Increase Proposal Widget in EndRoundModal */}
          {!isMancheOver && onProposeBetIncrease && onRespondBetIncrease && onCancelBetIncrease && (
            <div className="w-full">
              <BetIncreaseProposalWidget
                currentBaseBet={baseBet}
                proposal={betIncreaseProposal}
                players={isOnlineMultiplayer ? (roomPlayers || []) : (players?.map((p, idx) => ({
                  ...p,
                  isHost: idx === 0,
                  avatarSeed: p.avatarSeed || "",
                  score: p.score || 0,
                  capital: p.capital || 0,
                  isEliminated: p.isEliminated || false,
                  hand: p.hand || [],
                  tricksWonInRound: p.tricksWonInRound || 0,
                })) || [])}
                localPlayerId={localPlayerId || 'human'}
                onPropose={onProposeBetIncrease}
                onRespond={onRespondBetIncrease}
                onCancel={onCancelBetIncrease}
                compact={false}
              />
            </div>
          )}

          {/* Google Auth Conversion Card for Guest Players (Solo & Casual) */}
          {!isLoggedIn && (
            <div className="w-full p-2.5 sm:p-3 rounded-2xl bg-gradient-to-r from-amber-950/40 via-slate-900 to-amber-950/30 border border-amber-500/30 flex items-center justify-between gap-2.5 shadow-sm">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                </div>
                <div className="flex flex-col min-w-0 text-left">
                  <span className="text-xs font-bold text-white truncate">
                    {isHumanWinner ? 'Enregistrez cette victoire !' : 'Sauvegardez votre progression'}
                  </span>
                  <span className="text-[10px] text-slate-300 truncate">
                    {isHumanWinner
                      ? 'Liez Google pour inscrire vos trophées au Palmarès'
                      : 'Conservez vos jetons et statistiques sur le Cloud'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                id="btn-end-round-google-sync"
                disabled={isAuthLoading}
                onClick={handleGoogleSignIn}
                className="h-8 px-3 rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow transition active:scale-95 cursor-pointer shrink-0 disabled:opacity-50"
              >
                <GoogleIcon className="w-3.5 h-3.5" />
                <span>{isAuthLoading ? '...' : 'Lier Google'}</span>
              </button>
            </div>
          )}

          {authSuccess && (
            <div className="w-full p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Victoire et stats synchronisées sur votre compte Google !</span>
            </div>
          )}

          {/* Primary Action Button */}
          {isHumanEliminated && !isSpectator && !isOnlineMultiplayer ? (
            <button
              id="btn-new-manche-eliminated"
              type="button"
              onClick={onNewManche}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-slate-950 font-black text-sm shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 cursor-pointer ring-1 ring-amber-400/60 btn-juicy"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Recommencer une Manche</span>
            </button>
          ) : !isMancheOver ? (
            isOnlineMultiplayer ? (
              isSpectator ? (
                <div className="flex flex-col gap-2">
                  {canRequestIntegration && onRequestIntegration ? (
                    <button
                      id="btn-spectator-request-integration-modal"
                      type="button"
                      disabled={isPendingIntegration}
                      onClick={onRequestIntegration}
                      className={`w-full py-2.5 px-4 rounded-xl font-black text-xs sm:text-sm shadow-lg flex items-center justify-center gap-2 cursor-pointer transition ${
                        isPendingIntegration
                          ? 'bg-slate-800 text-amber-300 border border-amber-500/30 cursor-not-allowed'
                          : 'bg-gradient-to-r from-emerald-400 to-emerald-500 text-slate-950 shadow-emerald-500/20 hover:brightness-110 active:scale-98'
                      }`}
                    >
                      {isPendingIntegration ? (
                        <>
                          <Clock className="w-4 h-4 text-amber-400 animate-spin" />
                          <span>Demande d'intégration en cours de vote...</span>
                        </>
                      ) : (
                        <>
                          <Users className="w-4 h-4" />
                          <span>
                            Intégrer la table (~{prorataCapitalEstimate} jetons de départ) 🪑
                          </span>
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="w-full py-2.5 px-3 rounded-xl bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 text-xs font-medium text-center flex flex-col items-center justify-center gap-1.5">
                      <div className="flex items-center justify-center gap-2">
                        <Eye className="w-4 h-4 shrink-0 text-cyan-400" />
                        <span className="font-bold">Match en direct (Spectateur)</span>
                        {roundEndRemainingSeconds !== null && roundEndRemainingSeconds !== undefined && roundEndRemainingSeconds > 0 && (
                          <span className="text-[11px] bg-cyan-900/80 border border-cyan-400/40 text-cyan-200 px-1.5 py-0.5 rounded font-mono font-bold">
                            {roundEndRemainingSeconds}s
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-cyan-300/80">
                        {(() => {
                          const seatedHumans = (multiplayerPlayers || []).filter(
                            (p) => !p.isAway && p.isHuman && !(p as RoomPlayer).isSpectator
                          );
                          const readyCount = seatedHumans.filter((p) => p.readyForNextPartie).length;
                          return seatedHumans.length > 0 ? `${readyCount}/${seatedHumans.length} joueurs prêts · ` : '';
                        })()}
                        La donne suivante démarrera automatiquement.
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2">
                  {/* Ready Toggle Button for ALL players */}
                  <button
                    id="btn-toggle-ready-mp"
                    type="button"
                    disabled={isTogglingReady && !isReadyForNext}
                    onClick={() => {
                      setIsTogglingReady(true);
                      onToggleReady?.();
                    }}
                    className={`flex-1 py-2.5 px-4 rounded-xl font-black text-sm shadow-lg flex items-center justify-center gap-2 cursor-pointer btn-juicy transition-all ${
                      isReadyForNext
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 ring-2 ring-emerald-300 shadow-emerald-500/20'
                        : isTogglingReady
                        ? 'bg-amber-500/80 text-slate-950 opacity-90 cursor-wait'
                        : 'bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-slate-950 shadow-amber-500/25 ring-1 ring-amber-400/60'
                    }`}
                  >
                    {isReadyForNext ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-slate-950" />
                        <span>
                          ✓ Vous êtes prêt {roundEndRemainingSeconds !== null && roundEndRemainingSeconds !== undefined && roundEndRemainingSeconds > 0 ? `· Prochaine donne dans ${roundEndRemainingSeconds}s` : '· En attente'}
                        </span>
                      </>
                    ) : isTogglingReady ? (
                      <>
                        <Clock className="w-4 h-4 text-slate-950 animate-spin" />
                        <span>Validation en cours...</span>
                      </>
                    ) : (
                      <>
                        <PlayCircle className="w-4 h-4" />
                        <span>
                          Je suis prêt pour la suite {roundEndRemainingSeconds !== null && roundEndRemainingSeconds !== undefined && roundEndRemainingSeconds > 0 ? `(${roundEndRemainingSeconds}s)` : ''}
                        </span>
                      </>
                    )}
                  </button>

                  {/* Host or Acting Host can also force launch immediately */}
                  {isHost && (
                    <button
                      id="btn-force-next-partie"
                      type="button"
                      disabled={isForcingStart}
                      onClick={() => {
                        setIsForcingStart(true);
                        onNextPartie();
                      }}
                      className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs border border-amber-500/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-50"
                      title="Lancer immédiatement la partie suivante en forçant le départ"
                    >
                      {isForcingStart ? (
                        <>
                          <Clock className="w-3.5 h-3.5 animate-spin text-amber-400" />
                          <span>Lancement...</span>
                        </>
                      ) : (
                        <>
                          <PlayCircle className="w-3.5 h-3.5" />
                          <span>⚡ Forcer le départ (Hôte)</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              )
            ) : (
              <button
                id="btn-next-partie"
                type="button"
                onClick={onNextPartie}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-slate-950 font-black text-sm shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 cursor-pointer ring-1 ring-amber-400/60 btn-juicy"
              >
                <PlayCircle className="w-4 h-4" />
                <span>Partie Suivante</span>
              </button>
            )
          ) : isOnlineMultiplayer ? (
            isHost ? (
              <button
                id="btn-new-manche-primary"
                type="button"
                onClick={onNewManche}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-slate-950 font-black text-sm shadow-lg shadow-amber-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer ring-1 ring-amber-400/60 active:scale-[0.99]"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Recommencer une Manche (Hôte)</span>
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                {onSendRematch && (
                  <button
                    type="button"
                    id="btn-guest-rematch-proposal"
                    onClick={onSendRematch}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-amber-500/20 hover:brightness-110 transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Demander une Revanche ⚔️</span>
                  </button>
                )}
                <div className="w-full py-2 px-3 rounded-xl bg-slate-950/80 text-amber-300/90 border border-slate-800 text-center text-xs font-semibold flex items-center justify-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                  <span>En attente de l'hôte pour relancer la manche...</span>
                </div>
                {onClaimHost && (
                  <button
                    type="button"
                    onClick={onClaimHost}
                    className="w-full py-1.5 px-3 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Crown className="w-3.5 h-3.5 text-amber-400" />
                    <span>Prendre le rôle d'hôte et relancer</span>
                  </button>
                )}
              </div>
            )
          ) : (
            <button
              id="btn-new-manche-primary"
              type="button"
              onClick={onNewManche}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-slate-950 font-black text-sm shadow-lg shadow-amber-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer ring-1 ring-amber-400/60 active:scale-[0.99]"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Recommencer une Manche</span>
            </button>
          )}

          {/* Optional Share Action */}
          {onShareMatch && (
            <button
              type="button"
              onClick={onShareMatch}
              className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
              title="Partager le résultat"
            >
              <Share2 className="w-4 h-4 text-amber-400" />
              <span>Partager le résultat</span>
            </button>
          )}

          {/* Secondary Actions Row */}
          <div className="grid grid-cols-2 gap-1.5">
            {handleHome && (
              <button
                id="btn-home-modal"
                type="button"
                onClick={handleHome}
                className="py-1.5 px-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-medium text-xs border border-slate-700/60 flex items-center justify-center gap-1 cursor-pointer btn-juicy-subtle"
                title="Retourner au menu principal"
              >
                <Home className="w-3.5 h-3.5 text-slate-400" />
                <span className="truncate">Accueil</span>
              </button>
            )}

            {onSaveManche ? (
              <button
                id="btn-save-manche-modal"
                type="button"
                onClick={onSaveManche}
                className="py-1.5 px-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-emerald-300 font-medium text-xs border border-emerald-500/30 flex items-center justify-center gap-1 cursor-pointer btn-juicy-subtle"
                title="Sauvegarder l'état actuel"
              >
                <BookmarkCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="truncate">Sauvegarder</span>
              </button>
            ) : onChangeOpponents ? (
              <button
                id="btn-change-opponents"
                type="button"
                onClick={onChangeOpponents}
                className="py-1.5 px-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-amber-300 font-medium text-xs border border-amber-500/30 flex items-center justify-center gap-1 cursor-pointer btn-juicy-subtle"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
                <span className="truncate">Config</span>
              </button>
            ) : onQuitManche ? (
              <button
                id="btn-quit-manche-modal"
                type="button"
                onClick={onQuitManche}
                className="py-1.5 px-2 rounded-lg bg-slate-800/80 hover:bg-rose-950/60 text-rose-300 font-medium text-xs border border-rose-800/40 flex items-center justify-center gap-1 cursor-pointer btn-juicy-subtle"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-400" />
                <span className="truncate">Quitter</span>
              </button>
            ) : null}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
