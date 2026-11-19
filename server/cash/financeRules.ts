/**
 * Kora Cash — règles pures des finances (aucun accès base de données).
 * Frais annoncés au joueur, recettes et marge, comparaison entre l'argent réel chez Campay et ce que le jeu doit aux joueurs.
 * Un écart n'entraîne jamais de gel automatique : il est seulement signalé dans Katika.
 */

export interface FinanceSettings {
  /** Frais de dépôt à la charge du joueur. Le joueur voit le montant crédité avant de payer. */
  depositFeePercent: number;
  /** Ce que Campay garde réellement : sert à estimer la marge. */
  campayDepositPercent: number;
  campayWithdrawalPercent: number;
  /** Écart à partir duquel le rapprochement affiche une alerte. */
  gapAlertFcfa: number;
  updatedAt?: number;
  updatedBy?: string;
}

export const DEFAULT_FINANCE_SETTINGS: FinanceSettings = {
  depositFeePercent: 2,
  campayDepositPercent: 2,
  campayWithdrawalPercent: 1.5,
  gapAlertFcfa: 50,
};

type NumericSetting = Exclude<keyof FinanceSettings, 'updatedAt' | 'updatedBy'>;

const LIMITS: Record<NumericSetting, { min: number; max: number; label: string }> = {
  depositFeePercent: { min: 0, max: 20, label: 'Frais de dépôt' },
  campayDepositPercent: { min: 0, max: 20, label: 'Frais Campay sur les dépôts' },
  campayWithdrawalPercent: { min: 0, max: 20, label: 'Frais Campay sur les retraits' },
  gapAlertFcfa: { min: 0, max: 100_000_000, label: 'Seuil d’alerte' },
};

const KEYS = Object.keys(LIMITS) as NumericSetting[];

function isValid(key: NumericSetting, value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= LIMITS[key].min && value <= LIMITS[key].max;
}

export function normalizeFinanceSettings(raw: any): FinanceSettings {
  const settings: FinanceSettings = { ...DEFAULT_FINANCE_SETTINGS };
  KEYS.forEach((key) => {
    if (isValid(key, raw?.[key])) settings[key] = raw[key];
  });
  if (typeof raw?.updatedAt === 'number') settings.updatedAt = raw.updatedAt;
  if (typeof raw?.updatedBy === 'string') settings.updatedBy = raw.updatedBy;
  return settings;
}

export function parseFinanceSettingsPatch(body: any): { ok: boolean; patch?: Partial<Pick<FinanceSettings, NumericSetting>>; error?: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Corps de requête invalide.' };
  const patch: Partial<Pick<FinanceSettings, NumericSetting>> = {};
  for (const key of KEYS) {
    if (body[key] === undefined) continue;
    if (!isValid(key, body[key])) return { ok: false, error: `${LIMITS[key].label} : de ${LIMITS[key].min} à ${LIMITS[key].max}.` };
    patch[key] = body[key];
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: 'Aucun réglage à modifier.' };
  return { ok: true, patch };
}

/** Frais arrondis au franc supérieur, comme pour le retrait : un mouvement du registre est toujours un nombre entier. */
export function computeDepositQuote(amount: number, feePercent: number): { fee: number; credited: number } {
  const fee = Math.ceil(Math.round(amount * feePercent * 100) / 10000);
  return { fee, credited: amount - fee };
}

/** Totaux tenus au fil de l'eau, chacun écrit dans la même transaction que l'événement qu'il compte. */
export interface FinanceCounters {
  depositsGross: number;
  depositFees: number;
  withdrawalsNet: number;
  withdrawalFees: number;
  rake: number;
  /** Argent que l'exploitant sort lui-même de Campay (saisi à la main dans katika). Ce n'est pas un retrait de joueur. */
  operatorWithdrawals: number;
}

export const EMPTY_FINANCE_COUNTERS: FinanceCounters = { depositsGross: 0, depositFees: 0, withdrawalsNet: 0, withdrawalFees: 0, rake: 0, operatorWithdrawals: 0 };

const COUNTER_KEYS = Object.keys(EMPTY_FINANCE_COUNTERS) as (keyof FinanceCounters)[];

export function toCounters(raw: any): FinanceCounters {
  const counters = { ...EMPTY_FINANCE_COUNTERS };
  COUNTER_KEYS.forEach((key) => {
    const value = Number(raw?.[key]);
    if (Number.isFinite(value)) counters[key] = value;
  });
  return counters;
}

export function addCounters(a: FinanceCounters, b: FinanceCounters): FinanceCounters {
  const sum = { ...a };
  COUNTER_KEYS.forEach((key) => {
    sum[key] = a[key] + b[key];
  });
  return sum;
}

export function subtractCounters(a: FinanceCounters, b: FinanceCounters): FinanceCounters {
  const difference = { ...a };
  COUNTER_KEYS.forEach((key) => {
    difference[key] = a[key] - b[key];
  });
  return difference;
}

