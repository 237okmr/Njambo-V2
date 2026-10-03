import React, { useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { BellOff, CheckCheck, ChevronRight, Info, Swords, Trash2, UserPlus } from 'lucide-react';
import { NativeScreenHeader } from '../common/NativeScreenHeader';
import { PlayerAvatar } from '../profile/PlayerAvatar';
import { usePlayerProfile } from '../../context/PlayerProfileContext';
import { useNotificationHistory } from '../../hooks/useNotificationHistory';
import {
  HistoryNotification,
  isActionable,
  isExpiredInvite,
  notificationHistory,
} from '../../services/notificationHistoryService';
import { notificationNavigation } from '../../services/notificationNavigation';
import { triggerHaptic } from '../../utils/sound';

/** Distance de glissement (en pixels, pas un délai) à partir de laquelle une notification est supprimée. */
const SWIPE_DELETE_DISTANCE_PX = 90;

function formatRelativeTime(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return "à l'instant";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} j`;
}

interface NotificationRowProps {
  item: HistoryNotification;
  now: number;
  onOpen: (item: HistoryNotification) => void;
  onRemove: (id: string) => void;
}

const NotificationRow: React.FC<NotificationRowProps> = ({ item, now, onOpen, onRemove }) => {
  const reduceMotion = useReducedMotion();
  const draggedRef = useRef(false);
  const actionable = isActionable(item, now);
  const expired = isExpiredInvite(item, now);

  const statusTag = expired
    ? { label: 'Expirée', className: 'bg-slate-800 text-slate-400 border-slate-700' }
    : item.outcome === 'ACCEPTED'
      ? { label: 'Acceptée', className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' }
      : item.outcome === 'DECLINED'
        ? { label: 'Refusée', className: 'bg-rose-500/10 text-rose-300 border-rose-500/30' }
        : null;

  const KindIcon = item.kind === 'DIRECT_INVITE' ? Swords : UserPlus;

  return (
    <motion.li
      layout={!reduceMotion}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -40 }}
      className="relative overflow-hidden rounded-2xl list-none"
    >
      <div className="absolute inset-0 flex items-center justify-end bg-rose-600/90 pr-5" aria-hidden="true">
        <Trash2 className="h-5 w-5 text-white" />
      </div>

      <motion.div
        drag="x"
        dragDirectionLock
        dragMomentum={false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.7, right: 0 }}
        onPointerDown={() => {
          draggedRef.current = false;
        }}
        onDragStart={() => {
          draggedRef.current = true;
        }}
        onDragEnd={(_, info) => {
          if (info.offset.x < -SWIPE_DELETE_DISTANCE_PX) {
            triggerHaptic('light');
            onRemove(item.id);
          }
        }}
        className={`relative flex items-stretch gap-1 rounded-2xl border bg-slate-900 ${
          item.read ? 'border-slate-800/80' : 'border-amber-500/40'
        }`}
      >
        <button
          type="button"
          onClick={() => {
            if (draggedRef.current) {
              draggedRef.current = false;
              return;
            }
            onOpen(item);
          }}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-3 text-left cursor-pointer active:bg-slate-800/60"
        >
          <div className="relative shrink-0">
            <PlayerAvatar avatarId={(item.actorAvatar as any) || 'avatar_1'} size="sm" className="h-10 w-10" />
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-slate-950 shadow">
              <KindIcon className="h-2.5 w-2.5" aria-hidden="true" />
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {!item.read && <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" aria-label="Non lue" />}
              <span className={`truncate text-sm ${item.read ? 'font-bold text-slate-300' : 'font-black text-white'}`}>
                {item.title}
              </span>
            </div>
            <span className="block truncate text-[11px] text-slate-400">{item.body}</span>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="text-[10px] font-medium text-slate-500">{formatRelativeTime(item.createdAt, now)}</span>
              {statusTag && (
                <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-black ${statusTag.className}`}>
                  {statusTag.label}
                </span>
              )}
            </div>
          </div>

          {actionable && (
            <span className="flex h-8 shrink-0 items-center gap-0.5 rounded-lg border border-amber-500/40 bg-amber-500/15 px-2 text-[11px] font-black text-amber-300">
              Voir
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          )}
        </button>

        <button
          type="button"
          aria-label="Supprimer cette notification"
          title="Supprimer"
          onClick={() => {
            triggerHaptic('light');
            onRemove(item.id);
          }}
          className="mr-1 my-auto flex h-11 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-800 hover:text-rose-400 active:scale-95 cursor-pointer"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </motion.div>
    </motion.li>
  );
};

