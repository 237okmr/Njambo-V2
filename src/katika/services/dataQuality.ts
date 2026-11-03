/**
 * Fiabilité des chiffres de katika : un 0 lu en base n'est pas la même chose qu'une lecture ratée.
 * Sans dépendance : utilisé par le tableau de bord, le rapport investisseur et le résumé du copilote.
 */

export type DataSourceStatus = 'ok' | 'stale' | 'unavailable';

export interface DataSourceInfo {
  status: DataSourceStatus;
  /** Date de lecture des données, en millisecondes. */
  fetchedAt?: number;
  message?: string;
}

export interface RecordsSourceInfo extends DataSourceInfo {
  /** Vrai si le plafond de lecture des fiches de manche est atteint : les plus anciennes ne sont pas lues. */
  capped?: boolean;
  /** Plafond de lecture appliqué. */
  maxDocs?: number;
  /** Date de la fiche la plus ancienne lue, en millisecondes. */
  oldestAt?: number;
}

export interface KatikaDataQuality {
  range: string;
  /** Début de la période demandée en millisecondes ; 0 = depuis toujours. */
  rangeStartMs: number;
  live: DataSourceInfo;
  users: DataSourceInfo;
  records: RecordsSourceInfo;
  totals: DataSourceInfo;
}

export type DataQualityLevel = 'OK' | 'PARTIAL' | 'UNAVAILABLE';

export interface DataQualitySummary {
  level: DataQualityLevel;
  notices: string[];
  /** Date de lecture la plus ancienne parmi les sources, en millisecondes. */
  oldestFetchedAt?: number;
}

const formatTime = (ms: number): string =>
  new Date(ms).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Africa/Douala' });

/** Vrai si les fiches lues ne couvrent pas toute la période demandée. */
export function isRangeTruncated(records: RecordsSourceInfo, rangeStartMs: number): boolean {
  if (!records.capped) return false;
  if (rangeStartMs <= 0) return true;
  return records.oldestAt === undefined || records.oldestAt > rangeStartMs;
}

function staleNotice(label: string, source: DataSourceInfo): string {
  const when = source.fetchedAt ? ` (relevé du ${formatTime(source.fetchedAt)})` : '';
  const reason = source.message ? ` ${source.message}` : '';
  return `${label} : derniers chiffres connus${when}.${reason}`;
}

function unavailableNotice(label: string, source: DataSourceInfo): string {
  const reason = source.message ? ` ${source.message}` : '';
  return `${label} : lecture impossible, les valeurs affichées ne sont pas de vrais zéros.${reason}`;
}

export function summarizeDataQuality(quality: KatikaDataQuality | null | undefined): DataQualitySummary {
  if (!quality) {
    return { level: 'UNAVAILABLE', notices: ['Chiffres indisponibles : la lecture a échoué, les valeurs affichées ne sont pas de vrais zéros.'] };
  }

  const notices: string[] = [];
  const sources: Array<[string, DataSourceInfo]> = [
    ['Historique des manches', quality.records],
    ['Compteurs globaux des manches', quality.totals],
    ['Dossier des joueurs', quality.users],
    ['Joueurs et tables en direct', quality.live],
  ];

  for (const [label, source] of sources) {
    if (source.status === 'unavailable') notices.push(unavailableNotice(label, source));
    else if (source.status === 'stale') notices.push(staleNotice(label, source));
  }

  const truncated = isRangeTruncated(quality.records, quality.rangeStartMs);
  if (truncated) {
    const oldest = quality.records.oldestAt ? `, jusqu'au ${formatTime(quality.records.oldestAt)}` : '';
    notices.push(
      `Calcul partiel : seules les ${(quality.records.maxDocs ?? 0).toLocaleString('fr-FR')} manches les plus récentes sont lues${oldest}. Taux, Koras, rétention et joueurs actifs ne couvrent pas toute la période.`
    );
  }

  const fetchedDates = sources.map(([, s]) => s.fetchedAt).filter((d): d is number => typeof d === 'number');
  const oldestFetchedAt = fetchedDates.length > 0 ? Math.min(...fetchedDates) : undefined;

  if (quality.records.status === 'unavailable') return { level: 'UNAVAILABLE', notices, oldestFetchedAt };
  return { level: notices.length > 0 ? 'PARTIAL' : 'OK', notices, oldestFetchedAt };
}
