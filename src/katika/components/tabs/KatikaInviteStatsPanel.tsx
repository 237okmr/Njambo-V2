import React, { useCallback, useEffect, useState } from 'react';
import { Link2, RefreshCw } from 'lucide-react';
import { tikaFetch } from '../../services/tikaFetch';

interface InviteGroup {
  key: string;
  device: string;
  os: string;
  osVersion: string;
  browser: string;
  build: string;
  channel: 'link' | 'notification';
  mode: 'free' | 'cash';
  counts: Record<string, number>;
  opened: number;
  cardShown: number;
  clicks: number;
  later: number;
  joined: number;
  normalRefusals: number;
  technicalFailures: number;
  noAnswer: number;
  technicalRatePct: number;
  othersTechnicalRatePct: number | null;
  gapPoints: number | null;
  judged: boolean;
  suspect: boolean;
}

interface InviteStats {
  days: number;
  thresholds: { minClicks: number; gapPoints: number };
  totals: {
    opened: number;
    cardShown: number;
    clicks: number;
    later: number;
    joined: number;
    normalRefusals: number;
    technicalFailures: number;
    noAnswer: number;
  };
  suspects: number;
  groups: InviteGroup[];
}

const PERIODS = [1, 7, 30] as const;

const CHANNEL_LABEL: Record<string, string> = { link: 'Lien partagé', notification: 'Notification' };
const MODE_LABEL: Record<string, string> = { free: 'gratuit', cash: 'Kora Cash' };
const MOTIF_LABEL: Record<string, string> = {
  ROOM_NOT_FOUND: 'table introuvable',
  JOIN_REFUSED: 'refus de la table',
  BANNED: 'joueur banni',
  MAINTENANCE: 'maintenance',
  ACTIVE_GAME_IN_PROGRESS: 'déjà dans une partie',
  RATE_LIMITED: 'trop de tentatives',
  GENERIC: 'erreur générale',
  TIMEOUT: 'délai dépassé',
  EXCEPTION: 'exception',
  AUTH: 'connexion refusée',
  UNKNOWN: 'motif inconnu',
};

/** Motifs d'échec présents dans les compteurs d'un groupe, du plus fréquent au plus rare. */
function failureDetails(counts: Record<string, number>): string {
  return Object.entries(counts)
    .filter(([k, n]) => k.startsWith('fail_') && n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${MOTIF_LABEL[k.slice(5)] ?? k.slice(5)} ${n}`)
    .join(', ');
}

/**
 * Parcours d'invitation par type d'appareil et par canal : liens ouverts, cartes d'arrivée affichées, tentatives de jointure, tables rejointes
 * et motifs d'échec. Un type d'appareil est à examiner quand ses échecs techniques dépassent nettement ceux des autres. Les refus normaux
 * (table pleine, partie commencée, table introuvable) ne comptent pas. Mesure anonyme : aucun code de table, aucun nom, aucun montant.
 */
export const KatikaInviteStatsPanel: React.FC = () => {
  const [days, setDays] = useState<number>(7);
  const [data, setData] = useState<InviteStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await tikaFetch(`/api/katika/invite-stats?days=${days}`);
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Lecture impossible.');
      setData(json as InviteStats);
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
          <Link2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <h3 className="text-sm font-bold text-white">Parcours d'invitation</h3>
        </div>
        <button type="button" onClick={() => void load()} className="text-slate-400 hover:text-white cursor-pointer" title="Rafraîchir">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <p className="text-xs text-slate-400">
        Du lien ouvert à la table rejointe, par type d'appareil. Une tentative est un clic sur « Rejoindre » ou, pour une notification, la
        jointure automatique. Un type d'appareil est à examiner quand ses échecs techniques dépassent nettement ceux des autres.
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
            {data.totals.opened} liens ouverts, {data.totals.cardShown} cartes affichées, {data.totals.clicks} tentatives,{' '}
            {data.totals.joined} tables rejointes, {data.totals.normalRefusals} refus normaux, {data.totals.technicalFailures} échecs techniques
            {data.totals.noAnswer > 0 ? `, ${data.totals.noAnswer} sans réponse` : ''}.
            {data.suspects > 0 ? ` ${data.suspects} groupe${data.suspects > 1 ? 's' : ''} à examiner.` : ''}
          </p>
          {data.groups.length === 0 && (
            <p className="text-xs text-slate-500">Aucun parcours enregistré sur cette période. Les mesures n'existent qu'après la publication de cette version.</p>
          )}
          <div className="space-y-2">
            {data.groups.map((g) => {
              const details = failureDetails(g.counts);
              return (
                <div key={g.key} className={`p-3 rounded-lg border ${g.suspect ? 'bg-slate-800/70 border-rose-500/40' : 'bg-slate-800/40 border-slate-700/40'}`}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
                    {g.suspect && <span className="px-1.5 py-0.5 rounded font-bold bg-rose-500/20 text-rose-300">À examiner</span>}
                    <span className="px-1.5 py-0.5 rounded font-bold bg-emerald-500/15 text-emerald-300">
                      {CHANNEL_LABEL[g.channel] ?? g.channel} · {MODE_LABEL[g.mode] ?? g.mode}
                    </span>
                    <span className="text-slate-200 font-semibold">
                      {g.device} · {g.os}{g.osVersion ? ` ${g.osVersion}` : ''} · {g.browser}
                    </span>
                    {g.build && <span>version {g.build}</span>}
                    <span className="ml-auto text-white font-black">{g.joined} rejointes</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {g.opened} ouverts, {g.cardShown} cartes, {g.clicks} tentatives, {g.later} « pas maintenant », {g.normalRefusals} refus normaux,{' '}
                    {g.technicalFailures} échecs techniques
                    {g.noAnswer > 0 ? `, ${g.noAnswer} sans réponse` : ''}
                    {g.judged && g.gapPoints !== null ? ` · ${g.technicalRatePct} % d'échecs techniques (autres : ${g.othersTechnicalRatePct} %)` : ''}
                    {!g.judged && g.key.indexOf('autres') !== 0 ? ` · pas encore jugé (moins de ${data.thresholds.minClicks} tentatives)` : ''}
                  </p>
                  {details && <p className="mt-1 text-[11px] text-slate-500">Motifs : {details}</p>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
