import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Crown, Flame, Zap, Trophy, Coins, Sparkles, Check, ArrowRight } from 'lucide-react';
import confetti from 'canvas-confetti';
import { PartieWinType, Player } from '../types';

interface KoraVictoryOverlayProps {
  show: boolean;
  winnerName: string;
  winnerIndex: number | null;
  winType: PartieWinType;
  pot: number;
  baseBet: number;
  players: Player[];
  onContinue: () => void;
}

export const KoraVictoryOverlay: React.FC<KoraVictoryOverlayProps> = ({
  show,
  winnerName,
  winnerIndex,
  winType,
  pot,
  baseBet,
  players,
  onContinue,
}) => {
  const isSpecialWin = show && Boolean(winType) && winType !== 'STANDARD';

  useEffect(() => {
    if (isSpecialWin) {
      const colorsMap: Record<string, string[]> = {
        DOUBLE_KORA: ['#a855f7', '#c084fc', '#e9d5ff', '#fbbf24', '#f59e0b'],
        KORA: ['#fbbf24', '#f59e0b', '#d97706', '#ef4444', '#f87171'],
        THREE_SEVENS: ['#facc15', '#eab308', '#f59e0b', '#ffffff', '#fbbf24'],
        UNDER_21: ['#34d399', '#10b981', '#059669', '#6ee7b7', '#a7f3d0'],
        FORFEIT: ['#fbbf24', '#f59e0b', '#d97706', '#94a3b8', '#cbd5e1'],
      };

      // Fire confetti burst
      confetti({
        particleCount: winType === 'DOUBLE_KORA' || winType === 'THREE_SEVENS' ? 200 : 130,
        spread: 90,
        origin: { y: 0.5 },
        colors: colorsMap[winType] || ['#fbbf24', '#f59e0b', '#ffffff'],
      });

      const secondBurst = setTimeout(() => {
        confetti({
          particleCount: 80,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
        });
        confetti({
          particleCount: 80,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
        });
      }, 400);

      const autoDismissTimer = setTimeout(() => {
        onContinue();
      }, 3800);

      return () => {
        clearTimeout(secondBurst);
        clearTimeout(autoDismissTimer);
      };
    }
  }, [isSpecialWin, winType, onContinue]);

  if (!isSpecialWin) return null;

  const winner = winnerIndex !== null && winnerIndex !== undefined ? players[winnerIndex] : null;
  const isHumanWinner = winner?.isHuman ?? false;

  const config = (() => {
    switch (winType) {
      case 'DOUBLE_KORA':
        return {
          title: 'VICTOIRE PAR DOUBLE KORA !',
          icon: <Zap className="w-4 h-4 fill-yellow-300 text-yellow-300 animate-bounce" />,
          mainIcon: <Crown className="w-12 h-12 sm:w-14 sm:h-14 fill-current drop-shadow-md" />,
          badgeBg: 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white border-purple-300 shadow-purple-500/50',
          iconBg: 'bg-gradient-to-tr from-purple-600 to-indigo-400 border-purple-200 text-white shadow-purple-500/60',
          cardBg: 'bg-gradient-to-b from-purple-950 via-slate-900 to-slate-950 border-purple-400 shadow-purple-500/40',
          raysBg: 'from-purple-600/40 via-indigo-900/10 to-transparent',
          btnBg: 'bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-400 hover:to-indigo-400 text-white shadow-purple-500/30',
          description: 'A terrassé tous ses adversaires en remportant le 4ᵉ et le 5ᵉ tour décisif avec des "3" (Double Kora) !',
          tagText: 'MISES X4',
          penaltyText: `${baseBet * 4} pts / j.`,
        };
      case 'THREE_SEVENS':
        return {
          title: '🎰 JACKPOT 777 · TROIS SEPTS !',
          icon: <Sparkles className="w-4 h-4 text-slate-950 fill-slate-950 animate-spin" />,
          mainIcon: <Trophy className="w-12 h-12 sm:w-14 sm:h-14 fill-current drop-shadow-md" />,
          badgeBg: 'bg-gradient-to-r from-yellow-400 to-amber-500 text-slate-950 border-yellow-200 shadow-yellow-500/50',
          iconBg: 'bg-gradient-to-tr from-yellow-400 to-amber-300 border-amber-100 text-slate-950 shadow-yellow-500/60',
          cardBg: 'bg-gradient-to-b from-amber-950 via-yellow-950 to-slate-950 border-yellow-400 shadow-yellow-500/40',
          raysBg: 'from-yellow-500/40 via-amber-900/10 to-transparent',
          btnBg: 'bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 text-slate-950 shadow-yellow-500/30',
          description: 'A obtenu 3x Septs dès la distribution initiale et gagne immédiatement la manche !',
          tagText: '777 CUMULÉ',
          penaltyText: 'Victoire Cash',
        };
      case 'UNDER_21':
        return {
          title: '✨ MAIN INITIALE ≤ 21 !',
          icon: <Sparkles className="w-4 h-4 text-slate-950 fill-slate-950 animate-pulse" />,
          mainIcon: <Sparkles className="w-12 h-12 sm:w-14 sm:h-14 fill-current drop-shadow-md" />,
          badgeBg: 'bg-gradient-to-r from-emerald-400 to-teal-500 text-slate-950 border-emerald-200 shadow-emerald-500/50',
          iconBg: 'bg-gradient-to-tr from-emerald-400 to-teal-300 border-emerald-100 text-slate-950 shadow-emerald-500/60',
          cardBg: 'bg-gradient-to-b from-emerald-950 via-teal-950 to-slate-950 border-emerald-400 shadow-emerald-500/40',
          raysBg: 'from-emerald-500/40 via-teal-900/10 to-transparent',
          btnBg: 'bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-300 hover:to-teal-400 text-slate-950 shadow-emerald-500/30',
          description: 'A reçu une main initiale dont le total des cartes est ≤ 21, remportant la partie instantanément !',
          tagText: 'MAIN ≤ 21',
          penaltyText: 'Cash Direct',
        };
      case 'FORFEIT':
        return {
          title: '👑 VICTOIRE PAR FORFEIT !',
          icon: <Trophy className="w-4 h-4 text-slate-950 fill-slate-950" />,
          mainIcon: <Crown className="w-12 h-12 sm:w-14 sm:h-14 fill-current drop-shadow-md" />,
          badgeBg: 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 border-amber-200 shadow-amber-500/50',
          iconBg: 'bg-gradient-to-tr from-amber-400 to-yellow-300 border-yellow-100 text-slate-950 shadow-amber-500/60',
          cardBg: 'bg-gradient-to-b from-amber-950 via-slate-900 to-slate-950 border-amber-400 shadow-amber-500/40',
          raysBg: 'from-amber-500/40 via-orange-900/10 to-transparent',
          btnBg: 'bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 shadow-amber-500/30',
          description: 'Tous les adversaires ont quitté la table ou abandonné la manche.',
          tagText: 'FORFEIT',
          penaltyText: 'Part du Pot',
        };
      case 'KORA':
      default:
        return {
          title: 'VICTOIRE PAR KORA !',
          icon: <Flame className="w-4 h-4 fill-slate-950 text-slate-950 animate-pulse" />,
          mainIcon: <Crown className="w-12 h-12 sm:w-14 sm:h-14 fill-current drop-shadow-md" />,
          badgeBg: 'bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 border-amber-200 shadow-amber-500/50',
          iconBg: 'bg-gradient-to-tr from-amber-400 to-yellow-300 border-yellow-100 text-slate-950 shadow-yellow-500/60',
          cardBg: 'bg-gradient-to-b from-amber-950 via-slate-900 to-slate-950 border-amber-400 shadow-amber-500/40',
          raysBg: 'from-amber-500/40 via-orange-900/10 to-transparent',
          btnBg: 'bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 shadow-amber-500/30',
          description: 'A accompli l\'exploit du Kora en remportant le 5ᵉ et dernier tour décisif avec un "3" !',
          tagText: 'MISES X2',
          penaltyText: `${baseBet * 2} pts / j.`,
        };
    }
  })();

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6 bg-slate-950/90 backdrop-blur-lg">
        {/* Animated Rays Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
          <div
            className={`w-[200%] h-[200%] -top-1/2 -left-1/2 rounded-full animate-spin bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] ${config.raysBg}`}
            style={{ animationDuration: '20s' }}
          />
        </div>

        <motion.div
          initial={{ scale: 0.8, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.8, opacity: 0, y: 30 }}
          transition={{ type: 'spring', stiffness: 280, damping: 22 }}
          className={`relative w-full max-w-lg rounded-3xl p-4 sm:p-7 shadow-2xl border-2 text-center text-slate-100 flex flex-col items-center gap-3 sm:gap-4 overflow-hidden max-h-[92vh] overflow-y-auto ${config.cardBg}`}
        >
          {/* Header Badge */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: 'spring' }}
            className={`px-3 sm:px-4 py-1.5 rounded-full text-[10px] sm:text-xs font-black uppercase tracking-wider sm:tracking-widest shadow-lg flex items-center gap-1.5 border max-w-full ${config.badgeBg}`}
          >
            {config.icon}
            <span>{config.title}</span>
          </motion.div>

          {/* Crown / Main Icon */}
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className={`relative w-20 h-20 sm:w-24 sm:h-24 rounded-3xl flex items-center justify-center shadow-2xl border-2 ${config.iconBg}`}
          >
            {config.mainIcon}

            <div className="absolute -bottom-2 -right-2 px-2.5 py-0.5 rounded-lg bg-slate-950 text-amber-300 border border-amber-400 font-black text-xs shadow-md">
              {config.tagText}
            </div>
          </motion.div>

          {/* Winner Text */}
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center justify-center gap-2">
              <span>{winnerName}</span>
              {isHumanWinner && <span className="text-xs bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full font-extrabold">VOUS</span>}
            </h2>
            <p className="text-xs sm:text-sm font-semibold text-slate-300">
              {config.description}
            </p>
          </div>

          {/* Gains & Multiplier Summary */}
          <div className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl p-3 sm:p-4 grid grid-cols-2 gap-2 sm:gap-3 text-center">
            <div className="flex flex-col items-center justify-center border-r border-slate-800 pr-1 sm:pr-2">
              <span className="text-[10px] font-bold uppercase text-slate-400">Pot Récolté</span>
              <span className="text-sm sm:text-lg font-black text-amber-400 flex items-center gap-1 mt-0.5 justify-center">
                <Coins className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="truncate">+{pot} pts</span>
              </span>
            </div>

            <div className="flex flex-col items-center justify-center pl-1 sm:pl-2">
              <span className="text-[10px] font-bold uppercase text-slate-400">Statut du Gain</span>
              <span className="text-sm sm:text-lg font-black text-amber-300 flex items-center gap-1 mt-0.5 justify-center">
                <Zap className="w-4 h-4 shrink-0" />
                <span className="truncate">{config.penaltyText}</span>
              </span>
            </div>
          </div>

          {/* Action Button */}
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            type="button"
            onClick={onContinue}
            className={`w-full py-3 sm:py-3.5 px-4 sm:px-6 rounded-2xl font-black text-xs sm:text-base shadow-xl flex items-center justify-center gap-2 cursor-pointer transition-all ${config.btnBg}`}
          >
            <span>Voir le Bilan de la Partie</span>
            <ArrowRight className="w-5 h-5" />
          </motion.button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
