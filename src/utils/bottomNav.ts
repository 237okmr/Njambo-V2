/**
 * Barre de navigation du bas : quand elle s'affiche et quel onglet est actif. Fonctions pures.
 * Elle ne sert qu'à passer d'un écran principal à l'autre, jamais pendant une partie ni une tâche en cours.
 */

export type BottomNavItem = 'home' | 'koraCash' | 'leaderboard' | 'profile';

export interface BottomNavContext {
  isOnHomeScreen: boolean;
  isInRoomLobby: boolean;
  /** Écran ou fenêtre qui recouvre tout : règles, notifications, préparation d'une partie, parties sauvegardées… */
  isSecondaryScreenOpen: boolean;
}

export function isBottomNavVisible(context: BottomNavContext): boolean {
  return context.isOnHomeScreen && !context.isInRoomLobby && !context.isSecondaryScreenOpen;
}

/** Le dernier écran ouvert l'emporte, dans le même ordre que l'adresse affichée. */
export function activeBottomNavItem(open: { leaderboard: boolean; profile: boolean; koraCash: boolean }): BottomNavItem {
  if (open.leaderboard) return 'leaderboard';
  if (open.profile) return 'profile';
  if (open.koraCash) return 'koraCash';
  return 'home';
}
