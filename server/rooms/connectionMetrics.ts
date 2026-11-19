import { getFirebaseAdminAppDb } from '../firebaseAdmin';
import { getEngineConfig } from '../engine/engineConfig';
import { flushPresenceDaily } from './presenceDaily';
import { flushBootStats } from '../diagnostics/bootStatsStore';
import { flushInviteStats } from '../diagnostics/inviteStatsStore';
import { flushAuthStats } from '../diagnostics/authStatsStore';

/**
 * Mesures de santé des connexions, agrégées par jour, pour diagnostiquer la qualité des connexions des
 * joueurs sans avoir à lire les journaux du serveur. Compteurs en mémoire, vidés périodiquement dans
 * Firestore (collection server_metrics, document connection_AAAA-MM-JJ), accès uniquement par le SDK
 * admin. Aucune donnée personnelle autre que l'identifiant de joueur (déjà pseudonyme).
 */
const COLLECTION = 'server_metrics';

export interface DailyMetrics {
  dateKey: string;
  connections: number;
  disconnectionsByCode: Record<string, number>;
  reconnectSuccesses: number;
  reconnectDelaysMsSum: number;
  reconnectDelaysCount: number;
  relaysTriggered: number;
  seatsReleased: number;
  roomsRestored: number;
  identitySubstitutions: number;
  rejectedInvalidIdentifier: number;
  sessionTakeovers: number;
  disconnectionsByPlayer: Record<string, number>;
  authTimeouts: number;
  authTokenInvalid: number;
  /** Envois de notifications push du jour : « TYPE_résultat » (ex. INVITATION_ok, APPOINTMENT_no_subscription, INVITATION_failed_410). */
  pushOutcomes: Record<string, number>;
}

