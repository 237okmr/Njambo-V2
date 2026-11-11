/**
 * Rendez-vous, côté serveur : création, public prévenu, réponses, annulation, rappels, Kora Cash sans mise.
 */

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../rooms/roomManager';
import { pushService } from '../pushService';
import { DEFAULT_CASH_TABLE_SETTINGS } from '../cash/cashTableRules';
import type { Appointment } from './appointmentsRules';
import type { UserPresence } from '../../src/types';

const manager = RoomManager as any;
const MIN = 60_000;

function connect(uid: string, verified = true) {
  const sent: any[] = [];
  const client = {
    socket: { readyState: 1, send: (raw: string) => sent.push(JSON.parse(raw)), close: () => undefined },
    playerId: uid, roomCode: null, reconnectToken: `tok_${uid}`, lastPing: Date.now(), isAuthenticated: verified, authUid: verified ? uid : undefined, authProvider: 'google.com',
  };
  manager.clients.set(uid, client);
  manager.userPresences.set(uid, { userId: uid, displayName: `Nom ${uid}`, avatarId: 'a1', status: 'ONLINE_IDLE', lastSeenAt: Date.now() } as UserPresence);
  manager.confirmedFriendsCache.set(uid, { ids: new Set(), fetchedAt: Date.now() });
  manager.blockedIdsCache.set(uid, { ids: new Set(), fetchedAt: Date.now() });
  return { client, sent, last: (type: string) => [...sent].reverse().find((m) => m.type === type), all: (type: string) => sent.filter((m) => m.type === type) };
}
const friends = (uid: string, ids: string[]) => manager.confirmedFriendsCache.set(uid, { ids: new Set(ids), fetchedAt: Date.now() });
const blocks = (uid: string, ids: string[]) => manager.blockedIdsCache.set(uid, { ids: new Set(ids), fetchedAt: Date.now() });
function alerts(uid: string, on: boolean) {
  manager.presenceSettingsCache.set(uid, { hidden: false, friendsOnlyInvites: false, searchAlerts: on });
}

const stored = new Map<string, Appointment>();
let loads = 0;
let saveFails = false;
const pushed: Array<{ uid: string; title: string; data: any }> = [];
const realPush = pushService.sendNotificationToUser.bind(pushService);
let cashConsent = true;

beforeEach(() => {
  stored.clear();
  loads = 0;
  saveFails = false;
  pushed.length = 0;
  cashConsent = true;
  for (const m of ['clients', 'userPresences', 'confirmedFriendsCache', 'blockedIdsCache', 'presenceSettingsCache', 'cashSearchAccessCache', 'cashViewAccessCache']) manager[m].clear();
  RoomManager.updateEngineConfig({
    appointmentHorizonHours: 48, appointmentMinLeadSeconds: 120, appointmentReminderLeadMinutes: 10, appointmentGraceMinutes: 60,
    appointmentMaxActivePerPlayer: 3, appointmentMaxInvitees: 10, searchCallMaxRecipients: 20,
  });
  RoomManager.setPresenceSettingsRuntimeForTest({ load: async () => ({ hidden: false, friendsOnlyInvites: false, searchAlerts: false }), save: async () => undefined });
  RoomManager.setAppointmentsRuntimeForTest({
    loadUpcoming: async () => {
      loads += 1;
      return [...stored.values()];
    },
    save: async (a) => {
      if (saveFails) throw new Error('hors ligne');
      stored.set(a.id, a);
    },
    remove: async (id) => {
      stored.delete(id);
    },
  });
  manager.setCashTableRuntimeForTest({
    book: {} as any,
    getAccess: async () => ({ open: true, settings: { ...DEFAULT_CASH_TABLE_SETTINGS, enabled: true } }),
    hasConsent: async () => cashConsent,
    checkEntry: async () => null,
    recordPartieOutcomes: async () => undefined,
  });
  (pushService as any).sendNotificationToUser = async (uid: string, payload: any) => {
    pushed.push({ uid, title: payload.title, data: payload.data });
    return { success: 1, failed: 0, deferred: 0 };
  };
});

