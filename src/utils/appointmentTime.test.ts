import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatAppointmentTime, fromDatetimeLocalValue, quickSlots, toDatetimeLocalValue } from './appointmentTime';

const MIN = 60_000;
const HOUR = 60 * MIN;
const at = (d: number, h: number, mi = 0) => new Date(2026, 10, d, h, mi).getTime();

describe('raccourcis d\'heure', () => {
  it('propose les quatre en fin d\'après-midi', () => {
    const now = at(10, 16);
    const slots = quickSlots(now, 2 * MIN, 48 * HOUR);
    assert.deepEqual(slots.map((s) => s.id), ['in30', 'in60', 'tonight', 'tomorrow']);
    assert.equal(slots[2].startsAt, at(10, 20));
    assert.equal(slots[3].startsAt, at(11, 20));
  });

  it('retire « ce soir » une fois 20 h passée ou trop proche', () => {
    assert.ok(!quickSlots(at(10, 21), 2 * MIN, 48 * HOUR).some((s) => s.id === 'tonight'));
    assert.ok(!quickSlots(at(10, 19, 59), 2 * MIN, 48 * HOUR).some((s) => s.id === 'tonight'));
  });

  it('respecte l\'horizon réglé', () => {
    const slots = quickSlots(at(10, 16), 2 * MIN, 2 * HOUR);
    assert.deepEqual(slots.map((s) => s.id), ['in30', 'in60']);
  });
});

describe('affichage', () => {
  const now = at(10, 16);
  it('aujourd\'hui, demain, puis le jour de la semaine', () => {
    assert.equal(formatAppointmentTime(at(10, 20), now), "Aujourd'hui à 20 h");
    assert.equal(formatAppointmentTime(at(11, 20, 5), now), 'Demain à 20 h 05');
    assert.equal(formatAppointmentTime(at(12, 14, 30), now), 'Jeudi à 14 h 30');
  });
});

describe('champ datetime-local', () => {
  it('aller-retour à la minute', () => {
    const ms = at(10, 8, 7);
    assert.equal(toDatetimeLocalValue(ms), '2026-11-10T08:07');
    assert.equal(fromDatetimeLocalValue('2026-11-10T08:07'), ms);
  });
  it('valeur vide ou fausse : null', () => {
    assert.equal(fromDatetimeLocalValue(''), null);
    assert.equal(fromDatetimeLocalValue('demain'), null);
  });
});
