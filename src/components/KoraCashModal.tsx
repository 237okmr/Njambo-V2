import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Wallet, X, Loader2, Lock, Coins, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { usePlayerProfile } from '../context/PlayerProfileContext';
import { GoogleIcon } from './common/GoogleIcon';
import { fetchWallet, simulateDeposit, KoraCashWallet } from '../services/koraCashClient';
import {
  KoraCashEnvironment,
  QUICK_DEPOSIT_AMOUNTS,
  formatFcfa,
  getDepositUi,
  parseTypedAmount,
} from '../services/koraCashFormat';

interface KoraCashModalProps {
  environment: KoraCashEnvironment;
  onClose: () => void;
}

export const KoraCashModal: React.FC<KoraCashModalProps> = ({ environment, onClose }) => {
  const { isLoggedIn, loginWithGoogle } = usePlayerProfile();
  const ui = getDepositUi(environment);

  const [wallet, setWallet] = useState<KoraCashWallet | null>(null);
  const [loadingWallet, setLoadingWallet] = useState<boolean>(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [selectedQuick, setSelectedQuick] = useState<number | null>(null);
  const [typed, setTyped] = useState<string>('');
  const [depositing, setDepositing] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadWallet = useCallback(async () => {
    setLoadingWallet(true);
    setWalletError(null);
    try {
      setWallet(await fetchWallet());
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : 'Impossible de lire ton solde.');
    } finally {
      setLoadingWallet(false);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      void loadWallet();
    } else {
      setWallet(null);
    }
  }, [isLoggedIn, loadWallet]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleDeposit = async () => {
    setMessage(null);
    let amount: number;
    if (typed.trim() !== '') {
      const parsed = parseTypedAmount(typed);
      if (!parsed.ok || parsed.amount === undefined) {
        setMessage({ type: 'error', text: parsed.error || 'Montant invalide.' });
        return;
      }
      amount = parsed.amount;
    } else if (selectedQuick !== null) {
      amount = selectedQuick;
    } else {
      setMessage({ type: 'error', text: 'Choisis ou saisis un montant.' });
      return;
    }

    setDepositing(true);
    try {
      const result = await simulateDeposit(amount);
      setWallet(result.wallet);
      setSelectedQuick(null);
      setTyped('');
      setMessage({ type: 'success', text: `${formatFcfa(result.amount)} fictifs ajoutés à ton solde.` });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Le dépôt a échoué.' });
    } finally {
      setDepositing(false);
    }
  };

  const content = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[120] bg-slate-950/90 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Kora Cash"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-slate-900 border border-slate-700/80 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
              <Wallet className="w-4.5 h-4.5" />
            </div>
            <h2 className="text-sm font-black text-white truncate">Kora Cash</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-4 flex flex-col gap-3">
          <div
            className={`flex items-start gap-2 px-3 py-2 rounded-xl text-[11px] font-bold border ${
              environment === 'DEMO'
                ? 'bg-amber-500/10 text-amber-200 border-amber-500/30'
                : 'bg-rose-500/10 text-rose-200 border-rose-500/30'
            }`}
          >
            <ShieldAlert className="w-4 h-4 shrink-0 mt-px" />
            <span>{ui.banner}</span>
          </div>

          {!isLoggedIn ? (
            <div className="flex flex-col gap-3 p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-center">
              <div className="mx-auto w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-300">
                <Lock className="w-5 h-5" />
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Kora Cash est réservé aux joueurs connectés avec un compte Google. Connecte-toi pour voir ton solde.
              </p>
              <button
                type="button"
                onClick={loginWithGoogle}
                className="w-full h-10 px-4 rounded-xl bg-gradient-to-r from-white via-slate-100 to-amber-100 text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer border border-white/80 active:scale-95"
              >
                <GoogleIcon className="w-4 h-4 shrink-0" />
                <span>Se connecter avec Google</span>
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <Coins className="w-3.5 h-3.5 text-amber-400" />
                    <span>Disponible</span>
                  </div>
                  <div className="mt-1 text-base font-black text-white">
                    {loadingWallet && !wallet ? '…' : formatFcfa(wallet?.available ?? 0)}
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                    <span>En table</span>
                  </div>
                  <div className="mt-1 text-base font-black text-white">
                    {loadingWallet && !wallet ? '…' : formatFcfa(wallet?.locked ?? 0)}
                  </div>
                </div>
              </div>

              {walletError && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-200">
                  <span>{walletError}</span>
                  <button type="button" onClick={() => void loadWallet()} className="font-black underline cursor-pointer shrink-0">
                    Réessayer
                  </button>
                </div>
              )}

              {ui.canDeposit && (
                <div className="flex flex-col gap-2.5 p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
                  <span className="text-[11px] font-black text-slate-200">Montant à recharger</span>
                  <div className="grid grid-cols-4 gap-2">
                    {QUICK_DEPOSIT_AMOUNTS.map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        disabled={depositing}
                        onClick={() => {
                          setSelectedQuick(amount);
                          setTyped('');
                          setMessage(null);
                        }}
                        className={`py-2 rounded-xl text-[11px] font-black border cursor-pointer disabled:opacity-50 ${
                          selectedQuick === amount && typed.trim() === ''
                            ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                            : 'bg-slate-900 border-slate-700 text-slate-200 hover:border-amber-500/50'
                        }`}
                      >
                        {formatFcfa(amount).replace(' FCFA', '')}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={typed}
                    disabled={depositing}
                    onChange={(e) => {
                      setTyped(e.target.value);
                      setSelectedQuick(null);
                      setMessage(null);
                    }}
                    placeholder="Autre montant en FCFA"
                    aria-label="Autre montant en FCFA"
                    className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-700 focus:border-amber-400 outline-none text-xs text-white placeholder:text-slate-500"
                  />
                  <button
                    type="button"
                    disabled={depositing}
                    onClick={() => void handleDeposit()}
                    className="w-full h-10 rounded-xl bg-gradient-to-r from-amber-400 to-amber-600 text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    {depositing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    <span>{ui.buttonLabel}</span>
                  </button>
                  {message && (
                    <div
                      className={`flex items-start gap-2 text-[11px] font-bold ${
                        message.type === 'success' ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <ShieldAlert className="w-4 h-4 shrink-0" />}
                      <span>{message.text}</span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </motion.div>
  );

  return createPortal(content, document.body);
};
