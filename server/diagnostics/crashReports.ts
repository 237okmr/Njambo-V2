/**
 * Réception des plantages : service sans accès direct au réseau ni à la base (tout passe par `deps`).
 * Répond toujours vite et sans détail : le navigateur d'un joueur qui plante n'a rien à faire du résultat.
 */

import { CrashLimits, createCrashLimiter, crashSignature, sanitizeCrashReport } from './crashReportRules';
import type { CrashStore } from './crashReportStore';

export interface CrashReportDeps {
  store: CrashStore;
  limits: () => CrashLimits;
  now: () => number;
  /** Appelé quand une signature apparaît pour la première fois. */
  onNewSignature?: (summary: string) => void;
}

export type CrashReportOutcome = 'STORED' | 'IGNORED' | 'LIMITED' | 'FAILED';

export function createCrashReportService(deps: CrashReportDeps) {
  const limiter = createCrashLimiter();
  return {
    async receive(input: { body: unknown; userAgent: unknown; clientKey: string }): Promise<CrashReportOutcome> {
      const sanitized = sanitizeCrashReport(input.body, input.userAgent);
      if (sanitized.ok === false) return 'IGNORED';
      const now = deps.now();
      if (!limiter.allow(input.clientKey || 'inconnu', now, deps.limits())) return 'LIMITED';
      try {
        const signature = crashSignature(sanitized.report);
        const { isNew } = await deps.store.record(signature, sanitized.report, now);
        if (isNew) {
          const r = sanitized.report;
          deps.onNewSignature?.(`${r.device} ${r.os} ${r.osVersion} · ${r.browser} : ${r.message.slice(0, 120)}`);
        }
        return 'STORED';
      } catch {
        return 'FAILED';
      }
    },
  };
}
