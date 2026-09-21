import React, { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react';
import { GameState, SavedManche } from '../types';

const STORAGE_SESSIONS_KEY = 'njambo_saved_manches';
const STORAGE_ACTIVE_ID_KEY = 'njambo_active_session_id';

export function sanitizeLoadedGameState(rawState: GameState): GameState {
  const players = rawState.players || [];
  const plays = rawState.currentTrick?.plays || [];
  let turnIdx = typeof rawState.currentTurnIndex === 'number' ? rawState.currentTurnIndex : 0;

  // If saved while dealing, restore to PLAYING if cards are already in hand
  let phase = rawState.phase;
  if (phase === 'DEALING' && players.some((p) => p.hand && p.hand.length > 0)) {
    phase = 'PLAYING';
  }

  if (plays.length > 0 && players.length > 0) {
    const lastPlay = plays[plays.length - 1];
    if (lastPlay && lastPlay.playerIndex === turnIdx) {
      let next = (turnIdx + 1) % players.length;
      let attempts = 0;
      while (players[next]?.isEliminated && attempts < players.length) {
        next = (next + 1) % players.length;
        attempts++;
      }
      turnIdx = next;
    }
  }

  if (players[turnIdx]?.isEliminated && players.length > 0) {
    let next = (turnIdx + 1) % players.length;
    let attempts = 0;
    while (players[next]?.isEliminated && attempts < players.length) {
      next = (next + 1) % players.length;
      attempts++;
    }
    turnIdx = next;
  }

  return {
    ...rawState,
    phase,
    currentTurnIndex: turnIdx,
    isThinkingAI: false,
    aiThinkingPlayerName: null,
    humanSelectedCardId: null,
    enableDoubleKora: rawState.enableDoubleKora ?? true,
    enableUnder21: rawState.enableUnder21 ?? true,
    aiDifficulty: rawState.aiDifficulty ?? 'NORMAL',
    soloBetIncreaseMode: rawState.soloBetIncreaseMode ?? (localStorage.getItem('njambo_solo_bet_increase_mode') as any) ?? 'souverain',
    partieWinType: rawState.partieWinType ?? null,
    consecutiveThreesCountByPlayer: rawState.consecutiveThreesCountByPlayer || {},
    doubleKoraAchievedByPlayer: rawState.doubleKoraAchievedByPlayer || {},
    currentTrick: rawState.currentTrick || {
      trickNumber: rawState.currentTrickNumber || 1,
      leadSuit: null,
      leadPlayerIndex: turnIdx,
      leadPlayerName: players[turnIdx]?.name || 'Joueur',
      plays: [],
      winnerIndex: null,
      winnerName: null,
      winningCard: null,
      isComplete: false,
    },
  };
}

export function useGamePersistence(
  gameState: GameState,
  setGameState: Dispatch<SetStateAction<GameState>>,
  onSessionLoaded?: (session: SavedManche) => void
) {
  const [savedSessions, setSavedSessions] = useState<SavedManche[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_SESSIONS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error('Failed to parse saved manches:', e);
      return [];
    }
  });

  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_ACTIVE_ID_KEY) || null;
  });

  // Auto-save active session to localStorage whenever gameState changes
  useEffect(() => {
    if (!activeSessionId || gameState.phase === 'SETUP') return;

    const now = Date.now();
    setSavedSessions((prevSessions) => {
      const existingIndex = prevSessions.findIndex((s) => s.id === activeSessionId);
      const defaultTitle = `Manche à ${gameState.players.length} joueurs (${new Date(now).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })})`;

      const sessionTitle = existingIndex >= 0 ? prevSessions[existingIndex].title : defaultTitle;

      const updatedSession: SavedManche = {
        id: activeSessionId,
        title: sessionTitle,
        createdAt: existingIndex >= 0 ? prevSessions[existingIndex].createdAt : now,
        updatedAt: now,
        opponentCount: gameState.players.length - 1,
        baseBet: gameState.baseBet,
        initialCapital: gameState.initialCapital,
        enableDoubleKora: gameState.enableDoubleKora,
        enableUnder21: gameState.enableUnder21,
        aiDifficulty: gameState.aiDifficulty || 'NORMAL',
        gameState: gameState,
      };

      let newSessions: SavedManche[];
      if (existingIndex >= 0) {
        newSessions = [...prevSessions];
        newSessions[existingIndex] = updatedSession;
      } else {
        newSessions = [updatedSession, ...prevSessions];
      }

      try {
        localStorage.setItem(STORAGE_SESSIONS_KEY, JSON.stringify(newSessions));
        localStorage.setItem(STORAGE_ACTIVE_ID_KEY, activeSessionId);
      } catch (e) {
        console.error('Error saving session to localStorage:', e);
      }

      return newSessions;
    });
  }, [gameState, activeSessionId]);

  const saveCurrentSession = useCallback(
    (customTitle?: string) => {
      const currentId = activeSessionId || `manche-${Date.now()}`;
      if (!activeSessionId) setActiveSessionId(currentId);

      const now = Date.now();
      const defaultTitle = `Manche à ${gameState.players.length} joueurs (${new Date(now).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })})`;

      const titleToUse = customTitle || defaultTitle;

      setSavedSessions((prevSessions) => {
        const existingIndex = prevSessions.findIndex((s) => s.id === currentId);

        const updatedSession: SavedManche = {
          id: currentId,
          title: titleToUse,
          createdAt: existingIndex >= 0 ? prevSessions[existingIndex].createdAt : now,
          updatedAt: now,
          opponentCount: gameState.players.length - 1,
          baseBet: gameState.baseBet,
          initialCapital: gameState.initialCapital,
          enableDoubleKora: gameState.enableDoubleKora,
          enableUnder21: gameState.enableUnder21,
          gameState: gameState,
        };

        let newSessions: SavedManche[];
        if (existingIndex >= 0) {
          newSessions = [...prevSessions];
          newSessions[existingIndex] = updatedSession;
        } else {
          newSessions = [updatedSession, ...prevSessions];
        }

        try {
          localStorage.setItem(STORAGE_SESSIONS_KEY, JSON.stringify(newSessions));
          localStorage.setItem(STORAGE_ACTIVE_ID_KEY, currentId);
        } catch (e) {
          console.error('Error saving session to localStorage:', e);
        }

        return newSessions;
      });
    },
    [activeSessionId, gameState]
  );

  const loadSession = useCallback(
    (sessionId: string) => {
      const targetSession = savedSessions.find((s) => s.id === sessionId);
      if (!targetSession || !targetSession.gameState) return;

      setActiveSessionId(sessionId);
      localStorage.setItem(STORAGE_ACTIVE_ID_KEY, sessionId);

      const normalizedState = sanitizeLoadedGameState(targetSession.gameState);

      setGameState(normalizedState);
      if (onSessionLoaded) {
        onSessionLoaded(targetSession);
      }
    },
    [savedSessions, setGameState, onSessionLoaded]
  );

  const deleteSession = useCallback(
    (sessionId: string) => {
      setSavedSessions((prev) => {
        const updated = prev.filter((s) => s.id !== sessionId);
        localStorage.setItem(STORAGE_SESSIONS_KEY, JSON.stringify(updated));
        return updated;
      });

      if (activeSessionId === sessionId) {
        const newId = `manche-${Date.now()}`;
        setActiveSessionId(newId);
        localStorage.setItem(STORAGE_ACTIVE_ID_KEY, newId);
      }
    },
    [activeSessionId]
  );

  const renameSession = useCallback((sessionId: string, newTitle: string) => {
    setSavedSessions((prev) => {
      const updated = prev.map((s) => (s.id === sessionId ? { ...s, title: newTitle, updatedAt: Date.now() } : s));
      localStorage.setItem(STORAGE_SESSIONS_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const createNewSessionId = useCallback(() => {
    const newId = `manche-${Date.now()}`;
    setActiveSessionId(newId);
    localStorage.setItem(STORAGE_ACTIVE_ID_KEY, newId);
    return newId;
  }, []);

  return {
    savedSessions,
    activeSessionId,
    setActiveSessionId,
    saveCurrentSession,
    loadSession,
    deleteSession,
    renameSession,
    createNewSessionId,
  };
}
