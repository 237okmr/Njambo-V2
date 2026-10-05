import { getFirebaseAdminAppDb } from '../firebaseAdmin';
import type { MultiplayerRoom, PartieResult } from '../../src/types';

/**
 * Réception côté serveur des parties SOLO (jouées sur l'appareil, parfois hors ligne).
 * Le serveur est l'unique écrivain : il valide, déduplique par identifiant stable, puis écrit
 *  - la fiche de manche dans njambo_game_records (une fiche par manche),
 *  - le journal de partie dans njambo_partie_journal (un document par partie).
 * Accès uniquement par le SDK admin. Aucune mise réelle, aucun secret, aucun e-mail n'y figure.
 * Aucun délai n'est utilisé ici.
 */
export const RECORDS_COLLECTION = 'njambo_game_records';
export const JOURNAL_COLLECTION = 'njambo_partie_journal';
export const MAX_SOLO_BATCH_ITEMS = 50;

export type RecordStatus = 'in_progress' | 'abandoned' | 'completed';
export type WinType = 'STANDARD' | 'KORA' | 'DOUBLE_KORA' | 'THREE_SEVENS' | 'UNDER_21';

const STATUS_RANK: Record<RecordStatus, number> = { in_progress: 0, abandoned: 1, completed: 2 };
const WIN_TYPES: WinType[] = ['STANDARD', 'KORA', 'DOUBLE_KORA', 'THREE_SEVENS', 'UNDER_21'];
const ID_PATTERN = /^[A-Za-z0-9_.:-]{6,120}$/;
const GUEST_ID_PATTERN = /^usr_[A-Za-z0-9-]{8,64}$/;
const AI_LEVEL_PATTERN = /^[A-Za-z_]{2,24}$/;
const MAX_BET = 1_000_000_000;
const MAX_COUNTER = 999;
const ABANDON_REASONS = ['RAGE_QUIT', 'POST_KORA', 'EARLY_QUIT', 'USER_EXIT', 'CONNECTION_LOST'];

export interface SoloPartieItem {
  mancheId: string;
  partieNumber: number;
  partieStatus: RecordStatus;
  mancheStatus: RecordStatus;
  partiesCount: number;
  winType: WinType | null;
  winnerIsHuman: boolean;
  playerCount: number;
  aiDifficulty: string | null;
  baseBet: number | null;
  startedAt: number;
  endedAt: number | null;
  abandonmentReason: string | null;
  trickNumberAtQuit: number | null;
}

export interface SoloIdentity {
  playerKey: string;
  displayName: string;
  kind: 'google' | 'guest';
  verified: boolean;
}

export interface VerifiedToken {
  uid: string;
  email?: string;
}

type ValidationResult =
  | { ok: true; value: SoloPartieItem }
  | { ok: false; reason: string };

type IdentityResult =
  | { ok: true; identity: SoloIdentity }
  | { ok: false; status: number; error: string };

function isRecordStatus(value: unknown): value is RecordStatus {
  return value === 'in_progress' || value === 'abandoned' || value === 'completed';
}

function isIntInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function higherStatus(a: RecordStatus | undefined, b: RecordStatus): RecordStatus {
  if (!a) return b;
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}

/** Retire récursivement les propriétés `undefined` (Firestore les refuse). */
export function compact<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.filter((v) => v !== undefined).map((v) => compact(v)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = compact(v);
    }
    return out as T;
  }
  return value;
}

export function sanitizeDisplayName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const cleaned = raw.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 40);
  if (cleaned.toLowerCase() === 'katika') return '';
  return cleaned;
}

/**
 * Identité de l'auteur : compte Google (jeton valide avec e-mail) ou invité (identifiant « usr_... »,
 * même règle que le WebSocket). L'e-mail n'est jamais conservé.
 */
