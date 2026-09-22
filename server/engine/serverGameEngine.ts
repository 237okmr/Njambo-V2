import {
  Card,
  GameState,
  MultiplayerRoom,
  Player,
  RoomPlayer,
  RoomStatus,
  PartieWinType,
  Trick,
  PlayedCard,
  InstantWinReveal,
  EmoteMessage,
  PreviousPartieSummary,
  Suit,
  PartieResult,
  PartieParticipantResult,
  PartieResultWinType,
  PartieEndReason,
} from '../../src/types';
import { build31Deck, dealCards, determineTrickWinner, getPlayableCards, isCardPlayable, shuffleDeck } from '../../src/utils/deck';
import {
  chooseAICard,
  chooseRelayAICard,
  evaluateAndShiftBotStrategy,
  hasKoraPotential,
  shouldBotFoldRound,
  getBotFoldReaction,
  getRandomBotProfiles,
  getRandomBotStrategy,
} from '../../src/utils/ai';
import { getEngineConfig, KatikaEngineConfig } from './engineConfig';
import { computePartieOutcome, applyPartiePayout, detectInstantWin } from '../../src/utils/gameRules';
import { buildPartieResult, computeForfeitPenalty, FORFAIT_PENALITE_DES_PLI, FORFAIT_INACTIVITE_GELE_LE_SIEGE } from '../../src/utils/settlement';

/**
 * Événements « table en danger » remontés au gestionnaire de salles pour notifier le joueur.
 * Règle du relais : un joueur absent est remplacé par un relais jusqu'à la fin de la partie en cours.
 */
export type PlayerAlert =
  | { kind: 'RELAY_STARTED'; reason: 'DISCONNECT' | 'AFK' | 'LEFT' }
  | { kind: 'TIMEOUT_WARNING'; missed: number; maxMissed: number }
  | { kind: 'RELAY_COST'; potShared: boolean; koraPenalty: number }
  | { kind: 'PARTIE_FORFEIT' }
  | { kind: 'MANCHE_LOST_BY_FORFEIT' };

export interface ActiveRoomState {
  room: MultiplayerRoom;
  engineConfig?: KatikaEngineConfig;
  turnTimeoutTimer: NodeJS.Timeout | null;
  trickResolutionTimer: NodeJS.Timeout | null;
  nextPartieTimer: NodeJS.Timeout | null;
  botMoveTimer: NodeJS.Timeout | null;
  instantWinTimer?: NodeJS.Timeout | null;
  autoStartTimer?: NodeJS.Timeout | null;
  hostTransferTimer?: NodeJS.Timeout | null;
  isHostDisconnectTimer?: boolean;
  disconnectTimers: Map<string, NodeJS.Timeout>;
  aiRelayTimers?: Map<string, NodeJS.Timeout>;
  consecutiveTimeouts: Map<string, number>;
  emergencyTrickPlayed?: Map<string, number>;
  onPlayerForfeit?: (playerId: string, room: MultiplayerRoom, isExplicit?: boolean) => void;
  onPlayerAlert?: (playerId: string, room: MultiplayerRoom, alert: PlayerAlert) => void;
  onPartieCompleted?: (room: MultiplayerRoom) => void;
  partieResults?: PartieResult[];
  onPartieResult?: (result: PartieResult, room: MultiplayerRoom) => void;
}

export function maskOpponentCards(room: MultiplayerRoom, viewerPlayerId: string): MultiplayerRoom {
  // Deep clone to prevent mutating internal server state
  const clonedRoom: MultiplayerRoom = JSON.parse(JSON.stringify(room));

  if (!clonedRoom.gameState) {
    return clonedRoom;
  }

  // Preserve instantWinReveal unmasked for all clients so everyone can see the dramatic cards!
  if (room.instantWinReveal) {
    clonedRoom.instantWinReveal = JSON.parse(JSON.stringify(room.instantWinReveal));
  }
  if (room.gameState.instantWinReveal) {
    clonedRoom.gameState.instantWinReveal = JSON.parse(JSON.stringify(room.gameState.instantWinReveal));
  }

  // Mask players' hands in gameState
  clonedRoom.gameState.players = clonedRoom.gameState.players.map((p, pIdx) => {
    if (p.id === viewerPlayerId) {
      // The player sees their own real cards
      return p;
    }
    // If this player is the instant win winner during instantWinReveal, do not mask!
    if (
      room.gameState?.instantWinReveal &&
      room.gameState.instantWinReveal.winnerIndex === pIdx
    ) {
      return p;
    }
    // Opponent cards are masked to dummy cards with exact length
    const maskedHand: Card[] = (p.hand || []).map((_, idx) => ({
      id: `MASKED_${p.id}_${idx}`,
      suit: 'COEUR',
      value: 0,
      label: '?',
      shortLabel: '?',
    }));
    return {
      ...p,
      hand: maskedHand,
    };
  });

  // Also mask in room.players
  clonedRoom.players = clonedRoom.players.map((p, pIdx) => {
    if (p.id === viewerPlayerId) {
      return p;
    }
    if (
      room.gameState?.instantWinReveal &&
      room.gameState.instantWinReveal.winnerIndex === pIdx
    ) {
      return p;
    }
    const maskedHand: Card[] = (p.hand || []).map((_, idx) => ({
      id: `MASKED_${p.id}_${idx}`,
      suit: 'COEUR',
      value: 0,
      label: '?',
      shortLabel: '?',
    }));
    return {
      ...p,
      hand: maskedHand,
    };
  });

  return clonedRoom;
}

/**
 * Synchronise strictement l'état des joueurs entre room.players (Lobby/RoomPlayer)
 * et room.gameState.players (Game/Player) pour garantir l'unicité de la vérité terrain.
 */
export function syncRoomPlayersWithGameState(room: MultiplayerRoom): void {
  if (!room.gameState) return;
  const gs = room.gameState;
  room.players = (room.players || []).map((rp) => {
    const gp = (gs.players || []).find((p) => p.id === rp.id);
    if (!gp) return rp;
    return {
      ...rp,
      isSpectator: false,
      hand: gp.hand || rp.hand || [],
      capital: gp.capital,
      score: gp.capital,
      tricksWonInRound: gp.tricksWonInRound || 0,
      isEliminated: gp.isEliminated || false,
      isFoldedInRound: gp.isFoldedInRound || false,
      isForfeit: gp.isForfeit || false,
      connected: gp.connected !== undefined ? gp.connected : rp.connected,
      isAiRelay: gp.isAiRelay !== undefined ? gp.isAiRelay : rp.isAiRelay,
      aiRelayPlaysCount: gp.aiRelayPlaysCount !== undefined ? gp.aiRelayPlaysCount : rp.aiRelayPlaysCount,
    };
  });
}

export function selectBotToReplace(
  bots: { id: string; name: string; capital: number; tricksWonInRound?: number; index: number }[]
): { id: string; name: string; capital: number; index: number } | null {
  if (bots.length === 0) return null;
  const sorted = [...bots].sort((a, b) => {
    // 1. Lowest capital
    if (a.capital !== b.capital) {
      return a.capital - b.capital;
    }
    // 2. Highest seat index (last added)
    if (a.index !== b.index) {
      return b.index - a.index;
    }
    // 3. Lowest tricks won
    return (a.tricksWonInRound || 0) - (b.tricksWonInRound || 0);
  });
  return sorted[0];
}

/**
 * Bot d'urgence minimal neutre (Jalon 1):
 * - Respecte strictement l'obligation de couleur (leadSuit).
 * - Joue systématiquement la carte ayant la plus faible valeur nominale.
 * - Ne défausse JAMAIS un 3 (carte de Kora) s'il possède une autre carte légale en main.
 * - Ne cherche jamais à couper agressivement ni à optimiser.
 */
export function selectNeutralCard(hand: Card[], leadSuit: Suit | null): Card {
  if (!hand || hand.length === 0) {
    throw new Error('Cannot select neutral card from empty hand');
  }

  // 1. Si une couleur est demandée
  if (leadSuit) {
    const matchingCards = (hand || []).filter((c) => c.suit === leadSuit);
    if (matchingCards.length > 0) {
      // Priorité : carte la plus faible nominalement hors 3 (Kora)
      const nonThreeCards = matchingCards.filter((c) => c.value !== 3);
      if (nonThreeCards.length > 0) {
        return [...nonThreeCards].sort((a, b) => a.value - b.value)[0];
      }
      // Si la main ne contient que des 3 dans la couleur demandée
      return matchingCards[0];
    }
  }

  // 2. Si aucune carte de la couleur demandée ou si c'est l'entame :
  // Défausse la carte la plus faible hors 3
  const nonThreeAll = (hand || []).filter((c) => c.value !== 3);
  if (nonThreeAll.length > 0) {
    return [...nonThreeAll].sort((a, b) => a.value - b.value)[0];
  }

  // 3. Cas extrême : la main ne contient que des 3
  return hand[0];
}

export class ServerGameEngine {
  private static roomGetter?: (roomId: string) => MultiplayerRoom | undefined;

  public static setRoomGetter(getter: (roomId: string) => MultiplayerRoom | undefined): void {
    this.roomGetter = getter;
  }
  public static getConfig(activeRoomState?: ActiveRoomState): KatikaEngineConfig {
    return activeRoomState?.engineConfig || getEngineConfig();
  }

  public static startNewGame(
    room: MultiplayerRoom,
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState
  ): void {
    if (room.players) {
      room.players = room.players.filter((p) => !p.leftRoom);
    }
    this.clearAllTimers(activeRoomState);
    activeRoomState.partieResults = [];

    const maxCapacity = Math.min(4, Math.max(2, room.maxPlayers || 4));
    // Keep only human players initially to reset bot roster cleanly (connected humans prioritized)
    const connectedHumans = (room.players || []).filter((p) => p.isHuman && p.connected !== false);
    const disconnectedHumans = (room.players || []).filter((p) => p.isHuman && p.connected === false);
    const humanPlayers = [...connectedHumans, ...disconnectedHumans];
    let currentPlayers: RoomPlayer[] = humanPlayers.slice(0, maxCapacity);

    // If fillWithBots is enabled and room not full, add bots
    if (room.fillWithBots && currentPlayers.length < maxCapacity) {
      const botsToAdd = maxCapacity - currentPlayers.length;
      const engineCfg = this.getConfig(activeRoomState);
      const botProfiles = getRandomBotProfiles(botsToAdd, engineCfg.hokutoSpawnRatePct);
      for (let i = 0; i < botsToAdd; i++) {
        const profile = botProfiles[i];
        const isRobam = profile.name === 'Robam Hokuto';
        currentPlayers.push({
          id: `bot_${Math.random().toString(36).substring(2, 8)}`,
          name: profile.name,
          isHost: false,
          isHuman: false,
          avatarSeed: profile.avatarSeed,
          score: room.initialCapital,
          capital: room.initialCapital,
          isEliminated: false,
          isSpectator: false,
          isPendingIntegration: false,
          hand: [],
          tricksWonInRound: 0,
          aiStrategy: isRobam ? 'HOKUTO_ADAPTIVE' : getRandomBotStrategy(false),
          connected: true,
          isReady: true,
        });
      }
    }

    // Prepare deck and deal
    const deck = shuffleDeck(build31Deck());
    const { hands } = dealCards(deck, currentPlayers.length);

    // Initial pot from baseBet of all players
    const baseBet = room.baseBet;
    const initialCapital = room.initialCapital;
    let pot = 0;

    // Update room.players in exact 1:1 order with current active game players
    room.players = currentPlayers;

    const gamePlayers: Player[] = currentPlayers.map((p, idx) => {
      const actualHand = hands[idx];
      const newCapital = Math.max(0, initialCapital - baseBet);
      pot += baseBet;

      p.hand = actualHand;
      p.capital = newCapital;
      p.score = initialCapital;

      return {
        id: p.id,
        name: p.name,
        score: initialCapital,
        capital: newCapital,
        isEliminated: false,
        hand: actualHand,
        isHuman: p.isHuman,
        avatarSeed: p.avatarSeed,
        tricksWonInRound: 0,
        basePersonality: p.aiStrategy || 'CONSERVATIVE',
        aiStrategy: p.aiStrategy || 'CONSERVATIVE',
      };
    });

    const dealerIndex = 0;
    const leadIndex = (dealerIndex + 1) % gamePlayers.length;

    const initialTrick: Trick = {
      trickNumber: 1,
      leadSuit: null,
      leadPlayerIndex: leadIndex,
      leadPlayerName: gamePlayers[leadIndex].name,
      plays: [],
      winnerIndex: null,
      winnerName: null,
      winningCard: null,
      isComplete: false,
    };

    const initialGameState: GameState = {
      phase: 'PLAYING',
      players: gamePlayers,
      pot,
      baseBet,
      initialBaseBet: room.initialBaseBet || baseBet,
      initialCapital,
      enableDoubleKora: room.enableDoubleKora ?? true,
      enableUnder21: room.enableUnder21 ?? true,
      showBotPersonalityIcons: false,
      enableKoraHunterAlerts: true,
      dealerIndex,
      leadIndex,
      currentTurnIndex: leadIndex,
      currentTrickNumber: 1,
      currentTrick: initialTrick,
      tricksHistory: [],
      partieWinnerIndex: null,
      partieWinnerName: null,
      partieWinType: null,
      consecutiveThreesCountByPlayer: {},
      doubleKoraAchievedByPlayer: {},
      mancheWinnerIndex: null,
      mancheWinnerName: null,
      roundWinnerIndex: null,
      roundWinnerName: null,
      isThinkingAI: false,
      aiThinkingPlayerName: null,
      humanSelectedCardId: null,
      partieCount: 1,
      roundCount: 1,
      turnStartedAt: Date.now(),
      dealParticipantIds: gamePlayers.map((p) => p.id),
      forfeitPenaltyPaid: {},
    };

    room.status = 'PLAYING';
    room.manchePartiesPlayed = 0;
    room.integrationProposal = null;

    const seatedPlayerIds = new Set(currentPlayers.map((p) => p.id));
    const spectators = (room.players || []).filter((p) => !seatedPlayerIds.has(p.id)).map((p) => ({
      ...p,
      isSpectator: true,
      hand: [],
      readyForNextPartie: false,
    }));

    room.players = [
      ...currentPlayers.map((p, idx) => ({
        ...p,
        name: p.name.replace(/\s*\(Obs\)$/, ''),
        isSpectator: false,
        isPendingIntegration: false,
        isEliminated: false,
        isForfeit: false,
        hand: gamePlayers[idx].hand,
        capital: gamePlayers[idx].capital,
        score: gamePlayers[idx].score,
        tricksWonInRound: 0,
        isReady: true,
        readyForNextPartie: false,
        connected: p.connected !== false,
      })),
      ...spectators,
    ];
    room.gameState = initialGameState;
    room.updatedAt = Date.now();

    // Check Instant Win on deal (Three Sevens & Under 21)
    if (this.checkInstantWinOnDeal(room, onStateChange, activeRoomState)) {
      return;
    }

    onStateChange(room);

    // Schedule turn timer or bot play
    this.scheduleTurnAction(room, onStateChange, activeRoomState);
  }

