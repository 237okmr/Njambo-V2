/**
 * Tests de la RÈGLE DU RELAIS.
 * Un joueur absent (déconnexion, 3 tours manqués, départ) est remplacé par un relais jusqu'à la fin de la partie :
 *  - le relais ne peut pas gagner le pot (partage égal entre les joueurs présents, sans bonus Kora) ;
 *  - le joueur perd sa mise, et paie la pénalité de Kora des perdants seulement si un Kora a lieu ;
 *  - s'il revient avant la fin de la partie, il reprend la main sans aucun coût ;
 *  - au début de la partie suivante, absent = forfait pour cette partie (sans mise ni pénalité) ; retour possible ensuite ;
 *  - un seul joueur présent : victoire de la manche par forfait.
 * Tous les règlements vérifient la conservation des jetons (somme des nets = 0, aucun jeton détruit).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

(globalThis as any).require = () => ({ RoomManager: { getRoom: () => null } });

import { ServerGameEngine, ActiveRoomState, PlayerAlert } from './serverGameEngine';
import { DEFAULT_ENGINE_CONFIG } from './engineConfig';
import { getPlayableCards } from '../../src/utils/deck';
import type { MultiplayerRoom, RoomPlayer, PartieResult } from '../../src/types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mkPlayer(id: string, host = false): RoomPlayer {
  return {
    id, name: id, isHost: host, isHuman: true, avatarSeed: id, score: 100, capital: 100,
    isEliminated: false, isSpectator: false, hand: [], tricksWonInRound: 0, connected: true, isReady: true,
  } as RoomPlayer;
}

function createTable(n: number, config: Record<string, number> = {}, turnTimerSeconds?: number) {
  const ids = ['A', 'B', 'C', 'D'].slice(0, n);
  const room = {
    id: 'R' + Math.random().toString(36).slice(2, 6), hostId: 'A', hostName: 'A', status: 'LOBBY',
    fillWithBots: false, maxPlayers: n, baseBet: 10, initialCapital: 100, enableDoubleKora: true, enableUnder21: true,
    players: ids.map((id, i) => mkPlayer(id, i === 0)), gameState: null, createdAt: Date.now(), updatedAt: Date.now(),
    ...(turnTimerSeconds ? { turnTimerSeconds } : {}),
  } as unknown as MultiplayerRoom;
  const results: PartieResult[] = [];
  const alerts: Array<{ id: string; alert: PlayerAlert }> = [];
  const state = {
    room,
    engineConfig: { ...DEFAULT_ENGINE_CONFIG, trickResolutionTimeMs: 3, transitionDelayMs: 600000, botThinkTimeMs: 1, instantWinAnimationTimeMs: 3, ...config },
    turnTimeoutTimer: null, trickResolutionTimer: null, nextPartieTimer: null, botMoveTimer: null,
    disconnectTimers: new Map(), consecutiveTimeouts: new Map(), aiRelayTimers: new Map(),
    onPartieResult: (r: PartieResult) => results.push(r),
    onPlayerAlert: (id: string, _r: MultiplayerRoom, alert: PlayerAlert) => alerts.push({ id, alert }),
  } as unknown as ActiveRoomState;
  ServerGameEngine.startNewGame(room, () => {}, state);
  return { room, state, results, alerts };
}

/**
 * Crée une table dont la donne est réellement en cours, avec un joueur dont c'est le tour.
 * Environ 7 % des donnes tirées au hasard se terminent d'emblée par une victoire instantanée (trois 7, moins de 21) :
 * la phase reste PLAYING mais currentTurnIndex vaut -1 et instantWinReveal est renseigné. Il n'y a alors ni tour
 * à jouer ni relais possible, et le test deviendrait aléatoire. On retire donc les cartes.
 */
function setup(n: number, config: Record<string, number> = {}, turnTimerSeconds?: number) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const table = createTable(n, config, turnTimerSeconds);
    const gs = table.room.gameState;
    if (gs && gs.phase === 'PLAYING' && gs.currentTurnIndex >= 0 && !gs.instantWinReveal) return table;
    (ServerGameEngine as any).clearAllTimers(table.state);
  }
  throw new Error('Impossible d\'obtenir une donne en cours après 200 tirages');
}

const stop = (state: ActiveRoomState) => (ServerGameEngine as any).clearAllTimers(state);
const nets = (r: PartieResult) => Object.fromEntries(r.participants.map((p) => [p.playerId, p.net]));
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

