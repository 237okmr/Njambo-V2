/**
 * Kora Cash — règles pures des tables Cash (aucun accès base de données, aucun délai).
 * Réglages Katika, bornes d'entrée et de recave, clés d'idempotence du registre.
 */

import { createHash } from 'crypto';

export const CASH_TABLE_CONSENT_VERSION = '2026-11-tables-v1';

export interface CashTableSettings {
  /** Fermé par défaut : aucune table Cash ne s'ouvre tant que Katika n'a pas ouvert. */
  enabled: boolean;
  /** Mises proposées, en FCFA. Aucune table à mise libre. */
  betLevels: number[];
  /** Entrée minimale et maximale, en multiples de la mise. */
  minBuyInMultiple: number;
  maxBuyInMultiple: number;
  /** Commission sur le pot gagné, sans plafond. */
  rakePercent: number;
  updatedAt?: number;
  updatedBy?: string;
}

export const DEFAULT_CASH_TABLE_SETTINGS: CashTableSettings = {
  enabled: false,
  betLevels: [5, 10, 25],
  minBuyInMultiple: 10,
  maxBuyInMultiple: 50,
  rakePercent: 5,
};

export type CashTableSettingsPatch = Partial<Omit<CashTableSettings, 'updatedAt' | 'updatedBy'>>;

const MAX_LEVELS = 6;
const MAX_BET_FCFA = 1_000_000;
const MIN_MULTIPLE = 2;
const MAX_MULTIPLE = 1000;
const MAX_RAKE_PERCENT = 20;

function cleanLevels(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_LEVELS) return null;
  if (!raw.every((v) => Number.isSafeInteger(v) && (v as number) >= 1 && (v as number) <= MAX_BET_FCFA)) return null;
  return [...new Set(raw as number[])].sort((a, b) => a - b);
}

/** Lit des réglages stockés ; toute valeur douteuse retombe sur le défaut, et l'ouverture n'est jamais présumée. */
export function normalizeCashTableSettings(raw: any): CashTableSettings {
  const d = DEFAULT_CASH_TABLE_SETTINGS;
  const min = Number.isSafeInteger(raw?.minBuyInMultiple) && raw.minBuyInMultiple >= MIN_MULTIPLE ? raw.minBuyInMultiple : d.minBuyInMultiple;
  const max = Number.isSafeInteger(raw?.maxBuyInMultiple) && raw.maxBuyInMultiple >= min && raw.maxBuyInMultiple <= MAX_MULTIPLE ? raw.maxBuyInMultiple : Math.max(min, d.maxBuyInMultiple);
  const rake = typeof raw?.rakePercent === 'number' && raw.rakePercent >= 0 && raw.rakePercent <= MAX_RAKE_PERCENT ? raw.rakePercent : d.rakePercent;
  return {
    enabled: raw?.enabled === true,
    betLevels: cleanLevels(raw?.betLevels) ?? [...d.betLevels],
    minBuyInMultiple: min,
    maxBuyInMultiple: max,
    rakePercent: rake,
    ...(typeof raw?.updatedAt === 'number' ? { updatedAt: raw.updatedAt } : {}),
    ...(typeof raw?.updatedBy === 'string' ? { updatedBy: raw.updatedBy } : {}),
  };
}

