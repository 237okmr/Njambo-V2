import { useEffect, useRef } from 'react';

/**
 * Comme setInterval, mais s'arrête tant que l'onglet est masqué (document.hidden) et reprend à son
 * retour au premier plan. Évite de faire tourner des animations ou des recalculs inutiles en arrière-plan
 * (chauffe, batterie) sur les téléphones. callback est toujours la version la plus récente (pas besoin de
 * la lister dans les dépendances de l'appelant).
 */
export function useVisibleInterval(callback: () => void, delayMs: number | null): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (delayMs === null) return;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (intervalId !== null) return;
      intervalId = setInterval(() => callbackRef.current(), delayMs);
    };
    const stop = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    if (typeof document === 'undefined' || !document.hidden) start();

    const handleVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      stop();
    };
  }, [delayMs]);
}
