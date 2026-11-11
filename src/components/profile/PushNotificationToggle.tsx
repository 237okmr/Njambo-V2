import React, { useState, useEffect } from 'react';
import {
  Bell,
  BellOff,
  BellRing,
  Smartphone,
  Check,
  AlertCircle,
  Loader2,
  Sparkles,
  Sliders,
  Moon,
  Clock,
  Swords,
  UserCheck,
  Timer,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { pushNotificationService, PushStatus, PushPreferences } from '../../services/pushNotificationService';
import { triggerHaptic } from '../../utils/sound';
import { useIsGameAdmin } from '../../hooks/useIsGameAdmin';

interface PushNotificationToggleProps {
  userId: string;
  userName: string;
  onToast?: (message: string) => void;
}

export const PushNotificationToggle: React.FC<PushNotificationToggleProps> = ({
  userId,
  userName,
  onToast,
}) => {
  const [status, setStatus] = useState<PushStatus>(pushNotificationService.getStatus());
  const [isTesting, setIsTesting] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const isAdmin = useIsGameAdmin();

  useEffect(() => {
    // Check iOS and Standalone status
    if (typeof window !== 'undefined') {
      const userAgent = window.navigator.userAgent.toLowerCase();
      const iOSDevice = /iphone|ipad|ipod/.test(userAgent);
      setIsIOS(iOSDevice);

      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsStandalone(standalone);
    }

    const unsubscribe = pushNotificationService.subscribeStatus((newStatus) => {
      setStatus(newStatus);
    });
    return () => unsubscribe();
  }, []);

  const handleToggle = async () => {
    triggerHaptic('light');
    if (status.isSubscribed) {
      const res = await pushNotificationService.disableNotifications(userId);
      if (res.success) {
        onToast?.('Notifications désactivées.');
      } else {
        onToast?.(res.error || 'Les notifications n’ont pas pu être désactivées. Réessaie dans un instant.');
      }
    } else {
      const res = await pushNotificationService.enableNotifications({ id: userId, name: userName });
      if (res.success) {
        triggerHaptic('success');
        onToast?.('Notifications activées.');
      } else {
        onToast?.(res.error || 'Impossible d’activer les notifications.');
      }
    }
  };

  const handleSendTest = async () => {
    triggerHaptic('light');
    setIsTesting(true);
    const res = await pushNotificationService.sendTestNotification(userId);
    setIsTesting(false);
    if (res.success) {
      triggerHaptic('success');
      onToast?.('Notification envoyée sur ton appareil.');
    } else {
      onToast?.(res.error || 'La notification n’a pas pu être envoyée. Réessaie dans un instant.');
    }
  };

  const handleUpdatePref = (key: keyof PushPreferences, val: any) => {
    triggerHaptic('light');
    pushNotificationService.updatePreferences({ [key]: val });
  };

  const prefs = status.preferences;

  return (
    <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md flex flex-col gap-3.5">
      {/* Header Row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
            status.isSubscribed
              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
              : 'bg-amber-500/20 border-amber-500/40 text-amber-400'
          }`}>
            {status.isSubscribed ? <BellRing className="w-5 h-5 animate-pulse" /> : <Bell className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-white">Notifications</span>
              {status.isSubscribed ? (
                <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                  <Check className="w-2.5 h-2.5" />
                  Actif
                </span>
              ) : (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  Désactivé
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              Reçois les invitations de tes amis, les rappels de tour et les défis même lorsque le jeu est fermé.
            </p>
          </div>
        </div>
      </div>

      {/* iOS Special Notice */}
      {isIOS && !isStandalone && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-300">
          <Smartphone className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 leading-snug">
            <strong>Sur iPhone (iOS 16.4+) :</strong> Pour recevoir les notifications, installe d'abord le jeu sur ton écran d'accueil (bouton <strong>Partager</strong> <span className="underline">Sur l'écran d'accueil</span>).
          </div>
        </div>
      )}

      {/* Blocked in Browser Notice */}
      {status.permission === 'denied' && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-300">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1 leading-snug">
            Les notifications sont <strong>bloquées</strong>.{' '}
            {isIOS
              ? "Ouvre Réglages › Notifications › Njambo Kora pour les autoriser."
              : isStandalone
                ? "Ouvre les paramètres du téléphone › Applications › Njambo Kora › Notifications pour les autoriser."
                : "Touche le cadenas dans la barre d'adresse pour les autoriser."}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
        <button
          type="button"
          onClick={handleToggle}
          disabled={status.isLoading || status.permission === 'denied'}
          className={`flex-1 min-h-[40px] px-4 rounded-xl font-black text-xs transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer ${
            status.isSubscribed
              ? 'bg-slate-800 hover:bg-slate-700 text-rose-400 hover:text-rose-300 border border-slate-700'
              : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 shadow-md shadow-amber-500/20'
          }`}
        >
          {status.isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Configuration...</span>
            </>
          ) : status.isSubscribed ? (
            <>
              <BellOff className="w-4 h-4" />
              <span>Désactiver</span>
            </>
          ) : (
            <>
              <BellRing className="w-4 h-4" />
              <span>Activer les notifications</span>
            </>
          )}
        </button>

        {status.isSubscribed && (
          <>
            {isAdmin && (
              <button
                type="button"
                onClick={handleSendTest}
                disabled={isTesting}
                className="min-h-[40px] px-3.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition active:scale-95 flex items-center gap-1.5 cursor-pointer shrink-0"
                title="Essayer les notifications"
              >
                {isTesting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span>Essayer</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="min-h-[40px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0"
              title="Préférences détaillées"
            >
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </>
        )}
      </div>

      {/* Advanced Fine-Grained Preferences */}
      {status.isSubscribed && showAdvanced && (
        <div className="pt-3 border-t border-slate-800/80 flex flex-col gap-2.5 animate-in fade-in slide-in-from-top-2 duration-150 text-xs">
          <span className="font-bold text-slate-300 text-xs uppercase tracking-wider flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-amber-400" /> Préférences des alertes
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* Direct Invites */}
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-slate-200 font-medium">Invitations et revanches</span>
              </div>
              <input
                type="checkbox"
                checked={prefs.directInvites}
                onChange={(e) => handleUpdatePref('directInvites', e.target.checked)}
                className="w-4 h-4 rounded text-amber-500 accent-amber-500 cursor-pointer"
              />
            </div>

            {/* Turn Reminders */}
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Timer className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-slate-200 font-medium">Rappels "À toi de jouer"</span>
              </div>
              <input
                type="checkbox"
                checked={prefs.turnReminders}
                onChange={(e) => handleUpdatePref('turnReminders', e.target.checked)}
                className="w-4 h-4 rounded text-emerald-500 accent-emerald-500 cursor-pointer"
              />
            </div>

            {/* Table alerts (critical) */}
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between sm:col-span-2">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <div className="min-w-0">
                  <span className="block text-slate-200 font-medium">Alertes de table (déconnexion, forfait)</span>
                  <span className="block text-xs text-slate-500">Jamais coupées par le mode nuit pendant une partie.</span>
                </div>
              </div>
              <input
                type="checkbox"
                aria-label="Alertes de table"
                checked={prefs.tableAlerts}
                onChange={(e) => handleUpdatePref('tableAlerts', e.target.checked)}
                className="w-5 h-5 rounded text-rose-500 accent-rose-500 cursor-pointer shrink-0"
              />
            </div>

            {/* Host Join Alerts */}
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between sm:col-span-2">
              <div className="flex items-center gap-2 min-w-0">
                <BellRing className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <span className="block text-slate-200 font-medium">Arrivée d'un joueur à ma table</span>
                  <span className="block text-xs text-slate-500">Prévenir quand un joueur rejoint une table dont je suis l'hôte absent.</span>
                </div>
              </div>
              <input
                type="checkbox"
                aria-label="Arrivée d'un joueur"
                checked={prefs.hostJoinAlerts ?? true}
                onChange={(e) => handleUpdatePref('hostJoinAlerts', e.target.checked)}
                className="w-4 h-4 rounded text-emerald-500 accent-emerald-500 cursor-pointer shrink-0"
              />
            </div>

            {/* Rank changes */}
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <BellRing className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <span className="block text-slate-200 font-medium">Changements de rang</span>
                  <span className="block text-xs text-slate-500">Rang perdu ou nouveau meilleur rang, jamais la nuit</span>
                </div>
              </div>
              <input
                type="checkbox"
                aria-label="Changements de rang"
                checked={prefs.rankChanges ?? true}
                onChange={(e) => handleUpdatePref('rankChanges', e.target.checked)}
                className="w-4 h-4 rounded text-emerald-500 accent-emerald-500 cursor-pointer shrink-0"
              />
            </div>

            {/* Appels « je cherche une partie » */}
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <BellRing className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <span className="block text-slate-200 font-medium">Quelqu’un cherche une partie</span>
                  <span className="block text-xs text-slate-500">Un ami (ou un joueur) lance un appel</span>
                </div>
              </div>
              <input
                type="checkbox"
                aria-label="Quelqu’un cherche une partie"
                checked={prefs.searchCalls ?? true}
                onChange={(e) => handleUpdatePref('searchCalls', e.target.checked)}
                className="w-4 h-4 rounded text-emerald-500 accent-emerald-500 cursor-pointer shrink-0"
              />
            </div>

            {/* Game Start Alerts */}
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between sm:col-span-2">
              <div className="flex items-center gap-2">
                <BellRing className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-slate-200 font-medium">Début de manche</span>
              </div>
              <input
                type="checkbox"
                checked={prefs.gameStartAlerts}
                onChange={(e) => handleUpdatePref('gameStartAlerts', e.target.checked)}
                className="w-4 h-4 rounded text-slate-500 accent-slate-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Quiet Hours Mode */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Moon className="w-4 h-4 text-slate-400" />
                <span className="text-slate-200 font-semibold">Mode nuit silencieux</span>
              </div>
              <input
                type="checkbox"
                checked={prefs.quietHoursEnabled}
                onChange={(e) => handleUpdatePref('quietHoursEnabled', e.target.checked)}
                className="w-4 h-4 rounded text-slate-500 accent-slate-500 cursor-pointer"
              />
            </div>
            {prefs.quietHoursEnabled && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 pt-1 border-t border-slate-900">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Silencieux de</span>
                <select aria-label="Début du mode nuit" value={prefs.quietHoursStart}
                  onChange={(e) => handleUpdatePref('quietHoursStart', Number(e.target.value))}
                  className="min-h-[36px] rounded-lg border border-slate-700 bg-slate-900 px-2 font-bold text-slate-200">
                  {Array.from({ length: 24 }, (_, h) => (<option key={h} value={h}>{h}h00</option>))}
                </select>
                <span>à</span>
                <select aria-label="Fin du mode nuit" value={prefs.quietHoursEnd}
                  onChange={(e) => handleUpdatePref('quietHoursEnd', Number(e.target.value))}
                  className="min-h-[36px] rounded-lg border border-slate-700 bg-slate-900 px-2 font-bold text-slate-200">
                  {Array.from({ length: 24 }, (_, h) => (<option key={h} value={h}>{h}h00</option>))}
                </select>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
