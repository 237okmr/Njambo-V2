/**
 * Kora Cash — règles pures de la configuration générale (activation, prestataire actif, environnement).
 * Aucun accès base de données, aucun secret, aucun délai.
 */

export type KoraCashEnvironment = 'DEMO' | 'LIVE';
export type KoraCashProviderId = 'campay' | 'notchpay';

export interface KoraCashConfigData {
  isEnabled: boolean;
  activeProviderId: KoraCashProviderId | null;
  environment: KoraCashEnvironment;
  updatedAt: number;
  updatedBy?: string;
}

export interface KoraCashConfigPatch {
  isEnabled?: boolean;
  activeProviderId?: KoraCashProviderId | null;
  environment?: KoraCashEnvironment;
}

export const DEFAULT_KORA_CASH_CONFIG_DATA: KoraCashConfigData = {
  isEnabled: false,
  activeProviderId: null,
  environment: 'DEMO',
  updatedAt: 0,
};

const ALLOWED_PATCH_KEYS = ['isEnabled', 'activeProviderId', 'environment'];
const PROVIDERS: string[] = ['campay', 'notchpay'];
const ENVIRONMENTS: string[] = ['DEMO', 'LIVE'];

export interface ParsePatchResult {
  ok: boolean;
  patch?: KoraCashConfigPatch;
  error?: string;
}

/** Valide strictement le corps d'une demande de modification : clés connues seulement, valeurs de la bonne forme. */
export function parseConfigPatch(raw: unknown): ParsePatchResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'Corps de requête invalide.' };
  }
  const body = raw as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.length === 0) {
    return { ok: false, error: 'Aucun champ à modifier.' };
  }
  for (const key of keys) {
    if (!ALLOWED_PATCH_KEYS.includes(key)) {
      return { ok: false, error: `Champ non autorisé : ${key}.` };
    }
  }

  const patch: KoraCashConfigPatch = {};

  if ('isEnabled' in body) {
    if (typeof body.isEnabled !== 'boolean') {
      return { ok: false, error: 'isEnabled doit être un booléen.' };
    }
    patch.isEnabled = body.isEnabled;
  }
  if ('activeProviderId' in body) {
    const v = body.activeProviderId;
    if (v !== null && (typeof v !== 'string' || !PROVIDERS.includes(v))) {
      return { ok: false, error: 'Prestataire inconnu.' };
    }
    patch.activeProviderId = v as KoraCashProviderId | null;
  }
  if ('environment' in body) {
    const v = body.environment;
    if (typeof v !== 'string' || !ENVIRONMENTS.includes(v)) {
      return { ok: false, error: 'Environnement inconnu.' };
    }
    patch.environment = v as KoraCashEnvironment;
  }

  return { ok: true, patch };
}

/** Lecture tolérante d'un document stocké : tout champ absent ou invalide retombe sur la valeur par défaut (désactivé, démo). */
export function normalizeStoredConfig(data: unknown): KoraCashConfigData {
  const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  const provider = typeof d.activeProviderId === 'string' && PROVIDERS.includes(d.activeProviderId) ? (d.activeProviderId as KoraCashProviderId) : null;
  const environment = typeof d.environment === 'string' && ENVIRONMENTS.includes(d.environment) ? (d.environment as KoraCashEnvironment) : 'DEMO';
  return {
    isEnabled: d.isEnabled === true,
    activeProviderId: provider,
    environment,
    updatedAt: typeof d.updatedAt === 'number' && Number.isFinite(d.updatedAt) ? d.updatedAt : 0,
    ...(typeof d.updatedBy === 'string' && d.updatedBy ? { updatedBy: d.updatedBy } : {}),
  };
}

/** Ce que l'application des joueurs a le droit de savoir : rien d'autre que « activé ou non » et l'environnement. */
export function toPublicStatus(cfg: KoraCashConfigData): { enabled: boolean; environment: KoraCashEnvironment } {
  return { enabled: cfg.isEnabled === true, environment: cfg.environment };
}
