/**
 * Kora Cash — stockage des finances (écriture serveur uniquement, Admin SDK).
 * Collections fermées à tous les clients : cash_finance_daily, cash_finance_totals, cash_reconciliations.
 * Réglages : katika_config/kora_cash_finance.
 * Les totaux s'écrivent dans la même transaction que l'événement qu'ils comptent : une opération rejouée ne compte jamais deux fois.
 */

import { randomBytes } from 'node:crypto';
import { AggregateField, FieldValue, Transaction } from 'firebase-admin/firestore';
import { getFirebaseAdminAppDb } from '../firebaseAdmin';
import { recordServerReads } from '../katika/readBudget';
import { KORA_CASH_CONFIG_COLLECTION } from './cashConfigStore';
import { CashEnvironment, walletCollectionFor } from './cashTypes';
import { dateKeyFor } from './withdrawalRules';
import {
  DEFAULT_FINANCE_SETTINGS,
  EMPTY_FINANCE_COUNTERS,
  FinanceCounters,
  FinanceSettings,
  addCounters,
  DailyPoint,
  OperatorWithdrawalInput,
  dateKeyToNoonMs,
  lastDateKeys,
  normalizeFinanceSettings,
  summarize,
  toCounters,
} from './financeRules';

export const CASH_FINANCE_DAILY_COLLECTION = 'cash_finance_daily';
export const CASH_FINANCE_TOTALS_COLLECTION = 'cash_finance_totals';
export const CASH_RECONCILIATIONS_COLLECTION = 'cash_reconciliations';
export const CASH_OPERATOR_WITHDRAWALS_COLLECTION = 'cash_operator_withdrawals';
const SETTINGS_DOC = 'kora_cash_finance';

/** Statuts d'un retrait dont l'argent a quitté le solde sans que l'envoi soit terminé : il reste dû au joueur. */
const IN_FLIGHT_WITHDRAWAL_STATUSES = ['HOLDING', 'AWAITING_APPROVAL', 'READY', 'SENDING', 'PROCESSING', 'REVIEW', 'REFUNDING'];

/** Si la lecture échoue : valeurs par défaut, donc des frais de dépôt annoncés plutôt qu'un dépôt sans frais par erreur. */
export async function getFinanceSettings(): Promise<FinanceSettings> {
  try {
    const snap = await getFirebaseAdminAppDb().collection(KORA_CASH_CONFIG_COLLECTION).doc(SETTINGS_DOC).get();
    return normalizeFinanceSettings(snap.exists ? snap.data() : undefined);
  } catch (err) {
    console.warn('[KoraCash] Lecture des réglages financiers impossible : valeurs par défaut.', err instanceof Error ? err.message : String(err));
    return { ...DEFAULT_FINANCE_SETTINGS };
  }
}

export async function updateFinanceSettings(patch: Partial<FinanceSettings>, actorEmail?: string): Promise<FinanceSettings> {
  const db = getFirebaseAdminAppDb();
  const ref = db.collection(KORA_CASH_CONFIG_COLLECTION).doc(SETTINGS_DOC);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = normalizeFinanceSettings(snap.exists ? snap.data() : undefined);
    const next: FinanceSettings = { ...current, ...patch, updatedAt: Date.now(), ...(actorEmail ? { updatedBy: actorEmail } : {}) };
    tx.set(ref, next);
    return next;
  });
}

/** Ajoute des montants aux totaux du jour et au total général, dans la transaction de l'appelant. */
export function addFinanceCounters(tx: Transaction, delta: Partial<FinanceCounters>, nowMs: number, environment: CashEnvironment = 'DEMO'): void {
  const increments: Record<string, FieldValue> = {};
  Object.entries(delta).forEach(([key, value]) => {
    if (typeof value === 'number' && value !== 0) increments[key] = FieldValue.increment(value);
  });
  if (Object.keys(increments).length === 0) return;
  const db = getFirebaseAdminAppDb();
  const dateKey = dateKeyFor(nowMs);
  tx.set(db.collection(CASH_FINANCE_DAILY_COLLECTION).doc(`${environment}_${dateKey}`), { environment, dateKey, ...increments }, { merge: true });
  tx.set(db.collection(CASH_FINANCE_TOTALS_COLLECTION).doc(environment), { environment, ...increments }, { merge: true });
}

