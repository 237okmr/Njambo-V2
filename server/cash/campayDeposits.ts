/**
 * Kora Cash — service du dépôt Mobile Money par Campay (aucun accès direct au réseau ni à la base : tout passe par `deps`).
 *
 * Trois entrées : démarrer un dépôt, traiter une notification (webhook), vérifier un paiement à la demande du joueur.
 * Règle d'or : le webhook n'est qu'un signal. Le crédit ne se décide que sur la relecture du statut et du montant chez Campay,
 * et seulement si cette relecture se rattache sans ambiguïté au dépôt. Dans le doute, le dépôt reste en attente.
 * Aucun secret, aucun délai, aucune horloge ici (l'heure est fournie par `deps`).
 */

import {
  CampayReadingInfo,
  CampayStatusReading,
  decideFromCampayReading,
  describeCampayReading,
  extractWebhookEvent,
  isValidCampayReference,
  normalizeCameroonPhone,
  parseCampayDemoAmount,
  verifyWebhookEvent,
} from './campayRules';
import { DepositDoc, DepositEnvironment, DepositMode, isValidDepositId } from './depositRules';
import type { ConfirmDepositResult } from './depositStore';

export type CollectResult =
  /** Campay a accepté la demande et renvoyé une référence. */
  | { kind: 'ACCEPTED'; reference: string }
  /** Refus net (identifiants absents, erreur 4xx) : rien n'a été créé chez Campay, le dépôt peut échouer. */
  | { kind: 'REJECTED'; message: string }
  /** Issue incertaine (coupure, dépassement du délai, erreur 5xx) : la demande a peut-être été créée. Le dépôt reste en attente. */
  | { kind: 'UNKNOWN'; message: string };

export type TransactionRead =
  | { kind: 'OK'; reading: CampayStatusReading }
  | { kind: 'UNAVAILABLE'; message: string };

export interface CampayDeps {
  createDeposit(uid: string, amount: number, mode: DepositMode, environment?: DepositEnvironment, phone?: string): Promise<DepositDoc>;
  getDeposit(id: string): Promise<DepositDoc | null>;
  attachCampayReference(id: string, campayReference: string): Promise<DepositDoc>;
  markDepositFailed(id: string, reason: string): Promise<DepositDoc>;
  confirmDeposit(id: string, providerRef?: string): Promise<ConfirmDepositResult>;
  startCollect(params: { amount: number; phone: string; depositId: string }): Promise<CollectResult>;
  readTransaction(reference: string): Promise<TransactionRead>;
  /** Enregistre la dernière réponse de Campay sur le dépôt (informatif). Facultatif. */
  recordReading?(id: string, info: CampayReadingInfo): Promise<void>;
  getWebhookKey(): Promise<string | null>;
  nowMs(): number;
}

export type PublicDepositState = 'PENDING' | 'SUCCESS' | 'FAILED';

export interface PublicDepositResult {
  httpStatus: number;
  success: boolean;
  depositId?: string;
  state?: PublicDepositState;
  message?: string;
  wallet?: { available: number; locked: number };
}

const MSG_PENDING = 'Ton opérateur n\'a pas encore répondu. Si tu as validé la demande, la confirmation arrive toute seule.';
const MSG_UNREACHABLE = 'Mobile Money ne répond pas. Réessaie dans un instant.';
const MSG_REVIEW = 'Ce paiement demande une vérification. Ton solde sera crédité dès qu\'elle est faite.';
const MSG_FAILED = 'Le paiement a échoué ou a été annulé. Aucun montant n\'a été crédité.';
const MSG_SUCCESS = 'Paiement confirmé. Ton solde est crédité.';

function pending(depositId: string, message: string): PublicDepositResult {
  return { httpStatus: 200, success: true, depositId, state: 'PENDING', message };
}

