import { getFirebaseAdminAppDb } from '../firebaseAdmin';
import { getEngineConfig } from '../engine/engineConfig';
import { PARAM_BY_KEY } from '../engine/engineParams';
import { katikaReadsBlocked } from './activityData';
import { quotaDayKey, recordServerReads } from './readBudget';

/**
 * Journal d'audit durable de katika. La mémoire du serveur reste la lecture rapide ; les décisions des admins et les alertes sont
 * aussi écrites dans Firestore (collection fermée, serveur seul). Les événements automatiques ont un plafond quotidien réglable
 * pour ménager le quota d'écritures ; les actions des admins n'en ont pas. L'historique n'est relu qu'à la première demande,
 * jamais au démarrage du serveur, car l'hébergeur peut redémarrer souvent.
 */

export type AuditLogType = 'SERVER_ERROR' | 'ANOMALY' | 'KATIKA_ACTION' | 'AUTH' | 'CONFIG_CHANGE';
export type AuditLogSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  type: AuditLogType;
  severity: AuditLogSeverity;
  actor: string;
  summary: string;
  details?: Record<string, unknown>;
}

const AUDIT_COLLECTION = 'katika_audit_logs';
const AUTOMATIC_ACTORS = new Set(['Katika Engine', 'Fair-Play Engine', 'Auth Manager']);
const LOG_TYPES: AuditLogType[] = ['SERVER_ERROR', 'ANOMALY', 'KATIKA_ACTION', 'AUTH', 'CONFIG_CHANGE'];
const LOG_SEVERITIES: AuditLogSeverity[] = ['INFO', 'WARNING', 'CRITICAL'];
const MAX_SUMMARY_LENGTH = 500;
const MAX_DETAILS_LENGTH = 4000;
const MAX_MERGED_LOGS = 500;

export function isAutomaticAudit(log: Pick<AuditLogEntry, 'actor'>): boolean {
  return AUTOMATIC_ACTORS.has(log.actor);
}

/** Les événements automatiques ordinaires restent en mémoire : ils coûteraient trop d'écritures pour peu d'intérêt. */
export function shouldPersistAudit(log: Pick<AuditLogEntry, 'actor' | 'severity' | 'type'>): boolean {
  if (log.severity !== 'INFO' || log.type === 'CONFIG_CHANGE') return true;
  return !isAutomaticAudit(log);
}

/** Rend une entrée enregistrable : Firestore refuse les valeurs undefined, et les détails trop longs sont coupés. */
export function toStorableAudit(log: AuditLogEntry): AuditLogEntry {
  const stored: AuditLogEntry = {
    id: String(log.id),
    timestamp: Number(log.timestamp) || 0,
    type: log.type,
    severity: log.severity,
    actor: String(log.actor || '').slice(0, 200),
    summary: String(log.summary || '').slice(0, MAX_SUMMARY_LENGTH),
  };
  if (log.details !== undefined) {
    let json = '';
    try {
      json = JSON.stringify(log.details) ?? '';
    } catch {
      json = '';
    }
    if (json && json.length <= MAX_DETAILS_LENGTH) stored.details = JSON.parse(json);
    else if (json) stored.details = { tronque: json.slice(0, MAX_DETAILS_LENGTH) };
  }
  return stored;
}

/**
 * Entrée envoyée par l'écran de katika : seul le contenu vient du navigateur. L'auteur et l'heure sont fixés par le serveur,
 * qui les tire du compte connecté : personne ne peut signer une action au nom d'un autre.
 */
export function buildClientAudit(raw: unknown, actor: string, nowMs: number): AuditLogEntry | null {
  const log = raw as Partial<AuditLogEntry> | null;
  if (!log || typeof log !== 'object' || typeof log.summary !== 'string' || !log.summary.trim()) return null;
  const id = typeof log.id === 'string' && /^[\w-]{1,64}$/.test(log.id) ? log.id : `adm_${nowMs.toString(36)}`;
  return toStorableAudit({
    id,
    timestamp: nowMs,
    type: LOG_TYPES.includes(log.type as AuditLogType) ? (log.type as AuditLogType) : 'KATIKA_ACTION',
    severity: LOG_SEVERITIES.includes(log.severity as AuditLogSeverity) ? (log.severity as AuditLogSeverity) : 'INFO',
    actor,
    summary: log.summary,
    details: log.details && typeof log.details === 'object' ? (log.details as Record<string, unknown>) : undefined,
  });
}