afterEach(() => {
  manager.setCashTableRuntimeForTest(null);
  RoomManager.setPresenceSettingsRuntimeForTest(null);
  RoomManager.setAppointmentsRuntimeForTest(null);
  (pushService as any).sendNotificationToUser = realPush;
});

const flush = () => new Promise((resolve) => setImmediate(resolve));
const create = (c: ReturnType<typeof connect>, over: Record<string, unknown> = {}) =>
  manager.handleCreateAppointment(c.client, {
    type: 'CREATE_APPOINTMENT', playerId: c.client.playerId, playerName: 'Awa', searchMode: 'FREE', startsAt: Date.now() + 30 * MIN, inviteeIds: ['f1'], openToAlerts: false, ...over,
  });
const respond = (c: ReturnType<typeof connect>, appointmentId: string, answer: 'YES' | 'NO') =>
  manager.handleRespondAppointment(c.client, { type: 'RESPOND_APPOINTMENT', playerId: c.client.playerId, playerName: c.client.playerId, appointmentId, answer });

function setup() {
  const org = connect('org');
  friends('org', ['f1', 'f2']);
  const f1 = connect('f1');
  friends('f1', ['org']);
  const f2 = connect('f2');
  friends('f2', ['org']);
  return { org, f1, f2 };
}

describe('créer un rendez-vous', () => {
  it('refuse un invité, une heure passée et un rendez-vous sans public', async () => {
    const guest = connect('usr_g', false);
    await create(guest);
    assert.equal(guest.last('ERROR')?.errorCode, 'AUTH_REQUIRED');

    const { org } = setup();
    await create(org, { startsAt: Date.now() - MIN });
    assert.match(org.last('ERROR').error, /trop proche/);
    await create(org, { inviteeIds: ['inconnu'] });
    assert.match(org.last('ERROR').error, /au moins un ami/);
    assert.equal(stored.size, 0);
  });

  it('enregistre, prévient les amis invités (même hors ligne) et pas les autres', async () => {
    const { org, f1, f2 } = setup();
    friends('org', ['f1', 'f2', 'off']);
    await create(org, { inviteeIds: ['f1', 'off'] });
    await flush();
    assert.equal(stored.size, 1);
    assert.deepEqual(pushed.map((p) => p.uid).sort(), ['f1', 'off']);
    assert.equal(pushed[0].data.type, 'APPOINTMENT');
    assert.equal(f1.last('APPOINTMENTS_UPDATE').appointments[0].organizerId, 'org');
    assert.equal(f2.last('APPOINTMENTS_UPDATE'), undefined);
    assert.equal(org.last('APPOINTMENTS_UPDATE').appointments[0].isMine, true);
  });

  it('un rendez-vous ouvert prévient les inconnus en ligne qui ont activé les alertes, seulement ceux-là', async () => {
    const { org } = setup();
    const optIn = connect('s_in');
    const optOut = connect('s_out');
    alerts('s_in', true);
    alerts('s_out', false);
    await create(org, { inviteeIds: ['f1'], openToAlerts: true });
    await flush();
    assert.deepEqual(pushed.map((p) => p.uid).sort(), ['f1', 's_in']);
    assert.equal(optIn.last('APPOINTMENTS_UPDATE').appointments.length, 1);
    assert.equal(optOut.last('APPOINTMENTS_UPDATE'), undefined);

    // Non ouvert : l'inconnu avec alertes n'est pas prévenu.
    pushed.length = 0;
    manager.appointments.clear();
    stored.clear();
    await create(org, { inviteeIds: ['f1'], openToAlerts: false });
    await flush();
    assert.deepEqual(pushed.map((p) => p.uid), ['f1']);
  });

  it('ne prévient pas un joueur bloqué, et limite le nombre de rendez-vous à venir', async () => {
    const { org } = setup();
    blocks('f1', ['org']);
    await create(org, { inviteeIds: ['f1', 'f2'] });
    await flush();
    assert.deepEqual(pushed.map((p) => p.uid), ['f2']);
    RoomManager.updateEngineConfig({ appointmentMaxActivePerPlayer: 1 });
    await create(org);
    assert.match(org.last('ERROR').error, /assez de rendez-vous/);
  });

  it('refuse si l\'enregistrement échoue, sans rien notifier', async () => {
    const { org } = setup();
    saveFails = true;
    await create(org);
    await flush();
    assert.match(org.last('ERROR').error, /pas pu être enregistré/);
    assert.equal(pushed.length, 0);
    assert.equal(manager.appointments.size, 0);
  });

  it('relit les rendez-vous stockés une seule fois', async () => {
    const { org } = setup();
    await create(org);
    await create(org, { startsAt: Date.now() + 40 * MIN });
    assert.equal(loads, 1);
  });
});

