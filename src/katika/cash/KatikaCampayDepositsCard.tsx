import React, { useCallback, useEffect, useState } from 'react';
import { RotateCw, Smartphone } from 'lucide-react';
import { tikaFetch } from '../services/tikaFetch';

interface CampayDepositRow {
  id: string;
  uid: string;
  amount: number;
  status: string;
  createdAt: number;
  campayStatus?: string;
  campayOperator?: string;
  campayReason?: string;
  campayCheckedAt?: number;
  failReason?: string;
}

const fmt = (n: number) => `${n.toLocaleString('fr-FR')} FCFA`;
const fmtDate = (ms: number) => new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Derniers dépôts Mobile Money : état chez nous, et dernière réponse de Campay (statut, opérateur, motif).
 * Lecture seule. Sert à comprendre pourquoi un paiement n'a pas abouti avant de rédiger un message précis pour chaque cause.
 * Les données ne s'actualisent qu'à la demande (une lecture bornée par clic).
 */
export const KatikaCampayDepositsCard: React.FC = () => {
  const [rows, setRows] = useState<CampayDepositRow[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await tikaFetch('/api/katika/cash/campay-deposits');
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || 'Lecture impossible.');
      setRows(body.deposits as CampayDepositRow[]);
    } catch (err) {
      setRows(null);
      setError(err instanceof Error ? err.message : 'Lecture impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="p-5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-amber-400" />
            Derniers dépôts Mobile Money
          </h3>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Pour chaque dépôt : l'état chez nous et la dernière réponse de Campay (statut, opérateur, motif). Un motif vide veut dire que Campay n'en a pas donné.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[11px] cursor-pointer disabled:opacity-50 shrink-0"
        >
          <RotateCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          <span>Actualiser</span>
        </button>
      </div>

      {error && <p className="text-xs text-rose-300">{error}</p>}
      {rows === null ? (
        !error && <p className="text-xs text-slate-500">{loading ? 'Chargement…' : 'Aucune donnée.'}</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-slate-400">Aucun dépôt Mobile Money pour le moment.</p>
      ) : (
        <ul className="space-y-2 max-h-80 overflow-y-auto">
          {rows.map((r) => (
            <li key={r.id} className="text-[11px] text-slate-300 border border-slate-800 rounded-lg px-3 py-2 space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">{fmt(r.amount)}</span>
                <span className="text-slate-500">{fmtDate(r.createdAt)}</span>
              </div>
              <div className="text-slate-400 font-mono truncate">{r.uid.slice(0, 10)}…</div>
              <div>
                Chez nous : <span className="font-bold">{r.status === 'SUCCESS' ? 'crédité' : r.status === 'FAILED' ? 'échoué' : 'en attente'}</span>
              </div>
              <div>
                Campay : <span className="font-bold">{r.campayStatus ?? 'pas encore relu'}</span>
                {r.campayOperator ? ` · ${r.campayOperator}` : ''}
                {r.campayCheckedAt ? ` · relu à ${fmtDate(r.campayCheckedAt)}` : ''}
              </div>
              {r.campayReason && <div className="text-amber-200">Motif Campay : {r.campayReason}</div>}
              {r.failReason && <div className="text-slate-500">Note : {r.failReason}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
