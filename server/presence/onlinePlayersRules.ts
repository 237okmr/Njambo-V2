/**
 * Joueurs en ligne : règles pures (aucun réseau, aucune écriture, aucun délai).
 *
 * La liste ne montre que ce qu'un joueur accepte de montrer : pseudo, avatar, statut. Jamais d'e-mail, de solde ni de capital.
 * Un joueur invité (identifiant « usr_ »), un joueur qui s'est caché et un joueur sans signal récent n'y figurent jamais.
 */

import type { UserPresence } from '../../src/types';

export type OnlinePlayerStatus = 'AVAILABLE' | 'IN_SOLO' | 'IN_LOBBY' | 'IN_GAME';

export interface OnlinePlayerEntry {
  userId: string;
  displayName: string;
  avatarId: string;
  status: OnlinePlayerStatus;
}

export interface PresenceSettings {
  /** Le joueur n'apparaît pas dans la liste « En ligne ». */
  hidden: boolean;
  /** Seuls ses amis confirmés peuvent lui envoyer une invitation directe. */
  friendsOnlyInvites: boolean;
  /** Le joueur accepte d'être prévenu quand un joueur qu'il ne connaît pas cherche une partie (désactivé par défaut). */
  searchAlerts: boolean;
}

export const DEFAULT_PRESENCE_SETTINGS: PresenceSettings = { hidden: false, friendsOnlyInvites: false, searchAlerts: false };

export function normalizePresenceSettings(raw: unknown): PresenceSettings {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    hidden: source.hidden === true,
    friendsOnlyInvites: source.friendsOnlyInvites === true,
    searchAlerts: source.searchAlerts === true,
  };
}

/** Un compte Google authentifié : les identifiants d'invité commencent par « usr_ ». */
export function isGoogleUserId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && !id.startsWith('usr_');
}

function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Joueur';
  const cleaned = raw.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 40);
  return cleaned || 'Joueur';
}

function cleanAvatar(raw: unknown): string {
  if (typeof raw !== 'string') return 'default';
  const cleaned = raw.replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 60);
  return cleaned || 'default';
}

const STATUS_ORDER: Record<OnlinePlayerStatus, number> = { AVAILABLE: 0, IN_SOLO: 1, IN_LOBBY: 2, IN_GAME: 3 };

/** Un joueur peut recevoir une invitation seulement s'il n'est pas déjà au salon ou en partie. */
export function isInvitableStatus(status: OnlinePlayerStatus): boolean {
  return status === 'AVAILABLE' || status === 'IN_SOLO';
}

export interface BuildOnlinePlayersInput {
  presences: Iterable<UserPresence>;
  nowMs: number;
  /** Un signal plus ancien que cette durée (ms) retire le joueur de la liste, sauf connexion ouverte. */
  freshMs: number;
  selfId: string;
  /** Réglages connus du joueur ; undefined = pas encore lus : par prudence, le joueur reste caché. */
  settingsOf: (userId: string) => PresenceSettings | undefined;
  isSocketOpen: (userId: string) => boolean;
  /** Statut réel de la table d'un joueur (le signal de présence peut avoir quelques secondes de retard). */
  roomStatusOf: (roomCode: string) => 'LOBBY' | 'PLAYING' | 'OTHER' | undefined;
  limit: number;
}

export function buildOnlinePlayers(input: BuildOnlinePlayersInput): OnlinePlayerEntry[] {
  const { nowMs, freshMs, selfId, settingsOf, isSocketOpen, roomStatusOf } = input;
  const limit = Math.max(0, Math.floor(input.limit));
  const rows: Array<OnlinePlayerEntry & { seenAt: number }> = [];

  for (const presence of input.presences) {
    const id = presence.userId;
    if (!isGoogleUserId(id) || id === selfId) continue;
    if (presence.status === 'OFFLINE') continue;
    if (!isSocketOpen(id) && nowMs - presence.lastSeenAt >= freshMs) continue;

    const settings = settingsOf(id);
    if (!settings || settings.hidden) continue;

    let status: OnlinePlayerStatus = 'AVAILABLE';
    const roomCode = presence.currentRoomCode;
    const roomStatus = roomCode ? roomStatusOf(roomCode) : undefined;
    if (roomCode && roomStatus === 'PLAYING') status = 'IN_GAME';
    else if (roomCode && roomStatus) status = 'IN_LOBBY';
    else if (presence.status === 'IN_GAME') status = 'IN_GAME';
    else if (presence.status === 'IN_LOBBY') status = 'IN_LOBBY';
    else if (presence.status === 'IN_SOLO') status = 'IN_SOLO';

    rows.push({
      userId: id,
      displayName: cleanName(presence.displayName),
      avatarId: cleanAvatar(presence.avatarId),
      status,
      seenAt: presence.lastSeenAt,
    });
  }

  rows.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.seenAt - a.seenAt || a.userId.localeCompare(b.userId));
  return rows.slice(0, limit).map(({ seenAt: _seenAt, ...entry }) => entry);
}

export interface InviteQuotaResult {
  allowed: boolean;
  /** Attente avant la prochaine invitation possible, en ms (0 si autorisée). */
  retryAfterMs: number;
  /** Horodatages encore dans la fenêtre, à conserver. */
  kept: number[];
}

/** Plafond d'invitations par fenêtre glissante. Ne modifie rien : l'appelant enregistre l'envoi réussi. */
export function checkInviteQuota(stamps: readonly number[], nowMs: number, max: number, windowMs: number): InviteQuotaResult {
  const kept = stamps.filter((t) => nowMs - t < windowMs);
  if (kept.length < max) return { allowed: true, retryAfterMs: 0, kept };
  const oldest = Math.min(...kept);
  return { allowed: false, retryAfterMs: Math.max(0, oldest + windowMs - nowMs), kept };
}

/** Qui peut inviter qui : un joueur caché ou « amis seulement » ne reçoit d'invitation que de ses amis confirmés. */
export function mayReceiveInvite(settings: PresenceSettings, senderIsFriend: boolean): boolean {
  if (senderIsFriend) return true;
  return !settings.hidden && !settings.friendsOnlyInvites;
}
