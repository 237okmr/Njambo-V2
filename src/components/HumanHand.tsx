import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Card, Suit, SUITS_INFO, InstantWinReveal, EmoteMessage, Player, Trick } from '../types';
import { isCardPlayable } from '../utils/deck';
import { triggerHaptic, sounds } from '../utils/sound';
import { getPlayedCardsInRound, getDynamicBossValue } from '../utils/ai';
import { CheckCircle2, ArrowUpCircle, ChevronUp, Sparkles, Loader2, Crown, Flame, Ban, Flag, ShieldAlert, X, Eye, Trophy, Coins, Radio } from 'lucide-react';
import { motion, PanInfo, AnimatePresence } from 'motion/react';
import { EmotePickerPopover } from './EmotePickerPopover';
import { QuickContextualReaction } from './QuickContextualReaction';
import { SpeechBubble } from './SpeechBubble';

interface HumanHandProps {
  hand: Card[];
  isHumanTurn: boolean;
  leadSuit: Suit | null;
  selectedCardId: string | null;
  onSelectCard: (card: Card) => void;
  onValidateCard: () => void;
  onDirectPlayCard?: (card: Card) => void;
  playerName: string;
  isDealing?: boolean;
  cardsDealtCountByPlayer?: Record<number, number>;
  isForfeit?: boolean;
  isEliminated?: boolean;
  isFoldedInRound?: boolean;
  baseBet?: number;
  pot?: number;
  currentTrickNumber?: number;
  currentTrick?: Trick | null;
  tricksHistory?: Trick[];
  players?: Player[];
  onFoldRound?: () => void;
  instantWinReveal?: InstantWinReveal | null;
  enableKoraHunterAlerts?: boolean;
  onTriggerKoraHunterAlert?: () => void;
  onSendEmote?: (text: string, emoji?: string) => void;
  onProposeBetIncrease?: () => void;
  activeEmotes?: EmoteMessage[];
  localPlayerId?: string | null;
}

