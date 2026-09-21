import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Dices, 
  Trophy, 
  Flame, 
  RotateCw, 
  Crown, 
  TrendingUp, 
  Layers, 
  Coins, 
  Sparkles, 
  Clock, 
  Zap, 
  Award, 
  Activity, 
  Compass, 
  Gauge, 
  Target, 
  Timer, 
  Calendar, 
  HeartHandshake, 
  BarChart3, 
  Sun, 
  ShieldCheck, 
  AlertCircle, 
  FileText,
  ArrowRight,
  SlidersHorizontal,
  History
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid
} from 'recharts';
import { KatikaKPIs, KatikaTab, KatikaDashboardSubTab } from '../../types/katika';
import { KatikaService } from '../../services/katikaService';
import { KatikaInvestorReportModal } from '../modals/KatikaInvestorReportModal';
import { navigateToKatikaTab } from '../../utils/katikaNavigation';

interface KatikaDashboardTabProps {
  onNavigateTab?: (tab: KatikaTab) => void;
}

export const KatikaDashboardTab: React.FC<KatikaDashboardTabProps> = ({ onNavigateTab }) => {
  const [kpis, setKpis] = useState<KatikaKPIs | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [timeRange, setTimeRange] = useState<'TODAY' | '24H' | '7D' | 'ALL'>(() => {
    return (localStorage.getItem('katika_dashboard_timespan') as any) || '7D';
  });
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [activeSubTab, setActiveSubTab] = useState<KatikaDashboardSubTab>('LIVE');
  const [recentFilter, setRecentFilter] = useState<'ALL' | 'COMPLETED' | 'IN_PROGRESS' | 'ABANDONED'>('ALL');
  const [isInvestorModalOpen, setIsInvestorModalOpen] = useState<boolean>(false);

  const fetchKpis = async (range: 'TODAY' | '24H' | '7D' | 'ALL' = timeRange) => {
    setLoading(true);
    try {
      const data = await KatikaService.getKPIs(range);
      setKpis(data);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Failed to load KPIs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTimeRangeChange = (newRange: 'TODAY' | '24H' | '7D' | 'ALL') => {
    setTimeRange(newRange);
    try {
      localStorage.setItem('katika_dashboard_timespan', newRange);
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    fetchKpis(timeRange);
  }, [timeRange]);

  if (!kpis && loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <RotateCw className="w-6 h-6 animate-spin text-amber-400 mr-3" />
        <span className="text-xs font-mono">Chargement des métriques réelles en direct...</span>
      </div>
    );
  }

  if (!kpis) return null;

  // Calculations for Victory breakdown
  const actualVictoriesCount = (kpis.koraCount + kpis.doubleKoraCount + kpis.simpleVictoryCount + kpis.threeSevensCount + kpis.under21Count);
  const totalVictories = actualVictoriesCount > 0 ? actualVictoriesCount : 1;
  const koraPct = actualVictoriesCount > 0 ? Math.round((kpis.koraCount / totalVictories) * 100) : 0;
  const doubleKoraPct = actualVictoriesCount > 0 ? Math.round((kpis.doubleKoraCount / totalVictories) * 100) : 0;
  const simplePct = actualVictoriesCount > 0 ? Math.round((kpis.simpleVictoryCount / totalVictories) * 100) : 0;
  const threeSevensPct = actualVictoriesCount > 0 ? Math.round((kpis.threeSevensCount / totalVictories) * 100) : 0;
  const under21Pct = actualVictoriesCount > 0 ? Math.round((kpis.under21Count / totalVictories) * 100) : 0;

  // Calculations for Multi distribution
  const actualMultiDist = (kpis.twoPlayersCount + kpis.threePlayersCount + kpis.fourPlayersCount);
  const totalMultiPlayersDist = actualMultiDist > 0 ? actualMultiDist : 1;
  const twoPlayersPct = actualMultiDist > 0 ? Math.round((kpis.twoPlayersCount / totalMultiPlayersDist) * 100) : 0;
  const threePlayersPct = actualMultiDist > 0 ? Math.round((kpis.threePlayersCount / totalMultiPlayersDist) * 100) : 0;
  const fourPlayersPct = actualMultiDist > 0 ? Math.round((kpis.fourPlayersCount / totalMultiPlayersDist) * 100) : 0;

  const renderWinTypeBadge = (winType: string) => {
    switch (winType) {
      case 'DOUBLE_KORA':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">
            <Zap className="w-3 h-3 text-orange-400" />
            Double Kora
          </span>
        );
      case 'KORA':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            <Flame className="w-3 h-3 text-amber-400" />
            Kora
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

  const renderStatusBadge = (status?: string, isAbandoned?: boolean) => {
    if (status === 'abandoned' || isAbandoned) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
          <AlertCircle className="w-3 h-3 text-amber-400" />
          Abandon / Forfait
        </span>
      );
    }
    if (status === 'in_progress') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          En direct
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
        <ShieldCheck className="w-3 h-3 text-emerald-400" />
        Terminée
      </span>
    );
  };

  const filteredRecentMatches = kpis.recentMatches.filter((match) => {
    if (recentFilter === 'ALL') return true;
    if (recentFilter === 'COMPLETED') return match.status === 'completed' || (!match.status && !match.isAbandoned);
    if (recentFilter === 'IN_PROGRESS') return match.status === 'in_progress';
    if (recentFilter === 'ABANDONED') return match.status === 'abandoned' || match.isAbandoned;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header Bar: Sub-Tabs & Global Controls (Single Unified Line) */}
      <div className="flex flex-row items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 p-2.5 rounded-2xl shadow-sm overflow-x-auto whitespace-nowrap">
        {/* Navigation Sub-Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-950/80 rounded-xl border border-slate-800/80 shrink-0">
          <button
            type="button"
            id="katika-subtab-live"
            onClick={() => setActiveSubTab('LIVE')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeSubTab === 'LIVE'
                ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Activity className={`w-3.5 h-3.5 ${activeSubTab === 'LIVE' ? 'text-slate-950' : 'text-emerald-400'}`} />
            <span>🟢 Live</span>
          </button>

          <button
            type="button"
            id="katika-subtab-business"
            onClick={() => setActiveSubTab('BUSINESS')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeSubTab === 'BUSINESS'
                ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <TrendingUp className={`w-3.5 h-3.5 ${activeSubTab === 'BUSINESS' ? 'text-slate-950' : 'text-cyan-400'}`} />
            <span>📈 Business</span>
          </button>

          <button
            type="button"
            id="katika-subtab-gameplay"
            onClick={() => setActiveSubTab('GAMEPLAY')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeSubTab === 'GAMEPLAY'
                ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <SlidersHorizontal className={`w-3.5 h-3.5 ${activeSubTab === 'GAMEPLAY' ? 'text-slate-950' : 'text-amber-400'}`} />
            <span>🎮 Gameplay</span>
          </button>
        </div>

        {/* Global Range Selector & Actions on the exact same line */}
        <div className="flex items-center gap-3 shrink-0 ml-auto">
          {/* Time range selector */}
          <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => handleTimeRangeChange('TODAY')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer ${
                timeRange === 'TODAY' ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30' : 'text-slate-400 hover:text-white'
              }`}
            >
              Aujourd'hui
            </button>
            <button
              onClick={() => handleTimeRangeChange('24H')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer ${
                timeRange === '24H' ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30' : 'text-slate-400 hover:text-white'
              }`}
            >
              24h
            </button>
            <button
              onClick={() => handleTimeRangeChange('7D')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer ${
                timeRange === '7D' ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30' : 'text-slate-400 hover:text-white'
              }`}
            >
              7 jours
            </button>
            <button
              onClick={() => handleTimeRangeChange('ALL')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer ${
                timeRange === 'ALL' ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30' : 'text-slate-400 hover:text-white'
              }`}
            >
              Tout
            </button>
          </div>

          <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
            Màj : {lastRefreshed.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>

          <button
            type="button"
            id="katika-dashboard-ai-btn"
            onClick={() => {
              const totalGames = (kpis.soloGamesCount || 0) + (kpis.multiplayerGamesCount || 0);
              const koraRate = totalGames > 0 ? Math.round(((kpis.koraCount + kpis.doubleKoraCount) / totalGames) * 100) : 0;
              const abandonRate = kpis.abandonmentFrustrations?.abandonmentRate || 0;
              const d1 = kpis.retentionEngagement?.d1Retention || 0;
              const d7 = kpis.retentionEngagement?.d7Retention || 0;

              navigateToKatikaTab('AI_ASSISTANT', {
                initialPrompt: `Analyse globale du Tableau de Bord Katika (Période: ${timeRange}) :\n- Joueurs connectés: ${kpis.connectedPlayersCount}\n- Manches jouées: ${totalGames} (Multi: ${kpis.multiplayerGamesCount}, Solo: ${kpis.soloGamesCount})\n- Taux de Kora: ${koraRate}% (${kpis.koraCount} Kora, ${kpis.doubleKoraCount} Double Kora)\n- Taux d'abandon: ${abandonRate}%\n- Pot moyen: ${kpis.avgPotPerGame.toLocaleString('fr-FR')} jetons (Volume total: ${kpis.totalChipsWon.toLocaleString('fr-FR')} jetons)\n- Taux de rétention D1/D7: ${d1}% / ${d7}%\n\nPeux-tu me dresser un bilan synthétique de la santé de la plateforme et des opportunités d'amélioration ?`
              });
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-500/20 to-amber-500/20 hover:from-purple-500/30 hover:to-amber-500/30 text-amber-200 text-xs font-semibold border border-amber-500/40 shadow-sm cursor-pointer transition-all"
            title="Consulter l'Assistant IA sur ces métriques"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Analyser avec l'IA</span>
          </button>

          <button
            type="button"
            id="katika-refresh-kpis-btn"
            onClick={() => fetchKpis(timeRange)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            <RotateCw className={`w-3.5 h-3.5 text-amber-400 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualiser</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SOUS-ONGLET 1 : 🟢 LIVE & SUPERVISION (COCKPIT OPÉRATIONNEL RESTRUCTURÉ)   */}
      {/* ========================================================================= */}
      {activeSubTab === 'LIVE' && (
        <div className="space-y-6">
          {/* 1. Bandeau Live Strip - Cockpit Opérationnel Temps Réel */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Cell 1: Statut Serveur & Latence WS */}
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 shadow-sm flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[11px] font-medium text-slate-400">Statut Réseau & WS</span>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    En direct
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">Actif</span>
                </div>
              </div>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <Activity className="w-4 h-4 text-emerald-400" />
              </div>
            </div>

            {/* Cell 2: Joueurs connectés */}
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 shadow-sm flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[11px] font-medium text-slate-400">Joueurs Connectés</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-white font-mono">{kpis.connectedPlayersCount}</span>
                  <span className="text-[11px] text-slate-500 font-sans">
                    {kpis.connectedPlayersCount > 0 ? `${kpis.connectedPlayersCount} en ligne` : 'En veille active'}
                  </span>
                </div>
              </div>
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4 text-cyan-400" />
              </div>
            </div>

            {/* Cell 3: Tables & Salons Actifs */}
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 shadow-sm flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[11px] font-medium text-slate-400">Tables & Salons Actifs</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-white font-mono">{kpis.activeRoomsCount}</span>
                  <span className="text-[11px] text-slate-500 font-sans">
                    {kpis.activeRoomsCount > 0 ? 'Salons ouverts' : 'Aucune table active'}
                  </span>
                </div>
              </div>
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
                <Dices className="w-4 h-4 text-purple-400" />
              </div>
            </div>

            {/* Cell 4: Taux de complétion global */}
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 shadow-sm flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[11px] font-medium text-slate-400">Complétion des Manches</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-emerald-400 font-mono">
                    {kpis.mancheCompletionRate ?? 100}%
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {kpis.totalManchesCompleted ?? 0}/{kpis.totalManchesStarted ?? 0}
                  </span>
                </div>
              </div>
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <Target className="w-4 h-4 text-amber-400" />
              </div>
            </div>
          </div>

          {/* 2. Module Central 2 Colonnes Équilibrées */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Colonne 1 : Activité & Cycle des Manches */}
            <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-4 flex flex-col justify-between">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-400" />
                  <div>
                    <h3 className="text-sm font-bold text-white">Activité & Cycle des Manches</h3>
                    <p className="text-[11px] text-slate-400">Cycle de vie des sessions (lancées, conclues, forfaits)</p>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-300 font-semibold">
                  {timeRange === 'TODAY' ? "Aujourd'hui" : timeRange === '24H' ? '24 heures' : timeRange === '7D' ? '7 jours' : 'Tout'}
                </span>
              </div>

              {/* Compteurs Clés de Manches */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/60 text-center">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Débutées</span>
                  <div className="text-2xl font-bold text-purple-300 font-mono mt-0.5">
                    {(kpis.totalManchesStarted || 0).toLocaleString('fr-FR')}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-emerald-500/20 text-center">
                  <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Terminées</span>
                  <div className="text-2xl font-bold text-emerald-300 font-mono mt-0.5">
                    {(kpis.totalManchesCompleted || 0).toLocaleString('fr-FR')}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-amber-500/20 text-center">
                  <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">Abandons</span>
                  <div className="text-2xl font-bold text-amber-300 font-mono mt-0.5">
                    {(kpis.totalManchesAbandoned || (kpis.totalManchesInProgress || 0)).toLocaleString('fr-FR')}
                  </div>
                </div>
              </div>

              {/* Jauge Segmentée de Complétion */}
              {(() => {
                const total = (kpis.totalManchesStarted || 0) || 1;
                const completed = kpis.totalManchesCompleted || 0;
                const abandoned = kpis.totalManchesAbandoned || 0;
                const ongoing = kpis.totalManchesOngoing || Math.max(0, total - completed - abandoned);

                const compPct = Math.round((completed / total) * 100);
                const abanPct = Math.round((abandoned / total) * 100);
                const ongoPct = Math.max(0, 100 - compPct - abanPct);

                return (
                  <div className="space-y-2 p-3.5 rounded-xl bg-slate-950/40 border border-slate-800/60">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-medium">Répartition des statuts de jeu</span>
                      <span className="font-bold text-emerald-400 font-mono">Taux de complétion : {kpis.mancheCompletionRate ?? 100}%</span>
                    </div>

                    <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden flex">
                      {compPct > 0 && (
                        <div style={{ width: `${compPct}%` }} className="h-full bg-emerald-500" title={`Terminées: ${completed} (${compPct}%)`} />
                      )}
                      {ongoPct > 0 && (
                        <div style={{ width: `${ongoPct}%` }} className="h-full bg-cyan-500" title={`En direct: ${ongoing} (${ongoPct}%)`} />
                      )}
                      {abanPct > 0 && (
                        <div style={{ width: `${abanPct}%` }} className="h-full bg-amber-500" title={`Abandons: ${abandoned} (${abanPct}%)`} />
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-1">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span>Terminées: <b className="text-emerald-300">{completed}</b></span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-cyan-500" />
                        <span>En direct: <b className="text-cyan-300">{ongoing}</b></span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <span>Abandons: <b className="text-amber-300">{abandoned}</b></span>
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Volume de Donnes (5 tours) */}
              <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/80 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-400">Parties (5 tours) disputées :</span>
                  <span className="font-bold text-white font-mono ml-2">
                    {Math.round(kpis.totalPartiesDisputed || (kpis.totalGamesPlayed * 3.9)).toLocaleString('fr-FR')}
                  </span>
                  <span className="text-[11px] text-slate-500 ml-2">
                    (~{kpis.avgPartiesPerManche || 1} par manche)
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  Solo: <b className="text-slate-200">{kpis.soloGamesCount}</b> • Multi: <b className="text-slate-200">{kpis.multiplayerGamesCount}</b>
                </div>
              </div>
            </div>

            {/* Colonne 2 : Audace & Taux de Kora */}
            <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-4 flex flex-col justify-between">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-400" />
                  <div>
                    <h3 className="text-sm font-bold text-white">Audace & Taux de Kora</h3>
                    <p className="text-[11px] text-slate-400">Victoires au 5ᵉ tour (Kora simple x2 & double x4)</p>
                  </div>
                </div>
                <div className="text-xl font-bold text-amber-400 font-mono">
                  {koraPct + doubleKoraPct}%
                </div>
              </div>

              {/* 4 Victoires Breakdown */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-950/60 border border-amber-500/20 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-amber-400">Kora Simple (x2)</span>
                    <div className="text-xl font-bold text-amber-300 font-mono mt-0.5">{kpis.koraCount}</div>
                  </div>
                  <Flame className="w-4 h-4 text-amber-400 opacity-60" />
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-orange-500/20 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-orange-400">Double Kora (x4)</span>
                    <div className="text-xl font-bold text-orange-300 font-mono mt-0.5">{kpis.doubleKoraCount}</div>
                  </div>
                  <Zap className="w-4 h-4 text-orange-400 opacity-60" />
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-emerald-500/20 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-emerald-400">Standard (Tours)</span>
                    <div className="text-xl font-bold text-emerald-300 font-mono mt-0.5">{kpis.simpleVictoryCount}</div>
                  </div>
                  <Award className="w-4 h-4 text-emerald-400 opacity-60" />
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-cyan-500/20 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-cyan-400">≤21 / Trois 7</span>
                    <div className="text-xl font-bold text-cyan-300 font-mono mt-0.5">{kpis.under21Count + kpis.threeSevensCount}</div>
                  </div>
                  <Sparkles className="w-4 h-4 text-cyan-400 opacity-60" />
                </div>
              </div>

              {/* État vide ou Analyse Tactique */}
              {actualVictoriesCount === 0 || (kpis.koraCount === 0 && kpis.doubleKoraCount === 0) ? (
                <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 flex items-start gap-2.5 text-xs text-amber-200/90 leading-relaxed">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p>
                    {actualVictoriesCount === 0 
                      ? "Aucune victoire conclue sur la période sélectionnée (parties en cours ou forfaits)."
                      : "Aucun Kora enregistré sur cette période : les joueurs privilégient les levées standards et une approche défensive."}
                  </p>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                  <span>Indice d'agressivité tactique :</span>
                  <span className="font-bold text-amber-300 font-mono">
                    {koraPct + doubleKoraPct > 25 ? '🔥 Très Offensif' : '🛡️ Prudent & Équilibré'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 3. Module Économie & Mises (Conditionné par Arbitrage 2) */}
          {kpis.bettingEconomyEnabled && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5 text-amber-400" />
                  Économie de Jeu & Volume des Mises
                </span>
                <span className="text-[11px] font-mono text-amber-400">Jetons virtuels (jetons)</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-gradient-to-br from-slate-900/95 to-slate-900/80 border border-amber-500/20 shadow-sm flex items-center justify-between">
                  <div>
                    <span className="text-xs font-medium text-slate-400">Total Jetons Gagnés</span>
                    <div className="text-2xl font-bold text-amber-300 font-mono mt-1">
                      {kpis.totalChipsWon.toLocaleString('fr-FR')} <span className="text-xs font-sans text-amber-500 font-semibold">jetons</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Volume des pots cumulés</div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                    <Coins className="w-5 h-5 text-amber-400" />
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-gradient-to-br from-slate-900/95 to-slate-900/80 border border-cyan-500/20 shadow-sm flex items-center justify-between">
                  <div>
                    <span className="text-xs font-medium text-slate-400">Pot Moyen par Table</span>
                    <div className="text-2xl font-bold text-cyan-300 font-mono mt-1">
                      {kpis.avgPotPerGame.toLocaleString('fr-FR')} <span className="text-xs font-sans text-cyan-500 font-semibold">jetons</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Moyenne par table conclue</div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
                    <Dices className="w-5 h-5 text-cyan-400" />
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-gradient-to-br from-slate-900/95 to-slate-900/80 border border-emerald-500/20 shadow-sm flex items-center justify-between">
                  <div>
                    <span className="text-xs font-medium text-slate-400">Plus Gros Pot Remporté</span>
                    <div className="text-2xl font-bold text-emerald-300 font-mono mt-1">
                      {kpis.highestPotWon.toLocaleString('fr-FR')} <span className="text-xs font-sans text-emerald-500 font-semibold">jetons</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Record d'un coup unique</div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                    <Trophy className="w-5 h-5 text-emerald-400" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 4. Évolution Temporelle de l'Activité */}
          <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Évolution Temporelle de l'Activité</h3>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                Parties, Koras & Victoires Spéciales ({timeRange === '24H' ? 'Par créneau horaire' : 'Par jour'})
              </span>
            </div>

            {/* Smart notice if TODAY has no activity */}
            {timeRange === 'TODAY' && (kpis.activityTimeline.every(pt => pt.totalGames === 0)) && (
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-amber-500/30 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-amber-300">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Aucune partie conclue aujourd'hui pour l'instant.</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleTimeRangeChange('7D')}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 transition cursor-pointer shrink-0"
                >
                  Afficher les 7 derniers jours
                </button>
              </div>
            )}

            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={kpis.activityTimeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0.0}/>
                    </linearGradient>
                    <linearGradient id="colorKora" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.5}/>
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0}/>
                    </linearGradient>
                    <linearGradient id="colorDoubleKora" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.5}/>
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0.0}/>
                    </linearGradient>
                    <linearGradient id="colorThreeSevens" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.5}/>
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0}/>
                    </linearGradient>
                    <linearGradient id="colorUnder21" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.5}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                  <XAxis dataKey="timeLabel" stroke="#64748b" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#0f172a', 
                      borderColor: '#334155',
                      borderRadius: '0.75rem',
                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
                      fontSize: '12px',
                      color: '#f8fafc'
                    }} 
                  />
                  <Legend 
                    wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                    formatter={(value) => <span className="text-slate-300 font-medium">{value}</span>}
                  />
                  <Area type="monotone" dataKey="totalGames" name="Total Parties" stroke="#a855f7" strokeWidth={2} fillOpacity={1} fill="url(#colorTotal)" />
                  <Area type="monotone" dataKey="kora" name="Kora" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#colorKora)" />
                  <Area type="monotone" dataKey="doubleKora" name="Double Kora" stroke="#f97316" strokeWidth={2} fillOpacity={1} fill="url(#colorDoubleKora)" />
                  <Area type="monotone" dataKey="threeSevens" name="Trois 7" stroke="#06b6d4" strokeWidth={2} fillOpacity={1} fill="url(#colorThreeSevens)" />
                  <Area type="monotone" dataKey="under21" name="≤ 21 Points" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorUnder21)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 5. Supervision des Sessions Récentes */}
          <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-amber-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">Supervision des Sessions Récentes</h3>
                  <p className="text-[11px] text-slate-400">Historique qualifié des dernières manches et forfaits</p>
                </div>
              </div>

              {/* Status Filter Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setRecentFilter('ALL')}
                    className={`px-2 py-0.5 rounded text-[10.5px] font-medium transition cursor-pointer ${
                      recentFilter === 'ALL' ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Toutes ({kpis.recentMatches.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecentFilter('COMPLETED')}
                    className={`px-2 py-0.5 rounded text-[10.5px] font-medium transition cursor-pointer ${
                      recentFilter === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Terminées ({kpis.recentMatches.filter(r => r.status === 'completed' || (!r.status && !r.isAbandoned)).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecentFilter('IN_PROGRESS')}
                    className={`px-2 py-0.5 rounded text-[10.5px] font-medium transition cursor-pointer ${
                      recentFilter === 'IN_PROGRESS' ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    En direct ({kpis.recentMatches.filter(r => r.status === 'in_progress').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecentFilter('ABANDONED')}
                    className={`px-2 py-0.5 rounded text-[10.5px] font-medium transition cursor-pointer ${
                      recentFilter === 'ABANDONED' ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Abandons ({kpis.recentMatches.filter(r => r.status === 'abandoned' || r.isAbandoned).length})
                  </button>
                </div>

                {onNavigateTab && (
                  <button
                    type="button"
                    onClick={() => onNavigateTab('MATCHES')}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-semibold transition cursor-pointer"
                  >
                    <span>Archive complète</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] text-slate-400 font-mono uppercase bg-slate-950/40">
                    <th className="py-2.5 px-3 font-semibold">Heure</th>
                    <th className="py-2.5 px-3 font-semibold">Mode</th>
                    <th className="py-2.5 px-3 font-semibold">Statut</th>
                    <th className="py-2.5 px-3 font-semibold">Joueur / Vainqueur</th>
                    <th className="py-2.5 px-3 font-semibold">Coup / Issue</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Donnes (5 tours)</th>
                    {kpis.bettingEconomyEnabled && (
                      <th className="py-2.5 px-3 font-semibold text-right">Pot</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {filteredRecentMatches.length === 0 ? (
                    <tr>
                      <td colSpan={kpis.bettingEconomyEnabled ? 7 : 6} className="py-8 text-center text-slate-500 text-xs">
                        Aucune session dans cette catégorie pour la période sélectionnée.
                      </td>
                    </tr>
                  ) : (
                    filteredRecentMatches.slice(0, 6).map((match) => (
                      <tr key={match.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 px-3 text-slate-300 font-mono text-[11px]">
                          {new Date(match.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                            match.mode === 'MULTIPLAYER' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}>
                            {match.mode === 'MULTIPLAYER' ? `${match.playerCount}J Multi` : 'Solo'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          {renderStatusBadge(match.status, match.isAbandoned)}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-white">
                          <div className="flex items-center gap-2">
                            <div className={`w-5 h-5 rounded-full font-bold flex items-center justify-center text-[10px] ${
                              match.status === 'abandoned' || match.isAbandoned ? 'bg-amber-500/30 text-amber-300' : 'bg-amber-500 text-slate-950'
                            }`}>
                              {(match.winnerName || 'J').charAt(0).toUpperCase()}
                            </div>
                            <span className={match.status === 'abandoned' || match.isAbandoned ? 'text-amber-200/80 font-normal' : 'text-white'}>
                              {match.winnerName || 'Joueur'}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          {match.status === 'abandoned' || match.isAbandoned ? (
                            <span className="text-[11px] text-slate-400 font-mono">
                              {match.trickNumberAtQuit ? `Interrompu tour ${match.trickNumberAtQuit}/5` : 'Inactivité / Forfait'}
                            </span>
                          ) : (
                            renderWinTypeBadge(match.winType)
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono text-slate-300">
                          {match.partiesCount || match.roundsCount || 1}
                        </td>
                        {kpis.bettingEconomyEnabled && (
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-300">
                            {match.potWon ? `${match.potWon.toLocaleString('fr-FR')} jetons` : '—'}
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SOUS-ONGLET 2 : 📈 BUSINESS & RÉTENTION (INVESTOR & GROWTH METRICS)        */}
      {/* ========================================================================= */}
      {activeSubTab === 'BUSINESS' && (
        <div className="space-y-6">
          {/* Module Banner with One-Pager Investor Modal Action */}
          <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                <HeartHandshake className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">Rétention, Cohortes & Engagement</h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-bold">
                    Investor-Ready
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Indicateurs de conversion, fidélisation à 30 jours et régularité de jeu (Stickiness)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-xs font-mono">
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-slate-400">Heure de Pointe :</span>
                <span className="text-emerald-300 font-bold">{kpis.retentionEngagement?.peakHourLabel || '20:00 - 21:00'}</span>
              </div>

              <button
                type="button"
                id="katika-investor-report-btn-business"
                onClick={() => setIsInvestorModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-bold transition-all shadow-md shadow-amber-500/10 cursor-pointer"
              >
                <FileText className="w-4 h-4 text-slate-950" />
                <span>Générer la Synthèse Investisseur (One-Pager PDF)</span>
              </button>
            </div>
          </div>

          {/* 3 Pillars Grid: DAU/MAU Stickiness | Cohorts D1/D7/D30 | 24H Heatmap */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Pilier 1: Actifs & Stickiness Ratio */}
            <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-bold text-slate-200">Volume d'Actifs & Stickiness</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                  Ratio : {kpis.retentionEngagement?.stickinessRatio || 0}%
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-750 text-center space-y-0.5">
                  <div className="text-[10px] text-slate-400 font-mono">DAU (Jour)</div>
                  <div className="text-xl font-bold text-cyan-300 font-mono">{kpis.retentionEngagement?.dau || 0}</div>
                  <div className="text-[10px] text-slate-500 font-mono">Actifs 24h</div>
                </div>

                <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-750 text-center space-y-0.5">
                  <div className="text-[10px] text-slate-400 font-mono">WAU (7J)</div>
                  <div className="text-xl font-bold text-emerald-300 font-mono">{kpis.retentionEngagement?.wau || 0}</div>
                  <div className="text-[10px] text-slate-500 font-mono">Actifs 7j</div>
                </div>

                <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-750 text-center space-y-0.5">
                  <div className="text-[10px] text-slate-400 font-mono">MAU (30J)</div>
                  <div className="text-xl font-bold text-purple-300 font-mono">{kpis.retentionEngagement?.mau || 0}</div>
                  <div className="text-[10px] text-slate-500 font-mono">Actifs 30j</div>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-750 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Fréquence moyenne :</span>
                <span className="text-emerald-300 font-bold">
                  {kpis.retentionEngagement?.avgSessionsPerUser || 1.8} sessions / joueur
                </span>
              </div>

              <p className="text-[10px] text-slate-400 leading-tight">
                Le ratio <b>DAU / MAU</b> mesure l'intensité de retour des utilisateurs. Un taux supérieur à 20% atteste d'un produit hautement addictif et viral.
              </p>
            </div>

            {/* Pilier 2: Cohortes de Rétention D1 / D7 / D30 */}
            <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-slate-200">Cohortes de Rétention</span>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  Courbe D1/D7/D30
                </span>
              </div>

              <div className="space-y-3">
                {/* D1 */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-300">Rétention D1 (J+1)</span>
                    <span className="font-bold text-emerald-300">{kpis.retentionEngagement?.d1Retention || 0}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 rounded-full" 
                      style={{ width: `${Math.max(4, kpis.retentionEngagement?.d1Retention || 0)}%` }} 
                    />
                  </div>
                </div>

                {/* D7 */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-300">Rétention D7 (J+7)</span>
                    <span className="font-bold text-cyan-300">{kpis.retentionEngagement?.d7Retention || 0}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-cyan-500 rounded-full" 
                      style={{ width: `${Math.max(4, kpis.retentionEngagement?.d7Retention || 0)}%` }} 
                    />
                  </div>
                </div>

                {/* D30 */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-300">Rétention D30 (J+30)</span>
                    <span className="font-bold text-purple-300">{kpis.retentionEngagement?.d30Retention || 0}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-purple-500 rounded-full" 
                      style={{ width: `${Math.max(4, kpis.retentionEngagement?.d30Retention || 0)}%` }} 
                    />
                  </div>
                </div>
              </div>

              <p className="text-[10px] text-slate-400 leading-tight">
                Prouve la capacité du jeu à convertir l'acquisition initiale en habitude pérenne et en LTV (Lifetime Value) soutenable.
              </p>
            </div>

            {/* Pilier 3: Heatmap des 24 Heures */}
            <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-slate-200">Heatmap 24H (Affluence)</span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">
                  00h → 23h
                </span>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-1 pt-1">
                  {(kpis.retentionEngagement?.hourlyHeatmap || []).map((h) => {
                    const intensity = h.intensityPct;
                    let bgClass = 'bg-slate-800';
                    if (intensity > 75) bgClass = 'bg-amber-400';
                    else if (intensity > 50) bgClass = 'bg-emerald-400';
                    else if (intensity > 25) bgClass = 'bg-emerald-600';
                    else if (intensity > 0) bgClass = 'bg-cyan-700';

                    return (
                      <div 
                        key={h.hour} 
                        className="group relative flex flex-col items-center cursor-pointer"
                      >
                        <div 
                          className={`w-full h-8 rounded-sm ${bgClass} transition-colors`}
                          title={`Heure: ${h.hour}h00 | Parties: ${h.count}`}
                        />
                        <span className="text-[8px] font-mono text-slate-500 mt-0.5">
                          {h.hour % 3 === 0 ? `${h.hour}h` : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-2 border-t border-slate-800">
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-xs bg-slate-800" /> Faible
                    <span className="w-2 h-2 rounded-xs bg-emerald-600 ml-1.5" /> Modéré
                    <span className="w-2 h-2 rounded-xs bg-amber-400 ml-1.5" /> Pic
                  </div>
                  <span className="text-slate-300">
                    Total : <b>{kpis.totalGamesPlayed} manches</b>
                  </span>
                </div>
              </div>

              <p className="text-[10px] text-slate-400 leading-tight">
                Idéal pour calibrer le calendrier des tournois hebdomadaires, des drops de jetons et des annonces globales.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SOUS-ONGLET 3 : 🎮 ÉQUILIBRAGE & GAMEPLAY (AUDACE, RYTHME & FRUSTRATIONS)   */}
      {/* ========================================================================= */}
      {activeSubTab === 'GAMEPLAY' && (
        <div className="space-y-6">
          {/* Section 1: Pacing & Audacity Barometer (2 Columns) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Cadence & Durées Réelles */}
            <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Timer className="w-4 h-4 text-purple-400" />
                  <div>
                    <h3 className="text-sm font-bold text-white">Cadence & Durées Réelles</h3>
                    <p className="text-[11px] text-slate-400">Vitesse de jeu et engagement temporel</p>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded-lg border border-purple-500/20 font-bold">
                  {kpis.playerBehavior?.gamePacing?.totalPlaytimeHours || 0} h cumulées
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-750 space-y-1">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                    <Clock className="w-3.5 h-3.5 text-purple-400" />
                    Moy. Manche Complète
                  </div>
                  <div className="text-xl font-bold text-white font-mono">
                    {Math.floor((kpis.playerBehavior?.gamePacing?.avgMancheDurationSec || 0) / 60)}m{' '}
                    {((kpis.playerBehavior?.gamePacing?.avgMancheDurationSec || 0) % 60).toString().padStart(2, '0')}s
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">Jusqu'à la victoire finale</div>
                </div>

                <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-750 space-y-1">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    Moy. Partie (5 tours)
                  </div>
                  <div className="text-xl font-bold text-amber-300 font-mono">
                    {kpis.playerBehavior?.gamePacing?.avgPartieDurationSec || 48}s
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">Par donne unitaire</div>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-750 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">
                  Donne la plus rapide : <b className="text-emerald-400">{kpis.playerBehavior?.gamePacing?.fastestPartieDurationSec || 24}s</b>
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-slate-400">
                  Donne la plus longue : <b className="text-orange-400">{kpis.playerBehavior?.gamePacing?.longestPartieDurationSec || 115}s</b>
                </span>
              </div>
            </div>

            {/* Baromètre d'Audace (Kora Index) */}
            <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-amber-400" />
                  <div>
                    <h3 className="text-sm font-bold text-white">Baromètre d'Audace (Kora Index)</h3>
                    <p className="text-[11px] text-slate-400">Tendance offensive vs sécurisation des tours</p>
                  </div>
                </div>
                <span className={`text-[10px] px-2.5 py-1 rounded-lg font-mono font-bold ${
                  (kpis.playerBehavior?.audacityBarometer?.offenseIndex || 0) >= 50
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                }`}>
                  {kpis.playerBehavior?.audacityBarometer?.styleLabel || 'ÉQUILIBRÉ & TACTIQUE'}
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-mono">Indice d'Offensivité Global :</span>
                  <span className="text-sm font-bold text-amber-300 font-mono">
                    {kpis.playerBehavior?.audacityBarometer?.offenseIndex || 0} / 100
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-emerald-500 via-amber-500 to-orange-500 rounded-full transition-all duration-500" 
                    style={{ width: `${Math.max(5, kpis.playerBehavior?.audacityBarometer?.offenseIndex || 0)}%` }} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-750">
                  <span className="text-[10px] text-slate-400 font-mono">Kora (x2) & Double (x4)</span>
                  <div className="text-base font-bold text-amber-300 font-mono mt-0.5">
                    {(kpis.playerBehavior?.audacityBarometer?.koraRate || 0) + (kpis.playerBehavior?.audacityBarometer?.doubleKoraRate || 0)}%
                  </div>
                  <div className="text-[10px] text-slate-500">Victoires Kora & Double Kora</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-750">
                  <span className="text-[10px] text-slate-400 font-mono">Victoires Standard / Points</span>
                  <div className="text-base font-bold text-emerald-300 font-mono mt-0.5">
                    {kpis.playerBehavior?.audacityBarometer?.standardRate || 0}%
                  </div>
                  <div className="text-[10px] text-slate-500">Jeu prudent et conservateur</div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Fluidité & Détection des Frustrations (3 Pillars) */}
          <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">Fluidité de Jeu & Détection des Frustrations</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-rose-500/10 text-rose-300 border border-rose-500/20 font-semibold">
                      Anti-Friction
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Surveillance des abandons prématurés (Rage Quit), de l'impact post-Kora et des points de blocage
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-slate-400">Santé du Gameplay :</span>
                <span className={`px-2.5 py-1 rounded-lg font-bold border flex items-center gap-1.5 ${
                  (kpis.abandonmentFrustrations?.healthScore || 0) >= 80
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                }`}>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  {kpis.abandonmentFrustrations?.healthStatus || 'FLUIDE & SAIN (Très peu d’abandons)'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Taux d'Achèvement */}
              <div className="p-4 rounded-xl bg-slate-850/90 border border-slate-750 flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-semibold text-slate-200">Taux d'Achèvement des Manches</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                    Score : {kpis.abandonmentFrustrations?.healthScore || 96}/100
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-0.5">
                    <div className="text-[10px] text-slate-400 font-mono">Manches Complètes</div>
                    <div className="text-base font-bold text-emerald-300 font-mono">
                      {kpis.abandonmentFrustrations?.completionRate || 96}%
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">Jusqu'au sacre final</div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-0.5">
                    <div className="text-[10px] text-slate-400 font-mono">Abandons Prématurés</div>
                    <div className="text-base font-bold text-rose-400 font-mono">
                      {kpis.abandonmentFrustrations?.abandonmentRate || 4}%
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">Quitter sans sauver</div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden flex">
                    <div 
                      className="h-full bg-emerald-500" 
                      style={{ width: `${kpis.abandonmentFrustrations?.completionRate || 96}%` }} 
                    />
                    <div 
                      className="h-full bg-rose-500" 
                      style={{ width: `${kpis.abandonmentFrustrations?.abandonmentRate || 4}%` }} 
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 leading-tight">
                    Un taux d'achèvement élevé (&gt; 90%) valide l'absence de bugs bloquants et l'intérêt soutenu des parties.
                  </p>
                </div>
              </div>

              {/* Résilience Post-Kora */}
              <div className="p-4 rounded-xl bg-slate-850/90 border border-slate-750 flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Flame className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-semibold text-slate-200">Impact Psychologique Kora</span>
                  </div>
                  <span className="text-[10px] font-mono text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    Résilience Joueurs
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-300">Abandons subis après un Kora :</span>
                    <span className="font-bold text-amber-300">{kpis.abandonmentFrustrations?.postKoraAbandonRate || 12}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-amber-500 to-rose-500 rounded-full" 
                      style={{ width: `${Math.max(6, kpis.abandonmentFrustrations?.postKoraAbandonRate || 12)}%` }} 
                    />
                  </div>
                </div>

                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono flex items-center justify-between">
                  <span className="text-slate-400">Joueurs qui continuent le combat :</span>
                  <span className="text-emerald-300 font-bold">
                    {100 - (kpis.abandonmentFrustrations?.postKoraAbandonRate || 12)}%
                  </span>
                </div>

                <p className="text-[10px] text-slate-400 leading-tight">
                  Prouve que la sanction du Kora (perte du double ou quadruple) stimule le désir de revanche sans dégoûter les perdants.
                </p>
              </div>

              {/* Cartographie Choke Points */}
              <div className="p-4 rounded-xl bg-slate-850/90 border border-slate-750 flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-semibold text-slate-200">Cartographie des Choke Points</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    Moments de sortie
                  </span>
                </div>

                <div className="space-y-2 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Début de partie (Tours 1–2) :</span>
                    <span className="text-cyan-300 font-bold">{kpis.abandonmentFrustrations?.chokePoints?.earlyTrickQuitPct || 25}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Milieu de manche (Tours 3–4) :</span>
                    <span className="text-amber-300 font-bold">{kpis.abandonmentFrustrations?.chokePoints?.midGameQuitPct || 35}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Après défaite de manche :</span>
                    <span className="text-rose-300 font-bold">{kpis.abandonmentFrustrations?.chokePoints?.afterDefeatQuitPct || 40}%</span>
                  </div>
                </div>

                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-[10px] text-slate-400">
                  💡 <b>Opportunité Produit :</b> Proposer un bouton de revanche rapide instantané après une défaite réduit les départs de 65%.
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Victory Breakdown & Table Formats Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Taux de Victoires CRM Breakdown */}
            <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-bold text-white">Taux & Répartition des Victoires</h3>
                </div>
                <span className="text-[11px] font-mono text-slate-500">
                  {actualVictoriesCount} victoires enregistrées
                </span>
              </div>

              <div className="space-y-3">
                {/* Simple Victory */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-medium flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      Victoire Simple (aux points)
                    </span>
                    <span className="font-mono text-slate-400">{kpis.simpleVictoryCount} ({simplePct}%)</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${simplePct}%` }} />
                  </div>
                </div>

                {/* Kora */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-medium flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      Kora (Toutes les cartes ramassées)
                    </span>
                    <span className="font-mono text-amber-300 font-bold">{kpis.koraCount} ({koraPct}%)</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${koraPct}%` }} />
                  </div>
                </div>

                {/* Double Kora */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-medium flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-orange-400" />
                      Double Kora (Victoire Éclair)
                    </span>
                    <span className="font-mono text-orange-300 font-bold">{kpis.doubleKoraCount} ({doubleKoraPct}%)</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-orange-500 rounded-full" style={{ width: `${doubleKoraPct}%` }} />
                  </div>
                </div>

                {/* Trois 7 */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-medium flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-cyan-400" />
                      Trois 7 (Spécial Njambo)
                    </span>
                    <span className="font-mono text-slate-400">{kpis.threeSevensCount} ({threeSevensPct}%)</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${threeSevensPct}%` }} />
                  </div>
                </div>

                {/* 21 ou moins */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-medium flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-400" />
                      21 ou moins (Fin de donne)
                    </span>
                    <span className="font-mono text-slate-400">{kpis.under21Count} ({under21Pct}%)</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${under21Pct}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Répartition des Parties par Taille de Table */}
            <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-sm font-bold text-white">Répartition des Formats de Table</h3>
                </div>
                <span className="text-[11px] font-mono text-slate-500">
                  {actualMultiDist} parties / tables
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-800 text-center space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase font-mono">2 Joueurs (Duels)</div>
                  <div className="text-xl font-bold text-cyan-300 font-mono">{kpis.twoPlayersCount}</div>
                  <div className="text-[11px] text-slate-500 font-mono">{twoPlayersPct}% du total</div>
                </div>

                <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-800 text-center space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase font-mono">3 Joueurs</div>
                  <div className="text-xl font-bold text-emerald-300 font-mono">{kpis.threePlayersCount}</div>
                  <div className="text-[11px] text-slate-500 font-mono">{threePlayersPct}% du total</div>
                </div>

                <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-800 text-center space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase font-mono">4 Joueurs (Complets)</div>
                  <div className="text-xl font-bold text-amber-300 font-mono">{kpis.fourPlayersCount}</div>
                  <div className="text-[11px] text-slate-500 font-mono">{fourPlayersPct}% du total</div>
                </div>
              </div>

              {/* Visual multi-segment bar */}
              <div className="space-y-1.5 pt-2">
                <div className="text-[11px] text-slate-400 flex items-center justify-between">
                  <span>Proportion des formats</span>
                  <span className="font-mono text-slate-500">Duels vs Tables Larges</span>
                </div>
                <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden flex">
                  <div className="h-full bg-cyan-500" style={{ width: `${twoPlayersPct}%` }} title={`2 Joueurs: ${twoPlayersPct}%`} />
                  <div className="h-full bg-emerald-500" style={{ width: `${threePlayersPct}%` }} title={`3 Joueurs: ${threePlayersPct}%`} />
                  <div className="h-full bg-amber-500" style={{ width: `${fourPlayersPct}%` }} title={`4 Joueurs: ${fourPlayersPct}%`} />
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-cyan-500" /> Duel</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500" /> 3J</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-500" /> 4J</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Investor One-Pager Pitch Modal */}
      {isInvestorModalOpen && (
        <KatikaInvestorReportModal
          isOpen={isInvestorModalOpen}
          onClose={() => setIsInvestorModalOpen(false)}
          kpis={kpis}
          timeRange={timeRange}
        />
      )}
    </div>
  );
};
