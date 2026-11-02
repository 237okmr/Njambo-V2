/**
 * Kora Cash — stockage des tables Cash (écriture serveur uniquement, Admin SDK).
 * Collections fermées à tous les clients : cash_table_seats, cash_table_parties, cash_table_consents.
 * Réglages : katika_config/kora_cash_tables.
 */

import { getFirebaseAdminAppDb } from '../firebaseAdmin';
import { recordServerReads } from '../katika/readBudget';
import { KORA_CASH_CONFIG_COLLECTION, getKoraCashConfig } from './cashConfigStore';
import { CashEnvironment, ledgerCollectionFor } from './cashTypes';
import { applyMovement } from './walletLedger';
import { addFinanceCounters } from './financeStore';
import { CashPartieDoc, CashSeatDoc, CashTableBook, CashTableDeps } from './cashTables';
import {
  CASH_TABLE_CONSENT_VERSION,
  CashTableSettings,
  CashTableSettingsPatch,
  DEFAULT_CASH_TABLE_SETTINGS,
  normalizeCashTableSettings,
} from './cashTableRules';

export const CASH_TABLE_SEATS_COLLECTION = 'cash_table_seats';
export const CASH_TABLE_PARTIES_COLLECTION = 'cash_table_parties';
export const CASH_TABLE_CONSENTS_COLLECTION = 'cash_table_consents';
const SETTINGS_DOC = 'kora_cash_tables';

/** Si la lecture échoue : réglages par défaut, donc tables fermées. Le repli ne peut jamais ouvrir une table. */
export async function getCashTableSettings(): Promise<CashTableSettings> {
  try {
    const snap = await getFirebaseAdminAppDb().collection(KORA_CASH_CONFIG_COLLECTION).doc(SETTINGS_DOC).get();
    return normalizeCashTableSettings(snap.exists ? snap.data() : undefined);
  } catch (err) {
    console.warn('[KoraCash] Lecture des réglages des tables impossible : tables fermées.', err instanceof Error ? err.message : String(err));
    return { ...DEFAULT_CASH_TABLE_SETTINGS };
  }
}

export async function updateCashTableSettings(patch: CashTableSettingsPatch, actorEmail?: string): Promise<CashTableSettings> {
  const db = getFirebaseAdminAppDb();
  const ref = db.collection(KORA_CASH_CONFIG_COLLECTION).doc(SETTINGS_DOC);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = normalizeCashTableSettings(snap.exists ? snap.data() : undefined);
    const next: CashTableSettings = { ...current, ...patch, updatedAt: Date.now(), ...(actorEmail ? { updatedBy: actorEmail } : {}) };
    tx.set(ref, next);
    return next;
  });
}

/** Le serveur reste seul juge : Kora Cash activé, environnement démo, interrupteur des tables ouvert. */
export async function getCashTablesAccess(): Promise<{ open: boolean; settings: CashTableSettings }> {
  const [cfg, settings] = await Promise.all([getKoraCashConfig(), getCashTableSettings()]);
  return { open: cfg.isEnabled && cfg.environment === 'DEMO' && settings.enabled, settings };
}

export async function hasCashTableConsent(uid: string): Promise<boolean> {
  const snap = await getFirebaseAdminAppDb().collection(CASH_TABLE_CONSENTS_COLLECTION).doc(uid).get();
  return snap.exists && snap.data()?.version === CASH_TABLE_CONSENT_VERSION;
}

/** Preuve de la confirmation « 18 ans et argent réel » : qui, quand, et quelle version du texte. */
export async function recordCashTableConsent(uid: string): Promise<void> {
  await getFirebaseAdminAppDb().collection(CASH_TABLE_CONSENTS_COLLECTION).doc(uid).set({
    uid,
    version: CASH_TABLE_CONSENT_VERSION,
    acceptedAt: Date.now(),
    statement: 'Je confirme avoir 18 ans ou plus et savoir que je joue de l’argent réel.',
  });
}

/** Sièges encore ouverts : ceux dont la table n'existe plus sont à rendre depuis Katika. Lecture bornée, comptée dans la jauge. */
export async function listOpenCashSeats(max: number = 100): Promise<CashSeatDoc[]> {
  const snap = await getFirebaseAdminAppDb()
    .collection(CASH_TABLE_SEATS_COLLECTION)
    .where('status', '==', 'OPEN')
    .limit(Math.min(200, Math.max(1, Math.floor(max))))
    .get();
  recordServerReads(snap.size);
  return snap.docs.map((d) => d.data() as CashSeatDoc);
}

/** Dernières parties jouées, pour le total de commission affiché dans Katika. Lecture bornée, comptée dans la jauge. */
export async function listRecentCashParties(max: number = 100): Promise<CashPartieDoc[]> {
  const snap = await getFirebaseAdminAppDb()
    .collection(CASH_TABLE_PARTIES_COLLECTION)
    .orderBy('createdAt', 'desc')
    .limit(Math.min(200, Math.max(1, Math.floor(max))))
    .get();
  recordServerReads(snap.size);
  return snap.docs.map((d) => d.data() as CashPartieDoc);
}

function createLiveCashTableDeps(): CashTableDeps {
  const seats = () => getFirebaseAdminAppDb().collection(CASH_TABLE_SEATS_COLLECTION);
  return {
    applyMovement,
    openSeat: async (doc) => {
      await seats().doc(doc.id).set(doc);
    },
    addSeatBuyIn: async (id, amount) => {
      const db = getFirebaseAdminAppDb();
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(seats().doc(id));
        if (snap.exists) tx.update(snap.ref, { buyInTotal: Number(snap.data()?.buyInTotal || 0) + amount });
      });
    },
    closeSeat: async (id, patch) => {
      await seats().doc(id).set({ ...patch, status: 'CLOSED', closedAt: Date.now() }, { merge: true });
    },
    getSeat: async (id) => {
      const snap = await seats().doc(id).get();
      return snap.exists ? (snap.data() as CashSeatDoc) : null;
    },
    recordPartie: async (doc) => {
      // La commission ne compte qu'à la première écriture de cette partie : la rejouer n'ajoute rien aux totaux.
      const db = getFirebaseAdminAppDb();
      const ref = db.collection(CASH_TABLE_PARTIES_COLLECTION).doc(doc.id);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists) return;
        tx.set(ref, doc);
        addFinanceCounters(tx, { rake: doc.rake }, doc.createdAt, 'DEMO');
      });
    },
    sumTableLocked: async (uid, tableId, environment: CashEnvironment) => {
      const snap = await getFirebaseAdminAppDb().collection(ledgerCollectionFor(environment)).where('meta.tableId', '==', tableId).get();
      recordServerReads(snap.size);
      return snap.docs.map((d) => d.data()).filter((e) => e.uid === uid).reduce((total, e) => total + Number(e.lockedDelta || 0), 0);
    },
  };
}

let liveBook: CashTableBook | null = null;

/** Livre de compte unique du processus : il retient, table par table, ce que le registre connaît déjà. */
export function getLiveCashTableBook(): CashTableBook {
  if (!liveBook) liveBook = new CashTableBook(createLiveCashTableDeps(), 'DEMO');
  return liveBook;
}
