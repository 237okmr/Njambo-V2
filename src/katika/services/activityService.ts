import { getPublicParamNumber } from '../../services/publicConfig';
import { tikaFetch } from './tikaFetch';

/**
 * Activité réelle du jeu pour katika : parties, manches, joueurs (qui a lancé / terminé) et présence
 * (« app ouverte »). Les données viennent exclusivement du serveur :
 *  - njambo_partie_journal : un document par partie (lecture réservée à l'admin),
 *  - njambo_game_records : une fiche par manche (seules les fiches au format actuel, écrites par le serveur ou recopiées par la migration, sont comptées),
 *  - server_metrics/active_AAAA-MM-JJ : joueurs ayant ouvert l'application ce jour-là (lecture réservée à l'admin).
 * Aucune valeur de secours inventée : une lecture impossible est signalée dans loadErrors, jamais remplacée par un chiffre.
 */
export type ActivityRange = 'TODAY' | '24H' | '7D' | 'ALL';

/** Même plafond que la lecture serveur (server/katika/activityData.ts) : au plafond, les chiffres sont signalés partiels. */
const MAX_JOURNAL_DOCS = 3000;
const SERVER_SCHEMA_VERSION = 2;
const KORA_WIN_TYPES = ['KORA', 'DOUBLE_KORA'];

type AnyDoc = Record<string, any>;
type Mode = 'solo' | 'multi';

export interface ModeCounts {
  solo: number;
  multi: number;
  total: number;
}

export interface ActivityPlayerRow {
  id: string;
  name: string;
  kind: 'google' | 'guest';
  soloLaunched: number;
  soloFinished: number;
  multiLaunched: number;
  multiFinished: number;
  wins: number;
  koras: number;
  lastPlayedAt: number;
  openDays: number;
  lastSeenAt: number;
  openedApp: boolean;
  openedVisible: boolean;
}

export interface ActivitySummary {
  rangeStart: number;
  generatedAt: number;
  partiesFinished: ModeCounts;
  partiesAbandoned: ModeCounts;
  partiesInProgress: ModeCounts;
  manchesStarted: ModeCounts;
  manchesFinished: ModeCounts;
  manchesAbandoned: ModeCounts;
  playersLaunched: ModeCounts;
  playersFinished: ModeCounts;
  openPlayers: { total: number; visible: number; google: number; guest: number };
  players: ActivityPlayerRow[];
  truncated: boolean;
  loadErrors: string[];
  /** D'où viennent les chiffres : heure de la lecture, copie gardée par le serveur, ancien résultat (quota atteint). Absent d'un calcul pur. */
  dataInfo?: ActivityDataInfo;
}

export interface ActivityDataInfo {
  range: ActivityRange;
  fetchedAt: number;
  fromCache: boolean;
  stale: boolean;
  staleMessage: string;
}

export interface ActivityInput {
  journal: AnyDoc[];
  fiches: AnyDoc[];
  presenceDays: AnyDoc[];
  cutoffMs: number;
  nowMs: number;
  abandonAfterMs: number;
}

function emptyCounts(): ModeCounts {
  return { solo: 0, multi: 0, total: 0 };
}

function bump(counts: ModeCounts, mode: Mode): void {
  counts[mode] += 1;
  counts.total += 1;
}

function docMode(doc: AnyDoc): Mode {
  return doc.mode === 'MULTIPLAYER' ? 'multi' : 'solo';
}

/** Une partie ou une manche « en cours » sans activité depuis trop longtemps est comptée abandonnée. */
function effectiveStatus(doc: AnyDoc, nowMs: number, abandonAfterMs: number): 'completed' | 'abandoned' | 'in_progress' {
  if (doc.status === 'completed') return 'completed';
  if (doc.status === 'abandoned') return 'abandoned';
  const last = Number(doc.updatedAt) || Number(doc.createdAt) || 0;
  return last > 0 && nowMs - last > abandonAfterMs ? 'abandoned' : 'in_progress';
}