describe('Kora Cash', () => {
  it('refuse sans 18 ans confirmés et ne crée aucune table', async () => {
    const { org } = setup();
    cashConsent = false;
    manager.rooms.clear();
    await create(org, { searchMode: 'CASH' });
    assert.match(org.last('ERROR').error, /Kora Cash/);
    assert.equal(stored.size, 0);
  });

  it('ne prévient que les invités qui ont accès au Cash', async () => {
    const { org } = setup();
    manager.cashSearchAccessCache.set('org', { allowed: true, fetchedAt: Date.now() });
    manager.cashSearchAccessCache.set('f1', { allowed: true, fetchedAt: Date.now() });
    manager.cashSearchAccessCache.set('f2', { allowed: false, fetchedAt: Date.now() });
    manager.rooms.clear();
    await create(org, { searchMode: 'CASH', inviteeIds: ['f1', 'f2'] });
    await flush();
    assert.deepEqual(pushed.map((p) => p.uid), ['f1']);
    assert.equal(pushed[0].data.mode, 'CASH');
    assert.equal(manager.rooms.size, 0);
  });
});

describe('répondre', () => {
  async function withAppointment() {
    const ctx = setup();
    await create(ctx.org, { inviteeIds: ['f1', 'f2'] });
    await flush();
    pushed.length = 0;
    return { ...ctx, id: [...stored.keys()][0] };
  }

  it('enregistre un oui, prévient l\'organisateur, puis accepte un changement d\'avis', async () => {
    const { org, f1, id } = await withAppointment();
    await respond(f1, id, 'YES');
    await flush();
    assert.deepEqual(stored.get(id)!.yes.map((p) => p.userId), ['f1']);
    assert.ok(pushed.some((p) => p.uid === 'org' && /sera là/.test(p.title)));
    assert.equal(org.last('APPOINTMENTS_UPDATE').appointments[0].yes.length, 1);
    pushed.length = 0;
    await respond(f1, id, 'NO');
    await flush();
    assert.deepEqual(stored.get(id)!.yes, []);
    assert.deepEqual(stored.get(id)!.no, ['f1']);
    assert.equal(pushed.length, 0);
  });

  it('refuse un rendez-vous invisible, échu ou inconnu, et l\'organisateur lui-même', async () => {
    const { org, id } = await withAppointment();
    const stranger = connect('stranger');
    await respond(stranger, id, 'YES');
    assert.match(stranger.last('ERROR').error, /plus disponible/);
    await respond(org, id, 'YES');
    assert.match(org.last('ERROR').error, /plus disponible/);
    const f1 = manager.clients.get('f1');
    await manager.handleRespondAppointment(f1, { type: 'RESPOND_APPOINTMENT', playerId: 'f1', appointmentId: 'apt_zzz', answer: 'YES' });
    assert.equal(stored.get(id)!.yes.length, 0);
  });

  it('un inconnu qui a activé les alertes peut répondre à un rendez-vous ouvert', async () => {
    const { org } = setup();
    const s = connect('s_in');
    alerts('s_in', true);
    await create(org, { inviteeIds: [], openToAlerts: true });
    const id = [...stored.keys()][0];
    await respond(s, id, 'YES');
    assert.deepEqual(stored.get(id)!.yes.map((p) => p.userId), ['s_in']);
  });

  it('refuse un oui de trop', async () => {
    const { org, id } = await withAppointment();
    for (const u of ['a', 'b', 'c']) {
      connect(u);
      friends(u, ['org']);
    }
    friends('org', ['f1', 'f2', 'a', 'b', 'c']);
    const a = manager.appointments.get(id);
    a.invitedIds = ['f1', 'f2', 'a', 'b', 'c'];
    for (const u of ['a', 'b', 'c']) await respond({ client: manager.clients.get(u) } as any, id, 'YES');
    const f1 = manager.clients.get('f1');
    const sent = f1.socket;
    const got: any[] = [];
    sent.send = (raw: string) => got.push(JSON.parse(raw));
    await respond({ client: f1 } as any, id, 'YES');
    assert.match(got.find((m) => m.type === 'ERROR').error, /complet/);
    void org;
  });
});