export function resolveSoloIdentity(params: {
  tokenProvided: boolean;
  verified: VerifiedToken | null;
  body: unknown;
}): IdentityResult {
  const { tokenProvided, verified } = params;
  const body = (params.body && typeof params.body === 'object' ? params.body : {}) as Record<string, unknown>;

  if (tokenProvided && !verified) {
    return { ok: false, status: 401, error: 'Identité non vérifiée' };
  }
  if (verified && verified.email) {
    return {
      ok: true,
      identity: {
        playerKey: verified.uid,
        displayName: sanitizeDisplayName(body.displayName) || 'Joueur Google',
        kind: 'google',
        verified: true,
      },
    };
  }
  const guestId = body.guestId;
  if (typeof guestId === 'string' && GUEST_ID_PATTERN.test(guestId)) {
    const suffix = guestId.replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase();
    return {
      ok: true,
      identity: {
        playerKey: guestId,
        displayName: `Invité #${suffix}`,
        kind: 'guest',
        verified: false,
      },
    };
  }
  return { ok: false, status: 401, error: 'Identité manquante ou invalide' };
}

export function validateSoloItem(raw: unknown, nowMs: number): ValidationResult {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'format' };
  const r = raw as Record<string, unknown>;

  if (typeof r.mancheId !== 'string' || !ID_PATTERN.test(r.mancheId)) return { ok: false, reason: 'mancheId' };
  if (!isIntInRange(r.partieNumber, 1, MAX_COUNTER)) return { ok: false, reason: 'partieNumber' };
  if (!isRecordStatus(r.partieStatus)) return { ok: false, reason: 'partieStatus' };
  if (!isRecordStatus(r.mancheStatus)) return { ok: false, reason: 'mancheStatus' };
  if (!isIntInRange(r.partiesCount, 1, MAX_COUNTER)) return { ok: false, reason: 'partiesCount' };
  if (!isIntInRange(r.playerCount, 2, 4)) return { ok: false, reason: 'playerCount' };

  let winType: WinType | null = null;
  if (r.partieStatus === 'completed') {
    if (typeof r.winType !== 'string' || !WIN_TYPES.includes(r.winType as WinType)) {
      return { ok: false, reason: 'winType' };
    }
    winType = r.winType as WinType;
  }

  let aiDifficulty: string | null = null;
  if (r.aiDifficulty !== undefined && r.aiDifficulty !== null) {
    if (typeof r.aiDifficulty !== 'string' || !AI_LEVEL_PATTERN.test(r.aiDifficulty)) {
      return { ok: false, reason: 'aiDifficulty' };
    }
    aiDifficulty = r.aiDifficulty;
  }

  let baseBet: number | null = null;
  if (r.baseBet !== undefined && r.baseBet !== null) {
    if (typeof r.baseBet !== 'number' || !Number.isFinite(r.baseBet) || r.baseBet < 0 || r.baseBet > MAX_BET) {
      return { ok: false, reason: 'baseBet' };
    }
    baseBet = r.baseBet;
  }

  if (typeof r.startedAt !== 'number' || !Number.isFinite(r.startedAt) || r.startedAt <= 0) {
    return { ok: false, reason: 'startedAt' };
  }
  const startedAt = Math.min(Math.floor(r.startedAt), nowMs);

  // Raison et tour d'abandon : facultatifs ; une valeur inconnue est ignorée (jamais de rejet du lot pour si peu).
  const abandonmentReason = typeof r.abandonmentReason === 'string' && ABANDON_REASONS.includes(r.abandonmentReason)
    ? r.abandonmentReason
    : null;
  const trickNumberAtQuit = isIntInRange(r.trickNumberAtQuit, 1, 5) ? r.trickNumberAtQuit : null;

  let endedAt: number | null = null;
  if (r.endedAt !== undefined && r.endedAt !== null) {
    if (typeof r.endedAt !== 'number' || !Number.isFinite(r.endedAt) || r.endedAt <= 0) {
      return { ok: false, reason: 'endedAt' };
    }
    endedAt = Math.min(Math.max(Math.floor(r.endedAt), startedAt), nowMs);
  }

  return {
    ok: true,
    value: {
      mancheId: r.mancheId,
      partieNumber: r.partieNumber,
      partieStatus: r.partieStatus,
      mancheStatus: r.mancheStatus,
      partiesCount: r.partiesCount,
      winType,
      winnerIsHuman: r.winnerIsHuman === true,
      playerCount: r.playerCount,
      aiDifficulty,
      baseBet,
      abandonmentReason,
      trickNumberAtQuit,
      startedAt,
      endedAt,
    },
  };
}

