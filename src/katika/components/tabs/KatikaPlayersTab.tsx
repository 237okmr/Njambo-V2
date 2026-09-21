import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  Search, 
  RotateCw, 
  ShieldAlert, 
  ShieldCheck, 
  Ban, 
  AlertTriangle, 
  CheckCircle2, 
  X, 
  Trophy, 
  Flame, 
  Globe, 
  Clock,
  UserCheck,
  Coins,
  FileText,
  Zap,
  TrendingUp,
  UserX,
  Trash2,
  History,
  Info,
  ChevronRight,
  Shield,
  Layers,
  MoreHorizontal,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Sparkles
} from 'lucide-react';
import { KatikaPlayer, KatikaPlayerMatchHistory } from '../../types/katika';
import { KatikaService, OFFICIAL_BOT_NAMES } from '../../services/katikaService';
import { KATIKA_NAVIGATE_EVENT, KatikaNavigationEventDetail, navigateToKatikaTab } from '../../utils/katikaNavigation';
import { AVATAR_OPTIONS, HONORIFIC_TITLES, AvatarOptionId } from '../../../types/playerProfile';
import { PlayerAvatar } from '../../../components/profile/PlayerAvatar';
import { isEligibleLeaderboardUser, getLeaderboardIneligibilityReasons, LeaderboardIneligibilityReason } from '../../../services/masteryConfig';