/** Relit le paiement chez Campay et applique la décision. Point commun du webhook et du bouton « Vérifier mon paiement ». */
async function settleDeposit(deps: CampayDeps, deposit: DepositDoc, webhookReference?: string): Promise<PublicDepositResult> {
  if (deposit.status === 'SUCCESS') {
    return { httpStatus: 200, success: true, depositId: deposit.id, state: 'SUCCESS', message: MSG_SUCCESS };
  }
  if (deposit.status === 'FAILED') {
    return { httpStatus: 200, success: true, depositId: deposit.id, state: 'FAILED', message: MSG_FAILED };
  }

  const reference = deposit.campayReference ?? webhookReference;
  if (!isValidCampayReference(reference)) {
    return pending(deposit.id, MSG_PENDING);
  }

  const read = await deps.readTransaction(reference);
  if (read.kind !== 'OK') {
    return pending(deposit.id, MSG_UNREACHABLE);
  }

  // On garde la dernière réponse de Campay (statut, opérateur, motif) seulement quand elle change : une écriture, pas une par relecture.
  const info = describeCampayReading(read.reading);
  if (
    info &&
    deps.recordReading &&
    (info.status !== deposit.campayStatus || info.operator !== deposit.campayOperator || info.reason !== deposit.campayReason)
  ) {
    try {
      await deps.recordReading(deposit.id, info);
    } catch {
      console.warn('[KoraCash][Campay] Réponse de Campay non enregistrée sur le dépôt.', { depositId: deposit.id });
    }
  }

  const decision = decideFromCampayReading({ id: deposit.id, amount: deposit.amount, campayReference: reference }, read.reading);

  // La relecture doit se rattacher à NOTRE dépôt : soit Campay y rappelle l'identifiant du dépôt, soit nous l'avons lue
  // avec la référence enregistrée à la création de la collecte. Sinon : aucun crédit, aucun échec, on attend.
  const bound =
    read.reading.externalReference === deposit.id ||
    (deposit.campayReference !== undefined && deposit.campayReference === reference);

  if ((decision.decision === 'CREDIT' || decision.decision === 'MARK_FAILED') && !bound) {
    console.warn('[KoraCash][Campay] Relecture non rattachée au dépôt : aucune décision.', { depositId: deposit.id });
    return pending(deposit.id, MSG_REVIEW);
  }

  switch (decision.decision) {
    case 'CREDIT': {
      const confirmed = await deps.confirmDeposit(deposit.id, reference);
      return {
        httpStatus: 200,
        success: true,
        depositId: deposit.id,
        state: 'SUCCESS',
        message: MSG_SUCCESS,
        wallet: { available: confirmed.wallet.available, locked: confirmed.wallet.locked },
      };
    }
    case 'MARK_FAILED': {
      await deps.markDepositFailed(deposit.id, 'Paiement refusé ou annulé chez le prestataire.');
      return { httpStatus: 200, success: true, depositId: deposit.id, state: 'FAILED', message: MSG_FAILED };
    }
    case 'REJECT': {
      console.warn('[KoraCash][Campay] Relecture rejetée : aucun crédit.', { depositId: deposit.id, reason: decision.reason });
      return pending(deposit.id, MSG_REVIEW);
    }
    default:
      return pending(deposit.id, MSG_PENDING);
  }
}