export function buildSoloDocIds(identity: SoloIdentity, item: SoloPartieItem): { mancheDocId: string; partieDocId: string } {
  const mancheDocId = `rec_solo_${identity.playerKey}_${item.mancheId}`;
  return { mancheDocId, partieDocId: `${mancheDocId}_p${item.partieNumber}` };
}

type AnyDoc = Record<string, any>;

/** Fiche de manche (compatible avec GameTelemetryRecord). Les statuts ne reculent jamais. */
export function mergeSoloFiche(
  existing: AnyDoc | undefined,
  identity: SoloIdentity,
  item: SoloPartieItem,
  mancheDocId: string,
  nowMs: number
): AnyDoc {
  const status = higherStatus(existing?.status as RecordStatus | undefined, item.mancheStatus);
  const createdAt = Math.min(Number(existing?.createdAt) || item.startedAt, item.startedAt);
  const justCompleted = status === 'completed' && existing?.status !== 'completed' && item.mancheStatus === 'completed';

  let winnerName: string = existing?.winnerName || 'En cours...';
  let winnerId: string | undefined = existing?.winnerId;
  let winType: WinType = (existing?.winType as WinType) || 'STANDARD';
  if (justCompleted) {
    winnerName = item.winnerIsHuman ? identity.displayName : 'IA';
    winnerId = item.winnerIsHuman ? identity.playerKey : 'bot';
    winType = item.winType || winType;
  } else if (status === 'abandoned') {
    winnerName = 'Abandon / Forfait';
  }

  const endedAt = item.endedAt ?? undefined;
  const durationSeconds = endedAt !== undefined
    ? Math.max(0, Math.round((endedAt - createdAt) / 1000))
    : Number(existing?.durationSeconds) || 0;
  const partiesCount = Math.max(Number(existing?.partiesCount) || 0, item.partiesCount);

  return compact({
    id: mancheDocId,
    creatorUid: identity.playerKey,
    mode: 'SOLO',
    playerCount: item.playerCount,
    winType,
    winnerName,
    winnerId,
    durationSeconds,
    roundsCount: partiesCount,
    partiesCount,
    isMancheFinalWin: status === 'completed',
    status,
    isAbandoned: status === 'abandoned',
    abandonmentReason: status === 'abandoned' ? (item.abandonmentReason ?? existing?.abandonmentReason) : undefined,
    trickNumberAtQuit: status === 'abandoned' ? (item.trickNumberAtQuit ?? existing?.trickNumberAtQuit) : undefined,
    baseBet: item.baseBet ?? existing?.baseBet,
    currency: 'CHIPS',
    aiDifficulty: item.aiDifficulty ?? existing?.aiDifficulty,
    createdAt,
    updatedAt: nowMs,
    players: [
      {
        id: identity.playerKey,
        name: identity.displayName,
        isHuman: true,
        isWinner: status === 'completed' ? (justCompleted ? item.winnerIsHuman : existing?.winnerId === identity.playerKey) : undefined,
      },
    ],
    source: 'server',
    identityKind: identity.kind,
    identityVerified: identity.verified,
    schemaVersion: 2,
  });
}

/** Journal de partie : un document par partie. Une partie terminée n'est jamais rétrogradée. */
export function mergeSoloJournal(
  existing: AnyDoc | undefined,
  identity: SoloIdentity,
  item: SoloPartieItem,
  mancheDocId: string,
  partieDocId: string,
  nowMs: number
): AnyDoc {
  const status = higherStatus(existing?.status as RecordStatus | undefined, item.partieStatus);
  const startedAt = Math.min(Number(existing?.startedAt) || item.startedAt, item.startedAt);
  const justCompleted = status === 'completed' && existing?.status !== 'completed' && item.partieStatus === 'completed';

  let winType: WinType | null = (existing?.winType as WinType | null) ?? null;
  let winnerIsHuman: boolean = existing?.winnerIsHuman === true;
  let winnerId: string | undefined = existing?.winnerId;
  if (justCompleted) {
    winType = item.winType;
    winnerIsHuman = item.winnerIsHuman;
    winnerId = item.winnerIsHuman ? identity.playerKey : 'bot';
  }

  return compact({
    id: partieDocId,
    mancheDocId,
    mancheId: item.mancheId,
    partieNumber: item.partieNumber,
    mode: 'SOLO',
    playerCount: item.playerCount,
    aiDifficulty: item.aiDifficulty ?? existing?.aiDifficulty,
    baseBet: item.baseBet ?? existing?.baseBet,
    status,
    winType,
    winnerIsHuman,
    winnerId,
    players: [
      {
        id: identity.playerKey,
        name: identity.displayName,
        isHuman: true,
        kind: identity.kind,
        verified: identity.verified,
      },
    ],
    startedAt,
    createdAt: startedAt,
    endedAt: item.endedAt ?? existing?.endedAt,
    updatedAt: nowMs,
    source: 'server',
    schemaVersion: 2,
  });
}

