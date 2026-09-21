import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles, Check, Image as ImageIcon } from 'lucide-react';
import { AVATAR_OPTIONS, AvatarOptionId } from '../../types/playerProfile';
import { FlatAvatarIcon } from './FlatAvatarIcon';

export interface AvatarPickerBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  currentAvatarId: AvatarOptionId;
  photoURL?: string | null;
  onSelectAvatar: (avatarId: AvatarOptionId) => void;
}

/**
 * Mobile-friendly Bottom Sheet for Table Avatar selection.
 * Follows Arbitrage 3: smooth gesture-ready bottom slide, top drag handle,
 * 4x2 grid of avatars, high contrast tactile cards.
 */
export const AvatarPickerBottomSheet: React.FC<AvatarPickerBottomSheetProps> = ({
  isOpen,
  onClose,
  currentAvatarId,
  photoURL,
  onSelectAvatar,
}) => {
  if (!isOpen) return null;

  const handleSelect = (id: AvatarOptionId) => {
    onSelectAvatar(id);
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[80] bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 select-none">
        {/* Backdrop click */}
        <div className="absolute inset-0" onClick={onClose} />

        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          className="relative bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl max-w-lg w-full p-4 sm:p-6 shadow-2xl flex flex-col gap-3.5 max-h-[90vh] overflow-y-auto no-scrollbar"
        >
          {/* Top handle on mobile */}
          <div className="w-12 h-1.5 bg-slate-700 rounded-full mx-auto -mt-1 mb-1 sm:hidden shrink-0" />

          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-black text-white tracking-tight truncate">
                  Choisir votre Avatar de Table
                </h3>
                <p className="text-[11px] text-slate-400 truncate">
                  Visible par tous les joueurs en Solo et Multijoueur
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer active:scale-95 shrink-0"
              aria-label="Fermer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Optional Google Photo Option */}
          {photoURL && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => handleSelect('google')}
                className={`w-full p-2.5 rounded-xl border flex items-center justify-between gap-3 transition cursor-pointer active:scale-98 ${
                  currentAvatarId === 'google'
                    ? 'bg-amber-500/20 border-amber-400 ring-2 ring-amber-400/40'
                    : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={photoURL}
                    alt="Photo Google"
                    className="w-9 h-9 rounded-full border border-emerald-400 object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="text-left truncate">
                    <p className="text-xs font-bold text-white">Utiliser ma Photo Google</p>
                    <p className="text-[10px] text-slate-400">Photo de profil du compte lié</p>
                  </div>
                </div>

                {currentAvatarId === 'google' ? (
                  <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </span>
                ) : (
                  <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>Activer</span>
                  </span>
                )}
              </button>
            </div>
          )}

          {/* 4 columns x 2 rows Grid */}
          <div className="grid grid-cols-4 gap-2 sm:gap-3 py-1">
            {AVATAR_OPTIONS.map((opt) => {
              const isSelected = currentAvatarId === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelect(opt.id)}
                  className={`group relative flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-xl border transition-all duration-150 cursor-pointer active:scale-95 ${
                    isSelected
                      ? 'bg-amber-500/20 border-amber-400 shadow-lg ring-2 ring-amber-400/40 scale-[1.02]'
                      : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                  }`}
                  title={opt.description}
                >
                  {/* Flat Design Avatar on White Background */}
                  <div
                    className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center p-1.5 bg-white border-2 ${opt.borderClass} shadow-md transition-transform group-hover:scale-105`}
                  >
                    <FlatAvatarIcon avatarId={opt.id} />
                  </div>

                  {/* Name Label */}
                  <span
                    className={`text-[10px] sm:text-xs font-semibold mt-1.5 truncate w-full text-center tracking-tight ${
                      isSelected ? 'text-amber-300 font-bold' : 'text-slate-300 group-hover:text-white'
                    }`}
                  >
                    {opt.name}
                  </span>

                  {/* Selected checkmark badge */}
                  {isSelected && (
                    <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center shadow">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer note / dismiss */}
          <button
            type="button"
            onClick={onClose}
            className="w-full h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer active:scale-98 mt-1"
          >
            Fermer
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
