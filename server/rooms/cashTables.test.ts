/**
 * Une table Kora Cash de bout en bout, côté serveur, avec un registre en mémoire qui applique les vraies règles :
 * entrée, partie, commission, sortie, recave, joueur sans capital, table fermée en cours de route.
 */

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from './roomManager';
import { ServerGameEngine } from '../engine/serverGameEngine';
import { CashTableBook, CashSeatDoc, CashPartieDoc } from '../cash/cashTables';
import { computeMovement } from '../cash/cashLedgerRules';
import { DEFAULT_CASH_TABLE_SETTINGS, seatDocId } from '../cash/cashTableRules';
import type { PartiePairOutcome } from '../cash/protectionRules';
import type { MultiplayerRoom } from '../../src/types';

const manager = RoomManager as any;

function fakeRuntime(balances: Record<string, number>, overrides?: { open?: boolean; consent?: boolean }) {
  const entryRefusal: { current: string | null } = { current: null };
  const pairOutcomes: PartiePairOutcome[] = [];
  const wallets = new Map(Object.entries(balances).map(([uid, available]) => [uid, { available, locked: 0 }]));
  const refs = new Set<string>();
  const lines: { uid: string; kind: string; lockedDelta: number; tableId?: unknown }[] = [];
  const seats = new Map<string, CashSeatDoc>();
  const parties: CashPartieDoc[] = [];
  const book = new CashTableBook({
    applyMovement: async (input) => {
      const wallet = wallets.get(input.uid) ?? { available: 0, locked: 0 };
      if (refs.has(input.ref)) return { applied: false, entry: {} as any, wallet: { uid: input.uid, ...wallet, createdAt: 0, updatedAt: 0 } };
      const after = computeMovement(wallet, input);
      wallets.set(input.uid, after);
      refs.add(input.ref);
      lines.push({ uid: input.uid, kind: input.kind, lockedDelta: input.lockedDelta, tableId: input.meta?.tableId });
      return { applied: true, entry: {} as any, wallet: { uid: input.uid, ...after, createdAt: 0, updatedAt: 0 } };
    },
    openSeat: async (doc) => void seats.set(doc.id, doc),
    addSeatBuyIn: async (id, amount) => {
      const seat = seats.get(id);
      if (seat) seat.buyInTotal += amount;
    },
    closeSeat: async (id, patch) => {
      const seat = seats.get(id);
      if (seat) Object.assign(seat, patch, { status: 'CLOSED' });
    },
    getSeat: async (id) => seats.get(id) ?? null,
    recordPartie: async (doc) => void parties.push(doc),
    sumTableLocked: async () => 0,
  });
  manager.setCashTableRuntimeForTest({
    book,
    getAccess: async () => ({ open: overrides?.open ?? true, settings: { ...DEFAULT_CASH_TABLE_SETTINGS, enabled: overrides?.open ?? true } }),
    hasConsent: async () => overrides?.consent ?? true,
    checkEntry: async () => entryRefusal.current,
    recordPartieOutcomes: async (outcomes) => void pairOutcomes.push(...outcomes),
  });
  return { book, wallets, lines, seats, parties, entryRefusal, pairOutcomes };
}

function connect(uid: string, options?: { provider?: string; verified?: boolean }) {
  const sent: any[] = [];
  const client = {
    socket: { readyState: 1, send: (raw: string) => sent.push(JSON.parse(raw)), close: () => undefined },
    playerId: uid,
    roomCode: null as string | null,
    reconnectToken: `tok_${uid}`,
    lastPing: Date.now(),
    isAuthenticated: options?.verified ?? true,
    authUid: options?.verified === false ? undefined : uid,
    authProvider: options?.provider ?? 'google.com',
  };
  manager.clients.set(uid, client);
  return { client, sent, lastError: () => [...sent].reverse().find((m) => m.type === 'ERROR')?.error as string | undefined };
}

const opened: string[] = [];

