/**
 * Kora Cash — règles pures du dépôt Campay (aucun réseau, aucun accès base de données, aucun secret, aucun délai).
 *
 * Principe : le webhook de Campay n'est qu'un SIGNAL. Sa signature (JWT HS256 signé avec la clé de webhook de l'application)
 * est vérifiée, puis le statut et le montant sont relus auprès de Campay. Le crédit n'est décidé que sur cette relecture.
 * Tout ce qui est inconnu ou ambigu donne « en attente » : on ne crédite jamais dans le doute.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { isValidDepositId } from './depositRules';

// ---------------------------------------------------------------------------
// Numéro de téléphone (Campay exige l'indicatif pays : 237xxxxxxxxx)
// ---------------------------------------------------------------------------

export interface PhoneResult {
  ok: boolean;
  phone?: string;
  error?: string;
}

/** Accepte 6XXXXXXXX, 2376XXXXXXXX, +2376XXXXXXXX, 002376XXXXXXXX (espaces, points, tirets, parenthèses tolérés). Renvoie 2376XXXXXXXX. */
export function normalizeCameroonPhone(raw: unknown): PhoneResult {
  const cleaned = String(raw ?? '').replace(/[\s.\-()]/g, '');
  if (cleaned === '') {
    return { ok: false, error: 'Saisis ton numéro MTN ou Orange.' };
  }
  let digits = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;
  if (digits.startsWith('00237')) digits = digits.slice(2);
  if (!/^\d+$/.test(digits)) {
    return { ok: false, error: 'Le numéro ne doit contenir que des chiffres.' };
  }
  if (digits.length === 9) digits = `237${digits}`;
  if (!/^2376\d{8}$/.test(digits)) {
    return { ok: false, error: 'Numéro invalide : saisis un numéro camerounais MTN ou Orange à 9 chiffres (il commence par 6).' };
  }
  return { ok: true, phone: digits };
}

// ---------------------------------------------------------------------------
// Montant d'un paiement de test (le bac à sable Campay refuse plus de 25 FCFA, et Orange refuse moins de 10 FCFA)
// ---------------------------------------------------------------------------

/** Limites du paiement de test Campay en démo, en FCFA entiers. Elles ne concernent ni le dépôt fictif ni le futur argent réel (minimum général : depositRules.ts). */
export const CAMPAY_DEMO_MIN_FCFA = 10;
export const CAMPAY_DEMO_MAX_FCFA = 25;

export interface CampayDemoAmountResult {
  ok: boolean;
  amount?: number;
  error?: string;
}

/** Valide le montant d'un paiement de test Campay : entier de CAMPAY_DEMO_MIN_FCFA à CAMPAY_DEMO_MAX_FCFA inclus, jamais décimal ni texte. */
export function parseCampayDemoAmount(raw: unknown): CampayDemoAmountResult {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw)) {
    return { ok: false, error: 'Le montant doit être un nombre entier de FCFA.' };
  }
  if (raw < CAMPAY_DEMO_MIN_FCFA) {
    return { ok: false, error: `Le dépôt minimum est de ${CAMPAY_DEMO_MIN_FCFA} FCFA.` };
  }
  if (raw > CAMPAY_DEMO_MAX_FCFA) {
    return { ok: false, error: `Le dépôt maximum est de ${CAMPAY_DEMO_MAX_FCFA} FCFA pour le moment.` };
  }
  return { ok: true, amount: raw };
}

// ---------------------------------------------------------------------------
// Statuts et montants renvoyés par Campay
// ---------------------------------------------------------------------------

export type CampayOutcome = 'PENDING' | 'SUCCESS' | 'FAILED';

/** SUCCESSFUL = payé, FAILED = échoué. Tout autre mot (PENDING, inconnu, vide) = en attente : jamais de crédit dans le doute. */
export function mapCampayStatus(raw: unknown): CampayOutcome {
  const s = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (s === 'SUCCESSFUL') return 'SUCCESS';
  if (s === 'FAILED') return 'FAILED';
  return 'PENDING';
}

