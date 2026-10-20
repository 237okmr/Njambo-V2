import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCatchUpStep, dayIndexDouala, CATCHUP_MAX_STEPS } from './profileCatchUp';

// Miroir fidèle des plafonds de firestore.rules (validProfileUpdate) pour vérifier chaque palier.
const G = ['partiesPlayed','partiesWon','gamesPlayed','gamesWon','gamesLost','manchesPlayed','manchesWon','soloGamesPlayed','soloGamesWon','multiplayerGamesPlayed','multiplayerGamesWon','soloManchesWon','multiplayerManchesWon','soloManchesWonEasy','soloManchesWonNormal','soloManchesWonHard','soloGamesWonEasy','soloGamesWonNormal','soloGamesWonHard'];
const K = ['koraCount','soloKoraCount','multiplayerKoraCount','soloKorasEasy','soloKorasNormal','soloKorasHard'];
const D = ['doubleKoraCount','soloDoubleKoraCount','multiplayerDoubleKoraCount','soloDoubleKorasEasy','soloDoubleKorasNormal','soloDoubleKorasHard'];
const n = (v: any) => (typeof v === 'number' ? v : 0);

function rulesAccept(ex: any, inc: any, now: number): boolean {
  const oS = ex.stats, nS = inc.stats;
  const ctr = (k: string, m: number) => n(nS[k]) >= n(oS[k]) && n(nS[k]) - n(oS[k]) <= m;
  if (!G.every((k) => ctr(k, 20)) || !K.every((k) => ctr(k, 10)) || !D.every((k) => ctr(k, 10))) return false;
  if (!(ctr('multiplayerGains', 50000) && ctr('multiplayerPertes', 25000) && ctr('soloGains', 50000) && ctr('soloPertes', 25000) && ctr('biggestPotWon', 50000))) return false;
  if (n(nS.fortune) - n(oS.fortune) > 50000 || n(oS.fortune) - n(nS.fortune) > 25000) return false;
  if (n(nS.soloFortune) - n(oS.soloFortune) > 50000 || n(oS.soloFortune) - n(nS.soloFortune) > 25000) return false;
  if (n(inc.chips) - n(ex.chips) > 50000 || n(ex.chips) - n(inc.chips) > 25000) return false;
  if (n(nS.masteryScore) < n(oS.masteryScore) - 5 || n(nS.masteryScore) - n(oS.masteryScore) > 100) return false;
  if (n(nS.partiesWon) > n(nS.partiesPlayed) || n(nS.gamesWon) > n(nS.gamesPlayed) || n(nS.manchesWon) > n(nS.manchesPlayed) || n(nS.doubleKoraCount) > n(nS.koraCount)) return false;
  // soloDaily
  const exSD = ex.soloDaily, inSD = inc.soloDaily;
  if (exSD && !inSD) return false;
  let deltaSolo = 0, allocMulti = 0;
  if (inSD) {
    if (inSD.day > Math.floor((now + 3600000) / 86400000) + 1) return false;
    if (exSD && inSD.day < exSD.day) return false;
    if (inSD.points < 0 || inSD.points > 30.01) return false;
    if (exSD && !(inSD.day > exSD.day || inSD.points >= exSD.points)) return false;
    const oDay = exSD ? exSD.day : null, oPts = exSD ? exSD.points : 0;
    deltaSolo = oDay !== null && inSD.day === oDay ? inSD.points - oPts : inSD.points;
    if (oDay !== null && inSD.day > oDay) {
      const g = Math.min(7, inSD.day - oDay);
      allocMulti = Math.max(0, 30 - oPts) + 30 * (g - 1);
    }
  }
  const dM = (n(nS.multiplayerGamesWon) - n(oS.multiplayerGamesWon)) + (n(nS.multiplayerManchesWon) - n(oS.multiplayerManchesWon)) + (n(nS.multiplayerKoraCount) - n(oS.multiplayerKoraCount));
  const inc_ = n(nS.masteryScore) - n(oS.masteryScore);
  return inc_ <= deltaSolo + 20 * dM + 0.01 + allocMulti;
}

const NOW = Date.UTC(2026, 9, 20, 12, 0, 0);
const today = dayIndexDouala(NOW);

