/**
 * Navigation déclenchée depuis une notification : « ouvre l'écran concerné, sans action automatique ».
 *
 * Mécanisme volontairement minimal : une demande en attente (cible du hub multijoueur) que
 * l'application lit pour ouvrir le hub, puis que l'écran multijoueur consomme pour choisir
 * le bon onglet. Aucun délai.
 */
export interface HubTarget {
  tab: 'play' | 'rooms' | 'social';
  friendSubTab?: 'FRIENDS' | 'RECEIVED' | 'SENT';
}

let pending: HubTarget | null = null;
const listeners = new Set<() => void>();

export const notificationNavigation = {
  /** Demande l'ouverture du hub multijoueur sur la cible donnée. */
  request(target: HubTarget): void {
    pending = target;
    listeners.forEach((listener) => listener());
  },

  /** Lit la demande en attente sans la consommer. */
  peek(): HubTarget | null {
    return pending;
  },

  /** Lit et efface la demande en attente. */
  consume(): HubTarget | null {
    const current = pending;
    pending = null;
    return current;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