export interface SoloBatchResponse {
  status: number;
  body: {
    success: boolean;
    error?: string;
    accepted?: number[];
    rejected?: Array<{ index: number; reason: string }>;
  };
}

/**
 * Traite un lot de parties solo. Idempotent : renvoyer le même lot ne change rien.
 * Les éléments invalides sont rejetés définitivement (le client peut les retirer de sa file) ;
 * une erreur serveur renvoie 500 et le client réessaie plus tard.
 */
export async function saveSoloPartieBatch(params: {
  tokenProvided: boolean;
  verified: VerifiedToken | null;
  body: unknown;
  nowMs?: number;
}): Promise<SoloBatchResponse> {
  const nowMs = params.nowMs ?? Date.now();
  const identityResult = resolveSoloIdentity({
    tokenProvided: params.tokenProvided,
    verified: params.verified,
    body: params.body,
  });
  if (identityResult.ok === false) {
    return { status: identityResult.status, body: { success: false, error: identityResult.error } };
  }
  const identity = identityResult.identity;

  const rawItems = (params.body as { items?: unknown } | null)?.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > MAX_SOLO_BATCH_ITEMS) {
    return { status: 400, body: { success: false, error: `items doit contenir de 1 à ${MAX_SOLO_BATCH_ITEMS} éléments` } };
  }

  const accepted: number[] = [];
  const rejected: Array<{ index: number; reason: string }> = [];

  try {
    const db = getFirebaseAdminAppDb();
    for (let index = 0; index < rawItems.length; index++) {
      const validation = validateSoloItem(rawItems[index], nowMs);
      if (validation.ok === false) {
        rejected.push({ index, reason: validation.reason });
        continue;
      }
      const item = validation.value;
      const { mancheDocId, partieDocId } = buildSoloDocIds(identity, item);
      const ficheRef = db.collection(RECORDS_COLLECTION).doc(mancheDocId);
      const journalRef = db.collection(JOURNAL_COLLECTION).doc(partieDocId);

      await db.runTransaction(async (tx) => {
        const [ficheSnap, journalSnap] = await Promise.all([tx.get(ficheRef), tx.get(journalRef)]);
        const fiche = mergeSoloFiche(ficheSnap.exists ? (ficheSnap.data() as AnyDoc) : undefined, identity, item, mancheDocId, nowMs);
        const journal = mergeSoloJournal(
          journalSnap.exists ? (journalSnap.data() as AnyDoc) : undefined,
          identity,
          item,
          mancheDocId,
          partieDocId,
          nowMs
        );
        tx.set(ficheRef, fiche, { merge: true });
        tx.set(journalRef, journal, { merge: true });
      });
      accepted.push(index);
    }
  } catch (err) {
    console.warn('[GameRecordStore] Écriture solo différée :', (err as Error)?.message || err);
    return { status: 500, body: { success: false, error: 'Enregistrement temporairement indisponible', accepted, rejected } };
  }

  return { status: 200, body: { success: true, accepted, rejected } };
}

// ─── Multijoueur : le serveur écrit la fiche de manche et le journal de chaque partie ───

/**
 * Choix produit : une partie arrêtée par un forfait (victoire par forfait) ou par un vote d'arrêt anticipé
 * est comptée « abandonnée » ; toute autre fin est « terminée ». Pour changer la règle, ne modifier que cette liste.
 */
