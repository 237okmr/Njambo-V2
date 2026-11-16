/**
 * Connexion Google de secours par redirection : décisions pures (aucun réseau, aucun Firebase), faciles à tester.
 * Tout est derrière le réglage katika « authRedirectEnabled » (fermé par défaut) et ne concerne que iPhone et iPad.
 */

/** Échecs nets de la fenêtre : ceux-là, et seulement ceux-là, déclenchent la redirection de secours. « Fermée par l'utilisateur » n'en fait pas partie. */
export const POPUP_CLEAR_FAILURES: readonly string[] = [
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
];

/** iPhone, iPod, iPad, y compris un iPad qui se présente comme un Mac (iPadOS en mode « site pour ordinateur »). */
export function isIosDevice(userAgent: string, maxTouchPoints: number = 0): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

/** Vrai si, la fenêtre ayant échoué avec ce code, l'app doit basculer sur la redirection. */
export function shouldFallbackToRedirect(opts: { enabled: boolean; ios: boolean; errorCode: string }): boolean {
  return opts.enabled && opts.ios && POPUP_CLEAR_FAILURES.includes(opts.errorCode);
}

/** Domaine de connexion : celui du jeu (relais) sur iOS quand le réglage est ouvert, celui de Firebase partout ailleurs. */
export function resolveAuthDomain(opts: { configDomain: string; host: string; enabled: boolean; ios: boolean }): string {
  return opts.enabled && opts.ios && opts.host ? opts.host : opts.configDomain;
}

/** Marqueur laissé avant le départ vers la page Google : sert seulement à savoir, au retour, qu'une redirection était en cours. */
export const REDIRECT_MARKER_KEY = 'njambo_auth_redirect_v1';

export interface RedirectMarker {
  at: number;
  /** La connexion passait par le domaine du jeu (relais). */
  relay: boolean;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function writeRedirectMarker(storage: StorageLike, marker: RedirectMarker): void {
  try {
    storage.setItem(REDIRECT_MARKER_KEY, JSON.stringify(marker));
  } catch {
    // stockage indisponible : le retour ne sera simplement pas reconnu comme tel
  }
}

/** Marqueur encore valable, ou null. Un marqueur trop ancien ou illisible n'est jamais renvoyé. */
export function readRedirectMarker(storage: StorageLike, nowMs: number, maxAgeMs: number): RedirectMarker | null {
  try {
    const raw = storage.getItem(REDIRECT_MARKER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RedirectMarker>;
    if (typeof parsed.at !== 'number' || nowMs - parsed.at > maxAgeMs || parsed.at > nowMs + 60_000) return null;
    return { at: parsed.at, relay: parsed.relay === true };
  } catch {
    return null;
  }
}

export function clearRedirectMarker(storage: StorageLike): void {
  try {
    storage.removeItem(REDIRECT_MARKER_KEY);
  } catch {
    // rien à nettoyer
  }
}
