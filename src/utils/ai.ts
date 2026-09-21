import { AIDifficulty, AIStrategy, Card, PlayedCard, Player, Suit, Trick } from '../types';
import { determineTrickWinner, getPlayableCards, build31Deck } from './deck';
import {
  EASY_CONFIG,
  NORMAL_CONFIG,
  EXPERT_CONFIG,
  GRAND_MASTER_CONFIG,
} from './aiLevelConfig';
import { chooseMonteCarloAICard, chooseGrandMasterMonteCarlo } from './aiMonteCarlo';

export {
  EASY_CONFIG,
  NORMAL_CONFIG,
  EXPERT_CONFIG,
  GRAND_MASTER_CONFIG,
};

export interface BotProfile {
  name: string;
  avatarSeed: string;
}

export const ALL_BOT_PROFILES: BotProfile[] = [
  { name: "Thom's Kora", avatarSeed: 'thoms_kora' },
  { name: 'Don WizeMan', avatarSeed: 'don_wizeman' },
  { name: 'Kora Boy Malo', avatarSeed: 'kora_boy_malo' },
  { name: 'Zing Efoulan', avatarSeed: 'zing_efoulan' },
  { name: 'Black Bozar', avatarSeed: 'black_bozar' },
  { name: 'SystemTchakap', avatarSeed: 'systemtchakap' },
  { name: 'Zing Mignon', avatarSeed: 'zing_mignon' },
  { name: 'Vie2Poulet', avatarSeed: 'vie2poulet' },
  { name: 'Kora Malox', avatarSeed: 'kora_malox' },
  { name: 'Robam Hokuto', avatarSeed: 'robam_hokuto' },
];

export interface BotTimingConfig {
  botThinkTimeMs: number;
  hokutoSpawnRatePct: number;
}

export interface BotDialogueConfig {
  botEmoteCooldownSeconds: number;
  botMaxEmotesPerRound: number;
  botEmoteHokutoRatePct: number;
  botEmoteMbapRatePct: number;
  botEmoteLeadDiscardRatePct: number;
  botEmoteCriticalBypassLimit: boolean;
}

let activeBotConfig: BotTimingConfig = {
  botThinkTimeMs: 800,
  hokutoSpawnRatePct: 75,
};

let activeBotDialogueConfig: BotDialogueConfig = {
  botEmoteCooldownSeconds: 7,
  botMaxEmotesPerRound: 2,
  botEmoteHokutoRatePct: 28,
  botEmoteMbapRatePct: 25,
  botEmoteLeadDiscardRatePct: 10,
  botEmoteCriticalBypassLimit: true,
};

export function setBotTimingConfig(config: Partial<BotTimingConfig>) {
  activeBotConfig = { ...activeBotConfig, ...config };
}

export function getBotTimingConfig(): BotTimingConfig {
  return { ...activeBotConfig };
}

export function setBotDialogueConfig(config: Partial<BotDialogueConfig>) {
  activeBotDialogueConfig = { ...activeBotDialogueConfig, ...config };
}

export function getBotDialogueConfig(): BotDialogueConfig {
  return { ...activeBotDialogueConfig };
}

export function getBotThinkDelay(customSpeedMultiplier: number = 1): number {
  return Math.max(200, Math.round(activeBotConfig.botThinkTimeMs * customSpeedMultiplier));
}

/**
 * Returns a random sample of `count` distinct bot profiles from the available pool.
 * "Robam Hokuto" priority appearance is governed dynamically by `hokutoSpawnRatePct` (default from Katika config).
 */
export function getRandomBotProfiles(count: number = 3, hokutoSpawnRatePct?: number): BotProfile[] {
  const effectiveHokutoRate = typeof hokutoSpawnRatePct === 'number' ? hokutoSpawnRatePct : activeBotConfig.hokutoSpawnRatePct;
  const safeCount = Math.max(1, Math.min(count, ALL_BOT_PROFILES.length));
  const robamProfile = ALL_BOT_PROFILES.find((p) => p.name === 'Robam Hokuto');
  const otherProfiles = ALL_BOT_PROFILES.filter((p) => p.name !== 'Robam Hokuto');

  // Use dynamic probability to force-include Robam Hokuto (0 to 1)
  const spawnProbability = Math.max(0, Math.min(100, effectiveHokutoRate)) / 100;
  const includeRobam = robamProfile && Math.random() < spawnProbability;

  let selected: BotProfile[] = [];

  if (includeRobam && robamProfile) {
    selected.push(robamProfile);
    const shuffledOthers = fisherYatesShuffle(otherProfiles);
    selected.push(...shuffledOthers.slice(0, safeCount - 1));
  } else {
    const shuffledAll = fisherYatesShuffle(ALL_BOT_PROFILES);
    selected = shuffledAll.slice(0, safeCount);
  }

  // Shuffle selected array so Robam Hokuto isn't always in the first bot position
  return fisherYatesShuffle(selected);
}

/** Fisher-Yates shuffle algorithm for unbiased array randomisation */
export function fisherYatesShuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export const STANDARD_BOT_STRATEGIES: AIStrategy[] = [
  'CONSERVATIVE',
  'TRICK_4_CONTROL',
  'PURGER',
  'AGGRESSIVE_LEADER',
  'DYNAMIC',
  'CARD_COUNTER',
  'BLUFFER',
  'GATEKEEPER',
  'POSITIONAL_MASTER',
];

export const ALL_BOT_STRATEGIES: AIStrategy[] = [
  ...STANDARD_BOT_STRATEGIES,
  'KORA_HUNTER',
  'HOKUTO_ADAPTIVE',
];

/**
 * -------------------------------------------------------------
 * ROBAM HOKUTO ADAPTIVE ENGINE (Opponent Profile & Memory)
 * -------------------------------------------------------------
 * Tracks human play patterns across rounds/manches:
 * - Early Aggression: Playing 10s or cards >= 8 on Trick 1 & 2
 * - Late Hoarding: Saving 10s or dynamic bosses for Trick 4 & 5
 * - Kora Tendency: Attempting to sweep early tricks
 * - Folding Habits: Folding on bad hands
 */
export interface HumanProfile {
  totalPlays: number;
  earlyAggressionPlays: number;
  lateHoardingPlays: number;
  koraAttempts: number;
  roundsObserved: number;
  style: 'EARLY_AGGRESSIVE' | 'LATE_HOARDER' | 'KORA_HUNTER' | 'BALANCED';
}

const globalHumanProfile: HumanProfile = {
  totalPlays: 0,
  earlyAggressionPlays: 0,
  lateHoardingPlays: 0,
  koraAttempts: 0,
  roundsObserved: 0,
  style: 'BALANCED',
};

export function getHumanProfile(): HumanProfile {
  return globalHumanProfile;
}

interface HumanPlayRecord {
  id: string;
  isEarlyAggression: boolean;
  isLateHoarding: boolean;
}

const countedPlayIds = new Set<string>();
const recentHumanPlayRecords: HumanPlayRecord[] = [];
const trackedKoraAttemptManches = new Set<string>();