async function openPrivateTable(a: ReturnType<typeof connect>, b: ReturnType<typeof connect>, buyIn: number, bet = 25): Promise<MultiplayerRoom> {
  await manager.handleCashTableOpen(a.client, { type: 'CASH_TABLE_OPEN', playerName: 'Awa', cashTable: { betLevel: bet, capacity: 2, buyIn, isPublic: false } });
  const code = a.client.roomCode as string;
  opened.push(code);
  await manager.handleCashTableOpen(b.client, { type: 'CASH_TABLE_OPEN', playerName: 'Ben', cashTable: { roomCode: code, buyIn } });
  return RoomManager.getRoom(code) as MultiplayerRoom;
}

function start(a: ReturnType<typeof connect>) {
  manager.handleStartGame(a.client, { type: 'START_GAME', roomCode: a.client.roomCode });
}

function stateOf(room: MultiplayerRoom) {
  return manager.getOrCreateActiveState(room.id, room);
}

afterEach(() => {
  opened.splice(0).forEach((code) => RoomManager.clearRoomForTest(code));
  manager.clients.clear();
  manager.setCashTableRuntimeForTest(null);
});

describe('Table Cash — entrée', () => {
  it('reste fermée tant que Katika n’a pas ouvert, sans toucher au solde', async () => {
    const { wallets } = fakeRuntime({ a: 1000 }, { open: false });
    const a = connect('a');
    await manager.handleCashTableOpen(a.client, { type: 'CASH_TABLE_OPEN', cashTable: { betLevel: 5, capacity: 2, buyIn: 50, isPublic: true } });
    assert.match(a.lastError() ?? '', /fermées/);
    assert.deepEqual(wallets.get('a'), { available: 1000, locked: 0 });
    assert.equal(a.client.roomCode, null);
  });

  it('refuse un invité ou un compte non vérifié, quoi que dise le message', async () => {
    const { wallets } = fakeRuntime({ a: 1000, g: 1000 });
    const guest = connect('g', { verified: false });
    const anonymous = connect('a', { provider: 'anonymous' });
    for (const c of [guest, anonymous]) {
      await manager.handleCashTableOpen(c.client, { type: 'CASH_TABLE_OPEN', isGuest: false, authProvider: 'google.com', cashTable: { betLevel: 5, capacity: 2, buyIn: 50 } });
      assert.match(c.lastError() ?? '', /compte Google/);
    }
    assert.deepEqual(wallets.get('a'), { available: 1000, locked: 0 });
  });

  it('exige la confirmation 18 ans et argent réel', async () => {
    const { wallets } = fakeRuntime({ a: 1000 }, { consent: false });
    const a = connect('a');
    await manager.handleCashTableOpen(a.client, { type: 'CASH_TABLE_OPEN', cashTable: { betLevel: 5, capacity: 2, buyIn: 50 } });
    assert.match(a.lastError() ?? '', /18 ans/);
    assert.deepEqual(wallets.get('a'), { available: 1000, locked: 0 });
  });

  it('refuse un niveau inventé, une entrée hors bornes, un solde insuffisant', async () => {
    const { wallets } = fakeRuntime({ a: 60 });
    const a = connect('a');
    await manager.handleCashTableOpen(a.client, { type: 'CASH_TABLE_OPEN', cashTable: { betLevel: 7, capacity: 2, buyIn: 70 } });
    assert.match(a.lastError() ?? '', /niveau/);
    await manager.handleCashTableOpen(a.client, { type: 'CASH_TABLE_OPEN', cashTable: { betLevel: 5, capacity: 2, buyIn: 40 } });
    assert.match(a.lastError() ?? '', /comprise entre 50 et 250/);
    await manager.handleCashTableOpen(a.client, { type: 'CASH_TABLE_OPEN', cashTable: { betLevel: 10, capacity: 2, buyIn: 100 } });
    assert.match(a.lastError() ?? '', /insuffisant/);
    assert.deepEqual(wallets.get('a'), { available: 60, locked: 0 });
    assert.equal(a.client.roomCode, null);
  });

  it('un salon public regroupe les joueurs du même niveau, sans passer par la liste des tables gratuites', async () => {
    fakeRuntime({ a: 1000, b: 1000 });
    const a = connect('a');
    const b = connect('b');
    await manager.handleCashTableOpen(a.client, { type: 'CASH_TABLE_OPEN', playerName: 'Awa', cashTable: { betLevel: 5, capacity: 3, buyIn: 50, isPublic: true } });
    opened.push(a.client.roomCode as string);
    assert.deepEqual(RoomManager.getPublicRoomsList().filter((r) => r.id === a.client.roomCode), []);
    await manager.handleCashTableOpen(b.client, { type: 'CASH_TABLE_OPEN', playerName: 'Ben', cashTable: { betLevel: 5, capacity: 3, buyIn: 100, isPublic: true } });
    assert.equal(b.client.roomCode, a.client.roomCode);
    const room = RoomManager.getRoom(a.client.roomCode as string) as MultiplayerRoom;
    assert.deepEqual(room.players.map((p) => p.capital), [50, 100]);
  });

  it('un seul siège Cash à la fois, et le code ne fait pas entrer sans passer par Kora Cash', async () => {
    const { wallets } = fakeRuntime({ a: 1000, b: 1000, c: 1000 });
    const a = connect('a');
    const b = connect('b');
    const room = await openPrivateTable(a, b, 250);
    await manager.handleCashTableOpen(a.client, { type: 'CASH_TABLE_OPEN', cashTable: { betLevel: 5, capacity: 2, buyIn: 50 } });
    assert.match(a.lastError() ?? '', /déjà une table/);
    assert.equal(wallets.get('a')?.locked, 250);

    const c = connect('c');
    manager.handleJoinRoom(c.client, { type: 'JOIN_ROOM', roomCode: room.id, playerName: 'Curieux', playerId: 'a' });
    assert.match(c.lastError() ?? '', /depuis Kora Cash/);
    assert.equal(room.players.some((p) => p.id === 'c'), false);
    assert.equal(c.client.playerId, 'c');
  });

  it('quitter le salon d’attente rend toute l’entrée', async () => {
    const { wallets, book } = fakeRuntime({ a: 1000, b: 1000 });
    const a = connect('a');
    const b = connect('b');
    const room = await openPrivateTable(a, b, 250);
    RoomManager.forceRemovePlayer(room.id, 'b', true);
    await book.flush(room.cash!.tableId);
    assert.deepEqual(wallets.get('b'), { available: 1000, locked: 0 });
    RoomManager.forceRemovePlayer(room.id, 'a', true);
    await book.flush(room.cash!.tableId);
    assert.deepEqual(wallets.get('a'), { available: 1000, locked: 0 });
  });
});

