import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Lock, ShieldAlert, ShieldCheck, Sparkles } from 'lucide-react';
import { GoogleIcon } from '../common/GoogleIcon';

/** Fenêtre « Connexion Google requise » : tables privées, défis, demandes d'amis. */
export const AuthRequirementModal: React.FC<{
  open: boolean;
  reason: string;
  isAuthLoading: boolean;
  onGoogleSignIn: () => void;
  onClose: () => void;
}> = ({ open: showAuthRequirementModal, reason: authRequirementReason, isAuthLoading, onGoogleSignIn: handleGoogleSignIn, onClose }) => (
  <>
      {/* MODAL : CONNEXION GOOGLE REQUISE (TABLES PRIVÉES & DÉFIS)                 */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {showAuthRequirementModal && (
          <div className="fixed inset-0 z-[80] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-amber-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 text-center"
            >
              <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mx-auto text-amber-400">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white">Connexion Google requise</h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                {authRequirementReason || "Les tables privées et le Palmarès sont réservés aux comptes Google."}
              </p>
              <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50 text-xs text-slate-400 text-left space-y-1.5">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Des tables plus sûres</span>
                </div>
                <p>Personne ne peut prendre ton pseudo, et tes parties restent à ton nom.</p>
              </div>
              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  disabled={isAuthLoading}
                  onClick={handleGoogleSignIn}
                  className="w-full py-3 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-sm shadow-md flex items-center justify-center gap-3 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <GoogleIcon className="w-4 h-4" />
                  <span>{isAuthLoading ? "Connexion en cours..." : "Sauvegarder avec Google"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onClose()}
                  className="w-full py-2.5 px-4 rounded-xl text-slate-400 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Continuer en invité
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
  </>
);

export interface ActiveGameConflict {
  activeRoomCode: string;
  message?: string;
  onConfirmLeaveAndProceed: () => Promise<void>;
}

/** Fenêtre « Partie en cours détectée » : protège contre l'abandon involontaire d'une partie. */
export const ActiveGameConflictModal: React.FC<{
  conflict: ActiveGameConflict | null;
  setConflict: (conflict: ActiveGameConflict | null) => void;
  /** « Retourner à ma partie » : l'écran hôte rejoint la table active. */
  onReturnToGame: (roomCode: string) => void;
}> = ({ conflict: activeGameConflict, setConflict: setActiveGameConflict, onReturnToGame }) => (
  <>
      {/* MODAL : PARTIE EN COURS DÉTECTÉE (PROTECTION CONTRE L'ABANDON INVOLONTAIRE) */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {activeGameConflict && (
          <div className="fixed inset-0 z-[100] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-slate-900 border border-amber-500/30 rounded-3xl max-w-sm w-full p-5 sm:p-6 shadow-2xl flex flex-col gap-4 text-center"
            >
              {/* Icon & Header */}
              <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
                <ShieldAlert className="w-7 h-7 animate-pulse" />
              </div>

              <div>
                <h3 className="text-base sm:text-lg font-black text-white">
                  Partie en cours détectée
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 mt-1.5 leading-relaxed">
                  Tu as déjà une partie active sur la table{' '}
                  <span className="font-black text-amber-400 tracking-wider">
                    #{activeGameConflict.activeRoomCode}
                  </span>
                  .
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Rejoindre ou créer une autre table sans la terminer sera comptabilisé comme un abandon de ta part.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2.5 pt-1">
                {/* Primary: Return to active match */}
                <button
                  type="button"
                  onClick={async () => {
                    const activeCode = activeGameConflict.activeRoomCode;
                    setActiveGameConflict(null);
                    onReturnToGame(activeCode);
                  }}
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition active:scale-98 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-slate-950" />
                  <span>Retourner à ma partie</span>
                </button>

                {/* Secondary: Forfeit current match and proceed */}
                <button
                  type="button"
                  onClick={async () => {
                    const proceed = activeGameConflict.onConfirmLeaveAndProceed;
                    setActiveGameConflict(null);
                    if (proceed) {
                      await proceed();
                    }
                  }}
                  className="w-full h-11 rounded-xl bg-slate-800/80 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-500/40 font-bold text-xs flex items-center justify-center gap-2 transition active:scale-98 cursor-pointer"
                >
                  <span>Quitter ma partie et continuer</span>
                </button>

                {/* Cancel / Stay in Hub */}
                <button
                  type="button"
                  onClick={() => setActiveGameConflict(null)}
                  className="text-xs text-slate-500 hover:text-slate-400 py-1 cursor-pointer transition"
                >
                  Annuler
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
  </>
);
