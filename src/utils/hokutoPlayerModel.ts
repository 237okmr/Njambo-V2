import type { PlayedCard, Suit, Trick } from '../types';

/**
 * Modèle du joueur humain pour Robam Hokuto (Boss).
 *
 * - Un modèle par joueur, remis à zéro à chaque nouvelle manche (jamais sauvegardé).
 * - Apprend uniquement des plis TERMINÉS, à partir d'informations publiques (cartes jouées).
 * - Ne lit jamais les mains cachées.
 * - Aucun délai, aucune horloge : fonctions pures + petit registre en mémoire.
 *
 * Convention de clé : `${identifiantTableOuPartie}:${identifiantJoueur}`.
 */

/** Une carte de valeur >= à ce seuil est jugée « forte » (8, 9, 10). */
export const STRONG_CARD_MIN_VALUE = 8;
/** Une carte de valeur <= à ce seuil est jugée « de protection » (basse). */
export const LOW_CARD_MAX_VALUE = 6;
/** Nombre de plis observés à partir duquel la confiance du modèle atteint 100 %. */
export const FULL_CONFIDENCE_TRICKS = 12;
/** Confiance minimale pour déclarer un style autre que « équilibré ». */
export const MIN_CONFIDENCE_FOR_STYLE = 0.25;
/** Taux au-dessus duquel un comportement est jugé dominant. */
export const DOMINANT_RATE = 0.6;
/** Nombre de modèles conservés en mémoire (serveur multi-tables) ; le plus ancien est évincé. */
export const MAX_TRACKED_MODELS = 500;

const SUITS: Suit[] = ['COEUR', 'CARREAU', 'TREFLE', 'PIQUE'];

function emptySuitCounts(): Record<Suit, number> {
  return { COEUR: 0, CARREAU: 0, TREFLE: 0, PIQUE: 0 };
}

export interface HokutoPlayerModel {
  /** Nombre de plis terminés où le joueur a joué une carte. */
  tricksObserved: number;
  /** Plis 1 et 2 : cartes jouées / dont cartes fortes. */
  earlyPlays: number;
  earlyStrong: number;
  /** Plis 4 et 5 : cartes jouées / dont cartes fortes. */
  latePlays: number;
  lateStrong: number;
  /** Entames du joueur / dont entames fortes, et couleurs entamées. */
  leads: number;
  strongLeads: number;
  leadSuits: Record<Suit, number>;
  /** Cartes jetées hors couleur demandée, et couleurs jetées. */
  discards: number;
  discardSuits: Record<Suit, number>;
  /** Pli suivant un pli perdu : cartes jouées / fortes (il force) / basses (il se protège). */
  afterLossPlays: number;
  afterLossForced: number;
  afterLossProtected: number;
  /** Pli 5 : cartes jouées / dont un 3 (il garde un 3 pour la fin). */
  trick5Plays: number;
  trick5Threes: number;
  /** Nombre de plis de la partie en cours déjà traités (évite tout double comptage). */
  processedInPartie: number;
}

export function createHokutoPlayerModel(): HokutoPlayerModel {
  return {
    tricksObserved: 0,
    earlyPlays: 0,
    earlyStrong: 0,
    latePlays: 0,
    lateStrong: 0,
    leads: 0,
    strongLeads: 0,
    leadSuits: emptySuitCounts(),
    discards: 0,
    discardSuits: emptySuitCounts(),
    afterLossPlays: 0,
    afterLossForced: 0,
    afterLossProtected: 0,
    trick5Plays: 0,
    trick5Threes: 0,
    processedInPartie: 0,
  };
}

function observeTrick(
  model: HokutoPlayerModel,
  trick: Trick,
  previousTrick: Trick | null,
  trickNumber: number,
  humanIndex: number
): void {
  const play: PlayedCard | undefined = (trick.plays || []).find((p) => p.playerIndex === humanIndex);
  if (!play) return;

  const value = play.card.value;
  const strong = value >= STRONG_CARD_MIN_VALUE;

  model.tricksObserved++;

  if (trickNumber <= 2) {
    model.earlyPlays++;
    if (strong) model.earlyStrong++;
  }
  if (trickNumber >= 4) {
    model.latePlays++;
    if (strong) model.lateStrong++;
  }

  if (play.isLeadCard) {
    model.leads++;
    if (strong) model.strongLeads++;
    model.leadSuits[play.card.suit]++;
  } else if (!play.isMatchingSuit) {
    model.discards++;
    model.discardSuits[play.card.suit]++;
  }

  if (
    previousTrick &&
    previousTrick.winnerIndex !== null &&
    previousTrick.winnerIndex !== humanIndex &&
    (previousTrick.plays || []).some((p) => p.playerIndex === humanIndex)
  ) {
    model.afterLossPlays++;
    if (strong) model.afterLossForced++;
    else if (value <= LOW_CARD_MAX_VALUE) model.afterLossProtected++;
  }

  if (trickNumber === 5) {
    model.trick5Plays++;
    if (value === 3) model.trick5Threes++;
  }
}

/**
 * Apprend des plis terminés de la partie en cours. Idempotent : un pli déjà traité n'est jamais recompté.
 * Quand l'historique devient plus court que ce qui a été traité, une nouvelle partie a commencé.
 */
export function observeCompletedTricks(
  model: HokutoPlayerModel,
  tricksHistory: Trick[],
  humanIndex: number
): HokutoPlayerModel {
  const history = Array.isArray(tricksHistory) ? tricksHistory : [];
  if (history.length < model.processedInPartie) {
    model.processedInPartie = 0;
  }
  for (let i = model.processedInPartie; i < history.length; i++) {
    const trick = history[i];
    if (!trick || !Array.isArray(trick.plays)) break;
    const trickNumber = trick.trickNumber || i + 1;
    observeTrick(model, trick, i > 0 ? history[i - 1] : null, trickNumber, humanIndex);
    model.processedInPartie = i + 1;
  }
  return model;
}

