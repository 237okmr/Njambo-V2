/**
 * Kora Cash — règles pures de protection (aucun accès base de données, aucun délai propre : tout vient des réglages Katika).
 * Limites d'argent, pauses et exclusions, gel et signaux du retrait, détection de collusion.
 * Une exclusion n'empêche jamais de retirer : le joueur doit toujours pouvoir récupérer son argent.
 */

import { createHash } from 'crypto';

// ---------------------------------------------------------------------------
// Réglages (Katika)
// ---------------------------------------------------------------------------

export interface ProtectionSettings {
  /** Plafonds par joueur et par jour, pour tous. Un joueur peut seulement choisir plus bas. */
  depositDailyFcfa: number;
  lossDailyFcfa: number;
  /** Attente avant qu'une limite personnelle remontée s'applique. */
  limitRaiseDelayHours: number;
  /** Attente avant que l'accès revienne, une fois une exclusion levée depuis Katika. */
  exclusionLiftDelayHours: number;
  /** Gain de table du jour à partir duquel un retrait attend une validation. */
  abnormalGainFcfa: number;
  /** Gel de tous les retraits, avec son motif. */
  withdrawalsFrozen: boolean;
  withdrawalsFrozenNote?: string;
  /** Seuils des signalements de collusion. */
  collusionParties: number;
  collusionOneWayFcfa: number;
  collusionForfeits: number;
  updatedAt?: number;
  updatedBy?: string;
}

export const DEFAULT_PROTECTION_SETTINGS: ProtectionSettings = {
  depositDailyFcfa: 25000,
  lossDailyFcfa: 25000,
  limitRaiseDelayHours: 24,
  exclusionLiftDelayHours: 24,
  abnormalGainFcfa: 10000,
  withdrawalsFrozen: false,
  collusionParties: 30,
  collusionOneWayFcfa: 5000,
  collusionForfeits: 5,
};

type NumericSetting = Exclude<keyof ProtectionSettings, 'withdrawalsFrozen' | 'withdrawalsFrozenNote' | 'updatedAt' | 'updatedBy'>;

const NUMERIC_LIMITS: Record<NumericSetting, { min: number; max: number; label: string }> = {
  depositDailyFcfa: { min: 1, max: 100_000_000, label: 'Plafond de dépôt par jour' },
  lossDailyFcfa: { min: 1, max: 100_000_000, label: 'Plafond de pertes par jour' },
  limitRaiseDelayHours: { min: 0, max: 720, label: 'Délai pour remonter une limite' },
  exclusionLiftDelayHours: { min: 0, max: 720, label: 'Délai après une levée d’exclusion' },
  abnormalGainFcfa: { min: 1, max: 100_000_000, label: 'Seuil de gain anormal' },
  collusionParties: { min: 2, max: 100_000, label: 'Parties jouées ensemble' },
  collusionOneWayFcfa: { min: 1, max: 100_000_000, label: 'Argent dans le même sens' },
  collusionForfeits: { min: 1, max: 100_000, label: 'Forfaits répétés' },
};

const NUMERIC_KEYS = Object.keys(NUMERIC_LIMITS) as NumericSetting[];

function isValidSetting(key: NumericSetting, value: unknown): value is number {
  const limit = NUMERIC_LIMITS[key];
  return Number.isSafeInteger(value) && (value as number) >= limit.min && (value as number) <= limit.max;
}

/** Lit des réglages stockés ; toute valeur douteuse retombe sur le défaut. */
export function normalizeProtectionSettings(raw: any): ProtectionSettings {
  const settings: ProtectionSettings = { ...DEFAULT_PROTECTION_SETTINGS, withdrawalsFrozen: raw?.withdrawalsFrozen === true };
  NUMERIC_KEYS.forEach((key) => {
    if (isValidSetting(key, raw?.[key])) settings[key] = raw[key];
  });
  if (typeof raw?.withdrawalsFrozenNote === 'string') settings.withdrawalsFrozenNote = raw.withdrawalsFrozenNote;
  if (typeof raw?.updatedAt === 'number') settings.updatedAt = raw.updatedAt;
  if (typeof raw?.updatedBy === 'string') settings.updatedBy = raw.updatedBy;
  return settings;
}

