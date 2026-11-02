import React, { useState } from 'react';
import { Coins } from 'lucide-react';
import { formatFcfa, parseTypedAmount } from '../services/koraCashFormat';
import type { CashTableInfo } from '../types';

interface CashTableEndPanelProps {
  cash: CashTableInfo;
  seatOpen: boolean;
  bet: number;
  capital: number;
  onRebuy: (amount: number) => void;
}

/** Fin d'une partie à une table Kora Cash : capital, commission prélevée, recave. La sortie reste le bouton Quitter habituel. */
export const CashTableEndPanel: React.FC<CashTableEndPanelProps> = ({ cash, seatOpen, bet, capital, onRebuy }) => {
  const [typed, setTyped] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const rake = cash.lastRake ?? 0;

  if (cash.closed || !seatOpen) {
    return (
      <div id="cash-table-closed" className="w-full flex items-start gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200 font-bold">
        <Coins className="w-4 h-4 shrink-0" />
        <span>{cash.closed ? 'Table terminée' : 'Tu as quitté la table'} : ton capital est revenu dans Kora Cash.</span>
      </div>
    );
  }

  const maxCapital = bet * cash.maxBuyInMultiple;
  const room = maxCapital - capital;
  const mustRebuy = capital < bet;

  const submit = () => {
    const parsed = parseTypedAmount(typed, { min: Math.max(1, bet - capital), max: room });
    if (!parsed.ok || parsed.amount === undefined) {
      setError(parsed.error || 'Montant invalide.');
      return;
    }
    setError(null);
    setTyped('');
    onRebuy(parsed.amount);
  };

  return (
    <div id="cash-table-end-panel" className="w-full flex flex-col gap-2 p-3 rounded-xl bg-slate-950/70 border border-amber-500/30 text-xs text-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span>Ton capital : <b className="text-amber-300">{formatFcfa(capital)}</b></span>
        {rake > 0 && <span className="text-slate-400">Commission de cette partie : {formatFcfa(rake)}</span>}
      </div>
      {mustRebuy && (
        <p className="font-bold text-amber-200">Ton capital ne couvre plus la mise de {formatFcfa(bet)}. Recave avant la fin du compte à rebours, sinon tu récupères ce qu’il te reste et tu quittes la table.</p>
      )}
      {room > 0 && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={typed}
            onChange={(e) => { setTyped(e.target.value); setError(null); }}
            placeholder={`Recave, jusqu’à ${room} FCFA`}
            aria-label="Montant de la recave en FCFA"
            className="min-w-0 flex-1 h-9 px-2.5 rounded-lg bg-slate-900 border border-slate-700 focus:border-amber-400 outline-none text-xs text-white placeholder:text-slate-500"
          />
          <button type="button" id="btn-cash-rebuy" onClick={submit} className="h-9 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black cursor-pointer shrink-0">
            Recaver
          </button>
        </div>
      )}
      {error && <p className="font-bold text-rose-300">{error}</p>}
    </div>
  );
};
