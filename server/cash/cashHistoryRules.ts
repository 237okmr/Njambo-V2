/**
 * Kora Cash — ce que le joueur voit de son registre. Fonctions pures : aucun réseau, aucune écriture.
 * Seuls le type, le montant et la date sortent : ni note, ni acteur, ni clé, ni référence interne.
 */

import { CashLedgerEntry, CashMovementKind } from './cashTypes';

export const CASH_HISTORY_MAX_LINES = 50;

export interface PublicCashMovement {
  kind: CashMovementKind;
  /** Effet sur l'argent du joueur, en FCFA : positif s'il gagne, négatif s'il perd ou engage. */
  amount: number;
  createdAt: number;
}

export function movementAmount(entry: CashLedgerEntry): number {
  if (entry.kind === 'TABLE_SETTLEMENT') return entry.lockedDelta;
  if (entry.kind === 'ADJUSTMENT') return entry.availableDelta + entry.lockedDelta;
  return entry.availableDelta;
}

/** Les mouvements les plus récents d'abord, sans les lignes qui ne changent rien. */
export function toPublicMovements(entries: CashLedgerEntry[], max: number = CASH_HISTORY_MAX_LINES): PublicCashMovement[] {
  return entries
    .map((entry) => ({ kind: entry.kind, amount: movementAmount(entry), createdAt: entry.createdAt }))
    .filter((movement) => movement.amount !== 0)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, Math.max(1, Math.floor(max)));
}