  /**
   * Checks for instant win conditions (Three Sevens, Under 21) immediately after dealing.
   * Returns true if an instant win occurred.
   */
  private static checkInstantWinOnDeal(
    room: MultiplayerRoom,
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState
  ): boolean {
    const gs = room.gameState;
    if (!gs) return false;

    const instantWin = detectInstantWin({
      hands: (gs.players || []).map((p) => p.hand || []),
      eligible: (gs.players || []).map((p) => !p.isEliminated && !p.isForfeit),
      dealerIndex: gs.dealerIndex ?? 0,
      enableUnder21: gs.enableUnder21 ?? false,
    });

    if (instantWin) {
      const winnerIndex = instantWin.winnerIndex;
      const winner = gs.players[winnerIndex];
      const count = instantWin.winType === 'THREE_SEVENS'
        ? (winner.hand || []).filter((c) => c.value === 7).length
        : (winner.hand || []).reduce((acc, c) => acc + c.value, 0);

      const reveal: InstantWinReveal = {
        winnerIndex,
        winnerName: winner.name,
        winType: instantWin.winType,
        hand: [...(winner.hand || [])],
        scoreOrCount: count,
      };
      this.triggerInstantWinReveal(room, reveal, onStateChange, activeRoomState);
      return true;
    }

    return false;
  }

  public static triggerInstantWinReveal(
    room: MultiplayerRoom,
    reveal: InstantWinReveal,
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState
  ): void {
    const gs = room.gameState;
    if (!gs) return;

    this.clearAllTimers(activeRoomState);

    // Neutralize turn indicator so no player gets a 15s timer
    gs.currentTurnIndex = -1;

    const cfg = this.getConfig(activeRoomState);
    reveal.expiresAt = Date.now() + cfg.instantWinAnimationTimeMs;

    // Set reveal object in room & gameState
    gs.instantWinReveal = reveal;
    room.instantWinReveal = reveal;
    room.updatedAt = Date.now();

    // Broadcast reveal to all players
    onStateChange(room);

    // After Xms (matching solo mode dramatic reveal duration), proceed to resolve instant win and show EndRoundModal
    activeRoomState.instantWinTimer = setTimeout(() => {
      // Re-fetch the fresh room reference to avoid closure state staleness if firestore synced
      const activeRoom = ServerGameEngine.roomGetter ? (ServerGameEngine.roomGetter(room.id) || room) : room;
      
      if (activeRoom.gameState) {
        activeRoom.gameState.instantWinReveal = null;
      }
      activeRoom.instantWinReveal = null;
      
      this.resolveInstantWin(activeRoom, reveal.winnerIndex, reveal.winType, onStateChange, activeRoomState);
    }, cfg.instantWinAnimationTimeMs);
  }

  private static resolveInstantWin(
    room: MultiplayerRoom,
    winnerIndex: number,
    winType: 'THREE_SEVENS' | 'UNDER_21',
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState
  ): void {
    const gs = room.gameState;
    if (!gs) return;

    this.clearAllTimers(activeRoomState);

    const winner = gs.players[winnerIndex];
    gs.phase = 'PARTIE_OVER';
    room.status = 'PARTIE_OVER';

    gs.partieWinnerIndex = winnerIndex;
    gs.partieWinnerName = winner.name;
    gs.partieWinType = winType;
    gs.roundWinnerIndex = winnerIndex;
    gs.roundWinnerName = winner.name;

    const capitalsBefore: Record<string, number> = {};
    (gs.players || []).forEach((p) => {
      capitalsBefore[p.id] = p.capital;
    });

    const cfg = this.getConfig(activeRoomState);
    const payout = applyPartiePayout({
      capitals: (gs.players || []).map((p) => p.capital),
      isEliminated: (gs.players || []).map((p) => p.isEliminated || p.isForfeit),
      winnerIndex,
      pot: gs.pot,
      baseBet: gs.baseBet,
      multiplier: 1,
      rakePct: 0,
    });
    const netPot = payout.winnerReceived;

    let nonEliminatedCount = 0;
    let lastStandingPlayer: Player | null = null;

    (gs.players || []).forEach((p, idx) => {
      p.capital = payout.capitals[idx];
      p.score = payout.capitals[idx];
      p.isEliminated = payout.eliminated[idx];
      if (!p.isEliminated) {
        nonEliminatedCount++;
        lastStandingPlayer = p;
      }
    });
    gs.pot = 0;

    if (nonEliminatedCount <= 1 && lastStandingPlayer) {
      gs.phase = 'MANCHE_OVER';
      room.status = 'MANCHE_OVER';
      gs.mancheWinnerIndex = (gs.players || []).findIndex((p) => p.id === (lastStandingPlayer as Player).id);
      gs.mancheWinnerName = (lastStandingPlayer as Player).name;
    }

    room.players = (room.players || []).map((rp) => {
      const gp = (gs.players || []).find((p) => p.id === rp.id);
      if (gp) {
        return {
          ...rp,
          capital: gp.capital,
          score: gp.capital,
          isEliminated: gp.isEliminated,
          readyForNextPartie: false,
        };
      }
      return rp;
    });

    this.emitPartieResult(room, activeRoomState, {
      winnerId: winner.id,
      winType: winType as PartieResultWinType,
      endReason: winType === 'THREE_SEVENS' ? 'THREE_SEVENS' : 'UNDER_21',
      capitalsBefore,
      grossByPlayerId: { [winner.id]: netPot },
    });

    const transitionDelay = cfg.transitionDelayMs;
    room.roundEndAutoAdvanceAt = Date.now() + transitionDelay;
    room.manchePartiesPlayed = (room.manchePartiesPlayed || 0) + 1;
    room.updatedAt = Date.now();
    onStateChange(room);

    activeRoomState.nextPartieTimer = setTimeout(() => {
      this.advanceToNextPartie(room, onStateChange, activeRoomState);
    }, transitionDelay);
  }

  public static handlePlayCard(
    room: MultiplayerRoom,
    playerId: string,
    cardId: string,
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState,
    isAutoPlayedByEmergencyBot: boolean = false
  ): boolean {
    const gs = room.gameState;
    if (!gs || gs.phase !== 'PLAYING' || room.status !== 'PLAYING') {
      return false;
    }

    const currentPlayer = gs.players[gs.currentTurnIndex];
    if (!currentPlayer || currentPlayer.id !== playerId) {
      // Not player's turn
      return false;
    }

    // Network tolerance buffer (1000ms):
    // Compare arrival timestamp with turn expiration. If human player played within tolerance (1000ms),
    // or if the bot has not yet finalized a move, accept the play cleanly.
    if (!isAutoPlayedByEmergencyBot) {
      const roomPlayer = (room.players || []).find((p) => p.id === playerId);
      const isConnected = roomPlayer ? roomPlayer.connected : true;
      if (isConnected && gs.turnStartedAt) {
        const nominalTurnMs = (room.turnTimerSeconds || 15) * 1000;
        const graceDeadline = gs.turnStartedAt + nominalTurnMs + 1000;
        if (Date.now() > graceDeadline && !activeRoomState.botMoveTimer) {
          console.log(`[PlayCard] Card from ${currentPlayer.name} rejected: received beyond network grace buffer (Tour expiré)`);
          return false;
        }
      }
    }

    const cardIndex = (currentPlayer.hand || []).findIndex((c) => c.id === cardId);
    if (cardIndex === -1) {
      // Card not in hand
      return false;
    }

    const card = currentPlayer.hand[cardIndex];
    if (!isCardPlayable(card, currentPlayer.hand, gs.currentTrick.leadSuit)) {
      // Illegal card play
      return false;
    }

    // Play is legal! Clear timers
    this.clearTurnTimers(activeRoomState);
    // Le compteur de tours manqués ne repart de zéro que si le JOUEUR joue lui-même : la carte jouée d'office
    // à sa place (relais / délai écoulé) ne doit pas l'effacer, sinon le 3e tour manqué n'arriverait jamais.
    if (!isAutoPlayedByEmergencyBot && activeRoomState.consecutiveTimeouts) {
      activeRoomState.consecutiveTimeouts.set(playerId, 0);
    }
    if (!isAutoPlayedByEmergencyBot) {
      currentPlayer.consecutiveMissedTurns = 0;
      const roomPlayer = (room.players || []).find((p) => p.id === playerId);
      if (roomPlayer) {
        roomPlayer.consecutiveMissedTurns = 0;
      }
      // Un joueur qui joue lui-même reprend la main : le relais s'efface, le siège redevient normal.
      this.endRelay(room, playerId);
    }

    // Update trick
    const isLeadCard = gs.currentTrick.plays.length === 0;
    const leadSuit = isLeadCard ? card.suit : gs.currentTrick.leadSuit;

    // Check if card is winning so far
    const playedCard: PlayedCard = {
      card,
      playerIndex: gs.currentTurnIndex,
      playerName: currentPlayer.name,
      playerId: currentPlayer.id,
      isLeadCard,
      isMatchingSuit: card.suit === leadSuit,
      isWinningSoFar: false,
      playedOrder: gs.currentTrick.plays.length + 1,
      isAutoPlayedByEmergencyBot,
      autoPlaySeconds: isAutoPlayedByEmergencyBot ? 20 : undefined,
    };

    const newPlays = [...gs.currentTrick.plays, playedCard];
    const { winnerPlay } = determineTrickWinner(newPlays, leadSuit);
    const updatedPlays = newPlays.map((p) => ({
      ...p,
      isWinningSoFar: winnerPlay ? p.card.id === winnerPlay.card.id : false,
    }));

    // Remove card from hand
    if(currentPlayer.hand) currentPlayer.hand.splice(cardIndex, 1);

    // Update room.players hand as well
    const roomPlayer = (room.players || []).find((p) => p.id === playerId);
    if (roomPlayer) {
      roomPlayer.hand = [...currentPlayer.hand];
    }

    gs.currentTrick = {
      ...gs.currentTrick,
      leadSuit,
      plays: updatedPlays,
    };

    const activePlayersCount = (gs.players || []).filter((p) => !p.isEliminated && !p.isFoldedInRound && !p.isForfeit).length;

    // Check if trick is complete
    if (gs.currentTrick.plays.length >= activePlayersCount) {
      // Trick is finished
      gs.phase = 'TRICK_RESOLVED';
      const resolvedWinner = determineTrickWinner(gs.currentTrick.plays, leadSuit);
      const winnerIndex = resolvedWinner.winnerPlay ? resolvedWinner.winnerPlay.playerIndex : gs.leadIndex;
      const winner = gs.players[winnerIndex];

      gs.currentTrick.winnerIndex = winnerIndex;
      gs.currentTrick.winnerName = winner.name;
      gs.currentTrick.winningCard = resolvedWinner.winnerPlay?.card || null;
      gs.currentTrick.isComplete = true;

      winner.tricksWonInRound = (winner.tricksWonInRound || 0) + 1;
      const roomWinner = (room.players || []).find((p) => p.id === winner.id);
      if (roomWinner) {
        roomWinner.tricksWonInRound = winner.tricksWonInRound;
      }

      room.updatedAt = Date.now();
      onStateChange(room);

      // Delay for fluid trick appreciation and sweep animation
      const cfg = this.getConfig(activeRoomState);
      activeRoomState.trickResolutionTimer = setTimeout(() => {
        this.resolveCompletedTrick(room, onStateChange, activeRoomState);
      }, cfg.trickResolutionTimeMs);

      return true;
    }

    // Trick continues to next player
    let nextIndex = (gs.currentTurnIndex + 1) % (gs.players || []).length;
    while (gs.players[nextIndex].isEliminated || gs.players[nextIndex].isFoldedInRound || gs.players[nextIndex].isForfeit) {
      nextIndex = (nextIndex + 1) % (gs.players || []).length;
    }

    gs.currentTurnIndex = nextIndex;
    gs.turnStartedAt = Date.now();
    room.updatedAt = Date.now();
    onStateChange(room);

    // Schedule turn for next player
    this.scheduleTurnAction(room, onStateChange, activeRoomState);
    return true;
  }

