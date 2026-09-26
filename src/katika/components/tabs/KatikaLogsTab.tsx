import React, { useState, useEffect, useMemo } from 'react';
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
  Radio
} from 'lucide-react';
import { KatikaAuditLog } from '../../types/katika';
import { KatikaService } from '../../services/katikaService';
import { KATIKA_NAVIGATE_EVENT, KatikaNavigationEventDetail } from '../../utils/katikaNavigation';
import { KatikaConnectionHealthPanel } from './KatikaConnectionHealthPanel';

export const KatikaLogsTab: React.FC = () => {
  const [logs, setLogs] = useState<KatikaAuditLog[]>([]);
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
      <KatikaConnectionHealthPanel />

      {/* Search, Filter & Export Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-4 rounded-xl bg-slate-900/90 border border-slate-800">
        <div className="flex items-center gap-2 flex-1 max-w-md bg-slate-800/90 px-3 py-2 rounded-lg border border-slate-700/60">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            id="katika-search-logs-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par action, joueur, modérateur..."
            className="bg-transparent border-none outline-none text-xs text-white placeholder-slate-500 w-full"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-200">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Severity Filter */}
          <div className="flex items-center bg-slate-800/90 p-1 rounded-lg border border-slate-700/60 text-xs">
            {(['ALL', 'CRITICAL', 'WARNING', 'INFO'] as const).map((sev) => (
              <button
                key={sev}
                type="button"
                onClick={() => setSeverityFilter(sev)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
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
            className="bg-slate-800/90 border border-slate-700/60 text-slate-300 text-xs rounded-lg px-2.5 py-1.5 outline-none cursor-pointer"
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/50 hover:bg-emerald-900/70 text-emerald-300 text-xs font-semibold border border-emerald-800/60 cursor-pointer shadow-sm"
            title="Télécharger l'historique en fichier CSV pour Excel"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Excel / CSV</span>
          </button>

          {/* Export JSON Button */}
          <button
            type="button"
            onClick={handleExportJSON}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 cursor-pointer"
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
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 cursor-pointer"
            title="Actualiser le journal"
          >
            <RotateCw className={`w-3.5 h-3.5 text-amber-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="rounded-xl bg-slate-900/90 border border-slate-800 overflow-hidden shadow-lg">
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
                      {log.severity === 'CRITICAL' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 text-[10px] font-bold">
                          <Ban className="w-3 h-3" />
                          Sanction
                        </span>
                      )}
                      {log.severity === 'WARNING' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px] font-medium">
                          <AlertTriangle className="w-3 h-3 text-amber-400" />
                          Avertissement
                        </span>
                      )}
                      {log.severity === 'INFO' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px]">
                          <Info className="w-3 h-3" />
                          Info
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-slate-300 text-[11px]">
                      {log.type === 'KATIKA_ACTION' && (
                        <span className="text-amber-400 flex items-center gap-1">
                          <UserX className="w-3 h-3" /> Modération
                        </span>
                      )}
                      {log.type === 'CONFIG_CHANGE' && (
                        <span className="text-purple-400 flex items-center gap-1">
                          <Sliders className="w-3 h-3" /> Paramètres
                        </span>
                      )}
                      {log.type === 'AUTH' && (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" /> Connexion
                        </span>
                      )}
                      {log.type === 'SERVER_ERROR' && (
                        <span className="text-red-400 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Système
                        </span>
                      )}
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

      {/* JSON Payload Details Modal */}
      {selectedLogForDetails && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Code className="w-4 h-4 text-amber-400" />
                <span>Détails Inaltérables de l'Action</span>
              </div>
              <button onClick={() => setSelectedLogForDetails(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="text-slate-400 font-mono text-[11px]">
                Événement : <b className="text-white font-sans">{selectedLogForDetails.summary}</b>
              </div>
              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 overflow-x-auto text-[11px] font-mono text-amber-300">
                <pre>{JSON.stringify(selectedLogForDetails.details, null, 2)}</pre>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedLogForDetails(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
