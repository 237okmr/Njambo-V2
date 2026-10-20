/**
 * Kora Cash — portefeuille et registre des transactions (écriture serveur uniquement, Admin SDK).
 *
 * Règles :
 *  - Le registre est en ajout seul : aucune ligne n'est jamais modifiée ni supprimée. Une erreur se corrige par une ligne inverse.
 *  - Chaque mouvement porte une clé d'idempotence (ref) : la rejouer ne crée aucun second mouvement.
 *  - Solde et ligne de registre sont écrits dans la même transaction : l'un ne va jamais sans l'autre.
 *  - Aucune route HTTP, aucun accès client, aucun délai ici.
 */

import { getFirebaseAdminAppDb } from '../firebaseAdmin';
import {
  CASH_LEDGER_COLLECTION,
  CASH_WALLETS_COLLECTION,
  CashLedgerEntry,
  CashLedgerError,
  CashMovementInput,
  CashWallet,
} from './cashTypes';
import { computeMovement, isValidRef } from './cashLedgerRules';

function walletFromData(uid: string, data: Partial<CashWallet> | undefined): CashWallet {
  return {
    uid,
    available: data?.available ?? 0,
    locked: data?.locked ?? 0,
    createdAt: data?.createdAt ?? 0,
    updatedAt: data?.updatedAt ?? 0,
  };
}

function assertValidUid(uid: unknown): asserts uid is string {
  if (typeof uid !== 'string' || uid.length === 0 || uid.length > 128 || uid.includes('/')) {
    throw new CashLedgerError('INVALID_UID', 'Identifiant joueur invalide.');
  }
}

/** Lit le portefeuille d'un joueur (zéro partout s'il n'existe pas encore). */
export async function getWallet(uid: string): Promise<CashWallet> {
  assertValidUid(uid);
  const snap = await getFirebaseAdminAppDb().collection(CASH_WALLETS_COLLECTION).doc(uid).get();
  return walletFromData(uid, snap.exists ? (snap.data() as Partial<CashWallet>) : undefined);
}

export interface ApplyMovementResult {
  /** false si la clé avait déjà été appliquée : rien n'a été écrit, la ligne d'origine est renvoyée. */
  applied: boolean;
  entry: CashLedgerEntry;
  wallet: CashWallet;
}

/** Applique un mouvement de façon atomique et idempotente. Lève une CashLedgerError si le mouvement est refusé. */
export async function applyMovement(input: CashMovementInput): Promise<ApplyMovementResult> {
  assertValidUid(input.uid);
  if (!isValidRef(input.ref)) {
    throw new CashLedgerError('INVALID_REF', 'Clé d\'idempotence invalide (8 à 128 caractères : lettres, chiffres, _ . : -).');
  }

  const db = getFirebaseAdminAppDb();
  const walletRef = db.collection(CASH_WALLETS_COLLECTION).doc(input.uid);
  const ledgerRef = db.collection(CASH_LEDGER_COLLECTION).doc(input.ref);

  return db.runTransaction(async (tx) => {
    const ledgerSnap = await tx.get(ledgerRef);
    const walletSnap = await tx.get(walletRef);
    const current = walletFromData(input.uid, walletSnap.exists ? (walletSnap.data() as Partial<CashWallet>) : undefined);

    if (ledgerSnap.exists) {
      const existing = ledgerSnap.data() as CashLedgerEntry;
      if (existing.uid !== input.uid) {
        throw new CashLedgerError('REF_OWNER_MISMATCH', 'Cette clé appartient à un autre joueur.');
      }
      if (
        existing.kind !== input.kind ||
        existing.availableDelta !== input.availableDelta ||
        existing.lockedDelta !== input.lockedDelta
      ) {
        throw new CashLedgerError('REF_CONFLICT', 'Cette clé a déjà servi pour un mouvement différent.');
      }
      return { applied: false, entry: existing, wallet: current };
    }

    const after = computeMovement(current, input);
    const now = Date.now();

    const entry: CashLedgerEntry = {
      ref: input.ref,
      uid: input.uid,
      kind: input.kind,
      availableDelta: input.availableDelta,
      lockedDelta: input.lockedDelta,
      availableBefore: current.available,
      availableAfter: after.available,
      lockedBefore: current.locked,
      lockedAfter: after.locked,
      createdAt: now,
      ...(input.meta ? { meta: input.meta } : {}),
      ...(input.actorUid ? { actorUid: input.actorUid } : {}),
      ...(input.note ? { note: input.note } : {}),
    };

    const wallet: CashWallet = {
      uid: input.uid,
      available: after.available,
      locked: after.locked,
      createdAt: walletSnap.exists ? current.createdAt : now,
      updatedAt: now,
    };

    tx.set(ledgerRef, entry);
    tx.set(walletRef, wallet);

    return { applied: true, entry, wallet };
  });
}
