// Rattrapage progressif du profil joueur vers Firestore.
// Les règles Firestore limitent la hausse de chaque compteur par écriture (20 pour les parties/manches,
// 10 pour les Kora et les doubles Kora, etc.) et la hausse du score par le gain solo déclaré.
// Quand le profil local a pris trop d'avance sur le profil cloud, une écriture « état complet » est
// refusée en bloc. Ce module calcule une étape intermédiaire qui respecte exactement ces plafonds,
// sans jamais les contourner : on rapproche le cloud du local par paliers.
// Fonctions pures : aucun accès réseau, aucun timer.

export const CATCHUP_MAX_STEPS = 60;

const GAME_KEYS = [
  'partiesPlayed', 'partiesWon', 'gamesPlayed', 'gamesWon', 'gamesLost',
  'manchesPlayed', 'manchesWon', 'soloGamesPlayed', 'soloGamesWon',
  'multiplayerGamesPlayed', 'multiplayerGamesWon', 'soloManchesWon', 'multiplayerManchesWon',
  'soloManchesWonEasy', 'soloManchesWonNormal', 'soloManchesWonHard',
  'soloGamesWonEasy', 'soloGamesWonNormal', 'soloGamesWonHard',
];
const KORA_KEYS = [
  'koraCount', 'soloKoraCount', 'multiplayerKoraCount',
  'soloKorasEasy', 'soloKorasNormal', 'soloKorasHard',
];
const DOUBLE_KEYS = [
  'doubleKoraCount', 'soloDoubleKoraCount', 'multiplayerDoubleKoraCount',
  'soloDoubleKorasEasy', 'soloDoubleKorasNormal', 'soloDoubleKorasHard',
];
const MONEY_UP_KEYS: Array<[string, number, number]> = [
  ['multiplayerGains', 50000, 0], ['multiplayerPertes', 25000, 0],
  ['soloGains', 50000, 0], ['soloPertes', 25000, 0], ['biggestPotWon', 50000, 0],
];

const num = (v: any): number => (typeof v === 'number' && isFinite(v) ? v : 0);
const round2 = (v: number): number => Math.round(v * 100) / 100;

export function dayIndexDouala(ms: number): number {
  return Math.floor((ms + 3600000) / 86400000);
}

function clampCounter(local: number, cloud: number, maxDelta: number): number {
  if (local <= cloud) return cloud;
  return Math.min(local, cloud + maxDelta);
}

export interface CatchUpStep {
  payload: any;
  changed: boolean;
  complete: boolean;
}

/**
 * Calcule le prochain palier d'écriture. `local` = profil local complet, `cloud` = dernier état connu du
 * profil cloud (lu une fois, puis mis à jour avec chaque palier écrit), `nowMs` = horloge du client.
 */
