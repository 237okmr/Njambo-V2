import React, { useState, useEffect, useMemo } from 'react';
import { 
  Trophy, 
  RotateCw, 
  Flame, 
  Sparkles, 
  Award, 
  Zap, 
  Layers, 
  Clock, 
  Search, 
  ChevronLeft, 
  ChevronRight,
  Coins,
  History,
  Users,
  SlidersHorizontal,
  CheckCircle2,
  AlertTriangle,
  UserX,
  Bot,
  HelpCircle,
  FileSpreadsheet
} from 'lucide-react';
import { KatikaKPIs } from '../../types/katika';
import { KatikaService } from '../../services/katikaService';
import { KATIKA_NAVIGATE_EVENT, KatikaNavigationEventDetail, navigateToKatikaTab } from '../../utils/katikaNavigation';
import { qualifyRecordStatus } from '../../../services/telemetryService';

interface KatikaMatchesTabProps {
  initialRange?: 'ALL' | '7D' | '24H';
}

export type MatchesStatusSubTab = 'COMPLETED' | 'ABANDONED' | 'ALL';

export const KatikaMatchesTab: React.FC<KatikaMatchesTabProps> = ({ initialRange = 'ALL' }) => {
  const [kpis, setKpis] = useState<KatikaKPIs | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [timeRange, setTimeRange] = useState<'ALL' | '7D' | '24H'>(initialRange);
  const [statusSubTab, setStatusSubTab] = useState<MatchesStatusSubTab>('COMPLETED');
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  // Filters
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(15);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [modeFilter, setModeFilter] = useState<'ALL' | 'SOLO' | 'MULTIPLAYER'>('ALL');
  const [playerCountFilter, setPlayerCountFilter] = useState<string>('ALL');
  const [winTypeFilter, setWinTypeFilter] = useState<string>('ALL');
  const [tableNatureFilter, setTableNatureFilter] = useState<'ALL' | 'HUMANS_ONLY' | 'HUMANS_VS_BOTS' | 'BOTS_ONLY'>('ALL');
  const [showFilters, setShowFilters] = useState<boolean>(false);

  useEffect(() => {
    const handleNav = (e: Event) => {
      const customEvent = e as CustomEvent<KatikaNavigationEventDetail>;
      if (customEvent.detail?.tab === 'MATCHES') {
        if (customEvent.detail.query !== undefined) {
          setSearchFilter(customEvent.detail.query);
        }
        if (customEvent.detail.filter) {
          if (customEvent.detail.filter === 'ABANDONED' || customEvent.detail.filter === 'COMPLETED' || customEvent.detail.filter === 'ALL') {
            setStatusSubTab(customEvent.detail.filter as MatchesStatusSubTab);
          }
        }
      }
    };
    window.addEventListener(KATIKA_NAVIGATE_EVENT, handleNav);
    return () => window.removeEventListener(KATIKA_NAVIGATE_EVENT, handleNav);
  }, []);

  // Helper to determine table nature in a backward compatible manner
  const getMatchTableNature = (m: any): 'HUMANS_ONLY' | 'HUMANS_VS_BOTS' | 'BOTS_ONLY' => {
    if (m.players && m.players.length > 0) {
      const humanCount = m.players.filter((p: any) => p.isHuman).length;
      const botCount = m.players.filter((p: any) => !p.isHuman).length;
      if (humanCount > 0 && botCount === 0) return 'HUMANS_ONLY';
      if (humanCount > 0 && botCount > 0) return 'HUMANS_VS_BOTS';
      return 'BOTS_ONLY';
    }
    
    if (m.mode === 'SOLO') {
      return 'HUMANS_VS_BOTS';
    }
    
    const nameLower = (m.winnerName || '').toLowerCase();
    const idLower = (m.winnerId || '').toLowerCase();
    const isBotWinner = nameLower.includes('bot') || 
                        nameLower.includes('robam') || 
                        nameLower.includes('hokito') || 
                        nameLower.includes('kora') ||
                        idLower.includes('bot');
                        
    if (isBotWinner) {
      return 'HUMANS_VS_BOTS';
    }
    
    if (idLower.startsWith('usr_') || idLower.startsWith('local') || idLower === 'human') {
      return 'HUMANS_ONLY';
    }
    
    return 'HUMANS_VS_BOTS';
  };

  const isWinnerHuman = (m: any): boolean => {
    if (m.players && m.players.length > 0) {
      const winner = m.players.find((p: any) => p.id === m.winnerId || p.name === m.winnerName);
      if (winner) return winner.isHuman;
    }
    const nameLower = (m.winnerName || '').toLowerCase();
    const idLower = (m.winnerId || '').toLowerCase();
    const isBot = nameLower.includes('bot') || 
                  nameLower.includes('robam') || 
                  nameLower.includes('hokito') || 
                  nameLower.includes('kora') || 
                  idLower.includes('bot') ||
                  nameLower === 'abandon';
    return !isBot;
  };

  const getRecordQualifiedStatus = (m: any): 'completed' | 'in_progress' | 'abandoned' => {
    return qualifyRecordStatus(
      m.status,
      m.isAbandoned || m.winnerName === 'Abandon' || m.winnerId === 'abandon',
      m.updatedAt,
      m.createdAt,
      m.isMancheFinalWin ?? m.isPartieFinalWin
    );
  };

  const fetchMatches = async (range: 'ALL' | '7D' | '24H' = timeRange) => {
    setLoading(true);
    try {
      const data = await KatikaService.getKPIs(range);
      setKpis(data);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Failed to load Matches History:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatches(timeRange);
    setCurrentPage(1);
  }, [timeRange]);

  // Counts by status partition
  const statusCounts = useMemo(() => {
    if (!kpis?.recentMatches) return { completed: 0, abandoned: 0, all: 0 };
    let completed = 0;
    let abandoned = 0;
    kpis.recentMatches.forEach((m) => {
      const st = getRecordQualifiedStatus(m);
      if (st === 'completed') completed++;
      else abandoned++;
    });
    return {
      completed,
      abandoned,
      all: kpis.recentMatches.length
    };
  }, [kpis?.recentMatches]);

  const filteredMatches = useMemo(() => {
    if (!kpis?.recentMatches) return [];
    return kpis.recentMatches.filter((m) => {
      const qualified = getRecordQualifiedStatus(m);

      // Status sub-tab segregation
      if (statusSubTab === 'COMPLETED' && qualified !== 'completed') return false;
      if (statusSubTab === 'ABANDONED' && qualified === 'completed') return false;

      // Regular filters
      if (modeFilter !== 'ALL' && m.mode !== modeFilter) return false;
      if (winTypeFilter !== 'ALL' && m.winType !== winTypeFilter) return false;
      if (playerCountFilter !== 'ALL' && m.playerCount !== Number(playerCountFilter)) return false;
      
      // Nature de la table filter
      if (tableNatureFilter !== 'ALL') {
        const nature = getMatchTableNature(m);
        if (nature !== tableNatureFilter) return false;
      }

      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        const winner = (m.winnerName || '').toLowerCase();
        const id = (m.id || '').toLowerCase();
        const winnerId = (m.winnerId || '').toLowerCase();
        const leaver = (m.leaverName || '').toLowerCase();
        return winner.includes(q) || id.includes(q) || winnerId.includes(q) || leaver.includes(q);
      }
      return true;
    });
  }, [kpis?.recentMatches, statusSubTab, modeFilter, winTypeFilter, playerCountFilter, tableNatureFilter, searchFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredMatches.length / pageSize));
  const paginatedMatches = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredMatches.slice(start, start + pageSize);
  }, [filteredMatches, currentPage, pageSize]);

  // Aggregate stats from filtered matches dynamically reacting to all active filters
  const totalVolumejetons = useMemo(() => {
    return filteredMatches.reduce((acc, m) => {
      return acc + (m.potWon || 0);
    }, 0);
  }, [filteredMatches]);

  const totalPartiesDisputed = useMemo(() => {
    return filteredMatches.reduce((acc, m) => {
      return acc + (m.partiesCount || m.roundsCount || 1);
    }, 0);
  }, [filteredMatches]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (modeFilter !== 'ALL') count++;
    if (tableNatureFilter !== 'ALL') count++;
    if (playerCountFilter !== 'ALL') count++;
    if (winTypeFilter !== 'ALL') count++;
    return count;
  }, [modeFilter, tableNatureFilter, playerCountFilter, winTypeFilter]);

  const handleAskAIAboutHistory = () => {
    const prompt = `Analyse l'historique des parties récentes dans Katika.
- Période : ${timeRange === '24H' ? 'Dernières 24 heures' : timeRange === '7D' ? '7 derniers jours' : 'Toutes les archives'}
- Vue active : ${statusSubTab === 'COMPLETED' ? 'Manches terminées' : statusSubTab === 'ABANDONED' ? 'Sessions abandonnées' : 'Toutes les sessions'}
- Nombre de sessions affichées : ${filteredMatches.length}
- Volume total redistribué : ${totalVolumejetons.toLocaleString('fr-FR')} jetons
- Total de parties disputées : ${totalPartiesDisputed}

Quelles sont les anomalies, tendances de jeu et recommandations pour Katika ?`;
    navigateToKatikaTab('AI_ASSISTANT', prompt);
  };

  const renderWinTypeBadge = (winType: string, isAbandoned?: boolean) => {
    if (isAbandoned) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/25">
          <UserX className="w-3 h-3 text-rose-400" />
          Interruption / Forfait
        </span>
      );
    }

    switch (winType) {
      case 'DOUBLE_KORA':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">
            <Zap className="w-3 h-3 text-orange-400" />
            Double Kora (x4)
          </span>
        );
      case 'KORA':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            <Flame className="w-3 h-3 text-amber-400" />
            Kora (x2)
          </span>
        );
      case 'THREE_SEVENS':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
            <Sparkles className="w-3 h-3 text-cyan-400" />
            Trois 7
          </span>
        );
      case 'UNDER_21':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            <Award className="w-3 h-3 text-indigo-400" />
            ≤ 21 Points
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
            Standard (Tours)
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Range Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <History className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">
              Archives & Historique Détaillé des Parties
            </h2>
            <p className="text-xs text-slate-400">
              Registre officiel complet des manches disputées, scores, donnes et redistribution des pots
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* AI Contextual Shortcut */}
          <button
            type="button"
            onClick={handleAskAIAboutHistory}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 text-xs font-semibold transition cursor-pointer shadow-sm"
            title="Poser une question à l'IA sur l'historique et les tendances"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>Analyser avec l'IA</span>
          </button>

          {/* Time range selector */}
          <div className="flex items-center bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setTimeRange('24H')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer ${
                timeRange === '24H' ? 'bg-amber-500/20 text-amber-300 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              24h
            </button>
            <button
              onClick={() => setTimeRange('7D')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer ${
                timeRange === '7D' ? 'bg-amber-500/20 text-amber-300 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              7 jours
            </button>
            <button
              onClick={() => setTimeRange('ALL')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer ${
                timeRange === 'ALL' ? 'bg-amber-500/20 text-amber-300 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Tout
            </button>
          </div>

          <span className="text-[11px] text-slate-500 font-mono hidden md:inline">
            Màj : {lastRefreshed.toLocaleTimeString()}
          </span>

          <button
            type="button"
            onClick={() => fetchMatches(timeRange)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            <RotateCw className={`w-3.5 h-3.5 text-amber-400 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualiser</span>
          </button>
        </div>
      </div>

      {/* Sub-Navigation Tabs: Partitionnement Sémantique Arbitrage 2 */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-900/90 rounded-xl border border-slate-800 overflow-x-auto">
        <button
          type="button"
          onClick={() => {
            setStatusSubTab('COMPLETED');
            setCurrentPage(1);
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
            statusSubTab === 'COMPLETED'
              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
          }`}
        >
          <CheckCircle2 className={`w-3.5 h-3.5 ${statusSubTab === 'COMPLETED' ? 'text-emerald-400' : 'text-slate-500'}`} />
          <span>Manches Terminées (Officielles)</span>
          <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full ${
            statusSubTab === 'COMPLETED' ? 'bg-emerald-500/30 text-emerald-200' : 'bg-slate-800 text-slate-400'
          }`}>
            {statusCounts.completed}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatusSubTab('ABANDONED');
            setCurrentPage(1);
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
            statusSubTab === 'ABANDONED'
              ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
          }`}
        >
          <AlertTriangle className={`w-3.5 h-3.5 ${statusSubTab === 'ABANDONED' ? 'text-rose-400' : 'text-slate-500'}`} />
          <span>Abandons & Forfaits</span>
          <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full ${
            statusSubTab === 'ABANDONED' ? 'bg-rose-500/30 text-rose-200' : 'bg-slate-800 text-slate-400'
          }`}>
            {statusCounts.abandoned}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatusSubTab('ALL');
            setCurrentPage(1);
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
            statusSubTab === 'ALL'
              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
          }`}
        >
          <History className={`w-3.5 h-3.5 ${statusSubTab === 'ALL' ? 'text-amber-400' : 'text-slate-500'}`} />
          <span>Toutes les Sessions (Vue brute)</span>
          <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full ${
            statusSubTab === 'ALL' ? 'bg-amber-500/30 text-amber-200' : 'bg-slate-800 text-slate-400'
          }`}>
            {statusCounts.all}
          </span>
        </button>
      </div>

      {/* Summary Stat Badges for the Filtered View */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between transition-all duration-250">
          <div>
            <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              Sessions Filtrées ({statusSubTab === 'COMPLETED' ? 'Terminées' : statusSubTab === 'ABANDONED' ? 'Abandons' : 'Toutes'})
            </span>
            <div className="text-2xl font-bold text-white font-mono mt-1">
              {filteredMatches.length}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {statusSubTab === 'COMPLETED' ? 'Victoires certifiées au tableau' : statusSubTab === 'ABANDONED' ? 'Télémétrie des abandons' : 'Historique complet'}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl border bg-purple-500/10 border-purple-500/20 text-purple-400 flex items-center justify-center">
            <Trophy className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between transition-all duration-250">
          <div>
            <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              Total Parties (5 tours) Jouées
            </span>
            <div className="text-2xl font-bold text-amber-300 font-mono mt-1">
              {totalPartiesDisputed.toLocaleString('fr-FR')}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              ~{filteredMatches.length > 0 ? (totalPartiesDisputed / filteredMatches.length).toFixed(1) : 1} parties / manche
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl border bg-amber-500/10 border-amber-500/20 text-amber-400 flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between transition-all duration-250">
          <div>
            <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              Volume Cumulé des Gains
            </span>
            <div className="text-2xl font-bold text-emerald-300 font-mono mt-1">
              {totalVolumejetons.toLocaleString('fr-FR')} <span className="text-xs font-sans text-emerald-500">jetons</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Pots cumulés redistribués
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl border bg-emerald-500/10 border-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <Coins className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-4 shadow-sm">
        {/* Filter Controls Bar */}
        <div className="space-y-3 pb-3 border-b border-slate-800">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Recherche & Filtrage
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Search Input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Rechercher joueur / ID / UID..."
                  value={searchFilter}
                  onChange={(e) => {
                    setSearchFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-400 transition w-56 cursor-pointer"
                />
              </div>

              {/* Advanced Filters Button */}
              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                  showFilters || activeFiltersCount > 0
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                    : 'bg-slate-800 hover:bg-slate-750 text-slate-400 border-slate-700'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Filtres Avancés</span>
                {activeFiltersCount > 0 && (
                  <span className="ml-1 bg-amber-500 text-slate-950 font-mono text-[10px] font-extrabold px-1.5 py-0.2 rounded-full">
                    {activeFiltersCount}
                  </span>
                )}
              </button>

              {/* Quick Clear Filter Link */}
              {(activeFiltersCount > 0 || searchFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setModeFilter('ALL');
                    setTableNatureFilter('ALL');
                    setPlayerCountFilter('ALL');
                    setWinTypeFilter('ALL');
                    setSearchFilter('');
                    setCurrentPage(1);
                  }}
                  className="text-[11px] text-slate-500 hover:text-amber-400 transition font-mono cursor-pointer"
                >
                  [Réinitialiser]
                </button>
              )}
            </div>
          </div>

          {/* Collapsible Advanced Filters Section */}
          {showFilters && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-950/30 p-3.5 rounded-xl border border-slate-800/60 mt-2 transition-all">
              {/* Mode filter */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Mode de jeu</span>
                <select
                  value={modeFilter}
                  onChange={(e) => {
                    setModeFilter(e.target.value as any);
                    setCurrentPage(1);
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 focus:outline-none focus:border-amber-400 cursor-pointer"
                >
                  <option value="ALL">Tous les modes</option>
                  <option value="MULTIPLAYER">Multijoueur (Live)</option>
                  <option value="SOLO">Mode Solo (Hors-Ligne)</option>
                </select>
              </div>

              {/* Nature de la table filter */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Nature de table</span>
                <select
                  value={tableNatureFilter}
                  onChange={(e) => {
                    setTableNatureFilter(e.target.value as any);
                    setCurrentPage(1);
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 focus:outline-none focus:border-amber-400 cursor-pointer"
                >
                  <option value="ALL">Toutes natures</option>
                  <option value="HUMANS_ONLY">Humains vs Humains 👥</option>
                  <option value="HUMANS_VS_BOTS">Humains vs Bots 🤖</option>
                  <option value="BOTS_ONLY">Simulation (Bots) ⚙️</option>
                </select>
              </div>

              {/* Player Count filter */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Nombre de joueurs</span>
                <select
                  value={playerCountFilter}
                  onChange={(e) => {
                    setPlayerCountFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 focus:outline-none focus:border-amber-400 cursor-pointer"
                >
                  <option value="ALL">Toutes les tailles</option>
                  <option value="2">2 Joueurs (Duels)</option>
                  <option value="3">3 Joueurs</option>
                  <option value="4">4 Joueurs (Classique)</option>
                </select>
              </div>

              {/* Win Type filter */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Type de coup final</span>
                <select
                  value={winTypeFilter}
                  onChange={(e) => {
                    setWinTypeFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 focus:outline-none focus:border-amber-400 cursor-pointer"
                >
                  <option value="ALL">Tous les coups</option>
                  <option value="DOUBLE_KORA">Double Kora (x4)</option>
                  <option value="KORA">Kora (x2)</option>
                  <option value="THREE_SEVENS">Trois 7 (Spécial)</option>
                  <option value="UNDER_21">≤ 21 Points</option>
                  <option value="STANDARD">Standard (Tours)</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Official Rules Context Banner */}
        <div className="px-3.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-between text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-bold text-[10px] uppercase border border-amber-500/30 shrink-0">
              Distinction Katika
            </span>
            <span className="text-[11px] text-amber-200/90 leading-relaxed">
              {statusSubTab === 'COMPLETED' 
                ? 'Seules les Manches menées à terme avec vainqueur officiel figurent ici. La colonne Parties Disputées indique le nombre total de donnes (5 tours).'
                : statusSubTab === 'ABANDONED'
                ? 'Répertoire des manches interrompues, déconnexions prolongées et forfaits. Les données sont conservées pour la télémétrie de rétention.'
                : 'Vue brute combinée de toutes les sessions enregistrées sur la période sélectionnée.'}
            </span>
          </div>
        </div>

        {/* Matches Table Content */}
        {loading && !kpis ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <RotateCw className="w-6 h-6 animate-spin text-amber-400 mr-3" />
            <span className="text-xs font-mono">Chargement des archives de jeu...</span>
          </div>
        ) : paginatedMatches.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-xs space-y-2">
            <Trophy className="w-10 h-10 text-slate-600 mx-auto stroke-1" />
            <p className="text-sm font-semibold text-slate-400">Aucune manche trouvée</p>
            <p>Essayez de réinitialiser vos filtres ou de sélectionner une plage de temps plus large.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] text-slate-400 font-mono uppercase bg-slate-950/40">
                  <th className="py-3 px-3.5 font-semibold">Date & Heure</th>
                  <th className="py-3 px-3.5 font-semibold">Statut</th>
                  <th className="py-3 px-3.5 font-semibold">Mode & Format</th>
                  <th className="py-3 px-3.5 font-semibold">
                    {statusSubTab === 'ABANDONED' ? 'Dernier Joueur / Quitté par' : 'Vainqueur de la Manche'}
                  </th>
                  <th className="py-3 px-3.5 font-semibold">
                    {statusSubTab === 'ABANDONED' ? "Raison d'abandon" : 'Coup Décisif (Dernière Donne)'}
                  </th>
                  <th className="py-3 px-3.5 font-semibold text-center">Parties (5 tours)</th>
                  <th className="py-3 px-3.5 font-semibold text-right">Pot Remporté</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {paginatedMatches.map((match) => {
                  const isWinHuman = isWinnerHuman(match);
                  const qualifiedStatus = getRecordQualifiedStatus(match);
                  const isAbandoned = qualifiedStatus === 'abandoned';
                  
                  let humanCount = 0;
                  let botCount = 0;
                  if (match.players && match.players.length > 0) {
                    humanCount = match.players.filter((p: any) => p.isHuman).length;
                    botCount = match.players.filter((p: any) => !p.isHuman).length;
                  } else if (match.mode === 'SOLO') {
                    humanCount = 1;
                    botCount = match.playerCount - 1;
                  } else {
                    if (isWinHuman) {
                      humanCount = match.playerCount;
                      botCount = 0;
                    } else {
                      humanCount = match.playerCount - 1;
                      botCount = 1;
                    }
                  }

                  return (
                    <tr key={match.id || `${match.createdAt}-${match.winnerName}`} className="hover:bg-slate-800/40 transition-colors">
                      {/* Date */}
                      <td className="py-3.5 px-3.5 text-slate-300 font-mono text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span className="text-slate-200">{new Date(match.createdAt).toLocaleDateString('fr-FR')}</span>
                          <span className="text-slate-500 font-mono">{new Date(match.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </td>

                      {/* Statut Qualifié */}
                      <td className="py-3.5 px-3.5">
                        {qualifiedStatus === 'completed' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            Certifiée
                          </span>
                        ) : qualifiedStatus === 'in_progress' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/25 animate-pulse">
                            <RotateCw className="w-3 h-3 text-cyan-400 animate-spin" />
                            En direct
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/25">
                            <AlertTriangle className="w-3 h-3 text-rose-400" />
                            Abandonnée
                          </span>
                        )}
                      </td>

                      {/* Mode & Format */}
                      <td className="py-3.5 px-3.5">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                            match.mode === 'MULTIPLAYER' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}>
                            {match.mode === 'MULTIPLAYER' ? 'MULTI' : 'SOLO'}
                          </span>
                          <span className="text-[11px] text-slate-300 font-mono flex items-center gap-1">
                            <Users className="w-3 h-3 text-slate-500" />
                            <span>{match.playerCount}J</span>
                            <span className="text-[10px] text-slate-400 font-medium ml-1.5 bg-slate-950/80 px-1.5 py-0.5 rounded border border-slate-800/80" title="Occupation de la table">
                              {humanCount}👤 / {botCount}🤖
                            </span>
                          </span>
                        </div>
                      </td>

                      {/* Winner / Leaver */}
                      <td className="py-3.5 px-3.5 font-medium text-white">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-7 h-7 rounded-full font-bold flex items-center justify-center text-xs shadow-sm ${
                            isAbandoned 
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : 'bg-gradient-to-tr from-amber-600 to-amber-400 text-slate-950'
                          }`}>
                            {isAbandoned ? 'X' : (match.winnerName || 'J').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <div className="font-semibold text-slate-100">
                                {isAbandoned 
                                  ? (match.leaverName ? `Quitté par ${match.leaverName}` : 'Session Incomplète')
                                  : match.winnerName}
                              </div>
                              {!isAbandoned && (
                                isWinHuman ? (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-purple-500/20 text-purple-300 border border-purple-500/25 uppercase tracking-wide shrink-0">
                                    Humain
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-slate-800 text-slate-400 border border-slate-700 uppercase tracking-wide shrink-0 font-mono">
                                    Bot
                                  </span>
                                )
                              )}
                            </div>
                            {match.winnerId && !isAbandoned && (
                              <div className="text-[10px] text-slate-500 font-mono truncate max-w-[140px]" title={match.winnerId}>
                                ID: {match.winnerId}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Win Type / Reason */}
                      <td className="py-3.5 px-3.5">
                        {isAbandoned ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
                              {match.abandonmentReason || 'INACTIVITÉ > 30MIN'}
                            </span>
                            {match.trickNumberAtQuit ? (
                              <div className="text-[10px] text-slate-500 font-mono">
                                Interrompu au tour {match.trickNumberAtQuit}/5
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          renderWinTypeBadge(match.winType)
                        )}
                      </td>

                      {/* Parties disputées */}
                      <td className="py-3.5 px-3.5 text-center">
                        <span 
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/90 text-slate-200 border border-slate-700 font-mono text-[11px] font-semibold"
                          title={`${match.partiesCount || match.roundsCount || 1} parties de 5 tours disputées`}
                        >
                          <Layers className="w-3.5 h-3.5 text-amber-400" />
                          <span>{match.partiesCount || match.roundsCount || 1} {(match.partiesCount || match.roundsCount || 1) > 1 ? 'parties' : 'partie'}</span>
                        </span>
                      </td>

                      {/* Pot Won */}
                      <td className="py-3.5 px-3.5 text-right">
                        <span className="font-mono font-bold text-amber-300 text-sm">
                          {match.potWon ? match.potWon.toLocaleString('fr-FR') : '—'}
                        </span>
                        {match.potWon ? <span className="text-[10px] text-amber-500 ml-1 font-semibold">jetons</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-800 pt-4 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>Afficher</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              aria-label="Nombre de parties par page"
              className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-200 text-xs focus:outline-none"
            >
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>manches par page (sur {filteredMatches.length})</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-slate-400">
              Page <span className="text-white font-bold">{currentPage}</span> sur <span className="text-white font-bold">{totalPages}</span>
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 transition"
                title="Page précédente"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 transition"
                title="Page suivante"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KatikaMatchesTab;
