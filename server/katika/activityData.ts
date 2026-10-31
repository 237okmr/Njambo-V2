import { FieldPath } from 'firebase-admin/firestore';
import { getFirebaseAdminAppDb } from '../firebaseAdmin';
import { getEngineConfig } from '../engine/engineConfig';
import { PARAM_BY_KEY } from '../engine/engineParams';
import { getDoualaDateKey } from '../../src/services/masteryConfig';
import { recordServerReads } from './readBudget';

/**
 * Données brutes de l'activité du jeu pour le tableau de bord katika (journal des parties, fiches de manche, présence quotidienne).
 * La lecture massive se fait ici, côté serveur, une seule fois par période puis elle est gardée en mémoire :
 * dix actualisations du tableau de bord ne coûtent qu'une lecture, ce qui protège le quota gratuit de lectures Firestore.
 * La durée de conservation est lue dans le registre unique (katikaActivityCacheSeconds, réglable dans katika), jamais écrite en dur ici.
 * Si Firestore refuse la lecture (quota atteint, panne), on renvoie le dernier résultat connu, marqué comme ancien, ou une erreur claire.
 */

type AnyDoc = Record<string, any>;

export type ActivityBucket = '24H' | '7D' | 'ALL';

/** Mêmes plafonds que src/katika/services/activityService.ts (qui signale « partiel » au plafond). */
export const ACTIVITY_MAX_JOURNAL_DOCS = 3000;
export const ACTIVITY_MAX_FICHE_DOCS = 1000;
export const ACTIVITY_MAX_PRESENCE_DOCS = 400;

export interface ActivityRawData {
  journal: AnyDoc[];
  fiches: AnyDoc[];
  presenceDays: AnyDoc[];
}

export interface ActivityReadWindow {
  /** Début de la période en millisecondes (0 = depuis toujours). */
  cutoffMs: number;
  /** Première et dernière clé de jour (AAAA-MM-JJ, heure de Douala) pour la présence quotidienne. */
  startKey: string;
  endKey: string;
}

export interface ActivityDataDeps {
  now: () => number;
  /** Durée de conservation en millisecondes ; 0 = aucun cache. */
  cacheMs: () => number;
  /** Lecture réelle des trois sources. */
  readAll: (window: ActivityReadWindow) => Promise<ActivityRawData>;
}

export type ActivityFailureCode = 'QUOTA' | 'READ_FAILED';

export interface ActivityDataSuccess {
  ok: true;
  data: ActivityRawData;
  fetchedAt: number;
  fromCache: boolean;
  stale: boolean;
  staleMessage: string;
}

export interface ActivityDataFailure {
  ok: false;
  code: ActivityFailureCode;
  message: string;
}

export type ActivityDataResult = ActivityDataSuccess | ActivityDataFailure;

/** Garde de type (le projet n'est pas en mode strict : le simple test de `ok` ne suffit pas à TypeScript pour distinguer les deux cas). */
export function isActivityFailure(result: ActivityDataResult): result is ActivityDataFailure {
  return result.ok === false;
}

export const QUOTA_MESSAGE =
  "Le quota gratuit de lectures Firestore du jour est atteint. Il se renouvelle chaque nuit (minuit, heure du Pacifique : 8 h ou 9 h à Yaoundé selon la saison).";

/** Reconnaît le refus de quota de Firestore (code gRPC 8 « RESOURCE_EXHAUSTED » ou message « Quota exceeded »). */
export function isQuotaError(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  if (!e) return false;
  if (e.code === 8 || e.code === 'resource-exhausted') return true;
  const message = typeof e.message === 'string' ? e.message : '';
  return /quota exceeded|RESOURCE_EXHAUSTED/i.test(message);
}

/** Période demandée par le tableau de bord -> lot de données lu. « Aujourd'hui » et « 24 heures » partagent la même lecture (le détail est filtré par l'écran). */
export function toActivityBucket(range: unknown): ActivityBucket | null {
  if (range === 'TODAY' || range === '24H') return '24H';
  if (range === '7D') return '7D';
  if (range === 'ALL') return 'ALL';
  return null;
}

const HOURS_IN_DAY = 24;
const MS_PER_HOUR = 3_600_000; // delay-ok: conversion d'unité pour une période d'affichage, pas un délai d'attente

