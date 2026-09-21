import { doc, getDoc, setDoc, updateDoc, deleteField, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import {
  KatikaCopilotSettings,
  DEFAULT_COPILOT_SETTINGS,
} from '../types/copilotSettings';
import { NJAMBO_APP_URL, NJAMBO_WHATSAPP_GROUP_URL } from '../types/socialVisuals';

const SETTINGS_COLLECTION = 'katika_settings';
const SETTINGS_DOC_ID = 'copilot_config';
const LOCAL_STORAGE_KEY = 'katika_copilot_settings_v1';
const PREFS_LOCAL_STORAGE_KEY = 'katika_ai_assistant_prefs';

function sanitizeLocalStorages(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const rawCopilot = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (rawCopilot) {
      const parsed = JSON.parse(rawCopilot);
      if (parsed && ('geminiApiKey' in parsed || 'apiKey' in parsed)) {
        delete parsed.geminiApiKey;
        delete parsed.apiKey;
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(parsed));
      }
    }

    const rawPrefs = localStorage.getItem(PREFS_LOCAL_STORAGE_KEY);
    if (rawPrefs) {
      const parsed = JSON.parse(rawPrefs);
      if (parsed && ('geminiApiKey' in parsed || 'apiKey' in parsed)) {
        delete parsed.geminiApiKey;
        delete parsed.apiKey;
        localStorage.setItem(PREFS_LOCAL_STORAGE_KEY, JSON.stringify(parsed));
      }
    }
  } catch (e) {
    console.warn('[CopilotSettingsService] Erreur nettoyage localStorage:', e);
  }
}

function cleanSettingsForStorage(settings: any): KatikaCopilotSettings {
  const clone = { ...settings };
  if ('geminiApiKey' in clone) {
    delete clone.geminiApiKey;
  }
  if ('apiKey' in clone) {
    delete clone.apiKey;
  }
  return clone as KatikaCopilotSettings;
}

// Nettoyage immédiat au chargement du module
sanitizeLocalStorages();

let inMemorySettings: KatikaCopilotSettings = loadFromLocalStorage();
const listeners = new Set<(settings: KatikaCopilotSettings) => void>();

function loadFromLocalStorage(): KatikaCopilotSettings {
  if (typeof localStorage === 'undefined') {
    return { ...DEFAULT_COPILOT_SETTINGS };
  }
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const cleaned = cleanSettingsForStorage(parsed);
      return {
        ...DEFAULT_COPILOT_SETTINGS,
        ...cleaned,
        socialLinks: {
          ...DEFAULT_COPILOT_SETTINGS.socialLinks,
          ...(cleaned.socialLinks || {}),
        },
      };
    }
  } catch (e) {
    console.warn('[CopilotSettingsService] Erreur lecture localStorage:', e);
  }
  return { ...DEFAULT_COPILOT_SETTINGS };
}

function saveToLocalStorage(settings: KatikaCopilotSettings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const cleaned = cleanSettingsForStorage(settings);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cleaned));
  } catch (e) {
    console.warn('[CopilotSettingsService] Erreur écriture localStorage:', e);
  }
}

function notifyListeners(settings: KatikaCopilotSettings): void {
  const cleaned = cleanSettingsForStorage(settings);
  inMemorySettings = cleaned;
  saveToLocalStorage(cleaned);
  listeners.forEach((fn) => {
    try {
      fn(cleaned);
    } catch (e) {
      console.error('[CopilotSettingsService] Erreur listener:', e);
    }
  });
}

// Initialise un abonnement temps-réel avec Firestore si disponible
let firestoreSubscribed = false;

