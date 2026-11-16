/**
 * Kora Cash — audit d'intégrité du portefeuille : règles pures (aucun accès base de données, aucun délai, aucune écriture).
 * Pour un joueur, on rapproche son portefeuille, les lignes de son registre (en ajout seul, avec solde avant et après) et les fiches de
 * siège des tables Cash. Tout écart est une alerte à examiner dans katika : l'audit ne corrige jamais rien, une erreur du registre se
 * corrige par une ligne d'ajustement faite à la main.
 */

import { computeMovement } from './cashLedgerRules';
import { CashLedgerError, type CashLedgerEntry, type CashWallet } from './cashTypes';

export type AuditSeverity = 'ERROR' | 'INFO';

export const AUDIT_CODES = {
  WALLET_INVALID: { severity: 'ERROR', label: 'Solde du portefeuille invalide (négatif ou non entier)' },
  LINE_INVALID: { severity: 'ERROR', label: 'Ligne de registre incohérente avec son type ou son calcul' },
  CHAIN_BREAK: { severity: 'ERROR', label: 'Chaîne du registre rompue (le solde avant ne reprend pas le solde après précédent)' },
  WALLET_MISMATCH: { severity: 'ERROR', label: 'Portefeuille différent de la dernière ligne du registre' },
  SUM_MISMATCH: { severity: 'ERROR', label: 'Somme des mouvements différente du portefeuille' },
  TABLE_NEGATIVE: { severity: 'ERROR', label: 'Montant engagé négatif sur une table' },
  SEAT_CLOSED_ENGAGED: { severity: 'ERROR', label: 'Argent encore engagé sur un siège fermé' },
  SEAT_MISSING: { severity: 'ERROR', label: 'Argent engagé sur une table sans fiche de siège' },
  HISTORY_NOT_FROM_ZERO: { severity: 'INFO', label: 'Historique incomplet : la première ligne connue ne part pas de zéro' },
  LOCKED_WITHOUT_TABLE: { severity: 'INFO', label: 'Mouvement d\'engagé sans table dans le registre' },
} as const;

export type AuditCode = keyof typeof AUDIT_CODES;

export interface AuditFinding {
  code: AuditCode;
  severity: AuditSeverity;
  /** Court, chiffré (FCFA), sans nom : lu seulement dans katika. */
  detail: string;
}

export interface AuditSeat {
  status: string;
}

export interface PlayerAuditInput {
  uid: string;
  /** null : aucun portefeuille enregistré. */
  wallet: Pick<CashWallet, 'available' | 'locked'> | null;
  entries: readonly CashLedgerEntry[];
  /** Fiche de siège par identifiant de table, pour les tables où de l'argent est engagé ; null : fiche introuvable. */
  seats: Readonly<Record<string, AuditSeat | null>>;
}

/** Plafond de constats par joueur : au-delà, la fiche garde les premiers et un compteur. */
export const MAX_FINDINGS_PER_PLAYER = 10;

const isSafeNonNegative = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

const finding = (code: AuditCode, detail: string): AuditFinding => ({ code, severity: AUDIT_CODES[code].severity, detail });

/**
 * Remet les lignes dans l'ordre où elles ont été écrites. Même instant : on enchaîne celle dont le solde avant reprend l'état courant,
 * pour ne pas confondre deux écritures de la même milliseconde avec une rupture.
 */
export function orderLedger(entries: readonly CashLedgerEntry[]): CashLedgerEntry[] {
  const sorted = [...entries].sort((a, b) => a.createdAt - b.createdAt);
  const out: CashLedgerEntry[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j < sorted.length && sorted[j].createdAt === sorted[i].createdAt) j++;
    const group = sorted.slice(i, j);
    if (group.length === 1) {
      out.push(...group);
    } else {
      const rest = [...group];
      let state = out.length > 0 ? { a: out[out.length - 1].availableAfter, l: out[out.length - 1].lockedAfter } : null;
      while (rest.length > 0) {
        let idx = state ? rest.findIndex((e) => e.availableBefore === state!.a && e.lockedBefore === state!.l) : -1;
        // Premier de la chaîne (ou aucun candidat) : celui dont le solde avant n'est le solde après d'aucun autre du groupe.
        if (idx === -1) idx = rest.findIndex((e) => !rest.some((o) => o !== e && o.availableAfter === e.availableBefore && o.lockedAfter === e.lockedBefore));
        if (idx === -1) idx = 0;
        const [next] = rest.splice(idx, 1);
        out.push(next);
        state = { a: next.availableAfter, l: next.lockedAfter };
      }
    }
    i = j;
  }
  return out;
}

