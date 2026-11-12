import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getPublicParamNumber } from '../../services/publicConfig';
import { useVisibleInterval } from '../../hooks/useVisibleInterval';
import { getTurnTimerChoices } from '../../../server/engine/engineParams';
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
  ChevronDown,
  ChevronRight,
  Wifi,
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
import { getLocalPlayerName } from '../../services/identity';
import { FriendService } from '../../services/friendService';
import { OnlinePlayersPanel } from './OnlinePlayersPanel';
import type { OnlinePlayer } from '../../services/websocketService';
import { notificationNavigation } from '../../services/notificationNavigation';
import { webSocketService } from '../../services/websocketService';
import { isTestEnvironment } from '../../utils/envUtils';
import { PlayerAvatar } from '../profile/PlayerAvatar';
import { RoomFilterBottomSheet, AdvancedRoomFilters } from './RoomFilterBottomSheet';
import { FriendQrModal } from './FriendQrModal';
import { getPwaShareBase } from '../../utils/pwaLinks';
import { buildCashInviteText, buildCashInviteUrl, buildCashInviteWhatsAppUrl } from '../../utils/cashInvite';
import { JoinProgressIndicator } from './JoinProgressIndicator';
import { HeadToHeadModal } from '../rivalry/HeadToHeadModal';
import { usePlayerProfile } from '../../context/PlayerProfileContext';
import { useInvitations } from '../../context/InvitationsContext';
import { useFriendsHub } from '../../hooks/useFriendsHub';
import { useFriendChallenges } from '../../hooks/useFriendChallenges';
import { FriendsPanel } from '../social/FriendsPanel';
import { ActiveGameConflictModal, AuthRequirementModal } from '../social/HubDialogs';
import { NativeScreenHeader } from '../common/NativeScreenHeader';
import { NativeSegmentedNav, SegmentTab } from '../common/NativeSegmentedNav';
import { GoogleIcon } from '../common/GoogleIcon';
import { useBackLayer } from '../../hooks/useBackLayer';

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
  /** Centre social ouvert : l'onglet « Amis » vit dans la page Social, il disparaît ici. */
  hideFriendsTab?: boolean;
  /** Invitation à une table Kora Cash acceptée : ouvre la page d'invitation Cash de cette table. */
  onOpenCashInvite?: (roomCode: string) => void;
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
  onOpenAccountSettings?: () => void;
}

