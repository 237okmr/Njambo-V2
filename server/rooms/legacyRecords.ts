import { getFirebaseAdminAppDb } from '../firebaseAdmin';
import { RECORDS_COLLECTION, JOURNAL_COLLECTION, compact, sanitizeDisplayName } from './gameRecordStore';

/**
 * Anciennes fiches de manche (écrites par les téléphones avant le passage du serveur comme unique écrivain) :
 *  - « report »  : lecture seule, compte ce qui existe ;
 *  - « migrate » : recopie chaque ancienne fiche au format actuel (fiche de manche + journal de la dernière partie connue),
 *                  sans jamais inventer de valeur et sans jamais écraser un document existant ;
 *  - « purge »   : supprime une ancienne fiche UNIQUEMENT si son équivalent au format actuel existe et la couvre.
 * Réservé à l'admin de katika (route protégée). Par défaut, aucune écriture (dryRun). Aucun délai, aucun secret, aucun e-mail.
 */
export const MAX_LEGACY_SCAN = 5000;
const WRITE_BATCH_SIZE = 400;
const LOOKUP_CHUNK_SIZE = 300;
const SERVER_SCHEMA_VERSION = 2;
const WIN_TYPES = ['STANDARD', 'KORA', 'DOUBLE_KORA', 'THREE_SEVENS', 'UNDER_21'];
const ABANDON_REASONS = ['RAGE_QUIT', 'POST_KORA', 'EARLY_QUIT', 'USER_EXIT', 'CONNECTION_LOST'];
const STATUS_RANK: Record<string, number> = { in_progress: 0, abandoned: 1, completed: 2 };

type AnyDoc = Record<string, any>;
type Status = 'in_progress' | 'abandoned' | 'completed';

export interface LegacyDoc {
  id: string;
  data: AnyDoc;
}

export interface PlannedDoc {
  id: string;
  data: AnyDoc;
}

export interface MigrationPlan {
  fiches: PlannedDoc[];
  journals: PlannedDoc[];
  /** Ancien identifiant -> identifiant de la fiche au format actuel qui doit le couvrir. */
  legacyToNew: Record<string, string>;
  /** Ce que la fiche actuelle doit au minimum contenir pour couvrir l'ancienne. */
  expected: Record<string, { partiesCount: number; status: Status }>;
  skipped: Array<{ id: string; reason: string }>;
  soloCount: number;
  multiCount: number;
  multiManches: number;
}

export function isCurrentSchema(doc: AnyDoc): boolean {
  return doc.schemaVersion === SERVER_SCHEMA_VERSION;
}

function safeDocPart(raw: string): string {
  return String(raw).replace(/[^A-Za-z0-9_-]/g, '_');
}

function normStatus(data: AnyDoc): Status {
  if (data.status === 'abandoned' || data.isAbandoned === true) return 'abandoned';
  if (data.status === 'completed' || data.isMancheFinalWin === true) return 'completed';
  return 'in_progress';
}

function partiesOf(data: AnyDoc): number {
  const raw = Number(data.partiesCount ?? data.roundsCount ?? 1);
  return Number.isFinite(raw) && raw >= 1 ? Math.min(999, Math.round(raw)) : 1;
}

function playerCountOf(data: AnyDoc): number {
  const n = Number(data.playerCount);
  return Number.isInteger(n) && n >= 2 && n <= 4 ? n : 2;
}

function displayNameFor(playerId: string, rawName: unknown): string {
  if (playerId.startsWith('usr_')) {
    const suffix = playerId.replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase();
    return `Invité #${suffix}`;
  }
  return sanitizeDisplayName(rawName) || 'Joueur Google';
}

function winTypeOf(data: AnyDoc): string {
  return WIN_TYPES.includes(data.winType) ? data.winType : 'STANDARD';
}

function legacyHumanPlayers(data: AnyDoc): Array<{ id: string; name: string; isWinner: boolean }> {
  return (Array.isArray(data.players) ? data.players : [])
    .filter((p: AnyDoc) => p && typeof p.id === 'string' && p.isHuman === true)
    .map((p: AnyDoc) => ({ id: p.id, name: displayNameFor(p.id, p.name), isWinner: p.isWinner === true }));
}

