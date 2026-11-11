import React from 'react';
import { Lock, Wallet } from 'lucide-react';
import { useKoraCashWallet } from '../../services/koraCashWalletStore';
import { CASH_BALANCE_LABEL, formatFcfa } from '../../services/koraCashFormat';

/**
 * Solde et montant en table, comme dans l'en-tête de Kora Cash (même source, même libellé).
 * Monté seulement côté Kora Cash : le solde n'est lu que si le joueur y est. Un toucher ouvre le portefeuille.
 */
export const CashBalanceBar: React.FC<{ onOpenWallet: () => void }> = ({ onOpenWallet }) => {
  const { wallet, loading, error } = useKoraCashWallet(true);
  const waiting = loading && !wallet;
  return (
    <div id="social-cash-balance" className="shrink-0 mt-2 px-3 sm:px-6 py-2 border-y bg-amber-500/10 border-amber-500/30">
      <button type="button" onClick={onOpenWallet} className="max-w-lg mx-auto w-full flex flex-col gap-1 text-left cursor-pointer" aria-label="Ouvrir le portefeuille Kora Cash">
        <span className="flex items-center gap-1.5 text-xs font-black text-amber-200">
          <Wallet className="w-3.5 h-3.5 shrink-0" />
          {CASH_BALANCE_LABEL}
        </span>
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-lg font-black text-white">{waiting ? '…' : error && !wallet ? 'Indisponible' : formatFcfa(wallet?.available ?? 0)}</span>
          <span className="flex items-center gap-1 text-xs font-bold text-slate-300">
            <Lock className="w-3 h-3 text-slate-400" />
            En table : {waiting ? '…' : formatFcfa(wallet?.locked ?? 0)}
          </span>
        </span>
        <span className="text-xs text-amber-200/80">Argent réel, réservé aux 18 ans et plus.</span>
      </button>
    </div>
  );
};