/** Marque un joueur comme absent sous relais (comme le fait startRelay), sans dépendre des minuteries. */
function markRelay(room: MultiplayerRoom, id: string, disconnected = true) {
  for (const p of [room.players.find((x) => x.id === id)!, room.gameState!.players.find((x) => x.id === id)!]) {
    p.relayAbsent = true;
    if (disconnected) {
      (p as any).connected = false;
      (p as any).isAiRelay = true;
    }
  }
}

/** Termine la partie avec 5 plis fictifs : le 5e pli est gagné par `winnerId` avec une carte de valeur `value`. */
function finishPartie(room: MultiplayerRoom, state: ActiveRoomState, winnerId: string, value = 8) {
  const gs = room.gameState!;
  const idx = gs.players.findIndex((p) => p.id === winnerId);
  gs.tricksHistory = [1, 2, 3, 4, 5].map((n) => ({
    trickNumber: n,
    leadSuit: 'COEUR',
    leadPlayerIndex: 0,
    leadPlayerName: gs.players[0].name,
    plays: gs.players.map((p, i) => ({
      card: { id: `x${n}_${i}`, suit: 'COEUR', value: n === 5 ? value : 5, label: '', shortLabel: '' },
      playerIndex: i, playerName: p.name, playerId: p.id, isLeadCard: i === 0, isMatchingSuit: true, isWinningSoFar: false, playedOrder: i + 1,
    })),
    winnerIndex: n === 5 ? idx : (n % gs.players.length),
    winnerName: n === 5 ? gs.players[idx].name : gs.players[n % gs.players.length].name,
    winningCard: { id: `w${n}`, suit: 'COEUR', value: n === 5 ? value : 5, label: '', shortLabel: '' },
    isComplete: true,
  })) as any;
  (ServerGameEngine as any).resolvePartieOver(room, () => {}, state);
}

describe('règle du relais : règlement de la partie', () => {
  it('3 joueurs : le relais gagne => le pot est partagé entre les 2 présents (+5 / +5 / -10)', () => {
    const { room, state, results } = setup(3);
    stop(state);
    markRelay(room, 'C');
    finishPartie(room, state, 'C');
    assert.equal(results.length, 1);
    assert.deepEqual(nets(results[0]), { A: 5, B: 5, C: -10 });
    assert.equal(sum(nets(results[0])), 0);
    assert.equal(results[0].burned, 0);
    assert.equal(results[0].endReason, 'RELAY_SPLIT');
    assert.equal(results[0].winType, 'STANDARD');
    stop(state);
  });

  it('4 joueurs : le reste de la division va aux premiers sièges, aucun jeton perdu (+4 / +3 / +3 / -10)', () => {
    const { room, state, results } = setup(4);
    stop(state);
    markRelay(room, 'D');
    finishPartie(room, state, 'D');
    assert.deepEqual(nets(results[0]), { A: 4, B: 3, C: 3, D: -10 });
    assert.equal(sum(nets(results[0])), 0);
    assert.equal(results[0].burned, 0);
    stop(state);
  });

  it('2 joueurs : le relais ne peut pas gagner, le joueur présent reçoit tout le pot (+10 / -10)', () => {
    const { room, state, results } = setup(2);
    stop(state);
    markRelay(room, 'B');
    finishPartie(room, state, 'B');
    assert.deepEqual(nets(results[0]), { A: 10, B: -10 });
    stop(state);
  });

  it('un 3 au 5e pli gagné par le relais ne donne PAS de Kora : aucun bonus, aucune pénalité', () => {
    const { room, state, results } = setup(3);
    stop(state);
    markRelay(room, 'C');
    finishPartie(room, state, 'C', 3);
    assert.deepEqual(nets(results[0]), { A: 5, B: 5, C: -10 });
    assert.equal(results[0].winType, 'STANDARD');
    stop(state);
  });

  it('un joueur présent gagne : le relais perd sa mise seule (aucune pénalité de départ)', () => {
    const { room, state, results } = setup(3);
    stop(state);
    markRelay(room, 'C');
    finishPartie(room, state, 'A');
    assert.deepEqual(nets(results[0]), { A: 20, B: -10, C: -10 });
    assert.equal(results[0].endReason, 'TRICKS_COMPLETED');
    stop(state);
  });

  it('Kora d\'un joueur présent : le relais paie la pénalité de Kora comme tout perdant (+40 / -20 / -20)', () => {
    const { room, state, results } = setup(3);
    stop(state);
    markRelay(room, 'C');
    finishPartie(room, state, 'A', 3);
    assert.deepEqual(nets(results[0]), { A: 40, B: -20, C: -20 });
    assert.equal(sum(nets(results[0])), 0);
    stop(state);
  });

  it('le joueur revenu avant la fin (relais effacé) gagne normalement le pot', () => {
    const { room, state, results } = setup(3);
    stop(state);
    markRelay(room, 'C');
    assert.equal(ServerGameEngine.endRelay(room, 'C'), true);
    finishPartie(room, state, 'C');
    assert.deepEqual(nets(results[0]), { A: -10, B: -10, C: 20 });
    stop(state);
  });

  it('aucun joueur présent pour recevoir le partage : le résultat normal s\'applique (pas de jeton perdu)', () => {
    const { room, state, results } = setup(2);
    stop(state);
    markRelay(room, 'A');
    markRelay(room, 'B');
    finishPartie(room, state, 'B');
    assert.equal(sum(nets(results[0])), 0);
    assert.equal(results[0].burned, 0);
    stop(state);
  });

  it('alerte de coût envoyée au joueur encore absent (avec la pénalité de Kora éventuelle)', () => {
    const { room, state, alerts } = setup(3);
    stop(state);
    markRelay(room, 'C');
    finishPartie(room, state, 'A', 3);
    const cost = alerts.find((a) => a.id === 'C' && a.alert.kind === 'RELAY_COST');
    assert.ok(cost);
    assert.equal((cost!.alert as any).koraPenalty, 10);
    assert.equal((cost!.alert as any).potShared, false);
    stop(state);
  });
});