export type ProtectionSettingsPatch = Partial<Pick<ProtectionSettings, NumericSetting | 'withdrawalsFrozen' | 'withdrawalsFrozenNote'>>;

/** Valide une modification venue de Katika. Geler tous les retraits exige un motif. */
export function parseProtectionSettingsPatch(body: any): { ok: boolean; patch?: ProtectionSettingsPatch; error?: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Corps de requête invalide.' };
  const patch: ProtectionSettingsPatch = {};
  for (const key of NUMERIC_KEYS) {
    if (body[key] === undefined) continue;
    if (!isValidSetting(key, body[key])) {
      const limit = NUMERIC_LIMITS[key];
      return { ok: false, error: `${limit.label} : nombre entier de ${limit.min} à ${limit.max}.` };
    }
    patch[key] = body[key];
  }
  if (body.withdrawalsFrozen !== undefined) {
    if (typeof body.withdrawalsFrozen !== 'boolean') return { ok: false, error: 'Gel des retraits : valeur invalide.' };
    const note = cleanNote(body.withdrawalsFrozenNote);
    if (body.withdrawalsFrozen && !note) return { ok: false, error: 'Indique le motif du gel.' };
    patch.withdrawalsFrozen = body.withdrawalsFrozen;
    patch.withdrawalsFrozenNote = body.withdrawalsFrozen ? note : '';
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: 'Aucun réglage à modifier.' };
  return { ok: true, patch };
}

export function cleanNote(note: unknown): string {
  return typeof note === 'string' ? note.trim().slice(0, 300) : '';
}

// ---------------------------------------------------------------------------
// État d'un joueur
// ---------------------------------------------------------------------------

export type LimitKind = 'deposit' | 'loss';

export interface PendingRaise {
  /** null : retour au plafond commun. */
  value: number | null;
  effectiveAt: number;
}

export interface PlayerExclusion {
  kind: 'PAUSE' | 'PERMANENT';
  startedAt: number;
  /** Fin d'une pause. */
  until?: number;
  /** Levée depuis Katika : l'accès revient à cette date. */
  liftAt?: number;
  liftedBy?: string;
  liftNote?: string;
}

export interface PlayerFreeze {
  by: string;
  note: string;
  at: number;
}

export interface PlayerProtection {
  uid: string;
  depositLimit?: number | null;
  lossLimit?: number | null;
  pendingDeposit?: PendingRaise | null;
  pendingLoss?: PendingRaise | null;
  exclusion?: PlayerExclusion | null;
  freeze?: PlayerFreeze | null;
  /** Vrai tant qu'un gel ou une exclusion peut concerner Katika : sert à lister ces joueurs sans index composé. */
  watch?: boolean;
  updatedAt?: number;
}

export interface DailyTotals {
  deposits: number;
  /** Somme des résultats de table du jour : négative en cas de perte. */
  settlementNet: number;
}

export const EMPTY_DAILY_TOTALS: DailyTotals = { deposits: 0, settlementNet: 0 };

export interface PlayerActivity {
  lastDepositAt?: number;
  lastPlayAt?: number;
}

const personalField = (kind: LimitKind) => (kind === 'deposit' ? 'depositLimit' : 'lossLimit') as 'depositLimit' | 'lossLimit';
const pendingField = (kind: LimitKind) => (kind === 'deposit' ? 'pendingDeposit' : 'pendingLoss') as 'pendingDeposit' | 'pendingLoss';
const globalField = (kind: LimitKind) => (kind === 'deposit' ? 'depositDailyFcfa' : 'lossDailyFcfa') as 'depositDailyFcfa' | 'lossDailyFcfa';

/** Limite personnelle en vigueur, une remontée arrivée à échéance comprise. */
function personalLimitAt(player: PlayerProtection, kind: LimitKind, now: number): number | null {
  const pending = player[pendingField(kind)];
  if (pending && pending.effectiveAt <= now) return pending.value;
  return player[personalField(kind)] ?? null;
}

/** Ce qui s'applique réellement : le plus bas du plafond commun et de la limite personnelle. */
export function effectiveLimit(player: PlayerProtection, settings: ProtectionSettings, kind: LimitKind, now: number): number {
  const personal = personalLimitAt(player, kind, now);
  const global = settings[globalField(kind)];
  return personal === null ? global : Math.min(personal, global);
}

