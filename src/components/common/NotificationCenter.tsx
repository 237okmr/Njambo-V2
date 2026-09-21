import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Info, Shield, Sparkles, TriangleAlert, X } from 'lucide-react';

/**
 * Centre de notifications unique de l'application.
 *
 * Remplace les toasts éparpillés (chacun avec sa position, son z-index et son minuteur) par :
 *  - une seule file, dédoublonnée (même message = un seul toast, minuteur relancé) ;
 *  - un seul emplacement en haut de l'écran, qui respecte l'encoche / la barre d'état (PWA plein écran) ;
 *  - des minuteurs proprement nettoyés (plus de toast coupé trop tôt par un ancien minuteur) ;
 *  - une annonce pour les lecteurs d'écran (role status / alert) ;
 *  - un retrait au toucher ou par glissement vers le haut, sans animation "bounce" permanente.
 */

export type NotificationTone = 'info' | 'success' | 'warning' | 'admin' | 'private';

export interface NotifyOptions {
  message: string;
  title?: string;
  tone?: NotificationTone;
  /** Durée d'affichage en ms (défaut 3500). 0 = reste jusqu'à fermeture manuelle. */
  durationMs?: number;
  /** Clé de dédoublonnage (défaut : le message lui-même). */
  dedupeKey?: string;
}

interface NotificationItem extends Required<Pick<NotifyOptions, 'message' | 'tone'>> {
  id: string;
  key: string;
  title?: string;
}

interface NotificationContextValue {
  notify: (options: NotifyOptions | string) => string;
  dismiss: (id: string) => void;
}

const MAX_VISIBLE = 3;
const DEFAULT_DURATION_MS = 3500;

const NotificationContext = createContext<NotificationContextValue | null>(null);
const ItemsContext = createContext<{ items: NotificationItem[]; dismiss: (id: string) => void }>({
  items: [],
  dismiss: () => {},
});

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<NotificationItem[]>([]);
  // Miroir synchrone de la liste : permet de connaître l'identifiant du toast tout de suite
  // (les mises à jour d'état React ne sont pas garanties synchrones).
  const itemsRef = useRef<NotificationItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const counter = useRef(0);

  const commit = useCallback((next: NotificationItem[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      const timer = timers.current.get(id);
      if (timer) clearTimeout(timer);
      timers.current.delete(id);
      commit(itemsRef.current.filter((item) => item.id !== id));
    },
    [commit]
  );

  const notify = useCallback(
    (options: NotifyOptions | string): string => {
      const opts: NotifyOptions = typeof options === 'string' ? { message: options } : options;
      const key = opts.dedupeKey || opts.message;
      const tone = opts.tone || 'info';
      const durationMs = opts.durationMs ?? DEFAULT_DURATION_MS;

      const current = itemsRef.current;
      const existing = current.find((item) => item.key === key);
      let id: string;

      if (existing) {
        // Même clé déjà affichée : on met à jour l'élément et on relance son minuteur.
        id = existing.id;
        commit(current.map((item) => (item.id === id ? { ...item, message: opts.message, title: opts.title, tone } : item)));
      } else {
        counter.current += 1;
        id = `ntf_${Date.now().toString(36)}_${counter.current}`;
        const next = [...current, { id, key, message: opts.message, title: opts.title, tone }];
        // Au-delà du maximum visible, le plus ancien laisse la place au plus récent.
        const trimmed = next.length > MAX_VISIBLE ? next.slice(next.length - MAX_VISIBLE) : next;
        // Les minuteurs des éléments retirés sont annulés.
        next.filter((item) => !trimmed.includes(item)).forEach((gone) => {
          const t = timers.current.get(gone.id);
          if (t) clearTimeout(t);
          timers.current.delete(gone.id);
        });
        commit(trimmed);
      }

      const previousTimer = timers.current.get(id);
      if (previousTimer) clearTimeout(previousTimer);
      if (durationMs > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), durationMs)
        );
      } else {
        timers.current.delete(id);
      }
      return id;
    },
    [commit, dismiss]
  );

  // Nettoyage global des minuteurs au démontage.
  useEffect(() => {
    const active = timers.current;
    return () => {
      active.forEach((timer) => clearTimeout(timer));
      active.clear();
    };
  }, []);

  const api = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);
  const listValue = useMemo(() => ({ items, dismiss }), [items, dismiss]);

  return (
    <NotificationContext.Provider value={api}>
      <ItemsContext.Provider value={listValue}>{children}</ItemsContext.Provider>
    </NotificationContext.Provider>
  );
};

