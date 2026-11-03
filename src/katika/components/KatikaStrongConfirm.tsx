import React, { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';

/**
 * Confirmation renforcée : une action Kora Cash lancée depuis un téléphone demande d'écrire CONFIRMER.
 * tikaFetch attend la réponse avant d'envoyer la demande (voir services/tikaFetch.ts).
 */
const CONFIRM_WORD = 'CONFIRMER';

type Pending = { description: string; resolve: (ok: boolean) => void };
let showRequest: ((pending: Pending) => void) | null = null;

/** Demande la confirmation ; si l'écran de confirmation n'est pas affiché, l'action est refusée. */
export function requestStrongConfirm(description: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!showRequest) {
      resolve(false);
      return;
    }
    showRequest({ description, resolve });
  });
}

export const KatikaStrongConfirm: React.FC = () => {
  const [pending, setPending] = useState<Pending | null>(null);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    showRequest = (next) => {
      setTyped('');
      setPending(next);
    };
    return () => {
      showRequest = null;
    };
  }, []);

  if (!pending) return null;

  const close = (ok: boolean) => {
    pending.resolve(ok);
    setPending(null);
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/70 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="katika-strong-confirm-title">
      <div className="w-full max-w-md rounded-2xl border border-red-700/60 bg-slate-950 p-5 flex flex-col gap-4">
        <h2 id="katika-strong-confirm-title" className="text-base font-bold text-red-200 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-red-400" />
          Action d'argent réel
        </h2>
        <p className="text-sm text-slate-200">{pending.description}</p>
        <p className="text-sm text-slate-400">
          Depuis un téléphone, une action Kora Cash demande une confirmation renforcée. Écris <strong className="text-white">{CONFIRM_WORD}</strong> pour continuer.
        </p>
        <input
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          className="min-h-[44px] px-3 rounded-xl bg-slate-900 border border-slate-700 text-white text-base outline-none focus:border-red-500"
          aria-label={`Écris ${CONFIRM_WORD}`}
        />
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={() => close(false)} className="min-h-[44px] px-4 rounded-xl bg-slate-800 text-sm text-slate-200">
            Annuler
          </button>
          <button
            type="button"
            disabled={typed.trim().toUpperCase() !== CONFIRM_WORD}
            onClick={() => close(true)}
            className="min-h-[44px] px-4 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-40"
          >
            Confirmer l'action
          </button>
        </div>
      </div>
    </div>
  );
};
