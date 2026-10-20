/**
 * Kora Cash — règles pures du registre (aucun accès base de données, aucun délai).
 * Garantit qu'un mouvement a un sens cohérent avec son type et qu'aucun solde ne passe sous zéro.
 */

import { CashLedgerError, CashMovementKind } from './cashTypes';

type Sign = 'POS' | 'NEG' | 'ZERO' | 'NONZERO';

interface KindRule {
  available: Sign;
  locked: Sign;
  /** true : la somme des deux variations doit être nulle (l'argent change de poche sans apparaître ni disparaître). */
  balanced: boolean;
}

const KIND_RULES: Record<CashMovementKind, KindRule> = {
  DEPOSIT: { available: 'POS', locked: 'ZERO', balanced: false },
  TABLE_BUYIN: { available: 'NEG', locked: 'POS', balanced: true },
  TABLE_CASHOUT: { available: 'POS', locked: 'NEG', balanced: true },
  TABLE_SETTLEMENT: { available: 'ZERO', locked: 'NONZERO', balanced: false },
  WITHDRAWAL_HOLD: { available: 'NEG', locked: 'ZERO', balanced: false },
  WITHDRAWAL_REFUND: { available: 'POS', locked: 'ZERO', balanced: false },
  ADJUSTMENT: { available: 'NONZERO', locked: 'ZERO', balanced: false },
};

function matchesSign(value: number, sign: Sign): boolean {
  switch (sign) {
    case 'POS':
      return value > 0;
    case 'NEG':
      return value < 0;
    case 'ZERO':
      return value === 0;
    case 'NONZERO':
      return value !== 0;
  }
}

export interface WalletBalances {
  available: number;
  locked: number;
}

export interface MovementCore {
  kind: CashMovementKind;
  availableDelta: number;
  lockedDelta: number;
  actorUid?: string;
}

/** Calcule les soldes après mouvement, ou lève une CashLedgerError. Ne modifie rien. */
export function computeMovement(before: WalletBalances, movement: MovementCore): WalletBalances {
  if (!Number.isSafeInteger(before.available) || !Number.isSafeInteger(before.locked) || before.available < 0 || before.locked < 0) {
    throw new CashLedgerError('CORRUPT_BALANCE', 'Solde existant invalide : mouvement refusé.');
  }

  if (!Number.isSafeInteger(movement.availableDelta) || !Number.isSafeInteger(movement.lockedDelta)) {
    throw new CashLedgerError('INVALID_AMOUNT', 'Les montants doivent être des entiers en FCFA.');
  }

  if (movement.availableDelta === 0 && movement.lockedDelta === 0) {
    throw new CashLedgerError('INVALID_AMOUNT', 'Un mouvement à zéro est refusé.');
  }

  const rule = KIND_RULES[movement.kind];
  if (!rule) {
    throw new CashLedgerError('INVALID_KIND', 'Type de mouvement inconnu.');
  }

  if (!matchesSign(movement.availableDelta, rule.available) || !matchesSign(movement.lockedDelta, rule.locked)) {
    throw new CashLedgerError('INVALID_KIND_SIGNS', `Signes incohérents pour le type ${movement.kind}.`);
  }

  if (rule.balanced && movement.availableDelta + movement.lockedDelta !== 0) {
    throw new CashLedgerError('INVALID_KIND_SIGNS', `Le type ${movement.kind} doit déplacer l'argent sans en créer ni en détruire.`);
  }

  if (movement.kind === 'ADJUSTMENT' && !movement.actorUid) {
    throw new CashLedgerError('ADJUSTMENT_NEEDS_ACTOR', 'Une correction manuelle exige l\'identifiant de l\'admin.');
  }

  const availableAfter = before.available + movement.availableDelta;
  const lockedAfter = before.locked + movement.lockedDelta;

  if (!Number.isSafeInteger(availableAfter) || !Number.isSafeInteger(lockedAfter)) {
    throw new CashLedgerError('INVALID_AMOUNT', 'Montant hors limites.');
  }
  if (availableAfter < 0) {
    throw new CashLedgerError('INSUFFICIENT_AVAILABLE', 'Solde disponible insuffisant.');
  }
  if (lockedAfter < 0) {
    throw new CashLedgerError('INSUFFICIENT_LOCKED', 'Montant engagé en table insuffisant.');
  }

  return { available: availableAfter, locked: lockedAfter };
}

/** Clé d'idempotence valide : sert d'identifiant de document, donc ni barre oblique ni caractère exotique. */
export function isValidRef(ref: unknown): ref is string {
  return typeof ref === 'string' && /^[A-Za-z0-9_.:-]{8,128}$/.test(ref);
}
