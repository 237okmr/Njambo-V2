/**
 * Kora Cash — règles pures du retrait (aucun réseau, aucun accès base de données, aucun secret, aucun délai).
 *
 * Trajet : argent mis de côté → attente de validation ou envoi automatique → envoi unique à Campay → relecture.
 * Règle d'or : on ne rembourse que si Campay confirme l'échec ou si un admin le décide. Dans le doute, l'argent reste
 * de côté et la demande passe en vérification : rembourser un retrait parti ferait payer deux fois.
 */

import { randomBytes } from 'node:crypto';
import { CAMPAY_DEMO_MAX_FCFA, CAMPAY_DEMO_MIN_FCFA, CampayStatusReading, mapCampayStatus, parseCampayAmount } from './campayRules';

export type WithdrawalStatus =
  | 'HOLDING' // demande créée, mise de côté de l'argent en cours
  | 'AWAITING_APPROVAL' // argent de côté, attend la validation d'un admin
  | 'READY' // argent de côté, validée automatiquement
  | 'SENDING' // envoi à Campay en cours : pris par un seul appel, jamais renvoyé
  | 'PROCESSING' // Campay a accepté : on attend le résultat
  | 'REVIEW' // issue incertaine : argent gardé de côté, décision humaine requise
  | 'REFUNDING' // remboursement pris en charge
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELLED';

export type WithdrawalFinalRefund = 'FAILED' | 'CANCELLED';

export interface WithdrawalDoc {
  id: string;
  uid: string;
  environment: 'DEMO';
  /** Montant demandé : c'est ce qui sort du solde du joueur. */
  amount: number;
  fee: number;
  /** Montant envoyé sur le numéro du joueur. */
  net: number;
  phone: string;
  status: WithdrawalStatus;
  /** Jour (heure de Douala) : sert au total quotidien sans index composé. */
  dateKey: string;
  autoApproved: boolean;
  createdAt: number;
  updatedAt: number;
  campayReference?: string;
  campayStatus?: string;
  campayOperator?: string;
  campayReason?: string;
  /** Motif affiché en vérification ou en échec (texte court, jamais de secret). */
  note?: string;
  /** État final visé par un remboursement en cours. */
  refundFinal?: WithdrawalFinalRefund;
  /** Admin qui a validé, refusé ou tranché. */
  decidedBy?: string;
  /** Signaux qui ont envoyé ce retrait à la validation. Jamais montrés au joueur. */
  reviewReasons?: string[];
}

const ALLOWED_TRANSITIONS: Record<WithdrawalStatus, WithdrawalStatus[]> = {
  HOLDING: ['AWAITING_APPROVAL', 'READY', 'FAILED', 'REVIEW', 'REFUNDING'],
  AWAITING_APPROVAL: ['SENDING', 'REFUNDING'],
  READY: ['SENDING', 'REVIEW'],
  SENDING: ['PROCESSING', 'REVIEW', 'REFUNDING', 'SUCCESS'],
  PROCESSING: ['SUCCESS', 'REVIEW', 'REFUNDING'],
  REVIEW: ['SUCCESS', 'REFUNDING', 'PROCESSING'],
  REFUNDING: ['FAILED', 'CANCELLED'],
  SUCCESS: [],
  FAILED: [],
  CANCELLED: [],
};

export function canTransitionWithdrawal(from: WithdrawalStatus, to: WithdrawalStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) === true;
}

export function isFinalWithdrawal(status: WithdrawalStatus): boolean {
  return status === 'SUCCESS' || status === 'FAILED' || status === 'CANCELLED';
}

/** Compte dans le total du jour : tout ce qui est parti ou peut encore partir. */
export function countsTowardDailyTotal(status: WithdrawalStatus): boolean {
  return status !== 'FAILED' && status !== 'CANCELLED' && status !== 'REFUNDING';
}

export function isValidWithdrawalId(id: unknown): id is string {
  return typeof id === 'string' && /^wd_[a-f0-9]{24}$/.test(id);
}

