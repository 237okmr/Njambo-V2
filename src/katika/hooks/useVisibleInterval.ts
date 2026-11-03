import { useEffect, useRef } from 'react';

/**
 * Répète une action à intervalle régulier, seulement quand l'écran est visible : un onglet caché ou un téléphone en veille
 * ne consomme ni forfait ni batterie. Au retour à l'écran, l'action repart aussitôt si le dernier passage est trop ancien.
 */
export function useVisibleInterval(action: () => void, intervalMs: number): void {
  const latestAction = useRef(action);
  latestAction.current = action;

  useEffect(() => {
    let lastRun = Date.now();
    const run = () => {
      lastRun = Date.now();
      latestAction.current();
    };
    const tick = () => {
      if (document.visibilityState !== 'hidden') run();
    };
    const handleVisibility = () => {
      if (document.visibilityState !== 'hidden' && Date.now() - lastRun >= intervalMs) run();
    };

    const timer = setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [intervalMs]);
}