export async function getFinanceTotals(environment: CashEnvironment = 'DEMO'): Promise<FinanceCounters> {
  const snap = await getFirebaseAdminAppDb().collection(CASH_FINANCE_TOTALS_COLLECTION).doc(environment).get();
  return toCounters(snap.exists ? snap.data() : undefined);
}

/** Recettes et marge : aujourd'hui, 7 jours, 30 jours, total. Au plus 31 lectures. */
export async function getFinancePeriods(settings: FinanceSettings, environment: CashEnvironment = 'DEMO') {
  const db = getFirebaseAdminAppDb();
  const now = Date.now();
  const keys = lastDateKeys(now, 30, dateKeyFor);
  const refs = keys.map((key) => db.collection(CASH_FINANCE_DAILY_COLLECTION).doc(`${environment}_${key}`));
  const [snaps, total] = await Promise.all([db.getAll(...refs), getFinanceTotals(environment)]);
  recordServerReads(snaps.length + 1);
  const days = snaps.map((snap) => toCounters(snap.exists ? snap.data() : undefined));
  const sumFirst = (count: number) => days.slice(0, count).reduce(addCounters, { ...EMPTY_FINANCE_COUNTERS });
  return {
    today: summarize(sumFirst(1), settings),
    week: summarize(sumFirst(7), settings),
    month: summarize(sumFirst(30), settings),
    total: summarize(total, settings),
  };
}

/** Ce que le jeu doit aux joueurs. Le total des soldes est une agrégation : son coût ne dépend pas du nombre de joueurs. */
export async function getOwedToPlayers(environment: CashEnvironment = 'DEMO') {
  const db = getFirebaseAdminAppDb();
  const [walletSnap, withdrawalsSnap] = await Promise.all([
    db.collection(walletCollectionFor(environment)).aggregate({ available: AggregateField.sum('available'), locked: AggregateField.sum('locked') }).get(),
    db.collection('cash_withdrawals').where('status', 'in', IN_FLIGHT_WITHDRAWAL_STATUSES).limit(500).get(),
  ]);
  recordServerReads(withdrawalsSnap.size + 1);
  const available = Number(walletSnap.data().available) || 0;
  const locked = Number(walletSnap.data().locked) || 0;
  const inFlight = withdrawalsSnap.docs.reduce((total, d) => total + (Number(d.data().amount) || 0), 0);
  return { available, locked, inFlight, inFlightCount: withdrawalsSnap.size, owed: available + locked + inFlight };
}

export interface ReconciliationDoc {
  id: string;
  environment: CashEnvironment;
  source: 'API' | 'MANUAL';
  campayBalance: number;
  owed: number;
  available: number;
  locked: number;
  inFlight: number;
  inFlightCount: number;
  realMargin: number;
  expectedMargin: number;
  gap: number;
  alert: boolean;
  counters: FinanceCounters;
  isBaseline: boolean;
  note?: string;
  actor: string;
  createdAt: number;
}

export async function saveReconciliation(doc: ReconciliationDoc): Promise<void> {
  await getFirebaseAdminAppDb().collection(CASH_RECONCILIATIONS_COLLECTION).doc(doc.id).create(doc);
}

export async function listReconciliations(max: number = 20): Promise<ReconciliationDoc[]> {
  const snap = await getFirebaseAdminAppDb()
    .collection(CASH_RECONCILIATIONS_COLLECTION)
    .orderBy('createdAt', 'desc')
    .limit(Math.min(100, Math.max(1, Math.floor(max))))
    .get();
  recordServerReads(snap.size);
  return snap.docs.map((d) => d.data() as ReconciliationDoc);
}

/** Dernier point de départ enregistré. */
export async function getLatestBaseline(): Promise<ReconciliationDoc | null> {
  const snap = await getFirebaseAdminAppDb().collection(CASH_RECONCILIATIONS_COLLECTION).where('isBaseline', '==', true).get();
  recordServerReads(snap.size);
  const docs = snap.docs.map((d) => d.data() as ReconciliationDoc).sort((a, b) => b.createdAt - a.createdAt);
  return docs[0] ?? null;
}


