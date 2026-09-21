import React from 'react';
import { AI_STRATEGIES_INFO, EmoteMessage, Player } from '../types';
import { Bot, Crown, Loader2, Sparkles, Skull, Ban, WifiOff, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface OpponentAreaProps {
  opponents: Player[];
  currentTurnIndex: number;
  players: Player[];
  isThinkingAI: boolean;
  dealerIndex: number;
  leadIndex: number;
  showBotPersonalityIcons?: boolean;
  activeEmotes?: EmoteMessage[];
}

export const OpponentArea: React.FC<OpponentAreaProps> = ({
  opponents = [],
  currentTurnIndex,
  players = [],
  isThinkingAI,
  dealerIndex,
  leadIndex,
  showBotPersonalityIcons = true,
  activeEmotes = [],
}) => {
  const safeOpponents = Array.isArray(opponents) ? opponents : [];
  const safePlayers = Array.isArray(players) ? players : [];

  return (
    <div
      id="opponents-zone"
      className="w-full max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-3 px-3 py-2"
    >
      {safeOpponents.map((opponent) => {
        const playerIndex = safePlayers.findIndex((p) => p.id === opponent.id);
        const isCurrentTurn = currentTurnIndex === playerIndex;
        const isDealer = playerIndex === dealerIndex;
        const isLead = playerIndex === leadIndex;
        const isFolded = Boolean(opponent.isFoldedInRound);
        const isForfeit = Boolean(opponent.isForfeit);
        const isDisconnected = opponent.isHuman && opponent.connected === false;
        const isEliminated = opponent.isEliminated;
        const cardCount = opponent?.hand?.length || 0;
        const activeStratKey = opponent.aiStrategy || opponent.basePersonality;
        const stratInfo = showBotPersonalityIcons && !opponent.isHuman && activeStratKey
          ? AI_STRATEGIES_INFO[activeStratKey]
          : null;

        const opponentEmote = activeEmotes.find(
          (e) => e.playerId === opponent.id && Date.now() - e.timestamp < 3500
        );

        return (
          <div
            key={opponent.id}
            id={`opponent-card-${opponent.id}`}
            className={`relative flex flex-col items-center justify-between p-3.5 rounded-xl border transition-all duration-300 ${
              isForfeit || isFolded
                ? 'bg-rose-950/25 border-rose-800/50 text-slate-400 opacity-80'
                : isEliminated
                ? 'bg-rose-950/20 border-rose-900/40 text-slate-500 opacity-60'
                : isCurrentTurn
                ? 'bg-slate-800/90 border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.15)] ring-1 ring-amber-400/50'
                : 'bg-slate-900/80 border-slate-800 text-slate-300'
            }`}
          >
            {/* Top row: Name, Avatar, Status badges */}
            <div className="flex items-center justify-between w-full mb-2.5">
              <div className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold relative ${
                    isForfeit
                      ? 'bg-rose-950 border border-rose-700 text-rose-300'
                      : isEliminated
                      ? 'bg-rose-950 border border-rose-800 text-rose-400'
                      : isCurrentTurn
                      ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                      : 'bg-slate-800 text-slate-300 border border-slate-700'
                  }`}
                >
                  {isForfeit ? (
                    <Ban className="w-4 h-4" />
                  ) : isEliminated ? (
                    <Skull className="w-4 h-4" />
                  ) : opponent.isHuman ? (
                    <User className="w-4 h-4" />
                  ) : (
                    <Bot className="w-4 h-4" />
                  )}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-bold text-slate-100 truncate">
                      {opponent.name}
                    </span>
                    {isDealer && (
                      <span
                        title="Donneur de la partie"
                        className="shrink-0 inline-flex items-center text-[10px] font-semibold text-amber-400 px-1 rounded bg-amber-400/10 border border-amber-400/30"
                      >
                        <Crown className="w-2.5 h-2.5 mr-0.5 inline" /> D
                      </span>
                    )}
                    {isLead && (
                      <span
                        title="Entameur du tour"
                        className="shrink-0 inline-flex items-center text-[10px] font-semibold text-emerald-400 px-1 rounded bg-emerald-400/10 border border-emerald-400/30"
                      >
                        E
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      key={opponent.tricksWonInRound}
                      className={`text-[10px] text-slate-400 font-medium inline-block ${
                        opponent.tricksWonInRound > 0 ? 'animate-trick-pop' : ''
                      }`}
                    >
                      {opponent.tricksWonInRound} tour(s)
                    </span>
                    {stratInfo && !isEliminated && !isForfeit && (
                      <span
                        title={`Style de jeu : ${stratInfo.name} - ${stratInfo.description}`}
                        className={`text-[9px] px-1.5 py-0.2 rounded border flex items-center gap-0.5 ${stratInfo.badgeBg}`}
                      >
                        <span>{stratInfo.icon}</span>
                        <span className="font-semibold">{stratInfo.name}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Status / Active turn badge */}
              {isForfeit ? (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-950/80 text-rose-300 border border-rose-700/60 text-[10px] font-bold">
                  <Ban className="w-3 h-3" />
                  <span>Forfait</span>
                </div>
              ) : isFolded ? (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-950/80 text-rose-300 border border-rose-700/60 text-[10px] font-bold">
                  <span>A passé</span>
                </div>
              ) : isDisconnected || opponent.isAiRelay ? (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-950/90 text-amber-300 border border-amber-500/60 text-[10px] font-bold animate-pulse">
                  {opponent.isAiRelay ? <Bot className="w-3 h-3 text-cyan-400" /> : <WifiOff className="w-3 h-3" />}
                  <span>{opponent.isAiRelay ? '🤖 Relais IA' : 'Hors-ligne'}</span>
                </div>
              ) : isEliminated ? (
                <div className="px-2 py-0.5 rounded-full bg-rose-950/60 text-rose-400 border border-rose-800/40 text-[10px] font-bold">
                  Éliminé
                </div>
              ) : isCurrentTurn ? (
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/40 text-[11px] font-semibold">
                  {isThinkingAI ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                      <span>Réfléchit...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      <span>Son tour</span>
                    </>
                  )}
                </div>
              ) : (
                <div className="text-[11px] font-medium text-slate-400">
                  {cardCount} {cardCount > 1 ? 'cartes' : 'carte'}
                </div>
              )}
            </div>

            {/* Opponent's face-down cards display with overlapping stack */}
            <div className="flex items-center justify-center -space-x-4 sm:-space-x-5 h-16 w-full py-1">
              {isForfeit ? (
                <div className="text-xs text-rose-400/90 font-semibold italic flex items-center gap-1">
                  <Ban className="w-3.5 h-3.5" /> Forfait pour cette partie
                </div>
              ) : isFolded ? (
                <div className="text-xs text-rose-400/90 font-semibold italic flex items-center gap-1">
                  A passé cette donne
                </div>
              ) : isEliminated ? (
                <div className="text-xs text-rose-500/80 font-bold italic flex items-center gap-1">
                  <Skull className="w-3.5 h-3.5" /> K.O.
                </div>
              ) : cardCount === 0 ? (
                <div className="text-xs text-slate-500 italic">Plus de cartes</div>
              ) : (
                Array.from({ length: cardCount }).map((_, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.2, delay: idx * 0.04 }}
                    className="w-10 sm:w-11 h-14 sm:h-15 rounded-lg bg-slate-800 border border-slate-700 shadow-md card-back-pattern flex items-center justify-center hover:-translate-y-1 transition-transform"
                    style={{
                      transform: `rotate(${(idx - (cardCount - 1) / 2) * 3}deg)`,
                      zIndex: idx,
                    }}
                  >
                    <div className="w-6 h-9 rounded border border-slate-600/60 bg-slate-700/30 flex items-center justify-center">
                      <span className="text-[8px] font-black text-slate-400 tracking-wider">NK</span>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
