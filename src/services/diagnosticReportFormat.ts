/**
 * Texte du rapport que le joueur copie pour signaler un problème. Fonction pure : aucun réseau, aucun navigateur.
 * Le rapport ne contient ni adresse e-mail, ni jeton de reconnexion : il peut être envoyé par messagerie.
 */

export interface DiagnosticHealth {
  status: string;
  instanceId?: string;
  bootedAt?: number;
  activeRooms?: number;
}

export interface DiagnosticReportInput {
  generatedAt: string;
  origin: string;
  appVersion: string;
  buildId: string;
  socketLabel: string;
  latencyMs: number | null;
  activeRoomCode: string | null;
  isGoogleUser: boolean;
  playerId: string;
  hasReconnectToken: boolean;
  lastError: { code: string; message: string; timestamp: number } | null;
  health: DiagnosticHealth | null;
  /** Texte affiché quand l'état du serveur n'a pas pu être lu. */
  healthFallback: string;
}

export function formatDiagnosticReport(input: DiagnosticReportInput): string {
  const { health, lastError } = input;
  return [
    '=== DIAGNOSTIC CONNEXION NJAMBO KORA ===',
    `Date du rapport : ${input.generatedAt}`,
    `URL du site : ${input.origin}`,
    `Version App : ${input.appVersion} (${input.buildId})`,
    '',
    '--- ÉTAT TEMPS RÉEL ---',
    `Statut WebSocket : ${input.socketLabel}`,
    `Latence dernier ping : ${input.latencyMs !== null ? `${input.latencyMs} ms` : 'Non mesurée (aucun ping-pong récent)'}`,
    `Table active : ${input.activeRoomCode || 'Aucune'}`,
    '',
    '--- IDENTITÉ & SESSION ---',
    `Type identité : ${input.isGoogleUser ? 'Compte Google' : 'Invité (Anonyme)'}`,
    `Identifiant joueur : ${input.playerId}`,
    `Jeton de reconnexion présent : ${input.hasReconnectToken ? 'Oui' : 'Non'}`,
    '',
    '--- DERNIÈRE ERREUR SERVEUR ---',
    lastError
      ? `Code : ${lastError.code}\nMessage : ${lastError.message}\nHeure : ${new Date(lastError.timestamp).toISOString()}`
      : 'Aucune erreur serveur reçue durant cette session.',
    '',
    '--- ÉTAT DU SERVEUR (/api/health) ---',
    health
      ? `Statut : ${health.status}\nInstance ID : ${health.instanceId || 'N/A'}\nSalons actifs : ${health.activeRooms ?? 'N/A'}\nServeur démarré le : ${health.bootedAt ? new Date(health.bootedAt).toISOString() : 'N/A'}`
      : `Statut : ${input.healthFallback}`,
    '========================================',
  ].join('\n');
}