export const MultiplayerScreen: React.FC<MultiplayerScreenProps> = ({
  isOpen,
  onClose,
  sourceScreen = 'HOME',
  soundEnabled = true,
  onToggleSound,
  onOpenAccountSettings,
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
  onOpenCashInvite,
  hideFriendsTab = false,
}) => {
  // 3-Pillar Navigation Tabs (Zero horizontal scroll)
  const [activeTab, setActiveTab] = useState<MultiplayerTab>('play');

  // Rend le bouton "Remplir avec des bots" plus visible dès que l'attente dépasse botFillReminderSeconds
  // (même seuil que la relance côté serveur), pour qu'un hôte qui ne remarquerait pas le bouton au premier
  // coup d'œil finisse par le voir.
  const [isLongWait, setIsLongWait] = useState(false);
  useVisibleInterval(() => {
    if (!room?.createdAt || room.fillWithBots) {
      if (isLongWait) setIsLongWait(false);
      return;
    }
    const reminderMs = getPublicParamNumber('botFillReminderSeconds') * 1000;
    setIsLongWait(Date.now() - room.createdAt >= reminderMs);
  }, 3000);

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
      const outcome = await loginWithGoogle();
      if (outcome.ok) {
        setShowAuthRequirementModal(false);
        setHubSuccessMsg("Compte Google connecté.");
        triggerHaptic('success');
      } else if (outcome.ok === false && outcome.message) {
        setHubErrorMsg(outcome.message);
        triggerHaptic('heavy');
      }
    } catch (err: any) {
      setHubErrorMsg(err?.message || "La connexion Google a échoué. Réessaie.");
      triggerHaptic('heavy');
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Dedicated Modals
  const [showJoinCodeModal, setShowJoinCodeModal] = useState<boolean>(false);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showAddFriendModal, setShowAddFriendModal] = useState<boolean>(false);
  const [showFilterBottomSheet, setShowFilterBottomSheet] = useState<boolean>(false);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);

  // Player identity & Code Input
  // Le pseudo se modifie uniquement dans le profil : c'est le même à table, au Palmarès et sur tous les appareils.
  const playerName = profile?.displayName || getLocalPlayerName();
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
  const [turnTimerSeconds, setTurnTimerSeconds] = useState<number>(() => getPublicParamNumber('turnTimerSeconds'));
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
    // delay-ok: cadence d'un compteur de secondes affiché (une seconde reste une seconde), pas un délai de jeu
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

  // Navigation depuis la cloche des notifications : ouvre directement le bon onglet (sans action automatique)
  useEffect(() => {
    const applyNotificationTarget = () => {
      const target = notificationNavigation.consume();
      if (!target) return;
      if (hideFriendsTab && target.tab === 'social') return;
      setActiveTab(target.tab);
      if (target.friendSubTab) setFriendSubTab(target.friendSubTab);
    };
    if (isOpen) applyNotificationTarget();
    return notificationNavigation.subscribe(() => {
      if (isOpen) applyNotificationTarget();
    });
  }, [isOpen]);
  const { incomingInvitations, acceptInvitation, declineInvitation } = useInvitations();
  const friendsHub = useFriendsHub({
    isOpen, room, activeTab, isLoggedIn, profile, incomingInvitations, declineInvitation,
    setHubSuccessMsg, setHubErrorMsg, setAuthRequirementReason, setShowAuthRequirementModal, setShowAddFriendModal,
  });
  const {
    localContacts, setLocalContacts, recentPlayers, setRecentPlayers, cloudFriends,
    friendSubTab, setFriendSubTab, friendsPresenceMap,
    newFriendInput, setNewFriendInput, isSearchingFriends, friendSearchResults, setFriendSearchResults,
    friendActionPendingMap, setFriendActionPendingMap, friendAcceptedToast, setFriendAcceptedToast,
    selectedH2HOpponent, setSelectedH2HOpponent,
    acceptedFriends, pendingReceivedRequests, pendingSentRequests, onlineFriendIds,
    handleAcceptFriendRequest, handleDeclineFriendRequest, handleCancelSentRequest, handleRemoveFriend,
    handleBlockPlayer, handleSearchFriend, handleSendFriendRequest, handleAddFriendLegacyFallback,
  } = friendsHub;
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
    // delay-ok: rafraîchissement visuel du compte à rebours de transfert d'hôte (la grâce, elle, est réglable : hostGraceSeconds)
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
    // delay-ok: rafraîchissement visuel de l'indicateur de connexion (lecture d'un état local, aucun appel réseau)
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

    // Sync URL param if present (e.g. ?room=CODE or ?join=CODE). Pas en mode intégré : le salon d'attente n'y existe pas.
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
        setHubSuccessMsg(`Contact ${friendNameParam} ajouté.`);
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
    };
  }, [isOpen, room]);

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
      setHubErrorMsg('Renseigne ton pseudo de joueur.');
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
    // delay-ok: cadence d'un compte à rebours affiché à la seconde avant la Partie rapide, pas un délai de jeu
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
                      setHubErrorMsg(retryRes.error || 'La recherche n\'a pas abouti. Réessaie.');
                    }
                  } finally {
                    setIsLoading(false);
                    setJoinWaitAction(null);
                  }
                },
              });
              return;
            }
            setHubErrorMsg(res.error || 'La recherche n\'a pas abouti. Réessaie.');
          }
        } catch (err: any) {
          setHubErrorMsg(err?.message || 'La recherche n\'a pas abouti. Réessaie.');
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
      setHubErrorMsg('Entre ton pseudo de joueur.');
      return;
    }
    if (playerName.trim().toLowerCase() === 'katika') {
      setHubErrorMsg("Le pseudonyme 'Katika' est réservé à l'administration.");
      return;
    }

    // Creator Policy: Private tables require Google login
    if (!isPublicRoom && !isLoggedIn) {
      setAuthRequirementReason("Connecte-toi avec Google pour créer une table privée.");
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
        throw new Error(res.error || 'La table n\'a pas pu être créée. Réessaie.');
      }
      setShowCreateModal(false);
      setActiveGameConflict(null);
    } catch (err: any) {
      const errorMsg = err.message || 'La table n\'a pas pu être créée. Réessaie.';
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
      setHubErrorMsg('Entre ton pseudo de joueur.');
      return;
    }
    if (playerName.trim().toLowerCase() === 'katika') {
      setHubErrorMsg("Le pseudonyme 'Katika' est réservé à l'administration.");
      return;
    }
    if (!code) {
      setHubErrorMsg('Entre le code du salon.');
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
      const errorMsg = err.message || 'Connexion à la table impossible. Réessaie.';
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
    setTimeout(() => setCopied(false), getPublicParamNumber('uiCopyConfirmMs'));
  };

  const handleCopyLink = async () => {
    if (!room) return;
    // Une table Kora Cash se rejoint depuis Kora Cash : son lien est ?cash=CODE, jamais ?join=CODE.
    const shareUrl = room.cash ? buildCashInviteUrl(getPwaShareBase(), room.id) : FriendService.getShareInviteUrl(room.id, localPlayerId);
    const shareData = {
      title: room.cash ? 'Njambo Kora - Table Kora Cash' : 'Njambo Kora - Table Multijoueur',
      text: room.cash
        ? buildCashInviteText({ code: room.id, bet: room.baseBet, rakePercent: room.cash.rakePercent })
        : `Rejoins ma table de Njambo Kora ! Code : ${room.id}`,
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
    setTimeout(() => setCopiedLink(false), getPublicParamNumber('uiCopyConfirmMs'));
  };

  const handleWhatsAppShare = () => {
    if (!room) return;
    triggerHaptic('medium');
    const waUrl = room.cash
      ? buildCashInviteWhatsAppUrl({
          code: room.id,
          bet: room.baseBet,
          rakePercent: room.cash.rakePercent,
          url: buildCashInviteUrl(getPwaShareBase(), room.id),
        })
      : FriendService.getWhatsAppShareUrl(room.id, playerName, {
          baseBet: room.baseBet,
          fillWithBots: room.fillWithBots,
        });
    window.open(waUrl, '_blank');
  };

  const friendChallenges = useFriendChallenges({
    isLoggedIn, room, playerName, onCreateRoom, friendsPresenceMap, setIsLoading, setHubSuccessMsg, setHubErrorMsg,
    setAuthRequirementReason, setShowAuthRequirementModal, setActiveGameConflict,
  });
  const { handleSendDirectInvite, handleWhatsAppInviteFriend, handleChallengeFriend, handleInviteOnlinePlayer } = friendChallenges;

  const handleAcceptInvite = (invite: GameInvitation, confirmLeaveCurrent?: boolean) => {
    if (invite.cash) {
      // Table Kora Cash : on prévient l'hôte, puis la page d'invitation Cash décide de l'entrée (jamais de JOIN_ROOM direct).
      acceptInvitation(invite);
      onOpenCashInvite?.(invite.roomCode);
      return;
    }
    acceptInvitation(invite, confirmLeaveCurrent);
    handleJoin(invite.roomCode, confirmLeaveCurrent);
  };

  const handleDeclineInvite = (invite: GameInvitation) => {
    declineInvitation(invite);
    triggerHaptic('light');
  };

  const isAnyDialogOpen =
    showAuthRequirementModal ||
    showJoinCodeModal ||
    showCreateModal ||
    showAddFriendModal ||
    showFilterBottomSheet ||
    showQrModal;

  const closeTopDialog = () => {
    if (showAuthRequirementModal) {
      setShowAuthRequirementModal(false);
    } else if (showJoinCodeModal) {
      setShowJoinCodeModal(false);
    } else if (showCreateModal) {
      setShowCreateModal(false);
    } else if (showAddFriendModal) {
      setShowAddFriendModal(false);
    } else if (showFilterBottomSheet) {
      setShowFilterBottomSheet(false);
    } else if (showQrModal) {
      setShowQrModal(false);
    }
  };

  useBackLayer(isOpen && isAnyDialogOpen, closeTopDialog);

  const handleBack = async () => {
    if (isAnyDialogOpen) {
      closeTopDialog();
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

    // From hub -> close hub
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
  const [isQuickMatchExpanded, setIsQuickMatchExpanded] = useState(false);
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

  // 2 humains suffisent : le nombre de places est un maximum. Avec fillWithBots, les bots complètent les places restantes.
  const canStartGame = room ? hasMinimumHumans && allGuestsReady : false;
  const currentTimer = room ? room.turnTimerSeconds ?? getPublicParamNumber('turnTimerSeconds') : getPublicParamNumber('turnTimerSeconds');
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
      ...(hideFriendsTab
        ? []
        : [
            {
              id: 'social' as const,
              label: 'Amis',
              shortLabel: 'Amis',
              icon: Users,
              badge: incomingInvitations.length > 0 ? String(incomingInvitations.length) : undefined,
              badgeColor: 'bg-rose-500 text-white animate-pulse',
            },
          ]),
    ],
    [publicRooms.length, incomingInvitations.length, hideFriendsTab]
  );

  const showExpanded = isQuickMatchExpanded || isQuickMatching;

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      id="multiplayer-native-screen"
      className="fixed inset-x-0 top-0 bottom-[var(--app-bottom-nav,0px)] z-[65] bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-hidden comfort-ui"
    >
      {/* ========================================================================= */}
      {/* 1. TOP UNIFIED HEADER BAR (Option A Back button + Sound Toggle)           */}
      {/* ========================================================================= */}
      {(
      <NativeScreenHeader
        id="native-multiplayer-header"
        backLabel="Retour"
        onBack={handleBack}
        backTitle={room ? 'Quitter la table' : 'Retour'}
        title={
          <span className="block text-xs sm:text-sm md:text-base font-black tracking-tight uppercase text-white truncate">
            {room ? `Table #${room.id}` : 'Multijoueur'}
          </span>
        }
        subtitle={
          room
            ? `${connectedHumansCount}/${roomMaxCapacity} joueurs${
                spectators.length > 0 ? ` · ${spectators.length} obs` : ''
              } · ${room.baseBet} ${room.cash ? 'FCFA' : 'jetons'}`
            : 'Njambo Kora en direct'
        }
        onToggleSound={room ? undefined : onToggleSound}
        soundEnabled={soundEnabled}
        onHome={room ? handleHome : undefined}
        hideNotificationBell={Boolean(room)}
        contextBadge={
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 shrink-0 ${
              isConnected
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
            }`}
            title={isConnected ? 'Connecté' : 'Connexion en cours...'}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-ping'
              }`}
            />
            <span className="hidden sm:inline">{isConnected ? 'En ligne' : 'Connexion'}</span>
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
              <button
                type="button"
                id="btn-multiplayer-settings"
                onClick={onOpenAccountSettings}
                className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 flex items-center justify-center transition active:scale-95 cursor-pointer shadow-sm shrink-0"
                title="Réglages du compte"
                aria-label="Réglages"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          )
        }
      />
      )}

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
                <span className="text-xs text-amber-300/90 leading-relaxed">
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
            <div className="p-3 rounded-2xl bg-gradient-to-r from-emerald-500/25 to-emerald-500/25 border border-emerald-500/50 text-emerald-200 flex items-center justify-between gap-3 shadow-lg shadow-emerald-500/10 animate-in fade-in slide-in-from-top duration-300">
              <div className="flex items-center gap-2.5 min-w-0">
                <PlayerAvatar
                  avatarId={(friendAcceptedToast.avatarId as any) || 'avatar_1'}
                  size="sm"
                  className="w-8 h-8 shrink-0 ring-2 ring-emerald-400"
                />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-black text-white truncate">
                    {friendAcceptedToast.name} a accepté ta demande !
                  </span>
                  <span className="text-xs text-emerald-300/90 font-medium truncate">
                    Vous êtes désormais amis.
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
                  <span className="text-xs text-amber-300/90 truncate">
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
                  <span className="text-xs text-rose-300/90 truncate">
                    Reprends l'organisation du salon pour lancer la partie.
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
                  Devenir hôte
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
                  <span className="text-xs text-amber-300/90 truncate">
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
                  Lancer quand même
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
                      ? `La partie démarre dans ${autoStartSecondsLeft} s (tu peux aussi appuyer sur Lancer)`
                      : `La partie démarre dans ${autoStartSecondsLeft} s`}
                  </span>
                  <span className="text-xs text-amber-300/90 truncate">
                    {isHost
                      ? 'Table publique prête · Démarrage automatique imminent, ou appuie sur Lancer'
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
          <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-800 shadow-xl flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col items-center justify-center shrink-0">
                  <span className="text-xs font-black uppercase tracking-wider text-amber-400">Code</span>
                  <span className="text-lg font-black text-white tracking-wider">{room.id}</span>
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-black text-white truncate max-w-[140px]">
                      Table de {room.hostName}
                    </span>
                    <span className="text-xs font-bold px-1.5 py-0.2 rounded-full bg-slate-500/20 text-slate-300 border border-slate-500/30">
                      {room.isPublic !== false ? 'Public' : 'Privé'}
                    </span>
                    {/* Badge 100 % humains vs Mixte */}
                    <span
                      className={`text-xs font-black px-2 py-0.5 rounded-full border ${
                        !room.fillWithBots
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-slate-500/20 text-slate-300 border-slate-500/40'
                      }`}
                    >
                      {!room.fillWithBots ? '👥 100 % humains' : '🤖 Mode mixte'}
                    </span>
                    {room.cash && (
                      <span id="lobby-cash-badge" className="text-xs font-black px-2 py-0.5 rounded-full border bg-amber-500/20 text-amber-300 border-amber-500/40">
                        Kora Cash
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 flex-wrap">
                    <span>
                      Mise : <strong className="text-amber-400">{room.baseBet} {room.cash ? 'FCFA' : 'jetons'}</strong>
                    </span>
                    <span>·</span>
                    {room.cash ? (
                      <span>
                        Commission : <strong className="text-amber-300">{room.cash.rakePercent} % du pot gagné</strong>
                      </span>
                    ) : (
                      <span>
                        Capital : <strong className="text-amber-300">{room.initialCapital || 100} jetons</strong>
                      </span>
                    )}
                    <span>·</span>
                    <span>
                      Temps par tour : <strong className="text-white">{currentTimer}s</strong>
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
                      <span className="h-10 px-3 rounded-xl text-xs font-bold bg-slate-950/80 border border-slate-500/30 text-slate-300 flex items-center justify-center gap-1.5">
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
                          <span>{isLocalReady ? 'Prêt !' : 'Je suis prêt'}</span>
                        </button>
                      )}
                      <span
                        id="lobby-non-host-status"
                        className={`text-xs font-semibold flex items-center gap-1 text-right ${
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
                              setTimeout(() => setAlertSent(false), getPublicParamNumber('uiToastDurationMs'));
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
                            : !room.fillWithBots && connectedHumansCount < roomMaxCapacity
                            ? `Lancer à ${connectedHumansCount} joueurs : les places libres se fermeront`
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
                            ? `En attente (${unreadyGuests.length})`
                            : room.autoStartCountdownAt && autoStartSecondsLeft !== null
                            ? `Lancer (${autoStartSecondsLeft}s)`
                            : !room.fillWithBots && connectedHumansCount < roomMaxCapacity
                            ? `Lancer à ${connectedHumansCount}`
                            : 'Lancer'}
                        </span>
                      </button>
                    </div>

                    {room.isPublic !== false && room.autoStartCountdownAt && (
                      <span
                        id="lobby-host-autostart-status"
                        className="text-xs text-amber-300 font-semibold flex items-center gap-1 text-right animate-pulse"
                      >
                        <Clock className="w-3 h-3 text-amber-400 animate-spin" />
                        {`La partie démarre dans ${autoStartSecondsLeft !== null ? autoStartSecondsLeft : Math.max(0, Math.ceil((room.autoStartCountdownAt - webSocketService.getServerTime()) / 1000))} s (tu peux aussi appuyer sur Lancer)`}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Host or Guest Emergency Action: Switch or Vote Bots */}
            {!room.fillWithBots && !room.cash && (
              <div className={`pt-2 border-t flex items-center justify-between gap-2 ${isLongWait ? 'border-amber-700/60' : 'border-slate-800'}`}>
                <span className={`text-xs flex items-center gap-1 ${isLongWait ? 'text-amber-300 font-bold' : 'text-slate-400'}`}>
                  {isLongWait && <Clock className="w-3 h-3 animate-pulse" />}
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
                  className={`h-8 px-3 rounded-lg border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition active:scale-95 ${
                    isLongWait
                      ? 'bg-amber-500/30 hover:bg-amber-500/40 text-amber-200 border-amber-500/60 animate-pulse'
                      : !isHost && room.botVotes?.includes(localPlayerId)
                      ? 'bg-slate-600/40 text-slate-200 border-slate-500/60'
                      : 'bg-slate-500/20 hover:bg-slate-500/30 text-slate-300 border-slate-500/40'
                  }`}
                >
                  <Bot className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    {isHost
                      ? '+ Remplir avec des bots'
                      : !isHost && room.botVotes?.includes(localPlayerId)
                      ? '✓ Vote enregistré'
                      : '+ Voter pour les bots'}
                  </span>
                </button>
              </div>
            )}

            {/* Active Variants Badges */}
            <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80 text-xs flex-wrap">
              <span className="text-slate-400 font-medium">Règles :</span>
              <span className="px-2 py-0.5 rounded-md bg-slate-800 text-amber-300 font-bold border border-slate-700">
                Trois 7 (toujours actif)
              </span>
              {room.enableDoubleKora && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                  Double Kora (×4)
                </span>
              )}
              {room.enableUnder21 && (
                <span className="px-2 py-0.5 rounded-md bg-slate-500/20 text-slate-300 font-bold border border-slate-500/30">
                  Moins de 21
                </span>
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
                            <span className="text-xs font-black px-1 rounded bg-amber-400 text-slate-950 uppercase">
                              Moi
                            </span>
                          )}
                          {isMe && isLoggedIn && (
                            <span className="text-xs font-black px-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-0.5" title="Google lié">
                              <Check className="w-2 h-2" /> Google
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-400 truncate">
                          {p.isHost ? 'Hôte' : p.isHuman ? 'Humain' : 'Robot'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {!isMe && p.isHuman && (
                        isFriend ? (
                          <span
                            className="h-7 px-2 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1 select-none"
                            title="Ce joueur fait partie de tes amis"
                          >
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span>Ami</span>
                          </span>
                        ) : isPendingSent ? (
                          <span
                            className="h-7 px-2 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center gap-1 select-none"
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
                                  setHubSuccessMsg(`Demande acceptée ! ${p.name} est maintenant ton ami.`);
                                  triggerHaptic('success');
                                  setTimeout(() => setHubSuccessMsg(null), getPublicParamNumber('uiToastLongDurationMs'));
                                } catch (e: any) {
                                  setHubErrorMsg(e?.message || 'La demande n\'a pas pu être acceptée. Réessaie.');
                                } finally {
                                  setFriendActionPendingMap((prev) => ({ ...prev, [p.id]: false }));
                                }
                              }
                            }}
                            className="h-7 px-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 text-slate-950 text-xs font-bold hover:brightness-110 transition cursor-pointer shadow-xs"
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
                            className="h-7 px-2 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold hover:bg-amber-500 hover:text-slate-950 transition cursor-pointer flex items-center gap-1"
                            title="Ajouter en ami"
                          >
                            <UserPlus className="w-3 h-3" />
                            <span>{isActing ? '...' : '+ Ami'}</span>
                          </button>
                        )
                      )}

                      {p.isHost ? (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Hôte
                        </span>
                      ) : p.isReady ? (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                          <Check className="w-2.5 h-2.5" /> Prêt
                        </span>
                      ) : (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                          Attente
                        </span>
                      )}
                      {room.hostId === localPlayerId && !p.isHost && p.isHuman && onKickPlayer && (
                        <button
                          type="button"
                          onClick={() => onKickPlayer(p.id)}
                          className="ml-1 text-slate-500 hover:text-rose-400 p-1 rounded-full hover:bg-rose-500/10 transition cursor-pointer"
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
                    <div className="w-9 h-9 rounded-full border border-dashed border-slate-700 bg-slate-800 flex items-center justify-center text-slate-600 text-xs">
                      👤
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-slate-500">Siège libre</span>
                      <span className="text-xs text-slate-600">
                        {room.fillWithBots ? 'Complété par un bot au lancement' : 'En attente d’un joueur...'}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-600 border border-slate-800">
                    Libre
                  </span>
                </div>
              ))}
            </div>

            {/* Dedicated Spectators Area in Lobby */}
            {spectators.length > 0 && (
              <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 flex flex-col gap-2 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5" />
                    <span>Observateurs en direct ({spectators.length})</span>
                  </span>
                  {isLocalSpectator && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-950 text-slate-300 border border-slate-500/30">
                      Tu es observateur
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
                            ? 'bg-slate-950/80 border border-slate-500/40 text-slate-200'
                            : 'bg-slate-900 border border-slate-800 text-slate-300'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                        <span className="font-semibold truncate max-w-[120px]">
                          {spec.name.replace(/\s*\(Obs\)$/, '')}
                        </span>
                        {isMe && (
                          <span className="text-xs font-black text-slate-300 uppercase">(Moi)</span>
                        )}
                        {room.hostId === localPlayerId && !isMe && onKickPlayer && (
                          <button
                            type="button"
                            onClick={() => onKickPlayer(spec.id)}
                            className="ml-1 text-slate-500 hover:text-rose-400 p-0.5 rounded-full hover:bg-rose-500/10 transition cursor-pointer"
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
            <span className="px-2 py-0.5 rounded-full bg-white/20 text-xs">Partager</span>
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
            <div className="p-3 rounded-2xl bg-gradient-to-r from-emerald-500/25 to-emerald-500/25 border border-emerald-500/50 text-emerald-200 flex items-center justify-between gap-3 shadow-lg shadow-emerald-500/10 animate-in fade-in slide-in-from-top duration-300">
              <div className="flex items-center gap-2.5 min-w-0">
                <PlayerAvatar
                  avatarId={(friendAcceptedToast.avatarId as any) || 'avatar_1'}
                  size="sm"
                  className="w-8 h-8 shrink-0 ring-2 ring-emerald-400"
                />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-black text-white truncate">
                    {friendAcceptedToast.name} a accepté ta demande !
                  </span>
                  <span className="text-xs text-emerald-300/90 font-medium truncate">
                    Vous êtes désormais amis.
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
          {(
          <NativeSegmentedNav
            tabs={multiplayerTabs}
            activeTab={activeTab}
            onChange={(tabId) => {
              setActiveTab(tabId);
              triggerHaptic('light');
            }}
            ariaLabel="Navigation multijoueur"
          />
          )}

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
                    <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-rose-500/30 text-rose-200 font-bold shrink-0">
                      Expire dans {Math.max(1, Math.ceil((activeSanction.expiresAt - Date.now()) / 60000))} min
                    </span>
                  )}
                </div>
                <p className="text-xs text-rose-200 font-medium">
                  {activeSanction.reason}
                </p>
                <p className="text-xs text-rose-300/80">
                  Les abandons répétés en cours de partie limitent tes accès aux salons multijoueurs.
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
          {/* PILIER 1 : ⚡ JOUER (Partie rapide + Code + Créer Table)              */}
          {/* ===================================================================== */}
          {activeTab === 'play' && (
            <div className="flex flex-col gap-3.5">
              {/* Hero Card : Créer un Salon personnalisé (Carte Héros Émeraude) */}
              <div className="p-5 rounded-3xl bg-gradient-to-br from-emerald-500/20 via-slate-900 to-slate-900 border border-emerald-500/40 shadow-xl flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <Crown className="w-3.5 h-3.5 fill-emerald-400 text-emerald-400" /> Salon personnalisé
                    </span>
                    <h2 className="text-lg sm:text-xl font-black text-white">Créer une table</h2>
                    <p className="text-xs text-slate-300">
                      Publique libre · Privée avec Google · Choisis les règles et les mises.
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
                    <Crown className="w-6 h-6 text-emerald-400 fill-emerald-400/20" />
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
                  className="w-full h-12 rounded-2xl bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-400 hover:from-emerald-300 text-slate-950 text-sm font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition active:scale-98 cursor-pointer"
                >
                  <PlusCircle className="w-4.5 h-4.5 text-slate-950" />
                  <span>+ Créer une table</span>
                </button>
              </div>

              {/* Action Card 1 : Rejoindre par code */}
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-md flex flex-col gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                    <KeyRound className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <h3 className="text-xs sm:text-sm font-black text-white truncate">Rejoindre par code</h3>
                    <p className="text-xs text-slate-400 truncate">Saisis le code à 4 lettres partagé</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    disabled={isLoading}
                    maxLength={6}
                    value={roomCodeInput}
                    onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                    placeholder="Ex. : K8T4"
                    className="flex-1 min-w-0 h-12 px-4 rounded-xl bg-slate-950 border border-slate-700 text-white font-black text-lg text-center tracking-[0.25em] uppercase focus:outline-none focus:border-amber-400 disabled:opacity-60"
                  />
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={handlePasteClipboard}
                    title="Coller depuis le presse-papier"
                    className="h-12 px-3 shrink-0 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <ClipboardPaste className="w-4 h-4" />
                  </button>
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
                    Rejoindre la table
                  </button>
                )}
              </div>

              {/* Card 3 : Automatique Instantané (Partie rapide - Carte Réduite) */}
              <div className="p-4 rounded-2xl bg-slate-900/90 border border-amber-500/30 shadow-md flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsQuickMatchExpanded((prev) => !prev);
                    triggerHaptic('light');
                  }}
                  className="w-full flex items-center justify-between gap-3 text-left cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
                      <Zap className="w-5 h-5 text-amber-400 fill-amber-400" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-xs sm:text-sm font-black text-white truncate group-hover:text-amber-300 transition-colors">Partie rapide</h3>
                        <span className="hidden min-[400px]:inline text-xs font-black uppercase px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Automatique
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 truncate">
                        Trouve instantanément des adversaires ou démarre avec des bots.
                      </p>
                    </div>
                  </div>

                  <ChevronDown
                    className={`w-5 h-5 text-slate-400 transition-transform duration-200 shrink-0 group-hover:text-amber-400 ${
                      showExpanded ? 'rotate-180 text-amber-400' : 'rotate-0'
                    }`}
                  />
                </button>

                {showExpanded && (
                  <>
                    {/* Jetons Bet Selector Pills */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
                        <Coins className="w-3.5 h-3.5 text-amber-400" /> Choisir la mise en jetons :
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
                            className={`h-8 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-1 ${
                              quickMatchBet === bet
                                ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/20'
                                : 'bg-slate-950 text-slate-300 border border-slate-800 hover:bg-slate-800'
                            }`}
                          >
                            <span>{bet}</span>
                            <span className="text-xs opacity-80">jetons</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Quick Match Action / Countdown / Progressive Wait */}
                    {isQuickMatching ? (
                      quickMatchTimer > 0 ? (
                        <div className="flex flex-col gap-2">
                          <div className="w-full h-11 rounded-xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-between px-3">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
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
                          <span className="text-xs text-slate-400 text-center">
                            Si aucune table n'est trouvée, la partie démarre avec des bots.
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
                        className="w-full h-10 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 hover:from-amber-300 text-slate-950 text-xs font-black flex items-center justify-center gap-2 shadow-md shadow-amber-500/20 transition active:scale-98 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-slate-950" />
                        <span>Lancer la recherche ({quickMatchBet} jetons)</span>
                      </button>
                    )}

                  </>
                )}
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
                    className={`h-8 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center ${
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
                    className={`h-8 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center ${
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
                    className={`h-8 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center ${
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
                  <div className="w-16 h-16 rounded-full bg-slate-500/10 flex items-center justify-center mb-2">
                    <Globe className="w-8 h-8 text-slate-400 opacity-80" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <h3 className="text-sm font-black text-slate-200">Aucune table disponible</h3>
                    <p className="text-xs text-slate-400 max-w-[250px] leading-relaxed">
                      Aucune table publique ne correspond à tes critères. Crée ta propre table et laisse les autres te rejoindre !
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
                  {(() => {
                    const activeRooms = filteredRooms.filter((r) => !r.hostAbsent);
                    const waitingRooms = filteredRooms.filter((r) => r.hostAbsent);

                    const renderRoomCard = (r: PublicRoomSummary, idx: number) => {
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
                                <span className="text-xs text-slate-400">Code #{r.id}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 flex-wrap justify-end">
                              {/* Host absent badge */}
                              {r.hostAbsent && (
                                <span className="text-xs font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                                  <Clock className="w-2.5 h-2.5 text-amber-300 animate-spin" />
                                  Hôte absent
                                </span>
                              )}

                              {/* Status Pill */}
                              {isPlaying ? (
                                r.status === 'MANCHE_OVER' ? (
                                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-300 border border-slate-500/40 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                    Fin de manche
                                  </span>
                                ) : canReplaceBot ? (
                                  <span className="text-xs font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 animate-pulse">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                    Place libre
                                  </span>
                                ) : (
                                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-300 border border-slate-500/40 flex items-center gap-1">
                                    <Eye className="w-2.5 h-2.5 text-slate-300" />
                                    En direct
                                  </span>
                                )
                              ) : (
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                  Salon
                                </span>
                              )}

                              {/* Human vs Bot Badge */}
                              <span
                                className={`text-xs font-black px-2 py-0.5 rounded-full border ${
                                  !r.fillWithBots
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                    : 'bg-slate-500/20 text-slate-300 border-slate-500/40'
                                }`}
                              >
                                {!r.fillWithBots ? '👥 Humains' : '🤖 Mixte'}
                              </span>
                              <span className="text-xs font-black text-amber-400">Mise : {r.baseBet} jetons</span>
                            </div>
                          </div>

                          {/* Line 2: Details & Badges */}
                          <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
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
                                    <span className="text-amber-300 font-bold">Relais : {r.prorataCapitalEstimate} jetons</span>
                                  </>
                                )}
                                {Boolean(r.spectatorsCount) && (
                                  <>
                                    <span>·</span>
                                    <span className="text-slate-400">{r.spectatorsCount} spectateur(s)</span>
                                  </>
                                )}
                              </>
                            ) : (
                              <>
                                <span>{Math.min(r.maxPlayers, r.playersCount)}/{r.maxPlayers} Joueurs</span>
                                <span>·</span>
                                <span>Capital : <strong className="text-slate-300 font-bold">{r.initialCapital || 100} jetons</strong></span>
                              </>
                            )}
                            {r.enableDoubleKora && <span>· <span className="text-emerald-400 font-bold">Double Kora</span></span>}
                            {r.enableUnder21 && <span>· <span className="text-slate-400 font-bold">Moins de 21</span></span>}
                          </div>

                          {/* Host absent detailed timestamp subtitle */}
                          {r.hostAbsent && (
                            <div className="text-xs text-amber-300/90 font-mono flex items-center gap-1.5 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
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
                                ? 'bg-gradient-to-r from-emerald-500 to-emerald-500 hover:from-emerald-400 hover:to-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20'
                                : isPlaying
                                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-500/30'
                                : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20'
                            }`}
                          >
                            {isLobbyFull ? (
                              'Table complète (4/4)'
                            ) : isPlaying && canReplaceBot ? (
                              <>
                                <UserPlus className="w-3.5 h-3.5" />
                                <span>Prendre la place d'un bot ({r.prorataCapitalEstimate} jetons)</span>
                              </>
                            ) : isPlaying ? (
                              <>
                                <Eye className="w-3.5 h-3.5" />
                                <span>{r.status === 'MANCHE_OVER' ? 'Rejoindre (fin de manche)' : 'Regarder en direct'}</span>
                              </>
                            ) : (
                              'Rejoindre la table'
                            )}
                          </button>
                        </div>
                      );
                    };

                    return (
                      <>
                        {activeRooms.length > 0 && (
                          <div className="flex flex-col gap-2.5">
                            {waitingRooms.length > 0 && (
                              <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 px-1 pt-1">
                                <Users className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Tables actives ({activeRooms.length})</span>
                              </div>
                            )}
                            {activeRooms.map(renderRoomCard)}
                          </div>
                        )}
                        {waitingRooms.length > 0 && (
                          <div className="flex flex-col gap-2.5 mt-2">
                            <div className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5 px-1 pt-2 border-t border-slate-800/80">
                              <Clock className="w-3.5 h-3.5 text-amber-400" />
                              <span>En attente de l'hôte ({waitingRooms.length})</span>
                            </div>
                            {waitingRooms.map(renderRoomCard)}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* ===================================================================== */}
          {/* PILIER 3 : 👥 AMIS & INVITATIONS                                      */}
          {/* ===================================================================== */}
          {activeTab === 'social' && (
            <FriendsPanel
              hub={friendsHub}
              challenges={friendChallenges}
              isLoggedIn={isLoggedIn}
              profile={profile}
              localPlayerId={localPlayerId}
              playerName={playerName}
              room={room}
              isAuthLoading={isAuthLoading}
              onJoinRoomCode={(code) => void handleJoin(code)}
              onGoogleSignIn={handleGoogleSignIn}
              incomingInvitations={incomingInvitations}
              onAcceptInvite={handleAcceptInvite}
              onDeclineInvite={handleDeclineInvite}
              setHubErrorMsg={setHubErrorMsg}
              setHubSuccessMsg={setHubSuccessMsg}
              showAddFriendModal={showAddFriendModal}
              setShowAddFriendModal={setShowAddFriendModal}
              showQrModal={showQrModal}
              setShowQrModal={setShowQrModal}
            />
          )}
        </main>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1 : REJOINDRE PAR CODE                                              */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {showJoinCodeModal && (
          <div className="fixed inset-0 z-[70] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-4 sm:p-5 shadow-2xl flex flex-col gap-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-amber-400" />
                  <h3 className="text-base font-black text-white">Rejoindre par code</h3>
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
                <label className="text-xs text-slate-400 font-bold">Code de la table (4 à 6 lettres)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    disabled={isLoading}
                    maxLength={6}
                    value={roomCodeInput}
                    onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                    placeholder="Ex. : K8T4"
                    className="flex-1 min-w-0 h-12 px-4 rounded-xl bg-slate-950 border border-slate-700 text-white font-black text-lg text-center tracking-[0.25em] uppercase focus:outline-none focus:border-amber-400 disabled:opacity-60"
                  />
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={handlePasteClipboard}
                    title="Coller depuis le presse-papier"
                    className="h-12 px-3 shrink-0 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
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
                  Rejoindre la table
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
          <div className="fixed inset-0 z-[70] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4">
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
                  <h3 className="text-sm sm:text-base font-black text-white">Créer une table</h3>
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
                  <span className="text-xs text-slate-400 font-bold flex items-center gap-1">
                    <Users className="w-3 h-3 text-amber-400" /> Capacité de la table
                  </span>
                  <span className="text-xs text-slate-500">2 à 4 joueurs</span>
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
                      <span className="text-xs opacity-70 leading-none">{item.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. SÉLECTEUR CENTRAL : TYPE D'ADVERSAIRES (HAUTEUR RÉDUITE & HORIZONTALE) */}
              <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400 font-bold">Type d'adversaires</span>
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
                    <span>100 % humains</span>
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
                    <span>Avec des bots</span>
                  </button>
                </div>
              </div>

              {/* 3. Visibilité de la table */}
              <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400 font-bold">Visibilité de la table</span>
                <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPublicRoom(true)}
                    className={`h-9 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 cursor-pointer transition ${
                      isPublicRoom
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
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
                    <span>Privé (code)</span>
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
                        <span className="text-xs font-bold text-white">Compte Google requis en privé</span>
                        <span className="text-xs text-slate-300 leading-tight">
                          Garantit l'accès aux invités et enregistre l'historique du salon.
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/[0.08]">
                      <button
                        type="button"
                        onClick={() => setIsPublicRoom(true)}
                        className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                      >
                        Passer en public (sans compte)
                      </button>
                      <button
                        type="button"
                        id="btn-create-modal-google-auth"
                        disabled={isAuthLoading}
                        onClick={handleGoogleSignIn}
                        className="h-6.5 px-2.5 rounded-lg bg-white hover:bg-slate-100 text-slate-950 font-black text-xs flex items-center gap-1 shadow transition active:scale-95 cursor-pointer disabled:opacity-50"
                      >
                        <GoogleIcon className="w-3 h-3" />
                        <span>{isAuthLoading ? '...' : 'Sauvegarder avec Google'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 4. Mise par partie */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-bold flex items-center gap-1">
                    <Coins className="w-3 h-3 text-amber-400" /> Mise par partie
                  </span>
                  <span className="text-xs text-slate-500">Coût de chaque partie</span>
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
                      {bet} jetons
                    </button>
                  ))}
                </div>
              </div>

              {/* 5. Capital de départ */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-bold flex items-center gap-1">
                    <Coins className="w-3 h-3 text-amber-400" /> Capital de départ
                  </span>
                  <span className="text-xs text-slate-500">Total avant élimination</span>
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
                      {cap} jetons
                    </button>
                  ))}
                </div>
              </div>

              {/* 6. Temps par tour */}
              <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400 font-bold">Temps par tour</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {getTurnTimerChoices(getPublicParamNumber('turnTimerSeconds')).map((t, idx) => (
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
                    <span className="text-xs font-bold text-white truncate">Double Kora</span>
                    <span className="text-xs text-emerald-400 font-bold">×4 gain</span>
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
                    <span className="text-xs font-bold text-white truncate">Moins de 21</span>
                    <span className="text-xs text-slate-400 font-bold">≤ 21 victoire</span>
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
                  <span>{isAuthLoading ? 'Connexion...' : 'Sauvegarder avec Google pour créer'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  id="btn-confirm-create-room"
                  disabled={isLoading}
                  onClick={() => handleCreate()}
                  className="w-full h-13 sm:h-14 rounded-2xl bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-400 hover:from-emerald-300 hover:via-emerald-400 hover:to-emerald-300 text-slate-950 font-black text-xs sm:text-sm tracking-wide transition-all duration-150 active:scale-[0.98] cursor-pointer shadow-[0_6px_25px_-2px_rgba(16,185,129,0.55)] hover:shadow-[0_8px_30px_rgba(16,185,129,0.7)] border-t border-emerald-200/60 border-b-2 border-emerald-700/50 flex items-center justify-between px-4 sm:px-5 disabled:opacity-50 mt-1 group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-slate-950/15 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                      <PlusCircle className="w-5 h-5 text-slate-950" />
                    </div>
                    <div className="flex flex-col text-left min-w-0">
                      <span className="font-black text-xs sm:text-sm text-slate-950 leading-tight">
                        {isLoading
                          ? 'Création du salon...'
                          : `Créer la table ${isPublicRoom ? 'Publique' : 'Privée'}`}
                      </span>
                      <span className="text-xs text-emerald-950/80 font-bold leading-none">
                        Lancement immédiat
                      </span>
                    </div>
                  </div>

                  <span className="px-3 py-1 rounded-xl bg-slate-950/15 border border-slate-950/20 text-slate-950 font-black text-xs flex items-center gap-1 shrink-0 shadow-inner">
                    {baseBet} jetons
                  </span>
                </button>
              )}
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


      <AuthRequirementModal
        open={showAuthRequirementModal}
        reason={authRequirementReason}
        isAuthLoading={isAuthLoading}
        onGoogleSignIn={handleGoogleSignIn}
        onClose={() => setShowAuthRequirementModal(false)}
      />

      <ActiveGameConflictModal
        conflict={activeGameConflict}
        setConflict={setActiveGameConflict}
        onReturnToGame={(code) => {
          setShowJoinCodeModal(false);
          setShowCreateModal(false);
          void handleJoin(code);
        }}
      />

    </motion.div>
  );
};
