import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sliders, RotateCcw, Check, Sparkles, Users, Coins } from 'lucide-react';

export interface AdvancedRoomFilters {
  betLevel: 'ALL' | 'SMALL' | 'MEDIUM' | 'LARGE';
  playerCapacity: 'ALL' | 2 | 3 | 4;
  requireDoubleKora: boolean;
  requireUnder21: boolean;
}

interface RoomFilterBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  filters: AdvancedRoomFilters;
  onApply: (filters: AdvancedRoomFilters) => void;
  onReset: () => void;
}

export const RoomFilterBottomSheet: React.FC<RoomFilterBottomSheetProps> = ({
  isOpen,
  onClose,
  filters,
  onApply,
  onReset,
}) => {
  const [localFilters, setLocalFilters] = React.useState<AdvancedRoomFilters>(filters);

  React.useEffect(() => {
    setLocalFilters(filters);
  }, [filters, isOpen]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[75] bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
        {/* Backdrop click */}
        <div className="absolute inset-0" onClick={onClose} />

        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          className="relative bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl flex flex-col gap-4 max-h-[85vh] overflow-y-auto no-scrollbar"
        >
          {/* Top handle on mobile */}
          <div className="w-12 h-1.5 bg-slate-700 rounded-full mx-auto -mt-1 mb-1 sm:hidden shrink-0" />

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders className="w-5 h-5 text-amber-400" />
              <h3 className="text-base font-black text-white">Filtres Avancés des Salons</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 1. Niveau de mise en Jetons (🪙) */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 text-amber-400" /> Niveau de Mise (Jetons)
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLocalFilters((prev) => ({ ...prev, betLevel: 'ALL' }))}
                className={`h-10 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center justify-center ${
                  localFilters.betLevel === 'ALL'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow-sm'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                Toutes les Mises
              </button>
              <button
                type="button"
                onClick={() => setLocalFilters((prev) => ({ ...prev, betLevel: 'SMALL' }))}
                className={`h-10 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center justify-center ${
                  localFilters.betLevel === 'SMALL'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow-sm'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                Petites (10 - 25 🪙)
              </button>
              <button
                type="button"
                onClick={() => setLocalFilters((prev) => ({ ...prev, betLevel: 'MEDIUM' }))}
                className={`h-10 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center justify-center ${
                  localFilters.betLevel === 'MEDIUM'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow-sm'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                Moyennes (50 🪙)
              </button>
              <button
                type="button"
                onClick={() => setLocalFilters((prev) => ({ ...prev, betLevel: 'LARGE' }))}
                className={`h-10 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center justify-center ${
                  localFilters.betLevel === 'LARGE'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow-sm'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                Grosses (100+ 🪙)
              </button>
            </div>
          </div>

          {/* 2. Capacité de Joueurs */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-blue-400" /> Capacité de la Table
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {(['ALL', 2, 3, 4] as const).map((cap) => (
                <button
                  key={String(cap)}
                  type="button"
                  onClick={() => setLocalFilters((prev) => ({ ...prev, playerCapacity: cap }))}
                  className={`h-9 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center justify-center ${
                    localFilters.playerCapacity === cap
                      ? 'bg-blue-500 text-white border-blue-400 font-black shadow-sm'
                      : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  {cap === 'ALL' ? 'Tous' : `${cap} Joueurs`}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Variantes Spécifiques */}
          <div className="flex flex-col gap-2 pt-2 border-t border-slate-800">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> Variantes Requises
            </span>
            <div className="flex flex-col gap-2">
              <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white">Double Kora (×4)</span>
                  <span className="text-[10px] text-slate-400">Multiplier les gains lors d'un Kora</span>
                </div>
                <input
                  type="checkbox"
                  checked={localFilters.requireDoubleKora}
                  onChange={(e) => setLocalFilters((prev) => ({ ...prev, requireDoubleKora: e.target.checked }))}
                  className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 bg-slate-900 border-slate-700"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white">Moins de 21</span>
                  <span className="text-[10px] text-slate-400">Victoire si somme de la main ≤ 21</span>
                </div>
                <input
                  type="checkbox"
                  checked={localFilters.requireUnder21}
                  onChange={(e) => setLocalFilters((prev) => ({ ...prev, requireUnder21: e.target.checked }))}
                  className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 bg-slate-900 border-slate-700"
                />
              </label>
            </div>
          </div>

          {/* Actions Bottom */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => {
                onReset();
                setLocalFilters({
                  betLevel: 'ALL',
                  playerCapacity: 'ALL',
                  requireDoubleKora: false,
                  requireUnder21: false,
                });
                onClose();
              }}
              className="h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Réinitialiser</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onApply(localFilters);
                onClose();
              }}
              className="h-11 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Appliquer</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