  private static resolveCompletedTrick(
    room: MultiplayerRoom,
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState
  ): void {
    const gs = room.gameState;
    if (!gs) return;

    gs.tricksHistory.push(gs.currentTrick);
    let winnerIndex = gs.currentTrick.winnerIndex ?? gs.leadIndex;

    // Question 2: If the trick winner was eliminated/forfeited, trick is burned and lead passes to next active player
    const isWinnerEliminated = gs.players[winnerIndex].isEliminated || gs.players[winnerIndex].isForfeit;
    if (isWinnerEliminated) {
      gs.currentTrick.winnerIndex = null;
      gs.currentTrick.winnerName = 'Cartes brûlées (Joueur éliminé)';
      gs.players[winnerIndex].tricksWonInRound = Math.max(0, (gs.players[winnerIndex].tricksWonInRound || 1) - 1);
      let nextLead = (winnerIndex + 1) % (gs.players || []).length;
      let loops = 0;
      while ((gs.players[nextLead].isEliminated || gs.players[nextLead].isForfeit) && loops < (gs.players || []).length) {
        nextLead = (nextLead + 1) % (gs.players || []).length;
        loops++;
      }
      winnerIndex = nextLead;
    }

    // If trick 4 was won with a 3, track for potential Double Kora in trick 5
    if (gs.currentTrickNumber === 4 && gs.currentTrick.winningCard?.value === 3) {
      gs.consecutiveThreesCountByPlayer = {
        ...(gs.consecutiveThreesCountByPlayer || {}),
        [winnerIndex]: 1,
      };
    }

    if (gs.currentTrickNumber < 5) {
      // Start next trick
      const nextTrickNum = gs.currentTrickNumber + 1;
      gs.currentTrickNumber = nextTrickNum;
      gs.leadIndex = winnerIndex;
      gs.currentTurnIndex = winnerIndex;
      gs.currentTrick = {
        trickNumber: nextTrickNum,
        leadSuit: null,
        leadPlayerIndex: winnerIndex,
        leadPlayerName: gs.players[winnerIndex].name,
        plays: [],
        winnerIndex: null,
        winnerName: null,
        winningCard: null,
        isComplete: false,
      };
      gs.phase = 'PLAYING';
      gs.turnStartedAt = Date.now();
      room.updatedAt = Date.now();
      onStateChange(room);

      this.scheduleTurnAction(room, onStateChange, activeRoomState);
    } else {
      // All 5 tricks are complete -> Partie Over!
      this.resolvePartieOver(room, onStateChange, activeRoomState);
    }
  }

  /**
   * Partage du pot quand le vainqueur désigné par les plis est un siège tenu par le relais.
   * Bénéficiaires : joueurs présents (ni relais, ni éliminés, ni forfait, ni couchés) ayant reçu des cartes.
   * Parts égales ; le reste de la division (moins d'un jeton par bénéficiaire) va aux premiers dans l'ordre des sièges,
   * de sorte qu'aucun jeton ne soit créé ni détruit. Retourne null si la règle ne s'applique pas.
   */
  private static computeRelaySplit(
    gs: NonNullable<MultiplayerRoom['gameState']>,
    winnerIndex: number
  ): {
    shares: number[];
    grossById: Record<string, number>;
    firstReceiverIndex: number;
    receiverIndexes: number[];
    label: string;
    absentName: string;
  } | null {
    const players = gs.players || [];
    const winner = players[winnerIndex];
    if (!winner || !winner.isHuman || !winner.relayAbsent) return null;

    const dealt = gs.dealParticipantIds && gs.dealParticipantIds.length > 0 ? new Set(gs.dealParticipantIds) : null;
    const receiverIndexes: number[] = [];
    players.forEach((p, i) => {
      if (i === winnerIndex) return;
      if (p.isEliminated || p.isForfeit || p.isFoldedInRound) return;
      if (p.isHuman && p.relayAbsent) return;
      if (dealt && !dealt.has(p.id)) return;
      receiverIndexes.push(i);
    });
    if (receiverIndexes.length === 0) return null;

    const pot = gs.pot;
    const each = Math.floor(pot / receiverIndexes.length);
    const remainder = pot - each * receiverIndexes.length;
    const shares: number[] = players.map(() => 0);
    const grossById: Record<string, number> = {};
    receiverIndexes.forEach((i, position) => {
      shares[i] = each + (position < remainder ? 1 : 0);
      grossById[players[i].id] = shares[i];
    });

    return {
      shares,
      grossById,
      firstReceiverIndex: receiverIndexes[0],
      receiverIndexes,
      label: `${receiverIndexes.map((i) => players[i].name).join(' & ')} (partage)`,
      absentName: winner.name,
    };
  }

  private static emitPartieResult(
    room: MultiplayerRoom,
    activeRoomState: ActiveRoomState,
    params: {
      winnerId: string | null;
      winType: PartieResultWinType;
      endReason: PartieEndReason;
      capitalsBefore: Record<string, number>;
      grossByPlayerId?: Record<string, number>;
      allowBurned?: boolean;
    }
  ): PartieResult | null {
    const gs = room.gameState;
    if (!gs) return null;

    const resultId = `${room.id}_m${room.mancheNumber ?? 1}_p${gs.partieCount}`;
    if (!activeRoomState.partieResults) {
      activeRoomState.partieResults = [];
    }

    const existing = activeRoomState.partieResults.find((r) => r.id === resultId);
    if (existing) {
      return existing;
    }

    const participantIds =
      gs.dealParticipantIds && gs.dealParticipantIds.length > 0
        ? gs.dealParticipantIds
        : (gs.players || []).map((p) => p.id);

    const participants: Omit<PartieParticipantResult, 'net'>[] = participantIds.map((pid) => {
      const gp = (gs.players || []).find((p) => p.id === pid);
      const rp = (room.players || []).find((p) => p.id === pid);
      const name = gp?.name || rp?.name || pid;
      const isHuman = gp ? gp.isHuman : rp ? rp.isHuman : true;
      const ante = gs.baseBet;
      const tricksWon = gp?.tricksWonInRound ?? rp?.tricksWonInRound ?? 0;

      let gross = 0;
      if (params.grossByPlayerId && pid in params.grossByPlayerId) {
        gross = params.grossByPlayerId[pid];
      } else if (params.winnerId && pid === params.winnerId) {
        gross = gs.pot;
      }

      const capBefore = params.capitalsBefore[pid] ?? (gp?.capital ?? rp?.capital ?? 0);
      const capAfter = gp?.capital ?? rp?.capital ?? 0;
      const endPenalty = pid === params.winnerId ? 0 : Math.max(0, capBefore - capAfter);
      const forfeitPenalty = gs.forfeitPenaltyPaid?.[pid] || 0;
      const penaltyPaid = endPenalty + forfeitPenalty;

      return {
        playerId: pid,
        name,
        isHuman,
        ante,
        penaltyPaid,
        gross,
        tricksWon,
      };
    });

    const isMancheOver = gs.phase === 'MANCHE_OVER' || room.status === 'MANCHE_OVER';

    const { result, invariantOk, invariantError } = buildPartieResult({
      id: resultId,
      roomId: room.id,
      mancheNumber: room.mancheNumber ?? 1,
      partieCount: gs.partieCount,
      baseBet: gs.baseBet,
      winnerId: params.winnerId,
      winType: params.winType,
      endReason: params.endReason,
      participants,
      mancheOver: isMancheOver,
      allowBurned: params.allowBurned,
    });

    if (!invariantOk && invariantError) {
      console.warn(`[PartieResult Warning] Invariant error for ${resultId}: ${invariantError}`);
    }

    activeRoomState.partieResults.push(result);
    if (activeRoomState.partieResults.length > 30) {
      activeRoomState.partieResults.shift();
    }

    const winnerParticipant = result.participants.find((p) => p.playerId === params.winnerId);
    room.previousPartieSummary = {
      partieCount: gs.partieCount,
      winnerName: winnerParticipant?.name || gs.partieWinnerName || '',
      winType: params.winType === 'EARLY_CLOSE' ? 'STANDARD' : (params.winType as PartieWinType),
      potWon: winnerParticipant?.gross || 0,
      winningCard: gs.currentTrick?.winningCard || undefined,
      playersSummary: result.participants.map((p) => ({
        id: p.playerId,
        name: p.name,
        deltaCapital: p.net,
        finalCapital: gs.players.find((gp) => gp.id === p.playerId)?.capital ?? 0,
      })),
    };

    activeRoomState.onPartieResult?.(result, room);
    return result;
  }

  private static resolvePartieOver(
    room: MultiplayerRoom,
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState
  ): void {
    const gs = room.gameState;
    if (!gs) return;

    gs.phase = 'PARTIE_OVER';
    room.status = 'PARTIE_OVER';

    // The winner of the 5th trick wins the standard partie!
    const lastTrick = gs.tricksHistory[gs.tricksHistory.length - 1];
    const fifthTrickWinnerIndex = lastTrick?.winnerIndex ?? 0;
    const fifthTrickWinningValue = lastTrick?.winningCard?.value ?? 0;

    const fourthTrick = gs.tricksHistory.find((t) => t.trickNumber === 4) || gs.tricksHistory[3];
    const fourthTrickWinnerIndex = fourthTrick?.winnerIndex;
    const fourthTrickWinningValue = fourthTrick?.winningCard?.value;

    const outcome = computePartieOutcome({
      fifthTrickWinnerIndex,
      fifthTrickWinningValue,
      fourthTrickWinnerIndex,
      fourthTrickWinningValue,
      enableDoubleKora: gs.enableDoubleKora,
    });

    let winType: 'STANDARD' | 'KORA' | 'DOUBLE_KORA' = outcome.winType;
    let multiplier = outcome.multiplier;
    let partieWinnerIndex = outcome.winnerIndex;

    // RÈGLE DU RELAIS : un siège tenu par le relais (joueur absent) ne peut pas remporter le pot.
    // Le pot est alors partagé à parts égales entre les joueurs présents, sans bonus Kora.
    const relaySplit = this.computeRelaySplit(gs, partieWinnerIndex);
    if (relaySplit) {
      winType = 'STANDARD';
      multiplier = 1;
      partieWinnerIndex = relaySplit.firstReceiverIndex;
    }

    if (winType === 'DOUBLE_KORA') {
      gs.doubleKoraAchievedByPlayer = {
        ...(gs.doubleKoraAchievedByPlayer || {}),
        [partieWinnerIndex]: true,
      };
    }

    const winner = gs.players[partieWinnerIndex];
    gs.partieWinnerIndex = partieWinnerIndex;
    gs.partieWinnerName = relaySplit ? relaySplit.label : winner.name;
    gs.partieWinType = winType;
    gs.roundWinnerIndex = partieWinnerIndex;
    gs.roundWinnerName = relaySplit ? relaySplit.label : winner.name;

    // Record capital before payout for accurate delta calculation
    const capitalsBefore: Record<string, number> = {};
    (gs.players || []).forEach((p) => {
      capitalsBefore[p.id] = p.capital;
    });

    // Determine who participated or folded (non-participants shouldn't pay extra penalty)
    const nonParticipatingMask = (gs.players || []).map((p, idx) => {
      if (idx === partieWinnerIndex || p.isEliminated || p.isForfeit) return false;
      const participated = gs.tricksHistory.some((t) => t.plays.some((play) => play.playerIndex === idx)) || p.isFoldedInRound;
      return !participated; // if did not participate, treat as exempt from penalty in applyPartiePayout
    });

    const cfg = this.getConfig(activeRoomState);
    const payout = relaySplit
      ? (() => {
          const capitals = (gs.players || []).map((p, i) => p.capital + (relaySplit.shares[i] || 0));
          return {
            capitals,
            eliminated: capitals.map((cap, i) => Boolean(gs.players[i].isEliminated || gs.players[i].isForfeit) || cap < gs.baseBet),
            extraCollected: 0,
            winnerReceived: relaySplit.shares[partieWinnerIndex] || 0,
          };
        })()
      : applyPartiePayout({
          capitals: (gs.players || []).map((p) => p.capital),
          isEliminated: (gs.players || []).map((p) => p.isEliminated || p.isForfeit),
          exemptFromPenalty: nonParticipatingMask,
          winnerIndex: partieWinnerIndex,
          pot: gs.pot,
          baseBet: gs.baseBet,
          multiplier,
          rakePct: 0,
        });
    const netWon = payout.winnerReceived;

    if (relaySplit) {
      const shareText = relaySplit.receiverIndexes.map((i) => `${gs.players[i].name} ${relaySplit.shares[i]} 🪙`).join(', ');
      const emote: EmoteMessage = {
        id: 'em_' + Math.random().toString(36).substring(2, 9),
        playerId: 'system',
        playerName: 'Table',
        text: `🤝 ${relaySplit.absentName} étant absent, son relais ne peut pas gagner : le pot est partagé entre les joueurs présents (${shareText}).`,
        emoji: '🤝',
        timestamp: Date.now(),
        isBot: true,
      };
      room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
    }

    if (multiplier > 1) {
      (gs.players || []).forEach((p, idx) => {
        if (p.isFoldedInRound && idx !== partieWinnerIndex && !nonParticipatingMask[idx]) {
          const penalty = Math.min(capitalsBefore[p.id] ?? p.capital, (multiplier - 1) * gs.baseBet);
          const emote: EmoteMessage = {
            id: 'em_' + Math.random().toString(36).substring(2, 9),
            playerId: 'system',
            playerName: 'Table',
            text: `⚖️ Règle officielle de l'abandon : ${p.name} ayant abandonné subit la pénalité ${multiplier === 4 ? 'Double Kora (x4)' : 'Kora (x2)'} de ${penalty} 🪙.`,
            emoji: '⚖️',
            timestamp: Date.now(),
            isBot: true,
          };
          room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
        }
      });
    }

    let nonEliminatedCount = 0;
    let lastStandingPlayer: Player | null = null;

    (gs.players || []).forEach((p, idx) => {
      p.capital = payout.capitals[idx];
      p.score = payout.capitals[idx];
      p.isEliminated = payout.eliminated[idx];
      if (!p.isEliminated) {
        nonEliminatedCount++;
        lastStandingPlayer = p;
      }
    });
    gs.pot = 0;

    // Check if Manche Over (only 1 player remaining with chips)
    if (nonEliminatedCount <= 1 && lastStandingPlayer) {
      gs.phase = 'MANCHE_OVER';
      room.status = 'MANCHE_OVER';
      gs.mancheWinnerIndex = (gs.players || []).findIndex((p) => p.id === (lastStandingPlayer as Player).id);
      gs.mancheWinnerName = (lastStandingPlayer as Player).name;
    }

    // Sync room.players
    room.players = (room.players || []).map((rp) => {
      const gp = (gs.players || []).find((p) => p.id === rp.id);
      if (gp) {
        return {
          ...rp,
          capital: gp.capital,
          score: gp.capital,
          isEliminated: gp.isEliminated,
          readyForNextPartie: false,
        };
      }
      return rp;
    });

    this.emitPartieResult(room, activeRoomState, {
      winnerId: winner.id,
      winType: winType as PartieResultWinType,
      endReason: relaySplit
        ? 'RELAY_SPLIT'
        : winType === 'DOUBLE_KORA' ? 'DOUBLE_KORA' : winType === 'KORA' ? 'KORA' : 'TRICKS_COMPLETED',
      capitalsBefore,
      grossByPlayerId: relaySplit ? relaySplit.grossById : { [winner.id]: netWon },
    });

    // Le joueur encore absent à la fin de la partie apprend ce que l'absence lui a coûté (règle du relais).
    (gs.players || []).forEach((p) => {
      if (p.isHuman && p.relayAbsent && !p.isForfeit) {
        const koraPenalty = Math.max(0, (capitalsBefore[p.id] ?? p.capital) - p.capital);
        activeRoomState.onPlayerAlert?.(p.id, room, { kind: 'RELAY_COST', potShared: Boolean(relaySplit), koraPenalty });
      }
    });

    // Auto-advance timestamp only for next partie if manche is still ongoing
    if (gs.phase !== 'MANCHE_OVER') {
      const transitionDelay = cfg.transitionDelayMs;
      room.roundEndAutoAdvanceAt = cfg.allowAutoAdvance !== false ? Date.now() + transitionDelay : null;
      room.manchePartiesPlayed = (room.manchePartiesPlayed || 0) + 1;
      if (cfg.allowAutoAdvance !== false) {
        activeRoomState.nextPartieTimer = setTimeout(() => {
          this.advanceToNextPartie(room, onStateChange, activeRoomState);
        }, transitionDelay);
      }
    } else {
      room.roundEndAutoAdvanceAt = null;
    }
    room.updatedAt = Date.now();
    onStateChange(room);
  }

