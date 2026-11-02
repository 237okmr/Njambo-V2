/**
 * Kora Cash — service du retrait Mobile Money (aucun accès direct au réseau ni à la base : tout passe par `deps`).
 *
 * Protections : l'argent est mis de côté avant tout envoi ; un seul appel peut prendre l'envoi ; une réponse incertaine
 * de Campay n'entraîne ni nouvel envoi ni remboursement, mais une vérification humaine. Le webhook n'est qu'un signal :
 * la décision se prend sur la relecture du statut et du montant chez Campay.
 */

import { CampayStatusReading, describeCampayReading, extractWebhookEvent, isValidCampayReference, normalizeCameroonPhone, verifyCampayWebhookSignature } from './campayRules';
import { CashLedgerError } from './cashTypes';
import { maskPhone } from './phoneBookRules';
import {
  WithdrawalDoc,
  WithdrawalFinalRefund,
  WithdrawalSettings,
  WithdrawalStatus,
  computeWithdrawalQuote,
  dateKeyFor,
  decideWithdrawalFromReading,
  isFinalWithdrawal,
  isValidWithdrawalId,
  ledgerRefForHold,
  ledgerRefForRefund,
  newWithdrawalId,
  parseWithdrawalAmount,
  shouldAutoApprove,
} from './withdrawalRules';

export type WithdrawSendResult =
  /** Campay a accepté la demande et renvoyé une référence. */
  | { kind: 'ACCEPTED'; reference: string }
  /** Refus net : rien n'est parti, le joueur peut être remboursé. */
  | { kind: 'REJECTED'; message: string }
  /** Issue incertaine : l'argent est peut-être parti. Jamais de nouvel envoi ni de remboursement automatique. */
  | { kind: 'UNKNOWN'; message: string };

export type WithdrawalRead = { kind: 'OK'; reading: CampayStatusReading } | { kind: 'UNAVAILABLE'; message: string };

export interface WithdrawalMovement {
  ref: string;
  uid: string;
  kind: 'WITHDRAWAL_HOLD' | 'WITHDRAWAL_REFUND';
  availableDelta: number;
  meta: Record<string, string | number | boolean | null>;
  actorUid?: string;
}

export interface WithdrawalDeps {
  getSettings(): Promise<WithdrawalSettings>;
  isVerifiedPhone(uid: string, phone: string): Promise<boolean>;
  createWithdrawal(doc: WithdrawalDoc): Promise<void>;
  getWithdrawal(id: string): Promise<WithdrawalDoc | null>;
  transition(id: string, from: WithdrawalStatus[], to: WithdrawalStatus, patch?: Partial<WithdrawalDoc>): Promise<WithdrawalDoc | null>;
  acquireSlot(uid: string, id: string): Promise<boolean>;
  releaseSlot(uid: string, id: string): Promise<void>;
  sumDaily(uid: string, dateKey: string): Promise<number>;
  applyMovement(movement: WithdrawalMovement): Promise<void>;
  hasHold(id: string): Promise<boolean>;
  sendToCampay(params: { amount: number; phone: string; withdrawalId: string }): Promise<WithdrawSendResult>;
  readTransaction(reference: string): Promise<WithdrawalRead>;
  getWebhookKey(): Promise<string | null>;
  /** Gel des retraits et signaux qui imposent une validation humaine. */
  getProtectionGate(uid: string, nowMs: number): Promise<{ blockedMessage: string | null; reviewReasons: string[] }>;
  newId?(): string;
  nowMs(): number;
}

export interface PublicWithdrawal {
  id: string;
  amount: number;
  fee: number;
  net: number;
  phone: string;
  status: WithdrawalStatus;
  createdAt: number;
  note?: string;
}

export function toPublicWithdrawal(w: WithdrawalDoc): PublicWithdrawal {
  return {
    id: w.id,
    amount: w.amount,
    fee: w.fee,
    net: w.net,
    phone: maskPhone(w.phone),
    status: w.status,
    createdAt: w.createdAt,
    ...(w.note ? { note: w.note } : {}),
  };
}

export interface WithdrawalResult {
  httpStatus: number;
  success: boolean;
  message?: string;
  withdrawal?: PublicWithdrawal;
}

const MSG_NOT_FOUND = 'Demande de retrait introuvable.';
const MSG_REVIEW = 'Nous vérifions cet envoi avec Campay. Ton argent reste de côté en attendant.';