export function getActivityCutoff(range: ActivityRange, nowMs: number = Date.now()): number {
  if (range === 'ALL') return 0;
  if (range === 'TODAY') {
    const d = new Date(nowMs);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  const windowMs = range === '24H'
    ? 24 * 60 * 60 * 1000 // delay-ok: période d'affichage choisie dans katika (24 heures), pas un délai d'attente
    : 7 * 24 * 60 * 60 * 1000; // delay-ok: période d'affichage choisie dans katika (7 jours), pas un délai d'attente
  return nowMs - windowMs;
}

/** Calcul pur (sans accès réseau) : testable et sans valeur de secours inventée. */
export function computeActivitySummary(input: ActivityInput): ActivitySummary {
  const { journal, fiches, presenceDays, cutoffMs, nowMs, abandonAfterMs } = input;

  const partiesFinished = emptyCounts();
  const partiesAbandoned = emptyCounts();
  const partiesInProgress = emptyCounts();
  const manchesStarted = emptyCounts();
  const manchesFinished = emptyCounts();
  const manchesAbandoned = emptyCounts();
  const rows = new Map<string, ActivityPlayerRow>();

  const rowFor = (id: string, name: string, kind: 'google' | 'guest'): ActivityPlayerRow => {
    let row = rows.get(id);
    if (!row) {
      row = {
        id,
        name,
        kind,
        soloLaunched: 0,
        soloFinished: 0,
        multiLaunched: 0,
        multiFinished: 0,
        wins: 0,
        koras: 0,
        lastPlayedAt: 0,
        openDays: 0,
        lastSeenAt: 0,
        openedApp: false,
        openedVisible: false,
      };
      rows.set(id, row);
    }
    return row;
  };

  journal.forEach((doc) => {
    const created = Number(doc.createdAt) || 0;
    if (cutoffMs > 0 && created < cutoffMs) return;
    const mode = docMode(doc);
    const status = effectiveStatus(doc, nowMs, abandonAfterMs);
    if (status === 'completed') bump(partiesFinished, mode);
    else if (status === 'abandoned') bump(partiesAbandoned, mode);
    else bump(partiesInProgress, mode);

    const when = Number(doc.endedAt) || Number(doc.updatedAt) || created;
    (Array.isArray(doc.players) ? doc.players : []).forEach((p: AnyDoc) => {
      if (!p || typeof p.id !== 'string') return;
      const kind: 'google' | 'guest' = p.kind === 'guest' ? 'guest' : 'google';
      const row = rowFor(p.id, typeof p.name === 'string' && p.name ? p.name : p.id, kind);
      if (when >= row.lastPlayedAt) {
        row.lastPlayedAt = when;
        if (typeof p.name === 'string' && p.name) row.name = p.name;
      }
      const finished = mode === 'multi'
        ? status === 'completed' && p.outcome === 'played'
        : status === 'completed';
      if (mode === 'solo') {
        row.soloLaunched += 1;
        if (finished) row.soloFinished += 1;
      } else {
        row.multiLaunched += 1;
        if (finished) row.multiFinished += 1;
      }
      const won = mode === 'multi' ? p.isWinner === true : doc.winnerIsHuman === true;
      if (finished && won) {
        row.wins += 1;
        if (KORA_WIN_TYPES.includes(doc.winType)) row.koras += 1;
      }
    });
  });

  fiches.forEach((doc) => {
    if (doc.schemaVersion !== SERVER_SCHEMA_VERSION || (doc.source !== 'server' && doc.source !== 'migration')) return;
    const created = Number(doc.createdAt) || 0;
    if (cutoffMs > 0 && created < cutoffMs) return;
    const mode = docMode(doc);
    bump(manchesStarted, mode);
    const status = effectiveStatus(doc, nowMs, abandonAfterMs);
    if (status === 'completed') bump(manchesFinished, mode);
    else if (status === 'abandoned') bump(manchesAbandoned, mode);
  });

  // Présence : un joueur compte s'il a ouvert l'application dans la période (dernier signal après le début).
  presenceDays.forEach((day) => {
    (Array.isArray(day.players) ? day.players : []).forEach((p: AnyDoc) => {
      if (!p || typeof p.id !== 'string') return;
      const lastSeen = Number(p.lastSeen) || 0;
      if (cutoffMs > 0 && lastSeen < cutoffMs) return;
      const kind: 'google' | 'guest' = p.kind === 'guest' ? 'guest' : 'google';
      const row = rowFor(p.id, typeof p.name === 'string' && p.name ? p.name : p.id, kind);
      row.openedApp = true;
      row.openDays += 1;
      row.lastSeenAt = Math.max(row.lastSeenAt, lastSeen);
      if ((Number(p.visibleSignals) || 0) > 0) row.openedVisible = true;
    });
  });

  const playersLaunched = emptyCounts();
  const playersFinished = emptyCounts();
  const openPlayers = { total: 0, visible: 0, google: 0, guest: 0 };
  rows.forEach((row) => {
    if (row.soloLaunched > 0) bump(playersLaunched, 'solo');
    if (row.multiLaunched > 0) bump(playersLaunched, 'multi');
    if (row.soloFinished > 0) bump(playersFinished, 'solo');
    if (row.multiFinished > 0) bump(playersFinished, 'multi');
    if (row.openedApp) {
      openPlayers.total += 1;
      if (row.openedVisible) openPlayers.visible += 1;
      if (row.kind === 'guest') openPlayers.guest += 1;
      else openPlayers.google += 1;
    }
  });
  // Les compteurs « joueurs » comptent chaque joueur une seule fois : total = joueurs distincts, tous modes confondus.
  playersLaunched.total = Array.from(rows.values()).filter((r) => r.soloLaunched + r.multiLaunched > 0).length;
  playersFinished.total = Array.from(rows.values()).filter((r) => r.soloFinished + r.multiFinished > 0).length;

  const players = Array.from(rows.values()).sort(
    (a, b) => Math.max(b.lastPlayedAt, b.lastSeenAt) - Math.max(a.lastPlayedAt, a.lastSeenAt)
  );

  return {
    rangeStart: cutoffMs,
    generatedAt: nowMs,
    partiesFinished,
    partiesAbandoned,
    partiesInProgress,
    manchesStarted,
    manchesFinished,
    manchesAbandoned,
    playersLaunched,
    playersFinished,
    openPlayers,
    players,
    truncated: journal.length >= MAX_JOURNAL_DOCS,
    loadErrors: [],
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Libellés des trois sources : l'écran reconnaît une source indisponible à ces débuts de message. */
const SOURCE_LABELS = ['journal des parties', 'fiches de manche', 'présence quotidienne'];

/**
 * Demande les données brutes au serveur (route /api/katika/activity-data, lecture gardée en mémoire côté serveur),
 * puis calcule le résumé. Si la lecture échoue, les trois sources sont signalées indisponibles avec le message du serveur.
 */
export async function fetchActivitySummary(range: ActivityRange): Promise<ActivitySummary> {
  const nowMs = Date.now();
  const cutoffMs = getActivityCutoff(range, nowMs);
  const abandonAfterMs = getPublicParamNumber('recordInactivityAbandonMinutes') * 60 * 1000;

  const failure = (message: string): ActivitySummary => {
    const summary = computeActivitySummary({ journal: [], fiches: [], presenceDays: [], cutoffMs, nowMs, abandonAfterMs });
    summary.loadErrors = SOURCE_LABELS.map((label) => `${label} : ${message}`);
    return summary;
  };

  try {
    const res = await tikaFetch(`/api/katika/activity-data?range=${range}`);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.success !== true) {
      return failure(String(data?.error || `lecture impossible (code ${res.status})`));
    }
    const summary = computeActivitySummary({
      journal: Array.isArray(data.journal) ? (data.journal as AnyDoc[]) : [],
      fiches: Array.isArray(data.fiches) ? (data.fiches as AnyDoc[]) : [],
      presenceDays: Array.isArray(data.presenceDays) ? (data.presenceDays as AnyDoc[]) : [],
      cutoffMs,
      nowMs,
      abandonAfterMs,
    });
    summary.dataInfo = {
      range,
      fetchedAt: Number(data.fetchedAt) || nowMs,
      fromCache: data.fromCache === true,
      stale: data.stale === true,
      staleMessage: typeof data.staleMessage === 'string' ? data.staleMessage : '',
    };
    return summary;
  } catch (err) {
    return failure(errorMessage(err));
  }
}
