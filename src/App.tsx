import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getPublicParamNumber } from './services/publicConfig';
import { AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { Card, GameState, Player, SavedManche, AIDifficulty, GamePhase, GameInvitation, SoloBetIncreaseMode } from './types';
import { DEFAULT_BASE_BET, DEFAULT_INITIAL_CAPITAL } from './utils/deck';
import { sounds, triggerHaptic } from './utils/sound';

// Custom Hooks
import { usePwaInstall } from './hooks/usePwaInstall';
import { useSoloGameEngine, buildPlayerList } from './hooks/useSoloGameEngine';
import { useGamePersistence, sanitizeLoadedGameState } from './hooks/useGamePersistence';
import { useMultiplayerGame } from './hooks/useMultiplayerGame';
import { useAutoUpdate } from './hooks/useAutoUpdate';

// UI Components
import { Scoreboard } from './components/Scoreboard';
import { TrickHistoryBanner } from './components/TrickHistoryBanner';
import { OpponentsHistoryBoard } from './components/OpponentsHistoryBoard';
import { HumanHand } from './components/HumanHand';
import { RulesModal } from './components/RulesModal';
import { GameRulesScreen, RulesTabType } from './components/rules/GameRulesScreen';
import { EndRoundModal } from './components/EndRoundModal';
import { GameSetupModal } from './components/GameSetupModal';
import { InstallPwaModal } from './components/InstallPwaModal';
import { HomeScreen } from './components/HomeScreen';
import { MultiplayerScreen } from './components/multiplayer/MultiplayerScreen';
import { DirectInviteToast } from './components/multiplayer/DirectInviteToast';
import { JoinProgressIndicator } from './components/multiplayer/JoinProgressIndicator';
import { SavedSessionsModal } from './components/SavedSessionsModal';
import { QuitConfirmationModal } from './components/QuitConfirmationModal';
import { PlayZoneFelt } from './components/PlayZoneFelt';
import { KoraHunterAlertBanner } from './components/KoraHunterAlertBanner';
import { KoraVictoryOverlay } from './components/KoraVictoryOverlay';
import { SoloPauseOverlay } from './components/SoloPauseOverlay';
import { GameHeader } from './components/GameHeader';
import { IntegrationProposalWidget } from './components/IntegrationProposalWidget';
import { CapacityExtensionProposalWidget } from './components/CapacityExtensionProposalWidget';
import { EarlyCloseProposalWidget } from './components/EarlyCloseProposalWidget';
import { UpdateNotificationBanner } from './components/UpdateNotificationBanner';
import { PlayerProfileProvider, usePlayerProfile } from './context/PlayerProfileContext';
import { InvitationsProvider, useInvitations } from './context/InvitationsContext';
import { PlayerProfileScreen } from './components/profile/PlayerProfileScreen';
import { GlobalLeaderboardModal } from './components/leaderboard/GlobalLeaderboardModal';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { TopNotificationStack } from './components/common/TopNotificationStack';
import { NotificationViewport, useNotify } from './components/common/NotificationCenter';
import { PushOptInBanner, usePushOptIn } from './components/PushOptInBanner';
import { telemetryService } from './services/telemetryService';
import { wsService } from './services/websocketService';
import { FriendService } from './services/friendService';
import { pushNotificationService } from './services/pushNotificationService';
import { onIdentityChange } from './services/identity';
import { syncPwaIdentityFromLocation } from './katika/utils/pwaManifestSwitcher';
import { auth } from './lib/firebase';

// Lazy loaded heavy components (Admin cockpit, test suites)
const KatikaApp = React.lazy(() =>
  import('./katika/KatikaApp').then((m) => ({ default: m.KatikaApp }))
);
const TestModeModal = React.lazy(() =>
  import('./components/TestModeModal').then((m) => ({ default: m.TestModeModal }))
);

// Icons
import {
  FastForward,
  Sparkles,
  Shield,
  Eye,
  UserPlus,
  Users,
  LogOut,
  Clock,
  Coins,
  RefreshCw,
} from 'lucide-react';

export function App() {
  // Katika Route & Mobile Copilot Detection
  const [isKatikaRoute, setIsKatikaRoute] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const path = window.location.pathname.toLowerCase();
    const search = window.location.search.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    return (
      path.startsWith('/katika') ||
      path.startsWith('/copilot') ||
      search.includes('katika') ||
      search.includes('copilot') ||
      hash.includes('katika') ||
      hash.includes('copilot')
    );
  });

  useEffect(() => {
    const handleLocationChange = () => {
      const path = window.location.pathname.toLowerCase();
      const search = window.location.search.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      setIsKatikaRoute(
        path.startsWith('/katika') ||
        path.startsWith('/copilot') ||
        search.includes('katika') ||
        search.includes('copilot') ||
        hash.includes('katika') ||
        hash.includes('copilot')
      );
      syncPwaIdentityFromLocation();
    };

    syncPwaIdentityFromLocation();
    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  // If on /katika route, render Katika Cockpit App
  if (isKatikaRoute) {
    return (
      <React.Suspense
        fallback={
          <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-100">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3"></div>
            <p className="text-sm font-medium text-slate-400">Chargement du Cockpit Katika...</p>
          </div>
        }
      >
        <KatikaApp />
      </React.Suspense>
    );
  }

  return (
    <PlayerProfileProvider>
      <InvitationsProvider>
        <GameApp />
      </InvitationsProvider>
    </PlayerProfileProvider>
  );
}

function GameApp() {
  const {
    isProfileModalOpen,
    setIsProfileModalOpen,
    isLeaderboardOpen,
    setIsLeaderboardOpen,
    recordPartieResult,
    recordGameResult,
    registerFairPlayIncident,
    chips,
    activeSanction,
  } = usePlayerProfile();

  // Screen Routing
  const [currentScreen, setCurrentScreen] = useState<'HOME' | 'GAME'>('HOME');

  // Game Settings State
  const [opponentCount, setOpponentCount] = useState<number>(() => {
    const saved = localStorage.getItem('njambo_opponent_count');
    return saved ? parseInt(saved, 10) : 3;
  });
  const [previousOpponentCount, setPreviousOpponentCount] = useState<number>(opponentCount);
  const [baseBet, setBaseBet] = useState<number>(() => {
    const saved = localStorage.getItem('njambo_base_bet');
    return saved ? parseInt(saved, 10) : DEFAULT_BASE_BET;
  });
  const [initialCapital, setInitialCapital] = useState<number>(() => {
    const saved = localStorage.getItem('njambo_initial_capital');
    return saved ? parseInt(saved, 10) : DEFAULT_INITIAL_CAPITAL;
  });

  // UI Modals State
  const [showRulesModal, setShowRulesModal] = useState<boolean>(false);
  const [rulesInitialTab, setRulesInitialTab] = useState<RulesTabType>('express');
  const [showSetupModal, setShowSetupModal] = useState<boolean>(false);
  const [showSavedSessionsModal, setShowSavedSessionsModal] = useState<boolean>(false);
  const [showTestModeModal, setShowTestModeModal] = useState<boolean>(false);
  const [showQuitModal, setShowQuitModal] = useState<boolean>(false);
  const { notify } = useNotify();
  const [useDiamondLayout, setUseDiamondLayout] = useState<boolean>(() => {
    return localStorage.getItem('njambo_diamond_layout') === 'true';
  });
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Messages admin (Katika) : mêmes toasts que le reste de l'app, dans la file unique.
  useEffect(() => {
    const unsub = wsService.onAdminMessage((data) => {
      sounds.playCutSlash();
      notify({
        tone: data.isPrivate ? 'private' : 'admin',
        title: `${data.senderName} • ${data.isPrivate ? 'Message privé' : 'Message global'}`,
        message: data.text,
        durationMs: 7000,
      });
    });
    return () => unsub();
  }, [notify]);

  // Messages d'information du serveur (avertissement de connexion, invitation transmise…).
  useEffect(() => {
    const unsub = wsService.onServerNotification((text) => {
      notify({ message: text, tone: text.includes('⚠️') ? 'warning' : 'info', durationMs: 6000 });
    });
    return () => unsub();
  }, [notify]);

  const triggerToast = useCallback(
    (msg: string) => {
      notify(msg);
    },
    [notify]
  );

  // Lot 4 - Multiplayer accounting through onPartieResults
  useEffect(() => {
    const unsub = wsService.onPartieResults(async (results) => {
      console.log('[App] Received partie results:', results);
      const ackedIds: string[] = [];
      const localPlayerId = wsService.getLocalPlayerId();
      const currentUserUid = auth.currentUser?.uid;

      for (const result of results) {
        const localParticipant = result.participants.find(
          (p) => p.playerId === localPlayerId || (currentUserUid && p.playerId === currentUserUid)
        );

        if (!localParticipant) {
          console.log(`[App] Local player not found in participants for result ${result.id}. Skipping and acking.`);
          ackedIds.push(result.id);
          continue;
        }

        const isWinner = result.winnerId === localParticipant.playerId;
        const winnerPart = result.winnerId ? result.participants.find((p) => p.playerId === result.winnerId) : null;
        const winnerName = winnerPart ? winnerPart.name : 'Table Katika';

        const passWinType = result.winType === 'EARLY_CLOSE' ? 'STANDARD' : result.winType;

        const opponents = result.participants
          .filter((p) => p.playerId !== localParticipant.playerId)
          .map((p) => ({
            id: p.playerId,
            name: p.name,
            isHuman: p.isHuman,
            delta: p.net,
          }));

        // Track last received gross for current room to pass to recordGameResult (MANCHE record)
        if (result.roomId) {
          lastReceivedMultiplayerPotGrossRef.current = localParticipant.gross;
        }

        try {
          await recordPartieResult({
            id: 'res_' + result.id,
            mode: 'MULTIPLAYER',
            partieNumber: result.partieCount,
            playerCount: result.participants.length,
            winType: passWinType as any,
            isWinner,
            winnerId: result.winnerId || undefined,
            winnerName,
            potWon: localParticipant.gross,
            netChipsDelta: localParticipant.net,
            baseBet: result.baseBet,
            roomId: result.roomId,
            tricksWon: localParticipant.tricksWon || 0,
            opponents,
            settlement: { gross: localParticipant.gross, net: localParticipant.net },
          });
          ackedIds.push(result.id);
        } catch (err) {
          console.error('[App] Failed to record partie result', result.id, err);
          // Stop processing further results, do not ack the current or subsequent ones.
          break;
        }
      }

      if (ackedIds.length > 0) {
        console.log('[App] Acking partie results:', ackedIds);
        wsService.ackPartieResults(ackedIds);
      }
    });

    return () => unsub();
  }, [recordPartieResult]);

  // PWA Install Hook
  const {
    showInstallModal,
    setShowInstallModal,
    isPwaInstalled,
    handleInstallClick,
    deferredInstallPrompt,
  } = usePwaInstall();

  // Solo Game Engine Hook
  const {
    gameState,
    setGameState,
    remainingDeckCount,
    soundEnabled,
    setSoundEnabled,
    gameSpeed,
    toggleGameSpeed,
    ambienceEnabled,
    toggleAmbience,
    autoPlaySingleCard,
    toggleAutoPlay,
    activeEmotes,
    sendEmote,
    isResolvingTrick,
    isCollectingTrick,
    isDealing,
    instantWinReveal,
    showKoraVictoryOverlay,
    dismissKoraVictoryOverlay,
    dismissKoraHunterAlert,
    triggerKoraHunterAlertManually,
    isSoloPaused,
    setIsSoloPaused,
    resumeSoloGame,
    startNewPartie,
    startNewManche,
    handlePlayCard,
    handleFoldRound,
    handleSelectCard,
    handleValidateCard,
    simulateToEnd,
    handleProposeBetIncreaseSolo,
    handleRespondBetIncreaseSolo,
    handleCancelBetIncreaseSolo,
  } = useSoloGameEngine({
    initialOpponentCount: opponentCount,
    initialBaseBet: baseBet,
    initialCap: initialCapital,
  });

  // Persistence Hook
  const handleSessionLoaded = useCallback((targetSession: SavedManche) => {
    setOpponentCount(targetSession.opponentCount || (targetSession.gameState.players ? targetSession.gameState.players.length - 1 : 3));
    setBaseBet(targetSession.baseBet || DEFAULT_BASE_BET);
    setInitialCapital(targetSession.initialCapital || DEFAULT_INITIAL_CAPITAL);
    setCurrentScreen('GAME');
    setShowSavedSessionsModal(false);
  }, []);

  const {
    savedSessions,
    activeSessionId,
    setActiveSessionId,
    saveCurrentSession,
    loadSession,
    deleteSession,
    renameSession,
    createNewSessionId,
  } = useGamePersistence(gameState, setGameState, handleSessionLoaded);

  // Multiplayer Hook
  const {
    isMultiplayerMode,
    setIsMultiplayerMode,
    multiplayerRoom,
    isWsConnected,
    showMultiplayerHub,
    setShowMultiplayerHub,
    showMultiplayerLobby,
    setShowMultiplayerLobby,
    multiplayerSelectedCardId,
    setMultiplayerSelectedCardId,
    turnRemainingSeconds,
    roundEndRemainingSeconds,
    serverErrorMessage,
    isSessionTakenOver,
    versionStatus,
    offlineNotice,
    localPlayerId,
    localPlayerName,
    isCoordinator,
    handleCreateRoom,
    handleJoinRoom,
    handleQuickMatch,
    handleStartMultiplayerGame,
    handleToggleReady,
    handlePlayMultiplayerCard,
    handleToggleFillWithBots,
    handleUpdateRoomSettings,
    handleKickPlayer,
    handleAlertUnreadyPlayers,
    handleLeaveMultiplayer,
    handleForfeitMultiplayerGame,
    handleClaimForfeitVictory,
    handleFoldMultiplayerRound,
    handleTriggerKoraHunterAlert,
    handleDismissKoraHunterAlert,
    handleSendMultiplayerEmote,
    handleToggleReadyForNext,
    handleAdvancePartieDirectly,
    handleVoteStartWithBots,
    handleClaimHostRole,
    handleProposeBetIncrease,
    handleRespondBetIncrease,
    handleCancelBetIncrease,
    handleRequestIntegration,
    handleRespondIntegrationVote,
    handleProposeCapacityExtension,
    handleRespondCapacityExtension,
    handleProposeEarlyClose,
    handleRespondEarlyClose,
  } = useMultiplayerGame();

  const [dismissedVersionBanner, setDismissedVersionBanner] = useState<boolean>(false);
  const isOnlineActive = Boolean(isMultiplayerMode && multiplayerRoom?.gameState);

  // Network connection status toast feedback
  const lastProcessedEmoteIdRef = useRef<string | null>(null);

  useEffect(() => {
    const unsub = wsService.onSessionRestored(() => {
      triggerToast('Reconnexion réussie ! Vous avez repris le contrôle de votre jeu.');
      triggerHaptic('success');
    });
    return () => unsub();
  }, [triggerToast]);

  // Discrete notification when player reconnects and AI relay played trick(s) in their absence
  useEffect(() => {
    if (!isOnlineActive || !multiplayerRoom?.activeEmotes) return;
    const latestEmote = multiplayerRoom.activeEmotes[multiplayerRoom.activeEmotes.length - 1];
    if (latestEmote && latestEmote.id !== lastProcessedEmoteIdRef.current) {
      lastProcessedEmoteIdRef.current = latestEmote.id;
      if (latestEmote.text && latestEmote.text.includes("L'IA a joué") && latestEmote.text.includes(localPlayerName)) {
        const match = latestEmote.text.match(/L'IA a joué (\d+ tour[s]?) en votre absence/);
        const trickStr = match ? match[1] : '1 tour';
        triggerToast(`🤖 L'IA a joué ${trickStr} en votre absence.`);
      }
    }
  }, [isOnlineActive, multiplayerRoom?.activeEmotes, localPlayerName, triggerToast]);

  // Presence Status Synchronization with WebSocket
  useEffect(() => {
    if (isMultiplayerMode && multiplayerRoom) {
      // In a active multiplayer room, presence is auto-derived by WS room code
      return;
    }
    if (currentScreen === 'GAME' && !isMultiplayerMode) {
      wsService.setPresenceStatus('IN_SOLO');
    } else {
      wsService.setPresenceStatus('ONLINE_IDLE');
    }
  }, [currentScreen, isMultiplayerMode, multiplayerRoom]);

  // Double back-press timestamp ref on HOME screen
  const lastBackPressTimeRef = useRef<number>(0);

  // Jalon 2: Accidental Navigation Guard (Popstate / Mobile Android Back Button / Swiping)
  useEffect(() => {
    // Keep a state entry in history so popstate always fires rather than closing PWA directly
    window.history.replaceState({ screen: currentScreen, timestamp: Date.now() }, '');
    window.history.pushState({ screen: currentScreen, active: true }, '');

    const handlePopState = () => {
      // 1. If any overlay modal is open, dismiss it first in priority order
      if (showQuitModal) {
        setShowQuitModal(false);
        window.history.pushState({ screen: currentScreen, active: true }, '');
        return;
      }
      if (showRulesModal) {
        setShowRulesModal(false);
        window.history.pushState({ screen: currentScreen, active: true }, '');
        return;
      }
      if (showSavedSessionsModal) {
        setShowSavedSessionsModal(false);
        window.history.pushState({ screen: currentScreen, active: true }, '');
        return;
      }
      if (showSetupModal) {
        setShowSetupModal(false);
        window.history.pushState({ screen: currentScreen, active: true }, '');
        return;
      }
      if (showTestModeModal) {
        setShowTestModeModal(false);
        window.history.pushState({ screen: currentScreen, active: true }, '');
        return;
      }
      if (isProfileModalOpen) {
        setIsProfileModalOpen(false);
        window.history.pushState({ screen: currentScreen, active: true }, '');
        return;
      }
      if (isLeaderboardOpen) {
        setIsLeaderboardOpen(false);
        window.history.pushState({ screen: currentScreen, active: true }, '');
        return;
      }
      if (showInstallModal) {
        setShowInstallModal(false);
        window.history.pushState({ screen: currentScreen, active: true }, '');
        return;
      }
      if (showMultiplayerLobby) {
        handleLeaveMultiplayer();
        window.history.pushState({ screen: currentScreen, active: true }, '');
        return;
      }
      if (showMultiplayerHub) {
        setShowMultiplayerHub(false);
        window.history.pushState({ screen: currentScreen, active: true }, '');
        return;
      }

      // 2. If inside GAME screen, prevent abrupt exit and open confirmation modal
      if (currentScreen === 'GAME') {
        window.history.pushState({ screen: 'GAME', active: true }, '');
        setShowQuitModal(true);
        triggerToast('Partie en cours : confirmez pour quitter.');
        triggerHaptic('light');
        return;
      }

      // 3. If on HOME screen, require double-press within 2 seconds to quit
      if (currentScreen === 'HOME') {
        const now = Date.now();
        if (now - lastBackPressTimeRef.current < 2000) {
          // Allow default pop/exit
          return;
        }
        lastBackPressTimeRef.current = now;
        window.history.pushState({ screen: 'HOME', active: true }, '');
        triggerToast('Appuyez à nouveau pour quitter');
        triggerHaptic('light');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [
    currentScreen,
    showQuitModal,
    showRulesModal,
    showSavedSessionsModal,
    showSetupModal,
    showTestModeModal,
    showInstallModal,
    isProfileModalOpen,
    isLeaderboardOpen,
    showMultiplayerHub,
    showMultiplayerLobby,
    setIsProfileModalOpen,
    setIsLeaderboardOpen,
    setShowInstallModal,
    setShowMultiplayerHub,
    setShowMultiplayerLobby,
    handleLeaveMultiplayer,
    triggerToast,
  ]);

  // Jalon 2: Accidental Tab Close / Reload Guard (beforeunload)
  useEffect(() => {
    const isGameActive =
      currentScreen === 'GAME' &&
      ((isOnlineActive && multiplayerRoom?.status === 'PLAYING') ||
        (!isOnlineActive && gameState.phase === 'PLAYING'));

    if (!isGameActive) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Une manche est en cours. Si vous quittez, vous risquez un forfait.';
      return e.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [currentScreen, isOnlineActive, multiplayerRoom?.status, gameState.phase]);

  // Jalon 2: Keyboard Escape Key Guard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showQuitModal) {
          setShowQuitModal(false);
          return;
        }
        if (showRulesModal) {
          setShowRulesModal(false);
          return;
        }
        if (showSavedSessionsModal) {
          setShowSavedSessionsModal(false);
          return;
        }
        if (showSetupModal) {
          setShowSetupModal(false);
          return;
        }
        if (showTestModeModal) {
          setShowTestModeModal(false);
          return;
        }
        if (isProfileModalOpen) {
          setIsProfileModalOpen(false);
          return;
        }
        if (showMultiplayerHub || showMultiplayerLobby) {
          setShowMultiplayerHub(false);
          setShowMultiplayerLobby(false);
          return;
        }
        if (currentScreen === 'GAME') {
          setShowQuitModal(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    currentScreen,
    showQuitModal,
    showRulesModal,
    showSavedSessionsModal,
    showSetupModal,
    showTestModeModal,
    isProfileModalOpen,
    showMultiplayerHub,
    showMultiplayerLobby,
    setIsProfileModalOpen,
    setShowMultiplayerHub,
    setShowMultiplayerLobby,
  ]);

  // Floating Direct Invitations State (Centralised via InvitationsContext)
  const {
    incomingInvitations,
    acceptInvitation,
    declineInvitation,
    dismissInvitation,
    declineAllInvitations,
    blockUserAndClearInvitations,
    onInviteFeedback,
  } = useInvitations();

  const handleBlockInvitationUnified = useCallback(
    async (invitation: GameInvitation) => {
      await blockUserAndClearInvitations(invitation.fromUserId, invitation.fromUserName);
      triggerToast(`Joueur ${invitation.fromUserName} bloqué.`);
    },
    [blockUserAndClearInvitations, triggerToast]
  );

  useEffect(() => {
    const unsub = onInviteFeedback((fb) => {
      if (fb.agree) {
        triggerToast(`${fb.responderName} a accepté votre invitation !`);
      } else {
        triggerToast(`${fb.responderName} a décliné l'invitation.`);
      }
    });
    return () => unsub();
  }, [onInviteFeedback, triggerToast]);

  // Nettoyage automatique des invitations en cours de partie
  useEffect(() => {
    const isPlayingMultiplayer = currentScreen === 'GAME' && isOnlineActive && multiplayerRoom?.gameState?.phase !== 'SETUP';
    if (isPlayingMultiplayer && incomingInvitations.length > 0) {
      declineAllInvitations();
    }
  }, [currentScreen, isOnlineActive, multiplayerRoom?.gameState?.phase, incomingInvitations.length, declineAllInvitations]);

  const handleAcceptInvitationUnified = useCallback(
    async (invitation: GameInvitation) => {
      if (currentScreen === 'GAME' && !isMultiplayerMode) {
        saveCurrentSession('Partie Solo Sauvegardée (Défi Amis)');
        triggerToast('Partie solo sauvegardée automatiquement !');
      }
      acceptInvitation(invitation);
      const res = await handleJoinRoom(invitation.roomCode, localPlayerName);
      if (res.success) {
        triggerToast(`Salon #${invitation.roomCode} rejoint !`);
      } else {
        triggerToast(res.error || "Erreur de connexion");
      }
    },
    [acceptInvitation, handleJoinRoom, localPlayerName, currentScreen, isMultiplayerMode, saveCurrentSession, triggerToast]
  );

  const handleDeclineInvitationUnified = useCallback((invitation: GameInvitation) => {
    declineInvitation(invitation);
    triggerToast('Invitation refusée');
  }, [declineInvitation, triggerToast]);

  const handleDismissInvitationUnified = useCallback((inviteId: string) => {
    dismissInvitation(inviteId);
  }, [dismissInvitation]);

  // Update App Badge on mobile home screen when invitations change
  useEffect(() => {
    pushNotificationService.setBadgeCount(incomingInvitations.length);
  }, [incomingInvitations.length]);

  // ------------------------------------------------------------------
  // Liens profonds (?join=CODE) et clics sur notifications push
  // ------------------------------------------------------------------
  const currentRoomIdRef = useRef<string | null>(null);
  useEffect(() => {
    currentRoomIdRef.current = multiplayerRoom?.id ? multiplayerRoom.id.toUpperCase() : null;
  }, [multiplayerRoom?.id]);

  // 1) Lien /game/?join=CODE (app fermée puis ouverte depuis une notification, ou lien partagé).
  //    Traité UNE seule fois ; en cas d'échec ou d'annulation le hub s'ouvre avec le code prérempli.
  const deepLinkHandledRef = useRef<boolean>(false);
  const [deepLinkWaitState, setDeepLinkWaitState] = useState<{
    active: boolean;
    roomCode: string;
    elapsedSeconds: number;
  } | null>(null);

  useEffect(() => {
    if (!deepLinkWaitState?.active) return;
    const interval = setInterval(() => {
      setDeepLinkWaitState((prev) => (prev ? { ...prev, elapsedSeconds: prev.elapsedSeconds + 1 } : null));
    }, 1000);
    return () => clearInterval(interval);
  }, [deepLinkWaitState?.active]);

  const handleCancelDeepLink = useCallback(() => {
    wsService.cancelPendingJoin();
    setDeepLinkWaitState(null);
    triggerToast('Connexion à la table annulée.');
    setShowMultiplayerHub(true);
    setTimeout(() => {
      try {
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch {
        // ignore
      }
    }, 400);
  }, [triggerToast, setShowMultiplayerHub]);

  useEffect(() => {
    if (deepLinkHandledRef.current) return;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const rawCode = urlParams.get('join') || urlParams.get('room');
      if (!rawCode) return;
      const cleanCode = rawCode.replace(/[^A-Za-z0-9]/g, '').trim().toUpperCase();
      if (!cleanCode) return;
      deepLinkHandledRef.current = true;

      // Ouverture depuis une notification d'invitation alors que l'app était fermée :
      // on solde l'invitation (l'invitant reçoit « accepté ») comme le fait le bouton Rejoindre.
      const inviteId = urlParams.get('inv');
      const inviterId = urlParams.get('inviter') || undefined;
      if (inviteId) {
        wsService.respondDirectInvite(inviteId, true);
      }

      setDeepLinkWaitState({ active: true, roomCode: cleanCode, elapsedSeconds: 0 });

      // Déjà assis à cette table (le lien vient d'un rafraîchissement ou d'un second clic) : rien à refaire.
      const alreadyHere = wsService.getCurrentRoom()?.id === cleanCode;
      if (alreadyHere) {
        setDeepLinkWaitState(null);
        setIsMultiplayerMode(true);
        setShowMultiplayerHub(false);
        setTimeout(() => {
          try {
            window.history.replaceState({}, document.title, window.location.pathname);
          } catch {
            // ignore
          }
        }, 400);
        return;
      }

      handleJoinRoom(cleanCode, localPlayerName).then((res) => {
        setDeepLinkWaitState((prev) => {
          if (!prev || !prev.active) return null; // already cancelled
          return null;
        });
        if (res.success) {
          triggerToast(`Table #${cleanCode} rejointe.`);
        } else {
          triggerToast(res.error || 'Connexion à la table impossible.');
          setShowMultiplayerHub(true); // le code reste prérempli tant que l'URL n'est pas nettoyée
        }
        // Nettoyage de l'URL une fois le résultat connu (évite tout rejeu au rechargement).
        setTimeout(() => {
          try {
            window.history.replaceState({}, document.title, window.location.pathname);
          } catch {
            // ignore
          }
        }, 400);
      });
    } catch {
      // ignore
    }
  }, [handleJoinRoom, localPlayerName, triggerToast, setShowMultiplayerHub]);

  // 2) Messages du service worker : clic sur une notification, renouvellement d'abonnement.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleSwMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'PUSH_SUBSCRIPTION_CHANGED') {
        pushNotificationService.syncSubscription({ id: wsService.getLocalPlayerId(), name: localPlayerName });
        return;
      }
      if (msg.type !== 'PUSH_NOTIFICATION_CLICKED') return;

      const d = msg.data || {};
      const roomCode: string | undefined = d.roomCode ? String(d.roomCode).toUpperCase() : undefined;

      // Forfait déjà prononcé : rien à rejoindre, on explique simplement.
      if (d.type === 'FORFEIT_DECLARED') {
        notify({ message: 'Vous avez été déclaré forfait sur cette table.', tone: 'warning', durationMs: 6000 });
        return;
      }
      if (!roomCode) return;

      // Déjà assis à cette table : la fenêtre a juste été ramenée au premier plan, on ne rejoint pas deux fois.
      if (currentRoomIdRef.current === roomCode) return;

      // Invitation périmée : message clair plutôt qu'un échec de connexion.
      if (d.type === 'INVITATION' && typeof d.expiresAt === 'number' && wsService.getServerTime() > d.expiresAt) {
        notify({ message: 'Cette invitation a expiré.', tone: 'warning' });
        return;
      }

      // Invitation : on répond « accepté » pour que l'invitant reçoive son retour et que l'invitation soit soldée.
      if (d.type === 'INVITATION' && d.inviteId) {
        dismissInvitation(d.inviteId);
        wsService.respondDirectInvite(d.inviteId, true);
      }

      handleJoinRoom(roomCode, localPlayerName).then((res) => {
        if (res.success) {
          triggerToast(`Table #${roomCode} rejointe.`);
        } else {
          triggerToast(res.error || 'Connexion à la table impossible.');
        }
      });
    };

    navigator.serviceWorker.addEventListener('message', handleSwMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleSwMessage);
  }, [handleJoinRoom, localPlayerName, triggerToast, notify]);

  // Demande de permission contextuelle : uniquement dans un salon en attente d'adversaires.
  const pushOptIn = usePushOptIn({
    active: Boolean(isMultiplayerMode && multiplayerRoom?.status === 'LOBBY'),
    userId: wsService.getLocalPlayerId(),
    userName: localPlayerName,
    onResult: triggerToast,
  });

  // 3) Retour dans l'app : on vide le tiroir de notifications (elles sont périmées) et le badge.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        pushNotificationService.clearDeliveredNotifications();
      }
    };
    onVisible();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // 4) Abonnement push resynchronisé au démarrage et à chaque changement d'identité (connexion Google),
  //    sans redemander la permission.
  useEffect(() => {
    const sync = () => pushNotificationService.syncSubscription({ id: wsService.getLocalPlayerId(), name: localPlayerName });
    sync();
    const unsub = onIdentityChange(sync);
    return () => unsub();
  }, [localPlayerName]);

  // Synchronisation des messages hors-ligne : toast de succès dans la file unique.
  useEffect(() => {
    if (offlineNotice) notify({ message: offlineNotice, tone: 'success', dedupeKey: 'offline-sync' });
  }, [offlineNotice, notify]);

  // Auto-Update Engine (Checks for newly deployed builds seamlessly)
  const isGamePlaying = currentScreen === 'GAME';
  const {
    updateAvailable,
    isReloading: isAppReloading,
    forceReload,
  } = useAutoUpdate(isGamePlaying);

  // Banner to allow sole remaining human to claim victory against bots
  const [dismissedForfeitBanner, setDismissedForfeitBanner] = useState<boolean>(false);

  useEffect(() => {
    if (!isOnlineActive || multiplayerRoom?.status === 'LOBBY') {
      setDismissedForfeitBanner(false);
    }
    // Record human opponents to recent players list
    if (multiplayerRoom?.players) {
      multiplayerRoom.players.forEach((p) => {
        if (p.isHuman && p.id !== localPlayerId) {
          FriendService.addRecentPlayer({
            id: p.id,
            name: p.name,
            avatarSeed: p.avatarSeed,
          });
        }
      });
    }
  }, [isOnlineActive, multiplayerRoom?.id, multiplayerRoom?.status, multiplayerRoom?.players, localPlayerId]);

  const isSoleHumanAgainstBots = useMemo(() => {
    if (!isOnlineActive || !multiplayerRoom || !multiplayerRoom.gameState) return false;
    if (multiplayerRoom.status === 'LOBBY' || multiplayerRoom.status === 'MANCHE_OVER') return false;
    const humanPlayers = multiplayerRoom.players?.filter((p) => p.isHuman) || [];
    const activeHumans = humanPlayers.filter((p) => !p.isEliminated && !p.isForfeit && p.connected);
    const activeBots = multiplayerRoom.players?.filter((p) => !p.isHuman && !p.isEliminated && !p.isForfeit) || [];
    const isLocalActiveHuman = activeHumans.some((p) => p.id === localPlayerId);
    return isLocalActiveHuman && activeHumans.length === 1 && humanPlayers.length >= 2 && activeBots.length > 0;
  }, [isOnlineActive, multiplayerRoom, localPlayerId]);

  const humanPotShareEstimate = useMemo(() => {
    if (!multiplayerRoom?.gameState) return 0;
    const gs = multiplayerRoom.gameState;
    const activeBots = gs.players?.filter((p) => !p.isHuman && !p.isEliminated) || [];
    const totalContributed = gs.players?.filter((p) => !p.isEliminated || p.id === localPlayerId)?.length || 0;
    const perPlayer = Math.floor(gs.pot / Math.max(1, totalContributed)) || gs.baseBet;
    const botTotal = activeBots.length * perPlayer;
    return Math.max(0, gs.pot - botTotal);
  }, [multiplayerRoom?.gameState, localPlayerId]);

  const handleDismissKoraHunterAlertUnified = useCallback(() => {
    if (isOnlineActive) {
      handleDismissKoraHunterAlert();
    } else {
      dismissKoraHunterAlert();
    }
  }, [isOnlineActive, handleDismissKoraHunterAlert, dismissKoraHunterAlert]);

  const [emoteTick, setEmoteTick] = useState<number>(Date.now());

  useEffect(() => {
    const hasEmotes =
      (isOnlineActive && multiplayerRoom?.activeEmotes && multiplayerRoom.activeEmotes.length > 0) ||
      (!isOnlineActive && activeEmotes && activeEmotes.length > 0);

    if (hasEmotes) {
      const interval = setInterval(() => {
        setEmoteTick(Date.now());
      }, 500);
      return () => clearInterval(interval);
    }
  }, [isOnlineActive, multiplayerRoom?.activeEmotes, activeEmotes]);

  const effectiveActiveEmotes = useMemo(() => {
    const now = Date.now();
    if (isOnlineActive && multiplayerRoom?.activeEmotes) {
      return multiplayerRoom.activeEmotes.filter((e) => now - e.timestamp < 3500);
    }
    return activeEmotes.filter((e) => now - e.timestamp < 3500);
  }, [isOnlineActive, multiplayerRoom?.activeEmotes, activeEmotes, emoteTick]);

  const activeGameState: GameState = isOnlineActive && multiplayerRoom?.gameState
    ? multiplayerRoom.gameState
    : gameState;

  // Rematch Dispatcher (Revanche 1-clic via Push et WebSocket)
  const handleSendMultiplayerRematch = useCallback(() => {
    if (!multiplayerRoom) return;
    const humanOpponents = multiplayerRoom.players?.filter(
      (p) => p.isHuman && p.id !== localPlayerId
    ) || [];

    if (humanOpponents.length === 0) {
      triggerToast('Aucun adversaire humain connecté pour la revanche.');
      return;
    }

    humanOpponents.forEach((opponent) => {
      wsService.sendDirectInvite(opponent.id, multiplayerRoom.id);
    });

    triggerHaptic('success');
    triggerToast(`⚔️ Défi de revanche envoyé à ${humanOpponents.length} joueur(s) !`);
  }, [multiplayerRoom, localPlayerId]);

  // Share Match Result (WhatsApp / SMS / Web Share API)
  const handleShareMatchResult = useCallback(async () => {
    if (!activeGameState) return;
    const winnerName = activeGameState.partieWinnerName || 'Un champion';
    const winType = activeGameState.partieWinType || 'KORA';
    const pot = activeGameState.pot || 0;
    const roomCode = multiplayerRoom?.id;
    const shareUrl = `${window.location.origin}${window.location.pathname}${roomCode ? `?join=${roomCode}` : ''}`;

    const diff = (activeGameState.aiDifficulty || gameState.aiDifficulty || 'NORMAL') as string;
    const modeLabel = isOnlineActive
      ? 'Multijoueur ⚔️'
      : diff === 'EASY'
      ? 'Facile 🌱'
      : diff === 'EXPERT'
      ? 'Expert 🔥'
      : diff === 'GRAND_MASTER' || diff === 'MASTER'
      ? 'Grand Katika 👑'
      : 'Normale 🎯';

    const text = `🏆 Victoire éclatante sur Njambo Katika !\n🎯 Mode : ${modeLabel}\n💥 Type : ${winType}\n🪙 Pot raflé : +${pot} jetons (par ${winnerName})\n\nRejoins la table et tente ta chance !`;
    const fallbackText = `${text}\n${shareUrl}`;

    if (navigator.share && navigator.canShare && navigator.canShare({ title: 'Njambo Katika - Résultat', text, url: shareUrl })) {
      try {
        await navigator.share({ title: 'Njambo Katika - Résultat', text, url: shareUrl });
        triggerHaptic('medium');
        return;
      } catch (e) {
        // cancelled
      }
    }

    navigator.clipboard.writeText(fallbackText);
    triggerHaptic('light');
    triggerToast('Résultat et lien de partage copiés !');
  }, [activeGameState, multiplayerRoom?.id, isOnlineActive, gameState.aiDifficulty]);

  // Unified instant win reveal for both Solo and Multiplayer
  const effectiveInstantWinReveal = isOnlineActive
    ? (multiplayerRoom?.gameState?.instantWinReveal || multiplayerRoom?.instantWinReveal || null)
    : instantWinReveal;

  // Trigger audio/haptics for multiplayer instant win reveals and victories
  const lastMpInstantRevealRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isOnlineActive) return;
    const reveal = effectiveInstantWinReveal;
    if (reveal) {
      const key = `${reveal.winType}_${reveal.winnerIndex}_${reveal.scoreOrCount}`;
      if (lastMpInstantRevealRef.current !== key) {
        lastMpInstantRevealRef.current = key;
        triggerHaptic('success');
        
        // Check if local player is the winner
        const winnerPlayer = reveal.winnerIndex !== null && reveal.winnerIndex !== undefined ? activeGameState.players[reveal.winnerIndex] : null;
        const isLocalWinner = winnerPlayer?.id === localPlayerId;
        if (isLocalWinner) {
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
          });
        }

        if (reveal.winType === 'THREE_SEVENS') {
          sounds.playThreeSevens();
        } else if (reveal.winType === 'UNDER_21') {
          sounds.playUnder21();
        }
      }
    } else {
      lastMpInstantRevealRef.current = null;
    }
  }, [isOnlineActive, effectiveInstantWinReveal, activeGameState.players, localPlayerId]);

  // Trigger audio alert for Kora Hunter alert
  const lastKoraAlertRef = useRef<boolean>(false);
  useEffect(() => {
    if (activeGameState.showKoraHunterAlert && !lastKoraAlertRef.current) {
      sounds.playKoraAlert();
      triggerHaptic('heavy');
    }
    lastKoraAlertRef.current = Boolean(activeGameState.showKoraHunterAlert);
  }, [activeGameState.showKoraHunterAlert]);

  // Audio and celebrations for multiplayer end-of-round victories (Kora, Double Kora, Standard)
  const [mpShowKoraOverlay, setMpShowKoraOverlay] = useState<boolean>(false);
  const lastMpWinTypeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOnlineActive) return;
    const phase = activeGameState.phase;
    if (phase === 'PARTIE_OVER' || phase === 'MANCHE_OVER') {
      const winType = activeGameState.partieWinType || 'STANDARD';
      const winnerIdx = activeGameState.partieWinnerIndex;
      const key = `${activeGameState.partieCount}_${winType}_${winnerIdx}`;
      if (lastMpWinTypeRef.current !== key) {
        lastMpWinTypeRef.current = key;
        triggerHaptic('success');

        const winnerPlayer = winnerIdx !== null && winnerIdx !== undefined ? activeGameState.players[winnerIdx] : null;
        const isLocalWinner = winnerPlayer?.id === localPlayerId;

        // Trigger confetti burst if local player won
        if (isLocalWinner) {
          confetti({
            particleCount: winType === 'DOUBLE_KORA' ? 180 : winType === 'KORA' ? 140 : 100,
            spread: 80,
            origin: { y: 0.6 },
          });
        }

        if (winType === 'DOUBLE_KORA') {
          sounds.playDoubleKora();
          setMpShowKoraOverlay(true);
        } else if (winType === 'KORA') {
          sounds.playKora();
          setMpShowKoraOverlay(true);
        } else if (winType === 'THREE_SEVENS') {
          sounds.playThreeSevens();
          setMpShowKoraOverlay(true);
        } else if (winType === 'UNDER_21') {
          sounds.playUnder21();
          setMpShowKoraOverlay(true);
        } else if (winType === 'FORFEIT') {
          setMpShowKoraOverlay(true);
        } else {
          sounds.playRoundVictory();
        }
      }
    } else {
      lastMpWinTypeRef.current = null;
      setMpShowKoraOverlay(false);
    }
  }, [
    isOnlineActive,
    activeGameState.phase,
    activeGameState.partieWinType,
    activeGameState.partieCount,
    activeGameState.partieWinnerIndex,
    localPlayerId,
    activeGameState.players,
  ]);

  // Telemetry recording for manche lifecycle & donnes (Solo & Multiplayer)
  const activeMancheSessionIdRef = useRef<string | null>(null);
  const mancheStartTimestampRef = useRef<number>(Date.now());
  const lastRecordedPartieKeyRef = useRef<string | null>(null);
  const humanCapitalAtDealStartRef = useRef<number | null>(null);
  const betAtDealStartRef = useRef<number | null>(null);
  const prevPhaseRef = useRef<string | null>(null);
  const lastReceivedMultiplayerPotGrossRef = useRef<number>(0);
  const recordedManchesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const phase = activeGameState.phase;
    const prevPhase = prevPhaseRef.current;
    const mode = isOnlineActive ? 'MULTIPLAYER' : 'SOLO';
    const roomId = isOnlineActive ? (multiplayerRoom?.id || 'online_room') : 'solo_game';

    // Memorize human player capital and bet at deal start in solo mode
    if (!isOnlineActive && phase === 'DEALING') {
      const humanP = (activeGameState.players || []).find(
        (p: any) => p.isHuman || p.id === 'p1' || p.id === localPlayerId
      );
      if (humanP && typeof humanP.capital === 'number') {
        humanCapitalAtDealStartRef.current = humanP.capital;
        betAtDealStartRef.current = activeGameState.baseBet || 50;
      }
    }

    // 1. Initialisation de la Manche au lancement (status: 'in_progress')
    if (currentScreen === 'GAME' && (phase === 'DEALING' || phase === 'PLAYING')) {
      if (!activeMancheSessionIdRef.current) {
        const mancheSessionId = `manche_${mode.toLowerCase()}_${roomId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        activeMancheSessionIdRef.current = mancheSessionId;
        mancheStartTimestampRef.current = Date.now();

        telemetryService
          .recordGame({
            id: mancheSessionId,
            creatorUid: auth.currentUser?.uid || localPlayerId || 'guest',
            roomId: isOnlineActive ? (multiplayerRoom?.id || roomId) : undefined,
            mancheNumber: isOnlineActive ? (multiplayerRoom?.mancheNumber || 1) : 1,
            mode,
            playerCount: activeGameState.players?.length || (multiplayerRoom?.maxPlayers || 4),
            status: 'in_progress', // « Non terminée » à l'entame
            winType: 'STANDARD',
            winnerName: 'En cours...',
            durationSeconds: 0,
            roundsCount: activeGameState.partieCount || 1,
            partiesCount: activeGameState.partieCount || 1,
            isMancheFinalWin: false,
            potWon: 0,
            aiDifficulty: mode === 'SOLO' ? (activeGameState.aiDifficulty || gameState.aiDifficulty) : undefined,
            createdAt: Date.now(),
            players: activeGameState.players?.map((p: any) => ({
              id: p.id,
              name: p.name,
              isHuman: p.isHuman ?? (p.id === 'human' || p.id === localPlayerId || p.id?.startsWith('usr_') || !p.id?.toLowerCase().includes('bot'))
            })) || [],
          })
          .catch((err) => {
            console.warn('[App] Telemetry in_progress record warning:', err);
          });
      }
    }

    // 2. Gestion des fins de donnes (PARTIE_OVER) et victoires finales de Manche (MANCHE_OVER)
    if (phase === 'PARTIE_OVER' || phase === 'MANCHE_OVER') {
      const winnerIdx = activeGameState.partieWinnerIndex ?? activeGameState.mancheWinnerIndex;
      const winnerPlayer = (winnerIdx !== null && winnerIdx !== undefined && activeGameState.players)
        ? activeGameState.players[winnerIdx]
        : null;
      const winnerName =
        activeGameState.partieWinnerName ||
        activeGameState.mancheWinnerName ||
        winnerPlayer?.name ||
        'Joueur';
      
      // Assurer que winnerId est identique chez tous les clients de la table
      let winnerId: string | undefined = undefined;
      if (winnerPlayer) {
        if (auth.currentUser && !auth.currentUser.isAnonymous && (winnerPlayer.id === localPlayerId || winnerPlayer.id === auth.currentUser.uid)) {
          winnerId = auth.currentUser.uid;
        } else {
          winnerId = winnerPlayer.id;
        }
      }

      const winType = activeGameState.partieWinType || 'STANDARD';
      const playerCount = activeGameState.players?.length || (multiplayerRoom?.maxPlayers || 4);
      const partieCount = activeGameState.partieCount || 1;

      const durationSeconds = Math.max(
        15,
        Math.round((Date.now() - (mancheStartTimestampRef.current || Date.now() - 48000)) / 1000)
      );

      const mancheKeySegment = activeMancheSessionIdRef.current || (isOnlineActive ? `m_${roomId}` : 'm_solo');
      const recordKey = `${mode}_${mancheKeySegment}_p${partieCount}_${winnerIdx}_${winType}_${phase}`;
      if (lastRecordedPartieKeyRef.current !== recordKey) {
        lastRecordedPartieKeyRef.current = recordKey;

        const isCompleted = phase === 'MANCHE_OVER';
        const effectiveRoomId = isOnlineActive ? (multiplayerRoom?.id || roomId) : undefined;
        const effectiveMancheNumber = isOnlineActive ? (multiplayerRoom?.mancheNumber || 1) : 1;
        const targetSessionId = isOnlineActive
          ? `rec_mp_${effectiveRoomId}_m${effectiveMancheNumber}_${auth.currentUser?.uid || localPlayerId}`
          : (activeMancheSessionIdRef.current || `manche_${mode.toLowerCase()}_${roomId}_${Date.now()}`);
        const baseBetValue = activeGameState.baseBet || 50;
        const effectivePot = (activeGameState.pot && activeGameState.pot > 0)
          ? activeGameState.pot
          : (baseBetValue * playerCount);

        telemetryService
          .recordGame({
            id: targetSessionId,
            creatorUid: auth.currentUser?.uid || localPlayerId || 'guest',
            roomId: effectiveRoomId,
            mancheNumber: effectiveMancheNumber,
            mode,
            playerCount,
            status: isCompleted ? 'completed' : 'in_progress', // « Terminée » uniquement si victoire de manche
            winType: winType as any,
            winnerName: isCompleted ? winnerName : 'En cours...',
            winnerId: isCompleted ? winnerId : undefined,
            durationSeconds,
            roundsCount: partieCount,
            partiesCount: partieCount,
            isMancheFinalWin: isCompleted,
            potWon: effectivePot,
            potGross: effectivePot,
            baseBet: baseBetValue,
            currency: 'CHIPS',
            aiDifficulty: mode === 'SOLO' ? (activeGameState.aiDifficulty || gameState.aiDifficulty) : undefined,
            players: activeGameState.players?.map((p: any) => ({
              id: p.id,
              name: p.name,
              isHuman: p.isHuman ?? (p.id === 'human' || p.id === localPlayerId || p.id?.startsWith('usr_') || !p.id?.toLowerCase().includes('bot')),
              isWinner: isCompleted ? (p.id === winnerId || p.name === winnerName) : undefined,
              score: p.score ?? p.capital ?? 0,
            })) || [],
          })
          .catch((err) => {
            console.warn('[App] Telemetry auto-record warning:', err);
          });

        const humanPlayerRecord = (activeGameState.players || []).find(
          (p: any) => p.isHuman || p.id === localPlayerId || p.id === 'p1' || p.id === 'human'
        );

        // Lot 4 - C: Détection gagnant en solo basée sur isHuman de l'indice gagnant
        const isLocalWinner = isOnlineActive
          ? Boolean(
              (winnerId && winnerId === localPlayerId) ||
              (winnerIdx !== null && winnerIdx !== undefined && activeGameState.players?.[winnerIdx]?.id === localPlayerId) ||
              (winnerName && (winnerName === localPlayerName || winnerName === (localStorage.getItem('njambo_player_name') || 'Joueur')))
            )
          : Boolean(
              winnerIdx !== null && winnerIdx !== undefined && activeGameState.players?.[winnerIdx]?.isHuman === true
            );

        const effectiveBaseBet = baseBetValue;
        let totalPotAttributed = 0;
        let netDelta = 0;

        if (isOnlineActive) {
          // Multijoueur : plus d'appel à recordPartieResult ni de calcul de gain de jetons ici
        } else {
          // Lot 4 - A: Jetons exacts en solo
          const finalHumanCapital = humanPlayerRecord?.capital ?? 0;
          if (
            humanCapitalAtDealStartRef.current !== null &&
            humanCapitalAtDealStartRef.current !== undefined &&
            betAtDealStartRef.current !== null &&
            betAtDealStartRef.current !== undefined
          ) {
            const initialCapital = humanCapitalAtDealStartRef.current;
            const dealBet = betAtDealStartRef.current;
            const grossReceived = finalHumanCapital - initialCapital;
            netDelta = finalHumanCapital - (initialCapital + dealBet);
            totalPotAttributed = isLocalWinner ? Math.max(0, grossReceived) : 0;
          } else {
            // Fallback si ref non mémorisée
            if (winType === 'KORA' || winType === 'DOUBLE_KORA') {
              const m = winType === 'DOUBLE_KORA' ? 4 : 2;
              netDelta = isLocalWinner
                ? m * effectiveBaseBet * (playerCount - 1)
                : -m * effectiveBaseBet;
              totalPotAttributed = isLocalWinner ? (netDelta + effectiveBaseBet) : 0;
            } else {
              totalPotAttributed = isLocalWinner ? effectivePot : 0;
              netDelta = isLocalWinner ? (effectivePot - effectiveBaseBet) : -effectiveBaseBet;
            }
          }
        }

        // Reset solo deal start refs
        humanCapitalAtDealStartRef.current = null;
        betAtDealStartRef.current = null;

        const opponentsList = (activeGameState.players || [])
          .filter((p: any) => p.id !== localPlayerId && p.name !== 'Vous')
          .map((p: any) => ({
            id: p.id,
            name: p.name,
            isHuman: p.isHuman ?? (p.id?.startsWith('usr_') || !p.id?.toLowerCase().includes('bot')),
            score: p.score ?? p.capital ?? 0,
            tricksWon: p.tricksWonInRound ?? p.tricksWon ?? 0,
          }));

        const localTricks = activeGameState.players?.find((p: any) => p.id === localPlayerId || p.name === 'Vous')?.tricksWonInRound || 0;

        // Lot 4 - B: Ne pas rappeler recordPartieResult si la donne a déjà été enregistrée à PARTIE_OVER
        const isSolo = !isOnlineActive;
        const shouldRecordPartie = isSolo && (prevPhase === 'DEALING' || prevPhase === 'PLAYING' || prevPhase === null);

        if (shouldRecordPartie) {
          recordPartieResult({
            mode,
            partieNumber: partieCount,
            playerCount,
            winType: (winType as any) || 'STANDARD',
            isWinner: isLocalWinner,
            winnerName,
            winnerId,
            potWon: totalPotAttributed,
            netChipsDelta: netDelta,
            baseBet: effectiveBaseBet,
            durationSeconds,
            opponents: opponentsList,
            tricksWon: localTricks,
            roomId: undefined,
            difficulty: mode === 'SOLO' ? (activeGameState.aiDifficulty || gameState.aiDifficulty) : undefined,
          }).catch((err) => {
            console.warn('[App] recordPartieResult warning:', err);
          });
        }

        const mancheRecordKey = isOnlineActive ? `${effectiveRoomId}_${effectiveMancheNumber}` : null;
        let shouldRecordManche = isCompleted;
        if (isCompleted && mancheRecordKey) {
          if (recordedManchesRef.current.has(mancheRecordKey)) {
            shouldRecordManche = false;
          } else {
            recordedManchesRef.current.add(mancheRecordKey);
          }
        }

        if (shouldRecordManche) {
          recordGameResult({
            recordType: 'MANCHE',
            mode,
            playerCount,
            winType: (winType as any) || 'STANDARD',
            isWinner: isLocalWinner,
            winnerName,
            winnerId,
            potWon: isOnlineActive ? (lastReceivedMultiplayerPotGrossRef.current || 0) : totalPotAttributed,
            netChipsDelta: isOnlineActive ? 0 : netDelta,
            baseBet: effectiveBaseBet,
            roundsCount: partieCount,
            durationSeconds,
            opponents: opponentsList,
            status: 'completed',
            difficulty: mode === 'SOLO' ? (activeGameState.aiDifficulty || gameState.aiDifficulty) : undefined,
          }).catch((err) => {
            console.warn('[App] recordGameResult warning:', err);
          });

          // La manche est achevée avec succès : réinitialisation pour la prochaine manche
          activeMancheSessionIdRef.current = null;
        }
      }
    }

    prevPhaseRef.current = phase;
  }, [
    currentScreen,
    isOnlineActive,
    activeGameState.phase,
    activeGameState.partieCount,
    activeGameState.partieWinnerIndex,
    activeGameState.mancheWinnerIndex,
    activeGameState.partieWinnerName,
    activeGameState.mancheWinnerName,
    activeGameState.partieWinType,
    activeGameState.players,
    activeGameState.pot,
    multiplayerRoom?.id,
    multiplayerRoom?.maxPlayers,
    localPlayerId,
    recordPartieResult,
    recordGameResult,
  ]);

  // Keep a stable ref to the latest activeGameState for async animation timeouts
  const activeGameStateRef = useRef<GameState>(activeGameState);
  useEffect(() => {
    activeGameStateRef.current = activeGameState;
  }, [activeGameState]);

  // Multiplayer visual transition states (to match the solo mode delay and card sweep animations)
  const [mpPlays, setMpPlays] = useState<any[]>([]);
  const [isMpResolvingTrick, setIsMpResolvingTrick] = useState<boolean>(false);
  const [isMpCollectingTrick, setIsMpCollectingTrick] = useState<boolean>(false);
  const [mpTrickNumber, setMpTrickNumber] = useState<number>(1);
  const [mpLeadSuit, setMpLeadSuit] = useState<any | null>(null);
  const [mpPhase, setMpPhase] = useState<GamePhase | 'LOBBY'>('PLAYING');

  // Persistent refs for multiplayer animation timers and state tracking
  const mpStep1TimerRef = useRef<NodeJS.Timeout | null>(null);
  const mpStep2TimerRef = useRef<NodeJS.Timeout | null>(null);
  const mpSafetyTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessedTrickRef = useRef<number>(1);
  const isResolvingRef = useRef<boolean>(false);

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (mpStep1TimerRef.current) clearTimeout(mpStep1TimerRef.current);
      if (mpStep2TimerRef.current) clearTimeout(mpStep2TimerRef.current);
      if (mpSafetyTimerRef.current) clearTimeout(mpSafetyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isOnlineActive) {
      if (mpStep1TimerRef.current) clearTimeout(mpStep1TimerRef.current);
      if (mpStep2TimerRef.current) clearTimeout(mpStep2TimerRef.current);
      if (mpSafetyTimerRef.current) clearTimeout(mpSafetyTimerRef.current);
      isResolvingRef.current = false;
      lastProcessedTrickRef.current = 1;
      setMpPlays([]);
      setIsMpResolvingTrick(false);
      setIsMpCollectingTrick(false);
      setMpTrickNumber(1);
      setMpLeadSuit(null);
      setMpPhase('PLAYING');
      return;
    }

    const dbTrickNumber = activeGameState.currentTrickNumber || 1;
    const dbPlays = activeGameState.currentTrick?.plays || [];
    const dbLeadSuit = activeGameState.currentTrick?.leadSuit || null;
    const dbHistory = activeGameState.tricksHistory || [];
    const dbPhase = activeGameState.phase || 'PLAYING';

    // Case 1: Reset or new round started (Trick 1 with empty history)
    if (dbTrickNumber === 1 && dbHistory.length === 0) {
      if (mpStep1TimerRef.current) clearTimeout(mpStep1TimerRef.current);
      if (mpStep2TimerRef.current) clearTimeout(mpStep2TimerRef.current);
      if (mpSafetyTimerRef.current) clearTimeout(mpSafetyTimerRef.current);
      isResolvingRef.current = false;
      lastProcessedTrickRef.current = 1;
      setMpPlays(dbPlays);
      setMpTrickNumber(1);
      setMpLeadSuit(dbLeadSuit);
      setMpPhase(dbPhase);
      setIsMpResolvingTrick(false);
      setIsMpCollectingTrick(false);
      return;
    }

    // Case 2: An animation sequence is currently in progress — let the timer callbacks handle completion
    if (isResolvingRef.current) {
      return;
    }

    // Case 3: The database has recorded a newly completed trick in tricksHistory
    const targetTrickNum = lastProcessedTrickRef.current;
    const completedTrick = dbHistory.find((t) => t.trickNumber === targetTrickNum);
    const shouldTriggerTransition =
      (dbTrickNumber > targetTrickNum || (dbPhase !== 'PLAYING' && dbHistory.length >= targetTrickNum)) &&
      completedTrick &&
      completedTrick.plays &&
      completedTrick.plays.length > 0;

    if (shouldTriggerTransition && completedTrick) {
      isResolvingRef.current = true;
      lastProcessedTrickRef.current = targetTrickNum + 1;

      // Lock playzone on completed trick with winner badge
      setMpPlays(completedTrick.plays);
      setMpLeadSuit(completedTrick.leadSuit);
      setIsMpResolvingTrick(true);
      setIsMpCollectingTrick(false);
      sounds.playTrickWin();

      // Durées réglées dans katika (groupe Partie) : la barre de sécurité laisse une marge de 400 ms
      // au-delà de la durée normale (affichage du pli + balayage), sans être elle-même un réglage séparé.
      const trickWinnerViewMs = getPublicParamNumber('trickWinnerViewMs');
      const trickSweepMs = getPublicParamNumber('trickSweepMs');

      // Fail-safe safety timer: in case anything interrupts execution, unlock after the normal duration + margin
      if (mpSafetyTimerRef.current) clearTimeout(mpSafetyTimerRef.current);
      mpSafetyTimerRef.current = setTimeout(() => {
        isResolvingRef.current = false;
        setIsMpResolvingTrick(false);
        setIsMpCollectingTrick(false);
        const latest = activeGameStateRef.current;
        setMpTrickNumber(latest.currentTrickNumber || dbTrickNumber);
        setMpPlays(latest.currentTrick?.plays || []);
        setMpLeadSuit(latest.currentTrick?.leadSuit || null);
        setMpPhase(latest.phase || dbPhase);
      }, trickWinnerViewMs + trickSweepMs + 400);

      // Step 1: Wait to allow players to view the winning card and badge (fluid UX, adaptive resolution)
      if (mpStep1TimerRef.current) clearTimeout(mpStep1TimerRef.current);
      mpStep1TimerRef.current = setTimeout(() => {
        setIsMpCollectingTrick(true);
        sounds.playCardSweep();

        // Step 2: Sweep animation
        if (mpStep2TimerRef.current) clearTimeout(mpStep2TimerRef.current);
        mpStep2TimerRef.current = setTimeout(() => {
          if (mpSafetyTimerRef.current) clearTimeout(mpSafetyTimerRef.current);
          isResolvingRef.current = false;
          setIsMpCollectingTrick(false);
          setIsMpResolvingTrick(false);
          const latest = activeGameStateRef.current;
          setMpTrickNumber(latest.currentTrickNumber || dbTrickNumber);
          setMpPlays(latest.currentTrick?.plays || []);
          setMpLeadSuit(latest.currentTrick?.leadSuit || null);
          setMpPhase(latest.phase || dbPhase);
          setMultiplayerSelectedCardId(null);
        }, trickSweepMs);
      }, trickWinnerViewMs);
    } else {
      // Case 4: Normal play update within the current ongoing trick
      lastProcessedTrickRef.current = dbTrickNumber;
      setIsMpResolvingTrick(false);
      setIsMpCollectingTrick(false);
      setMpTrickNumber(dbTrickNumber);
      setMpPlays(dbPlays);
      setMpLeadSuit(dbLeadSuit);
      setMpPhase(dbPhase);
    }
  }, [
    isOnlineActive,
    activeGameState.currentTrickNumber,
    activeGameState.currentTrick?.plays,
    activeGameState.currentTrick?.leadSuit,
    activeGameState.tricksHistory,
    activeGameState.phase,
  ]);

  // Auto-restore last active session on initial load
  useEffect(() => {
    const savedActiveId = localStorage.getItem('njambo_active_session_id');
    const savedManchesRaw = localStorage.getItem('njambo_saved_manches');

    if (savedActiveId && savedManchesRaw) {
      try {
        const parsedList: SavedManche[] = JSON.parse(savedManchesRaw);
        if (Array.isArray(parsedList)) {
          const active = parsedList.find((s) => s.id === savedActiveId);
          if (active && active.gameState) {
            const sanitized = sanitizeLoadedGameState(active.gameState);
            setGameState(sanitized);
            setOpponentCount(active.opponentCount);
            setBaseBet(active.baseBet);
            setInitialCapital(active.initialCapital);
            // Re-open in Pause mode so player can resume cleanly without unexpected AI action
            if (sanitized.phase === 'PLAYING' || sanitized.phase === 'DEALING' || sanitized.phase === 'TRICK_RESOLVED') {
              setIsSoloPaused(true);
            }
          }
        } else {
          // Clears malformed local storage keys
          localStorage.removeItem('njambo_active_session_id');
          localStorage.removeItem('njambo_saved_manches');
        }
      } catch (e) {
        console.error('Error restoring session from localStorage:', e);
        try {
          localStorage.removeItem('njambo_active_session_id');
          localStorage.removeItem('njambo_saved_manches');
        } catch (_) {}
      }
    }
  }, [setGameState, setIsSoloPaused]);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Sound toggle
  const toggleSound = () => {
    sounds.enabled = !soundEnabled;
    setSoundEnabled(!soundEnabled);
    if (!soundEnabled) {
      sounds.playCardSelect();
    }
  };

  // Layout toggle
  const toggleDiamondLayout = () => {
    setUseDiamondLayout((prev) => {
      const next = !prev;
      localStorage.setItem('njambo_diamond_layout', next.toString());
      return next;
    });
  };

  const ensureLeaveMultiplayerBeforeSolo = useCallback(() => {
    if (isMultiplayerMode || multiplayerRoom) {
      handleLeaveMultiplayer();
    }
  }, [isMultiplayerMode, multiplayerRoom, handleLeaveMultiplayer]);

  // Start new game flow with setup modal
  const handleStartGameWithSetup = useCallback(
    (
      selectedCount: number,
      selectedBet: number,
      selectedCapital: number,
      selectedEnableDoubleKora: boolean,
      selectedEnableUnder21: boolean,
      selectedShowBotIcons?: boolean,
      selectedEnableKoraHunterAlerts?: boolean,
      selectedAiDifficulty?: AIDifficulty,
      selectedSoloBetIncreaseMode?: SoloBetIncreaseMode
    ) => {
      ensureLeaveMultiplayerBeforeSolo();
      setIsMultiplayerMode(false);
      localStorage.setItem('njambo_prev_opponent_count', opponentCount.toString());
      localStorage.setItem('njambo_opponent_count', selectedCount.toString());
      if (selectedSoloBetIncreaseMode) {
        localStorage.setItem('njambo_solo_bet_increase_mode', selectedSoloBetIncreaseMode);
      }
      setPreviousOpponentCount(opponentCount);
      setOpponentCount(selectedCount);

      createNewSessionId();
      startNewManche(
        selectedCount,
        selectedBet,
        selectedCapital,
        selectedEnableDoubleKora,
        selectedEnableUnder21,
        selectedShowBotIcons,
        selectedEnableKoraHunterAlerts,
        selectedAiDifficulty || gameState.aiDifficulty || 'NORMAL',
        selectedSoloBetIncreaseMode
      );
      setCurrentScreen('GAME');
      setShowSetupModal(false);
    },
    [ensureLeaveMultiplayerBeforeSolo, setIsMultiplayerMode, opponentCount, startNewManche, createNewSessionId, gameState.aiDifficulty]
  );

  const handleSaveAndStartNewGame = useCallback(
    (
      selectedCount: number,
      selectedBet: number,
      selectedCapital: number,
      selectedEnableDoubleKora: boolean,
      selectedEnableUnder21: boolean,
      selectedShowBotIcons?: boolean,
      selectedEnableKoraHunterAlerts?: boolean,
      selectedAiDifficulty?: AIDifficulty,
      selectedSoloBetIncreaseMode?: SoloBetIncreaseMode
    ) => {
      saveCurrentSession();
      handleStartGameWithSetup(
        selectedCount,
        selectedBet,
        selectedCapital,
        selectedEnableDoubleKora,
        selectedEnableUnder21,
        selectedShowBotIcons,
        selectedEnableKoraHunterAlerts,
        selectedAiDifficulty,
        selectedSoloBetIncreaseMode
      );
    },
    [saveCurrentSession, handleStartGameWithSetup]
  );

  const handleContinueMancheWithSettings = useCallback(
    (
      newEnableDoubleKora: boolean,
      newEnableUnder21: boolean,
      newBaseBet: number,
      newShowBotIcons?: boolean,
      newEnableKoraHunterAlerts?: boolean,
      newAiDifficulty?: AIDifficulty,
      newSoloBetIncreaseMode?: SoloBetIncreaseMode
    ) => {
      ensureLeaveMultiplayerBeforeSolo();
      setIsMultiplayerMode(false);
      setShowSetupModal(false);
      setCurrentScreen('GAME');
      setBaseBet(newBaseBet);
      localStorage.setItem('njambo_base_bet', newBaseBet.toString());
      if (newSoloBetIncreaseMode) {
        localStorage.setItem('njambo_solo_bet_increase_mode', newSoloBetIncreaseMode);
      }

      const prevWinnerIdx = gameState.partieWinnerIndex ?? gameState.roundWinnerIndex;
      const nextDealerIndex = (prevWinnerIdx !== null && prevWinnerIdx !== undefined && !gameState.players[prevWinnerIdx]?.isEliminated)
        ? prevWinnerIdx
        : (gameState.dealerIndex + 1) % gameState.players.length;
      startNewPartie(
        nextDealerIndex,
        gameState.players,
        gameState.partieCount + 1,
        newBaseBet,
        gameState.initialCapital,
        newEnableDoubleKora,
        newEnableUnder21,
        newShowBotIcons ?? gameState.showBotPersonalityIcons,
        newEnableKoraHunterAlerts ?? gameState.enableKoraHunterAlerts,
        newAiDifficulty ?? gameState.aiDifficulty ?? 'NORMAL',
        newSoloBetIncreaseMode
      );
    },
    [ensureLeaveMultiplayerBeforeSolo, setIsMultiplayerMode, gameState, startNewPartie]
  );

  const handleNextPartie = () => {
    const prevWinnerIdx = gameState.partieWinnerIndex ?? gameState.roundWinnerIndex;
    const nextDealerIndex = (prevWinnerIdx !== null && prevWinnerIdx !== undefined && !gameState.players[prevWinnerIdx]?.isEliminated)
      ? prevWinnerIdx
      : (gameState.dealerIndex + 1) % gameState.players.length;
    startNewPartie(
      nextDealerIndex,
      gameState.players,
      gameState.partieCount + 1,
      gameState.baseBet,
      gameState.initialCapital,
      gameState.enableDoubleKora,
      gameState.enableUnder21
    );
  };

  const handleResetSession = () => {
    setPreviousOpponentCount(opponentCount);
    setShowSetupModal(true);
  };

  // Solo direct return home with auto-save (Proposition 1)
  const handleSoloReturnHome = useCallback(() => {
    saveCurrentSession();
    triggerHaptic('success');
    triggerToast('Manche sauvegardée automatiquement !');
    setCurrentScreen('HOME');
  }, [saveCurrentSession, triggerToast]);

  // Quit modal actions
  const handleSaveAndQuit = () => {
    saveCurrentSession();
    setShowQuitModal(false);
    triggerToast('Manche sauvegardée !');
    setCurrentScreen('HOME');
  };

  const handleQuitWithoutSave = async () => {
    // Record abandonment telemetry for analytics
    const mode = isOnlineActive ? 'MULTIPLAYER' : 'SOLO';
    const currentTrick = gameState.currentTrickNumber || 1;
    const isPostKora = gameState.partieWinType === 'KORA' || gameState.partieWinType === 'DOUBLE_KORA';
    const reason = isPostKora ? 'POST_KORA' : currentTrick <= 2 ? 'EARLY_QUIT' : 'RAGE_QUIT';
    const humanPlayerName = gameState.players?.find(p => p.id === 'human' || p.id === localPlayerId)?.name || 'Joueur';

    const targetSessionId = activeMancheSessionIdRef.current || `manche_${mode.toLowerCase()}_${Date.now()}`;

    telemetryService.recordGame({
      id: targetSessionId,
      mode,
      playerCount: opponentCount + 1,
      status: 'in_progress', // Non terminée
      winType: 'STANDARD',
      winnerName: 'Manche Interrompue',
      winnerId: undefined,
      isAbandoned: true,
      leaverId: localPlayerId || 'human',
      leaverName: humanPlayerName,
      abandonmentReason: reason,
      trickNumberAtQuit: currentTrick,
      roundsCount: gameState.partieCount || 1,
      partiesCount: gameState.partieCount || 1,
      isMancheFinalWin: false,
      potWon: 0,
      aiDifficulty: mode === 'SOLO' ? (activeGameState.aiDifficulty || gameState.aiDifficulty) : undefined,
      createdAt: Date.now(),
      players: gameState.players?.map((p) => ({
        id: p.id,
        name: p.name,
        isHuman: p.isHuman ?? (p.id === 'human' || p.id === localPlayerId || !p.id?.toLowerCase().includes('bot')),
        score: p.score ?? p.capital ?? 0,
      })) || [],
    }).catch(console.warn);

    // Record 1 abandoned game in profile stats
    recordGameResult({
      recordType: 'MANCHE',
      mode,
      playerCount: opponentCount + 1,
      winType: 'FORFEIT',
      isWinner: false,
      winnerName: 'Abandon',
      potWon: 0,
      baseBet: gameState.baseBet || 50,
      roundsCount: gameState.partieCount || 1,
      status: 'abandoned',
      difficulty: mode === 'SOLO' ? (activeGameState.aiDifficulty || gameState.aiDifficulty) : undefined,
    }, { skipGamesPlayedIncrement: true }).catch(console.warn);

    activeMancheSessionIdRef.current = null;

    if (isOnlineActive) {
      registerFairPlayIncident({
        type: 'FORFEIT',
        roomId: multiplayerRoom?.id,
        gameId: targetSessionId,
      })
        .then((res) => {
          if (res.message) triggerToast(res.message);
        })
        .catch(console.warn);

      await handleForfeitMultiplayerGame();
    }

    setShowQuitModal(false);
    setCurrentScreen('HOME');
  };

  // Auto-switch screen on transition to PLAYING / MANCHE_OVER / PARTIE_OVER or when joining active game
  const prevRoomStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isMultiplayerMode || !multiplayerRoom) {
      prevRoomStatusRef.current = null;
      return;
    }

    const currentStatus = multiplayerRoom.status;
    const prevStatus = prevRoomStatusRef.current;
    prevRoomStatusRef.current = currentStatus;

    // 1. Transitioned from LOBBY to PLAYING
    if (currentStatus === 'PLAYING' && prevStatus === 'LOBBY') {
      setCurrentScreen('GAME');
      return;
    }

    // 2. Joining or being in an ongoing game or round intermission (PLAYING, MANCHE_OVER, PARTIE_OVER) while on HOME
    if (
      (currentStatus === 'PLAYING' || currentStatus === 'MANCHE_OVER' || currentStatus === 'PARTIE_OVER') &&
      currentScreen === 'HOME'
    ) {
      setCurrentScreen('GAME');
    }
  }, [isMultiplayerMode, multiplayerRoom?.status, currentScreen]);

  const onlineGamePlayerIndex = isOnlineActive && activeGameState?.players
    ? (activeGameState.players || []).findIndex((p) => p.id === localPlayerId)
    : -1;

  const onlineRoomPlayer = multiplayerRoom?.players.find((p) => p.id === localPlayerId) ||
    multiplayerRoom?.players.find((p) => p.isHuman && p.name === localPlayerName);
  const onlineGamePlayer = onlineGamePlayerIndex >= 0 && activeGameState?.players ? activeGameState.players[onlineGamePlayerIndex] : null;

  const isOnlineSpectator = Boolean(
    isOnlineActive &&
    (onlineRoomPlayer
      ? onlineRoomPlayer.isSpectator
      : !activeGameState?.players?.some((p) => (p.id === localPlayerId || p.name === localPlayerName) && !p.isEliminated))
  );
  const isOnlinePendingIntegration = Boolean(isOnlineActive && onlineRoomPlayer?.isPendingIntegration);

  const partiesPlayed = multiplayerRoom?.manchePartiesPlayed !== undefined
    ? multiplayerRoom.manchePartiesPlayed
    : (multiplayerRoom?.gameState ? Math.max(0, (multiplayerRoom.gameState.partieCount || 1) - 1) : 0);
  const prorataCapitalEstimate = Math.max(0, (multiplayerRoom?.initialCapital || 100) - (partiesPlayed * (multiplayerRoom?.baseBet || 10)));
  const hasBotToReplace = Boolean(multiplayerRoom?.players.some((p) => !p.isHuman));
  const canRequestIntegration = isOnlineSpectator && !isOnlinePendingIntegration && hasBotToReplace && prorataCapitalEstimate >= (multiplayerRoom?.baseBet || 10);

  const currentHumanPlayer: Player = isOnlineActive && (onlineRoomPlayer || onlineGamePlayer)
    ? {
        id: onlineRoomPlayer?.id || onlineGamePlayer?.id || localPlayerId,
        name: onlineRoomPlayer?.name || onlineGamePlayer?.name || localPlayerName,
        score: onlineGamePlayer?.score ?? onlineRoomPlayer?.score ?? 0,
        capital: onlineGamePlayer?.capital ?? onlineRoomPlayer?.capital ?? 0,
        isEliminated: Boolean(onlineGamePlayer?.isEliminated ?? onlineRoomPlayer?.isEliminated),
        isForfeit: (onlineGamePlayer?.hand && onlineGamePlayer.hand.length > 0)
          ? false
          : Boolean(onlineGamePlayer?.isForfeit ?? onlineRoomPlayer?.isForfeit),
        isFoldedInRound: Boolean(onlineGamePlayer?.isFoldedInRound ?? onlineRoomPlayer?.isFoldedInRound),
        hand: onlineGamePlayer?.hand || onlineRoomPlayer?.hand || [],
        isHuman: true,
        avatarSeed: onlineRoomPlayer?.avatarSeed || onlineGamePlayer?.avatarSeed || 'player-1',
        tricksWonInRound: onlineGamePlayer?.tricksWonInRound ?? onlineRoomPlayer?.tricksWonInRound ?? 0,
      }
    : (gameState.players?.[0] || {
        id: 'human',
        name: 'Vous',
        score: initialCapital,
        capital: initialCapital,
        isEliminated: false,
        isForfeit: false,
        isFoldedInRound: false,
        hand: [],
        isHuman: true,
        avatarSeed: 'player-1',
        tricksWonInRound: 0,
      });

  const sendEmoteUnified = useCallback(
    (text: string, emoji?: string) => {
      if (
        currentHumanPlayer.isEliminated ||
        currentHumanPlayer.isForfeit ||
        currentHumanPlayer.isFoldedInRound
      ) {
        return;
      }
      if (isOnlineActive) {
        handleSendMultiplayerEmote(text, emoji);
      } else {
        sendEmote(text, emoji);
      }
    },
    [
      currentHumanPlayer.isEliminated,
      currentHumanPlayer.isForfeit,
      currentHumanPlayer.isFoldedInRound,
      isOnlineActive,
      handleSendMultiplayerEmote,
      sendEmote,
    ]
  );

  const isCurrentHumanTurn = isOnlineActive && multiplayerRoom
    ? activeGameState.phase === 'PLAYING' &&
      onlineGamePlayerIndex >= 0 &&
      activeGameState.currentTurnIndex === onlineGamePlayerIndex &&
      !currentHumanPlayer.isEliminated &&
      !currentHumanPlayer.isForfeit &&
      !currentHumanPlayer.isFoldedInRound &&
      !isMpResolvingTrick &&
      !isMpCollectingTrick
    : (gameState.phase === 'PLAYING' &&
       gameState.currentTurnIndex === 0 &&
       !currentHumanPlayer.isEliminated &&
       !currentHumanPlayer.isForfeit &&
       !currentHumanPlayer.isFoldedInRound &&
       !isResolvingTrick &&
       !isCollectingTrick);

  // Card select & play dispatchers
  const handleGeneralSelectCard = (card: Card) => {
    if (isOnlineActive) {
      triggerHaptic('light');
      setMultiplayerSelectedCardId(card.id);
    } else {
      handleSelectCard(card);
    }
  };

  const handleGeneralPlayCard = async (card: Card) => {
    if (isOnlineActive) {
      if (!isCurrentHumanTurn || !multiplayerRoom || onlineGamePlayerIndex < 0) return;
      sounds.playCardPlay();
      setMultiplayerSelectedCardId(null);
      handlePlayMultiplayerCard(card);
    } else {
      handlePlayCard(0, card);
    }
  };

  const handleGeneralValidateCard = () => {
    if (isOnlineActive) {
      if (!multiplayerSelectedCardId || !currentHumanPlayer) return;
      const card = currentHumanPlayer.hand.find((c) => c.id === multiplayerSelectedCardId);
      if (card) {
        handleGeneralPlayCard(card);
      }
    } else {
      handleValidateCard();
    }
  };

  const handleGeneralFoldRound = () => {
    if (isOnlineActive) {
      registerFairPlayIncident({
        type: 'FOLD_ROUND',
        roomId: multiplayerRoom?.id,
      })
        .then((res) => {
          if (res.message) triggerToast(res.message);
        })
        .catch(console.warn);
      handleFoldMultiplayerRound();
    } else {
      handleFoldRound();
    }
  };

  const handleGeneralNextPartie = async () => {
    if (isOnlineActive && multiplayerRoom) {
      handleAdvancePartieDirectly();
    } else {
      handleNextPartie();
    }
  };

  const handleGeneralNewManche = async () => {
    if (isOnlineActive && multiplayerRoom) {
      if (multiplayerRoom.hostId === localPlayerId) {
        handleStartMultiplayerGame();
      }
    } else {
      handleResetSession();
    }
  };

  const currentWinnerPlay =
    activeGameState.currentTrick?.plays?.find((p) => p.isWinningSoFar) || null;

  const mpWinnerPlay = isOnlineActive
    ? mpPlays?.find((p) => p.isWinningSoFar) || null
    : null;

  const handleTriggerKoraHunterAlertUnified = useCallback(() => {
    if (
      currentHumanPlayer.isEliminated ||
      currentHumanPlayer.isForfeit ||
      currentHumanPlayer.isFoldedInRound
    ) {
      return;
    }
    if (isOnlineActive) {
      handleTriggerKoraHunterAlert();
    } else {
      triggerKoraHunterAlertManually();
    }
  }, [
    currentHumanPlayer.isEliminated,
    currentHumanPlayer.isForfeit,
    currentHumanPlayer.isFoldedInRound,
    isOnlineActive,
    handleTriggerKoraHunterAlert,
    triggerKoraHunterAlertManually,
  ]);

  const handleSoloPauseReturnHome = useCallback(() => {
    saveCurrentSession('Partie Solo en Pause');
    triggerToast('Partie sauvegardée');
    setCurrentScreen('HOME');
  }, [saveCurrentSession, triggerToast]);

  return (
    <div className="flex flex-col h-screen w-full bg-slate-950 text-slate-100 font-sans select-none overflow-hidden">
      {/* Top Header / Status Bar (Game Mode) */}
      {currentScreen === 'GAME' && (
        <GameHeader
          currentScreen={currentScreen}
          isOnlineActive={isOnlineActive}
          isMultiplayerMode={isMultiplayerMode}
          activeGameState={activeGameState}
          soundEnabled={soundEnabled}
          ambienceEnabled={ambienceEnabled}
          gameSpeed={gameSpeed}
          isFullscreen={isFullscreen}
          isPwaInstalled={isPwaInstalled}
          betIncreaseProposal={isOnlineActive ? multiplayerRoom?.betIncreaseProposal : activeGameState.betIncreaseProposal}
          multiplayerRoomId={isOnlineActive ? multiplayerRoom?.id : undefined}
          multiplayerPlayers={isOnlineActive ? (multiplayerRoom?.players || []) : (activeGameState.players?.map((p, idx) => ({
            ...p,
            isHost: idx === 0,
            avatarSeed: p.avatarSeed || "",
            score: p.score || 0,
            capital: p.capital || 0,
            isEliminated: p.isEliminated || false,
            hand: p.hand || [],
            tricksWonInRound: p.tricksWonInRound || 0,
          })) || [])}
          localPlayerId={isOnlineActive ? localPlayerId : (activeGameState.players?.[0]?.id || 'human')}
          onProposeBetIncrease={isOnlineActive ? handleProposeBetIncrease : handleProposeBetIncreaseSolo}
          onRespondBetIncrease={isOnlineActive ? handleRespondBetIncrease : handleRespondBetIncreaseSolo}
          onCancelBetIncrease={isOnlineActive ? handleCancelBetIncrease : handleCancelBetIncreaseSolo}
          onReturnHome={handleSoloReturnHome}
          onQuitMultiplayer={() => setShowQuitModal(true)}
          onQuickSave={() => {
            saveCurrentSession();
            triggerHaptic('success');
            triggerToast('Manche sauvegardée !');
          }}
          onToggleSound={toggleSound}
          onToggleAmbience={toggleAmbience}
          onToggleGameSpeed={toggleGameSpeed}
          onToggleFullscreen={toggleFullscreen}
          onOpenRules={() => setShowRulesModal(true)}
          onOpenSavedSessions={() => setShowSavedSessionsModal(true)}
          onOpenMultiplayerHub={() => setShowMultiplayerHub(true)}
          onOpenSetupModal={() => setShowSetupModal(true)}
          onInstallPwa={handleInstallClick}
          onOpenProfile={() => setIsProfileModalOpen(true)}
          pendingInvitesCount={incomingInvitations.length}
        />
      )}

      {/* Main Content Area */}
      <main id="main-content" className="flex-1 flex flex-col overflow-hidden relative">
        {currentScreen === 'HOME' ? (
          <HomeScreen
            savedSessions={savedSessions}
            activeSessionId={activeSessionId}
            pendingInvitesCount={incomingInvitations.length}
            onStartSolo={() => {
              ensureLeaveMultiplayerBeforeSolo();
              setShowSetupModal(true);
            }}
            onStartNewGame={() => {
              ensureLeaveMultiplayerBeforeSolo();
              setShowSetupModal(true);
            }}
            onOpenMultiplayer={() => setShowMultiplayerHub(true)}
            onOpenMultiplayerHub={() => setShowMultiplayerHub(true)}
            onOpenSavedSessions={() => setShowSavedSessionsModal(true)}
            onOpenRules={() => {
              setRulesInitialTab('express');
              setShowRulesModal(true);
            }}
            onOpenSimpleRules={() => {
              setRulesInitialTab('express');
              setShowRulesModal(true);
            }}
            onOpenTestMode={() => setShowTestModeModal(true)}
            onOpenTests={() => setShowTestModeModal(true)}
            onOpenProfile={() => setIsProfileModalOpen(true)}
            onOpenLeaderboard={() => setIsLeaderboardOpen(true)}
            savedSessionsCount={savedSessions.length}
            hasActiveSavedSession={Boolean(activeSessionId)}
            soundEnabled={soundEnabled}
            onToggleSound={toggleSound}
            onOpenInstallModal={handleInstallClick}
            isPwaInstalled={isPwaInstalled}
            activeMultiplayerRoom={isOnlineActive && multiplayerRoom && !isOnlineSpectator ? multiplayerRoom : null}
            onResumeMultiplayer={() => {
              setIsMultiplayerMode(true);
              setCurrentScreen('GAME');
            }}
            onLeaveMultiplayer={() => handleLeaveMultiplayer(false)}
            onResumeSession={(sId) => {
              ensureLeaveMultiplayerBeforeSolo();
              loadSession(sId);
            }}
            onResumeActiveSession={() => {
              ensureLeaveMultiplayerBeforeSolo();
              if (activeSessionId) {
                loadSession(activeSessionId);
              } else {
                setCurrentScreen('GAME');
              }
            }}
          />
        ) : (
          /* VERTICAL GAME SCREEN (Solo & Multiplayer) */
          <div className="flex-1 flex flex-col justify-between p-1.5 sm:p-2.5 max-w-4xl mx-auto w-full h-full overflow-y-auto overflow-x-hidden gap-1 sm:gap-2">
            {/* Reconnection In-Progress Banner */}
            {isOnlineActive && !isWsConnected && (
              <div
                id="ws-reconnecting-banner"
                className="w-full bg-rose-950/90 border border-rose-500/50 rounded-xl px-3 py-2 flex items-center justify-between gap-2 shadow-lg shrink-0 animate-pulse text-xs text-rose-200"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping shrink-0" />
                  <span className="font-semibold">Reconnexion en cours...</span>
                </div>
                <span className="text-[11px] text-rose-300/80">Votre place et vos jetons sont préservés</span>
              </div>
            )}

            {/* Sole Human vs Bots Forfeit Option Banner */}
            {isSoleHumanAgainstBots && !dismissedForfeitBanner && (
              <div
                id="sole-human-forfeit-banner"
                className="w-full bg-gradient-to-r from-amber-950/80 via-slate-900/95 to-amber-950/80 border border-amber-500/40 rounded-xl px-3 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-2 shadow-xl shrink-0 animate-fade-in"
              >
                <div className="flex items-center gap-2 text-center sm:text-left">
                  <span className="text-xl">⚔️</span>
                  <div className="text-xs">
                    <p className="font-bold text-amber-300">
                      Vos adversaires humains ont quitté la table.
                    </p>
                    <p className="text-slate-400">
                      Réclamez votre part du pot ({humanPotShareEstimate} jetons) avec victoire par forfait, ou relevez le défi contre l'IA.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                  <button
                    type="button"
                    id="btn-claim-forfeit-victory"
                    onClick={() => {
                      triggerHaptic('success');
                      handleClaimForfeitVictory();
                    }}
                    className="flex-1 sm:flex-initial px-3 py-1.5 rounded-xl font-black text-xs bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 shadow-md shadow-amber-500/20 active:scale-95 transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <span>🏆</span>
                    <span>Réclamer ma part du pot</span>
                  </button>
                  <button
                    type="button"
                    id="btn-continue-against-bots"
                    onClick={() => {
                      triggerHaptic('light');
                      setDismissedForfeitBanner(true);
                    }}
                    className="px-2.5 py-1.5 rounded-xl font-semibold text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600/60 active:scale-95 transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <span>⚔️</span>
                    <span>Continuer vs IA</span>
                  </button>
                </div>
              </div>
            )}

            {/* 1. Top Section: Vertical Players History Board (All players with cards slots) */}
            <OpponentsHistoryBoard
              players={activeGameState.players}
              currentTurnIndex={activeGameState.currentTurnIndex}
              isThinkingAI={activeGameState.isThinkingAI}
              dealerIndex={activeGameState.dealerIndex}
              leadIndex={activeGameState.leadIndex}
              baseBet={activeGameState.baseBet}
              currentTrickPlays={isOnlineActive ? mpPlays : (activeGameState.currentTrick?.plays || [])}
              trickHistory={activeGameState.tricksHistory || []}
              instantWinReveal={effectiveInstantWinReveal}
              isDealing={isDealing}
              cardsDealtCountByPlayer={activeGameState.cardsDealtCountByPlayer}
              localPlayerId={isOnlineActive ? localPlayerId : null}
              isMultiplayer={isOnlineActive}
              showBotPersonalityIcons={activeGameState.showBotPersonalityIcons}
              activeEmotes={effectiveActiveEmotes}
              turnRemainingSeconds={isOnlineActive ? turnRemainingSeconds : null}
            />

            {/* Multiplayer Proposals (Integration vote, Capacity extension) */}
            {isOnlineActive && multiplayerRoom && (
              <div className="w-full flex flex-col items-center gap-2 z-30 px-2 my-1">
                <IntegrationProposalWidget
                  proposal={multiplayerRoom.integrationProposal}
                  players={multiplayerRoom.players}
                  localPlayerId={localPlayerId}
                  isSpectator={isOnlineSpectator}
                  isPendingIntegration={isOnlinePendingIntegration}
                  canRequestIntegration={canRequestIntegration}
                  prorataCapitalEstimate={prorataCapitalEstimate}
                  onRespondVote={handleRespondIntegrationVote}
                  onRequestIntegration={handleRequestIntegration}
                />
                <CapacityExtensionProposalWidget
                  proposal={multiplayerRoom.capacityExtensionProposal}
                  players={multiplayerRoom.players}
                  localPlayerId={localPlayerId}
                  isHost={multiplayerRoom.hostId === localPlayerId}
                  onPropose={handleProposeCapacityExtension}
                  onRespond={handleRespondCapacityExtension}
                />
                <EarlyCloseProposalWidget
                  proposal={multiplayerRoom.earlyCloseProposal}
                  players={multiplayerRoom.players}
                  localPlayerId={localPlayerId}
                  onPropose={handleProposeEarlyClose}
                  onRespond={handleRespondEarlyClose}
                />
              </div>
            )}

            {/* 2. Middle Section: Play Zone Felt (Tapis vert with played trick cards) */}
            <div className="shrink-0 flex flex-col justify-center items-center my-0.5 sm:my-1 w-full">
              <PlayZoneFelt
                plays={isOnlineActive ? mpPlays : (activeGameState.currentTrick?.plays || [])}
                leadSuit={isOnlineActive ? mpLeadSuit : (activeGameState.currentTrick?.leadSuit || null)}
                currentTrickNumber={isOnlineActive ? mpTrickNumber : (activeGameState.currentTrickNumber || 1)}
                winnerPlay={isOnlineActive ? mpWinnerPlay : currentWinnerPlay}
                playerCount={activeGameState.players?.filter((p) => !p.isEliminated && !p.isForfeit && !p.isFoldedInRound).length || 4}
                isDoubleKoraEnabled={activeGameState.enableDoubleKora}
                trick4WinnerWithThreeName={
                  (isOnlineActive ? mpTrickNumber : (activeGameState.currentTrickNumber || 1)) === 5 &&
                  activeGameState.enableDoubleKora &&
                  activeGameState.consecutiveThreesCountByPlayer &&
                  Object.keys(activeGameState.consecutiveThreesCountByPlayer).find(
                    (k) => (activeGameState.consecutiveThreesCountByPlayer?.[Number(k)] || 0) >= 1
                  )
                    ? activeGameState.players[
                        Number(
                          Object.keys(activeGameState.consecutiveThreesCountByPlayer).find(
                            (k) => (activeGameState.consecutiveThreesCountByPlayer?.[Number(k)] || 0) >= 1
                          )
                        )
                      ]?.name
                    : null
                }
                isDoubleKoraAchieved={
                  activeGameState.doubleKoraAchievedByPlayer &&
                  Object.values(activeGameState.doubleKoraAchievedByPlayer).some(Boolean)
                }
                partieWinType={activeGameState.partieWinType}
                winnerName={activeGameState.partieWinnerName}
                isDealing={isDealing}
                dealerIndex={activeGameState.dealerIndex}
                leadIndex={activeGameState.leadIndex}
                players={activeGameState.players}
                instantWinReveal={effectiveInstantWinReveal}
                isResolvingTrick={isOnlineActive ? isMpResolvingTrick : isResolvingTrick}
                isCollectingTrick={isOnlineActive ? isMpCollectingTrick : isCollectingTrick}
                lastCutEvent={activeGameState.lastCutEvent}
                isKoraHunterActive={Boolean(activeGameState.showKoraHunterAlert)}
                baseBet={activeGameState.baseBet}
              />
            </div>

            {/* 3. Bottom Section: Human Hand / Spectator Console (Interactive cards & validation) */}
            <div className="flex flex-col gap-1 shrink-0">
              {isOnlineSpectator && activeGameState.phase !== 'MANCHE_OVER' ? (
                <div id="multiplayer-spectator-panel" className="w-full bg-slate-900 border-t border-cyan-500/30 px-3 sm:px-6 py-3.5 relative flex flex-col items-center justify-center gap-2.5 shadow-2xl z-30 transition-all duration-300 rounded-2xl">
                  <div className="flex flex-wrap items-center justify-between w-full gap-2 border-b border-slate-800/80 pb-2">
                    <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs sm:text-sm tracking-wide">
                      <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                      <span>Mode Spectateur en direct</span>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/40">
                        Table #{multiplayerRoom?.id}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        triggerHaptic('medium');
                        await handleLeaveMultiplayer();
                        setCurrentScreen('HOME');
                        triggerToast('Vous avez quitté le mode spectateur');
                      }}
                      className="text-xs font-bold text-rose-400 hover:text-rose-300 flex items-center gap-1.5 cursor-pointer bg-rose-500/10 hover:bg-rose-500/20 px-3 py-1.5 rounded-xl border border-rose-500/25 transition-all active:scale-95 shadow-sm shadow-rose-950/40"
                    >
                      <LogOut className="w-3.5 h-3.5 text-rose-400" />
                      <span>Quitter la table</span>
                    </button>
                  </div>

                  {/* Integration Status or Call-To-Action */}
                  {isOnlinePendingIntegration ? (
                    <div className="w-full bg-emerald-950/80 border border-emerald-500/60 rounded-xl px-3.5 py-2.5 flex items-center gap-3 text-emerald-100 shadow-md">
                      <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 shrink-0">
                        <Sparkles className="w-4 h-4 text-emerald-300 animate-bounce" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-white">Intégration validée !</span>
                        <span className="text-[11px] text-emerald-300/90">
                          Vous entrerez en jeu dès le début de la prochaine partie avec un capital de{' '}
                          <strong className="text-white font-mono">{prorataCapitalEstimate} 🪙</strong>.
                        </span>
                      </div>
                    </div>
                  ) : canRequestIntegration ? (
                    <div className="w-full bg-slate-950/80 border border-amber-500/40 rounded-xl px-3.5 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-2.5 shadow-md">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
                          <UserPlus className="w-4 h-4 text-amber-300" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-bold text-white">Une place avec bot est disponible !</span>
                          <span className="text-[11px] text-slate-400">
                            Capital ajusté au prorata : <strong className="text-amber-300">{prorataCapitalEstimate} 🪙</strong>
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        id="btn-request-integration-spectator"
                        onClick={() => {
                          triggerHaptic('medium');
                          handleRequestIntegration();
                        }}
                        className="h-9 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-xs transition shadow-md shadow-amber-500/20 cursor-pointer flex items-center gap-1.5 shrink-0"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Intégrer la Table</span>
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 text-center">
                      Vous assistez aux échanges de cartes en direct. Vous pouvez réagir en temps réel avec la table ci-dessous :
                    </p>
                  )}

                  {/* Spectator Live Emote Bar */}
                  <div className="flex items-center gap-1.5 overflow-x-auto max-w-full py-1">
                    {[
                      { text: '🔥 Beau jeu !', emoji: '🔥' },
                      { text: '👏 Chapeau', emoji: '👏' },
                      { text: '😱 Incroyable', emoji: '😱' },
                      { text: '🏆 Victoire', emoji: '🏆' },
                      { text: '⚔️ Courage', emoji: '⚔️' },
                      { text: '🍀 Bien joué', emoji: '🍀' },
                    ].map((em) => (
                      <button
                        key={em.text}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          sendEmoteUnified(em.text, em.emoji);
                        }}
                        className="h-8 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 text-xs text-slate-200 flex items-center gap-1 shrink-0 cursor-pointer transition"
                      >
                        <span>{em.emoji}</span>
                        <span className="hidden xs:inline text-[11px] font-medium">{em.text.replace(em.emoji, '').trim()}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : !isOnlineActive && currentHumanPlayer.isEliminated && activeGameState.phase !== 'MANCHE_OVER' ? (
                <div id="spectator-simulation-panel" className="w-full bg-slate-900 border-t border-red-500/30 px-3 sm:px-8 py-4 sm:py-6 relative flex flex-col items-center justify-center gap-3 shadow-2xl z-30 transition-all duration-300 rounded-xl">
                  <div className="flex flex-col items-center text-center gap-1.5">
                    <div className="flex items-center gap-2 text-red-400 font-bold text-xs sm:text-sm tracking-wide uppercase">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      Mode Spectateur
                    </div>
                    <p className="text-sm sm:text-base text-slate-100 font-medium">
                      Vous avez été éliminé de la manche en cours.
                    </p>
                    <p className="text-xs sm:text-sm text-slate-400 max-w-lg">
                      Les autres joueurs continuent à s'affronter. Vous pouvez observer le dénouement en direct ou simuler instantanément la fin de la partie pour obtenir les résultats.
                    </p>
                  </div>

                  <button
                    id="btn-simulate-to-end"
                    onClick={() => {
                      triggerHaptic('medium');
                      sounds.playShuffle();
                      simulateToEnd();
                    }}
                    className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg transition-all duration-150 transform active:scale-95"
                  >
                    <FastForward className="w-4 h-4" />
                    Simuler le reste de la partie
                  </button>
                </div>
              ) : (
                <HumanHand
                  hand={currentHumanPlayer.hand}
                  selectedCardId={isOnlineActive ? multiplayerSelectedCardId : gameState.humanSelectedCardId}
                  isHumanTurn={isCurrentHumanTurn}
                  onSelectCard={handleGeneralSelectCard}
                  onDirectPlayCard={handleGeneralPlayCard}
                  onValidateCard={handleGeneralValidateCard}
                  onFoldRound={handleGeneralFoldRound}
                  leadSuit={isOnlineActive ? mpLeadSuit : (activeGameState.currentTrick?.leadSuit || null)}
                  playerName={currentHumanPlayer.name}
                  isDealing={isDealing}
                  cardsDealtCountByPlayer={activeGameState.cardsDealtCountByPlayer}
                  isForfeit={Boolean(currentHumanPlayer.isForfeit)}
                  isFoldedInRound={Boolean(currentHumanPlayer.isFoldedInRound)}
                  isEliminated={Boolean(currentHumanPlayer.isEliminated)}
                  baseBet={activeGameState.baseBet || 10}
                  pot={activeGameState.pot || 0}
                  currentTrickNumber={activeGameState.currentTrickNumber || 1}
                  currentTrick={activeGameState.currentTrick}
                  tricksHistory={activeGameState.tricksHistory || []}
                  players={activeGameState.players || []}
                  instantWinReveal={instantWinReveal}
                  enableKoraHunterAlerts={activeGameState.enableKoraHunterAlerts}
                  onTriggerKoraHunterAlert={handleTriggerKoraHunterAlertUnified}
                  onSendEmote={sendEmoteUnified}
                  onProposeBetIncrease={() => {
                    const currentBet = activeGameState.baseBet || 10;
                    const newBet = Math.round(currentBet * 1.5);
                    if (isOnlineActive) {
                      handleProposeBetIncrease(newBet);
                    } else {
                      handleProposeBetIncreaseSolo(newBet);
                    }
                  }}
                  activeEmotes={effectiveActiveEmotes}
                  localPlayerId={isOnlineActive ? localPlayerId : 'human'}
                />
              )}
            </div>
          </div>
        )}
      </main>

      {/* Académie & Règles de Jeu (Écran Natif Plein Écran) */}
      <GameRulesScreen
        isOpen={showRulesModal}
        initialTab={rulesInitialTab}
        onClose={() => setShowRulesModal(false)}
        onStartSolo={() => {
          setShowRulesModal(false);
          setShowSetupModal(true);
        }}
      />

      <GameSetupModal
        isOpen={showSetupModal}
        soundEnabled={soundEnabled}
        onToggleSound={toggleSound}
        currentOpponentCount={opponentCount}
        previousOpponentCount={previousOpponentCount}
        currentBaseBet={baseBet}
        currentInitialCapital={initialCapital}
        currentEnableDoubleKora={gameState.enableDoubleKora}
        currentEnableUnder21={gameState.enableUnder21}
        currentAiDifficulty={gameState.aiDifficulty || 'NORMAL'}
        currentShowBotPersonalityIcons={gameState.showBotPersonalityIcons}
        currentEnableKoraHunterAlerts={gameState.enableKoraHunterAlerts}
        currentSoloBetIncreaseMode={gameState.soloBetIncreaseMode || (localStorage.getItem('njambo_solo_bet_increase_mode') as SoloBetIncreaseMode) || 'souverain'}
        isMancheInProgress={gameState.phase !== 'SETUP' && gameState.phase !== 'MANCHE_OVER'}
        currentPartieCount={gameState.partieCount}
        activePlayersCount={gameState.players?.filter((p) => !p.isEliminated).length || 4}
        onStartGame={handleStartGameWithSetup}
        onSaveAndStartNewGame={handleSaveAndStartNewGame}
        onContinueManche={handleContinueMancheWithSettings}
        onClose={() => setShowSetupModal(false)}
      />

      <SavedSessionsModal
        isOpen={showSavedSessionsModal}
        savedSessions={savedSessions}
        activeSessionId={activeSessionId}
        onLoadSession={loadSession}
        onSaveCurrentSession={saveCurrentSession}
        onDeleteSession={deleteSession}
        onRenameSession={renameSession}
        onNewManche={startNewManche}
        onClose={() => setShowSavedSessionsModal(false)}
      />

      {showTestModeModal && (
        <React.Suspense fallback={null}>
          <TestModeModal
            isOpen={showTestModeModal}
            onClose={() => setShowTestModeModal(false)}
          />
        </React.Suspense>
      )}

      {/* Quit Confirmation Modal */}
      <QuitConfirmationModal
        isOpen={showQuitModal}
        onClose={() => setShowQuitModal(false)}
        onSaveAndQuit={handleSaveAndQuit}
        onQuitWithoutSave={handleQuitWithoutSave}
        partieCount={activeGameState.partieCount || 1}
        activePlayersCount={activeGameState.players?.filter((p) => !p.isEliminated).length || 4}
        isMultiplayer={isOnlineActive}
        onProposeEarlyClose={isOnlineActive ? handleProposeEarlyClose : undefined}
        baseBet={activeGameState.baseBet || 10}
        playerCapital={currentHumanPlayer.capital || 100}
        isDoubleKoraAchieved={Boolean(
          activeGameState.doubleKoraAchievedByPlayer &&
          Object.values(activeGameState.doubleKoraAchievedByPlayer).some(Boolean)
        )}
        isDoubleKoraThreat={
          (isOnlineActive ? mpTrickNumber : (activeGameState.currentTrickNumber || 1)) === 5 &&
          Boolean(activeGameState.enableDoubleKora) &&
          Boolean(
            activeGameState.consecutiveThreesCountByPlayer &&
            Object.values(activeGameState.consecutiveThreesCountByPlayer).some((v) => (v || 0) >= 1)
          )
        }
        hasKoraThreat={Boolean(activeGameState.showKoraHunterAlert)}
        isSpectator={isOnlineSpectator}
        onSpectatorQuitMultiplayer={async () => {
          setShowQuitModal(false);
          await handleLeaveMultiplayer();
          setCurrentScreen('HOME');
          triggerToast('Vous avez quitté le mode spectateur');
        }}
        onForfeitAndQuitMultiplayer={async () => {
          setShowQuitModal(false);
          const multiPlayerName = activeGameState.players?.find((p: any) => p.id === localPlayerId || p.id === 'human')?.name || 'Joueur';
          if (activeMancheSessionIdRef.current) {
            telemetryService
              .recordGame({
                id: activeMancheSessionIdRef.current,
                mode: 'MULTIPLAYER',
                playerCount: activeGameState.players?.length || 4,
                status: 'in_progress',
                winType: 'STANDARD',
                winnerName: 'Adversaire (Par Forfait)',
                winnerId: undefined,
                isAbandoned: true,
                leaverId: localPlayerId || 'guest_user',
                leaverName: multiPlayerName,
                abandonmentReason: 'RAGE_QUIT',
                roundsCount: activeGameState.partieCount || 1,
                partiesCount: activeGameState.partieCount || 1,
                isMancheFinalWin: false,
                potWon: 0,
                createdAt: Date.now(),
                players: activeGameState.players?.map((p: any) => ({
                  id: p.id,
                  name: p.name,
                  isHuman: p.isHuman ?? (p.id === 'human' || p.id === localPlayerId || !p.id?.toLowerCase().includes('bot')),
                  score: p.score ?? p.capital ?? 0,
                })) || [],
              })
              .catch(console.warn);
            activeMancheSessionIdRef.current = null;
          }
          recordGameResult({
            recordType: 'MANCHE',
            mode: 'MULTIPLAYER',
            playerCount: activeGameState.players?.length || 4,
            winType: 'FORFEIT',
            isWinner: false,
            winnerName: 'Adversaire (Par Forfait)',
            potWon: 0,
            baseBet: activeGameState.baseBet || 50,
            roundsCount: activeGameState.partieCount || 1,
            status: 'abandoned',
          }, { skipGamesPlayedIncrement: true }).catch(console.warn);
          if (isOnlineActive) {
            registerFairPlayIncident({
              type: 'FORFEIT',
              roomId: multiplayerRoom?.id,
            })
              .then((res) => {
                if (res.message) triggerToast(res.message);
              })
              .catch(console.warn);
          }
          await handleForfeitMultiplayerGame();
          setCurrentScreen('HOME');
          triggerToast('Partie quittée (Défaite par forfait)');
        }}
      />

      {/* End Round / End Manche Modal - ONLY rendered when in GAME screen */}
      {currentScreen === 'GAME' && (
        <EndRoundModal
          gameState={activeGameState}
          phase={isOnlineActive ? mpPhase : undefined}
          onNextPartie={handleGeneralNextPartie}
          onNewManche={handleGeneralNewManche}
          onOpenRules={() => setShowRulesModal(true)}
          onReturnHome={() => {
            if (isOnlineActive) {
              if (activeGameState.phase === 'MANCHE_OVER') {
                handleLeaveMultiplayer();
              } else {
                handleForfeitMultiplayerGame();
              }
            } else {
              saveCurrentSession();
              triggerToast('Manche sauvegardée !');
            }
            setCurrentScreen('HOME');
          }}
          onSaveManche={() => {
            saveCurrentSession();
            triggerHaptic('success');
            triggerToast('Manche sauvegardée !');
          }}
          isOnlineMultiplayer={isOnlineActive}
          onSendRematch={handleSendMultiplayerRematch}
          onShareMatch={handleShareMatchResult}
          isHost={isOnlineActive && multiplayerRoom ? (multiplayerRoom.hostId === localPlayerId || isCoordinator) : true}
          isReadyForNext={
            isOnlineActive && multiplayerRoom
              ? Boolean(multiplayerRoom.players.find((p) => p.id === localPlayerId)?.readyForNextPartie)
              : false
          }
          onToggleReady={handleToggleReadyForNext}
          roundEndRemainingSeconds={roundEndRemainingSeconds}
          multiplayerPlayers={multiplayerRoom?.players}
          roomPlayers={multiplayerRoom?.players}
          betIncreaseProposal={isOnlineActive ? multiplayerRoom?.betIncreaseProposal : activeGameState.betIncreaseProposal}
          onProposeBetIncrease={isOnlineActive ? handleProposeBetIncrease : handleProposeBetIncreaseSolo}
          onRespondBetIncrease={isOnlineActive ? handleRespondBetIncrease : handleRespondBetIncreaseSolo}
          onCancelBetIncrease={isOnlineActive ? handleCancelBetIncrease : handleCancelBetIncreaseSolo}
          localPlayerId={isOnlineActive ? localPlayerId : (activeGameState.players?.[0]?.id || 'human')}
          onClaimHost={handleClaimHostRole}
          isSpectator={isOnlineSpectator}
          onRequestIntegration={handleRequestIntegration}
          canRequestIntegration={canRequestIntegration}
          prorataCapitalEstimate={prorataCapitalEstimate}
          isPendingIntegration={isOnlinePendingIntegration}
        />
      )}

      {/* Kora Victory Celebration Overlay */}
      {currentScreen === 'GAME' && (
        <KoraVictoryOverlay
          show={isOnlineActive ? mpShowKoraOverlay : showKoraVictoryOverlay}
          winnerName={activeGameState.partieWinnerName || ''}
          winnerIndex={activeGameState.partieWinnerIndex}
          winType={activeGameState.partieWinType || 'KORA'}
          pot={activeGameState.pot}
          baseBet={activeGameState.baseBet}
          players={activeGameState.players}
          onContinue={isOnlineActive ? () => setMpShowKoraOverlay(false) : dismissKoraVictoryOverlay}
        />
      )}

      {/* Solo Mode Pause Overlay (Throttling / Tab Background Protection) */}
      {currentScreen === 'GAME' && !isOnlineActive && (
        <SoloPauseOverlay
          show={isSoloPaused}
          gameState={gameState}
          onResume={resumeSoloGame}
          onReturnHome={handleSoloPauseReturnHome}
        />
      )}

      {/* Install PWA Modal */}
      <InstallPwaModal
        isOpen={showInstallModal}
        onClose={() => setShowInstallModal(false)}
        deferredPrompt={deferredInstallPrompt}
      />

      {/* Native Full-Screen Multiplayer Screen (Hub & Lobby) */}
      <AnimatePresence>
        {(showMultiplayerHub || (showMultiplayerLobby && Boolean(multiplayerRoom))) && (
          <MultiplayerScreen
            isOpen={true}
            onClose={() => {
              setShowMultiplayerHub(false);
              setShowMultiplayerLobby(false);
            }}
            sourceScreen={currentScreen}
            soundEnabled={soundEnabled}
            onToggleSound={toggleSound}
            onOpenLeaderboard={() => setIsLeaderboardOpen(true)}
            room={showMultiplayerLobby && multiplayerRoom ? multiplayerRoom : null}
            localPlayerId={localPlayerId}
            errorMessage={serverErrorMessage}
            onCreateRoom={handleCreateRoom}
            onJoinRoom={async (code, name, confirmLeaveCurrent) => {
              const res = await handleJoinRoom(code, name, confirmLeaveCurrent);
              if (res.success) {
                const current = wsService.getCurrentRoom();
                if (current && current.status !== 'LOBBY') {
                  setCurrentScreen('GAME');
                }
              }
              return res;
            }}
            onQuickMatch={handleQuickMatch}
            onStartGame={handleStartMultiplayerGame}
            onToggleReady={handleToggleReady}
            onToggleFillWithBots={handleToggleFillWithBots}
            onUpdateSettings={handleUpdateRoomSettings}
            onKickPlayer={handleKickPlayer}
            onAlertUnreadyPlayers={handleAlertUnreadyPlayers}
            onVoteStartWithBots={handleVoteStartWithBots}
            onClaimHost={handleClaimHostRole}
            onLeaveRoom={handleLeaveMultiplayer}
          />
        )}
      </AnimatePresence>

      {/* Player Profile & Palmarès Native Fullscreen Screen */}
      <AnimatePresence>
        {isProfileModalOpen && (
          <ErrorBoundary
            fallbackTitle="Erreur d'ouverture du profil"
            fallbackMessage="Le profil du joueur n'a pas pu être affiché correctement."
            onClose={() => setIsProfileModalOpen(false)}
          >
            <PlayerProfileScreen
              isOpen={true}
              onClose={() => setIsProfileModalOpen(false)}
              sourceScreen={currentScreen}
              isGameActive={currentScreen === 'GAME' && gameState.phase !== 'SETUP' && gameState.phase !== 'MANCHE_OVER'}
              isMultiplayer={isOnlineActive}
              gamePlayerCount={activeGameState.players?.length || 4}
              soundEnabled={soundEnabled}
              onToggleSound={toggleSound}
              onOpenLeaderboard={() => setIsLeaderboardOpen(true)}
            />
          </ErrorBoundary>
        )}
      </AnimatePresence>

      {/* Global Leaderboard & Palmarès Modal (Lot 4) */}
      <AnimatePresence>
        {isLeaderboardOpen && (
          <GlobalLeaderboardModal
            isOpen={true}
            onClose={() => setIsLeaderboardOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Pile de notifications unique : invitation, alerte Kora, toasts, mise à jour, version */}
      <TopNotificationStack>
        <DirectInviteToast
          invitations={incomingInvitations}
          onAccept={handleAcceptInvitationUnified}
          onDecline={handleDeclineInvitationUnified}
          onDismiss={handleDismissInvitationUnified}
          onBlock={handleBlockInvitationUnified}
          compact={currentScreen === 'GAME'}
          willSaveSolo={currentScreen === 'GAME' && !isMultiplayerMode}
        />

        {currentScreen === 'GAME' && (
          <KoraHunterAlertBanner
            show={Boolean(activeGameState.showKoraHunterAlert)}
            onDismiss={handleDismissKoraHunterAlertUnified}
          />
        )}

        {pushOptIn.visible && (
          <PushOptInBanner busy={pushOptIn.busy} onEnable={pushOptIn.enable} onLater={pushOptIn.later} />
        )}

        <NotificationViewport />

        <UpdateNotificationBanner
          updateAvailable={updateAvailable}
          isReloading={isAppReloading}
          onUpdateNow={() => forceReload(true)}
          isGameActive={isGamePlaying}
        />

        {versionStatus?.updateRecommended && versionStatus?.isProtocolCompatible !== false && !dismissedVersionBanner && (
          <div className="pointer-events-auto w-[calc(100%-1.5rem)] max-w-sm rounded-2xl border border-amber-500/50 bg-slate-900/95 p-3 text-amber-300 shadow-xl backdrop-blur-md flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 text-xs font-medium">
              <span className="text-base">🚀</span>
              <span>Nouvelle version du serveur disponible ({versionStatus.serverVersion || '2.5.22'}).</span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="min-h-[44px] rounded-xl bg-amber-500 px-3 text-xs font-black text-slate-950 transition hover:bg-amber-400 active:scale-95"
              >
                Recharger
              </button>
              <button
                type="button"
                aria-label="Masquer l'avertissement"
                onClick={() => setDismissedVersionBanner(true)}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 transition hover:text-white"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </TopNotificationStack>

      {/* Deep Link Joining Overlay */}
      {deepLinkWaitState?.active && (
        <JoinProgressIndicator
          variant="overlay"
          roomCode={deepLinkWaitState.roomCode}
          elapsedSeconds={deepLinkWaitState.elapsedSeconds}
          onCancel={handleCancelDeepLink}
        />
      )}

      {/* Critical Version Negotiation Overlay (Tier 1 - Strict Protocol Mismatch) */}
      {versionStatus?.isProtocolCompatible === false && (
        <div className="fixed inset-0 z-[99999] bg-slate-950/95 backdrop-blur-lg flex items-center justify-center p-4 text-center">
          <div className="max-w-md w-full bg-slate-900 border-2 border-rose-500/80 rounded-3xl p-6 shadow-2xl flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center justify-center text-3xl font-black">
              ⚠️
            </div>
            <h2 className="text-xl font-black text-white">Mise à Jour Requise</h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Votre version de l'application (Protocole v1) n'est plus compatible avec le serveur officiel Katika (Protocole v2 - {versionStatus.serverVersion || '2.5.22'}).
            </p>
            <p className="text-[11px] text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-xl">
              Veuillez recharger la page pour synchroniser automatiquement les protocoles de jeu.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full py-3.5 rounded-2xl bg-rose-500 text-white font-black text-sm hover:bg-rose-600 transition shadow-lg cursor-pointer"
            >
              Recharger l'Application Maintenant
            </button>
          </div>
        </div>
      )}

      {/* Session Takeover Overlay (Tier 1 - Strict Reconnect Conflict) */}
      {isSessionTakenOver && (
        <div className="fixed inset-0 z-[99999] bg-slate-950/95 backdrop-blur-lg flex items-center justify-center p-4 text-center">
          <div className="max-w-md w-full bg-slate-900 border-2 border-amber-500/80 rounded-3xl p-6 shadow-2xl flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center text-3xl font-black">
              <LogOut className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-black text-white">Jeu en cours sur un autre onglet</h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Votre compte a été connecté sur un autre onglet ou un autre appareil. Par mesure de sécurité et pour éviter les conflits, cette session a été mise en pause.
            </p>
            <p className="text-[11px] text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-xl">
              Si vous souhaitez reprendre la partie sur cet écran, cliquez sur le bouton ci-dessous pour forcer la reconnexion.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full py-3.5 rounded-2xl bg-amber-500 text-slate-950 font-black text-sm hover:bg-amber-400 transition shadow-lg cursor-pointer flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Reprendre la partie ici
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
export default App;