function emptyMetrics(dateKey: string): DailyMetrics {
  return {
    dateKey,
    connections: 0,
    disconnectionsByCode: {},
    reconnectSuccesses: 0,
    reconnectDelaysMsSum: 0,
    reconnectDelaysCount: 0,
    relaysTriggered: 0,
    seatsReleased: 0,
    roomsRestored: 0,
    identitySubstitutions: 0,
    rejectedInvalidIdentifier: 0,
    sessionTakeovers: 0,
    disconnectionsByPlayer: {},
    authTimeouts: 0,
    authTokenInvalid: 0,
    pushOutcomes: {},
  };
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

let current: DailyMetrics = emptyMetrics(todayKey());
// Horodatage de déconnexion par joueur (pour mesurer le délai jusqu'à une reconnexion réussie).
const disconnectedAt = new Map<string, number>();
let flushTimer: NodeJS.Timeout | null = null;

function rollIfNewDay(): void {
  const key = todayKey();
  if (key !== current.dateKey) {
    current = emptyMetrics(key);
  }
}

export function recordConnection(): void {
  rollIfNewDay();
  current.connections += 1;
}

export function recordDisconnection(playerId: string, code: number): void {
  rollIfNewDay();
  const codeKey = String(code);
  current.disconnectionsByCode[codeKey] = (current.disconnectionsByCode[codeKey] || 0) + 1;
  current.disconnectionsByPlayer[playerId] = (current.disconnectionsByPlayer[playerId] || 0) + 1;
  disconnectedAt.set(playerId, Date.now());
  if (code === 4001) current.sessionTakeovers += 1;
}

/** À appeler quand un joueur déjà connu se reconnecte avec une nouvelle connexion. */
export function recordReconnection(playerId: string): void {
  rollIfNewDay();
  const since = disconnectedAt.get(playerId);
  if (since) {
    current.reconnectSuccesses += 1;
    current.reconnectDelaysMsSum += Date.now() - since;
    current.reconnectDelaysCount += 1;
    disconnectedAt.delete(playerId);
  }
}

export function recordRelayTriggered(): void {
  rollIfNewDay();
  current.relaysTriggered += 1;
}

export function recordSeatReleased(): void {
  rollIfNewDay();
  current.seatsReleased += 1;
}

export function recordRoomRestored(): void {
  rollIfNewDay();
  current.roomsRestored += 1;
}

export function recordIdentitySubstitution(): void {
  rollIfNewDay();
  current.identitySubstitutions += 1;
}

export function recordRejectedInvalidIdentifier(): void {
  rollIfNewDay();
  current.rejectedInvalidIdentifier += 1;
}

export function recordAuthTimeout(): void {
  rollIfNewDay();
  current.authTimeouts += 1;
}

export function recordAuthTokenInvalid(): void {
  rollIfNewDay();
  current.authTokenInvalid += 1;
}

const PUSH_METRIC_TYPES = [
  'INVITATION', 'GAME_START', 'YOUR_TURN', 'DISCONNECTED', 'FORFEIT_WARNING', 'FORFEIT_DECLARED',
  'PLAYER_JOINED', 'RANK_CHANGE', 'SEARCH_CALL', 'APPOINTMENT', 'SYSTEM',
] as const;
const PUSH_METRIC_OUTCOMES = ['ok', 'no_subscription', 'blocked_prefs', 'quiet', 'deferred'] as const;

/**
 * Note le sort d'une notification push (liste fermée, aucun identifiant ni contenu) : envoyée, aucun abonnement trouvé pour le joueur,
 * coupée par ses préférences ou le mode nuit, reportée, ou refusée par le service de notification (code HTTP à trois chiffres).
 */
export function recordPushOutcome(type: string | undefined, outcome: string, statusCode?: unknown): void {
  rollIfNewDay();
  const t = (PUSH_METRIC_TYPES as readonly string[]).includes(type ?? '') ? (type as string) : 'SYSTEM';
  let o: string;
  if (outcome === 'failed') {
    const code = String(statusCode ?? '');
    o = /^\d{3}$/.test(code) ? `failed_${code}` : 'failed_error';
  } else {
    o = (PUSH_METRIC_OUTCOMES as readonly string[]).includes(outcome) ? outcome : 'other';
  }
  const key = `${t}_${o}`;
  current.pushOutcomes[key] = (current.pushOutcomes[key] || 0) + 1;
}

export interface MetricsSnapshot extends DailyMetrics {
  averageReconnectDelayMs: number;
  playersWithMultipleDisconnects: number;
}

export function getTodaySnapshot(): MetricsSnapshot {
  rollIfNewDay();
  const averageReconnectDelayMs =
    current.reconnectDelaysCount > 0 ? Math.round(current.reconnectDelaysMsSum / current.reconnectDelaysCount) : 0;
  const playersWithMultipleDisconnects = Object.values(current.disconnectionsByPlayer).filter((n) => n >= 3).length;
  return {
    ...current,
    disconnectionsByCode: { ...current.disconnectionsByCode },
    disconnectionsByPlayer: { ...current.disconnectionsByPlayer },
    pushOutcomes: { ...current.pushOutcomes },
    averageReconnectDelayMs,
    playersWithMultipleDisconnects,
  };
}

/** Écrit le compteur du jour dans Firestore. N'écrase jamais un jour différent de celui en mémoire. */
export async function flushMetricsToStore(): Promise<boolean> {
  rollIfNewDay();
  void flushPresenceDaily(); // présence quotidienne : même cadence (metricsFlushSeconds)
  void flushBootStats(); // démarrages de l'application : même cadence (metricsFlushSeconds)
  void flushInviteStats(); // parcours d'invitation : même cadence (metricsFlushSeconds)
  void flushAuthStats(); // connexion Google : même cadence (metricsFlushSeconds)
  try {
    const db = getFirebaseAdminAppDb();
    await db.collection(COLLECTION).doc(`connection_${current.dateKey}`).set(
      { ...current, updatedAt: Date.now() },
      { merge: false }
    );
    return true;
  } catch (err: any) {
    console.warn('[ConnectionMetrics] Sauvegarde impossible :', err?.message || err);
    return false;
  }
}

/** À appeler une fois au démarrage du vrai serveur (jamais pendant les tests). */
export function startMetricsFlushLoop(): void {
  if (flushTimer) return;
  const flushSeconds = Number(getEngineConfig().metricsFlushSeconds ?? 60);
  flushTimer = setInterval(() => {
    void flushMetricsToStore();
  }, flushSeconds * 1000);
}

export function stopMetricsFlushLoop(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}
