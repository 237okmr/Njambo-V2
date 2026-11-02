import React, { useEffect, useRef, useState } from 'react';
import { Activity, Check, Copy, LifeBuoy } from 'lucide-react';
import { buildDiagnosticReport, copyTextToClipboard, fetchDiagnosticHealth } from '../../services/diagnosticReport';
import { DiagnosticHealth } from '../../services/diagnosticReportFormat';
import { useIsGameAdmin } from '../../hooks/useIsGameAdmin';

interface ReportProblemCardProps {
  onOpenDiagnostic: () => void;
}

/** Le joueur copie un rapport à transmettre ; le détail technique n'est proposé qu'aux comptes d'administration. */
export const ReportProblemCard: React.FC<ReportProblemCardProps> = ({ onOpenDiagnostic }) => {
  const isAdmin = useIsGameAdmin();
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const healthRef = useRef<DiagnosticHealth | null>(null);
  const healthFallbackRef = useRef<string>('Lecture en cours');

  // Lu à l'avance : un navigateur peut refuser la copie si elle n'a pas lieu tout de suite après le geste du joueur.
  useEffect(() => {
    fetchDiagnosticHealth()
      .then((health) => {
        healthRef.current = health;
      })
      .catch((err) => {
        // Un serveur injoignable fait justement partie du problème à signaler.
        healthFallbackRef.current = `Erreur (${err instanceof Error ? err.message : 'réseau'})`;
      });
  }, []);

  const handleCopy = async () => {
    const copied = await copyTextToClipboard(buildDiagnosticReport(healthRef.current, healthFallbackRef.current));
    setState(copied ? 'copied' : 'failed');
    setTimeout(() => setState('idle'), 3000);
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col gap-3 shadow-md">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
          <LifeBuoy className="w-5 h-5 text-amber-400" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white">Signaler un problème</h3>
          <p className="text-xs text-slate-400">
            {state === 'copied'
              ? 'Rapport copié : colle-le dans ton message à l’équipe Njambo.'
              : state === 'failed'
                ? 'La copie a échoué. Réessaie dans un instant.'
                : 'Copie un rapport à joindre à ton message pour nous aider à comprendre.'}
          </p>
        </div>
      </div>
      <button
        type="button"
        id="btn-report-problem"
        onClick={() => void handleCopy()}
        className="w-full min-h-11 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
      >
        {state === 'copied' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        <span>{state === 'copied' ? 'Rapport copié' : 'Copier le rapport'}</span>
      </button>
      {isAdmin && (
        <button
          type="button"
          id="btn-open-diagnostic"
          onClick={onOpenDiagnostic}
          className="w-full min-h-11 px-3.5 rounded-xl bg-slate-950 border border-slate-700/80 hover:border-amber-500/50 text-slate-300 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
        >
          <Activity className="w-3.5 h-3.5 text-amber-400" />
          <span>Diagnostic détaillé (admin)</span>
        </button>
      )}
    </div>
  );
};
