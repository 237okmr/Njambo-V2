import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeDegressiveSoloAward, getSoloDailyStatus, getDoualaDayIndex, MASTERY_CONFIG } from './masteryConfig';

describe('Points solo dégressifs', () => {
  it('plein tarif sur les 10 premiers points du jour', () => {
    assert.deepEqual(computeDegressiveSoloAward(0, 4), { awarded: 4, points: 4 });
    assert.deepEqual(computeDegressiveSoloAward(6, 4), { awarded: 4, points: 10 });
  });

  it('moitié de 10 à 20, un quart de 20 à 30', () => {
    assert.deepEqual(computeDegressiveSoloAward(10, 4), { awarded: 2, points: 12 });
    assert.deepEqual(computeDegressiveSoloAward(20, 4), { awarded: 1, points: 21 });
  });

  it('un gain à cheval sur deux paliers est découpé', () => {
    // 8 -> 10 plein tarif (2 pts), puis 4 potentiels restants à 50 % = 2 pts
    assert.deepEqual(computeDegressiveSoloAward(8, 6), { awarded: 4, points: 12 });
    // 19 -> 20 : 1 potentiel*... il faut 2 potentiels pour 1 point, puis 2 restants à 25 % = 0,5
    assert.deepEqual(computeDegressiveSoloAward(19, 4), { awarded: 1.5, points: 20.5 });
  });

  it('ne dépasse jamais le plafond de 30 points', () => {
    const r = computeDegressiveSoloAward(0, 100000);
    assert.equal(r.points, MASTERY_CONFIG.rules.dailySoloPointsCap);
    assert.equal(r.awarded, 30);
    assert.deepEqual(computeDegressiveSoloAward(30, 10), { awarded: 0, points: 30 });
    assert.deepEqual(computeDegressiveSoloAward(29.9, 100), { awarded: 0.1, points: 30 });
  });

  it('entrées invalides : aucun point, aucun plantage', () => {
    assert.deepEqual(computeDegressiveSoloAward(Number.NaN, 5), { awarded: 5, points: 5 });
    assert.deepEqual(computeDegressiveSoloAward(5, Number.NaN), { awarded: 0, points: 5 });
    assert.deepEqual(computeDegressiveSoloAward(5, -3), { awarded: 0, points: 5 });
  });

  it('une succession de petites parties donne le même total qu\'un seul gros gain', () => {
    let pts = 0;
    for (let i = 0; i < 40; i++) pts = computeDegressiveSoloAward(pts, 2).points;
    assert.ok(Math.abs(pts - computeDegressiveSoloAward(0, 80).points) < 0.05);
  });

  it('statut du jour pour l\'affichage', () => {
    const now = Date.UTC(2026, 9, 20, 12, 0, 0);
    const today = getDoualaDayIndex(now);
    assert.deepEqual(getSoloDailyStatus(undefined, now), { points: 0, cap: 30, rate: 1, reached: false });
    assert.equal(getSoloDailyStatus({ day: today, points: 12 }, now).rate, 0.5);
    assert.equal(getSoloDailyStatus({ day: today, points: 25 }, now).rate, 0.25);
    assert.deepEqual(getSoloDailyStatus({ day: today, points: 30 }, now), { points: 30, cap: 30, rate: 0, reached: true });
    assert.equal(getSoloDailyStatus({ day: today - 1, points: 30 }, now).points, 0);
  });
});
