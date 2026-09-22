import { LocalContact, FriendDocument, FriendStatus, GameInvitation, UserPresence, PublicRoomSummary } from '../types';
import { db, auth } from '../lib/firebase';
import { getPlayerId } from './identity';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
} from 'firebase/firestore';

const LOCAL_CONTACTS_KEY = 'njambo_local_contacts_v1';
const RECENT_PLAYERS_KEY = 'njambo_recent_players_v1';
const BLOCKED_PLAYERS_KEY = 'njambo_blocked_players_v1';
const BLOCKED_PLAYERS_DETAILS_KEY = 'njambo_blocked_players_details_v1';

export interface BlockedPlayerRecord {
  uid: string;
  displayName: string;
  friendCode: string;
  blockedAt: number;
}

export class FriendService {
  /**
   * Generates a legacy hash code for backward compatibility
   */
  public static getLegacyHashFriendCode(userId: string): string {
    if (!userId) return '#NK-100';
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = (hash << 5) - hash + userId.charCodeAt(i);
      hash |= 0;
    }
    const cleanNum = Math.abs(hash) % 900 + 100; // 100 to 999
    return `#NK-${cleanNum}`;
  }

  /**
   * Generates a random 6-character uppercase alphanumeric Friend Code (e.g. #NK-K7B2X9)
   */
  public static async generateUniqueFriendCode(): Promise<string> {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let attempts = 0;
    while (attempts < 20) {
      attempts++;
      let code = '#NK-';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      if (db) {
        try {
          const q = query(collection(db, 'users'), where('friendCode', '==', code), limit(1));
          const snap = await getDocs(q);
          if (snap.empty) {
            return code;
          }
        } catch {
          return code;
        }
      } else {
        return code;
      }
    }
    return `#NK-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  }

  /**
   * Synchronous getter for Friend Code (uses stored friendCode if available, otherwise legacy hash)
   */
  public static getFriendCode(userId: string, storedCode?: string): string {
    if (storedCode && storedCode.trim()) return storedCode.trim();
    if (!userId) return '#NK-100000';
    return this.getLegacyHashFriendCode(userId);
  }

  /**
   * Ensures that a user profile in Firestore has a unique stored friendCode.
   * Auto-migrates existing profiles without a friendCode.
   */
  public static async ensureUserFriendCode(userId: string, existingProfileData?: any): Promise<string> {
    if (!userId || userId.startsWith('usr_') || userId.startsWith('bot_')) {
      return existingProfileData?.friendCode || this.getLegacyHashFriendCode(userId);
    }
    if (existingProfileData?.friendCode && typeof existingProfileData.friendCode === 'string' && existingProfileData.friendCode.trim().length > 0) {
      return existingProfileData.friendCode.trim();
    }
    if (!db) {
      return this.getLegacyHashFriendCode(userId);
    }
    try {
      const userRef = doc(db, 'users', userId);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data.friendCode && typeof data.friendCode === 'string' && data.friendCode.trim().length > 0) {
          return data.friendCode.trim();
        }
      }
      // Generate and save unique friendCode
      const newCode = await this.generateUniqueFriendCode();
      await setDoc(userRef, { friendCode: newCode }, { merge: true });
      return newCode;
    } catch (err) {
      console.warn('[FriendService] ensureUserFriendCode error:', err);
      return this.getLegacyHashFriendCode(userId);
    }
  }

  // ==========================================
  // LOCAL CONTACTS (GUEST MODE)
  // ==========================================

  public static getLocalContacts(): LocalContact[] {
    try {
      const raw = localStorage.getItem(LOCAL_CONTACTS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  public static saveLocalContacts(contacts: LocalContact[]): void {
    try {
      // Limit to 30 contacts in guest mode
      const trimmed = contacts.slice(0, 30);
      localStorage.setItem(LOCAL_CONTACTS_KEY, JSON.stringify(trimmed));
    } catch (e) {
      console.error('Failed to save local contacts:', e);
    }
  }

  public static addLocalContact(contact: Omit<LocalContact, 'addedAt'>): LocalContact {
    const localId = getPlayerId();
    const localName = (localStorage.getItem('njambo_player_name') || '').trim().toLowerCase();

    // Prevent adding self
    if (contact.id && (contact.id === localId || (localName && contact.name.trim().toLowerCase() === localName))) {
      return { ...contact, addedAt: Date.now() };
    }

    const contacts = this.getLocalContacts();
    const existingIdx = contacts.findIndex(
      (c) => c.id === contact.id || (c.name.toLowerCase() === contact.name.toLowerCase() && c.name.length > 2)
    );

    const newContact: LocalContact = {
      ...contact,
      addedAt: Date.now(),
    };

    if (existingIdx >= 0) {
      contacts[existingIdx] = { ...contacts[existingIdx], ...newContact };
    } else {
      contacts.unshift(newContact);
    }

    this.saveLocalContacts(contacts);
    return newContact;
  }

  public static removeLocalContact(contactId: string): void {
    const contacts = this.getLocalContacts().filter((c) => c.id !== contactId);
    this.saveLocalContacts(contacts);
  }

  public static toggleFavoriteLocalContact(contactId: string): void {
    const contacts = this.getLocalContacts().map((c) => {
      if (c.id === contactId) {
        return { ...c, isFavorite: !c.isFavorite };
      }
      return c;
    });
    this.saveLocalContacts(contacts);
  }

  // ==========================================
  // RECENT PLAYERS (LAST 10 ADVERSARIES)
  // ==========================================

  public static getRecentPlayers(): LocalContact[] {
    try {
      const raw = localStorage.getItem(RECENT_PLAYERS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      const localId = getPlayerId();
      const localName = (localStorage.getItem('njambo_player_name') || '').trim().toLowerCase();
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

      // Filter out local player, expired entries (>30 days), and bots/katika
      const valid = parsed.filter((p: LocalContact) => {
        if (!p || !p.id || !p.name) return false;
        if (p.id === localId) return false;
        if (localName && p.name.trim().toLowerCase() === localName) return false;
        if (p.name.toLowerCase() === 'katika' || p.id.startsWith('bot_')) return false;
        const lastActivity = p.lastPlayedAt || p.addedAt || 0;
        if (lastActivity && lastActivity < thirtyDaysAgo) return false;
        return true;
      });

      return valid.slice(0, 10);
    } catch {
      return [];
    }
  }

  public static addRecentPlayer(player: { id: string; name: string; avatarSeed?: string }, currentLocalPlayerId?: string): void {
    if (!player.name || !player.id) return;
    const nameTrimmed = player.name.trim();
    if (!nameTrimmed || nameTrimmed.toLowerCase() === 'katika' || player.id.startsWith('bot_')) return;

    const localId = currentLocalPlayerId || getPlayerId();
    const localName = (localStorage.getItem('njambo_player_name') || '').trim().toLowerCase();

    // Strict Self-Exclusion: local player must never be added to recent opponents
    if (player.id === localId) return;
    if (localName && nameTrimmed.toLowerCase() === localName) return;

    try {
      const currentRecents = this.getRecentPlayers();
      const normName = nameTrimmed.toLowerCase();

      // Bi-key deduplication: match by ID OR normalized display name
      const existingIdx = currentRecents.findIndex(
        (p) => p.id === player.id || (p.normalizedName ? p.normalizedName === normName : p.name.trim().toLowerCase() === normName)
      );

      const updatedEntry: LocalContact = {
        id: player.id,
        name: nameTrimmed,
        normalizedName: normName,
        avatarSeed: player.avatarSeed || 'avatar_1',
        addedAt: existingIdx >= 0 ? (currentRecents[existingIdx].addedAt || Date.now()) : Date.now(),
        lastPlayedAt: Date.now(),
      };

      if (existingIdx >= 0) {
        currentRecents.splice(existingIdx, 1);
      }
      currentRecents.unshift(updatedEntry);

      localStorage.setItem(RECENT_PLAYERS_KEY, JSON.stringify(currentRecents.slice(0, 10)));
    } catch (e) {
      console.error('Failed to add recent player:', e);
    }
  }

  public static clearRecentPlayers(): void {
    try {
      localStorage.removeItem(RECENT_PLAYERS_KEY);
    } catch (e) {
      console.error('Failed to clear recent players:', e);
    }
  }

  // ==========================================
  // BLOCKED PLAYERS
  // ==========================================

  public static getBlockedPlayerIds(): string[] {
    try {
      const raw = localStorage.getItem(BLOCKED_PLAYERS_KEY);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  public static getBlockedPlayersDetailsLocal(): BlockedPlayerRecord[] {
    try {
      const raw = localStorage.getItem(BLOCKED_PLAYERS_DETAILS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // Fallback
    }
    return [];
  }

  public static async blockPlayer(
    targetPlayerId: string,
    targetDisplayName?: string,
    targetFriendCode?: string
  ): Promise<void> {
    if (!targetPlayerId) return;

    // 1. Update local ID list
    const blocked = this.getBlockedPlayerIds();
    if (!blocked.includes(targetPlayerId)) {
      blocked.push(targetPlayerId);
      localStorage.setItem(BLOCKED_PLAYERS_KEY, JSON.stringify(blocked));
    }

    // 2. Update local details list
    const details = this.getBlockedPlayersDetailsLocal();
    if (!details.some((d) => d.uid === targetPlayerId)) {
      const code = targetFriendCode || this.getFriendCode(targetPlayerId);
      details.push({
        uid: targetPlayerId,
        displayName: targetDisplayName || 'Joueur',
        friendCode: code,
        blockedAt: Date.now(),
      });
      localStorage.setItem(BLOCKED_PLAYERS_DETAILS_KEY, JSON.stringify(details));
    }

    // 3. Remove local contact & recent player if present
    this.removeLocalContact(targetPlayerId);

    // 4. Sync to Firestore if authenticated/db available
    const uid = auth.currentUser?.uid || getPlayerId();
    if (uid && db) {
      try {
        const docRef = doc(db, 'blocked_players', uid);
        await setDoc(
          docRef,
          {
            blockedUserIds: blocked,
            blockedDetails: details,
            updatedAt: Date.now(),
          },
          { merge: true }
        );
      } catch (err) {
        console.error('Failed to sync blockPlayer to Firestore:', err);
      }

      // 5. Remove any existing cloud friendship
      try {
        await this.removeCloudFriend(uid, targetPlayerId);
      } catch (e) {
        console.warn('Error removing cloud friend on block:', e);
      }
    }
  }

  public static async unblockPlayer(targetPlayerId: string): Promise<void> {
    if (!targetPlayerId) return;

    const blocked = this.getBlockedPlayerIds().filter((id) => id !== targetPlayerId);
    localStorage.setItem(BLOCKED_PLAYERS_KEY, JSON.stringify(blocked));

    const details = this.getBlockedPlayersDetailsLocal().filter((d) => d.uid !== targetPlayerId);
    localStorage.setItem(BLOCKED_PLAYERS_DETAILS_KEY, JSON.stringify(details));

    const uid = auth.currentUser?.uid || getPlayerId();
    if (uid && db) {
      try {
        const docRef = doc(db, 'blocked_players', uid);
        await setDoc(
          docRef,
          {
            blockedUserIds: blocked,
            blockedDetails: details,
            updatedAt: Date.now(),
          },
          { merge: true }
        );
      } catch (err) {
        console.error('Failed to sync unblockPlayer to Firestore:', err);
      }
    }
  }

  public static async fetchCloudBlockedPlayers(userId: string): Promise<BlockedPlayerRecord[]> {
    if (!userId || !db) return this.getBlockedPlayersWithDetails(userId);
    try {
      const docRef = doc(db, 'blocked_players', userId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        const cloudIds = (data?.blockedUserIds as string[]) || [];
        const cloudDetails = (data?.blockedDetails as BlockedPlayerRecord[]) || [];

        localStorage.setItem(BLOCKED_PLAYERS_KEY, JSON.stringify(cloudIds));

        const resultDetails: BlockedPlayerRecord[] = [...cloudDetails];

        // Ensure every blocked ID has a details entry
        for (const bUid of cloudIds) {
          if (!resultDetails.some((d) => d.uid === bUid)) {
            let fetchedName = 'Joueur';
            let fetchedCode = this.getLegacyHashFriendCode(bUid);
            try {
              const uSnap = await getDoc(doc(db, 'users', bUid));
              if (uSnap.exists()) {
                const uData = uSnap.data();
                fetchedName = uData.displayName || fetchedName;
                fetchedCode = uData.friendCode || fetchedCode;
              }
            } catch {
              // Ignore fallback
            }
            resultDetails.push({
              uid: bUid,
              displayName: fetchedName,
              friendCode: fetchedCode,
              blockedAt: Date.now(),
            });
          }
        }

        localStorage.setItem(BLOCKED_PLAYERS_DETAILS_KEY, JSON.stringify(resultDetails));
        return resultDetails;
      }
    } catch (e) {
      console.error('Failed to fetch cloud blocked players:', e);
    }
    return this.getBlockedPlayersWithDetails(userId);
  }

  public static getBlockedPlayersWithDetails(userId?: string): BlockedPlayerRecord[] {
    const details = this.getBlockedPlayersDetailsLocal();
    const ids = this.getBlockedPlayerIds();

    return ids.map((id) => {
      const found = details.find((d) => d.uid === id);
      if (found) return found;
      return {
        uid: id,
        displayName: 'Joueur',
        friendCode: this.getFriendCode(id),
        blockedAt: Date.now(),
      };
    });
  }

  public static isPlayerBlocked(playerId: string): boolean {
    if (!playerId) return false;
    return this.getBlockedPlayerIds().includes(playerId);
  }

  // ==========================================
  // WHATSAPP & SHARE LINK GENERATORS
  // ==========================================

  public static getShareInviteUrl(roomCode: string, fromPlayerId?: string): string {
    const base = `${window.location.origin}${window.location.pathname}`;
    const params = new URLSearchParams();
    if (roomCode) {
      params.set('join', roomCode.trim().toUpperCase());
    }
    if (fromPlayerId) {
      params.set('from', fromPlayerId);
    }
    return `${base}?${params.toString()}`;
  }

  public static getWhatsAppShareUrl(
    roomCode: string,
    fromPlayerName: string,
    options?: { baseBet?: number; fillWithBots?: boolean }
  ): string {
    const cleanCode = roomCode.trim().toUpperCase();
    const inviteUrl = this.getShareInviteUrl(cleanCode);
    const line1 = `🃏 Rejoins ma table de Njambo Kora ! (${fromPlayerName})`;
    const line2 = inviteUrl;
    const details = [
      `Table #${cleanCode}`,
      options?.baseBet !== undefined ? `Mise : ${options.baseBet}🪙` : null,
      options?.fillWithBots !== undefined
        ? options.fillWithBots
          ? '🤖 Mode Mixte'
          : '👥 100% Humains'
        : null,
    ]
      .filter(Boolean)
      .join(' · ');

    const message = `${line1}\n${line2}\n${details}`;
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }

  // ==========================================
  // CLOUD FIRESTORE SYNC & MERGE (WHEN LOGGED IN)
  // ==========================================

  public static async mergeLocalContactsToCloud(userId: string): Promise<void> {
    if (!userId || !db) return;
    try {
      const localContacts = this.getLocalContacts();
      if (localContacts.length === 0) return;

      const friendsRef = collection(db, 'users', userId, 'friends');
      for (const contact of localContacts) {
        if (!this.isPlayerBlocked(contact.id) && contact.id !== userId) {
          const friendDocRef = doc(friendsRef, contact.id);
          const existingSnap = await getDoc(friendDocRef);
          if (!existingSnap.exists()) {
            await setDoc(
              friendDocRef,
              {
                friendUid: contact.id,
                displayName: contact.name,
                avatarId: contact.avatarSeed || 'avatar_1',
                status: contact.status || 'ACCEPTED',
                friendCode: this.getFriendCode(contact.id),
                createdAt: contact.addedAt || Date.now(),
                updatedAt: Date.now(),
              },
              { merge: true }
            );
          }
        }
      }
    } catch (e) {
      console.error('Failed to merge local contacts to cloud:', e);
    }
  }

  public static async fetchCloudFriends(userId: string): Promise<FriendDocument[]> {
    if (!userId || !db) return [];
    try {
      const friendsRef = collection(db, 'users', userId, 'friends');
      const snap = await getDocs(friendsRef);
      const friends: FriendDocument[] = [];
      snap.forEach((d) => {
        const data = d.data();
        friends.push({
          friendUid: data.friendUid || d.id,
          displayName: data.displayName || 'Joueur',
          avatarId: data.avatarId || 'avatar_1',
          status: data.status || 'ACCEPTED',
          createdAt: data.createdAt || Date.now(),
          updatedAt: data.updatedAt || Date.now(),
          friendCode: data.friendCode || this.getFriendCode(data.friendUid || d.id),
        });
      });
      return friends;
    } catch (e) {
      console.error('Failed to fetch cloud friends:', e);
      return [];
    }
  }

  /**
   * Retrieves friendship status between current user and a target player
   */
  public static async getFriendRelationship(
    userId: string,
    targetUid: string
  ): Promise<'NONE' | 'ACCEPTED' | 'PENDING_SENT' | 'PENDING_RECEIVED'> {
    if (!userId || !targetUid || userId === targetUid || !db) return 'NONE';
    try {
      const myDocRef = doc(db, 'users', userId, 'friends', targetUid);
      const snap = await getDoc(myDocRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data.status === 'ACCEPTED') return 'ACCEPTED';
        if (data.status === 'PENDING_SENT') return 'PENDING_SENT';
        if (data.status === 'PENDING_RECEIVED') return 'PENDING_RECEIVED';
      }
      return 'NONE';
    } catch {
      return 'NONE';
    }
  }

  /**
   * Bilateral friend request handler:
   * - Checks cross-requests: If target already requested current user, auto-accepts immediately!
   * - Otherwise creates PENDING_SENT for sender and PENDING_RECEIVED for recipient
   */
  public static async sendCloudFriendRequest(
    userId: string,
    targetFriend: { uid: string; displayName: string; avatarId?: string }
  ): Promise<{ success: boolean; status: FriendStatus; message: string }> {
    if (!userId || !db) {
      return { success: false, status: 'BLOCKED', message: 'Connexion Google requise pour envoyer une demande.' };
    }
    if (!targetFriend.uid || targetFriend.uid === userId) {
      return { success: false, status: 'BLOCKED', message: 'Impossible de vous ajouter vous-même en ami.' };
    }

    try {
      const myRef = doc(db, 'users', userId, 'friends', targetFriend.uid);
      const targetRef = doc(db, 'users', targetFriend.uid, 'friends', userId);

      // Check existing status in current user's document
      const myDocSnap = await getDoc(myRef);
      const myDocData = myDocSnap.exists() ? myDocSnap.data() : null;

      if (myDocData?.status === 'ACCEPTED') {
        return { success: true, status: 'ACCEPTED', message: 'Vous êtes déjà amis avec ce joueur !' };
      }

      const myProfileName = localStorage.getItem('njambo_player_name') || 'Joueur';
      const myAvatarSeed = localStorage.getItem('njambo_avatar_seed') || 'avatar_1';

      // Cross-request check: If target had sent a request to me (I have PENDING_RECEIVED or target has PENDING_SENT)
      if (myDocData?.status === 'PENDING_RECEIVED') {
        // Auto-resolve cross-request: instant mutual acceptance!
        const now = Date.now();
        await setDoc(
          myRef,
          {
            friendUid: targetFriend.uid,
            displayName: targetFriend.displayName,
            avatarId: targetFriend.avatarId || 'avatar_1',
            friendCode: this.getFriendCode(targetFriend.uid),
            status: 'ACCEPTED',
            updatedAt: now,
          },
          { merge: true }
        );

        await setDoc(
          targetRef,
          {
            friendUid: userId,
            displayName: myProfileName,
            avatarId: myAvatarSeed,
            friendCode: this.getFriendCode(userId),
            status: 'ACCEPTED',
            updatedAt: now,
          },
          { merge: true }
        );

        // Update local cache
        this.addLocalContact({
          id: targetFriend.uid,
          name: targetFriend.displayName,
          avatarSeed: targetFriend.avatarId || 'avatar_1',
          status: 'ACCEPTED',
          friendCode: this.getFriendCode(targetFriend.uid),
        });

        return {
          success: true,
          status: 'ACCEPTED',
          message: `Demande croisée validée ! ${targetFriend.displayName} et vous êtes désormais amis.`,
        };
      }

      if (myDocData?.status === 'PENDING_SENT') {
        return { success: true, status: 'PENDING_SENT', message: 'Demande déjà envoyée en attente de réponse.' };
      }

      // Standard friend request dispatch
      const now = Date.now();
      await setDoc(
        myRef,
        {
          friendUid: targetFriend.uid,
          displayName: targetFriend.displayName,
          avatarId: targetFriend.avatarId || 'avatar_1',
          friendCode: this.getFriendCode(targetFriend.uid),
          status: 'PENDING_SENT',
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );

      await setDoc(
        targetRef,
        {
          friendUid: userId,
          displayName: myProfileName,
          avatarId: myAvatarSeed,
          friendCode: this.getFriendCode(userId),
          status: 'PENDING_RECEIVED',
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );

      return {
        success: true,
        status: 'PENDING_SENT',
        message: `Demande d'ami envoyée à ${targetFriend.displayName} !`,
      };
    } catch (e: any) {
      console.error('[FriendService] sendCloudFriendRequest error:', e);
      return { success: false, status: 'BLOCKED', message: e?.message || 'Erreur lors de l\'envoi de la demande.' };
    }
  }

  /**
   * Accepts a received friend request
   */
  public static async acceptCloudFriendRequest(
    userId: string,
    friendUid: string,
    friendDisplayName?: string,
    friendAvatarId?: string
  ): Promise<boolean> {
    if (!userId || !friendUid || !db) return false;
    try {
      const myRef = doc(db, 'users', userId, 'friends', friendUid);
      const friendRef = doc(db, 'users', friendUid, 'friends', userId);
      const now = Date.now();

      await setDoc(
        myRef,
        {
          status: 'ACCEPTED',
          updatedAt: now,
          ...(friendDisplayName ? { displayName: friendDisplayName } : {}),
          ...(friendAvatarId ? { avatarId: friendAvatarId } : {}),
        },
        { merge: true }
      );

      await setDoc(
        friendRef,
        {
          status: 'ACCEPTED',
          updatedAt: now,
        },
        { merge: true }
      );

      // Cache locally
      if (friendDisplayName) {
        this.addLocalContact({
          id: friendUid,
          name: friendDisplayName,
          avatarSeed: friendAvatarId || 'avatar_1',
          status: 'ACCEPTED',
          friendCode: this.getFriendCode(friendUid),
        });
      }

      return true;
    } catch (e) {
      console.error('[FriendService] acceptCloudFriendRequest error:', e);
      return false;
    }
  }

  /**
   * Declines a friend request (deletes records so either can request again later)
   */
  public static async declineCloudFriendRequest(userId: string, friendUid: string): Promise<boolean> {
    if (!userId || !friendUid || !db) return false;
    try {
      await deleteDoc(doc(db, 'users', userId, 'friends', friendUid));
      // Also clean recipient's pending sent reference if present
      await deleteDoc(doc(db, 'users', friendUid, 'friends', userId)).catch(() => {});
      return true;
    } catch (e) {
      console.error('[FriendService] declineCloudFriendRequest error:', e);
      return false;
    }
  }

  /**
   * Removes an existing friend
   */
  public static async removeCloudFriend(userId: string, friendUid: string): Promise<boolean> {
    if (!userId || !friendUid || !db) return false;
    try {
      await deleteDoc(doc(db, 'users', userId, 'friends', friendUid));
      await deleteDoc(doc(db, 'users', friendUid, 'friends', userId)).catch(() => {});
      this.removeLocalContact(friendUid);
      return true;
    } catch (e) {
      console.error('[FriendService] removeCloudFriend error:', e);
      return false;
    }
  }

  /**
   * Real-time subscription to cloud friends subcollection
   */
  public static subscribeCloudFriends(
    userId: string,
    onUpdate: (friends: FriendDocument[]) => void
  ): () => void {
    if (!userId || !db) return () => {};
    try {
      const friendsRef = collection(db, 'users', userId, 'friends');
      const unsubscribe = onSnapshot(
        friendsRef,
        (snap) => {
          const friends: FriendDocument[] = [];
          snap.forEach((d) => {
            const data = d.data();
            const fUid = data.friendUid || d.id;
            if (this.isPlayerBlocked(fUid)) return;
            friends.push({
              friendUid: fUid,
              displayName: data.displayName || 'Joueur',
              avatarId: data.avatarId || 'avatar_1',
              status: data.status || 'ACCEPTED',
              createdAt: data.createdAt || Date.now(),
              updatedAt: data.updatedAt || Date.now(),
              friendCode: data.friendCode || this.getFriendCode(fUid),
            });
          });
          onUpdate(friends);
        },
        (err) => {
          console.warn('[FriendService] Cloud friends subscription error:', err);
        }
      );
      return unsubscribe;
    } catch (e) {
      console.warn('[FriendService] Could not establish friends listener:', e);
      return () => {};
    }
  }

  /**
   * Searches for a user by stored unique friend code (#NK-XXXXXX or NK-XXXXXX)
   * or legacy hash code (#NK-XXX) for backward compatibility during transition, or display name.
   */
  public static async searchPlayer(
    queryStr: string,
    currentUserId?: string
  ): Promise<Array<{ uid: string; displayName: string; avatarId?: string; friendCode: string; isGoogleUser: boolean }>> {
    if (!queryStr || !queryStr.trim()) return [];
    const cleaned = queryStr.trim();
    const cleanedUpper = cleaned.toUpperCase();
    const cleanedNorm = cleanedUpper.replace('#', '');
    const results: Array<{ uid: string; displayName: string; avatarId?: string; friendCode: string; isGoogleUser: boolean }> = [];

    // Search cloud users with targeted queries
    if (db) {
      try {
        const usersRef = collection(db, 'users');
        const matchedDocs = new Map<string, any>();

        // 1. Targeted query by unique friendCode
        const codeQuery = query(usersRef, where('friendCode', '==', '#' + cleanedNorm), limit(10));
        const codeSnap = await getDocs(codeQuery);
        codeSnap.forEach((d) => matchedDocs.set(d.id, d.data()));

        const rawCodeQuery = query(usersRef, where('friendCode', '==', cleanedNorm), limit(10));
        const rawCodeSnap = await getDocs(rawCodeQuery);
        rawCodeSnap.forEach((d) => matchedDocs.set(d.id, d.data()));

        // 2. Prefix query by displayName
        const nameQuery = query(
          usersRef,
          where('displayName', '>=', cleaned),
          where('displayName', '<=', cleaned + '\uf8ff'),
          limit(20)
        );
        const nameSnap = await getDocs(nameQuery);
        nameSnap.forEach((d) => matchedDocs.set(d.id, d.data()));

        for (const [uid, data] of matchedDocs.entries()) {
          if ((currentUserId && uid === currentUserId) || this.isPlayerBlocked(uid)) continue;

          let storedCode = typeof data.friendCode === 'string' ? data.friendCode.trim() : '';

          // Auto-migration: if user profile has no stored friendCode, generate and persist one!
          if (!storedCode) {
            storedCode = await this.ensureUserFriendCode(uid, data);
          }

          const legacyHash = this.getLegacyHashFriendCode(uid);
          const name = data.displayName || 'Joueur';

          if (!results.some((r) => r.uid === uid)) {
            results.push({
              uid,
              displayName: name,
              avatarId: data.avatarId || 'avatar_1',
              friendCode: storedCode || legacyHash,
              isGoogleUser: true,
            });
          }
        }
      } catch (err) {
        console.warn('[FriendService] Search user query error:', err);
      }
    }

    // Search local contacts/recents
    const locals = [...this.getLocalContacts(), ...this.getRecentPlayers()];
    locals.forEach((c) => {
      if ((currentUserId && c.id === currentUserId) || this.isPlayerBlocked(c.id)) return;
      const code = c.friendCode || this.getFriendCode(c.id);
      const legacyHash = this.getLegacyHashFriendCode(c.id);

      const matchName = c.name.toLowerCase().includes(cleaned.toLowerCase());
      const matchStoredCode = code.toUpperCase() === cleanedUpper ||
        code.toUpperCase().replace('#', '') === cleanedNorm;
      const matchLegacyCode = legacyHash.toUpperCase() === cleanedUpper ||
        legacyHash.toUpperCase().replace('#', '') === cleanedNorm;

      if (matchName || matchStoredCode || matchLegacyCode) {
        if (!results.some((r) => r.uid === c.id)) {
          results.push({
            uid: c.id,
            displayName: c.name,
            avatarId: c.avatarSeed,
            friendCode: code,
            isGoogleUser: !c.id.startsWith('usr_'),
          });
        }
      }
    });

    return results;
  }
}
