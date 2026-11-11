import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, Users, Wallet } from 'lucide-react';
import type { OpenCashLevel, OpenTableEntry } from '../../types';
import { OpenTablesUpdate, wsService } from '../../services/websocketService';
import { getPublicParamNumber } from '../../services/publicConfig';
import { formatFcfa } from '../../services/koraCashFormat';
import { useVisibleInterval } from '../../hooks/useVisibleInterval';
import { PlayerAvatar } from '../profile/PlayerAvatar';

interface OpenTablesPanelProps {
  mode: 'FREE' | 'CASH';
  /** Rejoint un salon par son code (même chemin que le bouton « Rejoindre » de Multijoueur). */
  onJoinCode: (code: string) => Promise<{ success: boolean; error?: string }>;
  onOpenKoraCash: () => void;
}

const header = 'text-xs font-black uppercase tracking-wider text-slate-400';

/** Tables ouvertes : salons publics et tables d'amis (gratuit), niveaux Kora Cash (argent). Les deux ne se mélangent jamais. */
export const OpenTablesPanel: React.FC<OpenTablesPanelProps> = ({ mode, onJoinCode, onOpenKoraCash }) => {
  const [free, setFree] = useState<OpenTableEntry[] | null>(null);
  const [levels, setLevels] = useState<OpenCashLevel[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Le parent recrée sa fonction à chaque rendu : on la lit par une référence pour ne pas relancer l'abonnement.
  const joinCodeRef = useRef(onJoinCode);
  joinCodeRef.current = onJoinCode;

  const refresh = useCallback(() => {
    wsService.getOpenTables(mode);
  }, [mode]);

  useEffect(() => {
    setFree(null);
    setLevels(null);
    setMessage(null);
    const offList = wsService.onOpenTables((update: OpenTablesUpdate) => {
      if (update.mode === 'FREE' && mode === 'FREE') setFree(update.tables);
      if (update.mode === 'CASH' && mode === 'CASH') setLevels(update.levels);
    });
    const offTarget = wsService.onOpenTableTarget((code) => {
      void joinCodeRef.current(code).then((res) => {
        setBusyId(null);
        if (!res.success) setMessage(res.error || 'Impossible de rejoindre cette table.');
      });
    });
    refresh();
    return () => {
      offList();
      offTarget();
    };
  }, [mode, refresh]);

  useVisibleInterval(refresh, getPublicParamNumber('clientOpenTablesPollSeconds') * 1000);

  const join = async (table: OpenTableEntry) => {
    setBusyId(table.id);
    setMessage(null);
    if (table.kind === 'FRIEND') {
      wsService.resolveOpenTable(table.id);
      return;
    }
    const res = await joinCodeRef.current(table.id);
    setBusyId(null);
    if (!res.success) setMessage(res.error || 'Impossible de rejoindre cette table.');
  };

  const loaded = mode === 'CASH' ? levels !== null : free !== null;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className={header}>{mode === 'CASH' ? 'Niveaux Kora Cash ouverts' : 'Tables ouvertes'}</span>
        <button
          type="button"
          onClick={refresh}
          aria-label="Actualiser les tables ouvertes"
          className="h-8 px-2.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:border-amber-500/50"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Actualiser</span>
        </button>
      </div>

      {message && <p className="text-xs font-bold text-rose-300">{message}</p>}

      {!loaded && (
        <div className="flex items-center justify-center gap-2 p-6 text-sm text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Recherche des tables…</span>
        </div>
      )}

      {loaded && mode === 'FREE' && free!.length === 0 && (
        <div className="py-6 px-5 rounded-2xl bg-slate-900/40 border border-slate-800/80 text-center">
          <p className="text-sm font-bold text-slate-200">Aucune table ouverte pour le moment</p>
          <p className="text-xs text-slate-400 mt-1">Crée la tienne depuis Multijoueur, ou reviens dans quelques minutes.</p>
        </div>
      )}

      {loaded && mode === 'FREE' &&
        free!.map((t) => (
          <div key={`${t.kind}-${t.id}`} className="p-3 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <PlayerAvatar avatarId={(t.hostAvatarSeed as any) || 'avatar_1'} size="sm" className="w-9 h-9 shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-bold text-white truncate">{t.hostName}</span>
                <span className="text-xs text-slate-400 truncate">
                  {t.seated}/{t.capacity} joueurs · Mise {t.baseBet} jetons
                  {t.kind === 'FRIEND' ? ' · Table privée' : ''}
                </span>
                {t.friendNames.length > 0 && (
                  <span className="text-xs font-bold text-amber-300 truncate flex items-center gap-1">
                    <Users className="w-3 h-3 shrink-0" />
                    {t.friendNames.join(', ')}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              disabled={busyId !== null}
              onClick={() => void join(t)}
              className="h-9 px-3 rounded-xl bg-emerald-500 text-slate-950 text-xs font-black shrink-0 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              {busyId === t.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Rejoindre</span>
            </button>
          </div>
        ))}

      {loaded && mode === 'CASH' && levels!.length === 0 && (
        <div className="py-6 px-5 rounded-2xl bg-slate-900/40 border border-slate-800/80 text-center">
          <p className="text-sm font-bold text-slate-200">Aucune table Kora Cash en attente</p>
          <p className="text-xs text-slate-400 mt-1">Ouvre une table depuis Kora Cash : tu y choisis ta mise.</p>
        </div>
      )}

      {loaded && mode === 'CASH' &&
        levels!.map((l) => (
          <div key={l.baseBet} className="p-3 rounded-2xl bg-slate-900 border border-amber-500/50 flex items-center justify-between gap-3">
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-black text-white">Mise {formatFcfa(l.baseBet)}</span>
              <span className="text-xs text-slate-400">
                {l.tables} table{l.tables > 1 ? 's' : ''} · {l.freeSeats} place{l.freeSeats > 1 ? 's' : ''} libre{l.freeSeats > 1 ? 's' : ''} · Commission {l.rakePercent} %
              </span>
            </div>
            <button
              type="button"
              onClick={onOpenKoraCash}
              className="h-9 px-3 rounded-xl bg-gradient-to-r from-amber-400 to-amber-600 text-slate-950 text-xs font-black shrink-0 cursor-pointer flex items-center gap-1.5"
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Voir dans Kora Cash</span>
            </button>
          </div>
        ))}
    </div>
  );
};