function journalFor(params: {
  ficheId: string;
  legacyId: string;
  mode: 'SOLO' | 'MULTIPLAYER';
  status: Status;
  partieNumber: number;
  playerCount: number;
  winType: string | null;
  winnerId: string | undefined;
  winnerIsHuman: boolean;
  players: Array<{ id: string; name: string; kind: 'google' | 'guest'; verified: boolean; isWinner?: boolean }>;
  aiDifficulty?: string;
  baseBet?: number;
  startedAt: number;
  endedAt: number;
  nowMs: number;
}): PlannedDoc {
  const id = `${params.ficheId}_p${params.partieNumber}`;
  return {
    id,
    data: compact({
      id,
      mancheDocId: params.ficheId,
      mancheId: params.legacyId,
      partieNumber: params.partieNumber,
      mode: params.mode,
      playerCount: params.playerCount,
      aiDifficulty: params.aiDifficulty,
      baseBet: params.baseBet,
      status: params.status,
      winType: params.status === 'completed' ? params.winType : null,
      winnerIsHuman: params.status === 'completed' ? params.winnerIsHuman : false,
      winnerId: params.status === 'completed' ? params.winnerId : undefined,
      players: params.players,
      startedAt: params.startedAt,
      createdAt: params.startedAt,
      endedAt: params.endedAt,
      updatedAt: params.endedAt,
      source: 'migration',
      schemaVersion: SERVER_SCHEMA_VERSION,
      migratedAt: params.nowMs,
    }),
  };
}