describe('Table Cash — jeu', () => {
  it('démarre avec le capital de chacun, sans aucun bot, et n’en accepte pas ensuite', async () => {
    fakeRuntime({ a: 1000, b: 1000 });
    const a = connect('a');
    const b = connect('b');
    await manager.handleCashTableOpen(a.client, { type: 'CASH_TABLE_OPEN', playerName: 'Awa', cashTable: { betLevel: 25, capacity: 2, buyIn: 250, isPublic: false } });
    const code = a.client.roomCode as string;
    opened.push(code);
    await manager.handleCashTableOpen(b.client, { type: 'CASH_TABLE_OPEN', playerName: 'Ben', cashTable: { roomCode: code, buyIn: 500 } });
    start(a);
    const room = RoomManager.getRoom(code) as MultiplayerRoom;
    assert.equal(room.status, 'PLAYING');
    assert.deepEqual(room.gameState?.players.map((p) => p.capital), [225, 475]);
    assert.equal(room.gameState?.pot, 50);
    assert.equal(room.players.every((p) => p.isHuman), true);

    manager.handleVoteBots(a.client, { type: 'VOTE_BOTS' });
    manager.handleUpdateSettings(a.client, { type: 'UPDATE_SETTINGS', settings: { fillWithBots: true, baseBet: 1, initialCapital: 99999 } });
    assert.equal(room.fillWithBots, false);
    assert.equal(room.baseBet, 25);
  });

  it('un départ en pleine partie : forfait, commission sur le pot, chacun récupère son dû', async () => {
    const { wallets, book, parties, seats } = fakeRuntime({ a: 300, b: 300 });
    const a = connect('a');
    const b = connect('b');
    const room = await openPrivateTable(a, b, 250);
    start(a);
    const tableId = room.cash!.tableId;

    RoomManager.forceRemovePlayer(room.id, 'a', true);
    await book.flush(tableId);
    // a a perdu sa mise de 25 : il récupère 225. Pot de 50, commission floor(2,5) = 2 : b reçoit 48.
    assert.deepEqual(wallets.get('a'), { available: 275, locked: 0 });
    assert.equal(room.cash?.lastRake, 2);
    assert.deepEqual(parties.map((p) => p.rake), [2]);

    // Seul à table : la table se termine aussitôt et b récupère tout, gain compris.
    assert.equal(room.status, 'MANCHE_OVER');
    assert.equal(room.cash?.closed, true);
    assert.deepEqual(wallets.get('b'), { available: 323, locked: 0 });
    assert.equal(seats.get(seatDocId(tableId, 'b'))?.status, 'CLOSED');
    // Conservation : ce qui manque au total est exactement la commission.
    assert.equal(600 - (wallets.get('a')!.available + wallets.get('b')!.available), 2);

    // Une table terminée ne repart pas.
    manager.handleStartGame(b.client, { type: 'START_GAME', roomCode: room.id });
    assert.match(b.lastError() ?? '', /terminée/);
    assert.equal(room.status, 'MANCHE_OVER');
  });

  it('le résultat est marqué Cash, n’alimente pas les statistiques et porte la commission', async () => {
    fakeRuntime({ a: 300, b: 300 });
    const a = connect('a');
    const b = connect('b');
    const room = await openPrivateTable(a, b, 250);
    start(a);
    RoomManager.forceRemovePlayer(room.id, 'a', true);
    const result = stateOf(room).partieResults?.[0];
    assert.equal(result?.cash, true);
    assert.equal(result?.rake, 2);
    assert.equal(result?.burned, 0);
  });

  it('sortir entre deux parties rend tout le capital et réclamer la victoire est impossible', async () => {
    const { wallets, book } = fakeRuntime({ a: 1000, b: 1000, c: 1000 });
    const a = connect('a');
    const b = connect('b');
    const c = connect('c');
    await manager.handleCashTableOpen(a.client, { type: 'CASH_TABLE_OPEN', playerName: 'Awa', cashTable: { betLevel: 25, capacity: 3, buyIn: 250, isPublic: false } });
    const code = a.client.roomCode as string;
    opened.push(code);
    await manager.handleCashTableOpen(b.client, { type: 'CASH_TABLE_OPEN', playerName: 'Ben', cashTable: { roomCode: code, buyIn: 250 } });
    await manager.handleCashTableOpen(c.client, { type: 'CASH_TABLE_OPEN', playerName: 'Cid', cashTable: { roomCode: code, buyIn: 250 } });
    start(a);
    const room = RoomManager.getRoom(code) as MultiplayerRoom;
    assert.equal(ServerGameEngine.claimForfeitVictory(room, 'a', () => undefined, stateOf(room)), false);

    RoomManager.forceRemovePlayer(code, 'c', true);
    await book.flush(room.cash!.tableId);
    assert.deepEqual(wallets.get('c'), { available: 975, locked: 0 });
    assert.equal(room.status, 'PLAYING');
    assert.equal(room.players.every((p) => p.isHuman), true);
  });
});

