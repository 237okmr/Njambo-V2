import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Smile, X, Flame, Sparkles, Zap, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { triggerHaptic } from '../utils/sound';

export const NJAMBO_TACTICAL_PHRASES = [
  'Accélérons : augmentons la mise ! ⚡',
  'Dernière donne pour moi ! ⏳',
  'Finissons-en vite ! 🤝',
  'On double la mise ? 🚀',
  'Jouons plus vite svp ! ⏱️',
];

export const NJAMBO_PHRASES = [
  'Tu es coupé ! ✂️',
  'Kora arrive ! 👑',
  'On monte la mise ? ⚡',
  'Petit 3 bien placé ! 🔥',
  'Massa ! 🤯',
  "Je t'attends au 5ᵉ tour ! ⏳",
  'Bien joué ! 👏',
  'Aïe aïe aïe ! 😭',
  'Ça va barder ! ⚡',
];

export const NJAMBO_EMOJIS = ['👑', '🔥', '🎯', '😎', '✂️', '🤫', '👏', '😂', '💪', '😱'];

interface EmotePickerPopoverProps {
  onSendEmote: (text: string, emoji?: string) => void;
  disabled?: boolean;
  onProposeBetIncrease?: () => void;
}

export const EmotePickerPopover: React.FC<EmotePickerPopoverProps> = ({
  onSendEmote,
  disabled = false,
  onProposeBetIncrease,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState<'TACTICAL' | 'CLASSIC'>('TACTICAL');
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (text: string, emoji?: string, isBetProposalPhrase?: boolean) => {
    triggerHaptic('medium');
    onSendEmote(text, emoji);
    setIsOpen(false);
    if (isBetProposalPhrase && onProposeBetIncrease) {
      setTimeout(() => {
        onProposeBetIncrease();
      }, 300);
    }
  };

  return (
    <div className="relative inline-block" ref={popoverRef}>
      <button
        type="button"
        id="btn-open-emote-picker"
        disabled={disabled}
        onClick={() => {
          triggerHaptic('light');
          setIsOpen(!isOpen);
        }}
        aria-label="Envoyer une réplique ou une émote"
        className={`p-2 rounded-xl border flex items-center justify-center transition-all cursor-pointer shadow-sm ${
          isOpen
            ? 'bg-amber-500/20 text-amber-300 border-amber-400/60 ring-2 ring-amber-400/40'
            : 'bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-amber-300 border-slate-700/80 hover:border-amber-500/40 active:scale-95'
        } ${disabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}
        title="Répliques & Émotes Njambo"
      >
        <MessageSquare className="w-4 h-4 text-amber-400" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Mobile-only subtle backdrop for safe dismiss */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-[1px] sm:hidden"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 10 }}
              transition={{ type: 'spring', damping: 24, stiffness: 380 }}
              className="fixed bottom-20 left-3 right-3 max-w-sm mx-auto sm:mx-0 sm:absolute sm:bottom-full sm:left-0 sm:right-auto sm:mb-2 sm:w-80 p-3.5 bg-slate-950/98 border border-slate-700/90 rounded-2xl shadow-2xl backdrop-blur-xl z-50 text-xs"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/80 mb-2.5">
                <div className="flex items-center gap-1.5 font-bold text-amber-300 text-xs tracking-wide">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Répliques & Émotes</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                  aria-label="Fermer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Quick Emoji Bar */}
              <div className="flex items-center justify-between gap-1.5 mb-2.5 overflow-x-auto py-1 px-0.5 no-scrollbar">
                {NJAMBO_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleSelect(emoji, emoji)}
                    className="w-8 h-8 rounded-lg bg-slate-900 hover:bg-amber-500/20 active:bg-amber-500/30 border border-slate-800 hover:border-amber-400/50 flex items-center justify-center text-base transition-transform active:scale-95 shrink-0 cursor-pointer"
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              {/* Category Tab Switcher */}
              <div className="flex items-center gap-1 mb-2 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setCategory('TACTICAL')}
                  className={`flex-1 py-1 px-2 rounded-lg font-bold text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    category === 'TACTICAL'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Zap className="w-3 h-3 text-amber-400" />
                  <span>Mises & Rythme</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCategory('CLASSIC')}
                  className={`flex-1 py-1 px-2 rounded-lg font-bold text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    category === 'CLASSIC'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <MessageSquare className="w-3 h-3 text-cyan-400" />
                  <span>Table Njambo</span>
                </button>
              </div>

              {/* Tactical Action & Phrases */}
              {category === 'TACTICAL' && (
                <div className="space-y-1.5">
                  {onProposeBetIncrease && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('medium');
                        setIsOpen(false);
                        onProposeBetIncrease();
                      }}
                      className="w-full p-2 rounded-lg bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 text-amber-300 border border-amber-500/40 flex items-center justify-between font-bold text-xs transition cursor-pointer group shadow-sm active:scale-[0.98]"
                    >
                      <div className="flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                        <span>Proposer une hausse de mise</span>
                      </div>
                      <span className="text-[10px] bg-amber-500/30 px-2 py-0.5 rounded text-amber-200 font-mono">
                        Voter ↗
                      </span>
                    </button>
                  )}
                  <div className="grid grid-cols-1 gap-1.5 max-h-44 overflow-y-auto pr-0.5 overscroll-contain">
                    {NJAMBO_TACTICAL_PHRASES.map((phrase) => {
                      const isRaise = phrase.includes('mise');
                      return (
                        <button
                          key={phrase}
                          type="button"
                          onClick={() => handleSelect(phrase, undefined, isRaise)}
                          className="w-full text-left px-3 py-2 rounded-lg bg-slate-900/85 hover:bg-amber-950/40 active:bg-amber-950/60 text-slate-200 hover:text-amber-200 border border-slate-800/90 hover:border-amber-500/40 transition flex items-center justify-between group active:scale-[0.98] cursor-pointer"
                        >
                          <span className="font-semibold text-xs truncate">{phrase}</span>
                          <span className="text-[10px] text-amber-400/70 group-hover:text-amber-400 font-medium shrink-0 ml-2">
                            {isRaise ? 'Proposer →' : 'Dire →'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Classic Phrases List */}
              {category === 'CLASSIC' && (
                <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto pr-0.5 overscroll-contain">
                  {NJAMBO_PHRASES.map((phrase) => (
                    <button
                      key={phrase}
                      type="button"
                      onClick={() => handleSelect(phrase)}
                      className="w-full text-left px-3 py-2 rounded-lg bg-slate-900/85 hover:bg-amber-950/40 active:bg-amber-950/60 text-slate-200 hover:text-amber-200 border border-slate-800/90 hover:border-amber-500/40 transition flex items-center justify-between group active:scale-[0.98] cursor-pointer"
                    >
                      <span className="font-semibold text-xs truncate">{phrase}</span>
                      <span className="text-[10px] text-cyan-400/70 group-hover:text-cyan-400 font-medium shrink-0 ml-2">
                        Dire →
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
