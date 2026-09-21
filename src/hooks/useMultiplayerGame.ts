import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, MultiplayerRoom, EmoteMessage } from '../types';
import { wsService } from '../services/websocketService';
import { sounds } from '../utils/sound';
import { getPlayerId } from '../services/identity';

export function getLocalPlayerId(): string {
  return getPlayerId();
}

export function getLocalPlayerName(): string {
  const name = localStorage.getItem('njambo_player_name');
  if (name && name.trim().toLowerCase() !== 'katika') {
    return name.trim();
  }
  const defaultName = 'Joueur ' + Math.floor(100 + Math.random() * 900);
  localStorage.setItem('njambo_player_name', defaultName);
  return defaultName;
}

export function setLocalPlayerName(name: string): void {
  const trimmed = name.trim();
  if (trimmed.toLowerCase() === 'katika') return;
  localStorage.setItem('njambo_player_name', trimmed);
}

export function useMultiplayerGame() {
  const [isMultiplayerMode, setIsMultiplayerMode] = useState<boolean>(false);
  const [multiplayerRoom, setMultiplayerRoom] = useState<MultiplayerRoom | null>(null);
  const [isWsConnected, setIsWsConnected] = useState<boolean>(() => wsService.isConnected());
  const [showMultiplayerHub, setShowMultiplayerHub] = useState<boolean>(false);
  const [showMultiplayerLobby, setShowMultiplayerLobby] = useState<boolean>(false);
  const [multiplayerSelectedCardId, setMultiplayerSelectedCardId] = useState<string | null>(null);
  const [turnRemainingSeconds, setTurnRemainingSeconds] = useState<number | null>(null);
  const [roundEndRemainingSeconds, setRoundEndRemainingSeconds] = useState<number | null>(null);
  const [serverErrorMessage, setServerErrorMessage] = useState<string | null>(null);
  const [isSessionTakenOver, setIsSessionTakenOver] = useState<boolean>(false);
  const [versionStatus, setVersionStatus] = useState<{
    isProtocolCompatible: boolean;
    updateRecommended: boolean;
    serverVersion?: string;
  } | null>(null);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);

  const localPlayerId = getLocalPlayerId();
  const localPlayerName = getLocalPlayerName();

  // Le lien ?join=CODE est traité par App.tsx (connexion directe ; le hub ne s'ouvre qu'en cas d'échec).

  // Listen to WebSocket server room updates
  const lastRoomStatusRef = useRef<string | null>(null);

  useEffect(() => {
    const unsubConn = wsService.onConnectionStateChange((connected) => {
      setIsWsConnected(connected);
    });

    const unsubRoom = wsService.onRoomUpdate((updated) => {
      if (!updated) {
        setIsMultiplayerMode(false);
        setMultiplayerRoom(null);
        setShowMultiplayerLobby(false);
      } else {
        const prevStatus = lastRoomStatusRef.current;
        lastRoomStatusRef.current = updated.status;
        setMultiplayerRoom(updated);
        setIsMultiplayerMode(true);

        if (updated.status === 'LOBBY') {
          setShowMultiplayerLobby(true);
        } else {
          setShowMultiplayerLobby(false);
          setShowMultiplayerHub(false);
          if (prevStatus === 'LOBBY' && updated.status === 'PLAYING') {
            sounds.playShuffle();
          }
        }
      }
    });

    const unsubError = wsService.onError((err) => {
      if (err === 'SESSION_TAKEOVER') {
        setIsSessionTakenOver(true);
        return;
      }
      setServerErrorMessage(err);
      setTimeout(() => setServerErrorMessage(null), 4000);
    });

    const unsubAlert = wsService.onLobbyAlert((alert) => {
      setServerErrorMessage(alert);
      sounds.playCutSlash();
      setTimeout(() => setServerErrorMessage(null), 5000);
    });

    const unsubVersion = wsService.onVersionStatus((data) => {
      setVersionStatus({
        isProtocolCompatible: data.isProtocolCompatible,
        updateRecommended: data.updateRecommended,
        serverVersion: data.serverVersion,
      });
    });

    const unsubOffline = wsService.onOfflineQueueFlushed((count) => {
      if (count > 0) {
        setOfflineNotice(`⚡ ${count} action(s) hors-ligne synchronisée(s) !`);
        setTimeout(() => setOfflineNotice(null), 4000);
      }
    });

    return () => {
      unsubConn();
      unsubRoom();
      unsubError();
      unsubAlert();
      unsubVersion();
      unsubOffline();
    };
  }, []);

  // Turn time countdown ticker (15s default, strictly server-synchronized)
  useEffect(() => {
    if (!isMultiplayerMode || !multiplayerRoom?.gameState || multiplayerRoom.status !== 'PLAYING') {
      setTurnRemainingSeconds(null);
      return;
    }

    const gs = multiplayerRoom.gameState;
    if (gs.phase !== 'PLAYING') {
      setTurnRemainingSeconds(null);
      return;
    }

    const timerLimit = multiplayerRoom.turnTimerSeconds ?? 15;
    if (timerLimit <= 0) {
      setTurnRemainingSeconds(null);
      return;
    }

    const updateTimer = () => {
      const serverNow = wsService.getServerTime();
      const started = gs.turnStartedAt || serverNow;
      const elapsed = (serverNow - started) / 1000;
      const rem = Math.max(0, Math.ceil(timerLimit - elapsed));
      setTurnRemainingSeconds(rem);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 500);
    return () => clearInterval(interval);
  }, [
    isMultiplayerMode,
    multiplayerRoom?.gameState?.turnStartedAt,
    multiplayerRoom?.gameState?.phase,
    multiplayerRoom?.status,
    multiplayerRoom?.turnTimerSeconds,
  ]);

  // Round end auto-advance timer countdown
  useEffect(() => {
    if (!isMultiplayerMode || !multiplayerRoom || (multiplayerRoom.status !== 'PARTIE_OVER' && multiplayerRoom.status !== 'MANCHE_OVER')) {
      setRoundEndRemainingSeconds(null);
      return;
    }

    const autoAdvanceAt = multiplayerRoom.roundEndAutoAdvanceAt;
    if (!autoAdvanceAt) {
      setRoundEndRemainingSeconds(null);
      return;
    }

    const updateRoundEndTimer = () => {
      const serverNow = wsService.getServerTime();
      const rem = Math.max(0, Math.ceil((autoAdvanceAt - serverNow) / 1000));
      setRoundEndRemainingSeconds(rem);
    };

    updateRoundEndTimer();
    const interval = setInterval(updateRoundEndTimer, 500);
    return () => clearInterval(interval);
  }, [isMultiplayerMode, multiplayerRoom?.status, multiplayerRoom?.roundEndAutoAdvanceAt]);

  const handleCreateRoom = useCallback(
    async (settings: {
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
    }, confirmLeaveCurrent?: boolean) => {
      setLocalPlayerName(settings.playerName);
      
      return new Promise<{ success: boolean; error?: string; errorCode?: string; activeGameRoomCode?: string }>((resolve) => {
        const unsubRoom = wsService.onRoomUpdate((updated) => {
          if (updated && updated.status === 'LOBBY' && updated.players.some(p => p.isHost && p.name === settings.playerName)) {
            unsubRoom();
            unsubError();
            clearTimeout(timeout);
            setIsMultiplayerMode(true);
            setShowMultiplayerHub(false);
            setShowMultiplayerLobby(true);
            resolve({ success: true });
          }
        });
        
        const unsubError = wsService.onError((err, code, activeRoom) => {
          unsubRoom();
          unsubError();
          clearTimeout(timeout);
          resolve({ success: false, error: err, errorCode: code, activeGameRoomCode: activeRoom });
        });
        
        const timeout = setTimeout(() => {
          unsubRoom();
          unsubError();
          const currentRoom = wsService.getCurrentRoom();
          if (currentRoom && currentRoom.status === 'LOBBY' && currentRoom.players.some(p => p.isHost && p.name === settings.playerName)) {
            setIsMultiplayerMode(true);
            setShowMultiplayerHub(false);
            setShowMultiplayerLobby(true);
            resolve({ success: true });
            return;
          }
          resolve({ success: false, error: 'Connexion impossible. Vérifie ton réseau puis réessaie.' });
        }, 60000);
        
        wsService.createRoom(settings.playerName, {
          fillWithBots: settings.fillWithBots,
          maxPlayers: settings.maxPlayers ? Math.min(4, Math.max(2, settings.maxPlayers)) : 4,
          baseBet: settings.baseBet,
          initialCapital: settings.initialCapital,
          enableDoubleKora: settings.enableDoubleKora,
          enableUnder21: settings.enableUnder21,
          turnTimerSeconds: settings.turnTimerSeconds || 15,
          isPublic: settings.isPublic !== undefined ? settings.isPublic : true,
        }, confirmLeaveCurrent).catch((err: any) => {
          unsubRoom();
          unsubError();
          clearTimeout(timeout);
          resolve({ success: false, error: err.message });
        });
      });
    },
    []
  );

  const handleJoinRoom = useCallback(async (roomId: string, playerName: string, confirmLeaveCurrent?: boolean) => {
    setLocalPlayerName(playerName);
    
    return new Promise<{ success: boolean; error?: string; errorCode?: string; activeGameRoomCode?: string }>((resolve) => {
      const unsubRoom = wsService.onRoomUpdate((updated) => {
        if (updated && updated.id === roomId.toUpperCase()) {
          unsubRoom();
          unsubError();
          clearTimeout(timeout);
          setIsMultiplayerMode(true);
          setShowMultiplayerHub(false);
          setShowMultiplayerLobby(updated.status === 'LOBBY');
          resolve({ success: true });
        }
      });

      const unsubError = wsService.onError((err, code, activeRoom) => {
        unsubRoom();
        unsubError();
        clearTimeout(timeout);
        resolve({ success: false, error: err, errorCode: code, activeGameRoomCode: activeRoom });
      });

      const timeout = setTimeout(() => {
        unsubRoom();
        unsubError();
        const currentRoom = wsService.getCurrentRoom();
        if (currentRoom && currentRoom.id === roomId.toUpperCase()) {
          setIsMultiplayerMode(true);
          setShowMultiplayerHub(false);
          setShowMultiplayerLobby(currentRoom.status === 'LOBBY');
          resolve({ success: true });
          return;
        }
        resolve({ success: false, error: 'Connexion impossible. Vérifie ton réseau puis réessaie.' });
      }, 60000);

      wsService.joinRoom(roomId, playerName, confirmLeaveCurrent).catch((err: any) => {
        unsubRoom();
        unsubError();
        clearTimeout(timeout);
        resolve({ success: false, error: err.message });
      });
    });
  }, []);

  const handleQuickMatch = useCallback(async (settings?: { baseBet?: number; initialCapital?: number }, confirmLeaveCurrent?: boolean) => {
    return new Promise<{ success: boolean; error?: string; errorCode?: string; activeGameRoomCode?: string }>((resolve) => {
      const unsubRoom = wsService.onRoomUpdate((updated) => {
        if (updated && updated.status === 'LOBBY') {
          unsubRoom();
          unsubError();
          unsubQuickMatch();
          clearTimeout(timeout);
          setIsMultiplayerMode(true);
          setShowMultiplayerHub(false);
          setShowMultiplayerLobby(true);
          resolve({ success: true });
        }
      });

      const unsubQuickMatch = wsService.onQuickMatchResult((_matchedRoomCode) => {
        // Quick match result received; onRoomUpdate will fire and resolve
      });

      const unsubError = wsService.onError((err, code, activeRoom) => {
        unsubRoom();
        unsubError();
        unsubQuickMatch();
        clearTimeout(timeout);
        resolve({ success: false, error: err, errorCode: code, activeGameRoomCode: activeRoom });
      });

      const timeout = setTimeout(() => {
        unsubRoom();
        unsubError();
        unsubQuickMatch();
        const currentRoom = wsService.getCurrentRoom();
        if (currentRoom && (currentRoom.status === 'LOBBY' || currentRoom.status === 'PLAYING')) {
          setIsMultiplayerMode(true);
          setShowMultiplayerHub(false);
          setShowMultiplayerLobby(currentRoom.status === 'LOBBY');
          resolve({ success: true });
          return;
        }
        resolve({ success: false, error: 'Connexion impossible. Vérifie ton réseau puis réessaie.' });
      }, 60000);

      wsService.quickMatch(settings, confirmLeaveCurrent).catch((err: any) => {
        unsubRoom();
        unsubError();
        unsubQuickMatch();
        clearTimeout(timeout);
        resolve({ success: false, error: err.message });
      });
    });
  }, []);

  const handleStartMultiplayerGame = useCallback(async () => {
    wsService.startGame();
  }, []);

  const handleToggleReady = useCallback((isReady: boolean) => {
    wsService.setReady(isReady);
  }, []);

  const handlePlayMultiplayerCard = useCallback((card: Card) => {
    wsService.playCard(card.id);
  }, []);

  const handleLeaveMultiplayer = useCallback(async (showHub: boolean = true) => {
    wsService.leaveRoom();
    setMultiplayerRoom(null);
    setIsMultiplayerMode(false);
    setShowMultiplayerLobby(false);
    if (showHub) {
      setShowMultiplayerHub(true);
    }
  }, []);

  const handleForfeitMultiplayerGame = useCallback(() => {
    wsService.leaveRoom();
    setMultiplayerRoom(null);
    setIsMultiplayerMode(false);
    setShowMultiplayerLobby(false);
    setShowMultiplayerHub(false);
  }, []);

  const handleFoldMultiplayerRound = useCallback(() => {
    wsService.foldRound();
  }, []);

  const handleClaimForfeitVictory = useCallback(() => {
    wsService.claimForfeitVictory();
  }, []);

  const handleSendMultiplayerEmote = useCallback(
    (text: string, emoji?: string) => {
      wsService.sendEmote(text, emoji);
    },
    []
  );

  const handleToggleReadyForNext = useCallback(() => {
    wsService.readyForNextPartie();
  }, []);

  const handleAdvancePartieDirectly = useCallback(() => {
    wsService.forceNextPartie();
  }, []);

  const handleToggleFillWithBots = useCallback(async (enabled: boolean) => {
    wsService.updateRoomSettings({ fillWithBots: enabled });
  }, []);

  const handleUpdateRoomSettings = useCallback(async (settings: Partial<MultiplayerRoom>) => {
    wsService.updateRoomSettings(settings);
  }, []);

  const handleKickPlayer = useCallback(async (playerId: string) => {
    wsService.kickPlayer(playerId);
  }, []);

  const handleAlertUnreadyPlayers = useCallback(async () => {
    wsService.alertUnreadyPlayers();
  }, []);

  const handleVoteStartWithBots = useCallback(async () => {
    wsService.voteBots();
  }, []);

  const handleClaimHostRole = useCallback(async () => {
    wsService.claimHost();
    return true;
  }, []);

  const handleTriggerKoraHunterAlert = useCallback(() => {
    wsService.triggerKoraHunterAlert();
  }, []);

  const handleDismissKoraHunterAlert = useCallback(() => {
    wsService.dismissKoraHunterAlert();
  }, []);

  const handleProposeBetIncrease = useCallback((amount: number) => {
    wsService.proposeBetIncrease(amount);
  }, []);

  const handleRespondBetIncrease = useCallback((agree: boolean) => {
    wsService.respondBetIncrease(agree);
  }, []);

  const handleCancelBetIncrease = useCallback(() => {
    wsService.cancelBetIncrease();
  }, []);

  const handleRequestIntegration = useCallback(() => {
    wsService.requestIntegration();
  }, []);

  const handleRespondIntegrationVote = useCallback((agree: boolean) => {
    wsService.respondIntegrationVote(agree);
  }, []);

  const handleProposeCapacityExtension = useCallback(() => {
    wsService.proposeCapacityExtension();
  }, []);

  const handleRespondCapacityExtension = useCallback((agree: boolean) => {
    wsService.respondCapacityExtension(agree);
  }, []);

  const handleProposeEarlyClose = useCallback(() => {
    wsService.proposeEarlyClose();
  }, []);

  const handleRespondEarlyClose = useCallback((agree: boolean) => {
    wsService.respondEarlyClose(agree);
  }, []);

  const handleCancelPendingJoin = useCallback(() => {
    wsService.cancelPendingJoin();
  }, []);

  return {
    isMultiplayerMode,
    setIsMultiplayerMode,
    multiplayerRoom,
    setMultiplayerRoom,
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
    isCoordinator: multiplayerRoom?.hostId === localPlayerId,
    handleCreateRoom,
    handleJoinRoom,
    handleQuickMatch,
    handleCancelPendingJoin,
    handleStartMultiplayerGame,
    handleToggleReady,
    handlePlayMultiplayerCard,
    handleFoldMultiplayerRound,
    handleLeaveMultiplayer,
    handleForfeitMultiplayerGame,
    handleClaimForfeitVictory,
    handleSendMultiplayerEmote,
    handleToggleReadyForNext,
    handleAdvancePartieDirectly,
    handleToggleFillWithBots,
    handleUpdateRoomSettings,
    handleKickPlayer,
    handleAlertUnreadyPlayers,
    handleVoteStartWithBots,
    handleClaimHostRole,
    handleTriggerKoraHunterAlert,
    handleDismissKoraHunterAlert,
    handleProposeBetIncrease,
    handleRespondBetIncrease,
    handleCancelBetIncrease,
    handleRequestIntegration,
    handleRespondIntegrationVote,
    handleProposeCapacityExtension,
    handleRespondCapacityExtension,
    handleProposeEarlyClose,
    handleRespondEarlyClose,
  };
}
