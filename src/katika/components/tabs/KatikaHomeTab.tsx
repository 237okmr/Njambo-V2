import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BarChart3, CheckCircle2, ChevronRight, RotateCw, Users, Dices } from 'lucide-react';
import { tikaFetch } from '../../services/tikaFetch';
import { KatikaReadBudget } from '../KatikaReadBudget';
import { buildHomeTodo, HomeInputs, HomeTodoItem } from '../../utils/homeItems';
import { can, canSeeTab, KatikaAccessLike } from '../../utils/katikaAccess';
import { KatikaTab } from '../../types/katika';

interface KatikaHomeTabProps {
  access: KatikaAccessLike | null;
  maintenance: boolean;
  onNavigateTab: (tab: KatikaTab) => void;
}

async function readJson(url: string): Promise<any | null> {
  try {
    const res = await tikaFetch(url);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/**
 * Accueil : d'abord ce qui demande une action, puis quelques chiffres du direct. Les statistiques détaillées
 * (qui relisent l'historique) ne se chargent que sur demande, dans le tableau de bord complet.
 */
export const KatikaHomeTab: React.FC<KatikaHomeTabProps> = ({ access, maintenance, onNavigateTab }) => {
  const [todo, setTodo] = useState<HomeTodoItem[]>([]);
  const [live, setLive] = useState<{ players: number; rooms: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const canCash = can(access, 'cash.view');
    const canLogs = can(access, 'logs.view');
    const canLive = can(access, 'dashboard.view') || can(access, 'rooms.view');
    const [health, withdrawals, protection, logs, metrics, crashes] = await Promise.all([
      fetch('/api/health', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      canCash ? readJson('/api/katika/cash/withdrawals') : Promise.resolve(null),
      canCash ? readJson('/api/katika/cash/protection') : Promise.resolve(null),
      canLogs ? readJson('/api/katika/audit-logs') : Promise.resolve(null),
      canLive ? readJson('/api/katika/live-metrics') : Promise.resolve(null),
      canLogs ? readJson('/api/katika/crashes') : Promise.resolve(null),
    ]);

    const since = Date.now() - 24 * 3_600_000; // delay-ok: période d'affichage « dernières 24 h », pas un délai
    const recentLogs: Array<{ severity: string; timestamp: number }> = Array.isArray(logs?.logs) ? logs.logs.filter((l: any) => l.timestamp >= since) : [];
    const input: HomeInputs = {
      serverUp: health ? health.status === 'ok' : false,
      maintenance,
      withdrawalsAwaiting: Array.isArray(withdrawals?.withdrawals)
        ? withdrawals.withdrawals.filter((w: any) => w.status === 'AWAITING_APPROVAL').length
        : null,
      collusionAlerts: Array.isArray(protection?.alerts) ? protection.alerts.length : null,
      openCrashes: Array.isArray(crashes?.crashes)
        ? crashes.crashes.filter((c: { resolved: boolean; lastSeenAt: number }) => !c.resolved && c.lastSeenAt >= since).length
        : null,
      journalAlerts: logs
        ? {
            critical: recentLogs.filter((l) => l.severity === 'CRITICAL').length,
            warning: recentLogs.filter((l) => l.severity === 'WARNING').length,
          }
        : null,
    };
    setTodo(buildHomeTodo(input));
    setLive(metrics?.telemetry ? { players: metrics.telemetry.connectedSockets || 0, rooms: metrics.telemetry.activeRooms || 0 } : null);
    setUpdatedAt(new Date());
    setLoading(false);
  }, [access, maintenance]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-5 text-slate-200">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-slate-400">
          {updatedAt ? `Mis à jour à ${updatedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : 'Chargement…'}
        </span>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="min-h-[44px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm flex items-center gap-2 disabled:opacity-50"
        >
          <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">À traiter maintenant</h2>
        <ul className="flex flex-col gap-2">
          {todo.map((item) => {
            const Icon = item.level === 'OK' ? CheckCircle2 : AlertTriangle;
            const color = item.level === 'CRITICAL' ? 'text-red-300 border-red-500/40 bg-red-950/30' : item.level === 'WARNING' ? 'text-amber-200 border-amber-500/40 bg-amber-950/20' : 'text-emerald-200 border-emerald-500/30 bg-emerald-950/20';
            const clickable = item.tab && canSeeTab(access, item.tab);
            return (
              <li key={item.text}>
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => item.tab && onNavigateTab(item.tab)}
                  className={`w-full min-h-[52px] px-4 rounded-xl border flex items-center gap-3 text-left text-sm ${color} disabled:cursor-default`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className="flex-1">{item.text}</span>
                  {clickable && <ChevronRight className="w-4 h-4 shrink-0 opacity-70" />}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {live && (
        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="text-xs text-slate-400 flex items-center gap-1.5"><Users className="w-4 h-4" />En ligne</div>
            <div className="text-2xl font-bold text-white">{live.players}</div>
          </div>
          <button
            type="button"
            disabled={!canSeeTab(access, 'ROOMS')}
            onClick={() => onNavigateTab('ROOMS')}
            className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-left disabled:cursor-default"
          >
            <div className="text-xs text-slate-400 flex items-center gap-1.5"><Dices className="w-4 h-4" />Tables actives</div>
            <div className="text-2xl font-bold text-white">{live.rooms}</div>
          </button>
        </section>
      )}

      {canSeeTab(access, 'DASHBOARD') && (
        <button
          type="button"
          onClick={() => onNavigateTab('DASHBOARD')}
          className="min-h-[52px] px-4 rounded-xl border border-slate-800 bg-slate-900/70 hover:bg-slate-800 flex items-center gap-3 text-sm"
        >
          <BarChart3 className="w-5 h-5 text-amber-400" />
          <span className="flex-1 text-left">Voir les statistiques (parties, abandons, Koras)</span>
          <ChevronRight className="w-4 h-4 opacity-70" />
        </button>
      )}

      {can(access, 'dashboard.view') && <KatikaReadBudget />}
    </div>
  );
};
