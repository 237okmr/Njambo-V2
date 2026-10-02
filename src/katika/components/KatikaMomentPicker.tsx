import React, { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import type { KoraMoment } from '../../../server/engine/koraMoment';
import { describeMoment, fetchKoraMoments } from '../services/koraMomentsClient';
import { momentToBrief } from '../visual/situation';

interface KatikaMomentPickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (moment: KoraMoment) => void;
}

/** Feuille du bas : choisir un vrai Kora récent à illustrer (les cartes sont dessinées d'après la partie réelle). */
export const KatikaMomentPicker: React.FC<KatikaMomentPickerProps> = ({ open, onClose, onPick }) => {
  const [moments, setMoments] = useState<KoraMoment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchKoraMoments()
      .then((list) => {
        if (!cancelled) setMoments(list);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Lecture impossible.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-black/60" onClick={onClose}>
      <div
        className="w-full max-h-[75dvh] overflow-y-auto rounded-t-2xl border-t border-slate-700 bg-slate-900 p-4 pb-8 select-text"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Illustrer un vrai Kora</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-800 text-slate-300"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 py-6 text-sm text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement des moments…
          </div>
        )}

        {error && <p className="py-4 text-sm text-rose-300">{error}</p>}

        {!loading && !error && moments.length === 0 && (
          <p className="py-4 text-sm leading-relaxed text-slate-300">
            Aucun Kora enregistré pour l'instant. Les moments sont enregistrés automatiquement à partir du prochain Kora ou
            Double Kora réussi en multijoueur.
          </p>
        )}

        <div className="space-y-2">
          {moments.map((moment) => (
            <button
              key={moment.id}
              type="button"
              onClick={() => {
                onPick(moment);
                onClose();
              }}
              className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-slate-800 p-3 text-left active:bg-slate-700"
            >
              <div className="text-sm font-semibold text-amber-300">{describeMoment(moment)}</div>
              <div className="mt-1 text-xs leading-relaxed text-slate-300">{momentToBrief(moment)}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
