import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, Home, Save, Sparkles, ShieldCheck } from 'lucide-react';
import { GameState } from '../types';
import { triggerHaptic } from '../utils/sound';

interface SoloPauseOverlayProps {
  show: boolean;
  gameState: GameState;
  onResume: () => void;
  onReturnHome: () => void;
}

export const SoloPauseOverlay: React.FC<SoloPauseOverlayProps> = ({
  show,
  gameState,
  onResume,
  onReturnHome,
}) => {
  if (!show) return null;

  const currentTurnPlayer = gameState.players?.[gameState.currentTurnIndex];
  const isHumanTurn = currentTurnPlayer?.isHuman ?? true;

  return (
    <AnimatePresence>
      <div
        id="solo-pause-overlay"
        className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-fade-in"
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 20 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          className="relative w-full max-w-md rounded-3xl p-6 sm:p-8 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-slate-700/70 shadow-2xl text-center text-slate-100 flex flex-col items-center gap-5 overflow-hidden"
        >
          {/* Pause Icon Header */}
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-emerald-500/10 border border-amber-500/30 flex items-center justify-center shadow-inner text-amber-400">
            <Pause className="w-8 h-8 fill-amber-400/20" />
          </div>

          {/* Title & Subtitle */}
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight flex items-center justify-center gap-2">
              <span>Partie en pause</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 font-medium max-w-xs mx-auto leading-relaxed">
              La table a été figée automatiquement lors de la mise en veille.
            </p>
          </div>

          {/* Game Context Capsule */}
          <div className="w-full bg-slate-800/60 border border-slate-700/50 rounded-2xl p-3.5 flex items-center justify-around text-xs">
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Mise</span>
              <span className="font-extrabold text-amber-300 text-sm">{gameState.baseBet || 10} 🪙</span>
            </div>
            <div className="w-px h-7 bg-slate-700/60" />
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Pli</span>
              <span className="font-extrabold text-slate-200 text-sm">
                {gameState.currentTrickNumber || 1} / 5
              </span>
            </div>
            <div className="w-px h-7 bg-slate-700/60" />
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Tour</span>
              <span className={`font-extrabold text-sm ${isHumanTurn ? 'text-emerald-400' : 'text-cyan-300'}`}>
                {isHumanTurn ? 'À vous' : currentTurnPlayer?.name || 'IA'}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="w-full flex flex-col gap-2.5 pt-1">
            <button
              type="button"
              id="btn-resume-solo-game"
              onClick={() => {
                triggerHaptic('success');
                onResume();
              }}
              className="w-full h-12 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 active:scale-[0.98] text-slate-950 font-black text-sm tracking-wide shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <Play className="w-4 h-4 fill-slate-950" />
              <span>Reprendre la partie</span>
            </button>

            <button
              type="button"
              id="btn-pause-return-home"
              onClick={() => {
                triggerHaptic('light');
                onReturnHome();
              }}
              className="w-full h-10 rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 active:scale-[0.98] text-slate-300 font-semibold text-xs border border-slate-700/60 flex items-center justify-center gap-1.5 cursor-pointer transition"
            >
              <Save className="w-3.5 h-3.5 text-slate-400" />
              <span>Sauvegarder et quitter</span>
            </button>
          </div>

          {/* Status micro-pill */}
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400/90 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Votre progression et vos jetons sont sécurisés</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
