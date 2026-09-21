import webpush from 'web-push';
import crypto from 'crypto';
import { db } from '../src/lib/firebase';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';

export interface PushSubscriptionData {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export type PushType =
  | 'INVITATION'
  | 'GAME_START'
  | 'YOUR_TURN'
  | 'DISCONNECTED'
  | 'FORFEIT_WARNING'
  | 'FORFEIT_DECLARED'
  | 'PLAYER_JOINED'
  | 'SYSTEM';

/** Alertes « table en danger » : jamais coupées par le mode nuit quand le joueur est assis à une table. */
const CRITICAL_TYPES: PushType[] = ['DISCONNECTED', 'FORFEIT_WARNING', 'FORFEIT_DECLARED'];

/** Préférences choisies par le joueur dans l'app, synchronisées avec l'abonnement. */
export interface ServerPushPreferences {
  turnReminders: boolean;
  directInvites: boolean;
  rematches: boolean;
  gameStartAlerts: boolean;
  tableAlerts: boolean; // déconnexion / avertissements de forfait
  hostJoinAlerts?: boolean; // notification quand un joueur rejoint la table de l'hôte
  quietHoursEnabled: boolean;
  quietHoursStart: number; // 0-23, heure locale du joueur
  quietHoursEnd: number; // 0-23, heure locale du joueur
  tzOffsetMinutes: number; // décalage local du joueur par rapport à UTC (ex. Cameroun = 60)
}

export const DEFAULT_SERVER_PUSH_PREFERENCES: ServerPushPreferences = {
  turnReminders: true,
  directInvites: true,
  rematches: true,
  gameStartAlerts: true,
  tableAlerts: true,
  hostJoinAlerts: true,
  quietHoursEnabled: false,
  quietHoursStart: 23,
  quietHoursEnd: 8,
  tzOffsetMinutes: 60,
};

export interface UserSubscriptionRecord {
  userId: string;
  userName?: string;
  subscription: PushSubscriptionData;
  createdAt: number;
  userAgent?: string;
  preferences?: ServerPushPreferences;
}

/**
 * Durée de vie et priorité par type : une alerte de tour n'a aucun sens 1 h plus tard
 * (le tour dure ~15 s), alors qu'une invitation reste valable 2 minutes côté serveur.
 */
const PUSH_POLICY: Record<PushType, { ttl: number; urgency: 'high' | 'normal' }> = {
  INVITATION: { ttl: 120, urgency: 'high' },
  GAME_START: { ttl: 300, urgency: 'high' },
  YOUR_TURN: { ttl: 30, urgency: 'high' },
  DISCONNECTED: { ttl: 180, urgency: 'high' },
  FORFEIT_WARNING: { ttl: 60, urgency: 'high' },
  FORFEIT_DECLARED: { ttl: 600, urgency: 'normal' },
  PLAYER_JOINED: { ttl: 120, urgency: 'high' },
  SYSTEM: { ttl: 3600, urgency: 'normal' },
};

/**
 * URL de destination d'une notification. Elle DOIT rester dans le scope de la PWA ("/game/"),
 * sinon Chrome Android ouvre le navigateur au lieu de l'application installée.
 */
export function buildGameUrl(roomCode?: string): string {
  return roomCode ? `/game/?join=${encodeURIComponent(roomCode)}` : '/game/';
}

function sanitizeTopic(tag?: string): string | undefined {
  if (!tag) return undefined;
  const cleaned = tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
  return cleaned || undefined;
}

export function isTypeAllowed(type: PushType | undefined, prefs: ServerPushPreferences): boolean {
  switch (type) {
    case 'YOUR_TURN':
      return prefs.turnReminders;
    case 'INVITATION':
      return prefs.directInvites;
    case 'GAME_START':
      return prefs.gameStartAlerts;
    case 'DISCONNECTED':
    case 'FORFEIT_WARNING':
    case 'FORFEIT_DECLARED':
      return prefs.tableAlerts;
    case 'PLAYER_JOINED':
      return prefs.hostJoinAlerts ?? true;
    default:
      return true; // SYSTEM (test, messages admin) : toujours livré
  }
}

export function isQuietNow(prefs: ServerPushPreferences, nowMs: number = Date.now()): boolean {
  if (!prefs.quietHoursEnabled) return false;
  const localHour = new Date(nowMs + (prefs.tzOffsetMinutes || 0) * 60_000).getUTCHours();
  const { quietHoursStart: start, quietHoursEnd: end } = prefs;
  return start > end ? localHour >= start || localHour < end : localHour >= start && localHour < end;
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: {
    type?: PushType;
    app?: 'game' | 'copilot';
    sentAt?: number;
    roomCode?: string;
    inviteId?: string;
    fromUserId?: string;
    fromUserName?: string;
    url?: string;
    [key: string]: any;
  };
}

function getSubscriptionId(userId: string, endpoint: string): string {
  const hash = crypto.createHash('sha256').update(endpoint).digest('hex');
  return `${userId}_${hash.slice(0, 32)}`;
}

class PushService {
  private vapidPublicKey: string = '';
  private vapidPrivateKey: string = '';
  private vapidPersistent: boolean = false;
  private subscriptions: Map<string, UserSubscriptionRecord[]> = new Map(); // userId -> subscriptions (In-memory fallback cache)

