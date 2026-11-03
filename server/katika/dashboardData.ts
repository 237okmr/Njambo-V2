import { getFirebaseAdminAppDb } from '../firebaseAdmin';
import { getEngineConfig } from '../engine/engineConfig';
import { PARAM_BY_KEY } from '../engine/engineParams';
import { isQuotaError, katikaReadsBlocked, QUOTA_MESSAGE, READ_LIMIT_MESSAGE } from './activityData';
import type { ActivityFailureCode } from './activityData';
import { recordServerReads } from './readBudget';

/**
 * Données brutes des indicateurs de base du tableau de bord katika : le dossier des joueurs (users) et les dernières fiches de manche.
 * Elles étaient relues à chaque actualisation depuis le navigateur ; le serveur les lit maintenant une seule fois puis les garde en mémoire
 * (durée réglable dans katika : katikaDashboardCacheSeconds). Si Firestore refuse la lecture (quota atteint, panne), on renvoie le dernier
 * résultat connu marqué comme ancien, ou une erreur claire ; l'écran garde alors son repli habituel.
 */

type AnyDoc = Record<string, any>;

export type DashboardPart = 'users' | 'records';

/** Même plafond que la lecture précédente des fiches de manche (1 000 plus récentes). */
export const DASHBOARD_MAX_RECORDS = 1000;

export function toDashboardPart(raw: unknown): DashboardPart | null {
  return raw === 'users' || raw === 'records' ? raw : null;
}

/** Convertit les dates Firestore en millisecondes et rend le document sérialisable en JSON. */
export function toPlainJson(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  const v = value as { toMillis?: unknown };
  if (typeof v.toMillis === 'function') return (v.toMillis as () => number)();
  if (Array.isArray(value)) return value.map(toPlainJson);
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] = toPlainJson(inner);
  }
  return out;
}

export interface DashboardDataDeps {
  now: () => number;
  /** Durée de conservation en millisecondes ; 0 = aucun cache. */
  cacheMs: () => number;
  readPart: (part: DashboardPart) => Promise<AnyDoc[]>;
  /** Vrai si le pare-feu retient les grosses lectures : on garde alors le dernier résultat connu. */
  readsBlocked?: () => boolean;
}

export interface DashboardDataSuccess {
  ok: true;
  docs: AnyDoc[];
  fetchedAt: number;
  fromCache: boolean;
  stale: boolean;
  staleMessage: string;
}

export interface DashboardDataFailure {
  ok: false;
  code: ActivityFailureCode;
  message: string;
}

export type DashboardDataResult = DashboardDataSuccess | DashboardDataFailure;

export function isDashboardFailure(result: DashboardDataResult): result is DashboardDataFailure {
  return result.ok === false;
}

export function createDashboardDataService(deps: DashboardDataDeps) {
  const cache = new Map<DashboardPart, { docs: AnyDoc[]; fetchedAt: number }>();
  const inFlight = new Map<DashboardPart, Promise<DashboardDataResult>>();

  async function load(part: DashboardPart): Promise<DashboardDataResult> {
    const nowMs = deps.now();
    const cached = cache.get(part);
    const ttl = deps.cacheMs();
    if (cached && ttl > 0 && nowMs - cached.fetchedAt < ttl) {
      return { ok: true, docs: cached.docs, fetchedAt: cached.fetchedAt, fromCache: true, stale: false, staleMessage: '' };
    }
    if (deps.readsBlocked?.()) {
      if (cached) {
        return { ok: true, docs: cached.docs, fetchedAt: cached.fetchedAt, fromCache: true, stale: true, staleMessage: READ_LIMIT_MESSAGE };
      }
      return { ok: false, code: 'READ_LIMIT', message: READ_LIMIT_MESSAGE };
    }
    try {
      const docs = await deps.readPart(part);
      cache.set(part, { docs, fetchedAt: nowMs });
      return { ok: true, docs, fetchedAt: nowMs, fromCache: false, stale: false, staleMessage: '' };
    } catch (err) {
      const quota = isQuotaError(err);
      const reason = quota ? QUOTA_MESSAGE : `Lecture impossible : ${err instanceof Error ? err.message : String(err)}`;
      console.warn('[KatikaDashboard] Lecture impossible.', quota ? 'quota Firestore atteint' : err instanceof Error ? err.message : String(err));
      if (cached) {
        return { ok: true, docs: cached.docs, fetchedAt: cached.fetchedAt, fromCache: true, stale: true, staleMessage: reason };
      }
      return { ok: false, code: quota ? 'QUOTA' : 'READ_FAILED', message: reason };
    }
  }

  return {
    /** Une seule lecture à la fois par ensemble de données : deux demandes simultanées partagent le même résultat. */
    get(part: DashboardPart): Promise<DashboardDataResult> {
      const running = inFlight.get(part);
      if (running) return running;
      const started = load(part).finally(() => {
        inFlight.delete(part);
      });
      inFlight.set(part, started);
      return started;
    },
    clear(): void {
      cache.clear();
    },
  };
}

async function readPartFromFirestore(part: DashboardPart): Promise<AnyDoc[]> {
  const db = getFirebaseAdminAppDb();
  const snap =
    part === 'users'
      ? await db.collection('users').get()
      : await db.collection('njambo_game_records').orderBy('createdAt', 'desc').limit(DASHBOARD_MAX_RECORDS).get();
  recordServerReads(snap.size);
  return snap.docs.map((d) => ({ id: d.id, ...(toPlainJson(d.data()) as AnyDoc) }));
}

function cacheMsFromRegistry(): number {
  const cfg = getEngineConfig() as unknown as Record<string, unknown>;
  const configured = Number(cfg.katikaDashboardCacheSeconds);
  const seconds = Number.isFinite(configured) && configured >= 0 ? configured : Number(PARAM_BY_KEY.katikaDashboardCacheSeconds.default);
  return Math.round(seconds * 1000);
}

export const katikaDashboardData = createDashboardDataService({
  now: () => Date.now(),
  cacheMs: cacheMsFromRegistry,
  readPart: readPartFromFirestore,
  readsBlocked: katikaReadsBlocked,
});

function warnAtFromRegistry(): number {
  const cfg = getEngineConfig() as unknown as Record<string, unknown>;
  const configured = Number(cfg.katikaReadWarnCount);
  return Number.isFinite(configured) && configured > 0 ? configured : Number(PARAM_BY_KEY.katikaReadWarnCount.default);
}

/** Seuil d'alerte du compteur de lectures, lu dans le registre (réglable dans katika). */
export const readWarnThreshold = warnAtFromRegistry;
