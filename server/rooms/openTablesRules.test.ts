import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OpenTableRoomView, buildCashOpenLevels, buildFreeOpenTables } from './openTablesRules';

function room(id: string, patch: Partial<OpenTableRoomView> = {}): OpenTableRoomView {
  return {
    id,
    cash: false,
    isPublic: true,
    status: 'LOBBY',
    maxPlayers: 4,
    baseBet: 10,
    hostName: `Hôte ${id}`,
    players: [{ id: `h-${id}`, name: `Hôte ${id}`, isHuman: true, isSpectator: false, connected: true }],
    ...patch,
  };
}

const none = new Set<string>();
function free(rooms: OpenTableRoomView[], extra: Partial<Parameters<typeof buildFreeOpenTables>[0]> = {}) {
  return buildFreeOpenTables({ rooms, selfId: 'me', friendIds: none, isHidden: () => false, isBlockedWith: () => false, limit: 30, ...extra });
}

describe('tables gratuites ouvertes', () => {
  it('liste un salon public en attente avec une place libre', () => {
    const [t] = free([room('A1')]);
    assert.equal(t.kind, 'PUBLIC');
    assert.equal(t.id, 'A1');
    assert.equal(t.seated, 1);
    assert.equal(t.capacity, 4);
  });

  it('écarte les tables Cash, en cours, pleines, vides ou sans joueur connecté', () => {
    const full = room('F', { maxPlayers: 2, players: [1, 2].map((n) => ({ id: `p${n}`, name: 'x', isHuman: true, isSpectator: false, connected: true })) });
    const ghost = room('G', { players: [{ id: 'g', name: 'g', isHuman: true, isSpectator: false, connected: false }] });
    const rooms = [room('C', { cash: true }), room('P', { status: 'PLAYING' }), full, room('E', { players: [] }), ghost];
    assert.equal(free(rooms).length, 0);
  });

  it('écarte ma propre table', () => {
    const mine = room('M', { players: [{ id: 'me', name: 'Moi', isHuman: true, isSpectator: false, connected: true }] });
    assert.equal(free([mine]).length, 0);
  });

  it('une table privée n\'apparaît que si un ami confirmé y est assis', () => {
    const priv = room('X', { isPublic: false });
    assert.equal(free([priv]).length, 0);
    const [t] = free([priv], { friendIds: new Set(['h-X']) });
    assert.equal(t.kind, 'FRIEND');
    assert.deepEqual(t.friendNames, ['Hôte X']);
  });

  it('un ami qui apparaît hors ligne n\'expose pas sa table privée', () => {
    const priv = room('X', { isPublic: false });
    assert.equal(free([priv], { friendIds: new Set(['h-X']), isHidden: () => true }).length, 0);
  });

  it('écarte toute table où est assis un joueur bloqué, dans un sens ou dans l\'autre', () => {
    const rooms = [room('A'), room('B')];
    const res = free(rooms, { isBlockedWith: (id) => id === 'h-B' });
    assert.deepEqual(res.map((t) => t.id), ['A']);
  });

  it('place les tables d\'amis d\'abord et respecte la limite', () => {
    const rooms = [room('A'), room('B', { isPublic: false }), room('C')];
    const res = free(rooms, { friendIds: new Set(['h-B']), limit: 2 });
    assert.equal(res.length, 2);
    assert.equal(res[0].id, 'B');
  });
});

describe('niveaux Kora Cash ouverts', () => {
  const cash = (id: string, bet: number, seats: number, patch: Partial<OpenTableRoomView> = {}) =>
    room(id, { cash: true, baseBet: bet, cashOpenSeats: seats, cashRakePercent: 5, ...patch });

  it('regroupe par mise sans exposer ni hôte ni code', () => {
    const levels = buildCashOpenLevels([cash('A', 500, 1), cash('B', 500, 3), cash('C', 100, 2)]);
    assert.deepEqual(levels, [
      { baseBet: 100, tables: 1, freeSeats: 2, rakePercent: 5 },
      { baseBet: 500, tables: 2, freeSeats: 4, rakePercent: 5 },
    ]);
    assert.ok(!JSON.stringify(levels).includes('Hôte'));
  });

  it('écarte les tables privées, fermées, pleines ou en cours', () => {
    const levels = buildCashOpenLevels([
      cash('P', 500, 1, { isPublic: false }),
      cash('K', 500, 1, { cashClosed: true }),
      cash('F', 500, 4),
      cash('G', 500, 2, { status: 'PLAYING' }),
      room('FREE'),
    ]);
    assert.deepEqual(levels, []);
  });
});
