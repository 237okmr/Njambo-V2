import React from 'react';
import { PlayedCard, Suit, SUITS_INFO, PartieWinType, InstantWinReveal, CutEvent, Player } from '../types';
import { Sparkles, Flame, Zap, Crown, Loader2, Scissors, Coins, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { FlyingChipsEffect } from './FlyingChipsEffect';
import { BetIncreaseCountUpBanner } from './BetIncreaseCountUpBanner';

interface PlayZoneFeltProps {
  plays: PlayedCard[];
  leadSuit: Suit | null;
  currentTrickNumber: number;
  winnerPlay: PlayedCard | null;
  playerCount?: number;
  isDoubleKoraEnabled?: boolean;
  activeKoraPlayerName?: string | null;
  trick4WinnerWithThreeName?: string | null;
  isDoubleKoraAchieved?: boolean;
  partieWinType?: PartieWinType | null;
  winnerName?: string | null;
  isDealing?: boolean;
  dealerIndex?: number;
  leadIndex?: number;
  players?: Player[];
  instantWinReveal?: InstantWinReveal | null;
  isResolvingTrick?: boolean;
  isCollectingTrick?: boolean;
  lastCutEvent?: CutEvent | null;
  mbapActive?: boolean;
  showFlyingChips?: boolean;
  winnerIndexForChips?: number | null;
  isKoraHunterActive?: boolean;
  baseBet?: number;
}

export const PlayZoneFelt: React.FC<PlayZoneFeltProps> = ({
  plays = [],
  leadSuit = null,
  currentTrickNumber = 1,
  winnerPlay = null,
  playerCount = 4,
  isDoubleKoraEnabled = true,
  activeKoraPlayerName,
  trick4WinnerWithThreeName,
  isDoubleKoraAchieved,
  partieWinType,
  winnerName,
  isDealing = false,
  dealerIndex = 0,
  leadIndex = 1,
  players = [],
  instantWinReveal = null,
  isResolvingTrick = false,
  isCollectingTrick = false,
  lastCutEvent = null,
  mbapActive = false,
  showFlyingChips = false,
  winnerIndexForChips = null,
  isKoraHunterActive = false,
  baseBet = 10,
}) => {
  const safePlays = Array.isArray(plays) ? plays : [];
  const leadSuitInfo = leadSuit ? SUITS_INFO[leadSuit] : null;

  // Active player count participating in current round from players prop if available
  const activePlayersInRound = Array.isArray(players) && players.length > 0
    ? players.filter((p) => !p.isEliminated && !p.isForfeit && !p.isFoldedInRound).length
    : 0;
  const effectivePlayerCount = activePlayersInRound > 0 ? activePlayersInRound : (playerCount || 4);
  const totalSlots = Math.max(2, Math.min(4, effectivePlayerCount));
  const isDecisiveFifthTrick = currentTrickNumber === 5;
  const hasKoraThreat = Boolean(
    (isKoraHunterActive || activeKoraPlayerName) && !lastCutEvent
  );
  const gridColsClass =
    totalSlots === 2
      ? 'grid-cols-2 max-w-xs sm:max-w-sm mx-auto'
      : totalSlots === 3
      ? 'grid-cols-3 max-w-sm sm:max-w-md mx-auto'
      : 'grid-cols-4';

  // Compute flight trajectory toward the winner's position on screen
  const getCollectionTarget = (winnerIdx: number | null | undefined) => {
    if (winnerIdx === undefined || winnerIdx === null) return { x: 0, y: 0, scale: 0.2, opacity: 0 };
    switch (winnerIdx) {
      case 0: // Human (Bottom)
        return { x: 0, y: 160, scale: 0.15, opacity: 0, rotate: 15 };
      case 1: // Oumar / West (Left)
        return { x: -190, y: -80, scale: 0.15, opacity: 0, rotate: -25 };
      case 2: // Fatou / North (Top)
        return { x: 0, y: -160, scale: 0.15, opacity: 0, rotate: 10 };
      case 3: // Amadou / East (Right)
        return { x: 190, y: -80, scale: 0.15, opacity: 0, rotate: 25 };
      default:
        return { x: 0, y: 0, scale: 0.15, opacity: 0 };
    }
  };

  const winnerIdx = winnerPlay?.playerIndex;
  const collectionTarget = getCollectionTarget(winnerIdx);

  return (
    <div
      id="play-zone-felt"
      className={`relative w-full rounded-2xl bg-[radial-gradient(ellipse_at_center,#065f46_0%,#044332_55%,#022c22_100%)] border-2 sm:border-4 transition-all duration-300 p-1.5 sm:p-2.5 lg:p-4 lg:max-w-3xl lg:mx-auto flex flex-col justify-between min-h-[115px] sm:min-h-[160px] lg:min-h-0 overflow-hidden my-auto ${
        hasKoraThreat
          ? 'border-rose-500/90 shadow-[inset_0_0_30px_rgba(225,29,72,0.45),0_0_35px_rgba(225,29,72,0.65)] animate-pulse'
          : isDecisiveFifthTrick
            ? 'border-amber-500/90 shadow-[inset_0_4px_30px_rgba(0,0,0,0.85),0_0_25px_rgba(245,158,11,0.35)] ring-1 ring-amber-400/50'
            : 'border-[#78350f]/80 ring-1 ring-amber-500/30 shadow-[inset_0_4px_30px_rgba(0,0,0,0.7),0_10px_25px_rgba(0,0,0,0.5)]'
      } ${mbapActive ? 'animate-mbap-shake' : ''}`}
    >
      {/* 5th Trick Dramatic Tension Vignette */}
      {isDecisiveFifthTrick && (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,0,0,0.45)_100%)] pointer-events-none z-0 animate-pulse" />
      )}

      {/* Background radial accent */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.15)_0%,transparent_70%)] pointer-events-none" />

      {/* Shockwave ripple when Mbap is triggered */}
      {mbapActive && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full border-2 border-amber-400/90 animate-shockwave pointer-events-none z-30 shadow-[0_0_20px_rgba(251,191,36,0.6)]" />
      )}

      {/* Numerical Count-up animation overlay on bet increase */}
      <BetIncreaseCountUpBanner currentBaseBet={baseBet} />

      {/* Flying Chips Effect */}
      {showFlyingChips && (
        <FlyingChipsEffect winnerIndex={winnerIndexForChips} playerCount={playerCount} />
      )}

      {/* Top row: Status header inside the felt */}
      <div className="flex items-center justify-between z-10 text-xs font-bold text-emerald-100 mb-1 flex-wrap gap-1">
        <div
          key={currentTrickNumber}
          className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] transition-all ${
            isDecisiveFifthTrick
              ? 'bg-amber-950/90 border border-amber-400 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.5)] animate-decisive-pop'
              : 'bg-emerald-950/80 border border-emerald-700/50 text-emerald-100'
          }`}
        >
          <span className={isDecisiveFifthTrick ? 'text-amber-400 font-black' : 'text-emerald-300 font-black'}>ZONE DE JEU</span>
          <span>·</span>
          <span className={isDecisiveFifthTrick ? 'text-amber-300 font-black flex items-center gap-1' : ''}>
            Tour {currentTrickNumber}/5 {isDecisiveFifthTrick ? '🔥 DÉCISIF' : ''}
          </span>
        </div>

        {/* Dynamic Tension Badges / Dealing state / Trick Resolution */}
        {isDealing ? (
          <div className="flex items-center gap-1.5 bg-slate-900/90 px-3 py-0.5 rounded-full border border-emerald-400/50 text-emerald-300 text-[11px] font-bold shadow animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
            <span>Distribution des 5 cartes en cours...</span>
          </div>
        ) : isResolvingTrick && winnerPlay ? (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center gap-1.5 bg-amber-950/95 border border-amber-400 px-3 py-0.5 rounded-full text-amber-200 text-[11px] font-black shadow-lg"
          >
            <Crown className="w-3.5 h-3.5 text-amber-400 animate-bounce" />
            <span>{winnerPlay.playerName.split(' ')[0]} remporte le Tour {currentTrickNumber} !</span>
          </motion.div>
        ) : isDoubleKoraAchieved ? (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center gap-1 bg-purple-950 border border-purple-400 px-2.5 py-0.5 rounded-full text-purple-200 text-[10px] sm:text-[11px] font-black shadow-lg animate-pulse"
          >
            <Zap className="w-3.5 h-3.5 text-yellow-300 fill-yellow-300" />
            <span>⚡ DOUBLE KORA DÉCLENCHÉ (MISES x4) !</span>
          </motion.div>
        ) : trick4WinnerWithThreeName && isDoubleKoraEnabled && currentTrickNumber === 5 ? (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center gap-1 bg-purple-950 border border-purple-400 px-2.5 py-0.5 rounded-full text-purple-200 text-[10px] sm:text-[11px] font-bold shadow"
          >
            <Zap className="w-3.5 h-3.5 text-yellow-300 fill-yellow-300" />
            <span>⚡ {trick4WinnerWithThreeName.split(' ')[0]} a pris le Tour 4 au '3' — Victoire au '3' au Tour 5 = Double Kora (x4) !</span>
          </motion.div>
        ) : leadSuitInfo ? (
          <div className="flex items-center gap-1 bg-slate-900/90 px-2.5 py-0.5 rounded-full border border-amber-400/50 text-amber-300 text-[11px] font-black shadow">
            <span>Entame :</span>
            <span className={leadSuitInfo.color}>{leadSuitInfo.symbol}</span>
            <span className="uppercase text-[10px]">{leadSuitInfo.name}</span>
          </div>
        ) : (
          <div className="text-[11px] text-emerald-300/80 font-medium">
            En attente de la première carte...
          </div>
        )}
      </div>

      {/* Center Cards Grid - Dynamic per player count */}
      <div className={`grid ${gridColsClass} gap-1.5 sm:gap-3 py-1 z-10 items-center justify-center w-full`}>
        {Array.from({ length: totalSlots }).map((_, index) => {
          const play = safePlays[index];

          if (!play) {
            return (
              <div
                key={`empty-slot-${index}`}
                className="h-16 sm:h-24 lg:h-36 xl:h-40 rounded-xl border-2 border-dashed border-emerald-700/40 bg-emerald-950/20 flex flex-col items-center justify-center text-emerald-600/60"
              >
                <span className="text-[10px] sm:text-xs lg:text-sm font-bold">Slot {index + 1}</span>
              </div>
            );
          }

          const suitInfo = SUITS_INFO[play.card.suit];
          const isWinner = winnerPlay?.card.id === play.card.id;
          const isCutCard = lastCutEvent && lastCutEvent.cardId === play.card.id;
          const isMbapCard = play.card.value === 10 || (play.card.value === 9 && play.card.suit === 'PIQUE') || play.card.value === 3;
          const isAutoPlayedBot = Boolean(play.isAutoPlayedByEmergencyBot);

          return (
            <motion.div
              key={play.card.id}
              initial={{ scale: 1.16, opacity: 0, y: -18, rotate: index % 2 === 0 ? -2 : 2 }}
              animate={
                isCollectingTrick
                  ? {
                      scale: [1, 0.92, collectionTarget.scale],
                      x: [0, (index - (totalSlots - 1) / 2) * -12, collectionTarget.x],
                      y: [0, -6, collectionTarget.y],
                      rotate: [index % 2 === 0 ? -2 : 2, (index - 1) * 3, collectionTarget.rotate || 0],
                      opacity: [1, 1, 0],
                    }
                  : { scale: 1, opacity: 1, y: 0, x: 0, rotate: 0 }
              }
              transition={
                isCollectingTrick
                  ? { duration: 0.42, times: [0, 0.25, 1], ease: ['easeInOut', 'easeIn'] }
                  : { type: 'spring', damping: 20, stiffness: 400, mass: 0.75 }
              }
              className={`relative h-18 sm:h-24 lg:h-36 xl:h-40 rounded-xl bg-white text-slate-950 p-1 sm:p-2 lg:p-2.5 flex flex-col justify-between select-none transition-all overflow-hidden animate-card-slam ${
                isWinner
                  ? 'border-2 border-amber-400 ring-2 ring-amber-400 ring-offset-2 ring-offset-emerald-950 shadow-amber-400/40 z-20'
                  : isAutoPlayedBot
                  ? 'border-2 border-amber-500/80 shadow-amber-500/30 ring-1 ring-amber-400/50 z-15'
                  : 'border border-slate-300 shadow-lg z-10'
              } ${isMbapCard ? 'ring-1 ring-amber-400/30' : ''}`}
            >
              {/* Player name tag at top */}
              <div className="flex items-center justify-between leading-none pointer-events-none border-b border-slate-100 pb-0.5">
                <span className="text-[9px] sm:text-[10px] lg:text-xs font-black uppercase text-slate-700 truncate max-w-[55px] sm:max-w-[70px] lg:max-w-[100px]">
                  {play.playerName.split(' ')[0]}
                </span>
                <span className={`text-[10px] sm:text-xs lg:text-sm font-black ${suitInfo.color}`}>
                  {play.card.value}
                </span>
              </div>

              {/* Center large symbol */}
              <div className={`self-center text-xl sm:text-3xl lg:text-4xl xl:text-5xl leading-none pointer-events-none ${suitInfo.color}`}>
                {suitInfo.symbol}
              </div>

              {/* Bottom value + symbol */}
              <div className="flex items-center justify-between leading-none pointer-events-none">
                <span className={`text-xs sm:text-sm lg:text-base font-black ${suitInfo.color}`}>
                  {play.card.value}
                </span>
                <span className={`text-[10px] sm:text-xs lg:text-sm font-bold ${suitInfo.color}`}>
                  {suitInfo.symbol}
                </span>
              </div>

              {/* Emergency Bot Auto-Play Badge */}
              {isAutoPlayedBot && (
                <div
                  title="Joué automatiquement par le bot d'urgence (délai 20s dépassé)"
                  className="absolute bottom-1 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-black text-[7px] sm:text-[8px] px-1.5 py-0.2 rounded-full border border-amber-300 shadow flex items-center gap-0.5 whitespace-nowrap z-25 tracking-tight"
                >
                  <span>🤖</span>
                  <span>Coup auto (20s)</span>
                </div>
              )}

              {/* Live Golden Lead Flare sweep */}
              {isWinner && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-300/45 to-transparent pointer-events-none z-15 animate-lead-flare" />
              )}

              {/* "COUPÉ !" Flash Badge */}
              {isCutCard && (
                <>
                  <div className="absolute inset-0 overflow-hidden pointer-events-none z-20">
                    <div className="w-full h-1 bg-gradient-to-r from-transparent via-rose-500 via-amber-300 to-transparent shadow-[0_0_12px_rgba(244,63,94,0.9)] animate-cut-slash" />
                  </div>
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-rose-600 to-amber-600 text-white px-2 py-0.5 rounded-full text-[8px] sm:text-[9px] font-black uppercase shadow-lg border border-yellow-300 flex items-center gap-1 z-30 animate-cut-badge">
                    <Scissors className="w-2.5 h-2.5" />
                    <span>COUPÉ !</span>
                  </div>
                </>
              )}

              {/* Winner Tag */}
              {isWinner && !isCutCard && (
                <div className="absolute top-1 right-1 bg-amber-400 text-slate-950 px-1.5 py-0.5 rounded-md text-[8px] sm:text-[9px] font-black uppercase shadow-md flex items-center gap-0.5 whitespace-nowrap z-20 animate-lead-badge">
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>Maître</span>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>



      {/* REVELATION PRE-VICTOIRE DE LA MAIN GAGNANTE (Trois 7 ou Moins de 21) */}
      <AnimatePresence>
        {instantWinReveal && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 18, stiffness: 260 }}
            className={`absolute inset-0 z-40 backdrop-blur-md flex flex-col items-center justify-between p-2.5 sm:p-3.5 border-2 text-center shadow-2xl ${
              instantWinReveal.winType === 'UNDER_21'
                ? 'bg-emerald-950/95 border-emerald-400 shadow-emerald-500/30'
                : 'bg-amber-950/95 border-yellow-400 shadow-yellow-500/30'
            }`}
          >
            {/* Header info */}
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-1.5">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shadow font-bold ${
                  instantWinReveal.winType === 'UNDER_21' ? 'bg-emerald-400 text-slate-950' : 'bg-yellow-400 text-slate-950'
                }`}>
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <span className={`text-xs sm:text-sm font-black uppercase tracking-wide ${
                  instantWinReveal.winType === 'UNDER_21' ? 'text-emerald-300' : 'text-yellow-300'
                }`}>
                  {instantWinReveal.winType === 'UNDER_21' ? '🎯 RÈGLE : MOINS DE 21 (Somme ≤ 21)' : '🃏 RÈGLE : TROIS SEPTS (777)'}
                </span>
              </div>

              <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-950/80 border border-slate-700 text-[11px] font-bold text-amber-300">
                <Crown className="w-3 h-3 text-amber-400" />
                <span>{instantWinReveal.winnerName}</span>
              </div>
            </div>

            {/* Visual Display of the 5 winning cards */}
            <div className="flex items-center justify-center gap-1.5 sm:gap-2.5 my-1">
              {(instantWinReveal?.hand || []).map((card, idx) => {
                const sInfo = SUITS_INFO[card.suit];
                const isHighlightCard =
                  instantWinReveal.winType === 'THREE_SEVENS' ? card.value === 7 : true;

                return (
                  <motion.div
                    key={card.id || idx}
                    initial={{ y: 20, opacity: 0, scale: 0.8 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.08, type: 'spring', damping: 15 }}
                    className={`w-10 sm:w-13 h-14 sm:h-18 rounded-lg bg-white text-slate-950 p-1 flex flex-col justify-between shadow-lg select-none ${
                      isHighlightCard
                        ? 'border-2 border-amber-400 ring-2 ring-amber-300 ring-offset-1 ring-offset-slate-950 shadow-amber-400/50 scale-105'
                        : 'border border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between leading-none">
                      <span className={`text-[10px] sm:text-xs font-black ${sInfo.color}`}>
                        {card.value}
                      </span>
                      <span className={`text-[8px] sm:text-[10px] ${sInfo.color}`}>{sInfo.symbol}</span>
                    </div>

                    <div className={`self-center text-sm sm:text-lg leading-none ${sInfo.color}`}>
                      {sInfo.symbol}
                    </div>

                    <div className="flex items-center justify-end leading-none">
                      <span className={`text-[9px] sm:text-[11px] font-black ${sInfo.color}`}>
                        {card.value}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Bottom summary explanation */}
            <div className="text-[10px] sm:text-xs font-semibold text-slate-200 bg-slate-950/80 px-3 py-1 rounded-full border border-slate-700">
              {instantWinReveal.winType === 'UNDER_21' ? (
                <span>Total de la main = <b className="text-emerald-300">{instantWinReveal.scoreOrCount} pts</b> (≤ 21) · Victoire automatique !</span>
              ) : (
                <span>Contient <b className="text-yellow-300">3x cartes Sept (7)</b> · Victoire automatique !</span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Instant Win Animations (MOINS DE 21 & TROIS SEPTS) */}
      <AnimatePresence>
        {partieWinType === 'UNDER_21' && !instantWinReveal && (
          <motion.div
            initial={{ scale: 0.3, opacity: 0, rotate: -6 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', damping: 14, stiffness: 220 }}
            className="absolute inset-0 z-30 bg-emerald-950/95 backdrop-blur-sm flex flex-col items-center justify-center p-3 border-2 border-emerald-400 text-center"
          >
            <motion.div
              animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.15, 1] }}
              transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
              className="w-11 h-11 rounded-full bg-emerald-400 text-slate-950 flex items-center justify-center mb-1.5 shadow-xl shadow-emerald-500/50"
            >
              <Sparkles className="w-6 h-6" />
            </motion.div>
            <div className="text-xl sm:text-2xl font-black tracking-wider text-emerald-300 drop-shadow-[0_2px_10px_rgba(16,185,129,0.8)] uppercase">
              MOINS DE 21 !
            </div>
            
            {winnerName && (
              <div className="mt-1 flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-950/90 border border-emerald-400/80 shadow-md">
                <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="text-xs sm:text-sm font-black text-amber-300">
                  Gagnant : {winnerName}
                </span>
              </div>
            )}

            <div className="text-[11px] sm:text-xs font-semibold text-emerald-100 mt-1">
              Somme des 5 cartes ≤ 21 · Victoire Instantanée !
            </div>
          </motion.div>
        )}

        {partieWinType === 'THREE_SEVENS' && !instantWinReveal && (
          <motion.div
            initial={{ scale: 0.3, opacity: 0, rotate: -6 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', damping: 14, stiffness: 220 }}
            className="absolute inset-0 z-30 bg-amber-950/95 backdrop-blur-sm flex flex-col items-center justify-center p-3 border-2 border-yellow-400 text-center"
          >
            <motion.div
              animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.15, 1] }}
              transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
              className="w-11 h-11 rounded-full bg-yellow-400 text-slate-950 flex items-center justify-center mb-1.5 shadow-xl shadow-yellow-500/50"
            >
              <Sparkles className="w-6 h-6" />
            </motion.div>
            <div className="text-xl sm:text-2xl font-black tracking-wider text-yellow-300 drop-shadow-[0_2px_10px_rgba(234,179,8,0.8)] uppercase">
              TROIS 7 !
            </div>
            
            {winnerName && (
              <div className="mt-1 flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-950/90 border border-yellow-400/80 shadow-md">
                <Crown className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                <span className="text-xs sm:text-sm font-black text-yellow-300">
                  Gagnant : {winnerName}
                </span>
              </div>
            )}

            <div className="text-[11px] sm:text-xs font-semibold text-yellow-100 mt-1">
              Trois "7" dans la main · Victoire Instantanée !
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
