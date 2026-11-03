import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Trophy,
  Flame,
  Coins,
  Percent,
  Search,
  RotateCw,
  X,
  ShieldCheck,
  UserPlus,
  Swords,
  Share2,
  Info,
  Check,
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
import { LeaderboardCard, LeaderboardPodium } from './LeaderboardCards';
import { MyPositionBar, MyPositionPanel } from './MyPositionPanel';
import { HeadToHeadModal } from '../rivalry/HeadToHeadModal';
import { usePlayerProfile } from '../../context/PlayerProfileContext';
import { GoogleIcon } from '../common/GoogleIcon';
import { NativeScreenHeader } from '../common/NativeScreenHeader';
import { NativeSegmentedNav, SegmentTab } from '../common/NativeSegmentedNav';
import { ROUTE_PATHS } from '../../utils/appRoutes';
import { useBackLayer } from '../../hooks/useBackLayer';

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
  const { isLoggedIn, loginWithGoogle, profile, rankProgress, nextTitle } = usePlayerProfile();
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
  const [isPositionOpen, setIsPositionOpen] = useState<boolean>(false);
  const [highlightedUid, setHighlightedUid] = useState<string | null>(null);

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

  useBackLayer(isOpen && Boolean(selectedPlayer), () => setSelectedPlayer(null));
  useBackLayer(isOpen && isPositionOpen, () => setIsPositionOpen(false));

  // Montre la carte du joueur : les filtres sont retirés, car ils peuvent la masquer.
  const handleLocateMe = () => {
    setIsPositionOpen(false);
    setSearchQuery('');
    setSelectedModeFilter('ALL');
    const me = entries.find((e) => e.isCurrentUser);
    if (!me || !baseEligibleEntries.some((e) => e.uid === me.uid)) {
      setActionSuccessMessage("Tu n'apparais pas encore dans cette liste.");
      setTimeout(() => setActionSuccessMessage(null), 3000);
      return;
    }
    setHighlightedUid(me.uid);
    // Attend le rendu sans filtres pour trouver la carte.
    setTimeout(() => document.getElementById(`leaderboard-player-${me.uid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    setTimeout(() => setHighlightedUid(null), 2500);
  };

  const handleBackClick = () => {
    if (isPositionOpen) {
      setIsPositionOpen(false);
      return;
    }
    if (selectedPlayer) {
      setSelectedPlayer(null);
      return;
    }
    onClose();
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
          setActionSuccessMessage('Tu ne peux pas t\'ajouter toi-même !');
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
        setActionSuccessMessage(`${player.displayName} a été ajouté à tes contacts !`);
      }
    } catch (e: any) {
      setActionSuccessMessage(e?.message || 'La demande n\'a pas pu être envoyée. Réessaie.');
    }
    setTimeout(() => setActionSuccessMessage(null), 3000);
  };

  const handleSharePalmares = () => {
    const text = `🏆 Consulte le Palmarès de Njambo Kora ! Défie les meilleurs joueurs de cartes : ${window.location.origin}${ROUTE_PATHS.leaderboard}`;
    if (navigator.share) {
      navigator.share({ title: 'Palmarès Njambo Kora', text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text);
      setActionSuccessMessage('Lien du Palmarès copié.');
      setTimeout(() => setActionSuccessMessage(null), 3000);
    }
  };

  const handleSelectEntry = (player: LeaderboardEntry) => setSelectedPlayer(LeaderboardService.getPublicPlayerProfile(player));

  const categoryTabs: SegmentTab<LeaderboardCategory>[] = useMemo(
    () => [
      { id: 'WINS', label: 'Classement', shortLabel: 'Score', icon: Trophy },
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
      className="fixed inset-x-0 top-0 bottom-[var(--app-bottom-nav,0px)] z-[70] bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-hidden comfort-ui"
    >
      {/* NATIVE HEADER */}
      <NativeScreenHeader
        id="native-leaderboard-header"
        backLabel="Retour"
        onBack={handleBackClick}
        backTitle={selectedPlayer ? 'Retour au classement' : 'Retour'}
        title={
          <div className="flex items-center gap-2">
            <Trophy className="hidden sm:block w-5 h-5 text-amber-400 fill-amber-400 shrink-0" />
            <span className="text-sm sm:text-base font-black text-white tracking-tight">Palmarès</span>
          </div>
        }
        subtitle="Classement et statistiques de la communauté de Njambo Kora"
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

      {/* Ta place, sur une seule ligne : le classement garde tout l'écran */}
      {!isLoggedIn || profile?.isGuest ? (
        <div className="shrink-0 px-3 sm:px-6 py-1.5 bg-slate-900/90 border-b border-slate-800/80">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-2">
            <span className="text-xs text-slate-300 min-w-0">Invité : ton score n'est pas classé.</span>
            <button
              type="button"
              onClick={loginWithGoogle}
              className="min-h-11 px-3 rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer shrink-0 active:scale-95"
            >
              <GoogleIcon className="w-4 h-4 shrink-0" />
              <span>Sauvegarder avec Google</span>
            </button>
          </div>
        </div>
      ) : userRank ? (
        <MyPositionBar rank={userRank} onOpen={() => setIsPositionOpen(true)} />
      ) : null}

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
              placeholder="Pseudo, titre, code ami ou formule (ex. : fortune > 100)"
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
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all duration-200 ${
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
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all duration-200 ${
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
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all duration-200 ${
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
                className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-all duration-200 shrink-0 cursor-pointer ${
                  selectedModeFilter === 'ALL'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-500/5'
                    : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-300 hover:border-slate-700'
                }`}
              >
                Tous modes
              </button>
              <button
                onClick={() => setSelectedModeFilter('MULTIPLAYER')}
                className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-all duration-200 shrink-0 flex items-center gap-1 cursor-pointer ${
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
                  className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-all duration-200 shrink-0 flex items-center gap-1 cursor-pointer ${
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
                  className="px-2 py-1 rounded-full text-xs font-bold border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 transition-all duration-200 shrink-0 flex items-center gap-1 shadow-sm cursor-pointer ml-1"
                >
                  <X className="w-3 h-3" />
                  <span>Réinitialiser</span>
                </button>
              )}
            </div>
          </div>

          {/* Short info note for Fortune (CHIPS category) */}
          {activeCategory === 'CHIPS' && (
            <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/5 px-2.5 py-1.5 rounded-lg border border-amber-500/10 mt-1 w-full">
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
                <span className="font-bold text-xs text-amber-200 truncate">
                  Score de Maîtrise
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-amber-400 font-bold bg-amber-500/15 px-2 py-0.5 rounded-full border border-amber-500/25">
                  {showMasteryHelp ? 'Masquer ▲' : 'Détails ▼'}
                </span>
              </div>
            </button>

            {/* Full detailed breakdown when expanded */}
            {showMasteryHelp && (
              <div className="p-3 pt-0 border-t border-amber-500/15 space-y-2 text-xs text-slate-400">
                <p className="leading-relaxed text-slate-300 text-xs">
                  <strong>Barème du score de Maîtrise :</strong> Points de base calculés pour chaque réalisation, puis ajustés par le coefficient du mode de jeu (plafond solo : 30 points/jour).
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 font-mono text-xs">
                  <div className="p-1.5 rounded bg-slate-900/90 border border-slate-800 text-slate-300">
                    <span className="text-amber-400 font-bold">10 points</span> Manche gagnée
                  </div>
                  <div className="p-1.5 rounded bg-slate-900/90 border border-slate-800 text-slate-300">
                    <span className="text-amber-400 font-bold">1 point</span> Partie gagnée
                  </div>
                  <div className="p-1.5 rounded bg-slate-900/90 border border-slate-800 text-slate-300">
                    <span className="text-amber-400 font-bold">5 points</span> Kora simple
                  </div>
                  <div className="p-1.5 rounded bg-slate-500/15 border border-slate-500/30 text-slate-300">
                    <span className="font-bold text-slate-400">15 points</span> Double Kora 💎
                  </div>
                </div>
                <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                  <strong>Coefficients de mode :</strong> Multijoueur ×1,0 | Solo Expert et Grand Katika ×0,4 | Solo Normal ×0,2 | Solo Facile ×0,05.
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
              <span className="font-bold">Parties minimum requises</span>
              <p className="text-xs text-slate-400 leading-relaxed">
                Seuls les compétiteurs ayant disputé au moins <strong className="text-amber-400">10 parties</strong> figurent dans ce classement pour garantir des taux de réussite représentatifs.
              </p>
            </div>
          </div>
        )}

        {/* Podium : les trois premiers */}
        {!searchQuery.trim() && selectedModeFilter === 'ALL' && entries.length >= 3 && top3.length >= 3 && (
          <LeaderboardPodium players={top3} category={activeCategory} highlightedUid={highlightedUid} onSelect={handleSelectEntry} />
        )}

        {/* LIST OF RANKED PLAYERS */}
        <div className="space-y-2 pb-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
            {searchQuery.trim() || selectedModeFilter !== 'ALL'
              ? `Résultats (${filteredEntries.length})`
              : entries.length >= 3
              ? 'Poursuivants et compétiteurs'
              : 'Classement des joueurs'}
          </h3>

          {(entries.length >= 3 && !searchQuery.trim() && selectedModeFilter === 'ALL' ? restEntries : filteredEntries).length === 0 ? (
            <div className="p-8 rounded-2xl bg-slate-900/40 border border-slate-800 text-center text-xs text-slate-400 space-y-2">
              <p>
                {searchQuery.trim()
                  ? 'Aucun joueur trouvé pour cette recherche.'
                  : 'Aucun joueur qualifié pour le moment.'}
              </p>
              <p className="text-xs text-slate-500">
                Connecte-toi avec Google et joue des parties pour figurer au Palmarès !
              </p>
            </div>
          ) : (
            (entries.length >= 3 && !searchQuery.trim() && selectedModeFilter === 'ALL' ? restEntries : filteredEntries).map((player) => (
              <LeaderboardCard key={player.uid} player={player} category={activeCategory} isHighlighted={highlightedUid === player.uid} onSelect={handleSelectEntry} />
            ))
          )}
        </div>
      </main>

      {/* Panneau « Ma position » */}
      <AnimatePresence>
        {isPositionOpen && userRank && (
          <MyPositionPanel
            rank={userRank}
            category={activeCategory}
            entry={entries.find((e) => e.isCurrentUser) ?? null}
            nextTitle={nextTitle}
            progress={rankProgress}
            onClose={() => setIsPositionOpen(false)}
            onLocate={handleLocateMe}
            onOpenProfile={onOpenProfile}
          />
        )}
      </AnimatePresence>

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
                  <div className="text-xs text-slate-400 font-mono mt-0.5">
                    Code ami : {selectedPlayer.friendCode}
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800 text-center">
                <div>
                  <div className="text-xs font-bold text-slate-400">Score de Maîtrise</div>
                  <div className="text-sm font-black text-amber-400 font-mono">
                    {(selectedPlayer.masteryScore ?? 0).toLocaleString('fr-FR')} points
                  </div>
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-400">Manches / Parties</div>
                  <div className="text-sm font-black text-slate-200 font-mono">
                    {selectedPlayer.manchesWon ?? 0} manches · {selectedPlayer.partiesWon || selectedPlayer.gamesWon} parties
                  </div>
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-400">Fortune</div>
                  <div className={`text-sm font-black font-mono ${
                    (selectedPlayer.fortune || 0) > 0 ? 'text-emerald-400' : (selectedPlayer.fortune || 0) < 0 ? 'text-rose-400' : 'text-slate-400'
                  }`}>
                    {(selectedPlayer.fortune || 0) > 0 ? '+' : ''}{(selectedPlayer.fortune || 0).toLocaleString('fr-FR')} jetons
                  </div>
                </div>
              </div>

              {/* Details for Fortune in Inspect modal */}
              {selectedPlayer.fortune !== undefined && (
                <div className="text-xs text-slate-500 text-center -mt-2">
                  Bénéfice net Multijoueur • Gains : {selectedPlayer.multiplayerGains || 0} jetons · Pertes : {selectedPlayer.multiplayerPertes || 0} jetons
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
                  <span>Face-à-face et rivalité</span>
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
                      className="py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-500 text-slate-950 text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer shadow transition"
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
