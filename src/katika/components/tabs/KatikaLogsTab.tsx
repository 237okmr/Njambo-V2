import React, { useState, useEffect, useMemo } from 'react';
import { useIsCompactScreen } from '../../hooks/useIsCompactScreen';
import { 
  ScrollText, 
  Search, 
  RotateCw, 
  Download, 
  AlertCircle, 
  AlertTriangle, 
  Info, 
  ShieldCheck, 
  Sliders, 
  UserX, 
  Clock, 
  Code,
  X,
  FileSpreadsheet,
  Coins,
  Ban,
  Radio,
  ChevronDown
} from 'lucide-react';
import { KatikaAuditLog } from '../../types/katika';
import { KatikaService, getAuditLogsNotice } from '../../services/katikaService';
import { KATIKA_NAVIGATE_EVENT, KatikaNavigationEventDetail } from '../../utils/katikaNavigation';
import { KatikaConnectionHealthPanel } from './KatikaConnectionHealthPanel';
import { KatikaCrashesPanel } from './KatikaCrashesPanel';
import { KatikaSheet, SHEET_BTN_SECONDARY } from '../KatikaSheet';
import { KatikaBootStatsPanel } from './KatikaBootStatsPanel';
import { KatikaInviteStatsPanel } from './KatikaInviteStatsPanel';
import { KatikaAuthStatsPanel } from './KatikaAuthStatsPanel';

const SeverityBadge: React.FC<{ severity: KatikaAuditLog['severity'] }> = ({ severity }) => {
  if (severity === 'CRITICAL') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 text-[10px] font-bold">
        <Ban className="w-3 h-3" />
        Sanction
      </span>
    );
  }
  if (severity === 'WARNING') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px] font-medium">
        <AlertTriangle className="w-3 h-3 text-amber-400" />
        Avertissement
      </span>
    );
  }
  if (severity === 'INFO') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px]">
        <Info className="w-3 h-3" />
        Info
      </span>
    );
  }
  return null;
};

const CategoryLabel: React.FC<{ type: KatikaAuditLog['type'] }> = ({ type }) => {
  if (type === 'KATIKA_ACTION') {
    return (
      <span className="text-amber-400 flex items-center gap-1">
        <UserX className="w-3 h-3" /> Modération
      </span>
    );
  }
  if (type === 'CONFIG_CHANGE') {
    return (
      <span className="text-purple-400 flex items-center gap-1">
        <Sliders className="w-3 h-3" /> Paramètres
      </span>
    );
  }
  if (type === 'AUTH') {
    return (
      <span className="text-emerald-400 flex items-center gap-1">
        <ShieldCheck className="w-3 h-3" /> Connexion
      </span>
    );
  }
  if (type === 'SERVER_ERROR') {
    return (
      <span className="text-red-400 flex items-center gap-1">
        <AlertCircle className="w-3 h-3" /> Système
      </span>
    );
  }
  return null;
};

