/**
 * Plantages remontés par les navigateurs : règles pures (aucun réseau, aucun accès à la base).
 * Un rapport est anonyme : appareil, système, navigateur, version de l'application et message d'erreur.
 * Jamais de nom, d'identifiant de compte ni d'adresse. Les rapports sont regroupés par « signature » : un même
 * bug subi par mille joueurs devient une seule ligne avec un compteur.
 */

import { createHash } from 'node:crypto';

export const MAX_MESSAGE_CHARS = 300;
export const MAX_STACK_CHARS = 900;
const MAX_BUILD_CHARS = 60;

export type CrashPhase = 'BOOT' | 'RUNTIME';
export type CrashKind = 'error' | 'rejection' | 'react';

export interface CrashReport {
  message: string;
  stack: string;
  phase: CrashPhase;
  kind: CrashKind;
  build: string;
  os: string;
  osVersion: string;
  device: string;
  browser: string;
  model: string;
}

export interface CrashEntry extends CrashReport {
  signature: string;
  count: number;
  firstSeenAt: number;
  lastSeenAt: number;
  resolved: boolean;
}

/** Retire ce qui pourrait identifier quelqu'un : adresses web (on garde le chemin), courriels, longues chaînes ressemblant à un jeton. */
export function scrubText(raw: unknown, maxChars: number): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/https?:\/\/[^/\s)'"]+(\/[^\s)'"?#]*)?[^\s)'"]*/gi, (_m, path) => path || '<url>')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replace(/[A-Za-z0-9_-]{28,}/g, '<jeton>')
    .replace(/\s+\n/g, '\n')
    .slice(0, maxChars)
    .trim();
}

export interface ParsedUserAgent {
  os: string;
  osVersion: string;
  device: string;
  browser: string;
  model: string;
}

export function parseUserAgent(ua: unknown): ParsedUserAgent {
  const s = typeof ua === 'string' ? ua.slice(0, 400) : '';
  let os = 'Autre';
  let osVersion = '';
  let device = 'Autre';
  let model = '';

  const ios = /(iPhone|iPad|iPod)[^)]*?OS (\d+)[_.](\d+)/.exec(s) || /(iPhone|iPad|iPod)/.exec(s);
  const android = /Android ([\d.]+)(?:;\s*([^;)]+))?/.exec(s);
  if (ios) {
    os = 'iOS';
    device = ios[1] === 'iPad' ? 'iPad' : 'iPhone';
    if (ios[2]) osVersion = `${ios[2]}.${ios[3]}`;
  } else if (android) {
    os = 'Android';
    device = 'Android';
    osVersion = android[1];
    model = (android[2] || '').replace(/\s*Build.*$/, '').trim().slice(0, 40);
  } else if (/Windows NT/.test(s)) {
    os = 'Windows';
    device = 'Ordinateur';
  } else if (/Mac OS X/.test(s)) {
    os = 'macOS';
    device = 'Ordinateur';
  } else if (/Linux|X11/.test(s)) {
    os = 'Linux';
    device = 'Ordinateur';
  }

  let browser = 'Autre';
  if (/EdgiOS|EdgA|Edg\//.test(s)) browser = 'Edge';
  else if (/FxiOS|Firefox\//.test(s)) browser = 'Firefox';
  else if (/SamsungBrowser/.test(s)) browser = 'Samsung Internet';
  else if (/OPiOS|OPR\/|Opera/.test(s)) browser = 'Opera';
  else if (/CriOS|Chrome\//.test(s)) browser = 'Chrome';
  else if (/Safari\//.test(s)) browser = 'Safari';

  return { os, osVersion, device, browser, model };
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export type SanitizeResult = { ok: true; report: CrashReport } | { ok: false; reason: 'EMPTY' };

/** Valide et nettoie le corps reçu. Un rapport sans message n'est pas gardé. */
export function sanitizeCrashReport(body: unknown, userAgent: unknown): SanitizeResult {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const message = scrubText(b.message, MAX_MESSAGE_CHARS);
  if (!message) return { ok: false, reason: 'EMPTY' };
  const ua = parseUserAgent(userAgent);
  const build = typeof b.build === 'string' ? b.build.replace(/[^A-Za-z0-9._-]/g, '').slice(0, MAX_BUILD_CHARS) : '';
  return {
    ok: true,
    report: {
      message,
      stack: scrubText(b.stack, MAX_STACK_CHARS),
      phase: asEnum(b.phase, ['BOOT', 'RUNTIME'] as const, 'RUNTIME'),
      kind: asEnum(b.kind, ['error', 'rejection', 'react'] as const, 'error'),
      build,
      ...ua,
    },
  };
}

/** Même bug, même appareil, même version : même signature. Les nombres du message sont neutralisés. */
export function crashSignature(report: CrashReport): string {
  const normalized = report.message.toLowerCase().replace(/\d+/g, '#');
  const osMajor = report.osVersion.split('.')[0] || '';
  const key = [normalized, report.os, osMajor, report.browser, report.build, report.phase].join('|');
  return createHash('sha1').update(key).digest('hex').slice(0, 16);
}

/** Ajoute une occurrence. Un bug marqué « traité » qui revient est rouvert. */
export function mergeCrash(existing: CrashEntry | null, report: CrashReport, signature: string, nowMs: number): CrashEntry {
  if (!existing) {
    return { ...report, signature, count: 1, firstSeenAt: nowMs, lastSeenAt: nowMs, resolved: false };
  }
  return { ...existing, count: existing.count + 1, lastSeenAt: nowMs, resolved: false };
}

/** Plafonds : par adresse et pour tout le serveur, sur une fenêtre glissante par paliers. Les valeurs viennent du registre. */
export interface CrashLimits {
  windowMs: number;
  maxPerKey: number;
  maxGlobal: number;
}

export function createCrashLimiter() {
  const perKey = new Map<string, { start: number; count: number }>();
  let global = { start: 0, count: 0 };
  return {
    allow(key: string, nowMs: number, limits: CrashLimits): boolean {
      if (nowMs - global.start >= limits.windowMs) global = { start: nowMs, count: 0 };
      const entry = perKey.get(key);
      const current = entry && nowMs - entry.start < limits.windowMs ? entry : { start: nowMs, count: 0 };
      if (global.count >= limits.maxGlobal || current.count >= limits.maxPerKey) {
        perKey.set(key, current);
        return false;
      }
      global.count += 1;
      current.count += 1;
      perKey.set(key, current);
      if (perKey.size > 5000) {
        for (const [k, v] of perKey) if (nowMs - v.start >= limits.windowMs) perKey.delete(k);
      }
      return true;
    },
  };
}

/** Types de plantage à examiner : non traités et revus depuis `sinceMs`. */
export function countOpenCrashes(entries: readonly Pick<CrashEntry, 'resolved' | 'lastSeenAt'>[], sinceMs: number): number {
  return entries.filter((e) => !e.resolved && e.lastSeenAt >= sinceMs).length;
}
