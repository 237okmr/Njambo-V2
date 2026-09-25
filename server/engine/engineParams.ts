/**
 * REGISTRE UNIQUE DES PARAMÈTRES RÉGLABLES (Njambo Kora)
 *
 * Règle permanente : aucun délai n'est codé en dur. Tout délai (multijoueur, réseau, session,
 * modération, notification, cache, interface, katika) se déclare ici et se règle dans katika.
 * Exceptions : le solo, les animations purement visuelles et les constantes marquées // delay-ok: raison.
 *
 * Ce fichier est volontairement sans aucune dépendance : il est importé par le serveur ET par le client.
 */

export type ParamScope = 'server' | 'client' | 'both' | 'admin';
export type ParamGroup =
  | 'partie'
  | 'connexion'
  | 'salons'
  | 'moderation'
  | 'notifications'
  | 'caches-et-mises-a-jour'
  | 'interface'
  | 'katika';
export type ParamEffect = 'immediate' | 'next_room' | 'next_connection';
export type ParamUnit = 's' | 'ms' | 'min' | 'jours' | '';

export interface ParamDef {
  key: string;
  label: string;
  unit: ParamUnit;
  type?: 'number' | 'boolean';
  min: number;
  max: number;
  default: number | boolean;
  group: ParamGroup;
  scope: ParamScope;
  effect: ParamEffect;
  advanced?: boolean;
  help: string;
  deprecated?: boolean;
  /** Valeur 0 acceptée en plus de l'intervalle min à max (ex. 0 = désactivé). */
  allowZero?: boolean;
  /** Paramètre protégé : valeur et bornes ne doivent jamais être modifiées dans le code. */
  locked?: boolean;
}

