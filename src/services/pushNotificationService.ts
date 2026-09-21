// Web Push Notifications & Badging Client Service (PWA / Mobile & Desktop)
import { auth } from '../lib/firebase';
import { getPlayerId } from './identity';

/** URL d'ouverture d'une table : DOIT rester dans le scope de la PWA (/game/). */
export const buildGameUrl = (roomCode?: string): string =>
  roomCode ? `/game/?join=${encodeURIComponent(roomCode)}` : '/game/';

/** En-têtes d'identité : jeton Firebase pour les comptes Google, rien pour les invités. */
async function getPushAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const token = await auth.currentUser?.getIdToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // invité ou hors-ligne : on continue sans jeton
  }
  return headers;
}
export interface PushUserProfile {
  id: string;
  name: string;
}

export type PushPermissionStatus = 'unsupported' | 'default' | 'granted' | 'denied';

export interface PushPreferences {
  turnReminders: boolean;
  directInvites: boolean;
  rematches: boolean;
  gameStartAlerts: boolean;
  tableAlerts: boolean;
  hostJoinAlerts: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: number; // 0-23 (e.g. 23)
  quietHoursEnd: number; // 0-23 (e.g. 8)
}

export const DEFAULT_PUSH_PREFERENCES: PushPreferences = {
  turnReminders: true,
  directInvites: true,
  rematches: true,
  gameStartAlerts: true,
  tableAlerts: true,
  hostJoinAlerts: true,
  quietHoursEnabled: false,
  quietHoursStart: 23,
  quietHoursEnd: 8,
};

export interface PushStatus {
  isSupported: boolean;
  permission: PushPermissionStatus;
  isSubscribed: boolean;
  isLoading: boolean;
  subscribersCount?: number;
  preferences: PushPreferences;
}

type PushStatusListener = (status: PushStatus) => void;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function sameKey(existing: ArrayBuffer | null | undefined, expected: Uint8Array): boolean {
  if (!existing) return false;
  const a = new Uint8Array(existing);
  if (a.length !== expected.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== expected[i]) return false;
  return true;
}

class PushNotificationService {
  private status: PushStatus = {
    isSupported: false,
    permission: 'unsupported',
    isSubscribed: false,
    isLoading: false,
    subscribersCount: 0,
    preferences: DEFAULT_PUSH_PREFERENCES,
  };
  private listeners: Set<PushStatusListener> = new Set();
  private lastTurnNotifTimestamp: number = 0;

  constructor() {
    this.loadPreferences();
    this.checkInitialStatus();
  }

