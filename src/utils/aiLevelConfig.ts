/**
 * Configuration complète et centralisée des 4 niveaux d'IA de Njambo.
 * Élimine tous les nombres magiques dispersés dans le code.
 */

// ============================================================================
// 1. NIVEAU FACILE (EASY)
// ============================================================================
export const EASY_CONFIG = {
  /** Taux de coups légaux choisis de façon aléatoire / sous-optimale (22%, fourchette 15-25% spécifiée) */
  RANDOM_MOVE_RATE: 0.22,
  /** Suivi des cartes sorties et cartes maîtresses désactivé */
  TRACK_BOSS_CARDS: false,
  /** Suivi des coupes / vides des adversaires désactivé */
  TRACK_PLAYER_VOIDS: false,
  /** Planification de Kora désactivée */
  ENABLE_KORA_PLANNING: false,
} as const;

// ============================================================================
// 2. NIVEAU NORMAL (NORMAL)
// ============================================================================
export const NORMAL_CONFIG = {
  /** Taux de petits coups sous-optimaux d'un joueur moyen (6%) */
  RANDOM_MOVE_RATE: 0.06,
  /** Pas de vision dynamique des maîtresses (considère les 10 comme forts, ignore si un 9 ou 8 est devenu maître) */
  TRACK_BOSS_CARDS: false,
  /** Économie des 10 et cartes maîtresses pour les plis décisifs */
  PROTECT_BOSS_CARDS: true,
  /** Défausse intelligente des cartes isolées et faibles */
  SMART_DISCARD: true,
  /** Pas de planification avancée de Kora */
  ENABLE_KORA_PLANNING: false,
} as const;

// ============================================================================
// 3. NIVEAU EXPERT (EXPERT)
// ============================================================================
export const EXPERT_CONFIG = {
  /** Utilise la simulation Monte Carlo par déterminisation (PIMC) légère */
  USE_MONTE_CARLO: true,
  /** Budget de temps maximal par coup en millisecondes */
  TIME_BUDGET_MS: 8,
  /** Nombre minimum d'échantillons de donnes plausibles */
  MIN_SAMPLES: 20,
  /** Nombre maximum d'échantillons de donnes plausibles */
  MAX_SAMPLES: 120,
  /** Taille de lot pour la vérification du temps d'exécution adaptatif */
  BATCH_SIZE: 10,
  /** Multiplicateur espéré pour une victoire standard du pot (x1) */
  STANDARD_PAYOFF_MULTIPLIER: 1.0,
  /** Réglage de style : rend Expert prudent sur le Kora, ne modifie pas les gains réels */
  KORA_PAYOFF_MULTIPLIER: 0.5,
  DOUBLE_KORA_PAYOFF_MULTIPLIER: 0.5,
  /** Aucun coup aléatoire */
  RANDOM_MOVE_RATE: 0.0,
  /** Suivi dynamique complet des cartes maîtresses */
  TRACK_BOSS_CARDS: true,
  /** Suivi des vides connus chez les adversaires */
  TRACK_PLAYER_VOIDS: true,
  /** Planification active de Kora basée sur les probabilités publiques */
  ENABLE_KORA_PLANNING: true,
  /** Seuil de probabilité pour déclencher la chasse au Kora (90%) */
  KORA_CHANCE_THRESHOLD: 0.90,
  /** Seuil de probabilité pour le Double Kora (40%) */
  DOUBLE_KORA_CHANCE_THRESHOLD: 0.40,
  /** Prudence anti-Kora : ne pas vider la couleur d'un 3 adverse au pli 4 */
  ANTI_KORA_PRUDENCE: true,
  /** Correction du pli 4 : préserve impérativement la maîtresse pour le pli 5 si pas de Kora */
  PRESERVE_BOSS_FOR_POT_AT_TRICK_4: true,
} as const;

// ============================================================================
// 4. NIVEAU GRAND KATIKA (GRAND_MASTER)
// ============================================================================
export const GRAND_MASTER_CONFIG = {
  /** Utilise la simulation Monte Carlo par déterminisation (PIMC) */
  USE_MONTE_CARLO: true,
  /** Budget de temps maximal par coup en millisecondes (mobile entrée de gamme) */
  TIME_BUDGET_MS: 25,
  /** Nombre minimum d'échantillons de donnes plausibles */
  MIN_SAMPLES: 60,
  /** Nombre maximum d'échantillons de donnes plausibles */
  MAX_SAMPLES: 400,
  /** Taille de lot pour la vérification du temps d'exécution adaptatif */
  BATCH_SIZE: 15,
  /** Multiplicateur espéré pour une victoire standard du pot (x1) */
  STANDARD_PAYOFF_MULTIPLIER: 1.0,
  /** Multiplicateur espéré pour un Kora (x2) */
  KORA_PAYOFF_MULTIPLIER: 2.0,
  /** Multiplicateur espéré pour un Double Kora (x4) */
  DOUBLE_KORA_PAYOFF_MULTIPLIER: 4.0,
} as const;

/** Rétro-compatibilité pour les imports existants de seuils Kora */
export const KORA_CHANCE_THRESHOLD = EXPERT_CONFIG.KORA_CHANCE_THRESHOLD;
export const DOUBLE_KORA_CHANCE_THRESHOLD = EXPERT_CONFIG.DOUBLE_KORA_CHANCE_THRESHOLD;
