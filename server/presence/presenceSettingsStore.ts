/**
 * Réglages de visibilité d'un joueur (liste « En ligne », invitations réservées aux amis).
 * Une lecture par joueur et par démarrage du serveur, une écriture seulement quand le joueur change un réglage.
 * Le document est écrit par le serveur uniquement ; le joueur ne le touche jamais directement.
 */

import { getFirebaseAdminAppDb } from '../firebaseAdmin';
import { recordServerReads } from '../katika/readBudget';
import { DEFAULT_PRESENCE_SETTINGS, PresenceSettings, normalizePresenceSettings } from './onlinePlayersRules';

export const PRESENCE_SETTINGS_COLLECTION = 'player_presence_settings';

export interface PresenceSettingsRuntime {
  load: (uid: string) => Promise<PresenceSettings>;
  save: (uid: string, settings: PresenceSettings) => Promise<void>;
}

export const firestorePresenceSettings: PresenceSettingsRuntime = {
  async load(uid) {
    const snap = await getFirebaseAdminAppDb().collection(PRESENCE_SETTINGS_COLLECTION).doc(uid).get();
    recordServerReads(1);
    return snap.exists ? normalizePresenceSettings(snap.data()) : { ...DEFAULT_PRESENCE_SETTINGS };
  },
  async save(uid, settings) {
    await getFirebaseAdminAppDb()
      .collection(PRESENCE_SETTINGS_COLLECTION)
      .doc(uid)
      .set({ uid, hidden: settings.hidden, friendsOnlyInvites: settings.friendsOnlyInvites, searchAlerts: settings.searchAlerts, updatedAt: Date.now() });
  },
};
