// Réparation serveur d'un profil joueur en retard sur son journal (droits admin, appelée uniquement par katika).
// Fonctions pures : aucun accès réseau, aucun timer, aucun délai.

export interface RepairJournalItem {
  mode: string | null;
  recordType: string | null;
  isWinner: boolean;
  createdAt: number | null;
  masteryPointsAwarded: number | null;
}

export interface RepairTargets {
  manchesWon?: number;
  partiesWon?: number;
  koraCount?: number;
}

export interface RepairPlan {
  scoreBefore: number;
  scoreAfter: number;
  scoreCredit: number;
  journalPoints: number;
  alreadyCredited: number;
  soloDailyBefore: { day: number; points: number } | null;
  soloDailyAfter: { day: number; points: number };
  counters: Array<{ key: string; before: number; after: number }>;
  nothingToDo: boolean;
}

const COUNTER_CEILING = 5000;
const SOLO_DAILY_CAP = 30;
const num = (v: any): number => (typeof v === 'number' && isFinite(v) ? v : 0);
const round2 = (v: number): number => Math.round(v * 100) / 100;

export function dayIndexDouala(ms: number): number {
  return Math.floor((ms + 3600000) / 86400000);
}

export function computeRepairPlan(
  cloud: any,
  journal: RepairJournalItem[],
  targets: RepairTargets,
  alreadyCredited: number,
  nowMs: number
): RepairPlan {
  const stats: Record<string, any> = (cloud && cloud.stats) || {};
  const sd = cloud && cloud.soloDaily && typeof cloud.soloDaily.day === 'number' ? cloud.soloDaily : null;
  const today = dayIndexDouala(nowMs);
  const sdDay: number | null = sd ? sd.day : null;

  const wins = journal.filter(
    (h) => h && h.mode === 'SOLO' && h.recordType === 'MANCHE' && h.isWinner === true && typeof h.createdAt === 'number'
  );
  const after = wins.filter((h) => sdDay === null || dayIndexDouala(h.createdAt as number) > sdDay);
  const journalPoints = round2(after.reduce((s, h) => s + Math.max(0, num(h.masteryPointsAwarded)), 0));
  const already = Math.min(journalPoints, Math.max(0, num(alreadyCredited)));
  const scoreCredit = round2(Math.max(0, journalPoints - already));

  const todayPoints = round2(
    Math.min(
      SOLO_DAILY_CAP,
      wins
        .filter((h) => dayIndexDouala(h.createdAt as number) === today)
        .reduce((s, h) => s + Math.max(0, num(h.masteryPointsAwarded)), 0)
    )
  );
  const keepToday = sd && sd.day === today ? Math.max(num(sd.points), todayPoints) : todayPoints;
  const soloDailyAfter = { day: Math.max(today, sdDay ?? 0), points: Math.min(SOLO_DAILY_CAP, keepToday) };

  const counters: Array<{ key: string; before: number; after: number }> = [];
  const raise = (key: string, target: number | undefined) => {
    const before = num(stats[key]);
    if (typeof target !== 'number' || !isFinite(target)) return;
    const wanted = Math.min(Math.floor(target), before + COUNTER_CEILING);
    if (wanted > before) counters.push({ key, before, after: wanted });
  };
  raise('manchesWon', targets.manchesWon);
  raise('partiesWon', targets.partiesWon);
  raise('koraCount', targets.koraCount);
  const get = (k: string) => counters.find((c) => c.key === k)?.after ?? num(stats[k]);
  if (get('manchesWon') > num(stats.manchesPlayed)) counters.push({ key: 'manchesPlayed', before: num(stats.manchesPlayed), after: get('manchesWon') });
  if (get('partiesWon') > num(stats.partiesPlayed)) counters.push({ key: 'partiesPlayed', before: num(stats.partiesPlayed), after: get('partiesWon') });

  const scoreBefore = num(stats.masteryScore);
  const scoreAfter = round2(scoreBefore + scoreCredit);
  const sdChanged = !sd || sd.day !== soloDailyAfter.day || num(sd.points) !== soloDailyAfter.points;
  return {
    scoreBefore,
    scoreAfter,
    scoreCredit,
    journalPoints,
    alreadyCredited: already,
    soloDailyBefore: sd ? { day: sd.day, points: num(sd.points) } : null,
    soloDailyAfter,
    counters,
    nothingToDo: scoreCredit === 0 && counters.length === 0 && !sdChanged,
  };
}
