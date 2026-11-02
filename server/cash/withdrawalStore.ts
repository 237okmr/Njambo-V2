/**
 * Kora Cash — stockage des retraits et de leurs réglages (écriture serveur uniquement, Admin SDK).
 * Collections fermées à tous les clients : cash_withdrawals, cash_withdrawal_slots. Réglages : katika_config/kora_cash_withdrawals.
 * La transition d'état est la seule façon de changer un retrait : deux appels simultanés ne peuvent pas prendre le même envoi.
 */

import { getFirebaseAdminAppDb } from '../firebaseAdmin';
import { recordServerReads } from '../katika/readBudget';
import { KORA_CASH_CONFIG_COLLECTION } from './cashConfigStore';
import { ledgerCollectionFor } from './cashTypes';
import { addFinanceCounters } from './financeStore';
import {
  DEFAULT_WITHDRAWAL_SETTINGS,
  WithdrawalDoc,
  WithdrawalSettings,
  WithdrawalSettingsPatch,
  WithdrawalStatus,
  canTransitionWithdrawal,
  countsTowardDailyTotal,
  ledgerRefForHold,
  normalizeWithdrawalSettings,
} from './withdrawalRules';

export const CASH_WITHDRAWALS_COLLECTION = 'cash_withdrawals';
export const CASH_WITHDRAWAL_SLOTS_COLLECTION = 'cash_withdrawal_slots';
const SETTINGS_DOC = 'kora_cash_withdrawals';

/** Si la lecture échoue : réglages par défaut, donc retrait coupé. Le repli ne peut jamais ouvrir un retrait. */
export async function getWithdrawalSettings(): Promise<WithdrawalSettings> {
  try {
    const snap = await getFirebaseAdminAppDb().collection(KORA_CASH_CONFIG_COLLECTION).doc(SETTINGS_DOC).get();
    return normalizeWithdrawalSettings(snap.exists ? snap.data() : undefined);
  } catch (err) {
    console.warn('[KoraCash] Lecture des réglages de retrait impossible : retrait coupé.', err instanceof Error ? err.message : String(err));
    return { ...DEFAULT_WITHDRAWAL_SETTINGS };
  }
}

export async function updateWithdrawalSettings(patch: WithdrawalSettingsPatch, actorEmail?: string): Promise<WithdrawalSettings> {
  const db = getFirebaseAdminAppDb();
  const ref = db.collection(KORA_CASH_CONFIG_COLLECTION).doc(SETTINGS_DOC);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = normalizeWithdrawalSettings(snap.exists ? snap.data() : undefined);
    const next: WithdrawalSettings = { ...current, ...patch, updatedAt: Date.now(), ...(actorEmail ? { updatedBy: actorEmail } : {}) };
    tx.set(ref, next);
    return next;
  });
}

export async function createWithdrawal(doc: WithdrawalDoc): Promise<void> {
  await getFirebaseAdminAppDb().collection(CASH_WITHDRAWALS_COLLECTION).doc(doc.id).create(doc);
}

export async function getWithdrawal(id: string): Promise<WithdrawalDoc | null> {
  const snap = await getFirebaseAdminAppDb().collection(CASH_WITHDRAWALS_COLLECTION).doc(id).get();
  return snap.exists ? (snap.data() as WithdrawalDoc) : null;
}

/** Applique une transition si le retrait est encore dans un des états attendus. Renvoie null si un autre appel est passé avant. */
export async function transitionWithdrawal(id: string, from: WithdrawalStatus[], to: WithdrawalStatus, patch: Partial<WithdrawalDoc> = {}): Promise<WithdrawalDoc | null> {
  const db = getFirebaseAdminAppDb();
  const ref = db.collection(CASH_WITHDRAWALS_COLLECTION).doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const current = snap.data() as WithdrawalDoc;
    if (!from.includes(current.status) || !canTransitionWithdrawal(current.status, to)) return null;
    const next: WithdrawalDoc = { ...current, ...patch, status: to, updatedAt: Date.now() };
    tx.set(ref, next);
    // Un retrait n'arrive à SUCCESS qu'une fois : il ne peut pas compter deux fois dans les totaux.
    if (to === 'SUCCESS') addFinanceCounters(tx, { withdrawalsNet: next.net, withdrawalFees: next.fee }, next.updatedAt, next.environment);
    return next;
  });
}

/** Une seule demande en cours par joueur : prise de place atomique. Renvoie faux si une demande est déjà en cours. */
export async function acquireWithdrawalSlot(uid: string, withdrawalId: string): Promise<boolean> {
  const db = getFirebaseAdminAppDb();
  const ref = db.collection(CASH_WITHDRAWAL_SLOTS_COLLECTION).doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return false;
    tx.set(ref, { uid, withdrawalId, createdAt: Date.now() });
    return true;
  });
}

export async function releaseWithdrawalSlot(uid: string, withdrawalId: string): Promise<void> {
  const db = getFirebaseAdminAppDb();
  const ref = db.collection(CASH_WITHDRAWAL_SLOTS_COLLECTION).doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.data()?.withdrawalId === withdrawalId) tx.delete(ref);
  });
}

export async function sumDailyWithdrawals(uid: string, dateKey: string): Promise<number> {
  const snap = await getFirebaseAdminAppDb()
    .collection(CASH_WITHDRAWALS_COLLECTION)
    .where('uid', '==', uid)
    .where('dateKey', '==', dateKey)
    .get();
  return snap.docs
    .map((d) => d.data() as WithdrawalDoc)
    .filter((w) => countsTowardDailyTotal(w.status))
    .reduce((total, w) => total + w.amount, 0);
}

export async function hasWithdrawalHold(id: string, environment: 'DEMO'): Promise<boolean> {
  const snap = await getFirebaseAdminAppDb().collection(ledgerCollectionFor(environment)).doc(ledgerRefForHold(id)).get();
  return snap.exists;
}

/** Dernières demandes d'un joueur (les plus récentes d'abord). */
export async function listPlayerWithdrawals(uid: string, max: number = 10): Promise<WithdrawalDoc[]> {
  const snap = await getFirebaseAdminAppDb().collection(CASH_WITHDRAWALS_COLLECTION).where('uid', '==', uid).get();
  return snap.docs
    .map((d) => d.data() as WithdrawalDoc)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, Math.max(1, Math.floor(max)));
}

/** File de suivi katika. Une seule lecture bornée, comptée dans la jauge de lectures. */
export async function listRecentWithdrawals(max: number = 50): Promise<WithdrawalDoc[]> {
  const limit = Math.min(100, Math.max(1, Math.floor(max)));
  const snap = await getFirebaseAdminAppDb().collection(CASH_WITHDRAWALS_COLLECTION).orderBy('createdAt', 'desc').limit(limit).get();
  recordServerReads(snap.size);
  return snap.docs.map((d) => d.data() as WithdrawalDoc);
}