export function updateHumanProfileFromGame(
  tricksHistory: Trick[] = [],
  currentPlays: PlayedCard[] = [],
  players: Player[] = []
): HumanProfile {
  const humanPlayer = players.find((p) => p.isHuman);
  if (!humanPlayer) return globalHumanProfile;

  const humanIndex = players.findIndex((p) => p.id === humanPlayer.id);
  if (humanIndex === -1) return globalHumanProfile;

  // 1. Process completed tricks in tricksHistory
  tricksHistory.forEach((trick) => {
    const trickNo = trick.trickNumber;
    (trick.plays || []).forEach((p) => {
      if (p.playerIndex === humanIndex) {
        const playId = `trick_${trickNo}_card_${p.card.id}`;
        if (!countedPlayIds.has(playId)) {
          countedPlayIds.add(playId);
          recentHumanPlayRecords.push({
            id: playId,
            isEarlyAggression: trickNo <= 2 && p.card.value >= 8,
            isLateHoarding: trickNo >= 4 && p.card.value >= 8,
          });
          if (recentHumanPlayRecords.length > 60) {
            const removed = recentHumanPlayRecords.shift();
            if (removed) countedPlayIds.delete(removed.id);
          }
        }
      }
    });
  });

  // 2. Process current in-progress trick plays
  const currentTrickNo = tricksHistory.length + 1;
  currentPlays.forEach((p) => {
    if (p.playerIndex === humanIndex) {
      const playId = `trick_${currentTrickNo}_card_${p.card.id}`;
      if (!countedPlayIds.has(playId)) {
        countedPlayIds.add(playId);
        recentHumanPlayRecords.push({
          id: playId,
          isEarlyAggression: currentTrickNo <= 2 && p.card.value >= 8,
          isLateHoarding: currentTrickNo >= 4 && p.card.value >= 8,
        });
        if (recentHumanPlayRecords.length > 60) {
          const removed = recentHumanPlayRecords.shift();
          if (removed) countedPlayIds.delete(removed.id);
        }
      }
    }
  });

  // 3. Track manche where human won both trick 1 and trick 2 (Kora attempt), once per manche
  if (tricksHistory.length >= 2) {
    const t1 = tricksHistory[0];
    const t2 = tricksHistory[1];
    if (t1 && t2 && t1.winnerIndex === humanIndex && t2.winnerIndex === humanIndex) {
      const mancheKey = `manche_${t1.plays[0]?.card.id || '1'}`;
      if (!trackedKoraAttemptManches.has(mancheKey)) {
        trackedKoraAttemptManches.add(mancheKey);
        globalHumanProfile.koraAttempts++;
      }
    }
  }

  // 4. Update globalHumanProfile stats from sliding window (max 60 plays)
  globalHumanProfile.totalPlays = recentHumanPlayRecords.length;
  globalHumanProfile.earlyAggressionPlays = recentHumanPlayRecords.filter((r) => r.isEarlyAggression).length;
  globalHumanProfile.lateHoardingPlays = recentHumanPlayRecords.filter((r) => r.isLateHoarding).length;

  if (globalHumanProfile.totalPlays > 0) {
    const earlyRate = globalHumanProfile.earlyAggressionPlays / globalHumanProfile.totalPlays;
    const lateRate = globalHumanProfile.lateHoardingPlays / globalHumanProfile.totalPlays;

    if (earlyRate > 0.35) {
      globalHumanProfile.style = 'EARLY_AGGRESSIVE';
    } else if (lateRate > 0.35) {
      globalHumanProfile.style = 'LATE_HOARDER';
    } else if (globalHumanProfile.koraAttempts >= 2) {
      globalHumanProfile.style = 'KORA_HUNTER';
    } else {
      globalHumanProfile.style = 'BALANCED';
    }
  }

  return globalHumanProfile;
}

/**
 * Thresholds for Kora Hunter strategy activation and Double Kora evaluation.
 */
export const KORA_CHANCE_THRESHOLD = EXPERT_CONFIG.KORA_CHANCE_THRESHOLD;
export const DOUBLE_KORA_CHANCE_THRESHOLD = EXPERT_CONFIG.DOUBLE_KORA_CHANCE_THRESHOLD;

/**
 * Pure exported function estimating the probability that a card of value 3 wins trick 5 (Kora),
 * and for Double Kora, also trick 4.
 *
 * STRICT PRIVACY GUARANTEE:
 * ONLY uses:
 * - The bot's own hand (`hand`)
 * - Cards already played publicly (`playedCards`)
 * - Known player voids deduced from public play (`knownVoids`)
 * - Number of active players (`activePlayerCount`)
 *
 * It NEVER reads the contents of other players' hands (`players[i].hand`).
 */
export function estimateKoraChance(
  hand: Card[],
  playedCards: Card[] = [],
  knownVoids: Map<number, Set<Suit>> = new Map(),
  activePlayerCount: number = 4,
  checkDoubleKora: boolean = false
): number {
  if (!hand || hand.length === 0) return 0;

  const threesInHand = hand.filter((c) => c.value === 3);
  if (threesInHand.length === 0) return 0;
  if (checkDoubleKora && threesInHand.length < 2) return 0;

  // Build the 31-card deck (10♠ excluded)
  // Suits: COEUR, CARREAU, TREFLE have 8 cards (3..10); PIQUE has 7 cards (3..9)
  const allSuits: Suit[] = ['COEUR', 'CARREAU', 'TREFLE', 'PIQUE'];
  const playedKeys = new Set(playedCards.map((c) => `${c.suit}_${c.value}`));
  const handKeys = new Set(hand.map((c) => `${c.suit}_${c.value}`));

  // Unseen cards: 31 cards minus played cards minus bot hand
  const unseenCardsBySuit: Record<Suit, number> = {
    COEUR: 0,
    CARREAU: 0,
    TREFLE: 0,
    PIQUE: 0,
  };
  let totalUnseen = 0;

  allSuits.forEach((suit) => {
    const maxVal = suit === 'PIQUE' ? 9 : 10;
    for (let val = 3; val <= maxVal; val++) {
      const key = `${suit}_${val}`;
      if (!playedKeys.has(key) && !handKeys.has(key)) {
        unseenCardsBySuit[suit]++;
        totalUnseen++;
      }
    }
  });

  const activeOpponents = Math.max(1, activePlayerCount - 1);

  // Helper to compute probability that active opponents hold 0 cards of a given suit
  const getProbabilityOpponentsVoidInSuit = (suit: Suit): number => {
    const unseenInSuit = unseenCardsBySuit[suit];
    if (unseenInSuit === 0) {
      // No unseen cards of this suit exist in deck or opponent hands: 100% void!
      return 1.0;
    }

    // Check how many active opponents have known voids in this suit
    let knownVoidOpponents = 0;
    knownVoids.forEach((voidSuits) => {
      if (voidSuits.has(suit)) {
        knownVoidOpponents++;
      }
    });

    const effectiveOpponents = Math.max(0, activeOpponents - knownVoidOpponents);
    if (effectiveOpponents === 0) {
      // All opponents are confirmed void from public inference!
      return 1.0;
    }

    // Number of cards held by non-void opponents (each player holds hand.length cards)
    const opponentCardsToFill = effectiveOpponents * hand.length;
    if (totalUnseen <= 0) return 0;
    if (totalUnseen - unseenInSuit < opponentCardsToFill) {
      // Impossible for opponents not to hold at least one card of this suit
      return 0;
    }

    // Hypergeometric calculation: P(X = 0) = choose(totalUnseen - unseenInSuit, n) / choose(totalUnseen, n)
    let prob = 1.0;
    for (let i = 0; i < opponentCardsToFill; i++) {
      prob *= (totalUnseen - unseenInSuit - i) / (totalUnseen - i);
    }
    return Math.max(0, Math.min(1, prob));
  };

  // Helper to estimate probability of bot having the lead on trick 5 (by winning trick 4)
  const getProbabilityWinTrick4ToLeadTrick5 = (): number => {
    if (hand.length === 1) {
      return 1.0; // Already trick 5
    }

    const nonThrees = hand.filter((c) => c.value !== 3);
    if (nonThrees.length === 0) return 0.1;

    const dynamicBosses = nonThrees.filter((c) => isDynamicBossCard(c, playedCards));
    if (dynamicBosses.length > 0) return 0.85;

    const maxVal = Math.max(...nonThrees.map((c) => c.value));
    if (maxVal >= 9) return 0.65;
    if (maxVal >= 8) return 0.45;
    if (maxVal >= 7) return 0.30;
    return 0.15;
  };

  if (!checkDoubleKora) {
    // Single Kora: calculate chance for the best 3 in hand
    const pLead5 = getProbabilityWinTrick4ToLeadTrick5();
    let bestKoraChance = 0;

    threesInHand.forEach((threeCard) => {
      const pVoid = getProbabilityOpponentsVoidInSuit(threeCard.suit);
      const chance = pVoid * pLead5;
      if (chance > bestKoraChance) {
        bestKoraChance = chance;
      }
    });

    return Math.round(bestKoraChance * 100) / 100;
  } else {
    // Double Kora: requires winning trick 4 with a 3 and trick 5 with a 3
    if (threesInHand.length < 2) return 0;

    let pLead4 = 0.5;
    if (hand.length === 2) {
      pLead4 = 0.7;
    } else {
      const nonThrees = hand.filter((c) => c.value !== 3);
      if (nonThrees.some((c) => isDynamicBossCard(c, playedCards))) {
        pLead4 = 0.75;
      }
    }

    let bestDoubleChance = 0;
    for (let i = 0; i < threesInHand.length; i++) {
      for (let j = i + 1; j < threesInHand.length; j++) {
        const cardA = threesInHand[i];
        const cardB = threesInHand[j];
        const pVoidA = getProbabilityOpponentsVoidInSuit(cardA.suit);
        const pVoidB = getProbabilityOpponentsVoidInSuit(cardB.suit);
        const chance = pLead4 * pVoidA * pVoidB;
        if (chance > bestDoubleChance) {
          bestDoubleChance = chance;
        }
      }
    }

    return Math.round(bestDoubleChance * 100) / 100;
  }
}