export const ENGINE_PARAMS: ParamDef[] = [
  // ===== Groupe partie =====
  {
    key: 'turnTimerSeconds', label: 'Chrono de tour (défaut des nouvelles tables)', unit: 's',
    min: 10, max: 60, default: 20, group: 'partie', scope: 'both', effect: 'next_room',
    help: 'Temps accordé à un joueur pour jouer sa carte. Ne change pas les tables déjà créées.',
  },
  {
    key: 'aiRelayGraceSeconds', label: 'Délai avant que le relais prenne le siège', unit: 's',
    min: 8, max: 60, default: 25, group: 'partie', scope: 'both', effect: 'immediate',
    help: 'Attente après une coupure avant qu\'un relais joue à la place du joueur absent.',
  },
  {
    key: 'transitionDelayMs', label: 'Compte à rebours entre deux parties', unit: 'ms',
    min: 10000, max: 60000, default: 25000, group: 'partie', scope: 'both', effect: 'immediate',
    help: 'Durée avant le lancement automatique de la partie suivante (dernière chance de retour).',
  },
  {
    key: 'roundEndWatchdogMs', label: 'Filet de sécurité du compte à rebours de fin de partie', unit: 'ms',
    min: 500, max: 10000, default: 1500, group: 'partie', scope: 'server', effect: 'immediate', advanced: true,
    help: 'Marge après l\'expiration du compte à rebours avant que le serveur relance lui-même la partie suivante, au cas où le minuteur d\'origine aurait été perdu.',
  },
  {
    key: 'absentSeatReleaseAfterParties', label: 'Parties d\'absence avant libération du siège', unit: '',
    min: 2, max: 10, default: 3, group: 'partie', scope: 'both', effect: 'immediate',
    help: 'Nombre de parties consécutives déclarées forfait pour absence (tables à 3 ou 4 joueurs) avant que le siège soit confié à un bot et redevienne disponible pour un observateur.',
  },
  {
    key: 'forceStartHostAbsentSeconds', label: 'Absence de l\'hôte avant que tout joueur puisse forcer le départ', unit: 's',
    min: 10, max: 120, default: 20, group: 'partie', scope: 'both', effect: 'immediate',
    help: 'Si l\'hôte est absent depuis ce délai, un autre joueur présent peut forcer le lancement de la partie suivante.',
  },
  {
    key: 'botThinkTimeMs', label: 'Temps de réflexion des bots', unit: 'ms',
    min: 0, max: 3000, default: 800, group: 'partie', scope: 'both', effect: 'immediate',
    help: 'Pause avant qu\'un bot joue sa carte.',
  },
  {
    key: 'trickResolutionTimeMs', label: 'Durée de résolution d\'un pli', unit: 'ms',
    min: 100, max: 5000, default: 1600, group: 'partie', scope: 'both', effect: 'immediate',
    help: 'Pause pendant laquelle le pli gagnant reste visible avant d\'être ramassé.',
  },
  {
    key: 'instantWinAnimationTimeMs', label: 'Durée de l\'animation de victoire instantanée', unit: 'ms',
    min: 100, max: 8000, default: 3500, group: 'partie', scope: 'both', effect: 'immediate',
    advanced: true, help: 'Durée d\'affichage des trois 7 et des mains de moins de 21.',
  },

  // ===== Groupe connexion =====
  {
    key: 'clientReconnectBaseDelayMs', label: 'Délai de base avant la première reconnexion', unit: 'ms',
    min: 500, max: 5000, default: 1000, group: 'connexion', scope: 'client', effect: 'immediate', advanced: true,
    help: 'Point de départ de la reconnexion progressive (1 s, 2 s, 4 s...), avant plafonnement.',
  },
  {
    key: 'clientReconnectMaxDelaySeconds', label: 'Délai maximal entre deux tentatives de reconnexion', unit: 's',
    min: 5, max: 30, default: 10, group: 'connexion', scope: 'client', effect: 'immediate',
    help: 'Plafond de la reconnexion progressive, pour ne jamais attendre trop longtemps.',
  },
  {
    key: 'clientConnectStuckSeconds', label: 'Connexion considérée bloquée', unit: 's',
    min: 5, max: 30, default: 12, group: 'connexion', scope: 'client', effect: 'immediate',
    help: 'Au-delà de ce délai, une connexion qui ne s\'établit pas est abandonnée et relancée (utile en 3G).',
  },
  {
    key: 'resumeDebounceMs', label: 'Regroupement des reprises rapprochées', unit: 'ms',
    min: 100, max: 2000, default: 300, group: 'connexion', scope: 'client', effect: 'immediate', advanced: true,
    help: 'Plusieurs signaux de retour au premier plan très rapprochés ne déclenchent qu\'une seule reprise.',
  },
  {
    key: 'resumeIdleSeconds', label: 'Reprise sans nouvel envoi si déjà à jour', unit: 's',
    min: 5, max: 60, default: 10, group: 'connexion', scope: 'client', effect: 'immediate', advanced: true,
    help: 'Si un message du serveur est arrivé il y a moins de ce délai, une reprise n\'envoie rien de plus.',
  },

  {
    key: 'emoteCooldownMs', label: 'Délai minimal entre deux emotes', unit: 'ms',
    min: 500, max: 5000, default: 1200, group: 'partie', scope: 'server', effect: 'immediate', advanced: true,
    help: 'Empêche un joueur d\'envoyer des emotes trop rapidement (anti-spam).',
  },
  {
    key: 'emoteDisplayMs', label: 'Durée d\'affichage d\'une emote', unit: 'ms',
    min: 1500, max: 8000, default: 3500, group: 'partie', scope: 'both', effect: 'immediate', advanced: true,
    help: 'Temps pendant lequel une bulle d\'emote reste visible à la table.',
  },
  {
    key: 'roomTickIntervalMs', label: 'Cadence du battement de table', unit: 'ms',
    min: 500, max: 5000, default: 1000, group: 'partie', scope: 'server', effect: 'immediate', advanced: true,
    help: 'Fréquence à laquelle le serveur vérifie chaque table (filet de sécurité, grâces, emotes expirées).',
  },
  {
    key: 'trickWinnerViewMs', label: 'Durée d\'affichage du pli gagnant', unit: 'ms',
    min: 400, max: 3000, default: 1050, group: 'partie', scope: 'both', effect: 'immediate',
    help: 'Temps pendant lequel le pli remporté reste visible avant d\'être ramassé.',
  },
  {
    key: 'trickSweepMs', label: 'Durée du balayage du pli', unit: 'ms',
    min: 150, max: 1000, default: 350, group: 'partie', scope: 'both', effect: 'immediate', advanced: true,
    help: 'Durée de l\'animation qui range les cartes du pli remporté.',
  },

  // ===== Groupe modération Fair-Play =====
  {
    key: 'fairPlayRestrictCreateMinutes', label: 'Restriction de création de table', unit: 'min',
    min: 5, max: 240, default: 15, group: 'moderation', scope: 'server', effect: 'immediate',
    help: 'Durée de la sanction après 3 abandons consécutifs : le joueur ne peut plus créer de table.',
  },
  {
    key: 'fairPlayRestrictJoinMinutes', label: 'Restriction de rejoindre une table privée', unit: 'min',
    min: 5, max: 240, default: 30, group: 'moderation', scope: 'server', effect: 'immediate',
    help: 'Durée de la sanction après 4 abandons consécutifs : le joueur ne peut plus rejoindre de table privée.',
  },
  {
    key: 'fairPlayTempBanMinutes', label: 'Suspension temporaire du multijoueur', unit: 'min',
    min: 10, max: 1440, default: 60, group: 'moderation', scope: 'server', effect: 'immediate',
    help: 'Durée de la sanction après 5 abandons consécutifs : le joueur est suspendu du multijoueur.',
  },

  // ===== Groupe notifications =====
  {
    key: 'directInviteLifetimeSeconds', label: 'Durée de vie d\'une invitation directe', unit: 's',
    min: 30, max: 600, default: 120, group: 'notifications', scope: 'both', effect: 'immediate',
    help: 'Temps pendant lequel une invitation envoyée à un ami reste valable.',
  },
  {
    key: 'directInviteCooldownSeconds', label: 'Délai avant de réinviter le même joueur', unit: 's',
    min: 10, max: 300, default: 30, group: 'notifications', scope: 'server', effect: 'immediate',
    help: 'Empêche de spammer d\'invitations un même joueur.',
  },

  // ===== Groupe salons =====
  {
    key: 'emptyRoomTimeoutMinutes', label: 'Suppression d\'une table sans humain connecté', unit: 'min',
    min: 3, max: 120, default: 10, group: 'salons', scope: 'server', effect: 'immediate',
    help: 'Durée après laquelle une table en cours sans aucun humain connecté est supprimée.',
  },
  {
    key: 'playerGraceSeconds', label: 'Grâce d\'un joueur déconnecté entre deux parties', unit: 's',
    min: 30, max: 600, default: 90, group: 'salons', scope: 'both', effect: 'immediate',
    help: 'Temps laissé à un joueur déconnecté pour revenir avant d\'être retiré de la table (salle d\'attente ou manche terminée).',
  },
  {
    key: 'hostGraceSeconds', label: 'Grâce de l\'hôte déconnecté', unit: 's',
    min: 60, max: 1800, default: 180, group: 'salons', scope: 'server', effect: 'immediate',
    help: 'Temps laissé à l\'hôte déconnecté pour revenir avant le transfert de son rôle à un autre joueur.',
  },
  {
    key: 'guestLobbyGraceSeconds', label: 'Grâce d\'un invité déconnecté en salle d\'attente', unit: 's',
    min: 30, max: 600, default: 90, group: 'salons', scope: 'server', effect: 'immediate',
    help: 'Temps laissé à un invité pour revenir avant d\'être retiré de la salle d\'attente.',
  },
  {
    key: 'hostTakeoverSeconds', label: 'Reprise du rôle d\'hôte par un invité', unit: 's',
    min: 60, max: 1800, default: 180, group: 'salons', scope: 'server', effect: 'immediate', allowZero: true,
    help: 'Absence de l\'hôte avant qu\'un invité devienne hôte de repli. 0 = jamais.',
  },
  {
    key: 'publicAbsentHostVisibilitySeconds', label: 'Visibilité publique d\'une table à hôte absent', unit: 's',
    min: 0, max: 1800, default: 180, group: 'salons', scope: 'both', effect: 'immediate', allowZero: true,
    help: 'Durée pendant laquelle une table publique dont l\'hôte est absent reste listée.',
  },
  {
    key: 'roomSnapshotEnabled', label: 'Restauration des tables après redémarrage', unit: '', type: 'boolean',
    min: 0, max: 1, default: true, group: 'salons', scope: 'server', effect: 'immediate',
    help: 'Sauvegarde les tables en cours pour les restaurer si le serveur redémarre.',
  },
  {
    key: 'roomRestoreMaxAgeMinutes', label: 'Ancienneté maximale d\'une table restaurable', unit: 'min',
    min: 5, max: 120, default: 20, group: 'salons', scope: 'server', effect: 'immediate',
    help: 'Une sauvegarde plus ancienne que ce délai est ignorée et supprimée au démarrage.',
  },
  {
    key: 'snapshotMaxWritesPerDay', label: 'Plafond quotidien d\'écritures de sauvegarde', unit: '',
    min: 1000, max: 100000, default: 15000, group: 'salons', scope: 'server', effect: 'immediate', advanced: true,
    help: 'Au-delà, seules les fins de partie sont sauvegardées (protection du quota Firestore).',
  },
  {
    key: 'snapshotDebounceSeconds', label: 'Délai de repos avant sauvegarde', unit: 's',
    min: 1, max: 30, default: 3, group: 'salons', scope: 'server', effect: 'immediate', advanced: true,
    help: 'Attente après le dernier changement d\'une table avant de l\'écrire dans la sauvegarde.',
  },
  {
    key: 'snapshotMinIntervalSeconds', label: 'Intervalle minimal entre deux sauvegardes', unit: 's',
    min: 2, max: 60, default: 5, group: 'salons', scope: 'server', effect: 'immediate', advanced: true,
    help: 'Empêche une table très active de saturer les écritures Firestore.',
  },
  {
    key: 'snapshotPeriodicSeconds', label: 'Sauvegarde périodique de secours', unit: 's',
    min: 10, max: 300, default: 30, group: 'salons', scope: 'server', effect: 'immediate', advanced: true,
    help: 'Sauvegarde forcée d\'une table modifiée même sans nouveau changement récent.',
  },
  {
    key: 'shutdownFlushSeconds', label: 'Délai de sauvegarde à l\'arrêt du serveur', unit: 's',
    min: 2, max: 9, default: 8, group: 'salons', scope: 'server', effect: 'immediate', advanced: true,
    help: 'Temps laissé pour sauvegarder toutes les tables avant l\'arrêt du processus.',
  },
  {
    key: 'bootRestoreTimeoutSeconds', label: 'Délai de restauration au démarrage', unit: 's',
    min: 3, max: 60, default: 10, group: 'salons', scope: 'server', effect: 'immediate', advanced: true,
    help: 'Temps maximal accordé pour recharger les tables sauvegardées avant d\'accepter les connexions.',
  },
  {
    key: 'lobbyWaitTtlMinutes', label: 'Durée de vie d\'une table en attente', unit: 'min',
    min: 5, max: 240, default: 30, group: 'salons', scope: 'server', effect: 'immediate', locked: true,
    help: 'Durée de vie d\'une table en salle d\'attente sans humain connecté. Défaut protégé : 30 min.',
  },

  // ===== Groupe caches et mises à jour =====
  {
    key: 'publicConfigCacheSeconds', label: 'Durée de cache de la config publique', unit: 's',
    min: 0, max: 600, default: 60, group: 'caches-et-mises-a-jour', scope: 'server', effect: 'immediate',
    advanced: true, allowZero: true,
    help: 'Durée pendant laquelle un téléphone réutilise la config publique sans la redemander. 0 = pas de cache.',
  },
];

