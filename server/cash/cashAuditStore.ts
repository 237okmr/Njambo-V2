/**
 * Kora Cash — audit d'intégrité des portefeuilles : accès base de données et boucle serveur.
 *
 * Lecture seule sur les portefeuilles, le registre et les fiches de siège : ce fichier n'écrit que dans ses propres collections,
 * fermées à tous les clients (cash_audit_findings, cash_audit_state). Il ne corrige rien et ne bloque aucun retrait.
 *  - Passage incrémental : seuls les joueurs dont le registre a bougé depuis le repère sont revus.
 *  - Passage complet (à la demande, depuis katika) : tous les portefeuilles, par pages, avec reprise automatique.
 *  - Plafond de joueurs par passage : un passage trop gros s'arrête et reprend au suivant (le repère n'avance que sur ce qui a été vu).
 *  - Verrou en base : un seul serveur audite à la fois ; le verrou expire seul si un passage plante.
 *  - Une fiche par joueur en écart (et par environnement) ; elle disparaît quand le joueur est revu sans écart.
 * Tous les délais viennent du registre de réglages (katika).
 */

import { randomUUID } from 'node:crypto';
import { FieldPath } from 'firebase-admin/firestore';
import { getFirebaseAdminAppDb } from '../firebaseAdmin';
import { getEngineConfig } from '../engine/engineConfig';
import { recordServerReads } from '../katika/readBudget';
import { CASH_TABLE_SEATS_COLLECTION } from './cashTableStore';
import { seatDocId } from './cashTableRules';
import { CashEnvironment, CashLedgerEntry, CashWallet, ledgerCollectionFor, walletCollectionFor } from './cashTypes';
import {
  AuditCounters,
  AuditFinding,
  AuditSeat,
  auditPlayer,
  emptyCounters,
  hasAlertingFinding,
  planIncremental,
  tablesToLookUp,
} from './cashAuditRules';

export const CASH_AUDIT_FINDINGS_COLLECTION = 'cash_audit_findings';
export const CASH_AUDIT_STATE_COLLECTION = 'cash_audit_state';
const STATE_DOC = 'state';
const ENVIRONMENTS: CashEnvironment[] = ['DEMO', 'LIVE'];

export type AuditMode = 'incremental' | 'full';

export interface AuditFindingDoc {
  environment: CashEnvironment;
  uid: string;
  findings: AuditFinding[];
  maxSeverity: 'ERROR' | 'INFO';
  firstSeenAt: number;
  lastSeenAt: number;
}

export interface AuditRunSummary {
  at: number;
  mode: AuditMode;
  players: number;
  reads: number;
  partial: boolean;
  durationMs: number;
  error?: string;
}

export interface AuditState {
  lease?: { owner: string; until: number };
  /** Repère de l'incrémental, par environnement (date de registre en ms). */
  checkpoint?: Partial<Record<CashEnvironment, number>>;
  /** Passage complet en cours : dernier identifiant de portefeuille vu, par environnement ('' : début, null : terminé). */
  full?: { active: boolean; startedAt: number; cursors: Partial<Record<CashEnvironment, string | null>> };
  lastRun?: AuditRunSummary;
  lastFullCompletedAt?: number;
  counts?: Partial<Record<CashEnvironment, AuditCounters>>;
}

const cfg = () => getEngineConfig();
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

export const auditEnabled = (): boolean => cfg().cashAuditEnabled !== false;
const maxPlayers = () => Math.max(1, Math.floor(num(cfg().cashAuditMaxPlayersPerRun, 500)));
const overlapMs = () => Math.max(0, num(cfg().cashAuditOverlapSeconds, 300)) * 1000; // delay-ok: conversion d'un réglage katika
const leaseMs = () => Math.max(60, num(cfg().cashAuditLeaseSeconds, 600)) * 1000; // delay-ok: conversion d'un réglage katika

const stateRef = () => getFirebaseAdminAppDb().collection(CASH_AUDIT_STATE_COLLECTION).doc(STATE_DOC);
const findingId = (environment: CashEnvironment, uid: string) => `${environment}_${uid}`;

export async function readAuditState(): Promise<AuditState> {
  const snap = await stateRef().get();
  recordServerReads(1);
  return snap.exists ? (snap.data() as AuditState) : {};
}

async function patchState(patch: Record<string, unknown>): Promise<void> {
  await stateRef().set(patch, { merge: true });
}