describe('règle du relais : démarrage, reprise de la main', () => {
  it('startRelay : idempotent, siège conservé, relais actif si déconnecté', () => {
    const { room, state, alerts } = setup(3);
    stop(state);
    const rp = room.players.find((p) => p.id === 'C')!;
    rp.connected = false;
    room.gameState!.players.find((p) => p.id === 'C')!.connected = false;
    ServerGameEngine.startRelay(room, 'C', () => {}, state, 'DISCONNECT');
    ServerGameEngine.startRelay(room, 'C', () => {}, state, 'DISCONNECT');
    assert.equal(rp.relayAbsent, true);
    assert.equal(rp.isAiRelay, true);
    assert.notEqual(rp.isForfeit, true);
    assert.equal(alerts.filter((a) => a.alert.kind === 'RELAY_STARTED').length, 1);
    assert.equal(room.gameState!.players.length, 3);
    stop(state);
  });

  it('inactif mais connecté : relayAbsent sans isAiRelay (le joueur peut reprendre la main en rejouant)', () => {
    const { room, state } = setup(3);
    stop(state);
    ServerGameEngine.startRelay(room, 'B', () => {}, state, 'AFK');
    const rp = room.players.find((p) => p.id === 'B')!;
    assert.equal(rp.relayAbsent, true);
    assert.notEqual(rp.isAiRelay, true);
    stop(state);
  });

  it('un joueur qui joue lui-même reprend la main : le relais s\'efface', () => {
    const { room, state } = setup(3);
    stop(state);
    const gs = room.gameState!;
    const current = gs.players[gs.currentTurnIndex];
    ServerGameEngine.startRelay(room, current.id, () => {}, state, 'AFK');
    assert.equal(room.players.find((p) => p.id === current.id)!.relayAbsent, true);
    const card = getPlayableCards(current.hand, gs.currentTrick?.leadSuit ?? null)[0];
    assert.equal(ServerGameEngine.handlePlayCard(room, current.id, card.id, () => {}, state), true);
    assert.equal(room.players.find((p) => p.id === current.id)!.relayAbsent, false);
    stop(state);
  });

  it('la reconnexion efface le relais', () => {
    const { room, state } = setup(3);
    stop(state);
    room.players.find((p) => p.id === 'C')!.connected = false;
    room.gameState!.players.find((p) => p.id === 'C')!.connected = false;
    ServerGameEngine.startRelay(room, 'C', () => {}, state, 'DISCONNECT');
    ServerGameEngine.handlePlayerReconnect(room, 'C', () => {}, state);
    assert.equal(room.players.find((p) => p.id === 'C')!.relayAbsent, false);
    assert.equal(room.players.find((p) => p.id === 'C')!.connected, true);
    stop(state);
  });

  it('hasAbsentHuman : déconnecté ou sous relais', () => {
    const { room, state } = setup(3);
    stop(state);
    assert.equal(ServerGameEngine.hasAbsentHuman(room), false);
    room.players.find((p) => p.id === 'B')!.relayAbsent = true;
    assert.equal(ServerGameEngine.hasAbsentHuman(room), true);
    room.players.find((p) => p.id === 'B')!.relayAbsent = false;
    room.players.find((p) => p.id === 'C')!.connected = false;
    assert.equal(ServerGameEngine.hasAbsentHuman(room), true);
    stop(state);
  });
});