export function useNotify(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    // Filet de sécurité : ne jamais faire planter le jeu pour une notification.
    return { notify: () => '', dismiss: () => {} };
  }
  return ctx;
}

const TONE_STYLES: Record<NotificationTone, { box: string; icon: string; title: string }> = {
  info: {
    box: 'bg-slate-900/95 border-slate-600/60 text-slate-100',
    icon: 'bg-slate-700/60 text-slate-200',
    title: 'text-slate-300',
  },
  success: {
    box: 'bg-emerald-950/95 border-emerald-500/50 text-emerald-100',
    icon: 'bg-emerald-500/20 text-emerald-300',
    title: 'text-emerald-300',
  },
  warning: {
    box: 'bg-amber-950/95 border-amber-500/50 text-amber-100',
    icon: 'bg-amber-500/20 text-amber-300',
    title: 'text-amber-300',
  },
  admin: {
    box: 'bg-slate-900/95 border-amber-500/50 text-amber-100',
    icon: 'bg-amber-500/20 text-amber-400',
    title: 'text-amber-300',
  },
  private: {
    box: 'bg-purple-950/95 border-purple-500/50 text-purple-100',
    icon: 'bg-purple-500/20 text-purple-300',
    title: 'text-purple-300',
  },
};

const ToneIcon: React.FC<{ tone: NotificationTone }> = ({ tone }) => {
  const cls = 'w-4 h-4';
  if (tone === 'warning') return <TriangleAlert className={cls} />;
  if (tone === 'private') return <Shield className={cls} />;
  if (tone === 'success' || tone === 'admin') return <Sparkles className={cls} />;
  return <Info className={cls} />;
};

/**
 * À placer À L'INTÉRIEUR de <TopNotificationStack> : les toasts, l'invitation, la mise à jour
 * et l'alerte Chasseur de Kora partagent ainsi la même colonne et ne se chevauchent plus.
 */
export const NotificationViewport: React.FC = () => {
  const { items, dismiss } = useContext(ItemsContext);
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence initial={false}>
      {items.map((item) => {
        const style = TONE_STYLES[item.tone];
        const urgent = item.tone === 'warning' || item.tone === 'admin' || item.tone === 'private';
        return (
          <motion.div
            key={item.id}
            layout={!reduceMotion}
            role={urgent ? 'alert' : 'status'}
            aria-live={urgent ? 'assertive' : 'polite'}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.97 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            drag={reduceMotion ? false : 'y'}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.4}
            onDragEnd={(_, info) => {
              if (info.offset.y < -24) dismiss(item.id);
            }}
            onClick={() => dismiss(item.id)}
            className={`pointer-events-auto w-full max-w-sm cursor-pointer select-none rounded-2xl border px-3 py-2.5 shadow-xl backdrop-blur-md flex items-start gap-2.5 ${style.box}`}
          >
            <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${style.icon}`}>
              <ToneIcon tone={item.tone} />
            </span>
            <span className="min-w-0 flex-1">
              {item.title && (
                <span className={`block text-[10px] font-black uppercase tracking-wider ${style.title}`}>
                  {item.title}
                </span>
              )}
              <span className="block break-words text-xs font-semibold leading-snug">{item.message}</span>
            </span>
            <button
              type="button"
              aria-label="Fermer la notification"
              onClick={(e) => {
                e.stopPropagation();
                dismiss(item.id);
              }}
              className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-current opacity-60 transition hover:opacity-100 active:scale-95"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        );
      })}
    </AnimatePresence>
  );
};