/** Totaux jour par jour (du plus ancien au plus récent), aujourd'hui compris. Au plus 90 lectures, comptées dans la jauge. */
export async function getFinanceDaily(environment: CashEnvironment, days: number, nowMs: number = Date.now()): Promise<DailyPoint[]> {
  const db = getFirebaseAdminAppDb();
  const keys = lastDateKeys(nowMs, days, dateKeyFor).reverse();
  const snaps = await db.getAll(...keys.map((key) => db.collection(CASH_FINANCE_DAILY_COLLECTION).doc(`${environment}_${key}`)));
  recordServerReads(snaps.length);
  return snaps.map((snap, index) => ({ dateKey: keys[index], counters: toCounters(snap.exists ? snap.data() : undefined) }));
}

export interface OperatorWithdrawalDoc {
  id: string;
  environment: CashEnvironment;
  amount: number;
  /** Jour du retrait (AAAA-MM-JJ, Douala) : celui où il compte dans les totaux. */
  dateKey: string;
  note: string;
  actor: string;
  createdAt: number;
  cancelledAt?: number;
  cancelledBy?: string;
}

/** Enregistre un retrait de l'exploitant et le compte dans les totaux, dans la même transaction. */
export async function createOperatorWithdrawal(environment: CashEnvironment, input: OperatorWithdrawalInput, actor: string, nowMs: number = Date.now()): Promise<OperatorWithdrawalDoc> {
  const noon = dateKeyToNoonMs(input.dateKey);
  if (noon === null) throw new Error('Date invalide.');
  const doc: OperatorWithdrawalDoc = {
    id: `owd_${nowMs}_${randomBytes(4).toString('hex')}`,
    environment,
    amount: input.amount,
    dateKey: input.dateKey,
    note: input.note,
    actor,
    createdAt: nowMs,
  };
  const db = getFirebaseAdminAppDb();
  await db.runTransaction(async (tx) => {
    tx.create(db.collection(CASH_OPERATOR_WITHDRAWALS_COLLECTION).doc(doc.id), doc);
    addFinanceCounters(tx, { operatorWithdrawals: input.amount }, noon, environment);
  });
  return doc;
}

export class OperatorWithdrawalError extends Error {
  constructor(public readonly code: 'NOT_FOUND' | 'ALREADY_CANCELLED', message: string) {
    super(message);
  }
}

/** Annule une saisie (faute de frappe) : la ligne reste, marquée annulée, et les totaux sont corrigés dans la même transaction. */
export async function cancelOperatorWithdrawal(id: string, actor: string, nowMs: number = Date.now()): Promise<OperatorWithdrawalDoc> {
  if (!/^owd_\d+_[0-9a-f]{8}$/.test(id)) throw new OperatorWithdrawalError('NOT_FOUND', 'Retrait introuvable.');
  const db = getFirebaseAdminAppDb();
  const ref = db.collection(CASH_OPERATOR_WITHDRAWALS_COLLECTION).doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new OperatorWithdrawalError('NOT_FOUND', 'Retrait introuvable.');
    const doc = snap.data() as OperatorWithdrawalDoc;
    if (doc.cancelledAt) throw new OperatorWithdrawalError('ALREADY_CANCELLED', 'Ce retrait est déjà annulé.');
    const noon = dateKeyToNoonMs(doc.dateKey) ?? doc.createdAt;
    const next: OperatorWithdrawalDoc = { ...doc, cancelledAt: nowMs, cancelledBy: actor };
    tx.set(ref, next);
    addFinanceCounters(tx, { operatorWithdrawals: -doc.amount }, noon, doc.environment);
    return next;
  });
}

/** Derniers retraits de l'exploitant pour un environnement (annulés compris, marqués). Une lecture bornée. */
export async function listOperatorWithdrawals(environment: CashEnvironment, max: number = 50): Promise<OperatorWithdrawalDoc[]> {
  const snap = await getFirebaseAdminAppDb()
    .collection(CASH_OPERATOR_WITHDRAWALS_COLLECTION)
    .orderBy('createdAt', 'desc')
    .limit(Math.min(200, Math.max(1, Math.floor(max))))
    .get();
  recordServerReads(snap.size);
  return snap.docs.map((d) => d.data() as OperatorWithdrawalDoc).filter((d) => d.environment === environment);
}
