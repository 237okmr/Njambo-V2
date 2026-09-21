import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Flame, X } from 'lucide-react';
import { sounds } from '../utils/sound';

interface KoraHunterAlertBannerProps {
  show: boolean;
  onDismiss: () => void;
}

export const KoraHunterAlertBanner: React.FC<KoraHunterAlertBannerProps> = ({
  show,
  onDismiss,
}) => {
  useEffect(() => {
    if (show) {
      sounds.playCutSlash();
      const timer = setTimeout(() => {
        onDismiss();
      }, 4500); // Auto dismiss after 4.5s
      return () => clearTimeout(timer);
    }
  }, [show, onDismiss]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -15, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="pointer-events-auto w-full max-w-sm"
        >
          {/* Sleek, thin, single-row high-contrast tactical banner */}
          <div className="relative rounded-xl bg-amber-950/95 border border-yellow-500/40 shadow-xl px-3.5 py-2.5 text-slate-100 flex items-center justify-between gap-3 backdrop-blur-md">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex items-center justify-center p-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/30 shrink-0">
                <Flame className="w-4 h-4 text-yellow-400 fill-yellow-400/20 animate-pulse" />
              </div>
              
              <div className="min-w-0">
                <span className="text-[11px] font-black uppercase tracking-wider text-yellow-400 mr-1.5 inline-flex items-center">
                  🔥 Chasseur de Kora !
                </span>
                <span className="text-[11px] text-amber-200/90 font-medium inline">
                  Un joueur prépare un Kora (victoire au 3). Protégez vos cartes !
                </span>
              </div>
            </div>

            {/* Simple elegant close button */}
            <button
              type="button"
              onClick={onDismiss}
              className="-mr-1 flex h-11 w-11 items-center justify-center rounded-lg text-amber-300/60 hover:text-yellow-100 hover:bg-yellow-950/50 transition-colors shrink-0"
              aria-label="Fermer l'alerte"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

