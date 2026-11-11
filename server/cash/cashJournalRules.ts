/**
 * Kora Cash — journal global des transactions pour katika. Fonctions pures : aucun réseau, aucune écriture.
 *
 * Le registre est en ajout seul ; ici on ne fait que le lire. La période borne la requête Firestore (index automatique) ;
 * le type de mouvement et le joueur se filtrent ensuite sur les lignes lues. Le balayage s'arrête quand la page est pleine
 * ou quand le plafond de lectures du clic est atteint : un filtre rare ne peut donc pas vider le quota.
 * Ne sortent jamais : e-mail, numéro de téléphone, ni le contenu libre des métadonnées (seules quelques clés sûres passent).
 */

import { CashEnvironment, CashLedgerEntry, CashMovementKind } from './cashTypes';
import { movementAmount } from './cashHistoryRules';

export const JOURNAL_KINDS: CashMovementKind[] = [
  'DEPOSIT',
  'TABLE_BUYIN',
  'TABLE_CASHOUT',
  'TABLE_SETTLEMENT',
  'WITHDRAWAL_HOLD',
  'WITHDRAWAL_REFUND',
  'ADJUSTMENT',
];

export const JOURNAL_KIND_LABELS: Record<CashMovementKind, string> = {
  DEPOSIT: 'Dépôt',
  TABLE_BUYIN: 'Entrée à une table',
  TABLE_CASHOUT: 'Sortie de table',
  TABLE_SETTLEMENT: 'Résultat de partie',
  WITHDRAWAL_HOLD: 'Retrait demandé',
  WITHDRAWAL_REFUND: 'Retrait remboursé',
  ADJUSTMENT: 'Ajustement',
};

export type JournalPeriod = 'DAY' | 'WEEK' | 'MONTH' | 'CUSTOM';

// delay-ok: durée d'un jour civil pour calculer une période, pas un délai d'attente
const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS: Record<Exclude<JournalPeriod, 'CUSTOM'>, number> = { DAY: 1, WEEK: 7, MONTH: 30 };
/** Douala n'a pas d'heure d'été : toujours UTC+1. */
// delay-ok: décalage horaire fixe de Douala (UTC+1), pas un délai d'attente
const DOUALA_OFFSET_MS = 60 * 60 * 1000;

export interface JournalQuery {
  environment: CashEnvironment;
  from: number;
  to: number;
  kinds: CashMovementKind[] | null;
  /** Texte saisi : nom Google ou identifiant. Résolu en identifiants par le serveur. */
  player: string | null;
  /** Reprise après la dernière ligne vue. */
  cursor: { createdAt: number; ref: string } | null;
}

export type JournalQueryResult = { ok: true; query: JournalQuery } | { ok: false; error: string };

function first(raw: unknown): string {
  if (Array.isArray(raw)) return first(raw[0]);
  return typeof raw === 'string' ? raw.trim() : '';
}

export function parseJournalCursor(raw: string): { createdAt: number; ref: string } | null {
  const sep = raw.indexOf(':');
  if (sep <= 0) return null;
  const createdAt = Number(raw.slice(0, sep));
  const ref = raw.slice(sep + 1);
  if (!Number.isSafeInteger(createdAt) || createdAt < 0) return null;
  if (!/^[A-Za-z0-9_.:-]{8,128}$/.test(ref)) return null;
  return { createdAt, ref };
}

export function formatJournalCursor(entry: Pick<CashLedgerEntry, 'createdAt' | 'ref'>): string {
  return `${entry.createdAt}:${entry.ref}`;
}

