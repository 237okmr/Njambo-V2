/**
 * Adresses des écrans du jeu. Elles restent toutes dans le scope de la PWA (/game/), sinon Chrome Android
 * ouvrirait un onglet navigateur au lieu de l'application installée.
 */
export const GAME_HOME_PATH = '/game/';

export type RoutedScreen = 'rules' | 'leaderboard' | 'multiplayer' | 'profile' | 'notifications' | 'koraCash' | 'social';

export const ROUTE_PATHS: Record<RoutedScreen, string> = {
  rules: '/game/regles',
  leaderboard: '/game/palmares',
  multiplayer: '/game/multijoueur',
  profile: '/game/profil',
  notifications: '/game/notifications',
  koraCash: '/game/kora-cash',
  social: '/game/social',
};

const normalizePath = (pathname: string): string => {
  const lower = pathname.toLowerCase();
  return lower.length > 1 && lower.endsWith('/') ? lower.slice(0, -1) : lower;
};

/** Écran correspondant à une adresse, ou null si elle ne désigne aucun écran (accueil compris). */
export function screenFromPath(pathname: string): RoutedScreen | null {
  const path = normalizePath(pathname);
  const match = (Object.keys(ROUTE_PATHS) as RoutedScreen[]).find((screen) => ROUTE_PATHS[screen] === path);
  return match ?? null;
}

/** Vrai si l'adresse désigne l'accueil ou un écran connu ; sinon le jeu revient à l'accueil. */
export function isKnownGamePath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return path === '/' || path === '/game' || screenFromPath(pathname) !== null;
}

/**
 * Vrai si l'adresse ouvre la console d'administration : /katika, /copilot ou un paramètre prévu pour cela.
 * Un mot « katika » ailleurs dans l'adresse (?ref=katika, ?join=KATIKA) n'ouvre rien.
 * Même logique dans le script de démarrage d'index.html.
 */
export function isConsoleLocation(pathname: string, search: string): boolean {
  const path = pathname.toLowerCase();
  if (path.startsWith('/katika') || path.startsWith('/copilot')) return true;
  const params = new URLSearchParams(search.toLowerCase());
  return (
    params.has('copilot') ||
    params.has('katika') ||
    params.get('mode') === 'copilot' ||
    params.get('view') === 'copilot'
  );
}

/** Adresse à afficher selon les écrans ouverts : celui qui est au premier plan l'emporte. */
export function routePathFor(open: Partial<Record<RoutedScreen, boolean>>): string {
  const byPriority: RoutedScreen[] = ['notifications', 'leaderboard', 'profile', 'rules', 'koraCash', 'social', 'multiplayer'];
  const top = byPriority.find((screen) => open[screen]);
  return top ? ROUTE_PATHS[top] : GAME_HOME_PATH;
}
