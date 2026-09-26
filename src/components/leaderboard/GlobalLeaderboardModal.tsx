import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Trophy,
  Crown,
  Medal,
  Flame,
  Coins,
  Percent,
  Search,
  RotateCw,
  X,
  ChevronRight,
  ShieldCheck,
  UserPlus,
  Swords,
  Share2,
  Sparkles,
  Info,
  Check,
  ShieldAlert,
} from 'lucide-react';
import {
  LeaderboardCategory,
  LeaderboardTimeframe,
  LeaderboardEntry,
  CurrentUserRankSummary,
  PublicPlayerProfileData,
} from '../../types/leaderboard';
import { LeaderboardService } from '../../services/leaderboardService';
import { FriendService } from '../../services/friendService';
import { PlayerAvatar } from '../profile/PlayerAvatar';
import { HeadToHeadModal } from '../rivalry/HeadToHeadModal';
import { usePlayerProfile } from '../../context/PlayerProfileContext';
import { GoogleIcon } from '../common/GoogleIcon';
import { NativeScreenHeader } from '../common/NativeScreenHeader';
import { NativeSegmentedNav, SegmentTab } from '../common/NativeSegmentedNav';

export interface GlobalLeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChallengePlayer?: (player: { id: string; name: string; avatarId?: string }) => void;
  onOpenProfile?: () => void;
}