/** Lit les paramètres de la requête. Tout ce qui est inconnu est refusé : on ne devine pas. */
export function parseJournalQuery(params: Record<string, unknown>, nowMs: number, defaultEnvironment: CashEnvironment): JournalQueryResult {
  const envRaw = first(params.env).toUpperCase();
  if (envRaw && envRaw !== 'DEMO' && envRaw !== 'LIVE') return { ok: false, error: 'Environnement inconnu.' };
  const environment: CashEnvironment = envRaw === 'LIVE' ? 'LIVE' : envRaw === 'DEMO' ? 'DEMO' : defaultEnvironment;

  const periodRaw = (first(params.period).toUpperCase() || 'WEEK') as JournalPeriod;
  let from: number;
  let to: number;
  if (periodRaw === 'CUSTOM') {
    from = Number(first(params.from));
    to = Number(first(params.to));
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from) {
      return { ok: false, error: 'Dates invalides.' };
    }
  } else if (periodRaw in PERIOD_DAYS) {
    to = nowMs;
    from = nowMs - PERIOD_DAYS[periodRaw as Exclude<JournalPeriod, 'CUSTOM'>] * DAY_MS;
  } else {
    return { ok: false, error: 'Période inconnue.' };
  }

  const kindText = first(params.kind);
  let kinds: CashMovementKind[] | null = null;
  if (kindText) {
    const requested = kindText.split(',').map((k) => k.trim().toUpperCase()).filter(Boolean);
    if (requested.some((k) => !JOURNAL_KINDS.includes(k as CashMovementKind))) {
      return { ok: false, error: 'Type de mouvement inconnu.' };
    }
    kinds = requested as CashMovementKind[];
  }

  const player = first(params.player).slice(0, 80) || null;

  const cursorText = first(params.cursor);
  let cursor: JournalQuery['cursor'] = null;
  if (cursorText) {
    cursor = parseJournalCursor(cursorText);
    if (!cursor) return { ok: false, error: 'Reprise invalide.' };
  }

  return { ok: true, query: { environment, from, to, kinds, player, cursor } };
}

function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 40);
}

/** Nom affiché : nom Google si connu, sinon « Joueur #xxxx » (jamais l'e-mail). */
export function journalPlayerName(uid: string, rawName: unknown): string {
  const name = cleanName(rawName);
  if (name) return name;
  const suffix = uid.replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase();
  return `Joueur #${suffix || '????'}`;
}

/** Identifiants correspondant au texte saisi : identifiant exact, ou nom contenant le texte (sans tenir compte de la casse). */
export function resolvePlayerFilter(text: string, names: Map<string, string>, maxMatches: number = 20): Set<string> {
  const wanted = text.trim().toLowerCase();
  const out = new Set<string>();
  if (!wanted) return out;
  for (const uid of names.keys()) {
    if (uid.toLowerCase() === wanted) {
      out.add(uid);
      return out;
    }
  }
  for (const [uid, name] of names) {
    if (name.toLowerCase().includes(wanted)) {
      out.add(uid);
      if (out.size >= maxMatches) break;
    }
  }
  // Un identifiant saisi en entier mais absent du dossier des joueurs reste cherchable.
  if (out.size === 0 && /^[A-Za-z0-9_-]{20,128}$/.test(text.trim())) out.add(text.trim());
  return out;
}

export function matchesJournalFilters(entry: CashLedgerEntry, kinds: CashMovementKind[] | null, uids: Set<string> | null): boolean {
  if (kinds && !kinds.includes(entry.kind)) return false;
  if (uids && !uids.has(entry.uid)) return false;
  return true;
}

export interface JournalLine {
  ref: string;
  uid: string;
  name: string;
  kind: CashMovementKind;
  label: string;
  /** Effet sur l'argent du joueur, en FCFA (positif : il gagne). */
  amount: number;
  availableBefore: number;
  availableAfter: number;
  lockedBefore: number;
  lockedAfter: number;
  createdAt: number;
  tableId?: string;
  roomCode?: string;
  /** Acteur d'un ajustement (identifiant), jamais son e-mail. */
  actor?: string;
  note?: string;
}

function metaText(entry: CashLedgerEntry, key: string): string | undefined {
  const value = entry.meta?.[key];
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(value) ? value : undefined;
}

export function toJournalLine(entry: CashLedgerEntry, name: string): JournalLine {
  const tableId = metaText(entry, 'tableId');
  const roomCode = metaText(entry, 'roomCode');
  return {
    ref: entry.ref,
    uid: entry.uid,
    name,
    kind: entry.kind,
    label: JOURNAL_KIND_LABELS[entry.kind] ?? entry.kind,
    amount: movementAmount(entry),
    availableBefore: entry.availableBefore,
    availableAfter: entry.availableAfter,
    lockedBefore: entry.lockedBefore,
    lockedAfter: entry.lockedAfter,
    createdAt: entry.createdAt,
    ...(tableId ? { tableId } : {}),
    ...(roomCode ? { roomCode } : {}),
    ...(entry.actorUid ? { actor: entry.actorUid } : {}),
    ...(entry.note ? { note: entry.note.slice(0, 300) } : {}),
  };
}