describe('Table Cash — protection', () => {
  it('une pause ou une limite atteinte ferme l’entrée, sans toucher au solde', async () => {
    const { wallets, entryRefusal } = fakeRuntime({ a: 1000 });
    entryRefusal.current = 'Tu as choisi une pause de Kora Cash.';
    const a = connect('a');
    await manager.handleCashTableOpen(a.client, { type: 'CASH_TABLE_OPEN', cashTable: { betLevel: 5, capacity: 2, buyIn: 50 } });
    assert.match(a.lastError() ?? '', /pause/);
    assert.deepEqual(wallets.get('a'), { available: 1000, locked: 0 });
    assert.equal(a.client.roomCode, null);
  });

  it('une limite atteinte ferme la recave mais laisse finir la table', async () => {
    const { wallets, entryRefusal } = fakeRuntime({ a: 1000, b: 1000 });
    const a = connect('a');
    const b = connect('b');
    const room = await openPrivateTable(a, b, 250);
    start(a);
    entryRefusal.current = 'Tu as atteint ta limite de pertes du jour.';
    room.status = 'PARTIE_OVER';
    await manager.handleCashTableRebuy(a.client, { type: 'CASH_TABLE_REBUY', cashAmount: 100 });
    assert.match(a.lastError() ?? '', /limite de pertes/);
    assert.equal(wallets.get('a')?.locked, 250);
    assert.equal(room.cash?.seats.a.open, true);
  });

  it('chaque partie remonte qui a pris quoi à qui, sans rien bloquer', async () => {
    const { pairOutcomes, book } = fakeRuntime({ a: 300, b: 300 });
    const a = connect('a');
    const b = connect('b');
    const room = await openPrivateTable(a, b, 250);
    start(a);
    RoomManager.forceRemovePlayer(room.id, 'a', true);
    await book.flush(room.cash!.tableId);
    assert.deepEqual(pairOutcomes, [{ winner: 'b', loser: 'a', amount: 25, forfeit: true }]);
  });
});

