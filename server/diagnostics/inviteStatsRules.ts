/**
 * Parcours d'invitation : règles pures (aucun réseau, aucun accès à la base).
 * Un lien de table (partagé par WhatsApp, QR, ou ouvert depuis une notification) donne lieu à quelques signaux anonymes :
 * lien ouvert, carte d'arrivée affichée (avec son état), clic « Rejoindre », « Pas maintenant », table rejointe, échec (avec son motif).
 * Le serveur ne reçoit que le type d'étape, le canal, le mode, un détail pris dans une liste fermée et la version de l'application ;
 * l'appareil vient de l'user-agent. Jamais de code de table, de nom, de pseudo, de compte, de capital ni de montant.
 * Même regroupement par « famille » que les démarrages, avec en plus le canal (lien partagé ou notification) et le mode (gratuit ; Kora Cash prévu).
 */

import { createHash } from 'node:crypto';
import { parseUserAgent } from './crashReportRules';
import type { BootFamily } from './bootStatsRules';

export const INVITE_STEPS = ['opened', 'card', 'click', 'later', 'joined', 'failed'] as const;
export type InviteStep = (typeof INVITE_STEPS)[number];
export const INVITE_CHANNELS = ['link', 'notification'] as const;
export type InviteChannel = (typeof INVITE_CHANNELS)[number];
/** « cash » est accepté par le format dès maintenant pour que les liens Kora Cash puissent être mesurés plus tard sans changer les données. */
export const INVITE_MODES = ['free', 'cash'] as const;
export type InviteMode = (typeof INVITE_MODES)[number];

export const CARD_STATES = ['OPEN', 'FULL', 'STARTED', 'UNAVAILABLE'] as const;

/** Refus normaux : la jointure fonctionne, c'est la table ou le joueur qui ne le permet pas. Ce n'est pas un bug. */
export const NORMAL_REFUSALS = ['ROOM_NOT_FOUND', 'JOIN_REFUSED', 'BANNED', 'MAINTENANCE', 'ACTIVE_GAME_IN_PROGRESS'] as const;
/** Échecs techniques : réseau, serveur, exception, trop de tentatives, authentification, code inconnu. */
export const TECHNICAL_FAILURES = ['RATE_LIMITED', 'GENERIC', 'TIMEOUT', 'EXCEPTION', 'AUTH', 'UNKNOWN'] as const;
export const FAILURE_MOTIFS: readonly string[] = [...NORMAL_REFUSALS, ...TECHNICAL_FAILURES];

const MAX_BUILD_CHARS = 60;
export const OTHER_INVITE_KEY = 'autres';

export interface InviteGroup extends BootFamily {
  channel: InviteChannel;
  mode: InviteMode;
}

export interface InviteRow extends InviteGroup {
  key: string;
  /** Compteurs par étape : opened, card_OPEN…, click, later, joined, fail_<MOTIF>. */
  counts: Record<string, number>;
}

export interface InviteDay {
  day: string;
  rows: Record<string, InviteRow>;
}

/** Ramène un code d'erreur brut (serveur ou client) à la liste fermée. Tout ce qui est inconnu devient UNKNOWN. */
export function normalizeFailureMotif(raw: unknown): string {
  if (typeof raw !== 'string') return 'UNKNOWN';
  const code = raw.toUpperCase().replace(/[^A-Z_]/g, '').slice(0, 40);
  if (FAILURE_MOTIFS.includes(code)) return code;
  if (code.startsWith('AUTH')) return 'AUTH';
  return 'UNKNOWN';
}

export type InviteSignalResult =
  | { ok: true; step: InviteStep; counter: string; group: InviteGroup }
  | { ok: false };

