import type { PresenceStatus, UserPresence, MultiplayerRoom } from '../types';
import { FriendService } from '../services/friendService';
import { getPublicParamNumber } from '../services/publicConfig';
import { webSocketService } from '../services/websocketService';
import type { OnlinePlayer } from '../services/websocketService';
import { triggerHaptic } from '../utils/sound';
import type { MultiplayerScreenProps } from '../components/multiplayer/MultiplayerScreen';

export interface FriendChallengeDeps {
  isLoggedIn: boolean;
  room: MultiplayerRoom | null;
  playerName: string;
  onCreateRoom: MultiplayerScreenProps['onCreateRoom'];
  friendsPresenceMap: Record<string, UserPresence>;
  setIsLoading: (loading: boolean) => void;
  setHubSuccessMsg: (message: string | null) => void;
  setHubErrorMsg: (message: string | null) => void;
  setAuthRequirementReason: (reason: string) => void;
  setShowAuthRequirementModal: (open: boolean) => void;
  setActiveGameConflict: (
    conflict: { activeRoomCode: string; message?: string; onConfirmLeaveAndProceed: () => Promise<void> } | null
  ) => void;
}

/**
 * Inviter un joueur, défier un ami (table privée), ou le prévenir par WhatsApp.
 * Code déplacé tel quel depuis l'écran Multijoueur ; il sert Multijoueur comme la page Social.
 */
export function useFriendChallenges(deps: FriendChallengeDeps) {
  const {
    isLoggedIn, room, playerName, onCreateRoom, friendsPresenceMap, setIsLoading, setHubSuccessMsg, setHubErrorMsg,
    setAuthRequirementReason, setShowAuthRequirementModal, setActiveGameConflict,
  } = deps;

  const handleSendDirectInvite = async (targetPlayerId: string): Promise<boolean> => {
    if (!isLoggedIn) {
      setAuthRequirementReason("Connecte-toi avec Google pour inviter un joueur.");
      setShowAuthRequirementModal(true);
      return false;
    }
    if (!room) {
      setHubErrorMsg('Tu dois être dans un salon pour envoyer une invitation.');
      return false;
    }
    try {
      await webSocketService.sendDirectInvite(targetPlayerId, room.id);
      setHubSuccessMsg('Invitation envoyée !');
      triggerHaptic('success');
      setTimeout(() => setHubSuccessMsg(null), getPublicParamNumber('uiToastDurationMs'));
      return true;
    } catch (e: any) {
      const errorMsg = e?.message || "Impossible d'envoyer l'invitation.";
      if (errorMsg.includes('Connexion Google requise')) {
        setAuthRequirementReason(errorMsg);
        setShowAuthRequirementModal(true);
      }
      setHubErrorMsg(errorMsg);
      return false;
    }
  };

  const handleWhatsAppInviteFriend = (
    friend: { id: string; name: string; avatarSeed?: string; addedAt?: number },
    customRoomCode?: string
  ) => {
    triggerHaptic('medium');
    const code = customRoomCode || room?.id || 'DIRECT';
    const waUrl = FriendService.getWhatsAppShareUrl(code, friend.name, {
      baseBet: room?.baseBet || 10,
      fillWithBots: false,
    });
    window.open(waUrl, '_blank');
  };

  const handleChallengeFriend = async (
    friend: { id: string; name: string; avatarSeed?: string; addedAt?: number },
    forcedStatus?: PresenceStatus,
    confirmLeaveCurrent?: boolean
  ): Promise<boolean> => {
    const presence = friendsPresenceMap[friend.id];
    const status = forcedStatus || (presence ? presence.status : 'OFFLINE');

    if (status === 'OFFLINE') {
      handleWhatsAppInviteFriend(friend);
      return false;
    }

    if (!isLoggedIn) {
      setAuthRequirementReason("Connecte-toi avec Google pour défier un ami.");
      setShowAuthRequirementModal(true);
      return false;
    }
    triggerHaptic('medium');
    setIsLoading(true);
    try {
      // Create a private 1v1 or 4-player table and auto-invite friend
      const res = await onCreateRoom({
        playerName: playerName.trim(),
        fillWithBots: false,
        baseBet: 10,
        initialCapital: 100,
        turnTimerSeconds: getPublicParamNumber('turnTimerSeconds'),
        enableDoubleKora: true,
        enableUnder21: true,
        isPublic: false,
      }, confirmLeaveCurrent);

      if (res && !res.success) {
        if (res.errorCode === 'ACTIVE_GAME_IN_PROGRESS' && res.activeGameRoomCode) {
          setActiveGameConflict({
            activeRoomCode: res.activeGameRoomCode,
            message: res.error,
            onConfirmLeaveAndProceed: async () => {
              await handleChallengeFriend(friend, forcedStatus, true);
            },
          });
          return false;
        }
        throw new Error(res.error || 'Le défi n\'a pas pu être créé. Réessaie.');
      }

      if (status === 'IN_SOLO') {
        setHubSuccessMsg(`Défi envoyé à ${friend.name} ! Sa partie solo sera automatiquement sauvegardée s'il accepte.`);
      } else {
        setHubSuccessMsg(`Défi envoyé à ${friend.name} !`);
      }

      // Send direct invite once room state settles
      setTimeout(() => {
        if (friend.id) {
          handleSendDirectInvite(friend.id);
        }
      }, getPublicParamNumber('clientInviteAfterCreateDelayMs'));
      return true;
    } catch (err: any) {
      setHubErrorMsg(err.message || 'Le défi n\'a pas pu être créé. Réessaie.');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  /** Invitation depuis la liste « En ligne » : à la table où je suis assis, sinon en ouvrant une table privée. */
  const handleInviteOnlinePlayer = async (player: OnlinePlayer): Promise<boolean> => {
    if (room) return handleSendDirectInvite(player.userId);
    return handleChallengeFriend({ id: player.userId, name: player.displayName, avatarSeed: player.avatarId }, 'ONLINE_IDLE');
  };

  return { handleSendDirectInvite, handleWhatsAppInviteFriend, handleChallengeFriend, handleInviteOnlinePlayer };
}