export function activityWindowFor(bucket: ActivityBucket, nowMs: number): ActivityReadWindow {
  const days = bucket === '24H' ? 1 : bucket === '7D' ? 7 : 0;
  const cutoffMs = days > 0 ? nowMs - days * HOURS_IN_DAY * MS_PER_HOUR : 0;
  return {
    cutoffMs,
    startKey: cutoffMs > 0 ? getDoualaDateKey(cutoffMs) : '0000-00-00',
    endKey: getDoualaDateKey(nowMs),
  };
}

interface CacheEntry {
  data: ActivityRawData;
  fetchedAt: number;
}

export function createActivityDataService(deps: ActivityDataDeps) {
  const cache = new Map<ActivityBucket, CacheEntry>();
  const inFlight = new Map<ActivityBucket, Promise<ActivityDataResult>>();

  async function load(bucket: ActivityBucket): Promise<ActivityDataResult> {
    const nowMs = deps.now();
    const cached = cache.get(bucket);
    const ttl = deps.cacheMs();
    if (cached && ttl > 0 && nowMs - cached.fetchedAt < ttl) {
      return { ok: true, data: cached.data, fetchedAt: cached.fetchedAt, fromCache: true, stale: false, staleMessage: '' };
    }
    try {
      const data = await deps.readAll(activityWindowFor(bucket, nowMs));
      cache.set(bucket, { data, fetchedAt: nowMs });
      return { ok: true, data, fetchedAt: nowMs, fromCache: false, stale: false, staleMessage: '' };
    } catch (err) {
      const quota = isQuotaError(err);
      const reason = quota ? QUOTA_MESSAGE : `Lecture impossible : ${err instanceof Error ? err.message : String(err)}`;
      console.warn('[KatikaActivity] Lecture de l\'activité impossible.', quota ? 'quota Firestore atteint' : err);
      if (cached) {
        return { ok: true, data: cached.data, fetchedAt: cached.fetchedAt, fromCache: true, stale: true, staleMessage: reason };
      }
      return { ok: false, code: quota ? 'QUOTA' : 'READ_FAILED', message: reason };
    }
  }

  return {
    /** Une seule lecture à la fois par période : deux demandes simultanées partagent le même résultat. */
    get(bucket: ActivityBucket): Promise<ActivityDataResult> {
      const running = inFlight.get(bucket);
      if (running) return running;
      const started = load(bucket).finally(() => {
        inFlight.delete(bucket);
      });
      inFlight.set(bucket, started);
      return started;
    },
    clear(): void {
      cache.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// Lecture réelle (SDK admin : ignore les règles Firestore, donc ne dépend pas de leur déploiement)
// ---------------------------------------------------------------------------

async function readAllFromFirestore(window: ActivityReadWindow): Promise<ActivityRawData> {
  const db = getFirebaseAdminAppDb();

  const timed = (name: string, max: number) => {
    const base = db.collection(name);
    return window.cutoffMs > 0 ? base.where('createdAt', '>=', window.cutoffMs).orderBy('createdAt', 'desc').limit(max) : base.orderBy('createdAt', 'desc').limit(max);
  };

  const [journalSnap, ficheSnap, presenceSnap] = await Promise.all([
    timed('njambo_partie_journal', ACTIVITY_MAX_JOURNAL_DOCS).get(),
    timed('njambo_game_records', ACTIVITY_MAX_FICHE_DOCS).get(),
    db
      .collection('server_metrics')
      .where(FieldPath.documentId(), '>=', `active_${window.startKey}`)
      .where(FieldPath.documentId(), '<=', `active_${window.endKey}`)
      .limit(ACTIVITY_MAX_PRESENCE_DOCS)
      .get(),
  ]);

  recordServerReads(journalSnap.size + ficheSnap.size + presenceSnap.size);
  return {
    journal: journalSnap.docs.map((d) => d.data() as AnyDoc),
    fiches: ficheSnap.docs.map((d) => d.data() as AnyDoc),
    presenceDays: presenceSnap.docs.map((d) => d.data() as AnyDoc),
  };
}

function cacheMsFromRegistry(): number {
  const cfg = getEngineConfig() as unknown as Record<string, unknown>;
  const configured = Number(cfg.katikaActivityCacheSeconds);
  const seconds = Number.isFinite(configured) && configured >= 0 ? configured : Number(PARAM_BY_KEY.katikaActivityCacheSeconds.default);
  return Math.round(seconds * 1000);
}

export const katikaActivityData = createActivityDataService({
  now: () => Date.now(),
  cacheMs: cacheMsFromRegistry,
  readAll: readAllFromFirestore,
});