export function initCopilotSettingsSync(): () => void {
  if (firestoreSubscribed) return () => {};
  firestoreSubscribed = true;

  // Assurer la désinfection locale
  sanitizeLocalStorages();

  try {
    const docRef = doc(db, SETTINGS_COLLECTION, SETTINGS_DOC_ID);
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const rawData = snapshot.data() as any;

          // Migration 1-shot : supprimer la clé API si elle existe encore dans l'ancien document Firestore
          if (rawData && ('geminiApiKey' in rawData || 'apiKey' in rawData)) {
            updateDoc(docRef, {
              geminiApiKey: deleteField(),
              apiKey: deleteField(),
            }).catch((err) => {
              console.warn('[CopilotSettingsService] Nettoyage champ legacy geminiApiKey ignoré/échoué:', err);
            });
          }

          const remoteData = cleanSettingsForStorage(rawData);
          const merged: KatikaCopilotSettings = {
            ...DEFAULT_COPILOT_SETTINGS,
            ...inMemorySettings,
            ...remoteData,
            socialLinks: {
              ...DEFAULT_COPILOT_SETTINGS.socialLinks,
              ...inMemorySettings.socialLinks,
              ...(remoteData.socialLinks || {}),
            },
          };
          notifyListeners(merged);
        } else {
          // Document n'existe pas encore dans Firestore, on sauvegarde les défauts nettoyés
          const cleaned = cleanSettingsForStorage(inMemorySettings);
          setDoc(docRef, cleaned).catch((err) => {
            console.warn('[CopilotSettingsService] Création doc initial échouée:', err);
          });
        }
      },
      (error) => {
        console.warn('[CopilotSettingsService] Synchronisation Firestore dégradée (mode local actif):', error);
      }
    );

    return () => {
      unsubscribe();
      firestoreSubscribed = false;
    };
  } catch (err) {
    console.warn('[CopilotSettingsService] Erreur initialisation Firestore sync:', err);
    return () => {};
  }
}

/**
 * Fonction source unique renvoyant les liens sociaux actifs (app, WhatsApp, Facebook).
 * Utilise les valeurs en mémoire/paramètres Copilote avec secours vers les constantes par défaut.
 */
export function getSocialLinks(): { appUrl: string; whatsappUrl: string; facebookUrl: string } {
  const settings = inMemorySettings || DEFAULT_COPILOT_SETTINGS;
  const appUrl = (settings.socialLinks?.appUrl || '').trim() || NJAMBO_APP_URL;
  const whatsappUrl = (settings.socialLinks?.whatsappUrl || '').trim() || NJAMBO_WHATSAPP_GROUP_URL;
  const facebookUrl = (settings.socialLinks?.facebookUrl || '').trim();
  return { appUrl, whatsappUrl, facebookUrl };
}

export const CopilotSettingsService = {
  /**
   * Source unique des liens sociaux
   */
  getSocialLinks,

  /**
   * Retourne les paramètres actuels de façon synchrone (depuis la mémoire ou cache local)
   */
  getSettings(): KatikaCopilotSettings {
    return inMemorySettings;
  },

  /**
   * S'abonne aux changements des options du copilote
   */
  subscribe(callback: (settings: KatikaCopilotSettings) => void): () => void {
    listeners.add(callback);
    callback(inMemorySettings);
    return () => {
      listeners.delete(callback);
    };
  },

  /**
   * Sauvegarde les paramètres dans Firestore et le cache local (sans jamais écrire de clé API)
   */
  async saveSettings(partial: Partial<KatikaCopilotSettings>): Promise<KatikaCopilotSettings> {
    const updated: KatikaCopilotSettings = cleanSettingsForStorage({
      ...inMemorySettings,
      ...partial,
      socialLinks: {
        ...inMemorySettings.socialLinks,
        ...(partial.socialLinks || {}),
      },
      updatedAt: Date.now(),
    });

    // 1. Notification immédiate de l'interface locale
    notifyListeners(updated);

    // 2. Synchronisation distante dans Firestore
    try {
      const docRef = doc(db, SETTINGS_COLLECTION, SETTINGS_DOC_ID);
      await setDoc(docRef, updated, { merge: true });
    } catch (err) {
      console.warn('[CopilotSettingsService] Sauvegarde Firestore différée ou échouée (sauvegardé en local):', err);
    }

    return updated;
  },

  /**
   * Réinitialise les paramètres aux valeurs d'origine
   */
  async resetToDefaults(): Promise<KatikaCopilotSettings> {
    return await this.saveSettings(DEFAULT_COPILOT_SETTINGS);
  },
};