export function sanitizeInviteSignal(body: unknown, userAgent: unknown): InviteSignalResult {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const step = INVITE_STEPS.find((s) => s === b.step);
  if (!step) return { ok: false };
  const channel = INVITE_CHANNELS.find((c) => c === b.channel);
  if (!channel) return { ok: false };
  const mode = INVITE_MODES.find((m) => m === b.mode) ?? 'free';

  let counter: string = step;
  if (step === 'card') {
    const state = CARD_STATES.find((s) => s === b.detail);
    if (!state) return { ok: false };
    counter = `card_${state}`;
  } else if (step === 'failed') {
    counter = `fail_${normalizeFailureMotif(b.detail)}`;
  }

  const ua = parseUserAgent(userAgent);
  const build = typeof b.build === 'string' ? b.build.replace(/[^A-Za-z0-9._-]/g, '').slice(0, MAX_BUILD_CHARS) : '';
  return {
    ok: true,
    step,
    counter,
    group: { device: ua.device, os: ua.os, osVersion: ua.osVersion.split('.')[0] || '', browser: ua.browser, build, channel, mode },
  };
}

export function inviteGroupKey(g: InviteGroup): string {
  return createHash('sha1').update([g.device, g.os, g.osVersion, g.browser, g.build, g.channel, g.mode].join('|')).digest('hex').slice(0, 16);
}

const OTHER_GROUP_BASE: BootFamily = { device: 'Autres', os: 'Autres', osVersion: '', browser: 'Autres', build: '' };

function emptyRow(key: string, group: InviteGroup): InviteRow {
  return { key, ...group, counts: {} };
}

function otherKey(group: InviteGroup): string {
  return `${OTHER_INVITE_KEY}_${group.channel}_${group.mode}`;
}