function ok(withdrawal: WithdrawalDoc, message?: string): WithdrawalResult {
  return { httpStatus: 200, success: true, withdrawal: toPublicWithdrawal(withdrawal), ...(message ? { message } : {}) };
}

async function toReview(deps: WithdrawalDeps, withdrawal: WithdrawalDoc, from: WithdrawalStatus[], note: string): Promise<WithdrawalDoc> {
  const reviewed = await deps.transition(withdrawal.id, from, 'REVIEW', { note: note.slice(0, 200) });
  return reviewed ?? (await deps.getWithdrawal(withdrawal.id)) ?? withdrawal;
}

/**
 * Rend l'argent et clôt le retrait. La prise en charge (REFUNDING) empêche tout envoi simultané ; le mouvement du registre
 * est idempotent, donc une reprise après une panne ne rembourse jamais deux fois. Rien n'est rendu si rien n'avait été mis de côté.
 */
async function refundAndClose(
  deps: WithdrawalDeps,
  id: string,
  from: WithdrawalStatus[],
  final: WithdrawalFinalRefund,
  note: string,
  actor?: string,
): Promise<WithdrawalDoc | null> {
  const claimed = await deps.transition(id, from, 'REFUNDING', { refundFinal: final, note: note.slice(0, 200), ...(actor ? { decidedBy: actor } : {}) });
  if (!claimed) return null;
  if (await deps.hasHold(id)) {
    await deps.applyMovement({
      ref: ledgerRefForRefund(id),
      uid: claimed.uid,
      kind: 'WITHDRAWAL_REFUND',
      availableDelta: claimed.amount,
      meta: { withdrawalId: id },
      ...(actor ? { actorUid: actor } : {}),
    });
  }
  const closed = await deps.transition(id, ['REFUNDING'], final);
  await deps.releaseSlot(claimed.uid, id);
  return closed;
}

/** Prend l'envoi (un seul appel y parvient) puis l'adresse à Campay. */
async function sendWithdrawal(deps: WithdrawalDeps, id: string, from: WithdrawalStatus[], patch: Partial<WithdrawalDoc> = {}): Promise<WithdrawalDoc | null> {
  const claimed = await deps.transition(id, from, 'SENDING', patch);
  if (!claimed) return null;

  let result: WithdrawSendResult;
  try {
    result = await deps.sendToCampay({ amount: claimed.net, phone: claimed.phone, withdrawalId: id });
  } catch {
    result = { kind: 'UNKNOWN', message: 'Aucune réponse de Campay.' };
  }

  if (result.kind === 'REJECTED') {
    return refundAndClose(deps, id, ['SENDING'], 'FAILED', result.message);
  }
  if (result.kind === 'UNKNOWN' || !isValidCampayReference(result.reference)) {
    return toReview(deps, claimed, ['SENDING'], result.kind === 'UNKNOWN' ? result.message : 'Référence Campay illisible.');
  }
  return deps.transition(id, ['SENDING'], 'PROCESSING', { campayReference: result.reference });
}