/**
 * Checks if a hand has real potential to achieve a Kora (winning trick 5 with a 3).
 * Based on the reference rule:
 * - Must hold at least one 3
 * - Must have potential for opponents to be void in that suit
 * - Must have a path to winning trick 4 to gain lead for trick 5
 */
export function hasKoraPotential(
  hand: Card[],
  playedCards: Card[] = [],
  knownVoids: Map<number, Set<Suit>> = new Map(),
  activePlayerCount: number = 4
): boolean {
  if (!hand || hand.length === 0) return false;
  const hasThree = hand.some((c) => c.value === 3);
  if (!hasThree) return false;

  const chance = estimateKoraChance(hand, playedCards, knownVoids, activePlayerCount);
  return chance >= KORA_CHANCE_THRESHOLD;
}

/**
 * Checks if a bot with an atrocious hand in a 3 or 4-player game should tactically fold.
 */
export function shouldBotFoldRound(
  hand: Card[],
  trickNumber: number,
  activePlayersCount: number,
  personality: AIStrategy = 'CONSERVATIVE',
  difficulty: AIDifficulty = 'NORMAL'
): boolean {
  // Only consider folding in multiway pots (3 or 4 active players) during Trick 1
  if (activePlayersCount < 3 || trickNumber !== 1 || !hand || hand.length < 5) {
    return false;
  }

  // Easy AI rarely folds
  if (difficulty === 'EASY') return false;

  // Grand Katika folds strictly based on mathematical expected value in 3-4 player tables
  if (difficulty === 'GRAND_MASTER') {
    const maxVal = Math.max(...hand.map((c) => c.value), 0);
    const avgVal = hand.reduce((sum, c) => sum + c.value, 0) / hand.length;
    const hasAnyHighCard = hand.some((c) => c.value >= 8);
    const isCatastrophic = !hasAnyHighCard && maxVal <= 6 && avgVal <= 4.4;
    return isCatastrophic && Math.random() < 0.25;
  }

  const maxVal = Math.max(...hand.map((c) => c.value), 0);
  const avgVal = hand.reduce((sum, c) => sum + c.value, 0) / hand.length;
  const hasAnyHighCard = hand.some((c) => c.value >= 8);

  // Catastrophic hand criteria: No cards >= 8, max card <= 6 (or 7 with very low average <= 4.6)
  const isCatastrophicHand = !hasAnyHighCard && (maxVal <= 6 || (maxVal === 7 && avgVal <= 4.6));

  if (!isCatastrophicHand) {
    return false;
  }

  // Fold probabilities by personality
  if (personality === 'CONSERVATIVE' || personality === 'GATEKEEPER') {
    return Math.random() < 0.35; // 35% chance to fold a truly hopeless hand
  } else if (personality === 'PURGER' || personality === 'DYNAMIC') {
    return Math.random() < 0.20;
  } else if (personality === 'BLUFFER' || personality === 'KORA_HUNTER' || personality === 'AGGRESSIVE_LEADER') {
    return false; // Aggressive / bluffer bots never fold early!
  }

  return Math.random() < 0.15;
}

export function getBotFoldReaction(): BotCommentResult {
  const foldEmotes: BotCommentResult[] = [
    { text: 'Les cartes-ci sont trop vilaines, je me couche !', emoji: '🏳️' },
    { text: 'Pas de patronne, rien du tout... Je passe cette fois !', emoji: '🎴' },
    { text: 'Battez-vous seulement entre vous, je vous regarde !', emoji: '👀' },
    { text: 'Je garde mes jetons pour la donne suivante !', emoji: '🧘' },
    { text: 'Trop faible pour rivaliser, je me couche.', emoji: '✋' },
  ];
  return foldEmotes[Math.floor(Math.random() * foldEmotes.length)];
}

/**
 * Returns a random AI strategy from the standard pool of archetypes (excluding Kora Hunter by default).
 */
export function getRandomBotStrategy(allowKoraHunter: boolean = false): AIStrategy {
  const pool = allowKoraHunter ? ALL_BOT_STRATEGIES : STANDARD_BOT_STRATEGIES;
  const randomIndex = Math.floor(Math.random() * pool.length);
  return pool[randomIndex];
}

/**
 * Checks if a bot can mathematically and tactically still make a Kora / Double Kora in this round.
 * Under the true Kora rule, a bot can achieve Kora even if it lost previous tricks,
 * as long as it still holds a 3 in hand and has a viable path to winning trick 5 with that 3.
 */
export function canBotAchieveKora(
  player: Player,
  trickNumber: number,
  playedCards: Card[] = [],
  knownVoids: Map<number, Set<Suit>> = new Map(),
  activePlayerCount: number = 4
): boolean {
  if (player.isHuman || player.isEliminated || !player.hand || player.hand.length === 0) {
    return false;
  }

  // Must possess at least one 3 in hand
  const hasThree = player.hand.some((c) => c.value === 3);
  if (!hasThree) {
    return false;
  }

  // At trick 5: has a 3 in hand
  if (trickNumber === 5) {
    return true;
  }

  // At tricks 1 to 4: estimate viability
  const chance = estimateKoraChance(player.hand, playedCards, knownVoids, activePlayerCount);
  return chance >= KORA_CHANCE_THRESHOLD;
}

/**
 * Resolves dynamic strategy into a concrete operational strategy based on hand composition & game state.
 */
export function resolveDynamicStrategy(hand: Card[]): AIStrategy {
  if (hasKoraPotential(hand)) {
    return 'KORA_HUNTER';
  }

  const topCardsCount = hand.filter(
    (c) => c.value === 10 || (c.suit === 'PIQUE' && c.value === 9)
  ).length;

  if (topCardsCount >= 2) {
    return 'TRICK_4_CONTROL';
  }

  const suitCounts: Record<Suit, number> = {
    COEUR: 0,
    CARREAU: 0,
    TREFLE: 0,
    PIQUE: 0,
  };
  hand.forEach((c) => {
    suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
  });

  const hasWeakSingleton = hand.some(
    (c) => suitCounts[c.suit] === 1 && c.value <= 6
  );

  if (hasWeakSingleton) {
    return 'PURGER';
  }

  const avgValue =
    hand.reduce((sum, c) => sum + c.value, 0) / (hand.length || 1);

  if (avgValue >= 7.5) {
    return 'AGGRESSIVE_LEADER';
  }

  return 'CONSERVATIVE';
}

/**
 * Evaluates game context and dynamically shifts a bot's active strategy when justified.
 * Note: Keeps personality stable throughout the round (no chaotic 30% random mutations).
 */
export function evaluateAndShiftBotStrategy(
  player: Player,
  trickNumber: number,
  allPlayers: Player[],
  tricksHistory: Trick[] = [],
  currentPlays: PlayedCard[] = []
): AIStrategy {
  const currentStrategy = player.aiStrategy || player.basePersonality || 'CONSERVATIVE';
  const playedCards = getPlayedCardsInRound(tricksHistory, currentPlays);
  const knownVoids = getKnownPlayerVoids(tricksHistory, currentPlays);
  const activeCount = allPlayers.filter((p) => !p.isEliminated && !p.isFoldedInRound).length || 4;

  const isKoraPossible = canBotAchieveKora(player, trickNumber, playedCards, knownVoids, activeCount);

  // 1. KORA_HUNTER Activation:
  if (isKoraPossible) {
    if (currentStrategy === 'KORA_HUNTER') {
      return 'KORA_HUNTER';
    }
    if (player.basePersonality === 'KORA_HUNTER') {
      return 'KORA_HUNTER';
    }
    if (hasKoraPotential(player.hand || [], playedCards, knownVoids, activeCount)) {
      return 'KORA_HUNTER';
    }
  }

  // 2. KORA_HUNTER Fallback:
  if (currentStrategy === 'KORA_HUNTER' && !isKoraPossible) {
    const fallback = player.basePersonality && player.basePersonality !== 'KORA_HUNTER'
      ? player.basePersonality
      : 'TRICK_4_CONTROL';
    return fallback;
  }

  // 3. Situational Tactical Shifts
  // Gatekeeper shift at Trick 4 if chip leader is winning
  if (trickNumber === 4 && currentStrategy !== 'BLUFFER') {
    const chipLeader = [...allPlayers].sort((a, b) => b.capital - a.capital)[0];
    if (chipLeader && chipLeader.id !== player.id) {
      const isChipLeaderWinningTrick = currentPlays.some(
        (p) => p.playerIndex === allPlayers.findIndex((pl) => pl.id === chipLeader.id) && p.isWinningSoFar
      );
      if (isChipLeaderWinningTrick) {
        return 'GATEKEEPER';
      }
    }
  }

  // DYNAMIC personality re-evaluates cleanly
  if (currentStrategy === 'DYNAMIC') {
    return resolveDynamicStrategy(player.hand);
  }

  return currentStrategy;
}