describe('annuler', () => {
  it('seul l\'organisateur annule ; les joueurs ayant répondu oui sont prévenus', async () => {
    const { org, f1 } = setup();
    await create(org, { inviteeIds: ['f1'] });
    const id = [...stored.keys()][0];
    await respond(f1, id, 'YES');
    pushed.length = 0;
    await manager.handleCancelAppointment(f1.client, { type: 'CANCEL_APPOINTMENT', playerId: 'f1', appointmentId: id });
    assert.match(f1.last('ERROR').error, /plus disponible/);
    assert.equal(stored.size, 1);
    await manager.handleCancelAppointment(org.client, { type: 'CANCEL_APPOINTMENT', playerId: 'org', appointmentId: id });
    await flush();
    assert.equal(stored.size, 0);
    assert.equal(manager.appointments.size, 0);
    assert.deepEqual(pushed.map((p) => p.uid), ['f1']);
    assert.match(pushed[0].title, /annulé/);
  });
});

describe('rappels', () => {
  it('envoie « avant » puis « c\'est l\'heure », une seule fois, à l\'organisateur et aux oui', async () => {
    const { org, f1, f2 } = setup();
    await create(org, { inviteeIds: ['f1', 'f2'] });
    const id = [...stored.keys()][0];
    await respond(f1, id, 'YES');
    await respond(f2, id, 'NO');
    const startsAt = manager.appointments.get(id).startsAt;
    pushed.length = 0;

    await manager.runAppointmentTick(startsAt - 20 * MIN);
    assert.equal(pushed.length, 0);

    await manager.runAppointmentTick(startsAt - 9 * MIN);
    assert.deepEqual(pushed.map((p) => p.uid).sort(), ['f1', 'org']);
    assert.match(pushed[0].title, /commence dans 9 min/);
    assert.equal(stored.get(id)!.preReminderSent, true);

    pushed.length = 0;
    await manager.runAppointmentTick(startsAt - 5 * MIN);
    assert.equal(pushed.length, 0);

    await manager.runAppointmentTick(startsAt + 1000);
    assert.deepEqual(pushed.map((p) => p.uid).sort(), ['f1', 'org']);
    assert.match(pushed[0].title, /C'est l'heure/);
    assert.equal(stored.get(id)!.startReminderSent, true);

    pushed.length = 0;
    await manager.runAppointmentTick(startsAt + 2000);
    assert.equal(pushed.length, 0);
  });

  it('retire un rendez-vous fini, en mémoire et dans le stockage', async () => {
    const { org } = setup();
    await create(org);
    const id = [...stored.keys()][0];
    const startsAt = manager.appointments.get(id).startsAt;
    await manager.runAppointmentTick(startsAt + 61 * MIN);
    await flush();
    assert.equal(manager.appointments.size, 0);
    assert.equal(stored.size, 0);
  });

  it('un rendez-vous stocké avant un redémarrage est retrouvé et rappelé', async () => {
    const { org } = setup();
    const startsAt = Date.now() + 5 * MIN;
    stored.set('apt_old', { id: 'apt_old', organizerId: 'org', organizerName: 'Awa', organizerAvatar: 'a', mode: 'FREE', startsAt, createdAt: Date.now(), invitedIds: ['f1'], openToAlerts: false, yes: [], no: [], preReminderSent: false, startReminderSent: false });
    await manager.runAppointmentTick(Date.now());
    assert.deepEqual(pushed.map((p) => p.uid), ['org']);
    void org;
  });
});