  public static advanceToNextPartie(
    room: MultiplayerRoom,
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState
  ): void {
    this.clearAllTimers(activeRoomState);
    activeRoomState.onPartieCompleted?.(room);

    const gs = room.gameState;
    if (!gs || room.status === 'MANCHE_OVER') {
      return;
    }

    // Integrate pending human players if any (e.g. accepted during the previous partie)
    const pendingHumans = (room.players || []).filter((p) => p.isPendingIntegration && !p.isEliminated);
    for (const pendingPlayer of pendingHumans) {
      // Clean candidate display name
      const cleanName = pendingPlayer.name.replace(/\s*\((Obs|E)\)\s*$/gi, '').trim();
      pendingPlayer.name = cleanName;

      // Find candidate bots in gs.players
      const botEntries = gs.players
        .map((p, index) => ({
          id: p.id,
          name: p.name,
          capital: p.capital,
          tricksWonInRound: p.tricksWonInRound,
          index,
          isHuman: p.isHuman,
        }))
        .filter((p) => !p.isHuman);

      const botToReplace = selectBotToReplace(botEntries);
      if (botToReplace) {
        const replacedBotName = botToReplace.name;
        const prorataCap = pendingPlayer.prorataCapital !== undefined
          ? pendingPlayer.prorataCapital
          : Math.max(gs.baseBet, room.initialCapital - ((room.manchePartiesPlayed || 0) * gs.baseBet));

        // Replace in gs.players at exact seat
        gs.players[botToReplace.index] = {
          id: pendingPlayer.id,
          name: cleanName,
          score: prorataCap,
          capital: prorataCap,
          isEliminated: false,
          hand: [],
          isHuman: true,
          avatarSeed: pendingPlayer.avatarSeed,
          tricksWonInRound: 0,
        };

        // Remove replaced bot from room.players and activate human
        room.players = (room.players || []).filter((p) => p.id !== botToReplace.id);
        const rp = (room.players || []).find((p) => p.id === pendingPlayer.id);
        if (rp) {
          rp.name = cleanName;
          rp.isSpectator = false;
          rp.isPendingIntegration = false;
          rp.capital = prorataCap;
          rp.score = prorataCap;
          rp.isReady = true;
          rp.readyForNextPartie = true;
        }

        const emote: EmoteMessage = {
          id: 'em_' + Math.random().toString(36).substring(2, 9),
          playerId: 'system',
          playerName: 'Table',
          text: `🎉 ${cleanName} intègre la table (remplace ${replacedBotName}) avec ${prorataCap} 🪙 !`,
          emoji: '👋',
          timestamp: Date.now(),
          isBot: true,
        };
        room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
      }
    }

    // Deduplicate room.players and gs.players to strictly prevent ghost clone seats
    const seenIds = new Set<string>();
    room.players = (room.players || []).filter((p) => {
      if (seenIds.has(p.id)) return false;
      seenIds.add(p.id);
      return true;
    });

    const seenGsIds = new Set<string>();
    gs.players = (gs.players || []).filter((p) => {
      if (seenGsIds.has(p.id)) return false;
      seenGsIds.add(p.id);
      return true;
    });
    room.integrationProposal = null;

    // Revive reconnected human players who were previously forfeited due to disconnection and have enough chips
    (room.players || []).forEach((rp) => {
      if (rp.isHuman && rp.connected) {
        const gp = (gs.players || []).find((g) => g.id === rp.id);
        if (gp && gp.isForfeit && rp.capital >= gs.baseBet && !rp.forfeitedForManche) {
          rp.isForfeit = false;
          rp.isEliminated = false;
          rp.isSpectator = false;
          rp.isAiRelay = false;
          gp.isForfeit = false;
          gp.isEliminated = false;
          gp.isAiRelay = false;
          
          console.log(`[Revive] Reconnected player ${rp.name} reinstated for the next partie.`);
          
          const emote: EmoteMessage = {
            id: 'em_' + Math.random().toString(36).substring(2, 9),
            playerId: 'system',
            playerName: 'Table',
            text: `🔄 ${rp.name} s'est reconnecté et participe à cette nouvelle partie !`,
            emoji: '🔄',
            timestamp: Date.now(),
            isBot: true,
          };
          room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
        }
      }
    });

    // RÈGLE DU RELAIS — début de la partie suivante :
    // tout humain encore absent (déconnecté, ou inactif et n'ayant pas confirmé sa présence) est déclaré forfait
    // POUR CETTE PARTIE : pas de mise, pas de pénalité. Il pourra revenir au début de n'importe quelle partie suivante.
    const newlyForfeitedIds: string[] = [];
    (room.players || []).forEach((p) => {
      const isAbsent = !p.connected || (Boolean(p.relayAbsent) && !p.readyForNextPartie);
      if (p.isHuman && isAbsent && !p.isEliminated && !p.isSpectator) {
        const wasAlreadyForfeit = p.isForfeit;
        if (!wasAlreadyForfeit) newlyForfeitedIds.push(p.id);
        p.isForfeit = true;
        p.isAiRelay = false;
        p.hand = [];
        const gp = (gs.players || []).find((g) => g.id === p.id);
        if (gp) {
          gp.isForfeit = true;
          gp.isAiRelay = false;
          gp.hand = [];
        }

        if (!wasAlreadyForfeit) {
          console.log(`[Pre-Deal Forfeit] Player ${p.name} offline at start of next partie. Declaring forfeit for this partie.`);
          const emote: EmoteMessage = {
            id: 'em_' + Math.random().toString(36).substring(2, 9),
            playerId: 'system',
            playerName: 'Table',
            text: `🚪 ${p.name} n'est pas de retour : forfait pour cette partie. Il peut revenir au début de n'importe quelle partie suivante.`,
            emoji: '🚪',
            timestamp: Date.now(),
            isBot: true,
          };
          room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
        }
      }
    });

    // Nouvelle partie : plus aucun relais en cours, compteurs d'inactivité remis à zéro.
    (room.players || []).forEach((p) => {
      p.relayAbsent = false;
      if (activeRoomState.consecutiveTimeouts) {
        activeRoomState.consecutiveTimeouts.set(p.id, 0);
      }
    });
    (gs.players || []).forEach((gp) => {
      gp.relayAbsent = false;
    });

    // Reset missed turns counter for connected players
    (room.players || []).forEach((p) => {
      if (p.connected) {
        p.consecutiveMissedTurns = 0;
      }
    });
    (gs.players || []).forEach((gp) => {
      if (gp.connected) {
        gp.consecutiveMissedTurns = 0;
      }
    });

    // Host migration if host was disconnected/forfeited/eliminated
    const hostPlayer = (room.players || []).find((p) => p.id === room.hostId);
    if (!hostPlayer || !hostPlayer.connected || hostPlayer.isForfeit || hostPlayer.isEliminated) {
      const nextHost = (room.players || []).find((p) => p.isHuman && p.connected && !p.isEliminated && !p.isForfeit) ||
                       (room.players || []).find((p) => p.isHuman && !p.isEliminated && !p.isForfeit) ||
                       (room.players || []).find((p) => !p.isEliminated && !p.isForfeit) ||
                       room.players[0];
      if (nextHost && nextHost.id !== room.hostId) {
        room.hostId = nextHost.id;
        room.hostName = nextHost.name;
        nextHost.isHost = true;
      }
    }

    // Check remaining active humans in the room:
    const activeHumans = (room.players || []).filter((p) => p.isHuman && !p.isEliminated && !p.isForfeit && p.connected);
    const inGraceHumans = (room.players || []).filter(
      (p) => p.isHuman && !p.isEliminated && !p.connected && p.disconnectGraceExpiresAt && Date.now() < p.disconnectGraceExpiresAt
    );

    // Alertes push aux joueurs qui viennent d'être déclarés forfait pour cette partie (voir la règle du relais).
    const notifyNewlyForfeited = (kind: 'PARTIE_FORFEIT' | 'MANCHE_LOST_BY_FORFEIT') => {
      newlyForfeitedIds.forEach((id) => activeRoomState.onPlayerAlert?.(id, room, { kind }));
    };

    if (activeHumans.length === 0) {
      if (inGraceHumans.length > 0) {
        // Wait for player reconnection grace period before concluding
        const waitMs = Math.max(1500, Math.min(30000, (inGraceHumans[0].disconnectGraceExpiresAt || 0) - Date.now()));
        activeRoomState.nextPartieTimer = setTimeout(() => {
          this.advanceToNextPartie(room, onStateChange, activeRoomState);
        }, waitMs);
        onStateChange(room);
        return;
      }

      this.clearAllTimers(activeRoomState);
      gs.phase = 'MANCHE_OVER';
      room.status = 'MANCHE_OVER';
      notifyNewlyForfeited('MANCHE_LOST_BY_FORFEIT');
      onStateChange(room);
      return;
    }

    // Check active players (human + bots) with sufficient chips who are NOT eliminated and NOT forfeit
    const activePlayers = (gs.players || []).filter((p) => !p.isEliminated && !p.isForfeit && p.capital >= gs.baseBet);
    if (activePlayers.length <= 1) {
      // Only 1 player left overall with enough chips: they win the entire manche!
      const lastStandingPlayer = activePlayers[0] || (gs.players || []).find((p) => !p.isEliminated && !p.isForfeit) || gs.players[0];
      const soleGp = (gs.players || []).find((p) => p.id === lastStandingPlayer.id);
      const potWon = gs.pot;
      if (soleGp) {
        soleGp.capital += potWon;
        soleGp.score = soleGp.capital;
      }
      const roomP = (room.players || []).find((p) => p.id === lastStandingPlayer.id);
      if (roomP) {
        roomP.capital += potWon;
        roomP.score = roomP.capital;
      }
      gs.pot = 0;

      this.clearAllTimers(activeRoomState);
      gs.phase = 'MANCHE_OVER';
      room.status = 'MANCHE_OVER';
      const wIdx = (gs.players || []).findIndex((p) => p.id === lastStandingPlayer.id);
      gs.mancheWinnerIndex = wIdx !== -1 ? wIdx : 0;
      gs.mancheWinnerName = lastStandingPlayer.name;
      gs.partieWinnerIndex = gs.mancheWinnerIndex;
      gs.partieWinnerName = lastStandingPlayer.name;
      gs.partieWinType = 'STANDARD';

      const emote: EmoteMessage = {
        id: 'em_' + Math.random().toString(36).substring(2, 9),
        playerId: 'system',
        playerName: 'Table',
        text: `🏆 Victoire de la manche pour ${lastStandingPlayer.name} !`,
        emoji: '👑',
        timestamp: Date.now(),
        isBot: true,
      };
      room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
      room.updatedAt = Date.now();
      // Un seul joueur présent : victoire de la manche par forfait dès le début de la partie suivante.
      notifyNewlyForfeited('MANCHE_LOST_BY_FORFEIT');
      onStateChange(room);
      return;
    }

    notifyNewlyForfeited('PARTIE_FORFEIT');

    const nextPartieCount = (gs.partieCount || 1) + 1;

    // Automatic Stake Escalation (Anti-stagnation) - strictly disabled in multiplayer unless explicitly authorized
    const engineConfig = this.getConfig(activeRoomState);
    if (engineConfig.enableMultiplayerAutoBetEscalation === true && engineConfig.enableAutoBetEscalation !== false && nextPartieCount > 1) {
      const interval = engineConfig.autoBetEscalationInterval || 5;
      if ((nextPartieCount - 1) % interval === 0) {
        const initialBet = room.initialBaseBet || gs.initialBaseBet || room.baseBet || 10;
        const maxMultiplier = engineConfig.maxAutoBetMultiplier || 4;
        const maxAllowedBet = initialBet * maxMultiplier;
        const ratePct = (engineConfig.autoBetEscalationRatePct || 50) / 100;
        const increaseStep = Math.max(5, Math.round(gs.baseBet * ratePct));
        const targetBet = gs.baseBet + increaseStep;

        // Ensure no active non-eliminated player is priced out by the ante increase alone
        const minActiveCap = Math.min(...activePlayers.map((p) => p.capital));
        const newEscalatedBet = Math.min(targetBet, maxAllowedBet, minActiveCap);

        if (newEscalatedBet > gs.baseBet) {
          const oldBet = gs.baseBet;
          gs.baseBet = newEscalatedBet;
          room.baseBet = newEscalatedBet;

          const escalationEmote: EmoteMessage = {
            id: 'em_' + Math.random().toString(36).substring(2, 9),
            playerId: 'system',
            playerName: 'Table',
            text: `⚡ Escalade automatique ! La mise passe de ${oldBet} à ${newEscalatedBet} 🪙 (palier donne #${nextPartieCount}).`,
            emoji: '⚡',
            timestamp: Date.now(),
            isBot: true,
          };
          room.activeEmotes = [...(room.activeEmotes || []), escalationEmote].slice(-5);
        }
      }
    }

    const deck = shuffleDeck(build31Deck());
    const { hands } = dealCards(deck, activePlayers.length);

    let pot = 0;
    let handIdx = 0;
    const dealParticipantIds: string[] = [];
    (gs.players || []).forEach((p) => {
      p.tricksWonInRound = 0;
      p.isFoldedInRound = false;
      if (!p.isEliminated && !p.isForfeit && p.capital >= gs.baseBet) {
        dealParticipantIds.push(p.id);
        p.hand = hands[handIdx++] || [];
        p.capital = Math.max(0, p.capital - gs.baseBet);
        p.score = p.capital;
        pot += gs.baseBet;
      } else {
        p.hand = [];
        if (p.capital < gs.baseBet) {
          p.isEliminated = true;
        }
      }
    });
    gs.dealParticipantIds = dealParticipantIds;
    gs.forfeitPenaltyPaid = {};

    // Strictly sync room.players hands and state with gs.players
    (room.players || []).forEach((rp) => {
      const gp = (gs.players || []).find((p) => p.id === rp.id);
      if (gp) {
        rp.hand = [...gp.hand];
        rp.capital = gp.capital;
        rp.score = gp.capital;
        rp.isEliminated = gp.isEliminated;
        rp.isForfeit = gp.isForfeit;
      } else {
        rp.hand = [];
      }
    });

    // Dealer is the winner of the previous round (or fallback to rotation if not found or eliminated/forfeited)
    const prevWinnerIdx = gs.partieWinnerIndex ?? gs.roundWinnerIndex;
    let nextDealer = (prevWinnerIdx !== null && prevWinnerIdx !== undefined && !gs.players[prevWinnerIdx]?.isEliminated && !gs.players[prevWinnerIdx]?.isForfeit)
      ? prevWinnerIdx
      : (gs.dealerIndex + 1) % (gs.players || []).length;
    let dealerLoops = 0;
    while ((gs.players[nextDealer].isEliminated || gs.players[nextDealer].isForfeit) && dealerLoops < (gs.players || []).length) {
      nextDealer = (nextDealer + 1) % (gs.players || []).length;
      dealerLoops++;
    }

    let nextLead = (nextDealer + 1) % (gs.players || []).length;
    let leadLoops = 0;
    while ((gs.players[nextLead].isEliminated || gs.players[nextLead].isForfeit) && leadLoops < (gs.players || []).length) {
      nextLead = (nextLead + 1) % (gs.players || []).length;
      leadLoops++;
    }

    gs.phase = 'PLAYING';
    room.status = 'PLAYING';
    gs.pot = pot;
    gs.dealerIndex = nextDealer;
    gs.leadIndex = nextLead;
    gs.currentTurnIndex = nextLead;
    gs.currentTrickNumber = 1;
    gs.currentTrick = {
      trickNumber: 1,
      leadSuit: null,
      leadPlayerIndex: nextLead,
      leadPlayerName: gs.players[nextLead].name,
      plays: [],
      winnerIndex: null,
      winnerName: null,
      winningCard: null,
      isComplete: false,
    };
    gs.tricksHistory = [];
    gs.partieWinnerIndex = null;
    gs.partieWinnerName = null;
    gs.partieWinType = null;
    gs.partieCount = nextPartieCount;
    gs.roundCount = nextPartieCount;
    gs.turnStartedAt = Date.now();
    room.roundEndAutoAdvanceAt = null;

    room.players = (room.players || []).map((rp) => {
      const gp = (gs.players || []).find((p) => p.id === rp.id);
      if (gp) {
        return {
          ...rp,
          isSpectator: false,
          isPendingIntegration: false,
          hand: gp.hand || [],
          capital: gp.capital,
          score: gp.capital,
          isEliminated: gp.isEliminated,
          isForfeit: gp.isForfeit,
          isFoldedInRound: false,
          readyForNextPartie: false,
        };
      }
      return {
        ...rp,
        isSpectator: true,
        hand: [],
        readyForNextPartie: false,
      };
    });

    room.updatedAt = Date.now();

    // Check Instant Win on next deal
    if (this.checkInstantWinOnDeal(room, onStateChange, activeRoomState)) {
      return;
    }

    onStateChange(room);

    this.scheduleTurnAction(room, onStateChange, activeRoomState);
  }