/**
 * Determines if a bot should trigger the Kora Hunter alert banner.
 * The banner is only triggered if the bot has a genuine Kora plan (estimateKoraChance >= threshold).
 * The bluff of a BLUFFER archetype remains possible.
 */
export function shouldBotTriggerKoraAlert(
  player: Player,
  activeStrategy: AIStrategy,
  isMidRoundCheck: boolean = false,
  koraChance?: number
): boolean {
  if (player.isHuman || player.isEliminated) return false;

  const basePersonality = player.basePersonality || player.aiStrategy;
  if (basePersonality === 'BLUFFER') {
    const bluffChance = isMidRoundCheck ? 0.1 : 0.15;
    return Math.random() < bluffChance;
  }

  if (activeStrategy === 'KORA_HUNTER') {
    const chance = typeof koraChance === 'number'
      ? koraChance
      : estimateKoraChance(player.hand || [], [], new Map(), 4);
    return chance >= KORA_CHANCE_THRESHOLD;
  }

  return false;
}

/**
 * Helper to gather all cards played publicly on the table in this round (history + current trick).
 */
export function getPlayedCardsInRound(
  tricksHistory: Trick[] = [],
  currentPlays: PlayedCard[] = []
): Card[] {
  const playedCards: Card[] = [];
  tricksHistory.forEach((t) => {
    (t.plays || []).forEach((p) => playedCards.push(p.card));
  });
  currentPlays.forEach((p) => playedCards.push(p.card));
  return playedCards;
}

/**
 * -------------------------------------------------------------
 * 1. DYNAMIC BOSS CARDS ENGINE (Suivi des Cartes Maîtresses)
 * -------------------------------------------------------------
 * In Njambo Kora:
 * - Coeur, Carreau, Trèfle: max value is 10 (down to 3)
 * - Pique: max value is 9 (10 of Spades is excluded, down to 3)
 *
 * As higher cards fall on the table, lower cards become the new dynamic Bosses!
 */
export function getInitialMaxSuitValue(suit: Suit): number {
  return suit === 'PIQUE' ? 9 : 10;
}

/**
 * Computes the highest unplayed card value for a given suit based on all publicly played cards.
 */
export function getDynamicBossValue(suit: Suit, playedCards: Card[]): number {
  const maxVal = getInitialMaxSuitValue(suit);
  const playedValuesInSuit = new Set(
    playedCards.filter((c) => c.suit === suit).map((c) => c.value)
  );

  for (let val = maxVal; val >= 3; val--) {
    if (!playedValuesInSuit.has(val)) {
      return val;
    }
  }
  return 3;
}

/**
 * Checks whether a specific card is currently the unbeatable Boss card of its suit.
 */
export function isDynamicBossCard(card: Card, playedCards: Card[]): boolean {
  const currentBossValue = getDynamicBossValue(card.suit, playedCards);
  return card.value >= currentBossValue;
}

/**
 * Returns all cards in hand that are currently dynamic Bosses of their suits.
 */
export function getDynamicBossesInHand(hand: Card[], playedCards: Card[]): Card[] {
  return hand.filter((c) => isDynamicBossCard(c, playedCards));
}

/**
 * Evaluates the future strength/safety of a card in hand (0 to 10 scale).
 */
export function evaluateCardStrength(
  card: Card,
  hand: Card[],
  playedCards: Card[]
): number {
  const currentBossVal = getDynamicBossValue(card.suit, playedCards);
  if (card.value >= currentBossVal) {
    return 10; // Invincible Boss
  }

  const gap = currentBossVal - card.value;
  if (gap === 1) return 7; // Second highest card (e.g. 9 when 10 is out there)
  if (gap === 2) return 5; // Third highest
  if (card.value <= 5) return 2; // Weak card
  return 3;
}

/**
 * -------------------------------------------------------------
 * 4. POT PROTECTION & SÉRIE DE PLIS DEFENSE (Chacun pour soi)
 * -------------------------------------------------------------
 * Detects if another player (human or other bot) is on a trick streak (« série de plis » : won all tricks so far)
 * and is currently winning or threatening to win the current trick, in order to protect the pot.
 */
export function findThreateningKoraLeader(
  players: Player[],
  tricksHistory: Trick[],
  currentPlays: PlayedCard[],
  currentTrickNumber: number,
  myPlayerIndex?: number
): { playerIndex: number; playerName: string; winningCard: Card } | null {
  if (currentTrickNumber < 2) return null; // Streak threat becomes critical from trick 2+

  const requiredTricksWon = currentTrickNumber - 1;

  for (let pIdx = 0; pIdx < players.length; pIdx++) {
    if (myPlayerIndex !== undefined && pIdx === myPlayerIndex) continue;

    const player = players[pIdx];
    if (player.isEliminated) continue;

    if (player.tricksWonInRound === requiredTricksWon) {
      // This player has won 100% of previous tricks in this round!
      // Check if they currently played a winning card in this trick
      const leadSuit = currentPlays[0]?.card?.suit || null;
      const { winnerPlay } = determineTrickWinner(currentPlays, leadSuit);

      if (winnerPlay && winnerPlay.playerIndex === pIdx) {
        return {
          playerIndex: pIdx,
          playerName: player.name,
          winningCard: winnerPlay.card,
        };
      }
    }
  }

  return null;
}

/**
 * -------------------------------------------------------------
 * 5. INTELLIGENT DISCARD ENGINE (Trash Priority)
 * -------------------------------------------------------------
 * When the bot cannot follow suit, selects the smartest card to throw away:
 * 1. Never throw away Dynamic Bosses (10s, 9♠, or current boss) if possible.
 * 2. Protect cards of value 3 for Kora potential.
 * 3. At trick 4, never empty a suit where an opponent could hold a winning 3 (anti-Kora prudence).
 * 4. Prioritize dead/weak singletons (4-6 in suits without boss).
 * 5. Preserve cards with high future winning potential.
 */
/**
 * Tracks which suits players failed to follow, meaning they have a VOID (0 cards) in that suit.
 * This is 100% legal, non-cheating public card inference.
 */
export function getKnownPlayerVoids(
  tricksHistory: Trick[] = [],
  currentPlays: PlayedCard[] = [],
  currentLeadSuit: Suit | null = null
): Map<number, Set<Suit>> {
  const voids = new Map<number, Set<Suit>>();

  const addVoid = (playerIndex: number, suit: Suit) => {
    if (!voids.has(playerIndex)) {
      voids.set(playerIndex, new Set());
    }
    voids.get(playerIndex)!.add(suit);
  };

  tricksHistory.forEach((trick) => {
    const lead = trick.leadSuit;
    if (!lead || !trick.plays) return;
    trick.plays.forEach((p) => {
      if (p.card && p.card.suit !== lead) {
        addVoid(p.playerIndex, lead);
      }
    });
  });

  if (currentLeadSuit) {
    currentPlays.forEach((p) => {
      if (p.card && p.card.suit !== currentLeadSuit) {
        addVoid(p.playerIndex, currentLeadSuit);
      }
    });
  }

  return voids;
}

/**
 * Super-human discard calculator for Grand Katika:
 * Mathematically scores each candidate card based on dynamic boss status,
 * singleton void creation potential, opponent void distribution, and anti-Kora prudence.
 */
