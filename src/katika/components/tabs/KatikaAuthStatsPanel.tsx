import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, RefreshCw } from 'lucide-react';
import { tikaFetch } from '../../services/tikaFetch';

interface AuthGroup {
  key: string;
  device: string;
  os: string;
  osVersion: string;
  browser: string;
  build: string;
  relay: boolean;
  counts: Record<string, number>;
  popupStarts: number;
  popupOk: number;
  popupTechnicalFailures: number;
  popupAbandons: number;
  redirectStarts: number;
  redirectOk: number;
  redirectFailures: number;
  redirectLost: number;
  popupTechnicalRatePct: number;
  othersPopupTechnicalRatePct: number | null;
  gapPoints: number | null;
  judged: boolean;
  suspect: boolean;
}

interface AuthStats {
  days: number;
  thresholds: { minAttempts: number; gapPoints: number };
  redirectEnabled: boolean;
  totals: {
    popupStarts: number;
    popupOk: number;
    popupTechnicalFailures: number;
    popupAbandons: number;
    redirectStarts: number;
    redirectOk: number;
    redirectFailures: number;
    redirectLost: number;
  };
  suspects: number;
  groups: AuthGroup[];
}

const PERIODS = [1, 7, 30] as const;

const CODE_LABEL: Record<string, string> = {
  'popup-blocked': 'fenêtre bloquée',
  'popup-closed-by-user': 'fenêtre fermée',
  'cancelled-popup-request': 'demande annulée',
  'operation-not-supported-in-this-environment': 'environnement non supporté',
  'web-storage-unsupported': 'stockage indisponible',
  'network-request-failed': 'réseau',
  'unauthorized-domain': 'domaine non autorisé',
  'internal-error': 'erreur interne',
  'too-many-requests': 'trop de tentatives',
  'user-disabled': 'compte désactivé',
  'account-exists-with-different-credential': 'compte existant autre méthode',
  timeout: 'délai dépassé',
  'redirect-cancelled-by-user': 'redirection annulée',
  other: 'autre code',
};

/** Codes d'échec présents dans les compteurs d'un groupe, du plus fréquent au plus rare. */
function failureDetails(counts: Record<string, number>): string {
  return Object.entries(counts)
    .filter(([k, n]) => (k.startsWith('popup_fail_') || k.startsWith('redirect_fail_')) && n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => {
      const isPopup = k.startsWith('popup_fail_');
      const code = k.slice(isPopup ? 11 : 14);
      return `${isPopup ? 'fenêtre' : 'redirection'} : ${CODE_LABEL[code] ?? code} ${n}`;
    })
    .join(', ');
}

/**
 * Connexion Google par type d'appareil : fenêtres lancées et réussies, échecs par code d'erreur Firebase, et le secours par redirection
 * (iPhone et iPad, réglage « Connexion Google de secours par redirection », fermé par défaut). Un type d'appareil est à examiner quand
 * ses fenêtres échouent nettement plus que celles des autres ; « fermée par l'utilisateur » n'est jamais compté comme un échec (Safari peut
 * le signaler à tort, mais c'est aussi un simple abandon). Mesure anonyme : aucun nom, aucun courriel, aucun compte.
 */
export const KatikaAuthStatsPanel: React.FC = () => {
  const [days, setDays] = useState<number>(7);
  const [data, setData] = useState<AuthStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await tikaFetch(`/api/katika/auth-stats?days=${days}`);
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Lecture impossible.');
      setData(json as AuthStats);
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

  return (
    <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <KeyRound className="w-4 h-4 text-emerald-400 shrink-0" />
          <h3 className="text-sm font-bold text-white">Connexion Google</h3>
        </div>
        <button type="button" onClick={() => void load()} className="text-slate-400 hover:text-white cursor-pointer" title="Rafraîchir">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <p className="text-xs text-slate-400">
        Fenêtres de connexion lancées et réussies par type d'appareil, avec le code d'erreur quand elles échouent. C'est la preuve à consulter
        avant d'ouvrir le réglage « Connexion Google de secours par redirection » (iPhone et iPad).
        {data ? (data.redirectEnabled ? ' Le secours est actuellement ouvert.' : ' Le secours est actuellement fermé.') : ''}
      </p>

      <div className="flex items-center gap-2">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setDays(p)}
            className={`h-8 px-3 rounded-lg text-xs font-bold cursor-pointer ${days === p ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            {p === 1 ? "Aujourd'hui" : `${p} jours`}
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {data && (
        <>
          <p className="text-xs text-slate-300">
            {data.totals.popupStarts} fenêtres lancées, {data.totals.popupOk} réussies, {data.totals.popupTechnicalFailures} échecs,{' '}
            {data.totals.popupAbandons} fermées ou annulées. Secours : {data.totals.redirectStarts} redirections, {data.totals.redirectOk} réussies,{' '}
            {data.totals.redirectFailures} échecs, {data.totals.redirectLost} sans retour.
            {data.suspects > 0 ? ` ${data.suspects} groupe${data.suspects > 1 ? 's' : ''} à examiner.` : ''}
          </p>
          {data.groups.length === 0 && (
            <p className="text-xs text-slate-500">Aucune connexion enregistrée sur cette période. Les mesures n'existent qu'après la publication de cette version.</p>
          )}
          <div className="space-y-2">
            {data.groups.map((g) => {
              const details = failureDetails(g.counts);
              return (
                <div key={g.key} className={`p-3 rounded-lg border ${g.suspect ? 'bg-slate-800/70 border-rose-500/40' : 'bg-slate-800/40 border-slate-700/40'}`}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
                    {g.suspect && <span className="px-1.5 py-0.5 rounded font-bold bg-rose-500/20 text-rose-300">À examiner</span>}
                    <span className="text-slate-200 font-semibold">
                      {g.device} · {g.os}{g.osVersion ? ` ${g.osVersion}` : ''} · {g.browser}
                    </span>
                    {g.build && <span>version {g.build}</span>}
                    {g.relay && <span className="px-1.5 py-0.5 rounded font-bold bg-sky-500/15 text-sky-300">domaine du jeu</span>}
                    <span className="ml-auto text-white font-black">{g.popupOk + g.redirectOk} connexions</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {g.popupStarts} fenêtres, {g.popupOk} réussies, {g.popupTechnicalFailures} échecs, {g.popupAbandons} fermées ou annulées
                    {g.redirectStarts + g.redirectOk + g.redirectFailures + g.redirectLost > 0
                      ? ` · redirection : ${g.redirectStarts} lancées, ${g.redirectOk} réussies, ${g.redirectFailures} échecs, ${g.redirectLost} sans retour`
                      : ''}
                    {g.judged && g.gapPoints !== null ? ` · ${g.popupTechnicalRatePct} % d'échecs de fenêtre (autres : ${g.othersPopupTechnicalRatePct} %)` : ''}
                    {!g.judged && g.key !== 'autres' ? ` · pas encore jugé (moins de ${data.thresholds.minAttempts} fenêtres)` : ''}
                  </p>
                  {details && <p className="mt-1 text-[11px] text-slate-500">Codes : {details}</p>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