  public static scheduleTurnAction(
    room: MultiplayerRoom,
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState
  ): void {
    if (activeRoomState.turnTimeoutTimer) {
      clearTimeout(activeRoomState.turnTimeoutTimer);
      activeRoomState.turnTimeoutTimer = null;
    }
    if (activeRoomState.botMoveTimer) {
      clearTimeout(activeRoomState.botMoveTimer);
      activeRoomState.botMoveTimer = null;
    }

    const gs = room.gameState;
    if (!gs || gs.phase !== 'PLAYING' || room.status !== 'PLAYING') {
      return;
    }

    const activePlayersWithCards = (gs.players || []).filter(
      (p) => !p.isEliminated && !p.isForfeit && !p.isFoldedInRound && p.hand && p.hand.length > 0
    );

    // If nobody has cards remaining to play, resolve the completed trick
    if (activePlayersWithCards.length === 0) {
      if (gs.currentTrick && gs.currentTrick.plays.length > 0) {
        this.resolveCompletedTrick(room, onStateChange, activeRoomState);
      }
      return;
    }

    // Advance currentTurnIndex to a valid player who has cards and is not eliminated/forfeit/folded
    let safetySkip = 0;
    while (
      safetySkip < (gs.players || []).length &&
      (!gs.players[gs.currentTurnIndex] ||
        gs.players[gs.currentTurnIndex].isEliminated ||
        gs.players[gs.currentTurnIndex].isForfeit ||
        gs.players[gs.currentTurnIndex].isFoldedInRound ||
        !gs.players[gs.currentTurnIndex].hand ||
        !(gs.players[gs.currentTurnIndex].hand) || gs.players[gs.currentTurnIndex].hand.length === 0)
    ) {
      gs.currentTurnIndex = (gs.currentTurnIndex + 1) % (gs.players || []).length;
      safetySkip++;
    }

    const currentPlayer = gs.players[gs.currentTurnIndex];
    if (!currentPlayer || currentPlayer.isEliminated || currentPlayer.isForfeit || !currentPlayer.hand || (currentPlayer.hand || []).length === 0) {
      if (gs.currentTrick && gs.currentTrick.plays.length > 0) {
        this.resolveCompletedTrick(room, onStateChange, activeRoomState);
      }
      return;
    }

    const isBot = !currentPlayer.isHuman;
    const isDisconnected = !(room.players || []).find((p) => p.id === currentPlayer.id)?.connected;

    if (isBot || (isDisconnected && currentPlayer.isAiRelay) || (!currentPlayer.isHuman && currentPlayer.isAiRelay)) {
      // Bot or AI Relay plays after a realistic thinking delay
      const cfg = this.getConfig(activeRoomState);
      const thinkDelay = isDisconnected ? 800 : cfg.botThinkTimeMs;
      activeRoomState.botMoveTimer = setTimeout(() => {
        this.executeBotMove(room, currentPlayer, onStateChange, activeRoomState);
      }, thinkDelay);
      return;
    }

    // Turn Timer calculation:
    // If player is connected: standard turn timer (e.g. 15s) + 500ms network buffer
    let effectiveTimerMs = (room.turnTimerSeconds || 15) * 1000 + 500;
    gs.turnStartedAt = Date.now();

    activeRoomState.turnTimeoutTimer = setTimeout(() => {
      if (!activeRoomState.consecutiveTimeouts) {
        activeRoomState.consecutiveTimeouts = new Map<string, number>();
      }

      const playerDisconnected = !(room.players || []).find((p) => p.id === currentPlayer.id)?.connected;

      if (playerDisconnected) {
        console.log(`[Turn Relay] Player ${currentPlayer.name} is offline. AI Relay auto-playing neutral card.`);
        const playableCards = getPlayableCards(currentPlayer.hand, gs.currentTrick.leadSuit);
        if (playableCards.length > 0) {
          const cardToPlay = chooseRelayAICard(currentPlayer.hand, gs.currentTrick.leadSuit);
          const rp = (room.players || []).find((p) => p.id === currentPlayer.id);
          if (rp) {
            rp.aiRelayPlaysCount = (rp.aiRelayPlaysCount || 0) + 1;
          }
          currentPlayer.aiRelayPlaysCount = (currentPlayer.aiRelayPlaysCount || 0) + 1;
          this.handlePlayCard(room, currentPlayer.id, cardToPlay.id, onStateChange, activeRoomState, true);
        } else {
          gs.currentTurnIndex = (gs.currentTurnIndex + 1) % (gs.players || []).length;
          this.scheduleTurnAction(room, onStateChange, activeRoomState);
        }
        return;
      }

      // Player is connected but timed out (AFK)
      const count = (activeRoomState.consecutiveTimeouts.get(currentPlayer.id) || 0) + 1;
      activeRoomState.consecutiveTimeouts.set(currentPlayer.id, count);

      // 3 tours manqués : le siège passe au relais jusqu'à la fin de la partie (jamais de forfait en cours de partie).
      // Le joueur reprend la main dès qu'il rejoue. Dans tous les cas la carte neutre est jouée à sa place.
      if (count >= 3) {
        this.startRelay(room, currentPlayer.id, onStateChange, activeRoomState, 'AFK');
      } else {
        activeRoomState.onPlayerAlert?.(currentPlayer.id, room, { kind: 'TIMEOUT_WARNING', missed: count, maxMissed: 3 });
      }
      console.log(`[Timer Expired] Player ${currentPlayer.name} timed out (${count}). Auto-playing neutral card on their behalf.`);
      const playableCards = getPlayableCards(currentPlayer.hand, gs.currentTrick.leadSuit);
      if (playableCards.length > 0) {
        // Play neutral card so timed-out player does not gain unfair advantage
        const cardToPlay = chooseRelayAICard(currentPlayer.hand, gs.currentTrick.leadSuit);
        this.handlePlayCard(room, currentPlayer.id, cardToPlay.id, onStateChange, activeRoomState, true);
      } else {
        gs.currentTurnIndex = (gs.currentTurnIndex + 1) % (gs.players || []).length;
        this.scheduleTurnAction(room, onStateChange, activeRoomState);
      }
    }, effectiveTimerMs);
  }

