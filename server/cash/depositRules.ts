/**
 * Kora Cash — règles pures des dépôts (aucun accès base de données, aucun secret, aucun délai).
 * Un dépôt est un document à part (cash_deposits) ; l'argent n'entre dans le portefeuille que par une ligne du registre.
 */

import { randomBytes } from 'node:crypto';

/** Montant minimum d'un dépôt, en FCFA entiers. Aucun plafond au départ (décision produit). */
export const MIN_DEPOSIT_FCFA = 100;

export type DepositStatus = 'PENDING' | 'SUCCESS' | 'FAILED';
/** SIMULATED : faux paiement interne (démo). CAMPAY : paiement réel confirmé par le prestataire (lot ultérieur). */
export type DepositMode = 'SIMULATED' | 'CAMPAY';

export interface DepositDoc {
  id: string;
  uid: string;
  amount: number;
  mode: DepositMode;
  status: DepositStatus;
  createdAt: number;
  updatedAt: number;
  providerRef?: string;
}

export type DepositErrorCode = 'INVALID_AMOUNT' | 'DEPOSIT_NOT_FOUND' | 'DEPOSIT_OWNER_MISMATCH' | 'DEPOSIT_FAILED' | 'INVALID_DEPOSIT_ID';

export class DepositError extends Error {
  readonly code: DepositErrorCode;
  constructor(code: DepositErrorCode, message: string) {
    super(message);
    this.name = 'DepositError';
    this.code = code;
  }
}

export interface ParseAmountResult {
  ok: boolean;
  amount?: number;
  error?: string;
}

/** Valide le montant d'un dépôt : entier strictement positif, au moins MIN_DEPOSIT_FCFA, jamais décimal ni texte. */
export function parseDepositAmount(raw: unknown): ParseAmountResult {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw)) {
    return { ok: false, error: 'Le montant doit être un nombre entier de FCFA.' };
  }
  if (raw < MIN_DEPOSIT_FCFA) {
    return { ok: false, error: `Le dépôt minimum est de ${MIN_DEPOSIT_FCFA} FCFA.` };
  }
  return { ok: true, amount: raw };
}

/** Un dépôt ne quitte PENDING qu'une fois ; SUCCESS et FAILED sont définitifs. */
export function canTransition(from: DepositStatus, to: DepositStatus): boolean {
  return from === 'PENDING' && (to === 'SUCCESS' || to === 'FAILED');
}

export function isValidDepositId(id: unknown): id is string {
  return typeof id === 'string' && /^dep_[a-f0-9]{24}$/.test(id);
}

export function newDepositId(): string {
  return `dep_${randomBytes(12).toString('hex')}`;
}

/** Clé d'idempotence du registre pour un dépôt : le même dépôt ne crédite jamais deux fois. */
export function ledgerRefForDeposit(depositId: string): string {
  return `deposit:${depositId}`;
}
