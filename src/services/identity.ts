import { getPersistentItem, setPersistentItem } from '../utils/storageUtils';

const PLAYER_ID_KEY = 'njambo_player_id';
const AUTH_UID_KEY = 'njambo_auth_uid';
const GUEST_ID_KEY = 'njambo_guest_id';
const PLAYER_NAME_KEY = 'njambo_player_name';

let pendingAuthenticatedUid: string | null = null;
let isUserInRoom = false;

type IdentityChangeListener = () => void;
const identityListeners: IdentityChangeListener[] = [];

export function onIdentityChange(listener: IdentityChangeListener): () => void {
  identityListeners.push(listener);
  return () => {
    const idx = identityListeners.indexOf(listener);
    if (idx >= 0) identityListeners.splice(idx, 1);
  };
}

function notifyIdentityChange(): void {
  identityListeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.warn('[Identity] Listener error:', e);
    }
  });
}

/**
 * Returns the local player name stored in localStorage/cookies, generating a default if absent.
 */
export function getLocalPlayerName(): string {
  const name = localStorage.getItem(PLAYER_NAME_KEY);
  if (name && name.trim().toLowerCase() !== 'katika') {
    return name.trim();
  }
  const defaultName = 'Joueur ' + Math.floor(100 + Math.random() * 900);
  try {
    localStorage.setItem(PLAYER_NAME_KEY, defaultName);
  } catch (e) {
    // ignore
  }
  return defaultName;
}

/**
 * Saves the local player name to localStorage.
 */
export function setLocalPlayerName(name: string): void {
  const trimmed = name.trim();
  if (trimmed.toLowerCase() === 'katika') return;
  try {
    localStorage.setItem(PLAYER_NAME_KEY, trimmed);
  } catch (e) {
    // ignore
  }
}


/**
 * Generates a unique guest identifier ('usr_' + UUID)
 */
function generateGuestIdString(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return 'usr_' + crypto.randomUUID();
  }
  return 'usr_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

/**
 * Returns the persistent guest ID, creating and saving it once if missing.
 */
export function getGuestId(): string {
  let guestId = getPersistentItem(GUEST_ID_KEY);
  if (!guestId) {
    const legacyId = getPersistentItem(PLAYER_ID_KEY);
    if (legacyId && legacyId.startsWith('usr_')) {
      guestId = legacyId;
    } else {
      guestId = generateGuestIdString();
    }
    setPersistentItem(GUEST_ID_KEY, guestId);
  }
  return guestId;
}

/**
 * Returns the active player ID:
 * - If Google account connected: Firebase UID
 * - Otherwise: Guest ID ('usr_...')
 */
export function getPlayerId(): string {
  const authUid = getPersistentItem(AUTH_UID_KEY);
  if (authUid && authUid.trim()) {
    const currentId = getPersistentItem(PLAYER_ID_KEY);
    if (currentId !== authUid) {
      setPersistentItem(PLAYER_ID_KEY, authUid);
    }
    return authUid;
  }

  const guestId = getGuestId();
  const currentId = getPersistentItem(PLAYER_ID_KEY);
  if (currentId !== guestId) {
    setPersistentItem(PLAYER_ID_KEY, guestId);
  }
  return guestId;
}

/**
 * Updates the persistent local player ID.
 * If the ID starts with 'usr_', updates the guest ID and clears any auth UID.
 * Otherwise, updates the authenticated UID.
 * Also synchronizes PLAYER_ID_KEY and notifies listeners.
 */
export function setLocalPlayerId(newPlayerId: string): void {
  if (!newPlayerId || !newPlayerId.trim()) return;
  const id = newPlayerId.trim();

  if (id.startsWith('usr_')) {
    setPersistentItem(GUEST_ID_KEY, id);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(AUTH_UID_KEY);
      }
    } catch {
      // ignore
    }
    setPersistentItem(AUTH_UID_KEY, '');
  } else {
    setPersistentItem(AUTH_UID_KEY, id);
  }

  setPersistentItem(PLAYER_ID_KEY, id);
  notifyIdentityChange();
}

/**
 * Sets the authenticated Firebase UID.
 * If the user is currently in an active room, queues the new UID until room exit
 * to prevent phantom seats and room disruption.
 */
export function setAuthenticatedUid(uid: string): void {
  if (!uid || !uid.trim()) return;

  if (isUserInRoom) {
    console.log(`[Identity] Player currently in room: queuing authenticated UID '${uid}' until room exit.`);
    pendingAuthenticatedUid = uid.trim();
    return;
  }

  pendingAuthenticatedUid = null;
  setPersistentItem(AUTH_UID_KEY, uid.trim());
  setPersistentItem(PLAYER_ID_KEY, uid.trim());
  notifyIdentityChange();
}

/**
 * Clears the authenticated UID on logout and restores the guest ID.
 */
export function clearAuthenticatedUid(): void {
  pendingAuthenticatedUid = null;
  try {
    localStorage.removeItem(AUTH_UID_KEY);
    // Also remove cookie if applicable by setting empty or overwriting
    setPersistentItem(AUTH_UID_KEY, '');
  } catch (e) {
    // ignore
  }
  const guestId = getGuestId();
  setPersistentItem(PLAYER_ID_KEY, guestId);
  notifyIdentityChange();
}

/**
 * Updates whether the player is currently in an active room.
 * When leaving a room (inRoom = false), automatically applies any queued authenticated UID.
 */
export function setInRoomStatus(inRoom: boolean): void {
  isUserInRoom = inRoom;
  if (!inRoom && pendingAuthenticatedUid) {
    console.log(`[Identity] Room exited: applying queued authenticated UID '${pendingAuthenticatedUid}'.`);
    const uid = pendingAuthenticatedUid;
    pendingAuthenticatedUid = null;
    setPersistentItem(AUTH_UID_KEY, uid);
    setPersistentItem(PLAYER_ID_KEY, uid);
    notifyIdentityChange();
  }
}

/**
 * Explicitly applies any pending identity switch.
 */
export function applyPendingIdentity(): void {
  if (pendingAuthenticatedUid) {
    const uid = pendingAuthenticatedUid;
    pendingAuthenticatedUid = null;
    setPersistentItem(AUTH_UID_KEY, uid);
    setPersistentItem(PLAYER_ID_KEY, uid);
    notifyIdentityChange();
  }
}

/**
 * Returns whether there is a queued identity switch waiting for room exit.
 */
export function hasPendingIdentity(): boolean {
  return pendingAuthenticatedUid !== null;
}