  public static handlePlayerDisconnect(
    room: MultiplayerRoom,
    playerId: string,
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState
  ): void {
    const rp = (room.players || []).find((p) => p.id === playerId);
    if (!rp) return;

    rp.connected = false;
    rp.lastSeen = Date.now();

    const gs = room.gameState;
    if (!gs || room.status !== 'PLAYING') {
      room.updatedAt = Date.now();
      onStateChange(room);
      return;
    }

    const gp = (gs.players || []).find((p) => p.id === playerId);
    if (gp) {
      gp.connected = false;
    }

    if (rp.isEliminated || rp.isForfeit) {
      room.updatedAt = Date.now();
      onStateChange(room);
      return;
    }

    const cfg = this.getConfig(activeRoomState);

    // Règle du relais : plus de délai de reconnexion avec forfait en pleine partie. Le joueur déconnecté
    // n'a AUCUN délai à respecter : après quelques secondes de tolérance (micro-coupures), un relais joue
    // des cartes neutres jusqu'à la fin de la partie ; il reprend la main en revenant.
    rp.disconnectGraceExpiresAt = null;
    if (gp) {
      gp.disconnectGraceExpiresAt = null;
    }
    if (!activeRoomState.disconnectTimers) {
      activeRoomState.disconnectTimers = new Map();
    }
    if (activeRoomState.disconnectTimers.has(playerId)) {
      clearTimeout(activeRoomState.disconnectTimers.get(playerId)!);
      activeRoomState.disconnectTimers.delete(playerId);
    }

    // Tolérance aux micro-coupures avant que le relais ne prenne le siège (aiRelayGraceSeconds, 8 s par défaut)
    if (!activeRoomState.aiRelayTimers) {
      activeRoomState.aiRelayTimers = new Map();
    }
    if (activeRoomState.aiRelayTimers.has(playerId)) {
      clearTimeout(activeRoomState.aiRelayTimers.get(playerId)!);
      activeRoomState.aiRelayTimers.delete(playerId);
    }

    const aiGraceSecs = cfg.aiRelayGraceSeconds ?? 8;
    const relayTimer = setTimeout(() => {
      activeRoomState.aiRelayTimers?.delete(playerId);
      const targetRp = (room.players || []).find((p) => p.id === playerId);
      if (!targetRp || targetRp.connected || targetRp.isForfeit || targetRp.isEliminated) {
        return;
      }
      this.startRelay(room, playerId, onStateChange, activeRoomState, 'DISCONNECT');
    }, aiGraceSecs * 1000);

    activeRoomState.aiRelayTimers.set(playerId, relayTimer);

    room.updatedAt = Date.now();
    onStateChange(room);
  }

  /**
   * RÈGLE DU RELAIS.
   * Un joueur absent (déconnexion, 3 tours manqués, départ volontaire) n'est jamais retiré en cours de partie :
   * un relais joue des cartes neutres à sa place jusqu'à la fin de la partie, pour ne bloquer personne.
   *  - le relais ne peut pas remporter le pot (voir resolvePartieOver : partage entre les joueurs présents) ;
   *  - si le joueur revient avant la fin de la partie, il reprend la main sans aucun coût ;
   *  - s'il est encore absent à la fin, il a perdu sa mise (et paie la pénalité de Kora des perdants si un Kora a lieu) ;
   *  - au début de la partie suivante, s'il n'est pas de retour, il est déclaré forfait pour cette partie (voir advanceToNextPartie).
   */
  public static startRelay(
    room: MultiplayerRoom,
    playerId: string,
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState,
    reason: 'DISCONNECT' | 'AFK' | 'LEFT'
  ): void {
    const gs = room.gameState;
    const rp = (room.players || []).find((p) => p.id === playerId);
    const gp = gs ? (gs.players || []).find((p) => p.id === playerId) : undefined;
    if (!gs || !rp || !gp || !rp.isHuman) return;
    if (rp.isEliminated || rp.isForfeit || rp.isSpectator || gp.isEliminated || gp.isForfeit) return;
    if (gs.phase !== 'PLAYING' && gs.phase !== 'TRICK_RESOLVED') return;
    if (rp.relayAbsent) return; // idempotent

    rp.relayAbsent = true;
    gp.relayAbsent = true;
    if (!rp.connected) {
      rp.isAiRelay = true;
      gp.isAiRelay = true;
    }

    const text =
      reason === 'DISCONNECT'
        ? `🤖 ${rp.name} s'est déconnecté. Un relais joue des cartes neutres jusqu'à la fin de cette partie et ne peut pas remporter le pot. ${rp.name} peut reprendre la main en revenant.`
        : reason === 'LEFT'
          ? `🚪 ${rp.name} a quitté la table. Un relais joue des cartes neutres jusqu'à la fin de cette partie et ne peut pas remporter le pot.`
          : `⏳ ${rp.name} est inactif. Un relais joue à sa place jusqu'à la fin de cette partie ; il reprend la main en rejouant.`;
    const emote: EmoteMessage = {
      id: 'em_' + Math.random().toString(36).substring(2, 9),
      playerId: 'system',
      playerName: 'Table',
      text,
      emoji: '🤖',
      timestamp: Date.now(),
      isBot: true,
    };
    room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
    room.updatedAt = Date.now();
    activeRoomState.onPlayerAlert?.(playerId, room, { kind: 'RELAY_STARTED', reason });
    onStateChange(room);

    // Si c'est justement son tour, le relais joue tout de suite (joueur déconnecté ou parti).
    if (
      !rp.connected &&
      gs.phase === 'PLAYING' &&
      room.status === 'PLAYING' &&
      gs.players[gs.currentTurnIndex]?.id === playerId
    ) {
      this.clearTurnTimers(activeRoomState);
      this.scheduleTurnAction(room, onStateChange, activeRoomState);
    }
  }

  /** Le joueur reprend la main (il rejoue, se reconnecte ou confirme sa présence) : le relais s'efface. */
  public static endRelay(room: MultiplayerRoom, playerId: string): boolean {
    const rp = (room.players || []).find((p) => p.id === playerId);
    const gp = room.gameState ? (room.gameState.players || []).find((p) => p.id === playerId) : undefined;
    const was = Boolean(rp?.relayAbsent || gp?.relayAbsent);
    if (rp) rp.relayAbsent = false;
    if (gp) gp.relayAbsent = false;
    return was;
  }

  /** Vrai si un humain assis est absent (déconnecté ou sous relais) : la partie suivante n'est pas lancée en avance. */
  public static hasAbsentHuman(room: MultiplayerRoom): boolean {
    return (room.players || []).some(
      (p) => p.isHuman && !p.isEliminated && !p.isSpectator && (p.connected === false || Boolean(p.relayAbsent))
    );
  }

  public static handlePlayerReconnect(
    room: MultiplayerRoom,
    playerId: string,
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState
  ): void {
    if (activeRoomState.aiRelayTimers && activeRoomState.aiRelayTimers.has(playerId)) {
      clearTimeout(activeRoomState.aiRelayTimers.get(playerId)!);
      activeRoomState.aiRelayTimers.delete(playerId);
    }
    if (activeRoomState.disconnectTimers && activeRoomState.disconnectTimers.has(playerId)) {
      clearTimeout(activeRoomState.disconnectTimers.get(playerId)!);
      activeRoomState.disconnectTimers.delete(playerId);
    }

    const rp = (room.players || []).find((p) => p.id === playerId);
    const gs = room.gameState;

    if (rp && rp.forfeitedForManche) {
      rp.connected = true;
      rp.lastSeen = Date.now();
      rp.isSpectator = true;
      rp.hand = [];
      rp.isForfeit = true;
      rp.isEliminated = true;
      
      const emote: EmoteMessage = {
        id: 'em_' + Math.random().toString(36).substring(2, 9),
        playerId: 'system',
        playerName: 'Table',
        text: `👀 ${rp.name} est revenu en tant que spectateur (forfait pour le reste de la manche).`,
        emoji: '👀',
        timestamp: Date.now(),
        isBot: true,
      };
      room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
      room.updatedAt = Date.now();
      onStateChange(room);
      return;
    }

    const relayCount = rp?.aiRelayPlaysCount || (gs?.players.find((p) => p.id === playerId)?.aiRelayPlaysCount) || 0;
    const hadAiRelayStarted = (rp?.isAiRelay || (gs?.players.find((p) => p.id === playerId)?.isAiRelay) || relayCount > 0);

    if (rp) {
      rp.connected = true;
      rp.lastSeen = Date.now();
      rp.disconnectGraceExpiresAt = null;
      rp.isAiRelay = false;
      rp.relayAbsent = false;
      rp.consecutiveMissedTurns = 0;
      rp.aiRelayPlaysCount = 0;
      if (rp.hand && rp.hand.length > 0) {
        rp.isForfeit = false;
        rp.isEliminated = false;
      }
    }

    if (gs) {
      const gp = (gs.players || []).find((p) => p.id === playerId);
      if (gp) {
        gp.connected = true;
        gp.disconnectGraceExpiresAt = null;
        gp.isAiRelay = false;
        gp.relayAbsent = false;
        gp.consecutiveMissedTurns = 0;
        gp.aiRelayPlaysCount = 0;
        if (gp.hand && gp.hand.length > 0) {
          gp.isForfeit = false;
          gp.isEliminated = false;
        }
      }
    }

    if (hadAiRelayStarted) {
      const relayInfoText = relayCount > 0
        ? ` (L'IA a joué ${relayCount} tour${relayCount > 1 ? 's' : ''} en votre absence)`
        : '';

      const emote: EmoteMessage = {
        id: 'em_' + Math.random().toString(36).substring(2, 9),
        playerId: 'system',
        playerName: 'Table',
        text: `🟢 ${rp?.name || 'Le joueur'} s'est reconnecté et a repris la main !${relayInfoText}`,
        emoji: '🟢',
        timestamp: Date.now(),
        isBot: true,
      };
      room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
    }

    room.updatedAt = Date.now();
    onStateChange(room);

    // If player reconnected and it is their turn, give them standard turn control
    if (gs && gs.phase === 'PLAYING' && !rp?.isForfeit && gs.players[gs.currentTurnIndex]?.id === playerId) {
      this.clearTurnTimers(activeRoomState);
      this.scheduleTurnAction(room, onStateChange, activeRoomState);
    }
  }


  public static replacePlayerWithBot(
    room: MultiplayerRoom,
    playerId: string,
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState,
    reason: string
  ): void {
    if (activeRoomState.aiRelayTimers && activeRoomState.aiRelayTimers.has(playerId)) {
      clearTimeout(activeRoomState.aiRelayTimers.get(playerId)!);
      activeRoomState.aiRelayTimers.delete(playerId);
    }
    if (activeRoomState.disconnectTimers && activeRoomState.disconnectTimers.has(playerId)) {
      clearTimeout(activeRoomState.disconnectTimers.get(playerId)!);
      activeRoomState.disconnectTimers.delete(playerId);
    }

    const rp = (room.players || []).find((p) => p.id === playerId);
    if (rp) {
      rp.isHuman = false;
      rp.connected = true; // Bots are always connected
      rp.disconnectGraceExpiresAt = undefined;
      rp.isAiRelay = false;
      rp.name = `${rp.name} (Bot)`;
      
      const emote = {
        id: 'em_' + Math.random().toString(36).substring(2, 9),
        playerId: 'system',
        playerName: 'Table',
        text: `🤖 ${rp.name} a été remplacé par un Bot (${reason}).`,
        emoji: '🤖',
        timestamp: Date.now(),
        isBot: true,
      };
      room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
    }

    const gs = room.gameState;
    if (gs) {
      const gp = (gs.players || []).find((p) => p.id === playerId);
      if (gp) {
        gp.isHuman = false;
        gp.connected = true;
        gp.disconnectGraceExpiresAt = undefined;
        gp.isAiRelay = false;
        gp.name = `${gp.name} (Bot)`;
      }
      
      // If it is currently this player's turn, schedule a bot move
      if (gs.phase === 'PLAYING' && gs.players[gs.currentTurnIndex]?.id === playerId) {
        this.clearAllTimers(activeRoomState);
        this.scheduleTurnAction(room, onStateChange, activeRoomState);
      }
    }

    room.updatedAt = Date.now();
    onStateChange(room);
  }

