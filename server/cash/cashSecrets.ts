/**
 * Ne jamais retourner le contenu déchiffré d'un champ via une route HTTP.
 * Ne jamais journaliser une valeur de fields.
 */

import crypto from 'crypto';
import { getFirebaseAdminAppDb } from '../firebaseAdmin';

const MASTER_KEY_RAW = process.env.CASH_SECRETS_MASTER_KEY;

if (!MASTER_KEY_RAW || MASTER_KEY_RAW.trim() === '') {
  console.error('[CashSecrets] Variable CASH_SECRETS_MASTER_KEY absente au démarrage. Écriture de secrets désactivée.');
}

function getDerivedKey(): Buffer | null {
  const raw = process.env.CASH_SECRETS_MASTER_KEY;
  if (!raw || raw.trim() === '') {
    return null;
  }
  return crypto.createHash('sha256').update(raw.trim()).digest();
}

export function encryptSecret(plain: string): string {
  const key = getDerivedKey();
  if (!key) {
    throw new Error('Chiffrement indisponible : clé maître CASH_SECRETS_MASTER_KEY non configurée.');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plain, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptSecret(cipherText: string): string {
  const key = getDerivedKey();
  if (!key) {
    throw new Error('Déchiffrement indisponible : clé maître CASH_SECRETS_MASTER_KEY non configurée.');
  }
  const parts = cipherText.split(':');
  if (parts.length !== 3) {
    throw new Error('Format de texte chiffré invalide.');
  }
  const [ivHex, authTagHex, encryptedHex] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export async function saveProviderCredentials(
  provider: 'campay' | 'notchpay',
  environment: 'demo' | 'live',
  fields: Record<string, string>,
  adminUid: string
): Promise<void> {
  const key = getDerivedKey();
  if (!key) {
    throw new Error('Impossible d\'enregistrer les secrets : clé maître CASH_SECRETS_MASTER_KEY non configurée.');
  }

  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    // Ne jamais rechiffrer une valeur masquée ou vide
    if (typeof v === 'string' && v.trim() !== '' && !v.startsWith('••••')) {
      values[k] = encryptSecret(v.trim());
    }
  }

  const db = getFirebaseAdminAppDb();
  const docRef = db.collection('server_secrets').doc(`${provider}_${environment}`);

  // Conserver les champs existants si seulement certains champs sont mis à jour
  const existingSnap = await docRef.get();
  const existingValues = existingSnap.exists ? existingSnap.data()?.values || {} : {};

  await docRef.set({
    values: {
      ...existingValues,
      ...values,
    },
    updatedAt: new Date().toISOString(),
    updatedBy: adminUid || 'unknown',
  }, { merge: true });
}

export async function getProviderCredentials(
  provider: 'campay' | 'notchpay',
  environment: 'demo' | 'live'
): Promise<Record<string, string> | null> {
  const db = getFirebaseAdminAppDb();
  const docRef = db.collection('server_secrets').doc(`${provider}_${environment}`);
  const snap = await docRef.get();
  if (!snap.exists) {
    return null;
  }
  const data = snap.data();
  const rawValues = data?.values;
  if (!rawValues || typeof rawValues !== 'object') {
    return null;
  }
  const decrypted: Record<string, string> = {};
  for (const [k, cipherText] of Object.entries(rawValues)) {
    if (typeof cipherText === 'string') {
      try {
        decrypted[k] = decryptSecret(cipherText);
      } catch (err: any) {
        console.error(`[CashSecrets] Échec de déchiffrement du champ ${k} pour ${provider}_${environment}`);
      }
    }
  }
  return decrypted;
}

export async function getProviderCredentialsMasked(
  provider: 'campay' | 'notchpay',
  environment: 'demo' | 'live'
): Promise<{ fields: Record<string, string>; updatedAt: any; updatedBy: string } | null> {
  const db = getFirebaseAdminAppDb();
  const docRef = db.collection('server_secrets').doc(`${provider}_${environment}`);
  const snap = await docRef.get();
  if (!snap.exists) {
    return null;
  }
  const data = snap.data();
  const rawValues = data?.values || {};
  const maskedFields: Record<string, string> = {};

  for (const [k, cipherText] of Object.entries(rawValues)) {
    if (typeof cipherText === 'string') {
      try {
        const plain = decryptSecret(cipherText);
        const last4 = plain.length > 4 ? plain.slice(-4) : plain;
        maskedFields[k] = `••••${last4}`;
      } catch {
        maskedFields[k] = '••••????';
      }
    }
  }

  return {
    fields: maskedFields,
    updatedAt: data?.updatedAt || null,
    updatedBy: data?.updatedBy || 'unknown',
  };
}
