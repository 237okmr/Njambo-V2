import React from 'react';
import { LeaderboardCategory, LeaderboardEntry } from '../../types/leaderboard';
import { LeaderboardTone, leaderboardMetric } from '../../utils/leaderboardDisplay';
import { PlayerAvatar } from '../profile/PlayerAvatar';

const TONE_CLASSES: Record<LeaderboardTone, string> = {
  gold: 'text-amber-400',
  positive: 'text-emerald-400',
  negative: 'text-rose-400',
  neutral: 'text-slate-400',
};

interface LeaderboardCardProps {
  player: LeaderboardEntry;
  category: LeaderboardCategory;
  isHighlighted: boolean;
  onSelect: (player: LeaderboardEntry) => void;
}

/** Carte d'un joueur, identique dans les quatre onglets : le chiffre a une largeur bornée, le pseudo se coupe s'il le faut. */
export const LeaderboardCard: React.FC<LeaderboardCardProps> = ({ player, category, isHighlighted, onSelect }) => {
  const metric = leaderboardMetric(player, category);
  return (
    <button
      type="button"
      id={`leaderboard-player-${player.uid}`}
      onClick={() => onSelect(player)}
      className={`w-full px-3 py-3 rounded-xl border flex items-center gap-2.5 text-left transition cursor-pointer hover:border-slate-600 ${
        player.isCurrentUser ? 'bg-amber-500/10 border-amber-500/50' : 'bg-slate-900/70 border-slate-800/80'
      } ${isHighlighted ? 'ring-2 ring-amber-400' : ''}`}
    >
      <span
        className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono font-black text-xs shrink-0 ${
          player.rank <= 3
            ? 'bg-amber-500 text-slate-950'
            : player.rank <= 10
              ? 'bg-slate-800 text-amber-400 border border-slate-700'
              : 'bg-slate-950 text-slate-400 border border-slate-800'
        }`}
      >
        {player.rank}
      </span>

      <PlayerAvatar avatarId={player.avatarId} photoURL={player.photoURL} size="sm" className="w-10 h-10 shrink-0" />

      <span className="flex flex-col flex-1 min-w-0 gap-0.5">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className={`text-sm font-bold truncate ${player.isCurrentUser ? 'text-amber-300' : 'text-white'}`}>{player.displayName}</span>
          {player.isCurrentUser && <span className="text-xs font-black px-1.5 rounded bg-amber-500 text-slate-950 shrink-0">Toi</span>}
        </span>
        <span className={`text-xs font-medium truncate ${player.title.colorClass}`}>
          {player.title.badge} {player.title.title}
        </span>
        <span className="text-xs text-slate-400 truncate">{metric.detail}</span>
      </span>

      <span className="w-[4.5rem] shrink-0 flex flex-col items-end text-right">
        <span className={`text-base font-black font-mono leading-tight whitespace-nowrap ${TONE_CLASSES[metric.tone]}`}>{metric.value}</span>
        <span className="text-xs text-slate-400">{metric.unit}</span>
      </span>
    </button>
  );
};

const PODIUM_PLACES = [
  { index: 1, medal: '🥈', frame: 'bg-slate-900/80 border border-slate-800', avatar: 'md' as const, name: 'text-white', title: 'text-slate-400' },
  { index: 0, medal: '🥇', frame: 'bg-gradient-to-b from-amber-500/15 to-slate-900/95 border-2 border-amber-400', avatar: 'lg' as const, name: 'text-amber-300', title: 'text-amber-400/80' },
  { index: 2, medal: '🥉', frame: 'bg-slate-900/80 border border-slate-800', avatar: 'md' as const, name: 'text-white', title: 'text-slate-400' },
];

interface LeaderboardPodiumProps {
  players: LeaderboardEntry[];
  category: LeaderboardCategory;
  highlightedUid: string | null;
  onSelect: (player: LeaderboardEntry) => void;
}

/** Les trois premiers. Les détails sont dans la fiche du joueur, pour que rien ne soit serré. */
export const LeaderboardPodium: React.FC<LeaderboardPodiumProps> = ({ players, category, highlightedUid, onSelect }) => (
  <div className="grid grid-cols-3 gap-2 items-end pt-3">
    {PODIUM_PLACES.map(({ index, medal, frame, avatar, name, title }) => {
      const player = players[index];
      const metric = leaderboardMetric(player, category);
      return (
        <button
          key={player.uid}
          type="button"
          id={`leaderboard-player-${player.uid}`}
          onClick={() => onSelect(player)}
          className={`relative min-w-0 px-1.5 pt-5 pb-3 rounded-2xl flex flex-col items-center gap-1 text-center cursor-pointer transition ${frame} ${
            highlightedUid === player.uid ? 'ring-2 ring-amber-400' : ''
          }`}
        >
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-2 rounded-full bg-slate-800 border border-slate-700 text-xs font-black text-white whitespace-nowrap">
            {medal} {index + 1}
          </span>
          <PlayerAvatar avatarId={player.avatarId} photoURL={player.photoURL} size={avatar} />
          <span className={`w-full text-sm font-bold truncate ${name}`}>{player.displayName}</span>
          <span className={`w-full text-xs leading-tight line-clamp-2 min-h-8 ${title}`}>
            {player.title.badge} {player.title.title}
          </span>
          <span className={`text-lg font-black font-mono leading-tight whitespace-nowrap ${TONE_CLASSES[metric.tone]}`}>{metric.value}</span>
          <span className="text-xs text-slate-400 -mt-1">{metric.unit}</span>
        </button>
      );
    })}
  </div>
);