/** Choix de chrono proposés à la création d'une table (une seule liste pour tous les écrans). */
export const TURN_TIMER_CHOICES: readonly number[] = [15, 20, 30];

/** Choix proposés + valeur par défaut du serveur si elle n'en fait pas partie, triés. */
export function getTurnTimerChoices(defaultSeconds: number): number[] {
  const set = new Set<number>(TURN_TIMER_CHOICES);
  if (Number.isFinite(defaultSeconds)) set.add(defaultSeconds);
  return [...set].sort((a, b) => a - b);
}

export const PARAM_BY_KEY: Record<string, ParamDef> = Object.fromEntries(
  ENGINE_PARAMS.map((p) => [p.key, p])
);

/** Valeurs par défaut de tous les paramètres du registre. */
export function getParamDefaults(): Record<string, number | boolean> {
  const out: Record<string, number | boolean> = {};
  for (const p of ENGINE_PARAMS) out[p.key] = p.default;
  return out;
}

/** Ramène une valeur brute dans les bornes du paramètre (valeur invalide = défaut). */
export function clampParamValue(def: ParamDef, raw: unknown): number | boolean {
  if (def.type === 'boolean') {
    return typeof raw === 'boolean' ? raw : raw === 'true' || raw === 1;
  }
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : (raw as number);
  if (typeof n !== 'number' || !Number.isFinite(n)) return def.default as number;
  if (n === 0 && def.allowZero) return 0;
  return Math.min(def.max, Math.max(def.min, n));
}