export interface FinanceSummary extends FinanceCounters {
  /** Estimation : les taux viennent des réglages, Campay ne donne pas ses frais opération par opération. */
  campayFees: number;
  /** Commission + frais pris aux joueurs - frais payés à Campay. */
  margin: number;
  /** Ce qui reste à l'exploitant : la marge moins ce qu'il a déjà retiré de Campay pour lui. */
  kept: number;
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

export function summarize(counters: FinanceCounters, settings: FinanceSettings): FinanceSummary {
  const campayFees = roundCents((counters.depositsGross * settings.campayDepositPercent) / 100 + (counters.withdrawalsNet * settings.campayWithdrawalPercent) / 100);
  const margin = roundCents(counters.rake + counters.depositFees + counters.withdrawalFees - campayFees);
  return { ...counters, campayFees, margin, kept: roundCents(margin - counters.operatorWithdrawals) };
}

/** Les N derniers jours au format AAAA-MM-JJ (heure de Douala), aujourd'hui compris. */
export function lastDateKeys(nowMs: number, days: number, dateKeyFor: (ms: number) => string): string[] {
  return Array.from({ length: days }, (_, index) => dateKeyFor(nowMs - index * 86_400_000));
}

export interface ReconciliationBaseline {
  realMargin: number;
  counters: FinanceCounters;
}

export interface Reconciliation {
  campayBalance: number;
  /** Ce que le jeu doit : soldes disponibles, argent en table, retraits pas encore terminés. */
  owed: number;
  /** Argent réel moins dettes. */
  realMargin: number;
  /** Ce que les totaux disent qu'il devrait rester. */
  expectedMargin: number;
  gap: number;
  alert: boolean;
}

/**
 * Compare l'argent réel à ce qui est dû. Depuis le point de départ enregistré, seul ce qui a changé compte : l'écart ancien
 * (dépôts de test crédités à 100 %, par exemple) reste dans l'historique sans revenir à chaque rapport.
 */
export function computeReconciliation(params: {
  campayBalance: number;
  owed: number;
  counters: FinanceCounters;
  baseline: ReconciliationBaseline | null;
  settings: FinanceSettings;
}): Reconciliation {
  const { campayBalance, owed, counters, baseline, settings } = params;
  const realMargin = roundCents(campayBalance - owed);
  const expectedMargin = baseline
    ? roundCents(baseline.realMargin + summarize(subtractCounters(counters, baseline.counters), settings).kept)
    : summarize(counters, settings).kept;
  const gap = roundCents(realMargin - expectedMargin);
  return { campayBalance, owed, realMargin, expectedMargin, gap, alert: Math.abs(gap) >= settings.gapAlertFcfa && gap !== 0 };
}

/** Solde saisi à la main : un montant positif ou nul. */
export function parseManualBalance(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= 1e12 ? raw : null;
}

/** Réponse de Campay à la lecture du solde : null si elle est illisible, jamais un zéro inventé. */
export function parseCampayBalance(data: any): number | null {
  const value = Number(data?.total_balance);
  return data && data.total_balance !== undefined && data.total_balance !== null && Number.isFinite(value) && value >= 0 ? value : null;
}


// ---------------------------------------------------------------------------
// Retraits de l'exploitant (saisie à la main) et fenêtre du tableau de bord
// ---------------------------------------------------------------------------

/** Plafond d'un retrait saisi : filet contre une faute de frappe, pas une règle métier. */
export const MAX_OPERATOR_WITHDRAWAL_FCFA = 1_000_000_000;
/** Un retrait peut être noté avec une date passée, jusqu'à un an en arrière. */
export const MAX_OPERATOR_BACKDATE_DAYS = 365;
export const OPERATOR_NOTE_MAX = 140;
export const DASHBOARD_ALLOWED_DAYS = [7, 30, 90] as const;
export const DASHBOARD_DEFAULT_DAYS = 30;

export interface OperatorWithdrawalInput {
  amount: number;
  /** AAAA-MM-JJ, heure de Douala. */
  dateKey: string;
  note: string;
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Midi (heure de Douala) du jour désigné : l'instant qui range un événement dans la bonne case journalière. */
export function dateKeyToNoonMs(dateKey: string): number | null {
  if (!DATE_KEY_RE.test(dateKey)) return null;
  const ms = Date.parse(`${dateKey}T12:00:00+01:00`);
  return Number.isFinite(ms) ? ms : null;
}

export function parseOperatorWithdrawal(
  body: any,
  nowMs: number,
  dateKeyFor: (ms: number) => string,
): { ok: boolean; value?: OperatorWithdrawalInput; error?: string } {
  const amount = body?.amount;
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_OPERATOR_WITHDRAWAL_FCFA) {
    return { ok: false, error: 'Montant invalide : un nombre entier de FCFA, supérieur à zéro.' };
  }
  const today = dateKeyFor(nowMs);
  const dateKey = body?.dateKey === undefined || body?.dateKey === null || body?.dateKey === '' ? today : String(body.dateKey);
  const noon = dateKeyToNoonMs(dateKey);
  if (noon === null || dateKeyFor(noon) !== dateKey) return { ok: false, error: 'Date invalide.' };
  if (dateKey > today) return { ok: false, error: 'La date ne peut pas être dans le futur.' };
  if (nowMs - noon > (MAX_OPERATOR_BACKDATE_DAYS + 1) * 86_400_000) return { ok: false, error: 'Date trop ancienne (un an maximum).' };
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, OPERATOR_NOTE_MAX) : '';
  return { ok: true, value: { amount, dateKey, note } };
}

export function parseDashboardDays(raw: unknown): number {
  const n = Number(raw);
  return (DASHBOARD_ALLOWED_DAYS as readonly number[]).includes(n) ? n : DASHBOARD_DEFAULT_DAYS;
}

export interface DailyPoint {
  dateKey: string;
  counters: FinanceCounters;
}