function otherGroup(group: InviteGroup): InviteGroup {
  return { ...OTHER_GROUP_BASE, channel: group.channel, mode: group.mode };
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
export function createInviteTally() {
  const byDay = new Map<string, Map<string, InviteRow>>();
  return {
    record(dayKey: string, counter: string, group: InviteGroup, maxFamilies: number, amount = 1): void {
      let day = byDay.get(dayKey);
      if (!day) {
        day = new Map();
        byDay.set(dayKey, day);
      }
      let key = inviteGroupKey(group);
      let g = group;
      if (!day.has(key) && day.size >= Math.max(1, maxFamilies)) {
        key = otherKey(group);
        g = otherGroup(group);
      }
      const row = day.get(key) ?? emptyRow(key, g);
      row.counts[counter] = (row.counts[counter] ?? 0) + amount;
      day.set(key, row);
    },
    drain(): Array<{ day: string; rows: InviteRow[] }> {
      const out = Array.from(byDay.entries()).map(([day, rows]) => ({ day, rows: Array.from(rows.values()) }));
      byDay.clear();
      return out;
    },
    restore(day: string, rows: InviteRow[], maxFamilies: number): void {
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

/** Ajoute des compteurs au document déjà enregistré ; au-delà du plafond, les nouveaux groupes passent sous « autres » (par canal et mode). */
export function mergeInviteDay(existing: InviteDay | null, day: string, delta: readonly InviteRow[], maxFamilies: number): InviteDay {
  const rows: Record<string, InviteRow> = {};
  for (const [k, r] of Object.entries(existing?.rows ?? {})) rows[k] = { ...r, counts: addCounts({}, r.counts ?? {}) };
  for (const d of delta) {
    let key = d.key;
    let base: InviteRow = d;
    if (!rows[key] && Object.keys(rows).length >= Math.max(1, maxFamilies) && !key.startsWith(OTHER_INVITE_KEY)) {
      key = otherKey(d);
      base = { ...d, ...otherGroup(d), key };
    }
    const cur = rows[key] ?? emptyRow(key, base);
    rows[key] = { ...cur, counts: addCounts(cur.counts, d.counts) };
  }
  return { day, rows };
}

export function sumInviteDays(days: readonly InviteDay[]): InviteRow[] {
  const total = new Map<string, InviteRow>();
  for (const d of days) {
    for (const r of Object.values(d.rows ?? {})) {
      const cur = total.get(r.key) ?? emptyRow(r.key, r);
      total.set(r.key, { ...cur, counts: addCounts(cur.counts, r.counts ?? {}) });
    }
  }
  return Array.from(total.values());
}

export interface InviteThresholds {
  /** Clics (ou tentatives) minimum pour juger un groupe. */
  minClicks: number;
  /** Écart, en points, au-dessus du taux d'échec technique des autres groupes du même canal à partir duquel un groupe est suspect. */
  gapPoints: number;
}

export interface InviteAnalysisRow extends InviteRow {
  opened: number;
  cardShown: number;
  clicks: number;
  later: number;
  joined: number;
  normalRefusals: number;
  technicalFailures: number;
  /** Clics restés sans réussite ni refus : page fermée avant la réponse, ou réponse jamais arrivée. Informatif. */
  noAnswer: number;
  /** Part des clics qui finissent en échec technique, 0 à 100. */
  technicalRatePct: number;
  othersTechnicalRatePct: number | null;
  gapPoints: number | null;
  judged: boolean;
  suspect: boolean;
}

const sumOf = (counts: Record<string, number>, names: readonly string[], prefix: string) =>
  names.reduce((s, n) => s + (Number(counts[`${prefix}${n}`]) || 0), 0);

/**
 * Un groupe est suspect quand assez de clics aboutissent à un échec technique et que ce taux dépasse nettement celui des autres groupes
 * du même canal et du même mode. Les refus normaux (table pleine, partie commencée, table introuvable, banni, maintenance, partie en cours)
 * ne comptent jamais comme des échecs. Aucun taux « normal » n'est deviné : il se lit chez les autres.
 */
export function analyzeInviteRows(rows: readonly InviteRow[], thresholds: InviteThresholds): InviteAnalysisRow[] {
  const base = rows.map((r) => {
    const c = r.counts ?? {};
    const clicks = Number(c.click) || 0;
    const joined = Number(c.joined) || 0;
    const normalRefusals = sumOf(c, NORMAL_REFUSALS, 'fail_');
    const technicalFailures = sumOf(c, TECHNICAL_FAILURES, 'fail_');
    return {
      ...r,
      opened: Number(c.opened) || 0,
      cardShown: sumOf(c, CARD_STATES, 'card_'),
      clicks,
      later: Number(c.later) || 0,
      joined,
      normalRefusals,
      technicalFailures,
      noAnswer: Math.max(0, clicks - joined - normalRefusals - technicalFailures),
    };
  });
  const totals = new Map<string, { clicks: number; tech: number }>();
  for (const r of base) {
    const k = `${r.channel}|${r.mode}`;
    const t = totals.get(k) ?? { clicks: 0, tech: 0 };
    t.clicks += r.clicks;
    t.tech += r.technicalFailures;
    totals.set(k, t);
  }
  return base
    .map((r) => {
      const t = totals.get(`${r.channel}|${r.mode}`) ?? { clicks: 0, tech: 0 };
      const otherClicks = t.clicks - r.clicks;
      const otherTech = t.tech - r.technicalFailures;
      const rate = r.clicks > 0 ? Math.min(100, (r.technicalFailures / r.clicks) * 100) : 0;
      const othersRate = otherClicks > 0 ? Math.min(100, (otherTech / otherClicks) * 100) : null;
      const gap = othersRate === null || r.clicks === 0 ? null : rate - othersRate;
      const judged = r.clicks >= thresholds.minClicks && othersRate !== null && !r.key.startsWith(OTHER_INVITE_KEY);
      return {
        ...r,
        technicalRatePct: Math.round(rate * 10) / 10,
        othersTechnicalRatePct: othersRate === null ? null : Math.round(othersRate * 10) / 10,
        gapPoints: gap === null ? null : Math.round(gap * 10) / 10,
        judged,
        suspect: judged && gap !== null && gap >= thresholds.gapPoints,
      };
    })
    .sort((a, b) => Number(b.suspect) - Number(a.suspect) || b.clicks - a.clicks || b.opened - a.opened);
}