/** Construit, sans aucun accès réseau, ce qu'il faudrait écrire pour recopier les anciennes fiches au format actuel. */
export function planLegacyMigration(legacyDocs: LegacyDoc[], nowMs: number): MigrationPlan {
  const plan: MigrationPlan = {
    fiches: [],
    journals: [],
    legacyToNew: {},
    expected: {},
    skipped: [],
    soloCount: 0,
    multiCount: 0,
    multiManches: 0,
  };

  const multiGroups = new Map<string, LegacyDoc[]>();

  legacyDocs.forEach((legacy) => {
    const data = legacy.data;
    const createdAt = Number(data.createdAt) || 0;
    if (createdAt <= 0) {
      plan.skipped.push({ id: legacy.id, reason: 'date de création inconnue' });
      return;
    }

    if (data.mode === 'MULTIPLAYER') {
      plan.multiCount += 1;
      const roomId = typeof data.roomId === 'string' ? data.roomId : '';
      const manche = Number(data.mancheNumber);
      if (!roomId || !Number.isInteger(manche) || manche < 1) {
        plan.skipped.push({ id: legacy.id, reason: 'table ou numéro de manche inconnu' });
        return;
      }
      const key = `${safeDocPart(roomId)}|${manche}`;
      const list = multiGroups.get(key) || [];
      list.push(legacy);
      multiGroups.set(key, list);
      return;
    }

    // Solo : l'auteur est le compte Google qui a écrit la fiche.
    plan.soloCount += 1;
    const creatorUid = typeof data.creatorUid === 'string' ? data.creatorUid : '';
    if (!creatorUid || creatorUid === 'guest' || creatorUid.startsWith('usr_')) {
      plan.skipped.push({ id: legacy.id, reason: 'compte Google auteur inconnu' });
      return;
    }
    const status = normStatus(data);
    const pc = partiesOf(data);
    const ficheId = `rec_solo_${creatorUid}_${legacy.id}`;
    const humans = legacyHumanPlayers(data);
    const humanName = humans.find((h) => h.id === creatorUid)?.name || humans[0]?.name || 'Joueur Google';
    const humanWon = humans.some((h) => h.isWinner) || data.winnerId === creatorUid;
    const updatedAt = Number(data.updatedAt) || createdAt;
    const aiDifficulty = typeof data.aiDifficulty === 'string' && /^[A-Za-z_]{2,24}$/.test(data.aiDifficulty) ? data.aiDifficulty : undefined;
    const baseBet = typeof data.baseBet === 'number' && Number.isFinite(data.baseBet) && data.baseBet >= 0 ? data.baseBet : undefined;

    plan.fiches.push({
      id: ficheId,
      data: compact({
        id: ficheId,
        creatorUid,
        mode: 'SOLO',
        playerCount: playerCountOf(data),
        winType: winTypeOf(data),
        winnerName: status === 'completed' ? (humanWon ? humanName : 'IA') : status === 'abandoned' ? 'Abandon / Forfait' : 'En cours...',
        winnerId: status === 'completed' ? (humanWon ? creatorUid : 'bot') : undefined,
        durationSeconds: Number.isFinite(Number(data.durationSeconds)) ? Math.max(0, Number(data.durationSeconds)) : 0,
        roundsCount: pc,
        partiesCount: pc,
        isMancheFinalWin: status === 'completed',
        status,
        isAbandoned: status === 'abandoned',
        abandonmentReason: status === 'abandoned' && ABANDON_REASONS.includes(data.abandonmentReason) ? data.abandonmentReason : undefined,
        trickNumberAtQuit: status === 'abandoned' && Number.isInteger(data.trickNumberAtQuit) && data.trickNumberAtQuit >= 1 && data.trickNumberAtQuit <= 5 ? data.trickNumberAtQuit : undefined,
        baseBet,
        currency: 'CHIPS',
        aiDifficulty,
        createdAt,
        updatedAt,
        players: [{ id: creatorUid, name: humanName, isHuman: true, isWinner: status === 'completed' ? humanWon : undefined }],
        source: 'migration',
        schemaVersion: SERVER_SCHEMA_VERSION,
        identityKind: 'google',
        identityVerified: true,
        migratedFrom: [legacy.id],
        migratedAt: nowMs,
      }),
    });
    if (status !== 'in_progress') {
      plan.journals.push(
        journalFor({
          ficheId,
          legacyId: legacy.id,
          mode: 'SOLO',
          status,
          partieNumber: pc,
          playerCount: playerCountOf(data),
          winType: winTypeOf(data),
          winnerId: humanWon ? creatorUid : 'bot',
          winnerIsHuman: humanWon,
          players: [{ id: creatorUid, name: humanName, kind: 'google', verified: true }],
          aiDifficulty,
          baseBet,
          startedAt: createdAt,
          endedAt: updatedAt,
          nowMs,
        })
      );
    }
    plan.legacyToNew[legacy.id] = ficheId;
    plan.expected[legacy.id] = { partiesCount: pc, status };
  });

  // Multijoueur : chaque téléphone avait écrit sa propre fiche ; on ne garde qu'une fiche par table et par manche.
  multiGroups.forEach((docs, key) => {
    plan.multiManches += 1;
    const [roomPart, mancheStr] = key.split('|');
    const manche = Number(mancheStr);
    const ficheId = `rec_mp_${roomPart}_m${manche}`;
    const rank = (d: LegacyDoc) => [STATUS_RANK[normStatus(d.data)], partiesOf(d.data), Number(d.data.updatedAt) || 0];
    const sorted = [...docs].sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return rb[i] - ra[i];
      return 0;
    });
    const rep = sorted[0].data;
    const status = normStatus(rep);
    const pc = Math.max(...docs.map((d) => partiesOf(d.data)));
    const createdAt = Math.min(...docs.map((d) => Number(d.data.createdAt) || Infinity));
    const updatedAt = Math.max(...docs.map((d) => Number(d.data.updatedAt) || Number(d.data.createdAt) || 0));
    const humansById = new Map<string, { id: string; name: string }>();
    docs.forEach((d) => legacyHumanPlayers(d.data).forEach((h) => humansById.set(h.id, { id: h.id, name: h.name })));
    const winnerId = status === 'completed' && typeof rep.winnerId === 'string' ? rep.winnerId : undefined;
    const players = Array.from(humansById.values()).map((h) => ({
      id: h.id,
      name: h.name,
      isHuman: true,
      kind: h.id.startsWith('usr_') ? 'guest' : 'google',
      verified: !h.id.startsWith('usr_'),
      isWinner: status === 'completed' ? h.id === winnerId : undefined,
    }));
    const playerCount = Math.max(...docs.map((d) => playerCountOf(d.data)));
    const baseBet = typeof rep.baseBet === 'number' && Number.isFinite(rep.baseBet) && rep.baseBet >= 0 ? rep.baseBet : undefined;

    plan.fiches.push({
      id: ficheId,
      data: compact({
        id: ficheId,
        creatorUid: 'migration',
        roomId: String(rep.roomId),
        mancheNumber: manche,
        mode: 'MULTIPLAYER',
        playerCount,
        winType: winTypeOf(rep),
        winnerName: status === 'completed' && typeof rep.winnerName === 'string' && rep.winnerName ? displayNameFor(winnerId || '', rep.winnerName) : status === 'abandoned' ? 'Abandon / Forfait' : 'En cours...',
        winnerId,
        durationSeconds: Number.isFinite(Number(rep.durationSeconds)) ? Math.max(0, Number(rep.durationSeconds)) : 0,
        roundsCount: pc,
        partiesCount: pc,
        isMancheFinalWin: status === 'completed',
        status,
        isAbandoned: status === 'abandoned',
        baseBet,
        currency: 'CHIPS',
        createdAt,
        updatedAt,
        players,
        source: 'migration',
        schemaVersion: SERVER_SCHEMA_VERSION,
        migratedFrom: docs.map((d) => d.id),
        migratedAt: nowMs,
      }),
    });
    if (status !== 'in_progress' && players.length > 0) {
      plan.journals.push(
        journalFor({
          ficheId,
          legacyId: sorted[0].id,
          mode: 'MULTIPLAYER',
          status,
          partieNumber: pc,
          playerCount,
          winType: winTypeOf(rep),
          winnerId,
          winnerIsHuman: Boolean(winnerId && humansById.has(winnerId)),
          players: players.map((p) => ({ id: p.id, name: p.name, kind: p.kind as 'google' | 'guest', verified: p.verified, isWinner: p.isWinner })),
          baseBet,
          startedAt: createdAt,
          endedAt: updatedAt,
          nowMs,
        })
      );
    }
    docs.forEach((d) => {
      plan.legacyToNew[d.id] = ficheId;
      plan.expected[d.id] = { partiesCount: partiesOf(d.data), status: normStatus(d.data) };
    });
  });

  return plan;
}

