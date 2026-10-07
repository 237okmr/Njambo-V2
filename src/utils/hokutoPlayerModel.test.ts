import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Card, PlayedCard, Suit, Trick } from '../types';
import {
  MAX_TRACKED_MODELS,
  clearAllHokutoModels,
  createHokutoPlayerModel,
  getHokutoModel,
  getHokutoTendencies,
  observeAndGetTendencies,
  observeCompletedTricks,
  resetHokutoModel,
  resetHokutoModelsWithPrefix,
} from './hokutoPlayerModel';

const HUMAN = 0;

function card(suit: Suit, value: number): Card {
  return { id: `${suit}_${value}`, suit, value, label: `${value} ${suit}`, shortLabel: `${value}` };
}

function play(
  playerIndex: number,
  c: Card,
  opts: { lead?: boolean; matching?: boolean } = {}
): PlayedCard {
  return {
    card: c,
    playerIndex,
    playerName: `P${playerIndex}`,
    isLeadCard: opts.lead ?? false,
    isMatchingSuit: opts.matching ?? true,
    isWinningSoFar: false,
    playedOrder: 1,
  };
}

/** Pli où le joueur humain (index 0) joue `humanCard`, l'index `winner` gagne. */
function trick(
  n: number,
  humanCard: Card,
  winner: number,
  opts: { humanLeads?: boolean; humanDiscards?: boolean } = {}
): Trick {
  const humanLeads = opts.humanLeads ?? false;
  const plays: PlayedCard[] = [
    play(HUMAN, humanCard, { lead: humanLeads, matching: !opts.humanDiscards }),
    play(1, card('COEUR', 5), { lead: false }),
  ];
  return {
    trickNumber: n,
    leadSuit: humanCard.suit,
    leadPlayerIndex: humanLeads ? HUMAN : 1,
    leadPlayerName: humanLeads ? 'P0' : 'P1',
    plays,
    winnerIndex: winner,
    winnerName: `P${winner}`,
    winningCard: humanCard,
    isComplete: true,
  };
}

describe('hokutoPlayerModel - modèle vide', () => {
  it('reste neutre sans donnée', () => {
    const t = getHokutoTendencies(createHokutoPlayerModel());
    assert.equal(t.confidence, 0);
    assert.equal(t.style, 'BALANCED');
    assert.equal(t.earlyStrongRate, 0.5);
    assert.equal(t.favoriteLeadSuit, null);
    assert.equal(t.favoriteDiscardSuit, null);
  });
});

describe('hokutoPlayerModel - observation', () => {
  it('ne compte jamais deux fois le même pli', () => {
    const model = createHokutoPlayerModel();
    const history = [trick(1, card('COEUR', 10), HUMAN), trick(2, card('PIQUE', 9), HUMAN)];
    observeCompletedTricks(model, history, HUMAN);
    observeCompletedTricks(model, history, HUMAN);
    assert.equal(model.tricksObserved, 2);
    assert.equal(model.earlyPlays, 2);
    assert.equal(model.earlyStrong, 2);
  });

  it('détecte une nouvelle partie quand l\'historique raccourcit', () => {
    const model = createHokutoPlayerModel();
    observeCompletedTricks(model, [trick(1, card('COEUR', 10), HUMAN), trick(2, card('COEUR', 9), HUMAN)], HUMAN);
    observeCompletedTricks(model, [trick(1, card('PIQUE', 8), 1)], HUMAN);
    assert.equal(model.tricksObserved, 3);
  });

  it('apprend les plis ajoutés au fil de la partie', () => {
    const model = createHokutoPlayerModel();
    const t1 = trick(1, card('COEUR', 10), HUMAN);
    const t2 = trick(2, card('COEUR', 9), HUMAN);
    observeCompletedTricks(model, [t1], HUMAN);
    observeCompletedTricks(model, [t1, t2], HUMAN);
    assert.equal(model.tricksObserved, 2);
  });

  it('ignore un pli où le joueur n\'a pas joué (couché)', () => {
    const model = createHokutoPlayerModel();
    const t = trick(1, card('COEUR', 10), 1);
    t.plays = t.plays.filter((p) => p.playerIndex !== HUMAN);
    observeCompletedTricks(model, [t], HUMAN);
    assert.equal(model.tricksObserved, 0);
  });

  it('compte les entames, leur force et les couleurs entamées', () => {
    const model = createHokutoPlayerModel();
    observeCompletedTricks(
      model,
      [
        trick(1, card('COEUR', 10), HUMAN, { humanLeads: true }),
        trick(2, card('COEUR', 9), HUMAN, { humanLeads: true }),
        trick(3, card('PIQUE', 4), 1, { humanLeads: true }),
      ],
      HUMAN
    );
    assert.equal(model.leads, 3);
    assert.equal(model.strongLeads, 2);
    assert.equal(getHokutoTendencies(model).favoriteLeadSuit, 'COEUR');
  });

  it('compte les cartes jetées hors couleur', () => {
    const model = createHokutoPlayerModel();
    observeCompletedTricks(
      model,
      [
        trick(1, card('CARREAU', 4), 1, { humanDiscards: true }),
        trick(2, card('CARREAU', 3), 1, { humanDiscards: true }),
      ],
      HUMAN
    );
    assert.equal(model.discards, 2);
    assert.equal(getHokutoTendencies(model).favoriteDiscardSuit, 'CARREAU');
  });

  it('détecte la réaction après un pli perdu', () => {
    const model = createHokutoPlayerModel();
    observeCompletedTricks(
      model,
      [
        trick(1, card('COEUR', 4), 1), // perdu
        trick(2, card('COEUR', 10), HUMAN), // force après la perte
        trick(3, card('COEUR', 9), 1), // perdu
        trick(4, card('PIQUE', 4), 1), // se protège après la perte
      ],
      HUMAN
    );
    assert.equal(model.afterLossPlays, 2);
    assert.equal(model.afterLossForced, 1);
    assert.equal(model.afterLossProtected, 1);
  });

  it('compte un 3 gardé pour le 5e pli', () => {
    const model = createHokutoPlayerModel();
    observeCompletedTricks(
      model,
      [
        trick(1, card('COEUR', 5), 1),
        trick(2, card('COEUR', 5), 1),
        trick(3, card('COEUR', 5), 1),
        trick(4, card('COEUR', 5), 1),
        trick(5, card('PIQUE', 3), HUMAN),
      ],
      HUMAN
    );
    assert.equal(model.trick5Plays, 1);
    assert.equal(model.trick5Threes, 1);
  });
});

