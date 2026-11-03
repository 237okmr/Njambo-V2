import React from 'react';
import { motion } from 'motion/react';
import { ChevronRight, ChevronUp, Crosshair, X } from 'lucide-react';
import { CurrentUserRankSummary, LeaderboardCategory, LeaderboardEntry } from '../../types/leaderboard';
import { HonorificTitle } from '../../types/playerProfile';
import { RankProgress } from '../../services/rankTiers';
import { formatCompactNumber, leaderboardGapLabel, leaderboardMetric } from '../../utils/leaderboardDisplay';

const CATEGORY_LABELS: Record<LeaderboardCategory, string> = {
  WINS: 'Ton score',
  WIN_RATE: 'Ton ratio',
  KORAS: 'Tes Koras',
  CHIPS: 'Ta fortune',
};

export const MyPositionBar: React.FC<{ rank: CurrentUserRankSummary; onOpen: () => void }> = ({ rank, onOpen }) => (
  <div className="shrink-0 px-3 sm:px-6 py-1.5 bg-slate-900/90 border-b border-slate-800/80">
    <button
      type="button"
      id="btn-my-position"
      onClick={onOpen}
      className="max-w-2xl mx-auto w-full min-h-11 px-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 flex items-center justify-between gap-2 cursor-pointer active:scale-[0.99] transition"
    >
      <span className="text-sm font-bold truncate">
        Ma position : <span className="font-black text-amber-300">{rank.rank}</span> sur {rank.totalRankedPlayers}
      </span>
      <ChevronUp className="w-4 h-4 text-amber-400 shrink-0" />
    </button>
  </div>
);

interface MyPositionPanelProps {
  rank: CurrentUserRankSummary;
  category: LeaderboardCategory;
  entry: LeaderboardEntry | null;
  nextTitle: HonorificTitle | null;
  progress: RankProgress;
  onClose: () => void;
  onLocate: () => void;
  onOpenProfile?: () => void;
}

/** Panneau ouvert à la demande : la position ne prend plus de place sur la liste. */
export const MyPositionPanel: React.FC<MyPositionPanelProps> = ({ rank, category, entry, nextTitle, progress, onClose, onLocate, onOpenProfile }) => {
  const metric = entry ? leaderboardMetric(entry, category) : null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-end justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        id="my-position-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="my-position-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-slate-900 border-t border-slate-800 rounded-t-3xl p-4 flex flex-col gap-3 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id="my-position-title" className="text-base font-black text-white">
            Ma position : {rank.rank} sur {rank.totalRankedPlayers}
          </h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="w-9 h-9 rounded-xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {metric && (
          <div className="flex items-baseline justify-between gap-3 px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
            <span className="text-sm text-slate-300">{CATEGORY_LABELS[category]}</span>
            <span className="text-base font-black font-mono text-amber-400 whitespace-nowrap">
              {metric.value} <span className="text-xs font-bold font-sans text-slate-400">{metric.unit}</span>
            </span>
          </div>
        )}

        <p className="text-sm text-slate-300">
          {rank.nextPlayerName ? (
            <>
              Encore <strong className="text-amber-300 font-black">{leaderboardGapLabel(rank.pointsToNextRank, category)}</strong> pour dépasser{' '}
              <strong className="text-white">{rank.nextPlayerName}</strong>.
            </>
          ) : (
            <strong className="text-emerald-400">Tu es en tête de ce classement.</strong>
          )}
        </p>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
            <span className="min-w-0">
              {nextTitle ? `Prochain palier : ${nextTitle.title}` : 'Palier le plus haut atteint'}
              {nextTitle && progress.pointsToNext !== null && ` · encore ${formatCompactNumber(progress.pointsToNext)} ${progress.pointsToNext > 1 ? 'points' : 'point'}`}
            </span>
            <span className="font-bold font-mono text-amber-400 shrink-0">{progress.percent} %</span>
          </div>
          <div className="h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
            <div className="h-full bg-gradient-to-r from-amber-500 to-amber-300 rounded-full" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>

        <button
          type="button"
          id="btn-locate-me"
          onClick={onLocate}
          className="w-full min-h-11 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
        >
          <Crosshair className="w-4 h-4" />
          <span>Me situer dans la liste</span>
        </button>
        {onOpenProfile && (
          <button
            type="button"
            id="btn-position-open-profile"
            onClick={onOpenProfile}
            className="w-full min-h-11 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-sm flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>Voir mon profil</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </motion.div>
    </motion.div>
  );
};