describe('règle du relais : début de la partie suivante', () => {
  it('absent = forfait pour la partie (ni mise ni pénalité), alerte envoyée, relais réinitialisé', () => {
    const { room, state, alerts } = setup(3);
    stop(state);
    markRelay(room, 'C');
    finishPartie(room, state, 'A');
    const capC = room.gameState!.players.find((p) => p.id === 'C')!.capital;
    ServerGameEngine.advanceToNextPartie(room, () => {}, state);
    const gs = room.gameState!;
    const c = gs.players.find((p) => p.id === 'C')!;
    assert.equal(c.isForfeit, true);
    assert.equal(c.capital, capC, 'aucune mise ni pénalité prélevée sur le joueur forfait');
    assert.equal(gs.pot, 20, 'seuls les deux présents misent');
    assert.equal(c.relayAbsent, false);
    assert.ok(alerts.some((a) => a.id === 'C' && a.alert.kind === 'PARTIE_FORFEIT'));
    stop(state);
  });

  it('retour possible sans limite : reconnecté, le joueur est réintégré et remise à la partie suivante', () => {
    const { room, state } = setup(3);
    stop(state);
    markRelay(room, 'C');
    finishPartie(room, state, 'A');
    ServerGameEngine.advanceToNextPartie(room, () => {}, state);
    stop(state);
    // Partie 2 jouée sans C, puis C se reconnecte pendant la partie 2 ou entre les parties.
    finishPartie(room, state, 'A');
    room.players.find((p) => p.id === 'C')!.connected = true;
    room.gameState!.players.find((p) => p.id === 'C')!.connected = true;
    ServerGameEngine.advanceToNextPartie(room, () => {}, state);
    const c = room.gameState!.players.find((p) => p.id === 'C')!;
    assert.notEqual(c.isForfeit, true);
    assert.equal(room.gameState!.pot, 30, 'les trois misent de nouveau');
    stop(state);
  });

  it('un seul joueur présent : victoire de la manche par forfait dès la partie suivante', () => {
    const { room, state, alerts } = setup(2);
    stop(state);
    markRelay(room, 'B');
    finishPartie(room, state, 'A');
    ServerGameEngine.advanceToNextPartie(room, () => {}, state);
    assert.equal(room.status, 'MANCHE_OVER');
    assert.equal(room.gameState!.mancheWinnerName, 'A');
    assert.ok(alerts.some((a) => a.id === 'B' && a.alert.kind === 'MANCHE_LOST_BY_FORFEIT'));
    stop(state);
  });

  it('inactif mais connecté : forfait pour la partie s\'il n\'a pas confirmé sa présence', () => {
    const { room, state } = setup(3);
    stop(state);
    markRelay(room, 'C', false);
    finishPartie(room, state, 'A');
    ServerGameEngine.advanceToNextPartie(room, () => {}, state);
    assert.equal(room.gameState!.players.find((p) => p.id === 'C')!.isForfeit, true);
    stop(state);
  });

  it('inactif mais connecté : confirme sa présence (prêt) => rejoue la partie suivante', () => {
    const { room, state } = setup(3);
    stop(state);
    markRelay(room, 'C', false);
    finishPartie(room, state, 'A');
    room.players.find((p) => p.id === 'C')!.readyForNextPartie = true;
    ServerGameEngine.advanceToNextPartie(room, () => {}, state);
    assert.notEqual(room.gameState!.players.find((p) => p.id === 'C')!.isForfeit, true);
    assert.equal(room.gameState!.pot, 30);
    stop(state);
  });
});

describe('règle du relais : inactivité (3 tours manqués)', () => {
  it('au 3e tour manqué : relais jusqu\'à la fin de la partie, jamais de forfait ni de bot', async () => {
    const { room, state, alerts } = setup(2, {}, 0.01);
    let steps = 0;
    while (steps < 1500) {
      const gs = room.gameState!;
      const a = room.players.find((p) => p.id === 'A')!;
      if (a.relayAbsent || room.status !== 'PLAYING') break;
      if (gs.phase === 'PLAYING') {
        const cur = gs.players[gs.currentTurnIndex];
        if (cur && cur.id === 'B' && cur.hand.length > 0) {
          const card = getPlayableCards(cur.hand, gs.currentTrick?.leadSuit ?? null)[0];
          if (card) ServerGameEngine.handlePlayCard(room, 'B', card.id, () => {}, state);
        }
      }
      await sleep(5);
      steps++;
    }
    stop(state);
    const a = room.players.find((p) => p.id === 'A')!;
    assert.equal(a.relayAbsent, true, 'A est passé sous relais');
    assert.notEqual(a.isForfeit, true, 'A n\'est pas déclaré forfait');
    assert.equal(a.isHuman, true, 'le siège n\'est pas donné à un bot');
    const warnings = alerts.filter((x) => x.id === 'A' && x.alert.kind === 'TIMEOUT_WARNING');
    assert.equal(warnings.length, 2);
  });
});

