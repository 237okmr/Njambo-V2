import { useEffect, useState } from 'react';

/** Écran de téléphone ou de tablette : en dessous de la largeur où le menu latéral de katika s'affiche. */
export const COMPACT_SCREEN_QUERY = '(max-width: 1023px)';

export function isCompactScreen(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(COMPACT_SCREEN_QUERY).matches;
}

export function useIsCompactScreen(): boolean {
  const [compact, setCompact] = useState<boolean>(isCompactScreen);
  useEffect(() => {
    const media = window.matchMedia(COMPACT_SCREEN_QUERY);
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return compact;
}
