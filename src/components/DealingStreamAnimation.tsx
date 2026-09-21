import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Player } from '../types';
import { Sparkles, Layers } from 'lucide-react';
import { sounds } from '../utils/sound';

interface DealingStreamAnimationProps {
  isDealing: boolean;
  dealerIndex: number;
  leadIndex: number;
  players: Player[];
}

export const DealingStreamAnimation: React.FC<DealingStreamAnimationProps> = ({
  isDealing,
  dealerIndex,
  leadIndex,
  players,
}) => {
  const [dealStage, setDealStage] = useState<'IDLE' | 'PASS_1' | 'PASS_2'>('IDLE');

  useEffect(() => {
    if (!isDealing) {
      setDealStage('IDLE');
      return;
    }

    // Play initial deal sound
    sounds.playShuffle();
    setDealStage('PASS_1');

    const timerPass2 = setTimeout(() => {
      setDealStage('PASS_2');
      sounds.playCardPlay();
    }, 550);

    return () => {
      clearTimeout(timerPass2);
    };
  }, [isDealing]);

  if (!isDealing || players.length === 0) return null;

  const dealer = players[dealerIndex] || players[0];
  const activePlayersCount = players.filter((p) => !p.isEliminated).length;

  // Calculate position offsets for diamond positions (North, West, East, South)
  const getPlayerPositionOffset = (index: number) => {
    // 0: Human (South / Bottom)
    // 1: West (Left)
    // 2: North (Top)
    // 3: East (Right)
    const pos = index % 4;
    switch (pos) {
      case 0:
        return { x: 0, y: 140 }; // South
      case 1:
        return { x: -160, y: -20 }; // West
      case 2:
        return { x: 0, y: -140 }; // North
      case 3:
        return { x: 160, y: -20 }; // East
      default:
        return { x: 0, y: 0 };
    }
  };

  const dealerOffset = getPlayerPositionOffset(dealerIndex);

  // Compute turn order for distribution starting from leadIndex up to dealerIndex
  const activePlayers = players.filter((p) => !p.isEliminated);
  const dealOrderIndices: number[] = [];
  let curr = leadIndex;
  for (let i = 0; i < players.length; i++) {
    if (!players[curr].isEliminated) {
      dealOrderIndices.push(curr);
    }
    curr = (curr + 1) % players.length;
  }

  return (
    <div className="absolute inset-0 pointer-events-none z-30 flex flex-col items-center justify-center overflow-hidden">
      {/* Banner Indicator in Play Zone */}
      <AnimatePresence mode="wait">
        <motion.div
          key={dealStage}
          initial={{ opacity: 0, y: -8, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.9 }}
          transition={{ duration: 0.18 }}
          className="bg-slate-950/95 border border-amber-400/80 px-4 py-1.5 rounded-full shadow-[0_0_20px_rgba(245,158,11,0.35)] flex items-center gap-2 backdrop-blur-md"
        >
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping shrink-0" />
          <Layers className="w-4 h-4 text-amber-400" />
          <div className="text-xs font-black tracking-wide text-amber-200">
            {dealStage === 'PASS_1' ? (
              <span>
                1ère Passe : <span className="text-amber-400 font-extrabold">3 CARTES</span> / joueur
              </span>
            ) : (
              <span>
                2ème Passe : <span className="text-amber-400 font-extrabold">2 CARTES</span> / joueur
              </span>
            )}
          </div>
          <span className="text-slate-400 text-[10px] border-l border-slate-700 pl-2">
            Donneur : <b className="text-slate-200">{dealer?.name?.split(' ')[0]}</b>
          </span>
        </motion.div>
      </AnimatePresence>

      {/* Flying Card Packets for active players */}
      <div className="relative w-full h-full flex items-center justify-center">
        {dealOrderIndices.map((playerIdx, orderOrder) => {
          const targetOffset = getPlayerPositionOffset(playerIdx);
          const isPass1 = dealStage === 'PASS_1';
          const cardCountInPacket = isPass1 ? 3 : 2;
          const staggerDelay = orderOrder * 0.08;

          return (
            <motion.div
              key={`deal_pkt_${dealStage}_p${playerIdx}`}
              initial={{
                x: dealerOffset.x,
                y: dealerOffset.y,
                scale: 0.4,
                opacity: 0,
                rotate: -15,
              }}
              animate={{
                x: targetOffset.x,
                y: targetOffset.y,
                scale: [0.5, 1, 0.85],
                opacity: [0, 1, 0.9],
                rotate: [0, 10, 0],
              }}
              transition={{
                duration: 0.38,
                delay: staggerDelay,
                ease: 'easeOut',
              }}
              className="absolute flex items-center justify-center"
            >
              {/* Stack of face-down mini cards */}
              <div className="relative w-10 h-14 bg-gradient-to-br from-indigo-900 to-slate-900 rounded-lg border-2 border-amber-400/90 shadow-xl flex items-center justify-center">
                <div className="w-7 h-10 border border-indigo-400/40 rounded flex items-center justify-center bg-indigo-950/80">
                  <span className="text-[10px] font-black text-amber-300">🂠</span>
                </div>
                {/* Visual badge showing packet size (+3 or +2) */}
                <div className="absolute -top-2 -right-2 bg-amber-400 text-slate-950 text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-md ring-1 ring-amber-300 animate-bounce">
                  +{cardCountInPacket}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