export function chooseGrandMasterDiscard(
  validCards: Card[],
  hand: Card[],
  playedCards: Card[],
  knownVoids: Map<number, Set<Suit>>
): Card {
  if (validCards.length <= 1) return validCards[0];

  const suitCounts: Record<Suit, number> = {
    COEUR: 0,
    CARREAU: 0,
    TREFLE: 0,
    PIQUE: 0,
  };
  hand.forEach((c) => {
    suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
  });

  const allSuits: Suit[] = ['COEUR', 'CARREAU', 'TREFLE', 'PIQUE'];
  const suitsWithOpponentThree = allSuits.filter(
    (s) => !playedCards.some((c) => c.suit === s && c.value === 3) && !hand.some((c) => c.suit === s && c.value === 3)
  );

  const scoredDiscards = validCards.map((card) => {
    const isBoss = isDynamicBossCard(card, playedCards);
    const suitCount = suitCounts[card.suit];
    const rawVal = card.value;

    let discardScore = 100;

    // 1. Dynamic bosses & 10s are strictly preserved
    if (isBoss || rawVal === 10 || (card.suit === 'PIQUE' && rawVal === 9)) {
      discardScore -= 200;
    } else if (rawVal === 9) {
      discardScore -= 80;
    } else if (rawVal === 8) {
      discardScore -= 40;
    }

    // 2. Trash candidate (3s and low cards are prime trash to dump early)
    if (rawVal === 3) {
      discardScore += 75; // Prime trash, avoid hoarding 3s to trick 5 accidentally
    } else if (rawVal <= 5) {
      discardScore += 45; // Prime trash candidate
    }

    // 3. Void creation: dumping a weak singleton opens up 100% cutting freedom in future tricks!
    if (suitCount === 1 && !isBoss && rawVal <= 6 && rawVal !== 3) {
      discardScore += 65;
    }

    // 4. Opponent void exploitation: if opponents have voids in this suit, our cards in this suit are protected!
    let opponentsVoidInSuit = 0;
    knownVoids.forEach((suits) => {
      if (suits.has(card.suit)) opponentsVoidInSuit++;
    });
    if (opponentsVoidInSuit > 0) {
      discardScore -= opponentsVoidInSuit * 20;
    }

    return { card, score: discardScore };
  });

  scoredDiscards.sort((a, b) => b.score - a.score);
  return scoredDiscards[0].card;
}

export function chooseSmartDiscard(
  validCards: Card[],
  hand: Card[],
  playedCards: Card[],
  difficulty: AIDifficulty = 'NORMAL'
): Card {
  if (validCards.length <= 1) return validCards[0];

  if (difficulty === 'EASY') {
    // Easy mode: simple lowest card
    return [...validCards].sort((a, b) => a.value - b.value)[0];
  }

  // Count suit distribution in hand
  const suitCounts: Record<Suit, number> = {
    COEUR: 0,
    CARREAU: 0,
    TREFLE: 0,
    PIQUE: 0,
  };
  hand.forEach((c) => {
    suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
  });

  // Normal: Pas de vision dynamique des maîtresses (considère les 10 comme forts, ignore si un 9 ou 8 est devenu maître)
  // Expert: Suivi exact des cartes sorties et déduction des maîtresses dynamiques
  const isExpert = difficulty === 'EXPERT' || difficulty === 'GRAND_MASTER';

  // Score each card for discard desirability (higher score = better to discard)
  const scoredDiscards = validCards.map((card) => {
    const isBoss = isExpert
      ? isDynamicBossCard(card, playedCards)
      : card.value === 10 || (card.suit === 'PIQUE' && card.value === 9);
    const suitCount = suitCounts[card.suit];
    const rawVal = card.value;

    let discardScore = 100;

    if (isBoss) {
      discardScore -= 120; // Highly protect boss cards!
    }

    if (rawVal === 10 || (card.suit === 'PIQUE' && rawVal === 9)) {
      discardScore -= 120; // Never throw absolute top cards
    } else if (rawVal === 9) {
      discardScore -= isExpert && isBoss ? 120 : 30;
    } else if (rawVal === 8) {
      discardScore -= isExpert && isBoss ? 120 : 10;
    }

    if (rawVal === 3) {
      discardScore += 70; // 3s are the lowest cards, prime trash to dump early!
    } else if (rawVal <= 5) {
      discardScore += 40; // Great candidate for trash
    }

    // Discarding a singleton helps empty that suit completely for future discards
    if (suitCount === 1 && !isBoss && rawVal <= 7 && rawVal !== 3) {
      discardScore += 25;
    }

    return { card, score: discardScore };
  });

  // Sort descending by discardScore (highest discardScore thrown first)
  scoredDiscards.sort((a, b) => b.score - a.score);
  return scoredDiscards[0].card;
}

/**
 * Relais IA (Bot de relais pour joueur déconnecté)
 * Règle essentielle : joue le coup le plus neutre possible, pas le coup optimal.
 * Le relais IA ne doit pas jouer agressivement ni tenter de remporter un tour
 * qui avantagerait artificiellement le joueur absent ou léserait les autres.
 * Il joue la carte la plus basse de la couleur demandée, ou une défausse neutre.
 */
export function chooseRelayAICard(hand: Card[], leadSuit: Suit | null): Card {
  const validCards = getPlayableCards(hand, leadSuit);
  if (validCards.length === 0) {
    return hand[0];
  }
  if (validCards.length === 1) {
    return validCards[0];
  }

  if (leadSuit) {
    // Si le joueur a la couleur demandée, jouer la carte de valeur la plus basse
    const matchingSuitCards = validCards.filter((c) => c.suit === leadSuit);
    if (matchingSuitCards.length > 0) {
      return matchingSuitCards.reduce((lowest, c) => (c.value < lowest.value ? c : lowest), matchingSuitCards[0]);
    }
    // Si pas de la couleur : défausse neutre la plus basse
    return validCards.reduce((lowest, c) => (c.value < lowest.value ? c : lowest), validCards[0]);
  }

  // Le joueur absent a la main (entame) : jouer la carte de valeur la plus basse
  return validCards.reduce((lowest, c) => (c.value < lowest.value ? c : lowest), validCards[0]);
}

/**
 * -------------------------------------------------------------
 * MAIN AI DECISION ENGINE
 * -------------------------------------------------------------
 * Implements all 6 major recommendations:
 * 1. Dynamic Boss Tracking
 * 2. Bleeding & Forcing (Mains 1 à 3)
 * 3. Tactical Trick 4 & Trick 5 Setup
 * 4. Anti-Kora Hunter Defense
 * 5. Intelligent Discard Hierarchy
 * 6. Difficulty Levels (EASY, NORMAL, EXPERT)
 */
