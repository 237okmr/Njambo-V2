/**
 * Kora Cash — stockage des dépôts (écriture serveur uniquement, Admin SDK).
 * Collection : cash_deposits. Fermée à tous les clients.
 * confirmDeposit est LE point d'entrée unique qui crédite le portefeuille : le faux paiement de démo
 * et, plus tard, le webhook du prestataire passeront tous deux par lui. Aucun secret, aucun délai.
 */

import { getFirebaseAdminAppDb } from '../firebaseAdmin';
import { applyMovement } from './walletLedger';
import { CashWallet } from './cashTypes';
import {
  DepositDoc,
  DepositError,
  DepositMode,
  canTransition,
  isValidDepositId,
  ledgerRefForDeposit,
  newDepositId,
} from './depositRules';

export const CASH_DEPOSITS_COLLECTION = 'cash_deposits';

/** Crée un dépôt en attente. Le montant doit avoir été validé par parseDepositAmount avant l'appel. */
export async function createDeposit(uid: string, amount: number, mode: DepositMode): Promise<DepositDoc> {
  const now = Date.now();
  const deposit: DepositDoc = {
    id: newDepositId(),
    uid,
    amount,
    mode,
    status: 'PENDING',
    createdAt: now,
    updatedAt: now,
  };
  await getFirebaseAdminAppDb().collection(CASH_DEPOSITS_COLLECTION).doc(deposit.id).create(deposit);
  return deposit;
}

export async function getDeposit(id: string): Promise<DepositDoc | null> {
  if (!isValidDepositId(id)) throw new DepositError('INVALID_DEPOSIT_ID', 'Identifiant de dépôt invalide.');
  const snap = await getFirebaseAdminAppDb().collection(CASH_DEPOSITS_COLLECTION).doc(id).get();
  return snap.exists ? (snap.data() as DepositDoc) : null;
}

export interface PendingDepositSummary {
  id: string;
  amount: number;
  createdAt: number;
}

/**
 * Dépôts Mobile Money d'un joueur dont la collecte a été lancée chez Campay mais qui ne sont pas encore confirmés (les plus récents d'abord).
 * Permet de les retrouver et de les vérifier après fermeture de la fenêtre, sans refaire de paiement.
 */
export async function listPendingDeposits(uid: string, max: number = 5): Promise<PendingDepositSummary[]> {
  const snap = await getFirebaseAdminAppDb()
    .collection(CASH_DEPOSITS_COLLECTION)
    .where('uid', '==', uid)
    .where('status', '==', 'PENDING')
    .get();
  return snap.docs
    .map((d) => d.data() as DepositDoc)
    .filter((d) => d.mode === 'CAMPAY' && typeof d.campayReference === 'string' && d.campayReference.length > 0)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, Math.max(1, Math.floor(max)))
    .map((d) => ({ id: d.id, amount: d.amount, createdAt: d.createdAt }));
}

/** Enregistre la référence Campay d'une collecte lancée. Sans effet si le dépôt a déjà une référence ou n'est plus en attente. */
export async function attachCampayReference(id: string, campayReference: string): Promise<DepositDoc> {
  if (!isValidDepositId(id)) throw new DepositError('INVALID_DEPOSIT_ID', 'Identifiant de dépôt invalide.');
  const db = getFirebaseAdminAppDb();
  const ref = db.collection(CASH_DEPOSITS_COLLECTION).doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DepositError('DEPOSIT_NOT_FOUND', 'Dépôt introuvable.');
    const current = snap.data() as DepositDoc;
    if (current.status !== 'PENDING' || current.campayReference) return current;
    const next: DepositDoc = { ...current, campayReference, updatedAt: Date.now() };
    tx.set(ref, next);
    return next;
  });
}

/** Marque un dépôt en attente comme échoué (réponse explicite du prestataire). Un dépôt déjà confirmé ou échoué n'est pas modifié. */
export async function markDepositFailed(id: string, reason: string): Promise<DepositDoc> {
  if (!isValidDepositId(id)) throw new DepositError('INVALID_DEPOSIT_ID', 'Identifiant de dépôt invalide.');
  const db = getFirebaseAdminAppDb();
  const ref = db.collection(CASH_DEPOSITS_COLLECTION).doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DepositError('DEPOSIT_NOT_FOUND', 'Dépôt introuvable.');
    const current = snap.data() as DepositDoc;
    if (!canTransition(current.status, 'FAILED')) return current;
    const next: DepositDoc = { ...current, status: 'FAILED', failReason: String(reason || '').slice(0, 200), updatedAt: Date.now() };
    tx.set(ref, next);
    return next;
  });
}

export interface ConfirmDepositResult {
  deposit: DepositDoc;
  /** false si ce dépôt avait déjà été crédité : rien n'a été ajouté une seconde fois. */
  credited: boolean;
  wallet: CashWallet;
}

/**
 * Confirme un dépôt : crédite le portefeuille (idempotent par la clé du registre) puis marque le dépôt SUCCESS.
 * Rejouable sans risque : un deuxième appel pour le même dépôt ne crédite rien.
 */
export async function confirmDeposit(id: string, providerRef?: string): Promise<ConfirmDepositResult> {
  const existing = await getDeposit(id);
  if (!existing) throw new DepositError('DEPOSIT_NOT_FOUND', 'Dépôt introuvable.');
  if (existing.status === 'FAILED') throw new DepositError('DEPOSIT_FAILED', 'Ce dépôt a échoué et ne peut plus être confirmé.');

  const movement = await applyMovement({
    ref: ledgerRefForDeposit(existing.id),
    uid: existing.uid,
    kind: 'DEPOSIT',
    availableDelta: existing.amount,
    lockedDelta: 0,
    meta: { depositId: existing.id, mode: existing.mode },
  });

  const db = getFirebaseAdminAppDb();
  const ref = db.collection(CASH_DEPOSITS_COLLECTION).doc(existing.id);
  const deposit = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.data() as DepositDoc;
    if (!canTransition(current.status, 'SUCCESS')) return current;
    const next: DepositDoc = {
      ...current,
      status: 'SUCCESS',
      updatedAt: Date.now(),
      ...(providerRef ? { providerRef } : {}),
    };
    tx.set(ref, next);
    return next;
  });

  return { deposit, credited: movement.applied, wallet: movement.wallet };
}
