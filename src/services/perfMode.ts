/**
 * Mode de performance (Automatique, Léger, Complet) : réduit les effets visuels coûteux (flou, animations
 * infinies, ombres) sur les téléphones modestes ou en connexion lente, pour limiter la chauffe et la
 * consommation de batterie. La détection automatique combine les signaux du navigateur disponibles
 * (mémoire, cœurs, connexion) et, en leur absence (iPhone notamment), un détecteur de saccades léger.
 */
export type PerfPreference = 'auto' | 'light' | 'full';
export type PerfMode = 'light' | 'full';

const STORAGE_KEY = 'njambo_perf_preference';
const listeners = new Set<(mode: PerfMode) => void>();

let preference: PerfPreference = readStoredPreference();
let autoDetectedLight = false; // vrai si un signal navigateur ou une saccade a déclenché le mode léger
let currentMode: PerfMode = computeMode();

function readStoredPreference(): PerfPreference {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    return raw === 'light' || raw === 'full' || raw === 'auto' ? raw : 'auto';
  } catch {
    return 'auto';
  }
}

/** Signaux navigateur disponibles indiquant un appareil ou une connexion modeste. Absents : false (jamais true par défaut). */
export function detectLowEndSignals(nav: {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
} = (typeof navigator !== 'undefined' ? (navigator as any) : {})): boolean {
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true;
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory > 0 && nav.deviceMemory <= 4) return true;
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 4) return true;
  if (nav.connection?.saveData) return true;
  if (nav.connection?.effectiveType === '2g' || nav.connection?.effectiveType === '3g') return true;
  return false;
}

function computeMode(): PerfMode {
  if (preference === 'light') return 'light';
  if (preference === 'full') return 'full';
  return autoDetectedLight ? 'light' : 'full';
}

function applyAndNotify(): void {
  const next = computeMode();
  const changed = next !== currentMode;
  currentMode = next;
  try {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-perf', currentMode);
    }
  } catch {
    // pas de document (tests) : ignoré
  }
  if (changed) listeners.forEach((l) => l(currentMode));
}

export function getPerfMode(): PerfMode {
  return currentMode;
}

export function getPerfPreference(): PerfPreference {
  return preference;
}

/** Choix explicite du joueur (Léger ou Complet), ou retour au mode Automatique. */
export function setPerfPreference(next: PerfPreference): void {
  preference = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // stockage indisponible : le choix reste valable pour la session en cours
  }
  applyAndNotify();
}

export function subscribePerfMode(listener: (mode: PerfMode) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** À appeler une fois au démarrage : applique l'attribut data-perf et détecte les signaux disponibles. */
export function initPerfMode(): void {
  if (detectLowEndSignals()) autoDetectedLight = true;
  applyAndNotify();
}

/**
 * Détecteur de saccades (utile sur iPhone, où les signaux ci-dessus manquent souvent) : mesure le temps
 * moyen entre images sur sampleMs. Au-delà de thresholdMs de moyenne, bascule en mode léger.
 * onLightModeTriggered n'est appelé qu'une seule fois (pas de bascule répétée).
 */
export function startJankSampling(
  sampleMs: number,
  thresholdMs: number,
  onLightModeTriggered?: () => void,
  raf: (cb: (t: number) => void) => number = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : (() => 0)
): () => void {
  let stopped = false;
  let frameCount = 0;
  let last = 0;
  let windowStart = 0;

  const tick = (t: number) => {
    if (stopped) return;
    if (windowStart === 0) windowStart = t;
    if (last !== 0) frameCount++;
    last = t;

    const elapsed = t - windowStart;
    if (elapsed >= sampleMs) {
      const avgFrameMs = frameCount > 0 ? elapsed / frameCount : 0;
      if (avgFrameMs > thresholdMs && preference === 'auto' && !autoDetectedLight) {
        autoDetectedLight = true;
        applyAndNotify();
        onLightModeTriggered?.();
        return; // une seule bascule : pas besoin de continuer à échantillonner
      }
      windowStart = t;
      frameCount = 0;
    }
    raf(tick);
  };
  raf(tick);

  return () => {
    stopped = true;
  };
}