/** Argent engagé par table d'après le registre : somme des variations d'engagé des lignes qui portent l'identifiant de la table. */
export function engagedByTable(entries: readonly CashLedgerEntry[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) {
    const tableId = e.meta?.tableId;
    if (typeof tableId !== 'string' || !tableId) continue;
    out[tableId] = (out[tableId] ?? 0) + (Number(e.lockedDelta) || 0);
  }
  return out;
}

/** Tables dont il faut lire la fiche de siège : celles où le registre laisse de l'argent engagé (ou un solde faux). */
export function tablesToLookUp(entries: readonly CashLedgerEntry[]): string[] {
  return Object.entries(engagedByTable(entries))
    .filter(([, engaged]) => engaged !== 0)
    .map(([tableId]) => tableId)
    .sort();
}

export function auditPlayer(input: PlayerAuditInput): AuditFinding[] {
  const found: AuditFinding[] = [];
  const { wallet, seats } = input;

  if (wallet && (!isSafeNonNegative(wallet.available) || !isSafeNonNegative(wallet.locked))) {
    found.push(finding('WALLET_INVALID', `disponible ${String(wallet.available)}, engagé ${String(wallet.locked)}`));
  }

  const entries = orderLedger(input.entries);

  if (entries.length === 0) {
    if (wallet && (wallet.available !== 0 || wallet.locked !== 0)) {
      found.push(finding('WALLET_MISMATCH', `portefeuille ${wallet.available} / ${wallet.locked} sans aucune ligne de registre`));
    }
    return found.slice(0, MAX_FINDINGS_PER_PLAYER);
  }

  // Chaque ligne tient debout seule : son type, ses signes, son calcul avant -> après.
  for (const e of entries) {
    try {
      const after = computeMovement(
        { available: e.availableBefore, locked: e.lockedBefore },
        { kind: e.kind, availableDelta: e.availableDelta, lockedDelta: e.lockedDelta, actorUid: e.actorUid }
      );
      if (after.available !== e.availableAfter || after.locked !== e.lockedAfter) {
        found.push(finding('LINE_INVALID', `${e.ref} : soldes après ${e.availableAfter} / ${e.lockedAfter}, attendus ${after.available} / ${after.locked}`));
      }
    } catch (err) {
      const why = err instanceof CashLedgerError ? err.code : 'ERREUR';
      found.push(finding('LINE_INVALID', `${e.ref} : refusée par les règles du registre (${why})`));
    }
  }

  // La chaîne se tient : le solde avant de chaque ligne reprend le solde après de la précédente.
  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1];
    const cur = entries[i];
    if (cur.availableBefore !== prev.availableAfter || cur.lockedBefore !== prev.lockedAfter) {
      found.push(finding('CHAIN_BREAK', `${cur.ref} : part de ${cur.availableBefore} / ${cur.lockedBefore}, la ligne précédente finit à ${prev.availableAfter} / ${prev.lockedAfter}`));
    }
  }

  // Le portefeuille est la dernière ligne.
  const last = entries[entries.length - 1];
  const walletNow = wallet ?? { available: 0, locked: 0 };
  if (walletNow.available !== last.availableAfter || walletNow.locked !== last.lockedAfter) {
    found.push(finding('WALLET_MISMATCH', `portefeuille ${walletNow.available} / ${walletNow.locked}, dernière ligne ${last.availableAfter} / ${last.lockedAfter}`));
  }

  // Somme des mouvements : vérifiable seulement si l'historique part de zéro.
  const first = entries[0];
  if (first.availableBefore !== 0 || first.lockedBefore !== 0) {
    found.push(finding('HISTORY_NOT_FROM_ZERO', `la première ligne connue part de ${first.availableBefore} / ${first.lockedBefore}`));
  } else {
    const sumA = entries.reduce((s, e) => s + (Number(e.availableDelta) || 0), 0);
    const sumL = entries.reduce((s, e) => s + (Number(e.lockedDelta) || 0), 0);
    if (sumA !== walletNow.available || sumL !== walletNow.locked) {
      found.push(finding('SUM_MISMATCH', `somme des mouvements ${sumA} / ${sumL}, portefeuille ${walletNow.available} / ${walletNow.locked}`));
    }
  }

  // Engagé et sièges.
  const untaggedLocked = entries.some((e) => (Number(e.lockedDelta) || 0) !== 0 && !(typeof e.meta?.tableId === 'string' && e.meta.tableId));
  if (untaggedLocked) found.push(finding('LOCKED_WITHOUT_TABLE', 'au moins un mouvement d\'engagé ne porte pas de table'));
  for (const [tableId, engaged] of Object.entries(engagedByTable(entries))) {
    if (engaged < 0) {
      found.push(finding('TABLE_NEGATIVE', `table ${tableId} : ${engaged} FCFA engagés`));
    } else if (engaged > 0) {
      const seat = seats[tableId];
      if (seat === null || seat === undefined) found.push(finding('SEAT_MISSING', `table ${tableId} : ${engaged} FCFA engagés, aucune fiche de siège`));
      else if (seat.status !== 'OPEN') found.push(finding('SEAT_CLOSED_ENGAGED', `table ${tableId} : ${engaged} FCFA encore engagés, siège ${seat.status}`));
    }
  }

  return found.slice(0, MAX_FINDINGS_PER_PLAYER);
}