describe('hokutoPlayerModel - styles', () => {
  it('reconnaît un joueur qui force tôt', () => {
    const model = createHokutoPlayerModel();
    const history: Trick[] = [];
    for (let g = 0; g < 4; g++) {
      history.length = 0;
      history.push(trick(1, card('COEUR', 10), HUMAN), trick(2, card('PIQUE', 9), HUMAN), trick(4, card('TREFLE', 4), 1));
      observeCompletedTricks(model, history, HUMAN);
      observeCompletedTricks(model, [], HUMAN); // nouvelle partie
    }
    const t = getHokutoTendencies(model);
    assert.ok(t.confidence >= 0.25);
    assert.equal(t.style, 'EARLY_AGGRESSIVE');
  });

  it('reconnaît un joueur qui garde ses cartes fortes pour la fin', () => {
    const model = createHokutoPlayerModel();
    for (let g = 0; g < 4; g++) {
      observeCompletedTricks(
        model,
        [trick(1, card('COEUR', 4), 1), trick(2, card('PIQUE', 5), 1), trick(4, card('TREFLE', 10), HUMAN), trick(5, card('COEUR', 9), HUMAN)],
        HUMAN
      );
      observeCompletedTricks(model, [], HUMAN);
    }
    assert.equal(getHokutoTendencies(model).style, 'LATE_HOARDER');
  });

  it('reste équilibré tant que la confiance est trop faible', () => {
    const model = createHokutoPlayerModel();
    observeCompletedTricks(model, [trick(1, card('COEUR', 10), HUMAN)], HUMAN);
    assert.equal(getHokutoTendencies(model).style, 'BALANCED');
  });
});

describe('hokutoPlayerModel - registre', () => {
  beforeEach(() => clearAllHokutoModels());

  it('garde un modèle séparé par clé', () => {
    const a = getHokutoModel('T1:alice');
    const b = getHokutoModel('T1:bob');
    assert.notEqual(a, b);
    assert.equal(getHokutoModel('T1:alice'), a);
  });

  it('remet à zéro un joueur ou toute une table', () => {
    const a = getHokutoModel('T1:alice');
    getHokutoModel('T1:bob');
    getHokutoModel('T2:carl');
    resetHokutoModel('T1:alice');
    assert.notEqual(getHokutoModel('T1:alice'), a);
    resetHokutoModelsWithPrefix('T1:');
    const carl = getHokutoModel('T2:carl');
    assert.equal(getHokutoModel('T2:carl'), carl);
  });

  it('plafonne le nombre de modèles en mémoire', () => {
    const first = getHokutoModel('T0:first');
    for (let i = 1; i <= MAX_TRACKED_MODELS; i++) getHokutoModel(`T${i}:p`);
    assert.notEqual(getHokutoModel('T0:first'), first);
  });

  it('observeAndGetTendencies apprend puis renvoie les tendances', () => {
    const t = observeAndGetTendencies('T1:alice', [trick(1, card('COEUR', 10), HUMAN)], HUMAN);
    assert.ok(t.confidence > 0);
    assert.equal(getHokutoModel('T1:alice').tricksObserved, 1);
  });
});
