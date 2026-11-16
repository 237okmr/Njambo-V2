import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { tikaFetch } from '../services/tikaFetch';

type Env = 'DEMO' | 'LIVE';

interface Finding {
  code: string;
  severity: 'ERROR' | 'INFO';
  detail: string;
}

interface FindingDoc {
  environment: Env;
  uid: string;
  findings: Finding[];
  maxSeverity: 'ERROR' | 'INFO';
  firstSeenAt: number;
  lastSeenAt: number;
}

interface AuditData {
  enabled: boolean;
  running: boolean;
  lastRun: { at: number; mode: 'incremental' | 'full'; players: number; reads: number; partial: boolean; durationMs: number; error?: string } | null;
  lastFullCompletedAt: number | null;
  full: { active: boolean; startedAt: number } | null;
  counts: Record<Env, { errors: number; infos: number }>;
  codes: Record<string, { severity: string; label: string }>;
  findings: FindingDoc[];
}

const ENV_LABEL: Record<Env, string> = { LIVE: 'Réel', DEMO: 'Démo' };
const fmt = (ms: number) =>
  new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Audit d'intégrité des portefeuilles : rapproche chaque portefeuille, son registre et les fiches de siège. Lecture seule : l'audit ne
 * corrige rien et ne bloque aucun retrait ; un écart est à examiner à la main (une erreur du registre se corrige par une ligne d'ajustement).
 * Les « informations » (historique ancien incomplet) restent visibles ici mais ne déclenchent aucune alerte.
 */
export const KatikaWalletAuditCard: React.FC = () => {
  const [data, setData] = useState<AuditData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [env, setEnv] = useState<Env | 'ALL'>('ALL');
  const [showInfos, setShowInfos] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await tikaFetch('/api/katika/cash/audit');
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Lecture impossible.');
      setData(json as AuditData);
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

  const runFull = async () => {
    setMessage(null);
    try {
      const res = await tikaFetch('/api/katika/cash/audit/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Lancement impossible.');
      setMessage('Contrôle complet lancé : il avance par pages en arrière-plan. Actualise pour suivre.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Lancement impossible.');
    }
  };

  const rows = (data?.findings ?? []).filter((f) => (env === 'ALL' || f.environment === env) && (showInfos || f.maxSeverity === 'ERROR'));

  return (
    <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <h3 className="text-sm font-bold text-white">Audit des portefeuilles</h3>
        </div>
        <button type="button" onClick={() => void load()} className="text-slate-400 hover:text-white cursor-pointer" title="Rafraîchir">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <p className="text-xs text-slate-400">
        Chaque portefeuille est rapproché de son registre et des fiches de siège. Lecture seule : rien n'est corrigé et aucun retrait n'est bloqué.
        Un écart se traite à la main, par une ligne d'ajustement.
      </p>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {data && !data.enabled && <p className="text-xs text-amber-400">L'audit est désactivé dans les réglages : aucun nouveau passage n'a lieu.</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {(['LIVE', 'DEMO'] as Env[]).map((e) => (
              <div key={e} className={`rounded-lg border p-3 ${data.counts[e].errors > 0 ? (e === 'LIVE' ? 'border-red-500/60 bg-red-500/10' : 'border-amber-500/60 bg-amber-500/10') : 'border-slate-800 bg-slate-950/60'}`}>
                <div className="text-xs text-slate-400">{ENV_LABEL[e]}</div>
                <div className="text-lg font-bold text-white">{data.counts[e].errors} en écart</div>
                <div className="text-xs text-slate-500">{data.counts[e].infos} information{data.counts[e].infos > 1 ? 's' : ''} (historique incomplet)</div>
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-500">
            {data.lastRun
              ? `Dernier passage ${fmt(data.lastRun.at)} : ${data.lastRun.mode === 'full' ? 'complet' : 'incrémental'}, ${data.lastRun.players} joueur${data.lastRun.players > 1 ? 's' : ''}, ${data.lastRun.reads} lectures${data.lastRun.partial ? ', partiel (il reprend tout seul)' : ''}${data.lastRun.error ? ` — erreur : ${data.lastRun.error}` : ''}.`
              : 'Aucun passage enregistré pour le moment.'}
            {data.lastFullCompletedAt ? ` Dernier contrôle complet terminé le ${fmt(data.lastFullCompletedAt)}.` : ''}
            {data.full?.active ? ' Un contrôle complet est en cours.' : ''}
            {data.running ? ' Un passage tourne en ce moment.' : ''}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {(['ALL', 'LIVE', 'DEMO'] as const).map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEnv(e)}
                className={`h-8 px-3 rounded-lg text-xs font-bold cursor-pointer ${env === e ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              >
                {e === 'ALL' ? 'Tous' : ENV_LABEL[e]}
              </button>
            ))}
            <label className="flex items-center gap-1 text-xs text-slate-300 cursor-pointer">
              <input type="checkbox" checked={showInfos} onChange={(ev) => setShowInfos(ev.target.checked)} />
              Afficher aussi les informations
            </label>
            <button
              type="button"
              onClick={() => void runFull()}
              disabled={!data.enabled || data.full?.active === true}
              className="ml-auto h-8 px-3 rounded-lg text-xs font-bold bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-40 cursor-pointer"
            >
              Lancer un contrôle complet
            </button>
          </div>
          {message && <p className="text-xs text-slate-300">{message}</p>}

          {rows.length === 0 ? (
            <p className="text-xs text-emerald-400">Aucun écart à afficher.</p>
          ) : (
            <ul className="space-y-2">
              {rows.map((row) => (
                <li key={`${row.environment}_${row.uid}`} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-mono text-slate-300 break-all">{row.uid}</span>
                    <span className={row.environment === 'LIVE' ? 'text-red-300' : 'text-amber-300'}>
                      {ENV_LABEL[row.environment]} · vu {fmt(row.firstSeenAt)}, revu {fmt(row.lastSeenAt)}
                    </span>
                  </div>
                  <ul className="space-y-0.5">
                    {row.findings.map((f, i) => (
                      <li key={i} className="text-xs text-slate-300">
                        <span className={f.severity === 'ERROR' ? 'text-red-300' : 'text-slate-400'}>{data.codes[f.code]?.label ?? f.code}</span>
                        {f.detail ? ` — ${f.detail}` : ''}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
};
