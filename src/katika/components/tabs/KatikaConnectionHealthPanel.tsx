import React, { useEffect, useState } from 'react';
import { Wifi, RefreshCw } from 'lucide-react';
import { useVisibleInterval } from '../../hooks/useVisibleInterval';
import { getPublicParamNumber } from '../../../services/publicConfig';

interface ConnectionMetrics {
  connections: number;
  disconnectionsByCode: Record<string, number>;
  reconnectSuccesses: number;
  averageReconnectDelayMs: number;
  relaysTriggered: number;
  seatsReleased: number;
  roomsRestored: number;
  identitySubstitutions: number;
  rejectedInvalidIdentifier: number;
  sessionTakeovers: number;
  playersWithMultipleDisconnects: number;
  authTimeouts: number;
  authTokenInvalid: number;
  pushOutcomes?: Record<string, number>;
}

const PUSH_TYPE_LABEL: Record<string, string> = {
  INVITATION: 'Invitations',
  GAME_START: 'Début de partie',
  YOUR_TURN: 'Tour de jeu',
  DISCONNECTED: 'Déconnexion',
  FORFEIT_WARNING: 'Avertissement de forfait',
  FORFEIT_DECLARED: 'Forfait',
  PLAYER_JOINED: 'Joueur arrivé',
  RANK_CHANGE: 'Changement de rang',
  SEARCH_CALL: 'Je cherche une partie',
  APPOINTMENT: 'Rendez-vous',
  SYSTEM: 'Système et tests',
};
const PUSH_OUTCOME_LABEL: Record<string, string> = {
  ok: 'envoyées',
  no_subscription: 'sans abonnement',
  blocked_prefs: 'coupées par les préférences',
  quiet: 'coupées par le mode nuit',
  deferred: 'reportées',
  other: 'autres',
};

/** « Invitations : 3 envoyées, 2 sans abonnement, 1 refusée (410) », une ligne par type d'alerte du jour. */
function pushLines(outcomes: Record<string, number> | undefined): string[] {
  const byType = new Map<string, string[]>();
  const entries = Object.entries(outcomes ?? {}).filter(([, n]) => Number(n) > 0).sort((a, b) => b[1] - a[1]);
  for (const [key, n] of entries) {
    const type = Object.keys(PUSH_TYPE_LABEL).find((t) => key.startsWith(`${t}_`));
    if (!type) continue;
    const outcome = key.slice(type.length + 1);
    const label = outcome.startsWith('failed_')
      ? `refusées (${outcome.slice(7) === 'error' ? 'erreur réseau' : outcome.slice(7)})`
      : PUSH_OUTCOME_LABEL[outcome] ?? outcome;
    byType.set(type, [...(byType.get(type) ?? []), `${n} ${label}`]);
  }
  return Array.from(byType.entries()).map(([type, parts]) => `${PUSH_TYPE_LABEL[type]} : ${parts.join(', ')}`);
}

/**
 * Santé des connexions du jour, lue depuis /api/health (mesures agrégées par jour côté serveur, voir
 * server/rooms/connectionMetrics.ts). Se rafraîchit au rythme réglé dans katika, écran visible. Aucune donnée sensible : uniquement
 * des compteurs et des identifiants de joueur déjà pseudonymes.
 */
export const KatikaConnectionHealthPanel: React.FC = () => {
  const [metrics, setMetrics] = useState<ConnectionMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      const data = await res.json();
      if (data?.connectionMetrics) {
        setMetrics(data.connectionMetrics);
        setError(null);
      }
    } catch {
      setError('Mesures indisponibles pour le moment.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useVisibleInterval(refresh, getPublicParamNumber('katikaHealthRefreshSeconds') * 1000);

  let totalDisconnections = 0;
  if (metrics) {
    for (const count of Object.values(metrics.disconnectionsByCode)) {
      totalDisconnections += Number(count);
    }
  }

  const stat = (label: string, value: string | number, help?: string) => (
    <div className="flex flex-col gap-0.5 p-3 rounded-lg bg-slate-800/70 border border-slate-700/50">
      <span className="text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-lg font-bold text-white">{value}</span>
      {help && <span className="text-[10px] text-slate-500">{help}</span>}
    </div>
  );

  return (
    <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wifi className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-white">Santé des connexions (aujourd'hui)</h3>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="text-slate-400 hover:text-white cursor-pointer"
          title="Rafraîchir"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {stat('Connexions', metrics.connections)}
          {stat('Déconnexions', totalDisconnections)}
          {stat('Reconnexions réussies', metrics.reconnectSuccesses)}
          {stat('Délai moyen', `${(metrics.averageReconnectDelayMs / 1000).toFixed(1)} s`)}
          {stat('Relais déclenchés', metrics.relaysTriggered)}
          {stat('Sièges libérés', metrics.seatsReleased)}
          {stat('Tables restaurées', metrics.roomsRestored)}
          {stat('Prises de contrôle (4001)', metrics.sessionTakeovers)}
          {stat('Identifiants rejetés', metrics.rejectedInvalidIdentifier, 'bug d\'identité possible si > 0')}
          {stat('Joueurs instables', metrics.playersWithMultipleDisconnects, '3 déconnexions ou plus aujourd\'hui')}
          {stat('Délais vérif. Google', metrics.authTimeouts, 'connexions Google trop lentes à confirmer')}
          {stat('Jetons Google refusés', metrics.authTokenInvalid, 'jeton expiré ou invalide')}
        </div>
      )}

      {metrics && (
        <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/40 space-y-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">Notifications push envoyées par le serveur (depuis le dernier démarrage, aujourd'hui)</span>
          {pushLines(metrics.pushOutcomes).length === 0 ? (
            <p className="text-[11px] text-slate-500">Aucun envoi pour l'instant. « Sans abonnement » : le joueur n'a aucun appareil abonné sous cet identifiant.</p>
          ) : (
            pushLines(metrics.pushOutcomes).map((line) => (
              <p key={line} className="text-[11px] text-slate-300">{line}</p>
            ))
          )}
        </div>
      )}
    </div>
  );
};