export function newWithdrawalId(): string {
  return `wd_${randomBytes(12).toString('hex')}`;
}

/** Clés du registre : la mise de côté et le remboursement d'un retrait ne peuvent chacun avoir lieu qu'une fois. */
export function ledgerRefForHold(id: string): string {
  return `withdrawal:${id}`;
}

export function ledgerRefForRefund(id: string): string {
  return `withdrawal-refund:${id}`;
}

/** Jour au Cameroun (UTC+1, sans heure d'été), au format AAAA-MM-JJ. */
export function dateKeyFor(nowMs: number): string {
  return new Date(nowMs + 3_600_000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Réglages (katika)
// ---------------------------------------------------------------------------

export interface WithdrawalSettings {
  /** Interrupteur du retrait : coupé par défaut, ouvert depuis katika. */
  enabled: boolean;
  /** Une demande jusqu'à ce montant part sans validation. */
  autoThresholdFcfa: number;
  /** Au-delà de ce total par jour et par joueur, tout attend une validation. */
  dailyAutoFcfa: number;
  /** Frais retenus sur le montant demandé, en pourcentage. À régler d'après le tarif réel de Campay. */
  feePercent: number;
  /** Nombre de numéros Mobile Money qu'un joueur peut enregistrer. */
  maxPhones: number;
  updatedAt: number;
  updatedBy?: string;
}

export const DEFAULT_WITHDRAWAL_SETTINGS: WithdrawalSettings = {
  enabled: false,
  autoThresholdFcfa: 5000,
  dailyAutoFcfa: 20000,
  feePercent: 1.5,
  maxPhones: 3,
  updatedAt: 0,
};

const SETTINGS_LIMITS: Record<'autoThresholdFcfa' | 'dailyAutoFcfa' | 'feePercent' | 'maxPhones', { min: number; max: number; integer: boolean }> = {
  autoThresholdFcfa: { min: 0, max: 10_000_000, integer: true },
  dailyAutoFcfa: { min: 0, max: 100_000_000, integer: true },
  feePercent: { min: 0, max: 20, integer: false },
  maxPhones: { min: 1, max: 10, integer: true },
};

export type WithdrawalSettingsPatch = Partial<Pick<WithdrawalSettings, 'enabled' | 'autoThresholdFcfa' | 'dailyAutoFcfa' | 'feePercent' | 'maxPhones'>>;

function isWithinLimits(key: keyof typeof SETTINGS_LIMITS, value: unknown): value is number {
  const limits = SETTINGS_LIMITS[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (limits.integer && !Number.isSafeInteger(value)) return false;
  return value >= limits.min && value <= limits.max;
}

/** Valide strictement une demande de modification : clés connues seulement, valeurs dans leurs bornes. */
export function parseWithdrawalSettingsPatch(raw: unknown): { ok: boolean; patch?: WithdrawalSettingsPatch; error?: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'Corps de requête invalide.' };
  }
  const body = raw as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.length === 0) return { ok: false, error: 'Aucun champ à modifier.' };

  const patch: WithdrawalSettingsPatch = {};
  for (const key of keys) {
    if (key === 'enabled') {
      if (typeof body.enabled !== 'boolean') return { ok: false, error: 'enabled doit être un booléen.' };
      patch.enabled = body.enabled;
    } else if (key === 'autoThresholdFcfa' || key === 'dailyAutoFcfa' || key === 'feePercent' || key === 'maxPhones') {
      if (!isWithinLimits(key, body[key])) return { ok: false, error: `Valeur hors limites : ${key}.` };
      patch[key] = body[key] as number;
    } else {
      return { ok: false, error: `Champ non autorisé : ${key}.` };
    }
  }
  return { ok: true, patch };
}

