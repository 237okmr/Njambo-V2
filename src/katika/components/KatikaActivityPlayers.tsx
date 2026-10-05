import React, { useState } from 'react';
import { Users, AlertCircle } from 'lucide-react';
import type { ActivityPlayerRow, ActivitySummary } from '../services/activityService';

interface KatikaActivityPlayersProps {
  activity: ActivitySummary | null;
  loading: boolean;
  rangeLabel: string;
}

type ActivityFilter = 'ALL' | 'PLAYED' | 'OPENED_ONLY';
type KindFilter = 'ALL' | 'google' | 'guest';

const PAGE_SIZE = 25;

const fmt = (n: number) => n.toLocaleString('fr-FR');

const fmtDate = (ms: number): string =>
  ms > 0
    ? new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—';

const hasPlayed = (p: ActivityPlayerRow) => p.soloLaunched + p.multiLaunched > 0;

const chipClass = (active: boolean) =>
  `px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer ${
    active ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30' : 'text-slate-400 hover:text-white'
  }`;

/**
 * Bloc « Activité des joueurs » : qui a ouvert l'application et qui a joué (solo / multijoueur) sur la période choisie.
 * Noms Google pour les comptes connectés, « Invité # » pour les invités. Aucune valeur inventée : une source illisible
 * est signalée, et « — » remplace toute information absente.
 */
export const KatikaActivityPlayers: React.FC<KatikaActivityPlayersProps> = ({ activity, loading, rangeLabel }) => {
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('ALL');
  const [kindFilter, setKindFilter] = useState<KindFilter>('ALL');
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);

  const journalDown = Boolean(activity && activity.loadErrors.some((e) => e.startsWith('journal')));
  const presenceDown = Boolean(activity && activity.loadErrors.some((e) => e.startsWith('présence')));

  const filtered = (activity?.players ?? []).filter((p) => {
    if (kindFilter !== 'ALL' && p.kind !== kindFilter) return false;
    if (activityFilter === 'PLAYED') return hasPlayed(p);
    if (activityFilter === 'OPENED_ONLY') return !hasPlayed(p) && p.openedApp;
    return true;
  });
  const shown = filtered.slice(0, visibleCount);

  return (
    <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-4" data-testid="katika-activity-players">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-cyan-400" />
          <div>
            <h3 className="text-sm font-bold text-white">Activité des joueurs</h3>
            <p className="text-[11px] text-slate-400">Qui a ouvert l'application et qui a joué, en solo et en multijoueur</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700 text-slate-300">
            {rangeLabel}
            {loading ? ' · mise à jour…' : ''}
          </span>
          <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button type="button" onClick={() => { setActivityFilter('ALL'); setVisibleCount(PAGE_SIZE); }} className={chipClass(activityFilter === 'ALL')}>Tous</button>
            <button type="button" onClick={() => { setActivityFilter('PLAYED'); setVisibleCount(PAGE_SIZE); }} className={chipClass(activityFilter === 'PLAYED')}>Ont joué</button>
            <button type="button" onClick={() => { setActivityFilter('OPENED_ONLY'); setVisibleCount(PAGE_SIZE); }} className={chipClass(activityFilter === 'OPENED_ONLY')}>App ouverte seulement</button>
          </div>
          <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button type="button" onClick={() => { setKindFilter('ALL'); setVisibleCount(PAGE_SIZE); }} className={chipClass(kindFilter === 'ALL')}>Tous comptes</button>
            <button type="button" onClick={() => { setKindFilter('google'); setVisibleCount(PAGE_SIZE); }} className={chipClass(kindFilter === 'google')}>Google</button>
            <button type="button" onClick={() => { setKindFilter('guest'); setVisibleCount(PAGE_SIZE); }} className={chipClass(kindFilter === 'guest')}>Invités</button>
          </div>
        </div>
      </div>

      {(journalDown || presenceDown) && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" />
          <span>
            {journalDown ? 'Le journal des parties est illisible : les parties jouées ne sont pas affichées. ' : ''}
            {presenceDown ? 'La présence quotidienne est illisible : les ouvertures de l\'application ne sont pas affichées.' : ''}
          </span>
        </div>
      )}

      {activity === null ? (
        <div className="py-6 text-center text-xs text-slate-400 font-mono">Chargement de l'activité des joueurs…</div>
      ) : filtered.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-400">Aucun joueur correspondant sur cette période.</div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[820px] space-y-1.5">
            <div className="grid grid-cols-[2.2fr_1fr_1fr_1fr_1.2fr_1.4fr] gap-3 px-3 py-2 text-[10px] uppercase font-bold tracking-wider text-slate-400 bg-slate-950/60 rounded-lg">
              <span>Joueur</span>
              <span>Solo (finies / lancées)</span>
              <span>Multi (finies / lancées)</span>
              <span>Victoires · Koras</span>
              <span>Dernière partie</span>
              <span>App ouverte</span>
            </div>
            {shown.map((p) => (
              <div
                key={p.id}
                className="grid grid-cols-[2.2fr_1fr_1fr_1fr_1.2fr_1.4fr] gap-3 px-3 py-2 items-center text-xs rounded-lg bg-slate-950/40 border border-slate-800/60"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-white truncate">{p.name}</span>
                  <span
                    className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded border font-mono ${
                      p.kind === 'google'
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25'
                        : 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}
                  >
                    {p.kind === 'google' ? 'Google' : 'Invité'}
                  </span>
                </div>
                <span className="font-mono text-slate-200">
                  {journalDown ? '—' : `${fmt(p.soloFinished)} / ${fmt(p.soloLaunched)}`}
                </span>
                <span className="font-mono text-slate-200">
                  {journalDown ? '—' : `${fmt(p.multiFinished)} / ${fmt(p.multiLaunched)}`}
                </span>
                <span className="font-mono text-amber-300">
                  {journalDown ? '—' : `${fmt(p.wins)} · ${fmt(p.koras)}`}
                </span>
                <span className="font-mono text-slate-300">{journalDown ? '—' : fmtDate(p.lastPlayedAt)}</span>
                <span className="font-mono text-slate-300">
                  {presenceDown
                    ? '—'
                    : p.openedApp
                      ? `${fmt(p.openDays)} j · ${fmtDate(p.lastSeenAt)}`
                      : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activity !== null && filtered.length > shown.length && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium cursor-pointer"
          >
            Afficher plus ({fmt(filtered.length - shown.length)} restants)
          </button>
        </div>
      )}

      {activity !== null && (
        <p className="text-[10px] text-slate-500 font-mono">
          {fmt(filtered.length)} joueur(s) · « finies / lancées » : parties terminées sur parties commencées · « App ouverte » : jours d'ouverture sur la période et dernier signal
        </p>
      )}
    </div>
  );
};