  public static forfeitPlayer(
    room: MultiplayerRoom,
    playerId: string,
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState,
    isExplicit: boolean = false,
    options?: { notify?: boolean; freezeSeat?: boolean }
  ): void {
    const rp = (room.players || []).find((p) => p.id === playerId);
    if (rp && rp.forfeitedForManche) {
      return;
    }

    const notify = options?.notify ?? true;
    const freezeSeat = options?.freezeSeat ?? true;

    if (activeRoomState.aiRelayTimers && activeRoomState.aiRelayTimers.has(playerId)) {
      clearTimeout(activeRoomState.aiRelayTimers.get(playerId)!);
      activeRoomState.aiRelayTimers.delete(playerId);
    }
    if (activeRoomState.disconnectTimers && activeRoomState.disconnectTimers.has(playerId)) {
      clearTimeout(activeRoomState.disconnectTimers.get(playerId)!);
      activeRoomState.disconnectTimers.delete(playerId);
    }

    if (rp) {
      rp.isForfeit = true;
      rp.isEliminated = true;
      rp.disconnectGraceExpiresAt = null;
      rp.hand = []; // Burning remaining cards
      if (freezeSeat) {
        rp.forfeitedForManche = true;
      }
      if (rp.isHuman && notify) {
        activeRoomState.onPlayerForfeit?.(playerId, room, isExplicit);
      }
    }

    const gs = room.gameState;
    if (!gs) {
      room.updatedAt = Date.now();
      onStateChange(room);
      return;
    }

    const gpIdx = (gs.players || []).findIndex((p) => p.id === playerId);
    if (gpIdx !== -1) {
      const gp = gs.players[gpIdx];
      gp.isForfeit = true;
      gp.isEliminated = true;
      gp.disconnectGraceExpiresAt = null;
      gp.hand = []; // Burning remaining cards
      if (freezeSeat) {
        gp.forfeitedForManche = true;
      }
    }

    // Migrate host role if the forfeiting player was the host
    if (room.hostId === playerId) {
      const nextHost = (room.players || []).find((p) => p.isHuman && p.connected && !p.isEliminated && !p.isForfeit && p.id !== playerId) ||
                       (room.players || []).find((p) => p.isHuman && !p.isEliminated && !p.isForfeit && p.id !== playerId) ||
                       (room.players || []).find((p) => !p.isEliminated && !p.isForfeit && p.id !== playerId) ||
                       (room.players || []).find((p) => p.id !== playerId);
      if (nextHost) {
        room.hostId = nextHost.id;
        room.hostName = nextHost.name;
        nextHost.isHost = true;
      }
    }

    // Pénalité de forfait
    let penalty = 0;
    if (gs.phase === 'PLAYING' || gs.phase === 'TRICK_RESOLVED') {
      penalty = computeForfeitPenalty({
        baseBet: gs.baseBet,
        capital: rp ? rp.capital : 0,
        currentTrickNumber: gs.currentTrickNumber,
      });
    }

    if (penalty > 0) {
      if (rp) {
        rp.capital = Math.max(0, rp.capital - penalty);
        rp.score = rp.capital;
      }
      if (gpIdx !== -1) {
        gs.players[gpIdx].capital = Math.max(0, gs.players[gpIdx].capital - penalty);
        gs.players[gpIdx].score = gs.players[gpIdx].capital;
      }
      gs.pot += penalty;
      gs.forfeitPenaltyPaid = {
        ...(gs.forfeitPenaltyPaid || {}),
        [playerId]: ((gs.forfeitPenaltyPaid?.[playerId] || 0) + penalty),
      };

      const emote: EmoteMessage = {
        id: 'em_' + Math.random().toString(36).substring(2, 9),
        playerId: 'system',
        playerName: 'Table',
        text: `⚖️ Pénalité de forfait : ${penalty} 🪙 prélevée sur ${rp?.name || 'le joueur'}.`,
        emoji: '🛡️',
        timestamp: Date.now(),
        isBot: true,
      };
      room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
    }

    // Check remaining human players: if 0 humans left, end manche
    const activeHumans = (room.players || []).filter(
      (p) => p.isHuman && !p.isEliminated && !p.isForfeit && p.id !== playerId
    );

    if (activeHumans.length === 0) {
      this.clearAllTimers(activeRoomState);
      gs.phase = 'MANCHE_OVER';
      room.status = 'MANCHE_OVER';
      room.updatedAt = Date.now();
      onStateChange(room);
      return;
    }

    // Check all active players remaining in the partie (including bots)
    const remainingActiveInPartie = (gs.players || []).filter((p) => !p.isEliminated && !p.isForfeit);

    // If only 1 active player remains across ALL players (no bots or all bots eliminated)
    if (remainingActiveInPartie.length <= 1) {
      this.clearAllTimers(activeRoomState);
      const lastWinner = remainingActiveInPartie[0] || (gs.players || []).find((p) => !p.isEliminated) || gs.players[0];
      const winnerIndex = (gs.players || []).findIndex((p) => p.id === lastWinner.id);

      const capitalsBefore: Record<string, number> = {};
      (gs.players || []).forEach((p) => {
        capitalsBefore[p.id] = p.capital;
      });

      const cfg = this.getConfig(activeRoomState);
      const rawPot = gs.pot;
      const rakeAmount = 0; // cfg.globalRakePct > 0 ? Math.floor((rawPot * cfg.globalRakePct) / 100) : 0; (Désactivé en mode virtuel)
      const potWon = rawPot - rakeAmount;
      lastWinner.capital += potWon;
      lastWinner.score = lastWinner.capital;
      gs.pot = 0;

      // Check eliminations across all players based on their capital
      let nonEliminatedCount = 0;
      let lastStandingPlayer: Player | null = null;
      (gs.players || []).forEach((p) => {
        if (p.capital < gs.baseBet) {
          p.isEliminated = true;
        } else {
          nonEliminatedCount++;
          lastStandingPlayer = p;
        }
        p.score = p.capital;
      });

      const isMancheOver = nonEliminatedCount <= 1;
      const winType: PartieWinType = (rp && rp.isHuman && remainingActiveInPartie.length === 1) ? 'FORFEIT' : 'STANDARD';

      gs.phase = isMancheOver ? 'MANCHE_OVER' : 'PARTIE_OVER';
      room.status = isMancheOver ? 'MANCHE_OVER' : 'PARTIE_OVER';
      gs.partieWinnerIndex = winnerIndex;
      gs.partieWinnerName = lastWinner.name;
      gs.partieWinType = winType;
      gs.roundWinnerIndex = winnerIndex;
      gs.roundWinnerName = lastWinner.name;

      if (isMancheOver && lastStandingPlayer) {
        gs.mancheWinnerIndex = (gs.players || []).findIndex((p) => p.id === (lastStandingPlayer as Player).id);
        gs.mancheWinnerName = (lastStandingPlayer as Player).name;
      }

      room.players = (room.players || []).map((p) => {
        const g = (gs.players || []).find((gp) => gp.id === p.id);
        return g
          ? {
              ...p,
              capital: g.capital,
              score: g.capital,
              isEliminated: g.isEliminated,
              isForfeit: g.isForfeit,
              readyForNextPartie: false,
            }
          : p;
      });

      this.emitPartieResult(room, activeRoomState, {
        winnerId: lastWinner.id,
        winType: winType as PartieResultWinType,
        endReason: 'FORFEIT_VICTORY',
        capitalsBefore,
        grossByPlayerId: { [lastWinner.id]: potWon },
      });

      const emote: EmoteMessage = {
        id: 'em_' + Math.random().toString(36).substring(2, 9),
        playerId: 'system',
        playerName: 'Table',
        text: winType === 'FORFEIT'
          ? `👑 Victoire par forfait pour ${lastWinner.name} !`
          : `🏆 ${lastWinner.name} remporte la manche !`,
        emoji: '🏆',
        timestamp: Date.now(),
        isBot: true,
      };
      room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);

      if (!isMancheOver) {
        const transitionDelay = cfg.transitionDelayMs;
        room.roundEndAutoAdvanceAt = Date.now() + transitionDelay;
        activeRoomState.nextPartieTimer = setTimeout(() => {
          this.advanceToNextPartie(room, onStateChange, activeRoomState);
        }, transitionDelay);
      }
      room.updatedAt = Date.now();
      onStateChange(room);
      return;
    }

