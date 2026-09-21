import React from 'react';
import { Player, PlayedCard, Suit, SUITS_INFO } from '../types';
import { Bot, User, Sparkles, AlertCircle, ChevronUp, Scissors } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface GameDiamondTableProps {
  players: Player[]; // [0: Human (South), 1: Oumar (West), 2: Fatou (North), 3: Amadou (East)]
  currentTurnIndex: number;
  isThinkingAI?: boolean;
  aiThinkingPlayerName?: string | null;
  dealerIndex: number;
  leadIndex: number;
  currentTrick?: any;
  plays?: PlayedCard[];
  leadSuit?: Suit | null;
  currentTrickNumber?: number;
  winnerPlay?: PlayedCard | null;
  enableDoubleKora?: boolean;
  doubleKoraAchievedByPlayer?: Record<string, boolean>;
  consecutiveThreesCountByPlayer?: Record<string, number>;
  partieWinType?: any;
  winnerName?: string | null;
  isDealing?: boolean;
  instantWinReveal?: any;
}

export const GameDiamondTable: React.FC<GameDiamondTableProps> = ({
  players = [],
  currentTurnIndex,
  isThinkingAI = false,
  aiThinkingPlayerName,
  dealerIndex,
  leadIndex,
  currentTrick,
  plays: propPlays,
  leadSuit: propLeadSuit,
  currentTrickNumber: propCurrentTrickNumber,
  winnerPlay,
}) => {
  const playsList = propPlays || currentTrick?.plays || [];
  const leadSuit = propLeadSuit !== undefined ? propLeadSuit : (currentTrick?.leadSuit || null);
  const currentTrickNumber = propCurrentTrickNumber ?? (currentTrick?.trickNumber ?? 1);
  const leadSuitInfo = leadSuit ? SUITS_INFO[leadSuit as Suit] : null;

  // Map players to diamond positions
  const northPlayer = players[2]; // IA Fatou
  const westPlayer = players[1];  // IA Oumar
  const eastPlayer = players[3];  // IA Amadou

  // Find played cards for each player
  const getPlayForPlayer = (playerId?: string) => {
    if (!playerId || !Array.isArray(playsList)) return undefined;
    return playsList.find((p) => p.playerId === playerId);
  };

  const renderPlayerBadge = (
    player: Player,
    playerIndex: number,
    position: 'top' | 'left' | 'right'
  ) => {
    if (!player) return null;
    const isCurrentTurn = currentTurnIndex === playerIndex;
    const isDealer = playerIndex === dealerIndex;
    const isLead = playerIndex === leadIndex;
    const isThinking = isCurrentTurn && isThinkingAI;
    const isFolded = Boolean(player.isFoldedInRound || player.isForfeit);

    return (
      <div
        id={`player-badge-${player.id}`}
        className={`flex items-center gap-2 p-1.5 sm:p-2 rounded-xl border transition-all duration-200 ${
          isFolded
            ? 'bg-rose-950/40 border-rose-800/50 opacity-75'
            : isCurrentTurn
            ? 'bg-amber-950/80 border-amber-400 ring-2 ring-amber-400/50 shadow-lg shadow-amber-500/20'
            : 'bg-slate-900/90 border-slate-800'
        } ${position === 'left' ? 'flex-row' : position === 'right' ? 'flex-row-reverse text-right' : 'flex-row'}`}
      >
        {/* Avatar with Turn Ring */}
        <div className="relative">
          <div
            className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold text-xs ${
              isFolded
                ? 'bg-rose-950 text-rose-300 border border-rose-700'
                : isCurrentTurn
                ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-300 ring-offset-2 ring-offset-slate-900 animate-pulse'
                : 'bg-slate-800 text-slate-300 border border-slate-700'
            }`}
          >
            {player.isHuman ? <User className="w-4 h-4" /> : <User className="w-4 h-4 text-amber-300/80" />}
          </div>
          {isThinking && (
            <span className="absolute -bottom-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
            </span>
          )}
        </div>

        {/* Info label */}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-[11px] sm:text-xs font-bold text-slate-200 truncate max-w-[70px] sm:max-w-[100px]">
              {player.name}
            </span>
            {isDealer && (
              <span className="text-[8px] font-black px-1 py-0.2 bg-amber-500/20 text-amber-300 rounded border border-amber-500/30">
                D
              </span>
            )}
            {isLead && (
              <span className="text-[8px] font-black px-1 py-0.2 bg-blue-500/20 text-blue-300 rounded border border-blue-500/30">
                E
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
            {isFolded ? (
              <span className="font-bold text-rose-400 text-[9px] bg-rose-950/80 px-1 rounded border border-rose-700/50">
                A passé
              </span>
            ) : (
              <>
                {/* Card count mini stack */}
                <span className="font-semibold text-amber-400">
                  {player.hand.length} 🂠
                </span>
                <span>·</span>
                <span
                  key={player.tricksWonInRound}
                  className={player.tricksWonInRound > 0 ? 'animate-trick-pop inline-block' : 'inline-block'}
                >
                  {player.tricksWonInRound} main{player.tricksWonInRound > 1 ? 's' : ''}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderCardSlot = (play: PlayedCard | undefined, label: string, positionClasses: string) => {
    if (!play) {
      return (
        <div
          className={`absolute ${positionClasses} w-16 sm:w-20 h-22 sm:h-28 rounded-lg border-2 border-dashed border-emerald-700/40 bg-emerald-950/20 flex flex-col items-center justify-center pointer-events-none`}
        >
          <span className="text-[10px] uppercase font-bold text-emerald-600/60 tracking-wider">
            {label}
          </span>
        </div>
      );
    }

    const suitInfo = SUITS_INFO[play.card.suit];
    const isWinner = winnerPlay?.card.id === play.card.id;
    const isLeadPlay = playsList[0]?.card.id === play.card.id;
    const isCutCard = !isLeadPlay && leadSuit && play.card.suit !== leadSuit;

    return (
      <motion.div
        key={play.card.id}
        initial={{ scale: 1.15, opacity: 0, y: -16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 20, stiffness: 400, mass: 0.75 }}
        className={`absolute ${positionClasses} w-16 sm:w-20 h-22 sm:h-28 rounded-xl bg-white text-slate-950 p-1.5 sm:p-2 flex flex-col justify-between select-none z-20 overflow-hidden animate-card-slam ${
          isWinner
            ? 'border-2 border-amber-400 ring-2 ring-amber-400 ring-offset-2 ring-offset-emerald-950 shadow-amber-400/40'
            : 'border border-slate-300 shadow-lg'
        }`}
      >
        {/* Value + Symbol Top */}
        <div className="flex flex-col items-start leading-none pointer-events-none">
          <span className={`text-xs sm:text-base font-black ${suitInfo.color}`}>
            {play.card.value}
          </span>
          <span className={`text-[10px] sm:text-xs font-bold ${suitInfo.color}`}>
            {suitInfo.symbol}
          </span>
        </div>

        {/* Center Symbol */}
        <div className={`self-center text-xl sm:text-2xl pointer-events-none ${suitInfo.color}`}>
          {suitInfo.symbol}
        </div>

        {/* Bottom player tag */}
        <div className="flex items-center justify-between pointer-events-none">
          <span className="text-[8px] font-black uppercase text-slate-600 truncate max-w-[50px]">
            {play.playerName.split(' ')[0]}
          </span>
          <span className={`text-[10px] font-black leading-none ${suitInfo.color}`}>
            {play.card.value}
          </span>
        </div>

        {/* Live Golden Lead Flare sweep */}
        {isWinner && (
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-300/45 to-transparent pointer-events-none z-15 animate-lead-flare" />
        )}

        {/* "COUPÉ !" Laser Slash effect */}
        {isCutCard && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none z-20">
            <div className="w-full h-1 bg-gradient-to-r from-transparent via-rose-500 via-amber-300 to-transparent shadow-[0_0_12px_rgba(244,63,94,0.9)] animate-cut-slash" />
          </div>
        )}

        {/* Winner Tag */}
        {isWinner && (
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded-full text-[8px] font-black uppercase shadow-md flex items-center gap-0.5 animate-lead-badge z-20">
            <Sparkles className="w-2.5 h-2.5" />
            <span>Maître</span>
          </div>
        )}
      </motion.div>
    );
  };

  return (
    <div
      id="game-diamond-table"
      className="relative w-full max-w-4xl mx-auto flex-1 flex flex-col items-center justify-between py-1 min-h-[300px] sm:min-h-[380px]"
    >
      {/* NORTH PLAYER (IA Fatou) */}
      <div className="z-10">
        {renderPlayerBadge(northPlayer, 2, 'top')}
      </div>

      {/* MIDDLE ROW (West Player - Center Felt - East Player) */}
      <div className="w-full flex items-center justify-between gap-1 sm:gap-4 my-auto px-1 sm:px-4">
        {/* WEST (IA Oumar) */}
        <div className="z-10 shrink-0">
          {renderPlayerBadge(westPlayer, 1, 'left')}
        </div>

        {/* CENTER FELT (Green Felt with Diamond Card Placements) */}
        <div
          id="felt-mat"
          className="relative flex-1 max-w-[340px] sm:max-w-[420px] aspect-[4/3] rounded-3xl bg-emerald-900 border-4 border-emerald-800/80 shadow-[inset_0_4px_25px_rgba(0,0,0,0.6),0_10px_30px_rgba(0,0,0,0.5)] flex items-center justify-center overflow-hidden mx-1"
        >
          {/* Subtle felt texture accent */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.15)_0%,transparent_70%)] pointer-events-none" />

          {/* Lead Suit Indicator Watermark at Center */}
          <div className="absolute flex flex-col items-center justify-center pointer-events-none opacity-25">
            {leadSuitInfo ? (
              <>
                <span className={`text-4xl sm:text-6xl font-black ${leadSuitInfo.color}`}>
                  {leadSuitInfo.symbol}
                </span>
                <span className="text-[9px] uppercase font-bold tracking-widest text-emerald-200">
                  {leadSuitInfo.name}
                </span>
              </>
            ) : (
              <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-200/50">
                Main {currentTrickNumber}/5
              </span>
            )}
          </div>

          {/* NORTH CARD (IA Fatou) */}
          {renderCardSlot(getPlayForPlayer(northPlayer?.id), 'Fatou', 'top-2 left-1/2 -translate-x-1/2')}

          {/* WEST CARD (IA Oumar) */}
          {renderCardSlot(getPlayForPlayer(westPlayer?.id), 'Oumar', 'left-2 sm:left-4 top-1/2 -translate-y-1/2')}

          {/* EAST CARD (IA Amadou) */}
          {renderCardSlot(getPlayForPlayer(eastPlayer?.id), 'Amadou', 'right-2 sm:right-4 top-1/2 -translate-y-1/2')}

          {/* SOUTH CARD (Human Player) */}
          {renderCardSlot(getPlayForPlayer(players[0]?.id), 'Vous', 'bottom-2 left-1/2 -translate-x-1/2')}
        </div>

        {/* EAST (IA Amadou) */}
        <div className="z-10 shrink-0">
          {renderPlayerBadge(eastPlayer, 3, 'right')}
        </div>
      </div>
    </div>
  );
};