/** Prend le verrou si personne ne le tient (ou s'il a expiré). */
async function acquireLease(owner: string, nowMs: number): Promise<boolean> {
  const db = getFirebaseAdminAppDb();
  const ref = stateRef();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    recordServerReads(1);
    const lease = (snap.exists ? (snap.data() as AuditState).lease : undefined) ?? undefined;
    if (lease && lease.until > nowMs && lease.owner !== owner) return false;
    tx.set(ref, { lease: { owner, until: nowMs + leaseMs() } }, { merge: true });
    return true;
  });
}

async function releaseLease(owner: string): Promise<void> {
  const db = getFirebaseAdminAppDb();
  const ref = stateRef();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    recordServerReads(1);
    const lease = snap.exists ? (snap.data() as AuditState).lease : undefined;
    if (lease && lease.owner === owner) tx.set(ref, { lease: { owner, until: 0 } }, { merge: true });
  });
}

/** Lit le portefeuille, le registre complet du joueur et les fiches de siège utiles, puis applique les règles. Lecture seule. */
async function auditOnePlayer(uid: string, environment: CashEnvironment): Promise<{ findings: AuditFinding[]; reads: number }> {
  const db = getFirebaseAdminAppDb();
  const [walletSnap, ledgerSnap] = await Promise.all([
    db.collection(walletCollectionFor(environment)).doc(uid).get(),
    db.collection(ledgerCollectionFor(environment)).where('uid', '==', uid).get(),
  ]);
  let reads = 1 + ledgerSnap.size;
  const entries = ledgerSnap.docs.map((d) => d.data() as CashLedgerEntry);
  const seats: Record<string, AuditSeat | null> = {};
  const tables = tablesToLookUp(entries);
  if (tables.length > 0) {
    const refs = tables.map((tableId) => db.collection(CASH_TABLE_SEATS_COLLECTION).doc(seatDocId(tableId, uid)));
    const snaps = await db.getAll(...refs);
    reads += snaps.length;
    snaps.forEach((s, i) => {
      seats[tables[i]] = s.exists ? { status: String((s.data() as { status?: string }).status ?? '') } : null;
    });
  }
  recordServerReads(reads);
  const wallet = walletSnap.exists ? (walletSnap.data() as Partial<CashWallet>) : null;
  const findings = auditPlayer({
    uid,
    wallet: wallet ? { available: wallet.available as number, locked: wallet.locked as number } : null,
    entries,
    seats,
  });
  return { findings, reads };
}

/** Met à jour les fiches des joueurs revus : crée ou rafraîchit celles en écart, supprime celles d'un joueur redevenu sain. */
async function storeResults(environment: CashEnvironment, results: Map<string, AuditFinding[]>, nowMs: number): Promise<number> {
  if (results.size === 0) return 0;
  const db = getFirebaseAdminAppDb();
  const uids = [...results.keys()];
  const refs = uids.map((uid) => db.collection(CASH_AUDIT_FINDINGS_COLLECTION).doc(findingId(environment, uid)));
  const existing = await db.getAll(...refs);
  recordServerReads(existing.length);
  let batch = db.batch();
  let inBatch = 0;
  const flush = async () => {
    if (inBatch > 0) await batch.commit();
    batch = db.batch();
    inBatch = 0;
  };
  for (let i = 0; i < uids.length; i++) {
    const findings = results.get(uids[i]) ?? [];
    const before = existing[i];
    if (findings.length === 0) {
      if (before.exists) {
        batch.delete(refs[i]);
        inBatch++;
      }
    } else {
      const prev = before.exists ? (before.data() as Partial<AuditFindingDoc>) : undefined;
      const doc: AuditFindingDoc = {
        environment,
        uid: uids[i],
        findings,
        maxSeverity: hasAlertingFinding(findings) ? 'ERROR' : 'INFO',
        firstSeenAt: prev?.firstSeenAt ?? nowMs,
        lastSeenAt: nowMs,
      };
      batch.set(refs[i], doc);
      inBatch++;
    }
    if (inBatch >= 400) await flush();
  }
  await flush();
  return existing.length;
}

