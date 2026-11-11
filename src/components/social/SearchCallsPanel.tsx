import React from 'react';
import { Megaphone, Swords, UserPlus, X } from 'lucide-react';
import { PlayerAvatar } from '../profile/PlayerAvatar';
import type { MySearchCall, SearchCallEntry } from '../../services/websocketService';
import type { SocialMode } from '../../utils/socialCenter';
import { liveSearchCalls } from '../../utils/socialCenter';

const smallPrimary = 'h-8 px-3 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 text-xs font-black flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer disabled:opacity-50';
const smallSecondary = 'h-8 px-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1 hover:border-amber-500/50 active:scale-95 cursor-pointer';

function minutesLeft(expiresAt: number, nowMs: number): number {
  return Math.max(1, Math.ceil((expiresAt - nowMs) / 60000));
}

/** « Ils cherchent une partie » : en tête de l'onglet Invitations, jamais de mise ni de montant. */
export const SearchCallsList: React.FC<{
  mode: SocialMode;
  calls: readonly SearchCallEntry[];
  nowMs: number;
  repliedIds: Readonly<Record<string, true>>;
  onReply: (call: SearchCallEntry) => void;
}> = ({ mode, calls, nowMs, repliedIds, onReply }) => {
  const live = liveSearchCalls(calls, mode, nowMs);
  if (live.length === 0) return null;
  return (
    <section id="social-search-calls" className="flex flex-col gap-2" aria-label="Joueurs qui cherchent une partie">
      <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
        <Megaphone className="w-3.5 h-3.5" /> {live.length > 1 ? 'Ils cherchent une partie' : 'Il cherche une partie'}
      </span>
      {live.map((call) => {
        const replied = repliedIds[call.userId] === true;
        return (
          <div key={call.userId} className={`p-3 rounded-2xl bg-slate-900 border flex items-center gap-2.5 ${mode === 'CASH' ? 'border-amber-500/60' : 'border-slate-700'}`}>
            <PlayerAvatar avatarId={(call.avatarId as any) || 'avatar_1'} size="sm" className="w-9 h-9 shrink-0" />
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-black text-white">{call.displayName}</span>
              <span className="block truncate text-xs text-slate-400">
                {call.isFriend ? 'Ami' : 'Joueur en ligne'} · encore {minutesLeft(call.expiresAt, nowMs)} min
                {call.canJoin ? ' · assis à une table' : ''}
              </span>
            </div>
            <button type="button" disabled={replied} onClick={() => onReply(call)} className={smallPrimary}>
              <Swords className="w-3.5 h-3.5" />
              <span>{replied ? 'Répondu' : call.canJoin ? 'Rejoindre' : 'Partant'}</span>
            </button>
          </div>
        );
      })}
    </section>
  );
};

/** Mon appel en cours : durée restante, arrêt, et ceux qui ont répondu « partant » avec un bouton pour les inviter. */
export const MySearchCard: React.FC<{
  mine: MySearchCall;
  nowMs: number;
  inviteLabel: string;
  onInvite: (partant: MySearchCall['partants'][number]) => void;
  onStop: () => void;
}> = ({ mine, nowMs, inviteLabel, onInvite, onStop }) => (
  <section id="social-my-search" className="p-3.5 rounded-2xl bg-slate-900 border border-amber-500/50 flex flex-col gap-2.5" aria-label="Mon appel">
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-sm font-black text-white">
        <Megaphone className="w-4 h-4 text-amber-400" /> Tu cherches une partie
      </span>
      <button type="button" onClick={onStop} className="h-8 px-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1 cursor-pointer hover:border-rose-500/50">
        <X className="w-3.5 h-3.5" /> Arrêter
      </button>
    </div>
    <span className="text-xs text-slate-400">Encore {minutesLeft(mine.expiresAt, nowMs)} min. Tes amis et les joueurs qui l'ont accepté sont prévenus.</span>
    {mine.partants.length === 0 ? (
      <span className="text-xs text-slate-500">Personne n'a encore répondu.</span>
    ) : (
      mine.partants.map((p) => (
        <div key={p.userId} className="flex items-center gap-2.5">
          <PlayerAvatar avatarId={(p.avatarId as any) || 'avatar_1'} size="sm" className="w-8 h-8 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">{p.displayName} est partant</span>
          <button type="button" onClick={() => onInvite(p)} className={smallPrimary}>
            <UserPlus className="w-3.5 h-3.5" />
            <span>{inviteLabel}</span>
          </button>
        </div>
      ))
    )}
  </section>
);

/** Bouton « Je cherche une partie » (onglet En ligne). */
export const SearchStarter: React.FC<{
  mode: SocialMode;
  /** Un appel est déjà en cours dans l'autre mode. */
  busyOtherMode: boolean;
  onStart: () => void;
}> = ({ mode, busyOtherMode, onStart }) => (
  <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col gap-2">
    <button type="button" disabled={busyOtherMode} onClick={onStart} className={`${smallPrimary} h-10 w-full justify-center`}>
      <Megaphone className="w-4 h-4" />
      <span>Je cherche une partie</span>
    </button>
    <span className="text-xs text-slate-400">
      {busyOtherMode
        ? `Ton appel est déjà en cours côté ${mode === 'CASH' ? 'Gratuit' : 'Kora Cash'}. Arrête-le d'abord.`
        : mode === 'CASH'
          ? 'Tes amis et les joueurs qui l\'ont accepté sont prévenus. Aucune mise n\'est engagée : vous ouvrez ensuite une table dans Kora Cash.'
          : 'Tes amis et les joueurs qui l\'ont accepté sont prévenus. L\'appel s\'efface seul.'}
    </span>
  </div>
);
