import React, { useCallback, useEffect, useState } from 'react';
import { Bug, ChevronDown, ChevronUp, RefreshCw, Trash2 } from 'lucide-react';
import { tikaFetch } from '../../services/tikaFetch';

interface CrashRow {
  signature: string;
  message: string;
  stack: string;
  phase: 'BOOT' | 'RUNTIME';
  kind: string;
  build: string;
  os: string;
  osVersion: string;
  device: string;
  browser: string;
  model: string;
  count: number;
  firstSeenAt: number;
  lastSeenAt: number;
  resolved: boolean;
}

const formatDate = (ms: number) =>
  new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Plantages remontés automatiquement par les navigateurs (anonymes, regroupés par type d'erreur, appareil, système et version).
 * Une ligne = un type de bug ; le compteur dit combien de fois il est arrivé. Un bug marqué « traité » qui revient est rouvert seul.
 */
export const KatikaCrashesPanel: React.FC = () => {
  const [rows, setRows] = useState<CrashRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await tikaFetch('/api/katika/crashes');
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Lecture impossible.');
      setRows(data.crashes as CrashRow[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lecture impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (url: string, init?: RequestInit) => {
    try {
      const res = await tikaFetch(url, init);
      if (!res.ok) throw new Error('Action refusée.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action impossible.');
    }
  };

  const visible = (rows ?? []).filter((r) => showResolved || !r.resolved).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  const resolvedCount = (rows ?? []).filter((r) => r.resolved).length;

  return (
    <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Bug className="w-4 h-4 text-rose-400 shrink-0" />
          <h3 className="text-sm font-bold text-white">Plantages de l'application</h3>
        </div>
        <button type="button" onClick={() => void load()} className="text-slate-400 hover:text-white cursor-pointer" title="Rafraîchir">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <p className="text-xs text-slate-400">
        Envoyés automatiquement par les téléphones, sans nom ni compte. Une ligne par type de bug, avec le nombre de fois où il est arrivé.
      </p>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
        <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} className="accent-amber-500" />
        Afficher aussi les plantages traités ({resolvedCount})
      </label>

      {rows && visible.length === 0 && <p className="text-xs text-slate-500">Aucun plantage à examiner.</p>}

      <div className="space-y-2">
        {visible.map((r) => {
          const expanded = open === r.signature;
          return (
            <div key={r.signature} className={`p-3 rounded-lg border ${r.resolved ? 'bg-slate-800/40 border-slate-700/40 opacity-70' : 'bg-slate-800/70 border-rose-500/30'}`}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
                <span className={`px-1.5 py-0.5 rounded font-bold ${r.phase === 'BOOT' ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'}`}>
                  {r.kind === 'auth' ? 'Connexion Google' : r.phase === 'BOOT' ? 'Au démarrage' : 'En cours d\'utilisation'}
                </span>
                <span className="text-slate-200 font-semibold">
                  {r.device} · {r.os} {r.osVersion} · {r.browser}
                  {r.model ? ` · ${r.model}` : ''}
                </span>
                <span className="ml-auto text-white font-black">{r.count} fois</span>
              </div>
              <p className="mt-1.5 text-xs text-slate-200 font-mono break-words">{r.message}</p>
              <p className="mt-1 text-[11px] text-slate-500">
                Premier : {formatDate(r.firstSeenAt)} · dernier : {formatDate(r.lastSeenAt)}
                {r.build ? ` · version ${r.build}` : ''}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void act(`/api/katika/crashes/${encodeURIComponent(r.signature)}/resolve`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ resolved: !r.resolved }),
                  })}
                  className="h-8 px-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-bold text-white cursor-pointer"
                >
                  {r.resolved ? 'Rouvrir' : 'Marquer traité'}
                </button>
                <button
                  type="button"
                  onClick={() => void act(`/api/katika/crashes/${encodeURIComponent(r.signature)}`, { method: 'DELETE' })}
                  className="h-8 px-3 rounded-lg bg-slate-800 border border-slate-700 hover:border-rose-500/60 text-xs font-bold text-slate-300 flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Supprimer
                </button>
                {r.stack && (
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : r.signature)}
                    className="h-8 px-2 text-xs text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />} Détail technique
                  </button>
                )}
              </div>
              {expanded && <pre className="mt-2 p-2 rounded bg-slate-950 text-[10px] text-slate-400 overflow-x-auto whitespace-pre-wrap break-words">{r.stack}</pre>}
            </div>
          );
        })}
      </div>

      {resolvedCount > 0 && (
        <button
          type="button"
          onClick={() => void act('/api/katika/crashes', { method: 'DELETE' })}
          className="h-8 px-3 rounded-lg bg-slate-800 border border-slate-700 hover:border-rose-500/60 text-xs font-bold text-slate-300 flex items-center gap-1 cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" /> Supprimer tous les plantages traités
        </button>
      )}
    </div>
  );
};