function mk(over: Record<string, number>, score: number, sd: { day: number; points: number }, chips = 5000) {
  const stats: Record<string, number> = { masteryScore: score };
  [...G, ...K, ...D].forEach((k) => { stats[k] = 0; });
  Object.assign(stats, over);
  return { chips, stats, soloDaily: sd, fairPlay: { totalForfeits: 0, totalFoldRounds: 0, prolongedDisconnects: 0 }, scoreVersion: 1 };
}

test('profil à jour : aucun palier nécessaire', () => {
  const p = mk({ manchesWon: 50, manchesPlayed: 80 }, 100, { day: today, points: 10 });
  const r = computeCatchUpStep(p, p, NOW);
  assert.equal(r.changed, false);
  assert.equal(r.complete, true);
});

test('gros écart (BIG SMIG) : rattrapé par paliers acceptés par les règles', () => {
  const cloud = mk({ manchesPlayed: 1000, manchesWon: 304, partiesPlayed: 1100, partiesWon: 592, koraCount: 161, soloKoraCount: 100, gamesPlayed: 1100, gamesWon: 592 }, 900, { day: today - 2, points: 30 });
  const local = mk({ manchesPlayed: 1707, manchesWon: 618, partiesPlayed: 1730, partiesWon: 619, koraCount: 169, soloKoraCount: 108, gamesPlayed: 1730, gamesWon: 619 }, 960, { day: today, points: 12 });
  let base: any = cloud;
  let steps = 0;
  let complete = false;
  while (steps < CATCHUP_MAX_STEPS) {
    const s = computeCatchUpStep(local, base, NOW);
    if (!s.changed) break;
    assert.ok(rulesAccept(base, s.payload, NOW), `palier ${steps} refusé par les règles`);
    base = { ...base, ...s.payload };
    steps++;
    if (s.complete) { complete = true; break; }
  }
  assert.ok(complete, 'les compteurs doivent converger');
  assert.equal(base.stats.manchesWon, 618);
  assert.equal(base.stats.partiesWon, 619);
  assert.equal(base.stats.koraCount, 169);
  assert.ok(base.stats.masteryScore > 900, 'le score progresse');
  assert.ok(base.stats.masteryScore <= 960);
  assert.ok(steps <= CATCHUP_MAX_STEPS);
});

test('cloud en avance sur le local (autre appareil) : aucune baisse de compteur', () => {
  const cloud = mk({ manchesWon: 400, manchesPlayed: 500 }, 500, { day: today, points: 30 });
  const local = mk({ manchesWon: 300, manchesPlayed: 450 }, 480, { day: today, points: 5 });
  const s = computeCatchUpStep(local, cloud, NOW);
  assert.ok(rulesAccept(cloud, s.payload, NOW));
  assert.equal(s.payload.stats.manchesWon, 400);
  assert.equal(s.payload.soloDaily.points, 30);
});

test('jour solo jamais au-delà de demain', () => {
  const cloud = mk({}, 10, { day: today - 1, points: 0 });
  const local = mk({}, 40, { day: today + 50, points: 30 });
  const s = computeCatchUpStep(local, cloud, NOW);
  assert.ok(s.payload.soloDaily.day <= today + 1);
  assert.ok(rulesAccept(cloud, s.payload, NOW));
});

test('hausse de score limitée au gain solo déclaré (plafond 30 le même jour)', () => {
  const cloud = mk({}, 100, { day: today, points: 30 });
  const local = mk({}, 150, { day: today, points: 30 });
  const s = computeCatchUpStep(local, cloud, NOW);
  assert.equal(s.payload.stats.masteryScore, 100);
  assert.ok(rulesAccept(cloud, s.payload, NOW));
});

test('sanction active du cloud conservée', () => {
  const cloud: any = mk({}, 10, { day: today, points: 0 });
  cloud.fairPlay.activeSanction = { active: true, type: 'TEMP_BAN', expiresAt: NOW + 1000000 };
  const local: any = mk({}, 10, { day: today, points: 0 });
  const s = computeCatchUpStep(local, cloud, NOW);
  assert.equal(s.payload.fairPlay.activeSanction.active, true);
});