describe('Table Cash — démarrage incomplet', () => {
  async function tableOfFour(players: ReturnType<typeof connect>[]) {
    const [host, ...others] = players;
    await manager.handleCashTableOpen(host.client, { type: 'CASH_TABLE_OPEN', playerName: 'Hote', cashTable: { betLevel: 25, capacity: 4, buyIn: 250, isPublic: false } });
    const code = host.client.roomCode as string;
    opened.push(code);
    for (const other of others) {
      await manager.handleCashTableOpen(other.client, { type: 'CASH_TABLE_OPEN', playerName: other.client.playerId, cashTable: { roomCode: code, buyIn: 250 } });
    }
    return RoomManager.getRoom(code) as MultiplayerRoom;
  }

  it('une table de 4 places démarre à 3 humains, sans bot, et ses places se ferment', async () => {
    fakeRuntime({ a: 300, b: 300, c: 300 });
    const players = [connect('a'), connect('b'), connect('c')];
    const room = await tableOfFour(players);
    start(players[0]);
    assert.equal(room.status, 'PLAYING');
    assert.equal(room.gameState?.players.length, 3);
    assert.equal(room.players.every((p) => p.isHuman), true);
    assert.equal(room.maxPlayers, 3);
    assert.equal(room.gameState?.pot, 75);

    const late = connect('d');
    await manager.handleCashTableOpen(late.client, { type: 'CASH_TABLE_OPEN', cashTable: { roomCode: room.id, buyIn: 250 } });
    assert.match(late.lastError() ?? '', /déjà commencé/);
  });

  it('un humain seul ne peut pas démarrer', async () => {
    fakeRuntime({ a: 300 });
    const players = [connect('a')];
    const room = await tableOfFour(players);
    start(players[0]);
    assert.equal(room.status, 'LOBBY');
    assert.match(players[0].lastError() ?? '', /au moins 2 joueurs/);
  });

  it('un absent au lancement ne reçoit pas de cartes et récupère son entrée', async () => {
    const { wallets, book } = fakeRuntime({ a: 300, b: 300, c: 300 });
    const players = [connect('a'), connect('b'), connect('c')];
    const room = await tableOfFour(players);
    room.players.find((p) => p.id === 'c')!.connected = false;
    start(players[0]);
    assert.equal(room.status, 'PLAYING');
    assert.deepEqual(room.gameState?.players.map((p) => p.id), ['a', 'b']);
    assert.equal(room.maxPlayers, 2);
    await book.flush(room.cash!.tableId);
    assert.deepEqual(wallets.get('c'), { available: 300, locked: 0 });
    assert.equal(room.cash?.seats.c.open, false);
  });

  it('un salon public incomplet démarre par le décompte', async () => {
    fakeRuntime({ a: 300, b: 300 });
    const a = connect('a');
    const b = connect('b');
    await manager.handleCashTableOpen(a.client, { type: 'CASH_TABLE_OPEN', playerName: 'Awa', cashTable: { betLevel: 25, capacity: 4, buyIn: 250, isPublic: true } });
    const code = a.client.roomCode as string;
    opened.push(code);
    const room = RoomManager.getRoom(code) as MultiplayerRoom;
    assert.equal(room.autoStartCountdownAt ?? null, null);
    await manager.handleCashTableOpen(b.client, { type: 'CASH_TABLE_OPEN', playerName: 'Ben', cashTable: { betLevel: 25, capacity: 4, buyIn: 250, isPublic: true } });
    assert.equal(b.client.roomCode, code);
    assert.ok(room.autoStartCountdownAt);
    assert.equal(room.fillWithBots, false);
  });
});

