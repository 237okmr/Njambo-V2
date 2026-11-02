/**
 * Kora Cash — règles pures du carnet de numéros Mobile Money (aucun réseau, aucune base de données, aucun délai).
 * Un numéro devient « vérifié » quand un dépôt réussit depuis ce numéro : le joueur a validé le paiement sur son téléphone.
 * Seul un numéro vérifié peut recevoir un retrait, et un numéro vérifié n'appartient qu'à un seul compte.
 */

export interface PhoneEntry {
  phone: string;
  verified: boolean;
  operator?: string;
  addedAt: number;
  verifiedAt?: number;
}

export interface AddPhoneResult {
  ok: boolean;
  entries?: PhoneEntry[];
  error?: string;
}

export const PHONE_ALREADY_CLAIMED_ERROR = 'Ce numéro est déjà rattaché à un autre compte.';

export function addPhoneEntry(entries: PhoneEntry[], phone: string, maxPhones: number, nowMs: number): AddPhoneResult {
  if (entries.some((e) => e.phone === phone)) {
    return { ok: false, error: 'Ce numéro est déjà dans ton carnet.' };
  }
  if (entries.length >= maxPhones) {
    return { ok: false, error: `Tu peux enregistrer ${maxPhones} numéros au maximum. Retires-en un pour en ajouter un autre.` };
  }
  return { ok: true, entries: [...entries, { phone, verified: false, addedAt: nowMs }] };
}

/** Marque un numéro vérifié ; l'ajoute au carnet s'il reste de la place. Renvoie null si le carnet est plein et le numéro absent. */
export function markPhoneVerified(entries: PhoneEntry[], phone: string, operator: string | undefined, maxPhones: number, nowMs: number): PhoneEntry[] | null {
  const existing = entries.find((e) => e.phone === phone);
  if (existing) {
    return entries.map((e) =>
      e.phone === phone ? { ...e, verified: true, verifiedAt: e.verifiedAt ?? nowMs, ...(operator ? { operator } : {}) } : e,
    );
  }
  if (entries.length >= maxPhones) return null;
  return [...entries, { phone, verified: true, addedAt: nowMs, verifiedAt: nowMs, ...(operator ? { operator } : {}) }];
}

/** 237677123412 devient « 6 77 .. .. 12 » : pour les listes d'administration et le suivi. */
export function maskPhone(phone: string): string {
  const local = phone.startsWith('237') ? phone.slice(3) : phone;
  if (local.length !== 9) return '…';
  return `${local[0]} ${local.slice(1, 3)} .. .. ${local.slice(7)}`;
}

export function normalizeEntries(raw: unknown): PhoneEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is PhoneEntry => !!e && typeof (e as PhoneEntry).phone === 'string');
}
