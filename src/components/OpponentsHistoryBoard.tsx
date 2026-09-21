import React from 'react';
import { Player, Trick, PlayedCard, SUITS_INFO, AI_STRATEGIES_INFO, InstantWinReveal, EmoteMessage } from '../types';
import { Sparkles, User, Skull, Coins, Crown, Globe, Bot, WifiOff, Ban } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface OpponentsHistoryBoardProps {
  opponents?: Player[];
  players: Player[];
  currentTurnIndex: number;
  isThinkingAI?: boolean;
  dealerIndex: number;
  leadIndex: number;
  baseBet?: number;
  currentTrickPlays?: PlayedCard[];
  trickHistory?: Trick[];
  instantWinReveal?: InstantWinReveal | null;
  isDealing?: boolean;
  cardsDealtCountByPlayer?: Record<number, number>;
  localPlayerId?: string | null;
  isMultiplayer?: boolean;
  showBotPersonalityIcons?: boolean;
  activeEmotes?: EmoteMessage[];
  turnRemainingSeconds?: number | null;
}

export const OpponentsHistoryBoard: React.FC<OpponentsHistoryBoardProps> = ({
  opponents,
  players,
  currentTurnIndex,
  isThinkingAI = false,
  dealerIndex,
  leadIndex,
  baseBet = 10,
  currentTrickPlays = [],
  trickHistory = [],
  instantWinReveal = null,
  isDealing = false,
  cardsDealtCountByPlayer,
  localPlayerId = null,
  isMultiplayer = false,
  showBotPersonalityIcons = true,
  activeEmotes = [],
  turnRemainingSeconds = null,
}) => {
  // Always display all players in order
  const allPlayers = players && players.length > 0 ? players : opponents || [];

  return (
    <div
      id="opponents-history-board"
      className="w-full bg-slate-900/95 border border-slate-800 rounded-2xl p-2 sm:p-2.5 shadow-lg flex flex-col gap-1.5 shrink-0"
    >
      {isDealing && (
        <div className="w-full bg-gradient-to-r from-amber-950/80 via-amber-900/90 to-amber-950/80 border border-amber-500/50 rounded-xl px-3 py-1.5 flex items-center justify-between text-amber-200 text-xs font-bold shadow-md animate-pulse">
          <div className="flex items-center gap-2">
            <span className="text-base">🂠</span>
            <span>Distribution (3+2) en cours...</span>
          </div>
          <div className="text-[10px] sm:text-xs text-amber-300 font-mono bg-amber-950/90 px-2 py-0.5 rounded border border-amber-500/40">
            {Object.values(cardsDealtCountByPlayer || {}).some((c: number) => c > 3) ? '2ème Passe (+2 cartes)' : '1ère Passe (3 cartes)'}
          </div>
        </div>
      )}
      {allPlayers.map((player, playerIndex) => {
        const isLocalPlayer = isMultiplayer
          ? localPlayerId
            ? player.id === localPlayerId
            : playerIndex === 0
          : player.isHuman || playerIndex === 0;

        const isOnlineRemoteHuman = isMultiplayer && !isLocalPlayer && player.isHuman;
        const isCurrentTurn = currentTurnIndex === playerIndex;
        const isDealer = playerIndex === dealerIndex;
        const isLead = playerIndex === leadIndex;
        const isThinking = isCurrentTurn && isThinkingAI && !isLocalPlayer && !isOnlineRemoteHuman;
        const isEliminated = player.isEliminated;
        const isInstantWinner = instantWinReveal !== null && instantWinReveal.winnerIndex === playerIndex;

        // Helper to match played card to current player by ID, index, or name
        const isPlayForPlayer = (p: PlayedCard) => {
          if (!p) return false;
          if (p.playerId && player.id && p.playerId === player.id) return true;
          if (p.playerIndex === playerIndex) return true;
          if (p.playerName && player.name) {
            const pName = p.playerName.trim().toLowerCase();
            const plName = player.name.trim().toLowerCase();
            if (pName === plName) return true;
            if (pName.split(' ')[0] === plName.split(' ')[0]) return true;
          }
          return false;
        };

        // 1. Gather all played cards from completed tricks in this round (max 5 tricks)
        const completedPlays: Array<{
          card: PlayedCard['card'];
          wasWinner: boolean;
          label: string;
          isCurrent: boolean;
        }> = [];

        (trickHistory || []).forEach((trick, tIdx) => {
          if (tIdx < 5) {
            const foundPlay = (trick?.plays || []).find(isPlayForPlayer);
            if (foundPlay) {
              const wasWinner =
                trick.winnerIndex === playerIndex ||
                (trick.winnerName &&
                  player.name &&
                  trick.winnerName.trim().toLowerCase().split(' ')[0] ===
                    player.name.trim().toLowerCase().split(' ')[0]);
              completedPlays.push({
                card: foundPlay.card,
                wasWinner,
                label: `Main ${tIdx + 1}`,
                isCurrent: false,
              });
            }
          }
        });

        // 2. Check if this player has already placed a card in the ongoing trick
        // Deduplicate against already added tricks/cards to avoid double-counting during trick transitions
        const ongoingPlay = (currentTrickPlays || []).find(isPlayForPlayer);
        if (ongoingPlay && ongoingPlay.card && completedPlays.length < 5) {
          const alreadyAdded = completedPlays.some(
            (item) =>
              item.card &&
              ((item.card.id && ongoingPlay.card.id && item.card.id === ongoingPlay.card.id) ||
                (item.card.suit === ongoingPlay.card.suit && item.card.value === ongoingPlay.card.value))
          );

          if (!alreadyAdded) {
            completedPlays.push({
              card: ongoingPlay.card,
              wasWinner: ongoingPlay.isWinningSoFar || false,
              label: `Main ${completedPlays.length + 1}`,
              isCurrent: true,
            });
          }
        }

        // 3. Ensure the total cards shown (played + face-down remaining in hand) never exceeds exactly 5
        const actualHandCount = player.hand?.length || 0;
        const remainingCardsInHand = Math.max(0, Math.min(actualHandCount, 5 - completedPlays.length));
        const totalSlots = 5;
        const activeStratKey = player.aiStrategy || player.basePersonality;
        const stratInfo = showBotPersonalityIcons && !player.isHuman && activeStratKey ? AI_STRATEGIES_INFO[activeStratKey] : null;

        // Calculate IA number index for non-humans (1, 2, 3)
        const iaIndexNumber = !isLocalPlayer && !isOnlineRemoteHuman ? playerIndex : null;

        const isDisconnected = isOnlineRemoteHuman && player.connected === false && !player.isForfeit;
        const isForfeit = !!player.isForfeit;
        const isFolded = !!player.isFoldedInRound;
        const graceExpiresAt = player.disconnectGraceExpiresAt;
        const graceSecondsLeft = graceExpiresAt ? Math.max(0, Math.ceil((graceExpiresAt - Date.now()) / 1000)) : 0;

        return (
          <div
            key={player.id || `player-${playerIndex}`}
            id={`player-row-${player.id}`}
            className={`relative flex items-center justify-between gap-2 px-2 py-1.5 rounded-xl transition-all duration-300 ${
              isForfeit || isFolded
                ? 'bg-rose-950/40 border border-rose-900/60 opacity-60 grayscale'
                : isEliminated
                ? 'bg-rose-950/20 border border-rose-900/40 opacity-60 grayscale'
                : isDisconnected
                ? 'bg-amber-950/30 border border-amber-500/40'
                : isInstantWinner
                ? instantWinReveal?.winType === 'UNDER_21'
                  ? 'bg-emerald-950/80 border-2 border-emerald-400 ring-2 ring-emerald-400/60 shadow-lg shadow-emerald-500/30'
                  : 'bg-amber-950/80 border-2 border-yellow-400 ring-2 ring-yellow-400/60 shadow-lg shadow-yellow-500/30'
                : isCurrentTurn
                ? 'bg-amber-950/40 border border-amber-500/60 ring-1 ring-amber-400/40'
                : isLocalPlayer
                ? 'bg-slate-900/80 border border-emerald-500/30'
                : isOnlineRemoteHuman
                ? 'bg-indigo-950/40 border border-indigo-500/30'
                : 'bg-slate-950/50 border border-slate-800/80'
            }`}
          >
            {/* Left: Avatar Badge + Name + Capital + Tricks count + Strategy */}
            <div className="flex items-center gap-2 shrink-0 min-w-[110px] sm:min-w-[165px]">
              <div className="relative">
                <div
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-black shadow ${
                    isForfeit || isFolded
                      ? 'bg-rose-950 text-rose-300 border border-rose-600'
                      : isEliminated
                      ? 'bg-rose-900 text-rose-200 border border-rose-700'
                      : isDisconnected
                      ? 'bg-amber-900 text-amber-200 border border-amber-600 animate-pulse'
                      : isInstantWinner
                      ? instantWinReveal?.winType === 'UNDER_21'
                        ? 'bg-emerald-400 text-slate-950 ring-2 ring-emerald-300'
                        : 'bg-yellow-400 text-slate-950 ring-2 ring-yellow-300'
                      : isCurrentTurn
                      ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-300 ring-offset-1 ring-offset-slate-900 animate-pulse'
                      : isLocalPlayer
                      ? 'bg-emerald-600 text-slate-100 border border-emerald-400/50'
                      : isOnlineRemoteHuman
                      ? 'bg-indigo-600 text-indigo-100 border border-indigo-400/50'
                      : 'bg-slate-800 text-slate-200 border border-slate-700'
                  }`}
                >
                  {isForfeit || isFolded ? (
                    <Ban className="w-3.5 h-3.5 text-rose-400" />
                  ) : isEliminated ? (
                    <Skull className="w-3.5 h-3.5 text-rose-300" />
                  ) : isDisconnected ? (
                    <WifiOff className="w-3.5 h-3.5 text-amber-300" />
                  ) : isInstantWinner ? (
                    <Crown className="w-4 h-4 text-slate-950" />
                  ) : isLocalPlayer ? (
                    <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-100" />
                  ) : isOnlineRemoteHuman ? (
                    <Globe className="w-3.5 h-3.5 text-indigo-200" />
                  ) : (
                    <span>{iaIndexNumber}</span>
                  )}
                </div>
                {isThinking && !isEliminated && !isForfeit && !isDisconnected && (
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                  </span>
                )}
              </div>

              <div className="flex flex-col leading-tight">
                <div className="flex items-center gap-1">
                  <span
                    className={`text-xs font-bold truncate max-w-[65px] sm:max-w-[95px] ${
                      isForfeit
                        ? 'text-rose-400 line-through'
                        : isEliminated
                        ? 'text-rose-400 line-through'
                        : isInstantWinner
                        ? 'text-yellow-300 font-black'
                        : isLocalPlayer
                        ? 'text-emerald-300 font-extrabold'
                        : isOnlineRemoteHuman
                        ? 'text-indigo-300 font-bold'
                        : 'text-slate-100'
                    }`}
                    title={player.name}
                  >
                    {isLocalPlayer
                      ? player.name.includes('Vous')
                        ? 'Vous'
                        : player.name
                      : isOnlineRemoteHuman
                      ? player.name
                      : player.name.replace(/^Joueur\s+/i, '')}
                  </span>
                  {isInstantWinner && (
                    <span
                      className={`text-[8px] font-black px-1.5 py-0.2 rounded shadow uppercase animate-pulse ${
                        instantWinReveal?.winType === 'UNDER_21'
                          ? 'bg-emerald-400 text-slate-950'
                          : 'bg-yellow-400 text-slate-950'
                      }`}
                    >
                      {instantWinReveal?.winType === 'UNDER_21' ? '≤ 21 pts' : '3x 7'}
                    </span>
                  )}
                  {!isEliminated && !isForfeit && isDealer && (
                    <span className="text-[8px] font-black px-1 py-0.2 bg-amber-500/20 text-amber-300 rounded border border-amber-500/30">
                      D
                    </span>
                  )}
                  {!isEliminated && !isForfeit && isLead && (
                    <span className="text-[8px] font-black px-1 py-0.2 bg-blue-500/20 text-blue-300 rounded border border-blue-500/30">
                      E
                    </span>
                  )}
                  {isOnlineRemoteHuman && !isEliminated && !isForfeit && !isDisconnected && (
                    <span className="text-[8px] font-bold px-1 py-0.2 bg-indigo-500/20 text-indigo-300 rounded border border-indigo-500/30 hidden xs:inline">
                      En ligne
                    </span>
                  )}
                  {isDisconnected && (
                    <span
                      className="text-[8px] font-bold px-1.5 py-0.2 bg-amber-500/20 text-amber-300 rounded border border-amber-500/40 animate-pulse flex items-center gap-0.5"
                      title="Micro-coupure : Reconnexion en attente"
                    >
                      <WifiOff className="w-2.5 h-2.5" />
                      <span>{graceSecondsLeft > 0 ? `${graceSecondsLeft}s` : 'Déco'}</span>
                      {player.consecutiveMissedTurns === 1 && (
                        <span className="text-[7px] text-amber-400 font-mono">(1/2)</span>
                      )}
                    </span>
                  )}
                  {isForfeit ? (
                    <span
                      className="text-[8px] font-extrabold px-1.5 py-0.2 bg-rose-500/30 text-rose-300 rounded border border-rose-500/50 flex items-center gap-0.5"
                      title="Partie perdue par forfait"
                    >
                      <Ban className="w-2.5 h-2.5" />
                      <span>Forfait</span>
                    </span>
                  ) : isFolded ? (
                    <span
                      className="text-[8px] font-extrabold px-1.5 py-0.2 bg-rose-500/30 text-rose-300 rounded border border-rose-500/50 flex items-center gap-0.5"
                      title="A passé cette donne"
                    >
                      <span>A passé</span>
                    </span>
                  ) : null}
                  {isCurrentTurn && !instantWinReveal && !isEliminated && !isForfeit && turnRemainingSeconds !== undefined && turnRemainingSeconds !== null && (
                    <span
                      className={`text-[8px] font-mono font-black px-1.5 py-0.2 rounded border transition-colors flex items-center gap-0.5 ${
                        isDisconnected
                          ? 'bg-amber-950 text-amber-300 border-amber-400 animate-pulse'
                          : turnRemainingSeconds <= 5
                          ? 'bg-rose-500/30 text-rose-300 border-rose-500/50 animate-pulse'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      }`}
                      title={isDisconnected ? "Délai avant coup automatique du bot d'urgence" : "Temps restant pour jouer"}
                    >
                      <span>⏳</span>
                      <span>{turnRemainingSeconds}s</span>
                      {isDisconnected && <span className="text-[7px] text-amber-300 font-bold uppercase">(Bot)</span>}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                  <span className="flex items-center gap-0.5 font-mono font-bold text-amber-400">
                    <Coins className="w-2.5 h-2.5" />
                    <span>{player.capital}</span>
                  </span>
                  {isForfeit ? (
                    <span className="text-[9px] font-bold text-rose-400 uppercase">Forfait</span>
                  ) : player.isFoldedInRound ? (
                    <span className="text-[9px] font-bold text-rose-400 uppercase">A passé</span>
                  ) : player.isAiRelay ? (
                    <span className="text-[9px] font-bold text-amber-300 uppercase flex items-center gap-0.5">🤖 Relais IA</span>
                  ) : isDisconnected ? (
                    <span className="text-[9px] font-bold text-amber-400 uppercase flex items-center gap-0.5">📡 Hors-ligne</span>
                  ) : !isEliminated ? (
                    <div>
                      <span className="font-bold text-slate-200">{player.tricksWonInRound}</span>/5 main
                      {player.tricksWonInRound > 1 ? 's' : ''}
                    </div>
                  ) : (
                    <span className="text-[9px] font-bold text-rose-400 uppercase">Éliminé</span>
                  )}
                  {stratInfo && !isEliminated && !isForfeit && !isInstantWinner && (
                    <span
                      title={`Style de jeu : ${stratInfo.name} - ${stratInfo.description}`}
                      className={`text-[9px] px-1 py-0.2 rounded border flex items-center gap-0.5 ${stratInfo.badgeBg}`}
                    >
                      <span>{stratInfo.icon}</span>
                      <span className="hidden sm:inline font-medium">{stratInfo.name}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Exactly 5 Slots for the 5 tricks of the round */}
            <div className="flex items-center gap-1 sm:gap-1.5">
              {/* If forfeit or eliminated with no cards played, show BANNER */}
              {isForfeit && completedPlays.length === 0 ? (
                <div className="px-3 py-1 bg-rose-950/60 border border-rose-800/80 rounded-lg text-rose-400 text-[10px] font-extrabold tracking-wider uppercase flex items-center gap-1">
                  <Ban className="w-3 h-3" />
                  <span className="hidden sm:inline">Partie Perdue (Forfait / Déconnexion)</span>
                  <span className="sm:hidden">Forfait</span>
                </div>
              ) : isEliminated && completedPlays.length === 0 ? (
                <div className="px-3 py-1 bg-rose-950/40 border border-rose-800/60 rounded-lg text-rose-400 text-[10px] font-extrabold tracking-wider uppercase flex items-center gap-1">
                  <Skull className="w-3 h-3" />
                  <span className="hidden sm:inline">Éliminé de la Manche (Capital insuffisant)</span>
                  <span className="sm:hidden">Éliminé</span>
                </div>
              ) : isInstantWinner ? (
                /* REVEALED FACE-UP CARDS FOR THE INSTANT WINNER (Trois 7 ou Moins de 21) */
                (player.hand || []).map((card, cIdx) => {
                  const suitInfo = SUITS_INFO[card.suit];
                  const isHighlight =
                    instantWinReveal?.winType === 'THREE_SEVENS' ? card.value === 7 : true;

                  return (
                    <motion.div
                      key={`instant-win-card-${player.id}-${cIdx}`}
                      initial={{ scale: 0.7, y: 10, opacity: 0 }}
                      animate={{ scale: 1, y: 0, opacity: 1 }}
                      transition={{ delay: cIdx * 0.06, type: 'spring', damping: 15 }}
                      title={`${card.label} (${card.value} pts)`}
                      className={`relative w-7 xs:w-8 sm:w-9 h-9 xs:h-10 sm:h-12 rounded-lg bg-white text-slate-950 flex flex-col justify-between p-0.5 sm:p-1 shadow-md text-[9px] xs:text-[10px] sm:text-xs font-bold select-none ${
                        isHighlight
                          ? 'border-2 border-amber-400 ring-2 ring-amber-400 shadow-amber-400/40'
                          : 'border border-slate-300'
                      }`}
                    >
                      {/* Top corner value & small suit */}
                      <div className="flex items-center justify-between leading-none pointer-events-none">
                        <span className={`font-black ${suitInfo.color}`}>{card.value}</span>
                        <span className={`text-[8px] xs:text-[9px] ${suitInfo.color}`}>{suitInfo.symbol}</span>
                      </div>

                      {/* Center symbol */}
                      <div
                        className={`self-center text-[10px] xs:text-xs sm:text-sm leading-none pointer-events-none ${suitInfo.color}`}
                      >
                        {suitInfo.symbol}
                      </div>

                      {/* Winner highlight mark */}
                      {isHighlight && (
                        <div className="absolute -top-1.5 -right-1 bg-amber-400 text-slate-950 rounded-full p-0.5 shadow">
                          <Sparkles className="w-2.5 h-2.5" />
                        </div>
                      )}
                    </motion.div>
                  );
                })
              ) : (
                <>
                  {/* 1. PLAYED CARDS : REVEALED, OPEN AND VISIBLE */}
                  {completedPlays.map((item, pIdx) => {
                    const suitInfo = SUITS_INFO[item.card.suit];
                    return (
                      <div
                        key={`played-${player.id}-${pIdx}`}
                        title={`${item.label}: ${item.card.label}${
                          item.wasWinner
                            ? ' (Main remportée)'
                            : item.isCurrent
                            ? ' (Main en cours)'
                            : ''
                        }`}
                        className={`relative w-7 xs:w-8 sm:w-9 h-9 xs:h-10 sm:h-12 rounded-lg bg-white text-slate-950 flex flex-col justify-between p-0.5 sm:p-1 shadow-md text-[9px] xs:text-[10px] sm:text-xs font-bold border select-none transition-all ${
                          item.wasWinner
                            ? 'border-amber-400 ring-2 ring-amber-400 shadow-amber-400/30'
                            : item.isCurrent
                            ? 'border-blue-400 ring-1 ring-blue-400 bg-blue-50/90'
                            : 'border-slate-300'
                        }`}
                      >
                        {/* Top corner value & small suit */}
                        <div className="flex items-center justify-between leading-none pointer-events-none">
                          <span className={`font-black ${suitInfo.color}`}>{item.card.value}</span>
                          <span className={`text-[8px] xs:text-[9px] ${suitInfo.color}`}>{suitInfo.symbol}</span>
                        </div>

                        {/* Center symbol */}
                        <div
                          className={`self-center text-[10px] xs:text-xs sm:text-sm leading-none pointer-events-none ${suitInfo.color}`}
                        >
                          {suitInfo.symbol}
                        </div>

                        {/* Winner crown badge */}
                        {item.wasWinner && (
                          <div className="absolute -top-1.5 -right-1 bg-amber-400 text-slate-950 rounded-full p-0.5 shadow">
                            <Sparkles className="w-2.5 h-2.5" />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* 2. REMAINING CARDS IN HAND / CARDS DEALT DURING DEALING */}
                  {(() => {
                    const dealtCount = isDealing
                      ? (cardsDealtCountByPlayer?.[playerIndex] ?? 0)
                      : remainingCardsInHand;
                    const placeholderCount = isDealing
                      ? Math.max(0, 5 - dealtCount)
                      : Math.max(0, totalSlots - completedPlays.length - remainingCardsInHand);

                    return (
                      <>
                        {Array.from({ length: dealtCount }).map((_, fIdx) => (
                          <motion.div
                            key={`facedown-${player.id}-${fIdx}`}
                            initial={{ scale: 0.6, opacity: 0, y: -6 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            transition={{ duration: 0.22, ease: 'easeOut' }}
                            title={isLocalPlayer ? 'Carte en main' : 'Carte en main (non jouée)'}
                            className={`w-7 xs:w-8 sm:w-9 h-9 xs:h-10 sm:h-12 rounded-lg ${
                              isLocalPlayer
                                ? 'bg-gradient-to-br from-emerald-800 via-emerald-900 to-slate-950 border-2 border-emerald-400/90 text-emerald-300 shadow-emerald-500/30'
                                : 'bg-gradient-to-br from-indigo-800 via-indigo-900 to-slate-950 border-2 border-indigo-400/90 text-indigo-300 shadow-indigo-500/30'
                            } shadow-md flex items-center justify-center text-[10px] xs:text-xs font-serif select-none transition-all ${
                              isDealing ? 'ring-2 ring-amber-400/60 animate-pulse' : ''
                            }`}
                          >
                            🂠
                          </motion.div>
                        ))}

                        {/* 3. EMPTY PLACEHOLDER SLOTS (ZONES GRISÉES) */}
                        {Array.from({ length: placeholderCount }).map((_, sIdx) => (
                          <div
                            key={`slot-${player.id}-${sIdx}`}
                            className="w-7 xs:w-8 sm:w-9 h-9 xs:h-10 sm:h-12 rounded-lg border-2 border-dashed border-slate-700/60 bg-slate-950/40 flex items-center justify-center text-slate-700 text-[10px] select-none"
                            title="Emplacement de carte disponible"
                          />
                        ))}
                      </>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};