export const KatikaLogsTab: React.FC = () => {
  const isCompact = useIsCompactScreen();
  // Sur téléphone et tablette, les cinq panneaux techniques sont repliés : le journal reste en haut de page.
  const [statsOpen, setStatsOpen] = useState<boolean>(false);
  const [logs, setLogs] = useState<KatikaAuditLog[]>([]);
  const [logsNotice, setLogsNotice] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'CRITICAL' | 'WARNING' | 'INFO'>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [selectedLogForDetails, setSelectedLogForDetails] = useState<KatikaAuditLog | null>(null);

  useEffect(() => {
    const handleNav = (e: Event) => {
      const customEvent = e as CustomEvent<KatikaNavigationEventDetail>;
      if (customEvent.detail?.tab === 'LOGS' && customEvent.detail.query !== undefined) {
        setSearchQuery(customEvent.detail.query);
        setSeverityFilter('ALL');
        setTypeFilter('ALL');
      }
    };
    window.addEventListener(KATIKA_NAVIGATE_EVENT, handleNav);
    return () => window.removeEventListener(KATIKA_NAVIGATE_EVENT, handleNav);
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await KatikaService.getAuditLogs();
      setLogs(data);
      setLogsNotice(getAuditLogsNotice());
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesSearch = 
        log.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.actor.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.id.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesSeverity = severityFilter === 'ALL' || log.severity === severityFilter;
      const matchesType = typeFilter === 'ALL' || log.type === typeFilter;

      return matchesSearch && matchesSeverity && matchesType;
    });
  }, [logs, searchQuery, severityFilter, typeFilter]);

  // Export as CSV (Excel compatible)
  const handleExportCSV = () => {
    const headers = ['ID', 'Date_Heure', 'Severite', 'Type', 'Acteur', 'Resume'];
    const rows = filteredLogs.map((l) => [
      `"${l.id}"`,
      `"${new Date(l.timestamp).toISOString()}"`,
      `"${l.severity}"`,
      `"${l.type}"`,
      `"${l.actor.replace(/"/g, '""')}"`,
      `"${l.summary.replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `katika_audit_log_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // Export as JSON
  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(filteredLogs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `katika_audit_log_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-6">
      {isCompact && (
        <button
          type="button"
          onClick={() => setStatsOpen((v) => !v)}
          aria-expanded={statsOpen}
          className="w-full min-h-12 flex items-center justify-between gap-3 px-4 rounded-xl bg-slate-900/90 border border-slate-800 text-sm font-semibold text-slate-200 cursor-pointer"
        >
          <span>Santé et statistiques techniques</span>
          <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${statsOpen ? 'rotate-180' : ''}`} />
        </button>
      )}
      {(!isCompact || statsOpen) && (
        <>
          <KatikaConnectionHealthPanel />
          <KatikaBootStatsPanel />
          <KatikaInviteStatsPanel />
          <KatikaAuthStatsPanel />
          <KatikaCrashesPanel />
        </>
      )}

      {/* Search, Filter & Export Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-4 rounded-xl bg-slate-900/90 border border-slate-800">
        <div className="flex items-center gap-2 flex-1 md:max-w-md bg-slate-800/90 px-3 py-2 rounded-lg border border-slate-700/60">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            id="katika-search-logs-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par action, joueur, modérateur..."
            className="bg-transparent border-none outline-none text-base sm:text-xs text-white placeholder-slate-500 w-full min-h-8"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} aria-label="Effacer la recherche" className="shrink-0 w-9 h-9 -mr-2 flex items-center justify-center text-slate-400 hover:text-slate-200">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Severity Filter : défile à l'horizontale sur téléphone */}
          <div className="flex items-center bg-slate-800/90 p-1 rounded-lg border border-slate-700/60 text-xs w-full sm:w-auto overflow-x-auto">
            {(['ALL', 'CRITICAL', 'WARNING', 'INFO'] as const).map((sev) => (
              <button
                key={sev}
                type="button"
                onClick={() => setSeverityFilter(sev)}
                className={`shrink-0 min-h-10 sm:min-h-0 px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  severityFilter === sev
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {sev === 'ALL' && 'Tous'}
                {sev === 'CRITICAL' && 'Critiques (Bans)'}
                {sev === 'WARNING' && 'Avertissements'}
                {sev === 'INFO' && 'Infos'}
              </button>
            ))}
          </div>

          {/* Type Filter Select */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full sm:w-auto min-h-11 sm:min-h-0 bg-slate-800/90 border border-slate-700/60 text-slate-300 text-base sm:text-xs rounded-lg px-2.5 py-1.5 outline-none cursor-pointer"
          >
            <option value="ALL">Toutes les actions</option>
            <option value="KATIKA_ACTION">Modération & Joueurs</option>
            <option value="CONFIG_CHANGE">Paramètres & Règles</option>
            <option value="AUTH">Connexions & Sessions</option>
            <option value="SERVER_ERROR">Erreurs Serveur</option>
          </select>

          {/* Export CSV (Excel) */}
          <button
            type="button"
            onClick={handleExportCSV}
            className="flex-1 sm:flex-none justify-center min-h-11 sm:min-h-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/50 hover:bg-emerald-900/70 text-emerald-300 text-xs font-semibold border border-emerald-800/60 cursor-pointer shadow-sm"
            title="Télécharger l'historique en fichier CSV pour Excel"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Excel / CSV</span>
          </button>

          {/* Export JSON Button */}
          <button
            type="button"
            onClick={handleExportJSON}
            className="flex-1 sm:flex-none justify-center min-h-11 sm:min-h-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 cursor-pointer"
            title="Exporter les données brutes en JSON"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>JSON</span>
          </button>

          {/* Refresh */}
          <button
            type="button"
            onClick={fetchLogs}
            disabled={loading}
            aria-label="Actualiser le journal"
            className="shrink-0 min-w-11 min-h-11 sm:min-w-0 sm:min-h-0 justify-center flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 cursor-pointer"
            title="Actualiser le journal"
          >
            <RotateCw className={`w-3.5 h-3.5 text-amber-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {logsNotice && (
        <div role="status" className="rounded-xl border border-amber-500/40 bg-amber-950/30 text-amber-200 p-3 text-xs">
          {logsNotice}
        </div>
      )}

      {/* Téléphone et tablette : une carte par action (gravité + heure, description, acteur et catégorie) ; toucher pour le détail */}
      <ul className="lg:hidden flex flex-col gap-2.5">
        {filteredLogs.length === 0 ? (
          <li className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 text-sm text-slate-500 text-center">
            Aucune action consignée ne correspond aux filtres.
          </li>
        ) : (
          filteredLogs.map((log) => {
            const cardBody = (
              <>
                <span className="flex items-center justify-between gap-2">
                  <SeverityBadge severity={log.severity} />
                  <span className="text-[11px] font-mono text-slate-400 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </span>
                <span className="block mt-2 text-sm text-slate-100 line-clamp-3 break-words">{log.summary}</span>
                <span className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                  <span className="min-w-0 truncate text-slate-400">{log.actor}</span>
                  <span className="shrink-0 font-mono"><CategoryLabel type={log.type} /></span>
                </span>
              </>
            );
            return (
              <li key={log.id}>
                {log.details ? (
                  <button
                    type="button"
                    onClick={() => setSelectedLogForDetails(log)}
                    aria-label="Voir le détail de l'action"
                    className="w-full text-left block rounded-xl border border-slate-800 bg-slate-900/90 p-3.5 min-h-[64px] cursor-pointer active:bg-slate-800/60"
                  >
                    {cardBody}
                  </button>
                ) : (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3.5 min-h-[64px]">{cardBody}</div>
                )}
              </li>
            );
          })
        )}
      </ul>

      {/* Audit Logs Table : écrans larges */}
      <div className="hidden lg:block rounded-xl bg-slate-900/90 border border-slate-800 overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-800/80 border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Horodatage</th>
                <th className="py-3 px-4">Niveau</th>
                <th className="py-3 px-4">Catégorie</th>
                <th className="py-3 px-4">Auteur / Acteur</th>
                <th className="py-3 px-4">Description de l'Action Réalisée</th>
                <th className="py-3 px-4 text-right">Détails</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 font-mono">
                    Aucune action consignée ne correspond aux filtres.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 text-slate-400 text-[11px] whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString([], {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </td>

                    <td className="py-3 px-4">
                      <SeverityBadge severity={log.severity} />
                    </td>

                    <td className="py-3 px-4 text-slate-300 text-[11px]">
                      <CategoryLabel type={log.type} />
                    </td>

                    <td className="py-3 px-4 text-slate-200 font-sans text-xs">
                      {log.actor}
                    </td>

                    <td className="py-3 px-4 text-slate-200 font-sans text-xs max-w-md truncate">
                      {log.summary}
                    </td>

                    <td className="py-3 px-4 text-right">
                      {log.details ? (
                        <button
                          type="button"
                          onClick={() => setSelectedLogForDetails(log)}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono border border-slate-700 transition-colors"
                        >
                          <Code className="w-3 h-3 inline-block mr-1 text-cyan-400" />
                          Détails
                        </button>
                      ) : (
                        <span className="text-slate-600 text-[10px]">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Détail d'une action du Journal : lecture seule, un toucher sur le fond ferme le volet */}
      {selectedLogForDetails && (
        <KatikaSheet
          title={
            <>
              <Code className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Détails inaltérables de l'action</span>
            </>
          }
          maxWidth="lg"
          dismissOnBackdrop
          onClose={() => setSelectedLogForDetails(null)}
          footer={
            <button type="button" onClick={() => setSelectedLogForDetails(null)} className={SHEET_BTN_SECONDARY}>
              Fermer
            </button>
          }
        >
          <div className="space-y-3 text-sm">
            <div className="text-slate-400">
              Événement : <b className="text-white">{selectedLogForDetails.summary}</b>
            </div>
            <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 overflow-x-auto text-xs font-mono text-amber-300">
              <pre>{JSON.stringify(selectedLogForDetails.details, null, 2)}</pre>
            </div>
          </div>
        </KatikaSheet>
      )}
    </div>
  );
};
