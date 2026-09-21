import React from 'react';
import { Card, PlayedCard, Player, Suit, SUITS_INFO } from '../types';
import { Crown, Sparkles, Coins, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface TrickAreaProps {
  plays: PlayedCard[];
  leadSuit: Suit | null;
  players: Player[];
  trickNumber: number;
  winnerPlay: PlayedCard | null;
  isResolvingTrick: boolean;
  remainingDeckCount: number;
  pot: number;
}

export const TrickArea: React.FC<TrickAreaProps> = ({
  plays = [],
  leadSuit,
  players = [],
  trickNumber,
  winnerPlay,
  isResolvingTrick,
  remainingDeckCount,
  pot,
}) => {
  const safePlays = Array.isArray(plays) ? plays : [];
  return (
    <div
      id="trick-table-arena"
      className="relative w-full max-w-5xl mx-auto my-2 px-3 flex-1 flex flex-col items-center justify-center min-h-[260px] sm:min-h-[300px]"
    >
      {/* Elegant Dark Arena background container */}
      <div className="absolute inset-0 rounded-3xl dark-table-arena border-2 border-slate-800 shadow-2xl shadow-black/80 overflow-hidden">
        {/* Subtle decorative inner border */}
        <div className="absolute inset-3 rounded-2xl border border-slate-700/40 pointer-events-none" />
        
        {/* Center watermark */}
        <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none select-none">
          <div className="text-8xl font-black tracking-widest text-slate-100 font-mono">
            NJAMBO
          </div>
        </div>

        {/* Small corner deck indicator */}
        <div className="absolute top-3.5 left-4 flex items-center gap-2 text-slate-400 text-xs">
          <div className="w-5 h-7 rounded bg-slate-800 border border-slate-700 card-back-pattern shadow-sm" />
          <span className="font-medium">{remainingDeckCount} cartes écartées</span>
        </div>

        {/* Center Pot Stack */}
        <div className="absolute top-3.5 right-4 flex items-center gap-1.5 px-3 py-1 bg-slate-900/90 border border-slate-700 rounded-full text-slate-300 text-xs font-semibold backdrop-blur-sm shadow-md">
          <Coins className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-slate-400">Pot :</span>
          <span className="text-amber-400 font-bold">{pot} jetons</span>
        </div>
      </div>

      {/* Center played cards area */}
      <div className="relative z-10 w-full flex flex-col items-center justify-center py-4">
        {/* Resolution notification banner */}
        <AnimatePresence>
          {isResolvingTrick && winnerPlay && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: -10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="absolute -top-1 px-5 py-1.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-black text-xs sm:text-sm shadow-xl flex items-center gap-1.5 z-30"
            >
              <Crown className="w-4 h-4" />
              <span>{winnerPlay.playerName} remporte le tour {trickNumber} !</span>
            </motion.div>
          )}
        </AnimatePresence>

        {safePlays.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-slate-400 py-8 text-center px-4">
            <div className="w-12 h-12 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center mb-2.5 shadow-inner">
              <Sparkles className="w-6 h-6 text-amber-400 animate-pulse" />
            </div>
            <p className="text-sm font-semibold text-slate-200">
              Table prête pour le tour {trickNumber}/5
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              L'entameur va poser la première carte qui définira la couleur demandée.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 py-2">
            {safePlays.map((play, idx) => {
              const suitInfo = SUITS_INFO[play.card.suit];
              const isWinner = winnerPlay && winnerPlay.playerIndex === play.playerIndex;
              const isDiscard = !play.isMatchingSuit;

              return (
                <motion.div
                  key={`${play.playerIndex}-${play.card.id}`}
                  initial={{ y: 25, opacity: 0, scale: 0.9 }}
                  animate={{ y: 0, opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', damping: 15, stiffness: 250 }}
                  id={`played-card-${play.playerIndex}`}
                  className="flex flex-col items-center"
                >
                  {/* Player Name Pill */}
                  <div className="mb-1.5 px-3 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-slate-200 text-[11px] font-bold shadow-md flex items-center gap-1">
                    <span>{play.playerName}</span>
                    {isWinner && <Crown className="w-3 h-3 text-amber-400" />}
                  </div>

                  {/* Card Physical Tile */}
                  <div
                    className={`relative w-22 sm:w-26 h-32 sm:h-38 rounded-xl bg-white text-slate-900 border-2 p-2.5 sm:p-3 flex flex-col justify-between shadow-2xl transition-all ${
                      isWinner
                        ? 'border-amber-400 ring-4 ring-amber-400/50 scale-105 shadow-amber-400/30'
                        : isDiscard
                        ? 'border-slate-300 opacity-80'
                        : 'border-slate-300'
                    }`}
                  >
                    {/* Top corner: Value + Suit */}
                    <div className="flex flex-col items-start leading-none">
                      <span className={`text-base sm:text-xl font-black ${suitInfo.color}`}>
                        {play.card.value}
                      </span>
                      <span className={`text-xs sm:text-sm font-bold ${suitInfo.color}`}>
                        {suitInfo.symbol}
                      </span>
                    </div>

                    {/* Center big symbol */}
                    <div className={`self-center text-3xl sm:text-4xl select-none ${suitInfo.color}`}>
                      {suitInfo.symbol}
                    </div>

                    {/* Bottom corner rotated */}
                    <div className="flex flex-col items-end leading-none rotate-180">
                      <span className={`text-base sm:text-xl font-black ${suitInfo.color}`}>
                        {play.card.value}
                      </span>
                      <span className={`text-xs sm:text-sm font-bold ${suitInfo.color}`}>
                        {suitInfo.symbol}
                      </span>
                    </div>

                    {/* Pas la carte / Non-winning tag on the card */}
                    {isDiscard && (
                      <div className="absolute inset-0 bg-slate-900/30 rounded-xl flex items-center justify-center p-1 backdrop-blur-[0.5px]">
                        <span className="bg-rose-950/95 text-rose-200 border border-rose-600 text-[10px] font-bold px-2 py-0.5 rounded shadow-sm text-center leading-tight">
                          Pas la carte
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Status label under card */}
                  <div className="mt-1.5">
                    {play.isLeadCard ? (
                      <span className="text-[10px] font-semibold text-slate-200 bg-slate-800 px-2 py-0.5 rounded border border-slate-700 shadow-sm">
                        Entame ({suitInfo.name})
                      </span>
                    ) : play.isWinningSoFar ? (
                      <span className="text-[10px] font-bold text-amber-300 bg-slate-800 px-2 py-0.5 rounded border border-amber-500/50 flex items-center gap-1 shadow-sm">
                        <Crown className="w-2.5 h-2.5 text-amber-400" /> Mène
                      </span>
                    ) : isDiscard ? (
                      <span className="text-[10px] font-medium text-rose-300 bg-rose-950/70 border border-rose-900/60 px-2 py-0.5 rounded">
                        Non gagnante
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium text-slate-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                        A suivi ({play.card.value})
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
