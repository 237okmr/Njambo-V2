import React, { useCallback, useEffect, useState } from 'react';
import { Gauge, RotateCw, AlertTriangle } from 'lucide-react';
import { tikaFetch } from '../services/tikaFetch';

interface ReadBudgetData {
  day: string;
  reads: number;
  freeLimit: number;
  warnAt: number;
  warning: boolean;
  partialDay: boolean;
  countingSince: number;
}

const fmt = (n: number) => n.toLocaleString('fr-FR');

/**
 * Jauge des lectures Firestore faites par le serveur pour katika aujourd'hui (jour de quota = heure du Pacifique).
 * Repère indicatif : le compteur vit en mémoire et ne compte pas les lectures faites par les téléphones des joueurs.
 * La console Firebase (Utilisation) reste la référence. Lue à l'ouverture et sur demande, sans minuterie.
 */
export const KatikaReadBudget: React.FC = () => {
  const [data, setData] = useState<ReadBudgetData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await tikaFetch('/api/katika/read-budget');
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || 'Compteur indisponible.');
      setData(body.budget as ReadBudgetData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Compteur indisponible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const ratio = data ? Math.min(100, Math.round((data.reads / data.freeLimit) * 100)) : 0;
  const barColor = data?.warning ? 'bg-red-500' : ratio >= 50 ? 'bg-amber-400' : 'bg-emerald-500';

  return (
    <div id="katika-read-budget" className="rounded-xl border border-slate-700 bg-slate-900/60 p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          <Gauge className="w-4 h-4 text-amber-400" />
          <span>Lectures Firestore du serveur aujourd'hui</span>
        </div>
        <button
          type="button"
          id="katika-read-budget-refresh-btn"
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[11px] cursor-pointer disabled:opacity-50"
        >
          <RotateCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          <span>Actualiser</span>
        </button>
      </div>
      {error ? (
        <div className="text-[11px] text-red-300 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>{error}</span>
        </div>
      ) : data ? (
        <>
          <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
            <div className={`h-full ${barColor}`} style={{ width: `${ratio}%` }} />
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            {fmt(data.reads)} sur {fmt(data.freeLimit)} lectures gratuites par jour pour tout le projet (alerte à {fmt(data.warnAt)}).
          </div>
          {data.warning && (
            <div className="text-[11px] text-red-300">
              Seuil d'alerte atteint : le quota gratuit approche. Les téléphones des joueurs lisent aussi Firestore et ne sont pas comptés ici.
            </div>
          )}
          {data.partialDay && (
            <div className="text-[11px] text-slate-500">
              Comptage démarré avec le serveur : les lectures faites avant ne sont pas incluses. Le jour de quota change à minuit, heure du Pacifique.
            </div>
          )}
        </>
      ) : (
        <div className="text-[11px] text-slate-500">Chargement…</div>
      )}
    </div>
  );
};