interface NotificationHistoryScreenProps {
  onClose: () => void;
}

/**
 * Écran plein « Notifications » (ouvert par la cloche) : historique local, du plus récent au plus ancien.
 * Un toucher marque la notification comme lue et ouvre l'écran concerné, sans action automatique.
 * Une invitation expirée ou déjà traitée reste visible mais sans bouton d'action.
 */
export const NotificationHistoryScreen: React.FC<NotificationHistoryScreenProps> = ({ onClose }) => {
  const items = useNotificationHistory();
  const { isLoggedIn, loginWithGoogle } = usePlayerProfile();
  const [confirmClear, setConfirmClear] = useState(false);
  const now = Date.now();
  const unread = items.filter((item) => !item.read).length;

  const handleOpen = (item: HistoryNotification) => {
    triggerHaptic('light');
    notificationHistory.markRead(item.id);
    if (!isActionable(item, Date.now())) return;
    onClose();
    notificationNavigation.request({
      tab: 'social',
      friendSubTab: item.kind === 'FRIEND_REQUEST' ? 'RECEIVED' : undefined,
    });
  };

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      id="notification-history-fullscreen"
      className="fixed inset-0 z-[80] bg-slate-950 text-slate-100 flex flex-col overflow-hidden"
    >
      <NativeScreenHeader
        id="native-notifications-header"
        backLabel="Retour"
        onBack={onClose}
        backTitle="Fermer les notifications"
        title="Notifications"
        subtitle={unread > 0 ? `${unread} non lue${unread > 1 ? 's' : ''}` : 'Tout est lu'}
        hideNotificationBell
        rightActions={
          <div className="flex items-center gap-1.5 shrink-0">
            {unread > 0 && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  notificationHistory.markAllRead();
                }}
                className="w-9 h-9 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-emerald-300 border border-slate-700/80 transition-all duration-150 flex items-center justify-center cursor-pointer active:scale-95 shadow-sm shrink-0"
                title="Tout marquer comme lu"
                aria-label="Tout marquer comme lu"
              >
                <CheckCheck className="w-4 h-4 text-emerald-400" />
              </button>
            )}
            {items.length > 0 && (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="h-9 px-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-rose-300 border border-slate-700/80 transition-all duration-150 flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-sm shrink-0 text-xs font-bold"
                title="Tout effacer"
                aria-label="Tout effacer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Tout effacer</span>
              </button>
            )}
          </div>
        }
      />

      {confirmClear && (
        <div className="shrink-0 flex items-center gap-2 border-b border-rose-500/30 bg-rose-500/10 px-3 py-2" role="alert">
          <span className="min-w-0 flex-1 text-xs font-bold text-rose-200">
            Supprimer {items.length} notification{items.length > 1 ? 's' : ''} ?
          </span>
          <button
            type="button"
            onClick={() => setConfirmClear(false)}
            className="h-9 rounded-xl bg-slate-800 px-3 text-xs font-bold text-slate-200 active:scale-95 cursor-pointer"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('heavy');
              notificationHistory.clearAll();
              setConfirmClear(false);
            }}
            className="h-9 rounded-xl bg-rose-600 px-3 text-xs font-black text-white active:scale-95 cursor-pointer"
          >
            Supprimer
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex w-full max-w-md flex-col gap-2">
          {!isLoggedIn && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-sky-500/30 bg-sky-500/10 p-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-sky-100">
                  Ton historique est gardé sur cet appareil seulement. Connecte-toi avec Google pour recevoir aussi
                  les demandes d'amis et mieux protéger ton compte.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    void loginWithGoogle();
                  }}
                  className="mt-2 h-9 rounded-xl bg-white px-3 text-xs font-black text-slate-900 active:scale-95 cursor-pointer"
                >
                  Continuer avec Google
                </button>
              </div>
            </div>
          )}

          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-slate-800/80 bg-slate-900/40 px-6 py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-800">
                <BellOff className="h-7 w-7 text-slate-400" />
              </div>
              <h3 className="text-sm font-bold text-slate-200">Aucune notification</h3>
              <p className="max-w-[240px] text-[11px] text-slate-400">
                Les invitations à une table et les demandes d'amis que tu reçois apparaîtront ici.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2 p-0 m-0">
              <AnimatePresence initial={false}>
                {items.map((item) => (
                  <NotificationRow
                    key={item.id}
                    item={item}
                    now={now}
                    onOpen={handleOpen}
                    onRemove={(id) => notificationHistory.remove(id)}
                  />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>
    </motion.div>
  );
};