export function computeCatchUpStep(local: any, cloud: any, nowMs: number): CatchUpStep {
  const lS: Record<string, any> = (local && local.stats) || {};
  const cS: Record<string, any> = (cloud && cloud.stats) || {};
  const nS: Record<string, any> = { ...lS };

  GAME_KEYS.forEach((k) => { nS[k] = clampCounter(num(lS[k]), num(cS[k]), 20); });
  KORA_KEYS.forEach((k) => { nS[k] = clampCounter(num(lS[k]), num(cS[k]), 10); });
  DOUBLE_KEYS.forEach((k) => { nS[k] = clampCounter(num(lS[k]), num(cS[k]), 10); });
  MONEY_UP_KEYS.forEach(([k, up]) => { nS[k] = clampCounter(num(lS[k]), num(cS[k]), up); });
  ['fortune', 'soloFortune'].forEach((k) => {
    const c = num(cS[k]);
    nS[k] = Math.min(Math.max(num(lS[k]), c - 25000), c + 50000);
  });

  // soloDaily : jour jamais en arrière, jamais au-delà de demain, points ≤ 30
  const lSD = local && local.soloDaily && typeof local.soloDaily.day === 'number' ? local.soloDaily : null;
  const cSD = cloud && cloud.soloDaily && typeof cloud.soloDaily.day === 'number' ? cloud.soloDaily : null;
  const maxDay = dayIndexDouala(nowMs) + 1;
  let nSD: { day: number; points: number } | null = null;
  if (lSD || cSD) {
    const lDay = lSD ? lSD.day : -1;
    const cDay = cSD ? cSD.day : -1;
    const day = Math.min(Math.max(lDay, cDay), maxDay);
    let points: number;
    if (cSD && day === cDay) {
      points = lSD && lDay === day ? Math.max(num(lSD.points), num(cSD.points)) : num(cSD.points);
    } else {
      points = lSD && lDay === day ? num(lSD.points) : 0;
    }
    points = Math.min(30, Math.max(0, points));
    nSD = { day: Math.max(day, cDay), points };
  }

  // Score : mêmes bornes que les règles (100 par écriture, couplage au gain solo déclaré)
  const cScore = num(cS.masteryScore);
  const lScore = num(lS.masteryScore);
  let nScore = cScore;
  if (lScore >= cScore - 5) {
    const oDay = cSD ? cSD.day : null;
    const oPts = cSD ? num(cSD.points) : 0;
    let deltaSolo = 0;
    if (nSD) deltaSolo = oDay !== null && nSD.day === oDay ? nSD.points - oPts : nSD.points;
    const dMulti =
      (num(nS.multiplayerGamesWon) - num(cS.multiplayerGamesWon)) +
      (num(nS.multiplayerManchesWon) - num(cS.multiplayerManchesWon)) +
      (num(nS.multiplayerKoraCount) - num(cS.multiplayerKoraCount));
    let allocMultiDay = 0;
    if (nSD && oDay !== null && nSD.day > oDay) {
      const g = Math.min(7, nSD.day - oDay);
      allocMultiDay = Math.max(0, 30 - oPts) + 30 * (g - 1);
    }
    const allowance = deltaSolo + 20 * dMulti + allocMultiDay + 0.01 - 0.02;
    const room = Math.min(100, allowance);
    const wanted = lScore - cScore;
    if (wanted <= 0) nScore = lScore;
    else nScore = round2(cScore + Math.max(0, Math.min(wanted, room)));
  }
  nS.masteryScore = nScore;

  // Chips : bornes des règles
  const cChips = num(cloud && cloud.chips);
  const nChips = Math.min(Math.max(num(local && local.chips), cChips - 25000), cChips + 50000);

  // Fair-play : compteurs jamais en baisse, sanction active du cloud conservée
  const lFP = (local && local.fairPlay) || {};
  const cFP = (cloud && cloud.fairPlay) || {};
  const nFP: Record<string, any> = { ...lFP };
  ['totalForfeits', 'totalFoldRounds', 'prolongedDisconnects'].forEach((k) => {
    nFP[k] = Math.max(num(lFP[k]), num(cFP[k]));
  });
  if (cFP.activeSanction && cFP.activeSanction.active === true) {
    nFP.activeSanction = cFP.activeSanction;
  }

  const payload: Record<string, any> = {
    ...local,
    stats: nS,
    chips: nChips,
    fairPlay: nFP,
    scoreVersion: Math.max(num(local && local.scoreVersion) || 1, num(cloud && cloud.scoreVersion) || 1),
    updatedAt: nowMs,
  };
  if (nSD) payload.soloDaily = nSD;
  if (cloud && cloud.guestMergedAt !== undefined) payload.guestMergedAt = cloud.guestMergedAt;

  const counterKeys = [...GAME_KEYS, ...KORA_KEYS, ...DOUBLE_KEYS, ...MONEY_UP_KEYS.map((m) => m[0]), 'fortune', 'soloFortune'];
  const changed =
    counterKeys.some((k) => num(nS[k]) !== num(cS[k])) ||
    nScore !== cScore ||
    nChips !== cChips ||
    (nSD !== null && (!cSD || nSD.day !== cSD.day || nSD.points !== num(cSD.points)));
  const complete =
    [...GAME_KEYS, ...KORA_KEYS, ...DOUBLE_KEYS, ...MONEY_UP_KEYS.map((m) => m[0])].every(
      (k) => num(nS[k]) === Math.max(num(lS[k]), num(cS[k]))
    ) &&
    num(nS.fortune) === num(lS.fortune) &&
    num(nS.soloFortune) === num(lS.soloFortune) &&
    nChips === num(local && local.chips);

  return { payload, changed, complete };
}
