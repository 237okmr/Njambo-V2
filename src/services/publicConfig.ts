import { PARAM_BY_KEY, clampParamValue } from '../../server/engine/engineParams';

/**
 * Config publique côté joueur : paramètres du registre de portée client ou both, servis par
 * GET /api/config/public. Les valeurs sont mises en cache localement (versionnées) ; en l'absence de
 * réseau ou de cache, les valeurs par défaut du registre s'appliquent.
 */
const STORAGE_KEY = 'njambo_public_config_v1';

// Constante technique : s'applique avant que la config publique n'existe.
const FETCH_TIMEOUT_MS = 3000; // delay-ok: récupération de la config publique au démarrage, antérieure à toute config

interface StoredPublicConfig {
  version: number;
  params: Record<string, number | boolean>;
}

function readStored(): StoredPublicConfig | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.version === 'number' && parsed.params && typeof parsed.params === 'object') {
      return parsed as StoredPublicConfig;
    }
  } catch {
    // cache illisible : ignoré
  }
  return null;
}

let current: StoredPublicConfig | null = readStored();
const listeners = new Set<() => void>();
let inFlight: Promise<void> | null = null;

/** Valeur d'un paramètre : config publique si connue, sinon défaut du registre. */
export function getPublicParam(key: string): number | boolean {
  const def = PARAM_BY_KEY[key];
  if (!def) throw new Error(`Paramètre inconnu : ${key}`);
  const raw = current?.params?.[key];
  return raw === undefined ? def.default : clampParamValue(def, raw);
}

export function getPublicParamNumber(key: string): number {
  return Number(getPublicParam(key));
}

export function getPublicConfigVersion(): number {
  return current?.version ?? 0;
}

export function subscribePublicConfig(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Recharge la config publique. force = true contourne le cache HTTP (changement de version détecté). */
export function refreshPublicConfig(force: boolean = false): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null; // delay-ok: voir ci-dessus
    try {
      const res = await fetch('/api/config/public', {
        cache: force ? 'no-cache' : 'default',
        signal: controller?.signal,
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data || typeof data.configVersion !== 'number' || !data.params) return;
      const params: Record<string, number | boolean> = {};
      for (const [key, raw] of Object.entries(data.params as Record<string, unknown>)) {
        const def = PARAM_BY_KEY[key];
        if (def) params[key] = clampParamValue(def, raw);
      }
      const changed = !current || current.version !== data.configVersion;
      current = { version: data.configVersion, params };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      } catch {
        // stockage indisponible : la config reste en mémoire
      }
      if (changed) listeners.forEach((l) => l());
    } catch {
      // hors ligne ou délai dépassé : on garde le cache ou les défauts
    } finally {
      if (timer) clearTimeout(timer);
      inFlight = null;
    }
  })();
  return inFlight;
}

export function initPublicConfig(): Promise<void> {
  return refreshPublicConfig(false);
}

/** À appeler quand le serveur annonce sa version de config (SESSION_READY) : recharge si elle a changé. */
export function noteServerConfigVersion(version: number | undefined): void {
  if (typeof version === 'number' && version !== getPublicConfigVersion()) {
    void refreshPublicConfig(true);
  }
}