export function chooseAICard(
  hand: Card[],
  leadSuit: Suit | null,
  currentPlays: PlayedCard[],
  trickNumber: number,
  strategy: AIStrategy = 'CONSERVATIVE',
  tricksHistory: Trick[] = [],
  activePlayerCount: number = 4,
  difficulty: AIDifficulty = 'NORMAL',
  players: Player[] = [],
  myPlayerIndex?: number
): Card {
  let validCards = getPlayableCards(hand, leadSuit);

  if (validCards.length === 0) {
    return hand[0];
  }

  if (validCards.length === 1) {
    return validCards[0];
  }

  // Detect Robam Hokuto bot identity
  const currentBotPlayer = myPlayerIndex !== undefined && players[myPlayerIndex] ? players[myPlayerIndex] : null;
  const isRobamHokuto = Boolean(
    (currentBotPlayer && currentBotPlayer.name.includes('Robam Hokuto')) ||
    strategy === 'HOKUTO_ADAPTIVE'
  );

  // Robam Hokuto plays at table difficulty level
  const effectiveDifficulty: AIDifficulty = difficulty;

  // EASY DIFFICULTY: 22% random blunder rate (15-25% range)
  if (effectiveDifficulty === 'EASY' && Math.random() < EASY_CONFIG.RANDOM_MOVE_RATE) {
    const randomIndex = Math.floor(Math.random() * validCards.length);
    return validCards[randomIndex];
  }

  // NORMAL DIFFICULTY: 6% casual sub-optimal moves for average human player
  if (effectiveDifficulty === 'NORMAL' && Math.random() < NORMAL_CONFIG.RANDOM_MOVE_RATE) {
    const randomIndex = Math.floor(Math.random() * validCards.length);
    return validCards[randomIndex];
  }

  // Extract known voids per player (legal, public inference)
  const knownVoids = getKnownPlayerVoids(tricksHistory, currentPlays, leadSuit);

  // GRAND MASTER (GRAND KATIKA): Monte Carlo Determinization Engine (PIMC)
  // Runs 60 to 400 rollouts within a strict 25ms budget, maximizing expected pot payoff without cheating.
  if (effectiveDifficulty === 'GRAND_MASTER') {
    const botIndex =
      myPlayerIndex !== undefined
        ? myPlayerIndex
        : players.findIndex((p) => p.hand === hand || p.name.includes('Katika') || !p.isHuman);
    return chooseGrandMasterMonteCarlo(
      validCards,
      hand,
      leadSuit,
      currentPlays,
      trickNumber,
      tricksHistory,
      activePlayerCount,
      players,
      botIndex !== -1 ? botIndex : 0,
      knownVoids
    );
  }

  // Track & update human profile across manches/rounds
  const humanProfile = updateHumanProfileFromGame(tricksHistory, currentPlays, players);

  const activeStrategy: AIStrategy =
    strategy === 'DYNAMIC' ? resolveDynamicStrategy(hand) : strategy;

  // Gather all public cards played this round
  const cardsPlayedSoFar = getPlayedCardsInRound(tricksHistory, currentPlays);

  // Normal does not track dynamic bosses (considers only natural 10s and 9♠ as bosses)
  // Expert and Grand Katika track dynamic bosses (if a 10 was played, 9 becomes boss)
  const canTrackDynamicBosses = effectiveDifficulty === 'EXPERT' || difficulty === 'GRAND_MASTER';
  const isCardBossForBot = (c: Card): boolean => {
    if (canTrackDynamicBosses) {
      return isDynamicBossCard(c, cardsPlayedSoFar);
    }
    return c.value === 10 || (c.suit === 'PIQUE' && c.value === 9);
  };

  // Identify bosses in current hand according to bot's level
  const bossesInHand = hand.filter(isCardBossForBot);

  // Position in current trick (1st, 2nd, 3rd, 4th)
  const playerPositionInTrick = currentPlays.length + 1;
  const isLastPlayerInTrick = playerPositionInTrick === activePlayerCount;

  // =========================================================================
  // --- TRICK 5 : THE DECISIVE POT TRICK (NORMAL & EXPERT) ---
  // =========================================================================
  if (trickNumber === 5) {
    const sortedDesc = [...validCards].sort((a, b) => b.value - a.value);

    if (!leadSuit) {
      // If Kora hunter has a 3 and seeks Kora: lead the 3 only if koraChance was high
      if (activeStrategy === 'KORA_HUNTER') {
        const validThrees = validCards.filter((c) => c.value === 3);
        if (validThrees.length > 0) {
          return validThrees[0];
        }
      }
      // Lead with the absolute highest/boss card to capture the pot
      return sortedDesc[0];
    }

    const hasLeadSuit = hand.some((c) => c.suit === leadSuit);
    if (hasLeadSuit) {
      const { winningValue } = determineTrickWinner(currentPlays, leadSuit);
      const leadSuitCardsAsc = [...validCards].sort((a, b) => a.value - b.value);
      const winningCards = leadSuitCardsAsc.filter((c) => c.value > winningValue);

      if (winningCards.length > 0) {
        // Play highest winning card to secure the pot!
        return winningCards[winningCards.length - 1];
      } else {
        // Cannot win -> discard lowest card of suit
        return leadSuitCardsAsc[0];
      }
    }

    // Discarding on trick 5 (cannot win without lead suit)
    return validCards.sort((a, b) => a.value - b.value)[0];
  }

  // =========================================================================
  // --- SÉRIE DE PLIS EMERGENCY DEFENSE (Tricks 1 to 4) ---
  // =========================================================================
  if (effectiveDifficulty !== 'EASY' && players.length > 0) {
    const streakThreat = findThreateningKoraLeader(
      players,
      tricksHistory,
      currentPlays,
      trickNumber,
      myPlayerIndex
    );

    if (streakThreat && leadSuit) {
      const hasLeadSuit = hand.some((c) => c.suit === leadSuit);
      if (hasLeadSuit) {
        const { winningValue } = determineTrickWinner(currentPlays, leadSuit);
        const leadSuitCardsAsc = [...validCards].sort((a, b) => a.value - b.value);
        const beatingCards = leadSuitCardsAsc.filter((c) => c.value > winningValue);

        if (beatingCards.length > 0) {
          // Play the lowest card that beats the streak leader to break the streak and protect the pot!
          return beatingCards[0];
        }
      }
    }
  }

  // =========================================================================
  // --- EXPERT LEVEL: LIGHT MONTE CARLO (8ms budget, PIMC rollouts) ---
  // =========================================================================
  if (effectiveDifficulty === 'EXPERT' && EXPERT_CONFIG.USE_MONTE_CARLO) {
    // Only force specific Kora lead at trick 4/5 if bot is explicitly a KORA_HUNTER
    if (activeStrategy === 'KORA_HUNTER') {
      if (trickNumber === 5 && !leadSuit) {
        const threes = validCards.filter((c) => c.value === 3);
        if (threes.length > 0) return threes[0];
      } else if (trickNumber === 4 && !leadSuit) {
        const nonThreesDesc = validCards.filter((c) => c.value !== 3).sort((a, b) => b.value - a.value);
        if (nonThreesDesc.length > 0) return nonThreesDesc[0];
      }
    }

    const botIndex =
      myPlayerIndex !== undefined
        ? myPlayerIndex
        : players.findIndex((p) => p.hand === hand || !p.isHuman);

    return chooseMonteCarloAICard(
      validCards,
      hand,
      leadSuit,
      currentPlays,
      trickNumber,
      tricksHistory,
      activePlayerCount,
      players,
      botIndex !== -1 ? botIndex : 0,
      knownVoids,
      'EXPERT'
    );
  }

  // =========================================================================
  // --- CASE 1: AI IS LEAD PLAYER (!leadSuit) ON TRICKS 1 TO 3 ---
  // =========================================================================
  if (!leadSuit) {
    const sortedAsc = [...validCards].sort((a, b) => a.value - b.value);
    const sortedDesc = [...validCards].sort((a, b) => b.value - a.value);

    // Suit counts in hand
    const suitCounts: Record<Suit, number> = {
      COEUR: 0,
      CARREAU: 0,
      TREFLE: 0,
      PIQUE: 0,
    };
    hand.forEach((c) => {
      suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
    });

    // ROBAM HOKUTO ADAPTIVE LEAD:
    if (isRobamHokuto) {
      if (humanProfile.style === 'EARLY_AGGRESSIVE' && trickNumber <= 2) {
        // Human dumps early 10s -> Robam leads low non-boss cards to absorb early human attacks
        const lowNonBoss = sortedAsc.filter((c) => !isCardBossForBot(c) && c.value <= 6);
        if (lowNonBoss.length > 0) return lowNonBoss[0];
      } else if (humanProfile.style === 'LATE_HOARDER' && trickNumber <= 3) {
        // Human hoards 10s for late game -> Robam attacks early with forcing 8/9s or dynamic bosses
        const forcing = sortedDesc.filter((c) => c.value >= 8);
        if (forcing.length > 0) return forcing[0];
      }
    }

    // KORA_HUNTER: Play boss card to take trick and keep momentum, but NEVER lead a 3!
    if (activeStrategy === 'KORA_HUNTER') {
      const nonThrees = sortedDesc.filter((c) => c.value !== 3);
      if (nonThrees.length > 0) return nonThrees[0];
      return sortedDesc[0];
    }

    // EASY DIFFICULTY: Simple low lead without card counting or boss tracking
    if (effectiveDifficulty === 'EASY') {
      const nonTens = sortedAsc.filter((c) => c.value < 10);
      return nonTens.length > 0 ? nonTens[0] : sortedAsc[0];
    }

    // 2. BLEEDING & FORCING STRATEGY (Normal & Expert):
    // A. Purge weak singletons early (Tricks 1-2) to enable discards later
    if (trickNumber <= 2) {
      const weakSingleton = sortedAsc.find(
        (c) => suitCounts[c.suit] === 1 && c.value <= 6 && !isCardBossForBot(c)
      );
      if (weakSingleton) {
        return weakSingleton;
      }
    }

    // CARD_COUNTER: If holding a verified boss and it's trick 3+, cash it in
    if (activeStrategy === 'CARD_COUNTER' && trickNumber >= 3 && bossesInHand.length > 0) {
      return bossesInHand[0];
    }

    // Default safe lead: lowest non-boss card
    const nonBossCards = sortedAsc.filter((c) => !isCardBossForBot(c));
    if (nonBossCards.length > 0) {
      return nonBossCards[0];
    }

    return sortedAsc[0];

    return sortedAsc[0];
  }

  // =========================================================================
  // --- CASE 2: AI MUST FOLLOW SUIT (hasLeadSuit) ON TRICKS 1 TO 3 ---
  // =========================================================================
  const hasLeadSuit = hand.some((c) => c.suit === leadSuit);
  if (hasLeadSuit) {
    const leadSuitCardsAsc = [...validCards].sort((a, b) => a.value - b.value);
    const { winningValue } = determineTrickWinner(currentPlays, leadSuit);
    const winningCards = leadSuitCardsAsc.filter((c) => c.value > winningValue);

    // ROBAM HOKUTO ADAPTIVE FOLLOW:
    if (isRobamHokuto) {
      if (humanProfile.style === 'EARLY_AGGRESSIVE' && trickNumber <= 2) {
        // Human dumps heavy cards early -> Robam ducks cleanly on trick 1 & 2 to save bosses for late game
        return leadSuitCardsAsc[0];
      }
    }

    // KORA_HUNTER: Win trick with lowest sufficient card, but preserve 3s for endgame!
    if (activeStrategy === 'KORA_HUNTER') {
      const nonThreesWinning = winningCards.filter((c) => c.value !== 3);
      if (nonThreesWinning.length > 0) {
        return nonThreesWinning[0];
      }
      if (winningCards.length > 0) {
        return winningCards[0];
      }
      const nonThreesAsc = leadSuitCardsAsc.filter((c) => c.value !== 3);
      return nonThreesAsc.length > 0 ? nonThreesAsc[0] : leadSuitCardsAsc[0];
    }

    // EASY: Always play lowest card
    if (effectiveDifficulty === 'EASY') {
      return leadSuitCardsAsc[0];
    }

    // Check if the current winning card is already an unbeatable 10 or current Boss
    const isCurrentWinnerUnbeatable =
      winningValue === 10 ||
      (leadSuit === 'PIQUE' && winningValue === 9) ||
      winningValue >= getDynamicBossValue(leadSuit, cardsPlayedSoFar);

    if (isCurrentWinnerUnbeatable) {
      // Opponent already locked the trick -> don't waste any good card, give lowest!
      return leadSuitCardsAsc[0];
    }

    // 2. CONTESTING & TAKING CONTROL (Late Position / In-Main Contestation):
    // Only takes very cheap tricks (<= 6) or takes trick 3 if holding multiple bosses
    if ((isLastPlayerInTrick || playerPositionInTrick >= 3) && winningCards.length > 0) {
      const cheapWinningCard = winningCards.find(
        (c) => c.value <= 6 && !isCardBossForBot(c)
      );

      if (cheapWinningCard) {
        return cheapWinningCard;
      }

      if (isLastPlayerInTrick && bossesInHand.length >= 2 && trickNumber >= 3) {
        // Last player on trick 3 with 2+ bosses: take the trick safely to prepare trick 4/5
        return winningCards[0];
      }
    }

    // In early position (e.g. 2nd player): play low to avoid walking into 3rd/4th player traps
    return leadSuitCardsAsc[0];
  }

  // =========================================================================
  // --- CASE 3: DISCARDING (AI DOES NOT HAVE LEAD SUIT) ---
  // =========================================================================
  return chooseSmartDiscard(validCards, hand, cardsPlayedSoFar, effectiveDifficulty);
}

