import { wsService } from './websocketService';
import { getPlayerId } from './identity';
import { auth } from '../lib/firebase';
import { APP_VERSION, APP_BUILD_ID } from '../version';
import { DiagnosticHealth, formatDiagnosticReport } from './diagnosticReportFormat';

export function socketStateLabel(state: number | null | undefined): string {
  switch (state) {
    case WebSocket.OPEN:
      return 'Ouverte (Connectée)';
    case WebSocket.CONNECTING:
      return 'En cours de connexion...';
    case WebSocket.CLOSING:
      return 'En cours de fermeture';
    default:
      return 'Fermée (Déconnectée)';
  }
}

/** Lit l'état du serveur et demande une nouvelle mesure de latence. */
export async function fetchDiagnosticHealth(): Promise<DiagnosticHealth> {
  wsService.triggerPing();
  const res = await fetch('/api/health', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

/** Rapport de l'instant, à partir de l'état du serveur déjà lu (ou du texte qui explique son absence). */
export function buildDiagnosticReport(health: DiagnosticHealth | null, healthFallback: string): string {
  const currentUser = auth.currentUser;
  return formatDiagnosticReport({
    generatedAt: new Date().toISOString(),
    origin: typeof window !== 'undefined' ? window.location.origin : 'N/A',
    appVersion: APP_VERSION,
    buildId: APP_BUILD_ID,
    socketLabel: socketStateLabel(wsService.getSocketReadyState()),
    latencyMs: wsService.getLastPingLatencyMs(),
    activeRoomCode: wsService.getActiveRoomCode(),
    isGoogleUser: Boolean(currentUser && !currentUser.isAnonymous),
    playerId: getPlayerId(),
    hasReconnectToken: Boolean(wsService.getReconnectToken()),
    lastError: wsService.getLastServerError(),
    health,
    healthFallback,
  });
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Presse-papiers restreint : ancienne méthode
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    try {
      return document.execCommand('copy');
    } catch (err) {
      console.warn('[Diagnostic] Copy failed:', err);
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }
}