/**
 * Changement de limite demandé par le joueur. Baisser s'applique tout de suite ; remonter, ou revenir au plafond commun,
 * n'agit qu'après le délai réglé dans Katika. Une baisse annule une remontée en attente.
 */
export function changePersonalLimit(
  player: PlayerProtection,
  kind: LimitKind,
  value: unknown,
  settings: ProtectionSettings,
  now: number
): { ok: true; patch: Partial<PlayerProtection>; delayed: boolean } | { ok: false; error: string } {
  if (value !== null && (!Number.isSafeInteger(value) || (value as number) < 1)) {
    return { ok: false, error: 'La limite doit être un nombre entier de FCFA.' };
  }
  const requested = value as number | null;
  const global = settings[globalField(kind)];
  if (requested !== null && requested > global) {
    return { ok: false, error: `La limite ne peut pas dépasser le plafond de ${global} FCFA.` };
  }
  const current = personalLimitAt(player, kind, now) ?? global;
  const target = requested ?? global;
  const personal = personalField(kind);
  const pending = pendingField(kind);
  if (target <= current) {
    return { ok: true, delayed: false, patch: { [personal]: requested, [pending]: null } };
  }
  return {
    ok: true,
    delayed: true,
    patch: {
      [personal]: personalLimitAt(player, kind, now),
      [pending]: { value: requested, effectiveAt: now + settings.limitRaiseDelayHours * 3_600_000 },
    },
  };
}

/** Fin de l'exclusion en cours : null s'il n'y en a pas, Infinity si rien n'est prévu. */
export function exclusionEnd(player: PlayerProtection, now: number): number | null {
  const exclusion = player.exclusion;
  if (!exclusion) return null;
  const ends = [exclusion.until, exclusion.liftAt].filter((v): v is number => typeof v === 'number');
  const end = ends.length > 0 ? Math.min(...ends) : Infinity;
  return end > now ? end : null;
}

export const PAUSE_DAYS = [1, 7, 30];

/** Pause ou exclusion définitive choisie par le joueur. On peut l'allonger, jamais la raccourcir. */
export function startExclusion(
  player: PlayerProtection,
  request: { kind: unknown; days?: unknown },
  now: number
): { ok: true; exclusion: PlayerExclusion } | { ok: false; error: string } {
  const currentEnd = exclusionEnd(player, now);
  if (request.kind === 'PERMANENT') {
    return { ok: true, exclusion: { kind: 'PERMANENT', startedAt: now } };
  }
  if (request.kind !== 'PAUSE' || !PAUSE_DAYS.includes(request.days as number)) {
    return { ok: false, error: 'Choisis une pause de 24 heures, 7 jours ou 30 jours.' };
  }
  const until = now + (request.days as number) * 86_400_000;
  if (currentEnd !== null && currentEnd >= until) {
    return { ok: false, error: 'Ta pause en cours dure déjà plus longtemps.' };
  }
  return { ok: true, exclusion: { kind: 'PAUSE', startedAt: now, until } };
}

/** Levée depuis Katika : note obligatoire, et l'accès ne revient qu'après le délai réglé. La trace reste. */
export function liftExclusion(
  player: PlayerProtection,
  input: { actor: string; note: unknown },
  settings: ProtectionSettings,
  now: number
): { ok: true; exclusion: PlayerExclusion } | { ok: false; error: string } {
  const note = cleanNote(input.note);
  if (!note) return { ok: false, error: 'Indique le motif de la levée.' };
  if (!player.exclusion || exclusionEnd(player, now) === null) return { ok: false, error: 'Ce joueur n’a pas d’exclusion en cours.' };
  return {
    ok: true,
    exclusion: { ...player.exclusion, liftAt: now + settings.exclusionLiftDelayHours * 3_600_000, liftedBy: input.actor, liftNote: note },
  };
}

const MSG_EXCLUDED = 'Tu as choisi une pause de Kora Cash : dépôts et tables sont fermés pendant ce temps. Tu peux toujours retirer ton solde.';

