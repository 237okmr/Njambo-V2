/**
 * Rangs dynamiques : un rang dépend de la place du joueur parmi les autres et d'un minimum de score.
 * Fonctions pures, sans dépendance : importées par le serveur et, plus tard, par le client.
 * Le score de Maîtrise n'est jamais modifié ici.
 */

/** Du plus haut au plus bas : les paliers disputés entre joueurs. Mêmes identifiants que HONORIFIC_TITLES. */
export const COMPETITIVE_TIERS = ['LEGENDE_KORA', 'MAITRE_NJAMBO', 'MAITRE_POSITION', 'CHASSEUR_KORA'] as const;
export type CompetitiveTierId = (typeof COMPETITIVE_TIERS)[number];
export type RankTitleId = CompetitiveTierId | 'CONFIRME' | 'APPRENTI';

export interface RankSettings {
  topPercent: Record<CompetitiveTierId, number>;
  minScore: Record<CompetitiveTierId, number>;
  confirmedMinGames: number;
  confirmedMinWins: number;
  /** Jours sans partie avant de perdre un palier, puis un de plus à chaque période. 0 : aucune perte. */
  inactivityDays: number;
}

export interface RankedPlayerInput {
  uid: string;
  masteryScore: number;
  gamesPlayed: number;
  gamesWon: number;
  /** Date de la dernière partie connue. Absente : voir unknownActivitySince. */
  lastGameAt?: number;
}

export interface PlayerRank {
  titleId: RankTitleId;
  /** Paliers perdus pour inactivité. */
  inactivitySteps: number;
}

export interface TierSummary {
  titleId: CompetitiveTierId;
  /** Nombre de places à ce palier et au-dessus. */
  places: number;
  /** Places déjà prises à ce palier et au-dessus. */
  holders: number;
  topPercent: number;
  minScore: number;
  /** Score du dernier joueur de ce palier : à dépasser pour l'atteindre quand les places sont prises. */
  cutoffScore: number | null;
}