/** Une ancienne fiche peut être supprimée seulement si la fiche actuelle existe et la couvre (aucune perte possible). */
export function isCovered(expected: { partiesCount: number; status: Status } | undefined, twin: AnyDoc | undefined): boolean {
  if (!expected || !twin) return false;
  if (!isCurrentSchema(twin)) return false;
  if ((Number(twin.partiesCount) || 0) < expected.partiesCount) return false;
  return (STATUS_RANK[String(twin.status)] ?? -1) >= STATUS_RANK[expected.status];
}

/** Accès aux données, séparé pour pouvoir être testé sans base réelle. */
export interface LegacyStore {
  listRecords(max: number): Promise<LegacyDoc[]>;
  getMany(collection: string, ids: string[]): Promise<Record<string, AnyDoc | undefined>>;
  createMany(collection: string, docs: PlannedDoc[]): Promise<number>;
  deleteMany(collection: string, ids: string[]): Promise<number>;
}

export type LegacyAction = 'report' | 'migrate' | 'purge';

export interface LegacyResult {
  success: boolean;
  error?: string;
  action: LegacyAction;
  dryRun: boolean;
  scanned: number;
  truncated: boolean;
  currentSchemaCount: number;
  legacy: {
    total: number;
    solo: number;
    multi: number;
    multiManches: number;
    byStatus: Record<string, number>;
    skippedCount: number;
    skippedSample: Array<{ id: string; reason: string }>;
  };
  migration: { fichesToCreate: number; journalsToCreate: number; alreadyPresent: number; created: number };
  purge: { coveredByCurrent: number; notCovered: number; deleted: number };
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function getManyChunked(store: LegacyStore, collection: string, ids: string[]): Promise<Record<string, AnyDoc | undefined>> {
  const merged: Record<string, AnyDoc | undefined> = {};
  for (const part of chunk(ids, LOOKUP_CHUNK_SIZE)) {
    Object.assign(merged, await store.getMany(collection, part));
  }
  return merged;
}

export async function runLegacyAction(
  store: LegacyStore,
  params: { action: LegacyAction; dryRun: boolean; confirm?: string; nowMs?: number }
): Promise<LegacyResult> {
  const nowMs = params.nowMs ?? Date.now();
  const empty = (error?: string): LegacyResult => ({
    success: !error,
    error,
    action: params.action,
    dryRun: params.dryRun,
    scanned: 0,
    truncated: false,
    currentSchemaCount: 0,
    legacy: { total: 0, solo: 0, multi: 0, multiManches: 0, byStatus: {}, skippedCount: 0, skippedSample: [] },
    migration: { fichesToCreate: 0, journalsToCreate: 0, alreadyPresent: 0, created: 0 },
    purge: { coveredByCurrent: 0, notCovered: 0, deleted: 0 },
  });

  if (params.action !== 'report' && !params.dryRun && params.confirm !== 'CONFIRMER') {
    return empty('Confirmation requise : envoyer confirm = "CONFIRMER" pour une écriture ou une suppression réelle.');
  }

  const all = await store.listRecords(MAX_LEGACY_SCAN);
  const legacyDocs = all.filter((d) => !isCurrentSchema(d.data));
  const result = empty();
  result.scanned = all.length;
  result.truncated = all.length >= MAX_LEGACY_SCAN;
  result.currentSchemaCount = all.length - legacyDocs.length;

  const plan = planLegacyMigration(legacyDocs, nowMs);
  legacyDocs.forEach((d) => {
    const s = normStatus(d.data);
    result.legacy.byStatus[s] = (result.legacy.byStatus[s] || 0) + 1;
  });
  result.legacy.total = legacyDocs.length;
  result.legacy.solo = plan.soloCount;
  result.legacy.multi = plan.multiCount;
  result.legacy.multiManches = plan.multiManches;
  result.legacy.skippedCount = plan.skipped.length;
  result.legacy.skippedSample = plan.skipped.slice(0, 20);

  // Ce qui existe déjà au format actuel n'est jamais écrasé.
  const existingFiches = await getManyChunked(store, RECORDS_COLLECTION, plan.fiches.map((f) => f.id));
  const existingJournals = await getManyChunked(store, JOURNAL_COLLECTION, plan.journals.map((j) => j.id));
  const fichesToCreate = plan.fiches.filter((f) => !existingFiches[f.id]);
  const journalsToCreate = plan.journals.filter((j) => !existingJournals[j.id] && !existingFiches[j.data.mancheDocId]);
  result.migration.fichesToCreate = fichesToCreate.length;
  result.migration.journalsToCreate = journalsToCreate.length;
  result.migration.alreadyPresent = plan.fiches.length - fichesToCreate.length;

  if (params.action === 'migrate' && !params.dryRun) {
    let created = 0;
    for (const part of chunk(fichesToCreate, WRITE_BATCH_SIZE)) created += await store.createMany(RECORDS_COLLECTION, part);
    for (const part of chunk(journalsToCreate, WRITE_BATCH_SIZE)) await store.createMany(JOURNAL_COLLECTION, part);
    result.migration.created = created;
  }

  if (params.action === 'purge') {
    // Vérification sur l'état réel de la base : la fiche actuelle doit exister et couvrir l'ancienne.
    const twinIds = Array.from(new Set(Object.values(plan.legacyToNew)));
    const twins = await getManyChunked(store, RECORDS_COLLECTION, twinIds);
    const deletable: string[] = [];
    Object.keys(plan.legacyToNew).forEach((legacyId) => {
      if (isCovered(plan.expected[legacyId], twins[plan.legacyToNew[legacyId]])) deletable.push(legacyId);
    });
    result.purge.coveredByCurrent = deletable.length;
    result.purge.notCovered = legacyDocs.length - deletable.length;
    if (!params.dryRun) {
      let deleted = 0;
      for (const part of chunk(deletable, WRITE_BATCH_SIZE)) deleted += await store.deleteMany(RECORDS_COLLECTION, part);
      result.purge.deleted = deleted;
    }
  }

  return result;
}

/** Accès réel (SDK admin). Les écritures utilisent create() : jamais d'écrasement d'un document existant. */
export function createFirestoreLegacyStore(): LegacyStore {
  return {
    async listRecords(max) {
      const db = getFirebaseAdminAppDb();
      const snap = await db.collection(RECORDS_COLLECTION).limit(max).get();
      return snap.docs.map((d) => ({ id: d.id, data: d.data() as AnyDoc }));
    },
    async getMany(collection, ids) {
      const out: Record<string, AnyDoc | undefined> = {};
      if (ids.length === 0) return out;
      const db = getFirebaseAdminAppDb();
      const refs = ids.map((id) => db.collection(collection).doc(id));
      const snaps = await db.getAll(...refs);
      snaps.forEach((s) => {
        out[s.id] = s.exists ? (s.data() as AnyDoc) : undefined;
      });
      return out;
    },
    async createMany(collection, docs) {
      if (docs.length === 0) return 0;
      const db = getFirebaseAdminAppDb();
      const batch = db.batch();
      docs.forEach((d) => batch.create(db.collection(collection).doc(d.id), d.data));
      await batch.commit();
      return docs.length;
    },
    async deleteMany(collection, ids) {
      if (ids.length === 0) return 0;
      const db = getFirebaseAdminAppDb();
      const batch = db.batch();
      ids.forEach((id) => batch.delete(db.collection(collection).doc(id)));
      await batch.commit();
      return ids.length;
    },
  };
}
