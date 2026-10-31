/**
 * Compteur des lectures Firestore faites par le serveur pour katika (activité, indicateurs du tableau de bord).
 * Le quota gratuit de Firestore (50 000 lectures par jour pour tout le projet) se renouvelle à minuit, heure du Pacifique :
 * le compteur change donc de jour à cette heure-là. Il vit en mémoire : il repart de zéro au redémarrage du serveur
 * et ne compte pas les lectures faites directement par les téléphones des joueurs. C'est un repère, pas la facture officielle
 * (la console Firebase, rubrique Utilisation, reste la référence).
 */

/** Plafond quotidien de lectures du palier gratuit de Firestore (donnée du fournisseur, pas un délai). */
export const FIRESTORE_FREE_DAILY_READS = 50000;

const QUOTA_TIME_ZONE = 'America/Los_Angeles';

/** Jour (AAAA-MM-JJ) au sens du quota Firestore, c'est-à-dire en heure du Pacifique. */
export function quotaDayKey(nowMs: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: QUOTA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(nowMs));
}

export interface ReadBudgetSnapshot {
  day: string;
  reads: number;
  freeLimit: number;
  /** Seuil d'alerte réglé dans katika. */
  warnAt: number;
  warning: boolean;
  /** Vrai si le serveur a démarré pendant ce jour de quota : les lectures faites avant son démarrage ne sont pas comptées. */
  partialDay: boolean;
  /** Début du comptage, en millisecondes. */
  countingSince: number;
}

export function createReadBudget(now: () => number = () => Date.now()) {
  let day = quotaDayKey(now());
  let reads = 0;
  let countingSince = now();

  function rollIfNeeded(): void {
    const today = quotaDayKey(now());
    if (today !== day) {
      day = today;
      reads = 0;
      countingSince = now();
    }
  }

  return {
    /** Ajoute des lectures (nombre de documents renvoyés ; une requête vide compte pour 1). */
    record(count: number): void {
      rollIfNeeded();
      const n = Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 1;
      reads += n;
    },
    snapshot(warnAt: number, startedAtMs: number): ReadBudgetSnapshot {
      rollIfNeeded();
      return {
        day,
        reads,
        freeLimit: FIRESTORE_FREE_DAILY_READS,
        warnAt,
        warning: reads >= warnAt,
        partialDay: quotaDayKey(startedAtMs) === day,
        countingSince,
      };
    },
  };
}

const processStartedAt = Date.now();
const budget = createReadBudget();

/** Enregistre les lectures faites par le serveur pour katika. */
export function recordServerReads(count: number): void {
  budget.record(count);
}

export function getReadBudget(warnAt: number): ReadBudgetSnapshot {
  return budget.snapshot(warnAt, processStartedAt);
}
