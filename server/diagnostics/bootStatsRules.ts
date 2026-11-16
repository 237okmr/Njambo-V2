/**
 * Démarrages de l'application : règles pures (aucun réseau, aucun accès à la base).
 * Deux signaux anonymes par chargement de page : « démarrage commencé » (parti de index.html, avant le code du jeu)
 * et « accueil affiché » (parti du premier montage de l'écran d'accueil). L'écart entre les deux révèle une page
 * blanche sans erreur. Le serveur ne reçoit que le type de signal et la version de l'application ; l'appareil est déduit de
 * l'user-agent, jamais de nom, de pseudo, de compte ni d'adresse. Les compteurs sont regroupés par « famille » :
 * type d'appareil, système, version majeure, navigateur, version de l'application.
 */

import { createHash } from 'node:crypto';
import { parseUserAgent } from './crashReportRules';

export type BootStep = 'start' | 'home';

export const OTHER_FAMILY_KEY = 'autres';
const MAX_BUILD_CHARS = 60;

export interface BootFamily {
  device: string;
  os: string;
  /** Version majeure du système (ex. « 17 »), vide si inconnue. */
  osVersion: string;
  browser: string;
  build: string;
}

export interface BootCounts {
  started: number;
  home: number;
}

export interface BootFamilyRow extends BootFamily, BootCounts {
  key: string;
}

/** Document d'un jour : familles par clé. */
export interface BootDay {
  day: string;
  families: Record<string, BootFamilyRow>;
}

export type BootSignalResult = { ok: true; step: BootStep; family: BootFamily } | { ok: false };

export function sanitizeBootSignal(body: unknown, userAgent: unknown): BootSignalResult {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (b.step !== 'start' && b.step !== 'home') return { ok: false };
  const ua = parseUserAgent(userAgent);
  const build = typeof b.build === 'string' ? b.build.replace(/[^A-Za-z0-9._-]/g, '').slice(0, MAX_BUILD_CHARS) : '';
  return {
    ok: true,
    step: b.step,
    family: { device: ua.device, os: ua.os, osVersion: ua.osVersion.split('.')[0] || '', browser: ua.browser, build },
  };
}

/** Clé stable et sûre pour Firestore (aucun point ni barre dans une clé de champ). */
export function bootFamilyKey(f: BootFamily): string {
  return createHash('sha1').update([f.device, f.os, f.osVersion, f.browser, f.build].join('|')).digest('hex').slice(0, 16);
}

const OTHER_FAMILY: BootFamily = { device: 'Autres', os: 'Autres', osVersion: '', browser: 'Autres', build: '' };

function emptyRow(key: string, family: BootFamily): BootFamilyRow {
  return { key, ...family, started: 0, home: 0 };
}

/** Compteurs en attente de sauvegarde, par jour puis par famille. Les types de familles par jour sont plafonnés en mémoire. */
export function createBootTally() {
  const byDay = new Map<string, Map<string, BootFamilyRow>>();
  return {
    record(dayKey: string, step: BootStep, family: BootFamily, maxFamilies: number): void {
      let day = byDay.get(dayKey);
      if (!day) {
        day = new Map();
        byDay.set(dayKey, day);
      }
      let key = bootFamilyKey(family);
      let fam: BootFamily = family;
      if (!day.has(key) && day.size >= Math.max(1, maxFamilies)) {
        key = OTHER_FAMILY_KEY;
        fam = OTHER_FAMILY;
      }
      const row = day.get(key) ?? emptyRow(key, fam);
      if (step === 'start') row.started += 1;
      else row.home += 1;
      day.set(key, row);
    },
    /** Sort le contenu en attente et vide la mémoire. À remettre avec `restore` si l'écriture échoue. */
    drain(): Array<{ day: string; rows: BootFamilyRow[] }> {
      const out = Array.from(byDay.entries()).map(([day, rows]) => ({ day, rows: Array.from(rows.values()) }));
      byDay.clear();
      return out;
    },
    restore(day: string, rows: BootFamilyRow[], maxFamilies: number): void {
      for (const r of rows) {
        const { key: _k, started, home, ...family } = r;
        for (let i = 0; i < started; i += 1) this.record(day, 'start', family, maxFamilies);
        for (let i = 0; i < home; i += 1) this.record(day, 'home', family, maxFamilies);
      }
    },
    pendingCount(): number {
      let n = 0;
      byDay.forEach((d) => d.forEach((r) => { n += r.started + r.home; }));
      return n;
    },
  };
}

