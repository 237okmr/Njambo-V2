/**
 * Kora Cash — stockage du carnet de numéros (écriture serveur uniquement, Admin SDK).
 * Collections fermées à tous les clients : cash_phone_numbers (carnet par joueur), cash_phone_claims (un numéro vérifié → un compte).
 */

import { getFirebaseAdminAppDb } from '../firebaseAdmin';
import { PHONE_ALREADY_CLAIMED_ERROR, PhoneEntry, addPhoneEntry, markPhoneVerified, normalizeEntries } from './phoneBookRules';

export const CASH_PHONE_NUMBERS_COLLECTION = 'cash_phone_numbers';
export const CASH_PHONE_CLAIMS_COLLECTION = 'cash_phone_claims';

export async function listPhones(uid: string): Promise<PhoneEntry[]> {
  const snap = await getFirebaseAdminAppDb().collection(CASH_PHONE_NUMBERS_COLLECTION).doc(uid).get();
  return normalizeEntries(snap.data()?.entries);
}

export async function addPhone(uid: string, phone: string, maxPhones: number): Promise<{ ok: boolean; entries?: PhoneEntry[]; error?: string }> {
  const db = getFirebaseAdminAppDb();
  const bookRef = db.collection(CASH_PHONE_NUMBERS_COLLECTION).doc(uid);
  const claimRef = db.collection(CASH_PHONE_CLAIMS_COLLECTION).doc(phone);
  return db.runTransaction(async (tx) => {
    const [bookSnap, claimSnap] = [await tx.get(bookRef), await tx.get(claimRef)];
    if (claimSnap.exists && claimSnap.data()?.uid !== uid) {
      return { ok: false, error: PHONE_ALREADY_CLAIMED_ERROR };
    }
    const result = addPhoneEntry(normalizeEntries(bookSnap.data()?.entries), phone, maxPhones, Date.now());
    if (!result.ok) return { ok: false, error: result.error };
    tx.set(bookRef, { uid, entries: result.entries, updatedAt: Date.now() });
    return { ok: true, entries: result.entries };
  });
}

export async function removePhone(uid: string, phone: string): Promise<PhoneEntry[]> {
  const db = getFirebaseAdminAppDb();
  const bookRef = db.collection(CASH_PHONE_NUMBERS_COLLECTION).doc(uid);
  const claimRef = db.collection(CASH_PHONE_CLAIMS_COLLECTION).doc(phone);
  return db.runTransaction(async (tx) => {
    const [bookSnap, claimSnap] = [await tx.get(bookRef), await tx.get(claimRef)];
    const entries = normalizeEntries(bookSnap.data()?.entries).filter((e) => e.phone !== phone);
    tx.set(bookRef, { uid, entries, updatedAt: Date.now() });
    if (claimSnap.exists && claimSnap.data()?.uid === uid) tx.delete(claimRef);
    return entries;
  });
}

export async function isVerifiedPhone(uid: string, phone: string): Promise<boolean> {
  return (await listPhones(uid)).some((e) => e.phone === phone && e.verified);
}

/**
 * Un dépôt a réussi depuis ce numéro : il devient vérifié pour ce joueur, sauf s'il appartient déjà à un autre compte
 * ou si le carnet est plein. Renvoie vrai si le numéro est vérifié pour ce joueur.
 */
export async function verifyPhoneFromDeposit(uid: string, phone: string, operator: string | undefined, maxPhones: number): Promise<boolean> {
  const db = getFirebaseAdminAppDb();
  const bookRef = db.collection(CASH_PHONE_NUMBERS_COLLECTION).doc(uid);
  const claimRef = db.collection(CASH_PHONE_CLAIMS_COLLECTION).doc(phone);
  return db.runTransaction(async (tx) => {
    const [bookSnap, claimSnap] = [await tx.get(bookRef), await tx.get(claimRef)];
    if (claimSnap.exists && claimSnap.data()?.uid !== uid) return false;
    const now = Date.now();
    const entries = markPhoneVerified(normalizeEntries(bookSnap.data()?.entries), phone, operator, maxPhones, now);
    if (!entries) return false;
    tx.set(bookRef, { uid, entries, updatedAt: now });
    if (!claimSnap.exists) tx.set(claimRef, { uid, verifiedAt: now });
    return true;
  });
}
