import { getFirebaseAdminAppDb } from '../firebaseAdmin';
import { getEngineConfig } from '../engine/engineConfig';
import { PARAM_BY_KEY } from '../engine/engineParams';
import { recordServerReads } from './readBudget';
import { AdminTemplateId, KatikaPermission, sanitizePermissions } from './adminRights';

/**
 * Registre des administrateurs ajoutés (collection katika_admins de la base du jeu, serveur seul).
 * Le serveur relit la fiche d'un admin au plus une fois par période réglable : un retrait ou un changement de droits
 * s'applique donc en moins d'une période, sans attendre l'expiration de la session Google de l'admin.
 */

export const ADMIN_REGISTRY_COLLECTION = 'katika_admins';

export interface AdminRegistryEntry {
  uid: string;
  email: string;
  status: 'ACTIVE' | 'REVOKED';
  template?: AdminTemplateId | 'CUSTOM';
  permissions: KatikaPermission[];
  grantedAt?: string;
  grantedBy?: string;
  updatedAt?: string;
  revokedAt?: string;
  revokedBy?: string;
  reason?: string;
}

export function normalizeEntry(uid: string, raw: Record<string, unknown> | undefined | null): AdminRegistryEntry | null {
  if (!raw) return null;
  return {
    uid,
    email: String(raw.email || ''),
    status: raw.status === 'ACTIVE' ? 'ACTIVE' : 'REVOKED',
    template: typeof raw.template === 'string' ? (raw.template as AdminRegistryEntry['template']) : undefined,
    permissions: sanitizePermissions(raw.permissions),
    grantedAt: typeof raw.grantedAt === 'string' ? raw.grantedAt : undefined,
    grantedBy: typeof raw.grantedBy === 'string' ? raw.grantedBy : undefined,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
    revokedAt: typeof raw.revokedAt === 'string' ? raw.revokedAt : undefined,
    revokedBy: typeof raw.revokedBy === 'string' ? raw.revokedBy : undefined,
    reason: typeof raw.reason === 'string' ? raw.reason : undefined,
  };
}

export interface AdminRegistryDeps {
  now: () => number;
  cacheMs: () => number;
  readEntry: (uid: string) => Promise<AdminRegistryEntry | null>;
}

export function createAdminRegistryCache(deps: AdminRegistryDeps) {
  const cache = new Map<string, { entry: AdminRegistryEntry | null; fetchedAt: number }>();
  return {
    /** Fiche d'un admin ; une lecture ratée renvoie une erreur, jamais un accès accordé par défaut. */
    async get(uid: string): Promise<AdminRegistryEntry | null> {
      const cached = cache.get(uid);
      if (cached && deps.now() - cached.fetchedAt < deps.cacheMs()) return cached.entry;
      const entry = await deps.readEntry(uid);
      cache.set(uid, { entry, fetchedAt: deps.now() });
      return entry;
    },
    forget(uid: string): void {
      cache.delete(uid);
    },
  };
}

function cacheMsFromRegistry(): number {
  const cfg = getEngineConfig() as unknown as Record<string, unknown>;
  const configured = Number(cfg.katikaRightsCacheSeconds);
  const seconds = Number.isFinite(configured) && configured > 0 ? configured : Number(PARAM_BY_KEY.katikaRightsCacheSeconds.default);
  return Math.round(seconds * 1000);
}

const collectionRef = () => getFirebaseAdminAppDb().collection(ADMIN_REGISTRY_COLLECTION);

export const adminRegistry = createAdminRegistryCache({
  now: () => Date.now(),
  cacheMs: cacheMsFromRegistry,
  readEntry: async (uid) => {
    const snap = await collectionRef().doc(uid).get();
    recordServerReads(1);
    return snap.exists ? normalizeEntry(uid, snap.data()) : null;
  },
});

export async function listAdminEntries(): Promise<AdminRegistryEntry[]> {
  const snap = await collectionRef().get();
  recordServerReads(snap.size);
  return snap.docs
    .map((d) => normalizeEntry(d.id, d.data()))
    .filter((e): e is AdminRegistryEntry => e !== null);
}

export async function writeAdminEntry(entry: AdminRegistryEntry): Promise<void> {
  const clean = Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== undefined));
  await collectionRef().doc(entry.uid).set(clean, { merge: true });
  adminRegistry.forget(entry.uid);
}

export async function readAdminEntry(uid: string): Promise<AdminRegistryEntry | null> {
  adminRegistry.forget(uid);
  return adminRegistry.get(uid);
}
