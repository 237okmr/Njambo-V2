import { useSyncExternalStore } from 'react';
import { HistoryNotification, notificationHistory, countUnread } from '../services/notificationHistoryService';

/** Liste des notifications du joueur (la plus récente en premier), mise à jour en temps réel. */
export function useNotificationHistory(): HistoryNotification[] {
  return useSyncExternalStore(notificationHistory.subscribe, notificationHistory.getSnapshot, notificationHistory.getSnapshot);
}

/** Nombre de notifications non lues (pastille de la cloche). */
export function useUnreadNotificationCount(): number {
  const list = useNotificationHistory();
  return countUnread(list);
}

// ---------------------------------------------------------------------------
// Ouverture / fermeture de l'écran plein « Notifications » (état d'interface partagé).
// ---------------------------------------------------------------------------

let screenOpen = false;
const screenListeners = new Set<() => void>();

function setScreenOpen(next: boolean): void {
  if (screenOpen === next) return;
  screenOpen = next;
  screenListeners.forEach((listener) => listener());
}

export const notificationScreen = {
  open: () => setScreenOpen(true),
  close: () => setScreenOpen(false),
  isOpen: () => screenOpen,
  subscribe(listener: () => void): () => void {
    screenListeners.add(listener);
    return () => {
      screenListeners.delete(listener);
    };
  },
};

export function useNotificationScreenOpen(): boolean {
  return useSyncExternalStore(notificationScreen.subscribe, notificationScreen.isOpen, notificationScreen.isOpen);
}