describe('Table Cash — fin normale d’une partie', () => {
  function endWith(room: MultiplayerRoom, winnerIndex: number, winningValue: number = 6) {
    const gs = room.gameState!;
    stateOf(room).onKoraMoment = undefined; // pas d'écriture Firestore pendant le test
    const card = { id: 'c', suit: 'SPADES', value: winningValue } as any;
    gs.tricksHistory = [1, 2, 3, 4, 5].map((trickNumber) => ({
      trickNumber,
      winnerIndex,
      winnerName: gs.players[winnerIndex].name,
      winningCard: card,
      leadSuit: 'SPADES',
      leadPlayerIndex: winnerIndex,
      leadPlayerName: gs.players[winnerIndex].name,
      isComplete: true,
      plays: gs.players.map((_, playerIndex) => ({ playerIndex, card })),
    })) as any;
    (ServerGameEngine as any).resolvePartieOver(room, (r: MultiplayerRoom) => RoomManager.broadcastRoomState(r.id), stateOf(room));
  }

  it('le gagnant reçoit le pot moins la commission, et le registre suit', async () => {
    const { wallets, book, parties } = fakeRuntime({ a: 300, b: 300 });
    const a = connect('a');
    const b = connect('b');
    const room = await openPrivateTable(a, b, 250);
    start(a);
    endWith(room, 1);
    await book.flush(room.cash!.tableId);
    assert.equal(room.status, 'PARTIE_OVER');
    assert.deepEqual(room.players.map((p) => p.capital), [225, 273]);
    assert.deepEqual(wallets.get('a'), { available: 50, locked: 225 });
    assert.deepEqual(wallets.get('b'), { available: 50, locked: 273 });
    assert.deepEqual(parties.map((p) => p.rake), [2]);
    const result = stateOf(room).partieResults?.[0];
    assert.equal(result?.rake, 2);
    assert.equal(result?.participants.find((p: any) => p.playerId === 'b')?.net, 23);
  });

  it('Double Kora : la pénalité du perdant va au pot et la commission porte sur le tout', async () => {
    const { wallets, book } = fakeRuntime({ a: 300, b: 300 });
    const a = connect('a');
    const b = connect('b');
    const room = await openPrivateTable(a, b, 250);
    start(a);
    endWith(room, 1, 3);
    await book.flush(room.cash!.tableId);
    // Pot 50 + pénalité 75 = 125, commission floor(6,25) = 6 : b reçoit 119.
    assert.deepEqual(room.players.map((p) => p.capital), [150, 344]);
    assert.equal(stateOf(room).partieResults?.[0]?.rake, 6);
    assert.equal(wallets.get('a')?.locked, 150);
    assert.equal(wallets.get('b')?.locked, 344);
  });

  it('un perdant à court reste à table le temps de recaver, même si le gagnant est prêt', async () => {
    const { book } = fakeRuntime({ a: 300, b: 300 });
    const a = connect('a');
    const b = connect('b');
    const room = await openPrivateTable(a, b, 250);
    start(a);
    const loser = room.gameState!.players[0];
    loser.capital = 10;
    room.players[0].capital = 10;
    endWith(room, 1);
    await book.flush(room.cash!.tableId);
    assert.equal(room.status, 'PARTIE_OVER');
    assert.equal(room.players[0].isEliminated, true);
    assert.equal(room.cash?.closed, undefined);

    manager.handleReadyNextPartie(b.client, { type: 'READY_NEXT_PARTIE' });
    manager.handleForceNextPartie(b.client, { type: 'FORCE_NEXT_PARTIE' });
    assert.equal(room.status, 'PARTIE_OVER');
    assert.equal(room.cash?.seats.a.open, true);

    await manager.handleCashTableRebuy(a.client, { type: 'CASH_TABLE_REBUY', cashAmount: 40 });
    assert.equal(room.players[0].isEliminated, false);
    assert.equal(room.players[0].capital, 50);
  });

  it('pot partagé quand le gagnant était un relais : la commission est prélevée une fois', async () => {
    const { wallets, book } = fakeRuntime({ a: 300, b: 300, c: 300 });
    const a = connect('a');
    const b = connect('b');
    const c = connect('c');
    await manager.handleCashTableOpen(a.client, { type: 'CASH_TABLE_OPEN', playerName: 'Awa', cashTable: { betLevel: 25, capacity: 3, buyIn: 250, isPublic: false } });
    const code = a.client.roomCode as string;
    opened.push(code);
    await manager.handleCashTableOpen(b.client, { type: 'CASH_TABLE_OPEN', playerName: 'Ben', cashTable: { roomCode: code, buyIn: 250 } });
    await manager.handleCashTableOpen(c.client, { type: 'CASH_TABLE_OPEN', playerName: 'Cid', cashTable: { roomCode: code, buyIn: 250 } });
    start(a);
    const room = RoomManager.getRoom(code) as MultiplayerRoom;
    room.gameState!.players[2].relayAbsent = true;
    endWith(room, 2);
    await book.flush(room.cash!.tableId);
    // Pot de 75, commission floor(3,75) = 3, reste 72 partagés : 36 chacun. Le relais perd sa mise, garde son capital.
    assert.deepEqual(room.players.map((p) => p.capital), [261, 261, 225]);
    assert.equal(wallets.get('a')?.locked, 261);
    assert.equal(wallets.get('c')?.locked, 225);
    assert.equal(stateOf(room).partieResults?.[0]?.rake, 3);
  });
});

