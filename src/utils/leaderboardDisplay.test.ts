import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatCompactNumber, leaderboardGapLabel, leaderboardMetric } from './leaderboardDisplay';

const entry = {
  scoreValue: 12440,
  masteryScore: 12440,
  manchesWon: 38,
  partiesWon: 120,
  gamesWon: 31,
  gamesPlayed: 50,
  winRate: 62,
  koraCount: 10,
  doubleKoraCount: 2,
  fortune: 3200,
  multiplayerGains: 9000,
  multiplayerPertes: 5800,
};

describe('Palmarès : nombres abrégés', () => {
  it('garde les petits nombres entiers et arrondit les décimales', () => {
    assert.equal(formatCompactNumber(0), '0');
    assert.equal(formatCompactNumber(999), '999');
    assert.equal(formatCompactNumber(12.6), '13');
  });

  it('abrège dès 1 000, avec une décimale tant qu’il y a la place', () => {
    assert.equal(formatCompactNumber(1000), '1 k');
    assert.equal(formatCompactNumber(12440), '12,4 k');
    assert.equal(formatCompactNumber(125480), '125 k');
    assert.equal(formatCompactNumber(1240000), '1,2 M');
  });

  it('ne produit ni « 1000 k » ni « 1000 », même juste sous le palier', () => {
    assert.equal(formatCompactNumber(999.6), '1 k');
    assert.equal(formatCompactNumber(999960), '1 M');
  });

  it('garde le signe et résiste aux valeurs invalides', () => {
    assert.equal(formatCompactNumber(-5800), '-5,8 k');
    assert.equal(formatCompactNumber(Number.NaN), '0');
  });
});

describe('Palmarès : même présentation dans les quatre onglets', () => {
  it('Score', () => {
    assert.deepEqual(leaderboardMetric(entry, 'WINS'), { value: '12,4 k', unit: 'points', detail: '38 manches · 120 parties', tone: 'gold' });
  });

  it('Ratio', () => {
    assert.deepEqual(leaderboardMetric(entry, 'WIN_RATE'), { value: '62 %', unit: 'victoires', detail: '31 sur 50 parties', tone: 'gold' });
  });

  it('Koras : un double compte pour deux', () => {
    assert.deepEqual(leaderboardMetric(entry, 'KORAS'), { value: '14', unit: 'Koras', detail: '10 simples · 2 doubles', tone: 'gold' });
  });

  it('Fortune : signe et couleur suivent le résultat', () => {
    assert.deepEqual(leaderboardMetric(entry, 'CHIPS'), { value: '+3,2 k', unit: 'jetons', detail: 'Gagnés 9 k · Perdus 5,8 k', tone: 'positive' });
    assert.equal(leaderboardMetric({ ...entry, fortune: -200 }, 'CHIPS').tone, 'negative');
    assert.equal(leaderboardMetric({ ...entry, fortune: 0 }, 'CHIPS').tone, 'neutral');
  });

  it('accorde les unités au singulier', () => {
    const metric = leaderboardMetric({ ...entry, masteryScore: 1, manchesWon: 1, partiesWon: 1 }, 'WINS');
    assert.equal(metric.unit, 'point');
    assert.equal(metric.detail, '1 manche · 1 partie');
  });

  it('donne l’écart avec l’unité de l’onglet', () => {
    assert.equal(leaderboardGapLabel(85, 'WINS'), '85 points');
    assert.equal(leaderboardGapLabel(1500, 'CHIPS'), '1,5 k jetons');
    assert.equal(leaderboardGapLabel(1, 'KORAS'), '1 Kora');
    assert.equal(leaderboardGapLabel(4, 'WIN_RATE'), '4 %');
  });
});
