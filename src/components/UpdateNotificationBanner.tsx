import React from 'react';
import { Sparkles, CheckCircle2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface UpdateNotificationBannerProps {
  updateAvailable: boolean;
  isReloading: boolean;
  onUpdateNow: () => void;
  isGameActive?: boolean;
}

export const UpdateNotificationBanner: React.FC<UpdateNotificationBannerProps> = ({
  updateAvailable,
  isReloading,
  onUpdateNow,
  isGameActive = false,
}) => {
  return (
    <AnimatePresence>
      {updateAvailable && (
        <motion.div
          layout
          initial={{ opacity: 0, y: -40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -40, scale: 0.96 }}
          className="pointer-events-auto w-[calc(100%-1.5rem)] sm:w-96 max-w-sm px-3.5 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 border border-amber-200/90 shadow-[0_10px_30px_rgba(245,158,11,0.35)] text-slate-950 flex items-center justify-between gap-2.5 backdrop-blur-md"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-xl bg-slate-950 flex items-center justify-center shrink-0 shadow-inner">
              {isReloading ? (
                <RefreshCw className="w-4 h-4 text-amber-400 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 text-amber-400" />
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-black leading-tight text-slate-950">
                {isReloading ? 'Actualisation...' : 'Mise à jour prête !'}
              </span>
              <span className="text-[10px] font-bold text-slate-900/80 truncate">
                {isGameActive
                  ? 'Finissez le tour ou appliquez maintenant'
                  : 'Nouvelle version disponible'}
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled={isReloading}
            onClick={onUpdateNow}
            className="shrink-0 px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-900 active:scale-95 text-amber-300 text-[11px] font-black shadow-md transition cursor-pointer flex items-center gap-1 disabled:opacity-60"
          >
            {isReloading ? (
              <span>...</span>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                <span>Mettre à jour</span>
              </>
            )}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