export const HumanHand: React.FC<HumanHandProps> = ({
  hand = [],
  isHumanTurn,
  leadSuit,
  selectedCardId,
  onSelectCard,
  onValidateCard,
  onDirectPlayCard,
  playerName,
  isDealing = false,
  cardsDealtCountByPlayer,
  isForfeit = false,
  isEliminated = false,
  isFoldedInRound = false,
  baseBet = 250,
  pot = 0,
  currentTrickNumber = 1,
  currentTrick = null,
  tricksHistory = [],
  players = [],
  onFoldRound,
  instantWinReveal = null,
  enableKoraHunterAlerts = true,
  onTriggerKoraHunterAlert,
  onSendEmote,
  onProposeBetIncrease,
  activeEmotes = [],
  localPlayerId = null,
}) => {
  const cardsList = Array.isArray(hand) ? hand : [];
  const hasLeadSuit = leadSuit ? cardsList.some((c) => c.suit === leadSuit) : false;
  const leadSuitInfo = leadSuit ? SUITS_INFO[leadSuit] : null;

  const selectedCard = cardsList.find((c) => c.id === selectedCardId) || null;
  const lastTapRef = useRef<{ id: string; time: number }>({ id: '', time: 0 });
  const lastPlayTimeRef = useRef<number>(0);

  const [hasDeclaredKoraInPartie, setHasDeclaredKoraInPartie] = useState<boolean>(false);
  const [showFoldConfirm, setShowFoldConfirm] = useState<boolean>(false);

  // Reset declaration state when a new hand is dealt
  const handIdsKey = cardsList.map((c) => c.id).join(',');
  useEffect(() => {
    setHasDeclaredKoraInPartie(false);
    setShowFoldConfirm(false);
  }, [handIdsKey]);

  const isHumanInstantWinner =
    instantWinReveal !== null &&
    (instantWinReveal.winnerName.includes('Vous') ||
      instantWinReveal.winnerName.includes(playerName) ||
      instantWinReveal.winnerIndex === 0);

  // Single active table dialogue emote (Option C: comic-style dialogue bubble above the hand)
  const latestEmote = useMemo(() => {
    if (!activeEmotes || activeEmotes.length === 0) return null;
    const now = Date.now();
    // Only consider emotes active within the 3500ms window
    const freshEmotes = activeEmotes.filter((e) => now - e.timestamp < 3500);
    if (freshEmotes.length === 0) return null;
    // Strictly display one message at a time: the latest one
    return freshEmotes[freshEmotes.length - 1];
  }, [activeEmotes]);

  const authorInfo = useMemo(() => {
    if (!latestEmote) return null;

    // Check if sender is local human player
    const isLocalHuman =
      (localPlayerId && latestEmote.playerId === localPlayerId) ||
      latestEmote.playerId === 'p0' ||
      latestEmote.playerId === 'player_0' ||
      (!latestEmote.isBot &&
        (latestEmote.playerName === playerName ||
          latestEmote.playerName.includes('Vous') ||
          (playerName && playerName.includes(latestEmote.playerName))));

    if (isLocalHuman) {
      return {
        type: 'human' as const,
        name: 'Vous',
        icon: '👤',
      };
    }

    // Check if sender is a bot
    const matchedPlayer = players.find((p) => p.id === latestEmote.playerId);
    const isBot = latestEmote.isBot || matchedPlayer?.isHuman === false || latestEmote.playerId.startsWith('bot');
    if (isBot) {
      return {
        type: 'bot' as const,
        name: latestEmote.playerName || matchedPlayer?.name || 'IA',
        icon: '🤖',
      };
    }

    // Remote human in multiplayer
    return {
      type: 'remote' as const,
      name: latestEmote.playerName || matchedPlayer?.name || 'Joueur',
      icon: '🌐',
    };
  }, [latestEmote, playerName, players, localPlayerId]);

  // Live Boss calculation for Spectator overview
  const playedCards = getPlayedCardsInRound(tricksHistory, []);
  const bossCoeur = getDynamicBossValue('COEUR', playedCards);
  const bossCarreau = getDynamicBossValue('CARREAU', playedCards);
  const bossTrefle = getDynamicBossValue('TREFLE', playedCards);
  const bossPique = getDynamicBossValue('PIQUE', playedCards);

  // Find current trick leader
  const trickLeader = [...players].sort((a, b) => (b.tricksWonInRound || 0) - (a.tricksWonInRound || 0))[0];

  const handleCardClick = (card: Card, playable: boolean) => {
    if (!playable || isDealing || instantWinReveal || isForfeit) return;

    const now = Date.now();
    const isDoubleTap = lastTapRef.current.id === card.id && now - lastTapRef.current.time < 350;
    const isAlreadySelected = selectedCardId === card.id;

    lastTapRef.current = { id: card.id, time: now };

    if (isDoubleTap || isAlreadySelected) {
      // Direct play on double tap or second click on selected card (with 250ms anti-jitter debounce)
      if (now - lastPlayTimeRef.current < 250) return;
      lastPlayTimeRef.current = now;

      triggerHaptic('medium');
      if (onDirectPlayCard) {
        onDirectPlayCard(card);
      } else {
        onValidateCard();
      }
    } else {
      // First click: select with light vibration
      triggerHaptic('light');
      onSelectCard(card);
    }
  };

  const handleDragEnd = (card: Card, playable: boolean, info: PanInfo) => {
    if (!playable || isDealing || instantWinReveal || isForfeit) return;

    // If dragged upwards significantly or flicked fast up
    if (info.offset.y < -45 || info.velocity.y < -220) {
      const now = Date.now();
      if (now - lastPlayTimeRef.current < 250) return;
      lastPlayTimeRef.current = now;

      triggerHaptic('medium');
      if (onDirectPlayCard) {
        onDirectPlayCard(card);
      } else {
        onSelectCard(card);
        setTimeout(() => onValidateCard(), 50);
      }
    }
  };

  const shouldShowSpectator = (cardsList.length === 0 && isForfeit) || isEliminated || isFoldedInRound;

  if (shouldShowSpectator) {
    return (
      <footer
        id="human-hand-spectator-section"
        className="w-full bg-slate-900/95 border-t border-emerald-800/50 px-3 sm:px-6 py-3 shadow-2xl z-30 flex flex-col gap-2.5 backdrop-blur-md"
      >
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Spectator Status Badge */}
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
            <div className="flex items-center gap-2.5">
              <div className="relative flex items-center justify-center">
                <div className="w-9 h-9 rounded-xl bg-emerald-950/90 border border-emerald-600/70 flex items-center justify-center text-emerald-400 shadow-inner">
                  <Eye className="w-4.5 h-4.5 animate-pulse" />
                </div>
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              </div>
              <div className="flex flex-col text-left min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-100 text-xs sm:text-sm truncate">{playerName}</span>
                  <span className="shrink-0 bg-emerald-950/90 text-emerald-300 border border-emerald-700/80 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Radio className="w-2.5 h-2.5 text-emerald-400 animate-pulse" />
                    {isForfeit ? 'Forfait (cette donne)' : isEliminated ? 'Éliminé' : 'Spectateur (Donne passée)'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  {isForfeit
                    ? 'Forfait pour cette donne (déconnexion). Vous réintégrerez la partie dès la donne suivante si vous restez connecté.'
                    : isEliminated
                    ? 'Éliminé de la manche (Capital insuffisant).'
                    : 'Observez les tours en cours. Vos cartes seront redistribuées dès la donne suivante.'}
                </p>
              </div>
            </div>

            {onSendEmote && (
              <div className="sm:hidden shrink-0">
                <EmotePickerPopover onSendEmote={onSendEmote} disabled={true} />
              </div>
            )}
          </div>

          {/* Live Table Quick Stats (Tours, Pot, Meneur) */}
          <div className="flex items-center flex-wrap gap-2 w-full sm:w-auto justify-center sm:justify-end">
            <div className="bg-slate-800/80 border border-slate-700/70 px-2.5 py-1 rounded-lg flex items-center gap-1.5 text-xs text-slate-300">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-slate-400 font-medium">Tour:</span>
              <span className="font-bold text-amber-300">{currentTrickNumber} / 5</span>
            </div>

            {pot > 0 && (
              <div className="bg-amber-950/40 border border-amber-800/50 px-2.5 py-1 rounded-lg flex items-center gap-1.5 text-xs text-amber-200">
                <Coins className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-amber-400/80 font-medium">Pot:</span>
                <span className="font-extrabold text-amber-300">{pot.toLocaleString()} jetons</span>
              </div>
            )}

            {trickLeader && (trickLeader.tricksWonInRound || 0) > 0 && (
              <div className="bg-slate-800/80 border border-slate-700/70 px-2.5 py-1 rounded-lg flex items-center gap-1.5 text-xs text-slate-300">
                <Crown className="w-3.5 h-3.5 text-yellow-400" />
                <span className="text-slate-400 font-medium">Meneur:</span>
                <span className="font-bold text-slate-200">
                  {trickLeader.name}{' '}
                  <span
                    key={trickLeader.tricksWonInRound}
                    className="inline-block text-amber-300 animate-trick-pop"
                  >
                    ({trickLeader.tricksWonInRound})
                  </span>
                </span>
              </div>
            )}

            {onSendEmote && (
              <div className="hidden sm:block shrink-0 ml-1">
                <EmotePickerPopover onSendEmote={onSendEmote} disabled={true} />
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Boss Tracker Mini-Bar */}
        <div className="w-full bg-slate-950/60 border border-slate-800/80 rounded-lg px-3 py-1.5 flex items-center justify-between text-[11px] text-slate-400 overflow-x-auto gap-2">
          <span className="font-semibold text-slate-300 shrink-0 flex items-center gap-1">
            <Crown className="w-3 h-3 text-amber-400" /> Cartes Maîtresses restantes :
          </span>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-rose-400 font-bold">♥ {bossCoeur === 10 ? '10♥' : `${bossCoeur}♥`}</span>
            <span className="text-orange-400 font-bold">♦ {bossCarreau === 10 ? '10♦' : `${bossCarreau}♦`}</span>
            <span className="text-emerald-400 font-bold">♣ {bossTrefle === 10 ? '10♣' : `${bossTrefle}♣`}</span>
            <span className="text-sky-400 font-bold">♠ {bossPique === 9 ? '9♠ (Max)' : `${bossPique}♠`}</span>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer
      id="human-hand-section"
      className={`w-full bg-slate-900 border-t border-slate-800 px-2 sm:px-8 py-1.5 sm:py-3 relative flex flex-col lg:flex-row items-center justify-between gap-1 sm:gap-2.5 shadow-2xl z-30 touch-manipulation transition-all duration-300 ${
        isHumanInstantWinner
          ? instantWinReveal?.winType === 'UNDER_21'
            ? 'ring-2 ring-emerald-400/50 bg-emerald-950/30'
            : 'ring-2 ring-yellow-400/50 bg-amber-950/30'
          : ''
      }`}
    >
      {/* Table Dialogue Speech Bubble (Option C: comic-style floating dialogue above hand) */}
      <AnimatePresence mode="wait">
        {latestEmote && authorInfo && (
          <div
            key={latestEmote.id || `${latestEmote.playerId}-${latestEmote.timestamp}`}
            className="absolute -top-11 sm:-top-13 left-1/2 -translate-x-1/2 z-50 pointer-events-none w-max max-w-[92vw]"
          >
            <SpeechBubble
              text={latestEmote.text}
              emoji={latestEmote.emoji}
              authorName={authorInfo.name}
              authorIcon={authorInfo.icon}
              authorType={authorInfo.type}
            />
          </div>
        )}
      </AnimatePresence>

      {/* Turn Helper Details on the left (Desktop & Mobile status) */}
      <div className="flex flex-col items-center lg:items-start text-center lg:text-left shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div
            className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${
              isDealing
                ? 'bg-blue-400 animate-ping'
                : isHumanInstantWinner
                ? 'bg-amber-400 animate-bounce'
                : isHumanTurn
                ? 'bg-amber-400 animate-ping'
                : 'bg-slate-600'
            }`}
          />
          <span className="font-bold text-slate-100 text-xs sm:text-sm">
            {isDealing
              ? 'Distribution des cartes...'
              : isHumanInstantWinner
              ? '🎉 MAIN GAGNANTE !'
              : isHumanTurn
              ? 'À vous de jouer'
              : playerName}
          </span>
        </div>

        <div className="text-[11px] sm:text-xs text-slate-400 mt-0.5 max-w-[220px]">
          {isDealing ? (
            <span className="text-blue-300 flex items-center gap-1 font-medium">
              <Loader2 className="w-3 h-3 animate-spin" />
              Réception de vos 5 cartes...
            </span>
          ) : isHumanInstantWinner ? (
            <span className="text-emerald-400 font-extrabold flex items-center gap-1">
              <Crown className="w-3.5 h-3.5 text-emerald-400" />
              🎉 Victoire immédiate ! Vous remportez le pot !
            </span>
          ) : instantWinReveal ? (
            <span className="text-amber-400 font-bold flex items-center gap-1">
              🎯 Victoire immédiate de {instantWinReveal.winnerName} !
            </span>
          ) : isHumanTurn ? (
            leadSuitInfo ? (
              hasLeadSuit ? (
                <span className="text-amber-300 font-medium">
                  Obligation de fournir à <b className="text-white">{leadSuitInfo.name}</b>
                </span>
              ) : (
                <span className="text-emerald-400 font-medium">
                  Pas de {leadSuitInfo.name} : pas la carte, jouez librement
                </span>
              )
            ) : (
              <span className="text-slate-300">Vous entamez la main.</span>
            )
          ) : (
            <span className="text-slate-500 italic">En attente de l'adversaire...</span>
          )}
        </div>
      </div>

      {/* Cards Fan Tray with Swipe Gestures */}
      <div className="flex flex-col items-center justify-center w-full max-w-2xl lg:max-w-3xl">
        {/* Mobile Gestural Guidance Pill */}
        {isHumanTurn && hand.length > 0 && !isDealing && !instantWinReveal && (
          <div className="flex items-center gap-1 text-[10px] text-amber-400/90 font-medium mb-0.5 animate-pulse select-none">
            <ChevronUp className="w-3 h-3 text-amber-400 animate-bounce" />
            <span>Glissez vers le haut ou touchez 2x pour jouer</span>
          </div>
        )}

        <div
          id="human-cards-tray"
          className="flex items-end justify-center gap-1 sm:gap-2.5 lg:gap-3 py-0.5 min-h-[105px] sm:min-h-[160px] lg:min-h-[175px] overflow-visible w-full"
        >
          {(() => {
            const humanDealtCount = isDealing
              ? (cardsDealtCountByPlayer?.[0] ?? 0)
              : cardsList.length;
            const visibleCards = isDealing ? cardsList.slice(0, humanDealtCount) : cardsList;
            const placeholderCount = isDealing ? Math.max(0, 5 - humanDealtCount) : 0;

            if (visibleCards.length === 0 && placeholderCount === 0) {
              return (
                <div className="text-slate-500 text-xs italic py-4">
                  Aucune carte en main.
                </div>
              );
            }

            return (
              <>
                {visibleCards.map((card, idx) => {
                  const suitInfo = SUITS_INFO[card.suit];
                  const playable = !isDealing && !instantWinReveal && isHumanTurn && isCardPlayable(card, cardsList, leadSuit);
                  const isSelected = selectedCardId === card.id;
                  const isInstantWinCard =
                    isHumanInstantWinner &&
                    (instantWinReveal?.winType === 'THREE_SEVENS' ? card.value === 7 : true);

                  // Golden pulse strictly when follow suit is active and matches
                  const shouldGlowGold = isHumanTurn && leadSuit && hasLeadSuit && card.suit === leadSuit;

                  // Pronounced physical card fan curve calculation
                  const totalCards = Math.max(5, visibleCards.length + placeholderCount);
                  const centerOffset = idx - (totalCards - 1) / 2;
                  const rotationAngle = centerOffset * (totalCards > 3 ? 5.2 : 3.5);
                  const arcYOffset = Math.pow(Math.abs(centerOffset), 1.8) * 3.5;

                  return (
                    <motion.div
                      key={card.id}
                      id={`human-card-${card.id}`}
                      initial={isDealing ? { scale: 0.5, y: 40, opacity: 0 } : false}
                      drag={playable ? 'y' : false}
                      dragConstraints={{ top: -130, bottom: 0 }}
                      dragElastic={0.25}
                      onDragEnd={(_, info) => handleDragEnd(card, playable, info)}
                      onClick={() => handleCardClick(card, playable)}
                      whileHover={
                        playable
                          ? {
                              scale: 1.1,
                              y: -22,
                              rotate: 0,
                              zIndex: 35,
                              transition: { type: 'spring', damping: 15, stiffness: 400 },
                            }
                          : {}
                      }
                      animate={{
                        opacity: 1,
                        y: isSelected ? -24 : isInstantWinCard ? -12 : arcYOffset,
                        scale: isSelected ? 1.08 : isInstantWinCard ? 1.04 : 1,
                        rotate: isSelected ? 0 : rotationAngle,
                        zIndex: isSelected ? 30 : isInstantWinCard ? 20 : 10 + idx,
                      }}
                      transition={{ type: 'spring', damping: 20, stiffness: 320 }}
                      className={`relative w-14 sm:w-22 md:w-24 lg:w-20 xl:w-24 h-22 sm:h-32 md:h-36 lg:h-32 xl:h-36 rounded-xl bg-white text-slate-950 p-1 sm:p-2.5 flex flex-col justify-between shadow-2xl select-none text-left cursor-grab active:cursor-grabbing transition-[border-color,box-shadow] duration-150 overflow-hidden ${
                        isDealing
                          ? 'ring-2 ring-amber-400 border-2 border-amber-300 shadow-amber-400/30'
                          : isInstantWinCard
                          ? 'border-2 border-amber-400 ring-4 ring-amber-400 ring-offset-2 ring-offset-slate-900 shadow-2xl shadow-amber-400/50'
                          : isSelected
                          ? 'border-2 border-amber-400 ring-4 ring-amber-400 ring-offset-2 ring-offset-slate-900 shadow-2xl shadow-amber-400/50'
                          : shouldGlowGold
                          ? 'golden-glow-pulse border-2 border-amber-400 cursor-pointer shadow-amber-400/30'
                          : playable
                          ? 'border-2 border-slate-300 hover:border-amber-400 hover:shadow-xl cursor-pointer shadow-lg'
                          : 'border-2 border-slate-300/40 opacity-35 grayscale-[50%] cursor-not-allowed pointer-events-none'
                      }`}
                    >
                      {/* Visual Drag arrow hint when selected */}
                      {isSelected && (
                        <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none">
                          <ChevronUp className="w-5 h-5 text-amber-400 animate-bounce" />
                        </div>
                      )}

                      {/* Top corner: Value + Symbol */}
                      <div className="flex flex-col items-start leading-none pointer-events-none">
                        <span className={`text-xs sm:text-lg md:text-xl font-black ${suitInfo.color}`}>
                          {card.value}
                        </span>
                        <span className={`text-[10px] sm:text-xs md:text-sm font-bold ${suitInfo.color} -mt-0.5`}>
                          {suitInfo.symbol}
                        </span>
                      </div>

                      {/* Center large symbol */}
                      <div
                        className={`self-center text-lg sm:text-3xl md:text-4xl pointer-events-none select-none leading-none ${suitInfo.color}`}
                      >
                        {suitInfo.symbol}
                      </div>

                      {/* Bottom corner inverted */}
                      <div className="flex flex-col items-end leading-none rotate-180 pointer-events-none">
                        <span className={`text-xs sm:text-lg md:text-xl font-black ${suitInfo.color}`}>
                          {card.value}
                        </span>
                        <span className={`text-[10px] sm:text-xs md:text-sm font-bold ${suitInfo.color} -mt-0.5`}>
                          {suitInfo.symbol}
                        </span>
                      </div>

                      {/* Selected check badge */}
                      {isSelected && (
                        <div className="absolute top-1 right-1 bg-amber-400 text-slate-950 rounded-full p-0.5 shadow-md z-10">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </div>
                      )}

                      {/* Instant Win badge */}
                      {isInstantWinCard && (
                        <div className="absolute top-1 right-1 bg-amber-400 text-slate-950 rounded-full p-0.5 shadow-md animate-pulse z-10">
                          <Sparkles className="w-3 h-3" />
                        </div>
                      )}
                    </motion.div>
                  );
                })}

                {/* Empty gray card placeholders during dealing */}
                {Array.from({ length: placeholderCount }).map((_, pIdx) => (
                  <div
                    key={`human-placeholder-${pIdx}`}
                    className="relative w-14 sm:w-24 md:w-28 h-22 sm:h-36 md:h-40 rounded-xl border-2 border-dashed border-slate-700/60 bg-slate-950/40 flex items-center justify-center text-slate-700 text-base font-serif select-none"
                    title="Carte en attente de distribution"
                  >
                    🂠
                  </div>
                ))}
              </>
            );
          })()}
        </div>
      </div>

      {/* Validation & Action Button Section */}
      <div
        id="validation-button-container"
        className="flex flex-col items-center justify-center shrink-0 w-full lg:w-auto gap-1"
      >
        <div className="flex items-center gap-1 sm:gap-1.5 w-full lg:w-auto justify-center sm:justify-end flex-nowrap overflow-x-hidden">
          {/* 1. Emote Picker Popover (Visible on mobile, moved to sidebar on desktop) */}
          {onSendEmote && (
            <div className="shrink-0 lg:hidden">
              <EmotePickerPopover
                onSendEmote={onSendEmote}
                disabled={isDealing || isForfeit || isFoldedInRound || isEliminated}
                onProposeBetIncrease={onProposeBetIncrease}
              />
            </div>
          )}

          {/* 2. Kora Hunter Manual Declaration Button (Visible on mobile, moved to sidebar on desktop) */}
          {enableKoraHunterAlerts &&
            hand.length > 0 &&
            !isDealing &&
            !instantWinReveal &&
            !isForfeit &&
            !isFoldedInRound &&
            !isEliminated && (
            <button
              id="btn-declare-kora-hunter"
              type="button"
              onClick={() => {
                if (hasDeclaredKoraInPartie) return;
                triggerHaptic('heavy');
                try {
                  sounds.playKora();
                } catch (e) {
                  // Ignore sound error
                }
                setHasDeclaredKoraInPartie(true);
                if (onTriggerKoraHunterAlert) {
                  onTriggerKoraHunterAlert();
                }
              }}
              disabled={hasDeclaredKoraInPartie}
              className={`flex items-center justify-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl font-black text-xs transition-all shadow-lg shrink-0 lg:hidden ${
                hasDeclaredKoraInPartie
                  ? 'bg-amber-950/80 text-amber-300/80 border border-amber-500/40 cursor-default'
                  : 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:from-amber-400 hover:to-yellow-300 text-slate-950 border border-yellow-200 shadow-amber-500/30 active:scale-95 cursor-pointer animate-pulse'
              }`}
              title={
                hasDeclaredKoraInPartie
                  ? 'Alerte Kora déjà transmise pour cette partie'
                  : 'Lancer l\'Alerte Anonyme "Chasseur de Kora" à la table'
              }
            >
              <Crown className="w-3.5 h-3.5 text-slate-950 fill-slate-950 shrink-0" />
              <span className="hidden xs:inline sm:inline">{hasDeclaredKoraInPartie ? 'Déclarée' : 'Kora'}</span>
            </button>
          )}

          {/* 3. Valider Button (Primary CTA - Visible everywhere with contextual card name) */}
          {!instantWinReveal && (
            <button
              id="btn-valider-carte"
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                onValidateCard();
              }}
              disabled={!isHumanTurn || !selectedCard || isDealing}
              className={`flex items-center justify-center gap-1.5 px-3.5 sm:px-5 py-1.5 sm:py-2.5 rounded-xl font-black uppercase tracking-wider text-xs sm:text-sm btn-juicy shrink-0 transition-all ${
                isHumanTurn && selectedCard && !isDealing
                  ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 shadow-[0_4px_0_0_#b45309,0_0_15px_rgba(245,158,11,0.4)] active:translate-y-0.5 active:shadow-none cursor-pointer ring-2 ring-amber-300'
                  : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
              }`}
            >
              <ArrowUpCircle className={`w-4 h-4 shrink-0 ${isHumanTurn && selectedCard && !isDealing ? 'animate-bounce' : ''}`} />
              <span>
                {selectedCard && isHumanTurn && !isDealing ? (
                  <span className="flex items-center gap-1">
                    <span className="hidden sm:inline">Jouer le</span>
                    <span className="font-mono text-sm sm:text-base font-black">{selectedCard.value}</span>
                    <span className={`text-sm ${SUITS_INFO[selectedCard.suit].color}`}>
                      {SUITS_INFO[selectedCard.suit].symbol}
                    </span>
                  </span>
                ) : (
                  'Valider'
                )}
              </span>
            </button>
          )}

          {/* 4. Forfeit / Abandon Button (Visible on mobile, moved to sidebar on desktop) */}
          {onFoldRound && hand.length > 0 && !isDealing && !instantWinReveal && !isForfeit && !isFoldedInRound && !isEliminated && (
            <button
              id="btn-fold-round"
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setShowFoldConfirm(true);
              }}
              className="flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl font-bold text-xs bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-600/60 transition-all cursor-pointer shadow-md active:scale-95 shrink-0 lg:hidden"
              title="Passer cette donne (Déclarer Forfait)"
            >
              <Flag className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>Forfait</span>
            </button>
          )}
        </div>

        {selectedCard ? (
          <div className="mt-0.5 text-xs font-semibold text-amber-400 text-center">
            {selectedCard.label} prête
          </div>
        ) : (
          <div className="mt-0.5 text-[11px] text-slate-500 text-center">
            {isDealing
              ? 'Distribution en cours...'
              : isHumanInstantWinner
              ? 'Combinaison validée'
              : isHumanTurn
              ? 'Sélectionnez ou glissez'
              : 'Attendez votre tour'}
          </div>
        )}
      </div>

      {/* Confirmation Modal for Fold Round */}
      <AnimatePresence>
        {showFoldConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl relative text-left"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2 text-amber-400 font-black text-base sm:text-lg">
                  <ShieldAlert className="w-5 h-5 text-amber-400" />
                  <span>Passer cette donne ?</span>
                </div>
                <button
                  onClick={() => setShowFoldConfirm(false)}
                  className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="py-4 space-y-3 text-xs sm:text-sm text-slate-300">
                <p>
                  En passant cette donne :
                </p>
                <ul className="space-y-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-slate-300">
                  <li className="flex items-start gap-2">
                    <span className="text-rose-400 font-bold">•</span>
                    <span>Votre mise initiale de <strong className="text-amber-400">{baseBet} jetons</strong> est perdue pour cette donne.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-rose-400 font-bold">•</span>
                    <span>Toutes les pénalités de fin de donne (<strong className="text-slate-200">Victoire simple</strong>, <strong className="text-amber-300">Kora ×2</strong> ou <strong className="text-orange-400">Double Kora ×4</strong>) restent exigibles et seront reversées au vainqueur.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400 font-bold">•</span>
                    <span>Vous restez assis à la table en spectateur et rejouerez automatiquement dès la donne suivante.</span>
                  </li>
                </ul>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowFoldConfirm(false)}
                  className="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowFoldConfirm(false);
                    if (onFoldRound) {
                      onFoldRound();
                    }
                  }}
                  className="px-4 py-2 rounded-xl text-xs sm:text-sm font-black bg-rose-600 hover:bg-rose-500 text-white shadow-lg transition-all active:scale-95 flex items-center gap-1.5"
                >
                  <Flag className="w-4 h-4" />
                  <span>Confirmer et passer</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </footer>
  );
};