export interface BotCommentResult {
  text: string;
  emoji: string;
}

/**
 * Generates a tactically coherent, in-character commentary for a bot based on the exact play outcome.
 */
export function getBotPlayReaction(params: {
  card: Card;
  isLeadPlay: boolean;
  leadSuit: Suit | null;
  isWinningSoFar: boolean;
  isCut: boolean; // Discard (cannot follow suit)
  trickNumber: number;
  isDynamicBoss: boolean;
  brokeKoraStreak: boolean;
  strategy: AIStrategy;
  botName: string;
  difficulty?: AIDifficulty;
}): BotCommentResult | null {
  const {
    card,
    isLeadPlay,
    isWinningSoFar,
    isCut,
    trickNumber,
    isDynamicBoss,
    brokeKoraStreak,
    strategy,
    botName,
    difficulty,
  } = params;

  // If bot emotes are completely disabled (max per round = 0)
  if (activeBotDialogueConfig.botMaxEmotesPerRound === 0) {
    return null;
  }

  const hokutoRate = (activeBotDialogueConfig.botEmoteHokutoRatePct ?? 28) / 100;
  const mbapRate = (activeBotDialogueConfig.botEmoteMbapRatePct ?? 25) / 100;
  const leadDiscardRate = (activeBotDialogueConfig.botEmoteLeadDiscardRatePct ?? 10) / 100;

  // Grand Katika Master Commentary (L'ancien respecté de la table)
  if (difficulty === 'GRAND_MASTER' && Math.random() < Math.max(0.05, hokutoRate * 0.9)) {
    if (brokeKoraStreak && isWinningSoFar) {
      const grandKatikaBreak = [
        { text: 'Pas de série de plis devant les anciens.', emoji: '🛑' },
        { text: 'Chaque carte a été lue depuis la donne. Pas de série ici.', emoji: '⚔️' },
        { text: 'Tu as voulu forcer, mais la table a de la mémoire.', emoji: '⚡' },
      ];
      return grandKatikaBreak[Math.floor(Math.random() * grandKatikaBreak.length)];
    }

    if (trickNumber === 4) {
      const grandKatikaTrick4 = [
        { text: 'Le quatrième tour décide toujours du cinquième.', emoji: '🎯' },
        { text: 'La fin de partie est déjà écrite.', emoji: '👑' },
        { text: 'Posez vos cartes, le dénouement approche.', emoji: '⚡' },
      ];
      return grandKatikaTrick4[Math.floor(Math.random() * grandKatikaTrick4.length)];
    }

    if (trickNumber === 5 && isWinningSoFar) {
      const grandKatikaTrick5 = [
        { text: 'Ce pot était scellé depuis le début. Respectez le jeu.', emoji: '🏆' },
        { text: 'L’expérience a parlé sur le tapis.', emoji: '⚡' },
      ];
      return grandKatikaTrick5[Math.floor(Math.random() * grandKatikaTrick5.length)];
    }
  }

  // Robam Hokuto Special Adaptive Commentary (Le champion de quartier)
  const isHokuto = Boolean((botName && botName.includes('Robam Hokuto')) || strategy === 'HOKUTO_ADAPTIVE');
  if (isHokuto && Math.random() < hokutoRate) {
    const style = globalHumanProfile.style;

    if (style === 'EARLY_AGGRESSIVE' && trickNumber <= 2) {
      const hokutoEarlyEmotes = [
        { text: 'Tu brûles tes 10 trop vite, mon ami ! Tu dors !', emoji: '🧠' },
        { text: 'Tape seulement, je t’attends au tournant !', emoji: '🛡️' },
        { text: 'Tu t’agites pour rien, c’est à la fin qu’on compte les points !', emoji: '🥷' },
      ];
      return hokutoEarlyEmotes[Math.floor(Math.random() * hokutoEarlyEmotes.length)];
    }

    if (style === 'LATE_HOARDER' && trickNumber >= 3) {
      const hokutoLateEmotes = [
        { text: 'Tu gardais tes cartes jusqu’à la fin ? Mauvais calcul, tu dors !', emoji: '👁️' },
        { text: 'La pression monte, tes 10 sont obligés de sortir !', emoji: '💥' },
        { text: 'Tes cartes fortes sont finies, je te vois venir depuis le début !', emoji: '🔮' },
      ];
      return hokutoLateEmotes[Math.floor(Math.random() * hokutoLateEmotes.length)];
    }

    if (brokeKoraStreak && isWinningSoFar) {
      const hokutoKoraEmotes = [
        { text: 'Tu voulais enchaîner les plis devant Robam Hokuto ? Jamais !', emoji: '🔒' },
        { text: 'Série de plis verrouillée ! Respecte un peu le maître du jeu !', emoji: '🛑' },
      ];
      return hokutoKoraEmotes[Math.floor(Math.random() * hokutoKoraEmotes.length)];
    }

    if (trickNumber === 5 && isWinningSoFar) {
      const hokutoVictoryEmotes = [
        { text: 'Le pot est pour Robam Hokuto ! C’est le quartier qui gagne !', emoji: '👑' },
        { text: 'Maîtrise totale du tapis. Le patron, c’est moi !', emoji: '🥷' },
        { text: 'Robam Hokuto ne partage pas le pot. Merci pour les jetons !', emoji: '💰' },
      ];
      return hokutoVictoryEmotes[Math.floor(Math.random() * hokutoVictoryEmotes.length)];
    }
  }

  // 1. HIGHEST PRIORITY: Breaking an opponent's trick streak (Tricks 2-4)
  if (brokeKoraStreak && isWinningSoFar) {
    if (Math.random() < Math.min(0.85, Math.max(0.2, mbapRate * 2.4))) {
      const koraBreakerEmotes = [
        { text: 'Ta série de plis est rompue aujourd’hui !', emoji: '🛑' },
        { text: 'Pas de série de plis sur cette table avec moi !', emoji: '⛔' },
        { text: 'La série de plis est morte, assieds-toi !', emoji: '✋' },
        { text: 'Tu croyais enchaîner tous les plis ? Tu rêves !', emoji: '🛡️' },
      ];
      return koraBreakerEmotes[Math.floor(Math.random() * koraBreakerEmotes.length)];
    }
    return null;
  }

  // 2. TRICK 5: The decisive Pot trick
  if (trickNumber === 5) {
    if (isLeadPlay) {
      if (Math.random() < Math.min(0.7, Math.max(0.05, mbapRate * 1.4))) {
        const trick5LeadEmotes = [
          { text: 'C’est l’heure du pot ! Tout se joue ici !', emoji: '🪙' },
          { text: 'Le pot-ci ne va pas m’échapper !', emoji: '💰' },
          { text: 'Dernière carte, voyons qui est le vrai patron !', emoji: '🏁' },
        ];
        return trick5LeadEmotes[Math.floor(Math.random() * trick5LeadEmotes.length)];
      }
    } else if (isCut) {
      // Discarding / no lead suit on trick 5
      if (Math.random() < Math.min(0.5, Math.max(0.05, leadDiscardRate * 2.0))) {
        const trick5CutEmotes = [
          { text: 'Aïe, je n’ai même pas la couleur du pot...', emoji: '😔' },
          { text: 'C’est gâté pour moi sur le pot, je n’ai pas la carte.', emoji: '🍂' },
        ];
        return trick5CutEmotes[Math.floor(Math.random() * trick5CutEmotes.length)];
      }
    } else if (isWinningSoFar) {
      if (Math.random() < Math.min(0.75, Math.max(0.1, mbapRate * 1.6))) {
        const trick5WinEmotes = [
          { text: 'Le pot rentre à la maison ! Merci pour les jetons !', emoji: '💰' },
          { text: 'Contrôle total sur le pot ! C’est plié !', emoji: '👑' },
          { text: 'Je ramasse la caisse ! Bien essayé quand même !', emoji: '🏆' },
        ];
        return trick5WinEmotes[Math.floor(Math.random() * trick5WinEmotes.length)];
      }
    } else {
      // Followed suit on trick 5 but didn't win
      if (Math.random() < Math.min(0.4, Math.max(0.05, leadDiscardRate * 1.5))) {
        const trick5LoseEmotes = [
          { text: 'Ma carte était trop courte pour le pot...', emoji: '😅' },
          { text: 'Bien joué pour le pot, tu as assuré !', emoji: '👏' },
        ];
        return trick5LoseEmotes[Math.floor(Math.random() * trick5LoseEmotes.length)];
      }
    }
    return null;
  }

  // 3. PAS LA COULEUR / COUPURE SANS COULEUR (Mains 1 à 4): Le bot n'a pas la couleur demandée
  if (isCut) {
    if (Math.random() < Math.max(0.01, leadDiscardRate * 1.2)) {
      const discardEmotes = [
        { text: 'Je n’ai pas la carte !', emoji: '🤷' },
        { text: 'Pas la couleur, je m’en débarrasse.', emoji: '🍃' },
        { text: 'Pas cette couleur chez moi, jouez seulement !', emoji: '💨' },
        { text: 'Zéro de cette couleur en main !', emoji: '🙅' },
      ];
      return discardEmotes[Math.floor(Math.random() * discardEmotes.length)];
    }
    return null;
  }

  // 4. ENTAME / LEAD PLAY (Mains 1 à 4)
  if (isLeadPlay) {
    if (isDynamicBoss || card.value === 10 || (card.suit === 'PIQUE' && card.value === 9)) {
      // Opening with strong card / boss
      if (Math.random() < Math.max(0.02, leadDiscardRate * 2.0)) {
        const strongLeadEmotes = [
          { text: 'J’ouvre direct avec du lourd !', emoji: '🔥' },
          { text: 'Qui a le courage de suivre ?', emoji: '👀' },
          { text: 'Je pose la patronne d’entrée de jeu !', emoji: '👑' },
        ];
        return strongLeadEmotes[Math.floor(Math.random() * strongLeadEmotes.length)];
      }
    } else {
      // Opening with low/medium card
      if (Math.random() < Math.max(0.01, leadDiscardRate)) {
        const softLeadEmotes = [
          { text: 'Je pose une petite d’abord, on regarde...', emoji: '🎴' },
          { text: 'Voyons ce que vous avez dans vos mains !', emoji: '👀' },
          { text: 'C’est à vous de répondre maintenant.', emoji: '🎲' },
        ];
        return softLeadEmotes[Math.floor(Math.random() * softLeadEmotes.length)];
      }
    }
    return null;
  }

  // 5. FOLLOWING SUIT & CURRENTLY WINNING THE TRICK (isWinningSoFar === true)
  // Prise de contrôle / Couper la carte
  if (isWinningSoFar) {
    const isTrueBoss =
      card.value === 10 ||
      (card.suit === 'PIQUE' && card.value === 9) ||
      isDynamicBoss;

    if (isTrueBoss) {
      // Couper avec une carte maîtresse / 10 / Patronne
      if (Math.random() < mbapRate) {
        // Archétypes
        if (strategy === 'BLUFFER' || strategy === 'KORA_HUNTER') {
          const aggressiveControl = [
            { text: 'Je coupe ça sec !', emoji: '💥' },
            { text: 'Je prends le contrôle de la table !', emoji: '🔥' },
            { text: 'Qui peut monter sur ma carte ? Personne !', emoji: '👑' },
            { text: 'Je ramasse tout, circulez !', emoji: '⚔️' },
          ];
          return aggressiveControl[Math.floor(Math.random() * aggressiveControl.length)];
        } else if (strategy === 'CARD_COUNTER') {
          const counterControl = [
            { text: 'Le contrôle était prévu ici.', emoji: '🧠' },
            { text: 'La patronne est sortie au bon moment.', emoji: '👑' },
            { text: 'Je coupe au bon timing.', emoji: '✋' },
          ];
          return counterControl[Math.floor(Math.random() * counterControl.length)];
        } else if (strategy === 'GATEKEEPER') {
          const gatekeeperControl = [
            { text: 'Personne ne passe ici !', emoji: '🛡️' },
            { text: 'Je ferme le chemin !', emoji: '🛑' },
          ];
          return gatekeeperControl[Math.floor(Math.random() * gatekeeperControl.length)];
        } else {
          const generalControl = [
            { text: 'Je prends le contrôle !', emoji: '💥' },
            { text: 'La patronne est sur la table !', emoji: '👑' },
            { text: 'Je coupe direct !', emoji: '✋' },
            { text: 'Tu dors, et moi je ramasse !', emoji: '😴' },
            { text: 'Tu dors sur tes cartes ou quoi ?', emoji: '👀' },
          ];
          return generalControl[Math.floor(Math.random() * generalControl.length)];
        }
      }
    } else {
      // Takes lead with a modest winning card (e.g. 7, 8, 9)
      if (Math.random() < Math.max(0.02, mbapRate * 0.48)) {
        const modestWinEmotes = [
          { text: 'Je prends la main !', emoji: '✋' },
          { text: 'Ça suffit pour l’instant 😉', emoji: '🎯' },
          { text: 'En tête !', emoji: '✨' },
          { text: 'Ça passe !', emoji: '👌' },
          { text: 'Mon ami, tu dors debout !', emoji: '🥱' },
        ];
        return modestWinEmotes[Math.floor(Math.random() * modestWinEmotes.length)];
      }
    }
    return null;
  }

  // 6. FOLLOWING SUIT BUT LOSING (isWinningSoFar === false)
  if (Math.random() < Math.max(0.01, leadDiscardRate * 0.8)) {
    const loseEmotes = [
      { text: 'Trop haut pour moi !', emoji: '😅' },
      { text: 'Je passe sous ta carte...', emoji: '🛡️' },
      { text: 'Je garde mon énergie pour après.', emoji: '⏳' },
      { text: 'Bien joué, tu as la main.', emoji: '👏' },
    ];
    return loseEmotes[Math.floor(Math.random() * loseEmotes.length)];
  }

  return null;
}
