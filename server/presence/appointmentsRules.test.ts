import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  Appointment,
  MAX_YES_ANSWERS,
  applyAnswer,
  describeDelay,
  buildAppointmentViews,
  dueReminders,
  isAppointmentOver,
  normalizeAnswer,
  refusalMessage,
  validateNewAppointment,
} from './appointmentsRules';

const NOW = 1_000_000;
const MIN = 60_000;

const appt = (id: string, over: Partial<Appointment> = {}): Appointment => ({
  id,
  organizerId: 'org',
  organizerName: 'Org',
  organizerAvatar: 'a',
  mode: 'FREE',
  startsAt: NOW + 30 * MIN,
  createdAt: NOW,
  invitedIds: ['f1'],
  openToAlerts: false,
  yes: [],
  no: [],
  preReminderSent: false,
  startReminderSent: false,
  ...over,
});

const base = {
  nowMs: NOW,
  startsAt: NOW + 30 * MIN,
  minLeadMs: 2 * MIN,
  horizonMs: 48 * 60 * MIN,
  organizerId: 'org',
  requestedInvitees: ['f1', 'f2'],
  friendIds: new Set(['f1', 'f2']) as ReadonlySet<string>,
  openToAlerts: false,
  activeCount: 0,
  maxActive: 3,
  maxInvitees: 10,
};

describe('création d\'un rendez-vous', () => {
  it('accepte une heure valable et ne garde que des amis, sans doublon ni soi-même', () => {
    const r = validateNewAppointment({ ...base, requestedInvitees: ['f1', 'f1', 'org', 'inconnu', 'f2', 12] });
    assert.deepEqual(r, { ok: true, startsAt: NOW + 30 * MIN, invitedIds: ['f1', 'f2'] });
  });
  it('refuse une heure absente, passée, trop proche ou trop lointaine', () => {
    for (const startsAt of ['demain', undefined, NaN, Infinity]) {
      assert.deepEqual(validateNewAppointment({ ...base, startsAt }), { ok: false, reason: 'TIME_INVALID' });
    }
    assert.deepEqual(validateNewAppointment({ ...base, startsAt: NOW - 1 }), { ok: false, reason: 'TIME_TOO_SOON' });
    assert.deepEqual(validateNewAppointment({ ...base, startsAt: NOW + MIN }), { ok: false, reason: 'TIME_TOO_SOON' });
    assert.deepEqual(validateNewAppointment({ ...base, startsAt: NOW + 49 * 60 * MIN }), { ok: false, reason: 'TIME_TOO_FAR' });
  });
  it('limite les rendez-vous à venir et le nombre d\'invités', () => {
    assert.deepEqual(validateNewAppointment({ ...base, activeCount: 3 }), { ok: false, reason: 'TOO_MANY_ACTIVE' });
    assert.deepEqual(validateNewAppointment({ ...base, maxInvitees: 1 }), { ok: false, reason: 'TOO_MANY_INVITEES' });
  });
  it('exige un public : des amis ou l\'ouverture aux alertes', () => {
    assert.deepEqual(validateNewAppointment({ ...base, requestedInvitees: [] }), { ok: false, reason: 'NO_AUDIENCE' });
    assert.deepEqual(validateNewAppointment({ ...base, requestedInvitees: ['inconnu'] }), { ok: false, reason: 'NO_AUDIENCE' });
    assert.equal(validateNewAppointment({ ...base, requestedInvitees: [], openToAlerts: true }).ok, true);
  });
  it('a un message pour chaque refus', () => {
    for (const reason of ['TIME_INVALID', 'TIME_TOO_SOON', 'TIME_TOO_FAR', 'TOO_MANY_ACTIVE', 'NO_AUDIENCE', 'TOO_MANY_INVITEES'] as const) {
      assert.ok(refusalMessage(reason).length > 10);
    }
  });
});

describe('réponses', () => {
  const p = (userId: string) => ({ userId, displayName: userId, avatarId: 'a' });
  it('ne reconnaît que oui et non', () => {
    assert.equal(normalizeAnswer('YES'), 'YES');
    assert.equal(normalizeAnswer('NO'), 'NO');
    assert.equal(normalizeAnswer('PEUT-ETRE'), null);
  });
  it('enregistre un oui, puis un changement d\'avis en non', () => {
    const a = applyAnswer(appt('x'), p('f1'), 'YES')!;
    assert.deepEqual(a.yes.map((y) => y.userId), ['f1']);
    const b = applyAnswer(a, p('f1'), 'NO')!;
    assert.deepEqual(b.yes, []);
    assert.deepEqual(b.no, ['f1']);
    const c = applyAnswer(b, p('f1'), 'YES')!;
    assert.deepEqual(c.no, []);
    assert.equal(c.yes.length, 1);
  });
  it('ne change rien si la réponse est la même, ni pour l\'organisateur', () => {
    const a = applyAnswer(appt('x'), p('f1'), 'YES')!;
    assert.equal(applyAnswer(a, p('f1'), 'YES'), null);
    assert.equal(applyAnswer(appt('x'), p('org'), 'YES'), null);
    const no = applyAnswer(appt('x'), p('f1'), 'NO')!;
    assert.equal(applyAnswer(no, p('f1'), 'NO'), null);
  });
  it('refuse un oui de trop : une table n\'a que quatre places', () => {
    let a = appt('x');
    for (let i = 0; i < MAX_YES_ANSWERS; i += 1) a = applyAnswer(a, p(`j${i}`), 'YES')!;
    assert.equal(applyAnswer(a, p('dernier'), 'YES'), null);
    assert.ok(applyAnswer(a, p('dernier'), 'NO'));
  });
});