/** Ajoute des compteurs au document déjà enregistré ; au-delà du plafond, les nouvelles familles sont regroupées sous « autres ». */
export function mergeBootDay(existing: BootDay | null, day: string, delta: readonly BootFamilyRow[], maxFamilies: number): BootDay {
  const families: Record<string, BootFamilyRow> = {};
  for (const [k, r] of Object.entries(existing?.families ?? {})) {
    families[k] = { ...r, started: Number(r.started) || 0, home: Number(r.home) || 0 };
  }
  for (const d of delta) {
    let key = d.key;
    let base: BootFamilyRow = d;
    if (!families[key] && Object.keys(families).length >= Math.max(1, maxFamilies) && key !== OTHER_FAMILY_KEY) {
      key = OTHER_FAMILY_KEY;
      base = { ...d, ...OTHER_FAMILY, key };
    }
    const cur = families[key] ?? emptyRow(key, base);
    families[key] = { ...cur, started: cur.started + d.started, home: cur.home + d.home };
  }
  return { day, families };
}

/** Additionne plusieurs jours, famille par famille. */
export function sumBootDays(days: readonly BootDay[]): BootFamilyRow[] {
  const total = new Map<string, BootFamilyRow>();
  for (const d of days) {
    for (const r of Object.values(d.families ?? {})) {
      const cur = total.get(r.key) ?? emptyRow(r.key, r);
      total.set(r.key, { ...cur, started: cur.started + (Number(r.started) || 0), home: cur.home + (Number(r.home) || 0) });
    }
  }
  return Array.from(total.values());
}

export interface BootThresholds {
  /** Démarrages minimum pour juger une famille (en dessous, trop peu pour conclure). */
  minStarts: number;
  /** Écart, en points de pourcentage, sous le taux des autres familles à partir duquel une famille est suspecte. */
  gapPoints: number;
}

export interface BootAnalysisRow extends BootFamilyRow {
  /** Part des démarrages qui atteignent l'accueil, 0 à 100. */
  ratePct: number;
  /** Taux de toutes les autres familles ensemble, 0 à 100 ; null s'il n'y a aucun démarrage ailleurs. */
  othersRatePct: number | null;
  /** Écart avec les autres familles, en points (positif = cette famille fait moins bien). */
  gapPoints: number | null;
  /** Assez de démarrages pour juger. */
  judged: boolean;
  suspect: boolean;
}

/**
 * Une famille est suspecte quand elle a assez de démarrages et que son taux d'affichage est nettement sous celui des autres
 * familles réunies. Le taux « normal » (onglet fermé avant l'accueil, réseau coupé) n'est pas deviné : il se lit chez les autres.
 */
export function analyzeBootFamilies(rows: readonly BootFamilyRow[], thresholds: BootThresholds): BootAnalysisRow[] {
  const totalStarted = rows.reduce((s, r) => s + r.started, 0);
  const totalHome = rows.reduce((s, r) => s + r.home, 0);
  return rows
    .map((r) => {
      const otherStarted = totalStarted - r.started;
      const otherHome = totalHome - r.home;
      const ratePct = r.started > 0 ? Math.min(100, (r.home / r.started) * 100) : 0;
      const othersRatePct = otherStarted > 0 ? Math.min(100, (otherHome / otherStarted) * 100) : null;
      const gap = othersRatePct === null || r.started === 0 ? null : othersRatePct - ratePct;
      const judged = r.started >= thresholds.minStarts && othersRatePct !== null && r.key !== OTHER_FAMILY_KEY;
      return {
        ...r,
        ratePct: Math.round(ratePct * 10) / 10,
        othersRatePct: othersRatePct === null ? null : Math.round(othersRatePct * 10) / 10,
        gapPoints: gap === null ? null : Math.round(gap * 10) / 10,
        judged,
        suspect: judged && gap !== null && gap >= thresholds.gapPoints,
      };
    })
    .sort((a, b) => Number(b.suspect) - Number(a.suspect) || b.started - a.started);
}

/** Les n derniers jours calendaires (jour en cours compris), du plus récent au plus ancien. Le fuseau est celui de `keyOf`. */
export function recentDayKeys(nowMs: number, days: number, keyOf: (ms: number) => string): string[] {
  const n = Math.max(1, Math.min(90, Math.floor(days) || 1));
  const keys: string[] = [];
  for (let i = 0; i < n; i += 1) keys.push(keyOf(nowMs - i * 86_400_000)); // delay-ok: pas d'un jour calendaire, pas un délai
  return keys;
}
