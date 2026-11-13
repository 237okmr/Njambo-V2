import React, { useEffect, useState } from 'react';
import { Loader2, Users } from 'lucide-react';
import { fetchTablePreview, type FreeTablePreview } from '../../services/tablePreviewClient';

interface JoinArrivalCardProps {
  code: string;
  initialName: string;
  /** L'invité confirme : rejoindre la table avec ce pseudo. */
  onJoin: (name: string) => void;
  /** « Pas maintenant » : ouvre le hub avec le code déjà saisi. */
  onLater: () => void;
}

/** Arrivée par un lien de table gratuite : qui invite, combien de places, un seul bouton, pseudo déjà rempli. */
export const JoinArrivalCard: React.FC<JoinArrivalCardProps> = ({ code, initialName, onJoin, onLater }) => {
  const [preview, setPreview] = useState<FreeTablePreview | null>(null);
  const [name, setName] = useState<string>(initialName);

  useEffect(() => {
    let cancelled = false;
    fetchTablePreview(code).then((p) => {
      if (!cancelled) setPreview(p);
    });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const host = preview?.hostName;
  const canJoin = preview?.state === 'OPEN' || preview?.state === 'UNAVAILABLE';
  const trimmed = name.trim();

  return (
    <div className="fixed inset-0 z-[90] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Rejoindre une table">
      <div className="w-full max-w-sm bg-slate-900 border border-emerald-500/40 rounded-3xl p-5 shadow-2xl flex flex-col gap-3.5">
        {!preview ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-300">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Recherche de la table…</span>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-black uppercase tracking-wider text-emerald-400">Njambo Kora</span>
              <h2 className="text-lg font-black text-white">
                {preview.state === 'OPEN' && host ? `Rejoindre la table de ${host}` : 'Rejoindre la table'}
              </h2>
              {preview.state === 'OPEN' && preview.capacity ? (
                <p className="text-xs text-slate-300 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  {preview.seated} sur {preview.capacity} places prises · code {code}
                </p>
              ) : (
                <p className="text-xs text-slate-300">Code {code}</p>
              )}
              {preview.state === 'FULL' && <p className="text-xs font-bold text-amber-200">Cette table est complète.</p>}
              {preview.state === 'STARTED' && <p className="text-xs font-bold text-amber-200">Cette partie a déjà commencé.</p>}
            </div>

            {canJoin && (
              <>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-slate-300">Ton pseudo</span>
                  <input
                    type="text"
                    maxLength={20}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 focus:border-emerald-400 outline-none text-sm text-white"
                  />
                </label>
                <button
                  type="button"
                  id="btn-arrival-join"
                  disabled={!trimmed}
                  onClick={() => onJoin(trimmed)}
                  className="w-full h-12 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-black cursor-pointer disabled:opacity-50"
                >
                  Rejoindre la table
                </button>
              </>
            )}
            <button type="button" onClick={onLater} className="text-xs font-bold text-slate-400 cursor-pointer py-1">
              {canJoin ? 'Pas maintenant' : 'Ouvrir le multijoueur'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};