const MULTI_ABANDON_END_REASONS: string[] = ['FORFEIT_VICTORY', 'EARLY_CLOSE'];
const FICHE_WIN_TYPES: string[] = ['STANDARD', 'KORA', 'DOUBLE_KORA', 'THREE_SEVENS', 'UNDER_21'];

export function classifyMultiPartieStatus(endReason: string): RecordStatus {
  return MULTI_ABANDON_END_REASONS.includes(endReason) ? 'abandoned' : 'completed';
}

function safeDocPart(raw: string): string {
  return String(raw).replace(/[^A-Za-z0-9_-]/g, '_');
}

function multiDisplayName(playerId: string, rawName: unknown, isHuman: boolean): string {
  if (!isHuman) return sanitizeDisplayName(rawName) || 'IA';
  if (playerId.startsWith('usr_')) {
    const suffix = playerId.replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase();
    return `Invité #${suffix}`;
  }
  return sanitizeDisplayName(rawName) || 'Joueur Google';
}

export interface MultiHumanEntry {
  id: string;
  name: string;
  kind: 'google' | 'guest';
  verified: boolean;
  isWinner: boolean;
  outcome: 'played' | 'absent';
  chipsNet: number;
}

/** Joueurs humains présents à la donne (les bots sont exclus). Absent = relais, forfait ou pénalité de forfait. */
export function buildMultiHumans(
  result: PartieResult,
  room: Pick<MultiplayerRoom, 'players' | 'gameState'>
): MultiHumanEntry[] {
  const penalties = room.gameState?.forfeitPenaltyPaid || {};
  return result.participants
    .filter((p) => p.isHuman)
    .map((p) => {
      const seat = (room.players || []).find((rp) => rp.id === p.playerId);
      const absent = Boolean(seat?.relayAbsent || seat?.isForfeit) || (penalties[p.playerId] || 0) > 0;
      const isGuest = p.playerId.startsWith('usr_');
      return {
        id: p.playerId,
        name: multiDisplayName(p.playerId, p.name, true),
        kind: isGuest ? ('guest' as const) : ('google' as const),
        verified: !isGuest,
        isWinner: p.playerId === result.winnerId,
        outcome: absent ? ('absent' as const) : ('played' as const),
        chipsNet: typeof p.net === 'number' && Number.isFinite(p.net) ? p.net : 0,
      };
    });
}

/**
 * Construit la fiche de manche (une par table et par manche) et le journal de la partie.
 * Renvoie null s'il n'y a aucun joueur humain (table 100 % bots : rien à compter).
 */
