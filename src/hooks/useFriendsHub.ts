import { useEffect, useMemo, useRef, useState } from 'react';
import type { FriendDocument, GameInvitation, LocalContact, MultiplayerRoom, UserPresence } from '../types';
import { FriendService } from '../services/friendService';
import { getPublicParamNumber } from '../services/publicConfig';
import { webSocketService } from '../services/websocketService';
import { triggerHaptic } from '../utils/sound';
import type { usePlayerProfile } from '../context/PlayerProfileContext';

export interface FriendsHubDeps {
  isOpen: boolean;
  /** Table où le joueur est assis : la liste de présence se rafraîchit quand elle change. */
  room: MultiplayerRoom | null;
  embedded?: 'FRIENDS' | 'ONLINE';
  initialFriendSubTab?: 'FRIENDS' | 'RECEIVED' | 'SENT';
  /** Onglet affiché par l'écran hôte : la présence des amis n'est interrogée que sur « Amis ». */
  activeTab: string;
  isLoggedIn: boolean;
  profile: ReturnType<typeof usePlayerProfile>['profile'];
  incomingInvitations: GameInvitation[];
  declineInvitation: (invitation: GameInvitation) => void;
  setHubSuccessMsg: (message: string | null) => void;
  setHubErrorMsg: (message: string | null) => void;
  setAuthRequirementReason: (reason: string) => void;
  setShowAuthRequirementModal: (open: boolean) => void;
  setShowAddFriendModal: (open: boolean) => void;
}

/**
 * État et actions des amis : liste (nuage et contacts locaux), demandes, recherche, présence, blocage.
 * Code déplacé tel quel depuis l'écran Multijoueur ; il sert maintenant Multijoueur comme la page Social.
 */