/** Demande de retrait du joueur : contrôles, mise de côté de l'argent, puis envoi automatique ou attente de validation. */
export async function requestWithdrawal(deps: WithdrawalDeps, input: { uid: string; amount: unknown; phone: unknown }): Promise<WithdrawalResult> {
  const settings = await deps.getSettings();
  if (!settings.enabled) {
    return { httpStatus: 403, success: false, message: 'Le retrait n\'est pas ouvert pour le moment.' };
  }
  const parsed = parseWithdrawalAmount(input.amount);
  if (!parsed.ok || parsed.amount === undefined) {
    return { httpStatus: 400, success: false, message: parsed.error || 'Montant invalide.' };
  }
  const gate = await deps.getProtectionGate(input.uid, deps.nowMs());
  if (gate.blockedMessage) {
    return { httpStatus: 403, success: false, message: gate.blockedMessage };
  }
  const phone = normalizeCameroonPhone(input.phone);
  if (!phone.ok || !phone.phone) {
    return { httpStatus: 400, success: false, message: phone.error || 'Numéro invalide.' };
  }
  if (!(await deps.isVerifiedPhone(input.uid, phone.phone))) {
    return { httpStatus: 400, success: false, message: 'Ce numéro n\'est pas encore vérifié : fais un dépôt depuis ce numéro pour l\'activer.' };
  }
  const quote = computeWithdrawalQuote(parsed.amount, settings.feePercent);
  if (quote.net <= 0) {
    return { httpStatus: 400, success: false, message: 'Ce montant ne couvre pas les frais de retrait.' };
  }

  const id = deps.newId ? deps.newId() : newWithdrawalId();
  if (!(await deps.acquireSlot(input.uid, id))) {
    return { httpStatus: 409, success: false, message: 'Tu as déjà une demande de retrait en cours.' };
  }

  const now = deps.nowMs();
  const dateKey = dateKeyFor(now);
  let doc: WithdrawalDoc;
  try {
    const dayTotal = await deps.sumDaily(input.uid, dateKey);
    doc = {
      id,
      uid: input.uid,
      environment: 'DEMO',
      amount: parsed.amount,
      fee: quote.fee,
      net: quote.net,
      phone: phone.phone,
      status: 'HOLDING',
      dateKey,
      autoApproved: gate.reviewReasons.length === 0 && shouldAutoApprove(parsed.amount, dayTotal, settings),
      createdAt: now,
      updatedAt: now,
      ...(gate.reviewReasons.length > 0 ? { reviewReasons: gate.reviewReasons } : {}),
    };
    await deps.createWithdrawal(doc);
  } catch (err) {
    await deps.releaseSlot(input.uid, id);
    throw err;
  }

  try {
    await deps.applyMovement({
      ref: ledgerRefForHold(id),
      uid: input.uid,
      kind: 'WITHDRAWAL_HOLD',
      availableDelta: -doc.amount,
      meta: { withdrawalId: id },
    });
  } catch (err) {
    if (err instanceof CashLedgerError) {
      // Refus net du registre : rien n'a été retiré du solde, aucun remboursement à faire.
      await deps.transition(id, ['HOLDING'], 'FAILED', { note: err.message.slice(0, 200) });
      await deps.releaseSlot(input.uid, id);
      return { httpStatus: 400, success: false, message: err.message };
    }
    // Issue inconnue : on ne sait pas si l'argent a été mis de côté. Un admin tranchera.
    console.error('[KoraCash] Mise de côté incertaine.', { withdrawalId: id });
    const reviewed = await toReview(deps, doc, ['HOLDING'], 'Mise de côté de l\'argent incertaine.');
    return ok(reviewed, MSG_REVIEW);
  }

  const next = doc.autoApproved ? 'READY' : 'AWAITING_APPROVAL';
  const held = await deps.transition(id, ['HOLDING'], next);
  if (!held) {
    return { httpStatus: 409, success: false, message: 'Demande de retrait déjà traitée.' };
  }
  if (next === 'AWAITING_APPROVAL') {
    return ok(held, 'Ta demande attend une validation. Ton argent est mis de côté.');
  }
  const sent = await sendWithdrawal(deps, id, ['READY']);
  return ok(sent ?? held, sent?.status === 'FAILED' ? sent.note : undefined);
}

/** Relit l'envoi chez Campay et applique la décision. Point commun du webhook et des relectures. */
async function settleWithdrawal(deps: WithdrawalDeps, withdrawal: WithdrawalDoc, webhookReference?: string): Promise<WithdrawalDoc> {
  if (withdrawal.status !== 'PROCESSING' && withdrawal.status !== 'REVIEW' && withdrawal.status !== 'SENDING') {
    return withdrawal;
  }
  const reference = withdrawal.campayReference ?? webhookReference;
  if (!isValidCampayReference(reference)) return withdrawal;

  const read = await deps.readTransaction(reference);
  if (read.kind !== 'OK') return withdrawal;

  // Sans référence enregistrée, seule une relecture qui rappelle l'identifiant de NOTRE retrait peut décider.
  const bound = read.reading.externalReference === withdrawal.id || withdrawal.campayReference === reference;
  if (!bound) return withdrawal;

  const info = describeCampayReading(read.reading);
  const readingPatch: Partial<WithdrawalDoc> = {
    campayReference: reference,
    ...(info ? { campayStatus: info.status } : {}),
    ...(info?.operator ? { campayOperator: info.operator } : {}),
    ...(info?.reason ? { campayReason: info.reason } : {}),
  };

  const decision = decideWithdrawalFromReading({ id: withdrawal.id, net: withdrawal.net, campayReference: reference }, read.reading);
  const from: WithdrawalStatus[] = ['PROCESSING', 'REVIEW', 'SENDING'];
  switch (decision.decision) {
    case 'SUCCESS': {
      const done = await deps.transition(withdrawal.id, from, 'SUCCESS', readingPatch);
      if (done) await deps.releaseSlot(withdrawal.uid, withdrawal.id);
      return done ?? withdrawal;
    }
    case 'REFUND': {
      const reason = info?.reason ? `Envoi refusé : ${info.reason}` : 'Envoi refusé par l\'opérateur.';
      const closed = await refundAndClose(deps, withdrawal.id, from, 'FAILED', reason);
      return closed ?? withdrawal;
    }
    case 'REVIEW':
      return withdrawal.status === 'REVIEW' ? withdrawal : toReview(deps, withdrawal, ['PROCESSING', 'SENDING'], decision.reason || 'Relecture à vérifier.');
    default:
      return withdrawal;
  }
}

