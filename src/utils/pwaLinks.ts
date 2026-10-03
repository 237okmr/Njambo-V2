/** Chemin de la PWA installée : tout lien partagé DOIT rester dans ce scope. */
export const PWA_GAME_PATH = '/game/';

/** Base des liens partagés (invitation, ami, QR, Palmarès) : toujours dans le scope de la PWA. */
export const getPwaShareBase = (): string => `${window.location.origin}${PWA_GAME_PATH}`;
