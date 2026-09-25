import { PARAM_BY_KEY, clampParamValue, getParamDefaults } from './engineParams';

export interface KatikaEngineConfig {
  turnTimerSeconds: number;
  aiRelayGraceSeconds?: number;
  guestLobbyGraceSeconds?: number;
  playerGraceSeconds?: number;
  hostGraceSeconds?: number;
  forceStartHostAbsentSeconds?: number;
  roundEndWatchdogMs?: number;
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
  enableMultiplayerAutoBetEscalation?: boolean;
  autoBetEscalationInterval?: number;
  autoBetEscalationRatePct?: number;
  maxAutoBetMultiplier?: number;
}

const LEGACY_ENGINE_DEFAULTS = {
  joinPushEnabled: true,
  koraMultiplier: 2,
  doubleKoraMultiplier: 4,
  threeSevensMultiplier: 3,
  under21BonusPoints: 10,
  isMaintenanceMode: false,
  bettingEconomyEnabled: false,
  maintenanceNotice: 'Serveur de jeu en maintenance administrative.',
  versionPolicy: 'MODERATE',
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
  enableMultiplayerAutoBetEscalation: false,
  autoBetEscalationInterval: 5,
  autoBetEscalationRatePct: 50,
  maxAutoBetMultiplier: 4,
};

// Les paramètres du registre (engineParams.ts) font foi pour tous les délais.
export const DEFAULT_ENGINE_CONFIG: KatikaEngineConfig = {
  ...LEGACY_ENGINE_DEFAULTS,
  ...getParamDefaults(),
} as KatikaEngineConfig;

let activeEngineConfig: KatikaEngineConfig = { ...DEFAULT_ENGINE_CONFIG };

export function getEngineConfig(): KatikaEngineConfig {
  return { ...activeEngineConfig };
}

let configVersion = 0;

export function getEngineConfigVersion(): number {
  return configVersion;
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Applique un patch de configuration.
 * - Paramètres du registre : validés et ramenés dans leurs bornes (valeur invalide = défaut).
 * - Autres champs historiques (économie, maintenance, katika...) : conservés tels quels, comme avant.
 */
export function updateEngineConfig(patch: Partial<KatikaEngineConfig> | Record<string, unknown>): KatikaEngineConfig {
  const validatedPatch: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(patch || {})) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    const def = PARAM_BY_KEY[key];
    if (def) {
      validatedPatch[key] = clampParamValue(def, raw);
      continue;
    }
    // Champs historiques : on normalise seulement le type des booléens connus.
    const known = (DEFAULT_ENGINE_CONFIG as unknown as Record<string, unknown>)[key];
    validatedPatch[key] = typeof known === 'boolean' ? Boolean(raw) : raw;
  }

  activeEngineConfig = { ...activeEngineConfig, ...(validatedPatch as Partial<KatikaEngineConfig>) };
  configVersion += 1;
  return { ...activeEngineConfig };
}

/** Charge une config persistée au démarrage (valide les champs du registre, ne change pas la version). */
export function loadPersistedEngineConfig(values: Record<string, unknown>, version: number): KatikaEngineConfig {
  const validated: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(values || {})) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    const def = PARAM_BY_KEY[key];
    validated[key] = def ? clampParamValue(def, raw) : raw;
  }
  activeEngineConfig = { ...DEFAULT_ENGINE_CONFIG, ...(validated as Partial<KatikaEngineConfig>) };
  configVersion = Number.isFinite(version) && version > 0 ? version : 0;
  return { ...activeEngineConfig };
}