async function getOwned(deps: WithdrawalDeps, uid: string, id: unknown): Promise<WithdrawalDoc | null> {
  if (!isValidWithdrawalId(id)) return null;
  const withdrawal = await deps.getWithdrawal(id);
  return withdrawal && withdrawal.uid === uid ? withdrawal : null;
}

/** Le joueur relit ses propres demandes. */
export async function verifyMyWithdrawal(deps: WithdrawalDeps, input: { uid: string; id: unknown }): Promise<WithdrawalResult> {
  const withdrawal = await getOwned(deps, input.uid, input.id);
  if (!withdrawal) return { httpStatus: 404, success: false, message: MSG_NOT_FOUND };
  return ok(await settleWithdrawal(deps, withdrawal));
}

/** Le joueur annule sa demande, seulement tant qu'elle attend une validation. */
export async function cancelMyWithdrawal(deps: WithdrawalDeps, input: { uid: string; id: unknown }): Promise<WithdrawalResult> {
  const withdrawal = await getOwned(deps, input.uid, input.id);
  if (!withdrawal) return { httpStatus: 404, success: false, message: MSG_NOT_FOUND };
  const closed = await refundAndClose(deps, withdrawal.id, ['AWAITING_APPROVAL'], 'CANCELLED', 'Annulé par le joueur.');
  if (!closed) {
    return { httpStatus: 409, success: false, message: 'Cette demande ne peut plus être annulée : l\'envoi a déjà commencé.' };
  }
  return ok(closed, 'Demande annulée : ton argent est de retour sur ton solde.');
}

export async function approveWithdrawal(deps: WithdrawalDeps, input: { id: unknown; actor: string }): Promise<WithdrawalResult> {
  if (!isValidWithdrawalId(input.id)) return { httpStatus: 400, success: false, message: MSG_NOT_FOUND };
  // Un gel posé après la demande bloque aussi la validation : rien ne part tant qu'il n'est pas levé.
  const pending = await deps.getWithdrawal(input.id);
  if (pending) {
    const gate = await deps.getProtectionGate(pending.uid, deps.nowMs());
    if (gate.blockedMessage) {
      return { httpStatus: 409, success: false, message: 'Retraits gelés pour ce joueur : lève d\'abord le gel.' };
    }
  }
  const sent = await sendWithdrawal(deps, input.id, ['AWAITING_APPROVAL'], { decidedBy: input.actor });
  if (!sent) return { httpStatus: 409, success: false, message: 'Cette demande n\'attend plus de validation.' };
  return ok(sent);
}

export async function rejectWithdrawal(deps: WithdrawalDeps, input: { id: unknown; actor: string; note?: unknown }): Promise<WithdrawalResult> {
  if (!isValidWithdrawalId(input.id)) return { httpStatus: 400, success: false, message: MSG_NOT_FOUND };
  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim() : 'Retrait refusé par l\'administration.';
  const closed = await refundAndClose(deps, input.id, ['AWAITING_APPROVAL'], 'FAILED', note, input.actor);
  if (!closed) return { httpStatus: 409, success: false, message: 'Cette demande n\'attend plus de validation.' };
  return ok(closed);
}