export interface RankComputation {
  ranks: Record<string, PlayerRank>;
  tiers: TierSummary[];
  totalPlayers: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Réglages de Katika (registre engineParams, groupe rangs). */
export function rankSettingsFromConfig(config: Record<string, number>): RankSettings {
  return {
    topPercent: {
      LEGENDE_KORA: config.rankLegendTopPercent,
      MAITRE_NJAMBO: config.rankMasterTopPercent,
      MAITRE_POSITION: config.rankPositionTopPercent,
      CHASSEUR_KORA: config.rankHunterTopPercent,
    },
    minScore: {
      LEGENDE_KORA: config.rankLegendMinScore,
      MAITRE_NJAMBO: config.rankMasterMinScore,
      MAITRE_POSITION: config.rankPositionMinScore,
      CHASSEUR_KORA: config.rankHunterMinScore,
    },
    confirmedMinGames: config.rankConfirmedMinGames,
    confirmedMinWins: config.rankConfirmedMinWins,
    inactivityDays: config.rankInactivityDays,
  };
}

/** Ce qui sort vers les joueurs : le rang, jamais la date de dernière partie. */
export function withPublicRanks<T extends { uid: string; lastGameAt?: number }>(
  users: T[],
  ranks: Record<string, PlayerRank>
): (Omit<T, 'lastGameAt'> & { dynamicRank?: PlayerRank })[] {
  return users.map(({ lastGameAt: _hidden, ...user }) => ({ ...user, dynamicRank: ranks[user.uid] }));
}

/** Rang possible sans classement : celui des invités, et de tout joueur sous les paliers disputés. */
export function baseRankTitle(stats: { gamesPlayed: number; gamesWon: number }, settings: RankSettings): 'CONFIRME' | 'APPRENTI' {
  return stats.gamesPlayed >= settings.confirmedMinGames && stats.gamesWon >= settings.confirmedMinWins ? 'CONFIRME' : 'APPRENTI';
}

/** Places cumulées de chaque palier, jamais moins que le palier du dessus ni moins d'une place. */
export function tierPlaces(totalPlayers: number, settings: RankSettings): Record<CompetitiveTierId, number> {
  const places = {} as Record<CompetitiveTierId, number>;
  let previous = 0;
  for (const tier of COMPETITIVE_TIERS) {
    const share = totalPlayers > 0 ? Math.max(1, Math.ceil((totalPlayers * settings.topPercent[tier]) / 100)) : 0;
    previous = Math.max(previous, share);
    places[tier] = previous;
  }
  return places;
}

/** Paliers perdus : aucun avant la première période, puis un par période entière écoulée. */
export function inactivitySteps(lastGameAt: number | undefined, nowMs: number, inactivityDays: number): number {
  if (inactivityDays <= 0 || !lastGameAt || lastGameAt >= nowMs) return 0;
  return Math.floor((nowMs - lastGameAt) / (inactivityDays * DAY_MS));
}

const rankOrder = (a: RankedPlayerInput, b: RankedPlayerInput): number =>
  b.masteryScore - a.masteryScore || b.gamesWon - a.gamesWon || a.uid.localeCompare(b.uid);

/**
 * Attribue les rangs du meilleur score au plus faible. Un joueur inactif voit son plafond baisser et ne prend
 * une place qu'au palier permis : les places qu'il libère reviennent aux suivants. Il ne descend jamais
 * sous Confirmé pour inactivité, et un joueur qui n'a pas gagné ce palier n'y monte pas.
 *
 * unknownActivitySince : date à retenir pour un joueur sans partie connue. On ne peut pas prouver qu'il est
 * inactif depuis plus longtemps que ce qu'on a lu : il garde le bénéfice du doute.
 */
export function computeRanks(
  players: RankedPlayerInput[],
  settings: RankSettings,
  nowMs: number,
  options: { unknownActivitySince?: number; totalPlayers?: number } = {}
): RankComputation {
  const sorted = [...players].sort(rankOrder);
  const totalPlayers = Math.max(options.totalPlayers ?? 0, sorted.length);
  const places = tierPlaces(totalPlayers, settings);
  const taken: Record<CompetitiveTierId, number> = { LEGENDE_KORA: 0, MAITRE_NJAMBO: 0, MAITRE_POSITION: 0, CHASSEUR_KORA: 0 };
  const cutoff: Record<CompetitiveTierId, number | null> = { LEGENDE_KORA: null, MAITRE_NJAMBO: null, MAITRE_POSITION: null, CHASSEUR_KORA: null };
  const ranks: Record<string, PlayerRank> = {};

  for (const player of sorted) {
    const steps = inactivitySteps(player.lastGameAt ?? options.unknownActivitySince, nowMs, settings.inactivityDays);
    const canHold = (index: number): boolean => {
      const tier = COMPETITIVE_TIERS[index];
      return player.masteryScore >= settings.minScore[tier] && taken[tier] < places[tier];
    };

    // Palier que sa place lui donne s'il était actif, puis palier permis après ses pertes d'inactivité.
    let earned = 0;
    while (earned < COMPETITIVE_TIERS.length && !canHold(earned)) earned++;

    let held = earned + steps;
    while (held < COMPETITIVE_TIERS.length && !canHold(held)) held++;

    if (held < COMPETITIVE_TIERS.length) {
      for (let i = held; i < COMPETITIVE_TIERS.length; i++) {
        taken[COMPETITIVE_TIERS[i]]++;
        cutoff[COMPETITIVE_TIERS[i]] = player.masteryScore;
      }
      ranks[player.uid] = { titleId: COMPETITIVE_TIERS[held], inactivitySteps: held - earned };
    } else if (earned < COMPETITIVE_TIERS.length) {
      // A mérité un palier disputé, mais l'inactivité l'a fait perdre : il ne passe pas sous Confirmé.
      ranks[player.uid] = { titleId: 'CONFIRME', inactivitySteps: COMPETITIVE_TIERS.length - earned };
    } else {
      ranks[player.uid] = { titleId: baseRankTitle(player, settings), inactivitySteps: 0 };
    }
  }

  return {
    ranks,
    totalPlayers,
    tiers: COMPETITIVE_TIERS.map((tier) => ({
      titleId: tier,
      places: places[tier],
      holders: taken[tier],
      topPercent: settings.topPercent[tier],
      minScore: settings.minScore[tier],
      cutoffScore: cutoff[tier],
    })),
  };
}

const RANK_LADDER: RankTitleId[] = ['APPRENTI', 'CONFIRME', 'CHASSEUR_KORA', 'MAITRE_POSITION', 'MAITRE_NJAMBO', 'LEGENDE_KORA'];

export interface ConfirmedGoal {
  minGames: number;
  minWins: number;
}

export interface RankProgressInput {
  titleId: RankTitleId;
  masteryScore: number;
  gamesPlayed: number;
  gamesWon: number;
  isGuest: boolean;
  inactivitySteps: number;
  tiers: TierSummary[];
  confirmed: ConfirmedGoal;
}

export interface RankProgress {
  nextTitleId: RankTitleId | null;
  percent: number;
  /** Points à gagner pour le palier suivant, quand c'est un palier disputé. */
  pointsToNext: number | null;
  gamesLeft: number;
  winsLeft: number;
  /** Invité : les paliers disputés demandent un compte Google. */
  needsLogin: boolean;
  /** Rang perdu par inactivité : rejouer suffit à le retrouver. */
  needsToPlay: boolean;
}

/** Ce qui sépare le joueur du palier suivant, d'après son score à jour et les places du moment. */
export function rankProgress(input: RankProgressInput): RankProgress {
  const index = RANK_LADDER.indexOf(input.titleId);
  const nextTitleId = index >= 0 && index < RANK_LADDER.length - 1 ? RANK_LADDER[index + 1] : null;
  const progress: RankProgress = { nextTitleId, percent: 100, pointsToNext: null, gamesLeft: 0, winsLeft: 0, needsLogin: false, needsToPlay: false };
  if (!nextTitleId) return progress;

  if (nextTitleId === 'CONFIRME') {
    const { minGames, minWins } = input.confirmed;
    const share = (done: number, goal: number) => (goal > 0 ? Math.min(1, done / goal) : 1);
    return {
      ...progress,
      percent: Math.round(((share(input.gamesPlayed, minGames) + share(input.gamesWon, minWins)) / 2) * 100),
      gamesLeft: Math.max(0, minGames - input.gamesPlayed),
      winsLeft: Math.max(0, minWins - input.gamesWon),
    };
  }

  if (input.isGuest) return { ...progress, percent: 0, needsLogin: true };

  const tier = input.tiers.find((t) => t.titleId === nextTitleId);
  const needsToPlay = input.inactivitySteps > 0;
  if (!tier) return { ...progress, percent: 0, needsToPlay };

  // Places libres : le minimum suffit. Sinon, il faut passer devant le dernier joueur du palier.
  const target = tier.holders < tier.places || tier.cutoffScore === null ? tier.minScore : Math.max(tier.minScore, Math.floor(tier.cutoffScore) + 1);
  const pointsToNext = Math.max(1, Math.ceil(target - input.masteryScore));
  return {
    ...progress,
    percent: target > 0 ? Math.min(99, Math.max(0, Math.round((input.masteryScore / target) * 100))) : 0,
    pointsToNext,
    needsToPlay,
  };
}

/** Condition d'un rang, en toutes lettres. */
export function rankConditionLabel(titleId: RankTitleId, tiers: TierSummary[], confirmed: ConfirmedGoal): string {
  if (titleId === 'APPRENTI') return 'Dès le départ';
  if (titleId === 'CONFIRME') return `${confirmed.minGames} parties et ${confirmed.minWins} victoires`;
  const tier = tiers.find((t) => t.titleId === titleId);
  return tier ? `Top ${tier.topPercent} % et ${tier.minScore.toLocaleString('fr-FR')} points` : 'Réservé aux meilleurs joueurs';
}

/** La phrase qui dit au joueur quoi faire pour le palier suivant. */
export function rankGoalLabel(progress: RankProgress): string {
  if (progress.needsLogin) return 'Connecte-toi avec Google pour viser les rangs supérieurs.';
  if (progress.needsToPlay) return 'Tu as perdu du terrain faute de partie : rejoue pour retrouver ta place.';
  if (progress.pointsToNext !== null) return `Encore ${formatPoints(progress.pointsToNext)} pour y arriver.`;
  const goals: string[] = [];
  if (progress.gamesLeft > 0) goals.push(`${progress.gamesLeft} ${progress.gamesLeft > 1 ? 'parties' : 'partie'}`);
  if (progress.winsLeft > 0) goals.push(`${progress.winsLeft} ${progress.winsLeft > 1 ? 'victoires' : 'victoire'}`);
  return goals.length > 0 ? `Encore ${goals.join(' et ')}.` : 'Encore un peu de patience : ton rang arrive.';
}

function formatPoints(points: number): string {
  const rounded = points >= 1000 ? `${String(Math.round(points / 100) / 10).replace('.', ',')} k` : String(points);
  return `${rounded} ${points > 1 ? 'points' : 'point'}`;
}