/** Constats qui déclenchent l'alerte : les erreurs. Les informations restent visibles dans katika mais n'alertent pas. */
export const hasAlertingFinding = (findings: readonly AuditFinding[]): boolean => findings.some((f) => f.severity === 'ERROR');

export interface AuditCounters {
  /** Joueurs avec au moins une erreur. */
  errors: number;
  /** Joueurs avec seulement des informations. */
  infos: number;
}

export const emptyCounters = (): AuditCounters => ({ errors: 0, infos: 0 });

export interface LedgerLineStub {
  uid: string;
  createdAt: number;
}

export interface IncrementalPlan {
  /** Joueurs à contrôler pendant ce passage (dans l'ordre d'arrivée de leurs écritures). */
  uids: string[];
  /** Nouveau repère à enregistrer. */
  nextCheckpoint: number;
  /** true : le passage s'arrête avant d'avoir tout vu (plafond de joueurs ou de lignes) ; il reprendra de lui-même. */
  partial: boolean;
}

/**
 * Prépare un passage incrémental à partir des lignes de registre écrites après le repère (triées par date croissante).
 * Le repère n'avance jamais au-delà de ce qui a été vu : un passage partiel reprend exactement où il s'est arrêté. Le chevauchement
 * (overlapMs) n'est appliqué qu'à la fin d'un passage complet, pour rattraper les écritures arrivées pendant lui, sans jamais empêcher
 * un passage partiel d'avancer.
 */
export function planIncremental(
  lines: readonly LedgerLineStub[],
  sinceMs: number,
  maxPlayers: number,
  lineLimit: number,
  nowMs: number,
  overlapMs: number
): IncrementalPlan {
  const seen = new Set<string>();
  const uids: string[] = [];
  for (const line of lines) {
    if (typeof line.uid !== 'string' || !line.uid) continue;
    if (!seen.has(line.uid)) {
      if (uids.length >= maxPlayers) {
        return { uids, nextCheckpoint: Math.max(sinceMs, line.createdAt - 1), partial: true };
      }
      seen.add(line.uid);
      uids.push(line.uid);
    }
  }
  if (lines.length >= lineLimit && lines.length > 0) {
    const last = lines[lines.length - 1].createdAt;
    return { uids, nextCheckpoint: last - 1 > sinceMs ? last - 1 : last, partial: true };
  }
  return { uids, nextCheckpoint: Math.max(sinceMs, nowMs - Math.max(0, overlapMs)), partial: false };
}
