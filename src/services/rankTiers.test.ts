import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RankSettings, RankedPlayerInput, baseRankTitle, computeRanks, inactivitySteps, rankSettingsFromConfig, tierPlaces, withPublicRanks } from './rankTiers';
import { DEFAULT_ENGINE_CONFIG } from '../../server/engine/engineConfig';

const settings: RankSettings = {
  topPercent: { LEGENDE_KORA: 1, MAITRE_NJAMBO: 5, MAITRE_POSITION: 15, CHASSEUR_KORA: 35 },
  minScore: { LEGENDE_KORA: 1000, MAITRE_NJAMBO: 300, MAITRE_POSITION: 100, CHASSEUR_KORA: 25 },
  confirmedMinGames: 5,
  confirmedMinWins: 2,
  inactivityDays: 14,
};

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const player = (uid: string, masteryScore: number, extra: Partial<RankedPlayerInput> = {}): RankedPlayerInput => ({
  uid,
  masteryScore,
  gamesPlayed: 50,
  gamesWon: 20,
  lastGameAt: NOW - DAY,
  ...extra,
});

/** Joueurs de scores décroissants, tous actifs. */
const crowd = (count: number, top: number): RankedPlayerInput[] =>
  Array.from({ length: count }, (_, i) => player(`p${String(i).padStart(4, '0')}`, Math.max(0, top - i)));

const titlesCount = (ranks: Record<string, { titleId: string }>) =>
  Object.values(ranks).reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.titleId]: (acc[r.titleId] ?? 0) + 1 }), {});

describe('rangs dynamiques : places', () => {
  it('donne au moins une place à chaque palier et cumule les places', () => {
    assert.deepEqual(tierPlaces(5, settings), { LEGENDE_KORA: 1, MAITRE_NJAMBO: 1, MAITRE_POSITION: 1, CHASSEUR_KORA: 2 });
    assert.deepEqual(tierPlaces(20, settings), { LEGENDE_KORA: 1, MAITRE_NJAMBO: 1, MAITRE_POSITION: 3, CHASSEUR_KORA: 7 });
    assert.deepEqual(tierPlaces(300, settings), { LEGENDE_KORA: 3, MAITRE_NJAMBO: 15, MAITRE_POSITION: 45, CHASSEUR_KORA: 105 });
    assert.deepEqual(tierPlaces(0, settings), { LEGENDE_KORA: 0, MAITRE_NJAMBO: 0, MAITRE_POSITION: 0, CHASSEUR_KORA: 0 });
  });

  it('garde les places cohérentes si les pourcentages réglés sont dans le désordre', () => {
    const places = tierPlaces(100, { ...settings, topPercent: { ...settings.topPercent, MAITRE_NJAMBO: 0 } });
    assert.ok(places.MAITRE_NJAMBO >= places.LEGENDE_KORA);
    assert.ok(places.MAITRE_POSITION >= places.MAITRE_NJAMBO);
  });
});

describe('rangs dynamiques : selon le nombre de joueurs', () => {
  it('5 joueurs : le premier n’est pas Légende sans le minimum de score', () => {
    const { ranks } = computeRanks(crowd(5, 40), settings, NOW);
    assert.equal(ranks.p0000.titleId, 'CHASSEUR_KORA');
    assert.equal(ranks.p0001.titleId, 'CHASSEUR_KORA');
    assert.equal(ranks.p0002.titleId, 'CONFIRME');
  });

  it('20 joueurs de bon niveau : la pyramide suit les places', () => {
    const { ranks } = computeRanks(crowd(20, 5000), settings, NOW);
    assert.deepEqual(titlesCount(ranks), { LEGENDE_KORA: 1, MAITRE_POSITION: 2, CHASSEUR_KORA: 4, CONFIRME: 13 });
  });

  it('300 joueurs de bon niveau : la pyramide suit les pourcentages', () => {
    const { ranks } = computeRanks(crowd(300, 5000), settings, NOW);
    assert.deepEqual(titlesCount(ranks), { LEGENDE_KORA: 3, MAITRE_NJAMBO: 12, MAITRE_POSITION: 30, CHASSEUR_KORA: 60, CONFIRME: 195 });
  });

  it('le total annoncé compte quand le serveur n’a lu qu’une partie des joueurs', () => {
    const { tiers, totalPlayers } = computeRanks(crowd(300, 5000), settings, NOW, { totalPlayers: 1000 });
    assert.equal(totalPlayers, 1000);
    assert.equal(tiers[0].places, 10);
  });

  it('sans aucun joueur, rien ne casse', () => {
    const { ranks, tiers } = computeRanks([], settings, NOW);
    assert.deepEqual(ranks, {});
    assert.equal(tiers[0].cutoffScore, null);
  });
});