describe('Table Cash — recave et capital insuffisant', () => {
  async function tableAfterPartie(balances: Record<string, number>, capitals: { a: number; b: number }) {
    const runtime = fakeRuntime(balances);
    const a = connect('a');
    const b = connect('b');
    const room = await openPrivateTable(a, b, 250);
    start(a);
    const gs = room.gameState!;
    const set = (uid: string, capital: number, eliminated: boolean) => {
      [room.players.find((p) => p.id === uid), gs.players.find((p) => p.id === uid)].forEach((p) => {
        if (!p) return;
        p.capital = capital;
        p.score = capital;
        p.isEliminated = eliminated;
      });
    };
    gs.pot = 0;
    set('a', capitals.a, capitals.a < room.baseBet);
    set('b', capitals.b, capitals.b < room.baseBet);
    gs.phase = 'PARTIE_OVER';
    room.status = 'PARTIE_OVER';
    manager.settleCashPartie({ mancheNumber: 1, partieCount: 1, baseBet: 25, rake: 0, participants: [] }, room);
    await runtime.book.flush(room.cash!.tableId);
    return { ...runtime, a, b, room };
  }

  it('une recave ramène à la table le joueur à court, dans la limite du maximum', async () => {
    const { a, room, wallets } = await tableAfterPartie({ a: 1000, b: 1000 }, { a: 10, b: 490 });
    assert.equal(wallets.get('a')?.locked, 10);

    await manager.handleCashTableRebuy(a.client, { type: 'CASH_TABLE_REBUY', cashAmount: 1241 });
    assert.match(a.lastError() ?? '', /dépasser 1250/);
    assert.equal(wallets.get('a')?.locked, 10);

    await manager.handleCashTableRebuy(a.client, { type: 'CASH_TABLE_REBUY', cashAmount: 100 });
    const rp = room.players.find((p) => p.id === 'a')!;
    assert.equal(rp.capital, 110);
    assert.equal(rp.isEliminated, false);
    assert.equal(room.gameState?.players.find((p) => p.id === 'a')?.isEliminated, false);
    assert.deepEqual(wallets.get('a'), { available: 650, locked: 110 });
    assert.equal(room.cash?.seats.a.settled, 110);
  });

  it('sans recave, le joueur à court récupère son reste et la table se termine', async () => {
    const { room, wallets, book } = await tableAfterPartie({ a: 1000, b: 1000 }, { a: 10, b: 490 });
    ServerGameEngine.advanceToNextPartie(room, (r) => RoomManager.broadcastRoomState(r.id), stateOf(room));
    RoomManager.broadcastRoomState(room.id);
    await book.flush(room.cash!.tableId);
    assert.equal(room.status, 'MANCHE_OVER');
    assert.deepEqual(wallets.get('a'), { available: 760, locked: 0 });
    assert.deepEqual(wallets.get('b'), { available: 1240, locked: 0 });
  });

  it('refuse la recave en pleine partie', async () => {
    const { wallets } = fakeRuntime({ a: 1000, b: 1000 });
    const a = connect('a');
    const b = connect('b');
    await openPrivateTable(a, b, 250);
    start(a);
    await manager.handleCashTableRebuy(a.client, { type: 'CASH_TABLE_REBUY', cashAmount: 100 });
    assert.match(a.lastError() ?? '', /entre deux parties/);
    assert.deepEqual(wallets.get('a'), { available: 750, locked: 250 });
  });

  it('ne laisse pas monter la mise pendant qu’un joueur est absent', async () => {
    const { a, room } = await tableAfterPartie({ a: 1000, b: 1000 }, { a: 240, b: 260 });
    const absent = room.players.find((p) => p.id === 'b')!;
    absent.connected = false;
    manager.handleProposeBetIncrease(a.client, { type: 'PROPOSE_BET_INCREASE', proposedBet: 50 });
    assert.match(a.lastError() ?? '', /absent/);
    assert.equal(room.baseBet, 25);
    assert.equal(room.betIncreaseProposal ?? null, null);
  });
});