/** Relecture chez Campay demandée depuis katika. */
export async function recheckWithdrawal(deps: WithdrawalDeps, input: { id: unknown }): Promise<WithdrawalResult> {
  if (!isValidWithdrawalId(input.id)) return { httpStatus: 400, success: false, message: MSG_NOT_FOUND };
  const withdrawal = await deps.getWithdrawal(input.id);
  if (!withdrawal) return { httpStatus: 404, success: false, message: MSG_NOT_FOUND };
  return ok(await settleWithdrawal(deps, withdrawal));
}

/**
 * Décision humaine sur un retrait incertain, après contrôle dans le tableau de bord Campay.
 * SENT : l'argent est bien parti. REFUND : il n'est pas parti, le joueur est remboursé.
 */
export async function resolveWithdrawal(deps: WithdrawalDeps, input: { id: unknown; outcome: unknown; actor: string }): Promise<WithdrawalResult> {
  if (!isValidWithdrawalId(input.id)) return { httpStatus: 400, success: false, message: MSG_NOT_FOUND };
  const withdrawal = await deps.getWithdrawal(input.id);
  if (!withdrawal) return { httpStatus: 404, success: false, message: MSG_NOT_FOUND };
  if (isFinalWithdrawal(withdrawal.status)) {
    return { httpStatus: 409, success: false, message: 'Cette demande est déjà clôturée.' };
  }

  if (input.outcome === 'SENT') {
    const done = await deps.transition(input.id, ['REVIEW', 'SENDING'], 'SUCCESS', { decidedBy: input.actor, note: 'Envoi confirmé par l\'administration.' });
    if (!done) return { httpStatus: 409, success: false, message: 'Cette demande ne peut pas être confirmée dans son état actuel.' };
    await deps.releaseSlot(done.uid, done.id);
    return ok(done);
  }

  if (input.outcome === 'REFUND') {
    // Reprise d'un remboursement interrompu : le mouvement est idempotent.
    if (withdrawal.status === 'REFUNDING') {
      if (await deps.hasHold(withdrawal.id)) {
        await deps.applyMovement({
          ref: ledgerRefForRefund(withdrawal.id),
          uid: withdrawal.uid,
          kind: 'WITHDRAWAL_REFUND',
          availableDelta: withdrawal.amount,
          meta: { withdrawalId: withdrawal.id },
          actorUid: input.actor,
        });
      }
      const closed = await deps.transition(withdrawal.id, ['REFUNDING'], withdrawal.refundFinal ?? 'FAILED');
      await deps.releaseSlot(withdrawal.uid, withdrawal.id);
      return closed ? ok(closed) : { httpStatus: 409, success: false, message: 'Remboursement déjà clôturé.' };
    }
    const closed = await refundAndClose(deps, withdrawal.id, ['REVIEW', 'SENDING', 'HOLDING'], 'FAILED', 'Remboursé par l\'administration.', input.actor);
    if (!closed) return { httpStatus: 409, success: false, message: 'Cette demande ne peut pas être remboursée dans son état actuel.' };
    return ok(closed);
  }

  return { httpStatus: 400, success: false, message: 'Décision inconnue.' };
}

/** Notification Campay pour un retrait : signature vérifiée, puis relecture chez Campay. Réponse sans donnée sensible. */
export async function handleWithdrawalWebhook(deps: WithdrawalDeps, input: { query: unknown; body: unknown }): Promise<{ httpStatus: number; success: boolean }> {
  const event = extractWebhookEvent(input.query, input.body);
  const key = await deps.getWebhookKey();
  if (!key) return { httpStatus: 503, success: false };
  if (!isValidCampayReference(event.reference) || !isValidWithdrawalId(event.externalReference)) {
    return { httpStatus: 400, success: false };
  }
  const check = verifyCampayWebhookSignature(event.signature, key, deps.nowMs());
  if (!check.valid) return { httpStatus: 401, success: false };
  if (typeof check.payload?.reference === 'string' && check.payload.reference !== event.reference) {
    return { httpStatus: 400, success: false };
  }
  const withdrawal = await deps.getWithdrawal(event.externalReference);
  if (!withdrawal) return { httpStatus: 404, success: false };
  if (withdrawal.campayReference && withdrawal.campayReference !== event.reference) {
    return { httpStatus: 400, success: false };
  }
  await settleWithdrawal(deps, withdrawal, event.reference);
  return { httpStatus: 200, success: true };
}
