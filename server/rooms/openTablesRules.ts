import type { OpenCashLevel, OpenTableEntry } from '../../src/types';

/** Ce que les règles ont besoin de savoir d'un salon. Le gestionnaire de salons le remplit depuis la mémoire du serveur. */
export interface OpenTableRoomView {
  id: string;
  cash: boolean;
  /** Table Cash terminée : plus rien ne s'y joue. */
  cashClosed?: boolean;
  /** Sièges Cash encore ouverts. */
  cashOpenSeats?: number;
  cashRakePercent?: number;
  isPublic: boolean;
  status: string;
  maxPlayers: number;
  baseBet: number;
  hostName: string;
  hostAvatarSeed?: string;
  players: { id: string; name: string; isHuman: boolean; isSpectator: boolean; connected: boolean }[];
}

export type FreeOpenTable = OpenTableEntry & { roomId: string };

export interface BuildFreeTablesInput {
  rooms: Iterable<OpenTableRoomView>;
  selfId: string;
  /** Amis confirmés de celui qui demande. */
  friendIds: ReadonlySet<string>;
  /** Un ami qui apparaît hors ligne n'expose pas sa table privée. */
  isHidden: (id: string) => boolean;
  /** Blocage dans un sens ou dans l'autre entre celui qui demande et ce joueur. */
  isBlockedWith: (id: string) => boolean;
  limit: number;
}

function seatedHumans(room: OpenTableRoomView) {
  return room.players.filter((p) => p.isHuman && !p.isSpectator);
}

/** Une table gratuite est-elle candidate ? Salon en attente, avec une place humaine libre et quelqu'un de connecté. */
function isOpenFreeRoom(room: OpenTableRoomView): boolean {
  if (room.cash || room.id === 'TEST_CLI') return false;
  if (room.status !== 'LOBBY') return false;
  const humans = seatedHumans(room);
  if (humans.length === 0 || humans.length >= room.maxPlayers) return false;
  return humans.some((p) => p.connected);
}

/**
 * Tables gratuites ouvertes : salons publics en attente, plus les salons privés en attente où un ami confirmé est assis.
 * Jamais de table Cash. Toute table où est assis un joueur bloqué (dans un sens ou l'autre) est écartée.
 */
export function buildFreeOpenTables(input: BuildFreeTablesInput): FreeOpenTable[] {
  const out: FreeOpenTable[] = [];
  for (const room of input.rooms) {
    if (!isOpenFreeRoom(room)) continue;
    const humans = seatedHumans(room);
    if (humans.some((p) => p.id === input.selfId)) continue;
    if (humans.some((p) => input.isBlockedWith(p.id))) continue;

    const visibleFriends = humans.filter((p) => input.friendIds.has(p.id) && !input.isHidden(p.id));
    if (!room.isPublic && visibleFriends.length === 0) continue;

    out.push({
      kind: room.isPublic ? 'PUBLIC' : 'FRIEND',
      id: room.id,
      roomId: room.id,
      hostName: room.hostName,
      hostAvatarSeed: room.hostAvatarSeed,
      seated: humans.length,
      capacity: room.maxPlayers,
      baseBet: room.baseBet,
      friendNames: visibleFriends.map((p) => p.name),
    });
  }
  // Les tables d'amis d'abord, puis les plus remplies : celles qui vont démarrer.
  out.sort((a, b) => {
    if (a.friendNames.length > 0 !== b.friendNames.length > 0) return a.friendNames.length > 0 ? -1 : 1;
    return b.seated - a.seated;
  });
  return out.slice(0, Math.max(0, input.limit));
}

/**
 * Niveaux Kora Cash ayant des places libres sur des tables publiques en attente.
 * Regroupé par mise : aucun pseudo, aucun code, aucun siège individuel n'en sort.
 */
export function buildCashOpenLevels(rooms: Iterable<OpenTableRoomView>): OpenCashLevel[] {
  const byBet = new Map<number, OpenCashLevel>();
  for (const room of rooms) {
    if (!room.cash || room.cashClosed || !room.isPublic) continue;
    if (room.status !== 'LOBBY' && room.status !== 'MANCHE_OVER') continue;
    const free = room.maxPlayers - (room.cashOpenSeats ?? 0);
    if (free <= 0) continue;
    const level = byBet.get(room.baseBet) ?? { baseBet: room.baseBet, tables: 0, freeSeats: 0, rakePercent: room.cashRakePercent ?? 0 };
    level.tables += 1;
    level.freeSeats += free;
    byBet.set(room.baseBet, level);
  }
  return [...byBet.values()].sort((a, b) => a.baseBet - b.baseBet);
}
