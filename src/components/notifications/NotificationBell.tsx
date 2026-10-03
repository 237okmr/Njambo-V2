import React from 'react';
import { Bell } from 'lucide-react';
import { notificationScreen, useUnreadNotificationCount } from '../../hooks/useNotificationHistory';
import { triggerHaptic } from '../../utils/sound';

/**
 * Cloche des notifications : ouvre l'écran plein de l'historique.
 * La pastille affiche le nombre de notifications non lues et baisse à chaque lecture.
 * Mêmes tokens visuels que les autres boutons de header (h-9, rounded-xl).
 */
export const NotificationBell: React.FC = () => {
  const unread = useUnreadNotificationCount();
  const label = unread > 0 ? `Notifications (${unread} non lue${unread > 1 ? 's' : ''})` : 'Notifications';

  return (
    <button
      type="button"
      id="btn-header-notifications"
      onClick={() => {
        triggerHaptic('light');
        notificationScreen.open();
      }}
      className="relative w-9 h-9 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-amber-300 border border-slate-700/80 transition-all duration-150 flex items-center justify-center cursor-pointer active:scale-95 shadow-sm shrink-0"
      title={label}
      aria-label={label}
    >
      <Bell className={`w-4 h-4 ${unread > 0 ? 'text-amber-400' : 'text-slate-400'}`} />
      {unread > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black leading-none flex items-center justify-center shadow ring-2 ring-slate-900">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );
};
