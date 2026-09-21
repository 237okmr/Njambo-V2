import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Users,
  Globe,
  PlusCircle,
  ArrowLeft,
  Crown,
  Copy,
  Check,
  Play,
  Share2,
  ClipboardPaste,
  Mail,
  UserPlus,
  UserCheck,
  UserX,
  RefreshCw,
  Flame,
  Clock,
  Sliders,
  Trash2,
  Lock,
  Unlock,
  AlertTriangle,
  AlertCircle,
  X,
  KeyRound,
  ShieldCheck,
  Settings,
  Bot,
  Zap,
  Coins,
  QrCode,
  MessageCircle,
  Sparkles,
  Swords,
  Radio,
  Eye,
  Trophy,
  LogOut,
  Search,
  Send,
  Inbox,
  ShieldAlert,
  Activity,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MultiplayerRoom,
  RoomPlayer,
  PublicRoomSummary,
  GameInvitation,
  LocalContact,
  FriendDocument,
  UserPresence,
  PresenceStatus,
} from '../../types';
import { triggerHaptic, sounds } from '../../utils/sound';
import { getLocalPlayerName, setLocalPlayerName } from '../../services/identity';
import { FriendService } from '../../services/friendService';
import { webSocketService } from '../../services/websocketService';
import { isTestEnvironment } from '../../utils/envUtils';
import { PlayerAvatar } from '../profile/PlayerAvatar';
import { PushNotificationToggle } from '../profile/PushNotificationToggle';
import { RoomFilterBottomSheet, AdvancedRoomFilters } from './RoomFilterBottomSheet';
import { FriendQrModal } from './FriendQrModal';
import { JoinProgressIndicator } from './JoinProgressIndicator';
import { HeadToHeadModal } from '../rivalry/HeadToHeadModal';
import { ConnectionDiagnosticModal } from '../common/ConnectionDiagnosticModal';
import { usePlayerProfile } from '../../context/PlayerProfileContext';
import { NativeScreenHeader } from '../common/NativeScreenHeader';
import { NativeSegmentedNav, SegmentTab } from '../common/NativeSegmentedNav';
import { GoogleIcon } from '../common/GoogleIcon';

export type MultiplayerTab = 'play' | 'rooms' | 'social';
export type QuickPillarFilter = 'ALL' | 'ONLY_HUMANS' | 'READY_TO_PLAY';

export interface MultiplayerScreenProps {
  isOpen: boolean;
  onClose: () => void;
  sourceScreen?: 'HOME' | 'GAME';
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  // Room state
  room: MultiplayerRoom | null;
  localPlayerId: string;
  errorMessage?: string | null;
  // Hub actions
  onCreateRoom: (settings: {
    playerName: string;
    fillWithBots: boolean;
    maxPlayers?: number;
    baseBet: number;
    initialCapital: number;
    enableDoubleKora: boolean;
    enableUnder21: boolean;
    turnTimerSeconds?: number;
    afkAction?: 'auto_play' | 'replace_bot';
    isPublic?: boolean;
  }, confirmLeaveCurrent?: boolean) => Promise<{ success: boolean; error?: string; errorCode?: string; activeGameRoomCode?: string } | void>;
  onJoinRoom: (roomCode: string, playerName: string, confirmLeaveCurrent?: boolean) => Promise<{ success: boolean; error?: string; errorCode?: string; activeGameRoomCode?: string }>;
  onQuickMatch: (settings?: { baseBet?: number; initialCapital?: number }, confirmLeaveCurrent?: boolean) => Promise<{ success: boolean; error?: string; errorCode?: string; activeGameRoomCode?: string }>;
  // Lobby actions
  onStartGame: () => Promise<void>;
  onToggleReady?: (isReady: boolean) => void;
  onToggleFillWithBots: (enabled: boolean) => Promise<void>;
  onUpdateSettings?: (settings: Partial<MultiplayerRoom>) => Promise<void>;
  onAlertUnreadyPlayers?: () => Promise<void>;
  onVoteStartWithBots?: () => Promise<void>;
  onClaimHost?: () => Promise<boolean>;
  onLeaveRoom: () => Promise<void>;
  onKickPlayer?: (playerId: string) => Promise<void>;
  onOpenLeaderboard?: () => void;
}

