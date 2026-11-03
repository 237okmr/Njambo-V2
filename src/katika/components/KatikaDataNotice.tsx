import React from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import { DataQualitySummary } from '../services/dataQuality';

/** Dit d'où viennent les chiffres : leur heure et, s'il y a lieu, ce qu'ils ne couvrent pas. */
export const KatikaDataNotice: React.FC<{ summary: DataQualitySummary; refreshedAt?: Date }> = ({ summary, refreshedAt }) => {
  if (summary.level === 'OK') {
    return refreshedAt ? (
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 print:hidden">
        <Clock className="w-3 h-3" />
        <span>Chiffres de {refreshedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    ) : null;
  }

  const unavailable = summary.level === 'UNAVAILABLE';
  return (
    <div
      role="status"
      className={`rounded-xl border p-3 text-xs flex gap-2 ${
        unavailable ? 'border-red-500/40 bg-red-950/40 text-red-200' : 'border-amber-500/40 bg-amber-950/30 text-amber-200'
      }`}
    >
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <div className="flex flex-col gap-1">
        <span className="font-semibold">{unavailable ? 'Chiffres indisponibles' : 'Chiffres à lire avec prudence'}</span>
        {summary.notices.map((notice) => (
          <span key={notice}>{notice}</span>
        ))}
      </div>
    </div>
  );
};
