import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { GameInvitation } from '../types';
import { wsService } from '../services/websocketService';
import { FriendService } from '../services/friendService';
import { triggerHaptic, sounds } from '../utils/sound';

export interface InviteFeedbackData {
  agree: boolean;
  responderName: string;
}

interface InvitationsContextValue {
  incomingInvitations: GameInvitation[];
  acceptInvitation: (invitation: GameInvitation, confirmLeaveCurrent?: boolean) => void;
  declineInvitation: (invitation: GameInvitation) => void;
  dismissInvitation: (inviteId: string) => void;
  declineAllInvitations: () => void;
  clearInvitations: () => void;
  blockUserAndClearInvitations: (targetUserId: string, displayName?: string, friendCode?: string) => Promise<void>;
  onInviteFeedback: (listener: (data: InviteFeedbackData) => void) => () => void;
}

const InvitationsContext = createContext<InvitationsContextValue | undefined>(undefined);

interface InvitationsProviderProps {
  children: ReactNode;
  onFeedback?: (data: InviteFeedbackData) => void;
}

export const InvitationsProvider: React.FC<InvitationsProviderProps> = ({ children, onFeedback }) => {
  const [incomingInvitations, setIncomingInvitations] = useState<GameInvitation[]>([]);
  const onFeedbackPropRef = useRef(onFeedback);
  const feedbackListenersRef = useRef<Set<(data: InviteFeedbackData) => void>>(new Set());

  useEffect(() => {
    onFeedbackPropRef.current = onFeedback;
  }, [onFeedback]);

  const onInviteFeedback = useCallback((listener: (data: InviteFeedbackData) => void) => {
    feedbackListenersRef.current.add(listener);
    return () => {
      feedbackListenersRef.current.delete(listener);
    };
  }, []);

  // Subscribe ONCE to wsService.onDirectInvite and wsService.onInviteFeedback
  useEffect(() => {
    const unsubWs = wsService.onDirectInvite((invitation) => {
      if (FriendService.isPlayerBlocked(invitation.fromUserId)) {
        return; // Silently ignore invitations from blocked players
      }
      setIncomingInvitations((prev) => {
        if (prev.some((inv) => inv.id === invitation.id)) return prev;
        return [invitation, ...prev];
      });
      triggerHaptic('success');
      sounds.playKoraAlert();
    });

    const unsubFeedback = wsService.onInviteFeedback((fb) => {
      if (onFeedbackPropRef.current) {
        onFeedbackPropRef.current(fb);
      }
      feedbackListenersRef.current.forEach((listener) => {
        try {
          listener(fb);
        } catch (e) {
          console.error('[InvitationsContext] Feedback listener error:', e);
        }
      });
    });

    return () => {
      unsubWs();
      unsubFeedback();
    };
  }, []);

  const acceptInvitation = useCallback((invitation: GameInvitation, confirmLeaveCurrent?: boolean) => {
    setIncomingInvitations((prev) => prev.filter((i) => i.id !== invitation.id));
    wsService.respondDirectInvite(invitation.id, true, confirmLeaveCurrent);
  }, []);

  const declineInvitation = useCallback((invitation: GameInvitation) => {
    setIncomingInvitations((prev) => prev.filter((i) => i.id !== invitation.id));
    wsService.respondDirectInvite(invitation.id, false);
  }, []);

  const dismissInvitation = useCallback((inviteId: string) => {
    setIncomingInvitations((prev) => prev.filter((i) => i.id !== inviteId));
  }, []);

  const declineAllInvitations = useCallback(() => {
    setIncomingInvitations((prev) => {
      prev.forEach((inv) => {
        wsService.respondDirectInvite(inv.id, false);
      });
      return [];
    });
  }, []);

  const clearInvitations = useCallback(() => {
    setIncomingInvitations([]);
  }, []);

  const blockUserAndClearInvitations = useCallback(
    async (targetUserId: string, displayName?: string, friendCode?: string) => {
      await FriendService.blockPlayer(targetUserId, displayName, friendCode);
      setIncomingInvitations((prev) => {
        const toDecline = prev.filter((i) => i.fromUserId === targetUserId);
        toDecline.forEach((inv) => wsService.respondDirectInvite(inv.id, false));
        return prev.filter((i) => i.fromUserId !== targetUserId);
      });
    },
    []
  );

  return (
    <InvitationsContext.Provider
      value={{
        incomingInvitations,
        acceptInvitation,
        declineInvitation,
        dismissInvitation,
        declineAllInvitations,
        clearInvitations,
        blockUserAndClearInvitations,
        onInviteFeedback,
      }}
    >
      {children}
    </InvitationsContext.Provider>
  );
};

export const useInvitations = (): InvitationsContextValue => {
  const context = useContext(InvitationsContext);
  if (!context) {
    throw new Error('useInvitations must be used within an InvitationsProvider');
  }
  return context;
};