/** Lecture tolérante : tout champ absent ou invalide retombe sur la valeur par défaut (retrait coupé). */
export function normalizeWithdrawalSettings(data: unknown): WithdrawalSettings {
  const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  const pick = (key: keyof typeof SETTINGS_LIMITS): number => (isWithinLimits(key, d[key]) ? (d[key] as number) : DEFAULT_WITHDRAWAL_SETTINGS[key]);
  return {
    enabled: d.enabled === true,
    autoThresholdFcfa: pick('autoThresholdFcfa'),
    dailyAutoFcfa: pick('dailyAutoFcfa'),
    feePercent: pick('feePercent'),
    maxPhones: pick('maxPhones'),
    updatedAt: typeof d.updatedAt === 'number' && Number.isFinite(d.updatedAt) ? d.updatedAt : 0,
    ...(typeof d.updatedBy === 'string' && d.updatedBy ? { updatedBy: d.updatedBy } : {}),
  };
}

// ---------------------------------------------------------------------------
// Montant, frais, validation automatique
// ---------------------------------------------------------------------------

/** En démo, le retrait suit les mêmes limites que le paiement de test Campay. */
export const WITHDRAWAL_DEMO_MIN_FCFA = CAMPAY_DEMO_MIN_FCFA;
export const WITHDRAWAL_DEMO_MAX_FCFA = CAMPAY_DEMO_MAX_FCFA;

export function parseWithdrawalAmount(raw: unknown): { ok: boolean; amount?: number; error?: string } {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw)) {
    return { ok: false, error: 'Le montant doit être un nombre entier de FCFA.' };
  }
  if (raw < WITHDRAWAL_DEMO_MIN_FCFA) {
    return { ok: false, error: `Le retrait minimum est de ${WITHDRAWAL_DEMO_MIN_FCFA} FCFA.` };
  }
  if (raw > WITHDRAWAL_DEMO_MAX_FCFA) {
    return { ok: false, error: `Le retrait maximum est de ${WITHDRAWAL_DEMO_MAX_FCFA} FCFA pour le moment.` };
  }
  return { ok: true, amount: raw };
}

/** Frais arrondis à l'entier supérieur (le XAF n'a pas de centimes). Montant net annoncé au joueur avant confirmation. */
export function computeWithdrawalQuote(amount: number, feePercent: number): { fee: number; net: number } {
  const fee = Math.ceil(Math.round(amount * feePercent * 100) / 10000);
  return { fee, net: amount - fee };
}

export function shouldAutoApprove(amount: number, dayTotal: number, settings: Pick<WithdrawalSettings, 'autoThresholdFcfa' | 'dailyAutoFcfa'>): boolean {
  return amount <= settings.autoThresholdFcfa && dayTotal + amount <= settings.dailyAutoFcfa;
}

// ---------------------------------------------------------------------------
// Décision après relecture chez Campay
// ---------------------------------------------------------------------------

export type WithdrawalDecision = 'SUCCESS' | 'REFUND' | 'WAIT' | 'REVIEW';

/** SUCCESS seulement si Campay dit SUCCESSFUL, pour ce retrait, avec exactement le montant envoyé. Tout écart va en vérification. */
export function decideWithdrawalFromReading(
  withdrawal: Pick<WithdrawalDoc, 'id' | 'net'> & { campayReference?: string },
  reading: CampayStatusReading,
): { decision: WithdrawalDecision; reason?: string } {
  if (reading.externalReference !== undefined && reading.externalReference !== null && reading.externalReference !== withdrawal.id) {
    return { decision: 'REVIEW', reason: 'Référence externe différente chez Campay.' };
  }
  if (withdrawal.campayReference && reading.reference !== undefined && reading.reference !== null && reading.reference !== withdrawal.campayReference) {
    return { decision: 'REVIEW', reason: 'Référence de transaction différente chez Campay.' };
  }
  const outcome = mapCampayStatus(reading.status);
  if (outcome === 'FAILED') return { decision: 'REFUND' };
  if (outcome === 'PENDING') return { decision: 'WAIT' };
  const sent = parseCampayAmount(reading.amount);
  if (sent === null || sent !== withdrawal.net) {
    return { decision: 'REVIEW', reason: 'Montant différent chez Campay.' };
  }
  return { decision: 'SUCCESS' };
}