export type HokutoHumanStyle = 'EARLY_AGGRESSIVE' | 'LATE_HOARDER' | 'TILTER' | 'BALANCED';

export interface HokutoTendencies {
  /** 0 (aucune donnée) à 1 (assez de plis observés). */
  confidence: number;
  /** Taux lissés entre 0 et 1 (0,5 = neutre quand il n'y a pas de données). */
  earlyStrongRate: number;
  lateStrongRate: number;
  strongLeadRate: number;
  forceAfterLossRate: number;
  protectAfterLossRate: number;
  threeAtFifthRate: number;
  favoriteLeadSuit: Suit | null;
  favoriteDiscardSuit: Suit | null;
  style: HokutoHumanStyle;
}

function smoothedRate(hits: number, total: number): number {
  return (hits + 1) / (total + 2);
}

function favoriteSuit(counts: Record<Suit, number>): Suit | null {
  let best: Suit | null = null;
  let bestCount = 0;
  let tie = false;
  for (const suit of SUITS) {
    const c = counts[suit];
    if (c > bestCount) {
      best = suit;
      bestCount = c;
      tie = false;
    } else if (c === bestCount && c > 0) {
      tie = true;
    }
  }
  return bestCount >= 2 && !tie ? best : null;
}

export function getHokutoTendencies(model: HokutoPlayerModel): HokutoTendencies {
  const confidence = Math.min(1, model.tricksObserved / FULL_CONFIDENCE_TRICKS);
  const earlyStrongRate = smoothedRate(model.earlyStrong, model.earlyPlays);
  const lateStrongRate = smoothedRate(model.lateStrong, model.latePlays);
  const strongLeadRate = smoothedRate(model.strongLeads, model.leads);
  const forceAfterLossRate = smoothedRate(model.afterLossForced, model.afterLossPlays);
  const protectAfterLossRate = smoothedRate(model.afterLossProtected, model.afterLossPlays);
  const threeAtFifthRate = smoothedRate(model.trick5Threes, model.trick5Plays);

  let style: HokutoHumanStyle = 'BALANCED';
  if (confidence >= MIN_CONFIDENCE_FOR_STYLE) {
    if (earlyStrongRate >= DOMINANT_RATE && earlyStrongRate > lateStrongRate) {
      style = 'EARLY_AGGRESSIVE';
    } else if (lateStrongRate >= DOMINANT_RATE && lateStrongRate > earlyStrongRate) {
      style = 'LATE_HOARDER';
    } else if (forceAfterLossRate >= DOMINANT_RATE && model.afterLossPlays >= 3) {
      style = 'TILTER';
    }
  }

  return {
    confidence,
    earlyStrongRate,
    lateStrongRate,
    strongLeadRate,
    forceAfterLossRate,
    protectAfterLossRate,
    threeAtFifthRate,
    favoriteLeadSuit: favoriteSuit(model.leadSuits),
    favoriteDiscardSuit: favoriteSuit(model.discardSuits),
    style,
  };
}

// ---------------------------------------------------------------------------
// Registre en mémoire (un modèle par clé), plafonné pour ne jamais grossir sans limite.
// ---------------------------------------------------------------------------

const models = new Map<string, HokutoPlayerModel>();

export function getHokutoModel(key: string): HokutoPlayerModel {
  const existing = models.get(key);
  if (existing) {
    // Remet l'entrée en fin de liste : la plus ancienne sera évincée en premier.
    models.delete(key);
    models.set(key, existing);
    return existing;
  }
  const created = createHokutoPlayerModel();
  models.set(key, created);
  while (models.size > MAX_TRACKED_MODELS) {
    const oldest = models.keys().next().value;
    if (oldest === undefined) break;
    models.delete(oldest);
  }
  return created;
}

/** Remise à zéro d'un joueur (début de manche). */
export function resetHokutoModel(key: string): void {
  models.delete(key);
}

/** Remise à zéro de tous les joueurs d'une table : toutes les clés commençant par le préfixe. */
export function resetHokutoModelsWithPrefix(prefix: string): void {
  for (const key of Array.from(models.keys())) {
    if (key.startsWith(prefix)) models.delete(key);
  }
}

export function clearAllHokutoModels(): void {
  models.clear();
}

/** Raccourci : apprend des plis terminés puis renvoie les tendances du joueur. */
export function observeAndGetTendencies(
  key: string,
  tricksHistory: Trick[],
  humanIndex: number
): HokutoTendencies {
  const model = getHokutoModel(key);
  observeCompletedTricks(model, tricksHistory, humanIndex);
  return getHokutoTendencies(model);
}

/**
 * Construit la Map<indexJoueur, tendances> des joueurs humains réels pour le Boss.
 * Ignore le bot lui-même, les autres bots et les relais IA.
 * Clé de modèle : `${keyPrefix}:${player.id}` (le préfixe identifie la table/partie solo).
 */
export function collectHokutoTendencies(
  keyPrefix: string,
  players: ReadonlyArray<{ id: string; isHuman?: boolean; isAiRelay?: boolean }>,
  tricksHistory: Trick[],
  botIndex: number
): Map<number, HokutoTendencies> {
  const result = new Map<number, HokutoTendencies>();
  players.forEach((p, i) => {
    if (i === botIndex || !p.isHuman || p.isAiRelay) return;
    result.set(i, observeAndGetTendencies(`${keyPrefix}:${p.id}`, tricksHistory, i));
  });
  return result;
}
