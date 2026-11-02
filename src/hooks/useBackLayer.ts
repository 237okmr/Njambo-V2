import { useEffect, useRef } from 'react';
import { pushBackLayer } from '../utils/backLayers';

/** Tant que `active` est vrai, le bouton Retour appelle `onBack` au lieu de fermer l'écran. */
export function useBackLayer(active: boolean, onBack: () => void): void {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!active) return;
    return pushBackLayer(() => onBackRef.current());
  }, [active]);
}