    // If 2 or more players (human + bot(s)) remain, announce that the human can continue against IA or claim forfeit!
    if (activeHumans.length === 1 && rp && rp.isHuman) {
      const soleHuman = activeHumans[0];
      const activeBotsCount = remainingActiveInPartie.filter((p) => !p.isHuman).length;
      if (activeBotsCount > 0) {
        const emote: EmoteMessage = {
          id: 'em_' + Math.random().toString(36).substring(2, 9),
          playerId: 'system',
          playerName: 'Table',
          text: `⚠️ ${rp.name} a quitté. ${soleHuman.name} peut continuer contre l'IA ou réclamer la victoire par forfait !`,
          emoji: '⚔️',
          timestamp: Date.now(),
          isBot: true,
        };
        room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);
      }
    }

    // If partie is still in progress with 2 or more active players
    if (gs.phase === 'PLAYING') {
      const neededPlays = remainingActiveInPartie.length;
      if (gs.currentTrick.plays.length >= neededPlays) {
        this.clearAllTimers(activeRoomState);
        gs.phase = 'TRICK_RESOLVED';
        const resolvedWinner = determineTrickWinner(gs.currentTrick.plays, gs.currentTrick.leadSuit);
        const winnerIndex = resolvedWinner.winnerPlay ? resolvedWinner.winnerPlay.playerIndex : gs.leadIndex;
        const winner = gs.players[winnerIndex];

        gs.currentTrick.winnerIndex = winnerIndex;
        gs.currentTrick.winnerName = winner.name;
        gs.currentTrick.winningCard = resolvedWinner.winnerPlay?.card || null;
        gs.currentTrick.isComplete = true;

        winner.tricksWonInRound = (winner.tricksWonInRound || 0) + 1;
        const roomWinner = (room.players || []).find((p) => p.id === winner.id);
        if (roomWinner) {
          roomWinner.tricksWonInRound = winner.tricksWonInRound;
        }

        room.updatedAt = Date.now();
        onStateChange(room);

        const cfg = this.getConfig(activeRoomState);
        activeRoomState.trickResolutionTimer = setTimeout(() => {
          this.resolveCompletedTrick(room, onStateChange, activeRoomState);
        }, cfg.trickResolutionTimeMs || 1600);
        return;
      }

      // If it was the forfeited player's turn to play: advance turn immediately!
      if (gs.currentTurnIndex === gpIdx) {
        let nextIndex = (gs.currentTurnIndex + 1) % (gs.players || []).length;
        while (gs.players[nextIndex].isEliminated || gs.players[nextIndex].isForfeit) {
          nextIndex = (nextIndex + 1) % (gs.players || []).length;
        }
        gs.currentTurnIndex = nextIndex;
        gs.turnStartedAt = Date.now();
        room.updatedAt = Date.now();
        onStateChange(room);
        this.scheduleTurnAction(room, onStateChange, activeRoomState);
        return;
      }
    }

    room.updatedAt = Date.now();
    onStateChange(room);
  }

  public static handleFoldRound(
    room: MultiplayerRoom,
    playerId: string,
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState
  ): void {
    const gs = room.gameState;
    if (!gs || gs.phase !== 'PLAYING' || room.status !== 'PLAYING') return;

    const rp = (room.players || []).find((p) => p.id === playerId);
    if (!rp || rp.isEliminated || rp.isForfeit || rp.isFoldedInRound) return;

    rp.isFoldedInRound = true;
    rp.hand = [];

    const gpIdx = (gs.players || []).findIndex((p) => p.id === playerId);
    if (gpIdx !== -1) {
      const gp = gs.players[gpIdx];
      gp.isFoldedInRound = true;
      gp.hand = [];
    }

    const remainingActiveInPartie = (gs.players || []).filter((p) => !p.isEliminated && !p.isForfeit && !p.isFoldedInRound);

    // If only 1 active player remains (e.g. 1v1 or all opponents folded)
    if (remainingActiveInPartie.length <= 1) {
      const soleWinner = remainingActiveInPartie[0] || (gs.players || []).find((p) => !p.isEliminated && !p.isForfeit) || gs.players[0];
      const winnerIndex = (gs.players || []).findIndex((p) => p.id === soleWinner.id);

      // Après forfaits, le joueur restant gagne le pot en victoire STANDARD (multiplicateur 1)
      const partieWinType: PartieWinType = 'STANDARD';
      const cfg = this.getConfig(activeRoomState);

      const capitalsBefore: Record<string, number> = {};
      (gs.players || []).forEach((p) => {
        capitalsBefore[p.id] = p.capital;
      });

      const payout = applyPartiePayout({
        capitals: (gs.players || []).map((p) => p.capital),
        isEliminated: (gs.players || []).map((p) => p.isEliminated || p.isForfeit),
        winnerIndex,
        pot: gs.pot,
        baseBet: gs.baseBet,
        multiplier: 1,
        rakePct: 0,
      });

      let nonEliminatedCount = 0;
      let lastStandingPlayer: Player | null = null;
      (gs.players || []).forEach((p, idx) => {
        p.capital = payout.capitals[idx];
        p.score = payout.capitals[idx];
        p.isEliminated = payout.eliminated[idx];
        if (!p.isEliminated) {
          nonEliminatedCount++;
          lastStandingPlayer = p;
        }
      });
      const potWon = payout.winnerReceived;
      gs.pot = 0;

      const isMancheOver = nonEliminatedCount <= 1;
      gs.phase = isMancheOver ? 'MANCHE_OVER' : 'PARTIE_OVER';
      room.status = isMancheOver ? 'MANCHE_OVER' : 'PARTIE_OVER';
      gs.partieWinnerIndex = winnerIndex;
      gs.partieWinnerName = soleWinner.name;
      gs.partieWinType = partieWinType;
      gs.roundWinnerIndex = winnerIndex;
      gs.roundWinnerName = soleWinner.name;

      if (isMancheOver && lastStandingPlayer) {
        gs.mancheWinnerIndex = (gs.players || []).findIndex((p) => p.id === (lastStandingPlayer as Player).id);
        gs.mancheWinnerName = (lastStandingPlayer as Player).name;
      }

      room.players = (room.players || []).map((p) => {
        const g = (gs.players || []).find((gp) => gp.id === p.id);
        return g
          ? {
              ...p,
              capital: g.capital,
              score: g.capital,
              isEliminated: g.isEliminated,
              isForfeit: g.isForfeit,
              isFoldedInRound: g.isFoldedInRound,
              readyForNextPartie: false,
            }
          : p;
      });

      this.emitPartieResult(room, activeRoomState, {
        winnerId: soleWinner.id,
        winType: 'STANDARD',
        endReason: 'FOLD_VICTORY',
        capitalsBefore,
        grossByPlayerId: { [soleWinner.id]: potWon },
      });

      this.clearAllTimers(activeRoomState);
      const transitionDelay = cfg.transitionDelayMs;
      room.roundEndAutoAdvanceAt = Date.now() + transitionDelay;
      room.updatedAt = Date.now();
      onStateChange(room);

      activeRoomState.nextPartieTimer = setTimeout(() => {
        this.advanceToNextPartie(room, onStateChange, activeRoomState);
      }, transitionDelay);
      return;
    }

    // 2 or more players still active in the round
    const neededPlays = remainingActiveInPartie.length;
    if (gs.currentTrick.plays.length >= neededPlays && gs.currentTrick.plays.length > 0) {
      this.clearAllTimers(activeRoomState);
      gs.phase = 'TRICK_RESOLVED';
      const resolvedWinner = determineTrickWinner(gs.currentTrick.plays, gs.currentTrick.leadSuit);
      const winnerIndex = resolvedWinner.winnerPlay ? resolvedWinner.winnerPlay.playerIndex : gs.leadIndex;
      const winner = gs.players[winnerIndex];

      gs.currentTrick.winnerIndex = winnerIndex;
      gs.currentTrick.winnerName = winner.name;
      gs.currentTrick.winningCard = resolvedWinner.winnerPlay?.card || null;
      gs.currentTrick.isComplete = true;

      winner.tricksWonInRound = (winner.tricksWonInRound || 0) + 1;
      const roomWinner = (room.players || []).find((p) => p.id === winner.id);
      if (roomWinner) {
        roomWinner.tricksWonInRound = winner.tricksWonInRound;
      }

      room.updatedAt = Date.now();
      onStateChange(room);

      const cfg = this.getConfig(activeRoomState);
      activeRoomState.trickResolutionTimer = setTimeout(() => {
        this.resolveCompletedTrick(room, onStateChange, activeRoomState);
      }, cfg.trickResolutionTimeMs || 1600);
      return;
    }

    // If it was the folding player's turn to play: pass turn immediately to next active player
    if (gs.currentTurnIndex === gpIdx) {
      let nextIndex = (gs.currentTurnIndex + 1) % (gs.players || []).length;
      while (gs.players[nextIndex].isEliminated || gs.players[nextIndex].isForfeit || gs.players[nextIndex].isFoldedInRound) {
        nextIndex = (nextIndex + 1) % (gs.players || []).length;
      }
      gs.currentTurnIndex = nextIndex;
      gs.turnStartedAt = Date.now();
      room.updatedAt = Date.now();
      onStateChange(room);
      this.scheduleTurnAction(room, onStateChange, activeRoomState);
      return;
    }

    room.updatedAt = Date.now();
    onStateChange(room);
  }

  private static executeBotMove(
    room: MultiplayerRoom,
    player: Player,
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState
  ): void {
    const gs = room.gameState;
    if (!gs || gs.phase !== 'PLAYING' || room.status !== 'PLAYING') return;

    if (gs.players[gs.currentTurnIndex].id !== player.id) return;

    const activeCount = (gs.players || []).filter((p) => !p.isEliminated && !p.isForfeit && !p.isFoldedInRound).length;

    // Evaluate bot folding in 3-4p games on trick 1 with catastrophic hand
    if (
      gs.currentTrickNumber === 1 &&
      activeCount >= 3 &&
      shouldBotFoldRound(player.hand, 1, activeCount, player.aiStrategy || 'CONSERVATIVE', 'EXPERT')
    ) {
      const reaction = getBotFoldReaction();
      const emoteMsg: EmoteMessage = {
        id: `emote_fold_${Date.now()}_${player.id}`,
        playerId: player.id,
        playerName: player.name,
        text: reaction.text,
        emoji: reaction.emoji,
        timestamp: Date.now(),
        isBot: true,
      };
      room.activeEmotes = [...(room.activeEmotes || []), emoteMsg];
      this.handleFoldRound(room, player.id, onStateChange, activeRoomState);
      return;
    }

    const playableCards = getPlayableCards(player.hand, gs.currentTrick.leadSuit);
    if (playableCards.length === 0) {
      console.warn(`[executeBotMove] Player ${player.name} has 0 playable cards. Advancing turn.`);
      gs.currentTurnIndex = (gs.currentTurnIndex + 1) % (gs.players || []).length;
      this.scheduleTurnAction(room, onStateChange, activeRoomState);
      return;
    }

    // Distinguish bot types:
    // 1. Full bot (fill with bots / solo bot) plays to win optimally
    // 2. Relay bot (absent human player) plays the most neutral, non-competitive move possible
    const isRelayBot = Boolean(
      player.isAiRelay ||
      (!(room.players || []).find((p) => p.id === player.id)?.connected && player.isHuman)
    );

    let cardToPlay: Card;
    if (isRelayBot) {
      cardToPlay = chooseRelayAICard(player.hand, gs.currentTrick.leadSuit);
      const rp = (room.players || []).find((p) => p.id === player.id);
      if (rp) {
        rp.aiRelayPlaysCount = (rp.aiRelayPlaysCount || 0) + 1;
      }
      player.aiRelayPlaysCount = (player.aiRelayPlaysCount || 0) + 1;
    } else {
      // Use smart AI engine to pick optimal card
      cardToPlay = chooseAICard(
        player.hand,
        gs.currentTrick.leadSuit,
        gs.currentTrick.plays,
        gs.currentTrickNumber,
        player.aiStrategy || 'CONSERVATIVE',
        gs.tricksHistory,
        activeCount,
        'EXPERT',
        gs.players,
        gs.currentTurnIndex
      );
    }

    this.handlePlayCard(room, player.id, cardToPlay.id, onStateChange, activeRoomState, isRelayBot);
  }

  public static claimForfeitVictory(
    room: MultiplayerRoom,
    playerId: string,
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState
  ): boolean {
    const gs = room.gameState;
    if (!gs) return false;

    // Check that player is an active human in room
    const playerIndex = (gs.players || []).findIndex((p) => p.id === playerId);
    if (playerIndex === -1) return false;
    const claimingPlayer = gs.players[playerIndex];
    if (claimingPlayer.isEliminated || claimingPlayer.isForfeit) return false;

    // Verify there are no OTHER active human players
    const otherActiveHumans = (room.players || []).filter(
      (p) => p.isHuman && p.id !== playerId && !p.isEliminated && !p.isForfeit && p.connected
    );
    if (otherActiveHumans.length > 0) {
      return false; // Cannot claim forfeit victory if other humans are still playing
    }

    this.clearAllTimers(activeRoomState);

    const capitalsBefore: Record<string, number> = {};
    (gs.players || []).forEach((p) => {
      capitalsBefore[p.id] = p.capital;
    });

    // Award human share of pot to claiming player, returning bots' share to bots
    const activeBots = (gs.players || []).filter((p) => !p.isHuman && !p.isEliminated);
    const activeHumansInPot = (gs.players || []).filter((p) => p.isHuman);

    // Calculate bots share in the current pot
    // If pot is formed by baseBet per active player in the partie
    const totalContributedPlayers = (gs.players || []).filter((p) => !p.isEliminated || p.id === playerId).length;
    let botShareTotal = 0;
    if (activeBots.length > 0 && gs.pot > 0) {
      // Each active bot's contribution in current pot
      const perPlayerContribution = Math.floor(gs.pot / Math.max(1, totalContributedPlayers)) || gs.baseBet;
      activeBots.forEach((bot) => {
        const refund = Math.min(gs.pot - botShareTotal, perPlayerContribution);
        bot.capital += refund;
        bot.score = bot.capital;
        botShareTotal += refund;
      });
    }

    const humanPotShare = Math.max(0, gs.pot - botShareTotal);
    claimingPlayer.capital += humanPotShare;
    claimingPlayer.score = claimingPlayer.capital;
    gs.pot = 0;

    // Set Manche Over & Partie Over with FORFEIT win type
    gs.phase = 'MANCHE_OVER';
    room.status = 'MANCHE_OVER';
    gs.partieWinnerIndex = playerIndex;
    gs.partieWinnerName = claimingPlayer.name;
    gs.partieWinType = 'FORFEIT';
    gs.roundWinnerIndex = playerIndex;
    gs.roundWinnerName = claimingPlayer.name;
    gs.mancheWinnerIndex = playerIndex;
    gs.mancheWinnerName = claimingPlayer.name;

    room.players = (room.players || []).map((p) => {
      const g = (gs.players || []).find((gp) => gp.id === p.id);
      return g
        ? {
            ...p,
            capital: g.capital,
            score: g.capital,
            isEliminated: g.isEliminated,
            isForfeit: g.isForfeit,
            readyForNextPartie: false,
          }
        : p;
    });

    const emote: EmoteMessage = {
      id: 'em_' + Math.random().toString(36).substring(2, 9),
      playerId: 'system',
      playerName: 'Table',
      text: `🏆 ${claimingPlayer.name} a réclamé sa part du pot (${humanPotShare} jetons) et remporte la manche par forfait !`,
      emoji: '🏆',
      timestamp: Date.now(),
      isBot: true,
    };
    room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);

    this.emitPartieResult(room, activeRoomState, {
      winnerId: claimingPlayer.id,
      winType: 'FORFEIT',
      endReason: 'FORFEIT_VICTORY',
      capitalsBefore,
      grossByPlayerId: { [claimingPlayer.id]: humanPotShare },
    });

    room.updatedAt = Date.now();
    onStateChange(room);
    return true;
  }

  public static resolveEarlyClose(
    room: MultiplayerRoom,
    onStateChange: (room: MultiplayerRoom) => void,
    activeRoomState: ActiveRoomState
  ): void {
    const gs = room.gameState;
    if (!gs) return;

    this.clearAllTimers(activeRoomState);

    const capitalsBefore: Record<string, number> = {};
    (gs.players || []).forEach((p) => {
      capitalsBefore[p.id] = p.capital;
    });

    // Share pot amongst active non-eliminated players according to tricks won in round
    const activePlayers = (gs.players || []).filter((p) => !p.isEliminated && !p.isForfeit);
    const grossByPlayerId: Record<string, number> = {};
    if (activePlayers.length > 0 && gs.pot > 0) {
      const totalTricksWon = activePlayers.reduce((sum, p) => sum + (p.tricksWonInRound || 0), 0);
      if (totalTricksWon > 0) {
        let potDistributed = 0;
        activePlayers.forEach((p, idx) => {
          if (idx === activePlayers.length - 1) {
            const share = gs.pot - potDistributed;
            p.capital += share;
            p.score = p.capital;
            grossByPlayerId[p.id] = share;
          } else {
            const share = Math.floor((gs.pot * (p.tricksWonInRound || 0)) / totalTricksWon);
            p.capital += share;
            p.score = p.capital;
            potDistributed += share;
            grossByPlayerId[p.id] = share;
          }
        });
      } else {
        // Equal split if no tricks won yet
        const share = Math.floor(gs.pot / activePlayers.length);
        activePlayers.forEach((p) => {
          p.capital += share;
          p.score = p.capital;
          grossByPlayerId[p.id] = share;
        });
      }
    }
    gs.pot = 0;

    // Determine leading player as nominal round winner
    const sorted = [...activePlayers].sort((a, b) => (b.tricksWonInRound || 0) - (a.tricksWonInRound || 0) || b.capital - a.capital);
    const topPlayer = sorted[0] || gs.players[0];
    const topPlayerIndex = (gs.players || []).findIndex((p) => p.id === topPlayer.id);

    gs.phase = 'PARTIE_OVER';
    room.status = 'PARTIE_OVER';
    gs.partieWinnerIndex = topPlayerIndex >= 0 ? topPlayerIndex : 0;
    gs.partieWinnerName = topPlayer.name;
    gs.partieWinType = 'STANDARD';
    room.earlyCloseProposal = null;

    room.players = (room.players || []).map((p) => {
      const g = (gs.players || []).find((gp) => gp.id === p.id);
      return g
        ? {
            ...p,
            capital: g.capital,
            score: g.capital,
            isEliminated: g.isEliminated,
            isForfeit: g.isForfeit,
            readyForNextPartie: false,
          }
        : p;
    });

    const emote: EmoteMessage = {
      id: 'em_' + Math.random().toString(36).substring(2, 9),
      playerId: 'system',
      playerName: 'Table',
      text: `🤝 Partie clôturée d'un commun accord ! Le pot a été partagé équitablement.`,
      emoji: '🤝',
      timestamp: Date.now(),
      isBot: true,
    };
    room.activeEmotes = [...(room.activeEmotes || []), emote].slice(-5);

    this.emitPartieResult(room, activeRoomState, {
      winnerId: topPlayer.id,
      winType: 'EARLY_CLOSE',
      endReason: 'EARLY_CLOSE',
      capitalsBefore,
      grossByPlayerId,
      allowBurned: true,
    });

    room.updatedAt = Date.now();
    onStateChange(room);
  }

  public static clearTurnTimers(activeRoomState: ActiveRoomState): void {
    if (activeRoomState.turnTimeoutTimer) {
      clearTimeout(activeRoomState.turnTimeoutTimer);
      activeRoomState.turnTimeoutTimer = null;
    }
    if (activeRoomState.botMoveTimer) {
      clearTimeout(activeRoomState.botMoveTimer);
      activeRoomState.botMoveTimer = null;
    }
    if (activeRoomState.trickResolutionTimer) {
      clearTimeout(activeRoomState.trickResolutionTimer);
      activeRoomState.trickResolutionTimer = null;
    }
  }

  public static clearAllTimers(activeRoomState: ActiveRoomState): void {
    if (activeRoomState.turnTimeoutTimer) {
      clearTimeout(activeRoomState.turnTimeoutTimer);
      activeRoomState.turnTimeoutTimer = null;
    }
    if (activeRoomState.trickResolutionTimer) {
      clearTimeout(activeRoomState.trickResolutionTimer);
      activeRoomState.trickResolutionTimer = null;
    }
    if (activeRoomState.nextPartieTimer) {
      clearTimeout(activeRoomState.nextPartieTimer);
      activeRoomState.nextPartieTimer = null;
    }
    if (activeRoomState.instantWinTimer) {
      clearTimeout(activeRoomState.instantWinTimer);
      activeRoomState.instantWinTimer = null;
    }
    if (activeRoomState.botMoveTimer) {
      clearTimeout(activeRoomState.botMoveTimer);
      activeRoomState.botMoveTimer = null;
    }
    if (activeRoomState.disconnectTimers) {
      activeRoomState.disconnectTimers.forEach((timer) => clearTimeout(timer));
      activeRoomState.disconnectTimers.clear();
    }
    if (activeRoomState.aiRelayTimers) {
      activeRoomState.aiRelayTimers.forEach((timer) => clearTimeout(timer));
      activeRoomState.aiRelayTimers.clear();
    }
    if (activeRoomState.emergencyTrickPlayed) {
      activeRoomState.emergencyTrickPlayed.clear();
    }
  }
}
