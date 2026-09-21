import React from 'react';
import { Loader2, X } from 'lucide-react';

export function getJoinProgressMessage(elapsedSeconds: number): string {
  if (elapsedSeconds < 10) {
    return 'Connexion à la table en cours…';
  }
  if (elapsedSeconds < 30) {
    return "Le serveur met un peu plus de temps que d'habitude…";
  }
  return 'Toujours en cours. Tu peux annuler.';
}

interface JoinProgressIndicatorProps {
  elapsedSeconds: number;
  onCancel: () => void;
  roomCode?: string;
  variant?: 'modal' | 'banner' | 'card' | 'overlay';
  title?: string;
}

export const JoinProgressIndicator: React.FC<JoinProgressIndicatorProps> = ({
  elapsedSeconds,
  onCancel,
  roomCode,
  variant = 'modal',
  title,
}) => {
  const message = getJoinProgressMessage(elapsedSeconds);

  if (variant === 'overlay') {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl flex flex-col items-center text-center gap-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
            <Loader2 className="w-7 h-7 text-amber-400 animate-spin" />
          </div>

          <div className="flex flex-col gap-1">
            <h3 className="text-base font-black text-white">
              {title || (roomCode ? `Table #${roomCode}` : 'Connexion à la table')}
            </h3>
            <p className="text-xs text-slate-300 font-medium">
              {message}
            </p>
          </div>

          <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800">
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 transition-all duration-1000 ease-linear"
              style={{ width: `${Math.min(100, (elapsedSeconds / 60) * 100)}%` }}
            />
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="w-full h-10 rounded-xl bg-slate-800 hover:bg-rose-500/20 hover:border-rose-500/40 text-slate-300 hover:text-rose-200 border border-slate-700 text-xs font-bold transition active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
          >
            <X className="w-3.5 h-3.5" />
            <span>Annuler</span>
          </button>
        </div>
      </div>
    );
  }

  if (variant === 'banner') {
    return (
      <div className="w-full p-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-200 flex items-center justify-between gap-3 shadow-lg animate-in fade-in">
        <div className="flex items-center gap-2.5 min-w-0">
          <Loader2 className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
          <div className="flex flex-col min-w-0">
            {roomCode && (
              <span className="text-[10px] font-black uppercase text-amber-400">
                Table #{roomCode}
              </span>
            )}
            <span className="text-xs font-semibold text-slate-200 truncate">
              {message}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="h-8 px-3 rounded-xl bg-slate-900/80 hover:bg-slate-900 border border-amber-500/30 text-amber-300 hover:text-white text-xs font-bold transition active:scale-95 cursor-pointer shrink-0"
        >
          Annuler
        </button>
      </div>
    );
  }

  // Default 'modal' / 'card' variant
  return (
    <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col gap-2.5 animate-in fade-in">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Loader2 className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
          <span className="text-xs font-bold text-amber-200 leading-tight">
            {message}
          </span>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 hover:text-rose-200 hover:border-rose-500/40 text-slate-300 border border-slate-700 text-[11px] font-bold transition active:scale-95 cursor-pointer shrink-0"
        >
          Annuler
        </button>
      </div>

      <div className="w-full bg-slate-950 rounded-full h-1 overflow-hidden border border-slate-800">
        <div
          className="h-full bg-amber-400 transition-all duration-1000 ease-linear"
          style={{ width: `${Math.min(100, (elapsedSeconds / 60) * 100)}%` }}
        />
      </div>
    </div>
  );
};
