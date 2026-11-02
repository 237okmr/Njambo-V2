import React, { useCallback, useEffect, useState } from 'react';
import { History, Loader2 } from 'lucide-react';
import { CashMovement, fetchCashHistory } from '../services/koraCashClient';
import { cashMovementLabel, formatSignedFcfa } from '../services/koraCashFormat';
import { wsService } from '../services/websocketService';

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Onglet Historique : lecture seule, relue quand le serveur signale un mouvement. */
export const KoraCashHistoryPanel: React.FC = () => {
  const [movements, setMovements] = useState<CashMovement[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setMovements(await fetchCashHistory());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lecture de ton historique impossible.');
    }
  }, []);

  useEffect(() => {
    void load();
    return wsService.onCashWalletChanged(() => void load());
  }, [load]);

  if (error && !movements) {
    return (
      <div className="flex flex-col items-center gap-2 p-6 rounded-2xl bg-slate-950/60 border border-slate-800 text-center">
        <p className="text-sm text-slate-300">{error}</p>
        <button type="button" onClick={() => void load()} className="min-h-11 px-4 text-sm font-bold text-amber-300 underline underline-offset-2 cursor-pointer">
          Réessayer
        </button>
      </div>
    );
  }

  if (!movements) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Chargement…</span>
      </div>
    );
  }

  if (movements.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 p-8 rounded-2xl bg-slate-950/60 border border-slate-800 text-center">
        <History className="w-8 h-8 text-slate-600" />
        <p className="text-sm font-semibold text-slate-300">Aucun mouvement pour le moment</p>
        <p className="text-xs text-slate-500">Tes dépôts, retraits et parties à une table s’afficheront ici.</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col rounded-2xl bg-slate-950/60 border border-slate-800 divide-y divide-slate-800/80">
      {movements.map((movement, index) => (
        <li key={`${movement.createdAt}-${index}`} className="flex items-center justify-between gap-3 px-3.5 py-3">
          <span className="flex flex-col min-w-0">
            <span className="text-sm font-bold text-white truncate">{cashMovementLabel(movement.kind, movement.amount)}</span>
            <span className="text-xs text-slate-400">{formatDate(movement.createdAt)}</span>
          </span>
          <span className={`text-sm font-black shrink-0 ${movement.amount > 0 ? 'text-emerald-300' : 'text-slate-200'}`}>
            {formatSignedFcfa(movement.amount)}
          </span>
        </li>
      ))}
    </ul>
  );
};
