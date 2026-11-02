/**
 * Kora Cash — stockage de la protection (écriture serveur uniquement, Admin SDK).
 * Collections fermées à tous les clients : cash_player_protection, cash_daily_totals, cash_player_activity,
 * cash_pair_stats, cash_collusion_alerts. Réglages : katika_config/kora_cash_protection.
 * Les totaux du jour et la dernière activité sont écrits par applyMovement, dans la même transaction que le registre.
 */

import { getFirebaseAdminAppDb } from '../firebaseAdmin';
import { recordServerReads } from '../katika/readBudget';
import { KORA_CASH_CONFIG_COLLECTION } from './cashConfigStore';
import { CashEnvironment } from './cashTypes';
import { dateKeyFor } from './withdrawalRules';
import {
  CollusionAlert,
  DEFAULT_PROTECTION_SETTINGS,
  DailyTotals,
  EMPTY_DAILY_TOTALS,
  PairStats,
  PartiePairOutcome,
  PlayerActivity,
  PlayerProtection,
  ProtectionSettings,
  ProtectionSettingsPatch,
  WithdrawalReviewReason,
  applyOutcomeToPair,
  changePersonalLimit,
  checkDeposit,
  checkTableEntry,
  cleanNote,
  effectiveLimit,
  emptyPairStats,
  exclusionEnd,
  LimitKind,
  liftExclusion,
  newCollusionReasons,
  normalizeProtectionSettings,
  pairIdFor,
  startExclusion,
  withdrawalFreezeMessage,
  withdrawalReviewReasons,
} from './protectionRules';

export const CASH_PLAYER_PROTECTION_COLLECTION = 'cash_player_protection';
export const CASH_DAILY_TOTALS_COLLECTION = 'cash_daily_totals';
export const CASH_PLAYER_ACTIVITY_COLLECTION = 'cash_player_activity';
export const CASH_PAIR_STATS_COLLECTION = 'cash_pair_stats';
export const CASH_COLLUSION_ALERTS_COLLECTION = 'cash_collusion_alerts';
const SETTINGS_DOC = 'kora_cash_protection';

export function dailyTotalsDocId(uid: string, dateKey: string, environment: CashEnvironment = 'DEMO'): string {
  return `${environment}_${uid}_${dateKey}`;
}

export function playerActivityDocId(uid: string, environment: CashEnvironment = 'DEMO'): string {
  return `${environment}_${uid}`;
}

/** Si la lecture échoue : plafonds par défaut. Le repli ne relâche jamais une limite au-delà du défaut. */
export async function getProtectionSettings(): Promise<ProtectionSettings> {
  try {
    const snap = await getFirebaseAdminAppDb().collection(KORA_CASH_CONFIG_COLLECTION).doc(SETTINGS_DOC).get();
    return normalizeProtectionSettings(snap.exists ? snap.data() : undefined);
  } catch (err) {
    console.warn('[KoraCash] Lecture des réglages de protection impossible : valeurs par défaut.', err instanceof Error ? err.message : String(err));
    return { ...DEFAULT_PROTECTION_SETTINGS };
  }
}

export async function updateProtectionSettings(patch: ProtectionSettingsPatch, actorEmail?: string): Promise<ProtectionSettings> {
  const db = getFirebaseAdminAppDb();
  const ref = db.collection(KORA_CASH_CONFIG_COLLECTION).doc(SETTINGS_DOC);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = normalizeProtectionSettings(snap.exists ? snap.data() : undefined);
    const next: ProtectionSettings = { ...current, ...patch, updatedAt: Date.now(), ...(actorEmail ? { updatedBy: actorEmail } : {}) };
    tx.set(ref, next);
    return next;
  });
}

export async function getPlayerProtection(uid: string): Promise<PlayerProtection> {
  const snap = await getFirebaseAdminAppDb().collection(CASH_PLAYER_PROTECTION_COLLECTION).doc(uid).get();
  return snap.exists ? (snap.data() as PlayerProtection) : { uid };
}

/** Modifie l'état d'un joueur dans une transaction : deux demandes simultanées ne s'écrasent pas. */
async function mutatePlayer<T>(uid: string, mutate: (player: PlayerProtection) => { patch: Partial<PlayerProtection>; result: T } | { error: string }): Promise<T> {
  const db = getFirebaseAdminAppDb();
  const ref = db.collection(CASH_PLAYER_PROTECTION_COLLECTION).doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const player: PlayerProtection = snap.exists ? (snap.data() as PlayerProtection) : { uid };
    const outcome = mutate(player);
    if ('error' in outcome) throw new ProtectionError(outcome.error);
    const next: PlayerProtection = { ...player, ...outcome.patch, uid, updatedAt: Date.now() };
    next.watch = Boolean(next.freeze || next.exclusion);
    tx.set(ref, next);
    return outcome.result;
  });
}

export class ProtectionError extends Error {}

