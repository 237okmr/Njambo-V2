export interface KatikaEngineConfig {
  turnTimerSeconds: number;
  reconnectGracePeriodSeconds: number;
  aiRelayGraceSeconds?: number;
  reconnectTimeoutSeconds?: number;
  lobbyDisconnectGraceSeconds?: number;
  hostLobbyGraceSeconds?: number;
  guestLobbyGraceSeconds?: number;
  lobbyWaitTtlMinutes?: number;
  publicAbsentHostVisibilitySeconds?: number;
  hostTakeoverSeconds?: number;
  joinPushEnabled?: boolean;
  koraMultiplier: number;
  doubleKoraMultiplier: number;
  threeSevensMultiplier: number;
  under21BonusPoints: number;
  isMaintenanceMode: boolean;
  bettingEconomyEnabled: boolean;
  maintenanceNotice: string;
  versionPolicy: 'PERMISSIVE' | 'MODERATE' | 'STRICT';
  transitionDelayMs: number;
  botThinkTimeMs: number;
  trickResolutionTimeMs: number;
  instantWinAnimationTimeMs: number;
  foldForfeitDelayMs?: number;
  defaultTableMaxPlayers?: 2 | 4;
  defaultFillWithBots?: boolean;
  allowJoinInProgress?: boolean;
  allowNewRooms?: boolean;
  minTableBet?: number;
  defaultInitialCapital?: number;
  hokutoSpawnRatePct: number;
  globalRakePct: number;
  allowAutoAdvance: boolean;
  emptyRoomTimeoutMinutes?: number;
  enableAutoBetEscalation?: boolean;
  autoBetEscalationInterval?: number;
  autoBetEscalationRatePct?: number;
  maxAutoBetMultiplier?: number;
}

export const DEFAULT_ENGINE_CONFIG: KatikaEngineConfig = {
  emptyRoomTimeoutMinutes: 5,
  lobbyWaitTtlMinutes: 30,
  publicAbsentHostVisibilitySeconds: 180,
  hostTakeoverSeconds: 180,
  guestLobbyGraceSeconds: 60,
  joinPushEnabled: true,
  turnTimerSeconds: 15,
  reconnectGracePeriodSeconds: 180,
  aiRelayGraceSeconds: 8,
  reconnectTimeoutSeconds: 180,
  lobbyDisconnectGraceSeconds: 180,
  hostLobbyGraceSeconds: 180,
  koraMultiplier: 2,
  doubleKoraMultiplier: 4,
  threeSevensMultiplier: 3,
  under21BonusPoints: 10,
  isMaintenanceMode: false,
  bettingEconomyEnabled: false,
  maintenanceNotice: 'Serveur de jeu en maintenance administrative.',
  versionPolicy: 'MODERATE',
  transitionDelayMs: 18000,
  botThinkTimeMs: 800,
  trickResolutionTimeMs: 1600,
  instantWinAnimationTimeMs: 3500,
  foldForfeitDelayMs: 2000,
  defaultTableMaxPlayers: 2,
  defaultFillWithBots: false,
  allowJoinInProgress: true,
  allowNewRooms: true,
  minTableBet: 10,
  defaultInitialCapital: 100,
  hokutoSpawnRatePct: 75,
  globalRakePct: 0,
  allowAutoAdvance: false,
  enableAutoBetEscalation: true,
  autoBetEscalationInterval: 5,
  autoBetEscalationRatePct: 50,
  maxAutoBetMultiplier: 4,
};

let activeEngineConfig: KatikaEngineConfig = { ...DEFAULT_ENGINE_CONFIG };

export function getEngineConfig(): KatikaEngineConfig {
  return { ...activeEngineConfig };
}

export function updateEngineConfig(patch: Partial<KatikaEngineConfig>): KatikaEngineConfig {
  const validatedPatch: Partial<KatikaEngineConfig> = { ...patch };

  if (patch.lobbyWaitTtlMinutes !== undefined) {
    const val = Number(patch.lobbyWaitTtlMinutes);
    validatedPatch.lobbyWaitTtlMinutes = Number.isFinite(val) ? Math.min(240, Math.max(5, val)) : 30;
  }

  if (patch.publicAbsentHostVisibilitySeconds !== undefined) {
    const val = Number(patch.publicAbsentHostVisibilitySeconds);
    validatedPatch.publicAbsentHostVisibilitySeconds = Number.isFinite(val) ? Math.min(1800, Math.max(0, val)) : 180;
  }

  if (patch.hostTakeoverSeconds !== undefined) {
    const val = Number(patch.hostTakeoverSeconds);
    if (!Number.isFinite(val) || val < 0) {
      validatedPatch.hostTakeoverSeconds = 180;
    } else if (val === 0) {
      validatedPatch.hostTakeoverSeconds = 0;
    } else {
      validatedPatch.hostTakeoverSeconds = Math.min(1800, Math.max(60, val));
    }
  }

  if (patch.guestLobbyGraceSeconds !== undefined) {
    const val = Number(patch.guestLobbyGraceSeconds);
    validatedPatch.guestLobbyGraceSeconds = Number.isFinite(val) ? Math.min(600, Math.max(30, val)) : 60;
  }

  if (patch.emptyRoomTimeoutMinutes !== undefined) {
    const val = Number(patch.emptyRoomTimeoutMinutes);
    validatedPatch.emptyRoomTimeoutMinutes = Number.isFinite(val) ? Math.min(120, Math.max(3, val)) : 5;
  }

  if (patch.joinPushEnabled !== undefined) {
    validatedPatch.joinPushEnabled = Boolean(patch.joinPushEnabled);
  }

  activeEngineConfig = { ...activeEngineConfig, ...validatedPatch };
  return { ...activeEngineConfig };
}
