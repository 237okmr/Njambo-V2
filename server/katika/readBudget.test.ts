import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createReadBudget, FIRESTORE_FREE_DAILY_READS, quotaDayKey } from './readBudget';

describe('Compteur de lectures Firestore (katika)', () => {
  it('le jour de quota suit l\'heure du Pacifique (minuit Pacifique = 07 h ou 08 h UTC)', () => {
    // 1er novembre 2026 : l'heure d'été américaine finit le 1er novembre à 2 h, donc le 31 octobre minuit = 07:00 UTC.
    assert.equal(quotaDayKey(Date.UTC(2026, 9, 31, 6, 59, 0)), '2026-10-30');
    assert.equal(quotaDayKey(Date.UTC(2026, 9, 31, 7, 0, 0)), '2026-10-31');
    // Heure d'hiver : minuit Pacifique = 08:00 UTC.
    assert.equal(quotaDayKey(Date.UTC(2026, 11, 15, 7, 59, 0)), '2026-12-14');
    assert.equal(quotaDayKey(Date.UTC(2026, 11, 15, 8, 0, 0)), '2026-12-15');
  });

  it('additionne les lectures, une requête vide compte pour une lecture', () => {
    let now = Date.UTC(2026, 9, 31, 12, 0, 0);
    const b = createReadBudget(() => now);
    b.record(100);
    b.record(0);
    b.record(2.9);
    const snap = b.snapshot(40000, now);
    assert.equal(snap.reads, 103);
    assert.equal(snap.freeLimit, FIRESTORE_FREE_DAILY_READS);
    assert.equal(snap.warning, false);
    assert.equal(snap.partialDay, true);
  });

  it('déclenche l\'alerte au seuil réglé', () => {
    const now = Date.UTC(2026, 9, 31, 12, 0, 0);
    const b = createReadBudget(() => now);
    b.record(500);
    assert.equal(b.snapshot(500, now).warning, true);
    assert.equal(b.snapshot(501, now).warning, false);
  });

  it('repart de zéro quand le jour de quota change', () => {
    let now = Date.UTC(2026, 9, 31, 12, 0, 0);
    const b = createReadBudget(() => now);
    b.record(1000);
    now = Date.UTC(2026, 10, 1, 12, 0, 0);
    const snap = b.snapshot(40000, Date.UTC(2026, 9, 31, 12, 0, 0));
    assert.equal(snap.reads, 0);
    assert.equal(snap.partialDay, false);
  });
});
