import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLIENT_DAILY_MAX_LABELS,
  CLIENT_OTHER_LABEL,
  CLIENT_REPORT_MAX_PER_LABEL,
  createClientReadMeter,
  sanitizeReportedReads,
} from './clientReads';

describe('Lectures des téléphones — validation du rapport', () => {
  it('garde les étiquettes et nombres valides, ignore le reste', () => {
    const pairs = sanitizeReportedReads({
      'users/*': 3,
      'users/*/history': 100.9,
      'mauvaise étiquette': 5,
      'users/*/friends': -2,
      'x': 'beaucoup',
      'y': Number.NaN,
    });
    assert.deepEqual(pairs, [
      ['users/*', 3],
      ['users/*/history', 100],
    ]);
  });

  it('refuse un rapport qui n\'est pas un objet', () => {
    for (const bad of [null, undefined, 5, 'a', [1, 2]]) assert.deepEqual(sanitizeReportedReads(bad), []);
  });

  it('plafonne le nombre de lectures déclarées par étiquette', () => {
    assert.deepEqual(sanitizeReportedReads({ 'users/*': 10_000_000 }), [['users/*', CLIENT_REPORT_MAX_PER_LABEL]]);
  });
});

describe('Lectures des téléphones — cumul par jour', () => {
  it('additionne par étiquette et trie par poids décroissant', () => {
    const m = createClientReadMeter(() => Date.UTC(2026, 10, 1, 12));
    m.record({ 'users/*': 2, 'users/*/history': 100 });
    m.record({ 'users/*': 1 });
    const s = m.snapshot();
    assert.equal(s.total, 103);
    assert.equal(s.reports, 2);
    assert.deepEqual(s.labels, [
      { label: 'users/*/history', reads: 100 },
      { label: 'users/*', reads: 3 },
    ]);
  });

  it('repart de zéro au changement de jour de quota (heure du Pacifique)', () => {
    let t = Date.UTC(2026, 10, 1, 12);
    const m = createClientReadMeter(() => t);
    m.record({ 'users/*': 5 });
    t = Date.UTC(2026, 10, 2, 12);
    assert.equal(m.snapshot().total, 0);
  });

  it('regroupe les types en trop sous « autres » sans perdre de lectures', () => {
    const m = createClientReadMeter(() => Date.UTC(2026, 10, 1, 12));
    for (let i = 0; i < CLIENT_DAILY_MAX_LABELS + 5; i++) m.record({ [`col${i}/*`]: 1 });
    const s = m.snapshot();
    assert.equal(s.labels.length, CLIENT_DAILY_MAX_LABELS + 1);
    assert.equal(s.labels.find((l) => l.label === CLIENT_OTHER_LABEL)?.reads, 5);
    assert.equal(s.total, CLIENT_DAILY_MAX_LABELS + 5);
  });

  it('ignore un rapport vide', () => {
    const m = createClientReadMeter();
    assert.equal(m.record({}), 0);
    assert.equal(m.snapshot().reports, 0);
  });
});