async function recountFindings(environment: CashEnvironment): Promise<AuditCounters> {
  const col = getFirebaseAdminAppDb().collection(CASH_AUDIT_FINDINGS_COLLECTION);
  const [errors, infos] = await Promise.all([
    col.where('environment', '==', environment).where('maxSeverity', '==', 'ERROR').count().get(),
    col.where('environment', '==', environment).where('maxSeverity', '==', 'INFO').count().get(),
  ]);
  recordServerReads(2);
  return { errors: errors.data().count, infos: infos.data().count };
}

interface PassResult {
  players: number;
  reads: number;
  partial: boolean;
  /** Incrémental : nouveau repère. */
  checkpoint?: number;
  /** Complet : dernier identifiant vu, null quand l'environnement est terminé. */
  cursor?: string | null;
}

async function incrementalPass(environment: CashEnvironment, budget: number, state: AuditState, nowMs: number): Promise<PassResult> {
  const since = state.checkpoint?.[environment] ?? 0;
  const lineLimit = budget * 5;
  const snap = await getFirebaseAdminAppDb()
    .collection(ledgerCollectionFor(environment))
    .where('createdAt', '>', since)
    .orderBy('createdAt')
    .limit(lineLimit)
    .select('uid', 'createdAt')
    .get();
  recordServerReads(snap.size);
  const lines = snap.docs.map((d) => d.data() as { uid: string; createdAt: number });
  const plan = planIncremental(lines, since, budget, lineLimit, nowMs, overlapMs());
  const results = new Map<string, AuditFinding[]>();
  let reads = snap.size;
  for (const uid of plan.uids) {
    const r = await auditOnePlayer(uid, environment);
    results.set(uid, r.findings);
    reads += r.reads;
  }
  reads += await storeResults(environment, results, nowMs);
  return { players: plan.uids.length, reads, partial: plan.partial, checkpoint: plan.nextCheckpoint };
}

async function fullPass(environment: CashEnvironment, budget: number, state: AuditState, nowMs: number): Promise<PassResult> {
  const cursor = state.full?.cursors?.[environment];
  if (cursor === null) return { players: 0, reads: 0, partial: false, cursor: null };
  let q = getFirebaseAdminAppDb().collection(walletCollectionFor(environment)).orderBy(FieldPath.documentId()).limit(budget).select();
  if (cursor) q = q.startAfter(cursor);
  const snap = await q.get();
  recordServerReads(snap.size);
  const results = new Map<string, AuditFinding[]>();
  let reads = snap.size;
  for (const d of snap.docs) {
    const r = await auditOnePlayer(d.id, environment);
    results.set(d.id, r.findings);
    reads += r.reads;
  }
  reads += await storeResults(environment, results, nowMs);
  const done = snap.size < budget;
  return { players: snap.size, reads, partial: !done, cursor: done ? null : snap.docs[snap.docs.length - 1].id };
}

export interface AuditRunOutcome {
  ran: boolean;
  /** Raison quand le passage n'a pas eu lieu. */
  skipped?: 'disabled' | 'locked';
  summary?: AuditRunSummary;
}

/**
 * Un passage d'audit. mode 'full' : (re)démarre un contrôle complet s'il n'y en a pas en cours, puis avance d'une page.
 * mode 'incremental' : avance le contrôle complet en cours s'il y en a un, sinon revoit les joueurs dont le registre a bougé.
 * Ne lève jamais : l'erreur est consignée dans l'état et le passage suivant réessaie.
 */