export async function getDailyTotals(uid: string, nowMs: number): Promise<DailyTotals> {
  const snap = await getFirebaseAdminAppDb().collection(CASH_DAILY_TOTALS_COLLECTION).doc(dailyTotalsDocId(uid, dateKeyFor(nowMs))).get();
  const data = snap.exists ? snap.data() : undefined;
  return data ? { deposits: Number(data.deposits) || 0, settlementNet: Number(data.settlementNet) || 0 } : { ...EMPTY_DAILY_TOTALS };
}

export async function getPlayerActivity(uid: string): Promise<PlayerActivity> {
  const snap = await getFirebaseAdminAppDb().collection(CASH_PLAYER_ACTIVITY_COLLECTION).doc(playerActivityDocId(uid)).get();
  return snap.exists ? (snap.data() as PlayerActivity) : {};
}

/** Ce que le joueur voit de sa protection. */
export async function getProtectionView(uid: string) {
  const now = Date.now();
  const [settings, player, daily] = await Promise.all([getProtectionSettings(), getPlayerProtection(uid), getDailyTotals(uid, now)]);
  const end = exclusionEnd(player, now);
  const limitView = (kind: LimitKind) => {
    const pending = kind === 'deposit' ? player.pendingDeposit : player.pendingLoss;
    return {
      effective: effectiveLimit(player, settings, kind, now),
      ceiling: kind === 'deposit' ? settings.depositDailyFcfa : settings.lossDailyFcfa,
      pending: pending && pending.effectiveAt > now ? pending : null,
    };
  };
  return {
    deposit: limitView('deposit'),
    loss: limitView('loss'),
    raiseDelayHours: settings.limitRaiseDelayHours,
    today: { deposits: daily.deposits, losses: Math.max(0, -daily.settlementNet) },
    exclusion: end === null || !player.exclusion ? null : { kind: player.exclusion.kind, until: Number.isFinite(end) ? end : null },
  };
}

export async function setPersonalLimit(uid: string, kind: LimitKind, value: unknown): Promise<{ delayed: boolean }> {
  const settings = await getProtectionSettings();
  return mutatePlayer(uid, (player) => {
    const change = changePersonalLimit(player, kind, value, settings, Date.now());
    if (change.ok === false) return { error: change.error };
    return { patch: change.patch, result: { delayed: change.delayed } };
  });
}

export async function requestExclusion(uid: string, request: { kind: unknown; days?: unknown }): Promise<void> {
  await mutatePlayer(uid, (player) => {
    const started = startExclusion(player, request, Date.now());
    if (started.ok === false) return { error: started.error };
    return { patch: { exclusion: started.exclusion }, result: undefined };
  });
}

export async function liftPlayerExclusion(uid: string, input: { actor: string; note: unknown }): Promise<void> {
  const settings = await getProtectionSettings();
  await mutatePlayer(uid, (player) => {
    const lifted = liftExclusion(player, input, settings, Date.now());
    if (lifted.ok === false) return { error: lifted.error };
    return { patch: { exclusion: lifted.exclusion }, result: undefined };
  });
}

/** Gèle ou dégèle les retraits d'un joueur. Geler exige un motif ; le gain reste sur son solde. */
export async function setPlayerFreeze(uid: string, input: { frozen: boolean; actor: string; note: unknown }): Promise<void> {
  const note = cleanNote(input.note);
  await mutatePlayer(uid, () => {
    if (input.frozen && !note) return { error: 'Indique le motif du gel.' };
    return { patch: { freeze: input.frozen ? { by: input.actor, note, at: Date.now() } : null }, result: undefined };
  });
}

/** Refus de dépôt, ou null. Lecture impossible : refus, car le plafond ne peut pas être vérifié. */
export async function checkDepositAllowed(uid: string, amount: unknown, pendingAmount: () => Promise<number>): Promise<string | null> {
  if (!Number.isSafeInteger(amount)) return null; // le service du dépôt refusera ce montant avec son propre message
  try {
    const now = Date.now();
    const [settings, player, daily, pending] = await Promise.all([getProtectionSettings(), getPlayerProtection(uid), getDailyTotals(uid, now), pendingAmount()]);
    return checkDeposit({ player, daily, pendingAmount: pending, amount: amount as number, settings, now });
  } catch (err) {
    console.error('[KoraCash] Contrôle du dépôt impossible.', err instanceof Error ? err.message : String(err));
    return 'Dépôt impossible pour le moment. Réessaie dans un instant.';
  }
}

/** Refus d'entrée à une table ou de recave, ou null. Lecture impossible : refus. */
export async function checkTableEntryAllowed(uid: string): Promise<string | null> {
  try {
    const now = Date.now();
    const [settings, player, daily] = await Promise.all([getProtectionSettings(), getPlayerProtection(uid), getDailyTotals(uid, now)]);
    return checkTableEntry({ player, daily, settings, now });
  } catch (err) {
    console.error('[KoraCash] Contrôle de l’entrée à une table impossible.', err instanceof Error ? err.message : String(err));
    return 'Entrée à la table impossible pour le moment. Réessaie dans un instant.';
  }
}

