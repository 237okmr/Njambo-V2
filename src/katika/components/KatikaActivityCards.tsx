import React from 'react';
import { Dices, Layers, Users, Activity, AlertCircle } from 'lucide-react';
import type { ActivitySummary, ModeCounts } from '../services/activityService';

interface KatikaActivityCardsProps {
  activity: ActivitySummary | null;
  loading: boolean;
  rangeLabel: string;
}

const fmt = (n: number) => n.toLocaleString('fr-FR');

function hasError(activity: ActivitySummary | null, source: 'journal' | 'fiches' | 'présence'): boolean {
  return Boolean(activity && activity.loadErrors.some((e) => e.startsWith(source)));
}

const SplitLine: React.FC<{ counts: ModeCounts; unavailable: boolean }> = ({ counts, unavailable }) => (
  <span className="text-[11px] text-slate-500 font-mono">
    {unavailable ? 'données indisponibles' : `Solo ${fmt(counts.solo)} · Multi ${fmt(counts.multi)}`}
  </span>
);

/**
 * Ligne de cartes d'activité réelle, visible dans les trois vues du tableau de bord.
 * Chiffres issus du serveur (journal de parties, fiches de manche, présence quotidienne) ; aucune valeur inventée :
 * une source illisible affiche « — » et un message, jamais un chiffre de remplacement.
 */
export const KatikaActivityCards: React.FC<KatikaActivityCardsProps> = ({ activity, loading, rangeLabel }) => {
  const journalDown = hasError(activity, 'journal');
  const fichesDown = hasError(activity, 'fiches');
  const presenceDown = hasError(activity, 'présence');
  const waiting = activity === null;

  const value = (n: number | undefined, unavailable: boolean): string => {
    if (unavailable) return '—';
    if (waiting || n === undefined) return '…';
    return fmt(n);
  };

  return (
    <div className="space-y-2" data-testid="katika-activity-cards">
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Activité réelle du jeu</span>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700 text-slate-300">
          {rangeLabel}
          {loading ? ' · mise à jour…' : ''}
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Parties */}
        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 shadow-sm flex items-start justify-between">
          <div className="space-y-0.5">
            <span className="text-[11px] font-medium text-slate-400">Parties terminées</span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-white font-mono">{value(activity?.partiesFinished.total, journalDown)}</span>
              <span className="text-[11px] text-slate-500 font-sans">
                {journalDown || !activity ? '' : `${fmt(activity.partiesAbandoned.total)} abandonnées · ${fmt(activity.partiesInProgress.total)} en cours`}
              </span>
            </div>
            <SplitLine counts={activity?.partiesFinished ?? { solo: 0, multi: 0, total: 0 }} unavailable={journalDown || waiting} />
          </div>
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
            <Dices className="w-4 h-4 text-purple-400" />
          </div>
        </div>

        {/* Manches */}
        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 shadow-sm flex items-start justify-between">
          <div className="space-y-0.5">
            <span className="text-[11px] font-medium text-slate-400">Manches terminées</span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-emerald-400 font-mono">{value(activity?.manchesFinished.total, fichesDown)}</span>
              <span className="text-[11px] text-slate-500 font-mono">
                {fichesDown || !activity ? '' : `sur ${fmt(activity.manchesStarted.total)} lancées`}
              </span>
            </div>
            <SplitLine counts={activity?.manchesFinished ?? { solo: 0, multi: 0, total: 0 }} unavailable={fichesDown || waiting} />
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <Layers className="w-4 h-4 text-emerald-400" />
          </div>
        </div>

        {/* Joueurs */}
        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 shadow-sm flex items-start justify-between">
          <div className="space-y-0.5">
            <span className="text-[11px] font-medium text-slate-400">Joueurs ayant terminé une partie</span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-cyan-300 font-mono">{value(activity?.playersFinished.total, journalDown)}</span>
              <span className="text-[11px] text-slate-500 font-mono">
                {journalDown || !activity ? '' : `${fmt(activity.playersLaunched.total)} ont lancé une partie`}
              </span>
            </div>
            <SplitLine counts={activity?.playersFinished ?? { solo: 0, multi: 0, total: 0 }} unavailable={journalDown || waiting} />
          </div>
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4 text-cyan-400" />
          </div>
        </div>

        {/* Actifs : app ouverte / a joué */}
        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 shadow-sm flex items-start justify-between">
          <div className="space-y-0.5">
            <span className="text-[11px] font-medium text-slate-400">Actifs</span>
            <div className="flex items-baseline gap-3">
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold text-amber-300 font-mono">{value(activity?.openPlayers.total, presenceDown)}</span>
                <span className="text-[11px] text-slate-500 font-sans">app ouverte</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold text-white font-mono">{value(activity?.playersLaunched.total, journalDown)}</span>
                <span className="text-[11px] text-slate-500 font-sans">ont joué</span>
              </div>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">
              {presenceDown || !activity
                ? 'présence indisponible'
                : `Google ${fmt(activity.openPlayers.google)} · Invités ${fmt(activity.openPlayers.guest)}`}
            </span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
            <Activity className="w-4 h-4 text-amber-400" />
          </div>
        </div>
      </div>

      {activity && activity.loadErrors.length > 0 && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" />
          <span>
            Certaines données d'activité n'ont pas pu être lues (les règles Firestore sont-elles déployées ?) : {activity.loadErrors.join(' ; ')}
          </span>
        </div>
      )}
      {activity && activity.truncated && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700 text-[11px] text-slate-300">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
          <span>Plafond de lecture atteint : les chiffres de cette période sont partiels. Choisissez une période plus courte.</span>
        </div>
      )}
    </div>
  );
};