export interface JournalScanOptions {
  /** Lignes voulues dans la page. */
  pageSize: number;
  /** Lectures Firestore permises pour ce balayage. */
  maxReads: number;
  kinds: CashMovementKind[] | null;
  uids: Set<string> | null;
}

export interface JournalScanResult {
  entries: CashLedgerEntry[];
  /** Reprise pour la page suivante ; null quand le registre est épuisé sur la période. */
  nextCursor: string | null;
  /** Lectures réellement faites. */
  scanned: number;
  /** Vrai si le balayage s'est arrêté sur le plafond de lectures sans remplir la page. */
  capped: boolean;
}

/** Lit un lot de lignes de la période, plus récentes d'abord, après le curseur. Fournie par le magasin (ou un faux, en test). */
export type JournalBatchReader = (cursor: { createdAt: number; ref: string } | null, limit: number) => Promise<CashLedgerEntry[]>;

/**
 * Balaie le registre par lots jusqu'à remplir la page ou atteindre le plafond de lectures.
 * Chaque ligne lue compte, qu'elle passe le filtre ou non : c'est ce que Firestore facture.
 */
export async function scanJournal(
  read: JournalBatchReader,
  startCursor: { createdAt: number; ref: string } | null,
  options: JournalScanOptions
): Promise<JournalScanResult> {
  const pageSize = Math.max(1, Math.floor(options.pageSize));
  const maxReads = Math.max(1, Math.floor(options.maxReads));
  const found: CashLedgerEntry[] = [];
  let cursor = startCursor;
  let scanned = 0;
  let lastRead: CashLedgerEntry | null = null;
  let exhausted = false;

  while (found.length < pageSize && scanned < maxReads) {
    const limit = Math.min(maxReads - scanned, Math.max(pageSize * 2, 50), 250);
    const batch = await read(cursor, limit);
    scanned += batch.length;
    for (const entry of batch) {
      lastRead = entry;
      if (matchesJournalFilters(entry, options.kinds, options.uids)) {
        found.push(entry);
        if (found.length >= pageSize) break;
      }
    }
    const tail = batch[batch.length - 1];
    // Page pleine avant la fin du lot : la suite du lot reste à lire, la reprise se fait juste après la dernière ligne gardée.
    if (found.length >= pageSize && lastRead !== tail) break;
    if (batch.length < limit) {
      exhausted = true;
      break;
    }
    if (found.length >= pageSize) break;
    cursor = { createdAt: tail.createdAt, ref: tail.ref };
  }

  const pageFull = found.length >= pageSize;
  // Reprise juste après la dernière ligne examinée : rien n'est lu deux fois, rien n'est sauté.
  const nextCursor = !exhausted && lastRead ? formatJournalCursor(lastRead) : null;
  return {
    entries: found,
    nextCursor,
    scanned,
    capped: !pageFull && !exhausted,
  };
}

// ---------- Export CSV ----------

const CSV_SEPARATOR = ';';
const CSV_BOM = String.fromCharCode(0xfeff);

/** Date et heure de Douala, lisibles dans Excel : AAAA-MM-JJ HH:MM:SS. */
export function formatDoualaDateTime(ms: number): string {
  return new Date(ms + DOUALA_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ');
}

/** Une cellule : guillemets si besoin, et une apostrophe devant tout texte que le tableur prendrait pour une formule. */
export function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text) && typeof value === 'string') text = `'${text}`;
  if (/[";\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export const JOURNAL_CSV_HEADER = [
  'Date (Douala)',
  'Joueur',
  'Identifiant joueur',
  'Type',
  'Montant (FCFA)',
  'Disponible avant',
  'Disponible après',
  'En table avant',
  'En table après',
  'Table',
  'Acteur',
  'Note',
  'Référence',
];

export function buildJournalCsv(lines: JournalLine[]): string {
  const rows = lines.map((l) =>
    [
      formatDoualaDateTime(l.createdAt),
      l.name,
      l.uid,
      l.label,
      l.amount,
      l.availableBefore,
      l.availableAfter,
      l.lockedBefore,
      l.lockedAfter,
      l.roomCode ?? l.tableId ?? '',
      l.actor ?? '',
      l.note ?? '',
      l.ref,
    ]
      .map(csvCell)
      .join(CSV_SEPARATOR)
  );
  return CSV_BOM + [JOURNAL_CSV_HEADER.map(csvCell).join(CSV_SEPARATOR), ...rows].join('\r\n') + '\r\n';
}