describe('rappels', () => {
  const lead = 10 * MIN;
  it('envoie « avant » dans la fenêtre, puis « c\'est l\'heure »', () => {
    const a = appt('x');
    assert.deepEqual(dueReminders([a], NOW, lead), []);
    assert.deepEqual(dueReminders([a], a.startsAt - lead, lead), [{ id: 'x', kind: 'PRE' }]);
    assert.deepEqual(dueReminders([a], a.startsAt, lead), [{ id: 'x', kind: 'START' }]);
  });
  it('n\'envoie pas deux fois et saute « avant » si l\'heure est déjà passée', () => {
    const sent = appt('x', { preReminderSent: true });
    assert.deepEqual(dueReminders([sent], sent.startsAt - 1, lead), []);
    const late = appt('y');
    assert.deepEqual(dueReminders([late], late.startsAt + MIN, lead), [{ id: 'y', kind: 'START' }]);
    assert.deepEqual(dueReminders([appt('z', { preReminderSent: true, startReminderSent: true })], NOW + 99 * MIN, lead), []);
  });
});

describe('visibilité', () => {
  const view = (over: Partial<Parameters<typeof buildAppointmentViews>[0]> = {}) =>
    buildAppointmentViews({
      viewerId: 'v',
      appointments: [],
      nowMs: NOW,
      graceMs: 60 * MIN,
      strangerAllowed: false,
      canSeeMode: () => true,
      isBlocked: () => false,
      limit: 10,
      ...over,
    });

  it('montre les siens, ceux où l\'on est invité, et les ouverts seulement si les alertes sont activées', () => {
    const list = [
      appt('mine', { organizerId: 'v', invitedIds: [] }),
      appt('invited', { invitedIds: ['v'], startsAt: NOW + 10 * MIN }),
      appt('open', { invitedIds: [], openToAlerts: true }),
      appt('other', { invitedIds: ['x'] }),
    ];
    assert.deepEqual(view({ appointments: list }).map((a) => a.id), ['invited', 'mine']);
    assert.deepEqual(view({ appointments: list, strangerAllowed: true }).map((a) => a.id), ['invited', 'mine', 'open']);
  });
  it('écarte l\'échu, le bloqué et le mode non autorisé, sans jamais cacher les siens', () => {
    const list = [
      appt('old', { invitedIds: ['v'], startsAt: NOW - 61 * MIN }),
      appt('cash', { invitedIds: ['v'], mode: 'CASH' }),
      appt('blocked', { invitedIds: ['v'], organizerId: 'bad' }),
      appt('mineCash', { organizerId: 'v', mode: 'CASH', invitedIds: [] }),
    ];
    const out = view({ appointments: list, canSeeMode: (m) => m === 'FREE', isBlocked: (id) => id === 'bad' });
    assert.deepEqual(out.map((a) => a.id), ['mineCash']);
  });
  it('indique ma réponse, les participants et si c\'est complet', () => {
    let a = appt('x', { invitedIds: ['v'] });
    for (const id of ['v', 'a', 'b']) a = applyAnswer(a, { userId: id, displayName: id, avatarId: 'a' }, 'YES')!;
    const [v] = view({ appointments: [a] });
    assert.equal(v.myAnswer, 'YES');
    assert.equal(v.full, true);
    assert.equal(v.yes.length, 3);
    assert.equal(view({ appointments: [appt('y', { invitedIds: ['v'], no: ['v'] })] })[0].myAnswer, 'NO');
  });
  it('respecte la limite', () => {
    const list = [appt('a', { invitedIds: ['v'] }), appt('b', { invitedIds: ['v'] })];
    assert.equal(view({ appointments: list, limit: 1 }).length, 1);
  });
  it('une fois la grâce écoulée, le rendez-vous est fini', () => {
    assert.equal(isAppointmentOver(appt('x'), NOW + 30 * MIN + 60 * MIN, 60 * MIN), true);
    assert.equal(isAppointmentOver(appt('x'), NOW + 30 * MIN + 60 * MIN - 1, 60 * MIN), false);
  });
});

describe('relecture d\'un document stocké', () => {
  it('rejette un document sans organisateur ou sans heure, et remplace les champs mal formés', async () => {
    const { normalizeStoredAppointment } = await import('./appointmentsStore');
    assert.equal(normalizeStoredAppointment('x', null), null);
    assert.equal(normalizeStoredAppointment('x', { organizerId: 'o' }), null);
    const a = normalizeStoredAppointment('x', { organizerId: 'o', startsAt: 5, mode: 'bizarre', invitedIds: ['a', 3], yes: [{ userId: 'u' }, 'nul'], openToAlerts: 'oui' })!;
    assert.equal(a.mode, 'FREE');
    assert.deepEqual(a.invitedIds, ['a']);
    assert.deepEqual(a.yes, [{ userId: 'u', displayName: 'Joueur', avatarId: 'default' }]);
    assert.equal(a.openToAlerts, false);
    assert.equal(a.id, 'x');
  });
});

describe('durée restante', () => {
  it('s\'écrit en minutes puis en heures', () => {
    assert.equal(describeDelay(0), 'dans 1 min');
    assert.equal(describeDelay(25 * MIN), 'dans 25 min');
    assert.equal(describeDelay(25 * MIN + 1), 'dans 26 min');
    assert.equal(describeDelay(120 * MIN), 'dans 2 h');
    assert.equal(describeDelay(90 * MIN), 'dans 1 h 30');
    assert.equal(describeDelay(65 * MIN), 'dans 1 h 05');
  });
});
