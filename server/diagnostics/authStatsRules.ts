/**
 * Connexion Google : règles pures de la mesure (aucun réseau, aucun accès à la base).
 * Chaque tentative de connexion laisse quelques signaux anonymes : fenêtre lancée / réussie / échouée, et, pour le secours,
 * redirection lancée / réussie / échouée / sans retour. Le serveur ne reçoit que l'étape, un code d'erreur pris dans une liste fermée,
 * l'indication « domaine du jeu utilisé pour la connexion » (relais) et la version de l'application ; l'appareil vient de l'user-agent.
 * Jamais de nom, de courriel, d'identifiant de compte ni de contenu de jeu.
 * Même regroupement par « famille » d'appareil que les démarrages et les invitations.
 */

import { createHash } from 'node:crypto';
import { parseUserAgent } from './crashReportRules';
import type { BootFamily } from './bootStatsRules';

export const AUTH_STEPS = ['popup_start', 'popup_ok', 'popup_fail', 'redirect_start', 'redirect_ok', 'redirect_fail', 'redirect_lost'] as const;
export type AuthStep = (typeof AUTH_STEPS)[number];

/** Codes d'erreur Firebase (sans le préfixe « auth/ ») comptés séparément. Tout le reste devient « other ». */
export const KNOWN_AUTH_CODES = [
  'popup-blocked',
  'popup-closed-by-user',
  'cancelled-popup-request',
  'operation-not-supported-in-this-environment',
  'web-storage-unsupported',
  'network-request-failed',
  'unauthorized-domain',
  'internal-error',
  'too-many-requests',
  'user-disabled',
  'account-exists-with-different-credential',
  'timeout',
  'redirect-cancelled-by-user',
] as const;

/** Abandons volontaires (ou supposés tels) : comptés à part, jamais comme un échec technique. */
export const ABANDON_CODES: readonly string[] = ['popup-closed-by-user', 'cancelled-popup-request', 'redirect-cancelled-by-user'];

const MAX_BUILD_CHARS = 60;
export const OTHER_AUTH_KEY = 'autres';

export interface AuthGroup extends BootFamily {
  /** Vrai quand la connexion de cet appareil passait par le domaine du jeu (relais) et non par celui de Firebase. */
  relay: boolean;
}

export interface AuthRow extends AuthGroup {
  key: string;
  /** Compteurs : popup_start, popup_ok, popup_fail_<code>, redirect_start, redirect_ok, redirect_fail_<code>, redirect_lost. */
  counts: Record<string, number>;
}

export interface AuthDay {
  day: string;
  rows: Record<string, AuthRow>;
}