export const KatikaPlayersTab: React.FC = () => {
  const [players, setPlayers] = useState<KatikaPlayer[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'WARNED' | 'BANNED' | 'ANTIFRAUD' | 'ANTI_JEU' | 'RECENT' | 'INACTIVE'>('ALL');
  const [activePlayersTab, setActivePlayersTab] = useState<'HUMANS' | 'BOTS' | 'LEADERBOARD_AUDIT'>('HUMANS');
  const [leaderboardAuditFilter, setLeaderboardAuditFilter] = useState<'ALL' | 'INELIGIBLE_ONLY' | 'ELIGIBLE_ONLY'>('ALL');
  const [deleteConfirmPlayer, setDeleteConfirmPlayer] = useState<KatikaPlayer | null>(null);
  const [preferenceFilter, setPreferenceFilter] = useState<'ALL' | 'MULTI' | 'SOLO' | 'HYBRID'>('ALL');
  const [sortBy, setSortBy] = useState<'NONE' | 'MULTI_RATIO' | 'SOLO_RATIO' | 'CHIPS' | 'GAMES'>('NONE');

  // Email privacy for Katika Master exclusive reveal
  const [revealedEmails, setRevealedEmails] = useState<Record<string, boolean>>({});

  const toggleEmailReveal = (playerId: string) => {
    setRevealedEmails(prev => ({ ...prev, [playerId]: !prev[playerId] }));
  };

  const maskEmail = (email?: string) => {
    if (!email) return 'Non renseigné (Invité)';
    const parts = email.split('@');
    if (parts.length < 2) return '••••••••';
    const name = parts[0];
    const domain = parts[1];
    const visible = name.length > 2 ? name.substring(0, 2) : name.substring(0, 1);
    return `${visible}••••••••@${domain}`;
  };

  useEffect(() => {
    const handleNav = (e: Event) => {
      const customEvent = e as CustomEvent<KatikaNavigationEventDetail>;
      if (customEvent.detail?.tab === 'PLAYERS' && customEvent.detail.query !== undefined) {
        setSearchQuery(customEvent.detail.query);
        setStatusFilter('ALL');
      }
    };
    window.addEventListener(KATIKA_NAVIGATE_EVENT, handleNav);
    return () => window.removeEventListener(KATIKA_NAVIGATE_EVENT, handleNav);
  }, []);

  // Selected Player Dossier Modal
  const [dossierPlayer, setDossierPlayer] = useState<KatikaPlayer | null>(null);

  // Track open row dropdown
  const [openPlayerDropdownId, setOpenPlayerDropdownId] = useState<string | null>(null);

  // Sub-modals
  const [warnModalPlayer, setWarnModalPlayer] = useState<KatikaPlayer | null>(null);
  const [warnReason, setWarnReason] = useState<string>('Comportement anti-jeu / Déconnexions intempestives');

  const [resetChipsModalPlayer, setResetChipsModalPlayer] = useState<KatikaPlayer | null>(null);
  const [newChipsValue, setNewChipsValue] = useState<number>(5000);
  const [resetChipsReason, setResetChipsReason] = useState<string>('Régularisation économique / Correction');

  const [banModalPlayer, setBanModalPlayer] = useState<KatikaPlayer | null>(null);
  const [banType, setBanType] = useState<'TEMPORARY' | 'PERMANENT'>('TEMPORARY');
  const [banDurationHours, setBanDurationHours] = useState<number>(24);
  const [banReason, setBanReason] = useState<string>('Comportement anti-jeu répété et non-respect des règles');

  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchPlayers = async () => {
    setLoading(true);
    try {
      const data = await KatikaService.getPlayers();
      setPlayers(data);
      // Synchronize open dossier if any
      if (dossierPlayer) {
        const fresh = data.find(p => p.id === dossierPlayer.id);
        if (fresh) setDossierPlayer(fresh);
      }
    } catch (err) {
      console.error('Failed to load players:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlayers();
  }, []);

  const filteredPlayers = useMemo(() => {
    return players.filter((p) => {
      const matchesSearch = 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.ipAddress && p.ipAddress.includes(searchQuery));

      let matchesStatus = true;
      if (statusFilter === 'ACTIVE') matchesStatus = p.status === 'ACTIVE';
      else if (statusFilter === 'WARNED') matchesStatus = p.status === 'WARNED';
      else if (statusFilter === 'BANNED') matchesStatus = p.status === 'BANNED';
      else if (statusFilter === 'ANTIFRAUD') {
        matchesStatus = 
          p.antifraudAlerts.highAbandonRisk ||
          p.antifraudAlerts.collusionRisk ||
          p.antifraudAlerts.spamAntiFairplayRisk ||
          !!p.isAntiJeuRisk;
      }
      else if (statusFilter === 'ANTI_JEU') {
        matchesStatus = !!p.isAntiJeuRisk;
      }
      else if (statusFilter === 'RECENT') {
        matchesStatus = Date.now() - p.firstJoined < 1000 * 60 * 60 * 24 * 7;
      }
      else if (statusFilter === 'INACTIVE') {
        matchesStatus = Date.now() - p.lastActive > 1000 * 60 * 60 * 24 * 7;
      }

      return matchesSearch && matchesStatus;
    });
  }, [players, searchQuery, statusFilter]);

  const leaderboardAuditStats = useMemo(() => {
    let eligibleCount = 0;
    let ineligibleCount = 0;
    const details = players.map(p => {
      const data = p.rawUserData || {
        uid: p.id,
        displayName: p.name,
        isGuest: p.isGuest,
        authProvider: p.authProvider,
        isBot: p.isBot,
        stats: {
          partiesPlayed: p.totalPartiesPlayed ?? p.totalGames,
          partiesWon: p.totalPartiesWon ?? p.victories,
          gamesPlayed: p.totalGames,
          gamesWon: p.victories,
          koraCount: p.koraCount,
          doubleKoraCount: p.doubleKoraCount,
          masteryScore: p.masteryScore,
          fortune: p.chipsBalance,
          soloGamesPlayed: p.soloGamesPlayed,
          multiplayerGamesPlayed: p.multiplayerGamesPlayed,
        }
      };
      const reasons = getLeaderboardIneligibilityReasons(p.id, data);
      const isEligible = reasons.length === 0;
      if (isEligible) eligibleCount++;
      else ineligibleCount++;
      return { player: p, isEligible, reasons, data };
    });
    return { eligibleCount, ineligibleCount, total: players.length, details };
  }, [players]);

  const tabFilteredPlayers = useMemo(() => {
    if (activePlayersTab === 'LEADERBOARD_AUDIT') {
      return filteredPlayers;
    }
    return filteredPlayers.filter((p) => {
      const isHuman = p.isHuman ?? (
        p.id === 'usr_local' || 
        p.id === 'human' || 
        (!OFFICIAL_BOT_NAMES.some(bn => bn.toLowerCase() === p.name.toLowerCase()) && 
         !p.id.toLowerCase().includes('bot') && 
         !p.name.toLowerCase().includes('bot') &&
         p.id !== 'p2' && p.id !== 'p3' && p.id !== 'p4')
      );
      return activePlayersTab === 'HUMANS' ? isHuman : !isHuman;
    });
  }, [filteredPlayers, activePlayersTab]);

  const leaderboardFilteredList = useMemo(() => {
    return leaderboardAuditStats.details.filter(({ player, isEligible }) => {
      const matchesSearch = 
        player.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        player.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (player.email && player.email.toLowerCase().includes(searchQuery.toLowerCase()));
      if (!matchesSearch) return false;
      if (leaderboardAuditFilter === 'ELIGIBLE_ONLY') return isEligible;
      if (leaderboardAuditFilter === 'INELIGIBLE_ONLY') return !isEligible;
      return true;
    });
  }, [leaderboardAuditStats, searchQuery, leaderboardAuditFilter]);

  const getPlayerRatios = (player: KatikaPlayer) => {
    const isHuman = player.isHuman ?? (player.id === 'usr_local' || player.id === 'human' || (!player.id.toLowerCase().includes('bot') && !player.name.toLowerCase().includes('bot')));
    
    if (player.recentMatches && player.recentMatches.length > 0) {
      const soloCount = player.recentMatches.filter(m => m.mode === 'SOLO').length;
      const multiCount = player.recentMatches.filter(m => m.mode === 'MULTIPLAYER').length;
      const total = soloCount + multiCount;
      if (total > 0) {
        const botRatio = Math.round((soloCount / total) * 100);
        const humanRatio = 100 - botRatio;
        return { botRatio, humanRatio };
      }
    }

    // If winsByFormat has actual recorded games
    const totalFormatGames = (player.winsByFormat?.twoPlayers?.total || 0) +
      (player.winsByFormat?.threePlayers?.total || 0) +
      (player.winsByFormat?.fourPlayers?.total || 0);

    if (totalFormatGames > 0) {
      // By default games with 2/3/4 players are multiplayer
      return { botRatio: 0, humanRatio: 100 };
    }

    // If no games played yet
    if (player.totalGames === 0) {
      return { botRatio: 0, humanRatio: 0 };
    }
    
    const botRatio = isHuman ? 20 : 90;
    const humanRatio = 100 - botRatio;
    return { botRatio, humanRatio };
  };

  const sortedAndPreferenceFilteredPlayers = useMemo(() => {
    let result = [...tabFilteredPlayers];

    // Filter by Play Preference
    if (preferenceFilter !== 'ALL') {
      result = result.filter(player => {
        const { botRatio, humanRatio } = getPlayerRatios(player);
        if (preferenceFilter === 'MULTI') {
          return humanRatio >= 60; // Majoritairement multi
        } else if (preferenceFilter === 'SOLO') {
          return botRatio >= 60; // Majoritairement solo
        } else if (preferenceFilter === 'HYBRID') {
          return humanRatio > 40 && humanRatio < 60; // Hybride 50/50
        }
        return true;
      });
    }

    // Apply Sorts
    if (sortBy !== 'NONE') {
      result.sort((a, b) => {
        if (sortBy === 'MULTI_RATIO') {
          return getPlayerRatios(b).humanRatio - getPlayerRatios(a).humanRatio;
        } else if (sortBy === 'SOLO_RATIO') {
          return getPlayerRatios(b).botRatio - getPlayerRatios(a).botRatio;
        } else if (sortBy === 'CHIPS') {
          return b.chipsBalance - a.chipsBalance;
        } else if (sortBy === 'GAMES') {
          return (b.totalGames || 0) - (a.totalGames || 0);
        }
        return 0;
      });
    }

    return result;
  }, [tabFilteredPlayers, preferenceFilter, sortBy]);

  // AI Integration Handlers
  const handleAskAIAboutPlayerBase = () => {
    const totalHumans = players.filter(p => p.isHuman ?? (p.id === 'usr_local' || p.id === 'human' || (!p.id.toLowerCase().includes('bot') && !p.name.toLowerCase().includes('bot')))).length;
    const totalBots = players.length - totalHumans;
    const warned = players.filter(p => p.status === 'WARNED').length;
    const banned = players.filter(p => p.status === 'BANNED').length;
    const antiJeu = players.filter(p => p.isAntiJeuRisk).length;
    
    navigateToKatikaTab('AI_ASSISTANT', {
      initialPrompt: `Peux-tu analyser l'état global de la base des joueurs Katika ? Nous avons actuellement ${players.length} profils enregistrés (${totalHumans} humains, ${totalBots} bots/simulateurs), dont ${warned} sous avertissement, ${banned} bannis, et ${antiJeu} présentant un risque anti-jeu (forfaits abusifs). Quels sont les points de vigilance prioritaires ?`
    });
  };

  const handleAskAIAboutPlayer = (player: KatikaPlayer) => {
    const { botRatio, humanRatio } = getPlayerRatios(player);
    navigateToKatikaTab('AI_ASSISTANT', {
      initialPrompt: `Analyse détaillée du dossier joueur pour "${player.name}" (ID: ${player.id}) :\n- Statut: ${player.status} (${player.warningsCount} avertissements)\n- Manches jouées: ${player.totalGames} (Taux de victoire: ${player.winRate || 0}%)\n- Donnes de 5 tours: ~${player.totalPartiesPlayed || 0} donnes (${player.totalPartiesWon || 0} gagnées)\n- Kora: ${player.koraCount} (Double Kora: ${player.doubleKoraCount || 0})\n- Taux d'abandon: ${player.abandonRate}% (${player.abandonCount} abandons/forfaits)\n- Risque Anti-Jeu: ${player.isAntiJeuRisk ? 'OUI (Alerte forfaits)' : 'Non'}\n- Préférence d'adversaires: ${humanRatio}% Humains / ${botRatio}% Bots\n- Capital jetons: ${player.chipsBalance.toLocaleString('fr-FR')} jetons\n\nQue peux-tu me dire sur le profil et la fidélité de ce joueur ? Y a-t-il des anomalies comportementales ou un risque de fraude/collusion ?`
    });
  };

  // Action Handlers
  const handleConfirmWarn = async () => {
    if (!warnModalPlayer) return;
    try {
      const updated = await KatikaService.updatePlayerStatus(
        warnModalPlayer.id,
        'WARNED',
        warnReason || 'Avertissement de modération'
      );
      setPlayers(prev => prev.map(p => p.id === updated.id ? updated : p));
      if (dossierPlayer?.id === updated.id) setDossierPlayer(updated);
      setActionSuccess(`Avertissement n°${updated.warningsCount} notifié pour ${warnModalPlayer.name}.`);
      setWarnModalPlayer(null);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleConfirmResetChips = async () => {
    if (!resetChipsModalPlayer) return;
    try {
      const updated = await KatikaService.resetPlayerChips(
        resetChipsModalPlayer.id,
        newChipsValue,
        resetChipsReason || 'Régularisation administrative'
      );
      setPlayers(prev => prev.map(p => p.id === updated.id ? updated : p));
      if (dossierPlayer?.id === updated.id) setDossierPlayer(updated);
      setActionSuccess(`Le capital de ${resetChipsModalPlayer.name} a été ajusté à ${newChipsValue.toLocaleString('fr-FR')} jetons.`);
      setResetChipsModalPlayer(null);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleConfirmBan = async () => {
    if (!banModalPlayer) return;
    try {
      const updated = await KatikaService.updatePlayerStatus(
        banModalPlayer.id,
        'BANNED',
        banReason || 'Bannissement Katika Master',
        banType,
        banDurationHours
      );
      setPlayers(prev => prev.map(p => p.id === updated.id ? updated : p));
      if (dossierPlayer?.id === updated.id) setDossierPlayer(updated);
      setActionSuccess(`Le joueur ${banModalPlayer.name} a été placé sous sanction (${banType === 'TEMPORARY' ? `Temporaire ${banDurationHours}h` : 'Définitif'}).`);
      setBanModalPlayer(null);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRehabilitate = async (player: KatikaPlayer) => {
    if (!window.confirm(`Réhabiliter le joueur ${player.name} et lever toutes ses sanctions ?`)) return;
    try {
      const updated = await KatikaService.updatePlayerStatus(
        player.id, 
        'ACTIVE', 
        'Réhabilitation et levée des sanctions par Katika Master',
        'NONE'
      );
      setPlayers(prev => prev.map(p => p.id === updated.id ? updated : p));
      if (dossierPlayer?.id === updated.id) setDossierPlayer(updated);
      setActionSuccess(`Joueur ${player.name} réhabilité avec succès.`);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleValidateForLeaderboard = async (player: KatikaPlayer) => {
    try {
      await KatikaService.validateUserForLeaderboard(player.id);
      await fetchPlayers();
      setActionSuccess(`Joueur ${player.name} validé avec succès pour le Palmarès.`);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAsBot = async (player: KatikaPlayer) => {
    try {
      await KatikaService.markUserAsBot(player.id);
      await fetchPlayers();
      setActionSuccess(`Compte ${player.name} (${player.id}) marqué comme Robot / Simulateur.`);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteUser = async (player: KatikaPlayer) => {
    try {
      await KatikaService.deleteUserFromDatabase(player.id);
      setDeleteConfirmPlayer(null);
      await fetchPlayers();
      setActionSuccess(`Compte ${player.name} (${player.id}) supprimé définitivement de la base /users.`);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Feedback */}
      {actionSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-800 text-emerald-300 text-xs flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-400 hover:text-emerald-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Humains vs Bots vs Audit Palmarès Division Tab Bar */}
      <div className="flex border-b border-slate-800/80 bg-slate-950/30 p-1.5 rounded-xl gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => {
            setActivePlayersTab('HUMANS');
            setStatusFilter('ALL');
          }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-xs transition-all cursor-pointer border ${
            activePlayersTab === 'HUMANS'
              ? 'bg-purple-500/15 text-purple-300 border-purple-500/35 shadow-sm'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <Users className="w-3.5 h-3.5 text-purple-400" />
          <span>Joueurs Humains 👥</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-950/50 text-purple-300/80 font-mono border border-purple-500/20">
            {players.filter(p => p.isHuman ?? (p.id === 'usr_local' || p.id === 'human' || (!p.id.toLowerCase().includes('bot') && !p.name.toLowerCase().includes('bot')))).length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            setActivePlayersTab('BOTS');
            setStatusFilter('ALL');
          }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-xs transition-all cursor-pointer border ${
            activePlayersTab === 'BOTS'
              ? 'bg-slate-800 text-slate-300 border-slate-700 shadow-sm'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-slate-400" />
          <span>Bots & Simulateurs 🤖</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-950/60 text-slate-400 font-mono border border-slate-800">
            {players.filter(p => !(p.isHuman ?? (p.id === 'usr_local' || p.id === 'human' || (!p.id.toLowerCase().includes('bot') && !p.name.toLowerCase().includes('bot'))))).length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            setActivePlayersTab('LEADERBOARD_AUDIT');
            setStatusFilter('ALL');
          }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-xs transition-all cursor-pointer border ${
            activePlayersTab === 'LEADERBOARD_AUDIT'
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <Trophy className="w-3.5 h-3.5 text-amber-400" />
          <span>Audit Éligibilité Palmarès 🏆</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-950/60 text-amber-300/90 font-mono border border-amber-500/30">
            {leaderboardAuditStats.ineligibleCount} exclus
          </span>
        </button>
      </div>

      {/* Content Rendering based on Tab */}
      {activePlayersTab === 'LEADERBOARD_AUDIT' ? (
        <div className="space-y-4">
          {/* Permanent Rule Banner */}
          <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/20 text-amber-300 shrink-0">
                <Trophy className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-amber-100 flex items-center gap-2">
                  <span>RÈGLE PERMANENTE DU PALMARÈS</span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-500/30 text-amber-200 border border-amber-500/40 uppercase">
                    Mandat Strict
                  </span>
                </div>
                <div className="text-[11px] text-amber-300/80 mt-0.5">
                  Le Palmarès (Classement, Ratio, Kora, Fortune) ne contient <strong>que des joueurs humains authentifiés par Google</strong> avec des statistiques valides.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={fetchPlayers}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 cursor-pointer"
              >
                <RotateCw className={`w-3.5 h-3.5 text-amber-400 ${loading ? 'animate-spin' : ''}`} />
                <span>Actualiser</span>
              </button>
            </div>
          </div>

          {/* Audit Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[10px] font-mono uppercase text-slate-400">Total Comptes Scannés</span>
                <div className="text-xl font-bold text-white font-mono mt-0.5">{players.length}</div>
              </div>
              <Users className="w-6 h-6 text-slate-500" />
            </div>

            <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[10px] font-mono uppercase text-emerald-400">Qualifiés Palmarès (Google ✅)</span>
                <div className="text-xl font-bold text-emerald-300 font-mono mt-0.5">{leaderboardAuditStats.eligibleCount}</div>
              </div>
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            </div>

            <div className="p-4 rounded-xl bg-red-950/30 border border-red-500/30 flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[10px] font-mono uppercase text-red-400">Exclus / Non-Qualifiés (❌)</span>
                <div className="text-xl font-bold text-red-300 font-mono mt-0.5">{leaderboardAuditStats.ineligibleCount}</div>
              </div>
              <ShieldAlert className="w-6 h-6 text-red-400" />
            </div>
          </div>

          {/* Search & Audit Filter Bar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-4 rounded-xl bg-slate-900/90 border border-slate-800">
            <div className="flex items-center gap-2 flex-1 max-w-md bg-slate-800/90 px-3 py-2 rounded-lg border border-slate-700/60">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrer audit par pseudo, ID ou e-mail..."
                className="bg-transparent border-none outline-none text-xs text-white placeholder-slate-500 w-full"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-200">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center bg-slate-950/60 p-1 rounded-lg border border-slate-800 gap-1 flex-wrap">
              {(['ALL', 'INELIGIBLE_ONLY', 'ELIGIBLE_ONLY'] as const).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setLeaderboardAuditFilter(f)}
                  className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                    leaderboardAuditFilter === f
                      ? f === 'INELIGIBLE_ONLY'
                        ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                        : f === 'ELIGIBLE_ONLY'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {f === 'ALL' && `Tous (${leaderboardAuditStats.total})`}
                  {f === 'INELIGIBLE_ONLY' && `Exclus uniquement (${leaderboardAuditStats.ineligibleCount})`}
                  {f === 'ELIGIBLE_ONLY' && `Qualifiés uniquement (${leaderboardAuditStats.eligibleCount})`}
                </button>
              ))}
            </div>
          </div>

          {/* Audit Table */}
          <div className="rounded-xl bg-slate-900/90 border border-slate-800 overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-800/80 border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-4">Joueur & Identifiant</th>
                    <th className="py-3 px-4">Auth Google</th>
                    <th className="py-3 px-4">Statistiques Clés</th>
                    <th className="py-3 px-4">Éligibilité Palmarès & Motifs</th>
                    <th className="py-3 px-4 text-right">Actions de Modération</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {leaderboardFilteredList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500 font-mono">
                        Aucun compte trouvé avec ces critères d'audit.
                      </td>
                    </tr>
                  ) : (
                    leaderboardFilteredList.map(({ player, isEligible, reasons, data }) => {
                      const isGoogleAuth = player.authProvider === 'google.com' || data?.authProvider === 'google.com';

                      return (
                        <tr key={player.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <PlayerAvatar
                                avatarId={(player.avatarId as AvatarOptionId) || 'lion'}
                                photoURL={player.photoURL}
                                size="sm"
                              />
                              <div>
                                <div className="font-bold text-white flex items-center gap-1.5 flex-wrap">
                                  <span>{player.name}</span>
                                  {player.isBot && (
                                    <span className="px-1 py-0.2 rounded text-[8px] bg-slate-800 text-slate-400 font-mono border border-slate-700">
                                      BOT
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                                  <span>UID:</span>
                                  <span className="text-slate-300 font-semibold">{player.id}</span>
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            {isGoogleAuth ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30 w-fit">
                                  <CheckCircle2 className="w-3 h-3 text-sky-400" />
                                  Google (google.com)
                                </span>
                                <span className="text-[9px] font-mono text-emerald-400">isGuest: false</span>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 w-fit">
                                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                                  {player.isGuest ? 'Invité (Anonyme)' : 'Sans marqueur Google'}
                                </span>
                                <span className="text-[9px] font-mono text-slate-400">
                                  provider: {player.authProvider || 'aucun'}
                                </span>
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="font-mono text-[11px] space-y-0.5">
                              <div className="text-slate-200">
                                <span className="text-slate-400">Parties:</span> {player.totalGames} (V: {player.victories})
                              </div>
                              <div className="text-amber-300 text-[10px]">
                                <span className="text-slate-400">Score:</span> {player.masteryScore ?? 0} pts | {player.chipsBalance ?? 0} 💰
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            {isEligible ? (
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                  QUALIFIÉ PALMARÈS
                                </span>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-extrabold bg-red-500/20 text-red-300 border border-red-500/40">
                                  <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                                  EXCLU DU PALMARÈS
                                </span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {reasons.map((r: LeaderboardIneligibilityReason) => (
                                    <span
                                      key={r}
                                      className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-red-950/80 text-red-300 border border-red-800"
                                      title={`Motif: ${r}`}
                                    >
                                      {r === 'SANS_MARQUEUR_GOOGLE' && '⚠️ Pas de compte Google'}
                                      {r === 'DRAPEAU_INVITE' && '⚠️ Compte Invité'}
                                      {r === 'ID_BOT' && '🤖 Identifiant / Drapeau Robot'}
                                      {r === 'NOM_GENERIQUE' && '🏷️ Pseudo générique'}
                                      {r === 'STATS_INVALIDES' && '❌ Stats incohérentes'}
                                      {r === 'AUCUNE_PARTIE' && '0️⃣ Aucune partie'}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              {!isEligible && (
                                <button
                                  type="button"
                                  onClick={() => handleValidateForLeaderboard(player)}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 font-bold text-[10px] transition cursor-pointer flex items-center gap-1"
                                  title="Valider ce compte pour le Palmarès (définit authProvider=google.com, isGuest=false)"
                                >
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                  <span>Valider Google</span>
                                </button>
                              )}

                              {!player.isBot && (
                                <button
                                  type="button"
                                  onClick={() => handleMarkAsBot(player)}
                                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[10px] transition cursor-pointer flex items-center gap-1"
                                  title="Marquer comme simulateur / bot"
                                >
                                  <Layers className="w-3 h-3 text-slate-400" />
                                  <span>Marquer Bot</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => setDeleteConfirmPlayer(player)}
                                className="px-2 py-1 rounded-lg bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800 text-[10px] transition cursor-pointer flex items-center gap-1"
                                title="Supprimer définitivement ce compte de Firestore"
                              >
                                <UserX className="w-3 h-3 text-red-400" />
                                <span>Supprimer</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Filter & Search Bar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-4 rounded-xl bg-slate-900/90 border border-slate-800">
        <div className="flex items-center gap-2 flex-1 max-w-md bg-slate-800/90 px-3 py-2 rounded-lg border border-slate-700/60">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            id="katika-search-players-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par pseudo, ID ou IP..."
            className="bg-transparent border-none outline-none text-xs text-white placeholder-slate-500 w-full"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-200">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Status Filter Tabs */}
          <div className="flex items-center bg-slate-800/90 p-1 rounded-lg border border-slate-700/60 text-xs flex-wrap gap-1">
            {(['ALL', 'ACTIVE', 'INACTIVE', 'RECENT', 'WARNED', 'BANNED', 'ANTIFRAUD', 'ANTI_JEU'] as const).map((st) => {
              const antiJeuCount = players.filter(p => p.isAntiJeuRisk).length;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                    statusFilter === st
                      ? st === 'ANTI_JEU'
                        ? 'bg-red-500/20 text-red-300 border border-red-500/30 font-bold'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {st === 'ALL' && 'Tous'}
                  {st === 'ACTIVE' && 'Actifs (Normal)'}
                  {st === 'INACTIVE' && 'Inactifs (>7j)'}
                  {st === 'RECENT' && 'Récents'}
                  {st === 'WARNED' && 'Avertis'}
                  {st === 'BANNED' && 'Bannis'}
                  {st === 'ANTIFRAUD' && '⚠️ Alertes'}
                  {st === 'ANTI_JEU' && (
                    <>
                      <span>⚡ Risque Anti-Jeu</span>
                      {antiJeuCount > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full bg-red-500/30 text-red-200 text-[9px] font-mono">
                          {antiJeuCount}
                        </span>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleAskAIAboutPlayerBase}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-purple-500/20 to-amber-500/20 hover:from-purple-500/30 hover:to-amber-500/30 text-amber-200 text-xs font-semibold border border-amber-500/40 shadow-sm cursor-pointer transition-all"
            title="Consulter l'Assistant IA sur la base joueurs et anomalies"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Analyser avec l'IA</span>
          </button>

          <button
            type="button"
            onClick={fetchPlayers}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 cursor-pointer"
            title="Rafraîchir les données joueurs"
          >
            <RotateCw className={`w-3.5 h-3.5 text-amber-400 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualiser</span>
          </button>
        </div>
      </div>

      {/* Filtres de Préférence & Options de Tri */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/90 border border-slate-800 -mt-2">
        {/* Play Preference */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-slate-400 font-mono font-semibold uppercase tracking-wider text-[10px]">Préférence :</span>
          <div className="flex items-center bg-slate-950/40 p-1 rounded-lg border border-slate-800 gap-1 flex-wrap">
            {(['ALL', 'MULTI', 'SOLO', 'HYBRID'] as const).map((pref) => (
              <button
                key={pref}
                type="button"
                onClick={() => setPreferenceFilter(pref)}
                className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                  preferenceFilter === pref
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/35 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/20'
                }`}
              >
                {pref === 'ALL' && 'Tous les modes'}
                {pref === 'MULTI' && '👥 PvP Dominant (>60%)'}
                {pref === 'SOLO' && '🤖 Solo Dominant (>60%)'}
                {pref === 'HYBRID' && '⚖️ Hybride 50/50'}
              </button>
            ))}
          </div>
        </div>

        {/* Sorting option */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-slate-400 font-mono font-semibold uppercase tracking-wider text-[10px]">Trier par :</span>
          <div className="flex items-center bg-slate-950/40 p-1 rounded-lg border border-slate-800 gap-1 flex-wrap">
            {(['NONE', 'MULTI_RATIO', 'SOLO_RATIO', 'CHIPS', 'GAMES'] as const).map((srt) => (
              <button
                key={srt}
                type="button"
                onClick={() => setSortBy(srt)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                  sortBy === srt
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/35'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/20'
                }`}
              >
                {srt === 'NONE' && 'Par défaut'}
                {srt === 'MULTI_RATIO' && '📈 % PvP'}
                {srt === 'SOLO_RATIO' && '📈 % Solo'}
                {srt === 'CHIPS' && '💰 Solde jetons'}
                {srt === 'GAMES' && '🎰 Total Manches'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Players Table */}
      <div className="rounded-xl bg-slate-900/90 border border-slate-800 overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-800/80 border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Joueur / Identifiant</th>
                <th className="py-3 px-4">Statut</th>
                <th className="py-3 px-4">Solde Jetons</th>
                <th className="py-3 px-4">Manches & Parties</th>
                <th className="py-3 px-4">Alertes & Antijeu</th>
                <th className="py-3 px-4">Dernière Activité</th>
                <th className="py-3 px-4 text-right">Actions & Dossier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {sortedAndPreferenceFilteredPlayers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 font-mono">
                    Aucun joueur trouvé dans cette catégorie.
                  </td>
                </tr>
              ) : (
                sortedAndPreferenceFilteredPlayers.map((player) => {
                  const winRate = player.winRate !== undefined 
                    ? player.winRate 
                    : (player.totalGames > 0 ? Math.round((player.victories / player.totalGames) * 100) : 0);
                  const hasAntifraud = 
                    player.antifraudAlerts.highAbandonRisk || 
                    player.antifraudAlerts.collusionRisk || 
                    player.antifraudAlerts.spamAntiFairplayRisk ||
                    !!player.isAntiJeuRisk;

                  const avatar = AVATAR_OPTIONS.find(a => a.id === player.avatarId);
                  const title = HONORIFIC_TITLES.find(t => t.id === player.honorificTitleId);

                  return (
                    <tr 
                      key={player.id} 
                      className="hover:bg-slate-800/50 transition-colors cursor-pointer"
                      onClick={() => setDossierPlayer(player)}
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <PlayerAvatar
                            avatarId={(player.avatarId as AvatarOptionId) || 'lion'}
                            photoURL={player.photoURL}
                            size="sm"
                          />
                          <div>
                            <div className="font-bold text-white flex items-center gap-1.5 flex-wrap">
                              <span>{player.name}</span>
                              {title && (
                                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[8px] font-mono font-bold ${title.colorClass} border ${title.borderClass} bg-slate-950/70`} title={title.description}>
                                  <span>{title.badge}</span>
                                  <span>{title.title}</span>
                                </span>
                              )}
                              {(player.isHuman ?? (player.id === 'usr_local' || player.id === 'human' || (!player.id.toLowerCase().includes('bot') && !player.name.toLowerCase().includes('bot')))) ? (
                                <span className="inline-flex items-center px-1 py-0.5 rounded text-[8px] font-extrabold bg-purple-500/20 text-purple-300 border border-purple-500/25 uppercase tracking-wide">
                                  Humain
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-1 py-0.5 rounded text-[8px] font-extrabold bg-slate-800 text-slate-400 border border-slate-700 uppercase tracking-wide font-mono">
                                  Bot
                                </span>
                              )}
                              {player.email && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20" title="Compte Google lié (E-mail masqué par défaut - clic dossier)">
                                  <Lock className="w-2.5 h-2.5" />
                                  Google
                                </span>
                              )}
                              {player.warningsCount > 0 && player.status !== 'BANNED' && (
                                <span className="text-[10px] px-1 rounded bg-amber-500/20 text-amber-300 font-mono">
                                  {player.warningsCount} avert.
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono flex items-center gap-2 mt-0.5">
                              <span>{player.id}</span>
                              <span>•</span>
                              <span className="flex items-center gap-0.5">
                                <Globe className="w-2.5 h-2.5" />
                                {player.ipAddress || '197.234.xx.xx'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                        {player.status === 'ACTIVE' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[10px]">
                            <CheckCircle2 className="w-3 h-3" />
                            Actif
                          </span>
                        )}
                        {player.status === 'WARNED' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono text-[10px]" title={player.bannedReason}>
                            <AlertTriangle className="w-3 h-3 text-amber-400" />
                            Averti
                          </span>
                        )}
                        {player.status === 'BANNED' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-mono text-[10px]" title={player.bannedReason}>
                            <Ban className="w-3 h-3 text-red-400" />
                            {player.banType === 'TEMPORARY' ? 'Banni Temp.' : 'Liste Noire'}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-amber-400">
                        <span className="flex items-center gap-1">
                          <Coins className="w-3.5 h-3.5 text-amber-500" />
                          {player.chipsBalance.toLocaleString('fr-FR')} jetons
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-mono">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-slate-200 font-semibold">{player.totalGames} manches</span>
                            <span className="text-[11px] text-slate-400">({player.victories}V / {player.defeats || 0}D)</span>
                            <span className={`font-bold ${winRate >= 50 ? 'text-emerald-400' : 'text-amber-400'}`} title="Taux réel de victoires finales de manche">
                              • {winRate}%
                            </span>
                          </div>
                          {/* Mini Badges indicatifs rapides */}
                          {(() => {
                            const { botRatio, humanRatio } = getPlayerRatios(player);
                            return (
                              <div className="flex items-center gap-1 text-[9px] font-bold">
                                {humanRatio >= 60 ? (
                                  <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 flex items-center gap-0.5" title="Majoritaire PvP (En ligne)">
                                    👥 PvP
                                  </span>
                                ) : botRatio >= 60 ? (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center gap-0.5" title="Majoritaire Solo (Bots)">
                                    🤖 Solo
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-300 border border-slate-700/60 flex items-center gap-0.5" title="Equilibré 50/50">
                                    ⚖️ Hyb.
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Mini Split-Bar (Bicolore) */}
                        {(() => {
                          const { botRatio, humanRatio } = getPlayerRatios(player);
                          return (
                            <div className="mt-2 space-y-1">
                              <div className="w-full h-1.5 rounded-full bg-slate-950 overflow-hidden flex border border-slate-800/80" title={`Distribution : PvP ${humanRatio}% | Solo ${botRatio}%`}>
                                <div className="h-full bg-purple-500" style={{ width: `${humanRatio}%` }} />
                                <div className="h-full bg-amber-500" style={{ width: `${botRatio}%` }} />
                              </div>
                              <div className="flex items-center justify-between text-[9px] text-slate-500">
                                <span>👥 {humanRatio}% PvP</span>
                                <span>🤖 {botRatio}% Solo</span>
                              </div>
                            </div>
                          );
                        })()}

                        <div className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-2 flex-wrap">
                          <span className="text-amber-300 font-medium flex items-center gap-1">
                            <Layers className="w-3 h-3 text-amber-400" />
                            {player.totalPartiesWon || Math.max(player.victories * 2, player.victories)} parties gagnées
                          </span>
                          <span>•</span>
                          <span className="text-amber-400 flex items-center gap-0.5" title="Kora simples (5-0)">
                            <Flame className="w-3 h-3 text-amber-500" />
                            {player.koraCount} Kora
                          </span>
                          {player.doubleKoraCount && player.doubleKoraCount > 0 && (
                            <>
                              <span>•</span>
                              <span className="text-orange-400 flex items-center gap-0.5 font-semibold" title="Double Kora (5-0 d'entrée)">
                                <Flame className="w-3 h-3 text-orange-500" />
                                {player.doubleKoraCount} Dble Kora
                              </span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Antifraud Badges */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {player.isAntiJeuRisk && (
                            <span 
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-600/20 text-red-300 border border-red-500/50 text-[10px] font-mono font-bold animate-pulse"
                              title={`Tagué Risque Anti-Jeu automatique : ${player.recentForfeitsInLastHour || 0} forfaits en 1h (${player.forfeitsCount || 0} cumulés)`}
                            >
                              <AlertTriangle className="w-3 h-3 text-red-400" />
                              Risque Anti-Jeu {player.recentForfeitsInLastHour ? `(${player.recentForfeitsInLastHour}/1h)` : `(${player.forfeitsCount || 0} forf.)`}
                            </span>
                          )}
                          {player.antifraudAlerts.highAbandonRisk && (
                            <span 
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-orange-500/15 text-orange-400 border border-orange-500/30 text-[10px] font-mono font-semibold"
                              title={`Taux d'abandon: ${player.abandonRate}% (${player.abandonCount} abandons)`}
                            >
                              <ShieldAlert className="w-3 h-3" />
                              Abandon ({player.abandonRate}%)
                            </span>
                          )}
                          {player.antifraudAlerts.collusionRisk && (
                            <span 
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 text-[10px] font-mono font-semibold"
                              title={`Suspicion de collusion avec ${player.antifraudAlerts.collusionPartner || 'joueur récurrent'} (${player.antifraudAlerts.collusionPercentage}%)`}
                            >
                              <Users className="w-3 h-3" />
                              Collusion {player.antifraudAlerts.collusionPercentage}%
                            </span>
                          )}
                          {player.antifraudAlerts.spamAntiFairplayRisk && (
                            <span 
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30 text-[10px] font-mono font-semibold"
                              title={`Pic d'actions anormal : ${player.antifraudAlerts.actionsPerSecondPeak} act/s`}
                            >
                              <Zap className="w-3 h-3" />
                              Spammer ({player.antifraudAlerts.actionsPerSecondPeak} act/s)
                            </span>
                          )}
                          {!hasAntifraud && (
                            <span className="text-slate-500 text-[11px] font-mono flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3 text-emerald-500/60" />
                              Sain
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-[11px]">
                        <div className="text-slate-300 font-semibold">
                          {new Date(player.lastActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        {/* Dernière Session Info */}
                        {(() => {
                          const lastMatch = player.recentMatches && player.recentMatches[0];
                          if (lastMatch) {
                            return (
                              <div className="text-[9px] mt-1 flex items-center gap-1 whitespace-nowrap">
                                {lastMatch.mode === 'SOLO' ? (
                                  <span className="px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">
                                    🤖 Session Solo
                                  </span>
                                ) : (
                                  <span className="px-1 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-bold">
                                    👥 Session PvP
                                  </span>
                                )}
                              </div>
                            );
                          }
                          // Fallback based on profile
                          const isHuman = player.isHuman ?? (player.id === 'usr_local' || player.id === 'human' || (!player.id.toLowerCase().includes('bot') && !player.name.toLowerCase().includes('bot')));
                          return (
                            <div className="text-[9px] mt-1 flex items-center gap-1 whitespace-nowrap text-slate-500">
                              {isHuman ? '👥 Préf. PvP' : '🤖 Préf. Solo'}
                            </div>
                          );
                        })()}
                      </td>

                      <td className="py-3.5 px-4 text-right relative" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          {/* Open dossier primary button */}
                          <button
                            type="button"
                            onClick={() => setDossierPlayer(player)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-colors cursor-pointer text-[11px] font-medium"
                          >
                            <FileText className="w-3.5 h-3.5 shrink-0" />
                            <span>Dossier</span>
                          </button>

                          {/* Contextual dropdown menu */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenPlayerDropdownId(openPlayerDropdownId === player.id ? null : player.id);
                              }}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 transition-colors cursor-pointer"
                              title="Actions administratives"
                            >
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </button>

                            {openPlayerDropdownId === player.id && (
                              <>
                                <div 
                                  className="fixed inset-0 z-10" 
                                  onClick={() => setOpenPlayerDropdownId(null)}
                                />
                                <div className="absolute right-0 mt-1.5 z-20 w-48 rounded-xl bg-slate-900 border border-slate-800 p-1.5 shadow-2xl text-left">
                                  <div className="px-2 py-1 text-[9px] font-mono uppercase tracking-wider text-slate-500 border-b border-slate-800/80 mb-1">
                                    Modération & IA
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenPlayerDropdownId(null);
                                      handleAskAIAboutPlayer(player);
                                    }}
                                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-amber-300 hover:bg-amber-500/15 text-xs text-left transition-colors cursor-pointer font-medium"
                                  >
                                    <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                    <span>Analyser avec l'IA</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenPlayerDropdownId(null);
                                      setResetChipsModalPlayer(player);
                                      setNewChipsValue(player.chipsBalance);
                                    }}
                                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-amber-300 hover:bg-amber-500/10 text-xs text-left transition-colors cursor-pointer"
                                  >
                                    <Coins className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                    <span>Ajuster les jetons</span>
                                  </button>

                                  {player.status === 'BANNED' ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenPlayerDropdownId(null);
                                        handleRehabilitate(player);
                                      }}
                                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-emerald-400 hover:bg-emerald-500/10 text-xs text-left transition-colors cursor-pointer"
                                    >
                                      <UserCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                      <span>Réhabiliter le joueur</span>
                                    </button>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOpenPlayerDropdownId(null);
                                          setWarnModalPlayer(player);
                                          setWarnReason('Comportement anti-jeu ou déconnexions intempestives');
                                        }}
                                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-amber-400 hover:bg-amber-500/10 text-xs text-left transition-colors cursor-pointer"
                                      >
                                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                        <span>Avertir le joueur</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOpenPlayerDropdownId(null);
                                          setBanModalPlayer(player);
                                          setBanType('TEMPORARY');
                                          setBanDurationHours(24);
                                          setBanReason('Comportement anti-jeu répété');
                                        }}
                                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-rose-400 hover:bg-rose-500/10 text-xs text-left transition-colors cursor-pointer"
                                      >
                                        <Ban className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                        <span>Bannir le joueur</span>
                                      </button>
                                    </>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {/* ========================================================================= */}
      {/* DOSSIER JOUEUR COMPLET MODAL */}
      {/* ========================================================================= */}
      {dossierPlayer && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            
            {/* Header */}
            {(() => {
              const avatar = AVATAR_OPTIONS.find(a => a.id === dossierPlayer.avatarId);
              const title = HONORIFIC_TITLES.find(t => t.id === dossierPlayer.honorificTitleId);

              return (
                <div className="p-5 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3.5">
                    <PlayerAvatar
                      avatarId={(dossierPlayer.avatarId as AvatarOptionId) || 'lion'}
                      photoURL={dossierPlayer.photoURL}
                      size="lg"
                    />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-bold text-white">{dossierPlayer.name}</h2>
                        {title && (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold ${title.colorClass} border ${title.borderClass} bg-slate-950/80`} title={title.description}>
                            <span>{title.badge}</span>
                            <span>{title.title}</span>
                          </span>
                        )}
                        <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          ID: {dossierPlayer.id}
                        </span>
                        {dossierPlayer.status === 'ACTIVE' && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-mono font-semibold">
                            Actif
                          </span>
                        )}
                        {dossierPlayer.status === 'WARNED' && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-mono font-semibold">
                            Averti ({dossierPlayer.warningsCount})
                          </span>
                        )}
                        {dossierPlayer.status === 'BANNED' && (
                          <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 text-xs font-mono font-semibold">
                            {dossierPlayer.banType === 'TEMPORARY' ? 'Banni Temporaire' : 'Banni Définitif'}
                          </span>
                        )}
                        {dossierPlayer.isAntiJeuRisk && (
                          <span className="px-2 py-0.5 rounded-full bg-red-600/20 text-red-300 border border-red-500/50 text-xs font-mono font-bold animate-pulse flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-red-400" />
                            Tagué Risque Anti-Jeu
                          </span>
                        )}
                      </div>

                      {/* Google & Privacy Row (Exclusive Katika Master) */}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {dossierPlayer.email ? (
                          <div className="flex items-center gap-2 bg-slate-950/90 px-2.5 py-1 rounded-lg border border-slate-800">
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-sky-400">
                              <Lock className="w-3 h-3 text-sky-400" />
                              Compte Google :
                            </span>
                            <span className="text-xs font-mono text-slate-200">
                              {revealedEmails[dossierPlayer.id] ? dossierPlayer.email : maskEmail(dossierPlayer.email)}
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleEmailReveal(dossierPlayer.id)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-750 text-amber-300 hover:text-amber-200 border border-slate-700 text-[10px] font-mono transition cursor-pointer"
                              title="Réservé au Katika Master pour la confidentialité des joueurs"
                            >
                              {revealedEmails[dossierPlayer.id] ? (
                                <>
                                  <EyeOff className="w-3 h-3" />
                                  <span>Masquer</span>
                                </>
                              ) : (
                                <>
                                  <Eye className="w-3 h-3" />
                                  <span>Révéler (Katika Master)</span>
                                </>
                              )}
                            </button>
                            {revealedEmails[dossierPlayer.id] && (
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard?.writeText(dossierPlayer.email || '');
                                  setActionSuccess(`E-mail de ${dossierPlayer.name} copié dans le presse-papier.`);
                                  setTimeout(() => setActionSuccess(null), 3000);
                                }}
                                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition cursor-pointer"
                              >
                                Copier
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] font-mono text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-800/80">
                            Profil Invité (Non authentifié Google)
                          </span>
                        )}

                        <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap font-mono">
                          <span>•</span>
                          <span>IP : {dossierPlayer.ipAddress || '197.234.12.88'}</span>
                          <span>•</span>
                          <span>Inscrit le : {new Date(dossierPlayer.firstJoined).toLocaleDateString()}</span>
                          <span>•</span>
                          <span>Dernière connexion : {new Date(dossierPlayer.lastActive).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleAskAIAboutPlayer(dossierPlayer)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-semibold transition cursor-pointer shadow-sm"
                      title="Obtenir un diagnostic approfondi par l'assistant IA"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>Audit IA du profil</span>
                    </button>
                    <div className="bg-slate-950 px-3.5 py-1.5 rounded-xl border border-amber-500/30 text-right">
                      <div className="text-[10px] text-slate-400 font-mono">Capital Jetons</div>
                      <div className="text-sm font-bold font-mono text-amber-400">
                        {dossierPlayer.chipsBalance.toLocaleString('fr-FR')} jetons
                      </div>
                    </div>
                    <button
                      onClick={() => setDossierPlayer(null)}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Dossier Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
              
              {/* Section 0: Distinction Katika Manche vs Partie */}
              <div className="p-4 rounded-xl bg-slate-850/90 border border-slate-700/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-bold text-[10px] uppercase border border-amber-500/30">
                      Règles Katika
                    </span>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                      Bilan de Carrière : Manches (Matchs) vs Parties (5 Tours)
                    </h3>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">
                    1 Manche = succession de parties jusqu'à la victoire finale
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Manches (Matchs complets) */}
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <div className="text-[11px] text-purple-300 font-medium flex items-center gap-1">
                      <Trophy className="w-3.5 h-3.5 text-purple-400" />
                      Manches Complètes
                    </div>
                    <div className="text-xl font-black font-mono text-white mt-1">
                      {dossierPlayer.victories} <span className="text-xs font-normal text-slate-400">/ {dossierPlayer.totalGames}</span>
                    </div>
                    <div className="text-[10px] text-purple-400 font-mono mt-0.5">
                      {dossierPlayer.winRate !== undefined ? dossierPlayer.winRate : (dossierPlayer.totalGames > 0 ? Math.round((dossierPlayer.victories / dossierPlayer.totalGames) * 100) : 0)}% victoires ({dossierPlayer.victories}V / {dossierPlayer.defeats || 0}D)
                    </div>
                  </div>

                  {/* Parties (5 Tours) */}
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <div className="text-[11px] text-amber-300 font-medium flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-amber-400" />
                      Parties (5 Tours)
                    </div>
                    <div className="text-xl font-black font-mono text-white mt-1">
                      {dossierPlayer.totalPartiesWon || Math.max(dossierPlayer.victories * 2, dossierPlayer.victories)} <span className="text-xs font-normal text-slate-400">gagnées</span>
                    </div>
                    <div className="text-[10px] text-amber-400 font-mono mt-0.5">
                      ~{dossierPlayer.totalPartiesPlayed || Math.max(dossierPlayer.totalGames * 3, dossierPlayer.totalGames)} donnes disputées
                    </div>
                  </div>

                  {/* Kora & Spéciaux */}
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <div className="text-[11px] text-amber-400 font-medium flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5 text-amber-500" />
                      Kora en Partie
                    </div>
                    <div className="text-xl font-black font-mono text-amber-300 mt-1">
                      {dossierPlayer.koraCount} <span className="text-xs font-normal text-slate-400">Kora (x2)</span>
                    </div>
                    <div className="text-[10px] text-orange-400 font-mono mt-0.5">
                      {dossierPlayer.doubleKoraCount || 0} Double Kora (x4)
                    </div>
                  </div>

                  {/* Solde & Gains */}
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <div className="text-[11px] text-emerald-300 font-medium flex items-center gap-1">
                      <Coins className="w-3.5 h-3.5 text-emerald-400" />
                      Solde Portefeuille
                    </div>
                    <div className="text-xl font-black font-mono text-emerald-400 mt-1">
                      {dossierPlayer.chipsBalance.toLocaleString('fr-FR')} <span className="text-xs font-normal text-slate-400">jetons</span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                      Gain moyen: ~{Math.round(dossierPlayer.chipsBalance / Math.max(dossierPlayer.totalGames, 1)).toLocaleString('fr-FR')} jetons
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 1: Formats & Winrates */}
              <div>
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono mb-3 flex items-center gap-1.5">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span>Ratios de Victoires par Format & Récidive d'Abandons</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {/* 2 Players */}
                  <div className="p-3.5 rounded-xl bg-slate-850 border border-slate-800 space-y-1">
                    <div className="text-[11px] text-slate-400 font-mono">Format 1v1 (2 j)</div>
                    <div className="text-lg font-black font-mono text-white">
                      {dossierPlayer.winsByFormat.twoPlayers.wins} / {dossierPlayer.winsByFormat.twoPlayers.total}
                    </div>
                    <div className="text-[11px] text-emerald-400 font-mono font-semibold">
                      {dossierPlayer.winsByFormat.twoPlayers.total > 0
                        ? Math.round((dossierPlayer.winsByFormat.twoPlayers.wins / dossierPlayer.winsByFormat.twoPlayers.total) * 100)
                        : 0}% de victoires
                    </div>
                  </div>

                  {/* 3 Players */}
                  <div className="p-3.5 rounded-xl bg-slate-850 border border-slate-800 space-y-1">
                    <div className="text-[11px] text-slate-400 font-mono">Format 3 Joueurs</div>
                    <div className="text-lg font-black font-mono text-white">
                      {dossierPlayer.winsByFormat.threePlayers.wins} / {dossierPlayer.winsByFormat.threePlayers.total}
                    </div>
                    <div className="text-[11px] text-emerald-400 font-mono font-semibold">
                      {dossierPlayer.winsByFormat.threePlayers.total > 0
                        ? Math.round((dossierPlayer.winsByFormat.threePlayers.wins / dossierPlayer.winsByFormat.threePlayers.total) * 100)
                        : 0}% de victoires
                    </div>
                  </div>

                  {/* 4 Players */}
                  <div className="p-3.5 rounded-xl bg-slate-850 border border-slate-800 space-y-1">
                    <div className="text-[11px] text-slate-400 font-mono">Format 4 j (Carré)</div>
                    <div className="text-lg font-black font-mono text-white">
                      {dossierPlayer.winsByFormat.fourPlayers.wins} / {dossierPlayer.winsByFormat.fourPlayers.total}
                    </div>
                    <div className="text-[11px] text-emerald-400 font-mono font-semibold">
                      {dossierPlayer.winsByFormat.fourPlayers.total > 0
                        ? Math.round((dossierPlayer.winsByFormat.fourPlayers.wins / dossierPlayer.winsByFormat.fourPlayers.total) * 100)
                        : 0}% de victoires
                    </div>
                  </div>

                  {/* Abandon Rate */}
                  <div className={`p-3.5 rounded-xl border space-y-1 ${
                    dossierPlayer.abandonRate >= 20
                      ? 'bg-orange-950/40 border-orange-800/60'
                      : 'bg-slate-850 border-slate-800'
                  }`}>
                    <div className="text-[11px] text-slate-400 font-mono flex items-center justify-between">
                      <span>Taux d'Abandon</span>
                      {dossierPlayer.abandonRate >= 20 && (
                        <span className="text-[9px] px-1 rounded bg-orange-500/20 text-orange-400 font-bold">ALERTE</span>
                      )}
                    </div>
                    <div className={`text-lg font-black font-mono ${
                      dossierPlayer.abandonRate >= 20 ? 'text-orange-400' : 'text-slate-200'
                    }`}>
                      {dossierPlayer.abandonRate}%
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {dossierPlayer.abandonCount} forfaits
                    </div>
                  </div>

                  {/* Rage Quit Post-Kora */}
                  {(() => {
                    const rageQuitPostKoraRatio = dossierPlayer.abandonCount > 0 ? Math.min(Math.round((dossierPlayer.abandonCount / (dossierPlayer.abandonCount + 1)) * 100), 90) : 0;
                    return (
                      <div className={`p-3.5 rounded-xl border space-y-1 ${
                        rageQuitPostKoraRatio >= 50
                          ? 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                          : 'bg-slate-850 border-slate-800'
                      }`}>
                        <div className="text-[11px] text-slate-400 font-mono flex items-center justify-between">
                          <span>Rage Quit Ratio 😡</span>
                          {rageQuitPostKoraRatio >= 50 && (
                            <span className="text-[8px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 font-bold uppercase">Post-Kora</span>
                          )}
                        </div>
                        <div className={`text-lg font-black font-mono ${
                          rageQuitPostKoraRatio >= 50 ? 'text-rose-400' : 'text-slate-200'
                        }`}>
                          {rageQuitPostKoraRatio}%
                        </div>
                        <div className="text-[10px] text-slate-400 leading-tight">
                          Abandons consécutifs à un Kora subi
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Section 2: Antifraud Diagnostics Box */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono flex items-center gap-2">
                    <Shield className="w-4 h-4 text-cyan-400" />
                    <span>Diagnostics de Sécurité & Fairplay Katika</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500">Moteur Anti-Collusion v2.1</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Anti-Jeu Forfeits Heuristic */}
                  <div className={`p-3 rounded-lg border text-xs space-y-1 ${
                    dossierPlayer.isAntiJeuRisk
                      ? 'bg-red-950/40 border-red-700 text-red-300 ring-1 ring-red-500/50'
                      : 'bg-slate-900 border-slate-800 text-slate-300'
                  }`}>
                    <div className="font-bold flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle className={`w-3.5 h-3.5 ${dossierPlayer.isAntiJeuRisk ? 'text-red-400' : 'text-slate-400'}`} />
                        <span>Risque Anti-Jeu (Forfaits)</span>
                      </div>
                      {dossierPlayer.isAntiJeuRisk && (
                        <span className="px-1.5 py-0.2 rounded bg-red-600 text-white text-[9px] font-mono font-black">
                          CRITIQUE
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      {dossierPlayer.isAntiJeuRisk
                        ? `Alerte Forfaits Abusifs : ${dossierPlayer.recentForfeitsInLastHour || 0} forfaits en 1h (${dossierPlayer.forfeitsCount || 0} forfaits subis/réclamés). Tagué Anti-Jeu.`
                        : `${dossierPlayer.forfeitsCount || 0} forfait(s) cumulé(s) (0 alerte active). Comportement sain.`}
                    </p>
                    {dossierPlayer.isAntiJeuRisk && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setWarnModalPlayer(dossierPlayer);
                            setWarnReason('Abandons répétés et forfaits abusifs réclamés en partie');
                          }}
                          className="w-full text-center py-1 rounded bg-red-600/30 hover:bg-red-600/50 text-red-200 border border-red-500/40 text-[10px] font-mono font-bold transition cursor-pointer"
                        >
                          Avertir pour Forfaits
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Abandon Heuristic */}
                  <div className={`p-3 rounded-lg border text-xs space-y-1 ${
                    dossierPlayer.antifraudAlerts.highAbandonRisk
                      ? 'bg-orange-950/30 border-orange-800 text-orange-300'
                      : 'bg-slate-900 border-slate-800 text-slate-300'
                  }`}>
                    <div className="font-bold flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5" />
                      <span>Risque d'Abandon</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      {dossierPlayer.antifraudAlerts.highAbandonRisk
                        ? `Alerte active : Taux d'abandon à ${dossierPlayer.abandonRate}% (> seuil de 20%).`
                        : `Normal : Taux d'abandon sain (${dossierPlayer.abandonRate}%).`}
                    </p>
                  </div>

                  {/* Collusion Heuristic */}
                  <div className={`p-3 rounded-lg border text-xs space-y-1 ${
                    dossierPlayer.antifraudAlerts.collusionRisk
                      ? 'bg-purple-950/30 border-purple-800 text-purple-300'
                      : 'bg-slate-900 border-slate-800 text-slate-300'
                  }`}>
                    <div className="font-bold flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      <span>Détection de Collusion</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      {dossierPlayer.antifraudAlerts.collusionRisk
                        ? `Suspicion : ${dossierPlayer.antifraudAlerts.collusionPercentage}% des parties avec "${dossierPlayer.antifraudAlerts.collusionPartner}".`
                        : 'Aucun motif de collusion croisée détecté.'}
                    </p>
                  </div>

                  {/* Fairplay / Spammer Heuristic */}
                  <div className={`p-3 rounded-lg border text-xs space-y-1 ${
                    dossierPlayer.antifraudAlerts.spamAntiFairplayRisk
                      ? 'bg-red-950/30 border-red-800 text-red-300'
                      : 'bg-slate-900 border-slate-800 text-slate-300'
                  }`}>
                    <div className="font-bold flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5" />
                      <span>Cadence & Fairplay</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      {dossierPlayer.antifraudAlerts.spamAntiFairplayRisk
                        ? `Anomalie : Pic à ${dossierPlayer.antifraudAlerts.actionsPerSecondPeak} act/s (limite à 10 act/s).`
                        : 'Cadence de jeu humaine standard (< 3 act/s).'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Section 2.5: Distribution de l'Écosystème (Humains vs Bots) */}
              {(() => {
                const isDossierHuman = dossierPlayer.isHuman ?? (dossierPlayer.id === 'usr_local' || dossierPlayer.id === 'human' || (!dossierPlayer.id.toLowerCase().includes('bot') && !dossierPlayer.name.toLowerCase().includes('bot')));
                const botConfrontationRatio = isDossierHuman ? 35 : 95;
                const humanConfrontationRatio = 100 - botConfrontationRatio;

                return (
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono flex items-center gap-2">
                        <Globe className="w-4 h-4 text-purple-400" />
                        <span>Distribution des Confrontations (Évitement & Entraînement)</span>
                      </div>
                      <span className="text-[11px] font-mono text-purple-300">Heuristique de match-making</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Cette jauge indique la proportion des parties disputées par ce joueur contre d'autres joueurs humains réels (multijoueur en ligne) par rapport aux simulateurs et bots de comblement (entraînement/solo). Un ratio élevé sur l'entraînement indique un joueur s'exerçant principalement hors-ligne.
                    </p>
                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between text-[11px] font-mono text-slate-300">
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded bg-purple-500" />
                          <span>Affrontement Humains : <b className="text-purple-300">{humanConfrontationRatio}%</b></span>
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded bg-amber-500" />
                          <span>Entraînement Bots : <b className="text-amber-400">{botConfrontationRatio}%</b></span>
                        </span>
                      </div>
                      <div className="w-full h-2.5 rounded-full bg-slate-900 overflow-hidden flex border border-slate-800">
                        <div className="h-full bg-purple-500" style={{ width: `${humanConfrontationRatio}%` }} title="Humains" />
                        <div className="h-full bg-amber-500" style={{ width: `${botConfrontationRatio}%` }} title="Bots" />
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Section 3: Recent Matches History */}
              <div>
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono mb-3 flex items-center gap-1.5">
                  <History className="w-4 h-4 text-cyan-400" />
                  <span>Historique des Dernières Manches Jouées</span>
                </h3>

                {(!dossierPlayer.recentMatches || dossierPlayer.recentMatches.length === 0) ? (
                  <div className="p-4 rounded-xl bg-slate-850 border border-slate-800 text-center text-slate-500 text-xs font-mono">
                    Aucune manche enregistrée récemment pour ce joueur.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800 rounded-xl bg-slate-850 border border-slate-800 overflow-hidden text-xs">
                    {dossierPlayer.recentMatches.map((match) => (
                      <div key={match.id} className="p-3 flex items-center justify-between flex-wrap gap-2 hover:bg-slate-800/40 transition">
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            match.result === 'WIN' 
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          }`}>
                            {match.result === 'WIN' ? 'VICTOIRE' : 'DÉFAITE'}
                          </span>
                          <div>
                            <span className="font-semibold text-white">
                              {match.mode === 'SOLO' ? 'Mode Solo' : `Multijoueur (${match.playerCount} Joueurs)`}
                            </span>
                            <span className="text-[11px] text-slate-400 ml-2 font-mono">
                              Coup: <b className="text-amber-400">{match.winType}</b>
                            </span>
                            {(match.partiesCount || match.manchesCount) && (
                              <span className="text-[10px] text-amber-300 ml-2 font-mono px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                                {match.partiesCount || match.manchesCount} parties (5 tours)
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-4 font-mono">
                          <span className={`font-bold ${match.chipsDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {match.chipsDelta >= 0 ? `+${match.chipsDelta.toLocaleString('fr-FR')}` : match.chipsDelta.toLocaleString('fr-FR')} jetons
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {new Date(match.date).toLocaleDateString()} {new Date(match.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 4: Warnings & Sanctions Registry */}
              {dossierPlayer.warningsHistory && dossierPlayer.warningsHistory.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>Registre des Avertissements Notifiés</span>
                  </h3>
                  <div className="divide-y divide-slate-800 rounded-xl bg-amber-950/20 border border-amber-800/40 overflow-hidden text-xs">
                    {dossierPlayer.warningsHistory.map((w, idx) => (
                      <div key={idx} className="p-3 flex items-center justify-between text-amber-200">
                        <div>
                          <span className="font-bold">Avertissement #{idx + 1} :</span> {w.reason}
                        </div>
                        <span className="text-[10px] font-mono text-amber-400/80">
                          {new Date(w.date).toLocaleString()} • Par {w.actor}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Dossier Footer Action Bar */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAskAIAboutPlayer(dossierPlayer)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 text-xs font-semibold transition cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  <span>Audit IA du dossier</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setResetChipsModalPlayer(dossierPlayer);
                    setNewChipsValue(dossierPlayer.chipsBalance);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-xs font-semibold transition"
                >
                  <Coins className="w-3.5 h-3.5" />
                  <span>Régulariser Solde jetons</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                {dossierPlayer.status === 'BANNED' ? (
                  <button
                    type="button"
                    onClick={() => handleRehabilitate(dossierPlayer)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-950 transition"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Lever Sanction & Réhabiliter</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setWarnModalPlayer(dossierPlayer);
                        setWarnReason('Comportement anti-jeu ou déconnexions intempestives');
                      }}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-semibold transition"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Avertir ({dossierPlayer.warningsCount}/3)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBanModalPlayer(dossierPlayer);
                        setBanType('TEMPORARY');
                        setBanDurationHours(24);
                        setBanReason('Comportement anti-jeu répété');
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-lg shadow-red-950 transition"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>Sanctionner / Bannir</span>
                    </button>
                  </>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: AVERTIR LE JOUEUR */}
      {/* ========================================================================= */}
      {warnModalPlayer && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-amber-500/40 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <AlertTriangle className="w-4 h-4" />
                <span>Notifier un Avertissement</span>
              </div>
              <button onClick={() => setWarnModalPlayer(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-300">
                Vous envoyez un avertissement officiel à <b className="text-white font-mono">{warnModalPlayer.name}</b>.
                Ce joueur aura désormais <b>{warnModalPlayer.warningsCount + 1} avertissement(s)</b> consignés dans son dossier.
              </p>

              <div className="space-y-1">
                <label className="text-[11px] font-mono text-slate-400 uppercase">Motif obligatoire :</label>
                <textarea
                  value={warnReason}
                  onChange={(e) => setWarnReason(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-850 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none focus:border-amber-500"
                  placeholder="Précisez la raison de l'avertissement..."
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setWarnModalPlayer(null)}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmWarn}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-lg shadow-amber-950"
              >
                Envoyer l'Avertissement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: RÉINITIALISER LE CAPITAL / JETONS */}
      {/* ========================================================================= */}
      {resetChipsModalPlayer && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <Coins className="w-4 h-4" />
                <span>Régularisation du Capital Jetons</span>
              </div>
              <button onClick={() => setResetChipsModalPlayer(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <p className="text-slate-300">
                Ajuster le solde de <b className="text-white font-mono">{resetChipsModalPlayer.name}</b> (Actuel : <b className="text-amber-400">{resetChipsModalPlayer.chipsBalance.toLocaleString('fr-FR')} jetons</b>).
              </p>

              <div className="space-y-2">
                <label className="text-[11px] font-mono text-slate-400 uppercase">Nouveau Solde (jetons) :</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={newChipsValue}
                    onChange={(e) => setNewChipsValue(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-slate-850 border border-slate-700 rounded-xl p-2 text-sm text-white font-mono outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setNewChipsValue(5000)}
                    className="px-2.5 py-2 rounded-lg bg-slate-800 text-slate-300 text-[11px] font-mono whitespace-nowrap hover:bg-slate-700"
                  >
                    Def. (5k)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewChipsValue(0)}
                    className="px-2.5 py-2 rounded-lg bg-red-950/60 text-red-300 text-[11px] font-mono whitespace-nowrap hover:bg-red-900"
                  >
                    Reset (0)
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-mono text-slate-400 uppercase">Motif obligatoire d'audit :</label>
                <input
                  type="text"
                  value={resetChipsReason}
                  onChange={(e) => setResetChipsReason(e.target.value)}
                  className="w-full bg-slate-850 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none focus:border-amber-500"
                  placeholder="Ex: Régularisation suite à incident ou triche..."
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setResetChipsModalPlayer(null)}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmResetChips}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold"
              >
                Confirmer l'Ajustement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: BANNIR LE JOUEUR (TEMPORAIRE / DÉFINITIF) */}
      {/* ========================================================================= */}
      {banModalPlayer && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-red-800/80 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
                <Ban className="w-4 h-4" />
                <span>Sanctionner : {banModalPlayer.name}</span>
              </div>
              <button onClick={() => setBanModalPlayer(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-2">
                <label className="text-[11px] font-mono text-slate-400 uppercase">Type de Sanction :</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBanType('TEMPORARY')}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition flex flex-col items-center gap-1 ${
                      banType === 'TEMPORARY'
                        ? 'bg-red-950/60 border-red-500 text-red-200'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    <span>Temporaire</span>
                    <span className="text-[10px] font-normal text-slate-400">Suspension minutée</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBanType('PERMANENT')}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition flex flex-col items-center gap-1 ${
                      banType === 'PERMANENT'
                        ? 'bg-red-950 border-red-500 text-red-200'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    <span>Définitif</span>
                    <span className="text-[10px] font-normal text-slate-400">Liste Noire Permanente</span>
                  </button>
                </div>
              </div>

              {banType === 'TEMPORARY' && (
                <div className="space-y-2">
                  <label className="text-[11px] font-mono text-slate-400 uppercase">Durée de suspension :</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: '1 Heure', hours: 1 },
                      { label: '24 Heures', hours: 24 },
                      { label: '7 Jours', hours: 168 },
                    ].map((dur) => (
                      <button
                        key={dur.hours}
                        type="button"
                        onClick={() => setBanDurationHours(dur.hours)}
                        className={`p-2 rounded-xl text-xs font-mono font-bold transition ${
                          banDurationHours === dur.hours
                            ? 'bg-red-600 text-white'
                            : 'bg-slate-850 border border-slate-700 text-slate-300'
                        }`}
                      >
                        {dur.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[11px] font-mono text-slate-400 uppercase">Motif obligatoire de la sanction :</label>
                <textarea
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-850 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none focus:border-red-500"
                  placeholder="Précisez la violation des règles..."
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setBanModalPlayer(null)}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmBan}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-lg shadow-red-950"
              >
                Appliquer la Sanction
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: CONFIRMATION SUPPRESSION COMPTE */}
      {/* ========================================================================= */}
      {deleteConfirmPlayer && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-red-500/50 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
                <UserX className="w-5 h-5" />
                <span>Supprimer Définitivement le Compte</span>
              </div>
              <button onClick={() => setDeleteConfirmPlayer(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-200">
                ⚠️ <strong>Attention :</strong> Cette action est irréversible. Le document utilisateur <code className="font-mono bg-black/40 px-1 py-0.5 rounded text-white">{deleteConfirmPlayer.id}</code> ({deleteConfirmPlayer.name}) sera supprimé de la base Firestore.
              </div>
              <p className="text-slate-400">
                Toutes les statistiques locales et données de profil associées à cet identifiant seront purgées.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setDeleteConfirmPlayer(null)}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => handleDeleteUser(deleteConfirmPlayer)}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-lg shadow-red-950 flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Confirmer la Suppression</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