/** Dépôt refusé : message, sinon null. Les dépôts déjà lancés et pas encore confirmés comptent. */
export function checkDeposit(params: {
  player: PlayerProtection;
  daily: DailyTotals;
  pendingAmount: number;
  amount: number;
  settings: ProtectionSettings;
  now: number;
}): string | null {
  const { player, daily, pendingAmount, amount, settings, now } = params;
  if (exclusionEnd(player, now) !== null) return MSG_EXCLUDED;
  const limit = effectiveLimit(player, settings, 'deposit', now);
  const room = limit - daily.deposits - pendingAmount;
  if (amount > room) {
    return room > 0
      ? `Ta limite de dépôt du jour est de ${limit} FCFA : il te reste ${room} FCFA.`
      : `Tu as atteint ta limite de dépôt du jour (${limit} FCFA). Réessaie demain.`;
  }
  return null;
}

/** Entrée à une table ou recave refusée : message, sinon null. Une table déjà commencée n'est pas interrompue. */
export function checkTableEntry(params: { player: PlayerProtection; daily: DailyTotals; settings: ProtectionSettings; now: number }): string | null {
  const { player, daily, settings, now } = params;
  if (exclusionEnd(player, now) !== null) return MSG_EXCLUDED;
  const limit = effectiveLimit(player, settings, 'loss', now);
  if (-daily.settlementNet >= limit) {
    return `Tu as atteint ta limite de pertes du jour (${limit} FCFA). Les tables rouvrent pour toi demain.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Gel et signaux du retrait
// ---------------------------------------------------------------------------

export type WithdrawalReviewReason = 'DEPOSIT_NO_PLAY' | 'ABNORMAL_GAIN' | 'FLAGGED_TABLE' | 'CHECK_UNAVAILABLE';

export const REVIEW_REASON_LABELS: Record<WithdrawalReviewReason, string> = {
  DEPOSIT_NO_PLAY: 'Dépôt sans jeu depuis',
  ABNORMAL_GAIN: 'Gain anormal aujourd’hui',
  FLAGGED_TABLE: 'Joueur dans un signalement de collusion',
  CHECK_UNAVAILABLE: 'Contrôle de protection indisponible',
};

export const MSG_WITHDRAWALS_FROZEN = 'Les retraits sont suspendus pour le moment. Ton argent reste sur ton solde.';

/** Gel : le gain reste sur le solde, rien n'est saisi. Le motif reste côté Katika. */
export function withdrawalFreezeMessage(player: PlayerProtection, settings: ProtectionSettings): string | null {
  return settings.withdrawalsFrozen || player.freeze ? MSG_WITHDRAWALS_FROZEN : null;
}

/** Signaux qui envoient un retrait à la validation, même sous le seuil automatique. */
export function withdrawalReviewReasons(params: {
  activity: PlayerActivity;
  daily: DailyTotals;
  openAlertCount: number;
  settings: ProtectionSettings;
}): WithdrawalReviewReason[] {
  const { activity, daily, openAlertCount, settings } = params;
  const reasons: WithdrawalReviewReason[] = [];
  if (typeof activity.lastDepositAt === 'number' && activity.lastDepositAt > (activity.lastPlayAt ?? 0)) reasons.push('DEPOSIT_NO_PLAY');
  if (daily.settlementNet >= settings.abnormalGainFcfa) reasons.push('ABNORMAL_GAIN');
  if (openAlertCount > 0) reasons.push('FLAGGED_TABLE');
  return reasons;
}

// ---------------------------------------------------------------------------
// Collusion : signalement seulement, jamais de blocage ni de sanction automatique
// ---------------------------------------------------------------------------

export type CollusionReason = 'FREQUENT' | 'ONE_WAY' | 'FORFEITS';

export const COLLUSION_REASON_LABELS: Record<CollusionReason, string> = {
  FREQUENT: 'Jouent très souvent ensemble',
  ONE_WAY: 'L’argent va presque toujours dans le même sens',
  FORFEITS: 'Forfaits répétés face au même joueur',
};

export interface PairStats {
  id: string;
  /** Les deux joueurs, triés : a est toujours le premier. */
  a: string;
  b: string;
  parties: number;
  /** Argent passé de b vers a (négatif : de a vers b). */
  netToA: number;
  winsA: number;
  winsB: number;
  forfeitsA: number;
  forfeitsB: number;
  /** Valeur de l'indicateur au dernier signalement : un nouveau signalement attend qu'elle double. */
  reported?: Partial<Record<CollusionReason, number>>;
  updatedAt?: number;
}

export function pairIdFor(first: string, second: string): { id: string; a: string; b: string } {
  const [a, b] = [first, second].sort();
  return { id: createHash('sha256').update(`${a}|${b}`).digest('hex').slice(0, 32), a, b };
}

export function emptyPairStats(first: string, second: string): PairStats {
  return { ...pairIdFor(first, second), parties: 0, netToA: 0, winsA: 0, winsB: 0, forfeitsA: 0, forfeitsB: 0 };
}

export interface PartiePairOutcome {
  winner: string;
  loser: string;
  amount: number;
  forfeit: boolean;
}

/** Une partie vue par paire : qui a gagné quoi à qui. Deux gagnants (pot partagé) se répartissent la perte de chacun. */
export function pairOutcomesFromResult(result: {
  participants: { playerId: string; isHuman: boolean; gross: number; net: number }[];
}, forfeitedIds: string[]): PartiePairOutcome[] {
  const humans = result.participants.filter((p) => p.isHuman);
  const winners = humans.filter((p) => p.gross > 0);
  const losers = humans.filter((p) => p.gross === 0 && p.net < 0);
  const outcomes: PartiePairOutcome[] = [];
  winners.forEach((winner) => {
    losers.forEach((loser) => {
      outcomes.push({
        winner: winner.playerId,
        loser: loser.playerId,
        amount: Math.floor(-loser.net / winners.length),
        forfeit: forfeitedIds.includes(loser.playerId),
      });
    });
  });
  return outcomes;
}

export function applyOutcomeToPair(stats: PairStats, outcome: PartiePairOutcome): PairStats {
  const winnerIsA = outcome.winner === stats.a;
  return {
    ...stats,
    parties: stats.parties + 1,
    netToA: stats.netToA + (winnerIsA ? outcome.amount : -outcome.amount),
    winsA: stats.winsA + (winnerIsA ? 1 : 0),
    winsB: stats.winsB + (winnerIsA ? 0 : 1),
    forfeitsA: stats.forfeitsA + (outcome.forfeit && !winnerIsA ? 1 : 0),
    forfeitsB: stats.forfeitsB + (outcome.forfeit && winnerIsA ? 1 : 0),
  };
}

const ONE_WAY_MIN_WIN_SHARE = 0.8;

function collusionMetric(stats: PairStats, reason: CollusionReason, settings: ProtectionSettings): number | null {
  switch (reason) {
    case 'FREQUENT':
      return stats.parties >= settings.collusionParties ? stats.parties : null;
    case 'ONE_WAY': {
      const net = Math.abs(stats.netToA);
      const leaderWins = stats.netToA >= 0 ? stats.winsA : stats.winsB;
      return net >= settings.collusionOneWayFcfa && leaderWins / Math.max(1, stats.parties) >= ONE_WAY_MIN_WIN_SHARE ? net : null;
    }
    case 'FORFEITS': {
      const forfeits = Math.max(stats.forfeitsA, stats.forfeitsB);
      return forfeits >= settings.collusionForfeits ? forfeits : null;
    }
  }
}

/** Signaux à remonter maintenant. Une paire déjà signalée ne l'est de nouveau que si l'indicateur a doublé. */
export function newCollusionReasons(stats: PairStats, settings: ProtectionSettings): { reason: CollusionReason; metric: number }[] {
  const found: { reason: CollusionReason; metric: number }[] = [];
  (['FREQUENT', 'ONE_WAY', 'FORFEITS'] as CollusionReason[]).forEach((reason) => {
    const metric = collusionMetric(stats, reason, settings);
    if (metric === null) return;
    const last = stats.reported?.[reason];
    if (last === undefined || metric >= last * 2) found.push({ reason, metric });
  });
  return found;
}

export interface CollusionAlert {
  id: string;
  pairId: string;
  uids: string[];
  reason: CollusionReason;
  metric: number;
  parties: number;
  netToA: number;
  status: 'OPEN' | 'CLOSED';
  createdAt: number;
  closedAt?: number;
  closedBy?: string;
  closeNote?: string;
}