describe('rangs dynamiques : monter et redescendre', () => {
  it('un joueur redescend quand un autre le dépasse, sans perdre de score', () => {
    const before = computeRanks([player('ada', 1500), player('bo', 1200)], settings, NOW);
    assert.equal(before.ranks.ada.titleId, 'LEGENDE_KORA');
    const after = computeRanks([player('ada', 1500), player('bo', 1600)], settings, NOW);
    assert.equal(after.ranks.bo.titleId, 'LEGENDE_KORA');
    assert.notEqual(after.ranks.ada.titleId, 'LEGENDE_KORA');
  });

  it('à égalité, l’ordre reste le même d’un calcul à l’autre', () => {
    const a = computeRanks([player('ada', 1500), player('bo', 1500)], settings, NOW);
    const b = computeRanks([player('bo', 1500), player('ada', 1500)], settings, NOW);
    assert.deepEqual(a.ranks, b.ranks);
  });

  it('un score sous le minimum ne donne jamais le palier, même en tête', () => {
    const { ranks } = computeRanks([player('solo', 999)], settings, NOW);
    assert.equal(ranks.solo.titleId, 'MAITRE_NJAMBO');
  });

  it('donne le score à dépasser pour chaque palier', () => {
    const { tiers } = computeRanks(crowd(20, 5000), settings, NOW);
    assert.equal(tiers[0].cutoffScore, 5000);
    assert.equal(tiers[3].cutoffScore, 4994);
  });
});

describe('rangs dynamiques : inactivité', () => {
  it('compte un palier par période entière écoulée', () => {
    assert.equal(inactivitySteps(NOW - 13 * DAY, NOW, 14), 0);
    assert.equal(inactivitySteps(NOW - 14 * DAY, NOW, 14), 1);
    assert.equal(inactivitySteps(NOW - 29 * DAY, NOW, 14), 2);
    assert.equal(inactivitySteps(NOW - 100 * DAY, NOW, 0), 0);
    assert.equal(inactivitySteps(undefined, NOW, 14), 0);
  });

  it('un inactif perd un palier et sa place revient au suivant', () => {
    const players = [player('ancien', 5000, { lastGameAt: NOW - 15 * DAY }), ...crowd(99, 4000)];
    const { ranks } = computeRanks(players, settings, NOW);
    assert.deepEqual(ranks.ancien, { titleId: 'MAITRE_NJAMBO', inactivitySteps: 1 });
    assert.equal(ranks.p0000.titleId, 'LEGENDE_KORA');
  });

  it('ne passe jamais sous Confirmé pour inactivité', () => {
    const players = [player('ancien', 5000, { lastGameAt: NOW - 200 * DAY, gamesPlayed: 1, gamesWon: 0 }), ...crowd(99, 4000)];
    const { ranks } = computeRanks(players, settings, NOW);
    assert.equal(ranks.ancien.titleId, 'CONFIRME');
  });

  it('retrouve le rang de sa place dès qu’il rejoue', () => {
    const players = [player('ancien', 5000, { lastGameAt: NOW - DAY }), ...crowd(99, 4000)];
    assert.deepEqual(computeRanks(players, settings, NOW).ranks.ancien, { titleId: 'LEGENDE_KORA', inactivitySteps: 0 });
  });

  it('un joueur sans partie connue garde le bénéfice du doute', () => {
    const players = [player('discret', 5000, { lastGameAt: undefined }), ...crowd(99, 4000)];
    const window = NOW - 3 * DAY;
    assert.equal(computeRanks(players, settings, NOW, { unknownActivitySince: window }).ranks.discret.titleId, 'LEGENDE_KORA');
    assert.equal(computeRanks(players, settings, NOW, { unknownActivitySince: NOW - 30 * DAY }).ranks.discret.titleId, 'MAITRE_POSITION');
  });

  it('la perte peut être coupée dans les réglages', () => {
    const players = [player('ancien', 5000, { lastGameAt: NOW - 200 * DAY })];
    assert.equal(computeRanks(players, { ...settings, inactivityDays: 0 }, NOW).ranks.ancien.titleId, 'LEGENDE_KORA');
  });
});

describe('rangs dynamiques : réglages et données publiées', () => {
  it('les valeurs de départ du registre Katika sont celles choisies', () => {
    assert.deepEqual(rankSettingsFromConfig(DEFAULT_ENGINE_CONFIG as unknown as Record<string, number>), settings);
  });

  it('la date de dernière partie ne sort jamais, le rang si', () => {
    const [user] = withPublicRanks([{ uid: 'ada', displayName: 'Ada', lastGameAt: NOW }], { ada: { titleId: 'LEGENDE_KORA', inactivitySteps: 0 } });
    assert.equal('lastGameAt' in user, false);
    assert.deepEqual(user.dynamicRank, { titleId: 'LEGENDE_KORA', inactivitySteps: 0 });
    assert.equal(user.displayName, 'Ada');
  });
});

describe('rangs dynamiques : objectifs fixes', () => {
  it('Confirmé demande les parties et les victoires', () => {
    assert.equal(baseRankTitle({ gamesPlayed: 5, gamesWon: 2 }, settings), 'CONFIRME');
    assert.equal(baseRankTitle({ gamesPlayed: 4, gamesWon: 4 }, settings), 'APPRENTI');
    assert.equal(baseRankTitle({ gamesPlayed: 50, gamesWon: 1 }, settings), 'APPRENTI');
  });

  it('un joueur faible reste à son rang fixe, sans perte d’inactivité', () => {
    const { ranks } = computeRanks([player('top', 5000), player('petit', 3, { gamesPlayed: 2, gamesWon: 0, lastGameAt: NOW - 90 * DAY })], settings, NOW);
    assert.deepEqual(ranks.petit, { titleId: 'APPRENTI', inactivitySteps: 0 });
  });
});