async function playOneGameWithAbsence(n: number, departAt: number, returnAt: number | null) {
  const { room, state, results } = setup(n, { aiRelayGraceSeconds: 0.001 });
  let plays = 0;
  let departed: string | null = null;
  let returned = false;
  let steps = 0;
  while (room.status === 'PLAYING' && steps < 800) {
    const gs = room.gameState!;
    if (!departed && plays >= departAt && gs.phase === 'PLAYING') {
      const alive = gs.players.filter((p) => !p.isEliminated && !p.isForfeit);
      const victim = alive[Math.floor(Math.random() * alive.length)];
      departed = victim.id;
      (room.players.find((p) => p.id === victim.id) as any).connected = false;
      ServerGameEngine.handlePlayerDisconnect(room, victim.id, () => {}, state);
    }
    if (departed && !returned && returnAt !== null && plays >= returnAt && gs.phase === 'PLAYING') {
      returned = true;
      ServerGameEngine.handlePlayerReconnect(room, departed, () => {}, state);
    }
    if (room.status === 'PLAYING' && gs.phase === 'PLAYING') {
      const p = gs.players[gs.currentTurnIndex];
      const rp = room.players.find((x) => x.id === p?.id);
      const isRelayTurn = rp && (rp.connected === false || rp.relayAbsent);
      if (p && !isRelayTurn && !p.isEliminated && !p.isForfeit && !p.isFoldedInRound && p.hand.length > 0) {
        const playable = getPlayableCards(p.hand, gs.currentTrick?.leadSuit ?? null);
        const card = playable[Math.floor(Math.random() * playable.length)];
        if (card && ServerGameEngine.handlePlayCard(room, p.id, card.id, () => {}, state)) plays++;
      }
    }
    await sleep(3);
    steps++;
  }
  stop(state);
  return { room, results, departed, returned };
}

describe('règle du relais : parties aléatoires avec absence (conservation des jetons)', () => {
  it('60 parties (2 à 4 joueurs, départ puis retour éventuel) : somme nulle, net = variation du capital, le relais ne gagne jamais', async () => {
    const problems: string[] = [];
    let relayStillAbsentAtEnd = 0;
    for (let i = 0; i < 60; i++) {
      const n = 2 + (i % 3);
      const departAt = Math.floor(Math.random() * n * 4);
      const returnAt = i % 2 === 0 ? departAt + 1 + Math.floor(Math.random() * n * 2) : null;
      const { room, results, departed } = await playOneGameWithAbsence(n, departAt, returnAt);
      if (results.length === 0) {
        if (room.status === 'PARTIE_OVER' || room.status === 'MANCHE_OVER') problems.push(`partie terminée sans résultat (n=${n})`);
        continue;
      }
      const r = results[0];
      const total = r.participants.reduce((s, p) => s + p.net, 0);
      if (total !== 0 || r.burned !== 0) problems.push(`somme=${total} détruit=${r.burned} (n=${n}, ${r.endReason})`);
      for (const p of r.participants) {
        const cap = room.gameState!.players.find((g) => g.id === p.playerId)?.capital ?? 0;
        if (cap - 100 !== p.net) problems.push(`net ${p.net} != variation ${cap - 100} pour ${p.playerId} (n=${n}, ${r.endReason})`);
      }
      const stillRelay = room.gameState!.players.find((g) => g.id === departed && g.relayAbsent);
      if (stillRelay) {
        relayStillAbsentAtEnd++;
        const part = r.participants.find((p) => p.playerId === stillRelay.id)!;
        if (part.gross > 0 || part.net >= 0) problems.push(`le relais de ${stillRelay.id} a gagné (gross=${part.gross}, net=${part.net}, n=${n})`);
      }
    }
    assert.deepEqual(problems, []);
    assert.ok(relayStillAbsentAtEnd > 5, 'le scénario « absent jusqu\'à la fin » doit être réellement exercé');
  });
});
