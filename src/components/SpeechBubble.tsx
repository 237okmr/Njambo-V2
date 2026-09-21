import React from 'react';
import { motion } from 'motion/react';

export interface SpeechBubbleProps {
  text: string;
  emoji?: string;
  authorName?: string;
  authorIcon?: string;
  authorType?: 'human' | 'bot' | 'remote';
  badgeBg?: string;
  bubbleBorder?: string;
  className?: string;
}

export const SpeechBubble: React.FC<SpeechBubbleProps> = ({
  text,
  emoji,
  authorName = 'Joueur',
  authorIcon,
  authorType = 'bot',
  badgeBg,
  bubbleBorder,
  className = '',
}) => {
  const isEmojiOnly = Boolean(emoji && text.trim() === emoji.trim());

  // Default color schemes based on authorType (bot = amber/gold, human = emerald, remote = cyan/indigo)
  const defaultStyles =
    authorType === 'human'
      ? {
          badge: 'bg-emerald-950 text-emerald-300 border-emerald-500/60 shadow-emerald-950/40',
          border: 'border-emerald-500/60 shadow-emerald-950/50',
          arrowBorder: 'border-emerald-500/60',
          icon: '👤',
        }
      : authorType === 'remote'
      ? {
          badge: 'bg-cyan-950 text-cyan-300 border-cyan-500/60 shadow-cyan-950/40',
          border: 'border-cyan-400/60 shadow-cyan-950/50',
          arrowBorder: 'border-cyan-400/60',
          icon: '🌐',
        }
      : {
          badge: 'bg-amber-950 text-amber-300 border-amber-500/60 shadow-amber-950/40',
          border: 'border-amber-400/70 shadow-amber-950/50',
          arrowBorder: 'border-amber-400/70',
          icon: '🤖',
        };

  const activeBadgeBg = badgeBg || defaultStyles.badge;
  const activeBubbleBorder = bubbleBorder || defaultStyles.border;
  const activeArrowBorder = defaultStyles.arrowBorder;
  const activeIcon = authorIcon || defaultStyles.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.88, y: -6 }}
      transition={{ type: 'spring', damping: 20, stiffness: 380 }}
      className={`pointer-events-none select-none ${className}`}
    >
      <div
        className={`relative flex items-center gap-2.5 px-3.5 pt-3.5 pb-2.5 rounded-2xl bg-slate-950/95 border ${activeBubbleBorder} shadow-[0_8px_24px_rgba(0,0,0,0.7)] backdrop-blur-md max-w-[88vw] sm:max-w-md w-fit mx-auto text-left`}
      >
        {/* Top Header Badge: Author Name / Pseudo */}
        <div
          className={`absolute -top-2.5 left-3 sm:left-4 px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-md whitespace-nowrap ${activeBadgeBg}`}
        >
          <span className="text-[11px] leading-none">{activeIcon}</span>
          <span className="truncate max-w-[130px] sm:max-w-[180px]">{authorName}</span>
        </div>

        {/* Message Content: Full, complete text with emoji */}
        <div className="flex items-center gap-2 min-w-0 pt-0.5">
          {emoji && !text.includes(emoji) && (
            <span className="text-base sm:text-lg leading-none shrink-0 drop-shadow-xs">
              {emoji}
            </span>
          )}
          <span
            className={`font-bold text-slate-100 leading-snug break-words ${
              isEmojiOnly
                ? 'text-xl sm:text-2xl py-0.5'
                : 'text-xs sm:text-sm'
            }`}
          >
            {text}
          </span>
        </div>

        {/* Comic-style Pointer Arrow pointing down towards the table */}
        <div
          className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-slate-950 border-r border-b ${activeArrowBorder} rotate-45`}
        />
      </div>
    </motion.div>
  );
};