/** Valide une modification venue de Katika. Le patch n'est valable que si l'ensemble des réglages reste cohérent. */
export function parseCashTableSettingsPatch(body: any, current: CashTableSettings): { ok: boolean; patch?: CashTableSettingsPatch; error?: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Corps de requête invalide.' };
  const patch: CashTableSettingsPatch = {};

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== 'boolean') return { ok: false, error: 'Ouverture : valeur invalide.' };
    patch.enabled = body.enabled;
  }
  if (body.betLevels !== undefined) {
    const levels = cleanLevels(body.betLevels);
    if (!levels) return { ok: false, error: `Niveaux : de 1 à ${MAX_LEVELS} mises entières en FCFA.` };
    patch.betLevels = levels;
  }
  if (body.minBuyInMultiple !== undefined) {
    if (!Number.isSafeInteger(body.minBuyInMultiple) || body.minBuyInMultiple < MIN_MULTIPLE) return { ok: false, error: `Entrée minimale : au moins ${MIN_MULTIPLE} fois la mise.` };
    patch.minBuyInMultiple = body.minBuyInMultiple;
  }
  if (body.maxBuyInMultiple !== undefined) {
    if (!Number.isSafeInteger(body.maxBuyInMultiple) || body.maxBuyInMultiple > MAX_MULTIPLE) return { ok: false, error: `Entrée maximale : au plus ${MAX_MULTIPLE} fois la mise.` };
    patch.maxBuyInMultiple = body.maxBuyInMultiple;
  }
  if (body.rakePercent !== undefined) {
    if (typeof body.rakePercent !== 'number' || !Number.isFinite(body.rakePercent) || body.rakePercent < 0 || body.rakePercent > MAX_RAKE_PERCENT) {
      return { ok: false, error: `Commission : de 0 à ${MAX_RAKE_PERCENT} %.` };
    }
    patch.rakePercent = body.rakePercent;
  }

  const min = patch.minBuyInMultiple ?? current.minBuyInMultiple;
  const max = patch.maxBuyInMultiple ?? current.maxBuyInMultiple;
  if (max < min) return { ok: false, error: 'L’entrée maximale doit être au moins égale à l’entrée minimale.' };
  if (Object.keys(patch).length === 0) return { ok: false, error: 'Aucun réglage à modifier.' };
  return { ok: true, patch };
}

export interface BuyInRange {
  min: number;
  max: number;
}

export function buyInRangeFor(bet: number, settings: Pick<CashTableSettings, 'minBuyInMultiple' | 'maxBuyInMultiple'>): BuyInRange {
  return { min: bet * settings.minBuyInMultiple, max: bet * settings.maxBuyInMultiple };
}

/** Message d'erreur si l'entrée est refusée, sinon null. */
export function validateBuyIn(amount: unknown, range: BuyInRange): string | null {
  if (!Number.isSafeInteger(amount)) return 'Le montant doit être un nombre entier de FCFA.';
  if ((amount as number) < range.min || (amount as number) > range.max) return `L’entrée doit être comprise entre ${range.min} et ${range.max} FCFA.`;
  return null;
}

/** Recave : le capital après recave couvre au moins une mise et ne dépasse jamais le maximum d'entrée à la mise courante. */
export function validateRebuy(params: { amount: unknown; capital: number; bet: number; maxBuyInMultiple: number }): string | null {
  const { amount, capital, bet, maxBuyInMultiple } = params;
  if (!Number.isSafeInteger(amount) || (amount as number) <= 0) return 'Le montant doit être un nombre entier de FCFA.';
  const max = bet * maxBuyInMultiple;
  const after = capital + (amount as number);
  if (after > max) return `Après recave, ton capital ne peut pas dépasser ${max} FCFA.`;
  if (after < bet) return `Après recave, ton capital doit couvrir au moins la mise de ${bet} FCFA.`;
  return null;
}

export function isValidCapacity(capacity: unknown): capacity is 2 | 3 | 4 {
  return capacity === 2 || capacity === 3 || capacity === 4;
}

/** Étiquette courte et stable d'un joueur dans les clés du registre : garde les clés sous la longueur autorisée. */
export function uidTag(uid: string): string {
  return createHash('sha256').update(uid).digest('hex').slice(0, 16);
}

export function seatDocId(tableId: string, uid: string): string {
  return `${tableId}_${uidTag(uid)}`;
}

export const cashTableRefs = {
  buyIn: (tableId: string, uid: string, seq: number) => `ctb_${tableId}_${seq}_${uidTag(uid)}`,
  settlement: (tableId: string, uid: string, tag: string) => `cts_${tableId}_${tag}_${uidTag(uid)}`,
  cashOut: (tableId: string, uid: string, seq: number) => `ctc_${tableId}_${seq}_${uidTag(uid)}`,
  adminRefund: (tableId: string, uid: string) => `ctr_${tableId}_${uidTag(uid)}`,
};