/** Démarre un dépôt Campay : valide montant et numéro, crée le dépôt en attente, puis demande la collecte à Campay. */
export async function startCampayDeposit(
  deps: CampayDeps,
  input: { uid: string; amount: unknown; phone: unknown },
): Promise<PublicDepositResult> {
  const amount = parseCampayDemoAmount(input.amount);
  if (!amount.ok || amount.amount === undefined) {
    return { httpStatus: 400, success: false, message: amount.error || 'Montant invalide.' };
  }
  const phone = normalizeCameroonPhone(input.phone);
  if (!phone.ok || !phone.phone) {
    return { httpStatus: 400, success: false, message: phone.error || 'Numéro invalide.' };
  }

  const deposit = await deps.createDeposit(input.uid, amount.amount, 'CAMPAY', 'DEMO', phone.phone);
  const collect = await deps.startCollect({ amount: deposit.amount, phone: phone.phone, depositId: deposit.id });

  if (collect.kind === 'REJECTED') {
    await deps.markDepositFailed(deposit.id, collect.message);
    return { httpStatus: 400, success: false, depositId: deposit.id, state: 'FAILED', message: collect.message };
  }

  if (collect.kind === 'UNKNOWN') {
    // La demande est peut-être partie : on ne marque surtout pas le dépôt en échec (le webhook ou la vérification le retrouvera).
    console.warn('[KoraCash][Campay] Issue incertaine à la création de la collecte : dépôt laissé en attente.', { depositId: deposit.id });
    return pending(
      deposit.id,
      'Nous n\'avons pas pu confirmer la demande auprès de ton opérateur. Si une demande de validation arrive sur ton téléphone, valide-la : ton solde sera crédité.',
    );
  }

  if (isValidCampayReference(collect.reference)) {
    try {
      await deps.attachCampayReference(deposit.id, collect.reference);
    } catch (err) {
      console.warn('[KoraCash][Campay] Référence Campay non enregistrée (le webhook retrouvera le dépôt).', { depositId: deposit.id });
    }
  }
  return pending(deposit.id, MSG_PENDING);
}

const SIGNATURE_REASONS = ['MISSING', 'MALFORMED', 'ALG_REFUSED', 'BAD_SIGNATURE', 'EXPIRED', 'NOT_YET_VALID'];

/** Traite une notification Campay (GET ou POST). Réponse sans donnée sensible. */
export async function handleCampayWebhook(
  deps: CampayDeps,
  input: { query: unknown; body: unknown },
): Promise<PublicDepositResult> {
  const event = extractWebhookEvent(input.query, input.body);

  const key = await deps.getWebhookKey();
  if (!key) {
    console.error('[KoraCash][Campay] Clé webhook non configurée : notification ignorée.');
    return { httpStatus: 503, success: false, message: 'Notifications non configurées.' };
  }

  const verdict = verifyWebhookEvent(event, key, deps.nowMs());
  if (!verdict.ok || !verdict.depositId || !verdict.reference) {
    console.warn('[KoraCash][Campay] Notification refusée.', { reason: verdict.reason });
    const status = verdict.reason && SIGNATURE_REASONS.includes(verdict.reason) ? 401 : 400;
    return { httpStatus: status, success: false, message: 'Notification refusée.' };
  }

  const deposit = await deps.getDeposit(verdict.depositId);
  if (!deposit) {
    return { httpStatus: 404, success: false, message: 'Dépôt introuvable.' };
  }
  if (deposit.mode !== 'CAMPAY') {
    return { httpStatus: 400, success: false, message: 'Notification refusée.' };
  }
  if (deposit.campayReference && deposit.campayReference !== verdict.reference) {
    console.warn('[KoraCash][Campay] Référence de la notification différente de celle du dépôt.', { depositId: deposit.id });
    return { httpStatus: 400, success: false, message: 'Notification refusée.' };
  }

  const result = await settleDeposit(deps, deposit, verdict.reference);
  return { httpStatus: 200, success: true, depositId: deposit.id, state: result.state };
}

/** Bouton « Vérifier mon paiement » : le joueur ne peut vérifier que ses propres dépôts. */
export async function verifyMyDeposit(
  deps: CampayDeps,
  input: { uid: string; depositId: unknown },
): Promise<PublicDepositResult> {
  if (!isValidDepositId(input.depositId)) {
    return { httpStatus: 400, success: false, message: 'Identifiant de dépôt invalide.' };
  }
  const deposit = await deps.getDeposit(input.depositId);
  if (!deposit || deposit.uid !== input.uid) {
    return { httpStatus: 404, success: false, message: 'Dépôt introuvable.' };
  }
  return settleDeposit(deps, deposit);
}
