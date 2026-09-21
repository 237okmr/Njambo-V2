import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Flame, Zap, Sparkles, TrendingUp } from 'lucide-react';
import { sounds, triggerHaptic } from '../utils/sound';

interface BetIncreaseCountUpBannerProps {
  currentBaseBet: number;
}

export const BetIncreaseCountUpBanner: React.FC<BetIncreaseCountUpBannerProps> = ({
  currentBaseBet,
}) => {
  const [showAnimation, setShowAnimation] = useState(false);
  const [displayValue, setDisplayValue] = useState<number>(currentBaseBet);
  const [startValue, setStartValue] = useState<number>(currentBaseBet);
  const [targetValue, setTargetValue] = useState<number>(currentBaseBet);

  const prevBetRef = useRef<number>(currentBaseBet);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    // Detect bet increase
    if (prevBetRef.current !== undefined && currentBaseBet > prevBetRef.current) {
      const from = prevBetRef.current;
      const to = currentBaseBet;

      setStartValue(from);
      setTargetValue(to);
      setDisplayValue(from);
      setShowAnimation(true);

      sounds.playBetIncreaseCountUp();
      triggerHaptic('success');

      const durationMs = 1200;
      const startTime = performance.now();

      const updateCounter = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / durationMs);

        // Ease-out cubic calculation for smooth rapid rollout
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const currentVal = Math.round(from + (to - from) * easeOut);
        setDisplayValue(currentVal);

        if (progress < 1) {
          animFrameRef.current = requestAnimationFrame(updateCounter);
        } else {
          setDisplayValue(to);
          // Auto-hide the celebratory overlay after a brief stay
          setTimeout(() => {
            setShowAnimation(false);
          }, 1800);
        }
      };

      animFrameRef.current = requestAnimationFrame(updateCounter);
    }

    prevBetRef.current = currentBaseBet;

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [currentBaseBet]);

  return (
    <AnimatePresence>
      {showAnimation && (
        <motion.div
          initial={{ opacity: 0, scale: 0.75, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.85, y: -10 }}
          transition={{ type: 'spring', damping: 18, stiffness: 320 }}
          className="absolute inset-0 z-40 flex items-center justify-center p-3 pointer-events-none"
        >
          {/* Glowing backdrop halo */}
          <div className="absolute w-72 h-36 bg-amber-500/25 rounded-full blur-2xl animate-pulse" />

          {/* Golden Badge Card */}
          <div className="relative flex flex-col items-center justify-center gap-1.5 px-6 py-4 rounded-2xl bg-gradient-to-b from-slate-900/95 via-amber-950/95 to-slate-950/95 border-2 border-amber-400 shadow-[0_0_40px_rgba(245,158,11,0.5),inset_0_1px_1px_rgba(255,255,255,0.4)] backdrop-blur-md text-center max-w-xs sm:max-w-sm">
            {/* Top Tag */}
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/60 text-amber-300 text-[10px] sm:text-xs font-black uppercase tracking-wider">
              <Flame className="w-3.5 h-3.5 text-amber-400 animate-bounce" />
              <span>Mise augmentée</span>
              <Sparkles className="w-3 h-3 text-amber-300" />
            </div>

            {/* Fast Animated Counter */}
            <div className="flex items-baseline justify-center gap-2 my-0.5">
              <span className="text-xs font-bold text-slate-400 line-through opacity-75 font-mono">
                {startValue}
              </span>
              <TrendingUp className="w-4 h-4 text-amber-400" />
              <motion.span
                key={displayValue}
                initial={{ scale: 1.15 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.1 }}
                className="text-3xl sm:text-4xl font-black font-mono text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-yellow-300 drop-shadow-[0_2px_10px_rgba(245,158,11,0.6)]"
              >
                {displayValue}
              </motion.span>
              <span className="text-sm sm:text-base font-black text-amber-300 font-mono">jetons</span>
            </div>

            {/* Subtitle */}
            <div className="flex items-center gap-1 text-[11px] text-amber-200/90 font-medium">
              <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />
              <span>Unanimité atteinte · Dès la prochaine donne !</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