export const GlobalLeaderboardModal: React.FC<GlobalLeaderboardModalProps> = ({
  isOpen,
  onClose,
  onChallengePlayer,
  onOpenProfile,
}) => {
  const { isLoggedIn, loginWithGoogle, profile, progressPercent, currentTitle, nextTitle } = usePlayerProfile();
  const [activeCategory, setActiveCategory] = useState<LeaderboardCategory>('WINS');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [userRank, setUserRank] = useState<CurrentUserRankSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedPlayer, setSelectedPlayer] = useState<PublicPlayerProfileData | null>(null);
  const [selectedH2HOpponent, setSelectedH2HOpponent] = useState<{
    id: string;
    name: string;
    avatarId?: string;
    friendCode?: string;
  } | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [selectedModeFilter, setSelectedModeFilter] = useState<'ALL' | 'MULTIPLAYER' | 'SOLO'>('ALL');
  const [selectedTimeframe, setSelectedTimeframe] = useState<LeaderboardTimeframe>('ALL');
  const [showMasteryHelp, setShowMasteryHelp] = useState<boolean>(false);

  // Mémorisation des filtres pour l'onglet Fortune (CHIPS)
  const savedTimeframeRef = React.useRef<LeaderboardTimeframe>('ALL');
  const savedModeFilterRef = React.useRef<'ALL' | 'MULTIPLAYER' | 'SOLO'>('ALL');
  const lastCategoryRef = React.useRef<LeaderboardCategory>('WINS');

  useEffect(() => {
    if (activeCategory === 'CHIPS') {
      if (lastCategoryRef.current !== 'CHIPS') {
        savedTimeframeRef.current = selectedTimeframe;
        savedModeFilterRef.current = selectedModeFilter;
        setSelectedTimeframe('ALL');
        if (selectedModeFilter === 'SOLO') {
          setSelectedModeFilter('ALL');
        }
      }
    } else {
      if (lastCategoryRef.current === 'CHIPS') {
        setSelectedTimeframe(savedTimeframeRef.current);
        setSelectedModeFilter(savedModeFilterRef.current);
      }
    }
    lastCategoryRef.current = activeCategory;
  }, [activeCategory, selectedTimeframe, selectedModeFilter]);

  const fetchLeaderboard = async (forceRefresh: boolean = false) => {
    setLoading(true);
    try {
      const data = await LeaderboardService.getLeaderboard(activeCategory, forceRefresh, selectedTimeframe);
      setEntries(data.entries);
      setUserRank(data.currentUserRank);
    } catch (e) {
      console.warn('[GlobalLeaderboard] Fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLeaderboard(false);
    }
  }, [isOpen, activeCategory, selectedTimeframe, isLoggedIn]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleBackClick();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedPlayer, activeCategory, onClose]);

  useEffect(() => {
    if (isOpen) {
      window.history.pushState({ screen: 'leaderboard' }, '');
      const handlePopState = () => {
        onClose();
      };
      window.addEventListener('popstate', handlePopState);
      return () => {
        window.removeEventListener('popstate', handlePopState);
      };
    }
  }, [isOpen, onClose]);

  const handleBackClick = () => {
    if (selectedPlayer) {
      setSelectedPlayer(null);
      return;
    }
    if (activeCategory !== 'WINS') {
      setActiveCategory('WINS');
      return;
    }
    if (window.history.state?.screen === 'leaderboard') {
      window.history.back();
    } else {
      onClose();
    }
  };

  const baseEligibleEntries = useMemo(() => {
    let result = entries;
    // Apply 10 games threshold for WIN_RATE
    if (activeCategory === 'WIN_RATE') {
      result = result.filter((e) => e.gamesPlayed >= 10);
    }
    // Only show players with multiplayerGamesPlayed > 0 for CHIPS (Fortune)
    if (activeCategory === 'CHIPS') {
      result = result.filter((e) => (e.multiplayerGamesPlayed ?? 0) > 0);
    }
    return result;
  }, [entries, activeCategory]);

  const filteredEntries = useMemo(() => {
    let result = baseEligibleEntries;

    // Filtrer par mode
    if (selectedModeFilter === 'MULTIPLAYER') {
      result = result.filter((e) => (e.multiplayerGamesPlayed ?? 0) > 0);
    } else if (selectedModeFilter === 'SOLO') {
      result = result.filter((e) => (e.soloGamesPlayed ?? 0) > 0);
    }

    if (!searchQuery.trim()) return result;
    const q = searchQuery.toLowerCase().trim();

    // Check for advanced search queries like "> 100", "fortune > 500", etc.
    const comparisonRegex = /^\s*(fortune|victoires|gains|pertes|koras|ratio)?\s*(>|<|=)\s*(-?\d+)\s*$/i;
    const match = q.match(comparisonRegex);
    if (match) {
      const [, field, op, valStr] = match;
      const val = parseInt(valStr, 10);
      if (!isNaN(val)) {
        return result.filter((e) => {
          let targetVal = e.scoreValue; // default to active category's scoreValue
          if (field) {
            const f = field.toLowerCase();
            if (f === 'fortune') targetVal = e.fortune ?? 0;
            else if (f === 'victoires') targetVal = e.gamesWon;
            else if (f === 'gains') targetVal = e.multiplayerGains ?? 0;
            else if (f === 'pertes') targetVal = e.multiplayerPertes ?? 0;
            else if (f === 'koras') targetVal = e.koraCount + e.doubleKoraCount * 2;
            else if (f === 'ratio') targetVal = e.winRate;
          } else {
            // No field specified, use active category
            if (activeCategory === 'CHIPS') targetVal = e.fortune ?? 0;
            else if (activeCategory === 'WINS') targetVal = e.gamesWon;
            else if (activeCategory === 'KORAS') targetVal = e.koraCount + e.doubleKoraCount * 2;
            else if (activeCategory === 'WIN_RATE') targetVal = e.winRate;
          }

          if (op === '>') return targetVal > val;
          if (op === '<') return targetVal < val;
          if (op === '=') return targetVal === val;
          return true;
        });
      }
    }

    // Standard search: name, friendCode, honorific title (name or id)
    return result.filter(
      (e) =>
        e.displayName.toLowerCase().includes(q) ||
        e.friendCode.toLowerCase().includes(q) ||
        e.title.title.toLowerCase().includes(q) ||
        e.title.id.toLowerCase().includes(q)
    );
  }, [baseEligibleEntries, searchQuery, selectedModeFilter, activeCategory]);

  const top3 = useMemo(() => {
    if (searchQuery.trim() || selectedModeFilter !== 'ALL') return []; // Pas de podium si filtre ou recherche actif pour garantir un affichage linéaire simple
    return baseEligibleEntries.slice(0, 3);
  }, [baseEligibleEntries, searchQuery, selectedModeFilter]);

  const restEntries = useMemo(() => {
    if (searchQuery.trim() || selectedModeFilter !== 'ALL') return filteredEntries;
    return filteredEntries.slice(3);
  }, [filteredEntries, searchQuery, selectedModeFilter]);

  const handleAddFriend = async (player: PublicPlayerProfileData) => {
    try {
      if (isLoggedIn && profile?.uid) {
        if (player.uid === profile.uid) {
          setActionSuccessMessage('Vous ne pouvez pas vous ajouter vous-même !');
          setTimeout(() => setActionSuccessMessage(null), 3000);
          return;
        }
        await FriendService.sendCloudFriendRequest(profile.uid, {
          uid: player.uid,
          displayName: player.displayName,
          avatarId: player.avatarId,
        });
        setActionSuccessMessage(`Demande d'ami envoyée à ${player.displayName} !`);
      } else {
        FriendService.addLocalContact({
          id: player.uid,
          name: player.displayName,
          avatarSeed: player.avatarId,
        });
        setActionSuccessMessage(`${player.displayName} a été ajouté à vos contacts !`);
      }
    } catch (e: any) {
      setActionSuccessMessage(e?.message || 'Erreur lors de l’envoi de la demande.');
    }
    setTimeout(() => setActionSuccessMessage(null), 3000);
  };

  const handleSharePalmares = () => {
    const text = `🏆 Consultez le Palmarès de Njambo Kora ! Défiez les meilleurs joueurs de cartes : ${window.location.origin}`;
    if (navigator.share) {
      navigator.share({ title: 'Palmarès Njambo Kora', text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text);
      setActionSuccessMessage('Lien du Palmarès copié dans le presse-papier !');
      setTimeout(() => setActionSuccessMessage(null), 3000);
    }
  };

  const renderPodiumScore = (player: LeaderboardEntry) => {
    if (activeCategory === 'CHIPS') {
      const fortune = player.fortune ?? player.scoreValue ?? 0;
      const gains = player.multiplayerGains ?? 0;
      const pertes = player.multiplayerPertes ?? 0;

      let colorClass = 'text-slate-400';
      let sign = '';
      if (fortune > 0) {
        colorClass = 'text-emerald-400';
        sign = '+';
      } else if (fortune < 0) {
        colorClass = 'text-rose-400';
        sign = '';
      }

      return (
        <div className="flex flex-col items-center gap-0.5">
          <span className={`font-mono font-black text-sm sm:text-base ${colorClass}`}>
            {sign}{fortune.toLocaleString('fr-FR')} 🪙
          </span>
          <span className="text-[8px] text-slate-500 whitespace-nowrap">
            G:{gains} · P:{pertes}
          </span>
          <span className="text-[7px] text-slate-600 font-bold tracking-wider uppercase">
            🌐 Multijoueur
          </span>
        </div>
      );
    }

    if (activeCategory === 'KORAS') {
      return (
        <div className="flex flex-col items-center gap-1">
          <span className="font-mono font-black text-sm sm:text-base text-amber-400">
            {player.koraCount + player.doubleKoraCount * 2} pts
          </span>
          <div className="flex gap-0.5 flex-wrap justify-center max-w-[80px]">
            <span className="px-1 py-0.2 rounded bg-amber-500/10 text-amber-400 text-[7px] font-black border border-amber-500/20 whitespace-nowrap">
              👑 {player.koraCount} K.
            </span>
            <span className="px-1 py-0.2 rounded bg-cyan-500/10 text-cyan-400 text-[7px] font-black border border-cyan-500/20 whitespace-nowrap">
              💎 {player.doubleKoraCount} D.
            </span>
          </div>
        </div>
      );
    }

    if (activeCategory === 'WIN_RATE') {
      return (
        <div className="flex flex-col items-center">
          <span className="font-mono font-black text-sm sm:text-base text-amber-400">
            {player.winRate}%
          </span>
          <span className="text-[8px] text-slate-500 whitespace-nowrap mt-0.5">
            {player.gamesWon}/{player.gamesPlayed} j.
          </span>
        </div>
      );
    }

    // Default: WINS (Score de Maîtrise)
    const mastery = player.masteryScore ?? player.scoreValue ?? 0;
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="flex flex-col items-center">
          <span className="font-mono font-black text-sm sm:text-base text-amber-400 flex items-center gap-1">
            <span className="text-xs">⭐</span>
            <span>{mastery.toLocaleString('fr-FR')}</span>
            <span className="text-[10px] font-bold text-amber-300/90">pts</span>
          </span>
          <span className="text-[8px] text-slate-500 whitespace-nowrap uppercase tracking-wider font-bold">
            Score Maîtrise
          </span>
        </div>
        <div className="flex items-center justify-center gap-1 flex-wrap text-[8px] font-mono">
          {player.manchesWon !== undefined && player.manchesWon > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 font-bold whitespace-nowrap">
              🏆 {player.manchesWon}m
            </span>
          )}
          <span className="px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700/50 text-slate-300 whitespace-nowrap">
            🃏 {player.partiesWon || player.gamesWon}d
          </span>
        </div>
      </div>
    );
  };

  const renderScoreValue = (player: LeaderboardEntry) => {
    if (activeCategory === 'CHIPS') {
      const fortune = player.fortune ?? player.scoreValue ?? 0;
      const gains = player.multiplayerGains ?? 0;
      const pertes = player.multiplayerPertes ?? 0;

      let colorClass = 'text-slate-400';
      let sign = '';
      if (fortune > 0) {
        colorClass = 'text-emerald-400';
        sign = '+';
      } else if (fortune < 0) {
        colorClass = 'text-rose-400';
        sign = '';
      }

      return (
        <div className="flex flex-col items-center">
          <span className={`font-mono font-black text-xs ${colorClass}`}>
            {sign}{fortune.toLocaleString('fr-FR')} 🪙
          </span>
          <span className="text-[9px] text-slate-500 whitespace-nowrap mt-0.5">
            Gains: {gains} 🪙 · Pertes: {pertes} 🪙
          </span>
          <span className="text-[8px] text-slate-600 font-bold tracking-wider mt-0.5 uppercase">
            🌐 Multijoueur
          </span>
        </div>
      );
    }

    if (activeCategory === 'KORAS') {
      const totalPoints = player.koraCount + player.doubleKoraCount * 2;
      return (
        <div className="flex flex-col items-center gap-1">
          <span className="font-mono font-black text-xs text-amber-400">
            {totalPoints} pts
          </span>
          <div className="flex gap-1 flex-wrap justify-center max-w-[120px]">
            <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded bg-amber-500/10 text-amber-400 text-[8px] font-bold border border-amber-500/20 whitespace-nowrap">
              👑 {player.koraCount} K.
            </span>
            <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded bg-cyan-500/10 text-cyan-400 text-[8px] font-bold border border-cyan-500/20 whitespace-nowrap">
              💎 {player.doubleKoraCount} D.
            </span>
          </div>
        </div>
      );
    }

    if (activeCategory === 'WIN_RATE') {
      return (
        <div className="flex flex-col items-center">
          <span className="font-mono font-black text-xs text-amber-400">
            {player.winRate}%
          </span>
          <span className="text-[9px] text-slate-500 whitespace-nowrap mt-0.5">
            {player.gamesWon}/{player.gamesPlayed} parties
          </span>
        </div>
      );
    }

    // Default: WINS (Score de Maîtrise)
    const mastery = player.masteryScore ?? player.scoreValue ?? 0;
    return (
      <div className="flex flex-col items-center gap-1">
        <span className="font-mono font-black text-xs sm:text-sm text-amber-400 flex items-center gap-1">
          <span>⭐</span>
          <span>{mastery.toLocaleString('fr-FR')} pts</span>
        </span>
        <div className="flex flex-col items-center gap-0.5 text-[9px]">
          {(player.manchesWon !== undefined && player.manchesWon > 0) && (
            <div className="flex items-center gap-1 px-1.2 py-0.2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 whitespace-nowrap">
              <span>🏆</span>
              <span className="font-mono font-bold text-[9px]">{player.manchesWon}</span>
              <span className="text-[7px] opacity-75 font-medium">{player.manchesWon > 1 ? 'manches' : 'manche'}</span>
            </div>
          )}
          <div className="flex items-center gap-1 px-1.2 py-0.2 rounded bg-slate-800/40 border border-slate-800/50 text-slate-300 whitespace-nowrap">
            <span>🃏</span>
            <span className="font-mono font-bold text-[9px]">{player.partiesWon || player.gamesWon}</span>
            <span className="text-[7px] opacity-75 font-medium">donnes</span>
          </div>
        </div>
      </div>
    );
  };

  const renderPursuerScore = (player: LeaderboardEntry) => {
    if (activeCategory === 'CHIPS') {
      const fortune = player.fortune ?? player.scoreValue ?? 0;
      const gains = player.multiplayerGains ?? 0;
      const pertes = player.multiplayerPertes ?? 0;

      let colorClass = 'text-slate-400';
      let sign = '';
      if (fortune > 0) {
        colorClass = 'text-emerald-400';
        sign = '+';
      } else if (fortune < 0) {
        colorClass = 'text-rose-400';
        sign = '';
      }

      return (
        <div className="text-right shrink-0 flex flex-col items-end">
          <span className={`font-mono font-black text-xs sm:text-sm ${colorClass}`}>
            {sign}{fortune.toLocaleString('fr-FR')} 🪙
          </span>
          <span className="text-[9px] text-slate-500 mt-0.5">
            Gains: {gains} 🪙 · Pertes: {pertes} 🪙
          </span>
          <span className="text-[8px] text-slate-600 font-bold uppercase mt-0.5">
            🌐 Multijoueur
          </span>
        </div>
      );
    }

    if (activeCategory === 'KORAS') {
      const totalPoints = player.koraCount + player.doubleKoraCount * 2;
      return (
        <div className="text-right shrink-0 flex flex-col items-end gap-1">
          <span className="font-mono font-black text-xs sm:text-sm text-amber-400">
            {totalPoints} pts
          </span>
          <div className="flex gap-1.5 flex-wrap justify-end">
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 text-[9px] font-bold border border-amber-500/20 whitespace-nowrap">
              👑 {player.koraCount} Kora
            </span>
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 text-[9px] font-bold border border-cyan-500/20 whitespace-nowrap">
              💎 {player.doubleKoraCount} Double
            </span>
          </div>
        </div>
      );
    }

    if (activeCategory === 'WIN_RATE') {
      return (
        <div className="text-right shrink-0 flex flex-col items-end">
          <span className="font-mono font-black text-xs sm:text-sm text-amber-400">
            {player.winRate}%
          </span>
          <span className="text-[9px] text-slate-500 mt-0.5">
            {player.gamesWon}/{player.gamesPlayed} parties
          </span>
        </div>
      );
    }

    // Default: WINS (Score de Maîtrise)
    const mastery = player.masteryScore ?? player.scoreValue ?? 0;
    return (
      <div className="text-right shrink-0 flex flex-col items-end gap-1">
        <div className="text-xs sm:text-sm font-black font-mono text-amber-400 flex items-center gap-1">
          <span className="text-xs">⭐</span>
          <span>{mastery.toLocaleString('fr-FR')} pts</span>
        </div>
        <div className="flex flex-col items-end gap-0.5 text-[9px]">
          <div className="flex items-center gap-1.5 text-slate-400">
            {(player.manchesWon !== undefined && player.manchesWon > 0) && (
              <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 font-medium">
                🏆 {player.manchesWon} {player.manchesWon > 1 ? 'manches' : 'manche'}
              </span>
            )}
            <span className="px-1.5 py-0.5 rounded bg-slate-800/60 border border-slate-700/60 text-slate-300 font-medium">
              🃏 {player.partiesWon || player.gamesWon} { (player.partiesWon || player.gamesWon) > 1 ? 'donnes' : 'donne' }
            </span>
          </div>
        </div>
      </div>
    );
  };

  const categoryTabs: SegmentTab<LeaderboardCategory>[] = useMemo(
    () => [
      { id: 'WINS', label: 'Classement', shortLabel: 'Classement', icon: Trophy },
      { id: 'WIN_RATE', label: 'Ratio %', shortLabel: 'Ratio', icon: Percent },
      { id: 'KORAS', label: 'Koras', shortLabel: 'Koras', icon: Flame },
      { id: 'CHIPS', label: 'Fortune', shortLabel: 'Fortune', icon: Coins },
    ],
    []
  );

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      id="global-leaderboard-screen"
      className="fixed inset-0 z-[70] bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-hidden"
    >
      {/* NATIVE HEADER */}
      <NativeScreenHeader
        id="native-leaderboard-header"
        backLabel="Retour"
        onBack={handleBackClick}
        backTitle={selectedPlayer ? 'Retour au classement' : activeCategory !== 'WINS' ? 'Retour aux victoires' : 'Retour à l\'accueil'}
        title={
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400 fill-amber-400 shrink-0" />
            <span className="font-black text-white tracking-tight">Palmarès</span>
          </div>
        }
        subtitle="Classement et statistiques de la communauté de Njambo Kora"
        onHome={onClose}
        rightActions={
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleSharePalmares}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 transition cursor-pointer"
              title="Partager le classement"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => fetchLeaderboard(true)}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 transition cursor-pointer"
              title="Actualiser le classement"
            >
              <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            </button>
          </div>
        }
      />

      {/* NOTIFICATION BANNER */}
      {actionSuccessMessage && (
        <div className="px-4 py-2 bg-emerald-500/20 border-b border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center justify-between shrink-0">
          <span className="flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" />
            {actionSuccessMessage}
          </span>
          <button onClick={() => setActionSuccessMessage(null)} className="text-emerald-400 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* NATIVE SEGMENTED CATEGORY NAV */}
      <NativeSegmentedNav<LeaderboardCategory>
        tabs={categoryTabs}
        activeTab={activeCategory}
        onChange={(cat) => setActiveCategory(cat)}
        ariaLabel="Catégories du palmarès"
      />

      {/* MAIN CONTAINER */}
      <main className="flex-1 overflow-y-auto custom-dark-scrollbar max-w-2xl w-full mx-auto p-3 sm:p-5 space-y-4">
        {/* Search bar */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pseudo, titre, code NK, ou formules (ex: fortune > 100)..."
              className="w-full h-10 pl-10 pr-10 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/50 transition-colors shadow-inner"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 transition cursor-pointer"
                title="Effacer la recherche"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sub-filters for mode & temporal selection */}
          <div className="flex flex-wrap items-center justify-between gap-2 w-full">
            {/* Temporal Period Filter */}
            <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800 shrink-0">
              <button
                onClick={() => setSelectedTimeframe('ALL')}
                disabled={activeCategory === 'CHIPS'}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all duration-200 ${
                  selectedTimeframe === 'ALL'
                    ? 'bg-amber-500 text-slate-950 shadow-sm shadow-amber-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                } ${activeCategory === 'CHIPS' ? 'cursor-not-allowed' : 'cursor-pointer'}`}
              >
                Tout temps
              </button>
              <button
                onClick={() => setSelectedTimeframe('WEEK')}
                disabled={activeCategory === 'CHIPS'}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all duration-200 ${
                  activeCategory === 'CHIPS'
                    ? 'opacity-30 text-slate-500 cursor-not-allowed'
                    : selectedTimeframe === 'WEEK'
                      ? 'bg-amber-500 text-slate-950 shadow-sm shadow-amber-500/20 cursor-pointer'
                      : 'text-slate-400 hover:text-slate-200 cursor-pointer'
                }`}
              >
                Cette semaine
              </button>
              <button
                onClick={() => setSelectedTimeframe('MONTH')}
                disabled={activeCategory === 'CHIPS'}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all duration-200 ${
                  activeCategory === 'CHIPS'
                    ? 'opacity-30 text-slate-500 cursor-not-allowed'
                    : selectedTimeframe === 'MONTH'
                      ? 'bg-amber-500 text-slate-950 shadow-sm shadow-amber-500/20 cursor-pointer'
                      : 'text-slate-400 hover:text-slate-200 cursor-pointer'
                }`}
              >
                Ce mois
              </button>
            </div>

            {/* Mode selection (Tous / Multi / Solo) */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
              <button
                onClick={() => setSelectedModeFilter('ALL')}
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all duration-200 shrink-0 cursor-pointer ${
                  selectedModeFilter === 'ALL'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-500/5'
                    : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-300 hover:border-slate-700'
                }`}
              >
                Tous modes
              </button>
              <button
                onClick={() => setSelectedModeFilter('MULTIPLAYER')}
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all duration-200 shrink-0 flex items-center gap-1 cursor-pointer ${
                  selectedModeFilter === 'MULTIPLAYER'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-500/5'
                    : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-300 hover:border-slate-700'
                }`}
              >
                <span>🌐 Multi</span>
              </button>
              {activeCategory !== 'CHIPS' && (
                <button
                  onClick={() => setSelectedModeFilter('SOLO')}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all duration-200 shrink-0 flex items-center gap-1 cursor-pointer ${
                    selectedModeFilter === 'SOLO'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-500/5'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <span>👤 Solo</span>
                </button>
              )}

              {/* Reset button if any filter is active */}
              {(selectedModeFilter !== 'ALL' || selectedTimeframe !== 'ALL' || searchQuery.trim() !== '') && (
                <button
                  onClick={() => {
                    setSelectedModeFilter('ALL');
                    setSelectedTimeframe('ALL');
                    setSearchQuery('');
                  }}
                  className="px-2 py-1 rounded-full text-[10px] font-bold border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 transition-all duration-200 shrink-0 flex items-center gap-1 shadow-sm cursor-pointer ml-1"
                >
                  <X className="w-3 h-3" />
                  <span>Réinit</span>
                </button>
              )}
            </div>
          </div>

          {/* Short info note for Fortune (CHIPS category) */}
          {activeCategory === 'CHIPS' && (
            <div className="flex items-center gap-1.5 text-[10px] text-amber-400 bg-amber-500/5 px-2.5 py-1.5 rounded-lg border border-amber-500/10 mt-1 w-full">
              <Info className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>Fortune : cumul multijoueur depuis le début</span>
            </div>
          )}
        </div>

        {/* Info banner for Score de Maîtrise (Classement tab) - Ultra-compact & Collapsible */}
        {activeCategory === 'WINS' && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => setShowMasteryHelp((prev) => !prev)}
              className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left hover:bg-amber-500/5 transition cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="font-bold text-[11px] sm:text-xs text-amber-200 truncate">
                  Score de Maîtrise (barème 1 à 20 pts)
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] text-amber-400 font-bold bg-amber-500/15 px-2 py-0.5 rounded-full border border-amber-500/25">
                  {showMasteryHelp ? 'Masquer ▲' : 'Détails ▼'}
                </span>
              </div>
            </button>

            {/* Quick compact summary pills when not expanded */}
            {!showMasteryHelp && (
              <div className="px-3 pb-2 pt-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar text-[9px] font-mono text-slate-300">
                <span className="px-1.5 py-0.5 rounded bg-slate-900/90 border border-slate-800 shrink-0">
                  <strong className="text-amber-400">Manche 10</strong> / <strong className="text-amber-400">Donne 1</strong>
                </span>
                <span className="px-1.5 py-0.5 rounded bg-slate-900/90 border border-slate-800 shrink-0">
                  <strong className="text-amber-400">Kora 5</strong> / <strong className="text-cyan-400">Double 15</strong>
                </span>
                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 shrink-0">
                  Multi ×1 | Solo Exp/GM ×0,4 | Norm ×0,2 | Fac ×0,05
                </span>
              </div>
            )}

            {/* Full detailed breakdown when expanded */}
            {showMasteryHelp && (
              <div className="p-3 pt-0 border-t border-amber-500/15 space-y-2 text-[11px] text-slate-400">
                <p className="leading-relaxed text-slate-300 text-[11px]">
                  <strong>Barème officiel du Score de Maîtrise v2 :</strong> Points de base calculés pour chaque réalisation, puis ajustés par le coefficient du mode de jeu (plafond solo : 30 pts/jour).
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 font-mono text-[10px]">
                  <div className="p-1.5 rounded bg-slate-900/90 border border-slate-800 text-slate-300">
                    <span className="text-amber-400 font-bold">10 pts</span> Manche gagnée
                  </div>
                  <div className="p-1.5 rounded bg-slate-900/90 border border-slate-800 text-slate-300">
                    <span className="text-amber-400 font-bold">1 pt</span> Donne gagnée
                  </div>
                  <div className="p-1.5 rounded bg-slate-900/90 border border-slate-800 text-slate-300">
                    <span className="text-amber-400 font-bold">5 pts</span> Kora Simple
                  </div>
                  <div className="p-1.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
                    <span className="font-bold text-cyan-400">15 pts</span> Double Kora 💎
                  </div>
                </div>
                <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-300">
                  <strong>Coefficients de mode :</strong> Multijoueur ×1,0 | Solo Expert/Grand Maître ×0,4 | Solo Normal ×0,2 | Solo Facile ×0,05.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Info banner for threshold (Ratio tab) */}
        {activeCategory === 'WIN_RATE' && (
          <div className="p-3 sm:p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5 text-xs text-amber-300">
            <Info className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
            <div className="space-y-0.5">
              <span className="font-bold">Seuil d'éligibilité requis</span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Seuls les compétiteurs ayant disputé au moins <strong className="text-amber-400">10 parties</strong> figurent dans ce classement pour garantir des taux de réussite représentatifs.
              </p>
            </div>
          </div>
        )}

        {/* PODIUM (TOP 3) - Balanced, symmetric cards for same height & width */}
        {!searchQuery.trim() && selectedModeFilter === 'ALL' && entries.length >= 3 && top3.length >= 3 && (
          <div className="pt-2 pb-1">
            <div className="grid grid-cols-3 items-end gap-1.5 xs:gap-2 sm:gap-3 max-w-lg mx-auto">
              {/* 2nd Place (Silver) */}
              <div
                onClick={() => setSelectedPlayer(LeaderboardService.getPublicPlayerProfile(top3[1]))}
                className="flex flex-col items-center justify-between p-1.5 xs:p-2.5 sm:p-3 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 cursor-pointer transition hover:scale-102 h-56 relative shadow-lg"
              >
                <div className="flex flex-col items-center w-full min-w-0">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-slate-800 text-slate-300 text-[8px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow border border-slate-700 whitespace-nowrap">
                    🥈 #2 ARGENT
                  </div>
                  <div className="mt-2.5 shrink-0">
                    <PlayerAvatar avatarId={top3[1].avatarId} size="md" photoURL={top3[1].photoURL} />
                  </div>
                  <span className="text-[11px] font-bold text-white mt-2 truncate max-w-full text-center">
                    {top3[1].displayName}
                  </span>
                  <span className="text-[9px] text-slate-400 mt-0.5 truncate max-w-full text-center">
                    {top3[1].title.badge} {top3[1].title.title}
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1 w-full mt-auto">
                  {renderPodiumScore(top3[1])}
                </div>
              </div>

              {/* 1st Place (Gold) - Slightly Elevated but Balanced */}
              <div
                onClick={() => setSelectedPlayer(LeaderboardService.getPublicPlayerProfile(top3[0]))}
                className="flex flex-col items-center justify-between p-1.5 xs:p-2.5 sm:p-3 rounded-2xl bg-gradient-to-b from-amber-500/15 to-slate-900/95 border-2 border-amber-400 cursor-pointer transition hover:scale-105 h-56 relative shadow-xl shadow-amber-500/5 z-10"
              >
                <div className="flex flex-col items-center w-full min-w-0">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-400 text-slate-950 text-[8px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow whitespace-nowrap">
                    <Crown className="w-2.5 h-2.5 fill-slate-950" /> #1 MAÎTRE
                  </div>
                  <div className="mt-2.5 shrink-0">
                    <PlayerAvatar avatarId={top3[0].avatarId} size="lg" photoURL={top3[0].photoURL} />
                  </div>
                  <span className="text-xs sm:text-sm font-black text-amber-300 mt-2 truncate max-w-full text-center">
                    {top3[0].displayName}
                  </span>
                  <span className="text-[9px] font-bold text-amber-400/80 mt-0.5 truncate max-w-full text-center">
                    {top3[0].title.badge} {top3[0].title.title}
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1 w-full mt-auto">
                  {renderPodiumScore(top3[0])}
                </div>
              </div>

              {/* 3rd Place (Bronze) */}
              <div
                onClick={() => setSelectedPlayer(LeaderboardService.getPublicPlayerProfile(top3[2]))}
                className="flex flex-col items-center justify-between p-1.5 xs:p-2.5 sm:p-3 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 cursor-pointer transition hover:scale-102 h-56 relative shadow-lg"
              >
                <div className="flex flex-col items-center w-full min-w-0">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-800 text-slate-300 text-[8px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow border border-slate-700/80 whitespace-nowrap">
                    🥉 #3 BRONZE
                  </div>
                  <div className="mt-2.5 shrink-0">
                    <PlayerAvatar avatarId={top3[2].avatarId} size="md" photoURL={top3[2].photoURL} />
                  </div>
                  <span className="text-[11px] font-bold text-white mt-2 truncate max-w-full text-center">
                    {top3[2].displayName}
                  </span>
                  <span className="text-[9px] text-slate-400 mt-0.5 truncate max-w-full text-center">
                    {top3[2].title.badge} {top3[2].title.title}
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1 w-full mt-auto">
                  {renderPodiumScore(top3[2])}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* LIST OF RANKED PLAYERS */}
        <div className="space-y-2 pb-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
            {searchQuery.trim() || selectedModeFilter !== 'ALL'
              ? `Résultats (${filteredEntries.length})`
              : entries.length >= 3
              ? 'Poursuivants & Compétiteurs'
              : 'Classement des joueurs'}
          </h3>

          {(entries.length >= 3 && !searchQuery.trim() && selectedModeFilter === 'ALL' ? restEntries : filteredEntries).length === 0 ? (
            <div className="p-8 rounded-2xl bg-slate-900/40 border border-slate-800 text-center text-xs text-slate-400 space-y-2">
              <p>
                {searchQuery.trim()
                  ? 'Aucun joueur trouvé pour cette recherche.'
                  : 'Aucun joueur qualifié pour le moment.'}
              </p>
              <p className="text-[11px] text-slate-500">
                Connectez-vous avec Google et jouez des parties pour figurer au Palmarès !
              </p>
            </div>
          ) : (
            (entries.length >= 3 && !searchQuery.trim() && selectedModeFilter === 'ALL' ? restEntries : filteredEntries).map((player) => {
              return (
                <div
                  key={player.uid}
                  onClick={() => setSelectedPlayer(LeaderboardService.getPublicPlayerProfile(player))}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition cursor-pointer hover:border-slate-600 ${
                    player.isCurrentUser
                      ? 'bg-amber-500/10 border-amber-500/50 shadow-md shadow-amber-500/5'
                      : 'bg-slate-900/70 border-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Rank badge */}
                    <span
                      className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono font-black text-xs shrink-0 ${
                        player.rank <= 3
                          ? 'bg-amber-500 text-slate-950'
                          : player.rank <= 10
                          ? 'bg-slate-800 text-amber-400 border border-slate-700'
                          : 'bg-slate-950 text-slate-400 border border-slate-900'
                      }`}
                    >
                      #{player.rank}
                    </span>

                    {/* Avatar */}
                    <PlayerAvatar
                      avatarId={player.avatarId}
                      photoURL={player.photoURL}
                      size="sm"
                      className="w-9 h-9 shrink-0"
                    />

                    {/* Name & Title */}
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`text-xs sm:text-sm font-bold truncate ${
                            player.isCurrentUser ? 'text-amber-300' : 'text-white'
                          }`}
                        >
                          {player.displayName}
                        </span>
                        {player.isCurrentUser && (
                          <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-amber-500 text-slate-950">
                            Vous
                          </span>
                        )}
                        <span className="text-[10px] text-slate-500 font-mono">
                          {player.friendCode}
                        </span>
                      </div>
                      <span className={`text-[10px] font-medium ${player.title.colorClass}`}>
                        {player.title.badge} {player.title.title}
                      </span>
                    </div>
                  </div>

                  {/* Score value / Fortune */}
                  {renderPursuerScore(player)}
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* STICKY BOTTOM BAR: Either Official Rank for logged in users OR Certification Callout for guests */}
      {(!isLoggedIn || profile?.isGuest) ? (
        <footer className="p-3 sm:p-4 border-t border-amber-500/30 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 backdrop-blur-md shrink-0 z-20 shadow-2xl">
          <div className="max-w-2xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 w-full sm:w-auto min-w-0">
              {/* Badge Invité / Non Classé */}
              <div className="w-11 h-11 rounded-xl bg-slate-800 border border-amber-500/40 text-amber-400 font-bold text-xs flex flex-col items-center justify-center shrink-0 shadow">
                <ShieldAlert className="w-5 h-5 text-amber-400" />
                <span className="text-[8px] font-black uppercase tracking-wider">Invité</span>
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-black text-white">Classement Officiel Mondial</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Comptes certifiés Google
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
                  Vous jouez en invité avec <strong className="text-amber-400 font-mono font-black">{profile?.stats?.masteryScore || 0} pts</strong>. Certifiez votre compte avec Google pour inscrire officiellement votre score au Palmarès mondial !
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
              <button
                type="button"
                onClick={loginWithGoogle}
                className="w-full sm:w-auto h-10 px-4 rounded-xl bg-gradient-to-r from-white via-slate-100 to-amber-100 hover:from-slate-100 hover:to-white text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg hover:shadow-xl transition-all shrink-0 border border-white/80 active:scale-95"
              >
                <GoogleIcon className="w-4 h-4 shrink-0" />
                <span>Se certifier avec Google</span>
              </button>
            </div>
          </div>
        </footer>
      ) : userRank ? (
        <footer className="p-3 sm:p-4 border-t border-slate-800 bg-slate-900/95 backdrop-blur-md shrink-0 z-20 shadow-xl">
          <div className="max-w-2xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 w-full sm:w-auto min-w-0">
              {/* Grand Rank Visual */}
              <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black text-lg flex items-center justify-center shadow-lg border border-amber-400 shrink-0">
                #{userRank.rank}
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black text-white">Votre Position au Palmarès</span>
                  <span className="text-[10px] font-mono text-amber-400">
                    (Rang #{userRank.rank}/{userRank.totalRankedPlayers})
                  </span>
                </div>
                
                {/* Dynamically Computed Points Gap to Next Player */}
                <div className="text-[11px] text-slate-400 truncate flex items-center gap-1 flex-wrap mt-0.5">
                  {userRank.nextPlayerName ? (
                    <>
                      <span>Écart :</span>
                      <span className="text-amber-400 font-bold font-mono">
                        +{userRank.pointsToNextRank.toLocaleString('fr-FR')}
                        {activeCategory === 'CHIPS' ? ' 🪙' : activeCategory === 'WINS' ? ' pts' : activeCategory === 'KORAS' ? ' Koras' : '%'}
                      </span>
                      <span className="text-slate-500">pour dépasser</span>
                      <span className="text-slate-200 font-bold truncate max-w-[90px]" title={userRank.nextPlayerName}>
                        {userRank.nextPlayerName}
                      </span>
                      <span className="text-slate-500 font-mono text-[9px] bg-slate-950 px-1 py-0.2 rounded border border-slate-800 shrink-0">
                        #{userRank.rank - 1}
                      </span>
                    </>
                  ) : (
                    <span className="text-emerald-400 font-black tracking-wide flex items-center gap-1">
                      👑 Vous êtes au sommet du Palmarès !
                    </span>
                  )}
                </div>

                {/* Honorific Title progress bar (Highly Visible) */}
                <div className="flex items-center gap-2 mt-1.5 w-full sm:w-64">
                  <div className="flex-1 h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-300 rounded-full transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-amber-400 font-bold font-mono shrink-0">
                    {progressPercent}%
                  </span>
                  <span className="text-[9px] text-slate-400 truncate max-w-[100px]" title={nextTitle ? `Prochain titre : ${nextTitle.title}` : 'Max'}>
                    vers {nextTitle ? nextTitle.title : 'MAX'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end shrink-0">
              {/* Highlight own stats */}
              <div className="px-3 py-1 bg-slate-950 rounded-lg border border-slate-800 text-center sm:text-right min-w-[80px]">
                <div className="text-[8px] text-slate-500 uppercase font-black">Votre {activeCategory === 'CHIPS' ? 'Fortune' : activeCategory === 'WINS' ? 'Score' : activeCategory === 'KORAS' ? 'Koras' : 'Ratio'}</div>
                <div className={`text-xs font-black font-mono ${
                  activeCategory === 'CHIPS'
                    ? ((profile?.stats?.fortune || 0) > 0 ? 'text-emerald-400' : (profile?.stats?.fortune || 0) < 0 ? 'text-rose-400' : 'text-slate-400')
                    : 'text-amber-400'
                }`}>
                  {activeCategory === 'CHIPS'
                    ? `${(profile?.stats?.fortune || 0) > 0 ? '+' : ''}${(profile?.stats?.fortune || 0).toLocaleString('fr-FR')} 🪙`
                    : activeCategory === 'WINS'
                    ? `${profile?.stats?.masteryScore || 0} pts`
                    : activeCategory === 'KORAS'
                    ? `${(profile?.stats?.koraCount || 0) + (profile?.stats?.doubleKoraCount || 0) * 2} pts`
                    : `${profile?.stats?.winRate || 0}%`
                  }
                </div>
              </div>

              {onOpenProfile && (
                <button
                  type="button"
                  onClick={onOpenProfile}
                  className="h-9 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-[11px] flex items-center gap-1 cursor-pointer transition shrink-0"
                >
                  <span>Profil</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </footer>
      ) : null}

      {/* PUBLIC PLAYER PROFILE MODAL (INSPECT OVERLAY) */}
      <AnimatePresence>
        {selectedPlayer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-60 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4 text-slate-100 relative"
            >
              <button
                type="button"
                onClick={() => setSelectedPlayer(null)}
                className="absolute top-3.5 right-3.5 p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Player Header */}
              <div className="flex items-center gap-3.5 pt-1">
                <PlayerAvatar
                  avatarId={selectedPlayer.avatarId}
                  photoURL={selectedPlayer.photoURL}
                  size="lg"
                />
                <div>
                  <h4 className="text-base font-black text-white">{selectedPlayer.displayName}</h4>
                  <span className={`text-xs font-bold ${selectedPlayer.title.colorClass}`}>
                    {selectedPlayer.title.badge} {selectedPlayer.title.title}
                  </span>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                    Code Ami : {selectedPlayer.friendCode}
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800 text-center">
                <div>
                  <div className="text-xs font-bold text-slate-400">Score Maîtrise</div>
                  <div className="text-sm font-black text-amber-400 font-mono">
                    {selectedPlayer.masteryScore ?? 0} pts
                  </div>
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-400">Manches / Donnes</div>
                  <div className="text-sm font-black text-slate-200 font-mono">
                    {selectedPlayer.manchesWon ?? 0}m · {selectedPlayer.partiesWon || selectedPlayer.gamesWon}d
                  </div>
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-400">Fortune</div>
                  <div className={`text-sm font-black font-mono ${
                    (selectedPlayer.fortune || 0) > 0 ? 'text-emerald-400' : (selectedPlayer.fortune || 0) < 0 ? 'text-rose-400' : 'text-slate-400'
                  }`}>
                    {(selectedPlayer.fortune || 0) > 0 ? '+' : ''}{(selectedPlayer.fortune || 0).toLocaleString('fr-FR')} 🪙
                  </div>
                </div>
              </div>

              {/* Details for Fortune in Inspect modal */}
              {selectedPlayer.fortune !== undefined && (
                <div className="text-[10px] text-slate-500 text-center -mt-2">
                  Bénéfice net Multijoueur • Gains: {selectedPlayer.multiplayerGains || 0} 🪙 · Pertes: {selectedPlayer.multiplayerPertes || 0} 🪙
                </div>
              )}

              {/* Fair-Play Badge */}
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Réputation Fair-Play
                </span>
                <span className="font-bold text-emerald-400">
                  {selectedPlayer.fairPlayStatus === 'IMPECCABLE' ? 'Impeccable ✓' : 'Avertissement'}
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedH2HOpponent({
                      id: selectedPlayer.uid,
                      name: selectedPlayer.displayName,
                      avatarId: selectedPlayer.avatarId,
                      friendCode: selectedPlayer.friendCode,
                    });
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer shadow transition"
                >
                  <Swords className="w-3.5 h-3.5 text-amber-400" />
                  <span>⚔️ Face-à-Face & Rivalité</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      handleAddFriend(selectedPlayer);
                      setSelectedPlayer(null);
                    }}
                    className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-amber-400" />
                    <span>Ajouter en ami</span>
                  </button>

                  {onChallengePlayer ? (
                    <button
                      type="button"
                      onClick={() => {
                        onChallengePlayer({
                          id: selectedPlayer.uid,
                          name: selectedPlayer.displayName,
                          avatarId: selectedPlayer.avatarId,
                        });
                        setSelectedPlayer(null);
                        onClose();
                      }}
                      className="py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer shadow transition"
                    >
                      <Swords className="w-3.5 h-3.5" />
                      <span>Défier en direct</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSelectedPlayer(null)}
                      className="py-2 px-3 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
                    >
                      Fermer
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FACE-À-FACE MODAL */}
      <HeadToHeadModal
        isOpen={Boolean(selectedH2HOpponent)}
        onClose={() => setSelectedH2HOpponent(null)}
        opponent={selectedH2HOpponent}
        onChallenge={(opp) => {
          if (onChallengePlayer) {
            onChallengePlayer({
              id: opp.id,
              name: opp.name,
              avatarId: opp.avatarSeed,
            });
            setSelectedH2HOpponent(null);
            setSelectedPlayer(null);
            onClose();
          }
        }}
      />
    </motion.div>
  );
};