export interface ParamPatchResult {
  accepted: Record<string, number | boolean>;
  clamped: { key: string; from: unknown; to: number | boolean }[];
  ignored: string[];
}

/** Valide un patch : champs du registre bornés, champs inconnus ignorés. */
export function validateParamPatch(patch: Record<string, unknown> | null | undefined): ParamPatchResult {
  const result: ParamPatchResult = { accepted: {}, clamped: [], ignored: [] };
  if (!patch || typeof patch !== 'object') return result;
  for (const [key, raw] of Object.entries(patch)) {
    const def = PARAM_BY_KEY[key];
    if (!def) {
      result.ignored.push(key);
      continue;
    }
    const value = clampParamValue(def, raw);
    result.accepted[key] = value;
    if (value !== raw) result.clamped.push({ key, from: raw, to: value });
  }
  return result;
}

/** Sous-ensemble publiable aux joueurs : uniquement les paramètres de portée client ou both. */
export function getPublicParams(values: Record<string, unknown>): Record<string, number | boolean> {
  const out: Record<string, number | boolean> = {};
  for (const p of ENGINE_PARAMS) {
    if (p.scope !== 'client' && p.scope !== 'both') continue;
    const v = values[p.key];
    out[p.key] = v === undefined ? p.default : clampParamValue(p, v);
  }
  return out;
}
