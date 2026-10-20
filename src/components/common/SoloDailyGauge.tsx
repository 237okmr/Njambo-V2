import React from 'react';
import { getSoloDailyStatus } from '../../services/masteryConfig';

interface SoloDailyGaugeProps {
  soloDaily?: { day: number; points: number } | null;
  compact?: boolean;
}

/**
 * Jauge des points de Maîtrise solo du jour (heure de Douala) : points déjà reçus, plafond, et taux actuel
 * (plein tarif, 50 %, 25 % ou plafond atteint). Affichage seul, aucun calcul de score.
 */
export const SoloDailyGauge: React.FC<SoloDailyGaugeProps> = ({ soloDaily, compact = false }) => {
  const status = getSoloDailyStatus(soloDaily);
  const percent = Math.min(100, Math.round((status.points / status.cap) * 100));
  const message = status.reached
    ? 'Plafond solo atteint : les victoires solo ne rapportent plus de points avant minuit (heure de Douala).'
    : status.rate >= 1
    ? 'Prochaines victoires solo : plein tarif.'
    : `Prochaines victoires solo : ${Math.round(status.rate * 100)} % des points.`;
  return (
    <div className={`w-full rounded-xl border border-amber-500/25 bg-slate-950/60 ${compact ? 'p-2' : 'p-3'}`}>
      <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        <span>Points solo du jour</span>
        <span className="font-mono text-amber-300">
          {Number(status.points.toFixed(2))} / {status.cap}
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full border border-slate-800 bg-slate-950">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            status.reached ? 'bg-rose-400' : 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-300'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className={`mt-1.5 text-[10px] ${status.reached ? 'text-rose-300' : 'text-slate-400'}`}>{message}</div>
    </div>
  );
};
