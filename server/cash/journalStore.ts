/**
 * Kora Cash — lecture du journal global pour katika (lecture seule, Admin SDK).
 * Aucune écriture, aucun délai : les tailles de page et les plafonds de lectures viennent du registre (réglables dans katika).
 * Chaque ligne lue est comptée dans la jauge de lectures du serveur.
 */

import { FieldPath } from 'firebase-admin/firestore';
import { getFirebaseAdminAppDb } from '../firebaseAdmin';
import { getEngineConfig } from '../engine/engineConfig';
import { PARAM_BY_KEY } from '../engine/engineParams';
import { recordServerReads } from '../katika/readBudget';
import { katikaDashboardData } from '../katika/dashboardData';
import { CashEnvironment, CashLedgerEntry, ledgerCollectionFor } from './cashTypes';
import { JournalBatchReader, journalPlayerName } from './cashJournalRules';

/** Lit les lignes d'une période, plus récentes d'abord, par lots. L'index de la période est automatique : rien à créer. */
export function createLedgerBatchReader(environment: CashEnvironment, from: number, to: number): JournalBatchReader {
  return async (cursor, limit) => {
    let query = getFirebaseAdminAppDb()
      .collection(ledgerCollectionFor(environment))
      .where('createdAt', '>=', from)
      .where('createdAt', '<=', to)
      .orderBy('createdAt', 'desc')
      .orderBy(FieldPath.documentId(), 'desc');
    if (cursor) query = query.startAfter(cursor.createdAt, cursor.ref);
    const snap = await query.limit(limit).get();
    recordServerReads(snap.size);
    return snap.docs.map((d) => d.data() as CashLedgerEntry);
  };
}

/**
 * Noms des joueurs (identifiant -> nom affiché), pris dans le dossier des joueurs que le serveur garde déjà en mémoire.
 * Sans ce dossier (quota atteint, panne), on affiche « Joueur #xxxx » : le journal reste lisible.
 */
export async function loadJournalNames(): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  try {
    const result = await katikaDashboardData.get('users');
    if (!result.ok) return names;
    for (const doc of result.docs) {
      const uid = String(doc.id || doc.uid || '');
      if (uid) names.set(uid, journalPlayerName(uid, doc.displayName));
    }
  } catch {
    // Dossier indisponible : les noms retombent sur « Joueur #xxxx ».
  }
  return names;
}

export interface JournalLimits {
  pageLines: number;
  maxReads: number;
  exportMaxLines: number;
  exportMaxReads: number;
}

function numberFromRegistry(cfg: Record<string, unknown>, key: string): number {
  const configured = Number(cfg[key]);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : Number(PARAM_BY_KEY[key].default);
}

/** Tailles et plafonds du journal, lus dans le registre unique. */
export function getJournalLimits(): JournalLimits {
  const cfg = getEngineConfig() as unknown as Record<string, unknown>;
  return {
    pageLines: numberFromRegistry(cfg, 'katikaJournalPageLines'),
    maxReads: numberFromRegistry(cfg, 'katikaJournalMaxReads'),
    exportMaxLines: numberFromRegistry(cfg, 'katikaJournalExportMaxLines'),
    exportMaxReads: numberFromRegistry(cfg, 'katikaJournalExportMaxReads'),
  };
}