describe('Table Cash — pannes', () => {
  it('une table fermée en cours de partie annule la partie : chacun récupère son capital d’avant', async () => {
    const { wallets, book } = fakeRuntime({ a: 300, b: 300 });
    const a = connect('a');
    const b = connect('b');
    const room = await openPrivateTable(a, b, 250);
    start(a);
    const tableId = room.cash!.tableId;
    opened.splice(0);
    RoomManager.adminCloseRoom(room.id);
    await book.flush(tableId);
    assert.deepEqual(wallets.get('a'), { available: 300, locked: 0 });
    assert.deepEqual(wallets.get('b'), { available: 300, locked: 0 });
  });

  it('un joueur retiré par un autre chemin que la sortie est remboursé au passage suivant', async () => {
    const { wallets, book } = fakeRuntime({ a: 300, b: 300 });
    const a = connect('a');
    const b = connect('b');
    const room = await openPrivateTable(a, b, 250);
    room.players = room.players.filter((p) => p.id !== 'b');
    RoomManager.broadcastRoomState(room.id);
    await book.flush(room.cash!.tableId);
    assert.deepEqual(wallets.get('b'), { available: 300, locked: 0 });
  });

  it('une table Cash ne revient pas d’un redémarrage : l’argent reste en table pour Katika', async () => {
    const { seats, wallets } = fakeRuntime({ a: 300, b: 300 });
    const a = connect('a');
    const b = connect('b');
    const room = await openPrivateTable(a, b, 250);
    assert.equal(seats.get(seatDocId(room.cash!.tableId, 'a'))?.status, 'OPEN');
    assert.equal(wallets.get('a')?.locked, 250);
    assert.equal(RoomManager.isCashTableLive(room.cash!.tableId), true);
    assert.equal(RoomManager.listCashTables().length, 1);
  });
});
