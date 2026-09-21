import React, { useState, useEffect } from 'react';
import {
  X,
  Swords,
  Trophy,
  Flame,
  Coins,
  Shield,
  Zap,
  Clock,
  ArrowRight,
  TrendingUp,
  History,
  Sparkles,
  Award,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { HeadToHeadStats, HeadToHeadMatch } from '../../types/playerProfile';
import { RivalryService } from '../../services/rivalryService';
import { PlayerAvatar } from '../profile/PlayerAvatar';
import { usePlayerProfile } from '../../context/PlayerProfileContext';

interface HeadToHeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  opponent: {
    id: string;
    name: string;
    avatarId?: string;
    avatarSeed?: string;
    friendCode?: string;
  } | null;
  onChallenge?: (opponent: { id: string; name: string; avatarSeed?: string }) => void;
}

export const HeadToHeadModal: React.FC<HeadToHeadModalProps> = ({
  isOpen,
  onClose,
  opponent,
  onChallenge,
}) => {
  const { profile } = usePlayerProfile();
  const [stats, setStats] = useState<HeadToHeadStats | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!isOpen || !opponent) {
      setStats(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    RivalryService.getHeadToHeadStats(opponent).then((res) => {
      if (isMounted) {
        setStats(res);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen, opponent]);

  if (!isOpen || !opponent) return null;

  const playerAvatarId = profile?.avatarId || 'lion';
  const playerName = profile?.displayName || 'Vous';
  const playerWins = stats?.playerWins || 0;
  const oppWins = stats?.opponentWins || 0;
  const totalMatches = stats?.totalMatches || 0;

  // Domination ratio calculation
  const playerWinPercent = totalMatches > 0 ? Math.round((playerWins / totalMatches) * 100) : 50;
  const oppWinPercent = 100 - playerWinPercent;

  const isLeading = playerWins > oppWins;
  const isTied = playerWins === oppWins;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: 'spring', damping: 24, stiffness: 300 }}
          className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden my-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/80 bg-slate-950/40">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Swords className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <h2 className="text-sm sm:text-base font-black text-white tracking-wide">
                  Face-à-Face & Rivalité
                </h2>
                <span className="text-[10px] text-slate-400">
                  Statistiques & Historique direct
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition active:scale-95 cursor-pointer"
              title="Fermer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-4 sm:p-5 flex flex-col gap-4 max-h-[75vh] overflow-y-auto">
            {isLoading ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 border-3 border-amber-500/20 border-t-amber-400 rounded-full animate-spin" />
                <span className="text-xs text-slate-400 font-medium">Calcul des statistiques directes...</span>
              </div>
            ) : (
              <>
                {/* VS Header Showcase */}
                <div className="p-4 rounded-2xl bg-gradient-to-b from-slate-800/60 to-slate-900/90 border border-slate-700/60 flex flex-col gap-3 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    {/* Player Side */}
                    <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                      <div className="relative">
                        <PlayerAvatar
                          avatarId={playerAvatarId}
                          size="md"
                          className="w-12 h-12 rounded-2xl ring-2 ring-emerald-500/40"
                        />
                        {isLeading && totalMatches > 0 && (
                          <span className="absolute -top-2 -right-1 bg-amber-500 text-slate-950 p-1 rounded-full text-[10px] shadow-md">
                            👑
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-black text-white truncate max-w-[110px]">
                        {playerName}
                      </span>
                      <span className="text-xl sm:text-2xl font-black text-emerald-400 font-mono">
                        {playerWins}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                        Victoires
                      </span>
                    </div>

                    {/* VS Badge & Center Metrics */}
                    <div className="flex flex-col items-center justify-center px-3 shrink-0">
                      <div className="w-10 h-10 rounded-2xl bg-slate-950/80 border border-amber-500/40 flex items-center justify-center shadow-lg mb-1">
                        <Swords className="w-5 h-5 text-amber-400" />
                      </div>
                      <span className="text-[11px] font-mono font-black text-slate-300">
                        {totalMatches} {totalMatches === 1 ? 'partie' : 'parties'}
                      </span>
                      {stats?.currentStreak && stats.currentStreak.count > 1 && (
                        <div className="mt-1 flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-black">
                          <Flame className="w-2.5 h-2.5 text-amber-400" />
                          <span>
                            {stats.currentStreak.winner === 'player'
                              ? `Série: +${stats.currentStreak.count} Vous`
                              : `Série: +${stats.currentStreak.count} ${opponent.name}`}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Opponent Side */}
                    <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                      <div className="relative">
                        <PlayerAvatar
                          avatarId={(opponent.avatarId || opponent.avatarSeed || 'avatar_1') as any}
                          size="md"
                          className="w-12 h-12 rounded-2xl ring-2 ring-sky-500/40"
                        />
                        {!isLeading && !isTied && totalMatches > 0 && (
                          <span className="absolute -top-2 -right-1 bg-amber-500 text-slate-950 p-1 rounded-full text-[10px] shadow-md">
                            👑
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-black text-white truncate max-w-[110px]">
                        {opponent.name}
                      </span>
                      <span className="text-xl sm:text-2xl font-black text-sky-400 font-mono">
                        {oppWins}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                        Victoires
                      </span>
                    </div>
                  </div>

                  {/* Domination Bar */}
                  {totalMatches > 0 ? (
                    <div className="flex flex-col gap-1 mt-1">
                      <div className="flex items-center justify-between text-[10px] font-bold">
                        <span className="text-emerald-400">{playerWinPercent}% domination</span>
                        <span className="text-sky-400">{oppWinPercent}%</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden flex">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-500"
                          style={{ width: `${playerWinPercent}%` }}
                        />
                        <div
                          className="h-full bg-sky-500 transition-all duration-500"
                          style={{ width: `${oppWinPercent}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-1">
                      <span className="text-[11px] text-amber-400/90 font-semibold">
                        Aucun duel enregistré pour le moment. Lancez le premier défi !
                      </span>
                    </div>
                  )}
                </div>

                {/* Metrics Bento Grid */}
                <div className="grid grid-cols-2 gap-2.5">
                  {/* Fortune / Net Delta */}
                  <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Coins className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Bilan Jetons</span>
                    </div>
                    <span
                      className={`text-base sm:text-lg font-mono font-black ${
                        (stats?.netChipsDelta || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {(stats?.netChipsDelta || 0) > 0 ? `+${stats?.netChipsDelta}` : stats?.netChipsDelta || 0} 🪙
                    </span>
                    <span className="text-[9px] text-slate-400">
                      {(stats?.netChipsDelta || 0) >= 0
                        ? 'Gain net contre cet adversaire'
                        : 'Déficit net contre cet adversaire'}
                    </span>
                  </div>

                  {/* Kora Inflicted vs Suffered */}
                  <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Exploits Kora</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-black text-emerald-400 font-mono">
                        {stats?.korasInflicted || 0} infligé{(stats?.korasInflicted || 0) > 1 ? 's' : ''}
                      </span>
                      <span className="text-[10px] text-slate-500">vs</span>
                      <span className="text-xs font-black text-rose-400 font-mono">
                        {stats?.korasSuffered || 0} reçu{(stats?.korasSuffered || 0) > 1 ? 's' : ''}
                      </span>
                    </div>
                    <span className="text-[9px] text-slate-400">
                      {(stats?.doubleKorasInflicted || 0) > 0 && `(dont ${stats?.doubleKorasInflicted} Double Kora)`}
                    </span>
                  </div>

                  {/* Average Tricks */}
                  <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <TrendingUp className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Moyenne de Plis</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-black text-emerald-400 font-mono">
                        {stats?.playerAvgTricks || 0} / partie
                      </span>
                      <span className="text-[10px] text-slate-500">vs</span>
                      <span className="text-xs font-black text-sky-400 font-mono">
                        {stats?.opponentAvgTricks || 0}
                      </span>
                    </div>
                    <span className="text-[9px] text-slate-400">Prises de cartes par donne</span>
                  </div>

                  {/* Ratio / Mastery */}
                  <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Taux de Réussite</span>
                    </div>
                    <span className="text-base sm:text-lg font-mono font-black text-amber-300">
                      {stats?.winRate || 0}%
                    </span>
                    <span className="text-[9px] text-slate-400">
                      {totalMatches > 0
                        ? `${playerWins} V / ${totalMatches} Total`
                        : 'En attente de duel'}
                    </span>
                  </div>
                </div>

                {/* 5 Last Direct Matches History */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-black text-slate-300">
                      <History className="w-3.5 h-3.5 text-amber-400" />
                      <span>Dernières confrontations</span>
                    </div>
                    {stats?.lastPlayedAt ? (
                      <span className="text-[10px] text-slate-500 font-medium">
                        Dernier match : {new Date(stats.lastPlayedAt).toLocaleDateString('fr-FR')}
                      </span>
                    ) : null}
                  </div>

                  {stats?.lastMatches && stats.lastMatches.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      {stats.lastMatches.map((m: HeadToHeadMatch) => {
                        const isWin = m.isPlayerWinner;
                        const dateStr = new Date(m.createdAt).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        });

                        let winLabel = 'Standard';
                        let winBadgeClass = 'bg-slate-800 text-slate-300 border-slate-700';

                        if (m.winType === 'DOUBLE_KORA') {
                          winLabel = '👑 Double Kora';
                          winBadgeClass = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
                        } else if (m.winType === 'KORA') {
                          winLabel = '⚡ Kora';
                          winBadgeClass = 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40';
                        } else if (m.winType === 'THREE_SEVENS') {
                          winLabel = '🃏 3 Septs';
                          winBadgeClass = 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40';
                        } else if (m.winType === 'UNDER_21') {
                          winLabel = '🛡️ < 21 Pts';
                          winBadgeClass = 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
                        }

                        return (
                          <div
                            key={m.id}
                            className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs transition ${
                              isWin
                                ? 'bg-emerald-950/20 border-emerald-500/30'
                                : 'bg-rose-950/20 border-rose-500/30'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`w-6 h-6 rounded-lg flex items-center justify-center font-black text-[10px] shrink-0 ${
                                  isWin ? 'bg-emerald-500 text-slate-950' : 'bg-rose-500 text-white'
                                }`}
                              >
                                {isWin ? 'V' : 'D'}
                              </span>

                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-white truncate">
                                    {isWin ? 'Victoire' : `Victoire de ${opponent.name}`}
                                  </span>
                                  <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${winBadgeClass}`}>
                                    {winLabel}
                                  </span>
                                </div>
                                <span className="text-[10px] text-slate-400">{dateStr}</span>
                              </div>
                            </div>

                            <div className="flex flex-col items-end shrink-0">
                              <span
                                className={`font-mono font-black ${
                                  m.netDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {m.netDelta > 0 ? `+${m.netDelta}` : m.netDelta} 🪙
                              </span>
                              <span className="text-[9px] text-slate-400">
                                Mise {m.baseBet} 🪙
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-6 px-4 rounded-xl bg-slate-950/40 border border-slate-800 text-center flex flex-col items-center gap-1">
                      <span className="text-xs text-slate-300 font-bold">Pas encore d'historique</span>
                      <span className="text-[10px] text-slate-500">
                        Jouez une partie multijoueur ensemble pour alimenter vos statistiques de face-à-face.
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Footer Action Buttons */}
          <div className="p-4 border-t border-slate-800/80 bg-slate-950/60 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-black text-xs transition active:scale-95 cursor-pointer"
            >
              Fermer
            </button>

            {onChallenge && (
              <button
                type="button"
                onClick={() => {
                  onChallenge({
                    id: opponent.id,
                    name: opponent.name,
                    avatarSeed: opponent.avatarId || opponent.avatarSeed,
                  });
                  onClose();
                }}
                className="flex-[2] h-11 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:brightness-110 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
              >
                <Swords className="w-4 h-4" />
                <span>⚡ Défier en duel 1v1</span>
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
