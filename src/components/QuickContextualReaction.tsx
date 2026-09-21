import React, { useState, useEffect, useRef } from 'react';
import { Zap } from 'lucide-react';
import { Card, Trick } from '../types';
import { triggerHaptic } from '../utils/sound';

interface QuickContextualReactionProps {
  currentTrick: Trick | null;
  tricksHistory: Trick[];
  currentTrickNumber: number;
  isHumanTurn: boolean;
  onSendEmote: (text: string, emoji?: string) => void;
  disabled?: boolean;
}

interface ContextualSuggestion {
  key: string;
  text: string;
  emoji: string;
  isContextual: boolean;
}

// Option D: Short, punchy phrases (2-3 words max)
const DEFAULT_PUNCHY_REACTIONS: { text: string; emoji: string }[] = [
  { text: 'Bien joué ! 👏', emoji: '👏' },
  { text: 'Belle coupe ! ⚡', emoji: '⚡' },
  { text: 'Chapeau ! 🎩', emoji: '🎩' },
  { text: 'Trankil ! 😎', emoji: '😎' },
  { text: 'Aïe ! 😬', emoji: '😬' },
  { text: 'Tactique ! 🧠', emoji: '🧠' },
];

export const QuickContextualReaction: React.FC<QuickContextualReactionProps> = ({
  currentTrick,
  tricksHistory,
  currentTrickNumber,
  isHumanTurn,
  onSendEmote,
  disabled = false,
}) => {
  const [activeSuggestion, setActiveSuggestion] = useState<ContextualSuggestion | null>(null);
  const [defaultIndex, setDefaultIndex] = useState<number>(0);
  const turnStartTimeRef = useRef<number>(Date.now());
  const dismissTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessedCardKeyRef = useRef<string>('');

  const showSuggestion = (suggestion: ContextualSuggestion) => {
    setActiveSuggestion(suggestion);
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    // Dismiss contextual glow after 6 seconds to return to standard 1-tap reaction
    dismissTimerRef.current = setTimeout(() => {
      setActiveSuggestion(null);
    }, 6000);
  };

  const isHighValueCard = (card: Card) => {
    return card.value === 10 || (card.suit === 'PIQUE' && card.value === 9);
  };

  // Track opponent thinking time
  useEffect(() => {
    turnStartTimeRef.current = Date.now();
    if (isHumanTurn || disabled) {
      if (activeSuggestion?.key === 'SLOW_OPPONENT') {
        setActiveSuggestion(null);
      }
      return;
    }

    const interval = setInterval(() => {
      const elapsed = Date.now() - turnStartTimeRef.current;
      if (elapsed >= 6000 && !isHumanTurn && !disabled) {
        if (activeSuggestion?.key !== 'SLOW_OPPONENT') {
          showSuggestion({
            key: 'SLOW_OPPONENT',
            text: "On t'attend ! ⏳",
            emoji: '⏳',
            isContextual: true,
          });
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isHumanTurn, disabled]);

  // Monitor trick cards for triggers
  useEffect(() => {
    if (disabled) return;

    const cardsInCurrentTrick = currentTrick?.plays || [];
    const lastTrick = tricksHistory[tricksHistory.length - 1];
    const cardsInLastTrick = lastTrick?.plays || [];

    const currentCardKey =
      cardsInCurrentTrick.map((pc) => pc.card.id).join('-') +
      '|' +
      cardsInLastTrick.map((pc) => pc.card.id).join('-');

    if (currentCardKey === lastProcessedCardKeyRef.current) return;
    lastProcessedCardKeyRef.current = currentCardKey;

    // Trigger 1: High card under low card
    if (cardsInCurrentTrick.length >= 2) {
      const leadCard = cardsInCurrentTrick[0]?.card;
      if (leadCard && leadCard.value < 6) {
        const playedHighCard = cardsInCurrentTrick.slice(1).find((pc) => isHighValueCard(pc.card));
        if (playedHighCard) {
          showSuggestion({
            key: 'HIGH_UNDER_LOW',
            text: 'Gros sous petit ! 😱',
            emoji: '😱',
            isContextual: true,
          });
          return;
        }
      }
    }

    // Trigger 2: High card played early
    if (currentTrickNumber >= 1 && currentTrickNumber <= 4) {
      const lastPlayed =
        cardsInCurrentTrick[cardsInCurrentTrick.length - 1]?.card ||
        cardsInLastTrick[cardsInLastTrick.length - 1]?.card;
      if (lastPlayed && isHighValueCard(lastPlayed)) {
        showSuggestion({
          key: 'HIGH_CARD_EARLY',
          text: 'Gros coup ! 💥',
          emoji: '💥',
          isContextual: true,
        });
        return;
      }
    }
  }, [currentTrick, tricksHistory, currentTrickNumber, disabled]);

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  const currentText = activeSuggestion
    ? activeSuggestion.text
    : DEFAULT_PUNCHY_REACTIONS[defaultIndex].text;

  const currentEmoji = activeSuggestion
    ? activeSuggestion.emoji
    : DEFAULT_PUNCHY_REACTIONS[defaultIndex].emoji;

  const isContextual = Boolean(activeSuggestion?.isContextual);

  const handleClick = () => {
    if (disabled) return;
    triggerHaptic('medium');
    onSendEmote(currentText, currentEmoji);

    if (activeSuggestion) {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      setActiveSuggestion(null);
    } else {
      // Cycle to next default punchy reaction
      setDefaultIndex((prev) => (prev + 1) % DEFAULT_PUNCHY_REACTIONS.length);
    }
  };

  return (
    <button
      id="btn-quick-1tap-reaction"
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl font-extrabold text-xs transition-all cursor-pointer shadow-sm active:scale-95 shrink-0 select-none ${
        disabled
          ? 'opacity-50 cursor-not-allowed bg-slate-800 text-slate-500 border border-slate-700'
          : isContextual
          ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-slate-950 border border-amber-300 shadow-amber-500/20 animate-pulse'
          : 'bg-slate-800 hover:bg-amber-950/50 text-amber-300 hover:text-amber-200 border border-amber-500/30 hover:border-amber-400/60'
      }`}
      title={`Réplique rapide 1-tap : ${currentText}`}
    >
      <Zap className={`w-3.5 h-3.5 shrink-0 ${isContextual ? 'fill-slate-950 text-slate-950' : 'text-amber-400'}`} />
      <span className="truncate max-w-[85px] sm:max-w-[125px] inline-block align-middle">
        {currentText}
      </span>
      <span className="hidden lg:inline-block text-[9px] uppercase px-1 py-0.2 rounded bg-slate-950/30 text-amber-300/90 font-mono">
        1-tap
      </span>
    </button>
  );
};