/** Ramène un code d'erreur brut à la liste fermée (« auth/popup-blocked » ou « popup-blocked »). */
export function normalizeAuthCode(raw: unknown): string {
  if (typeof raw !== 'string') return 'other';
  const code = raw.toLowerCase().replace(/^auth\//, '').replace(/[^a-z-]/g, '').slice(0, 60);
  return (KNOWN_AUTH_CODES as readonly string[]).includes(code) ? code : 'other';
}

export type AuthSignalResult = { ok: true; step: AuthStep; counter: string; group: AuthGroup } | { ok: false };

export function sanitizeAuthSignal(body: unknown, userAgent: unknown): AuthSignalResult {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const step = AUTH_STEPS.find((s) => s === b.step);
  if (!step) return { ok: false };
  const counter = step.endsWith('_fail') ? `${step}_${normalizeAuthCode(b.detail)}` : step;
  const ua = parseUserAgent(userAgent);
  const build = typeof b.build === 'string' ? b.build.replace(/[^A-Za-z0-9._-]/g, '').slice(0, MAX_BUILD_CHARS) : '';
  return {
    ok: true,
    step,
    counter,
    group: { device: ua.device, os: ua.os, osVersion: ua.osVersion.split('.')[0] || '', browser: ua.browser, build, relay: b.relay === true },
  };
}

export function authGroupKey(g: AuthGroup): string {
  return createHash('sha1').update([g.device, g.os, g.osVersion, g.browser, g.build, g.relay ? 'relay' : 'direct'].join('|')).digest('hex').slice(0, 16);
}

const OTHER_GROUP: AuthGroup = { device: 'Autres', os: 'Autres', osVersion: '', browser: 'Autres', build: '', relay: false };

function emptyRow(key: string, group: AuthGroup): AuthRow {
  return { key, ...group, counts: {} };
}

function addCounts(into: Record<string, number>, add: Record<string, number>): Record<string, number> {
  const out = { ...into };
  for (const [k, v] of Object.entries(add)) {
    const n = Number(v) || 0;
    if (n > 0) out[k] = (Number(out[k]) || 0) + n;
  }
  return out;
}

/** Compteurs en attente de sauvegarde, par jour puis par groupe. Les groupes distincts par jour sont plafonnés. */
export function createAuthTally() {
  const byDay = new Map<string, Map<string, AuthRow>>();
  return {
    record(dayKey: string, counter: string, group: AuthGroup, maxFamilies: number, amount = 1): void {
      let day = byDay.get(dayKey);
      if (!day) {
        day = new Map();
        byDay.set(dayKey, day);
      }
      let key = authGroupKey(group);
      let g = group;
      if (!day.has(key) && day.size >= Math.max(1, maxFamilies)) {
        key = OTHER_AUTH_KEY;
        g = OTHER_GROUP;
      }
      const row = day.get(key) ?? emptyRow(key, g);
      row.counts[counter] = (row.counts[counter] ?? 0) + amount;
      day.set(key, row);
    },
    drain(): Array<{ day: string; rows: AuthRow[] }> {
      const out = Array.from(byDay.entries()).map(([day, rows]) => ({ day, rows: Array.from(rows.values()) }));
      byDay.clear();
      return out;
    },
    restore(day: string, rows: AuthRow[], maxFamilies: number): void {
      for (const r of rows) {
        const { key: _k, counts, ...group } = r;
        for (const [counter, n] of Object.entries(counts)) this.record(day, counter, group, maxFamilies, n);
      }
    },
    pendingCount(): number {
      let n = 0;
      byDay.forEach((d) => d.forEach((r) => Object.values(r.counts).forEach((v) => { n += v; })));
      return n;
    },
  };
}

/** Ajoute des compteurs au document déjà enregistré ; au-delà du plafond, les nouveaux groupes passent sous « autres ». */
export function mergeAuthDay(existing: AuthDay | null, day: string, delta: readonly AuthRow[], maxFamilies: number): AuthDay {
  const rows: Record<string, AuthRow> = {};
  for (const [k, r] of Object.entries(existing?.rows ?? {})) rows[k] = { ...r, counts: addCounts({}, r.counts ?? {}) };
  for (const d of delta) {
    let key = d.key;
    let base: AuthRow = d;
    if (!rows[key] && Object.keys(rows).length >= Math.max(1, maxFamilies) && key !== OTHER_AUTH_KEY) {
      key = OTHER_AUTH_KEY;
      base = { ...d, ...OTHER_GROUP, key };
    }
    const cur = rows[key] ?? emptyRow(key, base);
    rows[key] = { ...cur, counts: addCounts(cur.counts, d.counts) };
  }
  return { day, rows };
}

export function sumAuthDays(days: readonly AuthDay[]): AuthRow[] {
  const total = new Map<string, AuthRow>();
  for (const d of days) {
    for (const r of Object.values(d.rows ?? {})) {
      const cur = total.get(r.key) ?? emptyRow(r.key, r);
      total.set(r.key, { ...cur, counts: addCounts(cur.counts, r.counts ?? {}) });
    }
  }
  return Array.from(total.values());
}

export interface AuthThresholds {
  /** Tentatives par fenêtre minimum pour juger un groupe. */
  minAttempts: number;
  /** Écart, en points, au-dessus du taux d'échec technique de la fenêtre chez les autres groupes à partir duquel un groupe est suspect. */
  gapPoints: number;
}

export interface AuthAnalysisRow extends AuthRow {
  popupStarts: number;
  popupOk: number;
  /** Échecs de la fenêtre hors abandons. */
  popupTechnicalFailures: number;
  /** « Fermée par l'utilisateur » et équivalents : informatif, jamais compté comme échec (Safari peut le signaler à tort). */
  popupAbandons: number;
  redirectStarts: number;
  redirectOk: number;
  redirectFailures: number;
  redirectLost: number;
  popupTechnicalRatePct: number;
  othersPopupTechnicalRatePct: number | null;
  gapPoints: number | null;
  judged: boolean;
  suspect: boolean;
}

const sumPrefix = (counts: Record<string, number>, prefix: string, keep: (code: string) => boolean) =>
  Object.entries(counts).reduce((s, [k, v]) => (k.startsWith(prefix) && keep(k.slice(prefix.length)) ? s + (Number(v) || 0) : s), 0);

/**
 * Un groupe est suspect quand assez de fenêtres sont lancées et que la part qui échoue techniquement (hors abandons) dépasse nettement
 * celle des autres groupes. Aucun taux « normal » n'est deviné : il se lit chez les autres. Le secours (redirection) est affiché
 * mais ne sert pas à juger : il n'existe que chez les appareils où la fenêtre a déjà échoué.
 */
export function analyzeAuthRows(rows: readonly AuthRow[], thresholds: AuthThresholds): AuthAnalysisRow[] {
  const base = rows.map((r) => {
    const c = r.counts ?? {};
    return {
      ...r,
      popupStarts: Number(c.popup_start) || 0,
      popupOk: Number(c.popup_ok) || 0,
      popupTechnicalFailures: sumPrefix(c, 'popup_fail_', (code) => !ABANDON_CODES.includes(code)),
      popupAbandons: sumPrefix(c, 'popup_fail_', (code) => ABANDON_CODES.includes(code)),
      redirectStarts: Number(c.redirect_start) || 0,
      redirectOk: Number(c.redirect_ok) || 0,
      redirectFailures: sumPrefix(c, 'redirect_fail_', () => true),
      redirectLost: Number(c.redirect_lost) || 0,
    };
  });
  const totalStarts = base.reduce((s, r) => s + r.popupStarts, 0);
  const totalFails = base.reduce((s, r) => s + r.popupTechnicalFailures, 0);
  return base
    .map((r) => {
      const otherStarts = totalStarts - r.popupStarts;
      const otherFails = totalFails - r.popupTechnicalFailures;
      const rate = r.popupStarts > 0 ? Math.min(100, (r.popupTechnicalFailures / r.popupStarts) * 100) : 0;
      const othersRate = otherStarts > 0 ? Math.min(100, (otherFails / otherStarts) * 100) : null;
      const gap = othersRate === null || r.popupStarts === 0 ? null : rate - othersRate;
      const judged = r.popupStarts >= thresholds.minAttempts && othersRate !== null && r.key !== OTHER_AUTH_KEY;
      return {
        ...r,
        popupTechnicalRatePct: Math.round(rate * 10) / 10,
        othersPopupTechnicalRatePct: othersRate === null ? null : Math.round(othersRate * 10) / 10,
        gapPoints: gap === null ? null : Math.round(gap * 10) / 10,
        judged,
        suspect: judged && gap !== null && gap >= thresholds.gapPoints,
      };
    })
    .sort((a, b) => Number(b.suspect) - Number(a.suspect) || b.popupStarts - a.popupStarts);
}