export const MultiplayerScreen: React.FC<MultiplayerScreenProps> = ({
  isOpen,
  onClose,
  sourceScreen = 'HOME',
  soundEnabled = true,
  onToggleSound,
  onOpenLeaderboard,
  room,
  localPlayerId,
  errorMessage,
  onCreateRoom,
  onJoinRoom,
  onQuickMatch,
  onStartGame,
  onToggleReady,
  onToggleFillWithBots,
  onUpdateSettings,
  onAlertUnreadyPlayers,
  onVoteStartWithBots,
  onClaimHost,
  onLeaveRoom,
  onKickPlayer,
}) => {
  // 3-Pillar Navigation Tabs (Zero horizontal scroll)
  const [activeTab, setActiveTab] = useState<MultiplayerTab>('play');

  // Active game conflict state (Confirmation dialog when trying to join/create during an active match)
  const [activeGameConflict, setActiveGameConflict] = useState<{
    activeRoomCode: string;
    message?: string;
    onConfirmLeaveAndProceed: () => Promise<void>;
  } | null>(null);

  // Profile & Auth Status
  const { isLoggedIn, loginWithGoogle, profile, activeSanction } = usePlayerProfile();
  const [showAuthRequirementModal, setShowAuthRequirementModal] = useState<boolean>(false);
  const [authRequirementReason, setAuthRequirementReason] = useState<string>('');
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(false);

  const handleGoogleSignIn = async () => {
    setIsAuthLoading(true);
    try {
      await loginWithGoogle();
      setShowAuthRequirementModal(false);
      setHubSuccessMsg("Compte Google synchronisé avec succès !");
      triggerHaptic('success');
    } catch (err: any) {
      setHubErrorMsg(err?.message || "Échec de connexion avec Google.");
      triggerHaptic('heavy');
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Dedicated Modals
  const [showJoinCodeModal, setShowJoinCodeModal] = useState<boolean>(false);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showDiagnosticModal, setShowDiagnosticModal] = useState<boolean>(false);
  const [showAddFriendModal, setShowAddFriendModal] = useState<boolean>(false);
  const [showFilterBottomSheet, setShowFilterBottomSheet] = useState<boolean>(false);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);

  // Player identity & Code Input
  const [playerName, setPlayerNameState] = useState<string>(() => getLocalPlayerName());
  const [roomCodeInput, setRoomCodeInput] = useState<string>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return (params.get('room') || params.get('join') || '').toUpperCase();
    } catch {
      return '';
    }
  });

  // Creation options
  const [isPublicRoom, setIsPublicRoom] = useState<boolean>(true);
  const [maxPlayers, setMaxPlayers] = useState<number>(2); // Default to 2 players (1vs1)
  const [fillWithBots, setFillWithBots] = useState<boolean>(false); // Default: wait for humans unless toggled
  const [baseBet, setBaseBet] = useState<number>(10);
  const [initialCapital, setInitialCapital] = useState<number>(100);
  const [turnTimerSeconds, setTurnTimerSeconds] = useState<number>(15);
  const [enableDoubleKora, setEnableDoubleKora] = useState<boolean>(true);
  const [enableUnder21, setEnableUnder21] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hubErrorMsg, setHubErrorMsg] = useState<string | null>(null);
  const [hubSuccessMsg, setHubSuccessMsg] = useState<string | null>(null);

  // Progressive waiting state for join, create, and quick match (0-10s, 10-30s, 30-60s)
  const [joinWaitAction, setJoinWaitAction] = useState<{
    type: 'join' | 'create' | 'quickmatch';
    elapsedSeconds: number;
    roomCode?: string;
  } | null>(null);

  useEffect(() => {
    if (!joinWaitAction) return;
    const interval = setInterval(() => {
      setJoinWaitAction((prev) => (prev ? { ...prev, elapsedSeconds: prev.elapsedSeconds + 1 } : null));
    }, 1000);
    return () => clearInterval(interval);
  }, [joinWaitAction?.type]);

  const handleCancelPendingAction = () => {
    webSocketService.cancelPendingJoin();
    if (quickMatchIntervalRef.current) {
      clearInterval(quickMatchIntervalRef.current);
      quickMatchIntervalRef.current = null;
    }
    setJoinWaitAction(null);
    setIsLoading(false);
    setIsQuickMatching(false);
    triggerHaptic('light');
  };

  // Server live connection status
  const [isConnected, setIsConnected] = useState<boolean>(() => webSocketService.isConnected());

  // Quick match state
  const [quickMatchBet, setQuickMatchBet] = useState<number>(10);
  const [isQuickMatching, setIsQuickMatching] = useState<boolean>(false);
  const [quickMatchTimer, setQuickMatchTimer] = useState<number>(3);
  const quickMatchIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Live public rooms & search filters
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [isRefreshingRooms, setIsRefreshingRooms] = useState<boolean>(false);
  const [quickFilter, setQuickFilter] = useState<QuickPillarFilter>('ALL');
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedRoomFilters>({
    betLevel: 'ALL',
    playerCapacity: 'ALL',
    requireDoubleKora: false,
    requireUnder21: false,
  });

  // Social & Contacts
  const [localContacts, setLocalContacts] = useState<LocalContact[]>(() => FriendService.getLocalContacts());
  const [recentPlayers, setRecentPlayers] = useState<LocalContact[]>(() => FriendService.getRecentPlayers());
  const [cloudFriends, setCloudFriends] = useState<FriendDocument[]>([]);
  const [friendSubTab, setFriendSubTab] = useState<'FRIENDS' | 'RECEIVED' | 'SENT'>('FRIENDS');
  const [friendsPresenceMap, setFriendsPresenceMap] = useState<Record<string, UserPresence>>({});
  const [receivedInvitations, setReceivedInvitations] = useState<GameInvitation[]>([]);
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

  // Lobby states
  const [copied, setCopied] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [graceSecondsLeft, setGraceSecondsLeft] = useState<number | null>(null);

  // Sync host transfer inactivity / disconnect grace timer
  useEffect(() => {
    const targetExpiresAt =
      room?.hostTransferGraceExpiresAt ||
      room?.players?.find((p) => p.isHost || p.id === room?.hostId)?.disconnectGraceExpiresAt;

    if (!targetExpiresAt) {
      setGraceSecondsLeft(null);
      return;
    }

    const updateGrace = () => {
      const target =
        room?.hostTransferGraceExpiresAt ||
        room?.players?.find((p) => p.isHost || p.id === room?.hostId)?.disconnectGraceExpiresAt;
      if (!target) {
        setGraceSecondsLeft(null);
        return;
      }
      const diff = Math.max(0, Math.ceil((target - webSocketService.getServerTime()) / 1000));
      setGraceSecondsLeft(diff);
    };

    updateGrace();
    const interval = setInterval(updateGrace, 500);
    return () => clearInterval(interval);
  }, [room?.hostTransferGraceExpiresAt, room?.players, room?.hostId]);

  const [autoStartSecondsLeft, setAutoStartSecondsLeft] = useState<number | null>(null);

  // Sync public room auto-start countdown timer
  useEffect(() => {
    if (!room?.autoStartCountdownAt) {
      setAutoStartSecondsLeft(null);
      return;
    }

    const updateAutoStart = () => {
      const diff = Math.max(0, Math.ceil((room.autoStartCountdownAt! - webSocketService.getServerTime()) / 1000));
      setAutoStartSecondsLeft(diff);
    };

    updateAutoStart();
    const interval = setInterval(updateAutoStart, 250);
    return () => clearInterval(interval);
  }, [room?.autoStartCountdownAt]);

  // Check socket connection status periodically
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setIsConnected(webSocketService.isConnected());
    }, 2000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Keyboard navigation (Escape to safely go back or close modals)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (showAuthRequirementModal) {
          setShowAuthRequirementModal(false);
        } else if (showJoinCodeModal) {
          setShowJoinCodeModal(false);
        } else if (showCreateModal) {
          setShowCreateModal(false);
        } else if (showSettingsModal) {
          setShowSettingsModal(false);
        } else if (showAddFriendModal) {
          setShowAddFriendModal(false);
        } else if (showFilterBottomSheet) {
          setShowFilterBottomSheet(false);
        } else if (showQrModal) {
          setShowQrModal(false);
        } else {
          handleBack();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isOpen,
    room,
    sourceScreen,
    showAuthRequirementModal,
    showJoinCodeModal,
    showCreateModal,
    showSettingsModal,
    showAddFriendModal,
    showFilterBottomSheet,
    showQrModal,
  ]);

  // Sync incoming server error message
  useEffect(() => {
    if (errorMessage) {
      setHubErrorMsg(errorMessage);
    }
  }, [errorMessage]);

  // Load and subscribe to public rooms and invitations
  useEffect(() => {
    if (!isOpen) return;

    refreshPublicRooms();

    const unsubPublic = webSocketService.onPublicRooms((rooms) => {
      setPublicRooms(rooms);
      setIsRefreshingRooms(false);
    });

    const unsubInvite = webSocketService.onDirectInvite((invitation) => {
      triggerHaptic('heavy');
      sounds.playRoundVictory();
      setReceivedInvitations((prev) => {
        const filtered = prev.filter((i) => i.id !== invitation.id);
        return [invitation, ...filtered];
      });
    });

    const unsubFeedback = webSocketService.onInviteFeedback((data) => {
      triggerHaptic('light');
      if (data.agree) {
        setHubSuccessMsg(`${data.responderName} a accepté votre invitation !`);
      } else {
        setHubErrorMsg(`${data.responderName} a décliné votre invitation.`);
      }
      setTimeout(() => {
        setHubSuccessMsg(null);
        setHubErrorMsg(null);
      }, 4000);
    });

    const unsubFriendsPresence = webSocketService.onFriendsPresence((presences) => {
      const map: Record<string, UserPresence> = {};
      presences.forEach((p) => {
        if (p.userId) map[p.userId] = p;
      });
      setFriendsPresenceMap((prev) => ({ ...prev, ...map }));
    });

    setLocalContacts(FriendService.getLocalContacts());
    setRecentPlayers(FriendService.getRecentPlayers());

    // Sync URL param if present (e.g. ?room=CODE or ?join=CODE)
    try {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get('room') || params.get('join');
      const fromParam = params.get('from');
      const friendCodeParam = params.get('friendCode');
      const friendNameParam = params.get('friendName');

      if (friendCodeParam && friendNameParam) {
        FriendService.addLocalContact({
          id: 'usr_' + friendCodeParam.replace('#NK-', ''),
          name: friendNameParam,
          avatarSeed: 'avatar_1',
        });
        setLocalContacts(FriendService.getLocalContacts());
        setHubSuccessMsg(`Contact ${friendNameParam} ajouté avec succès !`);
      }

      if (roomParam && !room) {
        setRoomCodeInput(roomParam.toUpperCase());
        setShowJoinCodeModal(true);
      }
    } catch (e) {
      console.error('URL parse error:', e);
    }

    return () => {
      unsubPublic();
      unsubInvite();
      unsubFeedback();
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
    const interval = setInterval(pollFriendsPresence, 4000);
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
          }, 6000);
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

  const refreshPublicRooms = () => {
    setIsRefreshingRooms(true);
    webSocketService.requestPublicRooms().catch(() => {
      setIsRefreshingRooms(false);
    });
  };

  // Quick Match with 3s countdown & bot fallback
  const handleStartQuickMatch = () => {
    if (activeSanction && activeSanction.active) {
      if (activeSanction.type === 'TEMP_BAN' || activeSanction.type === 'PERM_BAN') {
        setHubErrorMsg(`🚫 Sanction Fair-Play active (${activeSanction.type}) : ${activeSanction.reason}`);
        triggerHaptic('heavy');
        return;
      }
    }

    if (!playerName.trim()) {
      setHubErrorMsg('Veuillez renseigner votre pseudo de joueur.');
      return;
    }
    setHubErrorMsg(null);
    setIsQuickMatching(true);
    setQuickMatchTimer(3);
    triggerHaptic('medium');

    if (quickMatchIntervalRef.current) {
      clearInterval(quickMatchIntervalRef.current);
    }

    let remaining = 3;
    quickMatchIntervalRef.current = setInterval(async () => {
      remaining -= 1;
      setQuickMatchTimer(remaining);

      if (remaining <= 0) {
        if (quickMatchIntervalRef.current) clearInterval(quickMatchIntervalRef.current);
        // Execute quick match on server with automatic bot fallback
        setJoinWaitAction({ type: 'quickmatch', elapsedSeconds: 0 });
        try {
          const res = await onQuickMatch({
            baseBet: quickMatchBet,
            initialCapital: 100,
          });
          if (!res.success) {
            if (res.errorCode === 'ACTIVE_GAME_IN_PROGRESS' && res.activeGameRoomCode) {
              setActiveGameConflict({
                activeRoomCode: res.activeGameRoomCode,
                message: res.error,
                onConfirmLeaveAndProceed: async () => {
                  setActiveGameConflict(null);
                  setIsLoading(true);
                  setJoinWaitAction({ type: 'quickmatch', elapsedSeconds: 0 });
                  try {
                    const retryRes = await onQuickMatch({
                      baseBet: quickMatchBet,
                      initialCapital: 100,
                    }, true);
                    if (!retryRes.success) {
                      setHubErrorMsg(retryRes.error || 'Erreur lors du Matchmaking.');
                    }
                  } finally {
                    setIsLoading(false);
                    setJoinWaitAction(null);
                  }
                },
              });
              return;
            }
            setHubErrorMsg(res.error || 'Erreur lors du Matchmaking.');
          }
        } catch (err: any) {
          setHubErrorMsg(err?.message || 'Erreur lors du Matchmaking.');
        } finally {
          setIsQuickMatching(false);
          setJoinWaitAction(null);
        }
      }
    }, 1000);
  };

  const handleCancelQuickMatch = () => {
    handleCancelPendingAction();
  };

  const handleCreate = async (confirmLeaveCurrent?: boolean) => {
    // Fair-play check: table creation restriction
    if (activeSanction && activeSanction.active) {
      if (
        activeSanction.type === 'RESTRICT_CREATE_ROOM' ||
        activeSanction.type === 'TEMP_BAN' ||
        activeSanction.type === 'PERM_BAN'
      ) {
        setHubErrorMsg(`🚫 Création restreinte par le Fair-Play (${activeSanction.type}) : ${activeSanction.reason}`);
        triggerHaptic('heavy');
        return;
      }
    }

    if (!playerName.trim()) {
      setHubErrorMsg('Veuillez entrer votre pseudo de joueur.');
      return;
    }
    if (playerName.trim().toLowerCase() === 'katika') {
      setHubErrorMsg("Le pseudonyme 'Katika' est réservé à l'administration.");
      return;
    }

    // Creator Policy: Private tables require Google login
    if (!isPublicRoom && !isLoggedIn) {
      setAuthRequirementReason("La création de tables privées nécessite une connexion Google afin de prévenir les abus et les pseudonymes dupliqués.");
      setShowAuthRequirementModal(true);
      return;
    }

    setHubErrorMsg(null);
    setIsLoading(true);
    setJoinWaitAction({ type: 'create', elapsedSeconds: 0 });
    try {
      const res = await onCreateRoom({
        playerName: playerName.trim(),
        fillWithBots,
        maxPlayers,
        baseBet,
        initialCapital,
        turnTimerSeconds,
        enableDoubleKora,
        enableUnder21,
        isPublic: isPublicRoom,
      }, confirmLeaveCurrent);
      if (res && !res.success) {
        if (res.errorCode === 'ACTIVE_GAME_IN_PROGRESS' && res.activeGameRoomCode) {
          setActiveGameConflict({
            activeRoomCode: res.activeGameRoomCode,
            message: res.error,
            onConfirmLeaveAndProceed: async () => {
              await handleCreate(true);
            },
          });
          return;
        }
        throw new Error(res.error || 'Erreur lors de la création du salon.');
      }
      setShowCreateModal(false);
      setActiveGameConflict(null);
    } catch (err: any) {
      const errorMsg = err.message || 'Erreur lors de la création du salon.';
      if (errorMsg.includes('Connexion Google requise')) {
        setAuthRequirementReason(errorMsg);
        setShowAuthRequirementModal(true);
      }
      setHubErrorMsg(errorMsg);
    } finally {
      setIsLoading(false);
      setJoinWaitAction(null);
    }
  };

  const handleJoin = async (codeToJoin?: string, confirmLeaveCurrent?: boolean) => {
    // Fair-play check: banned players cannot join tables
    if (activeSanction && activeSanction.active) {
      if (activeSanction.type === 'TEMP_BAN' || activeSanction.type === 'PERM_BAN') {
        setHubErrorMsg(`🚫 Accès restreint par le Fair-Play (${activeSanction.type}) : ${activeSanction.reason}`);
        triggerHaptic('heavy');
        return;
      }
    }

    const code = (codeToJoin || roomCodeInput).trim().toUpperCase();
    if (!playerName.trim()) {
      setHubErrorMsg('Veuillez entrer votre pseudo de joueur.');
      return;
    }
    if (playerName.trim().toLowerCase() === 'katika') {
      setHubErrorMsg("Le pseudonyme 'Katika' est réservé à l'administration.");
      return;
    }
    if (!code) {
      setHubErrorMsg('Veuillez entrer le code du salon.');
      return;
    }
    setHubErrorMsg(null);
    setIsLoading(true);
    setJoinWaitAction({ type: 'join', elapsedSeconds: 0, roomCode: code });
    try {
      const res = await onJoinRoom(code, playerName.trim(), confirmLeaveCurrent);
      if (res.success) {
        setShowJoinCodeModal(false);
        setActiveGameConflict(null);
      } else {
        if (res.errorCode === 'ACTIVE_GAME_IN_PROGRESS' && res.activeGameRoomCode) {
          setActiveGameConflict({
            activeRoomCode: res.activeGameRoomCode,
            message: res.error,
            onConfirmLeaveAndProceed: async () => {
              await handleJoin(code, true);
            },
          });
          return;
        }
        if (res.error && res.error.includes('Connexion Google requise')) {
          setAuthRequirementReason(res.error);
          setShowAuthRequirementModal(true);
        }
        setHubErrorMsg(res.error || 'Impossible de rejoindre le salon.');
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Erreur lors de la connexion au salon.';
      if (errorMsg.includes('Connexion Google requise')) {
        setAuthRequirementReason(errorMsg);
        setShowAuthRequirementModal(true);
      }
      setHubErrorMsg(errorMsg);
    } finally {
      setIsLoading(false);
      setJoinWaitAction(null);
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        let code = text.trim();
        if (code.includes('join=')) {
          const match = code.match(/join=([A-Za-z0-9]+)/);
          if (match && match[1]) {
            code = match[1];
          }
        } else if (code.includes('room=')) {
          const match = code.match(/room=([A-Za-z0-9]+)/);
          if (match && match[1]) {
            code = match[1];
          }
        }
        code = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        setRoomCodeInput(code);
        triggerHaptic('light');
      }
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handleCopyCode = () => {
    if (!room) return;
    navigator.clipboard.writeText(room.id);
    setCopied(true);
    triggerHaptic('light');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLink = async () => {
    if (!room) return;
    const shareUrl = FriendService.getShareInviteUrl(room.id, localPlayerId);
    const shareData = {
      title: 'Njambo Kora - Table Multijoueur',
      text: `Rejoins ma table de Njambo Kora ! Code : ${room.id}`,
      url: shareUrl,
    };

    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        triggerHaptic('medium');
        return;
      } catch {
        // Fallback to clipboard
      }
    }

    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    triggerHaptic('light');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleWhatsAppShare = () => {
    if (!room) return;
    triggerHaptic('medium');
    const waUrl = FriendService.getWhatsAppShareUrl(room.id, playerName, {
      baseBet: room.baseBet,
      fillWithBots: room.fillWithBots,
    });
    window.open(waUrl, '_blank');
  };

  const handleSendDirectInvite = async (targetPlayerId: string) => {
    if (!isLoggedIn) {
      setAuthRequirementReason("L'envoi d'invitations directes nécessite une connexion Google.");
      setShowAuthRequirementModal(true);
      return;
    }
    if (!room) {
      setHubErrorMsg('Vous devez être dans un salon pour envoyer une invitation.');
      return;
    }
    try {
      await webSocketService.sendDirectInvite(targetPlayerId, room.id);
      setHubSuccessMsg('Invitation envoyée !');
      triggerHaptic('success');
      setTimeout(() => setHubSuccessMsg(null), 3000);
    } catch (e: any) {
      const errorMsg = e?.message || "Impossible d'envoyer l'invitation.";
      if (errorMsg.includes('Connexion Google requise')) {
        setAuthRequirementReason(errorMsg);
        setShowAuthRequirementModal(true);
      }
      setHubErrorMsg(errorMsg);
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
  ) => {
    const presence = friendsPresenceMap[friend.id];
    const status = forcedStatus || (presence ? presence.status : 'OFFLINE');

    if (status === 'OFFLINE') {
      handleWhatsAppInviteFriend(friend);
      return;
    }

    if (!isLoggedIn) {
      setAuthRequirementReason("Le défi direct entre amis nécessite une connexion Google vérifiée.");
      setShowAuthRequirementModal(true);
      return;
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
        turnTimerSeconds: 15,
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
          return;
        }
        throw new Error(res.error || 'Erreur lors de la création du défi.');
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
      }, 600);
    } catch (err: any) {
      setHubErrorMsg(err.message || 'Erreur lors de la création du défi.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAcceptInvite = (invite: GameInvitation, confirmLeaveCurrent?: boolean) => {
    webSocketService.respondDirectInvite(invite.id, true, confirmLeaveCurrent);
    setReceivedInvitations((prev) => prev.filter((i) => i.id !== invite.id));
    triggerHaptic('success');
  };

  const handleDeclineInvite = (invite: GameInvitation) => {
    webSocketService.respondDirectInvite(invite.id, false);
    setReceivedInvitations((prev) => prev.filter((i) => i.id !== invite.id));
    triggerHaptic('light');
  };

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
        setHubSuccessMsg(`Demande acceptée ! ${request.displayName} est désormais votre ami.`);
        triggerHaptic('success');
        setTimeout(() => setHubSuccessMsg(null), 3000);
      } else {
        setHubErrorMsg("Impossible d'accepter la demande.");
      }
    } catch (e: any) {
      setHubErrorMsg(e?.message || "Erreur lors de l'acceptation.");
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
        setTimeout(() => setHubSuccessMsg(null), 3000);
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
        setTimeout(() => setHubSuccessMsg(null), 3000);
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
    setHubSuccessMsg(`${friendName} a été retiré de votre liste d'amis.`);
    triggerHaptic('light');
    setTimeout(() => setHubSuccessMsg(null), 3000);
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
        "Pour envoyer des demandes d'ami officielles synchronisées dans le Cloud, vous devez être connecté avec Google."
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
        setTimeout(() => setHubSuccessMsg(null), 3500);
        // Refresh search results to reflect pending status
        handleSearchFriend(newFriendInput);
      } else {
        setHubErrorMsg(res.message);
        triggerHaptic('heavy');
        setTimeout(() => setHubErrorMsg(null), 3500);
      }
    } catch (e: any) {
      setHubErrorMsg(e?.message || "Erreur lors de l'envoi de la demande");
    } finally {
      setFriendActionPendingMap((prev) => ({ ...prev, [target.uid]: false }));
    }
  };

  const handleAddFriendLegacyFallback = () => {
    const raw = newFriendInput.trim();
    if (!raw) return;

    let friendName = raw;
    let friendId = 'usr_' + Math.random().toString(36).substring(2, 9);

    if (raw.startsWith('#NK-')) {
      friendName = `Joueur ${raw}`;
      friendId = 'usr_' + raw.replace('#NK-', '');
    }

    FriendService.addLocalContact({
      id: friendId,
      name: friendName,
      avatarSeed: 'avatar_' + Math.floor(1 + Math.random() * 8),
    });

    setLocalContacts(FriendService.getLocalContacts());
    setNewFriendInput('');
    setShowAddFriendModal(false);
    setHubSuccessMsg('Contact local ajouté !');
    triggerHaptic('success');
    setTimeout(() => setHubSuccessMsg(null), 3000);
  };

  const handleBack = async () => {
    if (showAuthRequirementModal) {
      setShowAuthRequirementModal(false);
      return;
    }
    if (showJoinCodeModal) {
      setShowJoinCodeModal(false);
      return;
    }
    if (showCreateModal) {
      setShowCreateModal(false);
      return;
    }
    if (showSettingsModal) {
      setShowSettingsModal(false);
      return;
    }
    if (showAddFriendModal) {
      setShowAddFriendModal(false);
      return;
    }
    if (showFilterBottomSheet) {
      setShowFilterBottomSheet(false);
      return;
    }
    if (showQrModal) {
      setShowQrModal(false);
      return;
    }

    if (sourceScreen === 'GAME' && !room) {
      // Opened as overlay during an active game -> safely close without disconnect or forfeit
      onClose();
      return;
    }

    if (room) {
      // Inside active lobby -> leave room cleanly and return to hub
      await onLeaveRoom();
      return;
    }

    if (activeTab !== 'play') {
      // If on sub-tab, return to primary play tab first
      setActiveTab('play');
      return;
    }

    // From hub main tab -> close hub
    onClose();
  };

  const handleHome = async () => {
    if (room) {
      await onLeaveRoom();
    }
    onClose();
  };

  // Lobby calculations
  const [alertSent, setAlertSent] = useState<boolean>(false);
  const isHost = room ? room.hostId === localPlayerId : false;
  const hostPlayer = room?.players.find((p) => p.isHost || p.id === room.hostId);
  const isHostDisconnected = hostPlayer ? !hostPlayer.connected : true;
  const localPlayer = room?.players?.find((p) => p.id === localPlayerId);
  const isLocalReady = localPlayer?.isReady ?? false;
  const isLocalSpectator = Boolean(localPlayer?.isSpectator);
  const roomMaxCapacity = Math.min(4, Math.max(2, room?.maxPlayers || 4));

  const seatedPlayers = useMemo(() => {
    return room?.players ? room.players.filter((p) => !p.isSpectator) : [];
  }, [room]);
  const spectators = useMemo(() => {
    return room?.players ? room.players.filter((p) => p.isSpectator) : [];
  }, [room]);

  const connectedHumans = useMemo(() => {
    return seatedPlayers.filter((p) => p.isHuman && p.connected !== false);
  }, [seatedPlayers]);
  const connectedHumansCount = connectedHumans.length;
  const hasMinimumHumans = connectedHumansCount >= 2;

  const unreadyGuests = useMemo(() => {
    return seatedPlayers.filter((p) => p.isHuman && !p.isHost && !p.isReady && p.connected !== false);
  }, [seatedPlayers]);
  const allGuestsReady = unreadyGuests.length === 0;

  // If fillWithBots is disabled, table strictly requires roomMaxCapacity humans to start!
  // If fillWithBots is enabled, 2 humans are enough (bots will fill the remaining seats).
  const canStartGame = room
    ? room.fillWithBots
      ? connectedHumansCount >= 2 && allGuestsReady
      : connectedHumansCount >= roomMaxCapacity && allGuestsReady
    : false;
  const missingHumansToStart = Math.max(0, roomMaxCapacity - connectedHumansCount);
  const currentTimer = room ? room.turnTimerSeconds ?? 15 : 15;
  const hasEmptySeats = seatedPlayers.length < roomMaxCapacity;

  // Filtered Public Rooms combining Quick Pillars and Advanced Bottom Sheet
  const filteredRooms = useMemo(() => {
    return publicRooms.filter((r) => {
      // 1. Quick Pillar Filters
      if (quickFilter === 'ONLY_HUMANS' && r.fillWithBots) return false;
      if (quickFilter === 'READY_TO_PLAY' && r.playersCount < 2) return false;

      // 2. Advanced Filters
      if (advancedFilters.betLevel === 'SMALL' && r.baseBet > 25) return false;
      if (advancedFilters.betLevel === 'MEDIUM' && (r.baseBet < 26 || r.baseBet > 50)) return false;
      if (advancedFilters.betLevel === 'LARGE' && r.baseBet < 51) return false;

      if (advancedFilters.playerCapacity !== 'ALL' && r.maxPlayers !== advancedFilters.playerCapacity) return false;
      if (advancedFilters.requireDoubleKora && !r.enableDoubleKora) return false;
      if (advancedFilters.requireUnder21 && !r.enableUnder21) return false;

      return true;
    });
  }, [publicRooms, quickFilter, advancedFilters]);

  const hasActiveAdvancedFilters =
    advancedFilters.betLevel !== 'ALL' ||
    advancedFilters.playerCapacity !== 'ALL' ||
    advancedFilters.requireDoubleKora ||
    advancedFilters.requireUnder21;

  const multiplayerTabs: SegmentTab<MultiplayerTab>[] = useMemo(
    () => [
      { id: 'play', label: 'Jouer', shortLabel: 'Jouer', icon: Zap },
      {
        id: 'rooms',
        label: 'Salons',
        shortLabel: 'Salons',
        icon: Globe,
        badge: publicRooms.length > 0 ? String(publicRooms.length) : undefined,
        badgeColor: 'bg-slate-800 text-slate-300',
      },
      {
        id: 'social',
        label: 'Amis',
        shortLabel: 'Amis',
        icon: Users,
        badge: receivedInvitations.length > 0 ? String(receivedInvitations.length) : undefined,
        badgeColor: 'bg-rose-500 text-white animate-pulse',
      },
    ],
    [publicRooms.length, receivedInvitations.length]
  );

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      id="multiplayer-native-screen"
      className="fixed inset-0 z-[65] bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-hidden"
    >
      {/* ========================================================================= */}
      {/* 1. TOP UNIFIED HEADER BAR (Option A Back button + Sound Toggle)           */}
      {/* ========================================================================= */}
      <NativeScreenHeader
        id="native-multiplayer-header"
        backLabel="Retour"
        onBack={handleBack}
        backTitle={room ? 'Quitter la table' : 'Retour'}
        title={room ? `Table #${room.id}` : 'Multijoueur'}
        subtitle={
          room
            ? `${connectedHumansCount}/${roomMaxCapacity} joueurs${
                spectators.length > 0 ? ` · ${spectators.length} obs` : ''
              } · ${room.baseBet} Jetons 🪙`
            : 'Njambo Kora en Direct'
        }
        onToggleSound={onToggleSound}
        soundEnabled={soundEnabled}
        onHome={handleHome}
        contextBadge={
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 shrink-0 ${
              isConnected
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
            }`}
            title={isConnected ? 'Serveur connecté' : 'Connexion en cours...'}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-ping'
              }`}
            />
            <span className="hidden xs:inline">{isConnected ? 'En Ligne' : 'Connexion'}</span>
          </span>
        }
        rightActions={
          room ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                id="btn-whatsapp-share-lobby"
                onClick={handleWhatsAppShare}
                className="h-9 px-2.5 sm:px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition active:scale-95 cursor-pointer shrink-0"
                title="Inviter directement via WhatsApp"
              >
                <MessageCircle className="w-4 h-4" />
                <span className="hidden sm:inline">WhatsApp</span>
              </button>
              <button
                type="button"
                id="btn-copy-room-code-header"
                onClick={handleCopyCode}
                className="h-9 px-2.5 sm:px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer shrink-0 shadow-sm"
                title="Copier le code"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-black">Copié</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-amber-400" />
                    <span>Code</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 shrink-0">
              {onOpenLeaderboard && (
                <button
                  type="button"
                  id="btn-multiplayer-header-leaderboard"
                  onClick={onOpenLeaderboard}
                  className="h-9 px-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-bold text-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-xs shrink-0"
                  title="Consulter le Palmarès"
                >
                  <Trophy className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span className="hidden sm:inline">Palmarès</span>
                </button>
              )}
              {!isLoggedIn ? (
                <button
                  type="button"
                  id="btn-multiplayer-header-google-login"
                  disabled={isAuthLoading}
                  onClick={handleGoogleSignIn}
                  className="h-9 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-sm disabled:opacity-50"
                  title="Se connecter avec Google pour synchroniser le profil"
                  aria-label="Connexion Google"
                >
                  <GoogleIcon className="w-4 h-4" />
                  <span className="hidden xs:inline">{isAuthLoading ? '...' : 'Connexion'}</span>
                </button>
              ) : (
                <div
                  className="h-9 px-2 rounded-xl bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-xs font-medium flex items-center gap-1 shrink-0"
                  title="Connecté avec Google"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden sm:inline font-bold truncate max-w-[80px]">
                    {profile?.displayName?.split(' ')[0] || 'Google'}
                  </span>
                </div>
              )}
              <button
                type="button"
                id="btn-multiplayer-settings"
                onClick={() => setShowSettingsModal(true)}
                className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 flex items-center justify-center transition active:scale-95 cursor-pointer shadow-sm shrink-0"
                title="Paramètres de jeu"
                aria-label="Paramètres"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          )
        }
      />

      {/* ========================================================================= */}
      {/* SCENARIO A : ACTIVE LOBBY ROOM                                            */}
      {/* ========================================================================= */}
      {room ? (
        <main className="flex-1 overflow-y-auto no-scrollbar p-3.5 sm:p-6 max-w-lg mx-auto w-full flex flex-col gap-4">
          {/* Test Environment Host Warning Banner */}
          {isHost && isTestEnvironment() && (
            <div
              id="banner-test-environment-host"
              className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-start gap-3 shadow-xl"
            >
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0 border border-amber-500/30">
                <AlertTriangle className="w-4.5 h-4.5 text-amber-400" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-black text-amber-200">
                  Environnement de test
                </span>
                <span className="text-[11px] text-amber-300/90 leading-relaxed">
                  Tu es sur l'environnement de test. Tes amis ne pourront pas rejoindre depuis le lien public. Ouvre{' '}
                  <a
                    href="https://njambo-kora.ai.studio"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold underline text-amber-200 hover:text-white"
                  >
                    https://njambo-kora.ai.studio
                  </a>{' '}
                  pour créer ta table.
                </span>
              </div>
            </div>
          )}

          {/* Real-time Friend Acceptance Toast Banner in Lobby */}
          {friendAcceptedToast && (
            <div className="p-3 rounded-2xl bg-gradient-to-r from-emerald-500/25 to-teal-500/25 border border-emerald-500/50 text-emerald-200 flex items-center justify-between gap-3 shadow-lg shadow-emerald-500/10 animate-in fade-in slide-in-from-top duration-300">
              <div className="flex items-center gap-2.5 min-w-0">
                <PlayerAvatar
                  avatarId={(friendAcceptedToast.avatarId as any) || 'avatar_1'}
                  size="sm"
                  className="w-8 h-8 shrink-0 ring-2 ring-emerald-400"
                />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-black text-white truncate">
                    {friendAcceptedToast.name} a accepté votre demande !
                  </span>
                  <span className="text-[10px] text-emerald-300/90 font-medium truncate">
                    Vous êtes désormais amis connectés.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFriendAcceptedToast(null)}
                className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 hover:text-white flex items-center justify-center shrink-0 cursor-pointer"
                title="Fermer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Host Absent in Grace Period (e.g. sharing WhatsApp) */}
          {!isHost && isHostDisconnected && graceSecondsLeft !== null && graceSecondsLeft > 0 && (
            <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-between gap-3 shadow-xl animate-pulse">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0 border border-amber-500/30">
                  <Clock className="w-4.5 h-4.5 animate-spin text-amber-400" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-black text-amber-200 truncate">
                    L'hôte a quitté l'app quelques instants, la table l'attend
                  </span>
                  <span className="text-[11px] text-amber-300/90 truncate">
                    Temps restant : {graceSecondsLeft}s
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Host Disconnected Alert Banner (After Grace Period Expired) */}
          {!isHost && isHostDisconnected && (graceSecondsLeft === null || graceSecondsLeft <= 0) && (
            <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 flex items-center justify-between gap-3 shadow-xl">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-300 flex items-center justify-center shrink-0 border border-rose-500/30">
                  <AlertCircle className="w-4.5 h-4.5 text-rose-400" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-black text-rose-200 truncate">
                    ⚠️ L'hôte est déconnecté
                  </span>
                  <span className="text-[11px] text-rose-300/90 truncate">
                    Reprenez l'organisation du salon pour lancer la partie.
                  </span>
                </div>
              </div>
              {onClaimHost && (
                <button
                  type="button"
                  id="btn-claim-disconnected-host"
                  onClick={async () => {
                    await onClaimHost();
                  }}
                  className="h-8 px-3 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 text-xs font-black shrink-0 transition active:scale-95 cursor-pointer shadow-md hover:brightness-110"
                >
                  Devenir Hôte
                </button>
              )}
            </div>
          )}

          {/* Host Inactivity Alert Banner (When Host is connected but idle) */}
          {graceSecondsLeft !== null && graceSecondsLeft > 0 && !isHostDisconnected && (
            <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-between gap-3 shadow-xl animate-pulse">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0 border border-amber-500/30">
                  <Clock className="w-4.5 h-4.5 animate-spin text-amber-400" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-black text-amber-200 truncate">
                    {isHost ? '⚠️ Inactivité détectée !' : '⚠️ L’hôte est inactif...'}
                  </span>
                  <span className="text-[11px] text-amber-300/90 truncate">
                    {isHost
                      ? `Transféré dans ${graceSecondsLeft}s si non lancé`
                      : `Transfert du rôle d'hôte dans ${graceSecondsLeft}s`}
                  </span>
                </div>
              </div>
              {!isHost && (
                <button
                  type="button"
                  id="btn-emergency-claim-start"
                  onClick={async () => {
                    setIsStarting(true);
                    try {
                      if (onClaimHost) {
                        await onClaimHost();
                      }
                      await onStartGame();
                    } catch {
                      setIsStarting(false);
                    }
                  }}
                  className="h-8 px-3 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 text-xs font-black shrink-0 transition active:scale-95 cursor-pointer shadow-md hover:brightness-110"
                >
                  Lancer (Secours)
                </button>
              )}
            </div>
          )}

          {/* Public Room Auto-Start Countdown Alert Banner */}
          {room.autoStartCountdownAt && autoStartSecondsLeft !== null && autoStartSecondsLeft > 0 && (
            <div
              id="banner-autostart-countdown"
              className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-between gap-3 shadow-xl animate-pulse"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0 border border-amber-500/30 font-black text-sm">
                  {autoStartSecondsLeft}s
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-black text-amber-200 truncate">
                    {isHost
                      ? `La partie démarre dans ${autoStartSecondsLeft} s (vous pouvez aussi cliquer sur Lancer)`
                      : `La partie démarre dans ${autoStartSecondsLeft} s`}
                  </span>
                  <span className="text-[11px] text-amber-300/90 truncate">
                    {isHost
                      ? 'Table publique prête · Démarrage automatique imminent ou clic sur Lancer'
                      : 'Table publique prête · Démarrage automatique'}
                  </span>
                </div>
              </div>
              {isHost && canStartGame && (
                <button
                  type="button"
                  id="btn-banner-start-now"
                  disabled={isStarting}
                  onClick={async () => {
                    setIsStarting(true);
                    try {
                      await onStartGame();
                    } catch {
                      setIsStarting(false);
                    }
                  }}
                  className="h-8 px-3 rounded-xl bg-gradient-to-r from-emerald-400 to-emerald-500 text-slate-950 text-xs font-black shrink-0 transition active:scale-95 cursor-pointer shadow-md hover:brightness-110 flex items-center gap-1"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Lancer</span>
                </button>
              )}
            </div>
          )}

          {/* Room Summary Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-850 border border-slate-800 shadow-xl flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col items-center justify-center shrink-0">
                  <span className="text-[9px] font-black uppercase tracking-wider text-amber-400">Code</span>
                  <span className="text-lg font-black text-white tracking-wider">{room.id}</span>
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-black text-white truncate max-w-[140px]">
                      Table de {room.hostName}
                    </span>
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      {room.isPublic !== false ? 'Public' : 'Privé'}
                    </span>
                    {/* Badge 100% Humains vs Mixte */}
                    <span
                      className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${
                        !room.fillWithBots
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                      }`}
                    >
                      {!room.fillWithBots ? '👥 100% Humains' : '🤖 Mode Mixte'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 flex-wrap">
                    <span>
                      Mise : <strong className="text-amber-400">{room.baseBet} 🪙</strong>
                    </span>
                    <span>·</span>
                    <span>
                      Capital : <strong className="text-amber-300">{room.initialCapital || 100} 🪙</strong>
                    </span>
                    <span>·</span>
                    <span>
                      Timer : <strong className="text-white">{currentTimer}s</strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* Ready / Start Button */}
              <div>
                {!isHost && (
                  isLocalSpectator ? (
                    hasEmptySeats && onToggleReady ? (
                      <button
                        type="button"
                        id="btn-spectator-take-seat"
                        onClick={() => {
                          onToggleReady(true);
                          triggerHaptic('medium');
                        }}
                        className="h-10 px-4 rounded-xl text-xs font-black bg-gradient-to-r from-emerald-400 to-emerald-500 text-slate-950 flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-lg shadow-emerald-500/20 hover:brightness-110"
                        title="Prendre place sur un siège libre à la table"
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>Prendre un siège 🪑</span>
                      </button>
                    ) : (
                      <span className="h-10 px-3 rounded-xl text-[11px] font-bold bg-cyan-950/80 border border-cyan-500/30 text-cyan-300 flex items-center justify-center gap-1.5">
                        <Eye className="w-3.5 h-3.5" />
                        <span>Observateur</span>
                      </span>
                    )
                  ) : (
                    <div className="flex flex-col items-end gap-1.5">
                      {onToggleReady && (
                        <button
                          type="button"
                          id="btn-toggle-ready"
                          onClick={() => {
                            onToggleReady(!isLocalReady);
                            triggerHaptic('medium');
                          }}
                          className={`h-10 px-4 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-lg ${
                            isLocalReady
                              ? 'bg-emerald-500 text-slate-950 shadow-emerald-500/20'
                              : 'bg-slate-800 text-white border border-slate-700 hover:bg-slate-700'
                          }`}
                        >
                          <Check className={`w-3.5 h-3.5 ${isLocalReady ? 'text-slate-950' : 'text-slate-400'}`} />
                          <span>{isLocalReady ? 'Prêt !' : 'Je suis Prêt'}</span>
                        </button>
                      )}
                      <span
                        id="lobby-non-host-status"
                        className={`text-[11px] font-semibold flex items-center gap-1 text-right ${
                          room.autoStartCountdownAt ? 'text-amber-300 animate-pulse' : 'text-slate-400'
                        }`}
                      >
                        {room.autoStartCountdownAt && <Clock className="w-3 h-3 text-amber-400 animate-spin" />}
                        {room.autoStartCountdownAt
                          ? `La partie démarre dans ${autoStartSecondsLeft !== null ? autoStartSecondsLeft : Math.max(0, Math.ceil((room.autoStartCountdownAt - webSocketService.getServerTime()) / 1000))} s`
                          : "En attente que l'hôte lance la partie"}
                      </span>
                    </div>
                  )
                )}

                {isHost && (
                  <div className="flex flex-col items-end gap-1.5">
                    <div className="flex items-center gap-2">
                      {!allGuestsReady && hasMinimumHumans && onAlertUnreadyPlayers && (
                        <button
                          type="button"
                          id="btn-alert-unready-players-header"
                          onClick={async () => {
                            try {
                              await onAlertUnreadyPlayers();
                              setAlertSent(true);
                              triggerHaptic('heavy');
                              setTimeout(() => setAlertSent(false), 3000);
                            } catch (err) {
                              console.error(err);
                            }
                          }}
                          className="h-10 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow"
                          title="Alerter les joueurs assis qui ne sont pas encore prêts"
                        >
                          {alertSent ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-300">Alerte envoyée !</span>
                            </>
                          ) : (
                            <>
                              <Zap className="w-3.5 h-3.5 text-amber-400 animate-bounce" />
                              <span>Alerter ({unreadyGuests.length})</span>
                            </>
                          )}
                        </button>
                      )}

                      <button
                        type="button"
                        id="btn-start-multiplayer-game"
                        disabled={!canStartGame || isStarting}
                        onClick={async () => {
                          setIsStarting(true);
                          try {
                            await onStartGame();
                          } catch {
                            setIsStarting(false);
                          }
                        }}
                        title={
                          !hasMinimumHumans
                            ? 'Au moins 2 joueurs requis'
                            : !allGuestsReady
                            ? `En attente de : ${unreadyGuests.map((g) => g.name).join(', ')}`
                            : !canStartGame && !room.fillWithBots
                            ? `En attente de ${missingHumansToStart} joueur(s) pour une table à ${roomMaxCapacity}`
                            : 'Lancer la partie'
                        }
                        className={`h-10 px-5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-lg ${
                          canStartGame && !isStarting
                            ? 'bg-gradient-to-r from-emerald-400 to-emerald-500 text-slate-950 hover:from-emerald-300 shadow-emerald-500/20'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                        }`}
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>
                          {isStarting
                            ? 'Lancement...'
                            : !hasMinimumHumans
                            ? `En attente (${connectedHumansCount}/${roomMaxCapacity})`
                            : !allGuestsReady
                            ? `Attente prêts (${unreadyGuests.length})`
                            : !canStartGame && !room.fillWithBots && missingHumansToStart > 0
                            ? `En attente (${connectedHumansCount}/${roomMaxCapacity})`
                            : room.autoStartCountdownAt && autoStartSecondsLeft !== null
                            ? `Lancer (${autoStartSecondsLeft}s)`
                            : 'Lancer'}
                        </span>
                      </button>
                    </div>

                    {room.isPublic !== false && room.autoStartCountdownAt && (
                      <span
                        id="lobby-host-autostart-status"
                        className="text-[11px] text-amber-300 font-semibold flex items-center gap-1 text-right animate-pulse"
                      >
                        <Clock className="w-3 h-3 text-amber-400 animate-spin" />
                        {`La partie démarre dans ${autoStartSecondsLeft !== null ? autoStartSecondsLeft : Math.max(0, Math.ceil((room.autoStartCountdownAt - webSocketService.getServerTime()) / 1000))} s (vous pouvez aussi cliquer sur Lancer)`}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Host or Guest Emergency Action: Switch or Vote Bots */}
            {!room.fillWithBots && (
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-400">
                  {isHost
                    ? "L'attente est trop longue ?"
                    : (room.botVotes && room.botVotes.length > 0)
                    ? `Vote bots en cours (${room.botVotes.length} vote${room.botVotes.length > 1 ? 's' : ''})`
                    : "L'attente est trop longue ?"}
                </span>
                <button
                  type="button"
                  id="btn-toggle-fill-bots"
                  onClick={() => {
                    if (isHost) {
                      onToggleFillWithBots(true);
                    } else if (onVoteStartWithBots) {
                      onVoteStartWithBots();
                    } else {
                      onToggleFillWithBots(true);
                    }
                  }}
                  className={`h-8 px-3 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition active:scale-95 ${
                    !isHost && room.botVotes?.includes(localPlayerId)
                      ? 'bg-indigo-600/40 text-indigo-200 border-indigo-500/60'
                      : 'bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border-indigo-500/40'
                  }`}
                >
                  <Bot className="w-3.5 h-3.5 text-indigo-400" />
                  <span>
                    {isHost
                      ? '+ Remplir avec des Bots'
                      : !isHost && room.botVotes?.includes(localPlayerId)
                      ? '✓ Vote enregistré'
                      : '+ Voter pour les Bots'}
                  </span>
                </button>
              </div>
            )}

            {/* Active Variants Badges */}
            <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80 text-[11px] flex-wrap">
              <span className="text-slate-400 font-medium">Règles :</span>
              <span className="px-2 py-0.5 rounded-md bg-slate-800 text-amber-300 font-bold border border-slate-700">
                Trois 7 (Permanent)
              </span>
              {room.enableDoubleKora && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                  Double Kora (×4)
                </span>
              )}
              {room.enableUnder21 && (
                <span className="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 font-bold border border-blue-500/30">
                  Moins de 21
                </span>
              )}
              {isHost && (
                <button
                  type="button"
                  id="btn-toggle-google-auth-lock"
                  onClick={() => {
                    if (onUpdateSettings) {
                      onUpdateSettings({ requireGoogleAuth: !room.requireGoogleAuth });
                      triggerHaptic('light');
                    }
                  }}
                  className={`px-2 py-0.5 rounded-md font-bold text-[10px] border flex items-center gap-1 cursor-pointer transition ${
                    room.requireGoogleAuth
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                  }`}
                  title="Exiger un compte Google vérifié pour rejoindre le salon"
                >
                  <Lock className="w-2.5 h-2.5" />
                  <span>Google Auth : {room.requireGoogleAuth ? 'Actif 🔒' : 'Libre'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Players Seats Grid */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-black text-slate-400 uppercase tracking-wider">
              Joueurs à la table ({roomMaxCapacity} max)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {seatedPlayers.map((p, idx) => {
                const isMe = p.id === localPlayerId || (Boolean(profile?.uid) && p.id === profile?.uid);
                const isFriend = acceptedFriends.some((f: any) => (f.friendUid || f.id) === p.id);
                const isPendingSent = pendingSentRequests.some((f) => f.friendUid === p.id);
                const isPendingReceived = pendingReceivedRequests.some((f) => f.friendUid === p.id);
                const isActing = Boolean(friendActionPendingMap[p.id]);

                return (
                  <div
                    key={`${p.id || "player"}_${idx}`}
                    className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition ${
                      isMe
                        ? 'bg-amber-500/10 border-amber-500/40 shadow-sm'
                        : p.isHuman
                        ? 'bg-slate-900 border-slate-800'
                        : 'bg-slate-900/50 border-slate-800/60 opacity-80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative shrink-0">
                        <PlayerAvatar
                          avatarId={(p.avatarSeed as any) || 'avatar_1'}
                          size="sm"
                          className="w-9 h-9"
                        />
                        {p.isHost && (
                          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center shadow">
                            <Crown className="w-2.5 h-2.5" />
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-black text-white truncate max-w-[100px]">{p.name}</span>
                          {isMe && (
                            <span className="text-[8px] font-black px-1 rounded bg-amber-400 text-slate-950 uppercase">
                              Moi
                            </span>
                          )}
                          {isMe && isLoggedIn && (
                            <span className="text-[8px] font-black px-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-0.5" title="Google Lié">
                              <Check className="w-2 h-2" /> Google
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 truncate">
                          {p.isHost ? 'Hôte' : p.isHuman ? 'Humain' : 'Robot'}
                        </span>
                        {isMe && !isLoggedIn && (
                          <button
                            type="button"
                            id="btn-lobby-seat-link-google"
                            disabled={isAuthLoading}
                            onClick={handleGoogleSignIn}
                            className="mt-0.5 text-[9px] font-bold text-amber-300 hover:text-amber-200 flex items-center gap-1 cursor-pointer transition w-fit"
                            title="Lier votre compte Google en 1 clic sans quitter la table"
                          >
                            <GoogleIcon className="w-2.5 h-2.5 shrink-0" />
                            <span className="underline">{isAuthLoading ? 'Liaison...' : 'Lier Google (1 clic)'}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {!isMe && p.isHuman && (
                        isFriend ? (
                          <span
                            className="h-7 px-2 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1 select-none"
                            title="Ce joueur fait partie de vos amis"
                          >
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span>Ami</span>
                          </span>
                        ) : isPendingSent ? (
                          <span
                            className="h-7 px-2 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-bold flex items-center gap-1 select-none"
                            title="Demande d'ami envoyée, en attente d'acceptation"
                          >
                            <Clock className="w-3 h-3 text-amber-400 animate-pulse" />
                            <span>En attente</span>
                          </span>
                        ) : isPendingReceived ? (
                          <button
                            type="button"
                            disabled={isActing}
                            onClick={async () => {
                              if (profile?.uid) {
                                setFriendActionPendingMap((prev) => ({ ...prev, [p.id]: true }));
                                try {
                                  await FriendService.acceptCloudFriendRequest(profile.uid, p.id, p.name, (p as any).avatarSeed || (p as any).avatarId);
                                  setHubSuccessMsg(`Demande acceptée ! ${p.name} est maintenant votre ami.`);
                                  triggerHaptic('success');
                                  setTimeout(() => setHubSuccessMsg(null), 3500);
                                } catch (e: any) {
                                  setHubErrorMsg(e?.message || 'Erreur lors de l’acceptation');
                                } finally {
                                  setFriendActionPendingMap((prev) => ({ ...prev, [p.id]: false }));
                                }
                              }
                            }}
                            className="h-7 px-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 text-slate-950 text-[10px] font-bold hover:brightness-110 transition cursor-pointer shadow-xs"
                            title="Accepter la demande d'ami"
                          >
                            {isActing ? '...' : 'Accepter'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isActing}
                            onClick={async () => {
                              if (isLoggedIn && profile?.uid) {
                                await handleSendFriendRequest({
                                  uid: p.id,
                                  displayName: p.name,
                                  avatarId: p.avatarSeed,
                                });
                              } else {
                                FriendService.addLocalContact({
                                  id: p.id,
                                  name: p.name,
                                  avatarSeed: p.avatarSeed,
                                });
                                setLocalContacts(FriendService.getLocalContacts());
                                triggerHaptic('success');
                              }
                            }}
                            className="h-7 px-2 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold hover:bg-amber-500 hover:text-slate-950 transition cursor-pointer flex items-center gap-1"
                            title="Ajouter en ami"
                          >
                            <UserPlus className="w-3 h-3" />
                            <span>{isActing ? '...' : '+ Ami'}</span>
                          </button>
                        )
                      )}

                      {p.isHost ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Hôte
                        </span>
                      ) : p.isReady ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                          <Check className="w-2.5 h-2.5" /> Prêt
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                          Attente
                        </span>
                      )}
                      {room.hostId === localPlayerId && !p.isHost && p.isHuman && onKickPlayer && (
                        <button
                          type="button"
                          onClick={() => onKickPlayer(p.id)}
                          className="ml-1 text-slate-500 hover:text-red-400 p-1 rounded-full hover:bg-red-500/10 transition cursor-pointer"
                          title="Expulser ce joueur"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {Array.from({ length: Math.max(0, roomMaxCapacity - seatedPlayers.length) }).map((_, idx) => (
                <div
                  key={`empty_seat_${idx}`}
                  className="p-3 rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 flex items-center justify-between gap-3 text-slate-600"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full border border-dashed border-slate-700 bg-slate-850 flex items-center justify-center text-slate-600 text-xs">
                      👤
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-slate-500">Siège libre</span>
                      <span className="text-[10px] text-slate-600">
                        {room.fillWithBots ? 'Complété par un robot au lancement' : 'En attente d’un joueur...'}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-850 text-slate-600 border border-slate-800">
                    Libre
                  </span>
                </div>
              ))}
            </div>

            {/* Dedicated Spectators Area in Lobby */}
            {spectators.length > 0 && (
              <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 flex flex-col gap-2 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5" />
                    <span>Observateurs en direct ({spectators.length})</span>
                  </span>
                  {isLocalSpectator && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/30">
                      Vous êtes observateur
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {spectators.map((spec, idx) => {
                    const isMe = spec.id === localPlayerId;
                    return (
                      <div
                        key={`${spec.id}_${idx}`}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs ${
                          isMe
                            ? 'bg-cyan-950/80 border border-cyan-500/40 text-cyan-200'
                            : 'bg-slate-900 border border-slate-800 text-slate-300'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
                        <span className="font-semibold truncate max-w-[120px]">
                          {spec.name.replace(/\s*\(Obs\)$/, '')}
                        </span>
                        {isMe && (
                          <span className="text-[9px] font-black text-cyan-300 uppercase">(Moi)</span>
                        )}
                        {room.hostId === localPlayerId && !isMe && onKickPlayer && (
                          <button
                            type="button"
                            onClick={() => onKickPlayer(spec.id)}
                            className="ml-1 text-slate-500 hover:text-red-400 p-0.5 rounded-full hover:bg-red-500/10 transition cursor-pointer"
                            title="Expulser cet observateur"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Puce d'information discrète sous les sièges pour lier Google sans quitter la salle */}
            {!isLoggedIn && (
              <div className="p-2.5 rounded-xl bg-slate-900/90 border border-white/[0.08] flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-lg bg-white/[0.08] flex items-center justify-center shrink-0">
                    <GoogleIcon className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[11px] text-slate-300 truncate">
                    Mode Invité : vos points ne sont pas enregistrés sur le cloud.
                  </span>
                </div>
                <button
                  type="button"
                  id="btn-lobby-banner-google-link"
                  disabled={isAuthLoading}
                  onClick={handleGoogleSignIn}
                  className="h-7 px-2.5 rounded-lg bg-white hover:bg-slate-100 text-slate-950 text-[11px] font-black flex items-center gap-1 shadow transition active:scale-95 cursor-pointer shrink-0 disabled:opacity-50"
                >
                  <GoogleIcon className="w-3 h-3" />
                  <span>{isAuthLoading ? 'Liaison...' : 'Lier Google'}</span>
                </button>
              </div>
            )}
          </div>

          {/* WhatsApp Direct Invite Banner */}
          <button
            type="button"
            onClick={handleWhatsAppShare}
            className="w-full p-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center justify-between gap-2 shadow-lg shadow-emerald-600/20 transition active:scale-98 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              <span className="text-left">Inviter un ami sur WhatsApp en 1 clic</span>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px]">Partager</span>
          </button>

          {/* Bottom Leave Table Button for mobile ergonomics */}
          <button
            type="button"
            id="btn-leave-lobby-bottom"
            onClick={handleBack}
            className="w-full py-2.5 px-4 rounded-xl border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 text-rose-300 font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-98 cursor-pointer mb-6"
          >
            <LogOut className="w-3.5 h-3.5 text-rose-400" />
            <span>Quitter cette table</span>
          </button>
        </main>
      ) : (
        /* ========================================================================= */
        /* SCENARIO B : HUB MODE (3 Mobile Pillars - 0 Horizontal Scroll)             */
        /* ========================================================================= */
        <main className="flex-1 overflow-y-auto no-scrollbar p-3.5 sm:p-6 max-w-lg mx-auto w-full flex flex-col gap-4">
          {/* Real-time Friend Acceptance Toast Banner in Hub */}
          {friendAcceptedToast && (
            <div className="p-3 rounded-2xl bg-gradient-to-r from-emerald-500/25 to-teal-500/25 border border-emerald-500/50 text-emerald-200 flex items-center justify-between gap-3 shadow-lg shadow-emerald-500/10 animate-in fade-in slide-in-from-top duration-300">
              <div className="flex items-center gap-2.5 min-w-0">
                <PlayerAvatar
                  avatarId={(friendAcceptedToast.avatarId as any) || 'avatar_1'}
                  size="sm"
                  className="w-8 h-8 shrink-0 ring-2 ring-emerald-400"
                />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-black text-white truncate">
                    {friendAcceptedToast.name} a accepté votre demande !
                  </span>
                  <span className="text-[10px] text-emerald-300/90 font-medium truncate">
                    Vous êtes désormais amis connectés.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFriendAcceptedToast(null)}
                className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 hover:text-white flex items-center justify-center shrink-0 cursor-pointer"
                title="Fermer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* ===================================================================== */}
          {/* 3-PILLAR SEGMENTED CONTROL (100% width, No scrollbar)                 */}
          {/* ===================================================================== */}
          <NativeSegmentedNav
            tabs={multiplayerTabs}
            activeTab={activeTab}
            onChange={(tabId) => {
              setActiveTab(tabId);
              triggerHaptic('light');
            }}
            ariaLabel="Navigation multijoueur"
          />

          {/* Active Fair-Play Sanction Warning Banner (Lot 3 - C) */}
          {activeSanction && activeSanction.active && (
            <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-200 flex items-start gap-3 shadow-md animate-in fade-in">
              <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-0.5 flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-rose-300">
                    Sanction Fair-Play : {activeSanction.type}
                  </h4>
                  {activeSanction.expiresAt && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/30 text-rose-200 font-bold shrink-0">
                      Expire dans {Math.max(1, Math.ceil((activeSanction.expiresAt - Date.now()) / 60000))} min
                    </span>
                  )}
                </div>
                <p className="text-xs text-rose-200 font-medium">
                  {activeSanction.reason}
                </p>
                <p className="text-[10px] text-rose-300/80">
                  Les abandons répétés en cours de partie limitent vos accès aux salons multijoueurs.
                </p>
              </div>
            </div>
          )}

          {/* Feedback Messages */}
          {isLoading && joinWaitAction?.type === 'join' && !showJoinCodeModal && (
            <JoinProgressIndicator
              variant="banner"
              roomCode={joinWaitAction.roomCode}
              elapsedSeconds={joinWaitAction.elapsedSeconds}
              onCancel={handleCancelPendingAction}
            />
          )}

          {hubErrorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{hubErrorMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setHubErrorMsg(null)}
                className="text-rose-400 hover:text-white p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {hubSuccessMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>{hubSuccessMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setHubSuccessMsg(null)}
                className="text-emerald-400 hover:text-white p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* ===================================================================== */}
          {/* PILIER 1 : ⚡ JOUER (Partie Rapide + Code + Créer Table)              */}
          {/* ===================================================================== */}
          {activeTab === 'play' && (
            <div className="flex flex-col gap-3.5">
              {/* Hero Card : Matchmaking Instantané */}
              <div className="p-5 rounded-3xl bg-gradient-to-br from-amber-500/20 via-slate-900 to-slate-900 border border-amber-500/40 shadow-xl flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> Matchmaking Instantané
                    </span>
                    <h2 className="text-lg sm:text-xl font-black text-white">Partie Rapide</h2>
                    <p className="text-xs text-slate-300">
                      Trouve instantanément des adversaires humains ou démarre immédiatement avec des bots.
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
                    <Zap className="w-6 h-6 text-amber-400 fill-amber-400" />
                  </div>
                </div>

                {/* Jetons Bet Selector Pills */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
                    <Coins className="w-3.5 h-3.5 text-amber-400" /> Choisir la mise en Jetons :
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {[10, 25, 50].map((bet, idx) => (
                      <button
                        key={`${bet}_${idx}`}
                        type="button"
                        onClick={() => {
                          setQuickMatchBet(bet);
                          triggerHaptic('light');
                        }}
                        className={`h-9 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-1 ${
                          quickMatchBet === bet
                            ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/20'
                            : 'bg-slate-950 text-slate-300 border border-slate-800 hover:bg-slate-800'
                        }`}
                      >
                        <span>{bet}</span>
                        <span className="text-[10px] opacity-80">🪙</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quick Match Action / Countdown / Progressive Wait */}
                {isQuickMatching ? (
                  quickMatchTimer > 0 ? (
                    <div className="flex flex-col gap-2">
                      <div className="w-full h-12 rounded-2xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-between px-4">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full bg-amber-400 animate-ping" />
                          <span className="text-xs font-black text-amber-300">
                            Recherche d'une table ({quickMatchTimer}s)...
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleCancelQuickMatch}
                          className="text-xs font-bold text-slate-400 hover:text-white underline cursor-pointer"
                        >
                          Annuler
                        </button>
                      </div>
                      <span className="text-[10px] text-slate-400 text-center">
                        Si aucune table humaine n'est trouvée, lancement automatique avec bots.
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <JoinProgressIndicator
                        variant="card"
                        elapsedSeconds={joinWaitAction?.elapsedSeconds ?? 0}
                        onCancel={handleCancelQuickMatch}
                      />
                    </div>
                  )
                ) : (
                  <button
                    type="button"
                    id="btn-quick-play-hero"
                    onClick={handleStartQuickMatch}
                    className="w-full h-12 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 hover:from-amber-300 text-slate-950 text-sm font-black flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 transition active:scale-98 cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-slate-950" />
                    <span>Lancer la Recherche ({quickMatchBet} Jetons 🪙)</span>
                  </button>
                )}

                {/* Priorité 5 — Matchmaking rapide : Encart discret et non bloquant */}
                {!isLoggedIn && (
                  <div className="pt-2.5 border-t border-white/[0.08] flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-400/80 shrink-0" />
                      <span className="text-[11px] text-slate-300 truncate">
                        Mode Invité · Victoires non inscrites au Palmarès
                      </span>
                    </div>
                    <button
                      type="button"
                      id="btn-quick-match-google-link"
                      disabled={isAuthLoading}
                      onClick={handleGoogleSignIn}
                      className="text-[11px] font-bold text-amber-300 hover:text-amber-200 underline flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-50"
                      title="Lier votre compte Google pour inscrire vos victoires au classement"
                    >
                      <GoogleIcon className="w-3 h-3" />
                      <span>{isAuthLoading ? '...' : 'Sauvegarder'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Action Card 1 : Rejoindre par Code */}
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-md flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                    <KeyRound className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <h3 className="text-xs sm:text-sm font-black text-white truncate">Rejoindre par Code</h3>
                    <p className="text-[11px] text-slate-400 truncate">Saisis le code à 4 lettres partagé</p>
                  </div>
                </div>

                <button
                  type="button"
                  id="btn-open-join-code-modal"
                  onClick={() => setShowJoinCodeModal(true)}
                  className="h-10 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/30 text-xs font-black transition active:scale-95 cursor-pointer shrink-0"
                >
                  Entrer Code
                </button>
              </div>

              {/* Action Card 2 : Créer un Salon Personnalisé */}
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-md flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                    <Crown className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <h3 className="text-xs sm:text-sm font-black text-white truncate">Créer une Table</h3>
                    <p className="text-[11px] text-slate-400 truncate">Publique libre · Privée avec Google</p>
                  </div>
                </div>

                <button
                  type="button"
                  id="btn-open-create-room-modal"
                  onClick={() => {
                    if (
                      activeSanction &&
                      activeSanction.active &&
                      (activeSanction.type === 'RESTRICT_CREATE_ROOM' ||
                        activeSanction.type === 'TEMP_BAN' ||
                        activeSanction.type === 'PERM_BAN')
                    ) {
                      setHubErrorMsg(`🚫 Création restreinte par le Fair-Play (${activeSanction.type}) : ${activeSanction.reason}`);
                      triggerHaptic('heavy');
                      return;
                    }
                    setShowCreateModal(true);
                  }}
                  className="h-10 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black transition active:scale-95 cursor-pointer shrink-0 shadow-md shadow-emerald-500/20"
                >
                  + Créer
                </button>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* PILIER 2 : 🌐 SALONS EN DIRECT (Liste Verticale Propre)               */}
          {/* ===================================================================== */}
          {activeTab === 'rooms' && (
            <div className="flex flex-col gap-3.5">
              {/* Filter bar (3 quick pills + Advanced Button) */}
              <div className="flex items-center justify-between gap-2">
                {/* 3 Quick Pills */}
                <div className="grid grid-cols-3 gap-1.5 flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      setQuickFilter('ALL');
                      triggerHaptic('light');
                    }}
                    className={`h-8 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center justify-center ${
                      quickFilter === 'ALL'
                        ? 'bg-amber-500 text-slate-950 font-black'
                        : 'bg-slate-900 text-slate-400 border border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    Toutes
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickFilter('ONLY_HUMANS');
                      triggerHaptic('light');
                    }}
                    className={`h-8 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center justify-center ${
                      quickFilter === 'ONLY_HUMANS'
                        ? 'bg-amber-500 text-slate-950 font-black'
                        : 'bg-slate-900 text-slate-400 border border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    👥 Humains
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickFilter('READY_TO_PLAY');
                      triggerHaptic('light');
                    }}
                    className={`h-8 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center justify-center ${
                      quickFilter === 'READY_TO_PLAY'
                        ? 'bg-amber-500 text-slate-950 font-black'
                        : 'bg-slate-900 text-slate-400 border border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    🟢 Prêtes
                  </button>
                </div>

                {/* Advanced Filters Button */}
                <button
                  type="button"
                  onClick={() => setShowFilterBottomSheet(true)}
                  className={`h-8 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0 transition ${
                    hasActiveAdvancedFilters
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                      : 'bg-slate-900 border border-slate-800 text-slate-300 hover:text-white'
                  }`}
                  title="Filtres avancés"
                >
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden xs:inline">Filtres</span>
                  {hasActiveAdvancedFilters && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                </button>

                {/* Refresh Button */}
                <button
                  type="button"
                  onClick={refreshPublicRooms}
                  disabled={isRefreshingRooms}
                  className="h-8 w-8 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer shrink-0"
                  title="Actualiser la liste"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingRooms ? 'animate-spin text-amber-400' : ''}`} />
                </button>
              </div>

              {/* Public Rooms List */}
              {filteredRooms.length === 0 ? (
                <div className="py-12 px-6 rounded-3xl bg-slate-900/40 border border-slate-800/80 flex flex-col items-center justify-center text-center gap-4 relative overflow-hidden">
                  <div className="w-16 h-16 rounded-full bg-cyan-500/10 flex items-center justify-center mb-2">
                    <Globe className="w-8 h-8 text-cyan-400 opacity-80" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <h3 className="text-sm font-black text-slate-200">Aucune table disponible</h3>
                    <p className="text-[11px] text-slate-400 max-w-[250px] leading-relaxed">
                      Aucun salon public ne correspond à vos critères actuels. Créez votre propre table et laissez les autres vous rejoindre !
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(true)}
                    className="mt-2 h-10 px-6 rounded-xl bg-gradient-to-r from-emerald-400 to-emerald-500 hover:from-emerald-300 hover:to-emerald-400 text-slate-950 font-black text-xs sm:text-sm shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 animate-pulse"
                  >
                    <span>Créer une table publique</span>
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {filteredRooms.map((r, idx) => {
                    const isLobby = r.status === 'LOBBY';
                    const isPlaying = r.status === 'PLAYING' || r.status === 'PARTIE_OVER' || r.status === 'MANCHE_OVER';
                    const isLobbyFull = isLobby && r.playersCount >= r.maxPlayers;
                    const canReplaceBot = isPlaying && Boolean(r.hasReplaceableBot);

                    return (
                      <div
                        key={`${r.id}_${idx}`}
                        className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col gap-2.5 shadow-sm hover:border-slate-700 transition"
                      >
                        {/* Line 1: Host info */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <PlayerAvatar
                              avatarId={(r.hostAvatarSeed as any) || 'avatar_1'}
                              size="sm"
                              className="w-8 h-8 shrink-0"
                            />
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-black text-white truncate">{r.hostName}</span>
                              <span className="text-[10px] text-slate-400">Code #{r.id}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap justify-end">
                            {/* Host absent badge */}
                            {r.hostAbsent && (
                              <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5 text-amber-300 animate-spin" />
                                Hôte absent
                              </span>
                            )}

                            {/* Status Pill */}
                            {isPlaying ? (
                              r.status === 'MANCHE_OVER' ? (
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                                  Fin de manche
                                </span>
                              ) : canReplaceBot ? (
                                <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 animate-pulse">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                  Place libre
                                </span>
                              ) : (
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1">
                                  <Eye className="w-2.5 h-2.5 text-cyan-300" />
                                  En direct
                                </span>
                              )
                            ) : (
                              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                Salon
                              </span>
                            )}

                            {/* Human vs Bot Badge */}
                            <span
                              className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${
                                !r.fillWithBots
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                  : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                              }`}
                            >
                              {!r.fillWithBots ? '👥 Humains' : '🤖 Mixte'}
                            </span>
                            <span className="text-xs font-black text-amber-400">Mise: {r.baseBet} 🪙</span>
                          </div>
                        </div>

                        {/* Line 2: Details & Badges */}
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
                          {isPlaying ? (
                            <>
                              <span className="text-slate-300 font-semibold">Partie #{r.currentPartie || 1}</span>
                              <span>·</span>
                              <span>
                                {r.humanPlayersCount ?? r.playersCount} humain(s)
                                {r.botPlayersCount ? ` + ${r.botPlayersCount} bot(s)` : ''}
                              </span>
                              {canReplaceBot && (
                                <>
                                  <span>·</span>
                                  <span className="text-amber-300 font-bold">Relais: {r.prorataCapitalEstimate} 🪙</span>
                                </>
                              )}
                              {Boolean(r.spectatorsCount) && (
                                <>
                                  <span>·</span>
                                  <span className="text-cyan-400">{r.spectatorsCount} spectateur(s)</span>
                                </>
                              )}
                            </>
                          ) : (
                            <>
                              <span>{Math.min(r.maxPlayers, r.playersCount)}/{r.maxPlayers} Joueurs</span>
                              <span>·</span>
                              <span>Capital: <strong className="text-slate-300 font-bold">{r.initialCapital || 100} 🪙</strong></span>
                            </>
                          )}
                          {r.enableDoubleKora && <span>· <span className="text-emerald-400 font-bold">Double Kora</span></span>}
                          {r.enableUnder21 && <span>· <span className="text-blue-400 font-bold">Moins de 21</span></span>}
                        </div>

                        {/* Host absent detailed timestamp subtitle */}
                        {r.hostAbsent && (
                          <div className="text-[10px] text-amber-300/90 font-mono flex items-center gap-1.5 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                            <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                            <span>
                              Créée il y a {Math.max(0, Math.floor((Date.now() - (r.createdAt || Date.now())) / 60000))} min · Hôte absent depuis {Math.max(0, Math.floor((Date.now() - (r.hostAbsentSince || r.createdAt || Date.now())) / 60000))} min
                            </span>
                          </div>
                        )}

                        {/* Line 3: Action Button (100% width, dynamic per state) */}
                        <button
                          type="button"
                          disabled={isLoading || isLobbyFull}
                          onClick={() => handleJoin(r.id)}
                          className={`w-full h-10 rounded-xl text-xs font-black transition active:scale-98 cursor-pointer flex items-center justify-center gap-2 ${
                            isLobbyFull
                              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                              : isPlaying && canReplaceBot
                              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-md shadow-emerald-500/20'
                              : isPlaying
                              ? 'bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30'
                              : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20'
                          }`}
                        >
                          {isLobbyFull ? (
                            'Table Complète (4/4)'
                          ) : isPlaying && canReplaceBot ? (
                            <>
                              <UserPlus className="w-3.5 h-3.5" />
                              <span>Prendre la place d'un robot ({r.prorataCapitalEstimate} 🪙)</span>
                            </>
                          ) : isPlaying ? (
                            <>
                              <Eye className="w-3.5 h-3.5" />
                              <span>{r.status === 'MANCHE_OVER' ? 'Rejoindre (Fin de manche)' : 'Regarder en direct (Spectateur)'}</span>
                            </>
                          ) : (
                            'Rejoindre la Table'
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ===================================================================== */}
          {/* PILIER 3 : 👥 AMIS & INVITATIONS                                      */}
          {/* ===================================================================== */}
          {activeTab === 'social' && (
            <div className="flex flex-col gap-4">
              {/* Priorité 1 — Onglet Amis : Incitation visible & non bloquante */}
              {!isLoggedIn && (
                <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/15 via-slate-900 to-slate-900 border border-amber-500/40 shadow-lg flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-md">
                      <GoogleIcon className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="text-xs sm:text-sm font-black text-white">
                          Sauvegardez vos Amis & Invitations
                        </h3>
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300">
                          Recommandé
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 mt-1 leading-snug">
                        En mode Invité, votre liste d'amis et vos invitations sont perdues au nettoyage du navigateur. Connectez-vous avec Google en un clic pour les synchroniser et ne jamais perdre vos liens.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/[0.08]">
                    <span className="text-[10px] text-slate-400 flex items-center gap-1 min-w-0 truncate">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate">Vos contacts actuels seront conservés</span>
                    </span>
                    <button
                      type="button"
                      id="btn-social-tab-google-login"
                      disabled={isAuthLoading}
                      onClick={handleGoogleSignIn}
                      className="h-9 px-3.5 rounded-xl bg-white hover:bg-slate-100 text-slate-950 text-xs font-black flex items-center gap-2 shadow-md transition active:scale-95 cursor-pointer shrink-0 disabled:opacity-50"
                    >
                      <GoogleIcon className="w-4 h-4" />
                      <span>{isAuthLoading ? 'Connexion...' : 'Continuer avec Google'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Invitations Received */}
              {receivedInvitations.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" /> Invitations Reçues ({receivedInvitations.length})
                  </span>
                  <div className="flex flex-col gap-2">
                    {receivedInvitations.map((inv, idx) => (
                      <div
                        key={`${inv.id}_${idx}`}
                        className="p-3.5 rounded-2xl bg-slate-900 border border-amber-500/40 shadow-md flex flex-col gap-2.5"
                      >
                        <div className="flex items-center gap-2.5">
                          <PlayerAvatar
                            avatarId={(inv.fromUserAvatar as any) || 'avatar_1'}
                            size="sm"
                            className="w-8 h-8"
                          />
                          <div className="flex flex-col">
                            <span className="text-xs font-black text-white">{inv.fromUserName} vous défie !</span>
                            <span className="text-[10px] text-slate-400">
                              Table #{inv.roomCode} · {inv.baseBet} Jetons 🪙
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => handleDeclineInvite(inv)}
                            className="h-9 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700 cursor-pointer"
                          >
                            Refuser
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAcceptInvite(inv)}
                            className="h-9 rounded-xl bg-emerald-500 text-slate-950 text-xs font-black hover:bg-emerald-400 cursor-pointer shadow-md"
                          >
                            Rejoindre
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* My Friend Code & WhatsApp Share Card */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/15 via-slate-900 to-slate-900 border border-amber-500/30 flex items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-amber-400 uppercase">Mon Code Ami</span>
                  <span className="text-base font-black text-white font-mono">
                    {FriendService.getFriendCode(localPlayerId)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {!isLoggedIn ? (
                    <button
                      type="button"
                      id="btn-friend-code-link-google"
                      disabled={isAuthLoading}
                      onClick={handleGoogleSignIn}
                      className="h-8 px-2.5 rounded-lg bg-white/[0.08] hover:bg-white/15 text-slate-200 border border-white/10 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50"
                      title="Lier à Google pour pérenniser ce code ami"
                    >
                      <GoogleIcon className="w-3.5 h-3.5" />
                      <span className="hidden xs:inline">Sauvegarder</span>
                    </button>
                  ) : (
                    <span
                      className="h-8 px-2 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1"
                      title="Code associé à votre compte Google"
                    >
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="hidden xs:inline">Vérifié Cloud</span>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowQrModal(true)}
                    className="h-8 px-3 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:bg-amber-500 hover:text-slate-950 transition"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>QR Code</span>
                  </button>
                </div>
              </div>

              {/* Palmarès Banner */}
              {onOpenLeaderboard && (
                <div
                  onClick={onOpenLeaderboard}
                  className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-slate-900 to-slate-900 border border-amber-500/30 flex items-center justify-between gap-3 shadow-md hover:border-amber-400/50 cursor-pointer transition group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 group-hover:scale-105 transition shrink-0">
                      <Trophy className="w-5 h-5 fill-amber-400 text-amber-400" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-black text-white group-hover:text-amber-300 transition-colors truncate">
                        Palmarès & Classement
                      </span>
                      <span className="text-[10px] text-slate-400 truncate">
                        Comparez vos victoires, Koras et taux de réussite avec les maîtres du jeu
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-amber-400 group-hover:translate-x-0.5 transition-transform shrink-0">
                    Explorer →
                  </span>
                </div>
              )}

              {/* Social Sub-Tabs Header & Action */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setFriendSubTab('FRIENDS')}
                      className={`h-8 px-3 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        friendSubTab === 'FRIENDS'
                          ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Mes Amis ({acceptedFriends.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFriendSubTab('RECEIVED')}
                      className={`h-8 px-3 rounded-lg text-xs font-bold transition flex items-center gap-1.5 relative cursor-pointer ${
                        friendSubTab === 'RECEIVED'
                          ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Inbox className="w-3.5 h-3.5" />
                      <span>Reçues</span>
                      {pendingReceivedRequests.length > 0 && (
                        <span className="ml-1 px-1.5 py-0.2 bg-rose-500 text-white text-[10px] font-black rounded-full animate-pulse shadow-sm">
                          {pendingReceivedRequests.length}
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setFriendSubTab('SENT')}
                      className={`h-8 px-3 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        friendSubTab === 'SENT'
                          ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Envoyées ({pendingSentRequests.length})</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setFriendSearchResults([]);
                      setNewFriendInput('');
                      setShowAddFriendModal(true);
                    }}
                    className="h-9 px-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-black flex items-center gap-1.5 shadow-md shadow-amber-500/10 cursor-pointer transition active:scale-95"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>+ Ajouter</span>
                  </button>
                </div>
              </div>

              {/* VIEW 1 : MES AMIS */}
              {friendSubTab === 'FRIENDS' && (
                <>
                  {acceptedFriends.length === 0 ? (
                    <div className="py-12 px-6 rounded-3xl bg-slate-900/40 border border-slate-800/80 flex flex-col items-center justify-center text-center gap-4 relative overflow-hidden">
                      <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mb-2">
                        <Users className="w-8 h-8 text-amber-400 opacity-80" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <h3 className="text-sm font-black text-slate-200">Vous jouez seul ?</h3>
                        <p className="text-[11px] text-slate-400 max-w-[250px] leading-relaxed">
                          Votre liste d'amis est vide. Recherchez des joueurs par Code Ami ou invitez vos proches par WhatsApp !
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setFriendSearchResults([]);
                          setNewFriendInput('');
                          setShowAddFriendModal(true);
                        }}
                        className="mt-2 h-10 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs sm:text-sm shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 animate-pulse"
                      >
                        <UserPlus className="w-4 h-4" />
                        <span>Ajouter un ami</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {acceptedFriends.map((c: any, idx) => {
                        const friendId = c.friendUid || c.id;
                        const friendName = c.displayName || c.name;
                        const friendAvatar = c.avatarId || c.avatarSeed || 'avatar_1';
                        const friendCode = c.friendCode || FriendService.getFriendCode(friendId);
                        const presence = friendsPresenceMap[friendId];
                        const status: PresenceStatus = presence ? presence.status : 'OFFLINE';
                        const currentRoomCode = presence?.currentRoomCode;
                        const summary = presence?.currentRoomSummary;

                        let badgeText = '⚪ Hors ligne';
                        let badgeStyle = 'bg-slate-800/80 text-slate-400 border-slate-700/60';
                        let dotStyle = 'bg-slate-500';

                        if (status === 'ONLINE_IDLE') {
                          badgeText = '🟢 Disponible (Hub)';
                          badgeStyle = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
                          dotStyle = 'bg-emerald-400';
                        } else if (status === 'IN_SOLO') {
                          badgeText = '🟡 En Mode Solo';
                          badgeStyle = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
                          dotStyle = 'bg-amber-400';
                        } else if (status === 'IN_LOBBY') {
                          const opps = summary?.opponentNames && summary.opponentNames.length > 0 ? ` avec ${summary.opponentNames.slice(0, 2).join(', ')}` : '';
                          badgeText = `🔵 En Salon${opps} (${currentRoomCode ? `#${currentRoomCode}` : 'Privé'})`;
                          badgeStyle = 'bg-sky-500/15 text-sky-300 border-sky-500/30';
                          dotStyle = 'bg-sky-400';
                        } else if (status === 'IN_GAME') {
                          const opps = summary?.opponentNames && summary.opponentNames.length > 0
                            ? ` contre ${summary.opponentNames.slice(0, 2).join(', ')}${summary.opponentNames.length > 2 ? ' +' + (summary.opponentNames.length - 2) : ''}`
                            : '';
                          badgeText = `🟣 En jeu${opps} (${currentRoomCode ? `#${currentRoomCode}` : 'En cours'})`;
                          badgeStyle = 'bg-purple-500/15 text-purple-300 border-purple-500/30 font-extrabold';
                          dotStyle = 'bg-purple-400';
                        }

                        const canJoinRoom = (status === 'IN_LOBBY' || status === 'IN_GAME') && Boolean(currentRoomCode);
                        const canReplaceBot = status === 'IN_GAME' && Boolean(summary?.hasReplaceableBot);
                        const isTableFull = summary ? summary.humanPlayersCount >= summary.maxPlayers && !canReplaceBot : false;

                        return (
                          <div
                            key={`${friendId}_${idx}`}
                            className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="relative shrink-0">
                                <PlayerAvatar
                                  avatarId={friendAvatar as any}
                                  size="sm"
                                  className="w-9 h-9"
                                />
                                <span
                                  className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 ${dotStyle}`}
                                />
                              </div>

                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-black text-white truncate">{friendName}</span>
                                  {friendCode && (
                                    <span className="text-[10px] text-amber-400 font-mono font-bold">
                                      {friendCode}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${badgeStyle}`}>
                                    {badgeText}
                                  </span>
                                  {summary && (
                                    <span className="text-[9px] text-slate-400 font-medium">
                                      ({summary.humanPlayersCount}/{summary.maxPlayers} joueurs)
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Context-aware Action Buttons */}
                            <div className="flex items-center gap-1.5 shrink-0 justify-end flex-wrap sm:flex-nowrap">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedH2HOpponent({
                                    id: friendId,
                                    name: friendName,
                                    avatarId: friendAvatar,
                                    avatarSeed: friendAvatar,
                                    friendCode,
                                  });
                                  triggerHaptic('light');
                                }}
                                className="h-8 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center gap-1 shadow-sm transition active:scale-95 cursor-pointer"
                                title="Voir les statistiques du Face-à-Face direct (Victoires, Kora, Fortune)"
                              >
                                <Swords className="w-3.5 h-3.5 text-amber-400" />
                                <span>Face-à-Face</span>
                              </button>

                              {status === 'ONLINE_IDLE' && (
                                <button
                                  type="button"
                                  onClick={() => handleChallengeFriend({ id: friendId, name: friendName, avatarSeed: friendAvatar }, 'ONLINE_IDLE')}
                                  className="h-8 px-3 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 text-slate-950 text-xs font-black flex items-center gap-1 shadow-sm transition active:scale-95 cursor-pointer"
                                >
                                  <Swords className="w-3.5 h-3.5" />
                                  <span>Défier</span>
                                </button>
                              )}

                              {status === 'IN_SOLO' && (
                                <button
                                  type="button"
                                  onClick={() => handleChallengeFriend({ id: friendId, name: friendName, avatarSeed: friendAvatar }, 'IN_SOLO')}
                                  className="h-8 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 text-slate-950 text-xs font-black flex items-center gap-1 shadow-sm transition active:scale-95 cursor-pointer"
                                  title="Inviter directement : Sa partie Solo sera sauvegardée s'il accepte !"
                                >
                                  <Swords className="w-3.5 h-3.5" />
                                  <span>Défier (Auto-Save)</span>
                                </button>
                              )}

                              {canJoinRoom && !isTableFull && (
                                <button
                                  type="button"
                                  onClick={() => handleJoin(currentRoomCode!)}
                                  className={`h-8 px-3 rounded-xl text-xs font-black flex items-center gap-1 shadow-sm transition active:scale-95 cursor-pointer ${
                                    canReplaceBot
                                      ? 'bg-gradient-to-r from-teal-400 to-emerald-500 hover:from-teal-300 text-slate-950'
                                      : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                                  }`}
                                >
                                  {canReplaceBot ? (
                                    <>
                                      <UserPlus className="w-3.5 h-3.5" />
                                      <span>Remplacer Bot</span>
                                    </>
                                  ) : (
                                    <>
                                      <UserPlus className="w-3.5 h-3.5" />
                                      <span>Rejoindre Table</span>
                                    </>
                                  )}
                                </button>
                              )}

                              {canJoinRoom && isTableFull && (
                                <button
                                  type="button"
                                  onClick={() => handleChallengeFriend({ id: friendId, name: friendName, avatarSeed: friendAvatar }, 'IN_GAME')}
                                  className="h-8 px-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1 shadow-sm transition active:scale-95 cursor-pointer"
                                  title="Table complète : Envoyer une invitation pour la partie suivante"
                                >
                                  <Mail className="w-3.5 h-3.5" />
                                  <span>Défier ensuite</span>
                                </button>
                              )}

                              {status === 'OFFLINE' && (
                                <button
                                  type="button"
                                  onClick={() => handleWhatsAppInviteFriend({ id: friendId, name: friendName, avatarSeed: friendAvatar })}
                                  className="h-8 px-3 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                                  title="Inviter via WhatsApp pour qu'il se connecte"
                                >
                                  <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>Inviter (WhatsApp)</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleRemoveFriend(friendId, friendName)}
                                title="Retirer de la liste d'amis"
                                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-rose-500/20 hover:text-rose-300 text-slate-400 flex items-center justify-center transition cursor-pointer shrink-0"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {/* VIEW 2 : DEMANDES REÇUES */}
              {friendSubTab === 'RECEIVED' && (
                <div className="flex flex-col gap-2">
                  {pendingReceivedRequests.length === 0 ? (
                    <div className="py-10 px-6 rounded-3xl bg-slate-900/40 border border-slate-800/80 flex flex-col items-center justify-center text-center gap-3">
                      <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center">
                        <Inbox className="w-7 h-7 text-slate-400" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <h3 className="text-sm font-bold text-slate-200">Aucune demande reçue</h3>
                        <p className="text-[11px] text-slate-400 max-w-[240px]">
                          Lorsque d'autres joueurs vous ajoutent par votre Code Ami, leurs invitations apparaîtront ici.
                        </p>
                      </div>
                    </div>
                  ) : (
                    pendingReceivedRequests.map((req, idx) => {
                      const isActing = friendActionPendingMap[req.friendUid];
                      return (
                        <div
                          key={`${req.friendUid}_${idx}`}
                          className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-slate-900 to-slate-900 border border-amber-500/30 flex items-center justify-between gap-3 shadow-md"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <PlayerAvatar
                              avatarId={(req.avatarId as any) || 'avatar_1'}
                              size="sm"
                              className="w-10 h-10 border border-amber-400/40"
                            />
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-black text-white truncate">{req.displayName}</span>
                              <span className="text-[10px] text-amber-400 font-mono font-bold">{req.friendCode}</span>
                              <span className="text-[9px] text-slate-400">Souhaite devenir votre ami</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              disabled={isActing}
                              onClick={() => handleAcceptFriendRequest(req)}
                              className="h-8 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                              <span>Accepter</span>
                            </button>
                            <button
                              type="button"
                              disabled={isActing}
                              onClick={() => handleDeclineFriendRequest(req)}
                              className="h-8 px-2.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 hover:text-rose-300 text-slate-400 font-bold text-xs flex items-center gap-1 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Refuser</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* VIEW 3 : DEMANDES ENVOYÉES */}
              {friendSubTab === 'SENT' && (
                <div className="flex flex-col gap-2">
                  {pendingSentRequests.length === 0 ? (
                    <div className="py-10 px-6 rounded-3xl bg-slate-900/40 border border-slate-800/80 flex flex-col items-center justify-center text-center gap-3">
                      <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center">
                        <Send className="w-7 h-7 text-slate-400" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <h3 className="text-sm font-bold text-slate-200">Aucune demande en attente</h3>
                        <p className="text-[11px] text-slate-400 max-w-[240px]">
                          Toutes les demandes que vous avez envoyées ont été traitées.
                        </p>
                      </div>
                    </div>
                  ) : (
                    pendingSentRequests.map((req, idx) => {
                      const isActing = friendActionPendingMap[req.friendUid];
                      return (
                        <div
                          key={`${req.friendUid}_${idx}`}
                          className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <PlayerAvatar
                              avatarId={(req.avatarId as any) || 'avatar_1'}
                              size="sm"
                              className="w-9 h-9 opacity-80"
                            />
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-bold text-slate-200 truncate">{req.displayName}</span>
                              <span className="text-[10px] text-amber-400 font-mono">{req.friendCode}</span>
                              <span className="text-[9px] text-slate-400 flex items-center gap-1">
                                <Clock className="w-3 h-3 text-amber-400" /> En attente de confirmation
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={isActing}
                            onClick={() => handleCancelSentRequest(req)}
                            className="h-8 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-medium flex items-center gap-1 transition cursor-pointer"
                          >
                            <span>Annuler</span>
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Recent Opponents */}
              {recentPlayers.length > 0 && (
                <div className="flex flex-col gap-2 mt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                      Joueurs Récents ({recentPlayers.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        FriendService.clearRecentPlayers();
                        setRecentPlayers([]);
                        triggerHaptic('light');
                      }}
                      className="text-[11px] font-bold text-slate-400 hover:text-rose-400 flex items-center gap-1 transition cursor-pointer"
                      title="Effacer l'historique des adversaires récents"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Vider</span>
                    </button>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {recentPlayers.map((r, idx) => {
                      const isMe = r.id === localPlayerId || (Boolean(profile?.uid) && r.id === profile?.uid);
                      const isFriend = acceptedFriends.some((f: any) => (f.friendUid || f.id) === r.id);
                      const isPendingSent = pendingSentRequests.some((f) => f.friendUid === r.id);
                      const isPendingReceived = pendingReceivedRequests.some((f) => f.friendUid === r.id);
                      const isActing = Boolean(friendActionPendingMap[r.id]);

                      return (
                        <div
                          key={`${r.id}_${idx}`}
                          className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800/80 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <PlayerAvatar
                              avatarId={(r.avatarSeed as any) || 'avatar_1'}
                              size="sm"
                              className="w-7 h-7 shrink-0"
                            />
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-xs font-bold text-slate-200 truncate">{r.name}</span>
                              {isMe && (
                                <span className="text-[8px] font-black px-1 rounded bg-amber-400 text-slate-950 uppercase">
                                  Moi
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {!isMe && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedH2HOpponent({
                                    id: r.id,
                                    name: r.name,
                                    avatarSeed: r.avatarSeed,
                                    avatarId: r.avatarSeed,
                                  });
                                  triggerHaptic('light');
                                }}
                                className="h-6 px-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/20 text-[10px] font-bold flex items-center gap-1 transition active:scale-95 cursor-pointer"
                                title="Voir les statistiques du Face-à-Face direct"
                              >
                                <Swords className="w-2.5 h-2.5 text-amber-400" />
                                <span>Face-à-Face</span>
                              </button>
                            )}

                            {isMe ? null : isFriend ? (
                              <span
                                className="h-6 px-2 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1 select-none"
                                title="Ce joueur fait partie de vos amis"
                              >
                                <Check className="w-2.5 h-2.5 text-emerald-400" />
                                <span>Ami</span>
                              </span>
                            ) : isPendingSent ? (
                              <span
                                className="h-6 px-2 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-bold flex items-center gap-1 select-none"
                                title="Demande d'ami envoyée, en attente"
                              >
                                <Clock className="w-2.5 h-2.5 text-amber-400 animate-pulse" />
                                <span>En attente</span>
                              </span>
                            ) : isPendingReceived ? (
                              <button
                                type="button"
                                disabled={isActing}
                                onClick={async () => {
                                  if (profile?.uid) {
                                    setFriendActionPendingMap((prev) => ({ ...prev, [r.id]: true }));
                                    try {
                                      await FriendService.acceptCloudFriendRequest(profile.uid, r.id, r.name, (r as any).avatarSeed || (r as any).avatarId);
                                      setHubSuccessMsg(`Demande acceptée ! ${r.name} est maintenant votre ami.`);
                                      triggerHaptic('success');
                                      setTimeout(() => setHubSuccessMsg(null), 3500);
                                    } catch (e: any) {
                                      setHubErrorMsg(e?.message || 'Erreur lors de l’acceptation');
                                    } finally {
                                      setFriendActionPendingMap((prev) => ({ ...prev, [r.id]: false }));
                                    }
                                  }
                                }}
                                className="h-6 px-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 text-slate-950 text-[10px] font-bold hover:brightness-110 transition cursor-pointer"
                                title="Accepter la demande d'ami"
                              >
                                {isActing ? '...' : 'Accepter'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={isActing}
                                onClick={async () => {
                                  if (isLoggedIn && profile?.uid) {
                                    await handleSendFriendRequest({
                                      uid: r.id,
                                      displayName: r.name,
                                      avatarId: r.avatarSeed,
                                    });
                                  } else {
                                    FriendService.addLocalContact({
                                      id: r.id,
                                      name: r.name,
                                      avatarSeed: r.avatarSeed,
                                    });
                                    setLocalContacts(FriendService.getLocalContacts());
                                    triggerHaptic('success');
                                  }
                                }}
                                className="h-6 px-2 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold hover:bg-amber-500 hover:text-slate-950 transition cursor-pointer flex items-center gap-1"
                                title="Ajouter en ami"
                              >
                                <UserPlus className="w-2.5 h-2.5" />
                                <span>{isActing ? '...' : '+ Ami'}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1 : REJOINDRE PAR CODE                                              */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {showJoinCodeModal && (
          <div className="fixed inset-0 z-[70] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-4 sm:p-5 shadow-2xl flex flex-col gap-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-amber-400" />
                  <h3 className="text-base font-black text-white">Rejoindre par Code</h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (isLoading) handleCancelPendingAction();
                    setShowJoinCodeModal(false);
                  }}
                  className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {hubErrorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{hubErrorMsg}</span>
                  </div>
                  <button type="button" onClick={() => setHubErrorMsg(null)} className="text-rose-400 hover:text-white p-1">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-400 font-bold">Code du Salon (4-6 lettres)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    disabled={isLoading}
                    maxLength={6}
                    value={roomCodeInput}
                    onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                    placeholder="EX: K8T4"
                    className="flex-1 h-12 px-4 rounded-xl bg-slate-950 border border-slate-700 text-white font-black text-lg text-center tracking-[0.25em] uppercase focus:outline-none focus:border-amber-400 disabled:opacity-60"
                  />
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={handlePasteClipboard}
                    title="Coller depuis le presse-papier"
                    className="h-12 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <ClipboardPaste className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {isLoading && joinWaitAction?.type === 'join' ? (
                <JoinProgressIndicator
                  variant="card"
                  roomCode={roomCodeInput}
                  elapsedSeconds={joinWaitAction.elapsedSeconds}
                  onCancel={handleCancelPendingAction}
                />
              ) : (
                <button
                  type="button"
                  disabled={isLoading || !roomCodeInput.trim()}
                  onClick={() => handleJoin()}
                  className="w-full h-12 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm transition active:scale-95 cursor-pointer shadow-lg shadow-amber-500/20 disabled:opacity-50"
                >
                  Rejoindre la Table
                </button>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL 2 : CRÉER UN SALON PERSONNALISÉ (Sélecteur Central 2 Cartes)        */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-[70] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-3.5 sm:p-4 shadow-2xl flex flex-col gap-2 sm:gap-2.5 max-h-[96dvh] overflow-y-auto no-scrollbar"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-0.5">
                <div className="flex items-center gap-2">
                  <Crown className="w-4.5 h-4.5 text-emerald-400" />
                  <h3 className="text-sm sm:text-base font-black text-white">Créer une Table</h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (isLoading) handleCancelPendingAction();
                    setShowCreateModal(false);
                  }}
                  className="w-7 h-7 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer transition active:scale-95"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {hubErrorMsg && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{hubErrorMsg}</span>
                  </div>
                  <button type="button" onClick={() => setHubErrorMsg(null)} className="text-rose-400 hover:text-white p-1">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* 1. CAPACITÉ DE LA TABLE (2, 3 ou 4 Joueurs) */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-bold flex items-center gap-1">
                    <Users className="w-3 h-3 text-amber-400" /> Capacité de la Table
                  </span>
                  <span className="text-[10px] text-slate-500">2 à 4 joueurs</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                  {[
                    { count: 2, label: '2 Joueurs', sub: 'Duel' },
                    { count: 3, label: '3 Joueurs', sub: 'Trio' },
                    { count: 4, label: '4 Joueurs', sub: 'Carré' },
                  ].map((item, idx) => (
                    <button
                      key={`${item.count}_${idx}`}
                      type="button"
                      onClick={() => setMaxPlayers(item.count)}
                      className={`h-9 sm:h-9.5 rounded-xl flex flex-col items-center justify-center transition cursor-pointer border ${
                        maxPlayers === item.count
                          ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 shadow-sm'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800/60'
                      }`}
                    >
                      <span className="text-xs font-black leading-tight">{item.label}</span>
                      <span className="text-[8.5px] opacity-70 leading-none">{item.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. SÉLECTEUR CENTRAL : TYPE D'ADVERSAIRES (HAUTEUR RÉDUITE & HORIZONTALE) */}
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-slate-400 font-bold">Type d'Adversaires</span>
                <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => setFillWithBots(false)}
                    className={`h-9 sm:h-9.5 rounded-xl border flex items-center justify-center gap-2 transition cursor-pointer text-xs font-black ${
                      !fillWithBots
                        ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800/60'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5 shrink-0" />
                    <span>100% Humains</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFillWithBots(true)}
                    className={`h-9 sm:h-9.5 rounded-xl border flex items-center justify-center gap-2 transition cursor-pointer text-xs font-black ${
                      fillWithBots
                        ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800/60'
                    }`}
                  >
                    <Bot className="w-3.5 h-3.5 shrink-0" />
                    <span>Avec Robots</span>
                  </button>
                </div>
              </div>

              {/* 3. Visibilité de la Table */}
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-slate-400 font-bold">Visibilité de la Table</span>
                <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPublicRoom(true)}
                    className={`h-9 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 cursor-pointer transition ${
                      isPublicRoom
                        ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 shadow-sm'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>Public</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPublicRoom(false)}
                    className={`h-9 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 cursor-pointer transition ${
                      !isPublicRoom
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Privé (Code)</span>
                    {!isLoggedIn && (
                      <span className="w-3.5 h-3.5 rounded-full bg-white flex items-center justify-center ml-0.5 shadow-sm">
                        <GoogleIcon className="w-2 h-2" />
                      </span>
                    )}
                  </button>
                </div>

                {/* Appel contextuel pour le mode Privé */}
                {!isPublicRoom && !isLoggedIn && (
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col gap-1.5">
                    <div className="flex items-start gap-2">
                      <div className="w-6 h-6 rounded-lg bg-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                        <GoogleIcon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold text-white">Compte Google requis en Privé</span>
                        <span className="text-[10px] text-slate-300 leading-tight">
                          Garantit l'accès aux invités et enregistre l'historique du salon.
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/[0.08]">
                      <button
                        type="button"
                        onClick={() => setIsPublicRoom(true)}
                        className="text-[10px] text-slate-400 hover:text-white underline cursor-pointer"
                      >
                        Passer en Public (Sans compte)
                      </button>
                      <button
                        type="button"
                        id="btn-create-modal-google-auth"
                        disabled={isAuthLoading}
                        onClick={handleGoogleSignIn}
                        className="h-6.5 px-2.5 rounded-lg bg-white hover:bg-slate-100 text-slate-950 font-black text-[10px] flex items-center gap-1 shadow transition active:scale-95 cursor-pointer disabled:opacity-50"
                      >
                        <GoogleIcon className="w-3 h-3" />
                        <span>{isAuthLoading ? 'Connexion...' : 'Lier Google'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 4. Mise par Manche (Enjeu) */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-bold flex items-center gap-1">
                    <Coins className="w-3 h-3 text-amber-400" /> Mise par Manche (Enjeu)
                  </span>
                  <span className="text-[10px] text-slate-500">Coût de chaque manche</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[10, 25, 50, 100].map((bet, idx) => (
                    <button
                      key={`${bet}_${idx}`}
                      type="button"
                      onClick={() => setBaseBet(bet)}
                      className={`h-8 rounded-xl text-xs font-black transition cursor-pointer ${
                        baseBet === bet
                          ? 'bg-amber-500 text-slate-950 shadow-sm font-black'
                          : 'bg-slate-950 text-slate-300 border border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      {bet} 🪙
                    </button>
                  ))}
                </div>
              </div>

              {/* 5. Capital Initial (Bankroll) */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-bold flex items-center gap-1">
                    <Coins className="w-3 h-3 text-amber-400" /> Capital Initial (Bankroll)
                  </span>
                  <span className="text-[10px] text-slate-500">Total avant élimination</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[50, 100, 200, 500].map((cap, idx) => (
                    <button
                      key={`${cap}_${idx}`}
                      type="button"
                      onClick={() => setInitialCapital(cap)}
                      className={`h-8 rounded-xl text-xs font-black transition cursor-pointer ${
                        initialCapital === cap
                          ? 'bg-amber-500 text-slate-950 shadow-sm font-black'
                          : 'bg-slate-950 text-slate-300 border border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      {cap} 🪙
                    </button>
                  ))}
                </div>
              </div>

              {/* 6. Timer de Tour */}
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-slate-400 font-bold">Timer de Tour</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {[10, 15, 20].map((t, idx) => (
                    <button
                      key={`${t}_${idx}`}
                      type="button"
                      onClick={() => setTurnTimerSeconds(t)}
                      className={`h-8 rounded-xl text-xs font-black transition cursor-pointer ${
                        turnTimerSeconds === t
                          ? 'bg-emerald-500 text-slate-950 shadow-sm font-black'
                          : 'bg-slate-950 text-slate-300 border border-slate-800'
                      }`}
                    >
                      {t} sec
                    </button>
                  ))}
                </div>
              </div>

              {/* 7. Variantes en grille compacte 2 colonnes */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/70 border border-slate-800/70">
                  <div className="flex flex-col min-w-0 pr-1">
                    <span className="text-[11px] font-bold text-white truncate">Double Kora</span>
                    <span className="text-[9px] text-emerald-400 font-bold">×4 gain</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEnableDoubleKora(!enableDoubleKora)}
                    className={`w-9 h-5 rounded-full p-0.5 transition cursor-pointer shrink-0 ${
                      enableDoubleKora ? 'bg-emerald-500' : 'bg-slate-800'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition transform ${
                        enableDoubleKora ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/70 border border-slate-800/70">
                  <div className="flex flex-col min-w-0 pr-1">
                    <span className="text-[11px] font-bold text-white truncate">Moins de 21</span>
                    <span className="text-[9px] text-blue-400 font-bold">≤ 21 victoire</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEnableUnder21(!enableUnder21)}
                    className={`w-9 h-5 rounded-full p-0.5 transition cursor-pointer shrink-0 ${
                      enableUnder21 ? 'bg-emerald-500' : 'bg-slate-800'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition transform ${
                        enableUnder21 ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* 8. BOUTON PRIMAIRE CTA HAUT DE GAMME UI/UX */}
              {isLoading && joinWaitAction?.type === 'create' ? (
                <JoinProgressIndicator
                  variant="card"
                  elapsedSeconds={joinWaitAction.elapsedSeconds}
                  onCancel={handleCancelPendingAction}
                />
              ) : !isPublicRoom && !isLoggedIn ? (
                <button
                  type="button"
                  id="btn-create-room-login-google"
                  disabled={isAuthLoading}
                  onClick={handleGoogleSignIn}
                  className="w-full h-12 sm:h-13 rounded-2xl bg-white hover:bg-slate-100 text-slate-950 font-black text-xs sm:text-sm transition active:scale-[0.98] cursor-pointer shadow-xl flex items-center justify-center gap-2.5 disabled:opacity-50 border-t border-white/60 mt-0.5"
                >
                  <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <GoogleIcon className="w-4 h-4" />
                  </div>
                  <span>{isAuthLoading ? 'Connexion...' : 'Se connecter avec Google pour créer'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  id="btn-confirm-create-room"
                  disabled={isLoading}
                  onClick={() => handleCreate()}
                  className="w-full h-13 sm:h-14 rounded-2xl bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-400 hover:from-emerald-300 hover:via-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs sm:text-sm tracking-wide transition-all duration-150 active:scale-[0.98] cursor-pointer shadow-[0_6px_25px_-2px_rgba(16,185,129,0.55)] hover:shadow-[0_8px_30px_rgba(16,185,129,0.7)] border-t border-emerald-200/60 border-b-2 border-emerald-700/50 flex items-center justify-between px-4 sm:px-5 disabled:opacity-50 mt-1 group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-slate-950/15 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                      <PlusCircle className="w-5 h-5 text-slate-950" />
                    </div>
                    <div className="flex flex-col text-left min-w-0">
                      <span className="font-black text-xs sm:text-sm text-slate-950 leading-tight">
                        {isLoading
                          ? 'Création du salon...'
                          : `Créer la Table ${isPublicRoom ? 'Publique' : 'Privée'}`}
                      </span>
                      <span className="text-[10px] text-emerald-950/80 font-bold leading-none">
                        Lancement immédiat
                      </span>
                    </div>
                  </div>

                  <span className="px-3 py-1 rounded-xl bg-slate-950/15 border border-slate-950/20 text-slate-950 font-black text-xs flex items-center gap-1 shrink-0 shadow-inner">
                    {baseBet} 🪙
                  </span>
                </button>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL 3 : PARAMÈTRES MULTIJOUEUR                                          */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {showSettingsModal && (
          <div className="fixed inset-0 z-[70] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-4 sm:p-5 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings className="w-5 h-5 text-amber-400" />
                  <h3 className="text-base font-black text-white">Paramètres</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Pseudo modification */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-400 font-bold">Mon Pseudo de Joueur</span>
                <input
                  type="text"
                  maxLength={20}
                  value={playerName}
                  onChange={(e) => {
                    setPlayerNameState(e.target.value);
                    if (e.target.value.trim().toLowerCase() !== 'katika') {
                      setLocalPlayerName(e.target.value);
                    }
                  }}
                  className="h-10 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-bold focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* Push notifications */}
              <PushNotificationToggle
                userId={localPlayerId}
                userName={playerName}
                onToast={handleCopyCode}
              />

              {/* Diagnostic de connexion */}
              <button
                type="button"
                onClick={() => {
                  setShowSettingsModal(false);
                  setShowDiagnosticModal(true);
                }}
                className="w-full h-10 px-3 rounded-xl bg-slate-950 border border-slate-700/80 hover:border-amber-500/50 text-slate-300 hover:text-amber-400 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Activity className="w-4 h-4 text-amber-400" />
                <span>Diagnostic de connexion</span>
              </button>

              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="w-full h-10 rounded-xl bg-slate-800 text-slate-200 font-black text-xs hover:bg-slate-700 cursor-pointer"
              >
                Fermer
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL 4 : AJOUTER UN AMI PAR CODE OU PSEUDO                              */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {showAddFriendModal && (
          <div className="fixed inset-0 z-[70] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-4 sm:p-5 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                    <UserPlus className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white">Ajouter un Ami</h3>
                    <p className="text-[10px] text-slate-400">Recherchez un adversaire par pseudo ou Code Ami</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddFriendModal(false);
                    setFriendSearchResults([]);
                  }}
                  className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {!isLoggedIn && (
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-1.5 flex-1">
                    <span className="text-xs font-bold text-amber-300">Connexion Google recommandée</span>
                    <p className="text-[10px] text-slate-300 leading-relaxed">
                      Pour envoyer une demande officielle qui apparaîtra dans les alertes du joueur et synchroniser vos amis entre appareils, connectez votre compte Google.
                    </p>
                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      className="self-start h-7 px-3 rounded-lg bg-white hover:bg-slate-100 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer"
                    >
                      <GoogleIcon className="w-3.5 h-3.5" />
                      <span>Se connecter avec Google</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-300 font-bold flex items-center justify-between">
                  <span>Rechercher un joueur</span>
                  <span className="text-[10px] text-amber-400 font-mono">
                    Mon Code : {FriendService.getFriendCode(localPlayerId)}
                  </span>
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    maxLength={30}
                    value={newFriendInput}
                    onChange={(e) => handleSearchFriend(e.target.value)}
                    placeholder="Ex: #NK-789 ou Pseudo..."
                    className="w-full h-11 pl-10 pr-10 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-medium focus:outline-none focus:border-amber-400 transition"
                  />
                  {isSearchingFriends && (
                    <RefreshCw className="w-4 h-4 text-amber-400 animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />
                  )}
                  {newFriendInput && !isSearchingFriends && (
                    <button
                      type="button"
                      onClick={() => {
                        setNewFriendInput('');
                        setFriendSearchResults([]);
                      }}
                      className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-xs"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              {/* SEARCH RESULTS */}
              {newFriendInput.trim().length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Résultats de recherche ({friendSearchResults.length})
                  </span>

                  {friendSearchResults.length === 0 && !isSearchingFriends ? (
                    <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 text-center flex flex-col items-center gap-2">
                      <p className="text-xs text-slate-400">Aucun joueur enregistré avec ce pseudo ou code.</p>
                      {!isLoggedIn && (
                        <button
                          type="button"
                          onClick={handleAddFriendLegacyFallback}
                          className="text-xs font-bold text-amber-400 hover:underline cursor-pointer"
                        >
                          + Ajouter comme contact local quand même
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
                      {friendSearchResults.map((player, idx) => {
                        const isSelf = player.uid === profile?.uid || player.uid === localPlayerId;
                        const isAlreadyFriend = acceptedFriends.some(
                          (f: any) => (f.friendUid || f.id) === player.uid
                        );
                        const isPendingSent = pendingSentRequests.some((f) => f.friendUid === player.uid);
                        const isPendingReceived = pendingReceivedRequests.find(
                          (f) => f.friendUid === player.uid
                        );
                        const isActing = friendActionPendingMap[player.uid];

                        return (
                          <div
                            key={`${player.uid}_${idx}`}
                            className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2.5"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <PlayerAvatar
                                avatarId={(player.avatarId as any) || 'avatar_1'}
                                size="sm"
                                className="w-8 h-8"
                              />
                              <div className="flex flex-col min-w-0">
                                <span className="text-xs font-bold text-white truncate">
                                  {player.displayName} {isSelf && '(Vous)'}
                                </span>
                                <span className="text-[10px] text-amber-400 font-mono">
                                  {player.friendCode}
                                </span>
                              </div>
                            </div>

                            {/* DYNAMIC ACTION BUTTON */}
                            <div className="shrink-0">
                              {isSelf ? (
                                <span className="text-[10px] text-slate-500 font-bold px-2 py-1 rounded-lg bg-slate-800">
                                  Vous
                                </span>
                              ) : isAlreadyFriend ? (
                                <span className="text-[10px] text-emerald-400 font-bold px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-1">
                                  <Check className="w-3 h-3" /> Ami
                                </span>
                              ) : isPendingSent ? (
                                <span className="text-[10px] text-amber-300 font-bold px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-1">
                                  <Clock className="w-3 h-3" /> Envoyée
                                </span>
                              ) : isPendingReceived ? (
                                <button
                                  type="button"
                                  disabled={isActing}
                                  onClick={() => handleAcceptFriendRequest(isPendingReceived)}
                                  className="h-7 px-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1 shadow-sm transition active:scale-95 cursor-pointer disabled:opacity-50"
                                >
                                  <Check className="w-3 h-3" />
                                  <span>Accepter</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isActing}
                                  onClick={() => handleSendFriendRequest(player)}
                                  className="h-7 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-1 shadow-sm transition active:scale-95 cursor-pointer disabled:opacity-50"
                                >
                                  <UserPlus className="w-3.5 h-3.5" />
                                  <span>Demander</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddFriendModal(false);
                    setFriendSearchResults([]);
                  }}
                  className="h-9 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer transition"
                >
                  Fermer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* BOTTOM SHEET : FILTRES AVANCÉS DES SALONS                                 */}
      {/* ========================================================================= */}
      <RoomFilterBottomSheet
        isOpen={showFilterBottomSheet}
        onClose={() => setShowFilterBottomSheet(false)}
        filters={advancedFilters}
        onApply={(newFilters) => setAdvancedFilters(newFilters)}
        onReset={() => {
          setAdvancedFilters({
            betLevel: 'ALL',
            playerCapacity: 'ALL',
            requireDoubleKora: false,
            requireUnder21: false,
          });
        }}
      />

      {/* ========================================================================= */}
      {/* MODAL 5 : MON CODE AMI & QR CODE                                          */}
      {/* ========================================================================= */}
      <FriendQrModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        playerId={localPlayerId}
        playerName={playerName}
        activeRoomCode={room?.id}
      />

      {/* ========================================================================= */}
      {/* MODAL 6 : FACE-À-FACE & STATISTIQUES DIRECTES (RIVALITÉS)                 */}
      {/* ========================================================================= */}
      <HeadToHeadModal
        isOpen={Boolean(selectedH2HOpponent)}
        onClose={() => setSelectedH2HOpponent(null)}
        opponent={selectedH2HOpponent}
        onChallenge={(opp) => {
          handleChallengeFriend(opp, 'ONLINE_IDLE');
        }}
      />

      {/* ========================================================================= */}
      {/* MODAL : CONNEXION GOOGLE REQUISE (TABLES PRIVÉES & DÉFIS)                 */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {showAuthRequirementModal && (
          <div className="fixed inset-0 z-[80] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-amber-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 text-center"
            >
              <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mx-auto text-amber-400">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white">Connexion Google Requise</h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                {authRequirementReason || "L'accès et la création de tables privées ainsi que l'enregistrement au Palmarès sont réservés aux comptes vérifiés avec Google."}
              </p>
              <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50 text-xs text-slate-400 text-left space-y-1.5">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Intégrité des tables & anti-triche</span>
                </div>
                <p>Évite l'usurpation de pseudonymes et garantit l'authenticité des parties compétitives et privées.</p>
              </div>
              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  disabled={isAuthLoading}
                  onClick={handleGoogleSignIn}
                  className="w-full py-3 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-sm shadow-md flex items-center justify-center gap-3 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <GoogleIcon className="w-4 h-4" />
                  <span>{isAuthLoading ? "Connexion en cours..." : "Se connecter avec Google"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowAuthRequirementModal(false)}
                  className="w-full py-2.5 px-4 rounded-xl text-slate-400 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Continuer en Invité
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL : PARTIE EN COURS DÉTECTÉE (PROTECTION CONTRE L'ABANDON INVOLONTAIRE) */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {activeGameConflict && (
          <div className="fixed inset-0 z-[100] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-slate-900 border border-amber-500/30 rounded-3xl max-w-sm w-full p-5 sm:p-6 shadow-2xl flex flex-col gap-4 text-center"
            >
              {/* Icon & Header */}
              <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
                <ShieldAlert className="w-7 h-7 animate-pulse" />
              </div>

              <div>
                <h3 className="text-base sm:text-lg font-black text-white">
                  Partie en cours détectée
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 mt-1.5 leading-relaxed">
                  Vous avez déjà une partie active sur la table{' '}
                  <span className="font-black text-amber-400 tracking-wider">
                    #{activeGameConflict.activeRoomCode}
                  </span>
                  .
                </p>
                <p className="text-[11px] sm:text-xs text-slate-400 mt-1">
                  Rejoindre ou créer une autre table sans la terminer sera comptabilisé comme un abandon de votre part.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2.5 pt-1">
                {/* Primary: Return to active match */}
                <button
                  type="button"
                  onClick={async () => {
                    const activeCode = activeGameConflict.activeRoomCode;
                    setActiveGameConflict(null);
                    setShowJoinCodeModal(false);
                    setShowCreateModal(false);
                    await handleJoin(activeCode);
                  }}
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition active:scale-98 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-slate-950" />
                  <span>Retourner à ma partie</span>
                </button>

                {/* Secondary: Forfeit current match and proceed */}
                <button
                  type="button"
                  onClick={async () => {
                    const proceed = activeGameConflict.onConfirmLeaveAndProceed;
                    setActiveGameConflict(null);
                    if (proceed) {
                      await proceed();
                    }
                  }}
                  className="w-full h-11 rounded-xl bg-slate-800/80 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-500/40 font-bold text-xs flex items-center justify-center gap-2 transition active:scale-98 cursor-pointer"
                >
                  <span>Quitter ma partie et continuer</span>
                </button>

                {/* Cancel / Stay in Hub */}
                <button
                  type="button"
                  onClick={() => setActiveGameConflict(null)}
                  className="text-xs text-slate-500 hover:text-slate-400 py-1 cursor-pointer transition"
                >
                  Annuler
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL : DIAGNOSTIC DE CONNEXION TEMPS RÉEL                                */}
      {/* ========================================================================= */}
      <ConnectionDiagnosticModal
        isOpen={showDiagnosticModal}
        onClose={() => setShowDiagnosticModal(false)}
      />
    </motion.div>
  );
};
