/**
 * Droits des administrateurs de katika. Le propriétaire a tous les droits ; un administrateur ajouté n'a que ceux de sa fiche.
 * Chaque route de /api/katika est classée ici : une route absente de la table est refusée à tous sauf au propriétaire.
 * Cacher un bouton à l'écran n'est pas une protection : c'est ce fichier, appliqué par le serveur, qui décide.
 */

export const KATIKA_PERMISSIONS = [
  'dashboard.view',
  'rooms.view',
  'rooms.manage',
  'players.view',
  'players.sanction',
  'players.edit',
  'matches.view',
  'logs.view',
  'notes.use',
  'copilot.use',
  'settings.edit',
  'cash.view',
  'cash.manage',
] as const;

export type KatikaPermission = (typeof KATIKA_PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<KatikaPermission, string> = {
  'dashboard.view': 'Voir le tableau de bord et les chiffres',
  'rooms.view': 'Voir les tables en direct, cartes comprises',
  'rooms.manage': 'Agir sur une table (exclure, fermer, relancer, message)',
  'players.view': 'Voir les joueurs et leur dossier',
  'players.sanction': 'Avertir ou sanctionner un joueur',
  'players.edit': 'Modifier un joueur (jetons, profil, bot, suppression)',
  'matches.view': 'Voir l\'historique des parties',
  'logs.view': 'Voir le journal d\'audit',
  'notes.use': 'Utiliser le carnet de bord',
  'copilot.use': 'Utiliser le Copilote et créer des visuels',
  'settings.edit': 'Modifier les réglages du jeu',
  'cash.view': 'Kora Cash : voir',
  'cash.manage': 'Kora Cash : agir',
};

export type AdminTemplateId = 'MODERATOR' | 'COMMUNITY' | 'READ_ONLY';

export const ADMIN_TEMPLATES: Record<AdminTemplateId, { label: string; permissions: KatikaPermission[] }> = {
  MODERATOR: {
    label: 'Modérateur',
    permissions: ['dashboard.view', 'rooms.view', 'rooms.manage', 'players.view', 'players.sanction', 'matches.view', 'logs.view'],
  },
  COMMUNITY: {
    label: 'Community manager',
    permissions: ['dashboard.view', 'matches.view', 'copilot.use', 'notes.use'],
  },
  READ_ONLY: {
    label: 'Lecture seule',
    permissions: ['dashboard.view', 'rooms.view', 'players.view', 'matches.view', 'logs.view'],
  },
};

/** Exigence d'une route : un droit, l'un de plusieurs droits, tout admin actif, ou le propriétaire seul. */
export type RouteRequirement = { anyOf: KatikaPermission[] } | 'ANY_ADMIN' | 'OWNER';

const any = (...permissions: KatikaPermission[]): RouteRequirement => ({ anyOf: permissions });

/** Chemins relatifs à /api/katika. Le premier motif qui correspond l'emporte. */
const ROUTE_TABLE: Array<[method: string, pattern: RegExp, requirement: RouteRequirement]> = [
  ['GET', /^\/me$/, 'ANY_ADMIN'],
  ['*', /^\/admins(\/[^/]+)?$/, 'OWNER'],
  ['POST', /^\/legacy-records$/, 'OWNER'],
  ['*', /^\/cash\/providers\//, 'OWNER'],

  ['GET', /^\/(read-budget|client-reads|activity-data)$/, any('dashboard.view')],
  ['GET', /^\/dashboard-data$/, any('dashboard.view', 'players.view', 'matches.view')],
  ['POST', /^\/users-summary$/, any('dashboard.view')],
  ['GET', /^\/live-metrics$/, any('dashboard.view', 'rooms.view')],
  ['GET', /^\/game-history$/, any('dashboard.view', 'matches.view', 'players.view')],
  ['POST', /^\/matches$/, 'OWNER'],

  ['POST', /^\/rooms\/[^/]+\/(kick|close|reset-round|message)$/, any('rooms.manage')],

  ['GET', /^\/(player-overrides|player-history\/[^/]+)$/, any('players.view')],
  ['POST', /^\/ban-player$/, any('players.sanction')],
  ['POST', /^\/(player-chips|repair-profile\/[^/]+)$/, any('players.edit')],
  ['POST', /^\/players\/[^/]+\/(leaderboard-validate|mark-bot)$/, any('players.edit')],
  ['DELETE', /^\/players\/[^/]+$/, any('players.edit')],

  ['GET', /^\/audit-logs$/, any('logs.view')],
  ['POST', /^\/audit-logs$/, 'ANY_ADMIN'],

  ['GET', /^\/engine-config$/, 'ANY_ADMIN'],
  ['POST', /^\/engine-config$/, any('settings.edit')],

  ['GET', /^\/notes$/, any('notes.use', 'copilot.use')],
  ['*', /^\/notes(\/[^/]+)?$/, any('notes.use')],

  ['POST', /^\/copilot-settings$/, any('copilot.use')],
  ['GET', /^\/(ai-quota|moments)$/, any('copilot.use')],
  ['POST', /^\/(ai-chat|ai-chat-stream|ai-visual)$/, any('copilot.use')],

  ['GET', /^\/cash\//, any('cash.view')],
  ['POST', /^\/cash\//, any('cash.manage')],
];

/** Exigence de la route, ou null si elle n'est pas classée (refusée sauf au propriétaire). */
export function routeRequirement(method: string, path: string): RouteRequirement | null {
  const m = method.toUpperCase();
  for (const [routeMethod, pattern, requirement] of ROUTE_TABLE) {
    if ((routeMethod === '*' || routeMethod === m) && pattern.test(path)) return requirement;
  }
  return null;
}

export interface KatikaAccess {
  isOwner: boolean;
  permissions: KatikaPermission[];
}

export function isAllowed(access: KatikaAccess, requirement: RouteRequirement | null): boolean {
  if (access.isOwner) return true;
  if (requirement === null || requirement === 'OWNER') return false;
  if (requirement === 'ANY_ADMIN') return true;
  return requirement.anyOf.some((p) => access.permissions.includes(p));
}

/** Garde seulement les droits connus, sans doublon ; les droits de gestion des admins n'existent pas : ils restent au propriétaire. */
export function sanitizePermissions(raw: unknown): KatikaPermission[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set<string>(KATIKA_PERMISSIONS);
  return [...new Set(raw.filter((p): p is KatikaPermission => typeof p === 'string' && known.has(p)))];
}

export function isTemplateId(raw: unknown): raw is AdminTemplateId {
  return typeof raw === 'string' && raw in ADMIN_TEMPLATES;
}
