/**
 * Kora Cash — types du portefeuille et du registre des transactions.
 *
 * Montants : FCFA en entiers (le XAF n'a pas de centimes). Aucun nombre décimal n'est accepté.
 * Ce fichier ne contient aucune logique de paiement, aucun secret, aucun délai.
 */

export const CASH_WALLETS_COLLECTION = 'cash_wallets';
export const CASH_LEDGER_COLLECTION = 'cash_ledger';

export type CashMovementKind =
  | 'DEPOSIT' // dépôt confirmé par le prestataire : disponible +
  | 'TABLE_BUYIN' // entrée ou recave à une table : disponible -, engagé +
  | 'TABLE_CASHOUT' // sortie de table : engagé -, disponible +
  | 'TABLE_SETTLEMENT' // résultat d'une partie : engagé uniquement (gain ou perte)
  | 'WITHDRAWAL_HOLD' // demande de retrait : disponible - (argent mis de côté)
  | 'WITHDRAWAL_REFUND' // retrait échoué ou annulé : disponible +
  | 'ADJUSTMENT'; // correction manuelle par un admin katika (acteur et note obligatoires)

export interface CashWallet {
  uid: string;
  /** Solde libre : retirable, utilisable pour entrer à une table. FCFA entiers. */
  available: number;
  /** Argent engagé sur une table en cours. FCFA entiers. */
  locked: number;
  createdAt: number;
  updatedAt: number;
}

export type CashMeta = Record<string, string | number | boolean | null>;

export interface CashMovementInput {
  /** Clé d'idempotence unique (identifiant du document de registre). Rejouer la même clé ne crée aucun second mouvement. */
  ref: string;
  uid: string;
  kind: CashMovementKind;
  availableDelta: number;
  lockedDelta: number;
  meta?: CashMeta;
  actorUid?: string;
  note?: string;
}

export interface CashLedgerEntry {
  ref: string;
  uid: string;
  kind: CashMovementKind;
  availableDelta: number;
  lockedDelta: number;
  availableBefore: number;
  availableAfter: number;
  lockedBefore: number;
  lockedAfter: number;
  createdAt: number;
  meta?: CashMeta;
  actorUid?: string;
  note?: string;
}

export type CashLedgerErrorCode =
  | 'INVALID_UID'
  | 'INVALID_REF'
  | 'INVALID_KIND'
  | 'INVALID_AMOUNT'
  | 'INVALID_KIND_SIGNS'
  | 'ADJUSTMENT_NEEDS_ACTOR'
  | 'INSUFFICIENT_AVAILABLE'
  | 'INSUFFICIENT_LOCKED'
  | 'CORRUPT_BALANCE'
  | 'REF_OWNER_MISMATCH'
  | 'REF_CONFLICT';

export class CashLedgerError extends Error {
  readonly code: CashLedgerErrorCode;

  constructor(code: CashLedgerErrorCode, message: string) {
    super(message);
    this.name = 'CashLedgerError';
    this.code = code;
  }
}