export interface WithdrawalProtectionGate {
  blockedMessage: string | null;
  reviewReasons: WithdrawalReviewReason[];
}

/** Gel et signaux d'un retrait. Lecture impossible : le retrait attend une validation humaine plutôt que de partir seul. */
export async function getWithdrawalGate(uid: string, nowMs: number): Promise<WithdrawalProtectionGate> {
  try {
    const [settings, player, daily, activity, alerts] = await Promise.all([
      getProtectionSettings(),
      getPlayerProtection(uid),
      getDailyTotals(uid, nowMs),
      getPlayerActivity(uid),
      countOpenAlerts(uid),
    ]);
    return {
      blockedMessage: withdrawalFreezeMessage(player, settings),
      reviewReasons: withdrawalReviewReasons({ activity, daily, openAlertCount: alerts, settings }),
    };
  } catch (err) {
    console.error('[KoraCash] Contrôle du retrait impossible : validation humaine.', err instanceof Error ? err.message : String(err));
    return { blockedMessage: null, reviewReasons: ['CHECK_UNAVAILABLE'] };
  }
}

async function countOpenAlerts(uid: string): Promise<number> {
  const snap = await getFirebaseAdminAppDb().collection(CASH_COLLUSION_ALERTS_COLLECTION).where('uids', 'array-contains', uid).get();
  return snap.docs.filter((d) => d.data().status === 'OPEN').length;
}

/** Met à jour les statistiques d'une paire et ouvre un signalement si un seuil est franchi. Jamais de sanction ici. */
export async function recordPairOutcome(outcome: PartiePairOutcome, settings: ProtectionSettings): Promise<void> {
  const db = getFirebaseAdminAppDb();
  const { id, a, b } = pairIdFor(outcome.winner, outcome.loser);
  const pairRef = db.collection(CASH_PAIR_STATS_COLLECTION).doc(id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(pairRef);
    const current: PairStats = snap.exists ? (snap.data() as PairStats) : emptyPairStats(a, b);
    const next = applyOutcomeToPair(current, outcome);
    const now = Date.now();
    const found = newCollusionReasons(next, settings);
    found.forEach(({ reason, metric }) => {
      next.reported = { ...(next.reported || {}), [reason]: metric };
      const alert: CollusionAlert = { id: `${id}_${reason}`, pairId: id, uids: [a, b], reason, metric, parties: next.parties, netToA: next.netToA, status: 'OPEN', createdAt: now };
      tx.set(db.collection(CASH_COLLUSION_ALERTS_COLLECTION).doc(alert.id), alert);
    });
    tx.set(pairRef, { ...next, updatedAt: now });
  });
}

/** Une partie d'une table Cash vue par paires. Un échec ne touche jamais au jeu ni à l'argent : il est seulement journalisé. */
export async function recordPartieOutcomes(outcomes: PartiePairOutcome[]): Promise<void> {
  if (outcomes.length === 0) return;
  try {
    const settings = await getProtectionSettings();
    for (const outcome of outcomes) {
      await recordPairOutcome(outcome, settings);
    }
  } catch (err) {
    console.warn('[KoraCash] Statistiques de collusion non écrites.', err instanceof Error ? err.message : String(err));
  }
}

export async function listOpenCollusionAlerts(max: number = 50): Promise<CollusionAlert[]> {
  const snap = await getFirebaseAdminAppDb()
    .collection(CASH_COLLUSION_ALERTS_COLLECTION)
    .where('status', '==', 'OPEN')
    .limit(Math.min(100, Math.max(1, Math.floor(max))))
    .get();
  recordServerReads(snap.size);
  return snap.docs.map((d) => d.data() as CollusionAlert).sort((x, y) => y.createdAt - x.createdAt);
}

export async function closeCollusionAlert(id: string, input: { actor: string; note: unknown }): Promise<void> {
  const note = cleanNote(input.note);
  if (!note) throw new ProtectionError('Indique ce que tu as constaté.');
  await getFirebaseAdminAppDb()
    .collection(CASH_COLLUSION_ALERTS_COLLECTION)
    .doc(id)
    .set({ status: 'CLOSED', closedAt: Date.now(), closedBy: input.actor, closeNote: note }, { merge: true });
}

/** Joueurs gelés ou avec une exclusion, pour Katika. Lecture bornée, comptée dans la jauge. */
export async function listWatchedPlayers(max: number = 100): Promise<PlayerProtection[]> {
  const snap = await getFirebaseAdminAppDb()
    .collection(CASH_PLAYER_PROTECTION_COLLECTION)
    .where('watch', '==', true)
    .limit(Math.min(200, Math.max(1, Math.floor(max))))
    .get();
  recordServerReads(snap.size);
  return snap.docs.map((d) => d.data() as PlayerProtection);
}
