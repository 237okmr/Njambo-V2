/**
 * Mesure des lectures Firestore faites directement par les téléphones des joueurs (le serveur ne les voit pas passer).
 * Chaque téléphone compte ses lectures en mémoire, par type de document, et les déclare en une fois quand l'application passe
 * en arrière-plan ou se ferme. Le serveur les additionne par jour de quota (heure du Pacifique, comme la jauge du serveur).
 * C'est un repère de diagnostic en mémoire (il repart de zéro au redémarrage du serveur), pas la facture officielle :
 * la console Firebase, rubrique Utilisation, reste la référence. Aucun délai, aucune écriture en base.
 */

import { quotaDayKey } from './readBudget';

/** Bornes de sécurité d'un rapport venant d'un téléphone (route publique : on ne fait confiance à rien). */
export const CLIENT_REPORT_MAX_LABELS = 40;
export const CLIENT_REPORT_MAX_PER_LABEL = 5000;
/** Nombre maximal de types de lecture distincts suivis par jour ; le reste est regroupé sous « autres ». */
export const CLIENT_DAILY_MAX_LABELS = 80;
export const CLIENT_OTHER_LABEL = 'autres';

const LABEL_PATTERN = /^[a-z0-9_*:./-]{1,60}$/i;

/** Valide un rapport brut { étiquette: nombre } et renvoie les paires acceptées. Tout ce qui est douteux est ignoré. */
export function sanitizeReportedReads(input: unknown): Array<[string, number]> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return [];
  const out: Array<[string, number]> = [];
  for (const [label, raw] of Object.entries(input as Record<string, unknown>)) {
    if (out.length >= CLIENT_REPORT_MAX_LABELS) break;
    if (!LABEL_PATTERN.test(label)) continue;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    const n = Math.floor(raw);
    if (n < 1) continue;
    out.push([label.toLowerCase(), Math.min(n, CLIENT_REPORT_MAX_PER_LABEL)]);
  }
  return out;
}

export interface ClientReadsSnapshot {
  day: string;
  total: number;
  /** Nombre de rapports reçus aujourd'hui (un par passage en arrière-plan d'un téléphone). */
  reports: number;
  labels: Array<{ label: string; reads: number }>;
  /** Début du comptage, en millisecondes. */
  countingSince: number;
}

export function createClientReadMeter(now: () => number = () => Date.now()) {
  let day = quotaDayKey(now());
  let byLabel = new Map<string, number>();
  let reports = 0;
  let countingSince = now();

  function rollIfNeeded(): void {
    const today = quotaDayKey(now());
    if (today !== day) {
      day = today;
      byLabel = new Map();
      reports = 0;
      countingSince = now();
    }
  }

  return {
    /** Ajoute un rapport brut. Renvoie le nombre de lectures retenues. */
    record(rawReport: unknown): number {
      rollIfNeeded();
      const pairs = sanitizeReportedReads(rawReport);
      if (pairs.length === 0) return 0;
      let kept = 0;
      for (const [label, n] of pairs) {
        const known = byLabel.has(label);
        const key = known || byLabel.size < CLIENT_DAILY_MAX_LABELS ? label : CLIENT_OTHER_LABEL;
        byLabel.set(key, (byLabel.get(key) ?? 0) + n);
        kept += n;
      }
      reports += 1;
      return kept;
    },
    snapshot(): ClientReadsSnapshot {
      rollIfNeeded();
      const labels = Array.from(byLabel.entries())
        .map(([label, reads]) => ({ label, reads }))
        .sort((a, b) => b.reads - a.reads);
      return { day, total: labels.reduce((s, l) => s + l.reads, 0), reports, labels, countingSince };
    },
  };
}

const meter = createClientReadMeter();

export function recordClientReads(rawReport: unknown): number {
  return meter.record(rawReport);
}

export function getClientReads(): ClientReadsSnapshot {
  return meter.snapshot();
}