export async function runCashAudit(mode: AuditMode, nowMs: number = Date.now()): Promise<AuditRunOutcome> {
  if (!auditEnabled()) return { ran: false, skipped: 'disabled' };
  const owner = randomUUID();
  const startedAt = Date.now();
  try {
    if (!(await acquireLease(owner, nowMs))) return { ran: false, skipped: 'locked' };
  } catch (err) {
    console.warn('[CashAudit] Verrou impossible :', err instanceof Error ? err.message : String(err));
    return { ran: false, skipped: 'locked' };
  }
  let summary: AuditRunSummary;
  try {
    let state = await readAuditState();
    const patch: Record<string, unknown> = {};
    if (mode === 'full' && !state.full?.active) {
      state = { ...state, full: { active: true, startedAt: nowMs, cursors: { DEMO: '', LIVE: '' } } };
    }
    const isFull = Boolean(state.full?.active);
    const checkpoint: Partial<Record<CashEnvironment, number>> = { ...(state.checkpoint ?? {}) };
    const cursors: Partial<Record<CashEnvironment, string | null>> = { ...(state.full?.cursors ?? {}) };
    let budget = maxPlayers();
    let players = 0;
    let reads = 0;
    let partial = false;
    for (const environment of ENVIRONMENTS) {
      if (budget <= 0) {
        partial = true;
        break;
      }
      const r = isFull ? await fullPass(environment, budget, state, nowMs) : await incrementalPass(environment, budget, state, nowMs);
      players += r.players;
      reads += r.reads;
      budget -= r.players;
      if (r.partial) partial = true;
      if (r.checkpoint !== undefined) checkpoint[environment] = r.checkpoint;
      if (r.cursor !== undefined) cursors[environment] = r.cursor;
    }
    if (isFull) {
      const finished = cursors.DEMO === null && cursors.LIVE === null;
      patch.full = { active: !finished, startedAt: state.full?.startedAt ?? nowMs, cursors };
      if (finished) {
        patch.lastFullCompletedAt = nowMs;
        // Le contrôle complet vient de tout revoir : l'incrémental repart d'ici.
        for (const environment of ENVIRONMENTS) checkpoint[environment] = Math.max(checkpoint[environment] ?? 0, nowMs - overlapMs());
      }
    }
    patch.checkpoint = checkpoint;
    const counts: Partial<Record<CashEnvironment, AuditCounters>> = {};
    for (const environment of ENVIRONMENTS) counts[environment] = await recountFindings(environment).catch(() => state.counts?.[environment] ?? emptyCounters());
    summary = { at: nowMs, mode: isFull ? 'full' : 'incremental', players, reads, partial, durationMs: Date.now() - startedAt };
    patch.counts = counts;
    patch.lastRun = summary;
    await patchState(patch);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[CashAudit] Passage interrompu (il sera repris) :', message);
    summary = { at: nowMs, mode, players: 0, reads: 0, partial: true, durationMs: Date.now() - startedAt, error: message.slice(0, 200) };
    await patchState({ lastRun: summary }).catch(() => undefined);
  } finally {
    await releaseLease(owner).catch(() => undefined);
  }
  return { ran: true, summary };
}

/** Fiches en écart pour katika, les plus récentes d'abord. Lecture seule. */
export async function listAuditFindings(limit: number, environment?: CashEnvironment): Promise<AuditFindingDoc[]> {
  const col = getFirebaseAdminAppDb().collection(CASH_AUDIT_FINDINGS_COLLECTION);
  const base = environment ? col.where('environment', '==', environment) : col;
  const snap = await base.orderBy('lastSeenAt', 'desc').limit(Math.max(1, Math.min(200, limit))).get();
  recordServerReads(snap.size);
  return snap.docs.map((d) => d.data() as AuditFindingDoc);
}

let loopTimer: ReturnType<typeof setTimeout> | null = null;
let loopStarted = false;
let loopStopped = false;

const resumeSeconds = () => Math.max(5, num(cfg().cashAuditResumeSeconds, 30));
const intervalSeconds = () => Math.max(5, num(cfg().cashAuditIntervalMinutes, 1440) * 60);

function schedule(delaySeconds: number): void {
  if (loopStopped) return;
  if (loopTimer) clearTimeout(loopTimer);
  loopTimer = setTimeout(async () => {
    loopTimer = null;
    let next = intervalSeconds();
    try {
      const out = await runCashAudit('incremental');
      if (out.ran && out.summary?.partial && !out.summary.error) next = resumeSeconds();
    } catch (err) {
      console.warn('[CashAudit] Boucle :', err instanceof Error ? err.message : String(err));
    }
    schedule(next);
  }, delaySeconds * 1000);
  loopTimer.unref?.();
}

/** À appeler une fois au démarrage du vrai serveur (jamais pendant les tests). Premier passage après le délai de reprise. */
export function startCashAuditLoop(): void {
  if (loopStarted || loopStopped) return;
  loopStarted = true;
  schedule(resumeSeconds());
}

/** Contrôle complet demandé depuis katika : un premier passage tout de suite, la suite par la boucle à la cadence de reprise. */
export async function requestFullCashAudit(): Promise<AuditRunOutcome> {
  const out = await runCashAudit('full');
  if (loopStarted && out.ran && out.summary?.partial && !out.summary.error) schedule(resumeSeconds());
  return out;
}

export function stopCashAuditLoop(): void {
  loopStopped = true;
  if (loopTimer) clearTimeout(loopTimer);
  loopTimer = null;
}