  private loadPreferences(): void {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem('njambo_push_preferences');
      if (saved) {
        this.status.preferences = { ...DEFAULT_PUSH_PREFERENCES, ...JSON.parse(saved) };
      }
    } catch (e) {
      this.status.preferences = DEFAULT_PUSH_PREFERENCES;
    }
  }

  public updatePreferences(newPrefs: Partial<PushPreferences>): void {
    this.status.preferences = { ...this.status.preferences, ...newPrefs };
    try {
      localStorage.setItem('njambo_push_preferences', JSON.stringify(this.status.preferences));
    } catch (e) {}
    this.notifyListeners();
    this.schedulePreferencesSync();
  }

  private prefsSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private lastProfile: PushUserProfile | null = null;

  /** Préférences envoyées au serveur : seul lui peut réellement empêcher un envoi (appli fermée). */
  private serverPreferences() {
    return { ...this.status.preferences, tzOffsetMinutes: -new Date().getTimezoneOffset() };
  }

  private schedulePreferencesSync(): void {
    if (!this.status.isSubscribed || !this.lastProfile) return;
    if (this.prefsSyncTimer) clearTimeout(this.prefsSyncTimer);
    this.prefsSyncTimer = setTimeout(async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!sub || !this.lastProfile) return;
        await fetch('/api/push/preferences', {
          method: 'POST',
          headers: await getPushAuthHeaders(),
          body: JSON.stringify({
            userId: this.lastProfile.id,
            endpoint: sub.endpoint,
            preferences: this.serverPreferences(),
          }),
        });
      } catch (e) {
        console.warn('[PushService] Preferences sync failed:', e);
      }
    }, 600);
  }

  /**
   * Resynchronise l'abonnement avec le serveur SANS redemander la permission :
   * au démarrage, après un changement d'identité (connexion Google), quand le navigateur
   * renouvelle l'abonnement, ou quand le serveur a changé de clé VAPID.
   */
  public async syncSubscription(profile: PushUserProfile): Promise<void> {
    if (typeof window === 'undefined') return;
    // Le statut (support, permission, abonnement existant) est déterminé de façon asynchrone :
    // on l'attend, sinon la resynchronisation du démarrage serait ignorée à tort.
    await this.checkInitialStatus();
    // Identifiant canonique du joueur (UID Google ou identifiant invité "usr_…") : c'est celui que le serveur
    // utilise pour envoyer les notifications, quel que soit l'écran qui appelle.
    profile = { id: getPlayerId(), name: profile.name };
    this.lastProfile = profile;
    if (!this.status.isSupported) return;
    if (Notification.permission !== 'granted') return;
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      const keyRes = await fetch('/api/push/public-key');
      if (!keyRes.ok) return;
      const { publicKey } = await keyRes.json();
      if (!publicKey) return;
      const expected = urlBase64ToUint8Array(publicKey);

      // Abonnement créé avec une ancienne clé VAPID => inutilisable, on le remplace en silence.
      if (sub && !sameKey(sub.options?.applicationServerKey, expected)) {
        await sub.unsubscribe();
        sub = null;
      }
      if (!sub) {
        if (!this.status.isSubscribed) return; // l'utilisateur n'avait pas activé les notifications
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: expected });
      }

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: await getPushAuthHeaders(),
        body: JSON.stringify({
          userId: profile.id,
          userName: profile.name,
          subscription: sub.toJSON(),
          userAgent: navigator.userAgent,
          preferences: this.serverPreferences(),
        }),
      });
      this.status.isSubscribed = true;
      this.notifyListeners();
    } catch (err) {
      console.warn('[PushService] syncSubscription failed:', err);
    }
  }

  /** Ferme les notifications système restées dans le tiroir quand le joueur revient dans l'app. */
  public async clearDeliveredNotifications(): Promise<void> {
    try {
      if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
      const reg = await navigator.serviceWorker.ready;
      const list = await reg.getNotifications();
      list.forEach((n) => n.close());
      await this.clearBadge();
    } catch {
      // ignore
    }
  }

  public getPreferences(): PushPreferences {
    return this.status.preferences;
  }

  public isQuietHoursActive(): boolean {
    if (!this.status.preferences.quietHoursEnabled) return false;
    const currentHour = new Date().getHours();
    const { quietHoursStart, quietHoursEnd } = this.status.preferences;

    if (quietHoursStart > quietHoursEnd) {
      // Overnight (e.g. 23h to 8h)
      return currentHour >= quietHoursStart || currentHour < quietHoursEnd;
    } else {
      return currentHour >= quietHoursStart && currentHour < quietHoursEnd;
    }
  }

  public async checkInitialStatus(): Promise<PushStatus> {
    if (typeof window === 'undefined') return this.status;

    const isSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (!isSupported) {
      this.status = {
        ...this.status,
        isSupported: false,
        permission: 'unsupported',
        isSubscribed: false,
        isLoading: false,
      };
      this.notifyListeners();
      return this.status;
    }

    const permission = (Notification.permission as PushPermissionStatus) || 'default';
    let isSubscribed = false;

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      isSubscribed = !!sub;
    } catch (err) {
      console.warn('[PushService] Could not check subscription:', err);
    }

    this.status = {
      ...this.status,
      isSupported: true,
      permission,
      isSubscribed,
      isLoading: false,
    };

    this.notifyListeners();
    return this.status;
  }

  public getStatus(): PushStatus {
    return this.status;
  }

  public subscribeStatus(listener: PushStatusListener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((l) => l({ ...this.status }));
  }

  // App Badging API on mobile home screen / PWA icon
  public async setBadgeCount(count: number): Promise<void> {
    if (typeof navigator === 'undefined') return;
    try {
      if ('setAppBadge' in navigator) {
        if (count > 0) {
          await (navigator as any).setAppBadge(count);
        } else {
          await (navigator as any).clearAppBadge();
        }
      }
    } catch (e) {
      // ignore
    }
  }

  public async clearBadge(): Promise<void> {
    if (typeof navigator === 'undefined') return;
    try {
      if ('clearAppBadge' in navigator) {
        await (navigator as any).clearAppBadge();
      }
    } catch (e) {
      // ignore
    }
  }

  // Local In-Game background notification
  public async triggerLocalGameNotification(options: {
    title: string;
    body: string;
    roomCode?: string;
    tag?: string;
    type?: 'YOUR_TURN' | 'GAME_START' | 'INVITE';
  }): Promise<void> {
    if (this.isQuietHoursActive()) return;

    if (options.type === 'YOUR_TURN' && !this.status.preferences.turnReminders) return;
    if (options.type === 'GAME_START' && !this.status.preferences.gameStartAlerts) return;

    // Avoid spamming your turn notification
    if (options.type === 'YOUR_TURN') {
      const now = Date.now();
      if (now - this.lastTurnNotifTimestamp < 8000) return;
      this.lastTurnNotifTimestamp = now;
    }

    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(options.title, {
          body: options.body,
          icon: '/icon-192.png',
          badge: '/badge-96.png',
          tag: options.tag || 'njambo-local-alert',
          data: {
            roomCode: options.roomCode,
            url: buildGameUrl(options.roomCode),
            type: options.type,
          },
          renotify: true,
          ...({ vibrate: [150, 80, 150] } as any),
        });
      }
    } catch (err) {
      console.warn('[PushService] Local notification failed:', err);
    }
  }

  public async enableNotifications(profile: PushUserProfile | { id: string; name: string }): Promise<{ success: boolean; error?: string }> {
    if (!this.status.isSupported) {
      return { success: false, error: 'Les notifications Push ne sont pas supportées par votre navigateur.' };
    }

    // L'identifiant reçu de l'écran appelant peut être un repli (« guest ») ou un identifiant de session de salle :
    // on utilise toujours l'identifiant canonique du joueur.
    profile = { id: getPlayerId(), name: profile.name };

    this.status.isLoading = true;
    this.notifyListeners();

    try {
      // 1. Request Browser Permission
      const perm = await Notification.requestPermission();
      this.status.permission = perm as PushPermissionStatus;
      if (perm !== 'granted') {
        this.status.isLoading = false;
        this.status.isSubscribed = false;
        this.notifyListeners();
        return {
          success: false,
          error: perm === 'denied'
            ? 'Notifications bloquées dans les paramètres de votre navigateur.'
            : 'Permission refusée.',
        };
      }

      // 2. Fetch server VAPID public key
      const keyRes = await fetch('/api/push/public-key');
      if (!keyRes.ok) throw new Error('Impossible de récupérer la clé VAPID du serveur.');
      const keyData = await keyRes.json();
      const vapidPublicKey = keyData.publicKey;
      if (!vapidPublicKey) throw new Error('Clé VAPID publique introuvable.');

      // 3. Service worker prêt
      const reg = await navigator.serviceWorker.ready;

      // 4. Abonnement push (on remplace un abonnement créé avec une autre clé VAPID)
      const convertedKey = urlBase64ToUint8Array(vapidPublicKey);
      let subscription = await reg.pushManager.getSubscription();
      if (subscription && !sameKey(subscription.options?.applicationServerKey, convertedKey)) {
        await subscription.unsubscribe();
        subscription = null;
      }
      if (!subscription) {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedKey,
        });
      }

      // 5. Enregistrement côté serveur (identité vérifiée + préférences)
      this.lastProfile = { id: profile.id, name: profile.name };
      const saveRes = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: await getPushAuthHeaders(),
        body: JSON.stringify({
          userId: profile.id,
          userName: profile.name,
          subscription: subscription.toJSON(),
          userAgent: navigator.userAgent,
          preferences: this.serverPreferences(),
        }),
      });

      if (!saveRes.ok) throw new Error('Erreur lors de l’enregistrement de l’abonnement sur le serveur.');

      this.status.isSubscribed = true;
      this.status.isLoading = false;
      this.notifyListeners();
      return { success: true };
    } catch (err: any) {
      console.error('[PushService] Error enabling push:', err);
      this.status.isLoading = false;
      this.notifyListeners();
      return { success: false, error: err?.message || 'Erreur lors de l’activation des notifications.' };
    }
  }

  public async disableNotifications(_userId?: string): Promise<{ success: boolean; error?: string }> {
    const userId = getPlayerId();
    this.status.isLoading = true;
    this.notifyListeners();

    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();

        // Notify server
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: await getPushAuthHeaders(),
          body: JSON.stringify({ userId, endpoint }),
        }).catch(() => {});
      }

      this.status.isSubscribed = false;
      this.status.isLoading = false;
      this.notifyListeners();
      return { success: true };
    } catch (err: any) {
      console.error('[PushService] Error disabling push:', err);
      this.status.isLoading = false;
      this.notifyListeners();
      return { success: false, error: err?.message || 'Erreur lors de la désactivation.' };
    }
  }

  public async sendTestNotification(_userId?: string): Promise<{ success: boolean; error?: string }> {
    const userId = getPlayerId();
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return { success: false, error: 'Aucun abonnement actif sur cet appareil.' };
      const res = await fetch('/api/push/send-test', {
        method: 'POST',
        headers: await getPushAuthHeaders(),
        body: JSON.stringify({ userId, endpoint: sub.endpoint }),
      });
      const data = await res.json();
      if (!data.success) {
        return { success: false, error: data.error || 'Échec de l’envoi de la notification test.' };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erreur réseau.' };
    }
  }
}

export const pushNotificationService = new PushNotificationService();