  constructor() {
    this.initVapidKeys();
  }

  private initVapidKeys() {
    // Check if environment variables exist, otherwise generate a consistent key pair
    const envPublic = process.env.VAPID_PUBLIC_KEY;
    const envPrivate = process.env.VAPID_PRIVATE_KEY;

    if (envPublic && envPrivate) {
      this.vapidPublicKey = envPublic;
      this.vapidPrivateKey = envPrivate;
      this.vapidPersistent = true;
    } else {
      // Clés temporaires : valables uniquement jusqu'au prochain redémarrage du serveur.
      // Tous les abonnements créés avec elles deviendront invalides (erreurs 401/403 au prochain envoi).
      // => définir VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY dans les Secrets et ne plus jamais les régénérer.
      const generated = webpush.generateVAPIDKeys();
      this.vapidPublicKey = generated.publicKey;
      this.vapidPrivateKey = generated.privateKey;
      console.error(
        '[PushService] ⚠️ VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY absentes : clés TEMPORAIRES générées. ' +
        'Les notifications push cesseront de fonctionner à chaque redémarrage du serveur.'
      );
    }

    try {
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:support@njambokora.com',
        this.vapidPublicKey,
        this.vapidPrivateKey
      );
      console.log('[PushService] Web Push VAPID configured successfully');
    } catch (err) {
      console.error('[PushService] Failed to set VAPID details:', err);
    }
  }

  public getPublicKey(): string {
    return this.vapidPublicKey;
  }

  public isVapidPersistent(): boolean {
    return this.vapidPersistent;
  }

  public registerSubscription(
    userId: string,
    userName: string | undefined,
    subscription: PushSubscriptionData,
    userAgent?: string,
    preferences?: Partial<ServerPushPreferences>
  ): boolean {
    if (!userId || !subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return false;
    }

    const prefs: ServerPushPreferences = { ...DEFAULT_SERVER_PUSH_PREFERENCES, ...(preferences || {}) };

    if (db) {
      const docId = getSubscriptionId(userId, subscription.endpoint);
      setDoc(doc(db, 'push_subscriptions', docId), {
        userId,
        userName: userName || 'Anonyme',
        subscription,
        createdAt: Date.now(),
        userAgent: userAgent || '',
        preferences: prefs,
      }).catch((err: any) => {
        console.error(`[PushService] Failed to save push subscription to Firestore for user ${userId}:`, err);
      });
    }

    // Miroir mémoire (repli si Firestore est indisponible)
    const existing = this.subscriptions.get(userId) || [];
    const filtered = existing.filter((s) => s.subscription.endpoint !== subscription.endpoint);
    filtered.push({ userId, userName, subscription, createdAt: Date.now(), userAgent, preferences: prefs });
    this.subscriptions.set(userId, filtered);
    return true;
  }

  /** Met à jour les préférences d'un appareil déjà abonné (changement dans l'écran Profil). */
  public updatePreferences(userId: string, endpoint: string, preferences: Partial<ServerPushPreferences>): boolean {
    if (!userId || !endpoint) return false;
    const list = this.subscriptions.get(userId) || [];
    const record = list.find((s) => s.subscription.endpoint === endpoint);
    const merged: ServerPushPreferences = {
      ...DEFAULT_SERVER_PUSH_PREFERENCES,
      ...(record?.preferences || {}),
      ...preferences,
    };
    if (record) record.preferences = merged;

    if (db) {
      const docId = getSubscriptionId(userId, endpoint);
      setDoc(doc(db, 'push_subscriptions', docId), { preferences: merged }, { merge: true }).catch((err: any) => {
        console.error('[PushService] Failed to update push preferences:', err);
      });
    }
    return true;
  }

  public removeSubscription(userId: string, endpoint: string): boolean {
    if (db) {
      const docId = getSubscriptionId(userId, endpoint);
      deleteDoc(doc(db, 'push_subscriptions', docId))
        .then(() => {
          console.log(`[PushService] Deleted push subscription from Firestore for user ${userId}`);
        })
        .catch((err: any) => {
          console.error(`[PushService] Failed to delete push subscription from Firestore:`, err);
        });
    }

    const existing = this.subscriptions.get(userId);
    if (!existing) return false;

    const filtered = existing.filter((s) => s.subscription.endpoint !== endpoint);
    if (filtered.length === 0) {
      this.subscriptions.delete(userId);
    } else {
      this.subscriptions.set(userId, filtered);
    }
    return true;
  }

