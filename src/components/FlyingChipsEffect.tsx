import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Coins } from 'lucide-react';

interface FlyingChipsEffectProps {
  winnerIndex: number | null;
  playerCount?: number;
  onComplete?: () => void;
}

interface ChipParticle {
  id: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  delay: number;
  size: number;
}

export const FlyingChipsEffect: React.FC<FlyingChipsEffectProps> = ({
  winnerIndex,
  playerCount = 4,
  onComplete,
}) => {
  const [particles, setParticles] = useState<ChipParticle[]>([]);

  useEffect(() => {
    if (winnerIndex === null || winnerIndex === undefined) return;

    // Coordinate helpers relative to screen center
    const getPos = (idx: number) => {
      switch (idx) {
        case 0: // Human / South (Bottom)
          return { x: 0, y: 150 };
        case 1: // West / Left
          return { x: -160, y: -40 };
        case 2: // North / Top
          return { x: 0, y: -160 };
        case 3: // East / Right
          return { x: 160, y: -40 };
        default:
          return { x: 0, y: 0 };
      }
    };

    const targetPos = getPos(winnerIndex);
    const newParticles: ChipParticle[] = [];
    let pId = 0;

    for (let pIdx = 0; pIdx < playerCount; pIdx++) {
      if (pIdx === winnerIndex) continue;
      const startPos = getPos(pIdx);

      // Generate 4-5 chips per loser
      for (let k = 0; k < 4; k++) {
        newParticles.push({
          id: pId++,
          startX: startPos.x + (Math.random() * 20 - 10),
          startY: startPos.y + (Math.random() * 20 - 10),
          targetX: targetPos.x + (Math.random() * 16 - 8),
          targetY: targetPos.y + (Math.random() * 16 - 8),
          delay: k * 0.06 + Math.random() * 0.04,
          size: 14 + Math.random() * 6,
        });
      }
    }

    setParticles(newParticles);

    const timer = setTimeout(() => {
      setParticles([]);
      if (onComplete) onComplete();
    }, 900);

    return () => clearTimeout(timer);
  }, [winnerIndex, playerCount, onComplete]);

  if (particles.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden flex items-center justify-center">
      <AnimatePresence>
        {particles.map((p) => (
          <motion.div
            key={p.id}
            initial={{
              x: p.startX,
              y: p.startY,
              scale: 0.7,
              opacity: 0.9,
              rotate: 0,
            }}
            animate={{
              x: p.targetX,
              y: p.targetY,
              scale: [0.7, 1.2, 0.4],
              opacity: [0.9, 1, 0],
              rotate: 360,
            }}
            transition={{
              duration: 0.65,
              delay: p.delay,
              ease: [0.25, 0.1, 0.25, 1],
            }}
            className="absolute flex items-center justify-center rounded-full bg-gradient-to-tr from-amber-600 via-yellow-400 to-amber-300 border border-yellow-100 shadow-[0_0_12px_rgba(251,191,36,0.8)] text-slate-950 font-black"
            style={{ width: p.size, height: p.size }}
          >
            <Coins className="w-2.5 h-2.5 text-slate-950" />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
