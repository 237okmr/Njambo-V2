import React from 'react';

interface TopNotificationStackProps {
  children: React.ReactNode;
}

/**
 * Colonne unique de notifications, ancrée en haut de l'écran.
 * Tout ce qui est temporaire (invitation, alerte Kora, toasts, mise à jour, version) s'y empile
 * au lieu de se superposer. Le décalage tient compte de l'encoche / de la barre d'état (PWA plein écran).
 * Les modales critiques (z-[9999]+) restent au-dessus.
 */
export const TopNotificationStack: React.FC<TopNotificationStackProps> = ({ children }) => {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 px-3"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
      {children}
    </div>
  );
};
