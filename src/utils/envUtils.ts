/**
 * Utility to detect whether the app is currently running in an AI Studio test/preview environment.
 * Development preview URLs contain 'ais-dev' and shared/preview URLs contain 'ais-pre'.
 */
export function isTestEnvironment(): boolean {
  if (typeof window === 'undefined' || !window.location || !window.location.hostname) {
    return false;
  }
  const hostname = window.location.hostname;
  return hostname.includes('ais-dev') || hostname.includes('ais-pre');
}