/** Campay peut renvoyer un montant sous forme de texte (« 1000 » ou « 1000.00 »). Entier strictement positif, sinon null. */
export function parseCampayAmount(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isSafeInteger(raw) && raw > 0 ? raw : null;
  }
  if (typeof raw !== 'string') return null;
  const m = /^(\d+)(?:\.0+)?$/.exec(raw.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Forme tolérée d'une référence de transaction Campay (utilisée avant tout appel ou toute recherche). */
export function isValidCampayReference(ref: unknown): ref is string {
  return typeof ref === 'string' && /^[A-Za-z0-9_-]{6,100}$/.test(ref);
}

// ---------------------------------------------------------------------------
// Signature du webhook (JWT HS256, clé de webhook de l'application Campay)
// ---------------------------------------------------------------------------

export interface JwtCheck {
  valid: boolean;
  reason?: 'MISSING' | 'MALFORMED' | 'ALG_REFUSED' | 'BAD_SIGNATURE' | 'EXPIRED' | 'NOT_YET_VALID';
  payload?: Record<string, unknown>;
}

const B64URL = /^[A-Za-z0-9_-]+$/;

function decodeJsonPart(part: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** nowMs est fourni par l'appelant : cette fonction ne lit aucune horloge et n'attend rien. */
export function verifyCampayWebhookSignature(token: unknown, webhookKey: string, nowMs: number): JwtCheck {
  if (typeof token !== 'string' || token.trim() === '' || typeof webhookKey !== 'string' || webhookKey === '') {
    return { valid: false, reason: 'MISSING' };
  }
  const parts = token.trim().split('.');
  if (parts.length !== 3 || !parts.every((p) => B64URL.test(p))) {
    return { valid: false, reason: 'MALFORMED' };
  }
  const header = decodeJsonPart(parts[0]);
  if (!header) return { valid: false, reason: 'MALFORMED' };
  if (header.alg !== 'HS256') return { valid: false, reason: 'ALG_REFUSED' };

  const expected = createHmac('sha256', webhookKey).update(`${parts[0]}.${parts[1]}`).digest();
  const given = Buffer.from(parts[2], 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { valid: false, reason: 'BAD_SIGNATURE' };
  }

  const payload = decodeJsonPart(parts[1]);
  if (!payload) return { valid: false, reason: 'MALFORMED' };
  const nowSec = nowMs / 1000;
  if (typeof payload.exp === 'number' && payload.exp <= nowSec) return { valid: false, reason: 'EXPIRED' };
  if (typeof payload.nbf === 'number' && payload.nbf > nowSec) return { valid: false, reason: 'NOT_YET_VALID' };
  return { valid: true, payload };
}

// ---------------------------------------------------------------------------
// Lecture du webhook (Campay appelle en GET avec des paramètres d'URL, ou en POST avec du JSON)
// ---------------------------------------------------------------------------

export interface CampayWebhookEvent {
  reference?: string;
  externalReference?: string;
  signature?: string;
}

function pickString(source: unknown, key: string): string | undefined {
  if (!source || typeof source !== 'object') return undefined;
  const v = (source as Record<string, unknown>)[key];
  if (typeof v === 'string') return v.trim().slice(0, 2000);
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return undefined;
}

/** Le corps JSON a priorité sur les paramètres d'URL. Rien d'autre n'est lu : le statut et le montant du webhook sont ignorés. */
export function extractWebhookEvent(query: unknown, body: unknown): CampayWebhookEvent {
  const read = (key: string) => pickString(body, key) ?? pickString(query, key);
  return {
    reference: read('reference'),
    externalReference: read('external_reference'),
    signature: read('signature'),
  };
}

export interface WebhookVerdict {
  ok: boolean;
  reason?: 'BAD_EVENT' | 'BAD_REFERENCE' | 'BAD_DEPOSIT_ID' | JwtCheck['reason'] | 'REFERENCE_MISMATCH';
  reference?: string;
  depositId?: string;
}

/** Vérifie l'événement : identifiants bien formés, signature valide, et référence du jeton identique à celle de l'URL si le jeton en porte une. */
export function verifyWebhookEvent(event: CampayWebhookEvent, webhookKey: string, nowMs: number): WebhookVerdict {
  if (!event || typeof event !== 'object') return { ok: false, reason: 'BAD_EVENT' };
  if (!isValidCampayReference(event.reference)) return { ok: false, reason: 'BAD_REFERENCE' };
  if (!isValidDepositId(event.externalReference)) return { ok: false, reason: 'BAD_DEPOSIT_ID' };

  const check = verifyCampayWebhookSignature(event.signature, webhookKey, nowMs);
  if (!check.valid) return { ok: false, reason: check.reason };

  const claimed = check.payload?.reference;
  if (typeof claimed === 'string' && claimed !== event.reference) {
    return { ok: false, reason: 'REFERENCE_MISMATCH' };
  }
  return { ok: true, reference: event.reference, depositId: event.externalReference };
}

// ---------------------------------------------------------------------------
// Décision après relecture du statut auprès de Campay
// ---------------------------------------------------------------------------

export interface CampayStatusReading {
  status?: unknown;
  amount?: unknown;
  reference?: unknown;
  externalReference?: unknown;
  /** Opérateur indiqué par Campay (MTN, ORANGE…), s'il est fourni. */
  operator?: unknown;
  /** Motif indiqué par Campay quand un paiement n'aboutit pas, s'il est fourni. */
  reason?: unknown;
}

/** Ce que l'on retient d'une relecture Campay pour l'afficher à l'administrateur : textes courts, sans numéro de téléphone ni secret. */
export interface CampayReadingInfo {
  status: string;
  operator?: string;
  reason?: string;
}

function cleanShortText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\d{8,}/g, '***')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  return cleaned === '' ? undefined : cleaned;
}

