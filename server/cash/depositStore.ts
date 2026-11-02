/**
 * Kora Cash — stockage des dépôts (écriture serveur uniquement, Admin SDK).
 * Collection : cash_deposits. Fermée à tous les clients.
 * confirmDeposit est LE point d'entrée unique qui crédite le portefeuille : le faux paiement de démo
 * et, plus tard, le webhook du prestataire passeront tous deux par lui. Aucun secret, aucun délai.
 */

import { getFirebaseAdminAppDb } from '../firebaseAdmin';
import { recordServerReads } from '../katika/readBudget';
import type { CampayReadingInfo } from './campayRules';
import { applyMovement } from './walletLedger';
import { CashWallet } from './cashTypes';
import { verifyPhoneFromDeposit } from './phoneBookStore';
import { getWithdrawalSettings } from './withdrawalStore';
import {
  DepositDoc,
  DepositEnvironment,
  DepositError,
  DepositMode,
  canTransition,
  isValidDepositId,
  ledgerRefForDeposit,
  newDepositId,
} from './depositRules';

export const CASH_DEPOSITS_COLLECTION = 'cash_deposits';

/** Crée un dépôt en attente. Le montant doit avoir été validé par parseDepositAmount avant l'appel. */
export async function createDeposit(uid: string, amount: number, mode: DepositMode, environment: DepositEnvironment = 'DEMO', phone?: string): Promise<DepositDoc> {
  const now = Date.now();
  const deposit: DepositDoc = {
    id: newDepositId(),
    uid,
    environment,
    amount,
    mode,
    status: 'PENDING',
    createdAt: now,
    updatedAt: now,
    ...(phone ? { phone } : {}),
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

/** Enregistre la dernière réponse de Campay sur le dépôt (statut, opérateur, motif). Purement informatif : ne change ni l'état du dépôt ni aucun solde. */
export async function recordCampayReading(id: string, info: CampayReadingInfo): Promise<void> {
  if (!isValidDepositId(id)) throw new DepositError('INVALID_DEPOSIT_ID', 'Identifiant de dépôt invalide.');
  const db = getFirebaseAdminAppDb();
  const ref = db.collection(CASH_DEPOSITS_COLLECTION).doc(id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const current = snap.data() as DepositDoc;
    const next: DepositDoc = { ...current, campayStatus: info.status, campayCheckedAt: Date.now() };
    if (info.operator !== undefined) next.campayOperator = info.operator;
    else delete next.campayOperator;
    if (info.reason !== undefined) next.campayReason = info.reason;
    else delete next.campayReason;
    tx.set(ref, next);
  });
}

export interface RecentCampayDeposit {
  id: string;
  uid: string;
  amount: number;
  status: string;
  createdAt: number;
  campayStatus?: string;
  campayOperator?: string;
  campayReason?: string;
  campayCheckedAt?: number;
  failReason?: string;
}

/** Derniers dépôts Mobile Money Campay (administration katika). Une seule lecture bornée, comptée dans la jauge de lectures. */
export async function listRecentCampayDeposits(max: number = 30): Promise<RecentCampayDeposit[]> {
  const limit = Math.min(100, Math.max(1, Math.floor(max)));
  const snap = await getFirebaseAdminAppDb().collection(CASH_DEPOSITS_COLLECTION).orderBy('createdAt', 'desc').limit(limit).get();
  recordServerReads(snap.size);
  return snap.docs
    .map((d) => d.data() as DepositDoc)
    .filter((d) => d.mode === 'CAMPAY')
    .map((d) => ({
      id: d.id,
      uid: d.uid,
      amount: d.amount,
      status: d.status,
      createdAt: d.createdAt,
      campayStatus: d.campayStatus,
      campayOperator: d.campayOperator,
      campayReason: d.campayReason,
      campayCheckedAt: d.campayCheckedAt,
      failReason: d.failReason,
    }));
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
    environment: existing.environment ?? 'DEMO',
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

  // Le dépôt a réussi depuis ce numéro : il devient vérifié. Un souci ici ne remet jamais le crédit en cause.
  if (existing.phone) {
    try {
      const settings = await getWithdrawalSettings();
      await verifyPhoneFromDeposit(existing.uid, existing.phone, existing.campayOperator, settings.maxPhones);
    } catch (err) {
      console.warn('[KoraCash] Vérification du numéro impossible.', { depositId: existing.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { deposit, credited: movement.applied, wallet: movement.wallet };
}
