/**
 * Centre social : règles pures (aucun réseau, aucun délai, aucun montant).
 * Le centre sépare strictement le jeu gratuit (jetons) et Kora Cash (argent réel, FCFA) : jamais dans la même liste,
 * ni dans le même compteur.
 */

import type { GameInvitation } from '../types';

export type SocialMode = 'FREE' | 'CASH';
export type SocialSubTab = 'INVITATIONS' | 'FRIENDS' | 'ONLINE' | 'TABLES';

const MODE_STORAGE_KEY = 'njambo_social_mode';

export interface SocialAvailabilityInput {
  /** Interrupteur katika « Centre social ». */
  centerEnabled: boolean;
  /** Interrupteur katika « Côté Kora Cash du centre social ». */
  cashSideEnabled: boolean;
  /** Kora Cash lui-même est ouvert (statut public). */
  koraCashEnabled: boolean;
  /** Compte Google authentifié. */
  isGoogle: boolean;
}

/** Le côté Kora Cash n'existe que pour un compte Google, quand le centre, son côté Cash et Kora Cash sont ouverts. */
export function isCashSideAvailable({ centerEnabled, cashSideEnabled, koraCashEnabled, isGoogle }: SocialAvailabilityInput): boolean {
  return centerEnabled && cashSideEnabled && koraCashEnabled && isGoogle;
}

/** Mode demandé, ramené à Gratuit si le côté Kora Cash n'est pas disponible. */
export function resolveSocialMode(requested: SocialMode | null | undefined, cashAvailable: boolean): SocialMode {
  return requested === 'CASH' && cashAvailable ? 'CASH' : 'FREE';
}

export function invitationMode(invitation: Pick<GameInvitation, 'cash'>): SocialMode {
  return invitation.cash === true ? 'CASH' : 'FREE';
}

/** Invitations non expirées du mode demandé, les plus proches de l'expiration d'abord. */
export function invitationsForMode(invitations: readonly GameInvitation[], mode: SocialMode, nowMs: number): GameInvitation[] {
  return invitations
    .filter((inv) => invitationMode(inv) === mode && inv.expiresAt > nowMs)
    .sort((a, b) => a.expiresAt - b.expiresAt);
}

export interface InvitationCounts {
  free: number;
  cash: number;
}

/** Compteurs séparés. Les invitations Kora Cash ne comptent que si le côté Cash est disponible. */
export function countInvitations(invitations: readonly GameInvitation[], cashAvailable: boolean, nowMs: number): InvitationCounts {
  return {
    free: invitationsForMode(invitations, 'FREE', nowMs).length,
    cash: cashAvailable ? invitationsForMode(invitations, 'CASH', nowMs).length : 0,
  };
}

export function totalInvitations(counts: InvitationCounts): number {
  return counts.free + counts.cash;
}

/** Appels « je cherche une partie » vus par le joueur : même séparation Gratuit / Cash que les invitations. */
export interface SearchCallLike {
  mode: SocialMode;
  expiresAt: number;
}

export function liveSearchCalls<T extends SearchCallLike>(calls: readonly T[], mode: SocialMode, nowMs: number): T[] {
  return calls.filter((c) => c.mode === mode && c.expiresAt > nowMs);
}

/** Compteurs séparés. Les appels Kora Cash ne comptent que si le côté Cash est disponible. */
export function countSearchCalls(calls: readonly SearchCallLike[], cashAvailable: boolean, nowMs: number): InvitationCounts {
  return {
    free: liveSearchCalls(calls, 'FREE', nowMs).length,
    cash: cashAvailable ? liveSearchCalls(calls, 'CASH', nowMs).length : 0,
  };
}

export interface HomeCardInput {
  isGoogle: boolean;
  counts: InvitationCounts;
  /** Joueurs qui cherchent une partie (absent : aucun). */
  searching?: InvitationCounts;
}

export interface HomeCardView {
  title: string;
  detail: string;
  /** Nombre affiché dans la pastille ; 0 : pas de pastille. */
  badge: number;
  /** Action : ouvrir le centre, ou demander la connexion Google. */
  action: 'OPEN' | 'SIGN_IN';
}

/** Texte de la carte d'accueil. Une invitation Kora Cash n'y montre jamais la mise. */
export function buildHomeCard({ isGoogle, counts, searching }: HomeCardInput): HomeCardView {
  if (!isGoogle) {
    return { title: 'Social', detail: 'Connecte-toi avec Google pour retrouver tes amis', badge: 0, action: 'SIGN_IN' };
  }
  const searchTotal = searching ? totalInvitations(searching) : 0;
  const total = totalInvitations(counts) + searchTotal;
  if (total === 0) {
    return { title: 'Social', detail: 'Amis, invitations et tables', badge: 0, action: 'OPEN' };
  }
  const parts: string[] = [];
  if (counts.free > 0) parts.push(`${counts.free} défi${counts.free > 1 ? 's' : ''}`);
  if (counts.cash > 0) parts.push(`${counts.cash} invitation${counts.cash > 1 ? 's' : ''} Kora Cash`);
  if (searchTotal > 0) parts.push(`${searchTotal} ${searchTotal > 1 ? 'cherchent' : 'cherche'} une partie`);
  return { title: 'Social', detail: parts.join(' · '), badge: total, action: 'OPEN' };
}

export function readStoredSocialMode(): SocialMode | null {
  try {
    const raw = window.localStorage.getItem(MODE_STORAGE_KEY);
    return raw === 'CASH' || raw === 'FREE' ? raw : null;
  } catch {
    return null;
  }
}

export function storeSocialMode(mode: SocialMode): void {
  try {
    window.localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // Stockage indisponible : le choix vaut pour cette ouverture seulement.
  }
}

export interface SeatedTable {
  id: string;
  isCash: boolean;
  baseBet: number;
  status: string;
  seated: number;
  capacity: number;
}

/** Table où le joueur est assis, séparée par mode : une table de l'autre mode ne se mélange pas à la liste. */
export function splitSeatedTable(room: { id: string; cash?: unknown; baseBet: number; status: string; players?: unknown[]; maxPlayers: number } | null | undefined): {
  free: SeatedTable | null;
  cash: SeatedTable | null;
} {
  if (!room) return { free: null, cash: null };
  const table: SeatedTable = {
    id: room.id,
    isCash: Boolean(room.cash),
    baseBet: room.baseBet,
    status: room.status,
    seated: (room.players || []).length,
    capacity: room.maxPlayers,
  };
  return table.isCash ? { free: null, cash: table } : { free: table, cash: null };
}