/** Mémoire et historique réunis, sans doublon, du plus récent au plus ancien. */
export function mergeAuditLogs<T extends { id: string; timestamp: number }>(memory: T[], history: T[]): T[] {
  const byId = new Map<string, T>();
  for (const log of [...history, ...memory]) byId.set(log.id, log);
  return [...byId.values()].sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_MERGED_LOGS);
}

export interface AuditStoreDeps {
  now: () => number;
  maxAutomaticPerDay: () => number;
  loadCount: () => number;
  readsBlocked: () => boolean;
  write: (docId: string, log: AuditLogEntry) => Promise<void>;
  readRecent: (count: number) => Promise<AuditLogEntry[]>;
}

export interface AuditHistoryResult {
  logs: AuditLogEntry[];
  /** Vrai si l'historique durable a bien été relu. */
  loaded: boolean;
  message: string;
}

export function createAuditStore(deps: AuditStoreDeps) {
  let day = quotaDayKey(deps.now());
  let automaticWrites = 0;
  let dropped = 0;
  let failedWrites = 0;
  let sequence = 0;
  let history: AuditLogEntry[] | null = null;
  let loading: Promise<void> | null = null;
  let lastError = '';

  function rollDay(): void {
    const today = quotaDayKey(deps.now());
    if (today !== day) {
      day = today;
      automaticWrites = 0;
      dropped = 0;
    }
  }

  function readHistory(): Promise<void> {
    if (!loading) {
      loading = deps
        .readRecent(deps.loadCount())
        .then((logs) => {
          history = logs;
          lastError = '';
        })
        .catch((err) => {
          lastError = err instanceof Error ? err.message : String(err);
          console.warn('[KatikaAudit] Relecture de l\'historique impossible.', lastError);
        })
        .finally(() => {
          loading = null;
        });
    }
    return loading;
  }

  return {
    /** Enregistre sans jamais faire échouer l'action en cours. */
    persist(log: AuditLogEntry): void {
      if (!shouldPersistAudit(log)) return;
      rollDay();
      if (isAutomaticAudit(log)) {
        if (automaticWrites >= deps.maxAutomaticPerDay()) {
          dropped += 1;
          return;
        }
        automaticWrites += 1;
      }
      const stored = toStorableAudit(log);
      sequence += 1;
      // Identifiant unique côté serveur : une entrée déjà écrite ne peut pas être remplacée.
      const docId = `${stored.timestamp}_${sequence}_${stored.id}`.slice(0, 200);
      deps.write(docId, stored).catch((err) => {
        failedWrites += 1;
        console.warn('[KatikaAudit] Écriture impossible.', err instanceof Error ? err.message : String(err));
      });
    },

    /** Historique durable, relu une seule fois par démarrage du serveur. */
    async getHistory(): Promise<AuditHistoryResult> {
      rollDay();
      if (history === null && !deps.readsBlocked()) await readHistory();
      const notes: string[] = [];
      if (history === null) {
        notes.push(
          deps.readsBlocked()
            ? "Historique non relu : le pare-feu de lectures est actif. Seuls les événements depuis le dernier démarrage du serveur sont affichés."
            : `Historique illisible (${lastError || 'erreur inconnue'}). Seuls les événements depuis le dernier démarrage du serveur sont affichés.`
        );
      }
      if (dropped > 0) notes.push(`${dropped} événement(s) automatique(s) non conservé(s) aujourd'hui : plafond quotidien atteint.`);
      if (failedWrites > 0) notes.push(`${failedWrites} écriture(s) du journal ont échoué depuis le dernier démarrage du serveur.`);
      return { logs: history ?? [], loaded: history !== null, message: notes.join(' ') };
    },
  };
}

function numberParam(key: string): number {
  const cfg = getEngineConfig() as unknown as Record<string, unknown>;
  const configured = Number(cfg[key]);
  return Number.isFinite(configured) && configured > 0 ? configured : Number(PARAM_BY_KEY[key].default);
}

export const katikaAuditStore = createAuditStore({
  now: () => Date.now(),
  maxAutomaticPerDay: () => numberParam('katikaAuditMaxAutomaticPerDay'),
  loadCount: () => numberParam('katikaAuditLoadCount'),
  readsBlocked: katikaReadsBlocked,
  write: async (docId, log) => {
    await getFirebaseAdminAppDb().collection(AUDIT_COLLECTION).doc(docId).set(log);
  },
  readRecent: async (count) => {
    const snap = await getFirebaseAdminAppDb().collection(AUDIT_COLLECTION).orderBy('timestamp', 'desc').limit(count).get();
    recordServerReads(snap.size);
    return snap.docs.map((d) => d.data() as AuditLogEntry);
  },
});