export function buildMultiDocs(params: {
  existingFiche?: AnyDoc;
  result: PartieResult;
  room: Pick<MultiplayerRoom, 'players' | 'gameState'>;
  nowMs: number;
}): { mancheDocId: string; partieDocId: string; fiche: AnyDoc; journal: AnyDoc } | null {
  const { existingFiche, result, room, nowMs } = params;
  const humans = buildMultiHumans(result, room);
  if (humans.length === 0) return null;

  const partieStatus = classifyMultiPartieStatus(result.endReason);
  const mancheDocId = `rec_mp_${safeDocPart(result.roomId)}_m${result.mancheNumber}`;
  const partieDocId = `${mancheDocId}_p${result.partieCount}`;
  const endedAt = Math.min(Number(result.createdAt) || nowMs, nowMs);
  const winnerParticipant = result.participants.find((p) => p.playerId === result.winnerId);
  const winnerName = winnerParticipant
    ? multiDisplayName(winnerParticipant.playerId, winnerParticipant.name, winnerParticipant.isHuman)
    : 'IA';
  const winnerIsHuman = Boolean(winnerParticipant && winnerParticipant.isHuman);
  const botCount = result.participants.length - humans.length;

  const journal = compact({
    id: partieDocId,
    mancheDocId,
    roomId: result.roomId,
    mancheNumber: result.mancheNumber,
    partieNumber: result.partieCount,
    mode: 'MULTIPLAYER',
    playerCount: result.participants.length,
    humanCount: humans.length,
    botCount,
    baseBet: result.baseBet,
    status: partieStatus,
    endReason: result.endReason,
    winType: result.winType,
    winnerId: result.winnerId ?? undefined,
    winnerIsHuman,
    mancheOver: result.mancheOver,
    players: humans.map((h) => ({
      id: h.id,
      name: h.name,
      kind: h.kind,
      verified: h.verified,
      isWinner: h.isWinner,
      outcome: h.outcome,
      chipsNet: h.chipsNet,
    })),
    startedAt: endedAt,
    createdAt: endedAt,
    endedAt,
    updatedAt: nowMs,
    source: 'server',
    schemaVersion: 2,
  });

  const prevStatus = existingFiche?.status as RecordStatus | undefined;
  const status: RecordStatus = result.mancheOver || prevStatus === 'completed' ? 'completed' : 'in_progress';
  const justCompleted = status === 'completed' && prevStatus !== 'completed';
  const createdAt = Math.min(Number(existingFiche?.createdAt) || endedAt, endedAt);
  const partiesCount = Math.max(Number(existingFiche?.partiesCount) || 0, result.partieCount);

  const byId = new Map<string, AnyDoc>();
  (Array.isArray(existingFiche?.players) ? existingFiche!.players : []).forEach((pl: AnyDoc) => {
    if (pl && typeof pl.id === 'string') byId.set(pl.id, pl);
  });
  humans.forEach((h) => {
    byId.set(h.id, { id: h.id, name: h.name, isHuman: true, kind: h.kind, verified: h.verified });
  });
  const finalWinnerId: string | undefined = justCompleted ? (result.winnerId ?? undefined) : existingFiche?.winnerId;
  const players = Array.from(byId.values()).map((pl) => ({
    ...pl,
    isWinner: status === 'completed' ? pl.id === finalWinnerId : undefined,
  }));

  const fiche = compact({
    id: mancheDocId,
    creatorUid: 'server',
    roomId: result.roomId,
    mancheNumber: result.mancheNumber,
    mode: 'MULTIPLAYER',
    playerCount: Math.max(Number(existingFiche?.playerCount) || 0, result.participants.length),
    winType: justCompleted && FICHE_WIN_TYPES.includes(result.winType) ? result.winType : existingFiche?.winType || 'STANDARD',
    winnerName: justCompleted ? winnerName : existingFiche?.winnerName || 'En cours...',
    winnerId: finalWinnerId,
    durationSeconds: Math.max(0, Math.round((endedAt - createdAt) / 1000)),
    roundsCount: partiesCount,
    partiesCount,
    isMancheFinalWin: status === 'completed',
    status,
    isAbandoned: false,
    baseBet: result.baseBet,
    currency: 'CHIPS',
    createdAt,
    updatedAt: nowMs,
    players,
    source: 'server',
    schemaVersion: 2,
  });

  return { mancheDocId, partieDocId, fiche, journal };
}

/**
 * Appelé par le serveur à la fin de chaque partie multijoueur (une seule fois par partie).
 * Idempotent : si le journal de cette partie existe déjà, rien n'est réécrit.
 * Ne bloque ni ne perturbe jamais la partie : toute erreur est journalisée puis ignorée.
 */
export async function recordMultiplayerPartie(
  result: PartieResult,
  room: Pick<MultiplayerRoom, 'players' | 'gameState'>
): Promise<void> {
  try {
    const probe = buildMultiDocs({ result, room, nowMs: Date.now() });
    if (!probe) return;
    const db = getFirebaseAdminAppDb();
    const ficheRef = db.collection(RECORDS_COLLECTION).doc(probe.mancheDocId);
    const journalRef = db.collection(JOURNAL_COLLECTION).doc(probe.partieDocId);
    await db.runTransaction(async (tx) => {
      const [ficheSnap, journalSnap] = await Promise.all([tx.get(ficheRef), tx.get(journalRef)]);
      if (journalSnap.exists) return;
      const docs = buildMultiDocs({
        existingFiche: ficheSnap.exists ? (ficheSnap.data() as AnyDoc) : undefined,
        result,
        room,
        nowMs: Date.now(),
      });
      if (!docs) return;
      tx.set(ficheRef, docs.fiche, { merge: true });
      tx.set(journalRef, docs.journal, { merge: true });
    });
  } catch (err) {
    console.warn('[GameRecordStore] Enregistrement multijoueur ignoré :', (err as Error)?.message || err);
  }
}
