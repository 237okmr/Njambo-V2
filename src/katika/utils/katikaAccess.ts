import type { KatikaTab } from '../types/katika';

/**
 * Onglets visibles selon les droits du compte connecté. Ce n'est qu'un confort d'affichage :
 * le serveur refuse de toute façon ce qui n'est pas permis (server/katika/adminRights.ts).
 */
export const TAB_PERMISSION: Record<KatikaTab, string> = {
  HOME: 'dashboard.view',
  DASHBOARD: 'dashboard.view',
  ROOMS: 'rooms.view',
  MATCHES: 'matches.view',
  PLAYERS: 'players.view',
  LOGS: 'logs.view',
  AI_ASSISTANT: 'copilot.use',
  SETTINGS: 'settings.edit',
  KORA_CASH: 'cash.view',
};

export interface KatikaAccessLike {
  isOwner: boolean;
  permissions: string[];
}

export function can(access: KatikaAccessLike | null | undefined, permission: string): boolean {
  if (!access) return false;
  return access.isOwner || access.permissions.includes(permission);
}

export function canSeeTab(access: KatikaAccessLike | null | undefined, tab: KatikaTab): boolean {
  return can(access, TAB_PERMISSION[tab]);
}

/** Premier onglet permis, dans l'ordre du menu ; null si le compte n'a aucun onglet. */
export function firstAllowedTab(access: KatikaAccessLike | null | undefined, order: KatikaTab[]): KatikaTab | null {
  return order.find((tab) => canSeeTab(access, tab)) ?? null;
}

/** Modèle dont les droits sont exactement ceux cochés, sinon « personnalisé ». */
export function matchTemplate(templates: Record<string, { permissions: string[] }>, permissions: string[]): string {
  const wanted = [...permissions].sort().join('|');
  const found = Object.entries(templates).find(([, t]) => [...t.permissions].sort().join('|') === wanted);
  return found ? found[0] : 'CUSTOM';
}
