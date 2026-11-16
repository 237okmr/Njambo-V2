import React, { useCallback, useEffect, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { tikaFetch } from '../../services/tikaFetch';

interface BootRow {
  key: string;
  device: string;
  os: string;
  osVersion: string;
  browser: string;
  build: string;
  started: number;
  home: number;
  ratePct: number;
  othersRatePct: number | null;
  gapPoints: number | null;
  judged: boolean;
  suspect: boolean;
}

interface BootStats {
  days: number;
  thresholds: { minStarts: number; gapPoints: number };
  totalStarted: number;
  totalHome: number;
  suspects: number;
  families: BootRow[];
}

const PERIODS = [1, 7, 30] as const;

/**
 * Démarrages de l'application par type d'appareil : combien de fois l'application a commencé à se charger, et combien de fois
 * l'écran d'accueil s'est affiché. Un type d'appareil qui démarre sans afficher l'accueil bien plus souvent que les autres
 * (page blanche sans erreur) est signalé. Mesure anonyme : aucun nom, aucun compte.
 */
export const KatikaBootStatsPanel: React.FC = () => {
  const [days, setDays] = useState<number>(7);
  const [data, setData] = useState<BootStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await tikaFetch(`/api/katika/boot-stats?days=${days}`);
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Lecture impossible.');
      setData(json as BootStats);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lecture impossible.');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const globalRate = data && data.totalStarted > 0 ? Math.round((data.totalHome / data.totalStarted) * 1000) / 10 : null;

  return (
    <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Activity className="w-4 h-4 text-sky-400 shrink-0" />
          <h3 className="text-sm font-bold text-white">Démarrages de l'application</h3>
        </div>
        <button type="button" onClick={() => void load()} className="text-slate-400 hover:text-white cursor-pointer" title="Rafraîchir">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <p className="text-xs text-slate-400">
        Pour chaque type d'appareil : combien de fois l'application a commencé à démarrer, et combien de fois l'accueil s'est affiché.
        Un type d'appareil est à examiner quand l'accueil s'affiche nettement moins souvent que chez tous les autres réunis.
      </p>

      <div className="flex items-center gap-2">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setDays(p)}
            className={`h-8 px-3 rounded-lg text-xs font-bold cursor-pointer ${days === p ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            {p === 1 ? "Aujourd'hui" : `${p} jours`}
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {data && (
        <>
          <p className="text-xs text-slate-300">
            {data.totalStarted} démarrages, {data.totalHome} accueils affichés
            {globalRate !== null ? ` (${globalRate} % en tout)` : ''}.
            {data.suspects > 0 ? ` ${data.suspects} type${data.suspects > 1 ? 's' : ''} d'appareil à examiner.` : ''}
          </p>
          {data.families.length === 0 && <p className="text-xs text-slate-500">Aucun démarrage enregistré sur cette période. Les mesures n'existent qu'après la publication de cette version.</p>}
          <div className="space-y-2">
            {data.families.map((r) => (
              <div key={r.key} className={`p-3 rounded-lg border ${r.suspect ? 'bg-slate-800/70 border-rose-500/40' : 'bg-slate-800/40 border-slate-700/40'}`}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
                  {r.suspect && <span className="px-1.5 py-0.5 rounded font-bold bg-rose-500/20 text-rose-300">À examiner</span>}
                  <span className="text-slate-200 font-semibold">
                    {r.device} · {r.os}{r.osVersion ? ` ${r.osVersion}` : ''} · {r.browser}
                  </span>
                  {r.build && <span>version {r.build}</span>}
                  <span className="ml-auto text-white font-black">{r.ratePct} %</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  {r.started} démarrages, {r.home} accueils affichés
                  {r.gapPoints !== null && r.judged ? ` · ${r.gapPoints > 0 ? `${r.gapPoints} points sous` : `${Math.abs(r.gapPoints)} points au-dessus de`} les autres (${r.othersRatePct} %)` : ''}
                  {!r.judged && r.key !== 'autres' ? ` · pas encore jugé (moins de ${data.thresholds.minStarts} démarrages)` : ''}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