/** Extrait statut, opérateur et motif d'une relecture Campay. Renvoie null si Campay n'a donné aucun statut lisible. */
export function describeCampayReading(reading: CampayStatusReading): CampayReadingInfo | null {
  const status = cleanShortText(reading.status, 30);
  if (status === undefined) return null;
  const info: CampayReadingInfo = { status: status.toUpperCase() };
  const operator = cleanShortText(reading.operator, 30);
  if (operator !== undefined) info.operator = operator.toUpperCase();
  const reason = cleanShortText(reading.reason, 160);
  if (reason !== undefined) info.reason = reason;
  return info;
}

export interface DepositForDecision {
  id: string;
  amount: number;
  /** Référence Campay enregistrée à la création de la collecte, si elle existe. */
  campayReference?: string;
}

export type ConfirmDecision = 'CREDIT' | 'MARK_FAILED' | 'WAIT' | 'REJECT';

export interface DecisionResult {
  decision: ConfirmDecision;
  reason?: 'EXTERNAL_REF_MISMATCH' | 'REFERENCE_MISMATCH' | 'AMOUNT_MISMATCH';
}

/** CREDIT seulement si Campay dit SUCCESSFUL, pour le bon dépôt, avec exactement le montant attendu. */
export function decideFromCampayReading(deposit: DepositForDecision, reading: CampayStatusReading): DecisionResult {
  if (reading.externalReference !== undefined && reading.externalReference !== null && reading.externalReference !== deposit.id) {
    return { decision: 'REJECT', reason: 'EXTERNAL_REF_MISMATCH' };
  }
  if (
    deposit.campayReference &&
    reading.reference !== undefined &&
    reading.reference !== null &&
    reading.reference !== deposit.campayReference
  ) {
    return { decision: 'REJECT', reason: 'REFERENCE_MISMATCH' };
  }

  const outcome = mapCampayStatus(reading.status);
  if (outcome === 'FAILED') return { decision: 'MARK_FAILED' };
  if (outcome === 'PENDING') return { decision: 'WAIT' };

  const paid = parseCampayAmount(reading.amount);
  if (paid === null || paid !== deposit.amount) {
    return { decision: 'REJECT', reason: 'AMOUNT_MISMATCH' };
  }
  return { decision: 'CREDIT' };
}
