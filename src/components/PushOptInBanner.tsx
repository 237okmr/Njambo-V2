import React, { useCallback, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { BellRing, Loader2 } from 'lucide-react';
import { pushNotificationService, PushStatus } from '../services/pushNotificationService';
import { triggerHaptic } from '../utils/sound';

const SNOOZE_KEY = 'njambo_push_optin_snooze_until';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function isIOSDevice(): boolean {
  return typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/**
 * Demande de permission au BON moment : quand le joueur attend des adversaires dans un salon
 * (c'est là qu'il quitte l'app), et non au démarrage. Sur iPhone, uniquement si la PWA est installée
 * (les notifications push web n'existent pas autrement). Le refus est mémorisé 7 jours.
 */
export function usePushOptIn(context: { active: boolean; userId: string; userName: string; onResult: (message: string) => void }) {
  const [status, setStatus] = useState<PushStatus>(pushNotificationService.getStatus());
  const [busy, setBusy] = useState(false);
  const [snoozed, setSnoozed] = useState<boolean>(() => {
    try {
      return Number(localStorage.getItem(SNOOZE_KEY) || 0) > Date.now();
    } catch {
      return false;
    }
  });

  useEffect(() => pushNotificationService.subscribeStatus(setStatus), []);

  const eligible =
    status.isSupported &&
    status.permission === 'default' &&
    !status.isSubscribed &&
    (!isIOSDevice() || isStandaloneDisplay());

  const visible = context.active && eligible && !snoozed;

  const later = useCallback(() => {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    } catch {
      // ignore
    }
    setSnoozed(true);
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    triggerHaptic('light');
    const res = await pushNotificationService.enableNotifications({ id: context.userId, name: context.userName });
    setBusy(false);
    if (res.success) {
      triggerHaptic('success');
      context.onResult('Alertes de table activées.');
    } else {
      context.onResult(res.error || "Impossible d'activer les alertes.");
      later();
    }
  }, [context, later]);

  return { visible, busy, enable, later };
}

interface PushOptInBannerProps {
  busy: boolean;
  onEnable: () => void;
  onLater: () => void;
}

export const PushOptInBanner: React.FC<PushOptInBannerProps> = ({ busy, onEnable, onLater }) => {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      role="region"
      aria-label="Activer les alertes de table"
      className="pointer-events-auto w-full max-w-sm rounded-2xl border border-amber-500/40 bg-slate-900/95 p-3 shadow-xl backdrop-blur-xl"
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
          <BellRing className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black text-white">Être prévenu quand la table t'attend ?</p>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
            Invitations, début de partie et avertissements avant forfait, même si tu quittes l'app.
          </p>
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={onLater}
          disabled={busy}
          className="h-11 flex-1 rounded-xl bg-slate-800 text-xs font-bold text-slate-300 transition hover:bg-slate-700 active:scale-95 disabled:opacity-60"
        >
          Plus tard
        </button>
        <button
          type="button"
          onClick={onEnable}
          disabled={busy}
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-xs font-black text-slate-950 shadow-md shadow-amber-500/20 transition active:scale-95 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
          Activer
        </button>
      </div>
    </motion.div>
  );
};