export function useFriendsHub(deps: FriendsHubDeps) {
  const {
    isOpen, room, embedded, initialFriendSubTab, activeTab, isLoggedIn, profile, incomingInvitations, declineInvitation,
    setHubSuccessMsg, setHubErrorMsg, setAuthRequirementReason, setShowAuthRequirementModal, setShowAddFriendModal,
  } = deps;

  const [localContacts, setLocalContacts] = useState<LocalContact[]>(() => FriendService.getLocalContacts());
  const [recentPlayers, setRecentPlayers] = useState<LocalContact[]>(() => FriendService.getRecentPlayers());
  const [cloudFriends, setCloudFriends] = useState<FriendDocument[]>([]);
  const [friendSubTab, setFriendSubTab] = useState<'FRIENDS' | 'ONLINE' | 'RECEIVED' | 'SENT'>(embedded === 'ONLINE' ? 'ONLINE' : initialFriendSubTab ?? 'FRIENDS');

  const [friendsPresenceMap, setFriendsPresenceMap] = useState<Record<string, UserPresence>>({});
  const [newFriendInput, setNewFriendInput] = useState<string>('');
  const [isSearchingFriends, setIsSearchingFriends] = useState<boolean>(false);
  const [friendSearchResults, setFriendSearchResults] = useState<
    Array<{ uid: string; displayName: string; avatarId?: string; friendCode: string; isGoogleUser: boolean }>
  >([]);
  const [friendActionPendingMap, setFriendActionPendingMap] = useState<Record<string, boolean>>({});
  const [friendAcceptedToast, setFriendAcceptedToast] = useState<{ name: string; avatarId?: string } | null>(null);
  const [selectedH2HOpponent, setSelectedH2HOpponent] = useState<{
    id: string;
    name: string;
    avatarId?: string;
    avatarSeed?: string;
    friendCode?: string;
  } | null>(null);
  const initialCloudFriendsLoadedRef = useRef<boolean>(false);
  const prevCloudFriendsRef = useRef<FriendDocument[]>([]);

  const acceptedFriends = useMemo(() => {
    if (isLoggedIn && cloudFriends.length > 0) {
      return cloudFriends.filter((f) => f.status === 'ACCEPTED');
    }
    return localContacts;
  }, [isLoggedIn, cloudFriends, localContacts]);

  const pendingReceivedRequests = useMemo(() => {
    return cloudFriends.filter((f) => f.status === 'PENDING_RECEIVED');
  }, [cloudFriends]);

  const pendingSentRequests = useMemo(() => {
    return cloudFriends.filter((f) => f.status === 'PENDING_SENT');
  }, [cloudFriends]);

  /** Identifiants des amis confirmés, pour les repérer dans la liste « En ligne ». */
  const onlineFriendIds = useMemo(
    () => new Set<string>(acceptedFriends.map((f: any) => f.friendUid || f.id).filter(Boolean)),
    [acceptedFriends]
  );


  // Contacts locaux, joueurs récents et présence des amis, à chaque ouverture ou changement de table.
  useEffect(() => {
    if (!isOpen) return;
    const unsubFriendsPresence = webSocketService.onFriendsPresence((presences) => {
      const map: Record<string, UserPresence> = {};
      presences.forEach((p) => {
        if (p.userId) map[p.userId] = p;
      });
      setFriendsPresenceMap((prev) => ({ ...prev, ...map }));
    });
    setLocalContacts(FriendService.getLocalContacts());
    setRecentPlayers(FriendService.getRecentPlayers());
    return () => {
      unsubFriendsPresence();
    };
  }, [isOpen, room]);

  // Periodically fetch real-time presence status of friends when on Social tab
  useEffect(() => {
    if (!isOpen || activeTab !== 'social') return;

    const pollFriendsPresence = () => {
      const friendIds = isLoggedIn
        ? acceptedFriends.map((f: any) => f.friendUid || f.id).filter(Boolean)
        : localContacts.map((c) => c.id).filter(Boolean);
      if (friendIds.length > 0) {
        webSocketService.getFriendsPresence(friendIds);
      }
    };

    pollFriendsPresence();
    const interval = setInterval(pollFriendsPresence, getPublicParamNumber('clientFriendsPollSeconds') * 1000);
    return () => clearInterval(interval);
  }, [isOpen, activeTab, acceptedFriends, localContacts, isLoggedIn]);

  // Real-time synchronization of Cloud Friends for authenticated users
  useEffect(() => {
    if (!isOpen || !isLoggedIn || !profile?.uid) {
      setCloudFriends([]);
      initialCloudFriendsLoadedRef.current = false;
      prevCloudFriendsRef.current = [];
      return;
    }
    const unsub = FriendService.subscribeCloudFriends(profile.uid, (friends) => {
      const newFriendsList = friends || [];
      
      // Check if a friend request was newly accepted in real-time
      if (initialCloudFriendsLoadedRef.current) {
        const prevAccepted = prevCloudFriendsRef.current.filter((f) => f.status === 'ACCEPTED');
        const newlyAccepted = newFriendsList.find(
          (curr) => curr.status === 'ACCEPTED' && !prevAccepted.some((p) => p.friendUid === curr.friendUid)
        );
        if (newlyAccepted) {
          setFriendAcceptedToast({
            name: newlyAccepted.displayName,
            avatarId: newlyAccepted.avatarId,
          });
          triggerHaptic('success');
          setTimeout(() => {
            setFriendAcceptedToast(null);
          }, getPublicParamNumber('uiFriendToastDurationMs'));
        }
      } else {
        initialCloudFriendsLoadedRef.current = true;
      }
      
      prevCloudFriendsRef.current = newFriendsList;
      setCloudFriends(newFriendsList);
      
      // Sync accepted friends into local contacts cache
      const accepted = newFriendsList.filter((f) => f.status === 'ACCEPTED');
      if (accepted.length > 0) {
        setLocalContacts((prev) => {
          const merged = [...prev];
          accepted.forEach((cf) => {
            const idx = merged.findIndex((m) => m.id === cf.friendUid);
            if (idx >= 0) {
              merged[idx] = {
                ...merged[idx],
                name: cf.displayName,
                avatarSeed: cf.avatarId,
                status: 'ACCEPTED',
                friendCode: cf.friendCode,
              };
            } else {
              merged.push({
                id: cf.friendUid,
                name: cf.displayName,
                avatarSeed: cf.avatarId,
                addedAt: cf.createdAt,
                status: 'ACCEPTED',
                friendCode: cf.friendCode,
              });
            }
          });
          return merged;
        });
      }
    });
    return () => unsub();
  }, [isOpen, isLoggedIn, profile?.uid]);

  const handleAcceptFriendRequest = async (request: FriendDocument) => {
    if (!profile?.uid) return;
    setFriendActionPendingMap((prev) => ({ ...prev, [request.friendUid]: true }));
    try {
      const ok = await FriendService.acceptCloudFriendRequest(
        profile.uid,
        request.friendUid,
        request.displayName,
        request.avatarId
      );
      if (ok) {
        setHubSuccessMsg(`Demande acceptée ! ${request.displayName} est désormais ton ami.`);
        triggerHaptic('success');
        setTimeout(() => setHubSuccessMsg(null), getPublicParamNumber('uiToastDurationMs'));
      } else {
        setHubErrorMsg("Impossible d'accepter la demande.");
      }
    } catch (e: any) {
      setHubErrorMsg(e?.message || "La demande n'a pas pu être acceptée. Réessaie.");
    } finally {
      setFriendActionPendingMap((prev) => ({ ...prev, [request.friendUid]: false }));
    }
  };

  const handleDeclineFriendRequest = async (request: FriendDocument) => {
    if (!profile?.uid) return;
    setFriendActionPendingMap((prev) => ({ ...prev, [request.friendUid]: true }));
    try {
      const ok = await FriendService.declineCloudFriendRequest(profile.uid, request.friendUid);
      if (ok) {
        setHubSuccessMsg(`Demande de ${request.displayName} déclinée.`);
        triggerHaptic('light');
        setTimeout(() => setHubSuccessMsg(null), getPublicParamNumber('uiToastDurationMs'));
      }
    } catch (e: any) {
      console.error('Error declining friend request:', e);
    } finally {
      setFriendActionPendingMap((prev) => ({ ...prev, [request.friendUid]: false }));
    }
  };

  const handleCancelSentRequest = async (request: FriendDocument) => {
    if (!profile?.uid) return;
    setFriendActionPendingMap((prev) => ({ ...prev, [request.friendUid]: true }));
    try {
      const ok = await FriendService.removeCloudFriend(profile.uid, request.friendUid);
      if (ok) {
        setHubSuccessMsg(`Demande envoyée à ${request.displayName} annulée.`);
        triggerHaptic('light');
        setTimeout(() => setHubSuccessMsg(null), getPublicParamNumber('uiToastDurationMs'));
      }
    } catch (e: any) {
      console.error('Error canceling sent request:', e);
    } finally {
      setFriendActionPendingMap((prev) => ({ ...prev, [request.friendUid]: false }));
    }
  };

  const handleRemoveFriend = async (friendId: string, friendName: string) => {
    if (profile?.uid) {
      await FriendService.removeCloudFriend(profile.uid, friendId);
    } else {
      FriendService.removeLocalContact(friendId);
      setLocalContacts(FriendService.getLocalContacts());
    }
    setHubSuccessMsg(`${friendName} a été retiré de ta liste d'amis.`);
    triggerHaptic('light');
    setTimeout(() => setHubSuccessMsg(null), getPublicParamNumber('uiToastDurationMs'));
  };

  const handleBlockPlayer = async (targetUid: string, displayName?: string, friendCode?: string) => {
    if (!targetUid) return;
    setFriendActionPendingMap((prev) => ({ ...prev, [targetUid]: true }));
    try {
      await FriendService.blockPlayer(targetUid, displayName, friendCode);

      // Clean up search results
      setFriendSearchResults((prev) => prev.filter((p) => p.uid !== targetUid));

      // Clean up incoming invitations from this user
      incomingInvitations
        .filter((inv) => inv.fromUserId === targetUid)
        .forEach((inv) => declineInvitation(inv));

      setHubSuccessMsg(`Joueur ${displayName || ''} bloqué.`);
      triggerHaptic('heavy');
      setTimeout(() => setHubSuccessMsg(null), getPublicParamNumber('uiToastDurationMs'));
    } catch (e: any) {
      console.error('Error blocking player:', e);
      setHubErrorMsg('Le joueur n\'a pas pu être bloqué. Réessaie.');
    } finally {
      setFriendActionPendingMap((prev) => ({ ...prev, [targetUid]: false }));
    }
  };

  const handleSearchFriend = async (val: string) => {
    setNewFriendInput(val);
    const trimmed = val.trim();
    if (!trimmed) {
      setFriendSearchResults([]);
      return;
    }
    setIsSearchingFriends(true);
    try {
      const results = await FriendService.searchPlayer(trimmed, profile?.uid);
      setFriendSearchResults(results);
    } catch (e) {
      console.error('Search friends error:', e);
    } finally {
      setIsSearchingFriends(false);
    }
  };

  const handleSendFriendRequest = async (target: {
    uid: string;
    displayName: string;
    avatarId?: string;
    friendCode?: string;
  }) => {
    if (!isLoggedIn || !profile?.uid) {
      setAuthRequirementReason(
        "Connecte-toi avec Google pour envoyer une demande d'ami."
      );
      setShowAuthRequirementModal(true);
      return;
    }

    setFriendActionPendingMap((prev) => ({ ...prev, [target.uid]: true }));
    try {
      const res = await FriendService.sendCloudFriendRequest(profile.uid, target);
      if (res.success) {
        setHubSuccessMsg(res.message);
        triggerHaptic('success');
        setTimeout(() => setHubSuccessMsg(null), getPublicParamNumber('uiToastLongDurationMs'));
        // Refresh search results to reflect pending status
        handleSearchFriend(newFriendInput);
      } else {
        setHubErrorMsg(res.message);
        triggerHaptic('heavy');
        setTimeout(() => setHubErrorMsg(null), getPublicParamNumber('uiToastLongDurationMs'));
      }
    } catch (e: any) {
      setHubErrorMsg(e?.message || "La demande n'a pas pu être envoyée. Réessaie.");
    } finally {
      setFriendActionPendingMap((prev) => ({ ...prev, [target.uid]: false }));
    }
  };

  const handleAddFriendLegacyFallback = () => {
    const raw = newFriendInput.trim();
    if (!raw) return;

    // Clean display name: if user typed a raw code, display as custom nickname, not fake ID
    let friendName = raw.startsWith('#NK-') ? `Contact ${raw.replace('#NK-', '')}` : raw;
    const friendId = 'usr_' + Math.random().toString(36).substring(2, 9);

    FriendService.addLocalContact({
      id: friendId,
      name: friendName,
      avatarSeed: 'avatar_' + Math.floor(1 + Math.random() * 8),
    });

    setLocalContacts(FriendService.getLocalContacts());
    setNewFriendInput('');
    setShowAddFriendModal(false);
    setHubSuccessMsg('Contact ajouté sur cet appareil.');
    triggerHaptic('success');
    setTimeout(() => setHubSuccessMsg(null), getPublicParamNumber('uiToastDurationMs'));
  };


  return {
    localContacts, setLocalContacts, recentPlayers, setRecentPlayers, cloudFriends,
    friendSubTab, setFriendSubTab, friendsPresenceMap,
    newFriendInput, setNewFriendInput, isSearchingFriends, friendSearchResults, setFriendSearchResults,
    friendActionPendingMap, setFriendActionPendingMap, friendAcceptedToast, setFriendAcceptedToast,
    selectedH2HOpponent, setSelectedH2HOpponent,
    acceptedFriends, pendingReceivedRequests, pendingSentRequests, onlineFriendIds,
    handleAcceptFriendRequest, handleDeclineFriendRequest, handleCancelSentRequest, handleRemoveFriend,
    handleBlockPlayer, handleSearchFriend, handleSendFriendRequest, handleAddFriendLegacyFallback,
  };
}
