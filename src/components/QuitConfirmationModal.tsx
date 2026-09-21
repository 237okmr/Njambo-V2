import React, { useState } from 'react';
import { LogOut, Save, ArrowLeft, BookmarkCheck, AlertTriangle, Coins, ShieldAlert, CheckSquare, Square } from 'lucide-react';
import { motion } from 'motion/react';
import { triggerHaptic } from '../utils/sound';

interface QuitConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveAndQuit: () => void;
  onQuitWithoutSave: () => void;
  partieCount: number;
  activePlayersCount: number;
  isMultiplayer?: boolean;
  onForfeitAndQuitMultiplayer?: () => void;
  onProposeEarlyClose?: () => void;
  baseBet?: number;
  playerCapital?: number;
  isDoubleKoraAchieved?: boolean;
  isDoubleKoraThreat?: boolean;
  hasKoraThreat?: boolean;
  isSpectator?: boolean;
  onSpectatorQuitMultiplayer?: () => void;
}

export const QuitConfirmationModal: React.FC<QuitConfirmationModalProps> = ({
  isOpen,
  onClose,
  onSaveAndQuit,
  onQuitWithoutSave,
  partieCount,
  activePlayersCount,
  isMultiplayer = false,
  onForfeitAndQuitMultiplayer,
  onProposeEarlyClose,
  baseBet = 10,
  playerCapital = 100,
  isDoubleKoraAchieved = false,
  isDoubleKoraThreat = false,
  hasKoraThreat = false,
  isSpectator = false,
  onSpectatorQuitMultiplayer,
}) => {
  const [hasConfirmedForfeitCheck, setHasConfirmedForfeitCheck] = useState<boolean>(false);

  React.useEffect(() => {
    if (isOpen) {
      setHasConfirmedForfeitCheck(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Calculate exact financial impact of forfeiture
  const multiplier = isDoubleKoraAchieved || isDoubleKoraThreat ? 4 : hasKoraThreat ? 2 : 1;
  const totalForfeitLoss = baseBet * multiplier;
  const remainingCapitalAfterForfeit = Math.max(0, playerCapital - totalForfeitLoss);

  return (
    <div
      id="quit-confirmation-modal-backdrop"
      className="fixed inset-0 z-[60] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className={`w-full max-w-md bg-slate-900 border ${
          isMultiplayer ? 'border-rose-500/50' : 'border-amber-500/40'
        } rounded-2xl p-4 sm:p-5 shadow-2xl text-slate-100 flex flex-col gap-4 my-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        {isMultiplayer ? (
          isSpectator ? (
            /* SPECTATOR ONLY QUIT MODAL - NO SCARY WARNINGS OR CHECKS */
            <>
              <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center shadow shrink-0">
                  <LogOut className="w-5 h-5 text-blue-400" />
                </div>
                <div className="flex-1">
                  <h2 className="text-base sm:text-lg font-black text-blue-300 leading-tight">
                    Quitter le mode spectateur ?
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-blue-950/60 text-blue-300 border border-blue-800/50">
                      Spectateur
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Observation en direct
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 text-xs text-slate-300 flex items-center gap-2.5">
                <BookmarkCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <p>
                  Vous pouvez quitter et revenir à l'accueil à tout moment. Votre capital de jetons de <strong className="text-emerald-300">{playerCapital} 🪙</strong> ne subira aucune pénalité.
                </p>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <button
                  id="btn-confirm-spectator-quit"
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    if (onSpectatorQuitMultiplayer) {
                      onSpectatorQuitMultiplayer();
                    } else if (onForfeitAndQuitMultiplayer) {
                      onForfeitAndQuitMultiplayer();
                    } else {
                      onQuitWithoutSave();
                    }
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-slate-950 font-black text-xs transition flex items-center justify-center gap-2 shadow cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Confirmer la sortie</span>
                </button>

                <button
                  id="btn-cancel-spectator-quit"
                  type="button"
                  onClick={onClose}
                  className="w-full py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-slate-400" />
                  <span>Continuer à observer</span>
                </button>
              </div>
            </>
          ) : (
            /* MULTIPLAYER QUIT & FORFEIT CONFIRMATION WITH TRANSPARENT FINANCIAL BREAKDOWN */
            <>
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center shadow shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
              </div>
              <div className="flex-1">
                <h2 className="text-base sm:text-lg font-black text-rose-300 leading-tight">
                  Déclarer Forfait & Quitter ?
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-950/60 text-rose-300 border border-rose-800/50">
                    Partie {partieCount}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {activePlayersCount} joueurs à table
                  </span>
                </div>
              </div>
            </div>

            {/* Bot Relay & Forfeiture Warning Info */}
            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 text-[11px] text-slate-300 flex flex-col gap-1.5 leading-relaxed">
              <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                <span>Relais IA & Règles d'abandon</span>
              </div>
              <p>
                Quitter la table active le <strong className="text-cyan-300">relais automatique par l'IA</strong> de secours pour ne pas bloquer les autres joueurs, puis entraîne un <strong className="text-rose-400">forfait définitif</strong> avec déduction de la mise si la manche se termine.
              </p>
            </div>

            {/* Financial Breakdown Table */}
            <div className="bg-rose-950/30 p-3.5 rounded-xl border border-rose-900/60 flex flex-col gap-2 text-xs">
              <div className="flex items-center justify-between text-slate-300">
                <span>Mise de base engagée :</span>
                <span className="font-mono font-bold text-rose-300">-{baseBet} 🪙</span>
              </div>

              {multiplier > 1 && (
                <div className="flex items-center justify-between text-amber-300 bg-amber-950/40 px-2 py-1 rounded border border-amber-500/30">
                  <span className="flex items-center gap-1 font-semibold">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Pénalité Kora active (x{multiplier}) :
                  </span>
                  <span className="font-mono font-bold">x{multiplier}</span>
                </div>
              )}

              <div className="border-t border-rose-900/50 pt-1.5 flex items-center justify-between font-bold text-rose-200">
                <span>Perte totale immédiate :</span>
                <span className="font-mono text-sm text-rose-400">-{totalForfeitLoss} 🪙</span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 bg-slate-950/50 px-2 py-1 rounded">
                <span>Capital restant après forfait :</span>
                <span className="font-mono font-bold text-emerald-400 flex items-center gap-1">
                  <Coins className="w-3 h-3 text-amber-400" />
                  {remainingCapitalAfterForfeit} 🪙
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <button
                id="btn-confirm-forfeit-quit"
                type="button"
                onClick={() => {
                  triggerHaptic('heavy');
                  if (onForfeitAndQuitMultiplayer) {
                    onForfeitAndQuitMultiplayer();
                  } else {
                    onQuitWithoutSave();
                  }
                }}
                className="w-full py-2.5 px-4 rounded-xl font-black text-xs transition flex items-center justify-center gap-2 shadow cursor-pointer bg-rose-600 hover:bg-rose-500 text-slate-950 shadow-rose-900/50"
              >
                <LogOut className="w-4 h-4" />
                <span>Confirmer l'abandon (-{totalForfeitLoss} 🪙)</span>
              </button>

              {onProposeEarlyClose && (
                <button
                  id="btn-propose-early-close"
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    onClose();
                    onProposeEarlyClose();
                  }}
                  className="w-full py-2 px-4 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold text-xs border border-amber-500/40 transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>🤝</span>
                  <span>Proposer de clore la partie (Partager le pot)</span>
                </button>
              )}

              <button
                id="btn-cancel-quit-mp"
                type="button"
                onClick={onClose}
                className="w-full py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-slate-400" />
                <span>Annuler et continuer la partie</span>
              </button>
            </div>
          </>
          )
        ) : (
          /* SOLO MODE QUIT & SAVE CONFIRMATION */
          <>
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shadow shrink-0">
                <Save className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h2 className="text-base sm:text-lg font-black text-amber-200 leading-tight">
                  Quitter la Manche ?
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-950/60 text-amber-300 border border-amber-800/50">
                    Partie {partieCount}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {activePlayersCount} joueurs en jeu
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-xs text-slate-300 flex items-center gap-2.5">
              <BookmarkCheck className="w-4 h-4 text-amber-400 shrink-0" />
              <p>
                Vous pouvez sauvegarder votre manche pour la reprendre à tout moment dans <strong className="text-amber-300">Mes Manches</strong>.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <button
                id="btn-save-and-quit"
                type="button"
                onClick={onSaveAndQuit}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition flex items-center justify-center gap-2 shadow cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Sauvegarder et aller à l'Accueil</span>
              </button>

              <button
                id="btn-quit-without-save"
                type="button"
                onClick={onQuitWithoutSave}
                className="w-full py-2 px-4 rounded-xl bg-slate-800 hover:bg-rose-950/50 hover:text-rose-300 text-slate-400 font-semibold text-xs border border-slate-700 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Aller à l'Accueil sans sauvegarder</span>
              </button>

              <button
                id="btn-cancel-quit"
                type="button"
                onClick={onClose}
                className="w-full py-2 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 font-medium text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Continuer la partie</span>
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
};
