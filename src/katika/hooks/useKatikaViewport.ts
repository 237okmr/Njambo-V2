import { useEffect } from 'react';

/**
 * Valeur de la balise viewport pour katika : le zoom de la page reste possible (lecture des tableaux denses,
 * accessibilité). L'écran de jeu garde, lui, la balise d'origine de index.html, dont les gestes sont figés.
 */
export const KATIKA_VIEWPORT_CONTENT = 'width=device-width, initial-scale=1.0, viewport-fit=cover';

/** Active le zoom de page tant que katika est affiché, puis remet la balise viewport d'origine en sortant. */
export function useKatikaViewport(): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) return;
    const original = meta.getAttribute('content');
    meta.setAttribute('content', KATIKA_VIEWPORT_CONTENT);
    return () => {
      if (original !== null) meta.setAttribute('content', original);
    };
  }, []);
}