  public async sendNotificationToUser(
    userId: string,
    payload: PushPayload,
    options?: { onlyEndpoint?: string }
  ): Promise<{ success: number; failed: number }> {
    let userSubs: UserSubscriptionRecord[] = [];

    if (db) {
      try {
        const q = query(collection(db, 'push_subscriptions'), where('userId', '==', userId));
        const snapshot = await getDocs(q);
        userSubs = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            userId: data.userId,
            userName: data.userName,
            subscription: data.subscription,
            createdAt: data.createdAt,
            userAgent: data.userAgent,
            preferences: data.preferences,
          } as UserSubscriptionRecord;
        });
      } catch (err) {
        console.error(`[PushService] Failed to load push subscriptions from Firestore for user ${userId}, falling back to memory:`, err);
        userSubs = this.subscriptions.get(userId) || [];
      }
    } else {
      userSubs = this.subscriptions.get(userId) || [];
    }

    if (options?.onlyEndpoint) {
      userSubs = userSubs.filter((r) => r.subscription.endpoint === options.onlyEndpoint);
    }

    if (userSubs.length === 0) {
      return { success: 0, failed: 0 };
    }

    const type = payload.data?.type;
    const policy = PUSH_POLICY[type || 'SYSTEM'] || PUSH_POLICY.SYSTEM;
    const payloadString = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/icon-192.png',
      badge: payload.badge || '/badge-96.png',
      tag: payload.tag || 'njambo-kora-notification',
      data: { app: 'game', sentAt: Date.now(), ...(payload.data || {}) },
    });

    let successCount = 0;
    let failedCount = 0;
    const invalidEndpoints: string[] = [];

    const sendPromises = userSubs.map(async (record) => {
      // Respect des préférences du joueur (types d'alerte + mode nuit) côté serveur,
      // seul endroit où elles peuvent réellement empêcher l'envoi.
      const prefs: ServerPushPreferences = { ...DEFAULT_SERVER_PUSH_PREFERENCES, ...(record.preferences || {}) };
      if (!isTypeAllowed(type, prefs)) return;
      if (type !== 'SYSTEM' && !CRITICAL_TYPES.includes(type as PushType) && isQuietNow(prefs)) return;

      try {
        await webpush.sendNotification(record.subscription as any, payloadString, {
          TTL: policy.ttl,
          urgency: policy.urgency,
          topic: sanitizeTopic(payload.tag),
        });
        successCount++;
      } catch (err: any) {
        failedCount++;
        const code = err?.statusCode;
        console.warn(`[PushService] Failed push to ${userId}:`, code || err?.message);
        // 404/410 : abonnement expiré. 401/403 : abonnement créé avec une autre clé VAPID
        // (ex. clés régénérées au redémarrage) : il est inutilisable, le client se réabonnera seul.
        if (code === 404 || code === 410 || code === 401 || code === 403) {
          invalidEndpoints.push(record.subscription.endpoint);
        }
      }
    });

    await Promise.all(sendPromises);

    // Clean up expired subscriptions
    if (invalidEndpoints.length > 0) {
      if (db) {
        for (const endpoint of invalidEndpoints) {
          const docId = getSubscriptionId(userId, endpoint);
          deleteDoc(doc(db, 'push_subscriptions', docId)).catch(() => {});
        }
      }

      // Sync memory fallback cache
      const memorySubs = this.subscriptions.get(userId);
      if (memorySubs) {
        const remaining = memorySubs.filter((s) => !invalidEndpoints.includes(s.subscription.endpoint));
        if (remaining.length === 0) {
          this.subscriptions.delete(userId);
        } else {
          this.subscriptions.set(userId, remaining);
        }
      }
    }

    return { success: successCount, failed: failedCount };
  }

  public async broadcastToAll(payload: PushPayload): Promise<{ success: number; failed: number }> {
    let totalSuccess = 0;
    let totalFailed = 0;

    if (db) {
      try {
        const snapshot = await getDocs(collection(db, 'push_subscriptions'));
        const userSubsMap = new Map<string, UserSubscriptionRecord[]>();
        snapshot.docs.forEach((d) => {
          const data = d.data();
          const record = {
            userId: data.userId,
            userName: data.userName,
            subscription: data.subscription,
            createdAt: data.createdAt,
            userAgent: data.userAgent,
          } as UserSubscriptionRecord;
          const list = userSubsMap.get(record.userId) || [];
          list.push(record);
          userSubsMap.set(record.userId, list);
        });

        for (const userId of userSubsMap.keys()) {
          const res = await this.sendNotificationToUser(userId, payload);
          totalSuccess += res.success;
          totalFailed += res.failed;
        }
        return { success: totalSuccess, failed: totalFailed };
      } catch (err) {
        console.error('[PushService] Broadcast failed from Firestore, falling back to memory:', err);
      }
    }

    // Memory cache fallback
    for (const userId of this.subscriptions.keys()) {
      const res = await this.sendNotificationToUser(userId, payload);
      totalSuccess += res.success;
      totalFailed += res.failed;
    }
    return { success: totalSuccess, failed: totalFailed };
  }

  public getSubscribersCount(): number {
    let count = 0;
    for (const subs of this.subscriptions.values()) {
      count += subs.length;
    }
    return count;
  }
}

export const pushService = new PushService();
